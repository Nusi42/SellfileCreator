# Theming System

SFC uses **MUI v9 CSS variables mode** with dual `colorSchemes` (dark + light).
All color-scheme-aware styling must follow the patterns in this document to avoid the common light/dark regression where dark-mode UI shows light-scheme colours.

---

## The Gold Skin (visual language)

The app wears the "gold molding" skin adapted from the host application: deep desaturated navy surfaces
(dark) / parchment (light) framed by a thin gold molding with a lit inner glow, gold titles
opened by a ◆ diamond, cyan reserved for the selected/focused thing, and gold corner brackets
on major panels and dialogs. Key mechanics:

- **`palette.gold`** — custom per-scheme palette slot: `gold.main` = FRAME gold (hairlines,
  molding, ornament bracket, scrollbars), `gold.light` = TITLE gold (section/dialog titles,
  ornament gem). Built in `buildSchemePalette` from `custom.frameGoldColor`/`titleGoldColor`
  (nullable → scheme defaults: dark `#c9a24b`/`#e9d8a6`, light `#8a6a2a`/`#6d5620`; the RSLH
  preset supplies warmer values). Channel triplets (`mainChannel`/`lightChannel`) are attached
  explicitly via `hexToChannelTriplet`; `TINT` may reference `gold-main`/`gold-light`.
  CSS-var consumers use `GOLD_FRAME_CSS`/`GOLD_TITLE_CSS` from **`src/lib/goldSkin.ts`**.
- **The molding** — `MuiPaper.root` = 1px `divider` hairline (divider defaults to a *dimmed
  gold*: dark `#5f5029`, light `#a08036`) + `GOLD_INSET_SHADOW` (the lit inner line,
  `theme.custom.goldInsetLine` at per-scheme `goldInsetAlpha`) + `backgroundImage: 'none'`
  (kills MUI's dark-mode elevation overlay that washed dialogs/menus grey). Depth = the
  frame, not elevation: stationary surfaces cast no shadow; floating layers (dialog, popover,
  menu, autocomplete, tooltip papers + the floating note panel and easter-egg flyouts) wear
  `FLOATING_LAYER_SHADOW` (both in `themeCustomTokens.ts`) — do not reach for
  `theme.shadows[N]` on floating surfaces.
- **A resting hairline is always the molding** — borders read `divider` (or the
  divider-channel tokens `theme.custom.neutralBorder`/`weakBorder`/`ghostBorder` and
  `TINT.neutralBorder*`); `MuiOutlinedInput` is overridden accordingly (MUI hardcodes a grey
  there). Colour on a frame means STATE (focus = primary, error = error, selected = tint) —
  never class.
- **Corner brackets** — `GoldCornerOrnaments` (`src/components/GoldCornerOrnament.tsx`):
  absolutely-positioned SVG inside the border (top two corners), `pointer-events: none`, no
  layout impact; geometry SSOT `GOLD_ORNAMENT` in `goldSkin.ts`. Worn by: all dialogs (via
  `GoldDialogPaper`, wired as the theme-level `MuiDialog` `slots.paper`), the builder and
  preview panels, and the floating note panel. NOT on menus/popovers/tooltips/grid cards.
- **Gold title voice** — `GOLD_SECTION_TITLE_SX` (`goldSkin.ts`): title-gold text with a
  frame-gold ◆ `::before`. Applied by `MuiDialogTitle` and `ContextMenuTitle` — the ◆ is
  reserved for dialog/menu titles.
- **Collapsible-group voice** — `GOLD_GROUP_HEADER_SX` (`goldSkin.ts`): title-gold
  micro-caps (uppercase 0.68rem/600, letter-spaced), deliberately WITHOUT the ◆. The ONE
  voice for every expandable group header: builder sections (`BuilderSectionToggle`),
  filter-panel sections (`RulesFilterPanel` `SectionHeaderLabel`), and gear-analytics chart
  headers (`GearAnalyticsChartHeader`). The collapsed-with-content dirty signal
  (`COLLAPSED_CONTENT_INDICATOR_SX`, primary blue) is applied after it and wins on color.
  Row geometry (chevron↔label gap 0.25, mb 0.5) is the sibling SSOT `GROUP_HEADER_ROW_SX`;
  the chevron IconButton itself wears `GROUP_HEADER_CHEVRON_SX` (p 0.25, mr −0.5 — the
  button padding and glyph inset, not the flex gap, dominate the visible chevron↔label
  distance; the negative margin tucks the label under the hover halo by design). All three
  surfaces share both.
- **Tooltips are small panels** — theme-level `MuiTooltip` paints the plate as
  `background.paper` + divider hairline + lit line + the floating drop shadow, with a
  matching bordered arrow. Tooltip content therefore sits on the SAME surface as cards:
  stat/rarity colors inside tooltips go through the normal contrast adapters (the old
  "inverted dark tooltip surface" exception is gone).

---

## Architecture Overview

### Theme construction — `src/theme.ts`

`makeTheme(colorBlindMode, custom)` calls `buildSchemePalette` twice (dark, light) and merges both into a single `createTheme` call:

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

`custom: ThemeCustomization` carries optional overrides for primary, toggle, selection, background, paper, divider, **the two gold-skin accents (frameGoldColor/titleGoldColor)**, success, warning, error, **info, the three text colours (primary/secondary/disabled), the UI and code font families, the scrollbar thumb colour**, border-radius, and selection opacity — all piped through by `ThemeEditorMenu`. `EMPTY_THEME_CUSTOMIZATION` (in `constants.ts`) is the SSOT all-null object shared by the store fallback, the theme default, and the popout reset.

**Disabled controls drain color via `DISABLED_CONTROL_FILTER`** (`filter: grayscale(1)`, module-scope SSOT in `theme.ts`): the stat/rarity color scopes paint label spans directly (`StatLabel`/`RarityLabel`/`SubstatToggleDisplay`), which overrides the `action.disabled` color MUI sets on the control *root* — so without this filter a disabled toggle would keep its full-strength stat color and look enabled. The grayscale filter on `&.Mui-disabled` (applied in the `MuiButton`, `MuiIconButton`, and `MuiToggleButton` styleOverrides) desaturates every descendant regardless of how or where content color was applied; default near-gray labels are visually unchanged. New button-like control overrides should reuse the constant.

Related gotcha now that disabled toggles are visibly distinct: MUI's ToggleButtonGroup ships a 3-class rule `.MuiToggleButtonGroup-middleButton.Mui-disabled { border-left: 1px solid transparent }` (and same for `lastButton`) that assumes flush buttons deferring to a neighbor's right border. The builder toggle groups are **gap-separated**, so that rule visibly erased a disabled button's left edge (it out-specifies the shared sx's 2-class `border` rule, which is why only the disabled state was affected). `mainStatToggleGroupSx`/`substatToggleGroupSx` (`SubstatToggleDisplay.tsx`) counter it with an explicit `&.Mui-disabled { borderColor: 'action.disabledBackground' }` (MUI's standalone-disabled border color, so grouped stat toggles match the ungrouped slot toggles' disabled look) — keep that in any new gap-separated ToggleButtonGroup styling.

Non-palette overrides are applied as follows:
- **UI font** → `typography.fontFamily` in `createTheme`.
- **Code font** → emitted as the `--font-code` CSS variable (the existing convention `FONT_FAMILY_MONO` and the MD editor already read it); set once at `:root` from `main.tsx`.
- **Scrollbar thumb** → emitted as `--app-scrollbar-thumb`; App.tsx scrollbar styling consumes it with a divider fallback.
- Both custom-value CSS vars are built by `buildCustomValueVars()` (`themeCustomTokens.ts`) and injected via a `<GlobalStyles>` in `main.tsx`. They are only present when the user sets them, so unset values preserve prior behaviour.

### RSLH — the third selection (`src/lib/rslhPreset.ts`)

RSLH ("RSL Helper" skin) is **not** a separate MUI color scheme. It is the **dark theme with a fixed `ThemeCustomization` preset merged in** — the same value slots a user can edit by hand. This is deliberate: anything RSLH does is reproducible on the dark theme via the popout, and RSLH + "dark + manual edits" run identical code, so the contrast/adaptation pipeline behaves correctly under RSLH instead of being bypassed.

- `ThemeMode` (`constants.ts`) is the union `'dark' | 'light' | 'rslh'` — the **UI selection** shown in the popout. `'rslh'` is never stored in MUI's mode key.
- MUI owns light/dark via its own `modeStorageKey` (read synchronously at init → correct first paint). When RSLH is selected, MUI's mode is `'dark'` and a separate boolean flag (`RSLH_ENABLED_KEY`) is set — see `themeModePreference.ts` (`useRslhEnabled` / `setRslhEnabled`).
- `main.tsx` merges `RSLH_PRESET` under the user's customization (`mergeCustomization(RSLH_PRESET, themeCustom)`) when the flag is on. User edits layer on top per-field (user value wins, else the preset).
- The preset reproduces the RSL Helper skin's look. Routing it through `ThemeCustomization` makes surfaces flat (`paperColor`/`bgColor` bypass MUI's derivation) like the skin. **Warning is adapted to amber `#FFC107`** (the skin used orange `#F1960E`, indistinguishable from RSLH's orange primary).

### Token SSOT — `src/lib/themeCustomTokens.ts`

All custom CSS variable names, per-scheme alpha values, and pre-built colour expressions live here. Nothing else in the codebase should hard-code rgba percentages that vary between schemes.

| Export | Purpose |
|--------|---------|
| `APP_CSS_VAR` | `--app-*` CSS custom property name strings |
| `APP_SCHEME_ALPHAS` | Per-scheme numeric alpha values keyed by `APP_CSS_VAR` key — TypeScript enforces that every key in `APP_CSS_VAR` that is alpha-typed has a matching entry here. |
| `CUSTOM_TOKENS` | Pre-built `rgba(var(--mui-palette-…Channel) / var(--app-*))` strings, accessible in `sx` callbacks as `theme.custom.<tokenName>`. |
| `SCHEME_ALPHA_STYLES` | Auto-derived `GlobalStyles` block injected once in `main.tsx`; adds per-scheme `--app-*` values under `[data-mui-color-scheme="dark"]` and `[data-mui-color-scheme="light"]` selectors. New tokens are picked up automatically — no manual step. (RSLH renders as dark, so it uses the dark alphas.) |
| `buildCustomValueVars` / `APP_CUSTOM_VALUE_VAR` | `:root` CSS vars for the scheme-agnostic user overrides not driven by the MUI palette — scrollbar thumb (`--app-scrollbar-thumb`) and code font (`--font-code`). Emitted from `main.tsx`; only present when set. |
| `SUBSTAT_LIGHT_CHIP_BG_ALPHA` / `SUBSTAT_LIGHT_CHIP_BORDER_ALPHA` | Plain numeric constants for code paths that call MUI's `alpha()` JS function (which requires a number, not a CSS string). |

**Adding a new token:**

1. Add a key to `APP_CSS_VAR` (e.g. `myFooBg: '--app-my-foo-bg'`).
2. Add matching dark/light alpha values to `APP_SCHEME_ALPHAS.dark` and `APP_SCHEME_ALPHAS.light`.
3. Add a pre-built expression to `CUSTOM_TOKENS` (e.g. `myFooBg: 'rgba(var(--mui-palette-…Channel) / var(--app-my-foo-bg))'`).
4. Use it in components as `theme.custom.myFooBg`.

**The rule:** every colour value that changes with the colour scheme must be a `theme.palette.*` / `theme.vars?.palette.*` semantic token or a `CUSTOM_TOKENS` / `APP_CSS_VAR` reference. Literal hex codes and inline rgba percentages outside the colour SSOT modules are violations.

---

## Color SSOT — tints, alphas, and contrast adaptation

**SSOT + DRY apply to the whole theme, colour most of all.** There are no inline `rgba(...)` strings or `alpha(x, 0.n)` magic numbers in components — every colour-bearing value resolves to one of the modules below. See **The mandate** at the end of this section.

### Modules

| Module | Holds | Use for |
|--------|-------|---------|
| `src/lib/colorTints.ts` | `ALPHA` — the **single opacity ladder**: every alpha value in the app defined once (`a04`…`a90`). `TINT` — fixed-alpha, role-named CSS-var strings built from `ALPHA` via the internal `tint(channel, ALPHA.aNN)` helper (theme-independent; usable in `sx`, template literals, module constants). | Any fixed-alpha tint of a palette channel; any JS `alpha()` call on a runtime hex (read the step from `ALPHA`). |
| `src/lib/themeCustomTokens.ts` | `APP_CSS_VAR` + `APP_SCHEME_ALPHAS` + `CUSTOM_TOKENS` (used via `theme.custom.*`); scheme-resolution helpers; substat/rarity adapters. | A tint whose **alpha itself differs by scheme** (→ CUSTOM_TOKEN/APP_SCHEME_ALPHAS). A fixed alpha where only the channel adapts → `TINT`. |
| `src/lib/colorUtils.ts` | Pure colour math (no theme): `ensureContrastOnBg` (LCH-lightness WCAG pass), `blendAlpha`, `compositeOnBase`, and all conversions (`parseCssColorToRgb`, `mixRgb`, `rgbToCss`, `parseHexWithAlpha`, `formatHexWithAlpha`, `hexToHSL`, `hexToChannelTriplet`, `hslDegToHex`). | All ad-hoc hex/rgb parsing and contrast math. Never re-implement these inline. |
| `src/lib/rarityColors.ts` | `RARITY_ACCENT_COLORS` + `resolveRarityAccentColor` (raw) + `resolveRarityTextColor` (contrast-adapted). | Rarity accents — raw for borders/chart fills, adapted for text/glyphs. |
| `src/lib/themeContrastHooks.ts` | `useSchemePaper()`, `useSubstatFgAdapter()`. | One-line access to the active scheme's paper / a substat-fg text adapter inside components. |
| `src/lib/noteColorVars.ts` | The Note dialog's two colour maps (`RECIPE_OVERRIDES_TOKEN_COLORS` syntax hues, `NOTE_COLOR_HEX` user note colours) + `buildNoteColorSchemeStyles(theme)` which publishes them as contrast-adapted per-scheme `--note-tok-*` / `--note-color-*` CSS vars, plus `noteTokVar`/`noteColorVar`/`NOTE_COLOR_SX_SELECTORS`. | Colouring Markdown/syntax painted on the note editor & preview surface. The CSS backdrop (`styles.css`) and the inline tooltip renderer both reference the vars, so there is one definition per hue and the two paths can't drift. |

### TINT naming, adding, and merging

`TINT` names describe **role**, not channel/alpha (e.g. `neutralDisabledChipBg`, `nearOpaquePaperBg`, `dangerFlashBg`). Add a token only for a genuinely new role — first check whether an existing role already fits (DRY). When two tokens have drifted to near-identical values for the **same** role, merge them: pick the value used more often in the **main UI (builder panels + gear inspector)**, or the average. Cross-channel pairs (success vs error at the same alpha) stay as two named tokens but **reference the same `ALPHA` step** — the hue differs, the opacity is one concept. Likewise, **every alpha value lives once in `ALPHA`**: don't write the same number twice (e.g. `0.6` is `ALPHA.a60`), and snap near-equal ad-hoc values to one step unless a value must sit between two others (e.g. a focus gradient).

**Gimmicks defer to features.** Easter eggs, psychedelic mode, and chart "dance" animations get no vote in choosing a merged value — their exact alpha is unimportant. Whenever a value would be shared between a gimmick and a regular feature/control, the **regular** one wins and the value is chosen for *its* UX/contrast. (In practice easter-egg colours are theme-agnostic and local — see the exceptions below — so they don't enter the SSOT at all; this rule applies to any other gimmick.)

### User/preset colours rendered as TEXT must be contrast-adapted

Any user- or preset-chosen colour (substat fg, recipe/safeguard appearance fg, rarity accent) rendered as **text/glyph** must pass through the WCAG adapter so it stays legible on the active surface in **both** schemes:

- substat / appearance text → `adaptSubstatFgOnSurface(fg, surface)` / `adaptSubstatFgForScheme(fg, theme, colorScheme)` or the `useSubstatFgAdapter()` hook.
- rarity-as-text/glyph → `resolveRarityTextColor(rarity, surface)`.
- chips that layer tints over a tinted card → composite the surface first (`resolveCardChipBaseBg`) then `ensureContrastOnBg` against it.
- note DSL syntax highlighting + user `data-color` note colours → published as per-scheme CSS vars by `buildNoteColorSchemeStyles` (each hue run through `ensureContrastOnBg` against the scheme's `background.default`, the surface the note editor/preview sits on); CSS and the tooltip renderer reference `var(--note-tok-*)` / `var(--note-color-*)`.

The surface comes from the **runtime** scheme, never the frozen palette — `resolveSchemePaper(theme, schemeModeFromColorScheme(colorScheme))` (see the gotcha below). `schemeModeFromColorScheme(undefined) === 'dark'` to match `defaultMode="dark"`.

### Valid exceptions — where a RAW colour is correct (do NOT adapt/consolidate)

- **Colour pickers / swatches** (`ManageColorsDialog`, the NoteDialog colour-picker swatches via raw `NOTE_COLOR_HEX`) — the swatch shows the literal value being chosen, not how the text will render.
- **Chart DATA fills** (donut slices, bars, rarity/stat series in Gear Analytics) — the colour *is* the datum; adapting would break legend↔slice correspondence.
- **Data sources / defaults** (`useSubstatColors`, `DEFAULT_SUBSTAT_COLORS_*`).
- **`src/theme.ts` build-time palette derivations** — per-scheme `darken`/`lighten` building the two palettes (this is the one place `darken`/`lighten` and per-scheme `isDark` branching belong).
- **Easter eggs** — intentionally **theme-agnostic**: fixed local colours, *not* sourced from the palette or `colorTints`, so the gag looks identical in both schemes.

### The mandate

When you see anything that does not match this system — an inline rgba/`alpha()` magic number, a raw user colour used as text, a theme colour inside an easter egg, a duplicated literal, or near-duplicate values for one role — **consolidate it** into the appropriate module above, unless it is one of the valid exceptions. This is the SSOT/One-Definition-Rule hard gate applied to colour.

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

When the alpha itself differs per scheme (light 0.18 vs dark 0.28 below), that is an
`APP_SCHEME_ALPHAS`/`CUSTOM_TOKENS` case — define one `theme.custom.*` token whose `--app-*`
alpha var resolves differently per scheme, rather than hand-writing two rgba literals. Reserve
`applyStyles('dark', …)` for genuinely non-token, scheme-specific CSS (e.g. the fixed warm
amber-grey fills of `ContextMenuPaper`'s close button — its borders ride the gold TINTs). The two-rgba form is shown only to illustrate the mechanism:
```ts
// Mechanism illustration only — prefer theme.custom.<token> for per-scheme alphas.
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

The colour editor flyout: PaletteIcon button + Menu with the scheme toggle (**Dark / Light / RSLH**), colour pickers (accent, toggle, selection, background, paper, dividers, **frame gold, title gold**, success, warning, error, **info, three text colours, scrollbar thumb**), **UI/code font-family text fields**, border-radius and selection-opacity sliders, colour-blind mode, psychedelic toggle, and stat-button border preference. Switching scheme resets manual customizations so each scheme starts from its own defaults. `hasCustomization` is computed generically (`Object.values(draft).some(v => v != null)`) and reset uses the shared `EMPTY_THEME_CUSTOMIZATION` SSOT, so new fields need no per-field bookkeeping.

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
| `statColorScope` / `rarityColorScope` / `slotColorScope` | `'off' \| 'controls' \| 'text' \| 'everything'` | localStorage | Per-group colour SCOPE. 4-state cycle off→controls→text→everything. `off` = none; `controls` = interactive controls only (toggle buttons, selects/menus, closed-select displays); `text` = non-control display only (chips, preview, table cells, tooltips, summaries, history, rarity borders/charts); `everything` = controls + text. `controls` and `text` are disjoint. **Per-group factory defaults reproduce v1.0.26's effective look** (before the scope feature): stats = `text` (chips/preview only, never buttons), slots = `everything` (tints on every slot glyph incl. builder toggles), rarity = `text` (rarity WORDS colour in text contexts; rarity accents/glyphs are always-on regardless of scope). SSOT: `src/lib/colorScope.ts` (`DEFAULT_STAT_COLOR_SCOPE` / `DEFAULT_SLOT_COLOR_SCOPE` / `DEFAULT_RARITY_COLOR_SCOPE`, `scopeColorsControls` / `scopeColorsText`). The theme-menu / table-header master toggle flips all three between `off` and their factory defaults. |
| `psychedelic` | boolean | session only | Resets on page reload; controls `PsychedelicEffect` |

Each colour group exposes its scope through one provider (`StatColorProvider` / `RarityPaletteProvider` / `SlotTintProvider`), which computes a CONTROL colour set (scope ∈ {controls, everything}) and a TEXT colour set (scope ∈ {text, everything}). Components pick the right one: `<StatLabel inControl?>` / `<RarityLabel inControl?>` read the control colour inside buttons/selects, else the text colour; control slot contexts (builder slot toggle grids, slot selects, the rules-filter slot toggles) wrap their glyphs in `SlotTintControlScope` so `makeSlotIcon` picks the control-scoped tint. Rarity accents (`useRarityAccentColor`, borders/charts) are TEXT-class display (colour at text/everything). The Manage Colors dialog ("Color settings") shows a `CycleButton` (Off / Controls / Text / Everything) at the top of each of its three sections.

Slot glyph tints (top-6 artifact = light yellow, bottom-3 accessory = light blue) are user-editable in the Manage Colors flyout and persisted under `sellfileCreator.slotTints.v1` (`{ artifact, accessory }` hex). The SSOT lives in `src/lib/slotTints.ts` (defaults + `useSlotTints`) and `src/lib/slotTintContext.tsx` (`SlotTintProvider` + `useSlotTintColor`), which contrast-adapts each tint to the runtime scheme via `useSubstatFgAdapter`. The icon factory `makeSlotIcon` (in `src/components/artifactTypeIcons.tsx`) reads the context and colours the SVG's `currentColor`, so all slot-glyph render sites tint automatically. Artifact-vs-accessory classification reuses `isAccessorySlot` (`src/lib/gearInspectorDomain.ts`).

**Rarity palette.** The six rarity colours (`RARITY_ACCENT_COLORS`, rarity 1–6) are user-editable in the Manage Colors flyout and persisted under `sellfileCreator.rarityColors.v1`. One palette is the single source of truth for both uses: raw accents (borders / chart fills / gear-card frames — read verbatim, NOT contrast-adapted, coloured only at scope `everything`) and rarity-label TEXT (contrast-adapted + gated by `rarityColorScope`). SSOT: `src/lib/rarityColors.ts` (`RarityColors`, `DEFAULT_RARITY_COLORS`, `useRarityColors`, palette-param resolvers) + `src/lib/rarityColorContext.tsx` (`RarityPaletteProvider`, `useRarityAccentColor` for raw, `useRarityTextColor`/`useRarityLabelColorMap` for adapted text). Rarity WORDS render through `<RarityLabel>`/`<RarityCodeLabel>`/`<RarityLabelList>` (`src/components/RarityLabel.tsx`); plain-string contexts (history timeline, table cells, chip summaries) tint via the shared inline colorizer `renderColoredStatText` (which now takes a rarity label→colour map). File/clipboard exports (`sfcIO.ts`) stay plain — no styling channel.

**Stat-name tinting.** Stat/substat NAMES render coloured everywhere (buttons, selects, labels, table cells, summaries) — not just substat chips. SSOT: `src/lib/statColorContext.tsx` (`StatColorProvider`, `useStatTextColor`/`useStatTextColorMap`, adapted via `useSubstatFgAdapter`) + the `<StatLabel>` component (`src/components/StatLabel.tsx`). All gated by `statColorScope`.

The three providers (`SlotTintProvider`, `RarityPaletteProvider`, `StatColorProvider`) are nested in `App.tsx`, all fed by the same master flag. The Manage Colors dialog (title key `titleSubstatChipColors`, value "Color settings") edits substat colours, slot tints, and the rarity palette.

Access via `useDisplayPreferences()` (state) and `useDisplayPreferenceActions()` (setters).

---

## Shared Chip Styles — `src/components/builderStatusChipStyles.ts`

`createBuilderStatusChipSx(theme)` returns a function `(enabled, opts?) => SxProps` used by both the builder panels and cheat-sheet chips. Keeps all status-chip sizing, colour, hover, focus, and disabled styles in one place.

Key implementation notes:
- Uses `TINT.successStatusChipBg` (success channel at a fixed alpha, from `colorTints`) for the active background — no inline rgba.
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
  backgroundColor: `${TINT.neutralRowZebra} !important`,
},
'& .wmde-markdown table th, & .wmde-markdown table td': {
  borderColor: 'var(--mui-palette-divider)',
  color: 'var(--mui-palette-text-primary)',
},
'& .wmde-markdown table th': {
  backgroundColor: TINT.neutralHeaderBg,
},
```

(`TINT.neutralRowZebra` / `TINT.neutralHeaderBg` are the role-named tints from `colorTints` — the zebra-row and table-header neutral overlays. Don't re-inline the rgba.)

---

## Checklist — Adding a Theme-Aware Component

1. **Colour values** — Use `theme.custom.*` / `TINT.*` for tints, `theme.vars?.palette.*` for MUI semantic tokens. **No inline `rgba(...)` or `alpha(x, 0.n)` magic numbers** — fixed-alpha tints come from `TINT`, JS alphas from `ALPHA`, per-scheme alphas from `theme.custom.*`. No bare `theme.palette.*` except inside `alpha()`/`darken()` JS math — and even there prefer `theme.colorSchemes.dark?.palette.*`.
2. **User/preset colours as text** — Contrast-adapt them (`useSubstatFgAdapter()` / `adaptSubstatFgForScheme` / `resolveRarityTextColor`) against the **runtime** scheme surface (`resolveSchemePaper(theme, schemeModeFromColorScheme(colorScheme))`). This includes tooltip content — the gold-skin tooltip plate IS `background.paper`. Raw colours are only correct for the valid exceptions (pickers, chart fills, data sources, easter eggs).
3. **Scheme branching** — Use `theme.applyStyles('dark', {...})` for non-token CSS overrides; use `useColorScheme()` for runtime scheme checks in component logic.
4. **Third-party markdown** — Always set `data-color-mode={colorScheme ?? 'dark'}` on the WMDE container; add table overrides (see above).
5. **CSS variable properties** — If a MUI component uses an internal CSS variable (like `--Alert-color`), override that variable rather than the derived `color` property, so the override wins regardless of MUI's injection order.
6. **JS colour utilities** — Conversions/parsing/contrast all live in `colorUtils` (`parseCssColorToRgb`, `ensureContrastOnBg`, …) — never re-implement them inline. When passing CSS var strings to them, resolve to hex first via `getComputedStyle`.
7. **Test both schemes** — Toggle dark/light in the app to confirm the component adapts. Pay particular attention to borders, text, and background on elements that are not standard MUI Paper/Typography.
8. **Consolidate mismatches** — If you touch code with an inline alpha/hex, a raw user colour used as text, or a duplicated/near-duplicate value, fold it into the colour SSOT (see *Color SSOT → The mandate*).
