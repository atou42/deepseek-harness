import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { BoardFooterAction } from './BoardFooterAction.tsx'
import { BoardOverlay } from './BoardOverlay.tsx'
import { CohubBoardOverlayController } from './controller.ts'
import { en, NS, zh, type CohubBoardKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { cohubBoard: CohubBoardKey } }

export * from './BoardOverlay.tsx'
export * from './controller.ts'
export type { CohubBoardKey } from './locales.ts'

export const inject = ['slots', 'locale', 'remote', 'remote.cohubSpaces', 'remote.cohubBoard']

export function apply(ctx: ClientContext): void {
  const controller = new CohubBoardOverlayController()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-cohub-board: dictionaries')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'cohub-board', order: 20, locale: NS,
    inject: () => ({ controller }),
  }, BoardFooterAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'cohub-board', order: 20, locale: NS,
    inject: () => ({
      controller,
      remote: {
        listSpaces: () => ctx.remote.cohubSpaces.listSpaces(),
        listDirectory: (spaceId: string, path: string) => ctx.remote.cohubSpaces.listDirectory(spaceId, path),
        readText: (spaceId: string, path: string) => ctx.remote.cohubSpaces.readText(spaceId, path),
        getBoard: (spaceId: string, boardId: string) => ctx.remote.cohubBoard.getBoard(spaceId, boardId),
      },
    }),
  }, BoardOverlay))
}
