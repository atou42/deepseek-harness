/** Package-owned invariant companion for `@deepseek-ai/dsh-client-cohub-spaces`. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-cohub-spaces'

export const name = 'client-cohub-spaces-invariant'
export const inject = ['invariants']

/** No runtime invariant: mapping, refresh fencing, aborts, and disposal are enforced by the package suite. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
