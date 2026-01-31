import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { LANG_KEY } from '../../src/lib/constants'
import { DEFAULT_LANGUAGE } from '../../src/lib/i18n/types'
import { PLAYWRIGHT_TIMEOUTS } from './timeouts'

// Resolve package.json from repo root so Playwright can move.
const packageJsonPath = path.resolve(process.cwd(), 'package.json')

let cachedVersion: string | null = null

function readAppVersion(): string {
  if (cachedVersion) return cachedVersion
  const packageJsonRaw = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as { version?: unknown }
  const value = packageJsonRaw && typeof packageJsonRaw.version === 'string' ? packageJsonRaw.version : '0.0.0'
  cachedVersion = value
  return value
}

type PrepareAppOptions = {
  stubClipboard?: boolean
}

const README_KEY = 'sellfileCreator.readme.seen.version'
const TUTORIAL_KEY = 'sellfileCreator.tutorial.seen.version'
const AUTOSAVE_KEY = 'sellfileCreator.autosave.hsfc.v1'
// The preview filter drawer (and its "limit configs" toggles) is persisted in localStorage.
// Why: Playwright runs must start from a clean baseline so scroll/virtualization assertions match user repro steps.
const RULES_FILTER_OPEN_KEY = 'sellfileCreator.rulesFilter.open.v2'
const RULES_FILTER_STATE_KEY = 'sellfileCreator.rulesFilter.state.v3'
const RULES_FILTER_COLLAPSED_KEY = 'sellfileCreator.rulesFilter.collapse.v3'
const RULES_FILTER_SYNC_KEY = 'sellfileCreator.rulesFilter.sync.v1'
// Saved presets can carry filter + tester config filter modes that drastically change which rows render.
// Why: chip-scroll bugs are sensitive to row count/ordering, so avoid inheriting a previous developer preset.
const FILTER_PRESETS_KEY = 'sellfileCreator.filterPresets.v1'

// Share consistent navigation defaults across specs.
// Why: Firefox sometimes stalls on full load under heavy parallelism.
export const APP_GOTO_OPTIONS = {
  // Commit is enough; specs wait for specific UI signals before interacting.
  waitUntil: 'commit',
  // Allow a one-time boot budget before rebuilding or matching waits take over.
  timeout: PLAYWRIGHT_TIMEOUTS.appGoto,
} as const

export async function prepareApp(page: Page, options: PrepareAppOptions = {}): Promise<void> {
  const version = readAppVersion()
  const { stubClipboard = false } = options
  await page.addInitScript(
    ({
      readmeKey,
      tutorialKey,
      autosaveKey,
      langKey,
      langValue,
      versionValue,
      shouldStubClipboard,
      rulesFilterOpenKey,
      rulesFilterStateKey,
      rulesFilterCollapsedKey,
      rulesFilterSyncKey,
      filterPresetsKey,
    }) => {
      try {
        window.localStorage.setItem(readmeKey, versionValue)
      } catch {
        /* localStorage unavailable */
      }
      try {
        window.localStorage.setItem(tutorialKey, versionValue)
      } catch {
        /* localStorage unavailable */
      }
      // Force a deterministic locale so text-based selectors stay stable across browsers.
      try {
        window.localStorage.setItem(langKey, langValue)
      } catch {
        /* localStorage unavailable */
      }
      try {
        window.localStorage.removeItem(autosaveKey)
      } catch {
        /* localStorage unavailable */
      }
      // Clear filter state so tests start unfiltered by default.
      // Why: lingering filter/sync state changes the merged rules list and makes scroll tests flaky.
      for (const key of [rulesFilterOpenKey, rulesFilterStateKey, rulesFilterCollapsedKey, rulesFilterSyncKey, filterPresetsKey]) {
        try { window.localStorage.removeItem(key) } catch {}
      }
      try {
        Object.defineProperty(window, 'isSecureContext', {
          value: true,
          configurable: true,
        })
      } catch {
        /* unable to override secure context */
      }
      if (shouldStubClipboard) {
        try {
          const store = { text: '' }
          const clipboard = {
            writeText: async (value: string) => {
              store.text = value
            },
            readText: async () => store.text,
          }
          Object.defineProperty(window.navigator, 'clipboard', {
            value: clipboard,
            configurable: true,
          })
        } catch {
          /* clipboard override failed */
        }
      }
    },
    {
      readmeKey: README_KEY,
      tutorialKey: TUTORIAL_KEY,
      autosaveKey: AUTOSAVE_KEY,
      // Keep i18n storage key consistent with app constants.
      langKey: LANG_KEY,
      // Pin to the default production locale for test stability.
      langValue: DEFAULT_LANGUAGE,
      versionValue: version,
      shouldStubClipboard: stubClipboard,
      rulesFilterOpenKey: RULES_FILTER_OPEN_KEY,
      rulesFilterStateKey: RULES_FILTER_STATE_KEY,
      rulesFilterCollapsedKey: RULES_FILTER_COLLAPSED_KEY,
      rulesFilterSyncKey: RULES_FILTER_SYNC_KEY,
      filterPresetsKey: FILTER_PRESETS_KEY,
    },
  )
}

export const APP_VERSION = readAppVersion()
