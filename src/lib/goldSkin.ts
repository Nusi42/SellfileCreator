/**
 * goldSkin.ts — SSOT for the gold-molding skin's accent references and geometry.
 *
 * The two gold hues live in the MUI palette as `palette.gold` (per scheme, customization-aware;
 * see buildSchemePalette in theme.ts): `gold.main` is the FRAME gold (hairlines, molding,
 * ornament stroke), `gold.light` is the TITLE gold (section titles, ornament gem). Everything
 * outside the theme consumes them through the CSS variables below so no component ever branches
 * on the active scheme.
 */
import type { Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { DEFAULT_BORDER_STYLE_MODE, type BorderStyleMode, type ThemeCustomization } from './constants'

// ─── Border style: is the skin's molding on? ─────────────────────────────────
// One definition of "which frame language is active", consumed by the palette builder, the
// Paper style override, the ornament gate and the theme popout. An un-set field means gold,
// so nothing changes for a user who never touches the new control.
export const resolveBorderStyleMode = (custom: Pick<ThemeCustomization, 'borderStyleMode'>): BorderStyleMode =>
  custom.borderStyleMode ?? DEFAULT_BORDER_STYLE_MODE

// The molding is the *whole* gold frame kit, not just the hairline colour: the lit inner line
// on every Paper and the corner ornaments ride this one predicate too.
export const isGoldMoldingEnabled = (custom: Pick<ThemeCustomization, 'borderStyleMode'>): boolean =>
  resolveBorderStyleMode(custom) === 'gold'

// CSS variable gating the corner ornaments. They are pure decoration rendered deep in the
// tree (dialog papers, the app frame, the builder column), so a scheme-level CSS switch beats
// threading the customization through every host: main.tsx emits `none` in neutral mode and
// the ornament SVG reads it as its own `display`. Unset ⇒ the gold default, `block`.
export const GOLD_ORNAMENT_DISPLAY_VAR = '--app-gold-ornament-display'
// The two ends of the switch live together: the default the SVG falls back to, and the value
// the 'neutral' style writes to hide it (emitted by buildCustomValueVars).
export const GOLD_ORNAMENT_DISPLAY_ON = 'block'
export const GOLD_ORNAMENT_DISPLAY_OFF = 'none'
export const GOLD_ORNAMENT_DISPLAY_CSS = `var(${GOLD_ORNAMENT_DISPLAY_VAR}, ${GOLD_ORNAMENT_DISPLAY_ON})`

// CSS variable references for the two gold accents. MUI emits these per scheme from the
// palette; components use the strings directly (they are valid CSS color values).
export const GOLD_FRAME_CSS = 'var(--mui-palette-gold-main)'
export const GOLD_TITLE_CSS = 'var(--mui-palette-gold-light)'

// Corner-ornament geometry (see GoldCornerOrnament): `inset` = distance from the panel's own
// border (clears the 1px hairline + the lit inner line), `arm` = bracket leg length, `gem` =
// diamond half-diagonal, `stroke` = bracket line width. The arm is a FIXED length deliberately:
// the mark should read the same on every panel rather than stretching to fit a wide one.
export const GOLD_ORNAMENT = { inset: 5, arm: 13, gem: 3.5, stroke: 1.25 } as const

// The gold "title voice": title-gold text opened by a small frame-gold ◆. One definition so
// dialog titles (theme.ts MuiDialogTitle), section headers, and chart headers all speak
// identically. A plain style object, so it drops into both sx props and theme styleOverrides.
// The diamond rides ::before, so it adds no DOM and drops out with the style.
export const GOLD_SECTION_TITLE_SX = {
  color: GOLD_TITLE_CSS,
  '&::before': {
    content: '"◆ "',
    color: GOLD_FRAME_CSS,
    fontSize: '0.7em',
    verticalAlign: '0.15em',
  },
  // `satisfies` (not a type annotation) keeps the literal value types, so the object can be
  // spread into theme styleOverrides (CSSObject) as well as used directly in sx props.
} as const satisfies SystemStyleObject<Theme>

// The ONE voice for collapsible/expandable GROUP headers (builder sections, filter-panel
// sections, gear-analytics chart headers): title-gold micro-caps, deliberately WITHOUT the ◆
// (the diamond stays reserved for dialog/menu titles). Matches the pre-unification chart-header
// metrics so the dashboard look carries over to the form panels. The collapsed-with-content
// dirty signal (COLLAPSED_CONTENT_INDICATOR_SX) is applied AFTER this at every call site, so
// state blue still beats the gold baseline.
export const GOLD_GROUP_HEADER_SX = {
  color: GOLD_TITLE_CSS,
  textTransform: 'uppercase',
  fontWeight: 600,
  fontSize: '0.68rem',
  letterSpacing: 0.3,
} as const satisfies SystemStyleObject<Theme>

// Layout row for a collapsible group header (chevron + label [+ inline actions]). One
// definition across the builder panels, the filter panel, and the chart headers so the
// chevron↔label gap stays a single number. gap 0.25 (review finding): the former 0.5
// read too wide next to the IconButton's own padding.
export const GROUP_HEADER_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.25,
  mb: 0.5,
} as const satisfies SystemStyleObject<Theme>

// The chevron IconButton of a collapsible group header. The flex gap above is only a small
// part of the visible chevron↔label distance — the button's padding plus the glyph's own
// inset dominate — so the tightening lives HERE and applies to the filter/builder/chart
// chevrons through the same one definition. The negative right margin tucks the label under
// the button's circular hover halo (deliberate decision: the halo overlapping
// the first characters is acceptable in exchange for a near-zero visual gap).
export const GROUP_HEADER_CHEVRON_SX = {
  p: 0.25,
  mr: -0.5,
  flexShrink: 0,
} as const satisfies SystemStyleObject<Theme>

// Opt-out for COMPOSITE DialogTitles (a title block that also hosts tabs/toolbars/branding):
// the theme-level MuiDialogTitle ◆ rides ::before on the title ROOT, which on a composite
// block floats detached at the block's corner instead of opening the title text. Such dialogs
// suppress the root diamond with this and re-apply GOLD_SECTION_TITLE_SX on the inner title
// Typography (or keep their own branding, e.g. the Help dialog's wordmark).
export const GOLD_TITLE_COMPOSITE_OPT_OUT_SX = { '&::before': { content: 'none' } } as const
