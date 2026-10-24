import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadEnv } from 'vite'

/**
 * Where the asset pack is (scripts/vite/gameIconsPlugin.ts), so that every clone of
 * the repository finds it without per-clone setup:
 *   1. SFC_GAME_ASSETS_DIR from the environment or the clone's gitignored .env.local — an
 *      explicitly EMPTY value forces a placeholder build (the README recorder uses that);
 *   2. otherwise the first line of the user-level file GAME_ASSETS_DIR_FILE
 *      (%USERPROFILE%\.config\sellfilecreator\game-assets-dir.txt), shared by all clones;
 *   3. otherwise none: the build uses placeholder art.
 */
export const GAME_ASSETS_ENV = 'SFC_GAME_ASSETS_DIR'

/** User-level file naming the pack for every clone on this machine. */
export const GAME_ASSETS_DIR_FILE = join(homedir(), '.config', 'sellfilecreator', 'game-assets-dir.txt')

/**
 * The SFC_ settings a build sees: the clone's .env files under `root` for `mode`,
 * overridden by the process environment. Shared by vite.config.ts and the release
 * script's pack lookup (scripts/tooling/print-game-assets-dir.mjs), so both name the same pack.
 */
export function loadSfcEnv(mode: string, root: string): Record<string, string | undefined> {
  return { ...loadEnv(mode, root, 'SFC_'), ...process.env }
}

export function resolveGameAssetsDir(
  env: Readonly<Record<string, string | undefined>>,
  configFile: string = GAME_ASSETS_DIR_FILE,
): string | undefined {
  // An explicit setting wins, including an empty one (deliberate placeholder build).
  if (Object.prototype.hasOwnProperty.call(env, GAME_ASSETS_ENV) && env[GAME_ASSETS_ENV] !== undefined) {
    return env[GAME_ASSETS_ENV]?.trim() || undefined
  }
  if (!existsSync(configFile)) return undefined
  // First non-empty, non-comment line; surrounding quotes are tolerated.
  const line = readFileSync(configFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('#'))
  return line?.replace(/^["']|["']$/g, '') || undefined
}
