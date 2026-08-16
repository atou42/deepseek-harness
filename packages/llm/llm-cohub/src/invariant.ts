/** Package-owned invariant companion for `@deepseek-ai/dsh-llm-cohub`. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-llm-cohub'

export const name = 'llm-cohub-invariant'
export const inject = ['invariants']

/** Wire validation, auth ownership, and lifecycle behavior are covered by the package suite. */
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
