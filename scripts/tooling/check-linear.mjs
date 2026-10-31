#!/usr/bin/env node
/**
 * check-linear — no merge commits in what a push adds (docs/technical/publishing.md).
 * Branches are combined by rebasing onto the target and fast-forwarding, so `main` stays a
 * straight line; old merge commits stay as they are. Run by the pre-push hook
 * (lib/push-plan.mjs); reads git's ref lines on stdin and checks the pushing checkout.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { parsePushLines, pushedMerges } from './lib/push-plan.mjs'

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
// Every merge commit the pushed refs would add to the remote.
const merges = parsePushLines(fs.readFileSync(0, 'utf8')).flatMap((ref) => pushedMerges(root, ref))

if (merges.length === 0) {
  console.log('linear: no merge commits to push')
} else {
  for (const merge of merges) console.error(`merge commit ${merge}`)
  console.error(`\nlinear: ${merges.length} merge commit(s) in the push. Combine branches by rebasing onto the `
    + 'target branch (`git rebase <target>`, then `git merge --ff-only`), never with a merge commit.')
  process.exitCode = 1
}
