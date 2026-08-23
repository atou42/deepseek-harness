import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { AccountFooterAction } from './AccountFooterAction.tsx'
import { AccountOverlay } from './AccountOverlay.tsx'
import { CohubAccountOverlayController } from './controller.ts'
import { en, NS, zh, type CohubAccountKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { cohubAccount: CohubAccountKey } }

export * from './AccountOverlay.tsx'
export * from './controller.ts'
export type { CohubAccountKey } from './locales.ts'

export const inject = ['slots', 'locale', 'remote', 'remote.cohubAccount']

export function apply(ctx: ClientContext): void {
  const controller = new CohubAccountOverlayController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-cohub-account: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'cohub-account', order: 10, locale: NS,
    inject: () => ({ controller }),
  }, AccountFooterAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'cohub-account', order: 10, locale: NS,
    inject: () => ({ controller, remote: {
      getAccount: () => ctx.remote.cohubAccount.getAccount(),
      beginLogin: () => ctx.remote.cohubAccount.beginLogin(),
      pollLogin: () => ctx.remote.cohubAccount.pollLogin(),
      cancelLogin: () => ctx.remote.cohubAccount.cancelLogin(),
      logout: () => ctx.remote.cohubAccount.logout(),
    } }),
  }, AccountOverlay))
}
