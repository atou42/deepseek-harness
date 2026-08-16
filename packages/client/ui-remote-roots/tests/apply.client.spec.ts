import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-remote-roots/client'
import type {
  RemoteConversationOverlayInjected, RemoteRootTreeInjected,
} from '@deepseek-ai/dsh-client-ui-remote-roots/client'
import { RemoteConversationOverlay } from '../src/client/RemoteConversationOverlay.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const snapshot = { getSnapshot: () => ({ revision: 0, sources: [] }), subscribe: () => () => {} }
  const list = vi.fn()
  const activate = vi.fn()
  const deactivate = vi.fn()
  const readConversation = vi.fn()
  const promptConversation = vi.fn()
  ctx.provide('remoteRoots', {
    snapshot, list, activate, deactivate, readConversation, promptConversation,
  } as never)
  return { ctx, slots, locale, snapshot, list, activate, deactivate, readConversation, promptConversation }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'sidebar.workspaces.remoteRoots': { kind: 'single', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-remote-roots apply', () => {
  it('declares only its generic browser dependencies', () => {
    expect(inject).toEqual(['slots', 'remoteRoots', 'locale'])
  })

  it('registers before or after declaration and unloads its slot entry', async () => {
    const before = await bench()
    declare(before.slots)
    const first = before.ctx.plugin({ inject: [...inject], apply })
    await first.await()
    const entry = before.slots.entries('sidebar.workspaces.remoteRoots')[0]!
    expect(entry.locale).toBe('remoteRoots')
    expect(before.locale.bind('remoteRoots')('section')).toBe('远程')
    const injected = (entry.inject as unknown as () => RemoteRootTreeInjected)()
    expect(injected.hooks.remoteRoots).toBe(before.snapshot)
    const signal = new AbortController().signal
    await injected.list('fixture.remote' as never, {
      rootId: 'root' as never, parentId: 'folder' as never, signal,
    })
    expect(before.list).toHaveBeenCalledWith('fixture.remote', {
      rootId: 'root', parentId: 'folder', signal,
    })
    injected.activate('fixture.remote' as never, 'root' as never, 'session' as never, 'Session')
    expect(before.activate).toHaveBeenCalledWith('fixture.remote', 'root', 'session', 'Session')
    const overlayEntry = before.slots.entries('shell.overlay')[0]!
    expect(overlayEntry.component).toBe(RemoteConversationOverlay)
    const overlay = (overlayEntry.inject as unknown as () => RemoteConversationOverlayInjected)()
    overlay.deactivate()
    expect(before.deactivate).toHaveBeenCalled()
    await first.dispose()
    expect(before.slots.entries('sidebar.workspaces.remoteRoots')).toHaveLength(0)
    expect(before.slots.entries('shell.overlay')).toHaveLength(0)

    const after = await bench()
    const second = after.ctx.plugin({ inject: [...inject], apply })
    await second.await()
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('sidebar.workspaces.remoteRoots')).toHaveLength(1)
    await second.dispose()
  })
})
