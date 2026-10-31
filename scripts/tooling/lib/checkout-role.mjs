/**
 * checkout-role — which kind of checkout a repository is (docs/technical/publishing.md).
 *
 * A maintainer may keep one checkout as the publishing checkout (role `master`, recorded in
 * its local git config as `sfc.checkoutRole = master`) and do the work in clones (work folders) whose
 * `origin` is that checkout's path. scripts/tooling/lib/push-plan.mjs decides from the role
 * what a push runs; scripts/tooling/mark-master.mjs records the role.
 */
import { execFileSync } from 'node:child_process'

/** Where the tracked git hooks live, relative to the checkout root (core.hooksPath). */
export const HOOKS_PATH = '.githooks'

/** The local git config key that records a checkout's role. */
export const ROLE_KEY = 'sfc.checkoutRole'

/** The role of the publishing checkout. */
export const MASTER_ROLE = 'master'

// Variables git sets for hooks that would point `git -C <other repository>` back at the
// repository the hook runs in.
const REPO_ENV = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'GIT_OBJECT_DIRECTORY']

/** `env` without the variables that tie git to the repository a hook runs in. */
export function withoutRepoEnv(env) {
  const clean = { ...env }
  for (const name of REPO_ENV) delete clean[name]
  return clean
}

/**
 * Runs git in `dir` (without the hook's repository variables); the trimmed output, or
 * `undefined` when the command fails (no repository, unset key).
 */
export function gitIn(dir, args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: withoutRepoEnv(process.env), stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return undefined
  }
}

/** Whether the checkout at `dir` is marked as the publishing checkout. */
export function isMaster(dir) {
  return gitIn(dir, ['config', '--local', '--get', ROLE_KEY]) === MASTER_ROLE
}

/** The URL of the checkout's `origin` remote, or `undefined` when it has none. */
export function originOf(dir) {
  return gitIn(dir, ['config', '--get', 'remote.origin.url'])
}

/**
 * Points the checkout's git at the tracked hooks; idempotent. Returns whether the setting
 * changed.
 */
export function installHooks(dir) {
  if (gitIn(dir, ['config', '--local', '--get', 'core.hooksPath']) === HOOKS_PATH) return false
  gitIn(dir, ['config', '--local', 'core.hooksPath', HOOKS_PATH])
  return true
}

/**
 * Marks the checkout at `dir` as the publishing checkout and makes sure its hooks run (the
 * pre-push hook is what keeps it from pushing anything but `main` and release tags).
 */
export function markMaster(dir) {
  if (gitIn(dir, ['config', '--local', ROLE_KEY, MASTER_ROLE]) === undefined) {
    throw new Error(`cannot set ${ROLE_KEY} in ${dir}: not a git repository?`)
  }
  installHooks(dir)
}
