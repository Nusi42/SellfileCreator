// Shared Playwright selectors that should stay stable across locales and UI refactors.
// Why: Centralizing these keeps tests in sync and avoids repeating fragile strings.
export const SFC_LOAD_INPUT_SELECTOR = '[data-tour-id="sfc.load"] input[type="file"][accept*=".sfc"]'
// Target the Tools toolbar trigger using a stable tour id (opens the LogicHub dialog).
export const SUBSTAT_TARGETS_BUTTON_SELECTOR = '[data-tour-id="builder.tools-button"]'
// Preview panel container — carries data-gear-results-version for pipeline-commit synchronization.
export const PREVIEW_PAPER_SELECTOR = '[data-tour-id="preview.paper"]'
// Header toolbar toggle that opens the Note & Dynamic Overrides dialog.
export const NOTE_TOGGLE_SELECTOR = '[data-tour-id="note.toggle"]'
// The SFC dirty dot on the header's Save button — present iff the document reads dirty.
export const SFC_DIRTY_DOT_SELECTOR = '[data-testid="sfc-dirty-badge"] [data-testid="dirty-dot"]'
// The dirty dot on the express view's Custom sell-rules button — present iff the custom
// setup reads unsaved (it mirrors the header dot, which the express view hides).
export const SIMPLE_CUSTOM_DIRTY_DOT_SELECTOR = '[data-testid="simple-custom-dirty-badge"] [data-testid="dirty-dot"]'
