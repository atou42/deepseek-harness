export interface CohubAccountOverlaySnapshot { readonly open: boolean; readonly revision: number }

export class CohubAccountOverlayController {
  private current: CohubAccountOverlaySnapshot = Object.freeze({ open: false, revision: 0 })
  private readonly listeners = new Set<() => void>()

  readonly snapshot = {
    getSnapshot: (): CohubAccountOverlaySnapshot => this.current,
    subscribe: (listener: () => void): (() => void) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  open = (): void => { this.publish(true) }
  close = (): void => { this.publish(false) }

  private publish(open: boolean): void {
    if (this.current.open === open) return
    this.current = Object.freeze({ open, revision: this.current.revision + 1 })
    for (const listener of [...this.listeners]) listener()
  }
}
