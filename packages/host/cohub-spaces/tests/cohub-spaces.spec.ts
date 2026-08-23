import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import CohubSpacesGateway, {
  CohubSpaceFilePreparingError,
  CohubSpacesHttpError,
} from '../src/index.ts'

const contexts: Context[] = []

class TestAccount extends Service {
  private readonly listeners = new Set<() => void>()
  token = 'account-token'
  readonly snapshot = {
    getSnapshot: () => ({ revision: 1, status: 'authenticated' as const }),
    subscribe: (listener: () => void) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  constructor(ctx: Context) {
    super(ctx, 'cohubAccount')
  }

  getAccessToken(): Promise<string> {
    return Promise.resolve(this.token)
  }

  notify(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

class TestAgents extends Service {
  agent: Agent | undefined

  constructor(ctx: Context) {
    super(ctx, 'agents')
  }

  get(id: ReturnType<typeof SessionId>): Agent | undefined {
    return this.agent?.id === id ? this.agent : undefined
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function boot() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(TestAccount)
  await ctx.plugin(TestAgents)
  const fiber = ctx.plugin(CohubSpacesGateway, { apiBaseUrl: 'https://cohub.example.test/' })
  await fiber.await()
  return {
    ctx,
    fiber,
    account: ctx.get('cohubAccount') as unknown as TestAccount,
    agents: ctx.get('agents') as unknown as TestAgents,
    spaces: ctx.cohubSpaces,
  }
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

describe('CohubSpacesGateway', () => {
  it('exposes the Space, Session, and file Remote methods', async () => {
    const { spaces } = await boot()
    expect(spaces.typertRemote).toMatchObject({ serviceKey: 'cohubSpaces', namespace: 'cohubSpaces' })
    expect(remoteMethods(spaces)).toEqual([
      { method: 'listSpaces', invocation: { kind: 'direct' } },
      { method: 'listSessions', invocation: { kind: 'direct' } },
      { method: 'getConversation', invocation: { kind: 'direct' } },
      { method: 'sendPrompt', invocation: { kind: 'direct' } },
      { method: 'abortTurn', invocation: { kind: 'direct' } },
      { method: 'getDshSessionStart', invocation: { kind: 'direct' } },
      { method: 'bindDshSession', invocation: { kind: 'direct' } },
      { method: 'listDirectory', invocation: { kind: 'direct' } },
      { method: 'readText', invocation: { kind: 'direct' } },
      { method: 'writeText', invocation: { kind: 'direct' } },
    ])
  })

  it('resolves a Cohub Space to the configured local DSH working directory', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([{ id: 'space-1', title: 'deepseek harness' }])))
    const { spaces } = await boot()

    await expect(spaces.getDshSessionStart('space-1')).resolves.toEqual({
      spaceId: 'space-1', cwd: process.cwd(),
    })
  })

  it('lists every Session page for one Space without exposing files', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        sessions: [{
          id: 'session-1', spaceId: 'space-1', title: 'First conversation', status: 'active',
          latestMessageText: 'latest answer', updatedAt: '2026-08-16T10:00:00.000Z',
        }],
        pageInfo: { hasMore: true, nextCursor: 'cursor-2' },
      }))
      .mockResolvedValueOnce(json({
        sessions: [{
          id: 'session-2', spaceId: 'space-1', title: 'Second conversation', status: 'active',
          latestMessageText: null, updatedAt: '2026-08-16T09:00:00.000Z',
        }],
        pageInfo: { hasMore: false, nextCursor: null },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.listSessions('space-1')).resolves.toEqual({
      spaceId: 'space-1',
      sessions: [
        {
          id: 'session-1', spaceId: 'space-1', title: 'First conversation', status: 'active',
          latestMessageText: 'latest answer', updatedAt: '2026-08-16T10:00:00.000Z',
        },
        {
          id: 'session-2', spaceId: 'space-1', title: 'Second conversation', status: 'active',
          updatedAt: '2026-08-16T09:00:00.000Z',
        },
      ],
    })
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://cohub.example.test/api/spaces/space-1/sessions?limit=100',
      'https://cohub.example.test/api/spaces/space-1/sessions?limit=100&cursor=cursor-2',
    ])
  })

  it('preserves an untitled Cohub Session instead of rejecting the whole Space', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      sessions: [{
        id: '18c0d6a5-0079-47e4-8808-9c384b5d3b4b', spaceId: 'space-1', title: '', status: 'active',
        latestMessageText: 'latest answer', updatedAt: '2026-08-17T10:00:00.000Z',
      }],
      pageInfo: { hasMore: false, nextCursor: null },
    })))
    const { spaces } = await boot()

    await expect(spaces.listSessions('space-1')).resolves.toMatchObject({
      sessions: [{ id: '18c0d6a5-0079-47e4-8808-9c384b5d3b4b', title: '' }],
    })
  })

  it('projects a null Cohub Session title as untitled without rejecting the whole Space', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({
      sessions: [{
        id: '62d0f404-a005-423a-811c-f58333415f03', spaceId: 'space-1', title: null, status: 'active',
        latestMessageText: null, updatedAt: '2026-08-23T10:00:00.000Z',
      }],
      pageInfo: { hasMore: false, nextCursor: null },
    })))
    const { spaces } = await boot()

    await expect(spaces.listSessions('space-1')).resolves.toMatchObject({
      sessions: [{ id: '62d0f404-a005-423a-811c-f58333415f03', title: '' }],
    })
  })

  it('gives every local DSH Agent @-reference tools that require an explicit Cohub Space id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ path: '', entries: [] })))
    const { ctx, agents } = await boot()
    const tools: { name: string; execute(args: unknown, exec: { signal: AbortSignal }): Promise<unknown> }[] = []
    const sections: unknown[] = []
    const agent = {
      id: SessionId('local-session-1'),
      session: { events: [] },
      ctx: {
        systemPrompt: { section: vi.fn((section: unknown) => { sections.push(section); return vi.fn() }) },
        tools: { register: vi.fn((tool: typeof tools[number]) => { tools.push(tool); return vi.fn() }) },
      },
      inject: vi.fn(),
    } as unknown as Agent
    agents.agent = agent

    ctx.emit('agent/created', { agent })

    expect(tools.map(tool => tool.name)).toEqual([
      'cohub_space_list', 'cohub_space_read', 'cohub_space_write', 'cohub_space_run',
    ])
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ name: 'cohub-space-references' })
    expect((sections[0] as { text: string }).text).toContain('@Cohub Space')
    await expect(tools[0]!.execute({}, { signal: new AbortController().signal }))
      .rejects.toThrow('space_id is required')
    await expect(tools[0]!.execute({ space_id: 'space-1' }, { signal: new AbortController().signal }))
      .resolves.toEqual({ spaceId: 'space-1', path: '', entries: [] })
  })

  it('binds Cohub tools and context onto the existing DSH Agent without calling Cohub Agent', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([{ id: 'space-1', title: 'deepseek harness' }]))
      .mockResolvedValueOnce(json({
        path: '',
        entries: [{ name: 'README.md', path: 'README.md', type: 'file', size: 12, mtimeMs: 10 }],
      }))
      .mockResolvedValueOnce(json({ taskRunId: 'task-1' }))
      .mockResolvedValueOnce(json({ run: { status: 'completed', result: {
        output: 'cloud-ok\n', durationMs: 25, truncated: false, exitCode: 0,
        termination: { reason: 'exited', exitCode: 0 },
      } } }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces, agents } = await boot()
    const tools: { name: string; execute(args: unknown, exec: { signal: AbortSignal }): Promise<unknown> }[] = []
    const sections: unknown[] = []
    const inject = vi.fn()
    agents.agent = {
      id: SessionId('dsh-session-1'),
      session: { events: [] },
      ctx: {
        systemPrompt: { section: vi.fn((section: unknown) => { sections.push(section); return vi.fn() }) },
        tools: { register: vi.fn((tool: typeof tools[number]) => { tools.push(tool); return vi.fn() }) },
      },
      inject,
    } as unknown as Agent

    await expect(spaces.bindDshSession('space-1', 'dsh-session-1')).resolves.toEqual({
      spaceId: 'space-1', spaceTitle: 'deepseek harness', dshSessionId: 'dsh-session-1',
    })
    expect(sections).toMatchObject([
      { name: 'cohub-space-references' },
      { name: 'cohub-space-workspace' },
    ])
    expect(tools.map(tool => tool.name)).toEqual([
      'cohub_space_list', 'cohub_space_read', 'cohub_space_write', 'cohub_space_run',
    ])
    expect(inject).toHaveBeenCalledOnce()
    const listed = await tools[0]!.execute({}, { signal: new AbortController().signal })
    expect(listed).toMatchObject({ entries: [{ path: 'README.md' }] })
    await expect(tools[3]!.execute({ command: 'pwd' }, { signal: new AbortController().signal })).resolves.toEqual({
      output: 'cloud-ok\n', durationMs: 25, truncated: false, exitCode: 0, termination: 'exited',
    })
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://cohub.example.test/api/spaces',
      'https://cohub.example.test/api/spaces/space-1/fs/tree',
      'https://cohub.example.test/api/spaces/space-1/commands',
      'https://cohub.example.test/api/tasks/task-1',
    ])
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/prompt'))).toBe(false)
  })

  it('loads a Cohub conversation without exposing a provider prompt route', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        session: { id: 'session-1', spaceId: 'space-1', title: 'Remote chat', status: 'active', updatedAt: '2026-08-16T10:00:01.000Z' },
        turns: [{
          id: 'turn-1', sessionId: 'session-1', sequence: 1, status: 'completed',
          userText: 'hello', assistantText: 'world', errorMessage: null,
          createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:01.000Z',
        }],
        hasMore: false,
        nextCursor: null,
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()
    const conversation = spaces as unknown as {
      getConversation(spaceId: string, sessionId: string): Promise<unknown>
    }

    await expect(conversation.getConversation('space-1', 'session-1')).resolves.toEqual({
      spaceId: 'space-1',
      session: { id: 'session-1', spaceId: 'space-1', title: 'Remote chat', status: 'active', updatedAt: '2026-08-16T10:00:01.000Z' },
      turns: [{
        id: 'turn-1', sessionId: 'session-1', sequence: 1, status: 'completed',
        userText: 'hello', assistantText: 'world',
        createdAt: '2026-08-16T10:00:00.000Z', updatedAt: '2026-08-16T10:00:01.000Z',
      }],
    })
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://cohub.example.test/api/sessions/session-1/turns?direction=older&limit=100',
    ])
  })

  it('submits a native Cohub Agent Turn without assembling a DSH prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      mode: 'immediate',
      session: {
        id: 'session-1', spaceId: 'space-1', title: null, status: 'active',
        latestMessageText: 'Ship the native mode', updatedAt: '2026-08-23T12:00:00.000Z',
      },
      turn: {
        id: 'turn-1', sessionId: 'session-1', sequence: 1, status: 'queued', intent: 'followup',
        userText: 'Ship the native mode', assistantText: null, errorMessage: null,
        createdAt: '2026-08-23T12:00:00.000Z', updatedAt: '2026-08-23T12:00:00.000Z',
      },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()
    const native = spaces as unknown as {
      sendPrompt(spaceId: string, sessionId: string | null, content: string, clientMessageId: string): Promise<unknown>
    }

    await expect(native.sendPrompt('space-1', null, 'Ship the native mode', 'message-1')).resolves.toEqual({
      spaceId: 'space-1',
      session: {
        id: 'session-1', spaceId: 'space-1', title: '', status: 'active',
        latestMessageText: 'Ship the native mode', updatedAt: '2026-08-23T12:00:00.000Z',
      },
      turn: {
        id: 'turn-1', sessionId: 'session-1', sequence: 1, status: 'queued',
        userText: 'Ship the native mode',
        createdAt: '2026-08-23T12:00:00.000Z', updatedAt: '2026-08-23T12:00:00.000Z',
      },
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cohub.example.test/api/spaces/space-1/prompt')
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      content: [{ type: 'text', text: 'Ship the native mode' }],
      clientMessageId: 'message-1',
      accessMode: 'full_access',
    })
  })

  it('verifies the Cohub Turn owner before aborting its native Agent run', async () => {
    const session = {
      id: 'session-1', spaceId: 'space-1', title: 'Native chat', status: 'active',
      updatedAt: '2026-08-23T12:00:01.000Z',
    }
    const turn = {
      id: 'turn-1', sessionId: 'session-1', sequence: 1, status: 'running', intent: 'followup',
      userText: 'Keep working', assistantText: null, errorMessage: null,
      createdAt: '2026-08-23T12:00:00.000Z', updatedAt: '2026-08-23T12:00:01.000Z',
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ session, turn }))
      .mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()
    const native = spaces as unknown as {
      abortTurn(spaceId: string, sessionId: string, turnId: string): Promise<unknown>
    }

    await expect(native.abortTurn('space-1', 'session-1', 'turn-1')).resolves.toEqual({
      ok: true, spaceId: 'space-1', sessionId: 'session-1', turnId: 'turn-1',
    })
    expect(fetchMock.mock.calls.map(call => [String(call[0]), (call[1] as RequestInit | undefined)?.method ?? 'GET'])).toEqual([
      ['https://cohub.example.test/api/sessions/session-1/turns/turn-1', 'GET'],
      ['https://cohub.example.test/api/sessions/session-1/abort', 'POST'],
    ])
    expect(JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string)).toEqual({ turnId: 'turn-1' })
  })

  it('lists accessible Spaces and preserves file, folder, and symlink kinds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json([
        { id: 'space-1', title: 'World Bible', name: null, slug: 'world-bible' },
        { id: 'space-2', title: null, name: 'Drafts', slug: 'drafts' },
      ]))
      .mockResolvedValueOnce(json({
        path: 'wiki',
        entries: [
          { name: 'characters', path: 'wiki/characters', type: 'dir', size: 0, mimeType: null, mtimeMs: 10 },
          { name: 'index.md', path: 'wiki/index.md', type: 'file', size: 12, mimeType: 'text/markdown', mtimeMs: 11 },
          { name: 'latest', path: 'wiki/latest', type: 'symlink', size: 8, mimeType: null, mtimeMs: 12 },
        ],
      }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.listSpaces()).resolves.toEqual([
      { id: 'space-1', title: 'World Bible' },
      { id: 'space-2', title: 'Drafts' },
    ])
    await expect(spaces.listDirectory('space/1', 'wiki')).resolves.toEqual({
      spaceId: 'space/1',
      path: 'wiki',
      entries: [
        { path: 'wiki/characters', name: 'characters', kind: 'folder', size: 0, revision: '10:0' },
        { path: 'wiki/index.md', name: 'index.md', kind: 'file', size: 12, revision: '11:12' },
        { path: 'wiki/latest', name: 'latest', kind: 'link', size: 8, revision: '12:8' },
      ],
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://cohub.example.test/api/spaces')
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://cohub.example.test/api/spaces/space%2F1/fs/tree?path=wiki',
    )
    expect(new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers).get('authorization'))
      .toBe('Bearer account-token')
  })

  it('preserves fractional millisecond mtimes in revisions and compare-and-set writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        path: '',
        entries: [
          { name: '.agents', path: '.agents', type: 'dir', size: 4096, mimeType: null, mtimeMs: 1786849956679.8323 },
        ],
      }))
      .mockResolvedValueOnce(json({
        path: 'notes.md', name: 'notes.md', size: 5, mimeType: 'text/markdown', mtimeMs: 1786849956680.125,
        kind: 'text', encoding: 'utf-8', content: 'hello', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ ok: true, path: 'notes.md', size: 4, mtimeMs: 1786849956681.5 }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.listDirectory('space-1', '')).resolves.toEqual({
      spaceId: 'space-1',
      path: '',
      entries: [
        { path: '.agents', name: '.agents', kind: 'folder', size: 4096, revision: '1786849956679.8323:4096' },
      ],
    })
    await expect(spaces.readText('space-1', 'notes.md')).resolves.toEqual({
      spaceId: 'space-1', path: 'notes.md', content: 'hello', revision: '1786849956680.125:5',
    })
    await expect(spaces.writeText('space-1', 'notes.md', 'next', '1786849956680.125:5')).resolves.toEqual({
      ok: true,
      value: { spaceId: 'space-1', path: 'notes.md', content: 'next', revision: '1786849956681.5:4' },
    })
    expect(JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string)).toEqual({
      path: 'notes.md', content: 'next', encoding: 'utf-8', expected: { mtimeMs: 1786849956680.125, size: 5 },
    })
  })

  it('reads inline text and converts stale writes into explicit conflicts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({
        path: 'wiki/index.md', name: 'index.md', size: 5, mimeType: 'text/markdown', mtimeMs: 20,
        kind: 'text', encoding: 'utf-8', content: 'hello', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ message: 'expected revision does not match' }, 409))
      .mockResolvedValueOnce(json({
        path: 'wiki/index.md', name: 'index.md', size: 7, mimeType: 'text/markdown', mtimeMs: 21,
        kind: 'text', encoding: 'utf-8', content: 'current', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ ok: true, path: 'wiki/index.md', size: 4, mtimeMs: 22 }))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.readText('space-1', 'wiki/index.md')).resolves.toEqual({
      spaceId: 'space-1', path: 'wiki/index.md', content: 'hello', revision: '20:5',
    })
    await expect(spaces.writeText('space-1', 'wiki/index.md', 'mine', '20:5')).resolves.toEqual({
      ok: false,
      error: {
        code: 'version-conflict',
        current: { spaceId: 'space-1', path: 'wiki/index.md', content: 'current', revision: '21:7' },
      },
    })
    await expect(spaces.writeText('space-1', 'wiki/index.md', 'next', '21:7')).resolves.toEqual({
      ok: true,
      value: { spaceId: 'space-1', path: 'wiki/index.md', content: 'next', revision: '22:4' },
    })
    expect(JSON.parse((fetchMock.mock.calls[1]?.[1] as RequestInit).body as string)).toEqual({
      path: 'wiki/index.md', content: 'mine', encoding: 'utf-8', expected: { mtimeMs: 20, size: 5 },
    })
  })

  it('fails explicitly on malformed paths, unavailable files, binary data, and API errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ path: 'asset.bin', retryAfterMs: 750 }))
      .mockResolvedValueOnce(json({
        path: 'asset.bin', name: 'asset.bin', size: 2, mimeType: 'application/octet-stream', mtimeMs: 3,
        kind: 'binary', encoding: 'base64', content: 'AAE=', delivery: 'inline',
      }))
      .mockResolvedValueOnce(json({ message: 'space forbidden' }, 403))
    vi.stubGlobal('fetch', fetchMock)
    const { spaces } = await boot()

    await expect(spaces.listDirectory('space-1', '../secret')).rejects.toThrow(/invalid segment/)
    await expect(spaces.readText('space-1', 'asset.bin')).rejects.toBeInstanceOf(CohubSpaceFilePreparingError)
    await expect(spaces.readText('space-1', 'asset.bin')).rejects.toThrow(/only inline UTF-8/)
    await expect(spaces.listSpaces()).rejects.toBeInstanceOf(CohubSpacesHttpError)
  })

  it('forwards account changes and aborts in-flight HTTP when unloaded', async () => {
    let requestSignal: AbortSignal | undefined
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal as AbortSignal
      requestSignal.addEventListener('abort', () => {
        reject(requestSignal?.reason instanceof Error ? requestSignal.reason : new Error('request aborted'))
      }, { once: true })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { ctx, fiber, account, spaces } = await boot()
    const changed = vi.fn()
    ctx.on('cohub-spaces/changed', changed)
    account.notify()
    expect(changed).toHaveBeenCalledTimes(1)

    const pending = spaces.listSpaces()
    await vi.waitFor(() => { expect(requestSignal).toBeInstanceOf(AbortSignal) })
    const disposed = fiber.dispose()
    await expect(pending).rejects.toThrow(/service disposed/)
    await disposed
    expect(requestSignal?.aborted).toBe(true)
    account.notify()
    expect(changed).toHaveBeenCalledTimes(1)
  })
})
