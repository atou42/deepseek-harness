import { useEffect, useRef, useState } from 'react'
import {
  IconCloseOutline16, IconSendOutline16, IconStopFill16, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
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
  return ['completed', 'failed', 'cancelled', 'error', 'interrupted', 'merged'].includes(status.toLowerCase())
}

/** Render the currently selected provider-owned remote conversation. */
export function RemoteConversationOverlay({
  useRemoteRoots, deactivate, readConversation, sendConversationMessage, abortConversationTurn, t,
}: RemoteConversationOverlayProps) {
  const active = useRemoteRoots(snapshot => snapshot.active)
  const [conversation, setConversation] = useState<ConversationState>({ status: 'loading' })
  const [draft, setDraft] = useState('')
  const [retryIdentity, setRetryIdentity] = useState<{ readonly content: string; readonly id: string }>()
  const [action, setAction] = useState<'idle' | 'sending' | 'stopping'>('idle')
  const [actionError, setActionError] = useState<string>()
  const [refreshRevision, setRefreshRevision] = useState(0)

  const activeKey = active === undefined ? '' : `${active.sourceId}\0${active.rootId}\0${active.sessionId ?? ''}`
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey
  useEffect(() => {
    setDraft('')
    setRetryIdentity(undefined)
    setAction('idle')
    setActionError(undefined)
  }, [activeKey])
  useEffect(() => {
    if (active === undefined) return
    if (active.sessionId === undefined) {
      setConversation({ status: 'ready', value: { rootId: active.rootId, turns: [] } })
      return
    }
    let live = true
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    setConversation({ status: 'loading' })
    const load = (): void => {
      void readConversation(active.sourceId, {
        rootId: active.rootId,
        ...active.sessionId === undefined ? {} : { sessionId: active.sessionId },
        signal: controller.signal,
      }).then((value) => {
        if (!live) return
        setConversation({ status: 'ready', value })
        if (value.turns.some(turn => !terminal(turn.status))) timer = setTimeout(load, 1_000)
      }, (error: unknown) => {
        if (live && !controller.signal.aborted) setConversation({ status: 'error', message: message(error) })
      })
    }
    load()
    return () => {
      live = false
      controller.abort(new Error('remote conversation changed'))
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [activeKey, active, readConversation, refreshRevision])

  if (active === undefined) return null
  const turns = conversation.status === 'ready' ? conversation.value.turns : []
  const runningTurn = [...turns].reverse().find(turn => !terminal(turn.status))
  const interactive = active.conversation === 'interactive'

  const submit = (): void => {
    const content = draft.trim()
    if (!interactive || content.length === 0 || action !== 'idle') return
    const identity = retryIdentity?.content === content
      ? retryIdentity
      : { content, id: crypto.randomUUID() }
    setRetryIdentity(identity)
    setAction('sending')
    setActionError(undefined)
    const submittedKey = activeKey
    void sendConversationMessage(active.sourceId, {
      rootId: active.rootId,
      ...active.sessionId === undefined ? {} : { sessionId: active.sessionId },
      content,
      clientMessageId: identity.id,
    }).then((submission) => {
      if (activeKeyRef.current !== submittedKey) return
      setDraft('')
      setRetryIdentity(undefined)
      setConversation({
        status: 'ready',
        value: {
          rootId: submission.rootId,
          session: submission.session,
          turns: [...turns.filter(turn => turn.id !== submission.turn.id), submission.turn],
        },
      })
      setRefreshRevision(value => value + 1)
    }, (error: unknown) => {
      if (activeKeyRef.current !== submittedKey) return
      setActionError(t('conversation.submitUnknown', { message: message(error) }))
    }).finally(() => {
      if (activeKeyRef.current === submittedKey) setAction('idle')
    })
  }

  const stop = (): void => {
    if (active.sessionId === undefined || runningTurn === undefined || action !== 'idle') return
    setAction('stopping')
    setActionError(undefined)
    const stoppedKey = activeKey
    void abortConversationTurn(active.sourceId, {
      rootId: active.rootId,
      sessionId: active.sessionId,
      turnId: runningTurn.id,
    }).catch((error: unknown) => {
      if (activeKeyRef.current !== stoppedKey) return
      setActionError(t('conversation.actionError', { message: message(error) }))
    }).finally(() => {
      if (activeKeyRef.current === stoppedKey) {
        setAction('idle')
        setRefreshRevision(value => value + 1)
      }
    })
  }

  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('conversation.title')}>
      <button type="button" className={css.mask} aria-label={t('conversation.close')} onClick={deactivate} />
      <section className={css.panel}>
        <header className={css.header}>
          <div>
            <h2>{active.rootTitle}</h2>
            <p className={css.mode}>{t('conversation.mode')}</p>
            <p>{conversation.status === 'ready'
              ? conversation.value.session?.title ?? active.sessionTitle ?? t('conversation.new')
              : active.sessionTitle ?? t('conversation.new')}</p>
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
        {interactive && (
          <footer className={css.composer}>
            {actionError !== undefined && <p className={css.error} role="alert">{actionError}</p>}
            <div className={css.composerRow}>
              <textarea
                value={draft}
                aria-label={t('conversation.composer.aria')}
                placeholder={t('conversation.composer.placeholder')}
                disabled={action !== 'idle'}
                onChange={(event) => {
                  const next = event.currentTarget.value
                  setDraft(next)
                  if (retryIdentity !== undefined && next.trim() !== retryIdentity.content) setRetryIdentity(undefined)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    submit()
                  }
                }}
              />
              {runningTurn === undefined
                ? (
                  <button type="button" aria-label={t('conversation.send')} disabled={draft.trim().length === 0 || action !== 'idle'} onClick={submit}>
                    <IconSendOutline16 />
                  </button>
                )
                : (
                  <button type="button" aria-label={t('conversation.stop')} disabled={action !== 'idle'} onClick={stop}>
                    <IconStopFill16 />
                  </button>
                )}
            </div>
          </footer>
        )}
      </section>
    </div>
  )
}
