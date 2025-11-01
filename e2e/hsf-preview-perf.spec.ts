import { test } from '@playwright/test'
import path from 'node:path'

const LARGE_HSF_PATH = path.resolve(
  process.cwd(),
  'samples',
  'Nusi_20251026_2232.hsf',
)

test.describe('HSF preview performance', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance measurement currently tracks Chromium only.')

  test('measures time to first row render for large HSF', async ({ page }, testInfo) => {
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

    const fileInput = page.locator('input[type="file"][accept=".hsf,application/json"]').first()

    const start = await page.evaluate(() => performance.now())
    await fileInput.setInputFiles(LARGE_HSF_PATH)

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
  })
})
