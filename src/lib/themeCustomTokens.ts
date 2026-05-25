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
  substatFallbackAlpha:   '--app-substat-fallback-alpha',
} as const

// ─── Per-scheme alpha values ───────────────────────────────────────────────────
// These are injected as [data-mui-color-scheme="dark/light"] { --app-*: value }
// via GlobalStyles so every component reads them without any mode check at callsite.
export const APP_SCHEME_ALPHAS = {
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
    substatFallbackAlpha:   0.20,
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
    substatFallbackAlpha:   0.12,
  },
} as const

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
  substatFallbackBg:    `rgba(var(--mui-palette-text-primaryChannel) / var(${APP_CSS_VAR.substatFallbackAlpha}))`,
} as const

export type ThemeCustomTokens = typeof CUSTOM_TOKENS

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
