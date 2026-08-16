import { spawnSync } from 'node:child_process'

const targets = [
  'packages/generation/cohub-generation/tests',
  'packages/identity/cohub-account/tests',
  'packages/host/cohub-board/tests',
  'packages/host/cohub-spaces/tests',
  'packages/llm/llm-cohub/tests',
  'packages/client/remote-roots/tests',
  'packages/client/cohub-spaces/tests',
  'packages/client/ui-cohub-account/tests',
  'packages/client/ui-cohub-board/tests',
  'packages/client/ui-remote-roots/tests',
  'packages/client/ui-workspace/tests/apply.client.spec.ts',
]
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...targets, '--reporter=json'], {
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1' },
})
if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.stderr.write(result.stdout)
  process.exit(result.status ?? 1)
}
const report = JSON.parse(result.stdout)
const passed = report.numPassedTests
if (!Number.isSafeInteger(passed)) throw new TypeError('goal verifier: Vitest did not report an integer pass count')
if (process.argv.includes('--metric-only')) process.stdout.write(`${passed}\n`)
else process.stdout.write(`DSH-Cohub acceptance checks passed: ${passed}\n`)
