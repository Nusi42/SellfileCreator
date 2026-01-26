import { expect, test, type Locator, type Page } from '@playwright/test'
import path from 'node:path'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PERF_EVENTS, PERF_TIMELINE_GLOBAL_KEY, type PerfTimelineEntry } from '../../src/lib/perfTimeline'

// Use the repo fixtures so perf measurements match the reported repro.
const HSFC_PATH = path.resolve(process.cwd(), 'tests', 'data', 'sample.hsfc')
// Use the smaller sample DB so the baseline remains stable across runs.
const DB_PATH = path.resolve(process.cwd(), 'tests', 'data', 'sample.db')
// Builder name input is the most direct config-change hook for matching.
const BUILDER_NAME_SELECTOR = 'input[data-tour-id="builder.name"]'
// Note dialog title used for config options changes.
const NOTE_DIALOG_TITLE = 'Note & Config Options'
// Config options menu button label inside the note dialog.
const CONFIG_OPTIONS_MENU_LABEL = 'Config Options'
// Config options menu entry to disable options.
const CONFIG_OPTIONS_DISABLE_LABEL = 'Disable Config Options...'
// Config options menu entry to enable options.
const CONFIG_OPTIONS_ENABLE_LABEL = 'Enable Config Options'
// Confirm dialog action to apply + disable config options.
const CONFIG_OPTIONS_DISABLE_APPLY_LABEL = 'Apply to Configs and Disable'
// Context menu label for config duplication.
const CONFIG_DUPLICATE_LABEL = 'Duplicate'
// Target config index for duplication measurements.
const DUPLICATE_CONFIG_INDEX = 1
// Keep Uniques toggle lives in the preview header actions.
const KEEP_UNIQUES_TOGGLE_SELECTOR = '[data-tour-id="keepuniques.toggle"]'
// The preview chip gets an aria-label only while the workload is busy.
const WORKLOAD_SELECTOR = '[data-tour-id="preview.paper"] .MuiChip-root[aria-label^="Building"]'
// Tester grid cards confirm the matcher has rows to operate on.
const TESTER_CARD_SELECTOR = '[data-tester-grid-card="true"]'
// Keep the suffix short so it stays visible in the builder input.
const PERF_SUFFIX = ' [perf]'
// Allow extra time for Firefox to finish large matcher rebuilds.
const WORKLOAD_IDLE_TIMEOUT_MS = 840_000
// Give the perf suite room for multiple long rebuilds in one run.
const PERF_TEST_TIMEOUT_MS = 900_000

type LongTaskEntry = {
  // Performance entry name (often "self" for longtask).
  name: string
  // Entry start time relative to performance.now().
  startTime: number
  // Duration of the long task.
  duration: number
  // Optional script URL attributed to the task.
  scriptUrl: string | null
}

type MatchTiming = {
  // Human label describing the change that triggered the rebuild.
  label: string
  // Start time captured before the action.
  startTime: number
  // End time captured after the spinner settles.
  endTime: number
  // End-to-end elapsed time for the change.
  totalMs: number
  // Spinner start time when detected.
  busyStart: number | null
  // Spinner duration when detected.
  busyMs: number | null
  // Whether the spinner appeared at all.
  busySeen: boolean
  // Long tasks captured during the window.
  longTasks: LongTaskEntry[]
  // Perf timeline entries captured during the run.
  timelineEntries: PerfTimelineEntry[]
  // Human-readable deltas for perf timeline events.
  timelineDeltas: string[]
}

test.describe('tester matching performance', () => {
  // Focus on Chromium + Firefox for the reported regression.
  test.skip(({ browserName }) => browserName === 'webkit', 'Performance runs focus on Chromium and Firefox.')

  test('measures matcher rebuild latency from config + Keep Uniques changes', async ({ page }, testInfo) => {
    // Large fixture operations can take multiple minutes in Firefox.
    test.setTimeout(PERF_TEST_TIMEOUT_MS)

    // Ensure consistent locale + clean storage before loading the app.
    await prepareApp(page)
    // Capture long tasks for additional perf context.
    await attachLongTaskObserver(page)

    // Load the shell without waiting on a full load event.
    await page.goto('/', APP_GOTO_OPTIONS)
    // Ensure the preview panel is ready before importing files.
    await page.locator('[data-tour-id="preview.paper"]').waitFor({ timeout: 120_000 })

    // Load the HSFC config snapshot used in the repro.
    await loadHsfcFile(page, HSFC_PATH)
    // Close the note dialog if it appears.
    await dismissNoteDialog(page)
    // Wait for the config chips to render.
    await waitForConfigChips(page)

    // Load the sample DB so tester rows are populated.
    await loadGearDb(page, DB_PATH)
    // Switch into Rule Tester mode to see matches.
    await switchToTesterMode(page)
    // Wait until at least one tester card exists.
    await waitForTesterRows(page)
    // Ensure any prior builds are settled before measuring.
    await waitForWorkloadIdle(page)

    // Capture the current config name so we can restore it.
    const nameInput = page.locator(BUILDER_NAME_SELECTOR)
    // Wait for the builder name input to mount.
    await nameInput.waitFor({ timeout: 60_000 })
    // Read the existing name to build a deterministic toggle.
    const baseName = await nameInput.inputValue()
    // Derive a safe alternate label for the perf cycle.
    const perfName = derivePerfName(baseName)

    // Track long task entries with a cursor so we avoid duplicates.
    let longTaskCursor = 0
    // Collect timing samples for each scenario.
    const measurements: MatchTiming[] = []

    // Measure rebuilds when the config name changes.
    const nameChangeForward = await measureWorkload(page, `config-name ${formatName(baseName)} → ${formatName(perfName)}`, async () => {
      // Set the builder input to the perf name.
      await setBuilderName(page, perfName)
    })
    // Pull long tasks that occurred during the change window.
    const forwardTasks = await collectLongTasks(page, longTaskCursor, nameChangeForward.startTime, nameChangeForward.endTime)
    // Advance the cursor so we do not re-log tasks.
    longTaskCursor = forwardTasks.nextCursor
    // Record the timing + long tasks together.
    measurements.push({ ...nameChangeForward, longTasks: forwardTasks.entries })

    // Measure rebuilds when we restore the original name.
    const nameChangeBack = await measureWorkload(page, `config-name ${formatName(perfName)} → ${formatName(baseName)}`, async () => {
      // Restore the original builder name.
      await setBuilderName(page, baseName)
    })
    // Pull long tasks for the reverse rename.
    const backTasks = await collectLongTasks(page, longTaskCursor, nameChangeBack.startTime, nameChangeBack.endTime)
    // Update the cursor to the latest entry index.
    longTaskCursor = backTasks.nextCursor
    // Record the reverse timing sample.
    measurements.push({ ...nameChangeBack, longTasks: backTasks.entries })

    // Ensure config options start enabled so the disable path is deterministic.
    await ensureConfigOptionsEnabled(page, true)
    // Wait for any config options rebuild to settle.
    await waitForWorkloadIdle(page)

    // Measure config options disable pass.
    const configOptionsOff = await measureWorkload(page, 'config-options on → off', async () => {
      // Disable config options and apply the current answers.
      await setConfigOptionsEnabled(page, false)
    })
    // Capture long tasks during config options disable.
    const configOptionsOffTasks = await collectLongTasks(page, longTaskCursor, configOptionsOff.startTime, configOptionsOff.endTime)
    // Advance the cursor after the disable pass.
    longTaskCursor = configOptionsOffTasks.nextCursor
    // Store the config options disable sample.
    measurements.push({ ...configOptionsOff, longTasks: configOptionsOffTasks.entries })

    // Measure config options enable pass.
    const configOptionsOn = await measureWorkload(page, 'config-options off → on', async () => {
      // Re-enable config options for the follow-up sample.
      await setConfigOptionsEnabled(page, true)
    })
    // Capture long tasks during config options enable.
    const configOptionsOnTasks = await collectLongTasks(page, longTaskCursor, configOptionsOn.startTime, configOptionsOn.endTime)
    // Advance the cursor after the enable pass.
    longTaskCursor = configOptionsOnTasks.nextCursor
    // Store the config options enable sample.
    measurements.push({ ...configOptionsOn, longTasks: configOptionsOnTasks.entries })

    // Normalize Keep Uniques to enabled so the toggle path is deterministic.
    await ensureKeepUniquesState(page, true)
    // Wait for any Keep Uniques rebuild to settle.
    await waitForWorkloadIdle(page)

    // Measure the Keep Uniques disable pass.
    const keepUniquesOff = await measureWorkload(page, 'keep-uniques on → off', async () => {
      // Toggle Keep Uniques off to trigger a match rebuild.
      await setKeepUniquesEnabled(page, false)
    })
    // Capture long tasks during the disable pass.
    const offTasks = await collectLongTasks(page, longTaskCursor, keepUniquesOff.startTime, keepUniquesOff.endTime)
    // Advance the cursor after the disable pass.
    longTaskCursor = offTasks.nextCursor
    // Store the Keep Uniques disable sample.
    measurements.push({ ...keepUniquesOff, longTasks: offTasks.entries })

    // Measure the Keep Uniques re-enable pass.
    const keepUniquesOn = await measureWorkload(page, 'keep-uniques off → on', async () => {
      // Toggle Keep Uniques back on.
      await setKeepUniquesEnabled(page, true)
    })
    // Capture long tasks during the enable pass.
    const onTasks = await collectLongTasks(page, longTaskCursor, keepUniquesOn.startTime, keepUniquesOn.endTime)
    // Advance the cursor after the enable pass.
    longTaskCursor = onTasks.nextCursor
    // Store the Keep Uniques enable sample.
    measurements.push({ ...keepUniquesOn, longTasks: onTasks.entries })

    // Measure the duplication pass after other toggles to avoid skewing earlier timings.
    const duplicateConfig = await measureWorkload(page, `duplicate config #${DUPLICATE_CONFIG_INDEX}`, async () => {
      // Duplicate the target config via its context menu.
      await duplicateConfigByIndex(page, DUPLICATE_CONFIG_INDEX)
    })
    // Capture long tasks during duplication.
    const duplicateTasks = await collectLongTasks(page, longTaskCursor, duplicateConfig.startTime, duplicateConfig.endTime)
    // Advance the cursor after duplication.
    longTaskCursor = duplicateTasks.nextCursor
    // Store the duplication sample.
    measurements.push({ ...duplicateConfig, longTasks: duplicateTasks.entries })

    // Emit perf summaries for CI logs and annotation output.
    for (const entry of measurements) {
      // Render the busy duration only when we saw the spinner.
      const busyLabel = entry.busySeen && entry.busyMs != null
        ? `${entry.busyMs.toFixed(1)} ms`
        : 'not-seen'
      // Compose a single-line summary for easy scan.
      const summary = `${entry.label} | total=${entry.totalMs.toFixed(1)} ms | busy=${busyLabel}`
      // Attach results to the Playwright report.
      testInfo.annotations.push({ type: 'perf', description: summary })
      // Print to stdout for quick CLI access.
      console.log(`[tester-match] ${summary}`)
      // Print perf timeline deltas when available.
      if (entry.timelineDeltas.length > 0) {
        console.log(`  ↳ timeline ${entry.timelineDeltas.join(' | ')}`)
      }
      // Surface any long tasks so we can correlate stalls.
      if (entry.longTasks.length > 0) {
        for (const task of entry.longTasks) {
          const location = task.scriptUrl ? task.scriptUrl : task.name
          console.log(`  ↳ long task ${task.duration.toFixed(1)} ms @ ${location}`)
        }
      }
    }
  })
})

async function attachLongTaskObserver(page: Page): Promise<void> {
  // Wire the observer before any page content executes.
  await page.addInitScript(() => {
    // Store long task entries for later retrieval.
    const scope = window as unknown as { __testerMatchLongTasks?: LongTaskEntry[] }
    // Initialize the shared array once per page load.
    scope.__testerMatchLongTasks = []
    // Guard the observer to avoid crashes in unsupported browsers.
    if (typeof PerformanceObserver !== 'function') return
    try {
      // Observe long tasks so we can correlate stalls with rebuild windows.
      const observer = new PerformanceObserver((list) => {
        // Append each entry so tests can filter by timing window.
        const target = scope.__testerMatchLongTasks!
        for (const entry of list.getEntries()) {
          // Pull the attribution data when available (Chrome only).
          const attribution = (entry as PerformanceEntry & { attribution?: PerformanceEntry[] }).attribution
          // Use the first attribution if provided by the browser.
          const scriptUrl = attribution && attribution.length > 0
            ? ((attribution[0] as unknown as { scriptUrl?: string | null }).scriptUrl ?? null)
            : null
          // Store a trimmed payload for reporting.
          target.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
            scriptUrl,
          })
        }
      })
      // Listen for longtask entries in supported browsers.
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      /* ignore observer failures */
    }
  })
}

async function loadHsfcFile(page: Page, filePath: string): Promise<void> {
  // Target the HSFC loader so we follow the real import path.
  const input = page.locator('[data-tour-id="hsfc.load"] input[type="file"][accept*=".hsfc"]').first()
  // Ensure the input exists before attempting to set files.
  await input.waitFor({ state: 'attached', timeout: 30_000 })
  // Use the file input to trigger the load.
  await input.setInputFiles(filePath)
}

async function dismissNoteDialog(page: Page): Promise<void> {
  // The note dialog can appear under multiple localized titles.
  const candidates = [
    page.getByRole('dialog', { name: 'Note' }),
    page.getByRole('dialog', { name: NOTE_DIALOG_TITLE }),
  ]
  for (const dialog of candidates) {
    try {
      // Wait briefly to see if the dialog is visible.
      await dialog.waitFor({ state: 'visible', timeout: 3_000 })
      // Close the dialog so it does not block clicks.
      await dialog.getByRole('button', { name: 'Close' }).first().click()
      // Stop once one dialog has been handled.
      return
    } catch {
      /* dialog not present */
    }
  }
}

async function waitForConfigChips(page: Page): Promise<void> {
  // Config chips confirm the HSFC import finished.
  const chips = page.locator('[data-config-chip="true"]')
  // Wait for at least one chip to attach and become visible.
  await expect(chips.first()).toBeVisible({ timeout: 120_000 })
}

async function loadGearDb(page: Page, filePath: string): Promise<void> {
  // Target the shared preview file input for DB uploads.
  const input = page.locator('input[type="file"][accept*=".db"]').first()
  // Ensure the input is attached before setting files.
  await input.waitFor({ state: 'attached', timeout: 30_000 })
  // Use the file picker to load the DB.
  await input.setInputFiles(filePath)
}

async function switchToTesterMode(page: Page): Promise<void> {
  // Click the Rule Tester toggle to activate tester mode.
  await page.getByRole('button', { name: /Rule Tester/i }).click()
  // Wait until the tester chip shows an Items label.
  await page.waitForFunction(() => {
    const chip = document.querySelector('[data-tour-id="preview.paper"] .MuiChip-label')
    if (!chip) return false
    // Normalize case so localization or casing changes do not break the check.
    const text = (chip.textContent ?? '').toLowerCase()
    return text.includes('items')
  }, undefined, { timeout: 120_000 })
}

async function waitForTesterRows(page: Page): Promise<void> {
  // Wait for a tester card so we know the matcher has rows.
  const card = page.locator(TESTER_CARD_SELECTOR).first()
  // Allow extra time for the DB import to hydrate rows.
  await card.waitFor({ timeout: 240_000 })
}

async function waitForWorkloadIdle(page: Page): Promise<void> {
  // The workload indicator disappears when the build pipeline settles.
  const indicator = page.locator(WORKLOAD_SELECTOR)
  // Wait until the indicator is hidden or detached.
  await indicator.waitFor({ state: 'hidden', timeout: WORKLOAD_IDLE_TIMEOUT_MS })
}

async function startPerfTimeline(page: Page, label: string): Promise<void> {
  // Reset the timeline so marks stay scoped to a single measurement.
  await page.evaluate(({ key, name }) => {
    const scope = window as unknown as Record<string, { start?: (label?: string) => void }>
    const timeline = scope[key]
    if (timeline?.start) {
      timeline.start(name)
    }
  }, { key: PERF_TIMELINE_GLOBAL_KEY, name: label })
}

async function readPerfTimelineEntries(page: Page): Promise<PerfTimelineEntry[]> {
  // Pull the snapshot so we can compute deltas in Node.
  return page.evaluate((key) => {
    const scope = window as unknown as Record<string, { snapshot?: () => { entries?: PerfTimelineEntry[] } }>
    const timeline = scope[key]
    const snapshot = timeline?.snapshot?.()
    return Array.isArray(snapshot?.entries) ? snapshot!.entries : []
  }, PERF_TIMELINE_GLOBAL_KEY)
}

function buildTimelineDeltas(entries: PerfTimelineEntry[]): string[] {
  // Map the first occurrence of each label for delta calculations.
  const byLabel = new Map<string, number>()
  for (const entry of entries) {
    if (!byLabel.has(entry.label)) {
      byLabel.set(entry.label, entry.at)
    }
  }
  // Helper to build a delta string when both endpoints exist.
  const delta = (label: string, start: string, end: string): string | null => {
    const startAt = byLabel.get(start)
    const endAt = byLabel.get(end)
    if (startAt == null || endAt == null) return null
    return `${label}=${(endAt - startAt).toFixed(1)}ms`
  }
  // Assemble the deltas in a consistent order.
  const deltas = [
    delta('build', PERF_EVENTS.testerMatchBuildStart, PERF_EVENTS.testerMatchBuildCommit),
    delta('eval', PERF_EVENTS.testerMatchEvalStart, PERF_EVENTS.testerMatchEvalDone),
    delta('eval-fallback', PERF_EVENTS.testerMatchEvalFallbackStart, PERF_EVENTS.testerMatchEvalFallbackDone),
    delta('worker-eval', PERF_EVENTS.testerMatchWorkerEvaluateSend, PERF_EVENTS.testerMatchWorkerEvaluateDone),
    delta('rule-cache', PERF_EVENTS.ruleCachePipelineStart, PERF_EVENTS.ruleCachePipelineDone),
    // Rule-cache phase: baseline pass.
    delta('baseline', PERF_EVENTS.ruleCacheBaselineStart, PERF_EVENTS.ruleCacheBaselineDone),
    // Rule-cache phase: keep-unique detection snapshot.
    delta('detection', PERF_EVENTS.ruleCacheDetectionStart, PERF_EVENTS.ruleCacheDetectionDone),
    // Rule-cache phase: final match pass.
    delta('final', PERF_EVENTS.ruleCacheFinalMatchStart, PERF_EVENTS.ruleCacheFinalMatchDone),
    delta('warm', PERF_EVENTS.ruleCacheWarmStart, PERF_EVENTS.ruleCacheWarmDone),
  ].filter((entry): entry is string => Boolean(entry))
  // Track no-op builds so we can flag redundant rebuilds.
  if (byLabel.has(PERF_EVENTS.testerMatchBuildNoop)) {
    deltas.push('noop=1')
  }
  // Check for fast-path usage via the final match start payload.
  const finalStartEntry = entries.find((entry) => entry.label === PERF_EVENTS.ruleCacheFinalMatchStart)
  // Only emit when the worker explicitly tagged the fast path.
  if (finalStartEntry?.data?.fastPath) {
    deltas.push('fast-path=1')
  }
  return deltas
}

async function measureWorkload(page: Page, label: string, action: () => Promise<void>): Promise<MatchTiming> {
  // Ensure we start from a settled state.
  await waitForWorkloadIdle(page)
  // Reset the perf timeline so only this action is captured.
  await startPerfTimeline(page, label)
  // Capture the timestamp before triggering the change.
  const startTime = await page.evaluate(() => performance.now())
  // Execute the action that should trigger matching.
  await action()
  // Reference the shared indicator for visibility checks.
  const indicator = page.locator(WORKLOAD_SELECTOR)
  // Wait briefly to see if the indicator appears.
  const busySeen = await indicator.waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  // Record when the indicator appeared, if it did.
  const busyStart = busySeen ? await page.evaluate(() => performance.now()) : null
  // Wait until the indicator disappears again.
  await indicator.waitFor({ state: 'hidden', timeout: WORKLOAD_IDLE_TIMEOUT_MS })
  // Capture the end timestamp after settling.
  const endTime = await page.evaluate(() => performance.now())
  // Pull perf timeline entries once the build is settled.
  const timelineEntries = await readPerfTimelineEntries(page)
  // Derive the key deltas from the perf timeline entries.
  const timelineDeltas = buildTimelineDeltas(timelineEntries)
  // Derive the full duration from action to idle.
  const totalMs = endTime - startTime
  // Derive the busy duration when we saw the indicator.
  const busyMs = busyStart != null ? endTime - busyStart : null
  // Return the timing payload for reporting.
  return {
    label,
    startTime,
    endTime,
    totalMs,
    busyStart,
    busyMs,
    busySeen,
    longTasks: [],
    timelineEntries,
    timelineDeltas,
  }
}

async function collectLongTasks(
  page: Page,
  cursor: number,
  startTime: number,
  endTime: number,
): Promise<{ entries: LongTaskEntry[]; nextCursor: number }> {
  // Pull the recorded entries from the page context.
  const snapshot = await page.evaluate(() => {
    const scope = window as unknown as { __testerMatchLongTasks?: LongTaskEntry[] }
    return Array.isArray(scope.__testerMatchLongTasks) ? scope.__testerMatchLongTasks : []
  })
  // Slice from the cursor to avoid reprocessing old entries.
  const fresh = snapshot.slice(cursor)
  // Filter to entries within the timing window.
  const entries = fresh.filter((entry) => entry.startTime >= startTime && entry.startTime <= endTime)
  // Advance the cursor to the end of the snapshot.
  const nextCursor = snapshot.length
  // Return the filtered entries and updated cursor.
  return { entries, nextCursor }
}

function derivePerfName(baseName: string): string {
  // Trim whitespace so we do not append to a blank.
  const trimmed = baseName.trim()
  // Avoid duplicate suffixes when rerunning the test.
  if (trimmed.endsWith(PERF_SUFFIX)) {
    return `${trimmed}-2`
  }
  // Use a fallback label when the base name is empty.
  const safeBase = trimmed.length > 0 ? trimmed : 'Perf Config'
  // Return the perf name used for the toggle.
  return `${safeBase}${PERF_SUFFIX}`
}

function formatName(name: string): string {
  // Show "(empty)" when the config name is blank.
  const trimmed = name.trim()
  // Keep the label short for log readability.
  return trimmed.length > 0 ? `"${trimmed}"` : '"(empty)"'
}

async function setBuilderName(page: Page, nextName: string): Promise<void> {
  // Target the builder name input via its tour id.
  const input = page.locator(BUILDER_NAME_SELECTOR)
  // Focus and replace the value in one step.
  await input.fill(nextName)
  // Press Enter to trigger the blur commit path.
  await input.press('Enter')
  // Wait for the input value to reflect the committed name.
  await expect(input).toHaveValue(nextName, { timeout: 30_000 })
}

async function ensureKeepUniquesState(page: Page, enabled: boolean): Promise<void> {
  // Read the current toggle state from aria-pressed.
  const current = await readKeepUniquesState(page)
  // Skip if we already match the desired state.
  if (current === enabled) return
  // Toggle to reach the desired state.
  await setKeepUniquesEnabled(page, enabled)
  // Wait for the pipeline to settle after the change.
  await waitForWorkloadIdle(page)
}

async function readKeepUniquesState(page: Page): Promise<boolean> {
  // Locate the Keep Uniques toggle control.
  const toggle = page.locator(KEEP_UNIQUES_TOGGLE_SELECTOR)
  // Ensure the toggle is mounted.
  await toggle.waitFor({ timeout: 60_000 })
  // Read the aria-pressed state to determine enabled/disabled.
  const pressed = await toggle.getAttribute('aria-pressed')
  // Normalize to a boolean value.
  return pressed === 'true'
}

async function setKeepUniquesEnabled(page: Page, enabled: boolean): Promise<void> {
  // Locate the Keep Uniques toggle control.
  const toggle = page.locator(KEEP_UNIQUES_TOGGLE_SELECTOR)
  // Ensure the toggle exists before interacting.
  await toggle.waitFor({ timeout: 60_000 })
  // Click the toggle only when a change is needed.
  const current = await readKeepUniquesState(page)
  if (current === enabled) return
  // Toggle the state with a click.
  await toggle.click()
  // Wait for the aria-pressed attribute to reflect the new state.
  await expect(toggle).toHaveAttribute('aria-pressed', enabled ? 'true' : 'false', { timeout: 60_000 })
}

async function ensureConfigOptionsEnabled(page: Page, enabled: boolean): Promise<void> {
  // Open the note dialog so we can reach the config options menu.
  const dialog = await openNoteDialog(page)
  // Open the Config Options menu to inspect available actions.
  await openConfigOptionsMenu(dialog)
  // Resolve the menu items for enable/disable.
  const enableItem = page.getByRole('menuitem', { name: CONFIG_OPTIONS_ENABLE_LABEL })
  const disableItem = page.getByRole('menuitem', { name: CONFIG_OPTIONS_DISABLE_LABEL })
  // Determine whether the desired action is visible.
  const canEnable = await enableItem.isVisible().catch(() => false)
  const canDisable = await disableItem.isVisible().catch(() => false)
  // Apply the change only when the menu exposes the matching action.
  if (enabled && canEnable) {
    await enableItem.click()
  } else if (!enabled && canDisable) {
    await disableItem.click()
    await applyConfigOptionsDisableConfirm(page)
  }
  // Close the menu overlay so it does not block future clicks.
  await page.keyboard.press('Escape').catch(() => undefined)
  // Close the dialog so previews remain accessible.
  await closeNoteDialog(dialog)
}

async function setConfigOptionsEnabled(page: Page, enabled: boolean): Promise<void> {
  // Open the note dialog so the config options menu is reachable.
  const dialog = await openNoteDialog(page)
  // Open the Config Options menu to trigger the action.
  await openConfigOptionsMenu(dialog)
  // Resolve the menu items for enable/disable.
  const enableItem = page.getByRole('menuitem', { name: CONFIG_OPTIONS_ENABLE_LABEL })
  const disableItem = page.getByRole('menuitem', { name: CONFIG_OPTIONS_DISABLE_LABEL })
  // Switch based on the requested state.
  if (enabled) {
    await enableItem.click()
  } else {
    await disableItem.click()
    await applyConfigOptionsDisableConfirm(page)
  }
  // Close the menu overlay so it does not block future clicks.
  await page.keyboard.press('Escape').catch(() => undefined)
  // Close the dialog once the action is complete.
  await closeNoteDialog(dialog)
}

async function openNoteDialog(page: Page): Promise<Locator> {
  // Dismiss any lingering menus so the toggle is clickable.
  await page.keyboard.press('Escape').catch(() => undefined)
  // Click the Note toggle button using its stable tour id.
  const openButton = page.locator('[data-tour-id="note.toggle"]')
  await openButton.click()
  // Wait for the dialog to appear before proceeding.
  const dialog = page.getByRole('dialog', { name: NOTE_DIALOG_TITLE })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  return dialog
}

async function closeNoteDialog(dialog: Locator): Promise<void> {
  // Click the Close button inside the dialog.
  const closeButton = dialog.getByRole('button', { name: 'Close' })
  // Skip closing when the dialog already dismissed itself.
  const isVisible = await dialog.isVisible().catch(() => false)
  if (!isVisible) return
  try {
    // Attempt the click, but tolerate races where the dialog is already closing.
    await closeButton.click({ timeout: 5_000 })
  } catch {
    /* dialog closing or detached */
  }
  // Ensure the dialog is dismissed before returning.
  await expect(dialog).toBeHidden({ timeout: 30_000 }).catch(() => undefined)
}

async function openConfigOptionsMenu(dialog: Locator): Promise<void> {
  // Locate the Config Options menu button in the dialog.
  const menuButton = dialog.getByRole('button', { name: CONFIG_OPTIONS_MENU_LABEL, exact: true })
  await expect(menuButton).toBeVisible({ timeout: 10_000 })
  // Open the menu so the actions become visible.
  await menuButton.click()
}

async function applyConfigOptionsDisableConfirm(page: Page): Promise<void> {
  // Wait for the disable confirm action to appear.
  const confirmButton = page.getByRole('button', { name: CONFIG_OPTIONS_DISABLE_APPLY_LABEL })
  await expect(confirmButton).toBeVisible({ timeout: 10_000 })
  // Apply current answers and disable config options.
  await confirmButton.click()
}

async function duplicateConfigByIndex(page: Page, index: number): Promise<void> {
  // Target the config chip by its stable id.
  const chip = page.locator(`#cfg-chip-${index}`).first()
  await expect(chip).toBeVisible({ timeout: 30_000 })
  // Open the context menu via right-click.
  await chip.click({ button: 'right' })
  // Click the Duplicate action once the menu is open.
  await page.getByRole('menuitem', { name: CONFIG_DUPLICATE_LABEL }).click()
}
