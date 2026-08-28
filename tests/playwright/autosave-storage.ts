/**
 * autosave-storage.ts
 *
 * Read the SFC autosave entry back from the page's localStorage. The question the specs
 * ask is whether something was PERSISTED, which the UI cannot show — so they read storage
 * directly. One reader, so the key lookup and the entry shape live in one place.
 */
import type { Page } from '@playwright/test'
import { ACCOUNT_BASE_KEY_AUTOSAVE_SFC, accountScopedKeySuffix } from '../../src/lib/accounts'

// The autosave key is ACCOUNT-SCOPED at runtime (sellfileCreator.acc.<id>.…), so the
// exported constant does not name the key the page actually writes. The scoped key ends
// with this suffix (the app's own namespacing formula), which is how the reader finds it.
const AUTOSAVE_KEY_SUFFIX = accountScopedKeySuffix(ACCOUNT_BASE_KEY_AUTOSAVE_SFC)

/**
 * The stored SFC autosave payload, or null when the entry is missing or unreadable.
 * saveAutosave stores a `[crc, payload]` TUPLE, not an object with a payload field.
 */
export const readStoredAutosavePayload = async (page: Page): Promise<Record<string, unknown> | null> => {
  return page.evaluate((suffix) => {
    const key = Object.keys(window.localStorage).find((k) => k.endsWith(suffix))
    if (!key) return null
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    try {
      const entry = JSON.parse(raw) as [unknown, Record<string, unknown>]
      const payload = Array.isArray(entry) ? entry[1] : null
      return payload && typeof payload === 'object' ? payload : null
    } catch {
      return null
    }
  }, AUTOSAVE_KEY_SUFFIX)
}
