# Theming System

SFC uses **MUI v9 CSS variables mode** with dual `colorSchemes` (dark + light).
All color-scheme-aware styling must follow the patterns in this document to avoid the common light/dark regression where dark-mode UI shows light-scheme colours.

---

## Architecture Overview

### Theme construction — `src/theme.ts`

`makeTheme(colorBlindMode, custom)` calls `buildSchemePalette` twice (once for dark, once for light) and merges both into a single `createTheme` call:

```ts
createTheme({
  cssVariables: { colorSchemeSelector: 'data-mui-color-scheme' },
  colorSchemes: {
    dark:  { palette: darkPalette  },
    light: { palette: lightPalette },
  },
  // ...
})
```

`colorSchemeSelector: 'data-mui-color-scheme'` tells MUI to look for `data-mui-color-scheme="dark"` on an ancestor element (MUI puts it on `<html>`) instead of following the OS `prefers-color-scheme` media query directly, so the user's manual toggle always wins.

`custom: ThemeCustomization` carries optional overrides for primary, success, warning, error, background, paper, divider, border-radius, and selection colours — all piped through by `ThemeEditorMenu`.

### Token SSOT — `src/lib/themeCustomTokens.ts`

All custom CSS variable names, per-scheme alpha values, and pre-built colour expressions live here. Nothing else in the codebase should hard-code rgba percentages that vary between schemes.

| Export | Purpose |
|--------|---------|
| `APP_CSS_VAR` | `--app-*` CSS custom property name strings |
| `APP_SCHEME_ALPHAS` | Per-scheme numeric alpha values keyed by `APP_CSS_VAR` key — TypeScript enforces that every key in `APP_CSS_VAR` that is alpha-typed has a matching entry here. |
| `CUSTOM_TOKENS` | Pre-built `rgba(var(--mui-palette-…Channel) / var(--app-*))` strings, accessible in `sx` callbacks as `theme.custom.<tokenName>`. |
| `SCHEME_ALPHA_STYLES` | Auto-derived `GlobalStyles` block injected once in `main.tsx`; adds per-scheme `--app-*` values under `[data-mui-color-scheme="dark"]` and `[data-mui-color-scheme="light"]` selectors. New tokens are picked up automatically — no manual step. |
| `SUBSTAT_LIGHT_CHIP_BG_ALPHA` / `SUBSTAT_LIGHT_CHIP_BORDER_ALPHA` | Plain numeric constants for code paths that call MUI's `alpha()` JS function (which requires a number, not a CSS string). |

**Adding a new token:**

1. Add a key to `APP_CSS_VAR` (e.g. `myFooBg: '--app-my-foo-bg'`).
2. Add matching dark/light alpha values to `APP_SCHEME_ALPHAS.dark` and `APP_SCHEME_ALPHAS.light`.
3. Add a pre-built expression to `CUSTOM_TOKENS` (e.g. `myFooBg: 'rgba(var(--mui-palette-…Channel) / var(--app-my-foo-bg))'`).
4. Use it in components as `theme.custom.myFooBg`.

**The rule:** every colour value that changes with the colour scheme must be a `theme.palette.*` / `theme.vars?.palette.*` semantic token or a `CUSTOM_TOKENS` / `APP_CSS_VAR` reference. Literal hex codes and inline rgba percentages outside `themeCustomTokens.ts` are violations.

---

## The Core Gotcha — `theme.palette` vs `theme.vars?.palette`

In MUI v9 CSS variables mode, **`theme.palette.X` always returns the light-scheme static hex** regardless of the active runtime scheme. This is the root cause of the majority of dark-mode regressions.

| Expression | What it returns | When to use |
|-----------|----------------|-------------|
| `theme.palette.X` | Static light-scheme hex, e.g. `#d0d7de` | Only for JS colour math (`darken`, `alpha`, `getContrastText`) that needs a concrete hex — and even then prefer the `colorSchemes` approach below |
| `theme.vars?.palette.X` | CSS var string, e.g. `var(--mui-palette-divider)` | Anywhere the value ends up as a CSS property — resolves per-scheme in the browser |
| `theme.vars?.palette.X ?? theme.palette.X` | CSS var with static fallback | Standard safe pattern for `sx` and `styleOverrides` callbacks |
| `theme.colorSchemes.dark?.palette.X` | Concrete dark-scheme hex | JS colour math (`darken`, `alpha`) that must operate on dark-mode values |
| `theme.applyStyles('dark', {...})` | Emits `[data-mui-color-scheme="dark"]` rule | Scheme-specific CSS overrides inside `styleOverrides` or `sx` |

### Practical patterns

**sx callbacks and styleOverrides — always use the vars prefix:**
```ts
// ✅ correct — resolves per-scheme at runtime
border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`
color: theme.vars?.palette.text.primary ?? theme.palette.text.primary

// ❌ wrong — always returns light-scheme value
border: `1px solid ${theme.palette.divider}`
```

**Dark-scheme-specific overrides:**
```ts
// Use applyStyles for CSS-only overrides
sx={(theme) => ({
  backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.18)',
  ...theme.applyStyles('dark', {
    backgroundColor: 'rgba(var(--mui-palette-success-mainChannel) / 0.28)',
  }),
})}

// Use colorSchemes for JS colour math
backgroundColor: darken(
  theme.colorSchemes.dark?.palette.success?.main ?? theme.palette.success.main,
  0.42
)
```

**CSS variables that MUI Alert uses for text — override `--Alert-color`, not just `color`:**

MUI Alert `variant="filled"` sets `color: var(--Alert-color)`. A class-level `color:` override can lose to MUI's internal injection. Override the CSS variable directly inside `applyStyles`:

```ts
...theme.applyStyles('dark', {
  '--Alert-color': theme.colorSchemes.dark?.palette.success?.contrastText ?? 'rgba(0,0,0,0.87)',
})
```

**Resolving a CSS var string to a parseable hex (e.g. for `parseCssColorToRgb`):**

`theme.vars?.palette.X` returns a CSS var string — JS colour utilities cannot parse it. Read the actual computed value from the DOM instead:

```ts
const resolveToHex = (value: string): string => {
  if (!value.startsWith('var(')) return value
  return getComputedStyle(document.documentElement)
    .getPropertyValue(value.slice(4, -1)).trim() || value
}
const errorHex = resolveToHex(theme.vars?.palette.error.main ?? theme.palette.error.main)
```

**Runtime colour scheme — use `useColorScheme()`, not `theme.palette.mode`:**

`theme.palette.mode` is always `'light'` in CSS vars mode because MUI's `defaultColorScheme` defaults to `'light'` when both schemes are present. Use the hook instead:

```ts
import { useColorScheme } from '@mui/material/styles'
const { colorScheme, setColorScheme } = useColorScheme()
const isDark = colorScheme !== 'light'
```

Also use `colorScheme ?? 'dark'` (not `theme.palette.mode`) for the WMDE markdown library's `data-color-mode` attribute:

```tsx
<Box data-color-mode={colorScheme ?? 'dark'}>
  <MDEditor.Markdown ... />
</Box>
```

---

## ThemeEditorMenu and PsychedelicEffect

### `src/components/ThemeEditorMenu.tsx`

The colour editor flyout: PaletteIcon button + Menu with colour pickers, dark/light toggle, colour-blind mode, border-radius, psychedelic toggle, and stat-button border preference.

- Reads/writes `ThemeCustomization` via `useThemeCustomization()` (Zustand-backed, persisted to localStorage).
- Reads/writes `psychedelic` via the display preferences context (`useDisplayPreferences` / `useDisplayPreferenceActions`).
- Lives inside `HelpDialog` (mounted in the dialog header, left of the language selector). Because `HelpDialog` conditionally unmounts, `ThemeEditorMenu` would lose local state on dialog close — the psychedelic toggle is therefore in a persistent context, not local state, so closing the dialog does not stop a running animation.

### `PsychedelicEffect` (named export from the same file)

A null-rendering component (`return null`) that owns the 40 ms `setInterval` hue-cycling animation. It writes CSS custom properties directly on `document.documentElement`, bypassing React state and emotion CSS regeneration completely.

**Always mounted in `App.tsx`** — independent of any dialog lifecycle:

```tsx
{/* Psychedelic animation — always mounted so it runs regardless of which dialogs are open. */}
<PsychedelicEffect />
```

The effect reads `psychedelic` from the display preferences context. When turned on it samples the current `--mui-palette-primary-main` and `--mui-palette-background-default` CSS vars from the DOM and blends from those starting values to the psychedelic targets over `WARMUP_SECS` (6 s), so the transition is gradual rather than an instant snap.

---

## Display Preferences Context — `src/state/preferencesState.tsx`

`DisplayPreferencesProvider` (wraps the app in `main.tsx`) exposes a shared state + dispatch context for display toggles.

| Preference | Type | Persisted | Notes |
|-----------|------|-----------|-------|
| `showSlotIcons` | boolean | localStorage | Gear inspector slot icon display |
| `showSetIcons` | boolean | localStorage | Gear inspector set icon display |
| `showFactionIcons` | boolean | localStorage | Gear inspector faction icon display |
| `statButtonBorders` | boolean | localStorage | Stat button border style |
| `psychedelic` | boolean | session only | Resets on page reload; controls `PsychedelicEffect` |

Access via `useDisplayPreferences()` (state) and `useDisplayPreferenceActions()` (setters).

---

## Shared Chip Styles — `src/components/builderStatusChipStyles.ts`

`createBuilderStatusChipSx(theme)` returns a function `(enabled, opts?) => SxProps` used by both the builder panels and cheat-sheet chips. Keeps all status-chip sizing, colour, hover, focus, and disabled styles in one place.

Key implementation notes:
- Uses `rgba(var(--mui-palette-success-mainChannel) / 0.18)` (CSS channel token) for the active background — no hardcoded hex.
- Disabled background uses `theme.vars?.palette.action.disabledBackground` — a defined MUI token. The `--mui-palette-text-disabledChannel` token **does not exist** in MUI v9; use `--mui-palette-text-primaryChannel` with low alpha instead.
- Active text uses `theme.vars?.palette.success.light` for readable tint on dark surfaces.
- `dimDisabled` option reduces the chip's visual weight when it represents a truly inactive state (e.g. no gear match) — uses a blended opacity via `resolveDisabledOpacity`.

---

## WMDE Markdown Table Overrides

The `@uiw/react-md-editor` library injects hardcoded light/dark CSS for `.wmde-markdown table`. Custom theme colours never reach these elements without explicit overrides.

Add these inside the markdown container's `sx` in both `NoteDialog.tsx` and `HelpDialog.tsx`:

```ts
'& .wmde-markdown table': { borderColor: 'var(--mui-palette-divider)' },
'& .wmde-markdown table tr': {
  backgroundColor: 'var(--mui-palette-background-paper) !important',
  borderTopColor: 'var(--mui-palette-divider)',
},
'& .wmde-markdown table tr:nth-of-type(2n)': {
  backgroundColor: 'rgba(var(--mui-palette-text-primaryChannel) / 0.04) !important',
},
'& .wmde-markdown table th, & .wmde-markdown table td': {
  borderColor: 'var(--mui-palette-divider)',
  color: 'var(--mui-palette-text-primary)',
},
'& .wmde-markdown table th': {
  backgroundColor: 'rgba(var(--mui-palette-text-primaryChannel) / 0.06)',
},
```

---

## Checklist — Adding a Theme-Aware Component

1. **Colour values** — Use `theme.custom.*` for custom tokens, `theme.vars?.palette.*` for MUI semantic tokens. No bare `theme.palette.*` except inside `alpha()`/`darken()` JS math — and even there, prefer `theme.colorSchemes.dark?.palette.*` for dark-mode-specific math.
2. **Scheme branching** — Use `theme.applyStyles('dark', {...})` for CSS overrides; use `useColorScheme()` for runtime scheme checks in component logic.
3. **Third-party markdown** — Always set `data-color-mode={colorScheme ?? 'dark'}` on the WMDE container; add table overrides (see above).
4. **CSS variable properties** — If a MUI component uses an internal CSS variable (like `--Alert-color`), override that variable rather than the derived `color` property, so the override wins regardless of MUI's injection order.
5. **JS colour utilities** — When passing values to `parseCssColorToRgb`, `alpha()`, or `darken()`, resolve CSS var strings to hex first using `getComputedStyle`.
6. **Test both schemes** — Toggle dark/light in the app to confirm the component adapts. Pay particular attention to borders, text, and background on elements that are not standard MUI Paper/Typography.
