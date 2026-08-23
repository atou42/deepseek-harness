import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, vi } from 'vitest'
import {
  captureStableAria, compareOrRefreshGolden, launchWebScaffold,
  watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const MODE = webSnapshotMode()
const OVERLAY = fileURLToPath(new URL('./cohub-native-agent.overlay.yml', import.meta.url))
const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/cohub-native-agent', import.meta.url))
const PICKER_EXPECTED = join(SNAPSHOT_DIR, 'picker.expected.md')
const CONVERSATION_EXPECTED = join(SNAPSHOT_DIR, 'conversation.expected.md')
const NOW = '2026-08-23T12:00:00.000Z'

const session = {
  id: 'session-native', spaceId: 'space-1', title: 'Native cloud Session', status: 'active',
  latestMessageText: 'Run in cloud', updatedAt: NOW,
}
const queuedTurn = {
  id: 'turn-native', sessionId: session.id, sequence: 1, status: 'queued',
  userText: 'Run in cloud', assistantText: null, errorMessage: null,
  createdAt: NOW, updatedAt: NOW,
}
const completedTurn = {
  ...queuedTurn, status: 'completed', assistantText: 'This answer is persisted by Cohub.',
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const chunk of request) {
    if (typeof chunk === 'string') chunks.push(Buffer.from(chunk))
    else if (chunk instanceof Uint8Array) chunks.push(chunk)
    else throw new TypeError('native Cohub snapshot received a non-byte request body chunk')
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value))
}

describe('web e2e: native Cohub Agent Sessions', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let harnessHome: string
  let previousApiBaseUrl: string | undefined
  const promptRequests: unknown[] = []
  const authorizationHeaders: (string | undefined)[] = []
  const requestPaths: string[] = []
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    requestPaths.push(url.pathname)
    authorizationHeaders.push(request.headers.authorization)
    if (request.method === 'GET' && url.pathname === '/api/spaces') {
      json(response, [{ id: 'space-1', title: 'Native Space' }])
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/spaces/space-1/sessions') {
      json(response, { sessions: [session], pageInfo: { hasMore: false, nextCursor: null } })
      return
    }
    if (request.method === 'POST' && url.pathname === '/api/spaces/space-1/prompt') {
      void body(request).then((value) => {
        promptRequests.push(value)
        json(response, { mode: 'immediate', session, turn: queuedTurn })
      }, (error: unknown) => {
        json(response, { message: String(error) }, 400)
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/api/sessions/session-native/turns') {
      json(response, {
        session, turns: [completedTurn], hasMore: false,
      })
      return
    }
    json(response, { message: `unexpected ${request.method ?? 'UNKNOWN'} ${url.pathname}` }, 404)
  })
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as AddressInfo
    const apiBaseUrl = `http://127.0.0.1:${String(address.port)}`
    previousApiBaseUrl = process.env.DSH_COHUB_TEST_API_BASE_URL
    process.env.DSH_COHUB_TEST_API_BASE_URL = apiBaseUrl
    harnessHome = await mkdtemp(join(tmpdir(), 'dsh-cohub-native-web-'))
    await mkdir(harnessHome, { recursive: true, mode: 0o700 })
    const storedSession = JSON.stringify({
      schemaVersion: 1,
      issuer: 'https://auth.example.test',
      apiBaseUrl,
      clientId: 'web-snapshot',
      resource: 'https://api.example.test',
      scope: 'openid profile offline_access',
      accessToken: 'snapshot-access-token',
      refreshToken: 'snapshot-refresh-token',
      accessTokenExpiresAt: Date.now() + 3_600_000,
      profile: { userId: 'snapshot-user', displayName: 'Snapshot User' },
    })
    const credentialsPath = join(harnessHome, '.credentials.yaml')
    await writeFile(credentialsPath, `version: 1\nrefs:\n  COHUB_ACCOUNT_SESSION: ${JSON.stringify(storedSession)}\n`)
    await chmod(credentialsPath, 0o600)
    scaffold = await launchWebScaffold({ harnessHome, extraOverlayPath: OVERLAY })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await vi.waitFor(() => { expect(requestPaths).toContain('/api/spaces') }, { timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
    await new Promise<void>(resolve => server.close(() => { resolve() }))
    await rm(harnessHome, { recursive: true, force: true })
    if (previousApiBaseUrl === undefined) delete process.env.DSH_COHUB_TEST_API_BASE_URL
    else process.env.DSH_COHUB_TEST_API_BASE_URL = previousApiBaseUrl
  })

  it('chooses cloud execution explicitly and renders the Cohub-owned result', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-cohub-native-agent'))
    await page.getByRole('textbox', { name: 'Choose workspace' }).click()
    const menu = page.getByRole('menu')
    await menu.waitFor({ timeout: 15_000 })
    const picker = await captureStableAria(page, '[role="menu"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(PICKER_EXPECTED, picker, MODE)
    expect(picker).toContain('Native Space · Cohub')
    expect(picker).not.toContain('DSH Agent')

    await page.getByRole('menuitem', { name: 'Native Space · Cohub' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cohub conversation' })
    await dialog.waitFor({ timeout: 15_000 })
    await dialog.getByRole('textbox', { name: 'Send to Cohub Agent' }).fill('Run in cloud')
    await dialog.getByRole('button', { name: 'Send' }).click()
    await dialog.getByText('This answer is persisted by Cohub.').waitFor({ timeout: 15_000 })
    const conversation = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CONVERSATION_EXPECTED, conversation, MODE)
    expect(conversation).toContain('Cohub Agent · Cloud')
    expect(promptRequests).toHaveLength(1)
    expect(promptRequests[0]).toMatchObject({
      content: [{ type: 'text', text: 'Run in cloud' }],
      clientMessageId: expect.any(String) as string,
      accessMode: 'full_access',
    })
    expect(authorizationHeaders.filter(Boolean)).toEqual(
      expect.arrayContaining(['Bearer snapshot-access-token']),
    )
    expect(tripwire.warnings).toEqual([])
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('keeps its snapshot inventory closed', async () => {
    expect((await readdir(SNAPSHOT_DIR)).sort()).toEqual([
      'conversation.expected.md', 'picker.expected.md',
    ])
  })
})
