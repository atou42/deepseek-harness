import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { RemoteRootsService } from './service.ts'

export type { RemoteRootsServiceContract } from './contract.ts'
export type * from '../types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteRoots: import('./contract.ts').RemoteRootsServiceContract
  }
}

/** No prerequisites: this package is the generic browser-side capability seam. */
export const inject: readonly string[] = []

/** Install the remote-root registry. */
export function apply(ctx: ClientContext): void {
  ctx.plugin(RemoteRootsService)
}
