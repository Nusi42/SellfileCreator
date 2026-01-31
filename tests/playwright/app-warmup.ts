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
  // Wait for the builder header to attach so the shell has mounted.
  await warmupPage.getByRole('heading', { name: 'Configs Builder' })
    .waitFor({ state: 'attached', timeout: PLAYWRIGHT_TIMEOUTS.appGoto })
  // Close the warmup page so subsequent tests stay isolated.
  await warmupPage.close()
}
