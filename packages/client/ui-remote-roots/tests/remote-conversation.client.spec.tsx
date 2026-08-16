// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  RemoteConversationPromptResult, RemoteConversationView, RemoteResourceId,
  RemoteRootSourceId, RemoteRootsSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import { RemoteConversationOverlay } from '../src/client/RemoteConversationOverlay.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (value: string) => value as RemoteRootSourceId
const rid = (value: string) => value as RemoteResourceId
const t = makeTranslate(zh)

describe('RemoteConversationOverlay', () => {
  it('opens a selected Space, creates its first Session, and renders the provider history', async () => {
    const sourceId = sid('cohub')
    const rootId = rid('space-1')
    const sessionId = rid('session-1')
    const turnId = rid('turn-1')
    const snapshot = createSnapshotStore<RemoteRootsSnapshot>({
      revision: 1,
      sources: [],
      active: { sourceId, rootId, rootTitle: 'deepseek harness' },
    })
    const empty: RemoteConversationView = { rootId, turns: [] }
    const completed: RemoteConversationView = {
      rootId,
      session: { id: sessionId, title: '接入 Cohub', status: 'active' },
      turns: [{
        id: turnId,
        sequence: 1,
        status: 'completed',
        userText: '继续接入',
        assistantText: '已经接好了。',
        updatedAt: '2026-08-16T00:00:00.000Z',
      }],
    }
    const readConversation = vi.fn(async () => readConversation.mock.calls.length === 1 ? empty : completed)
    const result: RemoteConversationPromptResult = {
      rootId, sessionId, sessionTitle: '接入 Cohub', turnId, turnStatus: 'running',
    }
    const promptConversation = vi.fn(async () => result)
    const deactivate = vi.fn()
    const view = render(
      <RemoteConversationOverlay
        useRemoteRoots={bindSnapshotSelector(snapshot)}
        readConversation={readConversation}
        promptConversation={promptConversation}
        deactivate={deactivate}
        t={t}
      />,
    )
    expect(await view.findByRole('dialog', { name: 'Cohub 会话' })).toBeTruthy()
    fireEvent.change(view.getByRole('textbox'), { target: { value: '继续接入' } })
    fireEvent.click(view.getByRole('button', { name: '发送' }))
    await waitFor(() => { expect(promptConversation).toHaveBeenCalledWith(sourceId, { rootId, text: '继续接入' }) })
    expect(await view.findByText('已经接好了。')).toBeTruthy()
    expect(view.getByText('继续接入')).toBeTruthy()
    expect(readConversation).toHaveBeenLastCalledWith(sourceId, { rootId, sessionId })
  })
})
