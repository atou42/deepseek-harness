// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { hasClass, installAssembledBootEnv, mountAssembledApp } from './assembled-boot.ts'

installAssembledBootEnv()

it('opens the built sidebar as a dismissible overlay on a narrow viewport', async () => {
  vi.stubGlobal('innerWidth', 980)
  mountAssembledApp()

  fireEvent.click(await screen.findByRole('button', { name: 'Open sidebar' }, { timeout: 10_000 }))

  const frame = await waitFor(() => {
    const current = document.querySelector<HTMLElement>('[data-sidebar-overlay]')
    expect(current).not.toBeNull()
    return current!
  }, { timeout: 10_000 })
  expect(frame.style.gridTemplateColumns).toBe('56px minmax(0, 1fr) 0px')
  expect(screen.getByRole('tree', { name: 'Sessions' })).toBeTruthy()

  const mask = [...frame.children].find(child => hasClass(child, 'sidebarMask'))
  if (mask === undefined) throw new Error('narrow sidebar mask missing')
  fireEvent.click(mask)
  expect(frame.hasAttribute('data-sidebar-overlay')).toBe(false)
})
