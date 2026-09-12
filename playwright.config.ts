import { defineConfig, devices } from '@playwright/test';
import { cpus } from 'node:os';
import { PLAYWRIGHT_TIMEOUTS } from './tests/playwright/timeouts';

// Shared root for Playwright artifact output so per-browser runs stay isolated.
const PLAYWRIGHT_RESULTS_ROOT = 'test-results';

// Default Desktop Chrome / Firefox viewport — used both as the implicit viewport for the
// general projects and as the video recording size for those projects. Playwright's default
// video size is 800x450 regardless of viewport, which downscales captures and makes them
// blurry; pinning size to the viewport keeps videos pixel-accurate.
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

// Second viewport pass: full-HD layout to catch regressions specific to wider screens.
// Why: the default viewport is 1280x720, which hides layout bugs that only surface at 1080p
// (e.g. truncated chips, overflow handling, alternative column counts). FHD projects record
// video at this same size so the captured frames match what the test actually saw.
const FHD_VIEWPORT = { width: 1920, height: 1080 };

// Upper bound on local workers, independent of core count.
//
// A bare "50%" over-subscribes a high-core workstation: each worker drives its own
// Chromium against the ~15 MB single-file bundle, so on a 32-core box that is 16 browsers
// competing for memory bandwidth and the GPU process. The app then misses ordinary
// action budgets and tests fail on wall-clock, not on behavior — a false red that looks
// exactly like a product regression. Measured on this repo: note-overrides-preset-file,
// simple-mode-custom-tab and safeguard-groups failed 2-3 of 24 at 16 workers, and passed
// 24/24 at 4, same commit and machine.
//
// 8 keeps the speedup on 8-16 core machines (where 50% already lands at or under the cap,
// so nothing changes) while stopping the runaway above that. Raising this is not the fix
// for a slow spec — see the timeout policy in docs/TECHNICAL.md.
const LOCAL_WORKER_CAP = 8;

// Half the cores, clamped to the cap, and never below 1 on a single-core machine.
const LOCAL_WORKER_CAP_APPLIED = Math.max(1, Math.min(LOCAL_WORKER_CAP, Math.floor(cpus().length / 2)));

// Specs that must stay serialized (workers=1) — either because they measure wall-clock
// latency / heap growth (timing perturbed by CPU contention) or because they load a
// multi-tens-of-MB gear DB and crash Chromium when sibling tests compete for memory.
// Routed into a dedicated `<browser>-perf` project. Keep this list in sync as new
// heavy specs land.
const PERF_SPECS = [
  '**/builder-recipe-switch-perf.spec.ts',
  '**/hsf-preview-perf.spec.ts',
  '**/sfc-load-perf.spec.ts',
  '**/binary-endpoint-memory.spec.ts',
  '**/binary-endpoint-fragmentation.spec.ts',
  '**/endpoint-incremental-updates.spec.ts',
  '**/endpoint-replay.spec.ts',
  // Real captured-session replay + note-override churn: both track heap growth and
  // replay/drive the full pipeline dozens of times — timing- and memory-sensitive.
  '**/capture-replay-memory.spec.ts',
  '**/override-churn-memory.spec.ts',
  // Large-DB pipeline specs. Their fixtures used to be tens of MB and crashed Chromium
  // under parallel workers; the fixtures now ship in RSL Helper's slim format (~1 MB),
  // so the memory pressure is gone. Kept serialized for now because each still drives a
  // full multi-thousand-item match pipeline — revisit moving them to the parallel
  // projects if suite wall-clock becomes a concern.
  '**/midgame-progression.spec.ts',
  '**/large-db-duplication.spec.ts',
  // Loads the largest account DB + runs the full safeguard pipeline; crashes Firefox-fhd
  // when a sibling Firefox instance with HD video encoding competes for memory.
  '**/safeguard-rank-chip-menu.spec.ts',
];

// Per-clone preview port — auto-derived from the repo path so parallel clones
// (e.g. WSL + Windows simultaneously) bind distinct ports without per-clone setup.
// Why: WSL2 forwards localhost to/from Windows, so a single shared port lets one clone
// silently reuse another clone's preview server — that reads as "tests against the
// wrong build" and is exactly what produced the version-mismatch / README-dialog
// regression. Hashing the cwd produces a stable port per checkout. PLAYWRIGHT_PORT
// is still honored as an explicit override (useful on rare hash collisions).
const PREVIEW_PORT_RANGE_START = 5180;
const PREVIEW_PORT_RANGE_SIZE = 100;
// djb2 keeps the math trivial and deterministic across Node versions; we just need
// a stable bucket per path, not cryptographic strength.
function hashCwdToPort(cwd: string): number {
  let hash = 5381;
  for (let index = 0; index < cwd.length; index += 1) {
    hash = ((hash << 5) + hash + cwd.charCodeAt(index)) | 0;
  }
  return PREVIEW_PORT_RANGE_START + (Math.abs(hash) % PREVIEW_PORT_RANGE_SIZE);
}
const PREVIEW_PORT = process.env.PLAYWRIGHT_PORT
  ? Number.parseInt(process.env.PLAYWRIGHT_PORT, 10)
  : hashCwdToPort(process.cwd());
// Fail fast on an invalid override so we never silently fall back to the default.
if (!Number.isInteger(PREVIEW_PORT) || PREVIEW_PORT <= 0 || PREVIEW_PORT > 65535) {
  throw new Error(`Invalid PLAYWRIGHT_PORT="${process.env.PLAYWRIGHT_PORT}" (expected a TCP port 1-65535)`);
}
const PREVIEW_BASE_URL = `http://127.0.0.1:${PREVIEW_PORT}`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/playwright',
  // Keep default timeouts tight so hung tests fail quickly.
  timeout: PLAYWRIGHT_TIMEOUTS.testDefault,
  // Align expect assertions with the default UI wait budget.
  expect: {
    // Keep expectations snappy by default.
    timeout: PLAYWRIGHT_TIMEOUTS.expectDefault,
  },
  /* Run independent tests in parallel — see the perf-project split below for the few
     specs that must stay isolated. Each Playwright test runs in its own browser context,
     so localStorage / sessionStorage / IndexedDB are isolated per test; the only real
     shared resource is the Vite preview server (static files, safe under concurrent load). */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Worker count: half the CPU cores locally, but never more than LOCAL_WORKER_CAP;
     cap CI runners at 2 to avoid OOM on shared hardware. The `<browser>-perf` project
     is launched separately with --workers=1 so timing and heap-growth assertions stay
     free of CPU contention. */
  workers: process.env.CI ? 2 : LOCAL_WORKER_CAP_APPLIED,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  // Keep console output detailed while still writing the HTML report to disk.
  reporter: [
    ['list'],
    // Never open or serve the HTML report; just write it to disk and exit.
    ['html', { open: 'never', outputFolder: `${PLAYWRIGHT_RESULTS_ROOT}/reports` }],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: PREVIEW_BASE_URL,

    // Fail fast on slow actions so we spot stuck UI earlier.
    actionTimeout: PLAYWRIGHT_TIMEOUTS.action,
    // Keep navigation aligned with the app shell budget.
    navigationTimeout: PLAYWRIGHT_TIMEOUTS.navigation,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Record video for every test at native viewport resolution. Default Playwright behavior
       downscales captures to 800x450; pinning size to the viewport keeps frames pixel-accurate.
       FHD projects override this with FHD_VIEWPORT in their per-project `use` block. */
    video: { mode: 'on', size: DEFAULT_VIEWPORT },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      // General-purpose Chromium pass at default viewport; runs in parallel with siblings.
      // Excludes PERF_SPECS so timing/memory measurements are not skewed by CPU contention.
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/chromium`,
      testIgnore: PERF_SPECS,
    },

    {
      // Full-HD Chromium pass: same browser as `chromium`, but at 1920x1080.
      // Why: wider layouts can expose chip overflow / column-count bugs missed at 1280x720.
      name: 'chromium-fhd',
      use: {
        ...devices['Desktop Chrome'],
        viewport: FHD_VIEWPORT,
        // Match video size to the FHD viewport so captures stay pixel-accurate.
        video: { mode: 'on', size: FHD_VIEWPORT },
      },
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/chromium-fhd`,
      testIgnore: PERF_SPECS,
    },

    {
      // Perf/memory project: launched in a separate `playwright test` invocation with
      // --workers=1 so timing assertions and heap-growth checks are not perturbed by
      // sibling tests. Only the default viewport — FHD adds no value for these specs.
      name: 'chromium-perf',
      use: { ...devices['Desktop Chrome'] },
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/chromium-perf`,
      testMatch: PERF_SPECS,
      // Force within-file serialization on top of the workers=1 CLI override.
      fullyParallel: false,
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/firefox`,
      testIgnore: PERF_SPECS,
    },

    {
      // Full-HD Firefox pass: mirrors the chromium-fhd rationale for the Gecko engine.
      name: 'firefox-fhd',
      use: {
        ...devices['Desktop Firefox'],
        viewport: FHD_VIEWPORT,
        // Match video size to the FHD viewport so captures stay pixel-accurate.
        video: { mode: 'on', size: FHD_VIEWPORT },
      },
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/firefox-fhd`,
      testIgnore: PERF_SPECS,
    },

    {
      // Firefox perf/memory project: same contract as chromium-perf above.
      name: 'firefox-perf',
      use: { ...devices['Desktop Firefox'] },
      outputDir: `${PLAYWRIGHT_RESULTS_ROOT}/firefox-perf`,
      testMatch: PERF_SPECS,
      fullyParallel: false,
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests.
     When E2E_EXTERNAL_SERVER=1 the orchestrator (scripts/test/run-e2e.mjs) has already
     built the bundle once and started a single shared `vite preview`, then runs each
     browser suite against it — so the build + serve cost is paid ONCE for the whole
     matrix instead of once per browser (the former 3× redundant rebuild). In that mode
     this webServer only needs to confirm the shared server is up, so it serves (no build)
     and reuses the existing process. Run standalone (no env flag) it falls back to the
     self-contained build+serve so `npx playwright test` still works on its own. */
  webServer: (() => {
    // The orchestrator manages the shared server; here we must NOT rebuild or kill it.
    const useExternalServer = process.env.E2E_EXTERNAL_SERVER === '1';
    return {
      // External mode: serve the already-built bundle (no rebuild). Standalone mode:
      // build the prod bundle first, then serve it. Per-clone PREVIEW_PORT keeps parallel
      // WSL/Windows clones from colliding on a fixed port.
      command: useExternalServer
        ? `npm run preview -- --host 127.0.0.1 --port ${PREVIEW_PORT}`
        : `npm run build && npm run preview -- --host 127.0.0.1 --port ${PREVIEW_PORT}`,
      // VITE_TEST_HOOKS=1 makes vite.config set the compile-time __ALLOW_TEST_HOOKS__ flag, so
      // this prod-like e2e build INCLUDES the test-only diagnostics (e.g. the ?logWasmHeap /
      // window.__wasmHeapMB worker-heap probe the leak spec reads). Real release builds omit
      // this env var → the flag is false → the diagnostics are tree-shaken out. Passed via the
      // env option (not an inline `VAR=… cmd` prefix) so it works on Windows shells too.
      env: { VITE_TEST_HOOKS: '1' },
      url: `${PREVIEW_BASE_URL}/`,
      // External mode: reuse the orchestrator's shared server (do NOT start a competing one).
      // Standalone mode: always start fresh so we never silently inherit a stale bundle (the
      // exact failure mode that produced the README-dialog regression after a version bump).
      reuseExistingServer: useExternalServer,
      // Readiness budget for the URL above. External mode probes an already-running server,
      // so it stays short; standalone mode must first run `npm run build` inside this window
      // (cold WASM recompile + full Vite production build), which overruns Playwright's 60 s
      // default and aborted the entire run before any test started. Named budgets, not raw
      // literals, per the timeout policy.
      timeout: useExternalServer
        ? PLAYWRIGHT_TIMEOUTS.webServerReuse
        : PLAYWRIGHT_TIMEOUTS.webServerBuild,
      stdout: 'pipe',
      stderr: 'pipe',
    };
  })(),
});
