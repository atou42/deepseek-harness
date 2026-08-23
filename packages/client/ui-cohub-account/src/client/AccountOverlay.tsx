import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { IconCloseOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CohubAccountSnapshot, CohubRemoteLogoutResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CohubAccountOverlayController } from './controller.ts'
import css from './CohubAccount.module.css'

type RemoteAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

export interface CohubAccountRemoteApi {
  getAccount(): Promise<RemoteAnswer<CohubAccountSnapshot>>
  beginLogin(): Promise<RemoteAnswer<CohubAccountSnapshot>>
  pollLogin(): Promise<RemoteAnswer<CohubAccountSnapshot>>
  cancelLogin(): Promise<RemoteAnswer<CohubAccountSnapshot>>
  logout(): Promise<RemoteAnswer<CohubRemoteLogoutResult>>
}

export interface AccountOverlayInjected { readonly controller: CohubAccountOverlayController; readonly remote: CohubAccountRemoteApi }
export type AccountOverlayProps = PropsLocale<'cohubAccount'> & AccountOverlayInjected

type LoadState =
  | { readonly status: 'idle' | 'loading' }
  | { readonly status: 'ready'; readonly value: CohubAccountSnapshot }
  | { readonly status: 'error'; readonly message: string }

function unwrap<T>(method: string, answer: RemoteAnswer<T>): T {
  if (answer.ok) return answer.value
  throw new Error(`${method}: ${answer.error.code}: ${answer.error.message}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function browserLoginUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function displayName(snapshot: Extract<CohubAccountSnapshot, { status: 'authenticated' }>): string {
  return snapshot.profile.displayName ?? snapshot.profile.username ?? snapshot.profile.email ?? snapshot.profile.userId
}

export function AccountOverlay({ controller, remote, t }: AccountOverlayProps) {
  const overlay = useSyncExternalStore(controller.snapshot.subscribe, controller.snapshot.getSnapshot)
  const [account, setAccount] = useState<LoadState>({ status: 'idle' })
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    setAccount({ status: 'loading' })
    setNotice('')
    void remote.getAccount().then((answer) => {
      setAccount({ status: 'ready', value: unwrap('cohubAccount.getAccount', answer) })
    }).catch((error: unknown) => {
      setAccount({ status: 'error', message: errorMessage(error) })
    })
  }, [remote])

  const invoke = useCallback((method: string, operation: () => Promise<RemoteAnswer<CohubAccountSnapshot>>) => {
    setBusy(true)
    setNotice('')
    void operation().then((answer) => {
      setAccount({ status: 'ready', value: unwrap(method, answer) })
    }).catch((error: unknown) => {
      setNotice(errorMessage(error))
    }).finally(() => { setBusy(false) })
  }, [])

  useEffect(() => {
    if (overlay.open && account.status === 'idle') load()
  }, [account.status, load, overlay.open])

  useEffect(() => {
    if (!overlay.open || account.status !== 'ready' || account.value.status !== 'authenticating') return
    let live = true
    const retryAfterMs = account.value.authorization.retryAfterMs
    const timer = window.setTimeout(() => {
      void remote.pollLogin().then((answer) => {
        if (live) setAccount({ status: 'ready', value: unwrap('cohubAccount.pollLogin', answer) })
      }).catch((error: unknown) => {
        if (!live) return
        const failure = errorMessage(error)
        void remote.getAccount().then((answer) => {
          if (live) {
            setAccount({ status: 'ready', value: unwrap('cohubAccount.getAccount', answer) })
            setNotice(failure)
          }
        }).catch(() => {
          if (live) setAccount({ status: 'error', message: failure })
        })
      })
    }, retryAfterMs)
    return () => { live = false; window.clearTimeout(timer) }
  }, [account, overlay.open, remote])

  if (!overlay.open) return null
  const snapshot = account.status === 'ready' ? account.value : undefined
  const signIn = (): void => { invoke('cohubAccount.beginLogin', () => remote.beginLogin()) }
  const cancel = (): void => { invoke('cohubAccount.cancelLogin', () => remote.cancelLogin()) }
  const logout = (): void => {
    setBusy(true)
    setNotice('')
    void remote.logout().then((answer) => {
      const result = unwrap('cohubAccount.logout', answer)
      setAccount({ status: 'ready', value: result.snapshot })
      if (result.revocationWarning !== undefined) setNotice(t('revocationWarning', { message: result.revocationWarning }))
    }).catch((error: unknown) => {
      setNotice(errorMessage(error))
    }).finally(() => { setBusy(false) })
  }

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('title')}>
      <button type="button" className={css.mask} aria-label={t('close')} onClick={controller.close} />
      <section className={css.panel}>
        <header className={css.header}>
          <h2>{t('title')}</h2>
          <button type="button" className={css.iconButton} aria-label={t('close')} onClick={controller.close}><IconCloseOutline16 /></button>
        </header>
        <div className={css.body}>
          {account.status === 'loading' && <p role="status">{t('loading')}</p>}
          {account.status === 'error' && <div className={css.stack}><p role="alert">{t('error', { message: account.message })}</p><button type="button" onClick={load}>{t('retry')}</button></div>}
          {snapshot?.status === 'anonymous' && <div className={css.stack}><h3>{t('anonymousTitle')}</h3><p>{t('anonymousBody')}</p><button type="button" disabled={busy} onClick={signIn}>{t('signIn')}</button></div>}
          {snapshot?.status === 'authenticating' && (() => {
            const href = browserLoginUrl(snapshot.authorization.verificationUriComplete)
            return <div className={css.stack}><h3>{t('authenticatingTitle')}</h3><p>{t('authenticatingBody')}</p><span className={css.label}>{t('userCode')}</span><strong className={css.code}>{snapshot.authorization.userCode}</strong>{href === undefined ? <p role="alert">{t('invalidLoginUrl')}</p> : <a className={css.primary} href={href} target="_blank" rel="noreferrer noopener">{t('openLogin')}</a>}<p className={css.muted}>{t('expires', { time: new Date(snapshot.authorization.expiresAt).toLocaleTimeString() })}</p><button type="button" disabled={busy} onClick={cancel}>{t('cancel')}</button></div>
          })()}
          {snapshot?.status === 'authenticated' && <div className={css.stack}><span className={css.status}>{t('signedIn')}</span><h3>{displayName(snapshot)}</h3>{snapshot.profile.email !== undefined && <p>{snapshot.profile.email}</p>}<button type="button" disabled={busy} onClick={logout}>{t('signOut')}</button></div>}
          {snapshot?.status === 'error' && <div className={css.stack}><h3>{snapshot.code === 'refresh-failed' ? t('refreshFailed') : snapshot.code === 'access-denied' ? t('denied') : t('expired')}</h3><p>{snapshot.message}</p>{snapshot.code === 'refresh-failed' ? <button type="button" disabled={busy} onClick={logout}>{t('signOut')}</button> : <button type="button" disabled={busy} onClick={signIn}>{t('signIn')}</button>}</div>}
          {notice && <p className={css.notice} role="alert">{notice}</p>}
        </div>
      </section>
    </div>
  )
}
