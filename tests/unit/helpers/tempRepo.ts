// Throw-away git repositories for the tests of the git hooks and the push plan
// (tests/unit/git-hooks.test.ts, tests/unit/push-plan.test.ts).
import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { withoutRepoEnv } from '../../../scripts/tooling/lib/checkout-role.mjs'

/** The object id git uses for "no object" in pre-push ref lines. */
export const ZERO_SHA = '0'.repeat(40)

/** A network remote URL (never contacted: the hook decides before anything is sent). */
export const NETWORK_URL = 'https://example.com/sfc.git'

/** The environment for git in the tests: no repository variables of a hook that runs the tests. */
export const testEnv = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({ ...withoutRepoEnv(process.env), ...extra })

/** Runs git in `dir`; throws on failure, returns stdout. */
export const git = (dir: string, args: readonly string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: testEnv(), stdio: ['ignore', 'pipe', 'pipe'] })

/** Runs git in `dir` with `env`; the result is not checked. */
export const gitRun = (dir: string, args: readonly string[], env: NodeJS.ProcessEnv): SpawnSyncReturns<string> =>
  spawnSync('git', args, { cwd: dir, env, encoding: 'utf8' })

/** git options that switch the hooks off for one command (test setup only). */
export const NO_HOOKS = ['-c', 'core.hooksPath=no-hooks'] as const

/** Commits `content` as `file` in `dir`, hooks off; returns the new commit's id. */
export const commitFile = (dir: string, file: string, content: string, message: string): string => {
  writeFileSync(join(dir, file), content)
  git(dir, ['add', file])
  git(dir, [...NO_HOOKS, 'commit', '-q', '-m', message])
  return git(dir, ['rev-parse', 'HEAD']).trim()
}

/** A new repository on `main` with a neutral identity and one commit (`clean`). */
export const initRepo = (dir: string): string => {
  git(tmpdir(), ['init', '-q', '-b', 'main', dir])
  git(dir, ['config', 'user.name', 'Sam Example'])
  git(dir, ['config', 'user.email', 'sam@example.net'])
  commitFile(dir, 'readme.txt', 'hello\n', 'clean')
  return dir
}

/** Runs `body` with a fresh temporary directory, removed afterwards. */
export const withTempDir = (prefix: string, body: (dir: string) => void): void => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  try {
    body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
