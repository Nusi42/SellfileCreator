/**
 * colorTints — SSOT for fixed-alpha palette tints + the app's opacity ladder.
 *
 * `ALPHA` is the single source for every opacity value in the app: each step is defined ONCE and
 * referenced everywhere (so e.g. 0.6 lives in exactly one place). It is used both to build the
 * `TINT` strings below and directly by JS `alpha()` calls on runtime colours.
 *
 * Most of these alphas were picked by eye ("a bit darker / lighter") rather than precisely chosen, so
 * near-equal values are treated as one step and snapped together — a value only earns its own step
 * when it genuinely means something different (e.g. it must sit between two others in a gradient).
 *
 * `TINT` values are theme-independent CSS strings referencing an MUI palette CHANNEL var, so they
 * resolve to the correct per-scheme colour at the CSS layer and drop into any sx object, template
 * literal, or module constant without a theme instance. TINT names describe ROLE, not channel/alpha.
 */

// ── Opacity ladder — every alpha value in the app, defined once ──────────────
// a<NN> == NN/100. Near-equal hand-picked values are intentionally collapsed into one step.
export const ALPHA = {
  a04: 0.04,
  a06: 0.06,
  a08: 0.08,
  a10: 0.10,
  a12: 0.12,
  a15: 0.15,
  a18: 0.18,
  a20: 0.20,
  a25: 0.25,
  a30: 0.30,
  a40: 0.40,
  a45: 0.45,
  a50: 0.50,
  a55: 0.55,
  a60: 0.60,
  a65: 0.65,
  a70: 0.70,
  a82: 0.82,
  a90: 0.90,
} as const

// Palette channels a tint may reference (MUI `--mui-palette-<channel>Channel` CSS vars).
type Channel =
  | 'text-primary' | 'text-secondary'
  | 'success-main' | 'error-main'
  | 'warning-main' | 'warning-light'
  | 'primary-main' | 'info-main'
  | 'background-paper' | 'divider'
  | 'common-black' | 'common-white'

// Build a CHANNEL-var rgba string at one ladder step (or a raw 0 for fully-transparent).
const tint = (channel: Channel, a: number): string => `rgba(var(--mui-palette-${channel}Channel) / ${a})`

export const TINT = {
  // ── Neutral surface overlays (text.primary tint over the page/paper) ─────────
  // A subtle→strong ladder of scheme-neutral tints.
  neutralRowZebra:       tint('text-primary', ALPHA.a04), // markdown table zebra rows (NoteDialog, HelpDialog); candidate-row hover (SafeguardCandidateRankList)
  neutralHeaderBg:       tint('text-primary', ALPHA.a06), // markdown table <th> bg (NoteDialog, HelpDialog); empty heatmap cell (GearAnalyticsHeatmap)
  neutralDisabledChipBg: tint('text-primary', ALPHA.a08), // disabled/neutral chip + icon-less fallback (builderStatusChipStyles, RecipeChip, RulesFilterPanel, BuilderTooltipContent)
  neutralActiveBg:       tint('text-primary', ALPHA.a12), // neutral active surface (RecipeBuilderPanel)
  neutralBorderFaint:    tint('text-primary', ALPHA.a15), // faint dashed tooltip border (BuilderTooltipContent)
  neutralBorderDashed:   tint('text-primary', ALPHA.a20), // dashed tooltip border (BuilderTooltipContent)
  neutralHoverGlow:      tint('text-primary', ALPHA.a20), // neutral hover glow/ring (RulesFilterPanel, RecipeBuilderPanel) — shares the a20 step with neutralBorderDashed
  neutralOutlineStrong:  tint('text-primary', ALPHA.a40), // 2px focus outline (SubstatTargetsTabContent)
  neutralBorderStrong:   tint('text-primary', ALPHA.a45), // base border (RulesFilterPanel)
  // Neutral borders keyed off text.secondary (slightly softer than text.primary).
  neutralIconBgFallback: tint('text-secondary', ALPHA.a10), // champion-icon bg when rarity unknown (GearInspectorGridCard)
  neutralBorderLight:    tint('text-secondary', ALPHA.a15), // preset-editor border, light scheme (GearInspectorNormalizedPresetEditorMenu)
  neutralBorderDark:     tint('text-secondary', ALPHA.a20), // preset-editor border, dark scheme (GearInspectorNormalizedPresetEditorMenu)

  // ── Success / keep / "added" state ───────────────────────────────────────────
  // success* and error* below pair up: the HUE encodes keep vs sell, the ALPHA step is shared.
  successAddedBgFaint:     tint('success-main', ALPHA.a08), // db-diff "added" row bg — pairs errorRemovedBgFaint (GearDiffPreview)
  successSelectedBg:       tint('success-main', ALPHA.a12), // selected/active chip bg — pairs errorActiveBg (SafeguardBuilderPanel, RecipeBuilderPanel)
  successStatusChipBg:     tint('success-main', ALPHA.a18), // status icon-chip active bg (builderStatusChipStyles)
  successSelectedHover:    tint('success-main', ALPHA.a20), // hover for successSelectedBg — pairs errorActiveHover
  successStatusChipHover:  tint('success-main', ALPHA.a25), // status icon-chip active hover (builderStatusChipStyles)
  successAddedBorder:      tint('success-main', ALPHA.a40), // db-diff "added" border — pairs errorRemovedBorder
  successFocusOutline:     tint('success-main', ALPHA.a50), // status icon-chip focus outline (builderStatusChipStyles)
  successAddedBorderStrong:tint('success-main', ALPHA.a55), // db-diff "added" border, strong — pairs errorRemovedBorderStrong
  successGlow:             tint('success-main', ALPHA.a60), // success accent halo (a60 glow step) — keep-pulse keyframe start (NoteDialog)

  // ── Error / sell / danger / "removed" state ──────────────────────────────────
  errorRemovedBgFaint:     tint('error-main', ALPHA.a08), // db-diff "removed" row bg — pairs successAddedBgFaint
  errorActiveBg:           tint('error-main', ALPHA.a12), // max/sell active chip bg — pairs successSelectedBg (RecipeBuilderPanel)
  dangerFlashBg:           tint('error-main', ALPHA.a18), // delete-all hover + row-change danger bg (RulesFilterPanel, SetsOrderControls)
  errorActiveHover:        tint('error-main', ALPHA.a20), // hover for errorActiveBg — pairs successSelectedHover
  dangerFlashPeak:         tint('error-main', ALPHA.a30), // peak of delete flash keyframe (RulesFilterPanel, SetsOrderControls)
  errorRemovedBorder:      tint('error-main', ALPHA.a40), // db-diff "removed" border — pairs successAddedBorder
  errorRemovedBorderStrong:tint('error-main', ALPHA.a55), // db-diff "removed" border, strong — pairs successAddedBorderStrong

  // ── Warning state ─────────────────────────────────────────────────────────────
  warningBgFaint:     tint('warning-main', ALPHA.a10),  // warning surface (App.tsx)
  warningFlashBg:     tint('warning-main', ALPHA.a18),  // row-change pulse bg (HsfRulesTable)
  warningGlow:        tint('warning-main', ALPHA.a60),  // metaset highlight glow (MetasetsDialog) — a60 glow step
  warningHighlightBg: tint('warning-light', ALPHA.a90), // metaset highlight bg (MetasetsDialog)

  // ── Primary accent (focus, selection, glow, pulse) ───────────────────────────
  primaryFocusBg:        tint('primary-main', ALPHA.a08), // card focus bg, base (GearInspectorGridCard)
  primaryTintFaint:      tint('primary-main', ALPHA.a18), // radar series fill (GearAnalyticsRadar)
  primaryActiveBg:       tint('primary-main', ALPHA.a20), // active border bg (NoteDialog)
  primarySelectedShadow: tint('primary-main', ALPHA.a25), // selected-card inset shadow (GearInspectorGridCard)
  primaryGlow:           tint('primary-main', ALPHA.a60), // primary halo (a60 glow step): hover/selection glow + focus-pulse start (GearAnalyticsDonut, RecipeChipsPanel, NoteDialog, App.tsx)
  pulseFadeOut:          tint('primary-main', 0),         // transparent end of any expanding pulse keyframe (alpha 0 → channel irrelevant) — keep + focus pulses

  // ── Info accent (card focus ring / highlight chip) ───────────────────────────
  focusBgPeak:      tint('info-main', ALPHA.a08), // card focus bg, animated peak (GearInspectorGridCard)
  infoChipBg:       tint('info-main', ALPHA.a12), // info chip bg (GearInspectorOutcomeSummaryChip)
  focusShadowOuter: tint('info-main', ALPHA.a20), // card focus drop-shadow, outer (GearInspectorGridCard) — outer of the 0.2/0.25/0.3 focus gradient
  focusShadowInner: tint('info-main', ALPHA.a25), // card focus ring, inner — mid of the focus gradient
  infoChipPulseBg:  tint('info-main', ALPHA.a30), // info chip pulse bg (GearInspectorOutcomeSummaryChip)
  focusRing:        tint('info-main', ALPHA.a30), // card focus ring + info chip border — outer of the focus gradient; shares a30 with infoChipPulseBg

  // ── Paper scrims / floating surfaces (paper tint over content) ───────────────
  tileSeparator:     tint('background-paper', ALPHA.a25), // treemap tile separator border (GearAnalyticsTreemap)
  cardScrim:         tint('background-paper', ALPHA.a65), // card stats scrim (GearInspectorGridCard)
  chartChipBg:       tint('background-paper', ALPHA.a82), // chip bg on a chart slice/tile (GearAnalyticsDonut, GearAnalyticsTreemap)
  nearOpaquePaperBg: tint('background-paper', ALPHA.a90), // near-opaque paper surface — overlay scrim, context-hint panel, sticky header (GridIconBox, GearInspectorItemsGrid, ContextMenuHintOverlay, HeaderActions)

  // ── Scrollbar (black/white so it reads on any custom paper) ──────────────────
  scrollTrackLight:      tint('common-black', ALPHA.a04), // light-scheme scrollbar track (scrollbar.ts)
  scrollThumbLight:      tint('common-black', ALPHA.a15), // light-scheme scrollbar thumb (scrollbar.ts)
  scrollThumbHoverLight: tint('common-black', ALPHA.a25), // light-scheme scrollbar thumb hover (scrollbar.ts)
  scrollTrackDark:       tint('common-white', ALPHA.a06), // dark-scheme scrollbar track (scrollbar.ts)
  scrollThumbDark:       tint('common-white', ALPHA.a20), // dark-scheme scrollbar thumb (scrollbar.ts)
  scrollThumbHoverDark:  tint('common-white', ALPHA.a40), // dark-scheme scrollbar thumb hover (scrollbar.ts)
  onDarkSecondaryText:   tint('common-white', ALPHA.a70), // secondary text/arrow on a dark tooltip surface (BuilderTooltipContent)

  // ── Divider ──────────────────────────────────────────────────────────────────
  legendSwatchBorder: tint('divider', ALPHA.a50), // treemap legend swatch border (GearAnalyticsTreemap)
} as const
