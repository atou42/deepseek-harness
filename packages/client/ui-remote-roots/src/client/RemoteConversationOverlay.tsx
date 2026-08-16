import { useEffect, useState } from 'react'
import { IconCloseOutline16, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RemoteResourceId } from '@deepseek-ai/dsh-client-remote-roots/client'
import type { RemoteConversationOverlayProps } from './contract.ts'
import css from './RemoteConversationOverlay.module.css'

type ConversationState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: Awaited<ReturnType<RemoteConversationOverlayProps['readConversation']>> }
  | { readonly status: 'error'; readonly message: string }

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function terminal(status: string): boolean {
  return ['completed', 'failed', 'cancelled', 'error'].includes(status.toLowerCase())
}

/** Render the currently selected provider-owned remote conversation. */
export function RemoteConversationOverlay({
  useRemoteRoots, deactivate, readConversation, promptConversation, t,
}: RemoteConversationOverlayProps) {
  const active = useRemoteRoots(snapshot => snapshot.active)
  const [conversation, setConversation] = useState<ConversationState>({ status: 'loading' })
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionOverride, setSessionOverride] = useState<RemoteResourceId>()
  const [watchedTurn, setWatchedTurn] = useState<RemoteResourceId>()
  const [refresh, setRefresh] = useState(0)

  const activeKey = active === undefined ? '' : `${active.sourceId}\0${active.rootId}`
  useEffect(() => {
    setSessionOverride(undefined)
    setWatchedTurn(undefined)
    setDraft('')
  }, [activeKey])

  const sessionId = sessionOverride ?? active?.sessionId
  useEffect(() => {
    if (active === undefined) return
    let live = true
    setConversation({ status: 'loading' })
    const request = sessionId === undefined ? { rootId: active.rootId } : { rootId: active.rootId, sessionId }
    void readConversation(active.sourceId, request).then((value) => {
      if (live) setConversation({ status: 'ready', value })
    }, (error: unknown) => {
      if (live) setConversation({ status: 'error', message: message(error) })
    })
    return () => { live = false }
  }, [activeKey, active, readConversation, refresh, sessionId])

  useEffect(() => {
    if (watchedTurn === undefined || conversation.status !== 'ready') return
    const turn = conversation.value.turns.find(item => item.id === watchedTurn)
    if (turn !== undefined && terminal(turn.status)) {
      setWatchedTurn(undefined)
      return
    }
    const timer = window.setTimeout(() => { setRefresh(value => value + 1) }, 1000)
    return () => { window.clearTimeout(timer) }
  }, [conversation, watchedTurn])

  if (active === undefined) return null

  const send = (): void => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    const request = sessionId === undefined
      ? { rootId: active.rootId, text }
      : { rootId: active.rootId, sessionId, text }
    void promptConversation(active.sourceId, request).then((result) => {
      setDraft('')
      setSessionOverride(result.sessionId)
      setWatchedTurn(result.turnId)
      setRefresh(value => value + 1)
    }, (error: unknown) => {
      setConversation({ status: 'error', message: message(error) })
    }).finally(() => { setSending(false) })
  }

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('conversation.title')}>
      <button type="button" className={css.mask} aria-label={t('conversation.close')} onClick={deactivate} />
      <section className={css.panel}>
        <header className={css.header}>
          <div>
            <h2>{active.rootTitle}</h2>
            <p>{conversation.status === 'ready' ? conversation.value.session?.title ?? t('conversation.new') : active.sessionTitle ?? t('conversation.new')}</p>
          </div>
          <button type="button" className={css.iconButton} aria-label={t('conversation.close')} onClick={deactivate}><IconCloseOutline16 /></button>
        </header>
        <main className={css.history}>
          {conversation.status === 'loading' && <p role="status">{t('conversation.loading')}</p>}
          {conversation.status === 'error' && <p className={css.error} role="alert">{t('conversation.error', { message: conversation.message })}</p>}
          {conversation.status === 'ready' && conversation.value.turns.length === 0 && <p className={css.empty}>{t('conversation.empty')}</p>}
          {conversation.status === 'ready' && conversation.value.turns.map(turn => (
            <article key={turn.id} className={css.turn} data-turn-status={turn.status}>
              {turn.userText !== undefined && <div className={css.user}>{turn.userText}</div>}
              {turn.assistantText !== undefined && (
                <div className={css.assistant}>
                  <MarkdownText text={turn.assistantText} streaming={!terminal(turn.status)} />
                </div>
              )}
              {!terminal(turn.status) && turn.assistantText === undefined && <div className={css.running} role="status">{t('conversation.running')}</div>}
              {turn.errorMessage !== undefined && <div className={css.error} role="alert">{turn.errorMessage}</div>}
            </article>
          ))}
        </main>
        <footer className={css.composer}>
          <textarea
            value={draft}
            aria-label={t('conversation.placeholder')}
            placeholder={t('conversation.placeholder')}
            disabled={sending}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send() }
            }}
          />
          <button type="button" disabled={sending || !draft.trim()} onClick={send}>{t(sending ? 'conversation.sending' : 'conversation.send')}</button>
        </footer>
      </section>
    </div>
  )
}
