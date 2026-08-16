/** Real Loader composition for Cohub Account over a task-owned Harness home. */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import CohubAccountService from '../src/index.ts'

let harnessHome: string | undefined
let context: Context | undefined

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (harnessHome !== undefined) await rm(harnessHome, { recursive: true, force: true })
  harnessHome = undefined
  vi.unstubAllGlobals()
})

async function loadComposition(root: string): Promise<Context> {
  const credentialsPath = join(root, '.credentials.yaml')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: credentials',
    "  name: '@deepseek-ai/dsh-credentials-local'",
    '  config:',
    `    path: ${JSON.stringify(credentialsPath)}`,
    '    watch: false',
    '- id: cohub-account',
    "  name: '@deepseek-ai/dsh-cohub-account'",
    '  config:',
    "    clientId: 'client'",
    "    resource: 'resource'",
    "    scope: 'openid offline_access'",
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
    ['@deepseek-ai/dsh-cohub-account', CohubAccountService],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return ctx
}

describe('Cohub Account real composition', () => {
  it('logs in through Loader, persists only behind credentials, and restores after restart', async () => {
    harnessHome = await mkdtemp(join(tmpdir(), 'dsh-cohub-account-'))
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        device_code: 'private-device', user_code: 'CODE', verification_uri: 'https://auth.neta.art/activate',
        expires_in: 600, interval: 5,
      }))
      .mockResolvedValueOnce(json({
        token_type: 'Bearer', access_token: 'access-new', refresh_token: 'refresh-new', expires_in: 3600,
      }))
      .mockResolvedValueOnce(json({
        uuid: 'user-1', email: 'atou@example.test', profile: { username: 'atou', displayName: 'ATou' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await loadComposition(harnessHome)
    await first.cohubAccount.beginLogin()
    await first.cohubAccount.pollLogin()
    expect(await first.cohubAccount.getAccessToken()).toBe('access-new')
    expect(JSON.stringify(first.cohubAccount.snapshot.getSnapshot())).not.toMatch(/private-device|access-new|refresh-new/)
    const credentialsText = await readFile(join(harnessHome, '.credentials.yaml'), 'utf8')
    expect(credentialsText).toContain('COHUB_ACCOUNT_SESSION')
    expect(credentialsText).toContain('access-new')

    await first.fiber.dispose()
    context = undefined
    const restarted = await loadComposition(harnessHome)
    expect(restarted.cohubAccount.snapshot.getSnapshot()).toMatchObject({
      status: 'authenticated', profile: { userId: 'user-1', displayName: 'ATou' },
    })
    expect(await restarted.cohubAccount.getAccessToken()).toBe('access-new')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
