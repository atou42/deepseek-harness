// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountOverlay, browserLoginUrl, CohubAccountOverlayController } from '../src/client/index.ts'
import type { CohubAccountSnapshot } from '@deepseek-ai/dsh-api-remotes/client'

afterEach(cleanup)
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
const t = ((key: string, params?: Record<string, unknown>) => {
  const labels: Record<string, string> = {
    trigger: 'Cohub account', title: 'Cohub account', close: 'Close', loading: 'Loading account', anonymousTitle: 'Sign in to Cohub',
    anonymousBody: 'Account required', signIn: 'Sign in to Cohub', authenticatingTitle: 'Finish sign-in', authenticatingBody: 'Continue on web',
    userCode: 'Verification code', openLogin: 'Open Cohub sign-in', invalidLoginUrl: 'URL unavailable', cancel: 'Cancel sign-in', signedIn: 'Signed in',
    accountFallback: 'Cohub user', signOut: 'Sign out', expires: 'Expires {time}', refreshFailed: 'Refresh failed', denied: 'Denied', expired: 'Expired',
    retry: 'Retry', error: 'Failed: {message}', revocationWarning: 'Warning: {message}',
  }
  return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as never

const anonymous: CohubAccountSnapshot = { revision: 0, status: 'anonymous' }
const authenticating: CohubAccountSnapshot = {
  revision: 1, status: 'authenticating', authorization: {
    userCode: 'ABCD-EFGH', verificationUri: 'https://auth.neta.art/activate',
    verificationUriComplete: 'https://auth.neta.art/activate?code=ABCD-EFGH',
    expiresAt: Date.now() + 60_000, retryAfterMs: 1,
  },
}
const authenticated: CohubAccountSnapshot = {
  revision: 2, status: 'authenticated', profile: { userId: 'user-1', displayName: 'ATou', email: 'atou@example.test' },
  accessTokenExpiresAt: Date.now() + 3_600_000,
}

function controller() { const value = new CohubAccountOverlayController(); value.open(); return value }

describe('Cohub account overlay', () => {
  it('starts device login and automatically observes the authenticated profile', async () => {
    let complete!: () => void
    const poll = new Promise<{ ok: true; value: CohubAccountSnapshot }>((resolve) => {
      complete = () => { resolve({ ok: true, value: authenticated }) }
    })
    const remote = {
      getAccount: vi.fn(() => ok(anonymous)), beginLogin: vi.fn(() => ok(authenticating)),
      pollLogin: vi.fn(() => poll), cancelLogin: vi.fn(() => ok(anonymous)),
      logout: vi.fn(() => ok({ snapshot: anonymous })),
    }
    const view = render(<AccountOverlay controller={controller()} remote={remote} t={t} />)
    await waitFor(() => { expect(view.getByRole('button', { name: 'Sign in to Cohub' })).toBeDefined() })
    fireEvent.click(view.getByRole('button', { name: 'Sign in to Cohub' }))
    await waitFor(() => { expect(view.getByText('ABCD-EFGH')).toBeDefined() })
    await waitFor(() => { expect(remote.pollLogin).toHaveBeenCalledTimes(1) })
    expect(view.getByRole('link', { name: 'Open Cohub sign-in' }).getAttribute('href')).toContain('https://auth.neta.art/activate')
    complete()
    await waitFor(() => { expect(view.getByText('ATou')).toBeDefined() })
    expect(remote.pollLogin).toHaveBeenCalledTimes(1)
  })

  it('never turns a non-HTTP verification value into a browser link', async () => {
    const unsafe = { ...authenticating, authorization: { ...authenticating.authorization, verificationUriComplete: 'javascript:alert(1)' } }
    const remote = {
      getAccount: vi.fn(() => ok(unsafe)), beginLogin: vi.fn(() => ok(unsafe)), pollLogin: vi.fn(() => new Promise<never>(() => {})),
      cancelLogin: vi.fn(() => ok(anonymous)), logout: vi.fn(() => ok({ snapshot: anonymous })),
    }
    const view = render(<AccountOverlay controller={controller()} remote={remote} t={t} />)
    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('URL unavailable') })
    expect(view.queryByRole('link')).toBeNull()
    expect(browserLoginUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('shows a Remote failure instead of pretending the account is anonymous', async () => {
    const remote = {
      getAccount: vi.fn(() => Promise.resolve({ ok: false as const, error: { code: 'offline', message: 'unreachable' } })),
      beginLogin: vi.fn(), pollLogin: vi.fn(), cancelLogin: vi.fn(), logout: vi.fn(),
    }
    const view = render(<AccountOverlay controller={controller()} remote={remote as never} t={t} />)
    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('unreachable') })
    expect(view.queryByRole('button', { name: 'Sign in to Cohub' })).toBeNull()
  })
})
