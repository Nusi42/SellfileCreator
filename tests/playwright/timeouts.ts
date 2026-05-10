// Centralized Playwright timeout values so specs stay consistent and easy to tune.
// Why: we want fast failures by default and only extend timeouts for known slow paths.

// Default test timeout for fast-fail UI coverage.
const TEST_TIMEOUT_DEFAULT_MS = 3_000
// Long timeout reserved for rule rebuilds or tester matching workloads.
const TEST_TIMEOUT_LONG_MS = 15_000
// Extra-long timeout for heavy setup flows like autosave restores.
const TEST_TIMEOUT_HEAVY_MS = 30_000
// XL timeout for hooks that run multiple sequential WASM passes (e.g. 2× passes on a 68 MB DB
// in large-db-duplication).
// Budget: 2 × ~30 s per context under full-suite CPU load.
const TEST_TIMEOUT_XL_MS = 90_000
// XXL timeout for midgame-progression: 3 sequential fresh contexts × (boot + SFC + dialog + WASM + render).
// Budget per mode: ~8 s overhead + ≤18 s workload-idle + ≤30 s card-render wait ≈ 56 s max.
// 3 modes: ~168 s. 180 s gives a 12 s buffer against transient slowness.
const TEST_TIMEOUT_XXL_MS = 180_000

// Default expect timeout for fast-fail UI assertions.
const EXPECT_TIMEOUT_DEFAULT_MS = 3_000
// Long expect timeout reserved for rule rebuilds or matching results.
const EXPECT_TIMEOUT_LONG_MS = 15_000

// Quick timeout used for "try-and-dismiss" UI operations.
const UI_TIMEOUT_QUICK_MS = 500
// Menu visibility timeout for context/menu popovers.
const UI_TIMEOUT_MENU_MS = 1_000
// Small overlay/popup timeout for optional dialogs.
const UI_TIMEOUT_POPOVER_MS = 1_000

// Default action timeout so clicks fail quickly when the UI is stuck.
const ACTION_TIMEOUT_MS = 3_000
// Navigation timeout for the app shell and initial loads.
const NAVIGATION_TIMEOUT_MS = 3_000
// Allow a one-time app boot budget while still failing fast elsewhere.
const APP_GOTO_TIMEOUT_MS = TEST_TIMEOUT_LONG_MS
// Workload idle budget for matcher rebuild waits.
const WORKLOAD_IDLE_TIMEOUT_MS = TEST_TIMEOUT_LONG_MS

export const PLAYWRIGHT_TIMEOUTS = {
  // Test timeouts.
  testDefault: TEST_TIMEOUT_DEFAULT_MS,
  // Long timeout reserved for rule rebuilds and tester matching.
  testLong: TEST_TIMEOUT_LONG_MS,
  // Extra-long timeout reserved for autosave restores and similar heavy setup.
  testHeavy: TEST_TIMEOUT_HEAVY_MS,
  // XL timeout for hooks that run multiple sequential WASM passes or large-DB evaluations.
  testXL: TEST_TIMEOUT_XL_MS,
  // XXL timeout for midgame-progression's 3-mode beforeAll (3 fresh contexts, each with WASM).
  testXXL: TEST_TIMEOUT_XXL_MS,
  // Expect timeouts.
  expectDefault: EXPECT_TIMEOUT_DEFAULT_MS,
  // Long expect timeout reserved for rebuild/matching waits.
  expectLong: EXPECT_TIMEOUT_LONG_MS,
  // UI quick/menus.
  uiQuick: UI_TIMEOUT_QUICK_MS,
  // Menu/popup visibility budget.
  uiMenu: UI_TIMEOUT_MENU_MS,
  // Optional overlay visibility budget.
  uiPopover: UI_TIMEOUT_POPOVER_MS,
  // Playwright global action timeout.
  action: ACTION_TIMEOUT_MS,
  // Playwright global navigation timeout.
  navigation: NAVIGATION_TIMEOUT_MS,
  // APP_GOTO_OPTIONS timeout.
  appGoto: APP_GOTO_TIMEOUT_MS,
  // Busy indicator idle wait.
  workloadIdle: WORKLOAD_IDLE_TIMEOUT_MS,
} as const
