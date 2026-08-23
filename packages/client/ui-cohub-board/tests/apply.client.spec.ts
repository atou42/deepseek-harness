import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyLoader } from '../src/index.ts'
import { BoardFooterAction } from '../src/client/BoardFooterAction.tsx'
import { BoardOverlay } from '../src/client/BoardOverlay.tsx'
import type { CohubBoardOverlayController } from '../src/client/controller.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); ctx.provide('locale', locale)
  ctx.provide('remote', { cohubSpaces: {}, cohubBoard: {} } as never)
  const slots = ctx.get('slots') as SlotRegistry
  const declare = slots.register({ name: 'root', children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, locale, slots, declare }
}

describe('ui-cohub-board apply', () => {
  it('registers independent footer and overlay seats and removes both on unload', async () => {
    expect(applyLoader).toBeTypeOf('function')
    applyLoader()
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.cohubSpaces', 'remote.cohubBoard'])
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: ['slots', 'locale'], apply })
    await fiber.await()
    expect(b.slots.entries('sidebar.footer.action')[0]?.component).toBe(BoardFooterAction)
    expect(b.slots.entries('shell.overlay')[0]?.component).toBe(BoardOverlay)
    const footer = b.slots.entries('sidebar.footer.action')[0]!
    const overlay = b.slots.entries('shell.overlay')[0]!
    const left = (footer.inject as () => { controller: CohubBoardOverlayController })().controller
    const right = (overlay.inject as () => { controller: CohubBoardOverlayController })().controller
    expect(left).toBe(right)
    left.open(); expect(right.snapshot.getSnapshot().open).toBe(true)
    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toEqual([])
    expect(b.slots.entries('shell.overlay')).toEqual([])
    b.declare()
  })
})
