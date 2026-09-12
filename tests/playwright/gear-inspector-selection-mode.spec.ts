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
import { CAPABILITY_AUTO_SELL_SUPPORTED } from '../../src/lib/clientCapabilities'

// RSL Helper default WebSocket endpoint; provides the selection UI via gearSelectionEnabled.
const ENDPOINT_URL = 'ws://localhost:8080/'
// Stable test-id for the global selection count chip in the bottom bar.
const SELECTION_COUNT_TESTID = 'gear-inspector-selection-count'

// The mode picker is a two-button exclusive group: both modes are always on screen and the
// ACTIVE one is the pressed button. So a mode is asserted via aria-pressed, never via a
// label that flips — clicking a button always means "go to the mode this button names".
const modeButton = (page: Parameters<typeof test>[0]['page'], name: string) =>
  page.getByRole('button', { name })
// Asserts which of the pair is live, checking both buttons so a group that somehow presses
// neither (or both) cannot pass.
const expectActiveMode = async (
  page: Parameters<typeof test>[0]['page'],
  activeName: string,
  inactiveName: string,
) => {
  await expect(modeButton(page, activeName)).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  await expect(modeButton(page, inactiveName)).toHaveAttribute('aria-pressed', 'false', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}

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
const setupWithCards = async (
  page: Parameters<typeof test>[0]['page'],
  // Feature tokens the mocked client announces on connect. Empty (the default) mimics RSL
  // Helper, which sends no capabilities packet at all.
  capabilities: readonly string[] = [],
): Promise<[number, number]> => {
  // Accept WebSocket connections from the app so gearSelectionEnabled stays true.
  await page.routeWebSocket(ENDPOINT_URL, (ws: WebSocketRoute) => {
    // Announce up front, the way a real client does: the packet must be in force before any
    // UI that presents a capability paints.
    if (capabilities.length > 0) {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'capabilities',
        params: { capabilities: [...capabilities] },
      }))
    }
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

    // The selection bottom bar must be present when the endpoint is connected, with
    // multi-select (the factory default) showing as the pressed button.
    await expect(modeButton(page, 'Single select')).toBeVisible()
    await expectActiveMode(page, 'Multi-select', 'Single select')

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

    // Activate single-select mode by picking the button that names it.
    const singleBtn = modeButton(page, 'Single select')
    await expect(singleBtn).toBeVisible()
    await singleBtn.click()
    // The pressed button moves to single select; both labels stay on screen.
    await expectActiveMode(page, 'Single select', 'Multi-select')

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
    await modeButton(page, 'Single select').click()
    await expectActiveMode(page, 'Single select', 'Multi-select')

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
    await expectActiveMode(page, 'Single select', 'Multi-select')

    // Re-picking the ALREADY-active mode must be a no-op, not a flip: with both buttons
    // permanently on screen this gesture is easy to make by accident, and an exclusive
    // group reports null for it. Guards the early return in the change handler.
    await modeButton(page, 'Single select').click()
    await expectActiveMode(page, 'Single select', 'Multi-select')
    await expect.poll(
      () => page.evaluate((key: string) => localStorage.getItem(key), GEAR_INSPECTOR_SINGLE_SELECT_KEY),
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    ).toBe('1')

    // Pick multi-select; key must flip to '0'.
    await modeButton(page, 'Multi-select').click()
    await expectActiveMode(page, 'Multi-select', 'Single select')
    // Poll: the store's write to localStorage lands after the render cycle.
    await expect.poll(
      () => page.evaluate((key: string) => localStorage.getItem(key), GEAR_INSPECTOR_SINGLE_SELECT_KEY),
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    ).toBe('0')

    // Pick single-select again; key must flip back to '1'.
    await modeButton(page, 'Single select').click()
    await expectActiveMode(page, 'Single select', 'Multi-select')
    await expect.poll(
      () => page.evaluate((key: string) => localStorage.getItem(key), GEAR_INSPECTOR_SINGLE_SELECT_KEY),
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    ).toBe('1')
  })

  test('autoSellSupported relabels the mode picker as sell/view and makes view mode strict', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    const [id0, id1] = await setupWithCards(page, [CAPABILITY_AUTO_SELL_SUPPORTED])

    const card0 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id0}"]`)
    const card1 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id1}"]`)

    // Multi-select is the default, which this client presents as sell mode.
    const toView = modeButton(page, 'View mode')
    await expect(toView).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await expectActiveMode(page, 'Sell mode', 'View mode')
    // The plain select wording must be gone entirely — this client sees sell/view only.
    await expect(modeButton(page, 'Single select')).toHaveCount(0)
    await expect(modeButton(page, 'Multi-select')).toHaveCount(0)

    // Picking view mode moves the pressed state onto it.
    await toView.click()
    await expectActiveMode(page, 'View mode', 'Sell mode')

    // Plain click replaces, as in ordinary single-select.
    await card0.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await card1.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    // Strict view mode: ctrl-click must NOT gather a second id — it collapses to the item
    // just clicked. This is the behavioral difference from plain single-select, where the
    // very same gesture reaches '2 selected' (see the ctrl/shift test above).
    await card0.click({ modifiers: ['Control'] })
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    // Shift-click is capped the same way — a range cannot escape the one-item view state.
    await card1.click({ modifiers: ['Shift'] })
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // The relabel rides the same stored preference, so the key still records single-select.
    await expect.poll(
      () => page.evaluate((key: string) => localStorage.getItem(key), GEAR_INSPECTOR_SINGLE_SELECT_KEY),
      { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault },
    ).toBe('1')
  })

  test('entering view mode trims a selection that was already longer than one item', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    const [id0, id1] = await setupWithCards(page, [CAPABILITY_AUTO_SELL_SUPPORTED])

    const card0 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id0}"]`)
    const card1 = page.locator(`[data-gear-inspector-grid-card="true"][data-row-id="${id1}"]`)

    // Build a two-item selection while still in sell mode, where that is legitimate.
    await card0.click()
    await card1.click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('2 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    // Switching to view mode must reconcile it down to one, so the client is never left
    // holding a multi-id view state.
    await modeButton(page, 'View mode').click()
    await expect(page.getByTestId(SELECTION_COUNT_TESTID)).toHaveText('1 selected', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  })

  test('a client announcing nothing keeps the plain multi/single-select wording', async ({ page }) => {
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Guards the additive promise: RSL Helper sends no capabilities packet and must be
    // unaffected by the sell/view relabel.
    await setupWithCards(page)
    await expect(modeButton(page, 'Single select')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await expect(modeButton(page, 'Multi-select')).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    await expect(modeButton(page, 'View mode')).toHaveCount(0)
    await expect(modeButton(page, 'Sell mode')).toHaveCount(0)
  })
})
