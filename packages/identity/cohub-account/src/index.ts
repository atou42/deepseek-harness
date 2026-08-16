/** Host-side owner of the Cohub login, refresh, persistence, and logout lifecycle. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  nonBlank,
  oauthErrorCode,
  parseDeviceAuthorization,
  parseProfile,
  parseStoredSession,
  parseTokenSession,
} from './protocol.ts'
import type {
  AccountProtocolConfig,
  PendingDeviceAuthorization,
  StoredCohubSession,
} from './protocol.ts'
import type {
  CohubAccountObservable,
  CohubAccountSnapshot,
  CohubDeviceAuthorization,
  CohubLoginPollResult,
  CohubLogoutResult,
  CohubRemoteLogoutResult,
} from './types.ts'

export type {
  CohubAccountObservable,
  CohubAccountProfile,
  CohubAccountSnapshot,
  CohubDeviceAuthorization,
  CohubLoginPollResult,
  CohubLogoutResult,
  CohubRemoteLogoutResult,
} from './types.ts'

export const DEFAULT_COHUB_AUTH_ISSUER = 'https://auth.neta.art'
export const DEFAULT_COHUB_API_BASE_URL = 'https://api.cohub.run'
export const DEFAULT_COHUB_AUTH_CLIENT_ID = 'f8d26cdlwx85b0e5l3om2'
export const DEFAULT_COHUB_AUTH_RESOURCE = 'https://api.talesofai'
export const DEFAULT_COHUB_AUTH_SCOPE = 'openid profile email offline_access'
export const DEFAULT_COHUB_SESSION_CREDENTIAL = 'COHUB_ACCOUNT_SESSION'
export const DEFAULT_COHUB_REFRESH_SKEW_MS = 5 * 60 * 1000

/** Loader-safe configuration. Secrets remain inside the credentials seam. */
export interface Config {
  issuer?: string
  apiBaseUrl?: string
  clientId?: string
  resource?: string
  scope?: string
  sessionCredential?: string
  refreshSkewMs?: number
}

interface ResolvedConfig extends AccountProtocolConfig {
  readonly sessionCredential: CredentialRef
  readonly refreshSkewMs: number
}

/** No usable Cohub session is configured. */
export class CohubAuthenticationRequiredError extends Error {
  readonly code: string = 'COHUB_AUTHENTICATION_REQUIRED'

  constructor(message = 'Cohub authentication is required') {
    super(message)
    this.name = 'CohubAuthenticationRequiredError'
  }
}

/** The authorization server rejected a refresh token and the local session was removed. */
export class CohubReauthenticationRequiredError extends CohubAuthenticationRequiredError {
  override readonly code = 'COHUB_REAUTHENTICATION_REQUIRED'

  constructor() {
    super('The Cohub session is no longer valid; sign in again')
    this.name = 'CohubReauthenticationRequiredError'
  }
}

/** Device authorization ended and must be restarted. */
export class CohubDeviceAuthorizationError extends Error {
  constructor(readonly code: 'access-denied' | 'device-code-expired') {
    super(code === 'access-denied' ? 'Cohub sign-in was denied' : 'The Cohub device code expired')
    this.name = 'CohubDeviceAuthorizationError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    cohubAccount: CohubAccountService
  }
}

type WithoutRevision<T> = T extends unknown ? Omit<T, 'revision'> : never
type CohubAccountState = WithoutRevision<CohubAccountSnapshot>

function normalizeUrl(value: string, field: string): string {
  const text = nonBlank(value, field).replace(/\/+$/, '')
  const url = new URL(text)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError(`cohub-account: ${field} must use HTTP or HTTPS`)
  }
  return url.toString().replace(/\/$/, '')
}

function resolveConfig(config: Config): ResolvedConfig {
  const refreshSkewMs = config.refreshSkewMs ?? DEFAULT_COHUB_REFRESH_SKEW_MS
  if (!Number.isSafeInteger(refreshSkewMs) || refreshSkewMs < 0) {
    throw new TypeError('cohub-account: refreshSkewMs must be a non-negative safe integer')
  }
  return Object.freeze({
    issuer: normalizeUrl(config.issuer ?? DEFAULT_COHUB_AUTH_ISSUER, 'issuer'),
    apiBaseUrl: normalizeUrl(config.apiBaseUrl ?? DEFAULT_COHUB_API_BASE_URL, 'apiBaseUrl'),
    clientId: nonBlank(config.clientId ?? DEFAULT_COHUB_AUTH_CLIENT_ID, 'clientId'),
    resource: nonBlank(config.resource ?? DEFAULT_COHUB_AUTH_RESOURCE, 'resource'),
    scope: nonBlank(config.scope ?? DEFAULT_COHUB_AUTH_SCOPE, 'scope'),
    sessionCredential: credentialRef(config.sessionCredential ?? DEFAULT_COHUB_SESSION_CREDENTIAL),
    refreshSkewMs,
  })
}

async function responseData(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch (error) {
      throw new Error(`cohub-account: HTTP ${String(response.status)} returned invalid JSON`, { cause: error })
    }
  }
  await response.text().catch(() => '')
  return undefined
}

/** The only owner of Cohub account secrets and token refresh within one Host. */
export class CohubAccountService extends TypertRemoteService {
  static inject = ['credentials']

  static Config: z<Config> = z.object({
    issuer: z.string().default(DEFAULT_COHUB_AUTH_ISSUER),
    apiBaseUrl: z.string().default(DEFAULT_COHUB_API_BASE_URL),
    clientId: z.string().default(DEFAULT_COHUB_AUTH_CLIENT_ID),
    resource: z.string().default(DEFAULT_COHUB_AUTH_RESOURCE),
    scope: z.string().default(DEFAULT_COHUB_AUTH_SCOPE),
    sessionCredential: z.string().role('credential-ref').default(DEFAULT_COHUB_SESSION_CREDENTIAL),
    refreshSkewMs: z.number().step(1).min(0).default(DEFAULT_COHUB_REFRESH_SKEW_MS),
  })

  private readonly spec: ResolvedConfig
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  private readonly active = new Set<Promise<unknown>>()
  private mutationTail: Promise<void> = Promise.resolve()
  private session: StoredCohubSession | undefined
  private pending: PendingDeviceAuthorization | undefined
  /** Exchanged private tokens retained only while `/api/me` is being retried. */
  private pendingLoginSession: StoredCohubSession | undefined
  private refreshFlight: Promise<string> | undefined
  private revision = 0
  private generation = 0
  private closed = false
  private current: CohubAccountSnapshot = Object.freeze({ revision: 0, status: 'anonymous' })

  readonly snapshot: CohubAccountObservable = {
    getSnapshot: () => this.current,
    subscribe: (listener) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'cohubAccount')
    this.spec = resolveConfig(config)
  }

  async* [Service.init](): AsyncGenerator<() => Promise<void>, void, void> {
    yield async () => {
      this.closed = true
      this.generation++
      this.lifetime.abort(new Error('cohub-account: service disposed'))
      await Promise.allSettled([...this.active])
      await this.mutationTail
      this.session = undefined
      this.pending = undefined
      this.pendingLoginSession = undefined
      this.current = Object.freeze({ revision: ++this.revision, status: 'anonymous' })
      this.listeners.clear()
    }
    const stored = await this.ctx.credentials.resolve(this.spec.sessionCredential)
    if (stored === undefined) return
    this.session = parseStoredSession(stored.value)
    this.publishAuthenticated(this.session)
  }

  /** Return the current browser-safe account state. */
  @Remote('getAccount')
  getAccount(): CohubAccountSnapshot {
    this.assertOpen()
    return this.current
  }

  /** Start device login without exposing the private device code. */
  @Remote('beginLogin')
  async beginRemoteLogin(): Promise<CohubAccountSnapshot> {
    await this.beginLogin()
    return this.current
  }

  /** Advance device login once; the browser controls no tokens or credentials. */
  @Remote('pollLogin')
  async pollRemoteLogin(): Promise<CohubAccountSnapshot> {
    await this.pollLogin()
    return this.current
  }

  /** Cancel the active device login and return the resulting public state. */
  @Remote('cancelLogin')
  cancelRemoteLogin(): CohubAccountSnapshot {
    this.cancelLogin()
    return this.current
  }

  /** Clear the Host-owned session and report any remote revocation warning. */
  @Remote('logout')
  async logoutRemote(): Promise<CohubRemoteLogoutResult> {
    const result = await this.logout()
    return Object.freeze({ snapshot: this.current, ...result })
  }

  beginLogin(signal?: AbortSignal): Promise<CohubDeviceAuthorization> {
    return this.track(this.beginLoginImpl(signal))
  }

  pollLogin(signal?: AbortSignal): Promise<CohubLoginPollResult> {
    return this.track(this.pollLoginImpl(signal))
  }

  cancelLogin(): void {
    this.assertOpen()
    if (this.pending === undefined) return
    this.generation++
    this.pending = undefined
    this.pendingLoginSession = undefined
    if (this.session === undefined) this.publish({ status: 'anonymous' })
    else this.publishAuthenticated(this.session)
  }

  getAccessToken(): Promise<string> {
    this.assertOpen()
    const session = this.session
    if (session === undefined) return Promise.reject(new CohubAuthenticationRequiredError())
    if (session.accessTokenExpiresAt - Date.now() > this.spec.refreshSkewMs) {
      return Promise.resolve(session.accessToken)
    }
    if (this.refreshFlight !== undefined) return this.refreshFlight
    const generation = this.generation
    const flight = this.track(this.refresh(session, generation))
    this.refreshFlight = flight
    void flight.finally(() => {
      if (this.refreshFlight === flight) this.refreshFlight = undefined
    }).catch(() => {})
    return flight
  }

  logout(): Promise<CohubLogoutResult> {
    return this.track(this.logoutImpl())
  }

  private async beginLoginImpl(signal?: AbortSignal): Promise<CohubDeviceAuthorization> {
    this.assertOpen()
    if (this.session !== undefined) throw new Error('cohub-account: logout before starting another sign-in')
    if (this.pending !== undefined || this.pendingLoginSession !== undefined) {
      throw new Error('cohub-account: a device sign-in is already active')
    }
    const generation = ++this.generation
    const { response, data } = await this.postForm(`${this.spec.issuer}/oidc/device/auth`, {
      client_id: this.spec.clientId,
      scope: this.spec.scope,
      resource: this.spec.resource,
    }, signal)
    if (!response.ok) throw new Error(`cohub-account: device authorization failed with HTTP ${String(response.status)}`)
    const pending = parseDeviceAuthorization(data, Date.now())
    this.assertCurrent(generation)
    this.pending = pending
    this.publish({ status: 'authenticating', authorization: pending.public })
    return pending.public
  }

  private async pollLoginImpl(signal?: AbortSignal): Promise<CohubLoginPollResult> {
    this.assertOpen()
    const pending = this.pending
    if (pending === undefined) throw new Error('cohub-account: no device sign-in is active')
    const generation = this.generation
    if (this.pendingLoginSession === undefined && pending.public.expiresAt <= Date.now()) {
      this.finishDeviceFailure('device-code-expired', generation)
    }
    let provisional = this.pendingLoginSession
    if (provisional === undefined) {
      const { response, data } = await this.postForm(`${this.spec.issuer}/oidc/token`, {
        client_id: this.spec.clientId,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: pending.deviceCode,
        resource: this.spec.resource,
      }, signal)
      this.assertCurrent(generation)
      if (!response.ok) {
        const code = oauthErrorCode(data)
        if (code === 'authorization_pending') {
          return Object.freeze({ status: 'pending', retryAfterMs: pending.public.retryAfterMs })
        }
        if (code === 'slow_down') {
          const next = Object.freeze({
            ...pending,
            public: Object.freeze({ ...pending.public, retryAfterMs: pending.public.retryAfterMs + 5000 }),
          })
          this.pending = next
          this.publish({ status: 'authenticating', authorization: next.public })
          return Object.freeze({ status: 'pending', retryAfterMs: next.public.retryAfterMs })
        }
        if (code === 'access_denied') this.finishDeviceFailure('access-denied', generation)
        if (code === 'expired_token') this.finishDeviceFailure('device-code-expired', generation)
        throw new Error(`cohub-account: token exchange failed with HTTP ${String(response.status)}`)
      }
      provisional = parseTokenSession(data, this.spec, Date.now(), Object.freeze({ userId: 'pending' }))
      this.pendingLoginSession = provisional
    }
    const profile = await this.fetchProfile(provisional.accessToken, signal)
    const session = Object.freeze({ ...provisional, profile })
    await this.enqueueMutation(async () => {
      this.assertCurrent(generation)
      await this.ctx.credentials.set(this.spec.sessionCredential, JSON.stringify(session))
      this.assertCurrent(generation)
      this.session = session
      this.pending = undefined
      this.pendingLoginSession = undefined
      this.publishAuthenticated(session)
    })
    return Object.freeze({ status: 'authenticated', profile })
  }

  private async refresh(previous: StoredCohubSession, generation: number): Promise<string> {
    try {
      const { response, data } = await this.postForm(`${previous.issuer}/oidc/token`, {
        client_id: previous.clientId,
        grant_type: 'refresh_token',
        refresh_token: previous.refreshToken,
        scope: previous.scope,
        resource: previous.resource,
      })
      this.assertCurrent(generation)
      if (!response.ok) {
        const code = oauthErrorCode(data)
        if (code === 'invalid_grant' || code === 'invalid_token') {
          await this.enqueueMutation(async () => {
            this.assertCurrent(generation)
            await this.ctx.credentials.unset(this.spec.sessionCredential)
            this.assertCurrent(generation)
            this.session = undefined
            this.pending = undefined
            this.pendingLoginSession = undefined
            this.publish({ status: 'anonymous' })
          })
          throw new CohubReauthenticationRequiredError()
        }
        throw new Error(`cohub-account: token refresh failed with HTTP ${String(response.status)}`)
      }
      const next = parseTokenSession(data, previous, Date.now(), previous.profile, previous)
      await this.enqueueMutation(async () => {
        this.assertCurrent(generation)
        await this.ctx.credentials.set(this.spec.sessionCredential, JSON.stringify(next))
        this.assertCurrent(generation)
        this.session = next
        this.publishAuthenticated(next)
      })
      return next.accessToken
    } catch (error) {
      if (error instanceof CohubReauthenticationRequiredError) throw error
      if (!this.closed && generation === this.generation && this.session === previous) {
        this.publish({
          status: 'error',
          code: 'refresh-failed',
          message: 'Cohub session refresh failed',
          profile: previous.profile,
        })
      }
      throw error
    }
  }

  private async logoutImpl(): Promise<CohubLogoutResult> {
    this.assertOpen()
    const previous = this.session
    ++this.generation
    await this.enqueueMutation(async () => {
      await this.ctx.credentials.unset(this.spec.sessionCredential)
      this.session = undefined
      this.pending = undefined
      this.pendingLoginSession = undefined
      this.publish({ status: 'anonymous' })
    })
    if (previous === undefined) return Object.freeze({})
    try {
      const { response } = await this.postForm(`${previous.issuer}/oidc/token/revocation`, {
        client_id: previous.clientId,
        token: previous.refreshToken,
        token_type_hint: 'refresh_token',
      })
      if (!response.ok) {
        return Object.freeze({ revocationWarning: `Cohub revoked locally, but remote revocation returned HTTP ${String(response.status)}` })
      }
      return Object.freeze({})
    } catch {
      return Object.freeze({ revocationWarning: 'Cohub revoked locally, but remote revocation could not be confirmed' })
    }
  }

  private finishDeviceFailure(code: 'access-denied' | 'device-code-expired', generation: number): never {
    this.assertCurrent(generation)
    this.pending = undefined
    this.pendingLoginSession = undefined
    this.publish({
      status: 'error',
      code,
      message: code === 'access-denied' ? 'Cohub sign-in was denied' : 'The Cohub device code expired',
    })
    throw new CohubDeviceAuthorizationError(code)
  }

  private async fetchProfile(accessToken: string, signal?: AbortSignal) {
    const response = await fetch(`${this.spec.apiBaseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: this.signal(signal),
    })
    const data = await responseData(response)
    if (!response.ok) throw new Error(`cohub-account: profile request failed with HTTP ${String(response.status)}`)
    return parseProfile(data)
  }

  private async postForm(url: string, fields: Record<string, string>, signal?: AbortSignal) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
      signal: this.signal(signal),
    })
    return { response, data: await responseData(response) }
  }

  private signal(signal?: AbortSignal): AbortSignal {
    return signal === undefined
      ? this.lifetime.signal
      : AbortSignal.any([this.lifetime.signal, signal])
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('cohub-account: service is disposed')
  }

  private assertCurrent(generation: number): void {
    this.assertOpen()
    if (generation !== this.generation) throw new Error('cohub-account: account operation was superseded')
  }

  private track<T>(promise: Promise<T>): Promise<T> {
    this.active.add(promise)
    void promise.finally(() => { this.active.delete(promise) }).catch(() => {})
    return promise
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(operation, operation)
    this.mutationTail = run.then(() => {}, () => {})
    return run
  }

  private publishAuthenticated(session: StoredCohubSession): void {
    this.publish({
      status: 'authenticated',
      profile: session.profile,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
    })
  }

  private publish(value: CohubAccountState): void {
    this.current = Object.freeze({ ...value, revision: ++this.revision })
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch (error) {
        this.ctx.logger.warn('cohub-account: snapshot listener failed')
        this.ctx.logger.warn(error)
      }
    }
  }
}

export default CohubAccountService
