import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { IconCloseOutline16, IconFolderClose16, IconRefreshOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CohubBoardSnapshot, CohubSpaceDirectory, CohubSpaceTextFile, CohubSpaceView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { CohubBoardOverlayController } from './controller.ts'
import css from './CohubBoard.module.css'

type RemoteAnswer<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

export interface CohubBoardRemoteApi {
  listSpaces(): Promise<RemoteAnswer<readonly CohubSpaceView[]>>
  listDirectory(spaceId: string, path: string): Promise<RemoteAnswer<CohubSpaceDirectory>>
  readText(spaceId: string, path: string): Promise<RemoteAnswer<CohubSpaceTextFile>>
  getBoard(spaceId: string, boardId: string): Promise<RemoteAnswer<CohubBoardSnapshot>>
}

export interface BoardOverlayInjected { readonly controller: CohubBoardOverlayController; readonly remote: CohubBoardRemoteApi }
export type BoardOverlayProps = PropsLocale<'cohubBoard'> & BoardOverlayInjected

type LoadState<T> = { status: 'idle' | 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string }

function unwrap<T>(method: string, answer: RemoteAnswer<T>): T {
  if (answer.ok) return answer.value
  throw new Error(`${method}: ${answer.error.code}: ${answer.error.message}`)
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export function parseBoardManifest(content: string): { readonly boardId: string; readonly title: string } {
  let value: unknown
  try { value = JSON.parse(content) } catch (error) { throw new TypeError('Board manifest is not valid JSON', { cause: error }) }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Board manifest must be an object')
  const item = value as Record<string, unknown>
  if (item.kind !== 'cohub.board.manifest' || item.version !== 1 || typeof item.boardId !== 'string' || typeof item.title !== 'string' || !item.title.trim()) {
    throw new TypeError('Board manifest is unsupported or malformed')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.boardId)) {
    throw new TypeError('Board manifest boardId must be a UUID')
  }
  return Object.freeze({ boardId: item.boardId, title: item.title })
}

function parent(path: string): string { const at = path.lastIndexOf('/'); return at < 0 ? '' : path.slice(0, at) }
function publicUrl(value: string | null): string | undefined {
  if (value === null) return undefined
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined } catch { return undefined }
}
function text(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value : undefined }

function BoardCanvas({ snapshot, t }: { snapshot: CohubBoardSnapshot; t: BoardOverlayProps['t'] }) {
  const geometry = useMemo(() => {
    if (snapshot.nodes.length === 0) return { minX: 0, minY: 0, scale: 1 }
    const minX = Math.min(...snapshot.nodes.map(node => node.x))
    const minY = Math.min(...snapshot.nodes.map(node => node.y))
    const maxX = Math.max(...snapshot.nodes.map(node => node.x + node.width))
    const maxY = Math.max(...snapshot.nodes.map(node => node.y + node.height))
    return { minX, minY, scale: Math.min(1.5, 820 / Math.max(1, maxX - minX), 480 / Math.max(1, maxY - minY)) }
  }, [snapshot])
  const center = (id: string) => {
    const node = snapshot.nodes.find(item => item.nodeId === id)
    return node === undefined ? undefined : {
      x: 40 + (node.x - geometry.minX + node.width / 2) * geometry.scale,
      y: 40 + (node.y - geometry.minY + node.height / 2) * geometry.scale,
    }
  }
  return (
    <div className={css.canvas} data-board-id={snapshot.board.id}>
      <svg className={css.connections} aria-hidden="true">
        {snapshot.connections.map((connection) => {
          const source = center(connection.source.nodeId)
          const target = center(connection.target.nodeId)
          return source === undefined || target === undefined
            ? null
            : <line key={connection.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
        })}
      </svg>
      {snapshot.nodes.map((node) => {
        const image = node.type === 'image' ? publicUrl(node.refUrl) : undefined
        const label = text(node.data.text) ?? text(node.data.label) ?? text(node.view.title) ?? node.refPath ?? text(node.data.taskRunId) ?? t('unknownNode')
        return (
          <article
            key={node.nodeId}
            className={`${css.node} ${css[`node_${node.type}`] ?? ''}`}
            data-node-type={node.type}
            style={{ left: 40 + (node.x - geometry.minX) * geometry.scale, top: 40 + (node.y - geometry.minY) * geometry.scale, width: node.width * geometry.scale, height: node.height * geometry.scale, transform: `rotate(${String(node.rotation)}deg)` }}
          >
            {image === undefined ? <span>{label}</span> : <img src={image} alt={label} />}
          </article>
        )
      })}
    </div>
  )
}

export function BoardOverlay({ controller, remote, t }: BoardOverlayProps) {
  const overlay = useSyncExternalStore(controller.snapshot.subscribe, controller.snapshot.getSnapshot)
  const [spaces, setSpaces] = useState<LoadState<readonly CohubSpaceView[]>>({ status: 'idle' })
  const [spaceId, setSpaceId] = useState('')
  const [path, setPath] = useState('')
  const [directory, setDirectory] = useState<LoadState<CohubSpaceDirectory>>({ status: 'idle' })
  const [board, setBoard] = useState<LoadState<CohubBoardSnapshot>>({ status: 'idle' })
  const [boardPath, setBoardPath] = useState('')

  const loadSpaces = useCallback(() => {
    setSpaces({ status: 'loading' })
    void remote.listSpaces().then((answer) => {
      const value = unwrap('cohubSpaces.listSpaces', answer)
      setSpaces({ status: 'ready', value })
      const first = value[0]
      if (first !== undefined) setSpaceId(current => current || first.id)
    }, (error: unknown) => {
      setSpaces({ status: 'error', message: message(error) })
    }).catch((error: unknown) => {
      setSpaces({ status: 'error', message: message(error) })
    })
  }, [remote])

  useEffect(() => { if (overlay.open && spaces.status === 'idle') loadSpaces() }, [overlay.open, spaces.status, loadSpaces])
  useEffect(() => {
    if (!overlay.open || !spaceId) return
    let live = true
    setDirectory({ status: 'loading' })
    setBoard({ status: 'idle' })
    setBoardPath('')
    void remote.listDirectory(spaceId, path).then((answer) => {
      if (live) setDirectory({ status: 'ready', value: unwrap('cohubSpaces.listDirectory', answer) })
    }, (error: unknown) => {
      if (live) setDirectory({ status: 'error', message: message(error) })
    }).catch((error: unknown) => {
      if (live) setDirectory({ status: 'error', message: message(error) })
    })
    return () => { live = false }
  }, [overlay.open, remote, spaceId, path])

  if (!overlay.open) return null
  const openBoard = (boardPath: string): void => {
    if (!boardPath) return
    setBoardPath(boardPath)
    setBoard({ status: 'loading' })
    void remote.readText(spaceId, boardPath).then((answer) => {
      const manifest = parseBoardManifest(unwrap('cohubSpaces.readText', answer).content)
      return remote.getBoard(spaceId, manifest.boardId)
    }).then((answer) => {
      setBoard({ status: 'ready', value: unwrap('cohubBoard.getBoard', answer) })
    }, (error: unknown) => {
      setBoard({ status: 'error', message: message(error) })
    }).catch((error: unknown) => {
      setBoard({ status: 'error', message: message(error) })
    })
  }
  const entries = directory.status === 'ready' ? directory.value.entries : []
  const boardFiles = entries.filter(entry => entry.kind === 'file' && entry.name.toLowerCase().endsWith('.board'))
  return (
    <div className={css.overlay} role="dialog" aria-modal="true" aria-label={t('title')}>
      <button type="button" className={css.mask} aria-label={t('close')} onClick={controller.close} />
      <section className={css.panel}>
        <header className={css.header}>
          <div><h2>{board.status === 'ready' ? board.value.board.title : t('title')}</h2>{board.status === 'ready' && <p>{t('nodes', { count: board.value.nodes.length })} · {t('connections', { count: board.value.connections.length })}</p>}</div>
          <button type="button" className={css.iconButton} aria-label={t('close')} onClick={controller.close}><IconCloseOutline16 /></button>
        </header>
        <div className={css.body}>
          <aside className={css.browser}>
            <label>{t('spaces')}<select value={spaceId} onChange={(event) => { setSpaceId(event.target.value); setPath('') }} disabled={spaces.status !== 'ready'}><option value="">{t('chooseSpace')}</option>{spaces.status === 'ready' && spaces.value.map(space => <option key={space.id} value={space.id}>{space.title}</option>)}</select></label>
            {spaces.status === 'ready' && spaces.value.length === 0 && <p>{t('noSpaces')}</p>}
            {path && <button type="button" className={css.row} onClick={() =>{  setPath(parent(path)) }}>← {t('back')}</button>}
            <div className={css.path}>{path || t('root')}</div>
            {directory.status === 'loading' && <p role="status">{t('loading')}</p>}
            {directory.status === 'error' && <p role="alert">{t('error', { message: directory.message })}</p>}
            {entries.filter(entry => entry.kind === 'folder').map(entry => <button type="button" className={css.row} key={entry.path} onClick={() =>{  setPath(entry.path) }}><IconFolderClose16 /> {entry.name}</button>)}
            {boardFiles.map(entry => <button type="button" className={`${css.row} ${css.boardFile}`} key={entry.path} aria-label={t('openBoard', { name: entry.name })} onClick={() =>{  openBoard(entry.path) }}>▦ {entry.name}</button>)}
            {directory.status === 'ready' && boardFiles.length === 0 && entries.every(entry => entry.kind !== 'folder') && <p>{t('empty')}</p>}
          </aside>
          <main className={css.viewer}>
            {board.status === 'idle' && <div className={css.placeholder}>{t('boards')}</div>}
            {board.status === 'loading' && <div role="status">{t('loading')}</div>}
            {board.status === 'error' && <div role="alert">{t('error', { message: board.message })}</div>}
            {board.status === 'ready' && <><button type="button" className={css.refresh} aria-label={t('refresh')} onClick={() =>{  openBoard(boardPath) }}><IconRefreshOutline16 /></button><BoardCanvas snapshot={board.value} t={t} /></>}
          </main>
        </div>
      </section>
    </div>
  )
}
