/**
 * colorTints — SSOT for fixed-alpha palette tints + a generic JS alpha scale.
 *
 * Each TINT value is a theme-independent CSS string referencing an MUI palette CHANNEL var, so
 * it resolves to the correct per-scheme color at the CSS layer and can be dropped into any sx
 * object, template literal, or module constant without needing a theme instance.
 *
 * Names describe ROLE (what the tint is for), not the raw channel/alpha. Each entry's comment
 * lists where it is used so future edits — and the "should these two be one value?" merge pass —
 * have the context in one place. `MERGE?` flags distinct values that may be the same concept;
 * `COLLISION` flags equal-looking values that are deliberately different concepts.
 */
// Keep(success) / sell(error) state PAIRS share one opacity — only the outcome HUE differs, so a
// single alpha knob keeps each pair in lockstep. The paired tint strings below are built from these
// (cannot be one TINT token: a token can't be both green and red — but the opacity IS one concept).
const PAIR_ALPHA = {
  activeChip: 0.12,          // selected/active condition-chip surface (keep vs sell)
  activeChipHover: 0.2,      // …its hover
  diffRowBg: 0.08,           // db-diff added/removed row background
  diffRowBorder: 0.4,        // db-diff added/removed border
  diffRowBorderStrong: 0.55, // …strong border variant
} as const
// Build a CHANNEL-var rgba string for an outcome channel at one of the shared pair alphas.
const pairTint = (channel: 'success-main' | 'error-main', a: number): string =>
  `rgba(var(--mui-palette-${channel}Channel) / ${a})`

export const TINT = {
  // ── Neutral surface overlays (text.primary tint over the page/paper) ─────────
  // A subtle→strong ladder of scheme-neutral tints. MERGE? rowZebra(.04)/headerBg(.06)/
  // disabledChipBg(.08) form one "neutral elevation" ramp — keep the levels but tune together.
  neutralRowZebra:       'rgba(var(--mui-palette-text-primaryChannel) / 0.04)', // markdown table zebra rows (NoteDialog, HelpDialog); candidate-row hover (SafeguardCandidateRankList)
  neutralHeaderBg:       'rgba(var(--mui-palette-text-primaryChannel) / 0.06)', // markdown table <th> bg (NoteDialog, HelpDialog); empty heatmap cell (GearAnalyticsHeatmap)
  neutralDisabledChipBg: 'rgba(var(--mui-palette-text-primaryChannel) / 0.08)', // disabled/neutral chip + icon-less fallback (builderStatusChipStyles, RecipeChip, RulesFilterPanel, BuilderTooltipContent)
  neutralActiveBg:       'rgba(var(--mui-palette-text-primaryChannel) / 0.12)', // neutral active surface (RecipeBuilderPanel)
  neutralBorderFaint:    'rgba(var(--mui-palette-text-primaryChannel) / 0.15)', // faint dashed tooltip border (BuilderTooltipContent)
  neutralBorderDashed:   'rgba(var(--mui-palette-text-primaryChannel) / 0.2)',  // dashed tooltip border (BuilderTooltipContent)
  neutralHoverGlow:      'rgba(var(--mui-palette-text-primaryChannel) / 0.22)', // neutral hover glow/ring (RulesFilterPanel roll toggles, RecipeBuilderPanel substat-menu toggles + locked-min-rolls badge)
  neutralOutlineStrong:  'rgba(var(--mui-palette-text-primaryChannel) / 0.4)',  // 2px focus outline (SubstatTargetsTabContent)
  neutralBorderStrong:   'rgba(var(--mui-palette-text-primaryChannel) / 0.45)', // base border (RulesFilterPanel)
  // Neutral borders keyed off text.secondary (slightly softer than text.primary).
  neutralIconBgFallback: 'rgba(var(--mui-palette-text-secondaryChannel) / 0.1)',  // champion-icon bg when rarity unknown (GearInspectorGridCard)
  neutralBorderLight:    'rgba(var(--mui-palette-text-secondaryChannel) / 0.14)', // preset-editor border, light scheme (GearInspectorNormalizedPresetEditorMenu)
  neutralBorderDark:     'rgba(var(--mui-palette-text-secondaryChannel) / 0.22)', // preset-editor border, dark scheme (GearInspectorNormalizedPresetEditorMenu)

  // ── Success / keep / "added" state ───────────────────────────────────────────
  successAddedBgFaint:     pairTint('success-main', PAIR_ALPHA.diffRowBg),          // db-diff "added" row bg — pairs with errorRemovedBgFaint (GearDbDiffToast)
  successSelectedBg:       pairTint('success-main', PAIR_ALPHA.activeChip),         // selected/active chip bg — pairs with errorActiveBg (SafeguardBuilderPanel, RecipeBuilderPanel)
  successStatusChipBg:     'rgba(var(--mui-palette-success-mainChannel) / 0.18)',   // status icon-chip active bg (builderStatusChipStyles)
  successSelectedHover:    pairTint('success-main', PAIR_ALPHA.activeChipHover),    // hover for successSelectedBg — pairs with errorActiveHover (SafeguardBuilderPanel, RecipeBuilderPanel)
  successStatusChipHover:  'rgba(var(--mui-palette-success-mainChannel) / 0.24)',   // status icon-chip active hover (builderStatusChipStyles)
  successAddedBorder:      pairTint('success-main', PAIR_ALPHA.diffRowBorder),      // db-diff "added" border — pairs with errorRemovedBorder (GearDbDiffToast)
  successFocusOutline:     'rgba(var(--mui-palette-success-mainChannel) / 0.5)',    // status icon-chip focus outline (builderStatusChipStyles)
  successAddedBorderStrong:pairTint('success-main', PAIR_ALPHA.diffRowBorderStrong),// db-diff "added" border, strong — pairs with errorRemovedBorderStrong (GearDbDiffToast)
  successGlow:             'rgba(var(--mui-palette-success-mainChannel) / 0.6)',    // success accent halo at the shared 0.6 glow strength — keep-pulse keyframe start (NoteDialog)

  // ── Error / sell / danger / "removed" state ──────────────────────────────────
  errorRemovedBgFaint:     pairTint('error-main', PAIR_ALPHA.diffRowBg),          // db-diff "removed" row bg — pairs with successAddedBgFaint (GearDbDiffToast)
  errorActiveBg:           pairTint('error-main', PAIR_ALPHA.activeChip),         // max/sell active chip bg — pairs with successSelectedBg (RecipeBuilderPanel)
  dangerFlashBg:           'rgba(var(--mui-palette-error-mainChannel) / 0.18)',   // delete-all hover + row-change danger bg (RulesFilterPanel, SetsOrderControls)
  errorActiveHover:        pairTint('error-main', PAIR_ALPHA.activeChipHover),    // hover for errorActiveBg — pairs with successSelectedHover (RecipeBuilderPanel)
  dangerFlashPeak:         'rgba(var(--mui-palette-error-mainChannel) / 0.28)',   // peak of delete flash keyframe (RulesFilterPanel, SetsOrderControls)
  errorRemovedBorder:      pairTint('error-main', PAIR_ALPHA.diffRowBorder),      // db-diff "removed" border — pairs with successAddedBorder (GearDbDiffToast)
  errorRemovedBorderStrong:pairTint('error-main', PAIR_ALPHA.diffRowBorderStrong),// db-diff "removed" border, strong — pairs with successAddedBorderStrong (GearDbDiffToast)

  // ── Warning state ─────────────────────────────────────────────────────────────
  warningBgFaint:     'rgba(var(--mui-palette-warning-mainChannel) / 0.1)',  // warning surface (App.tsx)
  warningFlashBg:     'rgba(var(--mui-palette-warning-mainChannel) / 0.18)', // row-change pulse bg (HsfRulesTable)
  warningGlow:        'rgba(var(--mui-palette-warning-mainChannel) / 0.6)',  // metaset highlight glow (MetasetsDialog)
  warningHighlightBg: 'rgba(var(--mui-palette-warning-lightChannel) / 0.9)', // metaset highlight bg (MetasetsDialog)

  // ── Primary accent (focus, selection, glow, pulse) ───────────────────────────
  primaryFocusBg:        'rgba(var(--mui-palette-primary-mainChannel) / 0.08)', // card focus bg, base (GearInspectorGridCard)
  primaryTintFaint:      'rgba(var(--mui-palette-primary-mainChannel) / 0.18)', // radar series fill (GearAnalyticsRadar)
  primaryActiveBg:       'rgba(var(--mui-palette-primary-mainChannel) / 0.2)',  // active border bg (NoteDialog)
  primarySelectedShadow: 'rgba(var(--mui-palette-primary-mainChannel) / 0.25)', // selected-card inset shadow (GearInspectorGridCard)
  primaryGlow:           'rgba(var(--mui-palette-primary-mainChannel) / 0.6)',  // primary halo: hover/selection glow (GearAnalyticsDonut, RecipeChipsPanel, NoteDialog) + focus-pulse keyframe start (App.tsx)
  // Transparent end of any expanding pulse keyframe. Alpha 0 → channel is irrelevant (fully
  // transparent), so a single token serves both the keep (success) and focus (primary) pulses.
  pulseFadeOut:          'rgba(var(--mui-palette-primary-mainChannel) / 0)',    // NoteDialog keep pulse + App.tsx focus pulse fade-out

  // ── Info accent (card focus ring / highlight chip) ───────────────────────────
  focusBgPeak:      'rgba(var(--mui-palette-info-mainChannel) / 0.07)', // card focus bg, animated peak (GearInspectorGridCard)
  infoChipBg:       'rgba(var(--mui-palette-info-mainChannel) / 0.12)', // info chip bg (GearInspectorOutcomeSummaryChip)
  focusShadowOuter: 'rgba(var(--mui-palette-info-mainChannel) / 0.2)',  // card focus drop-shadow, outer (GearInspectorGridCard)
  focusShadowInner: 'rgba(var(--mui-palette-info-mainChannel) / 0.26)', // card focus ring, inner (GearInspectorGridCard)
  infoChipPulseBg:  'rgba(var(--mui-palette-info-mainChannel) / 0.28)', // info chip pulse bg (GearInspectorOutcomeSummaryChip)
  focusRing:        'rgba(var(--mui-palette-info-mainChannel) / 0.3)',  // card focus ring + info chip border (GearInspectorGridCard, GearInspectorOutcomeSummaryChip)

  // ── Paper scrims / floating surfaces (paper tint over content) ───────────────
  tileSeparator:     'rgba(var(--mui-palette-background-paperChannel) / 0.25)', // treemap tile separator border (GearAnalyticsTreemap)
  cardScrim:         'rgba(var(--mui-palette-background-paperChannel) / 0.65)', // card stats scrim (GearInspectorGridCard)
  chartChipBg:       'rgba(var(--mui-palette-background-paperChannel) / 0.82)', // chip bg on a chart slice/tile — counts chip + icon chip (GearAnalyticsDonut, GearAnalyticsTreemap)
  nearOpaquePaperBg: 'rgba(var(--mui-palette-background-paperChannel) / 0.92)', // near-opaque paper surface — grid/icon overlay scrim, context-hint panel, sticky header (GridIconBox, GearInspectorItemsGrid, ContextMenuHintOverlay, HeaderActions)

  // ── Scrollbar (black/white so it reads on any custom paper) ──────────────────
  scrollTrackLight:      'rgba(var(--mui-palette-common-blackChannel) / 0.04)', // light-scheme scrollbar track (scrollbar.ts)
  scrollThumbLight:      'rgba(var(--mui-palette-common-blackChannel) / 0.15)', // light-scheme scrollbar thumb (scrollbar.ts)
  scrollThumbHoverLight: 'rgba(var(--mui-palette-common-blackChannel) / 0.25)', // light-scheme scrollbar thumb hover (scrollbar.ts)
  scrollTrackDark:       'rgba(var(--mui-palette-common-whiteChannel) / 0.06)', // dark-scheme scrollbar track (scrollbar.ts)
  scrollThumbDark:       'rgba(var(--mui-palette-common-whiteChannel) / 0.22)', // dark-scheme scrollbar thumb (scrollbar.ts)
  scrollThumbHoverDark:  'rgba(var(--mui-palette-common-whiteChannel) / 0.38)', // dark-scheme scrollbar thumb hover (scrollbar.ts)
  onDarkSecondaryText:   'rgba(var(--mui-palette-common-whiteChannel) / 0.7)',  // secondary text/arrow on a dark toast surface (GearDbDiffToast, BuilderTooltipContent)

  // ── Divider ──────────────────────────────────────────────────────────────────
  legendSwatchBorder: 'rgba(var(--mui-palette-dividerChannel) / 0.5)', // treemap legend swatch border (GearAnalyticsTreemap)
} as const

// Numeric alpha scale for JS alpha() calls on RUNTIME colors (where a CHANNEL-var TINT cannot be
// used because the base is a palette hex resolved in JS, not a CSS channel var). Applied to varied
// colors for varied purposes, so a generic opacity ladder is the right model. a<NN> == NN/100.
// Usage: a08 NoteDialog warning bg · a12/a24 FactionIcon white frame · a14 rarity champion-icon bg ·
// a40 db-diff black scrim/white border · a55 GridIconBox white border · a60 glows + black scrim +
// FactionIcon shadow · a70 db-diff separator · a90 workload-indicator info border.
export const ALPHA = {
  a08: 0.08,
  a12: 0.12,
  a14: 0.14,
  a24: 0.24,
  a40: 0.4,
  a55: 0.55,
  a60: 0.6,
  a70: 0.7,
  a90: 0.9,
} as const
