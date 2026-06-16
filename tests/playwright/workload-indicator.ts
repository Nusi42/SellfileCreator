import type { Page, Locator } from '@playwright/test'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'

// Shared label for the preview workload progress indicator.
export const WORKLOAD_ARIA_LABEL = 'Building…'

export const getWorkloadIndicator = (page: Page): Locator => {
  // Scope to the preview chip so dialogs using the same label do not match.
  return page
    .locator(`[data-tour-id="preview.paper"] [role="status"][aria-label="${WORKLOAD_ARIA_LABEL}"]`)
    .first()
}

/**
 * Canonical "wait for the preview pipeline to settle" routine — the SINGLE place
 * any spec should wait on the workload indicator. Do not hand-roll the two waits
 * inline anywhere else (the no-restricted-syntax lint rule enforces this).
 *
 * The two waits are deliberately asymmetric, and getting this wrong is what made
 * the binary-endpoint specs run for tens of minutes:
 *
 *   - VISIBLE wait → expectDefault (short). The indicator may NEVER render: a
 *     fast / cache-hit pipeline can show-and-hide it before Playwright polls it
 *     visible. `waitFor({state:'visible'})` blocks the FULL timeout on every
 *     missed appearance, so a long budget here costs `timeout × cases` of pure
 *     dead waiting while proving nothing. A missed spinner is normal, not slow —
 *     so the budget is short and the miss is swallowed.
 *
 *   - HIDDEN wait → the actual work budget (default workloadIdle, override only
 *     for genuinely heavier pipelines). This is the wait that should ever take
 *     real time. If a test is slow, the fix is to find what makes the HIDDEN
 *     wait long (a real perf regression or a wrong wait target) — NOT to raise
 *     the VISIBLE budget and NOT to bump this past what the pipeline truly needs.
 *
 * Both waits are intentionally caught: settling means "the spinner is not (or no
 * longer) up", and neither a never-rendered spinner nor an already-hidden one is
 * a failure.
 *
 * @param hiddenTimeout Budget for the indicator to disappear. Defaults to
 *   workloadIdle (15 s). Pass a longer centralized token (e.g. testXL) ONLY for
 *   pipelines that legitimately need it — never a raw numeric literal.
 */
export const settleWorkload = async (
  page: Page,
  hiddenTimeout: number = PLAYWRIGHT_TIMEOUTS.workloadIdle,
): Promise<void> => {
  const workload = getWorkloadIndicator(page)
  // Short visible budget: a missed spinner appearance is expected, not slow.
  await workload.waitFor({ state: 'visible', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault }).catch(() => undefined)
  // Long(er) hidden budget: this is the only wait that should ever take real time.
  await workload.waitFor({ state: 'hidden', timeout: hiddenTimeout }).catch(() => undefined)
}
