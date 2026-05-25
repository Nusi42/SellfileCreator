import React from 'react'
import { Dialog, DialogActions, DialogContent, DialogTitle, Button, Box, Typography, IconButton, Tooltip, Menu, Divider, ToggleButtonGroup, ToggleButton, useTheme, Slider } from '@mui/material'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import PaletteIcon from '@mui/icons-material/Palette'
import type { ThemeMode, ColorBlindMode } from '../lib/constants'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX } from '../lib/constants'
import { useThemeCustomization } from '../state/themeCustomization'
import { useDisplayPreferences, useDisplayPreferenceActions } from '../state/preferencesState'
import { CycleButton } from './CycleButton'
import { makeColorBlindCycleOptions, colorBlindCycleVariant } from '../lib/colorBlindCycleOptions'
import { makeManageColorsIcon } from '../lib/icons'
import MarkdownTooltip from './MarkdownTooltip'
import ColorField from './ColorField'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import MDEditor from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import type { Pluggable } from 'unified'
import { getHighlightEffectSx, pickHighlightEffect, HIGHLIGHT_EFFECT_DURATION_MS } from './highlightEffects'

// README content is bundled at build time per language. We render it read-only.
// English README is required; localized variants are optional.
// Use Vite's glob import to include whatever README.*.md files exist at build time.
// Values are raw Markdown strings.
const README_FILES = import.meta.glob('../../README*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
import { APP_VERSION } from '../version'
import { useI18n, useLanguageOptions } from '../lib/i18n'
import { FONT_SIZE_MARKDOWN_PX, FONT_SIZE_HEADER_META_PX } from '../lib/constants'
import { AppTitle } from './AppTitle'
import RslHelperConnectButton from './RslHelperConnectButton'
import { DEFAULT_LANGUAGE } from '../lib/i18n/types'

/**
 * Composites a semi-transparent rgba(255,255,255,alpha) overlay onto a #RRGGBB background
 * to get a solid hex approximation — used for the toggle-button swatch in dark mode.
 */
function blendWhiteAlphaOnHex(alpha: number, bgHex: string): string {
  if (bgHex.length < 7) return '#3a3f48'
  const r = Math.round(parseInt(bgHex.slice(1, 3), 16) + (255 - parseInt(bgHex.slice(1, 3), 16)) * alpha)
  const g = Math.round(parseInt(bgHex.slice(3, 5), 16) + (255 - parseInt(bgHex.slice(3, 5), 16)) * alpha)
  const b = Math.round(parseInt(bgHex.slice(5, 7), 16) + (255 - parseInt(bgHex.slice(5, 7), 16)) * alpha)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const getFaviconLinkHref = (): string | undefined => {
  // Reuse the favicon link injected at build time so we do not bundle a second copy of the SVG.
  if (typeof document === 'undefined') return undefined
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
  for (const link of links) {
    const href = link.getAttribute('href') ?? link.href
    if (href) return href
  }
  return undefined
}

export default function HelpDialog({ open, onClose, onStartTutorial, firstRunMode, connectEnabled, pushEndpointReachable, onToggleConnect, themeMode, setThemeMode, colorBlindMode, setColorBlindMode, onOpenManageColors }: { open: boolean; onClose: () => void; onStartTutorial?: () => void; firstRunMode?: boolean; connectEnabled?: boolean; pushEndpointReachable?: boolean; onToggleConnect?: () => void; themeMode?: ThemeMode; setThemeMode?: (m: ThemeMode) => void; colorBlindMode?: ColorBlindMode; setColorBlindMode?: (m: ColorBlindMode) => void; onOpenManageColors?: () => void }) {
  const rehypePluginsSafe = [rehypeSanitize as unknown as Pluggable]
  const { lang, setLang, t } = useI18n()
  const languageOptions = useLanguageOptions()
  const paperBackgroundImage = React.useMemo(() => {
    const decorativeLayer = 'radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0))'
    const faviconHref = getFaviconLinkHref()
    if (!faviconHref) return decorativeLayer
    return `${decorativeLayer} , url("${faviconHref}")`
  }, [])
  const readmeForLang = React.useMemo(() => {
    // Prefer an exact lang match (e.g., README.pt-BR.md), then fall back to the base language (README.pt.md), finally English.
    const base = lang.split('-')[0]
    const pathFor = (suffix: string) => `../../README${suffix}.md`
    const englishPath = pathFor('')
    const candidates: Array<string | null> = []
    if (lang !== 'empty') candidates.push(pathFor(`.${lang}`))
    candidates.push(base === 'en' || lang === 'empty' ? englishPath : pathFor(`.${base}`))
    candidates.push(englishPath)
    for (const candidate of candidates) {
      if (!candidate) continue
      const content = README_FILES[candidate]
      if (content) return content
    }
    return '# Sellfile Creator for RSL Helper'
  }, [lang])
  const selectValue = React.useMemo(() => (
    languageOptions.some((opt) => opt.code === lang) ? lang : DEFAULT_LANGUAGE
  ), [lang, languageOptions])
  const languageLabel = t('helpLanguage')
  const muiTheme = useTheme()
  // Stable icon src for the manage-colors button; canvas generation only happens once.
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

  const resetColors = React.useCallback(() => {
    const blank = { primaryColor: null, toggleColor: null, selectionColor: null, bgColor: null, paperColor: null, dividerColor: null, successColor: null, warningColor: null, errorColor: null, borderRadius: null, selectionOpacity: null } as const
    setDraft(blank)
    setThemeCustom(blank)
  }, [setThemeCustom])

  const hasCustomization = draft.primaryColor != null || draft.toggleColor != null || draft.selectionColor != null || draft.bgColor != null || draft.paperColor != null || draft.dividerColor != null || draft.successColor != null || draft.warningColor != null || draft.errorColor != null || draft.borderRadius != null || draft.selectionOpacity != null
  const { statButtonBorders } = useDisplayPreferences()
  const { setStatButtonBorders } = useDisplayPreferenceActions()
  // Strip the H1 title (and any injected version badge) from the README before rendering.
  // Why: The title is now rendered as a custom styled React element above the markdown content,
  // so the markdown H1 would be a duplicate. We detect the app title on line 0 and drop it
  // (plus the badge on line 1 if present) so the markdown starts with the first real section.
  const readmeWithVersion = React.useMemo(() => {
    try {
      // Strip UTF-8 BOM if present — README files begin with U+FEFF which would
      // otherwise prevent the leading `# ` H1 detection from matching.
      const text = readmeForLang.replace(/^\uFEFF/, '')
      const lines = text.split(/\r?\n/)
      const first = lines[0] ?? ''
      if (first.startsWith('# Sellfile Creator for RSL Helper') || first.startsWith('# RSL Helper Sellfile Creator')) {
        // Drop the H1 line (the app title); it is rendered as a custom React element above the
        // markdown content, so the raw heading would be a duplicate.
        // Both the current and legacy app name are matched to handle cached/old README content.
        // Also drop a version badge that a prior build may have injected on line 1.
        const startIdx = (lines[1] ?? '').startsWith('###### v') ? 2 : 1
        return lines.slice(startIdx).join('\n')
      }
      return text
    } catch {
      return String(readmeForLang)
    }
  }, [readmeForLang])

  // Periodic, varying highlight for the "Start Tutorial" button.
  // Why: Draw gentle attention on first runs without being repetitive or distracting.
  // A short animation plays every ~5s while the dialog is open; the variant rotates.
  const [effectIdx, setEffectIdx] = React.useState<number | null>(null)
  const prevIdxRef = React.useRef<number | null>(null)
  // Ref-based setter so the interval/timer callbacks avoid the set-state-in-effect lint rule.
  const setEffectIdxRef = React.useRef(setEffectIdx)
  React.useEffect(() => { setEffectIdxRef.current = setEffectIdx }, [setEffectIdx])
  // Reset effect index when dialog closes — render-time adjustment.
  const [prevHelpOpen, setPrevHelpOpen] = React.useState(open)
  if (open !== prevHelpOpen) {
    setPrevHelpOpen(open)
    if (!open) { setEffectIdx(null) }
  }
  React.useEffect(() => {
    if (!open) return
    // Track the latest effect-clear timeout so cleanup can cancel it.
    let activeClearId: number | null = null
    const tick = () => {
      const next = pickHighlightEffect(prevIdxRef.current)
      prevIdxRef.current = next
      setEffectIdxRef.current(next)
      // Cancel a prior clear timeout if tick fires before it expired.
      if (activeClearId !== null) window.clearTimeout(activeClearId)
      activeClearId = window.setTimeout(() => { activeClearId = null; setEffectIdxRef.current(null) }, HIGHLIGHT_EFFECT_DURATION_MS)
    }
    // Fire the first tick immediately so the effect appears without delay.
    tick()
    const intervalId = window.setInterval(tick, 5000)
    return () => {
      window.clearInterval(intervalId)
      if (activeClearId !== null) window.clearTimeout(activeClearId)
      // Reset the previous-effect tracker so the next open cycle starts fresh.
      prevIdxRef.current = null
    }
  }, [open])

  const effectSx = getHighlightEffectSx(effectIdx)
  // Playful first-run proximity effect
  // Why: On the automatically opened Help dialog, gently nudge users toward
  // the tutorial by shrinking the Close button when the cursor approaches it,
  // while enlarging the Start Tutorial button. We use CSS transforms so layout
  // remains stable and reading/scrolling are unaffected.
  const CLOSE_MIN_SCALE = 0.45 as const
  const START_MAX_SCALE = 1.25 as const
  const NEAR_RADIUS_PX = 120 as const // distance from Close center where effect reaches full strength
  const ACTIONS_MIN_HEIGHT_PX = 64 as const // Reserve space to avoid vertical scrollbar during scaling

  const [closeScale, setCloseScale] = React.useState<number>(1)
  const [startScale, setStartScale] = React.useState<number>(1)
  const closeWrapRef = React.useRef<HTMLDivElement | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const targetScalesRef = React.useRef<{ c: number; s: number }>({ c: 1, s: 1 })

  const handleProximity = React.useCallback((x: number, y: number) => {
    const el = closeWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const dx = x - cx
    const dy = y - cy
    const dist = Math.hypot(dx, dy)
    // Normalize 0..1 within the radius; 0 = at center (max effect), 1 = outside radius (no effect)
    const t = Math.min(1, Math.max(0, dist / NEAR_RADIUS_PX))
    const nextClose = CLOSE_MIN_SCALE + (1 - CLOSE_MIN_SCALE) * t
    const nextStart = 1 + (START_MAX_SCALE - 1) * (1 - t)
    // Defer state updates to rAF to keep it responsive during mousemove
    targetScalesRef.current = { c: nextClose, s: nextStart }
    if (rafRef.current == null) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        const { c, s } = targetScalesRef.current
        setCloseScale((prev) => (Math.abs(prev - c) > 0.005 ? c : prev))
        setStartScale((prev) => (Math.abs(prev - s) > 0.005 ? s : prev))
      })
    }
  }, [])

  const resetProximity = React.useCallback(() => {
    targetScalesRef.current = { c: 1, s: 1 }
    if (rafRef.current == null) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null
        setCloseScale(1)
        setStartScale(1)
      })
    }
  }, [])

  // Attach lightweight mouse handlers only when open in first-run mode
  const onDialogMouseMove = React.useCallback<React.MouseEventHandler<HTMLDivElement>>((e) => {
    if (!firstRunMode) return
    handleProximity(e.clientX, e.clientY)
  }, [firstRunMode, handleProximity])
  const onDialogMouseLeave = React.useCallback<React.MouseEventHandler<HTMLDivElement>>(() => {
    if (!firstRunMode) return
    resetProximity()
  }, [firstRunMode, resetProximity])

  // No automatic translation integration: only built-in or local README files are used.
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label={t('helpAriaLabel')}
      maxWidth="lg"
      fullWidth
      slotProps={{ paper: {
        sx: {
          maxHeight: '84vh',
          overflow: 'hidden',
          position: 'relative',
          backgroundColor: 'background.paper',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage: paperBackgroundImage,
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundPosition: 'center top, center',
            backgroundSize: '100% 100%, 80% auto',
            opacity: 0.16,
            pointerEvents: 'none',
            mixBlendMode: 'soft-light',
            zIndex: 0,
          },
          '& > *': { position: 'relative', zIndex: 1 },
        },
      } }}
      onMouseMove={onDialogMouseMove}
      onMouseLeave={onDialogMouseLeave}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <AppTitle />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.6 }}>
            v{APP_VERSION} — © Nusi㊷ - 2026
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          {setThemeMode != null && (
            <>
              <Tooltip title="Theme settings">
                <IconButton
                  size="small"
                  aria-label="Open theme settings"
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
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>Mode</Typography>
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={themeMode ?? 'dark'}
                    onChange={(_, v) => { if (v != null && v !== (themeMode ?? 'dark')) { setThemeMode(v as ThemeMode); resetColors() } }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ToggleButton value="dark" aria-label="Dark mode">
                      <DarkModeIcon fontSize="small" sx={{ mr: 0.5 }} />Dark
                    </ToggleButton>
                    <ToggleButton value="light" aria-label="Light mode">
                      <LightModeIcon fontSize="small" sx={{ mr: 0.5 }} />Light
                    </ToggleButton>
                  </ToggleButtonGroup>
                </MenuItem>
                <Divider />
                {/* Color pickers — operate on local draft; debounce commits to store. */}
                {([
                  { label: 'Accent',     field: 'primaryColor'  as const, fallback: muiTheme.palette.primary.main            },
                  // Toggle fallback: dark mode blends action.selected (white@opacity) over paper; light uses primary.
                  { label: 'Toggles',    field: 'toggleColor'   as const, fallback: themeMode === 'dark'
                      ? blendWhiteAlphaOnHex(muiTheme.palette.action.selectedOpacity, muiTheme.palette.background.paper)
                      : muiTheme.palette.primary.main },
                  // Selection fallback: dark mode blends white@8% over paper (= MUI shipped default); light uses primary.
                  { label: 'Selection',  field: 'selectionColor' as const, fallback: themeMode === 'dark'
                      ? blendWhiteAlphaOnHex(0.08, muiTheme.palette.background.paper)
                      : muiTheme.palette.primary.main },
                  { label: 'Background', field: 'bgColor'       as const, fallback: muiTheme.palette.background.default      },
                  { label: 'Paper',      field: 'paperColor'    as const, fallback: muiTheme.palette.background.paper        },
                  { label: 'Dividers',   field: 'dividerColor'  as const, fallback: muiTheme.palette.divider                 },
                  { label: 'Success',    field: 'successColor'  as const, fallback: muiTheme.palette.success.main            },
                  { label: 'Warning',    field: 'warningColor'  as const, fallback: muiTheme.palette.warning.main            },
                  { label: 'Error',      field: 'errorColor'    as const, fallback: muiTheme.palette.error.main              },
                ] as const).map(({ label, field, fallback }) => (
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
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>Corners</Typography>
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
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>Selection</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: MENU_CONTROL_MIN_WIDTH_PX }} onClick={(e) => e.stopPropagation()}>
                    <Slider
                      size="small"
                      value={Math.round((draft.selectionOpacity ?? (themeMode === 'dark' ? 0.08 : 0.12)) * 100)}
                      min={0} max={30} step={1}
                      onChange={(_, v) => setDraft(prev => ({ ...prev, selectionOpacity: (v as number) / 100 }))}
                      onChangeCommitted={(_, v) => setThemeCustom(prev => ({ ...prev, selectionOpacity: (v as number) / 100 }))}
                      sx={{ flex: 1 }}
                    />
                    <Typography variant="caption" sx={{ minWidth: 30, textAlign: 'right', color: 'text.secondary' }}>
                      {Math.round((draft.selectionOpacity ?? (themeMode === 'dark' ? 0.08 : 0.12)) * 100)}%
                    </Typography>
                  </Box>
                </MenuItem>
                <Divider />
                {/* Color vision — same CycleButton pattern as gear inspector / rules table */}
                <MenuItem sx={{ gap: 1, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorBlindPalette')}</Typography>
                  <CycleButton
                    options={makeColorBlindCycleOptions(t)}
                    value={colorBlindMode ?? 'normal'}
                    variant={colorBlindCycleVariant(colorBlindMode)}
                    onChange={(v) => setColorBlindMode?.(v as ColorBlindMode)}
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
                  />
                </MenuItem>
                <Divider />
                {/* Substat chip colorization — same On/Off + manage-colors pattern as gear inspector */}
                <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setStatButtonBorders(!statButtonBorders)}>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>{t('rulesMenuColorStatTexts')}</Typography>
                  <Box
                    sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      size="small"
                      variant={statButtonBorders ? 'contained' : 'outlined'}
                      color="success"
                      sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, flex: '1 1 auto', lineHeight: 1, py: 0, px: 1, height: '100%' }}
                      onClick={(e) => { e.stopPropagation(); setStatButtonBorders(!statButtonBorders) }}
                    >
                      {statButtonBorders ? t('commonOn') : t('commonOff')}
                    </Button>
                    <MarkdownTooltip markdown={t('manageColors')}>
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="info"
                          disabled={!statButtonBorders}
                          sx={{ minWidth: 28, width: 28, height: '100%', lineHeight: 1, py: 0, px: 0.25 }}
                          onClick={(e) => { e.stopPropagation(); if (statButtonBorders) onOpenManageColors?.() }}
                          aria-label={t('manageColorsAria')}
                        >
                          <img src={colorIconSrc} width={16} height={16} alt={t('manageColors')} style={{ display: 'block' }} />
                        </Button>
                      </span>
                    </MarkdownTooltip>
                  </Box>
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
          )}
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="i18n-language-select-label">{languageLabel}</InputLabel>
            <Select
              labelId="i18n-language-select-label"
              id="i18n-language-select"
              label={languageLabel}
              value={selectValue}
              onChange={(e) => setLang(e.target.value as typeof lang)}
            >
              {languageOptions.map((opt) => (
                <MenuItem key={opt.code} value={opt.code}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box data-allow-select={1 as const} data-allow-context={1 as const} data-color-mode={themeMode ?? 'dark'} sx={{ '& .wmde-markdown': { bgcolor: 'transparent', fontSize: FONT_SIZE_MARKDOWN_PX, lineHeight: 1.7 } }}>
          <MDEditor.Markdown
            source={readmeWithVersion as unknown as string}
            rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
          />
        </Box>
      </DialogContent>
      {firstRunMode ? (
        <DialogActions sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1.25, overflow: 'visible', py: 1, minHeight: `${ACTIONS_MIN_HEIGHT_PX}px`, position: 'relative' }}>
          {/* RSL Helper toggle — absolutely centered on the same row as the buttons */}
          {onToggleConnect != null && (
            <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
              <RslHelperConnectButton
                showLabel
                connectEnabled={connectEnabled ?? false}
                pushEndpointReachable={pushEndpointReachable ?? false}
                onToggleConnect={onToggleConnect}
              />
            </Box>
          )}
          <Box
            ref={closeWrapRef}
            sx={{ display: 'inline-block', lineHeight: 0, transform: `scale(${closeScale})`, transformOrigin: 'center', transition: 'transform 160ms ease-out', willChange: 'transform' }}
          >
            <Button onClick={onClose}>{t('close')}</Button>
          </Box>
          <Box
            sx={{ display: 'inline-block', lineHeight: 0, transform: `scale(${startScale})`, transformOrigin: 'center bottom', transition: 'transform 160ms ease-out', willChange: 'transform' }}
          >
            <Button
              variant="contained"
              color="success"
              onClick={() => onStartTutorial?.()}
              disabled={!onStartTutorial}
              aria-label={t('startTutorial')}
              data-tour-id="help.start-tutorial"
              sx={effectSx}
            >
              <Box component="span" className="start-tutorial-text">{t('startTutorial')}</Box>
            </Button>
          </Box>
        </DialogActions>
      ) : (
        <DialogActions sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'visible', py: 1, minHeight: `${ACTIONS_MIN_HEIGHT_PX}px`, position: 'relative' }}>
          <Button
            variant="contained"
            color="success"
            onClick={() => onStartTutorial?.()}
            disabled={!onStartTutorial}
            aria-label={t('startTutorial')}
            data-tour-id="help.start-tutorial"
            sx={effectSx}
          >
            <Box component="span" className="start-tutorial-text">{t('startTutorial')}</Box>
          </Button>
          {/* RSL Helper toggle — absolutely centered on the same row as the buttons */}
          {onToggleConnect != null && (
            <Box sx={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
              <RslHelperConnectButton
                showLabel
                connectEnabled={connectEnabled ?? false}
                pushEndpointReachable={pushEndpointReachable ?? false}
                onToggleConnect={onToggleConnect}
              />
            </Box>
          )}
          <Button onClick={onClose}>{t('close')}</Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
