/**
 * useUpdateCheck
 *
 * On mount, queries the GitHub Releases API for the latest release tag and
 * compares it against the bundled APP_VERSION. If the remote tag is strictly
 * newer, exposes the info so the caller can render an update banner.
 *
 * Failures (network error, CORS, offline) are silently swallowed — the check
 * is best-effort and must never break the app. Dismissal is stored in
 * localStorage keyed by the dismissed tag, so the banner re-appears whenever
 * a further-newer release is published.
 */
import { useEffect, useState } from 'react'
import { APP_VERSION } from '../version'
import { UPDATE_DISMISSED_VERSION_KEY } from '../lib/constants'
import { RELEASE_REPO_URL, latestReleaseApiUrl, latestReleasePageUrl } from '../lib/releaseRepo'

export type UpdateCheckResult = {
  latestVersion: string
  releaseUrl: string
}

// Parses "v1.2.3" or "1.2.3-dev" into a [major, minor, patch] number triple.
function parseVersionTuple(v: string): [number, number, number] {
  const base = v.replace(/^v/, '').split('-')[0] ?? ''
  const parts = base.split('.').map((n) => parseInt(n, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

// Returns true only when the remote tag is strictly greater than the local version.
function isRemoteNewer(remote: string, local: string): boolean {
  const [rMaj, rMin, rPat] = parseVersionTuple(remote)
  const [lMaj, lMin, lPat] = parseVersionTuple(local)
  if (rMaj !== lMaj) return rMaj > lMaj
  if (rMin !== lMin) return rMin > lMin
  return rPat > lPat
}

// Returns the tag the user last dismissed, or null if not set / storage unavailable.
function readDismissedTag(): string | null {
  try { return localStorage.getItem(UPDATE_DISMISSED_VERSION_KEY) } catch { return null }
}

export function useUpdateCheck(): { update: UpdateCheckResult | null; dismiss: () => void } {
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    // No repository configured (a build without package.json metadata): nothing to check.
    if (!RELEASE_REPO_URL) return
    const controller = new AbortController()

    // credentials:'omit' ensures the request carries no cookies; GitHub's
    // Access-Control-Allow-Origin:* header then passes CORS even from file://.
    fetch(latestReleaseApiUrl(RELEASE_REPO_URL), { credentials: 'omit', signal: controller.signal })
      .then((r) => r.json() as Promise<unknown>)
      .then((data) => {
        if (typeof data !== 'object' || data === null) return
        const tag = (data as Record<string, unknown>).tag_name
        if (typeof tag !== 'string') return
        // Skip if neither newer than the local build nor newer than the previously dismissed tag.
        if (!isRemoteNewer(tag, APP_VERSION)) return
        if (readDismissedTag() === tag) return
        setUpdate({ latestVersion: tag.replace(/^v/, ''), releaseUrl: latestReleasePageUrl(RELEASE_REPO_URL) })
      })
      .catch(() => { /* silently ignore — network error, CORS, rate limit, etc. */ })

    // Abort the in-flight request if the component unmounts before it resolves.
    return () => { controller.abort() }
  }, [])

  const dismiss = (): void => {
    // Store the exact tag so only a further-newer release will re-show the banner.
    if (update) {
      try { localStorage.setItem(UPDATE_DISMISSED_VERSION_KEY, `v${update.latestVersion}`) } catch { /* storage unavailable */ }
    }
    setUpdate(null)
  }

  return { update, dismiss }
}
