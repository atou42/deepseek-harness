/** Public, token-free Cohub account state. */

/** Safe profile fields returned by Cohub. */
export interface CohubAccountProfile {
  readonly userId: string
  readonly email?: string
  readonly username?: string
  readonly displayName?: string
  readonly avatarUrl?: string
}

/** Browser-safe device authorization details. The private device code is never included. */
export interface CohubDeviceAuthorization {
  readonly userCode: string
  readonly verificationUri: string
  readonly verificationUriComplete: string
  readonly expiresAt: number
  readonly retryAfterMs: number
}

/** Observable account state. No token or credential value can appear in this union. */
export type CohubAccountSnapshot =
  | { readonly revision: number; readonly status: 'anonymous' }
  | {
    readonly revision: number
    readonly status: 'authenticating'
    readonly authorization: CohubDeviceAuthorization
  }
  | {
    readonly revision: number
    readonly status: 'authenticated'
    readonly profile: CohubAccountProfile
    readonly accessTokenExpiresAt: number
  }
  | {
    readonly revision: number
    readonly status: 'error'
    readonly code: 'refresh-failed' | 'access-denied' | 'device-code-expired'
    readonly message: string
    readonly profile?: CohubAccountProfile
  }

/** One manual device-flow polling result. */
export type CohubLoginPollResult =
  | { readonly status: 'pending'; readonly retryAfterMs: number }
  | { readonly status: 'authenticated'; readonly profile: CohubAccountProfile }

/** Logout always clears local state first; remote revocation failure is returned separately. */
export interface CohubLogoutResult {
  readonly revocationWarning?: string
}

/** Minimal observable shape used by Host consumers and later API projection. */
export interface CohubAccountObservable {
  getSnapshot(): CohubAccountSnapshot
  subscribe(listener: () => void): () => void
}
