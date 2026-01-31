import path from 'node:path'

// Resolve the repo root once so fixture paths stay stable across test runs.
const REPO_ROOT = process.cwd()
// Shared test data lives under tests/data.
const TEST_DATA_DIR = path.resolve(REPO_ROOT, 'tests', 'data')
// Example exports live under examples/.
const EXAMPLES_DIR = path.resolve(REPO_ROOT, 'examples')

// Large HSFC fixture used by table-heavy Playwright scenarios.
export const SAMPLE_HSFC_PATH = path.resolve(TEST_DATA_DIR, 'sample.hsfc')
// Small HSFC fixture used by fast-path UI coverage.
export const SAMPLE_SMALL_HSFC_PATH = path.resolve(TEST_DATA_DIR, 'sample-small.hsfc')
// Small HSFC fixture with config options disabled for note-related tests.
export const SAMPLE_SMALL_HSFC_DISABLED_OPTIONS_PATH = path.resolve(TEST_DATA_DIR, 'sample-small-config-options-disabled.hsfc')
// Full-size DB fixture kept for unit/integration coverage.
export const SAMPLE_DB_PATH = path.resolve(TEST_DATA_DIR, 'sample.db')
// Slim DB fixture used by Playwright to keep matcher runs under 15s.
export const SAMPLE_SMALL_DB_PATH = path.resolve(TEST_DATA_DIR, 'sample-small.db')
// Example HSFC export from the bundled Example configs.
export const EXAMPLE_NUSI_HSFC_PATH = path.resolve(EXAMPLES_DIR, 'example.hsfc')
