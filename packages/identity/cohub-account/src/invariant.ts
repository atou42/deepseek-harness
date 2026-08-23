/** Package-owned invariant companion for `@deepseek-ai/dsh-cohub-account`. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-cohub-account'

export const name = 'cohub-account-invariant'
export const inject = ['invariants']

/** No runtime invariant: secret absence and async state transitions are enforced by the package suite. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
