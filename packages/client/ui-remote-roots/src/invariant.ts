/** Package ownership companion for the anonymous remote-root browser. */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-remote-roots'
export const name = 'client-ui-remote-roots-invariant'
export const inject = ['invariants']
/** No runtime invariant: rendering, cancellation, and disposal are enforced by the package suite. */
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
