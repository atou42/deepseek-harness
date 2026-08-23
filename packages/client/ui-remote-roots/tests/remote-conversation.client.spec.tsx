// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteConversationView, RemoteResourceId, RemoteRootSourceId, RemoteRootsSnapshot } from '@deepseek-ai/dsh-client-remote-roots/client'
import { RemoteConversationOverlay } from '../src/client/RemoteConversationOverlay.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (value: string) => value as RemoteRootSourceId
const rid = (value: string) => value as RemoteResourceId
const t = makeTranslate(zh)

describe('RemoteConversationOverlay', () => {
  it('renders a selected interactive provider Session with its own composer', async () => {
    const sourceId = sid('cohub')
    const rootId = rid('space-1')
    const sessionId = rid('session-1')
    const turnId = rid('turn-1')
    const snapshot = createSnapshotStore<RemoteRootsSnapshot>({
      revision: 1,
      sources: [],
      active: { sourceId, rootId, rootTitle: 'deepseek harness', conversation: 'interactive', sessionId, sessionTitle: '接入 Cohub' },
    })
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
    const readConversation = vi.fn(async () => completed)
    const sendConversationMessage = vi.fn(async () => ({
      rootId,
      session: completed.session!,
      turn: {
        id: rid('turn-2'), sequence: 2, status: 'queued', userText: '继续',
        updatedAt: '2026-08-23T12:00:00.000Z',
      },
    }))
    const deactivate = vi.fn()
    const view = render(
      <RemoteConversationOverlay
        useRemoteRoots={bindSnapshotSelector(snapshot)}
        readConversation={readConversation}
        sendConversationMessage={sendConversationMessage}
        abortConversationTurn={vi.fn()}
        deactivate={deactivate}
        t={t}
      />,
    )
    expect(await view.findByRole('dialog', { name: 'Cohub 会话' })).toBeTruthy()
    expect(await view.findByText('已经接好了。')).toBeTruthy()
    expect(view.getByText('继续接入')).toBeTruthy()
    expect(view.getByRole('textbox', { name: '发送给 Cohub Agent' })).toBeTruthy()
    expect(view.getByText('Cohub Agent · 云端')).toBeTruthy()
    expect(readConversation).toHaveBeenLastCalledWith(sourceId, {
      rootId, sessionId, signal: expect.any(AbortSignal) as AbortSignal,
    })

    fireEvent.change(view.getByRole('textbox'), { target: { value: '继续' } })
    fireEvent.click(view.getByRole('button', { name: '发送' }))
    await vi.waitFor(() => { expect(sendConversationMessage).toHaveBeenCalledOnce() })
    expect(sendConversationMessage).toHaveBeenCalledWith(sourceId, {
      rootId, sessionId, content: '继续', clientMessageId: expect.any(String) as string,
    })
  })

  it('opens a new cloud-only Cohub Agent composer without a local DSH Session', () => {
    const sourceId = sid('cohub')
    const rootId = rid('space-1')
    const snapshot = createSnapshotStore<RemoteRootsSnapshot>({
      revision: 1,
      sources: [],
      active: { sourceId, rootId, rootTitle: 'deepseek harness', conversation: 'interactive' },
    })
    const view = render(
      <RemoteConversationOverlay
        useRemoteRoots={bindSnapshotSelector(snapshot)}
        readConversation={vi.fn()}
        sendConversationMessage={vi.fn()}
        abortConversationTurn={vi.fn()}
        deactivate={vi.fn()}
        t={t}
      />,
    )
    expect(view.getByRole('dialog', { name: 'Cohub 会话' })).toBeTruthy()
    expect(view.getByText('新的 Cohub 会话')).toBeTruthy()
    expect(view.getByRole('textbox', { name: '发送给 Cohub Agent' })).toBeTruthy()
  })

  it('keeps an unknown submission retry idempotent until the draft changes', async () => {
    const sourceId = sid('cohub')
    const rootId = rid('space-1')
    const snapshot = createSnapshotStore<RemoteRootsSnapshot>({
      revision: 1,
      sources: [],
      active: { sourceId, rootId, rootTitle: 'deepseek harness', conversation: 'interactive' },
    })
    const sendConversationMessage = vi.fn(async (
      _sourceId: RemoteRootSourceId,
      _request: { readonly clientMessageId: string },
    ) => { throw new Error('connection lost') })
    const view = render(
      <RemoteConversationOverlay
        useRemoteRoots={bindSnapshotSelector(snapshot)}
        readConversation={vi.fn()}
        sendConversationMessage={sendConversationMessage}
        abortConversationTurn={vi.fn()}
        deactivate={vi.fn()}
        t={t}
      />,
    )
    const composer = view.getByRole('textbox', { name: '发送给 Cohub Agent' })
    fireEvent.change(composer, { target: { value: '继续' } })
    fireEvent.click(view.getByRole('button', { name: '发送' }))
    expect((await view.findByRole('alert')).textContent).toContain('提交结果未知')
    expect((composer as HTMLTextAreaElement).value).toBe('继续')
    const firstId = sendConversationMessage.mock.calls[0]?.[1].clientMessageId

    fireEvent.click(view.getByRole('button', { name: '发送' }))
    await vi.waitFor(() => { expect(sendConversationMessage).toHaveBeenCalledTimes(2) })
    expect(sendConversationMessage.mock.calls[1]?.[1].clientMessageId).toBe(firstId)
  })

  it('does not apply a late cloud submission after the active conversation changes', async () => {
    const sourceId = sid('cohub')
    const rootId = rid('space-1')
    const firstSessionId = rid('session-1')
    const secondSessionId = rid('session-2')
    const snapshot = createSnapshotStore<RemoteRootsSnapshot>({
      revision: 1,
      sources: [],
      active: {
        sourceId, rootId, rootTitle: 'deepseek harness', conversation: 'interactive',
        sessionId: firstSessionId, sessionTitle: 'First Session',
      },
    })
    let resolveSubmission!: (value: {
      rootId: RemoteResourceId
      session: NonNullable<RemoteConversationView['session']>
      turn: RemoteConversationView['turns'][number]
    }) => void
    const sendConversationMessage = vi.fn(() => new Promise<{
      rootId: RemoteResourceId
      session: NonNullable<RemoteConversationView['session']>
      turn: RemoteConversationView['turns'][number]
    }>((resolve) => { resolveSubmission = resolve }))
    const readConversation = vi.fn(async (_sourceId: RemoteRootSourceId, request: { sessionId?: RemoteResourceId }) => ({
      rootId,
      session: {
        id: request.sessionId!, title: request.sessionId === firstSessionId ? 'First Session' : 'Second Session',
        status: 'active',
      },
      turns: [],
    }))
    const view = render(
      <RemoteConversationOverlay
        useRemoteRoots={bindSnapshotSelector(snapshot)}
        readConversation={readConversation}
        sendConversationMessage={sendConversationMessage}
        abortConversationTurn={vi.fn()}
        deactivate={vi.fn()}
        t={t}
      />,
    )
    const composer = await view.findByRole('textbox', { name: '发送给 Cohub Agent' })
    fireEvent.change(composer, { target: { value: 'belongs to first' } })
    fireEvent.click(view.getByRole('button', { name: '发送' }))
    await vi.waitFor(() => { expect(sendConversationMessage).toHaveBeenCalledOnce() })

    act(() => {
      snapshot.set({
        revision: 2,
        sources: [],
        active: {
          sourceId, rootId, rootTitle: 'deepseek harness', conversation: 'interactive',
          sessionId: secondSessionId, sessionTitle: 'Second Session',
        },
      })
    })
    expect(await view.findByText('Second Session')).toBeTruthy()
    expect((view.getByRole('textbox', { name: '发送给 Cohub Agent' }) as HTMLTextAreaElement).value).toBe('')

    await act(async () => {
      resolveSubmission({
        rootId,
        session: { id: firstSessionId, title: 'First Session', status: 'active' },
        turn: {
          id: rid('late-turn'), sequence: 2, status: 'queued', userText: 'belongs to first',
          updatedAt: '2026-08-23T12:00:00.000Z',
        },
      })
      await Promise.resolve()
    })
    expect(view.queryByText('belongs to first')).toBeNull()
    expect(view.getByText('Second Session')).toBeTruthy()
  })
})
