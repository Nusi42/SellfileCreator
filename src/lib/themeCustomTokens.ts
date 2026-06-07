/**
 * themeCustomTokens.ts
 *
 * Single source of truth for all per-scheme CSS custom properties and their static
 * CSS string tokens. Components import CUSTOM_TOKENS (or access theme.custom) and
 * write no palette.mode checks — the CSS variables adapt per scheme automatically.
 *
 * Alpha values live here so there is exactly one number per concept; they are injected
 * as CSS custom properties once via GlobalStyles in main.tsx.
 */
import type { Theme } from '@mui/material/styles'
import { blendAlpha, ensureContrastOnBg } from './colorUtils'

// ─── CSS variable names ───────────────────────────────────────────────────────
export const APP_CSS_VAR = {
  hoverBgAlpha:           '--app-hover-bg-alpha',
  selectedHoverBgAlpha:   '--app-selected-hover-bg-alpha',
  multiEditBorderAlpha:   '--app-multi-edit-border-alpha',
  multiEditBgAlpha:       '--app-multi-edit-bg-alpha',
  multiEditTextAlpha:     '--app-multi-edit-text-alpha',
  dangerTintAlpha:        '--app-danger-tint-alpha',
  successBorderAlpha:     '--app-success-border-alpha',
  successBgAlpha:         '--app-success-bg-alpha',
  successHoverBgAlpha:    '--app-success-hover-bg-alpha',
  successActiveBgAlpha:   '--app-success-active-bg-alpha',
  neutralBorderAlpha:     '--app-neutral-border-alpha',
  weakBorderAlpha:        '--app-weak-border-alpha',
  paperOverlayAlpha:      '--app-paper-overlay-alpha',
  keepOverrideHoverAlpha: '--app-keep-override-hover-alpha',
  // Gear Inspector match chip alpha pairs — drive keep/sell chip tints without isDark checks.
  matchBorderDimAlpha:    '--app-match-border-dim-alpha',
  matchSurfaceAlpha:      '--app-match-surface-alpha',
  matchHoverAlpha:        '--app-match-hover-alpha',
  matchSurfaceDimAlpha:   '--app-match-surface-dim-alpha',
  matchHoverDimAlpha:     '--app-match-hover-dim-alpha',
  // Source chip (Final Sell / Safeguard) tint pairs.
  sourceChipSurfaceAlpha: '--app-source-chip-surface-alpha',
  sourceChipHoverAlpha:   '--app-source-chip-hover-alpha',
  // Gear Inspector card outcome tint and stats-dim overlay.
  cardOutcomeTintAlpha:   '--app-card-outcome-tint-alpha',
  cardStatsDimAlpha:      '--app-card-stats-dim-alpha',
  // Substat chip fallback bg when no per-variant bg color is defined.
  substatFallbackAlpha:        '--app-substat-fallback-alpha',
  // Success-tinted selected row (variant picker menu items, filter row highlights).
  selectedSuccessBgAlpha:      '--app-selected-success-bg-alpha',
  // Dynamic-palette tinted chips (any palette key; base, hover, and active states).
  tintedChipBgAlpha:           '--app-tinted-chip-bg-alpha',
  tintedChipHoverBgAlpha:      '--app-tinted-chip-hover-bg-alpha',
  tintedChipActiveBgAlpha:     '--app-tinted-chip-active-bg-alpha',
  // Status icon-button chips (substat-weights and improvement-chance toggles in SafeguardBuilderPanel).
  statusChipEnabledBgAlpha:    '--app-status-chip-enabled-bg-alpha',
  statusChipDisabledBgAlpha:   '--app-status-chip-disabled-bg-alpha',
  statusChipHoverBgAlpha:      '--app-status-chip-hover-bg-alpha',
  statusChipDimAlpha:          '--app-status-chip-dim-alpha',
  statusChipDisabledColorAlpha:'--app-status-chip-disabled-color-alpha',
  // Info-tinted priority badge (PreviewHeaderActions sort-direction indicator).
  infoBorderAlpha:             '--app-info-border-alpha',
  infoBgAlpha:                 '--app-info-bg-alpha',
  // Ghost/placeholder border — lighter neutral outline for inactive controls.
  ghostBorderAlpha:            '--app-ghost-border-alpha',
  // File drag overlay — full-screen backdrop and floating instruction panel.
  overlayBackdropAlpha:        '--app-overlay-backdrop-alpha',
  overlayPanelBgAlpha:         '--app-overlay-panel-bg-alpha',
  overlayPanelBorderAlpha:     '--app-overlay-panel-border-alpha',
} as const

// ─── Per-scheme alpha values ───────────────────────────────────────────────────
// These are injected as [data-mui-color-scheme="dark/light"] { --app-*: value }
// via GlobalStyles so every component reads them without any mode check at callsite.
//
// AppAlphas is typed as a record of every APP_CSS_VAR key → number.
// TypeScript enforces that both schemes have exactly the same keys as APP_CSS_VAR:
// adding a CSS var without a corresponding alpha entry is a compile error.
export type AppAlphas = { [K in keyof typeof APP_CSS_VAR]: number }

export const APP_SCHEME_ALPHAS: { readonly dark: AppAlphas; readonly light: AppAlphas } = {
  dark: {
    hoverBgAlpha:           0.20,
    selectedHoverBgAlpha:   0.40,
    multiEditBorderAlpha:   0.45,
    multiEditBgAlpha:       0.08,
    multiEditTextAlpha:     0.75,
    dangerTintAlpha:        0.08,
    successBorderAlpha:     0.70,
    successBgAlpha:         0.16,
    successHoverBgAlpha:    0.20,
    successActiveBgAlpha:   0.12,
    neutralBorderAlpha:     0.22,
    weakBorderAlpha:        0.28,
    paperOverlayAlpha:      0.90,
    keepOverrideHoverAlpha: 0.24,
    matchBorderDimAlpha:    0.65,
    matchSurfaceAlpha:      0.05,
    matchHoverAlpha:        0.50,
    // Dimmed variants = base × 0.85 (used in overflow/secondary match chips).
    matchSurfaceDimAlpha:   0.0425,
    matchHoverDimAlpha:     0.425,
    sourceChipSurfaceAlpha: 0.35,
    sourceChipHoverAlpha:   0.45,
    cardOutcomeTintAlpha:   0.20,
    cardStatsDimAlpha:      0.30,
    substatFallbackAlpha:        0.20,
    selectedSuccessBgAlpha:      0.14,
    tintedChipBgAlpha:           0.18,
    tintedChipHoverBgAlpha:      0.24,
    tintedChipActiveBgAlpha:     0.30,
    statusChipEnabledBgAlpha:    0.18,
    statusChipDisabledBgAlpha:   0.08,
    statusChipHoverBgAlpha:      0.28,
    statusChipDimAlpha:          0.45,
    statusChipDisabledColorAlpha:0.35,
    infoBorderAlpha:             0.65,
    infoBgAlpha:                 0.12,
    ghostBorderAlpha:            0.18,
    overlayBackdropAlpha:        0.60,
    overlayPanelBgAlpha:         0.90,
    overlayPanelBorderAlpha:     0.20,
  },
  light: {
    hoverBgAlpha:           0.10,
    selectedHoverBgAlpha:   0.20,
    multiEditBorderAlpha:   0.28,
    multiEditBgAlpha:       0.12,
    multiEditTextAlpha:     0.60,
    dangerTintAlpha:        0.04,
    successBorderAlpha:     0.55,
    successBgAlpha:         0.10,
    successHoverBgAlpha:    0.12,
    successActiveBgAlpha:   0.08,
    neutralBorderAlpha:     0.14,
    weakBorderAlpha:        0.18,
    paperOverlayAlpha:      0.92,
    keepOverrideHoverAlpha: 0.12,
    matchBorderDimAlpha:    0.60,
    matchSurfaceAlpha:      0.01,
    matchHoverAlpha:        0.13,
    // Dimmed variants = base × 0.85.
    matchSurfaceDimAlpha:   0.0085,
    matchHoverDimAlpha:     0.1105,
    sourceChipSurfaceAlpha: 0.12,
    sourceChipHoverAlpha:   0.18,
    cardOutcomeTintAlpha:   0.10,
    cardStatsDimAlpha:      0.67,
    substatFallbackAlpha:        0.12,
    selectedSuccessBgAlpha:      0.08,
    tintedChipBgAlpha:           0.18,
    tintedChipHoverBgAlpha:      0.24,
    tintedChipActiveBgAlpha:     0.30,
    statusChipEnabledBgAlpha:    0.18,
    statusChipDisabledBgAlpha:   0.08,
    statusChipHoverBgAlpha:      0.28,
    statusChipDimAlpha:          0.45,
    statusChipDisabledColorAlpha:0.35,
    infoBorderAlpha:             0.50,
    infoBgAlpha:                 0.08,
    ghostBorderAlpha:            0.12,
    overlayBackdropAlpha:        0.50,
    overlayPanelBgAlpha:         0.95,
    overlayPanelBorderAlpha:     0.14,
  },
}

// ─── GlobalStyles injection object ───────────────────────────────────────────
// Auto-derived from APP_CSS_VAR + APP_SCHEME_ALPHAS — no manual list to maintain.
// Import this in main.tsx and pass directly to <GlobalStyles styles={SCHEME_ALPHA_STYLES} />.
// Any new token added to APP_CSS_VAR + APP_SCHEME_ALPHAS is automatically injected.
export const SCHEME_ALPHA_STYLES = (() => {
  const dark:  Record<string, number> = {}
  const light: Record<string, number> = {}
  for (const k of Object.keys(APP_CSS_VAR) as (keyof typeof APP_CSS_VAR)[]) {
    dark[APP_CSS_VAR[k]]  = APP_SCHEME_ALPHAS.dark[k]
    light[APP_CSS_VAR[k]] = APP_SCHEME_ALPHAS.light[k]
  }
  return {
    '[data-mui-color-scheme="dark"]':  dark,
    '[data-mui-color-scheme="light"]': light,
  }
})()

// ─── Static CSS token strings ─────────────────────────────────────────────────
// Each string is a valid CSS color value referencing MUI channel variables.
// Channel format: "R G B" (space-separated) — used in rgba(R G B / alpha) modern syntax.
// The CSS variable for the alpha adapts per scheme via GlobalStyles injection above.
export const CUSTOM_TOKENS = {
  // Primary-tinted interactions
  hoverBg:              `rgba(var(--mui-palette-primary-mainChannel) / var(${APP_CSS_VAR.hoverBgAlpha}))`,
  selectedHoverBg:      `rgba(var(--mui-palette-primary-mainChannel) / var(${APP_CSS_VAR.selectedHoverBgAlpha}))`,
  // Multi-edit tri-state "mixed" cues (diagonal hatch on chips/toggles)
  multiEditMixedBorder: `rgba(var(--mui-palette-text-primaryChannel) / var(${APP_CSS_VAR.multiEditBorderAlpha}))`,
  multiEditMixedBg:     `rgba(var(--mui-palette-text-primaryChannel) / var(${APP_CSS_VAR.multiEditBgAlpha}))`,
  multiEditMixedText:   `rgba(var(--mui-palette-text-primaryChannel) / var(${APP_CSS_VAR.multiEditTextAlpha}))`,
  // Destructive hover tint (Reset, Delete)
  dangerTintBg:         `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.dangerTintAlpha}))`,
  // Success state surfaces (substat/filter selected items, sell status)
  successBorder:        `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.successBorderAlpha}))`,
  successBg:            `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.successBgAlpha}))`,
  successHoverBg:       `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.successHoverBgAlpha}))`,
  successActiveBg:      `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.successActiveBgAlpha}))`,
  // Neutral surface borders (inactive substats, secondary controls)
  neutralBorder:        `rgba(var(--mui-palette-text-secondaryChannel) / var(${APP_CSS_VAR.neutralBorderAlpha}))`,
  weakBorder:           `rgba(var(--mui-palette-text-secondaryChannel) / var(${APP_CSS_VAR.weakBorderAlpha}))`,
  // Semi-transparent overlay on paper background (sticky headers, table overlays)
  paperOverlayBg:       `rgba(var(--mui-palette-background-paperChannel) / var(${APP_CSS_VAR.paperOverlayAlpha}))`,
  // Keep-override scope chip hover
  keepOverrideHoverBg:  `rgba(var(--mui-palette-primary-mainChannel) / var(${APP_CSS_VAR.keepOverrideHoverAlpha}))`,
  // Gear Inspector match chip — keep (success) variants
  matchKeepBorderDim:   `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.matchBorderDimAlpha}))`,
  matchKeepSurface:     `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.matchSurfaceAlpha}))`,
  matchKeepHover:       `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.matchHoverAlpha}))`,
  matchKeepSurfaceDim:  `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.matchSurfaceDimAlpha}))`,
  matchKeepHoverDim:    `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.matchHoverDimAlpha}))`,
  // Gear Inspector match chip — sell (error) variants
  matchSellBorderDim:   `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.matchBorderDimAlpha}))`,
  matchSellSurface:     `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.matchSurfaceAlpha}))`,
  matchSellHover:       `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.matchHoverAlpha}))`,
  matchSellSurfaceDim:  `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.matchSurfaceDimAlpha}))`,
  matchSellHoverDim:    `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.matchHoverDimAlpha}))`,
  // Source chips (Final Sell = sell tint, Safeguard = keep tint) — stronger than match chips.
  sourceChipKeepSurface:`rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.sourceChipSurfaceAlpha}))`,
  sourceChipKeepHover:  `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.sourceChipHoverAlpha}))`,
  sourceChipSellSurface:`rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.sourceChipSurfaceAlpha}))`,
  sourceChipSellHover:  `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.sourceChipHoverAlpha}))`,
  // Gear Inspector card keep/sell background tint and stats-dim overlay.
  cardKeepTintBg:       `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.cardOutcomeTintAlpha}))`,
  cardSellTintBg:       `rgba(var(--mui-palette-error-mainChannel) / var(${APP_CSS_VAR.cardOutcomeTintAlpha}))`,
  cardStatsDimBg:       `rgba(var(--mui-palette-background-paperChannel) / var(${APP_CSS_VAR.cardStatsDimAlpha}))`,
  // Substat chip neutral fallback bg when no per-variant bg color is configured.
  substatFallbackBg:           `rgba(var(--mui-palette-text-primaryChannel) / var(${APP_CSS_VAR.substatFallbackAlpha}))`,
  // Success-tinted selected row surface (variant picker menus, filter row highlights).
  selectedSuccessBg:           `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.selectedSuccessBgAlpha}))`,
  // Info-tinted priority badge (sort-direction indicator).
  infoBorder:                  `rgba(var(--mui-palette-info-mainChannel) / var(${APP_CSS_VAR.infoBorderAlpha}))`,
  infoBg:                      `rgba(var(--mui-palette-info-mainChannel) / var(${APP_CSS_VAR.infoBgAlpha}))`,
  // Ghost/placeholder border — neutral lighter outline for inactive controls.
  ghostBorder:                 `rgba(var(--mui-palette-text-secondaryChannel) / var(${APP_CSS_VAR.ghostBorderAlpha}))`,
  // File drag overlay — full-screen backdrop dimmer. Uses black so it tints content in both schemes.
  overlayBackdropBg:           `rgba(0 0 0 / var(${APP_CSS_VAR.overlayBackdropAlpha}))`,
  overlayPanelBg:              `rgba(var(--mui-palette-background-paperChannel) / var(${APP_CSS_VAR.overlayPanelBgAlpha}))`,
  overlayPanelBorder:          `rgba(var(--mui-palette-text-primaryChannel) / var(${APP_CSS_VAR.overlayPanelBorderAlpha}))`,
  // Status icon-button chip surfaces (enabled/disabled background, hover).
  statusChipSuccessEnabledBg:  `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.statusChipEnabledBgAlpha}))`,
  statusChipSuccessHoverBg:    `rgba(var(--mui-palette-success-mainChannel) / var(${APP_CSS_VAR.statusChipHoverBgAlpha}))`,
  statusChipDisabledBg:        `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDisabledBgAlpha}))`,
} as const

export type ThemeCustomTokens = typeof CUSTOM_TOKENS

// ─── Plain numeric alpha constants ───────────────────────────────────────────
// These are used with JS color functions (alpha(), ensureContrastOnBg()) where CSS custom
// properties cannot be substituted — e.g. when the input color is a caller-supplied
// hex string, not an MUI palette channel.
// Keep any new per-concept values here so there is one number to change per concept.
export const SUBSTAT_LIGHT_CHIP_BG_ALPHA = 0.11
export const SUBSTAT_LIGHT_CHIP_BORDER_ALPHA = 0.20

// Adapts a substat fg color for plain text labels on a light-theme surface (no chip bg).
// Adjusts LCH lightness to the minimum needed for 3:1 contrast against white paper.
export function lightAdaptedSubstatFg(fg: string | undefined, isLight: boolean): string | undefined {
  if (!fg || !isLight) return fg
  return ensureContrastOnBg(fg, '#ffffff')
}

// ─── Runtime scheme resolution for JS-side contrast math ─────────────────────
// CRITICAL: with cssVariables + colorSchemes, theme.palette.* is FROZEN to the
// default scheme (light). Reading theme.palette.background.paper / success.main
// in dark mode therefore yields LIGHT-scheme hex values — the wrong surface. Any
// JS contrast computation (ensureContrastOnBg, blendAlpha) must resolve the actual
// runtime scheme via these helpers instead. The visual rendering is unaffected
// because it uses CSS-var tokens (theme.custom.*) that adapt at the CSS layer.

export type SchemeMode = 'light' | 'dark'

// SSOT for the colorScheme→mode convention: useColorScheme() may return undefined
// during first render; the app's defaultMode is "dark", so undefined resolves to dark.
export function schemeModeFromColorScheme(colorScheme: string | undefined): SchemeMode {
  return colorScheme === 'light' ? 'light' : 'dark'
}

// MUI's CSS-vars theme carries the real per-scheme palettes under colorSchemes, but the
// base Theme type returned by useTheme() does not surface it. Narrow to the shape we read.
type ThemeWithColorSchemes = Theme & {
  colorSchemes?: Partial<Record<SchemeMode, { palette: Theme['palette'] }>>
}

// Resolve the active scheme's full palette (real per-scheme hex values), falling
// back to the static palette only if the colorSchemes map is unavailable.
export function resolveSchemePalette(theme: Theme, mode: SchemeMode): Theme['palette'] {
  return (theme as ThemeWithColorSchemes).colorSchemes?.[mode]?.palette ?? theme.palette
}

// Convenience: the active scheme's paper color for the common single-surface case.
export function resolveSchemePaper(theme: Theme, mode: SchemeMode): string {
  return resolveSchemePalette(theme, mode).background.paper
}

export type ContrastSurfaceScheme = {
  paper: string
  successMain: string
  errorMain: string
  alphas: AppAlphas
}

// Resolve every surface input needed to recreate a match/source chip background for
// contrast checking: paper, success/error mains, and the per-scheme alpha set.
export function resolveContrastSurfaceScheme(theme: Theme, mode: SchemeMode): ContrastSurfaceScheme {
  const palette = resolveSchemePalette(theme, mode)
  return {
    paper: palette.background.paper,
    successMain: palette.success.main,
    errorMain: palette.error.main,
    alphas: APP_SCHEME_ALPHAS[mode],
  }
}

// Composite the Gear Inspector card outcome tint over paper for the active scheme.
// match.keep === false → sell (error) tint, otherwise keep (success) tint, at
// cardOutcomeTintAlpha. Chips inside the card sit on top of this surface.
export function resolveCardChipBaseBg(scheme: ContrastSurfaceScheme, keep: boolean | undefined): string {
  const tint = keep === false ? scheme.errorMain : scheme.successMain
  return blendAlpha(scheme.paper, tint, scheme.alphas.cardOutcomeTintAlpha)
}

// ─── TypeScript augmentation ──────────────────────────────────────────────────
// Adds theme.custom to every MUI Theme so component sx callbacks can write
// `theme.custom.hoverBg` instead of importing CUSTOM_TOKENS directly.
declare module '@mui/material/styles' {
  interface Theme {
    custom: ThemeCustomTokens
  }
  interface ThemeOptions {
    custom?: ThemeCustomTokens
  }
}
