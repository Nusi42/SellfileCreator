import { expect, test } from '@playwright/test'
import path from 'node:path'

const LARGE_HSFC_PATH = path.resolve(
  process.cwd(),
  'samples',
  'Nusi_20251027_0035.hsfc',
)

test.describe('HSFC load performance', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Performance measurement currently tracks Chromium only.')

  test('measures time to preview ready for large HSFC', async ({ page }, testInfo) => {
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

    const restoreDismiss = page.locator('button:has-text("Dismiss")')
    if (await restoreDismiss.isVisible()) {
      await restoreDismiss.click()
    }

    const hsfcInput = page.locator('[data-tour-id="hsfc.load"] input[type="file"][accept*=".hsfc"]').first()
    await hsfcInput.waitFor({ state: 'attached', timeout: 10_000 })

    const start = await page.evaluate(() => performance.now())
    await hsfcInput.setInputFiles(LARGE_HSFC_PATH)

    const noteDialog = page.locator('role=dialog[name="Note"]')
    const noteCloseButton = noteDialog.locator('button:has-text("Close")').first()
    await noteDialog.waitFor({ state: 'visible', timeout: 120_000 })
    await noteCloseButton.waitFor({ state: 'visible', timeout: 120_000 })
    await expect(noteCloseButton).toBeEnabled({ timeout: 120_000 })
    const noteReady = await page.evaluate(() => performance.now())

    await noteCloseButton.click()

    const firstRow = page.locator('table tbody tr[data-row-index="0"]')
   await firstRow.waitFor({ timeout: 120_000 })
   const firstRowReady = await page.evaluate(() => performance.now())
    const noteDelay = noteReady - start
    const firstRowDelay = firstRowReady - start

    testInfo.annotations.push(
      { type: 'perf', description: `Large HSFC note ready: ${noteDelay.toFixed(1)} ms` },
      { type: 'perf', description: `Large HSFC first-row render: ${firstRowDelay.toFixed(1)} ms` },
    )

    console.log([
      `Large HSFC note ready: ${noteDelay.toFixed(1)} ms`,
      `Large HSFC first-row render: ${firstRowDelay.toFixed(1)} ms`,
    ].join(' | '))
  })
})
