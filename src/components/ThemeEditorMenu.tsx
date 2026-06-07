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
  Slider, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import PaletteIcon from '@mui/icons-material/Palette'
import { useColorScheme, useTheme } from '@mui/material/styles'
import type { ColorBlindMode } from '../lib/constants'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX } from '../lib/constants'
import { useThemeCustomization } from '../state/themeCustomization'
import { useDisplayPreferenceActions, useDisplayPreferences } from '../state/preferencesState'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ColorField from './ColorField'
import { MenuCycleRow } from './MenuCycleRow'
import { MenuToggleRow } from './MenuToggleRow'
import { makeColorBlindCycleOptions, colorBlindCycleVariant } from '../lib/colorBlindCycleOptions'
import { hslToHex as hslToHexNorm } from '../lib/colorUtils'
import { makeManageColorsIcon } from '../lib/icons'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'

// Composites semi-transparent rgba(255,255,255,alpha) onto a #RRGGBB background
// to get a solid hex approximation — used for toggle-button swatch fallbacks in dark mode.

// Converts HSL to a #rrggbb hex string. Hue wraps automatically; s and l are 0–100.
// Delegates to the shared hslToHex (which uses 0–1 s/l) with scale conversion.
const hslToHex = (h: number, s: number, l: number): string =>
  hslToHexNorm(((h % 360) + 360) % 360, s / 100, l / 100)

// Extracts H (0–360), S (0–100), L (0–100) from a #rrggbb hex string. Returns null for invalid input.
function hexToHSL(hex: string): { h: number; s: number; l: number } | null {
  if (hex.length < 7) return null
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + 6) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

// Seconds over which the animation blends from the current theme colors into psychedelic targets.
const WARMUP_SECS = 6

// Converts a #rrggbb hex to the space-separated "R G B" channel string MUI uses.
function hexToChannel(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)} ${parseInt(hex.slice(3, 5), 16)} ${parseInt(hex.slice(5, 7), 16)}`
}

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
  const { colorScheme, setColorScheme: setMode } = useColorScheme()
  const isDark = colorScheme !== 'light'
  // theme.palette.* always returns light-scheme hex in CSS vars mode; use colorSchemes[scheme]
  // to get concrete values for the active scheme — needed for color-picker fallback swatches.
  // colorSchemes exists at runtime in CSS vars mode but isn't on useTheme()'s Theme type.
  type SchemeMap = { dark?: { palette: typeof muiTheme.palette }; light?: { palette: typeof muiTheme.palette } }
  const schemePalette = ((muiTheme as unknown as { colorSchemes?: SchemeMap }).colorSchemes?.[isDark ? 'dark' : 'light'])?.palette

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
    const blank = { primaryColor: null, toggleColor: null, selectionColor: null, bgColor: null, paperColor: null, dividerColor: null, successColor: null, warningColor: null, errorColor: null, borderRadius: null, selectionOpacity: null } as const
    setDraft(blank)
    setThemeCustom(blank)
  }, [setThemeCustom, setPsychedelic])

  const hasCustomization = draft.primaryColor != null || draft.toggleColor != null || draft.selectionColor != null || draft.bgColor != null || draft.paperColor != null || draft.dividerColor != null || draft.successColor != null || draft.warningColor != null || draft.errorColor != null || draft.borderRadius != null || draft.selectionOpacity != null
  const { statButtonBorders } = useDisplayPreferences()
  const { setStatButtonBorders } = useDisplayPreferenceActions()

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
        }}
      >
        {/* Dark/light mode row */}
        <MenuItem disableRipple sx={{ gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('themeMode')}</Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={colorScheme ?? 'dark'}
            onChange={(_, v) => { if (v != null && v !== (colorScheme ?? 'dark')) { setMode(v as 'dark' | 'light'); resetColors() } }}
            onClick={(e) => e.stopPropagation()}
          >
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
        {([
          { label: t('themeColorAccent'),     field: 'primaryColor'  as const, fallback: schemePalette?.primary?.main ?? muiTheme.palette.primary.main },
          // Toggle fallback: dark uses #ffffff (matches theme.ts default); light uses primary.
          { label: t('themeColorToggles'),    field: 'toggleColor'   as const, fallback: isDark
              ? '#ffffff'
              : (schemePalette?.primary?.main ?? muiTheme.palette.primary.main) },
          // Selection fallback: dark uses #4e94e5 (matches theme.ts default); light uses primary.
          { label: t('themeColorSelection'),  field: 'selectionColor' as const, fallback: isDark
              ? '#4e94e5'
              : (schemePalette?.primary?.main ?? muiTheme.palette.primary.main) },
          { label: t('themeColorBackground'), field: 'bgColor'       as const, fallback: schemePalette?.background?.default ?? muiTheme.palette.background.default },
          { label: t('themeColorPaper'),      field: 'paperColor'    as const, fallback: schemePalette?.background?.paper ?? muiTheme.palette.background.paper },
          { label: t('themeColorDividers'),   field: 'dividerColor'  as const, fallback: schemePalette?.divider ?? muiTheme.palette.divider },
          { label: t('themeColorSuccess'),    field: 'successColor'  as const, fallback: schemePalette?.success?.main ?? muiTheme.palette.success.main },
          { label: t('themeColorWarning'),    field: 'warningColor'  as const, fallback: schemePalette?.warning?.main ?? muiTheme.palette.warning.main },
          { label: t('themeColorError'),      field: 'errorColor'    as const, fallback: schemePalette?.error?.main ?? muiTheme.palette.error.main },
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
        {/* Substat chip colorization — same On/Off + manage-colors pattern as gear inspector */}
        <MenuToggleRow
          label={t('rulesMenuColorStatTexts')}
          checked={statButtonBorders}
          onChange={() => setStatButtonBorders(!statButtonBorders)}
          trailing={
            <MarkdownTooltip markdown={t('manageColors')}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  disabled={!statButtonBorders}
                  sx={{ minWidth: 28, width: 28, height: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0, px: 0.25 }}
                  onClick={(e) => { e.stopPropagation(); if (statButtonBorders) onOpenManageColors?.() }}
                  aria-label={t('manageColorsAria')}
                >
                  <img src={colorIconSrc} width={16} height={16} alt={t('manageColors')} style={{ display: 'block' }} />
                </Button>
              </span>
            </MarkdownTooltip>
          }
        />
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
      const primary   = hslToHex(s.h,       aS, aL)
      const success   = hslToHex(s.h + 130, aS, aL)
      const warning   = hslToHex(s.h + 175, aS, aL)
      const error     = hslToHex(s.h + 215, aS, aL)
      const bgDefault = hslToHex(s.h + 260, bgS, bgL)
      const bgPaper   = hslToHex(s.h + 280, bgS + 5, dark ? bgL + 5 : bgL - 5)
      const divider   = hslToHex(s.h + 320, 28, dark ? 22 : 70)
      const selHex    = hslToHex(s.h + 80, aS, aL)
      const selOpacity = dark ? 0.08 : 0.12
      const sr = parseInt(selHex.slice(1, 3), 16)
      const sg = parseInt(selHex.slice(3, 5), 16)
      const sb = parseInt(selHex.slice(5, 7), 16)
      root.style.setProperty('--mui-palette-primary-main',              primary)
      root.style.setProperty('--mui-palette-primary-mainChannel',       hexToChannel(primary))
      root.style.setProperty('--mui-palette-success-main',              success)
      root.style.setProperty('--mui-palette-success-mainChannel',       hexToChannel(success))
      root.style.setProperty('--mui-palette-warning-main',              warning)
      root.style.setProperty('--mui-palette-warning-mainChannel',       hexToChannel(warning))
      root.style.setProperty('--mui-palette-error-main',                error)
      root.style.setProperty('--mui-palette-error-mainChannel',         hexToChannel(error))
      root.style.setProperty('--mui-palette-background-default',        bgDefault)
      root.style.setProperty('--mui-palette-background-defaultChannel', hexToChannel(bgDefault))
      root.style.setProperty('--mui-palette-background-paper',          bgPaper)
      root.style.setProperty('--mui-palette-background-paperChannel',   hexToChannel(bgPaper))
      root.style.setProperty('--mui-palette-divider',                   divider)
      root.style.setProperty('--mui-palette-action-selected',           `rgba(${sr},${sg},${sb},${selOpacity})`)
    }, 40)
    return () => clearInterval(id)
  }, [psychedelic])

  return null
}
