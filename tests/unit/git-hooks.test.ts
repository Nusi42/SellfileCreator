/* eslint import/no-unused-modules: off */
// The tracked git hooks (.githooks/) as git runs them, in throw-away repositories with
// synthetic private patterns: the pre-commit guard, the push plan of the pre-push hook
// (scripts/tooling/pre-push.mjs, decided by scripts/tooling/lib/push-plan.mjs) and the
// command that marks the publishing checkout.
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { HOOKS_PATH, MASTER_ROLE, ROLE_KEY, markMaster } from '../../scripts/tooling/lib/checkout-role.mjs'
import { PATTERNS_ENV } from '../../scripts/tooling/lib/private-patterns.mjs'
import { publishCommand } from '../../scripts/tooling/lib/push-plan.mjs'
import { commitFile, git, gitRun, initRepo, NETWORK_URL, NO_HOOKS, testEnv, withTempDir, ZERO_SHA } from './helpers/tempRepo.js'

// The unit tests run from the repository root (scripts/test/run-tests.mjs).
const root = process.cwd()
const hooks = join(root, HOOKS_PATH)

// The hooks call their own checkout's scripts, so they work from any core.hooksPath.
test('the hooks run the scripts next to them, the pre-push hook through the push plan', () => {
  const hook = (name: string): string => readFileSync(join(hooks, name), 'utf8')
  assert.match(hook('pre-commit'), /^exec node "\$\(dirname "\$0"\)\/\.\.\/scripts\/tooling\/check-private\.mjs" --staged$/m)
  assert.match(hook('commit-msg'), /^node "\$\(dirname "\$0"\)\/\.\.\/scripts\/tooling\/check-commit-msg\.mjs" "\$1" \|\| exit 1$/m)
  assert.match(hook('commit-msg'), /^exec node "\$\(dirname "\$0"\)\/\.\.\/scripts\/tooling\/check-private\.mjs" --message "\$1"$/m)
  assert.match(hook('pre-push'), /^exec node "\$\(dirname "\$0"\)\/\.\.\/scripts\/tooling\/pre-push\.mjs" "\$@"$/m)
})

test('marking the publishing checkout records its role and turns its hooks on', () => {
  withTempDir('sfc-mark-', (base) => {
    const repo = initRepo(join(base, 'repo'))
    const run = spawnSync(process.execPath, [join(root, 'scripts', 'tooling', 'mark-master.mjs')], { cwd: repo, env: testEnv(), encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    assert.equal(git(repo, ['config', '--local', '--get', ROLE_KEY]).trim(), MASTER_ROLE)
    assert.equal(git(repo, ['config', '--local', '--get', 'core.hooksPath']).trim(), HOOKS_PATH)
  })
})

/**
 * A publishing checkout and a work folder cloned from it, both using this checkout's hooks,
 * and an environment with a synthetic private pattern. The work folder's `npm run check` is
 * a stub that prints a marker, so a test sees when the full check runs.
 */
function hookedRepos(base: string) {
  const patterns = join(base, 'patterns.txt')
  writeFileSync(patterns, '\\bjoanne\\b\n')
  const env = testEnv({ [PATTERNS_ENV]: patterns })
  const master = initRepo(join(base, 'master'))
  markMaster(master)
  git(master, ['config', 'core.hooksPath', hooks])
  const work = join(base, 'work')
  git(base, ['clone', '-q', master, work])
  for (const [key, value] of [['user.name', 'Sam Example'], ['user.email', 'sam@example.net'], ['core.hooksPath', hooks]] as const) {
    git(work, ['config', key, value])
  }
  commitFile(work, 'package.json', JSON.stringify({ scripts: { check: 'node -e "console.log(\'stub-check-ran\')"' } }), 'build(x): stub check')
  /** git with the hooks on; the result is not checked. */
  const hooked = (dir: string, args: readonly string[]) => gitRun(dir, args, env)
  /** Runs the pre-push hook as git would for a push to `url`, with `lines` on stdin. */
  const prePush = (dir: string, url: string, lines: string) => {
    const stdin = join(base, 'push-lines.txt')
    writeFileSync(stdin, lines)
    return hooked(dir, ['hook', 'run', `--to-stdin=${stdin}`, 'pre-push', '--', 'github', url])
  }
  return { master, work, hooked, prePush }
}

test('pre-commit: a staged file with a private value fails the commit', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { work, hooked } = hookedRepos(base)
    writeFileSync(join(work, 'b.txt'), 'mail joanne\n')
    git(work, ['add', 'b.txt'])
    const commit = hooked(work, ['commit', '-q', '-m', 'feat(x): add b'])
    assert.notEqual(commit.status, 0)
    assert.match(commit.stderr, /b\.txt:1:\d+/)
    assert.equal(git(work, ['log', '--format=%s', '-1']).trim(), 'build(x): stub check')
  })
})

test('pre-commit: a session id in a note\'s front matter fails the commit, also when indented', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { work, hooked } = hookedRepos(base)
    for (const line of ['originSessionId: 1234', 'metadata:\n  originSessionId: 1234']) {
      writeFileSync(join(work, 'note.md'), `---\nname: x\n${line}\n---\nbody\n`)
      git(work, ['add', 'note.md'])
      const commit = hooked(work, ['commit', '-q', '-m', 'docs(x): add a note'])
      assert.notEqual(commit.status, 0, line)
      assert.match(commit.stderr, /originSessionId line/)
    }
  })
})

test('pre-push: a work folder\'s push to the master runs the guard, then the full check', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { master, work, hooked } = hookedRepos(base)
    const clean = hooked(work, ['push', 'origin', 'HEAD:refs/heads/WIN1'])
    assert.equal(clean.status, 0, clean.stderr)
    assert.match(clean.stdout, /stub-check-ran/)
    assert.notEqual(git(master, ['branch', '--list', 'WIN1']).trim(), '')

    commitFile(work, 'p.txt', 'to joanne\n', 'feat(x): add p')
    const push = hooked(work, ['push', 'origin', 'HEAD:refs/heads/WIN2'])
    assert.notEqual(push.status, 0)
    assert.match(push.stderr, /pre-push: private-push failed/)
    assert.doesNotMatch(push.stdout, /stub-check-ran/)
    assert.equal(git(master, ['branch', '--list', 'WIN2']).trim(), '')
  })
})

test('pre-push: a merge commit never reaches the master', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { master, work, hooked } = hookedRepos(base)
    git(work, ['switch', '-q', '-c', 'side'])
    commitFile(work, 's.txt', 'side\n', 'feat(x): side')
    git(work, ['switch', '-q', 'main'])
    commitFile(work, 'm.txt', 'main\n', 'feat(x): main')
    git(work, [...NO_HOOKS, 'merge', '-q', '--no-ff', '-m', 'Merge the side', 'side'])
    const push = hooked(work, ['push', 'origin', 'HEAD:refs/heads/WIN1'])
    assert.notEqual(push.status, 0)
    assert.match(push.stderr, /^merge commit [0-9a-f]+ Merge the side$/m)
    assert.match(push.stderr, /pre-push: linear failed/)
    assert.equal(git(master, ['branch', '--list', 'WIN1']).trim(), '')
  })
})

test('pre-push: a work folder never pushes to a network remote', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { master, work, prePush } = hookedRepos(base)
    const head = git(work, ['rev-parse', 'HEAD']).trim()
    const run = prePush(work, NETWORK_URL, `refs/heads/main ${head} refs/heads/main ${ZERO_SHA}\n`)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /a work folder pushes only to the master/)
    assert.ok(run.stderr.includes(publishCommand(resolve(master))), run.stderr)
  })
})

test('pre-push: the master never pushes to a local path', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { master, hooked } = hookedRepos(base)
    const bare = join(base, 'bare.git')
    git(base, ['init', '-q', '--bare', bare])
    const push = hooked(master, ['push', bare, 'main'])
    assert.notEqual(push.status, 0)
    assert.match(push.stderr, /the master pushes only to the public remote/)
    assert.equal(git(bare, ['branch', '--list']).trim(), '')
  })
})

test('pre-push: the master publishes only main, with checks that build nothing', () => {
  withTempDir('sfc-hooks-', (base) => {
    const { master, prePush } = hookedRepos(base)
    const head = git(master, ['rev-parse', 'HEAD']).trim()
    const other = prePush(master, NETWORK_URL, `refs/heads/x ${head} refs/heads/x ${ZERO_SHA}\n`)
    assert.equal(other.status, 1)
    assert.match(other.stderr, /the master publishes only main/)

    // Clean main: the guard and the linear check pass and the tree scan and license check
    // run (`git hook run` sends the hook's output to stderr).
    const main = prePush(master, NETWORK_URL, `refs/heads/main ${head} refs/heads/main ${ZERO_SHA}\n`)
    assert.match(main.stderr, /no merge commits to push/)
    assert.match(main.stderr, /pre-push: no private data in the tracked files/)
    assert.match(main.stderr, /pre-push: dependency licenses/)

    const sha = commitFile(master, 'p.txt', 'to joanne\n', 'feat(x): add p')
    const blocked = prePush(master, NETWORK_URL, `refs/heads/main ${sha} refs/heads/main ${ZERO_SHA}\n`)
    assert.equal(blocked.status, 1)
    assert.match(blocked.stderr, /pre-push: private-push failed/)
  })
})
