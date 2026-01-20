import { test } from '@playwright/test'
import path from 'node:path'

// Reuse fixture assets so perf runs do not depend on external samples.
const LARGE_DB_PATH = path.resolve(process.cwd(), 'tests', 'data', 'sample2.db')
const LARGE_HSFC_PATH = path.resolve(process.cwd(), 'tests', 'data', 'sample.hsfc')
const LOG_PREFIX = '[tester-grid]'

test.describe('HSF preview performance', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance measurement currently tracks Chromium only.')

  test('measures time to first row render for large HSF', async ({ page }, testInfo) => {
    test.setTimeout(360_000)

    const testerLogs: string[] = []
    page.on('console', (message) => {
      const text = message.text()
      if (text.includes(LOG_PREFIX)) {
        testerLogs.push(text)
      }
    })

    await page.addInitScript((storageKeys) => {
      try {
        window.localStorage.setItem(storageKeys.readme, storageKeys.version)
        window.localStorage.setItem(storageKeys.tutorial, storageKeys.version)
      } catch {
        /* ignore storage failures */
      }
    }, {
      readme: 'sellfileCreator.readme.seen.version',
      tutorial: 'sellfileCreator.tutorial.seen.version',
      version: 'test-version',
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.locator('[data-tour-id="preview.paper"]').waitFor()

    const hsfcInput = page.locator('input[type="file"][accept*=".hsfc"]').first()

    const start = await page.evaluate(() => performance.now())
    await hsfcInput.setInputFiles(LARGE_HSFC_PATH)

    const dbInput = page.locator('input[type="file"][accept*=".db"]').first()
    await dbInput.setInputFiles(LARGE_DB_PATH)

    const firstRow = page.locator('table tbody tr[data-row-index="0"]')
    await firstRow.waitFor({ timeout: 120_000 })

    const firstRowReady = page.locator('table tbody tr[data-row-index="0"] td')
    await firstRowReady.first().waitFor({ timeout: 120_000 })
    const firstRowEnd = await page.evaluate(() => performance.now())

    const elapsedMs = firstRowEnd - start

    testInfo.annotations.push({
      type: 'perf',
      description: `Large HSF first-row render: ${elapsedMs.toFixed(1)} ms`,
    })

    console.log(`Large HSF first-row render: ${elapsedMs.toFixed(1)} ms`)

    const gridContainer = page.locator('[data-tester-grid-container="true"]').first()
    await gridContainer.waitFor({ timeout: 120_000 })

    await page.evaluate(async () => {
      const container = document.querySelector('[data-tester-grid-container="true"]') as HTMLElement | null
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

    const parsed = testerLogs.map(parseLogLine).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

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
