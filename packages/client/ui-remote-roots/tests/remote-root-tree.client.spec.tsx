// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  RemoteResourceId, RemoteRootSourceId, RemoteRootsSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import { RemoteRootTree } from '../src/client/RemoteRootTree.tsx'
import type { RemoteRootTreeProps } from '../src/client/contract.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sid = (value: string) => value as RemoteRootSourceId
const rid = (value: string) => value as RemoteResourceId
const t = makeTranslate(zh)

function readySnapshot(): RemoteRootsSnapshot {
  return {
    revision: 1,
    sources: [{
      sourceId: sid('fixture.remote'),
      status: 'ready',
      roots: [{
        id: rid('space:opaque-1'),
        title: '故事空间',
        marker: { kind: 'cloud', label: '云端' },
        capabilities: { browse: true, read: true, write: false, workspace: true, conversation: 'interactive' },
      }],
    }],
  }
}

describe('RemoteRootTree', () => {
  it('opens a provider-owned Session in the selected Space', async () => {
    const source = createSnapshotStore(readySnapshot())
    const openConversation = vi.fn(async () => {})
    const list = vi.fn(async (_sourceId: RemoteRootSourceId, { rootId, parentId }: Parameters<RemoteRootTreeProps['list']>[1]) => ({
      rootId,
      parentId,
      entries: [{ id: rid('session:opaque-1'), parentId, name: '继续插件开发', kind: 'session' as const }],
    }))
    const view = render(
      <RemoteRootTree
        useRemoteRoots={bindSnapshotSelector(source)} list={list}
        openConversation={openConversation} t={t}
      />,
    )
    fireEvent.click(view.getByRole('treeitem', { name: '展开 故事空间' }))
    fireEvent.click(await view.findByRole('treeitem', { name: '会话 继续插件开发' }))
    expect(openConversation).toHaveBeenCalledWith(
      sid('fixture.remote'), rid('space:opaque-1'), rid('session:opaque-1'), '继续插件开发',
    )
  })

  it('offers only the cloud Cohub Agent action for one Space', async () => {
    const source = createSnapshotStore(readySnapshot())
    const openConversation = vi.fn(async () => {})
    const list = vi.fn(async (_sourceId: RemoteRootSourceId, request: Parameters<RemoteRootTreeProps['list']>[1]) => ({
      rootId: request.rootId, parentId: request.parentId, entries: [],
    }))
    const view = render(
      <RemoteRootTree
        useRemoteRoots={bindSnapshotSelector(source)} list={list}
        openConversation={openConversation} t={t}
      />,
    )

    fireEvent.click(view.getByRole('treeitem', { name: '展开 故事空间' }))
    fireEvent.click(await view.findByRole('button', { name: '在故事空间中使用 Cohub Agent' }))
    expect(openConversation).toHaveBeenCalledWith(sid('fixture.remote'), rid('space:opaque-1'))
    expect(view.queryByRole('button', { name: '在故事空间中使用本地 DSH Agent' })).toBeNull()
  })

  it('renders a marked folder-like remote root and lists through opaque identities', async () => {
    const source = createSnapshotStore(readySnapshot())
    const list = vi.fn(async (_sourceId: RemoteRootSourceId, { rootId, parentId }: Parameters<RemoteRootTreeProps['list']>[1]) => ({
      rootId,
      parentId,
      entries: [
        { id: rid('folder:characters'), parentId, name: '角色', kind: 'folder' as const },
        { id: rid('file:bible'), parentId, name: '世界设定.md', kind: 'file' as const, revision: 'r1' },
        { id: rid('link:latest'), parentId, name: '最新设定', kind: 'link' as const, revision: 'r2' },
      ],
    }))
    const view = render(
      <RemoteRootTree
        useRemoteRoots={bindSnapshotSelector(source)} list={list}
        openConversation={vi.fn()} t={t}
      />,
    )
    expect(view.getByText('故事空间').closest('[role="treeitem"]')?.getAttribute('aria-expanded')).toBe('false')
    expect(view.getByText('云端').getAttribute('data-marker-kind')).toBe('cloud')
    expect(view.container.querySelector('[data-path], [data-workspace-id], [data-cwd]')).toBeNull()

    fireEvent.click(view.getByRole('treeitem', { name: '展开 故事空间' }))
    await view.findByText('世界设定.md')
    expect(list).toHaveBeenCalledTimes(1)
    expect(list.mock.calls[0]?.[0]).toBe(sid('fixture.remote'))
    expect(list.mock.calls[0]?.[1]).toMatchObject({
      rootId: rid('space:opaque-1'), parentId: rid('space:opaque-1'),
    })
    expect(list.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)
    expect(view.getByRole('treeitem', { name: '文件 世界设定.md' }).getAttribute(
      'data-remote-resource-id',
    )).toBe('file:bible')
    expect(view.getByRole('treeitem', { name: '链接 最新设定' }).getAttribute(
      'data-remote-resource-id',
    )).toBe('link:latest')
  })

  it('surfaces a listing failure and retries the same remote folder', async () => {
    const source = createSnapshotStore(readySnapshot())
    let attempt = 0
    const list = vi.fn(async (_sourceId: RemoteRootSourceId, request: Parameters<RemoteRootTreeProps['list']>[1]) => {
      if (attempt++ === 0) throw new Error('provider offline')
      return { rootId: request.rootId, parentId: request.parentId, entries: [] }
    })
    const view = render(
      <RemoteRootTree
        useRemoteRoots={bindSnapshotSelector(source)} list={list}
        openConversation={vi.fn()} t={t}
      />,
    )
    fireEvent.click(view.getByRole('treeitem', { name: '展开 故事空间' }))
    expect((await view.findByRole('alert')).textContent).toContain('provider offline')
    fireEvent.click(view.getByRole('button', { name: '重试' }))
    await view.findByText('空文件夹')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('aborts a collapsed request and ignores its late completion', async () => {
    const source = createSnapshotStore(readySnapshot())
    let resolve!: (value: {
      rootId: RemoteResourceId
      parentId: RemoteResourceId
      entries: readonly []
    }) => void
    const pending = new Promise<{
      rootId: RemoteResourceId
      parentId: RemoteResourceId
      entries: readonly []
    }>((done) => { resolve = done })
    const list = vi.fn(async (
      _sourceId: RemoteRootSourceId,
      _request: Parameters<RemoteRootTreeProps['list']>[1],
    ) => pending)
    const view = render(
      <RemoteRootTree
        useRemoteRoots={bindSnapshotSelector(source)} list={list}
        openConversation={vi.fn()} t={t}
      />,
    )
    fireEvent.click(view.getByRole('treeitem', { name: '展开 故事空间' }))
    const signal = list.mock.calls[0]?.[1].signal as AbortSignal
    fireEvent.click(view.getByRole('treeitem', { name: '收起 故事空间' }))
    expect(signal.aborted).toBe(true)
    resolve({ rootId: rid('space:opaque-1'), parentId: rid('space:opaque-1'), entries: [] })
    await Promise.resolve()
    expect(view.queryByText('空文件夹')).toBeNull()
  })

  it('reacts to source loading and error publications without inventing roots', async () => {
    const source = createSnapshotStore<RemoteRootsSnapshot>({
      revision: 1,
      sources: [{ sourceId: sid('fixture.remote'), status: 'loading', roots: [] }],
    })
    const view = render(
      <RemoteRootTree
        useRemoteRoots={bindSnapshotSelector(source)} list={vi.fn()}
        openConversation={vi.fn()} t={t}
      />,
    )
    expect(view.getByRole('status').textContent).toContain('正在连接')
    source.set({
      revision: 2,
      sources: [{
        sourceId: sid('fixture.remote'), status: 'authentication-required',
        roots: [], provider: 'Cohub',
      }],
    })
    await waitFor(() => {
      expect(view.getByRole('status').textContent).toContain('登录 Cohub')
    })
    expect(view.queryByRole('alert')).toBeNull()
    source.set({
      revision: 3,
      sources: [{ sourceId: sid('fixture.remote'), status: 'error', roots: [], message: '登录已失效' }],
    })
    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('登录已失效') })
    expect(view.queryByRole('treeitem')).toBeNull()
  })
})
