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
const AUTOSAVE_KEY = 'sellfileCreator.autosave.sfc.v1'
// The preview filter drawer (and its "limit recipes" toggles) is persisted in localStorage.
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

// GitHub Releases endpoint the app hits on mount (see src/hooks/useUpdateCheck.ts).
// Why intercept: the live call has no value during tests and runs into GitHub's anonymous
// rate limit (60/h/IP) the moment we enable parallel workers — every failed request prints
// a `[pw:error] Failed to load resource: 403` line that drowns the real test output. We
// fulfill with a tag matching the local version so the update banner stays hidden.
const UPDATE_CHECK_URL = 'https://api.github.com/repos/Nusi42/RslHelperSellfileCreator.Releases/releases/latest'

export async function prepareApp(page: Page, options: PrepareAppOptions = {}): Promise<void> {
  const version = readAppVersion()
  const { stubClipboard = false } = options
  // Stub the update check before any navigation so the fetch never escapes the test sandbox.
  // Returning the local version keeps `isRemoteNewer` false and the update banner suppressed.
  await page.route(UPDATE_CHECK_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tag_name: `v${version}` }),
    })
  })
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

  // Patch Playwright's WebSocket mock to decode binary frames with
  // Uint8Array.fromBase64 (Chrome 118+, native, sub-millisecond) instead of
  // the injected char-by-char atob loop.  For large binary frames the original
  // loop runs millions of charCodeAt iterations, blocking the renderer's main
  // thread long enough to trigger Chrome's slow-script killer.  The native
  // path avoids the intermediate atob string entirely.
  // This patch runs after Playwright's own webSocketMock init script (registered
  // by routeWebSocket before prepareApp is called), so __pwWebSocketDispatch is
  // already defined here.  With isBase64:false, dataToMessage returns the
  // ArrayBuffer directly without further copies.
  await page.addInitScript(`
    ;(() => {
      var orig = typeof globalThis.__pwWebSocketDispatch === 'function'
        ? globalThis.__pwWebSocketDispatch : null;
      if (!orig || typeof Uint8Array.fromBase64 !== 'function') return;
      globalThis.__pwWebSocketDispatch = function(req) {
        try {
          if (req && req.data && req.data.isBase64 && typeof req.data.data === 'string') {
            var bytes = Uint8Array.fromBase64(req.data.data);
            req = Object.assign({}, req, { data: { data: bytes.buffer, isBase64: false } });
          }
        } catch (_) {}
        return orig(req);
      };
    })();
  `)
}

export const APP_VERSION = readAppVersion()
