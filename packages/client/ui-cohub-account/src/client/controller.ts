/** Observable visibility state for the Cohub account overlay. */
export interface CohubAccountOverlaySnapshot { readonly open: boolean; readonly revision: number }

/** Owns the independently loadable Cohub account overlay visibility. */
export class CohubAccountOverlayController {
  private current: CohubAccountOverlaySnapshot = Object.freeze({ open: false, revision: 0 })
  private readonly listeners = new Set<() => void>()

  /** Reference-stable source consumed by the slot renderer. */
  readonly snapshot = {
    getSnapshot: (): CohubAccountOverlaySnapshot => this.current,
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  /** Open the account overlay. */
  open = (): void => { this.publish(true) }
  /** Close the account overlay. */
  close = (): void => { this.publish(false) }

  private publish(open: boolean): void {
    if (this.current.open === open) return
    this.current = Object.freeze({ open, revision: this.current.revision + 1 })
    for (const listener of [...this.listeners]) listener()
  }
}
