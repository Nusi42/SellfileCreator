#!/usr/bin/env node
/**
 * install-git-hooks — points git at the tracked hooks in .githooks/ (pre-commit,
 * commit-msg, pre-push: the private-data guard, the commit message rules and the push plan).
 * Runs from `npm install` / `npm ci` via the `prepare` script; idempotent, and a no-op
 * outside a git work tree (e.g. an extracted source archive).
 */
import { HOOKS_PATH, gitIn, installHooks } from './lib/checkout-role.mjs'

const dir = process.cwd()
if (gitIn(dir, ['rev-parse', '--is-inside-work-tree']) !== 'true') {
  console.log('[git-hooks] not a git work tree; skipping hook installation')
} else if (installHooks(dir)) {
  console.log(`[git-hooks] installed: core.hooksPath = ${HOOKS_PATH}`)
} else {
  console.log(`[git-hooks] already using ${HOOKS_PATH}/`)
}
