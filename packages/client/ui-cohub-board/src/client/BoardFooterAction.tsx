import { useSyncExternalStore } from 'react'
import { IconFolderOpenOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CohubBoardOverlayController } from './controller.ts'
import css from './CohubBoard.module.css'

export interface BoardFooterInjected { readonly controller: CohubBoardOverlayController }
export type BoardFooterProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'cohubBoard'> & BoardFooterInjected

export function BoardFooterAction({ wide, controller, t }: BoardFooterProps) {
  const state = useSyncExternalStore(controller.snapshot.subscribe, controller.snapshot.getSnapshot)
  return (
    <Tooltip label={t('trigger')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={`${css.trigger} ${wide ? '' : css.rail}`}
        aria-label={t('trigger')}
        aria-expanded={state.open}
        onClick={controller.open}
      >
        <IconFolderOpenOutline16 size={wide ? 16 : 18} />
        {wide && <span>{t('trigger')}</span>}
      </button>
    </Tooltip>
  )
}
