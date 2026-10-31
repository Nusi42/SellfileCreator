/* eslint import/no-unused-modules: off */
// The push decision (scripts/tooling/lib/push-plan.mjs): every combination of checkout role,
// remote URL and pushed refs. The hooks themselves, run by git: tests/unit/git-hooks.test.ts.
import { strict as assert } from 'node:assert'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { markMaster } from '../../scripts/tooling/lib/checkout-role.mjs'
import {
  checkoutRole,
  isLocalUrl,
  isReleaseTagRef,
  localPath,
  masterOf,
  parsePushLines,
  publishCommand,
  pushedMerges,
  pushedRange,
  pushPlan,
  type PushPlan,
  type PushRef,
} from '../../scripts/tooling/lib/push-plan.mjs'
import { commitFile, git, initRepo, NETWORK_URL, NO_HOOKS, withTempDir, ZERO_SHA } from './helpers/tempRepo.js'

const SHA = '1'.repeat(40)
const LOCAL = 'C:\\w\\master'

// A ref line that pushes `localRef` to `remoteRef` as a new ref.
const ref = (localRef: string, remoteRef = localRef): PushRef => ({ localRef, localSha: SHA, remoteRef, remoteSha: ZERO_SHA })
const MAIN = ref('refs/heads/main')

// The step ids of a plan, or its refusal text.
const stepIds = (plan: PushPlan): string[] | string => ('steps' in plan ? plan.steps.map((s) => s.id) : plan.refusal)

test('paths are local remotes, everything else is a network remote', () => {
  for (const url of ['C:\\Users\\x\\sfc', 'c:/x/sfc', '/home/x/sfc', '../sfc', './sfc', '..', '\\\\host\\share\\sfc', 'file:///C:/x/sfc', 'FILE://host/share']) {
    assert.equal(isLocalUrl(url), true, url)
  }
  for (const url of [NETWORK_URL, 'http://example.org/x', 'ssh://git@example.org/x.git', 'git@example.org:x/sfc.git', 'git://example.org/x', 'example.org:x']) {
    assert.equal(isLocalUrl(url), false, url)
  }
})

test('a local URL names a directory relative to the checkout', () => {
  assert.equal(localPath(resolve('/w/sfc-1'), '../master'), resolve('/w/master'))
  const master = resolve('/w/master')
  assert.equal(localPath(resolve('/w/sfc-1'), pathToFileURL(master).href), master)
})

test('git\'s ref lines are parsed, incomplete lines skipped', () => {
  assert.deepEqual(parsePushLines(`refs/heads/main ${SHA} refs/heads/main ${ZERO_SHA}\r\n\nbroken line\n`), [MAIN])
})

test('the pushed range excludes remote-tracking branches and the remote\'s old value', () => {
  assert.deepEqual(pushedRange(MAIN, () => true), [SHA, '--not', '--remotes'])
  const old = '2'.repeat(40)
  const update = { ...MAIN, remoteSha: old }
  assert.deepEqual(pushedRange(update, () => true), [SHA, '--not', '--remotes', old])
  // An old value this repository does not have cannot be excluded by name.
  assert.deepEqual(pushedRange(update, () => false), [SHA, '--not', '--remotes'])
  assert.equal(pushedRange({ ...MAIN, localSha: ZERO_SHA }, () => true), undefined)
})

test('release tags are v plus a semantic version', () => {
  for (const tag of ['refs/tags/v1.0.49', 'refs/tags/v2.10.0-rc.1']) assert.equal(isReleaseTagRef(tag), true, tag)
  for (const tag of ['refs/tags/1.0.49', 'refs/tags/v1.0', 'refs/tags/latest', 'refs/heads/v1.0.49']) assert.equal(isReleaseTagRef(tag), false, tag)
})

test('a plain clone runs the full checks for every push', () => {
  for (const url of [LOCAL, NETWORK_URL]) {
    assert.deepEqual(stepIds(pushPlan({ role: 'plain', url, refs: [ref('refs/heads/x')] })), ['private-push', 'linear', 'check'])
  }
})

test('a work folder pushes to a local path with the full checks', () => {
  assert.deepEqual(stepIds(pushPlan({ role: 'work', url: LOCAL, refs: [ref('refs/heads/WIN1')] })), ['private-push', 'linear', 'check'])
})

test('a work folder never pushes to a network remote; the refusal names the publishing command', () => {
  const plan = pushPlan({ role: 'work', url: NETWORK_URL, refs: [MAIN], master: LOCAL })
  assert.ok('refusal' in plan)
  assert.ok(plan.refusal.includes(publishCommand(LOCAL)), plan.refusal)
  assert.equal(publishCommand(LOCAL), 'git -C "C:\\w\\master" push github main')
})

test('the master never pushes to a local path', () => {
  const plan = pushPlan({ role: 'master', url: '../sfc-1', refs: [MAIN] })
  assert.ok('refusal' in plan)
  assert.match(plan.refusal, /pushes only to the public remote/)
})

test('the master publishes main and release tags with checks that build nothing', () => {
  const light = ['private-push', 'linear', 'private', 'licenses']
  assert.deepEqual(stepIds(pushPlan({ role: 'master', url: NETWORK_URL, refs: [MAIN] })), light)
  assert.deepEqual(stepIds(pushPlan({ role: 'master', url: NETWORK_URL, refs: [MAIN, ref('refs/tags/v1.0.50')] })), light)
  assert.deepEqual(stepIds(pushPlan({ role: 'master', url: NETWORK_URL, refs: [ref('refs/tags/v1.0.50')] })), light)
})

test('the master refuses every other ref', () => {
  const others = [
    ref('refs/heads/WIN1'),
    ref('refs/heads/main', 'refs/heads/dev'),
    ref('refs/heads/x', 'refs/heads/main'),
    ref('refs/tags/latest'),
    ref('refs/tags/v1.0.1', 'refs/tags/v1.0.2'),
  ]
  for (const other of others) {
    const plan = pushPlan({ role: 'master', url: NETWORK_URL, refs: [MAIN, other] })
    assert.ok('refusal' in plan, other.localRef)
    assert.ok(plan.refusal.includes(`${other.localRef} -> ${other.remoteRef}`), plan.refusal)
  }
})

test('roles come from the git config of the checkout and of its origin', () => {
  withTempDir('sfc-role-', (base) => {
    const master = initRepo(join(base, 'master'))
    const clone = join(base, 'clone')
    git(base, ['clone', '-q', master, clone])
    // Not marked yet: a clone of an unmarked checkout is a plain clone.
    assert.equal(checkoutRole(master), 'plain')
    assert.equal(checkoutRole(clone), 'plain')
    markMaster(master)
    assert.equal(checkoutRole(master), 'master')
    assert.equal(checkoutRole(clone), 'work')
    assert.equal(masterOf(clone), resolve(master))
    // A network origin is never the master.
    git(clone, ['remote', 'set-url', 'origin', NETWORK_URL])
    assert.equal(checkoutRole(clone), 'plain')
    assert.equal(masterOf(clone), undefined)
  })
})

test('the merge commits a push adds are found; those the remote has are not', () => {
  withTempDir('sfc-merges-', (base) => {
    const repo = initRepo(join(base, 'repo'))
    const start = git(repo, ['rev-parse', 'HEAD']).trim()
    git(repo, ['switch', '-q', '-c', 'side'])
    commitFile(repo, 's.txt', 'side\n', 'feat(x): side')
    git(repo, ['switch', '-q', 'main'])
    commitFile(repo, 'm.txt', 'main\n', 'feat(x): main')
    git(repo, [...NO_HOOKS, 'merge', '-q', '--no-ff', '-m', 'Merge the side', 'side'])
    const head = git(repo, ['rev-parse', 'HEAD']).trim()
    const line = { localRef: 'refs/heads/main', localSha: head, remoteRef: 'refs/heads/main', remoteSha: start }
    assert.deepEqual(pushedMerges(repo, line).map((m) => m.replace(/^\S+ /, '')), ['Merge the side'])
    assert.deepEqual(pushedMerges(repo, { ...line, remoteSha: head }), [])
  })
})
