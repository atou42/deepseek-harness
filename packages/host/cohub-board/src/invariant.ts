/** Package-owned invariant companion for `@deepseek-ai/dsh-cohub-board`. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-cohub-board'

export const name = 'cohub-board-invariant'
export const inject = ['invariants']

/** No runtime invariant: strict response validation and disposal are covered by the package suite. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
