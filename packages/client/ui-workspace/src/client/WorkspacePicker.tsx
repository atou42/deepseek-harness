/**
 * Workspace pick/add flow. WorkspacePickFlow is the reusable core (menu +
 * path error dialog) consumed directly by WorkspaceBrowser (same package) and
 * wrapped by WorkspacePicker for the conversation empty-state slot
 * registration. Directory picking itself lives in the composed flow package's
 * slot occupant (see the contract module doc): this core only opens the flow,
 * adopts the picked path, and owns the error surface. Adding a workspace has
 * exactly one route — pick a host directory, new or existing — because the
 * occupant's own create-folder affordance already covers creating one.
 */
import type { ReactNode, RefObject } from 'react'
import { useCallback, useEffect, useState } from 'react'
import {
  Button, IconFolderClose16, IconPlusOutline16, IconSearchOutline16, Input, Menu, Modal, type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import type {
  RemoteResourceId, RemoteRootSourceId, RemoteRootsSnapshot,
} from '@deepseek-ai/dsh-client-remote-roots/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { DirectoryFlowOwnerProps, WorkspacePickerProps } from './contract/slots.ts'
import css from './WorkspacePicker.module.css'

const ADD_WORKSPACE = '::add-workspace'
const NO_SEARCH_RESULTS = '::no-search-results'

function searchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

/** Core flow props: the owner supplies popover control and pick semantics. */
export interface WorkspacePickFlowProps {
  /** The standard locale seat, forwarded by whichever slot entry hosts the flow. */
  t: WorkspacePickerProps['t']
  /** Popover visibility (anchor button toggle state, owner-local). */
  open: boolean
  /** The anchor button element — the popover's placement anchor. */
  anchorRef?: RefObject<HTMLElement | null> | undefined
  /** Selector hook over the workspace list (framework standard hook). */
  useWorkspaces: <S>(selector: (state: WorkspaceListState) => S) => S
  /** Selector hook over provider-owned remote Spaces. */
  useRemoteRoots: SnapshotSelectorHook<RemoteRootsSnapshot>
  /** Start a local DSH Session with the selected provider-owned Space attached. */
  startRemoteWorkspace: (sourceId: RemoteRootSourceId, rootId: RemoteResourceId) => Promise<void>
  /** Open a provider-owned cloud Session in the selected Space. */
  openRemoteConversation: (sourceId: RemoteRootSourceId, rootId: RemoteResourceId) => Promise<void>
  /** Adopt a picked host directory as a real Workspace. */
  createWorkspace: (input: { path: string }) => Promise<WorkspaceView>
  /** Bound occupancy selector hook for this surface's directory-flow hole (empty leaves the surface with no add action). */
  useDirectoryFlow: SnapshotSelectorHook<boolean>
  /** Render this surface's directory-flow hole with the owner conversation (the entry's narrowed renderSlot). */
  renderDirectoryFlow: (owner: DirectoryFlowOwnerProps) => ReactNode
  /** A real Workspace was picked or created. */
  onPick: (workspaceId: WorkspaceId) => void
  /** Close the popover (outside click / Escape / post-pick). */
  onClose: () => void
  /** Only offer the add action, hide existing workspaces. */
  addOnly?: boolean
  /** Menu opening direction relative to the anchor. */
  side?: 'bottom' | 'top' | 'right'
  /** Currently active workspace (trailing check in the picker list). */
  selectedId?: WorkspaceId | undefined
}

/**
 * Render the pick menu plus the adoption error dialog.
 * @param props - owner-controlled flow props.
 * @returns menu + dialog elements.
 */
export function WorkspacePickFlow({
  t,
  open,
  anchorRef,
  useWorkspaces,
  useRemoteRoots,
  startRemoteWorkspace,
  openRemoteConversation,
  createWorkspace,
  useDirectoryFlow,
  renderDirectoryFlow,
  onPick,
  onClose,
  addOnly = false,
  side = 'bottom',
  selectedId,
}: WorkspacePickFlowProps) {
  const workspaceSnapshot = useWorkspaces(state => state)
  const remoteSnapshot = useRemoteRoots(state => state)
  const workspaces = workspaceSnapshot.items
  const remoteEntries = addOnly ? [] : remoteSnapshot.sources.flatMap(source => source.status === 'ready'
    ? source.roots.flatMap(root => [
      ...root.capabilities.conversation === 'interactive' ? [{
        id: JSON.stringify(['remote', 'conversation', source.sourceId, root.id]),
        sourceId: source.sourceId,
        rootId: root.id,
        mode: 'conversation' as const,
        label: `${root.title} · ${t('picker.mode.cohub')} · ${t('picker.location.cloud')}`,
      }] : [],
      ...root.capabilities.workspace === true ? [{
        id: JSON.stringify(['remote', 'workspace', source.sourceId, root.id]),
        sourceId: source.sourceId,
        rootId: root.id,
        mode: 'workspace' as const,
        label: `${root.title} · ${t('picker.mode.dsh')} · ${t('picker.location.local')}`,
      }] : [],
    ])
    : [])
  const remoteByMenuId = new Map(remoteEntries.map(entry => [entry.id, entry]))
  const getAnchorRect = useCallback(
    () => anchorRef?.current?.getBoundingClientRect() ?? null,
    [anchorRef],
  )
  const [errorOpen, setErrorOpen] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [flowOpen, setFlowOpen] = useState(false)
  const [pickingFolder, setPickingFolder] = useState(false)
  const [activatingRemote, setActivatingRemote] = useState(false)
  const [query, setQuery] = useState('')
  // One picking interaction at a time: while the flow is open (native chooser
  // pending, browse dialog up) or its pick is being adopted, every other
  // menu action stays disabled — a late outcome must not race a concurrent
  // selection or adoption.
  const flowBusy = flowOpen || pickingFolder || activatingRemote

  // The occupied hole gates the picking affordance: with no composed flow the
  // entry simply is not there (the seam's documented no-flow default). The
  // framework-bound hook keeps occupancy live: flow plugins activate (and
  // HMR-reload) independently of this menu's renders.
  const flowAvailable = useDirectoryFlow(occupied => occupied)
  // An occupant that unloads mid-interaction leaves nobody to cancel: an
  // open flow over an empty hole withdraws so the menu actions come back.
  // flowOpen is a dependency because the flow can also OPEN over an already
  // empty hole (Choose again after the occupant unloaded with the error
  // dialog up) — that transition must snap back too, not just occupancy loss.
  useEffect(() => {
    if (flowOpen && !flowAvailable) setFlowOpen(false)
  }, [flowOpen, flowAvailable])
  const addEntries: MenuEntry[] = flowAvailable
    ? [{ id: ADD_WORKSPACE, label: t('menu.addWorkspace'), icon: <IconPlusOutline16 size={16} />, disabled: flowBusy }]
    : []
  // With workspaces listed, the add action pins below the scroll region
  // (divider + always visible); otherwise it IS the menu.
  const pinAdd = !addOnly && (workspaces.length > 0 || remoteEntries.length > 0)
  const normalizedQuery = searchText(query.trim())
  const workspaceEntries = workspaces.map(workspace => ({
    id: workspace.workspaceId,
    label: workspace.title,
    searchText: searchText(workspace.title),
  }))
  const filteredWorkspaces = normalizedQuery.length === 0
    ? workspaceEntries
    : workspaceEntries.filter(entry => entry.searchText.includes(normalizedQuery))
  const filteredRemotes = normalizedQuery.length === 0
    ? remoteEntries
    : remoteEntries.filter(entry => searchText(entry.label).includes(normalizedQuery))
  const filteredEntries: MenuEntry[] = [...filteredWorkspaces.map(workspace => ({
    id: workspace.id,
    label: workspace.label,
    icon: <IconFolderClose16 size={16} />,
    disabled: flowBusy,
  })), ...filteredRemotes.map(entry => ({
    id: entry.id,
    label: entry.label,
    icon: <IconFolderClose16 size={16} />,
    disabled: flowBusy,
  }))]
  const items: MenuEntry[] = pinAdd
    ? filteredEntries.length > 0 || normalizedQuery.length === 0
      ? filteredEntries
      : [{ type: 'label', id: NO_SEARCH_RESULTS, text: t('picker.search.empty') }]
    : addEntries
  // Nothing listed and nothing to add with (a composition that mounts this
  // package without any directory-picker): an empty popover would claim a
  // choice that does not exist, so the anchor gesture shows nothing at all.
  const menuIsEmpty = items.length === 0

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const closeModal = (): void => {
    setErrorOpen(false)
    setModalError(null)
  }

  /** Adopt a picked directory; failures land in the folder-error dialog (Choose again reopens the flow). */
  const adoptDirectory = (path: string): Promise<void> =>
    createWorkspace({ path }).then((workspace) => {
      setFlowOpen(false)
      onPick(workspace.workspaceId)
    }).catch((reason: unknown) => {
      setModalError(reason instanceof Error ? reason.message : String(reason))
      setFlowOpen(false)
      setErrorOpen(true)
    })

  const openDirectoryFlow = useCallback((): void => {
    onClose()
    setErrorOpen(false)
    setModalError(null)
    setFlowOpen(true)
  }, [onClose])

  // A menu exists to disambiguate between targets. With no workspaces listed
  // and the add action the only entry left, the anchor gesture IS that action:
  // a one-row popover would cost a click and offer nothing to choose between.
  // The owner's open request is consumed the same way selecting the entry
  // would consume it (close the popover, raise the flow). An empty list is
  // only final once the baseline lands — until then the menu stays up with its
  // loading status instead of jumping into a flow the arriving list would have
  // made unnecessary; the add-only surface lists nothing and never waits.
  const remoteSettled = remoteSnapshot.sources.every(source => source.status !== 'loading')
  const listSettled = addOnly || (workspaceSnapshot.phase === 'ready' && remoteSettled)
  const addIsTheOnlyEntry = !pinAdd && listSettled && addEntries.length === 1
  // `flowBusy` gates this exactly as it disables the equivalent menu entry: a
  // pick still being adopted owns the surface until it settles.
  useEffect(() => {
    if (open && addIsTheOnlyEntry && !flowBusy) openDirectoryFlow()
  }, [open, addIsTheOnlyEntry, flowBusy, openDirectoryFlow])

  /** Owner side of the flow conversation: adopt keeps the flow open (busy) until the Host answers. */
  const flowOwner: DirectoryFlowOwnerProps = {
    open: flowOpen,
    busy: pickingFolder,
    onPicked: (path) => {
      setPickingFolder(true)
      void adoptDirectory(path).finally(() => { setPickingFolder(false) })
    },
    onCancel: () => { setFlowOpen(false) },
    onError: (message) => {
      setFlowOpen(false)
      setModalError(message)
      setErrorOpen(true)
    },
  }

  const handleSelect = (id: string): void => {
    if (id === ADD_WORKSPACE) {
      openDirectoryFlow()
      return
    }
    const remote = remoteByMenuId.get(id)
    if (remote !== undefined) {
      setActivatingRemote(true)
      const operation = remote.mode === 'conversation' ? openRemoteConversation : startRemoteWorkspace
      void operation(remote.sourceId, remote.rootId).then(() => {
        onClose()
      }, (reason: unknown) => {
        setModalError(reason instanceof Error ? reason.message : String(reason))
        setErrorOpen(true)
      }).finally(() => { setActivatingRemote(false) })
      return
    }
    onPick(id as WorkspaceId)
  }

  const selectedRemoteId = remoteSnapshot.active === undefined
    ? undefined
    : JSON.stringify(['remote', 'conversation', remoteSnapshot.active.sourceId, remoteSnapshot.active.rootId])

  return (
    <>
      <Menu
        open={open && !addIsTheOnlyEntry && !menuIsEmpty}
        anchor={null}
        items={items}
        {...!addOnly && pinAdd ? {
          header: (
            <Input
              className={css.pickerSearch ?? ''}
              type="search"
              value={query}
              icon={<IconSearchOutline16 size={16} />}
              aria-label={t('picker.search.aria')}
              placeholder={t('picker.search.placeholder')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
            />
          ),
        } : {}}
        {...pinAdd ? { footer: addEntries } : {}}
        selectedId={selectedRemoteId ?? selectedId}
        onSelect={handleSelect}
        onClose={onClose}
        side={side}
        portal
        getAnchorRect={getAnchorRect}
      />
      {open && !addIsTheOnlyEntry && !menuIsEmpty && !listSettled && <div className={css.menuStatus} role="status">{t('picker.loading')}</div>}
      {renderDirectoryFlow(flowOwner)}
      <Modal
        open={errorOpen}
        onClose={closeModal}
        closeLabel={t('close')}
        title={t('folderError.title')}
        footer={(
          <>
            <Button variant="outline" className={css.modalAction} onClick={closeModal}>{t('cancel')}</Button>
            {/* Retrying needs an occupant to serve the flow; without one the
              * button would open a flow nobody can answer or cancel. */}
            <Button variant="primary" className={css.modalAction} disabled={!flowAvailable} onClick={openDirectoryFlow}>{t('folderError.retry')}</Button>
          </>
        )}
      >
        <div className={css.modalError} role="alert">{modalError}</div>
      </Modal>
    </>
  )
}

/**
 * The conversation empty-state registration: adapts the owner share to the
 * core flow (all state and semantics live in the flow / the owner).
 * @param props - empty-state slot props (owner share + injected creation callback).
 * @returns the flow element.
 */
export function WorkspacePicker({
  open,
  anchorRef,
  useWorkspaces,
  useRemoteRoots,
  startRemoteWorkspace,
  openRemoteConversation,
  selectedId,
  onPick,
  onClose,
  createWorkspace,
  useDirectoryFlow,
  renderSlot,
  t,
}: WorkspacePickerProps) {
  return (
    <WorkspacePickFlow
      t={t}
      open={open}
      anchorRef={anchorRef}
      useWorkspaces={useWorkspaces}
      useRemoteRoots={useRemoteRoots}
      startRemoteWorkspace={startRemoteWorkspace}
      openRemoteConversation={openRemoteConversation}
      createWorkspace={createWorkspace}
      useDirectoryFlow={useDirectoryFlow}
      renderDirectoryFlow={owner => renderSlot('conversation.hero.workspace.directoryFlow', owner)}
      selectedId={selectedId}
      onPick={onPick}
      onClose={onClose}
    />
  )
}
