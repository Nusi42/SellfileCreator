/**
 * releaseRepo
 *
 * Where releases are published: the public GitHub repository named by `repository.url`
 * in package.json (injected by Vite define, like the app version). Everything that
 * points at releases (the update check, its link, the e2e stub) derives from it here.
 */

// During build, __RELEASE_REPO_URL__ is replaced with package.json `repository.url`.
declare const __RELEASE_REPO_URL__: string

/** The public repository, e.g. `https://github.com/<owner>/<repo>`; empty outside a Vite build. */
export const RELEASE_REPO_URL: string = typeof __RELEASE_REPO_URL__ !== 'undefined' ? __RELEASE_REPO_URL__ : ''

/** Page of the newest release of `repoUrl`, the one players are sent to. */
export const latestReleasePageUrl = (repoUrl: string): string => `${repoUrl}/releases/latest`

/** GitHub API endpoint returning the newest release of `repoUrl` (its `tag_name`). */
export const latestReleaseApiUrl = (repoUrl: string): string =>
  `${repoUrl.replace(/^https:\/\/github\.com\//, 'https://api.github.com/repos/')}/releases/latest`
