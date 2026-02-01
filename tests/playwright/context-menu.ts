import type { Locator, Page } from '@playwright/test'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'

type ContextMenuOptions = {
  menu?: Locator
  timeout?: number
}

type CloseContextMenuOptions = {
  menu?: Locator
  timeout?: number
}

export async function openContextMenu(
  page: Page,
  target: Locator,
  options: ContextMenuOptions = {},
): Promise<Locator> {
  // Default to the first visible menu role for MUI context menus.
  const menu = options.menu ?? page.getByRole('menu').first()
  // Use the shared menu timeout unless callers override it.
  const timeout = options.timeout ?? PLAYWRIGHT_TIMEOUTS.uiMenu
  // Ensure the target is in view before we compute coordinates.
  await target.scrollIntoViewIfNeeded()
  // Compute an anchor point so the menu has a stable position.
  const box = await target.boundingBox()
  // Default to a tiny offset when layout data is unavailable.
  const anchorX = box ? Math.round(box.x + box.width / 2) : 2
  // Match the center Y position for consistent popovers.
  const anchorY = box ? Math.round(box.y + box.height / 2) : 2
  // Shared wait helper so each trigger has the same timeout.
  const waitForMenu = async () => menu.waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false)

  // Fire a synthetic contextmenu event first to preserve anchor coords.
  await target.dispatchEvent('contextmenu', { clientX: anchorX, clientY: anchorY })
  if (await waitForMenu()) return menu

  // Fall back to a physical right-click in case events are ignored.
  await page.mouse.click(anchorX, anchorY, { button: 'right' })
  if (await waitForMenu()) return menu

  // Use a keyboard context-menu shortcut when pointer paths are blocked.
  await target.focus().catch(() => undefined)
  await page.keyboard.press('Shift+F10')
  if (await waitForMenu()) return menu

  // Force a right-click on the locator as a last-resort trigger.
  await target.click({ button: 'right', force: true })
  await menu.waitFor({ state: 'visible', timeout })
  return menu
}

export async function closeContextMenu(
  page: Page,
  options: CloseContextMenuOptions = {},
): Promise<void> {
  // Reuse the default menu role unless a caller passes a custom locator.
  const menu = options.menu ?? page.getByRole('menu').first()
  // Keep the close wait aligned with the shared menu timeout.
  const timeout = options.timeout ?? PLAYWRIGHT_TIMEOUTS.uiMenu
  // Bail early when no menu is currently visible.
  const isVisible = await menu.isVisible().catch(() => false)
  if (!isVisible) return
  // Click a neutral spot to encourage MUI to close the menu.
  await page.mouse.click(1, 1).catch(() => undefined)
  // Dispatch an Escape key event without relying on Playwright action timeouts.
  await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    document.dispatchEvent(event)
  }).catch(() => undefined)
  // Wait for the menu to disappear before continuing.
  await menu.waitFor({ state: 'hidden', timeout }).catch(() => undefined)
}
