import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyLoader } from '../src/index.ts'
import { AccountFooterAction } from '../src/client/AccountFooterAction.tsx'
import { AccountOverlay } from '../src/client/AccountOverlay.tsx'
import type { CohubAccountOverlayController } from '../src/client/controller.ts'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx); ctx.provide('locale', locale)
  ctx.provide('remote', { cohubAccount: {} } as never)
  const slots = ctx.get('slots') as SlotRegistry
  const declare = slots.register({ name: 'root', children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  } } as never, () => null)
  return { ctx, slots, declare }
}

describe('ui-cohub-account apply', () => {
  it('registers independent account seats and removes both on unload', async () => {
    expect(applyLoader).toBeTypeOf('function')
    applyLoader()
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.cohubAccount'])
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: ['slots', 'locale'], apply })
    await fiber.await()
    expect(b.slots.entries('sidebar.footer.action')[0]?.component).toBe(AccountFooterAction)
    expect(b.slots.entries('shell.overlay')[0]?.component).toBe(AccountOverlay)
    const footer = b.slots.entries('sidebar.footer.action')[0]!
    const overlay = b.slots.entries('shell.overlay')[0]!
    const left = (footer.inject as () => { controller: CohubAccountOverlayController })().controller
    const right = (overlay.inject as () => { controller: CohubAccountOverlayController })().controller
    expect(left).toBe(right)
    left.open(); expect(right.snapshot.getSnapshot().open).toBe(true)
    await fiber.dispose()
    expect(b.slots.entries('sidebar.footer.action')).toEqual([])
    expect(b.slots.entries('shell.overlay')).toEqual([])
    b.declare()
  })
})
