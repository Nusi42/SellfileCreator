// Shared Playwright selectors that should stay stable across locales and UI refactors.
// Why: Centralizing these keeps tests in sync and avoids repeating fragile strings.
export const SFR_LOAD_INPUT_SELECTOR = '[data-tour-id="sfr.load"] input[type="file"][accept*=".sfr"]'
// Target the Substat Targets toolbar trigger using a stable tour id.
export const SUBSTAT_TARGETS_BUTTON_SELECTOR = '[data-tour-id="builder.substat-targets"]'
