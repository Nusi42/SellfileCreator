/**
 * Central registry of all context-menu-hint IDs.
 *
 * Every call to useContextMenuHint / useContextMenuButtonHint must use one of
 * these constants. Passing an unregistered string literal is a TypeScript error,
 * so forgetting to register a new surface is caught at compile time rather than
 * discovered at runtime (or not at all).
 *
 * When adding a new right-click surface with a hint overlay:
 *  1. Add its ID here and its starting revision (1) to CONTEXT_HINT_REVISIONS.
 *  2. Use useContextMenuButtonHint (standard button/area) or useContextMenuHint
 *     (complex cases — two interleaved hints, exposed pos state, etc.).
 *  3. Render the returned overlay element near the trigger.
 */
export const CONTEXT_HINT_IDS = {
  builderRecipeChips: 'builderRecipeChips',
  safeguardChipsPanel: 'safeguardChipsPanel',
  builderSubstats: 'builderSubstats',
  builderTagsMenu: 'builderTagsMenu',
  builderHistoryMenu: 'builderHistoryMenu',
  builderInsertMenu: 'builderInsertMenu',
  builderApplyMenu: 'builderApplyMenu',
  builderReset: 'builderReset',
  rulesTableHeader: 'rulesTableHeader',
  rulesTableRows: 'rulesTableRows',
  gearInspectorCompact: 'gearInspectorCompact',
  gearInspectorGridContextMenu: 'gearInspectorGridContextMenu',
  previewFilterMenu: 'previewFilterMenu',
  previewSortPresetMenu: 'previewSortPresetMenu',
  previewDiffMenu: 'previewDiffMenu',
  rslHelperConnectButton: 'rslHelperConnectButton',
} as const

export type ContextHintId = (typeof CONTEXT_HINT_IDS)[keyof typeof CONTEXT_HINT_IDS]

/**
 * Per-surface hint revision. A hint shows until the user's stored marker matches
 * the surface's current revision, then never again — hints do NOT reset on app
 * updates (they used to be keyed to APP_VERSION, which re-showed every hint on
 * every release, including to users who already knew about right-click).
 *
 * Bump a surface's number ONLY when its context menu gains genuinely new
 * capabilities worth re-announcing to users who dismissed the earlier hint.
 */
export const CONTEXT_HINT_REVISIONS: Record<ContextHintId, number> = {
  builderRecipeChips: 1,
  safeguardChipsPanel: 1,
  builderSubstats: 1,
  builderTagsMenu: 1,
  builderHistoryMenu: 1,
  builderInsertMenu: 1,
  builderApplyMenu: 1,
  builderReset: 1,
  rulesTableHeader: 1,
  rulesTableRows: 1,
  gearInspectorCompact: 1,
  gearInspectorGridContextMenu: 1,
  previewFilterMenu: 1,
  previewSortPresetMenu: 1,
  previewDiffMenu: 1,
  rslHelperConnectButton: 1,
}
