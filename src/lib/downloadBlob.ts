/**
 * downloadBlob.ts
 *
 * One definition of "hand this Blob to the browser as a download". Every export the
 * app offers — the sellfile, the SFC recipe save, the override-set backup — goes
 * through here, so the anchor dance and the object-URL lifetime are written once.
 * A browser-compat fix to the download path then lands in a single place instead of
 * having to be repeated (and inevitably missed) at each call site.
 */

/**
 * Trigger a browser download of `blob` under `filename`.
 *
 * The synthetic anchor never enters the document: a click on a detached element is
 * enough for a download in every browser the app supports, and keeping it out of the
 * DOM means nothing to clean up if the click throws. The object URL is revoked right
 * after the click, by which point the browser already owns the blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
  } finally {
    // Revoke even if the click threw, so a failed export cannot leak the blob.
    URL.revokeObjectURL(url)
  }
}
