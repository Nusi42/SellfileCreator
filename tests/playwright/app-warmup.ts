import { type Browser } from '@playwright/test'
import { APP_GOTO_OPTIONS, prepareApp } from './app-init'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'

export const warmupAppShell = async (browser: Browser): Promise<void> => {
  // Use a throwaway page so the real tests still start from a clean state.
  const warmupPage = await browser.newPage()
  // Prime localStorage so the shell renders without blocking dialogs.
  await prepareApp(warmupPage)
  // Trigger the first Vite compile before the real tests run.
  await warmupPage.goto('/', APP_GOTO_OPTIONS)
  // Resolve the builder heading so we can wait for a clear mount signal.
  const builderHeading = warmupPage.getByRole('heading', { name: 'Recipe Builder' })
  // Keep warmup best-effort so a slow cold compile does not fail the suite.
  try {
    // Wait briefly for the shell to mount so Vite finishes key modules when possible.
    await builderHeading.waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  } catch {
    // Continue even if the heading is slow; the warmup still kicks off compilation.
  }
  // Give the dev server a moment to continue compiling before closing the page.
  await warmupPage.waitForTimeout(PLAYWRIGHT_TIMEOUTS.uiPopover)
  // Close the warmup page so subsequent tests stay isolated.
  await warmupPage.close()
}
