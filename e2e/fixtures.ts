import { test as base } from '@playwright/test'
import type { ConsoleMessage } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    const consoleListener = (message: ConsoleMessage) => {
      const location = message.location()
      const locationSuffix = location?.url
        ? ` (${location.url}${typeof location.lineNumber === 'number' ? `:${location.lineNumber}` : ''}${
            typeof location.columnNumber === 'number' ? `:${location.columnNumber}` : ''
          })`
        : ''
      const prefix = `[pw:${message.type()}]`
      const text = message.text()
      const output = `${prefix} ${text}${locationSuffix}`
      if (message.type() === 'error') {
        console.error(output)
      } else if (message.type() === 'warning') {
        console.warn(output)
      } else {
        console.log(output)
      }
    }
    const pageErrorListener = (error: Error) => {
      console.error(`[pw:pageerror] ${error.message}`)
      if (error.stack) {
        console.error(error.stack)
      }
    }
    page.on('console', consoleListener)
    page.on('pageerror', pageErrorListener)
    try {
      await use(page)
    } finally {
      page.off('console', consoleListener)
      page.off('pageerror', pageErrorListener)
    }
  },
})

export const expect = test.expect
