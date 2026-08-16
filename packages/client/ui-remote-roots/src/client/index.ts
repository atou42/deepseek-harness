import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-remote-roots/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { RemoteRootTree } from './RemoteRootTree.tsx'
import type { RemoteRootTreeInjected } from './contract.ts'
import { en, NS, zh, type RemoteRootsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { remoteRoots: RemoteRootsKey }
}

export type { RemoteRootTreeInjected, RemoteRootTreeProps } from './contract.ts'
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
      }),
    },
    RemoteRootTree,
  ))
}
