import path from 'node:path'

// Resolve the repo root once so fixture paths stay stable across test runs.
const REPO_ROOT = process.cwd()
// Shared test data lives under tests/data.
const TEST_DATA_DIR = path.resolve(REPO_ROOT, 'tests', 'data')
// Example DB fixtures live under examples/.
const EXAMPLES_DIR = path.resolve(REPO_ROOT, 'examples')
// Shipped preset SFCs live under presets/.
const PRESETS_DIR = path.resolve(REPO_ROOT, 'presets')

// Large SFC fixture used by table-heavy Playwright scenarios.
export const SAMPLE_SFC_PATH = path.resolve(TEST_DATA_DIR, 'sample.sfc')
// Small SFC fixture used by fast-path UI coverage.
export const SAMPLE_SMALL_SFC_PATH = path.resolve(TEST_DATA_DIR, 'sample-small.sfc')
// Small SFC fixture with recipe overrides disabled for note-related tests.
export const SAMPLE_SMALL_SFC_DISABLED_RECIPE_OVERRIDES_PATH = path.resolve(TEST_DATA_DIR, 'sample-small-recipe-overrides-disabled.sfc')
// Full-size DB fixture kept for unit/integration coverage.
export const SAMPLE_DB_PATH = path.resolve(TEST_DATA_DIR, 'sample.db')
// Slim DB fixture used by Playwright to keep matcher runs under 15s.
export const SAMPLE_SMALL_DB_PATH = path.resolve(TEST_DATA_DIR, 'sample-small.db')
// Shipped lategame preset — the comprehensive SFC bundled with releases.
export const PRESET_LATEGAME_SFC_PATH = path.resolve(PRESETS_DIR, 'lategame.sfc')
// Real RSLHelper DB capture in the slimmed export format (no ChampOverviewImage
// blobs, ~1.4 MB) — used by file-input tests (setInputFiles) and the WebSocket
// binary-endpoint memory test, which now sends it untrimmed.
export const LARGE_ACCOUNT_DB_PATH = path.resolve(EXAMPLES_DIR, 'um109288203_RSLHelper.db')

// All four real RSLHelper DB captures, in ascending size order (~708 KB → ~1.4 MB).
// Cycling these through the WASM pipeline varies the artifact-row buffer sizes so
// the talc allocator's free list accumulates mismatched holes — the memory
// fragmentation the warmup pre-grow is designed to absorb. Re-importing a single
// DB only exercises same-size alloc/free and never exposes that fragmentation.
export const EXAMPLE_RSLHELPER_DB_PATHS = [
  path.resolve(EXAMPLES_DIR, 'um27993749_RSLHelper.db'),
  path.resolve(EXAMPLES_DIR, 'um85268209_RSLHelper.db'),
  path.resolve(EXAMPLES_DIR, 'um53210834_RSLHelper.db'),
  path.resolve(EXAMPLES_DIR, 'um109288203_RSLHelper.db'),
] as const
