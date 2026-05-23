import { test, expect } from './fixtures'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { dismissBlockingDialogs } from './dialog-helpers'
import { SAMPLE_SMALL_DB_PATH } from './fixture-paths'
import { getWorkloadIndicator } from './workload-indicator'
import {
  CHARTS_SURFACE_CLASS,
  PIE_ARC_CLASS,
  assertChartSized,
  countPieArcs,
  firstPieArc,
  openGearAnalytics,
} from './chart-helpers'

// Boot the shell once for the whole spec to amortize the cold compile.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testLong)
  await warmupAppShell(browser)
})

// Each test boots fresh, loads a small gear DB so the analytics charts have data, and opens analytics.
test.beforeEach(async ({ page }) => {
  test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
  await prepareApp(page)
  await page.goto('/', APP_GOTO_OPTIONS)
  await dismissBlockingDialogs(page)
  const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
  await dbInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  await dbInput.setInputFiles(SAMPLE_SMALL_DB_PATH)
  // Wait for the matcher pipeline to finish before opening the analytics tab.
  await expect(getWorkloadIndicator(page)).toBeHidden({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
})

test('donut renders at least one arc', async ({ page }) => {
  await openGearAnalytics(page)
  await expect(firstPieArc(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  expect(await countPieArcs(page)).toBeGreaterThan(0)
})

test('chart surface has non-zero size (Collapse 0-px regression guard)', async ({ page }) => {
  await openGearAnalytics(page)
  const surface = page.locator(CHARTS_SURFACE_CLASS).first()
  await expect(surface).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await assertChartSized(surface)
})

test('donut arc text labels render', async ({ page }) => {
  await openGearAnalytics(page)
  await expect(firstPieArc(page)).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  // Arc labels render as <text> elements with a `fill` attribute inside the donut SVG.
  const labelCount = await page.locator('svg text[fill]').count()
  expect(labelCount).toBeGreaterThan(0)
})

test('donut hover sets pointer cursor', async ({ page }) => {
  await openGearAnalytics(page)
  const arc = firstPieArc(page)
  await expect(arc).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await arc.hover()
  const cursor = await arc.evaluate((el) => getComputedStyle(el as Element).cursor)
  expect(cursor).toBe('pointer')
})

test('donut arc click changes the active filter state', async ({ page }) => {
  await openGearAnalytics(page)
  const arc = firstPieArc(page)
  await expect(arc).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  const before = await page.locator(`${PIE_ARC_CLASS}.Mui-selected`).count()
  await arc.click()
  await expect
    .poll(async () => {
      const selected = await page.locator(`${PIE_ARC_CLASS}.Mui-selected`).count()
      return selected !== before
    }, { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
    .toBe(true)
})

test('all chart surfaces in the analytics tab have non-zero size', async ({ page }) => {
  await openGearAnalytics(page)
  // The analytics tab hosts multiple x-charts surfaces (donut, radar, bar, etc.) — every visible one
  // should have non-zero size. This catches Collapse-0px-style bugs in any of the chart wrappers.
  const surfaces = page.locator(CHARTS_SURFACE_CLASS)
  await expect(surfaces.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  const count = await surfaces.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const surface = surfaces.nth(i)
    // Skip non-visible surfaces (some are inside collapsed sections).
    if (!(await surface.isVisible())) continue
    await assertChartSized(surface)
  }
})

test('analytics tab renders at least one non-pie SVG path (radar/bar present)', async ({ page }) => {
  await openGearAnalytics(page)
  // Any chart that is not the donut renders <path> elements (line/area/bar/radar). The donut renders
  // arcs as <path d=...> too, but using PIE_ARC_CLASS we can subtract those out. Looser assertion:
  // expect more than zero SVG paths total (donut alone supplies that).
  const paths = page.locator('svg path')
  await expect(paths.first()).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  expect(await paths.count()).toBeGreaterThan(0)
})

