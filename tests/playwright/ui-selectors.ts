// Shared Playwright selectors that should stay stable across locales and UI refactors.
// Why: Centralizing these keeps tests in sync and avoids repeating fragile strings.
export const SFC_LOAD_INPUT_SELECTOR = '[data-tour-id="sfc.load"] input[type="file"][accept*=".sfc"]'
// Target the Tools toolbar trigger using a stable tour id (opens the LogicHub dialog).
export const SUBSTAT_TARGETS_BUTTON_SELECTOR = '[data-tour-id="builder.tools-button"]'
// Preview panel container — carries data-gear-results-version for pipeline-commit synchronization.
export const PREVIEW_PAPER_SELECTOR = '[data-tour-id="preview.paper"]'
// Header toolbar toggle that opens the Note & Dynamic Overrides dialog.
export const NOTE_TOGGLE_SELECTOR = '[data-tour-id="note.toggle"]'
