import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-remote-roots/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { RemoteConversationOverlay } from './RemoteConversationOverlay.tsx'
import { RemoteRootTree } from './RemoteRootTree.tsx'
import type { RemoteConversationOverlayInjected, RemoteRootTreeInjected } from './contract.ts'
import { en, NS, zh, type RemoteRootsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { remoteRoots: RemoteRootsKey }
}

export type {
  RemoteConversationOverlayInjected, RemoteConversationOverlayProps,
  RemoteRootTreeInjected, RemoteRootTreeProps,
} from './contract.ts'
export type { RemoteRootsKey } from './locales.ts'

export const inject = ['slots', 'remoteRoots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-remote-roots: dictionaries')
  ctx.slots.inject('sidebar.workspaces.remoteRoots', () => ctx.slots.register(
    {
      name: 'sidebar.workspaces.remoteRoots',
      locale: NS,
      inject: (): RemoteRootTreeInjected => ({
        hooks: { remoteRoots: ctx.remoteRoots.snapshot },
        list: (sourceId, request) => ctx.remoteRoots.list(sourceId, request),
        openConversation: (sourceId, rootId, sessionId, sessionTitle) =>
          ctx.remoteRoots.openConversation(sourceId, rootId, sessionId, sessionTitle),
      }),
    },
    RemoteRootTree,
  ))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay', id: 'remote-conversation', order: 15, locale: NS,
      inject: (): RemoteConversationOverlayInjected => ({
        hooks: { remoteRoots: ctx.remoteRoots.snapshot },
        deactivate: () => { ctx.remoteRoots.deactivate() },
        readConversation: (sourceId, request) => ctx.remoteRoots.readConversation(sourceId, request),
        sendConversationMessage: (sourceId, request) => ctx.remoteRoots.sendConversationMessage(sourceId, request),
        abortConversationTurn: (sourceId, request) => ctx.remoteRoots.abortConversationTurn(sourceId, request),
      }),
    },
    RemoteConversationOverlay,
  ))
}
