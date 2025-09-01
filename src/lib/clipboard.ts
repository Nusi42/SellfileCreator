/**
 * clipboard.ts
 *
 * Safe clipboard helpers used across the app. Provides best-effort wrappers
 * around the async Clipboard API and a fallback event to trigger the manual
 * copy dialog in App when direct clipboard access is blocked.
 */

export const COPY_DIALOG_EVENT = 'open-copy-dialog'

/** Try to write text to the clipboard. Returns true on success, false otherwise. */
export async function writeTextSafe(text: string): Promise<boolean> {
  try {
    if (!window.isSecureContext) return false
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Try to read text from the clipboard. Returns string on success, null on failure. */
export async function readTextSafe(): Promise<string | null> {
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') return null
    const t = await navigator.clipboard.readText()
    return t ?? ''
  } catch {
    return null
  }
}

/** Dispatch an event to request opening the manual copy dialog with given content. */
export function triggerCopyDialog(text: string): void {
  try {
    const ev = new CustomEvent(COPY_DIALOG_EVENT, { detail: text })
    window.dispatchEvent(ev)
  } catch {}
}

