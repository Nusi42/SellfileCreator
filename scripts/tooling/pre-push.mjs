#!/usr/bin/env node
/**
 * pre-push — the pre-push hook (.githooks/pre-push; docs/technical/publishing.md). Decides
 * from the checkout's role and the remote's URL what the push runs (lib/push-plan.mjs) and
 * runs it in the pushing checkout; a refusal names the command to use instead. git passes
 * the remote's name and URL as arguments and the ref lines on stdin.
 *
 * Runs on load, never behind an "is this the main module" test: a hook that silently did
 * nothing would let every push through. Never bypass it with `git push --no-verify`.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkoutRole, masterOf, parsePushLines, pushPlan } from './lib/push-plan.mjs'

// The checkout these scripts belong to (the hook's own); its scripts check the pushing one.
const scriptsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// Runs the plan for one push; returns the exit code.
function main([remote = '', url = remote]) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const input = fs.readFileSync(0, 'utf8')
  const plan = pushPlan({ role: checkoutRole(root), url, refs: parsePushLines(input), master: masterOf(root) })
  if ('refusal' in plan) {
    console.error(`pre-push: refused: ${plan.refusal}`)
    return 1
  }
  for (const step of plan.steps) {
    console.log(`pre-push: ${step.title}`)
    // npm is a .cmd shim on Windows, so it goes through the shell; node runs this checkout's script.
    const result = step.tool === 'node'
      ? spawnSync(process.execPath, [path.join(scriptsRoot, ...step.args[0].split('/')), ...step.args.slice(1)],
        { cwd: root, input: step.stdin ? input : '', stdio: ['pipe', 'inherit', 'inherit'] })
      : spawnSync(['npm', ...step.args].join(' '), { cwd: root, shell: true, stdio: ['ignore', 'inherit', 'inherit'] })
    if (result.status !== 0) {
      console.error(`pre-push: ${step.id} failed. Fix the findings; never push with --no-verify.`)
      return 1
    }
  }
  return 0
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (error) {
  console.error(`pre-push: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
