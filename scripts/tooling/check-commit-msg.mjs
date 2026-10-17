#!/usr/bin/env node
/**
 * check-commit-msg — enforces the commit message rules of scripts/tooling/lib/commit-message.mjs.
 *
 *   node scripts/tooling/check-commit-msg.mjs <message-file>   one message (commit-msg hook)
 *   node scripts/tooling/check-commit-msg.mjs --history [rev]  every commit reachable from rev
 *                                                              (default HEAD; `npm run check:commit-msg`)
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { commitMessageProblems, messageText } from './lib/commit-message.mjs'

const [mode, arg] = process.argv.slice(2)
const failures = []

if (mode === '--history') {
  // NUL-separated `<sha> <message>` records; git already strips comment lines from stored messages.
  const log = execFileSync('git', ['log', '--format=%H %B%x00', arg ?? 'HEAD'], { encoding: 'utf8', maxBuffer: 1 << 30 })
  const records = log.split('\0').map((r) => r.replace(/^\n+/, '')).filter((r) => r.trim() !== '')
  for (const record of records) {
    const sha = record.slice(0, 12)
    for (const problem of commitMessageProblems(messageText(record.slice(41)))) failures.push(`commit ${sha}: ${problem}`)
  }
  report(`${records.length} commits`)
} else if (mode !== undefined) {
  for (const problem of commitMessageProblems(messageText(fs.readFileSync(mode, 'utf8')))) failures.push(problem)
  report('the commit message')
} else {
  console.error('usage: check-commit-msg.mjs <message-file> | --history [rev]')
  process.exit(2)
}

// Print the verdict; any failure fails the hook or check.
function report(scanned) {
  if (failures.length === 0) {
    console.log(`commit-msg: ${scanned} ok`)
    return
  }
  for (const failure of failures) console.error(failure)
  console.error(`\ncommit-msg: ${failures.length} problem(s) in ${scanned}. See the commit message rules in CLAUDE.md; `
    + 'never bypass the check with --no-verify.')
  process.exitCode = 1
}
