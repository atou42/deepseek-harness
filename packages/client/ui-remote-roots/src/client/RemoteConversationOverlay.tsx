import { useEffect, useState } from 'react'
import { IconCloseOutline16, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
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
  useRemoteRoots, deactivate, readConversation, t,
}: RemoteConversationOverlayProps) {
  const active = useRemoteRoots(snapshot => snapshot.active)
  const [conversation, setConversation] = useState<ConversationState>({ status: 'loading' })

  const activeKey = active?.sessionId === undefined ? '' : `${active.sourceId}\0${active.rootId}\0${active.sessionId}`
  useEffect(() => {
    if (active?.sessionId === undefined) return
    let live = true
    setConversation({ status: 'loading' })
    void readConversation(active.sourceId, { rootId: active.rootId, sessionId: active.sessionId }).then((value) => {
      if (live) setConversation({ status: 'ready', value })
    }, (error: unknown) => {
      if (live) setConversation({ status: 'error', message: message(error) })
    })
    return () => { live = false }
  }, [activeKey, active, readConversation])

  if (active?.sessionId === undefined) return null

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('conversation.title')}>
      <button type="button" className={css.mask} aria-label={t('conversation.close')} onClick={deactivate} />
      <section className={css.panel}>
        <header className={css.header}>
          <div>
            <h2>{active.rootTitle}</h2>
            <p>{conversation.status === 'ready' ? conversation.value.session?.title ?? active.sessionTitle : active.sessionTitle}</p>
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
      </section>
    </div>
  )
}
