/* eslint import/no-unused-modules: off */
import type { WebSocketRoute } from '@playwright/test'
import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { ensureGearInspectorMode } from './gear-inspector-mode'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SAMPLE_SMALL_SFC_PATH, SAMPLE_SMALL_DB_PATH } from './fixture-paths'
import { SFC_LOAD_INPUT_SELECTOR } from './ui-selectors'
import { warmupAppShell } from './app-warmup'
import { GEAR_INSPECTOR_SINGLE_SELECT_KEY } from '../../src/lib/constants'

// RSL Helper default WebSocket endpoint; provides the selection UI via gearSelectionEnabled.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Stable test-id for the global selection count chip in the bottom bar.
const SELECTION_COUNT_TESTID = 'gear-inspector-selection-count'

// Waits until at least `minCount` gear cards are present in the DOM.
const waitForGearCards = async (page: Parameters<typeof test>[0]['page'], minCount = 2) =>
  page.waitForFunction(
    (n: number) => document.querySelectorAll('[data-gear-inspector-grid-card="true"]').length >= n,
    minCount,
    { timeout: PLAYWRIGHT_TIMEOUTS.expectLong },
  )

// Returns the row IDs of the first `limit` visible gear cards in DOM order.
const getFirstCardIds = async (page: Parameters<typeof test>[0]['page'], limit = 2): Promise<number[]> =>
  page.evaluate((n: number) =>
    Array.from(document.querySelectorAll('[data-gear-inspector-grid-card="true"]'))
      .map((el) => Number(el.getAttribute('data-row-id')))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, n),
    limit,
  )

// Boots the app with a mocked WS endpoint, loads the small SFC+DB, and navigates to the
// Gear Inspector. Returns the row IDs of the first two visible cards.
const setupWithCards = async (page: Parameters<typeof test>[0]['page']): Promise<[number, number]> => {
  // Accept WebSocket connections from the app so gearSelectionEnabled stays true.
  await page.routeWebSocket(ENDPOINT_URL, (ws: WebSocketRoute) => {
    ws.onMessage(() => { /* discard outbound requests */ })
  })
  await prepareApp(page)
  // Navigate with the endpoint param so the app shows the selection bottom bar.
  await page.goto(`/?endpoint=${ENDPOINT_URL}`, APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)

  // Load the small SFC fixture to activate recipe configuration.
  const sfcInput = page.locator(SFC_LOAD_INPUT_SELECTOR).first()
  await sfcInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await sfcInput.setInputFiles(SAMPLE_SMALL_SFC_PATH)
  await dismissBlockingDialogs(page)

  // Load the small DB fixture to populate gear cards.
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await dbInput.setInputFiles(SAMPLE_SMALL_DB_PATH)
  await dismissBlockingDialogs(page)

  await ensureGearInspectorMode(page)
  // Wait for cards to render before any selection interactions.
  await waitForGearCards(page, 2)
  const ids = await getFirstCardIds(page, 2)
  if (ids.length < 2) throw new Error('Fewer than 2 gear cards available; cannot run selection tests')
  return [ids[0], ids[1]]
}

test.beforeAll(async ({ browser }) => {
  // Allow the long timeout for the cold Vite compile to finish.
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await warmupAppShell(browser)
})

test.describe('gear-inspector-selection-mode', () => {
  test('multi-select (default): each plain click adds an independent card to the selection', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    const [id0, id1] = await setupWithCards(page)

    const card0 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id0}"]`)
    const card1 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id1}"]`)

    // The selection bottom bar must be present when the endpoint is connected.
    await expect(page.getByRole('button', { name: 'Switch to single select' })).toBeVisible()

    // Click card 0: selection grows to 1.
    await card0.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Click card 1 (no modifier needed): selection grows to 2 in multi-select mode.
    await card1.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('2 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Re-click card 0 to toggle it off: back to 1 selected.
    await card0.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  })

  test('single-select: plain click replaces the selection; clicking the same card deselects it', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    const [id0, id1] = await setupWithCards(page)

    const card0 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id0}"]`)
    const card1 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id1}"]`)

    // Activate single-select mode.
    const toggleBtn = page.getByRole('button', { name: 'Switch to single select' })
    await expect(toggleBtn).toBeVisible()
    await toggleBtn.click()
    // Button label flips to reflect the new active mode.
    await expect(page.getByRole('button', { name: 'Switch to multi-select' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Clicking card 0 selects exactly one card.
    await card0.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Clicking card 1 replaces the selection — count stays at 1, not grows to 2.
    await card1.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Clicking the already-selected card toggles it off.
    await card1.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('0 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  })

  test('single-select: Ctrl+click and Shift+click still perform multi-select operations', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    const [id0, id1] = await setupWithCards(page)

    const card0 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id0}"]`)
    const card1 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id1}"]`)

    // Activate single-select mode.
    await page.getByRole('button', { name: 'Switch to single select' }).click()
    await expect(page.getByRole('button', { name: 'Switch to multi-select' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Plain click anchors the selection to card 0.
    await card0.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Ctrl+click must add card 1 even in single-select mode.
    await card1.click({ modifiers: ['Control'] })
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('2 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Ctrl+click on an already-selected card removes it (toggle behavior).
    await card0.click({ modifiers: ['Control'] })
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Shift+click from the anchor (card 1) back to card 0 adds the range.
    await card0.click({ modifiers: ['Shift'] })
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('2 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  })

  test('selection mode persists to localStorage and is restored on boot', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)

    // Pre-seed single-select mode so the app boots with it already active.
    // This exercises the restore-on-boot path without requiring a full reload cycle.
    await page.addInitScript((key: string) => {
      try { window.localStorage.setItem(key, '1') } catch {}
    }, GEAR_INSPECTOR_SINGLE_SELECT_KEY)

    await setupWithCards(page)

    // The pre-seeded key should have restored single-select mode on boot.
    await expect(page.getByRole('button', { name: 'Switch to multi-select' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Toggle back to multi-select; key must flip to '0'.
    await page.getByRole('button', { name: 'Switch to multi-select' }).click()
    await expect(page.getByRole('button', { name: 'Switch to single select' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    // Poll: the useEffect that writes to localStorage fires after the render cycle.
    await expect.poll(
      () => page.evaluate((key: string) => localStorage.getItem(key), GEAR_INSPECTOR_SINGLE_SELECT_KEY),
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    ).toBe('0')

    // Toggle back to single-select; key must flip to '1'.
    await page.getByRole('button', { name: 'Switch to single select' }).click()
    await expect(page.getByRole('button', { name: 'Switch to multi-select' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await expect.poll(
      () => page.evaluate((key: string) => localStorage.getItem(key), GEAR_INSPECTOR_SINGLE_SELECT_KEY),
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    ).toBe('1')
  })
})
