import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageJsonPath = path.resolve(__dirname, '../package.json')

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

export async function prepareApp(page: Page, options: PrepareAppOptions = {}): Promise<void> {
  const version = readAppVersion()
  const { stubClipboard = false } = options
  await page.addInitScript(
    ({ readmeKey, tutorialKey, autosaveKey, versionValue, shouldStubClipboard }) => {
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
      try {
        window.localStorage.removeItem(autosaveKey)
      } catch {
        /* localStorage unavailable */
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
      versionValue: version,
      shouldStubClipboard: stubClipboard,
    },
  )
}

export const APP_VERSION = readAppVersion()
