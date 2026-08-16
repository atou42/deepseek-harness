import { useEffect, useRef, useState } from 'react'
import {
  IconChevronDownOutline14, IconChevronRightOutline14, IconFolderClose16, IconFolderOpen16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  RemoteDirectoryListing, RemoteResourceEntry, RemoteResourceId, RemoteRootSourceId, RemoteRootView,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import type { RemoteRootTreeProps } from './contract.ts'
import css from './RemoteRootTree.module.css'

type Translate = RemoteRootTreeProps['t']
type ListingState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: RemoteDirectoryListing }
  | { readonly status: 'error'; readonly message: string }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function LeafRow({ entry, depth, t }: { entry: RemoteResourceEntry; depth: number; t: Translate }) {
  return (
    <div
      className={css.row}
      role="treeitem"
      aria-label={t(entry.kind === 'link' ? 'link' : 'file', { name: entry.name })}
      style={{ paddingInlineStart: `${8 + depth * 16}px` }}
      data-remote-resource-id={entry.id}
    >
      <span className={css.chevronSpacer} />
      <span className={css.fileIcon} aria-hidden="true" />
      <span className={css.name}>{entry.name}</span>
    </div>
  )
}

interface FolderProps {
  readonly sourceId: RemoteRootSourceId
  readonly rootId: RemoteResourceId
  readonly id: RemoteResourceId
  readonly name: string
  readonly marker?: RemoteRootView['marker']
  readonly depth: number
  readonly list: RemoteRootTreeProps['list']
  readonly t: Translate
}

function Folder({ sourceId, rootId, id, name, marker, depth, list, t }: FolderProps) {
  const [open, setOpen] = useState(false)
  const [listing, setListing] = useState<ListingState>({ status: 'idle' })
  const request = useRef<{ controller: AbortController; generation: number }>()
  const generation = useRef(0)

  const load = (): void => {
    request.current?.controller.abort()
    const controller = new AbortController()
    const current = ++generation.current
    request.current = { controller, generation: current }
    setListing({ status: 'loading' })
    void list(sourceId, { rootId, parentId: id, signal: controller.signal }).then(
      (value) => {
        if (controller.signal.aborted || generation.current !== current) return
        request.current = undefined
        setListing({ status: 'ready', value })
      },
      (error: unknown) => {
        if (controller.signal.aborted || generation.current !== current) return
        request.current = undefined
        setListing({ status: 'error', message: errorMessage(error) })
      },
    )
  }

  useEffect(() => () => {
    generation.current++
    request.current?.controller.abort()
  }, [])

  const toggle = (): void => {
    if (open) {
      setOpen(false)
      if (listing.status === 'loading') {
        generation.current++
        request.current?.controller.abort()
        request.current = undefined
        setListing({ status: 'idle' })
      }
      return
    }
    setOpen(true)
    if (listing.status === 'idle' || listing.status === 'error') load()
  }

  return (
    <div role="none" data-remote-root={marker === undefined ? undefined : id}>
      <button
        type="button"
        role="treeitem"
        aria-expanded={open}
        aria-label={t(open ? 'collapse' : 'expand', { name })}
        className={css.row}
        style={{ paddingInlineStart: `${8 + depth * 16}px` }}
        onClick={toggle}
      >
        {open ? <IconChevronDownOutline14 size={12} /> : <IconChevronRightOutline14 size={12} />}
        {open ? <IconFolderOpen16 size={16} /> : <IconFolderClose16 size={16} />}
        <span className={css.name}>{name}</span>
        {marker !== undefined && (
          <span className={css.marker} data-marker-kind={marker.kind}>{marker.label}</span>
        )}
      </button>
      {open && (
        <div role="group">
          {listing.status === 'loading' && <div className={css.status} role="status">{t('folder.loading')}</div>}
          {listing.status === 'error' && (
            <div className={css.error} role="alert">
              <span>{t('folder.error', { message: listing.message })}</span>
              <button type="button" className={css.retry} onClick={load}>{t('retry')}</button>
            </div>
          )}
          {listing.status === 'ready' && listing.value.entries.length === 0 && (
            <div className={css.status}>{t('folder.empty')}</div>
          )}
          {listing.status === 'ready' && listing.value.entries.map(entry => entry.kind === 'folder'
            ? (
              <Folder
                key={entry.id}
                sourceId={sourceId}
                rootId={rootId}
                id={entry.id}
                name={entry.name}
                depth={depth + 1}
                list={list}
                t={t}
              />
            )
            : <LeafRow key={entry.id} entry={entry} depth={depth + 1} t={t} />)}
        </div>
      )}
    </div>
  )
}

export function RemoteRootTree({ useRemoteRoots, list, t }: RemoteRootTreeProps) {
  const sources = useRemoteRoots(snapshot => snapshot.sources)
  if (sources.length === 0) return null
  return (
    <section className={css.root} aria-label={t('section')}>
      <div className={css.heading}>{t('section')}</div>
      <div role="tree" aria-label={t('tree.aria')}>
        {sources.map(source => (
          <div key={source.sourceId} role="none" data-remote-source={source.sourceId}>
            {source.status === 'loading' && <div className={css.status} role="status">{t('source.loading')}</div>}
            {source.status === 'authentication-required' && (
              <div className={css.status} role="status">{t('source.authenticationRequired', { provider: source.provider ?? '' })}</div>
            )}
            {source.status === 'error' && (
              <div className={css.error} role="alert">{t('source.error', { message: source.message ?? '' })}</div>
            )}
            {source.status === 'ready' && source.roots.map(root => (
              <Folder
                key={root.id}
                sourceId={source.sourceId}
                rootId={root.id}
                id={root.id}
                name={root.title}
                marker={root.marker}
                depth={0}
                list={list}
                t={t}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
