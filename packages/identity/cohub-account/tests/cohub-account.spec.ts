import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { CredentialProvider, credentialRef } from '@deepseek-ai/dsh-credentials'
import type { CredentialInfo, CredentialRef, ResolvedCredential } from '@deepseek-ai/dsh-credentials'
import CohubAccountService, {
  CohubDeviceAuthorizationError,
  CohubReauthenticationRequiredError,
  DEFAULT_COHUB_SESSION_CREDENTIAL,
} from '../src/index.ts'

const SESSION_REF = credentialRef(DEFAULT_COHUB_SESSION_CREDENTIAL)

class MemoryCredentials extends CredentialProvider {
  readonly values = new Map<string, string>()

  constructor(ctx: Context, seed: Record<string, string> = {}) {
    super(ctx)
    for (const [key, value] of Object.entries(seed)) this.values.set(key, value)
  }

  resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined> {
    const value = this.values.get(ref)
    return Promise.resolve(value === undefined ? undefined : { value, source: 'memory' })
  }

  describe(ref: CredentialRef): Promise<CredentialInfo> {
    return Promise.resolve({ configured: this.values.has(ref), source: 'memory', writable: true })
  }

  set(ref: CredentialRef, value: string): Promise<void> {
    this.values.set(ref, value)
    this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }

  unset(ref: CredentialRef): Promise<void> {
    if (this.values.delete(ref)) this.ctx.emit('credentials/updated', ref)
    return Promise.resolve()
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    issuer: 'https://auth.neta.art',
    apiBaseUrl: 'https://api.cohub.run',
    clientId: 'client',
    resource: 'resource',
    scope: 'openid offline_access',
    accessToken: 'access-old',
    refreshToken: 'refresh-old',
    accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
    profile: { userId: 'user-1', displayName: 'ATou' },
    ...overrides,
  })
}

async function boot(seed?: string) {
  const ctx = new Context()
  const credentialSeed = seed === undefined ? {} : { [DEFAULT_COHUB_SESSION_CREDENTIAL]: seed }
  await ctx.plugin(MemoryCredentials, credentialSeed).await()
  const fiber = ctx.plugin(CohubAccountService, {
    clientId: 'client', resource: 'resource', scope: 'openid offline_access',
  })
  await fiber.await()
  return {
    ctx,
    fiber,
    credentials: ctx.credentials as MemoryCredentials,
    account: ctx.cohubAccount,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CohubAccountService', () => {
  it('starts anonymous without reading the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { account } = await boot()
    expect(account.snapshot.getSnapshot()).toEqual({ revision: 0, status: 'anonymous' })
    expect(account.getAccount()).toEqual({ revision: 0, status: 'anonymous' })
    expect(account.cancelRemoteLogin()).toEqual({ revision: 0, status: 'anonymous' })
    await expect(account.getAccessToken()).rejects.toMatchObject({ code: 'COHUB_AUTHENTICATION_REQUIRED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails initialization on corrupt stored state without clearing the evidence', async () => {
    const ctx = new Context()
    await ctx.plugin(MemoryCredentials, { [DEFAULT_COHUB_SESSION_CREDENTIAL]: '{broken' }).await()
    const account = new CohubAccountService(ctx)
    const lifecycle = account[Service.init]()
    const registered = await lifecycle.next()
    await expect(lifecycle.next()).rejects.toThrow(/stored session is not valid JSON/)
    expect((ctx.credentials as MemoryCredentials).values.get(SESSION_REF)).toBe('{broken')
    if (typeof registered.value === 'function') await registered.value()
  })

  it('completes device login while keeping private codes and tokens out of snapshots', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        device_code: 'private-device',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://auth.neta.art/activate',
        verification_uri_complete: 'https://auth.neta.art/activate?code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      }))
      .mockResolvedValueOnce(json({
        token_type: 'Bearer', access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600,
      }))
      .mockResolvedValueOnce(json({
        uuid: 'user-1', email: 'atou@example.test', profile: { username: 'atou', displayName: 'ATou' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { account, credentials } = await boot()

    const began = await account.beginRemoteLogin()
    expect(began).toMatchObject({ status: 'authenticating', authorization: { userCode: 'ABCD-EFGH' } })
    expect(JSON.stringify(began)).not.toContain('private-device')
    const result = await account.pollRemoteLogin()
    expect(result).toMatchObject({
      status: 'authenticated',
      profile: { userId: 'user-1', email: 'atou@example.test', username: 'atou', displayName: 'ATou' },
    })
    expect(await account.getAccessToken()).toBe('access-new')
    expect(JSON.stringify(account.snapshot.getSnapshot())).not.toMatch(/access-new|refresh-new/)
    expect(JSON.parse(credentials.values.get(SESSION_REF) ?? '{}')).toMatchObject({
      accessToken: 'access-new', refreshToken: 'refresh-new', profile: { userId: 'user-1' },
    })
    const profileRequest = fetchMock.mock.calls[2] as [string, RequestInit]
    expect(profileRequest[1].headers).toEqual({ Authorization: 'Bearer access-new' })
  })

  it('honors pending and slow-down responses, then exposes terminal denial', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        device_code: 'private-device', user_code: 'CODE', verification_uri: 'https://auth.neta.art/activate',
        expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(json({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(json({ error: 'slow_down' }, 400))
      .mockResolvedValueOnce(json({ error: 'access_denied' }, 400))
    vi.stubGlobal('fetch', fetchMock)
    const { account } = await boot()
    await account.beginLogin()
    await expect(account.pollLogin()).resolves.toEqual({ status: 'pending', retryAfterMs: 5000 })
    await expect(account.pollLogin()).resolves.toEqual({ status: 'pending', retryAfterMs: 10_000 })
    await expect(account.pollLogin()).rejects.toBeInstanceOf(CohubDeviceAuthorizationError)
    expect(account.snapshot.getSnapshot()).toMatchObject({ status: 'error', code: 'access-denied' })
  })

  it('retries profile loading without exchanging a consumed device code twice', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        device_code: 'private-device', user_code: 'CODE', verification_uri: 'https://auth.neta.art/activate',
        expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(json({
        token_type: 'Bearer', access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600,
      }))
      .mockResolvedValueOnce(json({ error: 'temporarily_unavailable' }, 503))
      .mockResolvedValueOnce(json({ uuid: 'user-1', email: null, profile: { displayName: 'ATou' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { account } = await boot()
    await account.beginLogin()
    await expect(account.pollLogin()).rejects.toThrow(/profile request failed with HTTP 503/)
    expect(account.snapshot.getSnapshot()).toMatchObject({ status: 'authenticating' })
    await expect(account.pollLogin()).resolves.toMatchObject({ status: 'authenticated' })
    const tokenRequests = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/oidc/token'))
    expect(tokenRequests).toHaveLength(1)
  })

  it('single-flights refresh and commits the rotated session once', async () => {
    let release!: (response: Response) => void
    const response = new Promise<Response>((resolve) => { release = resolve })
    const fetchMock = vi.fn(() => response)
    vi.stubGlobal('fetch', fetchMock)
    const { account, credentials } = await boot(stored({ accessTokenExpiresAt: Date.now() - 1 }))
    const first = account.getAccessToken()
    const second = account.getAccessToken()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release(json({ token_type: 'Bearer', access_token: 'access-rotated', expires_in: 3600 }))
    await expect(Promise.all([first, second])).resolves.toEqual(['access-rotated', 'access-rotated'])
    expect(JSON.parse(credentials.values.get(SESSION_REF) ?? '{}')).toMatchObject({
      accessToken: 'access-rotated', refreshToken: 'refresh-old',
    })
  })

  it('clears an unrecoverable refresh rejection and preserves a transient failure for retry', async () => {
    const rejectedFetch = vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400))
    vi.stubGlobal('fetch', rejectedFetch)
    const rejected = await boot(stored({ accessTokenExpiresAt: Date.now() - 1 }))
    await expect(rejected.account.getAccessToken()).rejects.toBeInstanceOf(CohubReauthenticationRequiredError)
    expect(rejected.credentials.values.has(SESSION_REF)).toBe(false)
    expect(rejected.account.snapshot.getSnapshot()).toMatchObject({ status: 'anonymous' })

    const transientFetch = vi.fn().mockResolvedValue(json({ error: 'temporarily_unavailable' }, 503))
    vi.stubGlobal('fetch', transientFetch)
    const transient = await boot(stored({ accessTokenExpiresAt: Date.now() - 1 }))
    const before = transient.credentials.values.get(SESSION_REF)
    await expect(transient.account.getAccessToken()).rejects.toThrow(/HTTP 503/)
    expect(transient.credentials.values.get(SESSION_REF)).toBe(before)
    expect(transient.account.snapshot.getSnapshot()).toMatchObject({ status: 'error', code: 'refresh-failed' })
  })

  it('clears local state even when remote logout revocation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { account, credentials } = await boot(stored())
    const result = await account.logoutRemote()
    expect(result.snapshot).toMatchObject({ status: 'anonymous' })
    expect(result.revocationWarning).toMatch(/could not be confirmed/)
    expect(credentials.values.has(SESSION_REF)).toBe(false)
    expect(account.snapshot.getSnapshot()).toMatchObject({ status: 'anonymous' })
  })

  it('prevents a late refresh from restoring a logged-out session', async () => {
    let release!: (response: Response) => void
    const refreshResponse = new Promise<Response>((resolve) => { release = resolve })
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => refreshResponse)
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { account, credentials } = await boot(stored({ accessTokenExpiresAt: Date.now() - 1 }))
    const refreshing = account.getAccessToken()
    await expect(account.logout()).resolves.toEqual({})
    release(json({ token_type: 'Bearer', access_token: 'too-late', expires_in: 3600 }))
    await expect(refreshing).rejects.toThrow(/superseded/)
    expect(credentials.values.has(SESSION_REF)).toBe(false)
    expect(account.snapshot.getSnapshot()).toMatchObject({ status: 'anonymous' })
  })

  it('aborts active work and removes the service on unload', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, fiber, account } = await boot()
    const login = account.beginLogin().catch((error: unknown) => error as Error)
    await fiber.dispose()
    await expect(login).resolves.toMatchObject({ message: 'cohub-account: service disposed' })
    expect(ctx.get('cohubAccount')).toBeUndefined()
  })
})
