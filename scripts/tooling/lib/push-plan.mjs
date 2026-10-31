/**
 * push-plan — what the pre-push hook runs for a push, decided in one function, `pushPlan`,
 * from the pushing checkout's role and the remote's URL (docs/technical/publishing.md).
 * scripts/tooling/pre-push.mjs runs the plan. Tests: tests/unit/push-plan.test.ts (every
 * combination) and tests/unit/git-hooks.test.ts (the hooks themselves, run by git).
 *
 * - The publishing checkout (role `master`, see checkout-role.mjs) is the only checkout that
 *   pushes to a network remote, and it pushes only `main` and release tags `v<semver>`. It
 *   runs only checks that build nothing: the private-data guard on the pushed commits and on
 *   every tracked file, no merge commits, the dependency licenses. `main` only moves to a
 *   commit that passed the full check before it reached that checkout.
 * - A work folder (a clone whose `origin` is the publishing checkout's path) pushes only to local paths:
 *   the guard on the pushed commits, no merge commits, then `npm run check`.
 * - A plain clone (no publishing checkout) keeps the full checks for every push.
 * - Every other combination is refused.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gitIn, isMaster, originOf } from './checkout-role.mjs'

/** The remote the publishing checkout publishes to. */
export const PUBLIC_REMOTE = 'github'

/** The branch the publishing checkout publishes. */
export const PUBLISH_BRANCH = 'main'

/** The command that publishes `main` from the publishing checkout at `master`. */
export function publishCommand(master) {
  return `git -C "${master}" push ${PUBLIC_REMOTE} ${PUBLISH_BRANCH}`
}

// URLs that name a path on this machine; everything else is a network remote.
const LOCAL_URL = [
  /^[A-Za-z]:[\\/]/, // C:\… or C:/…
  /^\\\\/, // \\host\share
  /^\//, // /…
  /^\.\.?(?:[\\/]|$)/, // ./x, ../x
  /^file:\/\//i,
]

/**
 * Whether a remote URL is a local path (`C:\…`, `/…`, `../x`, `\\host\share`, `file://…`);
 * `https://…`, `ssh://…`, `git@host:…` and every other form are network remotes.
 */
export function isLocalUrl(url) {
  return LOCAL_URL.some((re) => re.test(url.trim()))
}

/** The directory a local remote URL names, resolved against the checkout `root`. */
export function localPath(root, url) {
  const trimmed = url.trim()
  return /^file:\/\//i.test(trimmed) ? fileURLToPath(trimmed) : path.resolve(root, trimmed)
}

/**
 * The publishing checkout a work folder pushes to (its local `origin`, marked as the master),
 * or `undefined` when the checkout has none.
 */
export function masterOf(root) {
  const origin = originOf(root)
  if (origin === undefined || !isLocalUrl(origin)) return undefined
  const dir = localPath(root, origin)
  return isMaster(dir) ? dir : undefined
}

/** The role of the checkout at `root`: `master`, `work` (a clone of the master) or `plain`. */
export function checkoutRole(root) {
  if (isMaster(root)) return 'master'
  return masterOf(root) === undefined ? 'plain' : 'work'
}

/** Parses git's pre-push ref lines (`<local ref> <local sha> <remote ref> <remote sha>`). */
export function parsePushLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 4)
    .map(([localRef, localSha, remoteRef, remoteSha]) => ({ localRef, localSha, remoteRef, remoteSha }))
}

// The object id git reports for "no object" (a deletion, a new ref).
const NO_OBJECT = /^0+$/

/** Whether the repository at `root` has the commit `sha`. */
export function hasCommit(root, sha) {
  return gitIn(root, ['cat-file', '-e', `${sha}^{commit}`]) !== undefined
}

/**
 * The revision arguments (`git log` / `git rev-list`) that select the commits a ref line
 * pushes: those on no remote-tracking branch and not under the remote's old value.
 * `undefined` for a deletion. `known(sha)` tells whether the repository has that commit.
 */
export function pushedRange(ref, known) {
  if (NO_OBJECT.test(ref.localSha)) return undefined
  const range = [ref.localSha, '--not', '--remotes']
  if (!NO_OBJECT.test(ref.remoteSha) && known(ref.remoteSha)) range.push(ref.remoteSha)
  return range
}

/** The merge commits (`<short sha> <subject>`) a ref line pushes from the repository at `root`. */
export function pushedMerges(root, ref) {
  const range = pushedRange(ref, (sha) => hasCommit(root, sha))
  if (range === undefined) return []
  const out = execFileSync('git', ['log', '--merges', '--format=%h %s', ...range], { cwd: root, encoding: 'utf8' })
  return out.split('\n').filter(Boolean)
}

// A release tag: `v` + a semantic version (the release scripts tag `v<package version>`).
const RELEASE_TAG_REF = /^refs\/tags\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Whether `ref` is a release tag (`refs/tags/v<semver>`). */
export function isReleaseTagRef(ref) {
  return RELEASE_TAG_REF.test(ref)
}

// Whether the publishing checkout may push this ref: `main` to `main`, or a release tag to itself.
const publishable = (ref) =>
  (ref.localRef === `refs/heads/${PUBLISH_BRANCH}` && ref.remoteRef === `refs/heads/${PUBLISH_BRANCH}`)
  || (ref.localRef === ref.remoteRef && isReleaseTagRef(ref.localRef))

/*
 * The steps a push may run. `node` steps name a script of the hook's own checkout and get
 * git's ref lines on stdin when `stdin` is set; `npm` steps run an npm script. All of them
 * run in the pushing checkout.
 */
const PRIVATE_PUSHED = {
  id: 'private-push',
  title: 'no private data in the pushed commits (messages, identities, file names, added lines)',
  tool: 'node',
  args: ['scripts/tooling/check-private.mjs', '--push'],
  stdin: true,
}
const LINEAR = {
  id: 'linear',
  title: 'no merge commits in the pushed history',
  tool: 'node',
  args: ['scripts/tooling/check-linear.mjs'],
  stdin: true,
}
const PRIVATE_TREE = {
  id: 'private',
  title: 'no private data in the tracked files',
  tool: 'node',
  args: ['scripts/tooling/check-private.mjs'],
  stdin: false,
}
const LICENSES = {
  id: 'licenses',
  title: 'dependency licenses',
  tool: 'node',
  args: ['scripts/tooling/check-licenses.mjs'],
  stdin: false,
}
const FULL_CHECK = {
  id: 'check',
  title: 'npm run check',
  tool: 'npm',
  args: ['run', '--silent', 'check'],
  stdin: false,
}

/**
 * What a push runs (`{ steps }`), or why it is refused (`{ refusal }`). `master` is the
 * publishing checkout's path, named in a work folder's refusal.
 */
export function pushPlan({ role, url, refs, master = '<master>' }) {
  const local = isLocalUrl(url)
  if (role === 'plain') return { steps: [PRIVATE_PUSHED, LINEAR, FULL_CHECK] }
  if (role === 'work') {
    if (local) return { steps: [PRIVATE_PUSHED, LINEAR, FULL_CHECK] }
    return {
      refusal:
        `a work folder pushes only to the master, not to ${url}.\n`
        + 'Push the branch to origin, fast-forward the master\'s main, then publish from it:\n'
        + `  ${publishCommand(master)}`,
    }
  }
  if (local) {
    return { refusal: `the master pushes only to the public remote, not to ${url}; work folders fetch from it instead.` }
  }
  const other = refs.filter((ref) => !publishable(ref))
  if (other.length > 0) {
    return {
      refusal: `the master publishes only ${PUBLISH_BRANCH} and release tags, not `
        + `${other.map((r) => `${r.localRef} -> ${r.remoteRef}`).join(', ')}.`,
    }
  }
  return { steps: [PRIVATE_PUSHED, LINEAR, PRIVATE_TREE, LICENSES] }
}
