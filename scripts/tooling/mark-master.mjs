#!/usr/bin/env node
/**
 * mark-master — marks the checkout it runs in as the publishing checkout
 * (`sfc.checkoutRole = master` in its local git config) and points core.hooksPath at the
 * tracked hooks, so its pre-push hook limits it to publishing `main` and release tags
 * (docs/technical/publishing.md). Idempotent.
 *
 *   node scripts/tooling/mark-master.mjs
 */
import { execFileSync } from 'node:child_process'
import { HOOKS_PATH, ROLE_KEY, markMaster } from './lib/checkout-role.mjs'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
markMaster(root)
console.log(`[checkout-role] ${root}: ${ROLE_KEY} = master, core.hooksPath = ${HOOKS_PATH}`)
