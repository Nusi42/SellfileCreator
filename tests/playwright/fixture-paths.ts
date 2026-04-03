import path from 'node:path'

// Resolve the repo root once so fixture paths stay stable across test runs.
const REPO_ROOT = process.cwd()
// Shared test data lives under tests/data.
const TEST_DATA_DIR = path.resolve(REPO_ROOT, 'tests', 'data')
// Example exports live under examples/.
const EXAMPLES_DIR = path.resolve(REPO_ROOT, 'examples')

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
// Example SFC export from the bundled Example recipes.
export const EXAMPLE_NUSI_SFC_PATH = path.resolve(EXAMPLES_DIR, 'example.sfc')
// Large user DB paired with example.sfc for large-artifact-set coverage.
export const LARGE_ACCOUNT_DB_PATH = path.resolve(EXAMPLES_DIR, 'um109288203_RSLHelper.db')
