/**
 * ThemeEditorMenu
 *
 * Self-contained palette/theme editor: the PaletteIcon button + the Menu it opens.
 * Owns color-picker state, dark/light toggle, and display prefs. The psychedelic animation
 * runs in the companion PsychedelicEffect component (always mounted in App.tsx).
 * Extracted from HelpDialog so HelpDialog stays focused on content layout.
 */
import React from 'react'
import {
  Box, Button, Divider, IconButton, Menu, MenuItem,
  Slider, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import PaletteIcon from '@mui/icons-material/Palette'
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined'
import { useColorScheme, useTheme } from '@mui/material/styles'
import type { ColorBlindMode, ThemeMode } from '../lib/constants'
import {
  AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MAX,
  AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MIN,
  AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_STEP,
  EMPTY_THEME_CUSTOMIZATION,
  MENU_CONTROL_HEIGHT_PX,
  MENU_CONTROL_MIN_WIDTH_PX,
} from '../lib/constants'
import { useThemeCustomization } from '../state/themeCustomization'
import { RSLH_PRESET } from '../lib/rslhPreset'
import { useRslhEnabled, setRslhEnabled } from '../state/themeModePreference'
import { useDisplayPreferenceActions, useDisplayPreferences } from '../state/preferencesState'
import { DEFAULT_COLOR_SCOPE } from '../lib/colorScope'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ColorField from './ColorField'
import { MenuCycleRow } from './MenuCycleRow'
import { MenuToggleRow } from './MenuToggleRow'
import { makeColorBlindCycleOptions, colorBlindCycleVariant } from '../lib/colorBlindCycleOptions'
import { hslDegToHex, hexToHSL, hexToChannelTriplet } from '../lib/colorUtils'
import { makeManageColorsIcon } from '../lib/icons'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'

// Composites semi-transparent rgba(255,255,255,alpha) onto a #RRGGBB background
// to get a solid hex approximation — used for toggle-button swatch fallbacks in dark mode.

// Seconds over which the animation blends from the current theme colors into psychedelic targets.
const WARMUP_SECS = 6

// CSS variables written/removed by the psychedelic animation — stable module-level constant
// so the effect dependency array does not need to list this array.
const PSYCHEDELIC_VARS = [
  '--mui-palette-primary-main',         '--mui-palette-primary-mainChannel',
  '--mui-palette-success-main',         '--mui-palette-success-mainChannel',
  '--mui-palette-warning-main',         '--mui-palette-warning-mainChannel',
  '--mui-palette-error-main',           '--mui-palette-error-mainChannel',
  '--mui-palette-background-default',   '--mui-palette-background-defaultChannel',
  '--mui-palette-background-paper',     '--mui-palette-background-paperChannel',
  '--mui-palette-divider',              '--mui-palette-action-selected',
] as const

export default function ThemeEditorMenu({ colorBlindMode, setColorBlindMode, onOpenManageColors }: {
  colorBlindMode?: ColorBlindMode
  setColorBlindMode?: (m: ColorBlindMode) => void
  onOpenManageColors?: () => void
}) {
  const { t } = useI18n()
  const muiTheme = useTheme()
  // MUI owns the dark/light mode exactly as before. RSLH is a separate flag layered on the dark
  // base (its values are merged into the theme upstream), so it does not touch this path.
  const { colorScheme, setColorScheme: setMode } = useColorScheme()
  const rslhEnabled = useRslhEnabled()
  // The 3-way value shown by the toggle: RSLH wins (it sits on the dark base).
  const themeMode: ThemeMode = rslhEnabled ? 'rslh' : (colorScheme === 'light' ? 'light' : 'dark')
  // Pick a scheme + write the RSLH flag accordingly. dark/light → flag off + MUI setMode;
  // rslh → flag on + MUI dark base. resetColors() runs for any switch (each starts from defaults).
  const setThemeMode = React.useCallback((next: ThemeMode) => {
    if (next === 'rslh') { setMode('dark'); setRslhEnabled(true) }
    else { setRslhEnabled(false); setMode(next) }
  }, [setMode])
  // RSLH is dark-based, so dark-leaning fallbacks (white toggle text etc.) apply to it.
  const isDark = themeMode !== 'light'
  // The MUI scheme key whose palette backs the picker fallback swatches: rslh → dark.
  const muiSchemeKey: 'dark' | 'light' = isDark ? 'dark' : 'light'
  // theme.palette.* always returns light-scheme hex in CSS vars mode; use colorSchemes[key]
  // to get concrete values for the active scheme — needed for color-picker fallback swatches.
  // colorSchemes exists at runtime in CSS vars mode but isn't on useTheme()'s Theme type.
  type SchemeMap = Partial<Record<'dark' | 'light', { palette: typeof muiTheme.palette }>>
  const schemePalette = ((muiTheme as unknown as { colorSchemes?: SchemeMap }).colorSchemes?.[muiSchemeKey])?.palette

  // Picker/placeholder fallback for an un-edited field. RSLH applies its preset OVER the dark base
  // (see rslhPreset.ts), but the popout edits the user's own `themeCustom` — which is null for any
  // field the user hasn't touched. So when RSLH is active, the effective default for an un-edited
  // field is the RSLH preset value, not the dark base. Surface that here so the swatch/placeholder
  // shows what is actually in effect (e.g. selection = #cc9064, not dark's #4e94e5). Where the RSLH
  // preset leaves a field null, it inherits the dark base, so we fall through to `base`.
  const fieldFallback = React.useCallback(<K extends keyof typeof RSLH_PRESET>(field: K, base: string): string => {
    if (rslhEnabled) {
      const preset = RSLH_PRESET[field]
      if (typeof preset === 'string' && preset.length > 0) return preset
    }
    return base
  }, [rslhEnabled])

  const colorIconSrc = React.useMemo(() => makeManageColorsIcon(), [])
  const [themeCustom, setThemeCustom] = useThemeCustomization()
  const [themeMenuAnchorEl, setThemeMenuAnchorEl] = React.useState<HTMLElement | null>(null)
  const themeMenuOpen = Boolean(themeMenuAnchorEl)
  const closeThemeMenu = React.useCallback(() => setThemeMenuAnchorEl(null), [])
  // Ref attached to every open ColorField popover paper so the outside-click guard
  // treats drags inside the color picker as "inside" and doesn't close the menu.
  const colorPickerPopoverRef = React.useRef<HTMLDivElement>(null)
  const { menuRef: themeMenuRef, contextMenuGuard: themeMenuGuard } = useContextMenuPaperGuard({ open: themeMenuOpen, onClose: closeThemeMenu, insideRefs: [colorPickerPopoverRef] })

  // Draft state: color pickers write here on every drag step (onChange) so the picker
  // stays visually responsive. The store (and thus the MUI theme rebuild) is only updated
  // via onChangeCommitted — once when the popover closes — same pattern as ManageColorsDialog.
  const [draft, setDraft] = React.useState(themeCustom)
  // Rising-edge sync: pull committed customization into draft whenever the menu opens.
  // Uses the render-time comparison pattern (same as prevHelpOpen above) to avoid refs.
  const [prevMenuOpen, setPrevMenuOpen] = React.useState(themeMenuOpen)
  if (themeMenuOpen !== prevMenuOpen) {
    setPrevMenuOpen(themeMenuOpen)
    if (themeMenuOpen) setDraft(themeCustom)
  }

  const { psychedelic } = useDisplayPreferences()
  const { setPsychedelic } = useDisplayPreferenceActions()

  const resetColors = React.useCallback(() => {
    setPsychedelic(false)
    // SSOT empty-customization object — keeps reset in sync with the store fallback / theme default.
    setDraft(EMPTY_THEME_CUSTOMIZATION)
    setThemeCustom(EMPTY_THEME_CUSTOMIZATION)
  }, [setThemeCustom, setPsychedelic])

  // Any field set (non-null) counts as customization — drives the reset button visibility.
  const hasCustomization = Object.values(draft).some(v => v != null)
  const { statColorScope, rarityColorScope, slotColorScope, autoSideBySideZoomEnabled, autoSideBySideMinZoom } = useDisplayPreferences()
  const { setStatColorScope, setRarityColorScope, setSlotColorScope, setAutoSideBySideZoomEnabled, setAutoSideBySideMinZoom } = useDisplayPreferenceActions()
  // Master colour toggle: on ⇒ any group not off; toggling sets all three to everything / off.
  const anyColorScopeOn = statColorScope !== 'off' || rarityColorScope !== 'off' || slotColorScope !== 'off'
  const setAllColorScopes = (on: boolean) => {
    const next = on ? DEFAULT_COLOR_SCOPE : 'off'
    setStatColorScope(next); setRarityColorScope(next); setSlotColorScope(next)
  }

  return (
    <>
      <Tooltip title={t('themeSettings')}>
        <IconButton
          size="small"
          aria-label={t('themeSettings')}
          onClick={(e) => setThemeMenuAnchorEl(e.currentTarget)}
        >
          <PaletteIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        open={themeMenuOpen}
        anchorEl={themeMenuAnchorEl}
        onClose={closeThemeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: { ...buildContextMenuPaperSlotProps({
            component: ContextMenuPaper,
            contextMenuGuard: themeMenuGuard,
            onRequestClose: closeThemeMenu,
            closeLabel: t('close'),
          }), ref: themeMenuRef as React.Ref<HTMLDivElement> },
          // ContextMenuPaper forces `overflow: visible` on the paper (so the close button can
          // sit outside it). That disables the paper's own scroll, so a tall menu would spill
          // its rows past the painted background. Move the cap+scroll onto the inner list:
          // it stays inside the paper bg and scrolls when the content exceeds the viewport.
          list: { sx: { maxHeight: 'calc(100vh - 112px)', overflowY: 'auto' } },
        }}
      >
        {/* Dark/light mode row */}
        <MenuItem disableRipple sx={{ gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('themeMode')}</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={themeMode}
            // Switching scheme also resets manual customizations so each scheme starts from its
            // own defaults (RSLH's orange/dark, dark's blue, etc.) rather than carrying overrides across.
            // dark/light switch MUI's mode; rslh sets the RSLH flag on the dark base.
            onChange={(_, v) => { if (v != null && v !== themeMode) { setThemeMode(v as ThemeMode); resetColors() } }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* RSLH — the RSL Helper skin (third scheme). Placed first; dark stays the default
                selection (see defaultMode="dark" in main.tsx). Proper-noun label, not translated. */}
            <ToggleButton value="rslh" aria-label={t('themeRslhAria')}>
              <SmartToyOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} />{t('themeRslh')}
            </ToggleButton>
            <ToggleButton value="dark" aria-label={t('themeDarkAria')}>
              <DarkModeIcon fontSize="small" sx={{ mr: 0.5 }} />{t('themeDark')}
            </ToggleButton>
            <ToggleButton value="light" aria-label={t('themeLightAria')}>
              <LightModeIcon fontSize="small" sx={{ mr: 0.5 }} />{t('themeLight')}
            </ToggleButton>
          </ToggleButtonGroup>
        </MenuItem>
        <Divider />
        {/* Color pickers — operate on local draft; debounce commits to store. */}
        {/* Each `fallback` is the dark/light base default; fieldFallback() swaps in the RSLH preset
            value when RSLH is active and that field hasn't been edited, so the swatch reflects what
            is actually applied (e.g. selection #cc9064) instead of the dark base. */}
        {([
          { label: t('themeColorAccent'),     field: 'primaryColor'  as const, fallback: fieldFallback('primaryColor', schemePalette?.primary?.main ?? muiTheme.palette.primary.main) },
          // Toggle fallback: dark uses #ffffff (matches theme.ts default); light uses primary.
          { label: t('themeColorToggles'),    field: 'toggleColor'   as const, fallback: fieldFallback('toggleColor', isDark
              ? '#ffffff'
              : (schemePalette?.primary?.main ?? muiTheme.palette.primary.main)) },
          // Selection fallback: dark uses #4e94e5 (matches theme.ts default); light uses primary.
          { label: t('themeColorSelection'),  field: 'selectionColor' as const, fallback: fieldFallback('selectionColor', isDark
              ? '#4e94e5'
              : (schemePalette?.primary?.main ?? muiTheme.palette.primary.main)) },
          { label: t('themeColorBackground'), field: 'bgColor'       as const, fallback: fieldFallback('bgColor', schemePalette?.background?.default ?? muiTheme.palette.background.default) },
          { label: t('themeColorPaper'),      field: 'paperColor'    as const, fallback: fieldFallback('paperColor', schemePalette?.background?.paper ?? muiTheme.palette.background.paper) },
          { label: t('themeColorDividers'),   field: 'dividerColor'  as const, fallback: fieldFallback('dividerColor', schemePalette?.divider ?? muiTheme.palette.divider) },
          { label: t('themeColorSuccess'),    field: 'successColor'  as const, fallback: fieldFallback('successColor', schemePalette?.success?.main ?? muiTheme.palette.success.main) },
          { label: t('themeColorWarning'),    field: 'warningColor'  as const, fallback: fieldFallback('warningColor', schemePalette?.warning?.main ?? muiTheme.palette.warning.main) },
          { label: t('themeColorError'),      field: 'errorColor'    as const, fallback: fieldFallback('errorColor', schemePalette?.error?.main ?? muiTheme.palette.error.main) },
          { label: t('themeColorInfo'),       field: 'infoColor'     as const, fallback: fieldFallback('infoColor', schemePalette?.info?.main ?? muiTheme.palette.info.main) },
          // Text colors — fallbacks read the active scheme's resolved text palette.
          { label: t('themeColorTextPrimary'),   field: 'textPrimaryColor'   as const, fallback: fieldFallback('textPrimaryColor', schemePalette?.text?.primary   ?? muiTheme.palette.text.primary) },
          { label: t('themeColorTextSecondary'), field: 'textSecondaryColor' as const, fallback: fieldFallback('textSecondaryColor', schemePalette?.text?.secondary ?? muiTheme.palette.text.secondary) },
          { label: t('themeColorTextDisabled'),  field: 'textDisabledColor'  as const, fallback: fieldFallback('textDisabledColor', schemePalette?.text?.disabled  ?? muiTheme.palette.text.disabled) },
          // Scrollbar thumb — fallback is the active scheme divider (current default behavior).
          { label: t('themeColorScrollbar'),  field: 'scrollbarThumbColor' as const, fallback: fieldFallback('scrollbarThumbColor', schemePalette?.divider ?? muiTheme.palette.divider) },
        ]).map(({ label, field, fallback }) => (
          <MenuItem key={field} disableRipple sx={{ gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{label}</Typography>
            <ColorField
              value={draft[field] ?? fallback}
              onChange={(v) => setDraft(prev => ({ ...prev, [field]: v }))}
              onChangeCommitted={(v) => setThemeCustom(prev => ({ ...prev, [field]: v }))}
              onClear={() => { setDraft(prev => ({ ...prev, [field]: null })); setThemeCustom(prev => ({ ...prev, [field]: null })) }}
              popoverRef={colorPickerPopoverRef}
            />
          </MenuItem>
        ))}
        {/* Border radius — controls global corner rounding for buttons, chips, cards, etc. */}
        <MenuItem disableRipple sx={{ gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('themeCorners')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: MENU_CONTROL_MIN_WIDTH_PX }} onClick={(e) => e.stopPropagation()}>
            <Slider
              size="small"
              value={draft.borderRadius ?? 8}
              min={0} max={24} step={1}
              onChange={(_, v) => setDraft(prev => ({ ...prev, borderRadius: v as number }))}
              onChangeCommitted={(_, v) => setThemeCustom(prev => ({ ...prev, borderRadius: v as number }))}
              sx={{ flex: 1 }}
            />
            <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right', color: 'text.secondary' }}>
              {draft.borderRadius ?? 8}px
            </Typography>
          </Box>
        </MenuItem>
        {/* Selection highlight — controls opacity of the primary-tinted selection bg on chips, list items, etc.
            null = mode default (light: 12%, dark: MUI gray). Slider shows effective percent. */}
        <MenuItem disableRipple sx={{ gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('themeSelectionOpacity')}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: MENU_CONTROL_MIN_WIDTH_PX }} onClick={(e) => e.stopPropagation()}>
            <Slider
              size="small"
              value={Math.round((draft.selectionOpacity ?? (isDark ? 0.08 : 0.12)) * 100)}
              min={0} max={30} step={1}
              onChange={(_, v) => setDraft(prev => ({ ...prev, selectionOpacity: (v as number) / 100 }))}
              onChangeCommitted={(_, v) => setThemeCustom(prev => ({ ...prev, selectionOpacity: (v as number) / 100 }))}
              sx={{ flex: 1 }}
            />
            <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right', color: 'text.secondary' }}>
              {Math.round((draft.selectionOpacity ?? (isDark ? 0.08 : 0.12)) * 100)}%
            </Typography>
          </Box>
        </MenuItem>
        {/* Font families — free-form CSS font-family values. Empty = default stack.
            Commit on blur (and Enter) so the theme rebuild fires once, not per keystroke.
            Placeholder uses fieldFallback so an un-edited field under RSLH shows the RSLH preset
            font (Segoe UI / Cascadia Code) that is actually applied, not the generic default. */}
        {([
          { label: t('themeFontUi'),   field: 'uiFontFamily'   as const, placeholder: fieldFallback('uiFontFamily', t('themeFontDefault')) },
          { label: t('themeFontCode'), field: 'codeFontFamily' as const, placeholder: fieldFallback('codeFontFamily', 'JetBrains Mono') },
        ]).map(({ label, field, placeholder }) => (
          <MenuItem key={field} disableRipple sx={{ gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{label}</Typography>
            <Box sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX }} onClick={(e) => e.stopPropagation()}>
              <TextField
                size="small"
                variant="outlined"
                placeholder={placeholder}
                value={draft[field] ?? ''}
                onChange={(e) => setDraft(prev => ({ ...prev, [field]: e.target.value }))}
                // Commit the trimmed value (or null when blank) to the store on blur / Enter.
                onBlur={(e) => { const v = e.target.value.trim(); setThemeCustom(prev => ({ ...prev, [field]: v.length > 0 ? v : null })) }}
                // Stop keystrokes from bubbling to the Menu, whose built-in typeahead would
                // otherwise swallow letters (typing "C" jumps to a menu item instead of the field).
                // Keep Enter → blur to commit.
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); e.stopPropagation() }}
                sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
              />
            </Box>
          </MenuItem>
        ))}
        <Divider />
        {/* Color vision — same CycleButton pattern as gear inspector / rules table */}
        <MenuCycleRow
          label={t('rulesMenuColorBlindPalette')}
          options={makeColorBlindCycleOptions(t)}
          value={colorBlindMode ?? 'normal'}
          variant={colorBlindCycleVariant(colorBlindMode)}
          onChange={(v) => setColorBlindMode?.(v as ColorBlindMode)}
        />
        <Divider />
        {/* Stat-text colorization + slot glyph tints — same On/Off + manage-colors pattern as gear inspector */}
        <MenuToggleRow
          label={t('rulesMenuColorStatsSlotsRarity')}
          checked={anyColorScopeOn}
          onChange={() => setAllColorScopes(!anyColorScopeOn)}
          trailing={
            <MarkdownTooltip markdown={t('manageColors')}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  sx={{ minWidth: 28, width: 28, height: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0, px: 0.25 }}
                  onClick={(e) => { e.stopPropagation(); onOpenManageColors?.() }}
                  aria-label={t('manageColorsAria')}
                >
                  <img src={colorIconSrc} width={16} height={16} alt={t('manageColors')} style={{ display: 'block' }} />
                </Button>
              </span>
            </MarkdownTooltip>
          }
        />
        <Divider />
        {/* Auto side-by-side zoom — master switch. Off reverts to the native breakpoint layout. */}
        <MenuToggleRow
          label={t('themeAutoZoom')}
          tooltip={t('themeAutoZoomTooltip')}
          checked={autoSideBySideZoomEnabled}
          onChange={() => setAutoSideBySideZoomEnabled(!autoSideBySideZoomEnabled)}
        />
        {/* Cutoff: the smallest zoom we apply before reverting to the native layout. Shown as a
            percentage; disabled (greyed) when auto-zoom is off since it has no effect then. */}
        <MenuItem disableRipple sx={{ gap: 1, alignItems: 'center' }}>
          <Typography
            variant="body2"
            sx={{ flex: 1, minWidth: 0, color: autoSideBySideZoomEnabled ? 'text.primary' : 'text.disabled' }}
          >
            {t('themeAutoZoomCutoff')}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: MENU_CONTROL_MIN_WIDTH_PX }} onClick={(e) => e.stopPropagation()}>
            <Slider
              size="small"
              disabled={!autoSideBySideZoomEnabled}
              value={autoSideBySideMinZoom}
              min={AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MIN}
              max={AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_MAX}
              step={AUTO_SIDE_BY_SIDE_MIN_ZOOM_SLIDER_STEP}
              // Numeric float commits are cheap and the store ignores no-op writes, so commit on
              // every change for live feedback rather than only onChangeCommitted.
              onChange={(_, v) => setAutoSideBySideMinZoom(v as number)}
              sx={{ flex: 1 }}
            />
            <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right', color: 'text.secondary' }}>
              {Math.round(autoSideBySideMinZoom * 100)}%
            </Typography>
          </Box>
        </MenuItem>
        <Divider />
        {/* Psychedelic cycle — purely cosmetic fun feature; lives at the bottom so it stays out of the way. */}
        <MenuItem disableRipple sx={{ gap: 0, alignItems: 'center', p: 0 }} onClick={() => setPsychedelic(!psychedelic)}>
          <MarkdownTooltip markdown={t('themePsychedelicTooltip')} placement="left">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, px: 2, py: 0.75 }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('themePsychedelic')}</Typography>
              <Box
                sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
                onClick={(e) => e.stopPropagation()}
              >
                <Box sx={{
                  '@keyframes psychedelicHue': { from: { filter: 'hue-rotate(0deg)' }, to: { filter: 'hue-rotate(360deg)' } },
                  animation: 'psychedelicHue 3s linear infinite',
                  display: 'flex', alignItems: 'stretch',
                }}>
                  <Button
                    size="small"
                    variant={psychedelic ? 'contained' : 'outlined'}
                    color="secondary"
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, flex: '1 1 auto', lineHeight: 1, py: 0, px: 1, height: '100%' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPsychedelic(!psychedelic)
                    }}
                  >
                    {psychedelic ? t('commonOn') : t('commonOff')}
                  </Button>
                </Box>
              </Box>
            </Box>
          </MarkdownTooltip>
        </MenuItem>
        {/* Reset colors — only shown when the user has active customizations */}
        {hasCustomization && (
          <>
            <Divider />
            <MenuItem disableRipple sx={{ py: 0.5 }}>
              <Button size="small" variant="outlined" color="error" onClick={resetColors} sx={{ width: '100%' }}>
                {t('resetToDefaults')}
              </Button>
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  )
}

/**
 * PsychedelicEffect — null-rendering component, always mounted in App.tsx.
 * Runs the hue-cycling animation when psychedelic is enabled in the display
 * preferences context. Lifecycle is fully independent of any dialog or menu.
 */
export function PsychedelicEffect() {
  const { psychedelic } = useDisplayPreferences()
  const { colorScheme } = useColorScheme()
  const isDark = colorScheme !== 'light'
  // Ref so the interval sees the current scheme without restarting on mode switch.
  const isDarkRef = React.useRef(isDark)
  React.useEffect(() => { isDarkRef.current = isDark }, [isDark])

  // Animation state persists across psychedelic on→off→on cycles via the ref.
  // Nulled on turn-off so the next turn-on starts fresh with a new warmup.
  const stateRef = React.useRef<{
    lastMs: number; h: number; t: number
    p0: number; p1: number; p2: number; p3: number
    initS: number; initL: number; initBgS: number; initBgL: number
  } | null>(null)

  React.useEffect(() => {
    if (!psychedelic) {
      stateRef.current = null
      for (const v of PSYCHEDELIC_VARS) document.documentElement.style.removeProperty(v)
      return
    }

    // Sample current CSS vars for warmup start colors.
    const style = getComputedStyle(document.documentElement)
    const curPrimary = style.getPropertyValue('--mui-palette-primary-main').trim()
    const curBg      = style.getPropertyValue('--mui-palette-background-default').trim()
    const initHSL    = hexToHSL(curPrimary)
    const initBgHSL  = hexToHSL(curBg)
    stateRef.current = {
      lastMs: Date.now(), h: initHSL?.h ?? Math.random() * 360, t: 0,
      p0: Math.random() * Math.PI * 2, p1: Math.random() * Math.PI * 2,
      p2: Math.random() * Math.PI * 2, p3: Math.random() * Math.PI * 2,
      initS: initHSL?.s ?? 70, initL: initHSL?.l ?? 50,
      initBgS: initBgHSL?.s ?? 0, initBgL: initBgHSL?.l ?? 10,
    }

    const root = document.documentElement
    const id = setInterval(() => {
      const s = stateRef.current
      if (!s) return
      const dark  = isDarkRef.current
      const blend = Math.min(s.t / WARMUP_SECS, 1)
      const bgS   = blend * 15 + (1 - blend) * s.initBgS
      const bgL   = blend * (dark ? 8 : 93) + (1 - blend) * s.initBgL
      const now   = Date.now()
      const dt    = Math.min((now - s.lastMs) / 1000, 0.1)
      s.lastMs    = now
      const speed    = 8 + 4 * Math.sin(s.t * 0.31 + s.p0) + 2 * Math.sin(s.t * 0.73 + s.p1)
      const targetAS = 80 + 12 * Math.sin(s.t * 0.19 + s.p2)
      const targetAL = (dark ? 57 : 44) + 6 * Math.sin(s.t * 0.11 + s.p3)
      const aS = blend * targetAS + (1 - blend) * s.initS
      const aL = blend * targetAL + (1 - blend) * s.initL
      s.h += speed * dt
      s.t += dt
      const primary   = hslDegToHex(s.h,       aS, aL)
      const success   = hslDegToHex(s.h + 130, aS, aL)
      const warning   = hslDegToHex(s.h + 175, aS, aL)
      const error     = hslDegToHex(s.h + 215, aS, aL)
      const bgDefault = hslDegToHex(s.h + 260, bgS, bgL)
      const bgPaper   = hslDegToHex(s.h + 280, bgS + 5, dark ? bgL + 5 : bgL - 5)
      const divider   = hslDegToHex(s.h + 320, 28, dark ? 22 : 70)
      const selHex    = hslDegToHex(s.h + 80, aS, aL)
      const selOpacity = dark ? 0.08 : 0.12
      const sr = parseInt(selHex.slice(1, 3), 16)
      const sg = parseInt(selHex.slice(3, 5), 16)
      const sb = parseInt(selHex.slice(5, 7), 16)
      root.style.setProperty('--mui-palette-primary-main',              primary)
      root.style.setProperty('--mui-palette-primary-mainChannel',       hexToChannelTriplet(primary))
      root.style.setProperty('--mui-palette-success-main',              success)
      root.style.setProperty('--mui-palette-success-mainChannel',       hexToChannelTriplet(success))
      root.style.setProperty('--mui-palette-warning-main',              warning)
      root.style.setProperty('--mui-palette-warning-mainChannel',       hexToChannelTriplet(warning))
      root.style.setProperty('--mui-palette-error-main',                error)
      root.style.setProperty('--mui-palette-error-mainChannel',         hexToChannelTriplet(error))
      root.style.setProperty('--mui-palette-background-default',        bgDefault)
      root.style.setProperty('--mui-palette-background-defaultChannel', hexToChannelTriplet(bgDefault))
      root.style.setProperty('--mui-palette-background-paper',          bgPaper)
      root.style.setProperty('--mui-palette-background-paperChannel',   hexToChannelTriplet(bgPaper))
      root.style.setProperty('--mui-palette-divider',                   divider)
      root.style.setProperty('--mui-palette-action-selected',           `rgba(${sr},${sg},${sb},${selOpacity})`)
    }, 40)
    return () => clearInterval(id)
  }, [psychedelic])

  return null
}
