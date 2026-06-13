// Compile-time flag for test-only diagnostic hooks.
//
// __ALLOW_TEST_HOOKS__ is injected by Vite `define` (see vite.config.ts): the literal
// `false` in real release builds and `true` only when the build sets VITE_TEST_HOOKS=1
// (the e2e build does — see playwright.config webServer command). Because it resolves to a
// literal boolean at build time, any `if (ALLOW_TEST_HOOKS) { … }` branch is provably dead
// in release and is fully tree-shaken out — the diagnostic code does NOT ship.
//
// This differs from gating on import.meta.env.DEV: a DEV gate routed through a runtime
// function (e.g. getCapturePackets()) is NOT statically false, so the minifier keeps the
// code as runtime-dead bytes in the release bundle. Use ALLOW_TEST_HOOKS for anything that
// must be genuinely absent from production.
declare const __ALLOW_TEST_HOOKS__: boolean

export const ALLOW_TEST_HOOKS: boolean =
  typeof __ALLOW_TEST_HOOKS__ !== 'undefined' ? __ALLOW_TEST_HOOKS__ : false
