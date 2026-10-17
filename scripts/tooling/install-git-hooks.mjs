#!/usr/bin/env node
/**
 * install-git-hooks — points git at the tracked hooks in .githooks/ (pre-commit,
 * commit-msg, pre-push: the private-data guard and the commit message rules).
 * Runs from `npm install` / `npm ci` via the `prepare` script; idempotent, and a no-op
 * outside a git work tree (e.g. an extracted source archive).
 */
import { execFileSync } from 'node:child_process'

const HOOKS_PATH = '.githooks'

// Run git quietly; `undefined` when the command fails (no repository, unset key).
const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return undefined
  }
}

if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') {
  console.log('[git-hooks] not a git work tree; skipping hook installation')
} else if (git(['config', '--local', '--get', 'core.hooksPath']) === HOOKS_PATH) {
  console.log(`[git-hooks] already using ${HOOKS_PATH}/`)
} else {
  execFileSync('git', ['config', '--local', 'core.hooksPath', HOOKS_PATH])
  console.log(`[git-hooks] installed: core.hooksPath = ${HOOKS_PATH}`)
}
