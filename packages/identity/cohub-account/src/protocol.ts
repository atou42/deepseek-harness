import type { CohubAccountProfile, CohubDeviceAuthorization } from './types.ts'

/** Effective OAuth and Cohub API coordinates retained with a session. */
export interface AccountProtocolConfig {
  readonly issuer: string
  readonly apiBaseUrl: string
  readonly clientId: string
  readonly resource: string
  readonly scope: string
}

/** Complete private Cohub account session stored behind one credential reference. */
export interface StoredCohubSession extends AccountProtocolConfig {
  readonly schemaVersion: 1
  readonly accessToken: string
  readonly refreshToken: string
  readonly accessTokenExpiresAt: number
  readonly profile: CohubAccountProfile
}

/** Host-only device authorization state paired with its public projection. */
export interface PendingDeviceAuthorization {
  readonly deviceCode: string
  readonly public: CohubDeviceAuthorization
}

/**
 * Require a non-blank string.
 * @param value - Untrusted value.
 * @param field - Diagnostic field name.
 * @returns The validated string.
 */
export function nonBlank(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`cohub-account: ${field} must be a non-blank string`)
  }
  return value
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`cohub-account: ${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function positiveNumber(value: unknown, field: string): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`cohub-account: ${field} must be a positive number`)
  }
  return number
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return nonBlank(value, field)
}

/** Resolve the optional OAuth token scope; Cohub emits an empty string when the granted scope is unchanged. */
function tokenScope(value: unknown, requested: string): string {
  if (value === undefined || value === null) return requested
  if (typeof value !== 'string') throw new TypeError('cohub-account: token scope must be a string')
  return value.trim().length === 0 ? requested : value
}

/**
 * Validate a device authorization response.
 * @param value - Untrusted response body.
 * @param now - Current Unix epoch milliseconds.
 * @returns Private and public device authorization state.
 */
export function parseDeviceAuthorization(value: unknown, now: number): PendingDeviceAuthorization {
  const body = record(value, 'device authorization response')
  const verificationUri = nonBlank(body.verification_uri, 'verification_uri')
  const expiresIn = positiveNumber(body.expires_in, 'expires_in')
  const interval = body.interval === undefined ? 5 : positiveNumber(body.interval, 'interval')
  return Object.freeze({
    deviceCode: nonBlank(body.device_code, 'device_code'),
    public: Object.freeze({
      userCode: nonBlank(body.user_code, 'user_code'),
      verificationUri,
      verificationUriComplete: body.verification_uri_complete === undefined
        ? verificationUri
        : nonBlank(body.verification_uri_complete, 'verification_uri_complete'),
      expiresAt: now + expiresIn * 1000,
      retryAfterMs: interval * 1000,
    }),
  })
}

/**
 * Validate the current Cohub profile response.
 * @param value - Untrusted profile response.
 * @returns Browser-safe Cohub account profile.
 */
export function parseProfile(value: unknown): CohubAccountProfile {
  const user = record(value, 'profile response')
  const profile = user.profile === undefined ? {} : record(user.profile, 'profile response profile')
  return Object.freeze({
    userId: nonBlank(user.uuid, 'profile uuid'),
    ...(optionalString(user.email, 'profile email') === undefined ? {} : { email: user.email as string }),
    ...(optionalString(profile.username, 'profile username') === undefined ? {} : { username: profile.username as string }),
    ...(optionalString(profile.displayName, 'profile displayName') === undefined ? {} : { displayName: profile.displayName as string }),
    ...(optionalString(profile.avatarUrl, 'profile avatarUrl') === undefined ? {} : { avatarUrl: profile.avatarUrl as string }),
  })
}

/**
 * Validate a token response and construct the private stored session.
 * @param value - Untrusted token response.
 * @param config - Effective OAuth coordinates.
 * @param now - Current Unix epoch milliseconds.
 * @param profile - Validated Cohub profile.
 * @param previous - Previous session whose refresh token may be retained.
 * @returns Complete private Cohub session.
 */
export function parseTokenSession(
  value: unknown,
  config: AccountProtocolConfig,
  now: number,
  profile: CohubAccountProfile,
  previous?: StoredCohubSession,
): StoredCohubSession {
  const token = record(value, 'token response')
  if (token.token_type !== 'Bearer') throw new TypeError('cohub-account: token_type must be Bearer')
  const refreshToken = token.refresh_token === undefined
    ? previous?.refreshToken
    : nonBlank(token.refresh_token, 'refresh_token')
  if (refreshToken === undefined) throw new TypeError('cohub-account: token response is missing refresh_token')
  return Object.freeze({
    schemaVersion: 1,
    issuer: config.issuer,
    apiBaseUrl: config.apiBaseUrl,
    clientId: config.clientId,
    resource: config.resource,
    scope: tokenScope(token.scope, config.scope),
    accessToken: nonBlank(token.access_token, 'access_token'),
    refreshToken,
    accessTokenExpiresAt: now + positiveNumber(token.expires_in, 'expires_in') * 1000,
    profile,
  })
}

/**
 * Parse and validate a serialized private Cohub session.
 * @param text - Credential value.
 * @returns Validated stored session.
 */
export function parseStoredSession(text: string): StoredCohubSession {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error('cohub-account: stored session is not valid JSON', { cause: error })
  }
  const value = record(parsed, 'stored session')
  if (value.schemaVersion !== 1) throw new TypeError('cohub-account: stored session has an unsupported schemaVersion')
  if (!Number.isSafeInteger(value.accessTokenExpiresAt) || (value.accessTokenExpiresAt as number) <= 0) {
    throw new TypeError('cohub-account: stored session accessTokenExpiresAt must be a positive safe integer')
  }
  return Object.freeze({
    schemaVersion: 1,
    issuer: nonBlank(value.issuer, 'stored issuer'),
    apiBaseUrl: nonBlank(value.apiBaseUrl, 'stored apiBaseUrl'),
    clientId: nonBlank(value.clientId, 'stored clientId'),
    resource: nonBlank(value.resource, 'stored resource'),
    scope: nonBlank(value.scope, 'stored scope'),
    accessToken: nonBlank(value.accessToken, 'stored accessToken'),
    refreshToken: nonBlank(value.refreshToken, 'stored refreshToken'),
    accessTokenExpiresAt: value.accessTokenExpiresAt as number,
    profile: parseProfileForStorage(value.profile),
  })
}

function parseProfileForStorage(value: unknown): CohubAccountProfile {
  const profile = record(value, 'stored profile')
  return Object.freeze({
    userId: nonBlank(profile.userId, 'stored profile userId'),
    ...(optionalString(profile.email, 'stored profile email') === undefined ? {} : { email: profile.email as string }),
    ...(optionalString(profile.username, 'stored profile username') === undefined ? {} : { username: profile.username as string }),
    ...(optionalString(profile.displayName, 'stored profile displayName') === undefined ? {} : { displayName: profile.displayName as string }),
    ...(optionalString(profile.avatarUrl, 'stored profile avatarUrl') === undefined ? {} : { avatarUrl: profile.avatarUrl as string }),
  })
}

/**
 * Read an OAuth error code without accepting malformed containers.
 * @param value - Untrusted OAuth response.
 * @returns The non-empty error code when present.
 */
export function oauthErrorCode(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const code = (value as Record<string, unknown>).error
  return typeof code === 'string' && code.length > 0 ? code : undefined
}
