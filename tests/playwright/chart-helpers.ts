import { expect, type Locator, type Page } from '@playwright/test'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { SUBSTAT_TARGETS_BUTTON_SELECTOR } from './ui-selectors'

// Dual class so the same selector resolves on x-charts v8 (pre-upgrade `.MuiPieArc-root`)
// and v9 (post-upgrade `.MuiPieChart-arc`) without forking per branch.
export const PIE_ARC_CLASS = '.MuiPieChart-arc, .MuiPieArc-root'

// Generic chart surface selector — stable across both v8 and v9.
export const CHARTS_SURFACE_CLASS = '.MuiChartsSurface-root'

// Open the Tools (LogicHub) dialog and switch to its Gear Analytics tab so charts mount.
export async function openGearAnalytics(page: Page): Promise<void> {
  await page.locator(SUBSTAT_TARGETS_BUTTON_SELECTOR).click()
  // The dialog title is "Tools" (titleLogicHub) — confirm it mounted before clicking the tab.
  await expect(page.getByRole('dialog', { name: 'Tools' })).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectLong })
  await page.getByRole('tab', { name: 'Gear Analytics' }).click()
}

// Count rendered pie arcs across both v8 and v9 class names.
export async function countPieArcs(page: Page): Promise<number> {
  return page.locator(PIE_ARC_CLASS).count()
}

// First visible pie arc — useful for hover and click interactions.
export function firstPieArc(page: Page): Locator {
  return page.locator(PIE_ARC_CLASS).first()
}

// Assert a chart container resolves to non-zero pixel dimensions — the exact 73303b55 regression shape.
export async function assertChartSized(locator: Locator): Promise<void> {
  const box = await locator.boundingBox()
  expect(box, 'chart container should have a measurable bounding box').not.toBeNull()
  expect(box!.width, 'chart container width should be > 0').toBeGreaterThan(0)
  expect(box!.height, 'chart container height should be > 0').toBeGreaterThan(0)
}
