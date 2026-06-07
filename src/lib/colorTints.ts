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
export const TINT = {
  // ── Neutral surface overlays (text.primary tint over the page/paper) ─────────
  // A subtle→strong ladder of scheme-neutral tints. MERGE? rowZebra(.04)/headerBg(.06)/
  // disabledChipBg(.08) form one "neutral elevation" ramp — keep the levels but tune together.
  neutralRowZebra:       'rgba(var(--mui-palette-text-primaryChannel) / 0.04)', // markdown table zebra rows (NoteDialog, HelpDialog); candidate-row hover (SafeguardCandidateRankList)
  neutralHeaderBg:       'rgba(var(--mui-palette-text-primaryChannel) / 0.06)', // markdown table <th> bg (NoteDialog, HelpDialog); empty heatmap cell (GearAnalyticsHeatmap)
  neutralDisabledChipBg: 'rgba(var(--mui-palette-text-primaryChannel) / 0.08)', // disabled/neutral chip + icon-less fallback (builderStatusChipStyles, RecipeChip, RulesFilterPanel, BuilderTooltipContent)
  neutralActiveBg:       'rgba(var(--mui-palette-text-primaryChannel) / 0.12)', // neutral active surface (RecipeBuilderPanel)
  neutralBorderFaint:    'rgba(var(--mui-palette-text-primaryChannel) / 0.15)', // faint dashed tooltip border (BuilderTooltipContent)
  neutralGlowSoft:       'rgba(var(--mui-palette-text-primaryChannel) / 0.18)', // soft hover glow (RecipeBuilderPanel)
  neutralBorderDashed:   'rgba(var(--mui-palette-text-primaryChannel) / 0.2)',  // dashed tooltip border (BuilderTooltipContent)
  neutralHoverGlow:      'rgba(var(--mui-palette-text-primaryChannel) / 0.22)', // hover glow (RulesFilterPanel, RecipeBuilderPanel)
  neutralOutlineStrong:  'rgba(var(--mui-palette-text-primaryChannel) / 0.4)',  // 2px focus outline (SubstatTargetsTabContent)
  neutralBorderStrong:   'rgba(var(--mui-palette-text-primaryChannel) / 0.45)', // base border (RulesFilterPanel)
  // Neutral borders keyed off text.secondary (slightly softer than text.primary).
  neutralIconBgFallback: 'rgba(var(--mui-palette-text-secondaryChannel) / 0.1)',  // champion-icon bg when rarity unknown (GearInspectorGridCard)
  neutralBorderLight:    'rgba(var(--mui-palette-text-secondaryChannel) / 0.14)', // preset-editor border, light scheme (GearInspectorNormalizedPresetEditorMenu)
  neutralBorderDark:     'rgba(var(--mui-palette-text-secondaryChannel) / 0.22)', // preset-editor border, dark scheme (GearInspectorNormalizedPresetEditorMenu)

  // ── Success / keep / "added" state ───────────────────────────────────────────
  successFadeOut:          'rgba(var(--mui-palette-success-mainChannel) / 0)',    // transparent end of keep pulse keyframe (NoteDialog)
  successAddedBgFaint:     'rgba(var(--mui-palette-success-mainChannel) / 0.08)', // db-diff "added" row bg (GearDbDiffToast)
  successSelectedBg:       'rgba(var(--mui-palette-success-mainChannel) / 0.12)', // selected/active chip bg (SafeguardBuilderPanel, RecipeBuilderPanel)
  successStatusChipBg:     'rgba(var(--mui-palette-success-mainChannel) / 0.18)', // status icon-chip active bg (builderStatusChipStyles)
  successSelectedHover:    'rgba(var(--mui-palette-success-mainChannel) / 0.2)',  // hover for successSelectedBg (SafeguardBuilderPanel, RecipeBuilderPanel)
  successStatusChipHover:  'rgba(var(--mui-palette-success-mainChannel) / 0.24)', // status icon-chip active hover (builderStatusChipStyles)
  successAddedBorder:      'rgba(var(--mui-palette-success-mainChannel) / 0.4)',  // db-diff "added" border (GearDbDiffToast)
  successFocusOutline:     'rgba(var(--mui-palette-success-mainChannel) / 0.5)',  // status icon-chip focus outline (builderStatusChipStyles)
  successAddedBorderStrong:'rgba(var(--mui-palette-success-mainChannel) / 0.55)', // db-diff "added" border, strong (GearDbDiffToast)
  successPulse:            'rgba(var(--mui-palette-success-mainChannel) / 0.7)',  // start of keep pulse keyframe (NoteDialog)

  // ── Error / sell / danger / "removed" state ──────────────────────────────────
  errorRemovedBgFaint:     'rgba(var(--mui-palette-error-mainChannel) / 0.08)', // db-diff "removed" row bg (GearDbDiffToast)
  errorActiveBg:           'rgba(var(--mui-palette-error-mainChannel) / 0.12)', // max/sell active chip bg (RecipeBuilderPanel)
  dangerFlashBg:           'rgba(var(--mui-palette-error-mainChannel) / 0.18)', // delete-all hover + row-change danger bg (RulesFilterPanel, SetsOrderControls)
  errorActiveHover:        'rgba(var(--mui-palette-error-mainChannel) / 0.2)',  // hover for errorActiveBg (RecipeBuilderPanel)
  dangerFlashPeak:         'rgba(var(--mui-palette-error-mainChannel) / 0.28)', // peak of delete flash keyframe (RulesFilterPanel, SetsOrderControls)
  errorRemovedBorder:      'rgba(var(--mui-palette-error-mainChannel) / 0.4)',  // db-diff "removed" border (GearDbDiffToast)
  errorBorderSoft:         'rgba(var(--mui-palette-error-mainChannel) / 0.5)',  // easter-egg rage border, soft (GearInspectorSortPopoutEasterEggOverlay)
  errorRemovedBorderStrong:'rgba(var(--mui-palette-error-mainChannel) / 0.55)', // db-diff "removed" border, strong (GearDbDiffToast)
  errorBorderStrong:       'rgba(var(--mui-palette-error-mainChannel) / 0.6)',  // easter-egg rage border, strong (GearInspectorSortPopoutEasterEggOverlay)

  // ── Warning state ─────────────────────────────────────────────────────────────
  warningBgFaint:     'rgba(var(--mui-palette-warning-mainChannel) / 0.1)',  // warning surface (App.tsx)
  warningFlashBg:     'rgba(var(--mui-palette-warning-mainChannel) / 0.18)', // row-change pulse bg (HsfRulesTable) + easter-egg bg (overlay)
  warningBgStrong:    'rgba(var(--mui-palette-warning-mainChannel) / 0.24)', // easter-egg bg, strong (overlay)
  warningBorderSoft:  'rgba(var(--mui-palette-warning-mainChannel) / 0.5)',  // easter-egg border, soft (overlay)
  warningGlow:        'rgba(var(--mui-palette-warning-mainChannel) / 0.6)',  // metaset highlight glow (MetasetsDialog) + easter-egg border (overlay)
  warningHighlightBg: 'rgba(var(--mui-palette-warning-lightChannel) / 0.9)', // metaset highlight bg (MetasetsDialog)

  // ── Primary accent (focus, selection, glow, pulse) ───────────────────────────
  primaryFadeOut:        'rgba(var(--mui-palette-primary-mainChannel) / 0)',    // transparent end of focus pulse keyframe (App.tsx)
  primaryFocusBg:        'rgba(var(--mui-palette-primary-mainChannel) / 0.08)', // card focus bg, base (GearInspectorGridCard)
  primaryTintFaint:      'rgba(var(--mui-palette-primary-mainChannel) / 0.18)', // radar series fill (GearAnalyticsRadar)
  primaryActiveBg:       'rgba(var(--mui-palette-primary-mainChannel) / 0.2)',  // active border bg (NoteDialog)
  primarySelectedShadow: 'rgba(var(--mui-palette-primary-mainChannel) / 0.25)', // selected-card inset shadow (GearInspectorGridCard)
  primaryGlow:           'rgba(var(--mui-palette-primary-mainChannel) / 0.6)',  // hover/selection glow (GearAnalyticsDonut, RecipeChipsPanel)
  primaryPulse:          'rgba(var(--mui-palette-primary-mainChannel) / 0.7)',  // start of focus pulse keyframe (App.tsx)

  // ── Info accent (card focus ring / highlight chip) ───────────────────────────
  focusBgPeak:      'rgba(var(--mui-palette-info-mainChannel) / 0.07)', // card focus bg, animated peak (GearInspectorGridCard)
  infoChipBg:       'rgba(var(--mui-palette-info-mainChannel) / 0.12)', // info chip bg (GearInspectorOutcomeSummaryChip)
  focusShadowOuter: 'rgba(var(--mui-palette-info-mainChannel) / 0.2)',  // card focus drop-shadow, outer (GearInspectorGridCard)
  focusShadowInner: 'rgba(var(--mui-palette-info-mainChannel) / 0.26)', // card focus ring, inner (GearInspectorGridCard)
  infoChipPulseBg:  'rgba(var(--mui-palette-info-mainChannel) / 0.28)', // info chip pulse bg (GearInspectorOutcomeSummaryChip)
  focusRing:        'rgba(var(--mui-palette-info-mainChannel) / 0.3)',  // card focus ring + info chip border (GearInspectorGridCard, GearInspectorOutcomeSummaryChip)

  // ── Paper scrims / floating surfaces (paper tint over content) ───────────────
  tileSeparator:         'rgba(var(--mui-palette-background-paperChannel) / 0.25)', // treemap tile separator border (GearAnalyticsTreemap)
  cardScrim:             'rgba(var(--mui-palette-background-paperChannel) / 0.65)', // card stats scrim (GearInspectorGridCard)
  chartChipBg:           'rgba(var(--mui-palette-background-paperChannel) / 0.8)',  // treemap counts chip bg (GearAnalyticsTreemap)
  chartIconChipBg:       'rgba(var(--mui-palette-background-paperChannel) / 0.82)', // chart icon chip bg (GearAnalyticsDonut, GearAnalyticsTreemap)
  overlayScrim:          'rgba(var(--mui-palette-background-paperChannel) / 0.9)',  // icon/grid overlay scrim (GridIconBox, GearInspectorItemsGrid)
  floatingPanelBg:       'rgba(var(--mui-palette-background-paperChannel) / 0.92)', // floating panel bg (ContextMenuHintOverlay, easter-egg overlay)
  headerScrim:           'rgba(var(--mui-palette-background-paperChannel) / 0.94)', // sticky header scrim (HeaderActions)
  floatingPanelBgOpaque: 'rgba(var(--mui-palette-background-paperChannel) / 0.98)', // floating panel bg, near-opaque (easter-egg overlay)

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
// a22/a35 easter-egg black scrim · a40 db-diff black scrim/white border · a55 GridIconBox white
// border · a60 glows + black scrim + FactionIcon shadow · a70 db-diff separator · a90 workload border.
export const ALPHA = {
  a08: 0.08,
  a12: 0.12,
  a14: 0.14,
  a22: 0.22,
  a24: 0.24,
  a35: 0.35,
  a40: 0.4,
  a55: 0.55,
  a60: 0.6,
  a70: 0.7,
  a90: 0.9,
} as const
