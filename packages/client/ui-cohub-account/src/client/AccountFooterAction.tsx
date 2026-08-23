import { useSyncExternalStore } from 'react'
import { IconUserOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CohubAccountOverlayController } from './controller.ts'
import css from './CohubAccount.module.css'

export interface AccountFooterInjected { readonly controller: CohubAccountOverlayController }
export type AccountFooterProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'cohubAccount'> & AccountFooterInjected

export function AccountFooterAction({ wide, controller, t }: AccountFooterProps) {
  const state = useSyncExternalStore(controller.snapshot.subscribe, controller.snapshot.getSnapshot)
  return (
    <Tooltip label={t('trigger')} delayMs={500} disabled={wide}>
      <button type="button" className={`${css.trigger} ${wide ? '' : css.rail}`} aria-label={t('trigger')} aria-expanded={state.open} onClick={controller.open}>
        <IconUserOutline16 size={wide ? 16 : 18} />
        {wide && <span>{t('trigger')}</span>}
      </button>
    </Tooltip>
  )
}
