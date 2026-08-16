// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime, usePinnedBrowserLanguages } from '@deepseek-ai/dsh-client-test-runtime'
import type {
  RemoteResourceId, RemoteRootSource, RemoteRootSourceId, RemoteRootSourceSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import { RemoteRootsService } from '../../remote-roots/src/client/service.ts'
import { CohubSpacesRemoteRootSource } from '../../cohub-spaces/src/client/index.ts'
import { apply as workspaceApply, inject as workspaceInject } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { apply as remoteUiApply, inject as remoteUiInject } from '@deepseek-ai/dsh-client-ui-remote-roots/client'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

type FrameProps = PropsRenderSlots<'sidebar.workspaces'>
function SidebarFrame({ renderSlot }: FrameProps) {
  return <>{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => {} })}</>
}

describe('remote roots through the assembled Workspace browser', () => {
  it('appears as a marked folder, never enters Workspace state, and withdraws on provider unload', async () => {
    const runtime = await SlotTestRuntime.create()
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.ctx.plugin(RemoteRootsService).await()
    await runtime.root.declare(
      { 'sidebar.workspaces': { kind: 'single', scope: 'root' } } as never,
      SidebarFrame as never,
    )
    await runtime.mount({ inject: [...workspaceInject], apply: workspaceApply })
    await runtime.mount({ inject: [...remoteUiInject], apply: remoteUiApply })

    const snapshot = createSnapshotStore<RemoteRootSourceSnapshot>({
      status: 'ready',
      roots: [{
        id: 'space:story' as RemoteResourceId,
        title: '云端故事空间',
        marker: { kind: 'cloud', label: 'Cohub 云端' },
        capabilities: { browse: true, read: true, write: false },
      }],
    })
    const list = vi.fn(async ({ rootId, parentId }: {
      rootId: RemoteResourceId
      parentId: RemoteResourceId
    }) => ({ rootId, parentId, entries: [] }))
    const source: RemoteRootSource = {
      id: 'fixture.remote' as RemoteRootSourceId,
      snapshot,
      list,
    }
    const service = runtime.ctx.get('remoteRoots') as RemoteRootsService
    const disposeProvider = service.register(source)
    const view = runtime.renderRoot()

    const root = await view.findByRole('treeitem', { name: '展开 云端故事空间' })
    expect(view.getByText('Cohub 云端').getAttribute('data-marker-kind')).toBe('cloud')
    expect(runtime.workspaces.list.getSnapshot().items).toEqual([])
    fireEvent.click(root)
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(1) })
    expect(runtime.workspaces.list.getSnapshot().items).toEqual([])

    disposeProvider()
    await waitFor(() => { expect(view.queryByText('云端故事空间')).toBeNull() })
    expect(runtime.workspaces.list.getSnapshot().items).toEqual([])
    await runtime.dispose()
  })

  it('composes the Cohub provider so opening a Space renders Sessions rather than files', async () => {
    const runtime = await SlotTestRuntime.create()
    const locale = new LocaleRuntime(runtime.ctx)
    runtime.provide('locale', locale)
    runtime.slots.installLocale(locale)
    await runtime.ctx.plugin(RemoteRootsService).await()
    await runtime.root.declare(
      { 'sidebar.workspaces': { kind: 'single', scope: 'root' } } as never,
      SidebarFrame as never,
    )
    await runtime.mount({ inject: [...workspaceInject], apply: workspaceApply })
    await runtime.mount({ inject: [...remoteUiInject], apply: remoteUiApply })

    const source = new CohubSpacesRemoteRootSource({
      getAccount: vi.fn(async () => ({
        revision: 1,
        status: 'authenticated' as const,
        profile: { userId: 'user-1' },
        accessTokenExpiresAt: Date.now() + 60_000,
      })),
      listSpaces: vi.fn(async () => [{ id: 'space-1', title: 'deepseek harness' }]),
      listSessions: vi.fn(async () => ({
        spaceId: 'space-1',
        sessions: [{
          id: 'session-1',
          spaceId: 'space-1',
          title: '把 Cohub Session 接进 DSH',
          status: 'active',
          latestMessageText: '继续实现',
          updatedAt: '2026-08-16T10:00:00.000Z',
        }],
      })),
      getConversation: vi.fn(async () => ({
        spaceId: 'space-1',
        session: {
          id: 'session-1', spaceId: 'space-1', title: '把 Cohub Session 接进 DSH', status: 'active',
          latestMessageText: '继续实现', updatedAt: '2026-08-16T10:00:00.000Z',
        },
        turns: [],
      })),
      promptConversation: vi.fn(),
    })
    const service = runtime.ctx.get('remoteRoots') as RemoteRootsService
    const disposeProvider = service.register(source)
    await source.refresh()
    const view = runtime.renderRoot()

    fireEvent.click(await view.findByRole('treeitem', { name: '展开 deepseek harness' }))
    expect(await view.findByRole('treeitem', { name: '会话 把 Cohub Session 接进 DSH' })).toBeTruthy()
    expect(view.queryByRole('treeitem', { name: /文件/ })).toBeNull()
    expect(runtime.workspaces.list.getSnapshot().items).toEqual([])

    disposeProvider()
    source.dispose()
    await runtime.dispose()
  })
})
