# Theme Centralization — Fix Instructions

This document describes the remaining scattered theme-styling violations and exactly
how to fix each one. All fixes follow a single pattern: replace inline rgba literals
and hard-coded colors with tokens from the central token file.

---

## Central Token System — Quick Reference

**File:** `src/lib/themeCustomTokens.ts`

- **`APP_CSS_VAR`** — object of CSS custom property names (`--app-*` strings).
- **`APP_SCHEME_ALPHAS`** — per-scheme alpha values injected once via `GlobalStyles`
  so components never need `isDark` checks at call-site.
- **`CUSTOM_TOKENS`** — pre-built `rgba(var(--mui-palette-…Channel) / var(--app-*))` strings.
  Accessible in `sx` callbacks as `theme.custom.<tokenName>`.
- **`SUBSTAT_LIGHT_CHIP_BG_ALPHA` / `SUBSTAT_LIGHT_CHIP_BORDER_ALPHA`** — plain numeric
  constants for paths where JS `alpha()` must receive a number, not a CSS string.

**The rule:** every color value that changes with the color scheme must either be a
`theme.palette.*` / `theme.vars.palette.*` semantic token, or a `CUSTOM_TOKENS`/
`APP_CSS_VAR` reference. Literal hex codes and inline rgba percentages outside
`themeCustomTokens.ts` are violations.

**Import pattern:**

```ts
import { CUSTOM_TOKENS, APP_CSS_VAR } from '../lib/themeCustomTokens'
// or, inside an sx callback: theme.custom.<tokenName>
```

---

## File 1 — `src/components/FileDragOverlay.tsx` (CRITICAL — no light mode)

**Problem:** All colors are hard-coded dark-mode rgba values; the component is invisible
in light mode.

**Fix — replace the entire `sx` content of both `<Box>` elements:**

```tsx
// Outer backdrop Box — replace the three color props:
bgcolor: theme.custom.overlayBackdropBg,    // was rgba(15,15,18,0.6)
// (backdropFilter stays unchanged)

// Inner panel Box — replace the color props:
bgcolor: theme.custom.overlayPanelBg,       // was rgba(30,30,36,0.9)
color: 'text.primary',                      // was hardcoded 'white'
border: `1px solid ${theme.custom.overlayPanelBorder}`,  // was rgba(255,255,255,0.2)

// Separator Typography — replace borderTop:
borderTop: `1px solid ${theme.custom.overlayPanelBorder}`, // was rgba(255,255,255,0.15)
// Remove 'color: primary.light' — it is fine to keep or replace with 'primary.main'
```

The `sx` props now need `theme` in scope. Convert the static object to a callback:

```tsx
<Box sx={(theme) => ({ ... })}>
```

Apply the same conversion to the inner `<Box>` and the `<Typography>` that has the
separator border.

---

## File 2 — `src/components/GearInspectorNormalizedPresetEditorMenu.tsx` (MEDIUM)

**Location:** `sx` callback on `<MenuItem>`, around line 217–232.

**Problem:** Inline alpha percentages for the success-tinted selected-row highlight:

```ts
// BEFORE
...(selected ? {
  backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.08)',
  ...theme.applyStyles('dark', { backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.14)' })
} : {}),
'&:hover': {
  backgroundColor: selected
    ? 'rgba(var(--mui-palette-success-mainChannel) / 0.12)'
    : (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
  ...( selected ? theme.applyStyles('dark', { backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.20)' }) : {} ),
},
```

**Fix:**

```ts
// AFTER
...(selected ? { backgroundColor: theme.custom.selectedSuccessBg } : {}),
'&:hover': {
  backgroundColor: selected
    ? theme.custom.successHoverBg
    : (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
},
```

No `applyStyles` needed — both `selectedSuccessBg` and `successHoverBg` are CSS
custom properties that adapt per-scheme automatically.

---

## File 3 — `src/components/RulesFilterPanel.tsx` (MEDIUM)

**Location:** `tintedChipSx` callback, around line 720–748.

**Problem:** Inline alpha literals in a dynamic-palette-key rgba template:

```ts
// BEFORE
backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / 0.18)`,
'&.MuiChip-clickable:hover': {
  backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / 0.24)`,
},
'&.MuiChip-clickable:active': {
  backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / 0.3)`,
},
```

**Fix:** Replace the inline fractions with `APP_CSS_VAR` references. The import
`APP_CSS_VAR` from `themeCustomTokens` must be added to the file's import block.

```ts
// AFTER
import { APP_CSS_VAR } from '../lib/themeCustomTokens'

// inside tintedChipSx:
backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / var(${APP_CSS_VAR.tintedChipBgAlpha}))`,
'&.MuiChip-clickable:hover': {
  backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / var(${APP_CSS_VAR.tintedChipHoverBgAlpha}))`,
},
'&.MuiChip-clickable:active': {
  backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / var(${APP_CSS_VAR.tintedChipActiveBgAlpha}))`,
},
```

---

## File 4 — `src/components/SafeguardBuilderPanel.tsx` (MEDIUM — two identical blocks)

There are two near-identical `sx` callbacks containing the same inline alpha values.
They appear around lines **2543–2570** (substat-weights icon button) and **2655–2686**
(improvement-chance icon button). Fix both the same way.

**Problem per block:**

```ts
// BEFORE — repeated in both blocks
const bg = chipEnabled
  ? 'rgba(var(--mui-palette-success-mainChannel) / 0.18)'
  : 'rgba(var(--mui-palette-text-disabledChannel) / 0.08)'
const colorDim     = chipEnabled
  ? 'rgba(var(--mui-palette-success-darkChannel) / 0.45)'
  : 'rgba(var(--mui-palette-text-disabledChannel) / 0.45)'
const colorDisabled = chipEnabled
  ? 'rgba(var(--mui-palette-success-darkChannel) / 0.35)'
  : 'rgba(var(--mui-palette-text-disabledChannel) / 0.35)'
// ...
'&:hover': canInteract ? { backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.28)' } : {},
// ...
theme.applyStyles('dark', {
  color: canInteract ? ... : 'rgba(var(--mui-palette-success-lightChannel) / 0.45)',
  '&.Mui-disabled': { color: 'rgba(var(--mui-palette-success-lightChannel) / 0.35)' },
})
```

**Fix — add `APP_CSS_VAR` to imports, then in both blocks:**

```ts
import { APP_CSS_VAR } from '../lib/themeCustomTokens'

// Replace the variable definitions:
const bg = chipEnabled
  ? theme.custom.statusChipSuccessEnabledBg
  : theme.custom.statusChipDisabledBg
const colorDim = chipEnabled
  ? `rgba(var(--mui-palette-success-darkChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`
  : `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`
const colorDisabled = chipEnabled
  ? `rgba(var(--mui-palette-success-darkChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`
  : `rgba(var(--mui-palette-text-disabledChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`

// Replace hover:
'&:hover': canInteract ? { backgroundColor: theme.custom.statusChipSuccessHoverBg } : {},

// Replace applyStyles dark overrides for dim/disabled text:
theme.applyStyles('dark', {
  color: canInteract
    ? (theme.vars?.palette.success.light ?? theme.palette.success.light)
    : `rgba(var(--mui-palette-success-lightChannel) / var(${APP_CSS_VAR.statusChipDimAlpha}))`,
  '&.Mui-disabled': {
    color: `rgba(var(--mui-palette-success-lightChannel) / var(${APP_CSS_VAR.statusChipDisabledColorAlpha}))`,
  },
})
```

Also in the second block only (line ~2674), the `borderLeft` contains an inline fraction:

```ts
// BEFORE
borderLeft: `1px solid ${chipEnabled
  ? 'rgba(var(--mui-palette-success-mainChannel) / 0.28)'
  : (theme.vars?.palette.divider ?? theme.palette.divider)}`,

// AFTER
borderLeft: `1px solid ${chipEnabled
  ? theme.custom.statusChipSuccessHoverBg
  : (theme.vars?.palette.divider ?? theme.palette.divider)}`,
```

---

## File 5 — `src/components/PreviewHeaderActions.tsx` (MEDIUM)

**Location:** Around lines 1839–1865 (two adjacent `<Box>` elements inside a `MenuItem`).

**Problem:** Inline alpha fractions in `applyStyles` overrides for an info badge and a
ghost placeholder element:

```ts
// BEFORE — info badge (lines ~1839–1842)
border: `1px solid rgba(var(--mui-palette-info-mainChannel) / 0.5)`,
...theme.applyStyles('dark', { border: `1px solid rgba(var(--mui-palette-info-mainChannel) / 0.65)` }),
backgroundColor: 'rgba(var(--mui-palette-info-mainChannel) / 0.08)',
...theme.applyStyles('dark', { backgroundColor: 'rgba(var(--mui-palette-info-mainChannel) / 0.12)' }),

// BEFORE — ghost placeholder (lines ~1864–1865)
border: `1px solid rgba(var(--mui-palette-text-secondaryChannel) / 0.12)`,
...theme.applyStyles('dark', { border: `1px solid rgba(var(--mui-palette-text-secondaryChannel) / 0.18)` }),
```

**Fix:** Both pairs collapse to a single CSS custom property each — no `applyStyles` needed.

```ts
// AFTER — info badge
border: `1px solid ${theme.custom.infoBorder}`,
backgroundColor: theme.custom.infoBg,

// AFTER — ghost placeholder
border: `1px solid ${theme.custom.ghostBorder}`,
```

---

## File 6 — `src/components/RuleSubstatChips.tsx` (MEDIUM)

**Location:** `resolveSubstatChipColors` function, around lines 38–46.

**Problem:** Inline alpha literals passed to `alpha()` and `darken()` in the light-mode
branch:

```ts
// BEFORE
chipBg:     alpha(fgColor, 0.15),
chipBorder: alpha(fgColor, 0.25),
labelColor: darken(fgColor, 0.45),
```

**Fix:** Import the named constants from `themeCustomTokens`:

```ts
import {
  SUBSTAT_LIGHT_CHIP_BG_ALPHA,
  SUBSTAT_LIGHT_CHIP_BORDER_ALPHA,
} from '../lib/themeCustomTokens'

// AFTER
chipBg:     alpha(fgColor, SUBSTAT_LIGHT_CHIP_BG_ALPHA),
chipBorder: alpha(fgColor, SUBSTAT_LIGHT_CHIP_BORDER_ALPHA),
labelColor: darken(fgColor, 0.45),   // 0.45 is a darken amount, not an alpha — leave as-is
```

> **Note on `useColorScheme()`:** `RuleSubstatChips` calls `useColorScheme()` to obtain
> `isLight` for the branch above. This is acceptable because the branch exists to apply
> MUI JS color functions (`alpha`, `darken`) to a *caller-supplied hex string* — something
> that cannot be driven by CSS custom properties. Do **not** remove the `useColorScheme`
> call; the goal is only to replace the inline numeric literals, not to restructure the
> rendering logic.

---

## Not-a-Fix — `src/components/ContextMenuPaper.tsx`

The `applyStyles('dark')` block in `closeButtonSx` hardcodes MUI grey hex values
(`#424242`, `#212121`, etc.). The existing code comment explains the rationale: the
dark paper background (`#161b22`) is already near `grey[900]` lightness, so
`lighten()`/`darken()` deltas are too small to reach the contrast that `grey[800]`
(`#424242`) provides. The grey scale is scheme-invariant, so the hard-coded values
are intentionally correct and should be left unchanged.

---

## Validation Checklist

After applying all fixes:

1. `npm run typecheck` — must pass with zero errors.
2. `npm run lint` — must pass.
3. `npm run build` — must complete.
4. `npm run test:unit` — must pass.
5. Toggle between dark and light schemes in the app and visually verify:
   - File drag overlay appears with a light semi-transparent backdrop (not black) in light mode.
   - Variant picker selected rows in `GearInspectorNormalizedPresetEditorMenu` are
     visibly tinted green in both schemes.
   - Filter chips (`RulesFilterPanel`) keep correct tint colors in both schemes.
   - Substat-weight and improvement-chance icon buttons in `SafeguardBuilderPanel`
     render correctly in enabled/disabled states in both schemes.
   - Sort-direction indicator badge in `PreviewHeaderActions` is visibly info-tinted
     in both schemes.
   - Substat chips in `RuleSubstatChips` have clean tinted appearance in light mode.
