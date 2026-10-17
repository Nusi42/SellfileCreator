import path from 'node:path'
import { GEAR_DB_FIXTURES, gearDbPathFor } from '../../scripts/test/gear-db-fixtures.mjs'

// Resolve the repo root once so fixture paths stay stable across test runs.
const REPO_ROOT = process.cwd()
// Shared test data lives under tests/data.
const TEST_DATA_DIR = path.resolve(REPO_ROOT, 'tests', 'data')
// Shipped preset SFCs live under presets/.
const PRESETS_DIR = path.resolve(REPO_ROOT, 'presets')

// Large SFC fixture used by table-heavy Playwright scenarios.
export const SAMPLE_SFC_PATH = path.resolve(TEST_DATA_DIR, 'sample.sfc')
// Small SFC fixture used by fast-path UI coverage.
export const SAMPLE_SMALL_SFC_PATH = path.resolve(TEST_DATA_DIR, 'sample-small.sfc')
// Small SFC fixture with recipe overrides disabled for note-related tests.
export const SAMPLE_SMALL_SFC_DISABLED_RECIPE_OVERRIDES_PATH = path.resolve(TEST_DATA_DIR, 'sample-small-recipe-overrides-disabled.sfc')
// Gear DB fixtures below are built from committed SQL dumps by the Playwright global
// setup (tests/playwright/global-setup.ts) before any worker starts.
// Full-size DB fixture kept for unit/integration coverage.
export const SAMPLE_DB_PATH = gearDbPathFor(GEAR_DB_FIXTURES.sample)
// Slim DB fixture used by Playwright to keep matcher runs under 15s.
export const SAMPLE_SMALL_DB_PATH = gearDbPathFor(GEAR_DB_FIXTURES.sampleSmall)
// Shipped lategame preset — the comprehensive SFC bundled with releases.
export const PRESET_LATEGAME_SFC_PATH = path.resolve(PRESETS_DIR, 'lategame.sfc')
// Largest real-world roster (~8.4k artifacts) — used by file-input tests
// (setInputFiles) and the WebSocket binary-endpoint memory test.
export const LARGE_ACCOUNT_DB_PATH = gearDbPathFor(GEAR_DB_FIXTURES.accountD)

// All four real-world rosters, in ascending size order (~4.2k → ~8.4k artifacts).
// Cycling these through the WASM pipeline varies the artifact-row buffer sizes so
// the talc allocator's free list accumulates mismatched holes — the memory
// fragmentation the warmup pre-grow is designed to absorb. Re-importing a single
// DB only exercises same-size alloc/free and never exposes that fragmentation.
export const ACCOUNT_DB_PATHS = [
  gearDbPathFor(GEAR_DB_FIXTURES.accountA),
  gearDbPathFor(GEAR_DB_FIXTURES.accountB),
  gearDbPathFor(GEAR_DB_FIXTURES.accountC),
  LARGE_ACCOUNT_DB_PATH,
] as const
