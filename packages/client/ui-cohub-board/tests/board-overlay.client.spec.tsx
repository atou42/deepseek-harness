// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BoardOverlay, CohubBoardOverlayController, parseBoardManifest } from '../src/client/index.ts'

const boardId = '123e4567-e89b-12d3-a456-426614174000'
afterEach(cleanup)
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })
const t = ((key: string, params?: Record<string, unknown>) => {
  const labels: Record<string, string> = { title: 'Cohub Board', close: 'Close', spaces: 'Space', chooseSpace: 'Choose a Space', loading: 'Loading', empty: 'Empty', retry: 'Retry', back: 'Up', root: 'Root', boards: 'Board files', openBoard: 'Open {name}', nodes: '{count} nodes', connections: '{count} connections', unknownNode: 'Unknown node', error: 'Failed: {message}', refresh: 'Refresh', noSpaces: 'No Spaces', trigger: 'Cohub Board' }
  return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  })
}) as never

function remote(manifest = JSON.stringify({ kind: 'cohub.board.manifest', version: 1, boardId, title: 'Map' })) {
  return {
    listSpaces: vi.fn(() => ok([{ id: 'space-1', title: 'World' }])),
    listDirectory: vi.fn(() => ok({ spaceId: 'space-1', path: '', entries: [
      { path: 'archive', name: 'archive', kind: 'folder' as const, size: 0, revision: '1:0' },
      { path: 'map.board', name: 'map.board', kind: 'file' as const, size: 10, revision: '1:10' },
    ] })),
    readText: vi.fn(() => ok({ spaceId: 'space-1', path: 'map.board', content: manifest, revision: '1:10' })),
    getBoard: vi.fn(() => ok({
      board: { id: boardId, spaceId: 'space-1', title: 'Map', version: 1, metadata: {}, createdAt: null, updatedAt: null },
      nodes: [{ boardId, nodeId: 'n1', type: 'text', parentId: null, orderKey: null, x: 0, y: 0, width: 200, height: 80, rotation: 0, refKind: null, refPath: null, refUrl: null, view: {}, style: {}, data: { text: 'Opening scene' }, version: 1, createdAt: null, updatedAt: null }],
      connections: [],
    })),
  }
}

describe('Cohub Board overlay', () => {
  it('discovers a Board manifest and renders its real node snapshot', async () => {
    const controller = new CohubBoardOverlayController(); controller.open()
    const api = remote()
    const view = render(<BoardOverlay controller={controller} remote={api} t={t} />)
    await waitFor(() => { expect(view.getByRole('button', { name: 'Open map.board' })).toBeDefined() })
    fireEvent.click(view.getByRole('button', { name: 'Open map.board' }))
    await waitFor(() => { expect(view.container.querySelector(`[data-board-id="${boardId}"]`)).not.toBeNull() })
    expect(view.getByText('Opening scene')).toBeDefined()
    expect(api.getBoard).toHaveBeenCalledWith('space-1', boardId)
  })

  it('shows malformed manifests and does not inspect a guessed Board', async () => {
    const controller = new CohubBoardOverlayController(); controller.open()
    const api = remote('{bad')
    const view = render(<BoardOverlay controller={controller} remote={api} t={t} />)
    await waitFor(() => { expect(view.getByRole('button', { name: 'Open map.board' })).toBeDefined() })
    fireEvent.click(view.getByRole('button', { name: 'Open map.board' }))
    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('valid JSON') })
    expect(api.getBoard).not.toHaveBeenCalled()
  })

  it('validates manifests independently of Cohub implementation code', () => {
    expect(parseBoardManifest(JSON.stringify({ kind: 'cohub.board.manifest', version: 1, boardId, title: 'Map' }))).toEqual({ boardId, title: 'Map' })
    expect(() => parseBoardManifest(JSON.stringify({ kind: 'cohub.board.manifest', version: 2, boardId, title: 'Map' }))).toThrow(/unsupported/)
  })
})
