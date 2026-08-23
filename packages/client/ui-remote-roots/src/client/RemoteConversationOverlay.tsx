import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconCloseOutline16, IconSendOutline16, IconStopFill16, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  RemoteConversationModelCatalog, RemoteConversationSelection, RemoteConversationThinkingLevel,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import type { RemoteConversationOverlayProps } from './contract.ts'
import css from './RemoteConversationOverlay.module.css'

type ConversationState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: Awaited<ReturnType<RemoteConversationOverlayProps['readConversation']>> }
  | { readonly status: 'error'; readonly message: string }

type ModelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: RemoteConversationModelCatalog }
  | { readonly status: 'error'; readonly message: string }

const THINKING_LEVELS: readonly RemoteConversationThinkingLevel[] = Object.freeze([
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
])

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function terminal(status: string): boolean {
  return ['completed', 'failed', 'cancelled', 'error', 'interrupted', 'merged'].includes(status.toLowerCase())
}

function selectedModelValue(selection: RemoteConversationSelection): string {
  return selection.provider === undefined || selection.model === undefined
    ? ''
    : `${selection.provider}\0${selection.model}`
}

/** Render the selected provider conversation as the native DSH center surface. */
export function RemoteConversationOverlay({
  useRemoteRoots, deactivate, readConversation, listConversationModels,
  sendConversationMessage, abortConversationTurn, t,
}: RemoteConversationOverlayProps) {
  const active = useRemoteRoots(snapshot => snapshot.active)
  const [conversation, setConversation] = useState<ConversationState>({ status: 'loading' })
  const [models, setModels] = useState<ModelsState>({ status: 'loading' })
  const [selection, setSelection] = useState<RemoteConversationSelection>({})
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [retryIdentity, setRetryIdentity] = useState<{ readonly content: string; readonly id: string }>()
  const [action, setAction] = useState<'idle' | 'sending' | 'stopping'>('idle')
  const [actionError, setActionError] = useState<string>()
  const [refreshRevision, setRefreshRevision] = useState(0)

  const activeKey = active === undefined ? '' : `${active.sourceId}\0${active.rootId}\0${active.sessionId ?? ''}`
  const modelScopeKey = active === undefined ? '' : `${active.sourceId}\0${active.rootId}`
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey

  useEffect(() => {
    setDraft('')
    setRetryIdentity(undefined)
    setAction('idle')
    setActionError(undefined)
  }, [activeKey])

  useEffect(() => {
    setSelection({})
    setModelMenuOpen(false)
  }, [modelScopeKey])

  useEffect(() => {
    if (active === undefined || active.conversation !== 'interactive') return
    const controller = new AbortController()
    setModels({ status: 'loading' })
    void listConversationModels(active.sourceId, {
      rootId: active.rootId,
      signal: controller.signal,
    }).then(
      (value) => { if (!controller.signal.aborted) setModels({ status: 'ready', value }) },
      (error: unknown) => {
        if (!controller.signal.aborted) setModels({ status: 'error', message: message(error) })
      },
    )
    return () => { controller.abort(new Error('remote model catalog changed')) }
  }, [modelScopeKey, active, listConversationModels])

  useEffect(() => {
    if (active === undefined) return
    const sessionId = active.sessionId
    if (sessionId === undefined) {
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
        sessionId,
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

  const selectedModelName = useMemo(() => {
    if (models.status !== 'ready' || selection.provider === undefined || selection.model === undefined) return undefined
    return models.value.groups
      .flatMap(group => group.models)
      .find(model => model.provider === selection.provider && model.id === selection.model)?.name
  }, [models, selection])

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
    setModelMenuOpen(false)
    setAction('sending')
    setActionError(undefined)
    const submittedKey = activeKey
    const hasSelection = selection.provider !== undefined || selection.model !== undefined
      || selection.thinkingLevel !== undefined
    void sendConversationMessage(active.sourceId, {
      rootId: active.rootId,
      ...active.sessionId === undefined ? {} : { sessionId: active.sessionId },
      content,
      clientMessageId: identity.id,
      ...hasSelection ? { selection } : {},
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
    <main className={css.surface} aria-label={t('conversation.title')}>
      <header className={css.header}>
        <div className={css.titleRow}>
          <div className={css.titleCluster}>
            <h2>{conversation.status === 'ready'
              ? conversation.value.session?.title ?? active.sessionTitle ?? active.rootTitle
              : active.sessionTitle ?? active.rootTitle}</h2>
            <span className={css.mode}>{t('conversation.mode')}</span>
          </div>
          <button type="button" className={css.iconButton} aria-label={t('conversation.close')} onClick={deactivate}>
            <IconCloseOutline16 />
          </button>
        </div>
        <div className={css.tabs} aria-label={t('conversation.tabs.aria')}>
          <span className={css.activeTab}>{t('conversation.tab.chat')}</span>
        </div>
      </header>

      <div className={css.history}>
        <div className={css.historyInner}>
          {conversation.status === 'loading' && <p role="status">{t('conversation.loading')}</p>}
          {conversation.status === 'error' && <p className={css.error} role="alert">{t('conversation.error', { message: conversation.message })}</p>}
          {conversation.status === 'ready' && conversation.value.turns.length === 0 && (
            <div className={css.emptyState}>
              <h3>{active.rootTitle}</h3>
              {conversation.value.session === undefined && <p>{t('conversation.new')}</p>}
            </div>
          )}
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
        </div>
      </div>

      {interactive && (
        <footer className={css.composerArea}>
          <div className={css.composerFrame}>
            {actionError !== undefined && <p className={css.error} role="alert">{actionError}</p>}
            {modelMenuOpen && (
              <div className={css.modelMenu}>
                {models.status === 'loading' && <p role="status">{t('conversation.model.loading')}</p>}
                {models.status === 'error' && <p className={css.error} role="alert">{t('conversation.model.error', { message: models.message })}</p>}
                {models.status === 'ready' && (
                  <label>
                    <span>{t('conversation.model.label')}</span>
                    <select
                      aria-label={t('conversation.model.label')}
                      value={selectedModelValue(selection)}
                      onChange={(event) => {
                        const value = event.currentTarget.value
                        if (value === '') {
                          setSelection(current => current.thinkingLevel === undefined
                            ? {}
                            : { thinkingLevel: current.thinkingLevel })
                          return
                        }
                        const split = value.indexOf('\0')
                        const provider = value.slice(0, split)
                        const model = value.slice(split + 1)
                        const exists = models.value.groups.some(group => group.models.some(
                          candidate => candidate.provider === provider && candidate.id === model,
                        ))
                        if (!exists) throw new TypeError('ui-remote-roots: selected model is absent from the catalog')
                        setSelection(current => ({ ...current, provider, model }))
                      }}
                    >
                      <option value="">{t('conversation.model.default')}</option>
                      {models.value.groups.map(group => (
                        <optgroup key={group.id} label={group.name}>
                          {group.models.map(model => (
                            <option key={`${model.provider}\0${model.id}`} value={`${model.provider}\0${model.id}`}>{model.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  <span>{t('conversation.thinking.label')}</span>
                  <select
                    aria-label={t('conversation.thinking.label')}
                    value={selection.thinkingLevel ?? ''}
                    onChange={(event) => {
                      const value = event.currentTarget.value
                      if (value === '') {
                        setSelection(current => current.provider === undefined || current.model === undefined
                          ? {}
                          : { provider: current.provider, model: current.model })
                        return
                      }
                      const level = THINKING_LEVELS.find(candidate => candidate === value)
                      if (level === undefined) throw new TypeError('ui-remote-roots: invalid thinking level')
                      setSelection(current => ({ ...current, thinkingLevel: level }))
                    }}
                  >
                    <option value="">{t('conversation.thinking.default')}</option>
                    {THINKING_LEVELS.map(level => (
                      <option key={level} value={level}>{t(`conversation.thinking.${level}`)}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <div className={css.composerCard}>
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
              <div className={css.composerToolbar}>
                <button
                  type="button"
                  className={css.modelButton}
                  aria-expanded={modelMenuOpen}
                  aria-label={t('conversation.model.trigger', {
                    model: selectedModelName ?? t('conversation.model.default'),
                  })}
                  onClick={() => { setModelMenuOpen(open => !open) }}
                >
                  {selectedModelName ?? t('conversation.model.default')}
                  <span aria-hidden="true">⌄</span>
                </button>
                {runningTurn === undefined
                  ? (
                    <button className={css.submitButton} type="button" aria-label={t('conversation.send')} disabled={draft.trim().length === 0 || action !== 'idle'} onClick={submit}>
                      <IconSendOutline16 />
                    </button>
                  )
                  : (
                    <button className={css.submitButton} type="button" aria-label={t('conversation.stop')} disabled={action !== 'idle'} onClick={stop}>
                      <IconStopFill16 />
                    </button>
                  )}
              </div>
            </div>
          </div>
        </footer>
      )}
    </main>
  )
}
