/**
 * Central registry of all context-menu-hint IDs.
 *
 * Every call to useContextMenuHint / useContextMenuButtonHint must use one of
 * these constants. Passing an unregistered string literal is a TypeScript error,
 * so forgetting to register a new surface is caught at compile time rather than
 * discovered at runtime (or not at all).
 *
 * When adding a new right-click surface with a hint overlay:
 *  1. Add its ID here.
 *  2. Use useContextMenuButtonHint (standard button/area) or useContextMenuHint
 *     (complex cases — two interleaved hints, exposed pos state, etc.).
 *  3. Render the returned overlay element near the trigger.
 */
export const CONTEXT_HINT_IDS = {
  sfcLoad: 'sfcLoad',
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
  previewExportMenu: 'previewExportMenu',
  previewFilterMenu: 'previewFilterMenu',
  previewSortPresetMenu: 'previewSortPresetMenu',
  previewDiffMenu: 'previewDiffMenu',
  rslHelperConnectButton: 'rslHelperConnectButton',
} as const

export type ContextHintId = (typeof CONTEXT_HINT_IDS)[keyof typeof CONTEXT_HINT_IDS]
