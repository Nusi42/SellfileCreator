/**
 * theme.ts
 *
 * Builds the MUI CSS-variables theme. Using colorSchemes (dark + light) so scheme
 * switching via useColorScheme() only toggles the data-mui-color-scheme attribute
 * — no React re-renders, no emotion CSS regeneration, no 13-second UI freeze.
 *
 * themeMode is NO LONGER a parameter here. The active scheme is handled entirely
 * by MUI's ThemeProvider (reads/writes modeStorageKey in localStorage).
 */
import { alpha, createTheme, darken, lighten } from '@mui/material/styles'
import { outlinedInputClasses } from '@mui/material/OutlinedInput'
import type { ColorBlindMode, ThemeCustomization } from './lib/constants'
import {
  SAFE_TEXT_LINE_HEIGHT,
  BORDER_STYLE_DIVIDER,
  EMPTY_THEME_CUSTOMIZATION,
  FONT_SIZE_BASE_PX,
  FONT_SIZE_BASE_REM,
  FONT_SIZE_SECONDARY_PX,
  FONT_SIZE_SECONDARY_REM,
  FONT_SIZE_TITLE_REM,
} from './lib/constants'
import { CUSTOM_TOKENS, FLOATING_LAYER_SHADOW, GOLD_INSET_SHADOW, SCHEME_SELECTOR_ATTR, TOOLTIP_SHADOW } from './lib/themeCustomTokens'
import { hexToChannelTriplet } from './lib/colorUtils'
// The Paper's lit inner line is NOT branched here: GOLD_INSET_SHADOW rides a CSS alpha var
// that the 'neutral' style zeroes at the scheme selector (see buildCustomValueVars), so the
// one shadow string keeps serving both frame languages.
import { GOLD_SECTION_TITLE_SX, resolveBorderStyleMode } from './lib/goldSkin'
import GoldDialogPaper from './components/GoldDialogPaper'

const EMPTY_CUSTOM: ThemeCustomization = EMPTY_THEME_CUSTOMIZATION

// palette.gold carries the skin's two accents per scheme (see goldSkin.ts for the CSS-var
// consumers). MUI only auto-generates channel vars for its own known slots, so the channels
// (used by rgba(var(--mui-palette-gold-mainChannel) / …) tokens) are attached explicitly.
declare module '@mui/material/styles' {
  interface Palette {
    gold: { main: string; light: string }
  }
  interface PaletteOptions {
    gold?: { main: string; light: string; mainChannel?: string; lightChannel?: string }
  }
}

// Disabled controls: the stat/rarity color scopes paint label spans directly
// (StatLabel / RarityLabel / SubstatToggleDisplay), which overrides the
// action.disabled color MUI sets on the control ROOT — so a disabled toggle kept
// its full-strength stat color and looked enabled. Draining every descendant via
// a grayscale filter restores an unmistakable disabled look no matter how (or
// where) content color is applied; default near-gray labels are visually unchanged.
const DISABLED_CONTROL_FILTER = { filter: 'grayscale(1)' } as const

// Builds per-scheme palette options. Called twice (dark, light) so both colorSchemes receive
// their full palette including custom overrides and color-blind alternatives.
//
// RSLH is NOT a scheme here — it is the dark theme with the RSLH value-set merged into `custom`
// upstream (see rslhPreset.ts + main.tsx). So RSLH's orange/greys/fonts arrive through the same
// custom.* fields a user edits by hand; this builder needs no RSLH-specific branch.
function buildSchemePalette(isDark: boolean, colorBlindMode: ColorBlindMode, custom: ThemeCustomization) {
  // Okabe–Ito (deuter/protan friendly)
  const OI = { success: '#0072B2', warning: '#E69F00', error: '#D55E00' }
  // Tritan-friendly (avoid blue/yellow pairing)
  const TR = { success: '#009E73', warning: '#E69F00', error: '#CC79A7' }

  const over = colorBlindMode === 'okabeIto'
    ? { success: { main: OI.success, contrastText: '#fff' }, warning: { main: OI.warning, contrastText: '#000' }, error: { main: OI.error, contrastText: '#fff' } }
    : colorBlindMode === 'tritan'
    ? { success: { main: TR.success, contrastText: '#fff' }, warning: { main: TR.warning, contrastText: '#000' }, error: { main: TR.error, contrastText: '#000' } }
    : {}

  // Which frame language this palette is built for (null ⇒ gold, the shipped default).
  const borderStyle = resolveBorderStyleMode(custom)

  // Gold-skin bases: deep desaturated navy framed by gold molding in dark; the same molding
  // on parchment in light. Cyan primary is spent on the selected/focused thing only.
  const primaryMain = custom.primaryColor ?? (isDark ? '#46c8f0' : '#0e7fa8')
  const defaultBg    = isDark ? '#0b1017' : '#ddd5c2'
  const defaultPaper = isDark ? '#101a26' : '#efe9d9'
  const bgDefault    = custom.bgColor ?? defaultBg
  const bgPaperDerived = custom.bgColor != null
    ? (isDark ? lighten(bgDefault, 0.06) : darken(bgDefault, 0.03))
    : defaultPaper
  const bgPaper = custom.paperColor ?? bgPaperDerived

  // Selection tint defaults to the primary accent in both schemes (the skin's "cyan is the
  // selected thing" rule); dark's former separate #4e94e5 blue died with the GitHub palette.
  const selColor   = custom.selectionColor ?? primaryMain
  const selOpacity = custom.selectionOpacity ?? (isDark ? 0.16 : 0.12)

  // The two gold accents (frame molding / title voice) — customization-aware like every other
  // slot; the RSLH preset routes its warmer golds through the same fields. Channel triplets are
  // attached by hand because MUI only auto-generates them for its own palette slots.
  const goldFrame = custom.frameGoldColor ?? (isDark ? '#c9a24b' : '#8a6a2a')
  const goldTitle = custom.titleGoldColor ?? (isDark ? '#e9d8a6' : '#6d5620')

  // Text colors: a custom override (incl. the RSLH preset's greys) wins; otherwise the skin's
  // three greys — navy-tinted on dark, warm ink on parchment. Exactly three levels: content /
  // supporting / deliberately-inactive; everything else is told apart by size and weight.
  const textOverrides: Record<string, string> = {
    primary:   custom.textPrimaryColor   ?? (isDark ? '#ccd6e0' : '#2a2416'),
    secondary: custom.textSecondaryColor ?? (isDark ? '#a6b3c2' : '#5a5342'),
    // Light disabled stays raised above MUI's 0.38 default (see pre-gold history) so it reads
    // clearly on parchment without looking like active secondary text.
    disabled:  custom.textDisabledColor  ?? (isDark ? '#5d6b7a' : 'rgba(42,36,22,0.50)'),
  }

  return {
    primary: { main: primaryMain },
    background: { default: bgDefault, paper: bgPaper },
    // Under the gold skin every hairline is a dimmed gold — the resting frame IS the molding.
    // 'neutral' border style hands the pre-gold greys back (see BORDER_STYLE_DIVIDER); either
    // way an explicit picker colour wins. Colour on a frame always means state, never class.
    divider: custom.dividerColor ?? BORDER_STYLE_DIVIDER[borderStyle][isDark ? 'dark' : 'light'],
    gold: {
      main: goldFrame,
      light: goldTitle,
      mainChannel: hexToChannelTriplet(goldFrame),
      lightChannel: hexToChannelTriplet(goldTitle),
    },
    action: { selected: alpha(selColor, selOpacity), selectedOpacity: selOpacity },
    text: textOverrides,
    // Pre-set Alert.successFilledColor before MUI's setColor() runs.
    // MUI computes this from getContrastText(success.dark) — dark green → white — but
    // v1.0.13 used getContrastText(success.main) = rgba(0,0,0,0.87).  setColor() only
    // writes when the key is absent, so pre-setting it here locks in the correct value.
    ...(isDark ? { Alert: { successFilledColor: 'rgba(0,0,0,0.87)' } } : {}),
    // Custom semantic colours (incl. the RSLH preset's success/warning/error) first…
    ...(custom.successColor != null && { success: { main: custom.successColor } }),
    ...(custom.warningColor != null && { warning: { main: custom.warningColor } }),
    ...(custom.errorColor   != null && { error:   { main: custom.errorColor   } }),
    // …then the color-blind palette wins: accessibility overrides decorative choice, so a
    // selected palette takes effect even under RSLH or a user's own success/warning/error.
    ...over,
    // info: custom override only; dark/light otherwise defer to MUI's default info.
    ...(custom.infoColor != null ? { info: { main: custom.infoColor } } : {}),
  }
}

export function makeTheme(colorBlindMode: ColorBlindMode, custom: ThemeCustomization = EMPTY_CUSTOM) {
  const darkPalette  = buildSchemePalette(true,  colorBlindMode, custom)
  const lightPalette = buildSchemePalette(false, colorBlindMode, custom)

  // UI font family: custom override (incl. RSLH preset's Segoe UI) wins; else MUI's default
  // stack (undefined leaves it untouched). Code/markdown font is applied via the --font-code
  // CSS var in main.tsx, not here.
  const uiFontFamily = custom.uiFontFamily ?? undefined

  return createTheme({
    // colorSchemeSelector: Without this, MUI defaults to 'media' when both dark and
    // light colorSchemes are provided — which ignores setMode() entirely and always
    // follows the OS preference. We need data-attribute toggling for the manual toggle.
    // SCHEME_SELECTOR_ATTR is the one definition — the per-scheme GlobalStyles injections in
    // themeCustomTokens.ts target the very same attribute and must never drift from it.
    cssVariables: { colorSchemeSelector: SCHEME_SELECTOR_ATTR },
    colorSchemes: {
      dark:  { palette: darkPalette  },
      light: { palette: lightPalette },
    },
    shape: { borderRadius: custom.borderRadius ?? 8 },
    typography: {
      // Custom UI font (if set) overrides the default stack across all typography variants.
      ...(uiFontFamily ? { fontFamily: uiFontFamily } : {}),
      fontSize: FONT_SIZE_BASE_PX,
      body1:    { fontSize: `${FONT_SIZE_BASE_REM}rem` },
      body2:    { fontSize: `${FONT_SIZE_BASE_REM}rem` },
      subtitle2:{ fontSize: `${FONT_SIZE_BASE_REM}rem`, fontWeight: 600 },
      caption:  { fontSize: `${FONT_SIZE_SECONDARY_REM}rem` },
      // fontWeight 400: MUI defaults buttons (and Tab/ToggleButton/Chip, which inherit
      // typography.button) to 500. Arial silently rounds 500→400 (it has no Medium face), so
      // Dark/Light always looked regular; fonts with a real 500 (Segoe UI under RSLH) rendered
      // them visibly bolder. Pin 400 so buttons read regular-weight consistently across fonts.
      button:   { fontSize: `${FONT_SIZE_BASE_REM}rem`, textTransform: 'none', fontWeight: 400 },
      h6:       { fontSize: `${FONT_SIZE_TITLE_REM}rem`, fontWeight: 600 },
    },
    custom: CUSTOM_TOKENS,
    components: {
      MuiButton: {
        defaultProps: { variant: 'contained' },
        styleOverrides: {
          // Descender-safe line-height so "g"/"y" tails are not clipped under deeper-descender
          // fonts (Segoe UI in RSLH). Buttons flex-center their label, so footprint is unchanged.
          root: { lineHeight: SAFE_TEXT_LINE_HEIGHT, '&.Mui-disabled': DISABLED_CONTROL_FILTER },
          sizeSmall: { fontSize: `${FONT_SIZE_BASE_REM}rem` },
        },
      },
      MuiIconButton: {
        // Same disabled-desaturation as buttons/toggles — icon-only controls can carry
        // stat/rarity-colored glyphs too.
        styleOverrides: { root: { '&.Mui-disabled': DISABLED_CONTROL_FILTER } },
      },
      MuiTab: {
        // Tabs inherit typography.button; give their label the same descender-safe line-height.
        styleOverrides: { root: { lineHeight: SAFE_TEXT_LINE_HEIGHT } },
      },
      MuiPaper: {
        styleOverrides: {
          // The molding: dim-gold hairline + faint lit inner line — the double-frame every
          // surface wears. backgroundImage:'none' kills MUI's dark-mode elevation overlay
          // (rgba(255,255,255,…) painted over paper), which washed dialogs (elevation 24)
          // and menus (8) into grey; with it gone the gold frame is the only depth cue.
          root: ({ theme }) => ({
            border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
            backgroundImage: 'none',
            boxShadow: GOLD_INSET_SHADOW,
          }),
        },
      },
      MuiAlert: {
        styleOverrides: {
          // Darken filled success alerts so toast surfaces are less neon/bright.
          // applyStyles('dark') provides correct dark-scheme values since theme.palette.*
          // always reflects the light-scheme hex in MUI v9 CSS variables mode.
          colorSuccess: ({ theme }) => ({
            '&.MuiAlert-filled': {
              backgroundColor: darken(theme.palette.success.main, 0.42),
              border: `1px solid ${alpha(theme.palette.success.light, 0.35)}`,
              ...theme.applyStyles('dark', {
                backgroundColor: darken(theme.colorSchemes.dark?.palette.success?.main ?? theme.palette.success.main, 0.42),
                border: `1px solid ${alpha(theme.colorSchemes.dark?.palette.success?.light ?? theme.palette.success.light, 0.35)}`,
              }),
            },
          }),
        },
      },
      MuiTooltip: {
        defaultProps: {
          arrow: true,
          placement: 'top-start',
          disableInteractive: true,
          slotProps: {
            popper: {
              // position:fixed poppers never extend the document's scrollable overflow,
              // so a tooltip momentarily past the viewport edge (Popper positions before
              // the post-measure --app-zoom scaling settles) cannot flash root scrollbars.
              popperOptions: { strategy: 'fixed' },
              modifiers: [
                { name: 'offset',          options: { offset: [0, 8] } },
                { name: 'preventOverflow', options: { boundary: 'viewport', altAxis: true, tether: true } },
              ],
            },
          },
        },
        styleOverrides: {
          // The hover plate is a small gold-framed panel, not MUI's stock grey pill: paper
          // surface, gold hairline, lit inner line, and TOOLTIP_SHADOW — a border shadow
          // (even halo on all sides) rather than the floating layers' downward drop, since a
          // tooltip flips to whichever side has room and must separate in every one. Content
          // therefore reads on background.paper — the same surface as every card — so
          // stat/rarity colors inside tooltips go through the normal contrast adapters.
          tooltip: ({ theme }) => ({
            fontSize: `${FONT_SIZE_SECONDARY_PX}px`,
            maxWidth: 640,
            whiteSpace: 'pre-line',
            wordBreak: 'break-word',
            backgroundColor: theme.vars?.palette.background.paper ?? theme.palette.background.paper,
            color: theme.vars?.palette.text.primary ?? theme.palette.text.primary,
            border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
            boxShadow: TOOLTIP_SHADOW,
            // Slightly tighter radius than panels (0.75×) so the plate reads as a badge-scale
            // surface; tracks the user's radius knob instead of pinning a literal.
            borderRadius: `calc(${theme.vars?.shape.borderRadius ?? theme.shape.borderRadius}px * 0.75)`,
            padding: '6px 10px',
            // Scale tooltip content to match #root zoom in forced-SBS mode.
            zoom: 'var(--app-zoom, 1)',
          }),
          // The arrow wears the same paper + gold hairline as the plate it belongs to.
          arrow: ({ theme }) => ({
            color: theme.vars?.palette.background.paper ?? theme.palette.background.paper,
            '&::before': {
              border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
            },
          }),
        },
      },
      MuiDialogTitle: {
        // Dialog titles speak the gold title voice: title-gold text opened by a small
        // frame-gold ◆ (same mark as section titles / the corner ornament gem). Size and
        // weight are unchanged — the voice is color, not geometry.
        styleOverrides: {
          root: {
            fontSize: `${FONT_SIZE_TITLE_REM}rem`,
            fontWeight: 600,
            ...GOLD_SECTION_TITLE_SX,
          },
        },
      },
      MuiDialog: {
        defaultProps: {
          closeAfterTransition: false,
          // Every dialog renders into the ornamented paper (gold corner brackets) — the mark
          // is part of what a dialog IS, not a per-dialog opt-in. PaperComponent (not
          // slots.paper!) rides the styled DialogPaper's `as`, so MUI's dialog-paper layout
          // styles (margins, maxHeight, scroll) are preserved; slots.paper would replace the
          // styled wrapper and drop them (tall dialogs then overflow the viewport).
          // slotProps.paper stays free for per-dialog sizing.
          PaperComponent: GoldDialogPaper,
          slotProps: {
            transition: { timeout: { appear: 0, enter: 0, exit: 150 }, unmountOnExit: true },
          },
        },
        styleOverrides: {
          // Scale dialog paper to match #root zoom in forced-SBS mode.
          // Floating layer: the one soft drop shadow + the molding's lit line (replaces the
          // elevation-24 shadow, whose grey overlay died with backgroundImage:'none' above).
          paper: { zoom: 'var(--app-zoom, 1)', outline: 0, boxShadow: FLOATING_LAYER_SHADOW },
        },
      },
      MuiMenu: {
        defaultProps: { slotProps: { root: { closeAfterTransition: false } } },
      },
      MuiPopover: {
        defaultProps: { slotProps: { root: { closeAfterTransition: false } } },
        styleOverrides: {
          // scale (not zoom) avoids shrinking offsetWidth so MUI's overflow-clamp is unaffected.
          // No transformOrigin override — MUI sets it via inline style per-menu based on anchor
          // position. Forcing 'top left !important' would break right-anchored menus in SBS zoom.
          // Floating layer (also covers Menu, which renders through Popover): drop + lit line.
          paper: { scale: 'var(--app-zoom, 1)', boxShadow: FLOATING_LAYER_SHADOW },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: { scale: 'var(--app-zoom, 1)', boxShadow: FLOATING_LAYER_SHADOW },
        },
      },
      MuiOutlinedInput: {
        // A resting hairline is always the molding: MUI hardcodes the outlined input's border
        // to a grey alpha — the ONE control class that does not read `divider` — so every text
        // field wore a grey frame while every panel beside it wore gold. Hover does not change
        // the frame (colour is spent on STATE alone); focus keeps MUI's primary, error its red.
        styleOverrides: {
          root: ({ theme }) => ({
            [`& .${outlinedInputClasses.notchedOutline}`]: {
              borderColor: theme.vars?.palette.divider ?? theme.palette.divider,
            },
            [`&:hover:not(.${outlinedInputClasses.focused}):not(.${outlinedInputClasses.error}):not(.${outlinedInputClasses.disabled}) .${outlinedInputClasses.notchedOutline}`]: {
              borderColor: theme.vars?.palette.divider ?? theme.palette.divider,
            },
          }),
        },
      },
      MuiSlider: {
        styleOverrides: {
          markLabel: { fontSize: '0.75rem', marginTop: -4 },
          mark:      { height: 8 },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          // applyStyles('light'/'dark') emits [data-mui-color-scheme] selectors so this
          // responds to scheme changes without React re-renders or palette.mode checks.
          // Base styles have NO selected-state overrides — each scheme applies its own via
          // applyStyles, leaving the other scheme to use MUI's natural defaults.
          root: ({ theme }) => {
            const tc = custom.toggleColor
            if (tc != null) {
              return {
                // Descender-safe line-height (see SAFE_TEXT_LINE_HEIGHT) — RSLH's Segoe UI.
                lineHeight: SAFE_TEXT_LINE_HEIGHT,
                '&.Mui-disabled': DISABLED_CONTROL_FILTER,
                '&.Mui-selected': {
                  // Light: tint from custom toggleColor.
                  ...theme.applyStyles('light', {
                    color: tc,
                    backgroundColor: alpha(tc, lightPalette.action.selectedOpacity),
                    '&:hover': { backgroundColor: alpha(tc, lightPalette.action.selectedOpacity + 0.08) },
                  }),
                  // Dark: tint bg only; text stays text.primary (white) for readability.
                  ...theme.applyStyles('dark', {
                    color: 'inherit',
                    backgroundColor: alpha(tc, 0.2),
                    '&:hover': { backgroundColor: alpha(tc, 0.28) },
                  }),
                },
              }
            }
            // No custom toggleColor → light tints from primary, dark tints from #ffffff.
            const toggleMain = lightPalette.primary.main
            const darkToggleMain = '#ffffff'
            return {
              // Descender-safe line-height (see SAFE_TEXT_LINE_HEIGHT) — RSLH's Segoe UI.
              lineHeight: SAFE_TEXT_LINE_HEIGHT,
              '&.Mui-disabled': DISABLED_CONTROL_FILTER,
              '&.Mui-selected': {
                ...theme.applyStyles('light', {
                  color: toggleMain,
                  backgroundColor: alpha(toggleMain, lightPalette.action.selectedOpacity),
                  '&:hover': { backgroundColor: alpha(toggleMain, lightPalette.action.selectedOpacity + 0.08) },
                }),
                ...theme.applyStyles('dark', {
                  color: darkToggleMain,
                  backgroundColor: alpha(darkToggleMain, darkPalette.action.selectedOpacity),
                  '&:hover': { backgroundColor: alpha(darkToggleMain, darkPalette.action.selectedOpacity + 0.08) },
                }),
              },
            }
          },
        },
      },
    },
  })
}

// Default theme for environments that import the default export directly.
const theme = makeTheme('normal')
export default theme
