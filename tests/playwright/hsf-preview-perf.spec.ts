import { test, expect } from '@playwright/test'
import { APP_GOTO_OPTIONS } from './app-init'
import { dismissBlockingDialogs } from './dialog-helpers'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { warmupAppShell } from './app-warmup'
import { PREVIEW_MODE_STORAGE_KEY } from '../../src/lib/constants'
import { getWorkloadIndicator } from './workload-indicator'
import { SAMPLE_SFR_PATH } from './fixture-paths'
import { SFR_LOAD_INPUT_SELECTOR } from './ui-selectors'

// Reuse fixture assets so perf runs do not depend on external samples.
const LARGE_SFR_PATH = SAMPLE_SFR_PATH
const LOG_PREFIX = '[gear-inspector-grid]'

test.describe('HSF preview performance', () => {
  test.beforeAll(async ({ browser }) => {
    // Allow the long timeout so the cold Vite compile can finish during warmup.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)
    // Preload the shell so perf timing focuses on SFR import work.
    await warmupAppShell(browser)
  })

  // Capture perf annotations in all browsers so regressions do not hide in one engine.
  test('measures time to first row render for large HSF', async ({ page }, testInfo) => {
    // Allow the long timeout for SFR parsing and the rebuild it triggers.
    test.setTimeout(PLAYWRIGHT_TIMEOUTS.testHeavy)

    const gearInspectorLogs: string[] = []
    page.on('console', (message) => {
      const text = message.text()
      if (text.includes(LOG_PREFIX)) {
        gearInspectorLogs.push(text)
      }
    })

    await page.addInitScript((storageKeys) => {
      try {
        window.localStorage.setItem(storageKeys.readme, storageKeys.version)
        window.localStorage.setItem(storageKeys.tutorial, storageKeys.version)
        window.localStorage.setItem(storageKeys.previewMode, storageKeys.previewValue)
      } catch {
        /* ignore storage failures */
      }
    }, {
      readme: 'sellfileCreator.readme.seen.version',
      tutorial: 'sellfileCreator.tutorial.seen.version',
      version: 'test-version',
      previewMode: PREVIEW_MODE_STORAGE_KEY,
      previewValue: 'rules',
    })

    // Load the shell without waiting for full asset completion.
    await page.goto('/', APP_GOTO_OPTIONS)

    // Use the shared SFR selector so input wiring stays consistent across tests.
    const sfrInput = page.locator(SFR_LOAD_INPUT_SELECTOR).first()
    // Allow the app shell to mount before asserting on the import input.
    await sfrInput.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
    await expect(sfrInput).toBeEnabled({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })

    const start = await page.evaluate(() => performance.now())
    await sfrInput.setInputFiles(LARGE_SFR_PATH)
    // Close any note dialogs that appear after SFR import.
    await dismissBlockingDialogs(page)
    // Wait for the rebuild to clear before loading the DB fixture.
    await getWorkloadIndicator(page).waitFor({ state: 'hidden', timeout: PLAYWRIGHT_TIMEOUTS.expectLong })

    // Sweep dialogs again before waiting on the preview table.
    await dismissBlockingDialogs(page)
    // Ensure the preview mode is set to rules so the table can render.
    const rulesToggle = page.getByRole('button', { name: /Sellfile Preview/i })
    const rulesPressed = await rulesToggle.getAttribute('aria-pressed')
    if (rulesPressed !== 'true') {
      await rulesToggle.click()
    }

    const firstRow = page.locator('table tbody tr[data-recipe-idx]').first()
    // Use the long timeout reserved for rebuild-driven table hydration.
    const firstRowTimeoutMs = PLAYWRIGHT_TIMEOUTS.expectLong
    // Wait for the first row to attach even if visibility lags.
    await firstRow.waitFor({ state: 'attached', timeout: firstRowTimeoutMs })
    const rowVisible = await firstRow.isVisible().catch(() => false)
    if (!rowVisible) {
      console.log('[perf] first-row visibility=hidden')
    }

    const firstRowReady = page.locator('table tbody tr[data-recipe-idx] td')
    // Keep the cell wait aligned with the row timeout.
    await firstRowReady.first().waitFor({ state: 'attached', timeout: firstRowTimeoutMs })
    const firstRowEnd = await page.evaluate(() => performance.now())

    const elapsedMs = firstRowEnd - start

    testInfo.annotations.push({
      type: 'perf',
      description: `Large HSF first-row render: ${elapsedMs.toFixed(1)} ms`,
    })

    console.log(`Large HSF first-row render: ${elapsedMs.toFixed(1)} ms`)

    const gridContainer = page.locator('[data-gear-inspector-grid-container="true"]').first()
    // Skip the scroll pass when the tester grid is not rendered in rules mode.
    const gridPresent = await page.evaluate(() => Boolean(document.querySelector('[data-gear-inspector-grid-container="true"]')))
    if (!gridPresent) {
      console.log('[gear-inspector-grid] skip-scroll reason=container-missing')
    } else if (!(await gridContainer.isVisible().catch(() => false))) {
      console.log('[gear-inspector-grid] skip-scroll reason=container-hidden')
    } else {
      // Scroll through the grid to exercise virtualized row reveal timings.
      await page.evaluate(async () => {
        const container = document.querySelector('[data-gear-inspector-grid-container="true"]') as HTMLElement | null
        if (!container) {
          throw new Error('Tester grid container not found')
        }
        const totalHeight = container.scrollHeight - container.clientHeight
        const scrollStep = Math.max(10000, Math.round(totalHeight / 40))
        const waitFrame = () => new Promise((resolve) => setTimeout(resolve, 32))
        for (let pos = 0; pos <= totalHeight; pos += scrollStep) {
          container.scrollTo(0, pos)
          await waitFrame()
        }
        container.scrollTo(0, totalHeight)
        await waitFrame()
        for (let pos = totalHeight; pos >= 0; pos -= scrollStep) {
          container.scrollTo(0, pos)
          await waitFrame()
        }
        container.scrollTo(0, 0)
        await waitFrame()
      })
    }

    const parseLogLine = (line: string) => {
      const eventMatch = line.match(/\[tester-grid\]\[(.*?)\]\s+(.*)$/)
      if (!eventMatch) return null
      const [, event, rest] = eventMatch
      const fields: Record<string, number | string | null> = {}
      rest.split(/\s+/).forEach((part) => {
        const [key, raw] = part.split('=')
        if (!key) return
        if (raw === undefined) return
        const numeric = Number(raw)
        if (!Number.isNaN(numeric)) {
          fields[key] = numeric
        } else if (raw === 'null') {
          fields[key] = null
        } else {
          fields[key] = raw
        }
      })
      return { event, fields, raw: line }
    }

    const parsed = gearInspectorLogs.map(parseLogLine).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

    const revealLatencies = parsed.filter((entry) => entry.event === 'reveal-latency')
    const maxRevealLatency = revealLatencies.reduce((max, entry) => Math.max(max, Number(entry.fields.latencyMs ?? 0)), 0)

    const queueEnqueues = parsed.filter((entry) => entry.event === 'reveal-enqueue')
    const maxQueueSize = queueEnqueues.reduce((max, entry) => Math.max(max, Number(entry.fields.queueSize ?? 0)), 0)

    const flushDurations = parsed.filter((entry) => entry.event === 'reveal-flush')
    const maxFlushMs = flushDurations.reduce((max, entry) => Math.max(max, Number(entry.fields.flushMs ?? 0)), 0)

    console.log(`[analysis] revealLatencyMax=${maxRevealLatency.toFixed(2)}ms queueSizeMax=${maxQueueSize} flushMsMax=${maxFlushMs.toFixed(2)}`)

    testInfo.annotations.push({
      type: 'analysis',
      description: `Reveal max latency ${maxRevealLatency.toFixed(0)} ms; max queue ${maxQueueSize}; max flush ${maxFlushMs.toFixed(2)} ms`,
    })
  })
})
