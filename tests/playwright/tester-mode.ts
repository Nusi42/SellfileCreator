import { expect, type Page } from '@playwright/test'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'
import { dismissBlockingDialogs } from './dialog-helpers'

export const ensureTesterMode = async (page: Page): Promise<void> => {
  // Clear dialogs so the toggle click is not intercepted.
  await dismissBlockingDialogs(page)
  // Click the Rule Tester toggle to activate tester mode.
  const toggle = page.getByRole('button', { name: /Rule Tester/i })
  await expect(toggle).toBeVisible({ timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
  // Skip the click when tester mode is already active.
  const pressed = await toggle.getAttribute('aria-pressed')
  if (pressed !== 'true') {
    await toggle.click()
  }
  // Confirm the toggle reflects tester mode before returning.
  await expect(toggle).toHaveAttribute('aria-pressed', 'true', { timeout: PLAYWRIGHT_TIMEOUTS.expectDefault })
}
