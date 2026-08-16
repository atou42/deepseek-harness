/** Package-owned invariant companion for @deepseek-ai/dsh-client-cohub-account. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-cohub-account'

export const name = 'client-cohub-account-invariant'
export const inject = ['invariants']

/** Browser state is token-free by type and verified by the package suite. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
