import React from 'react'
import { Dialog, DialogActions, DialogContent, Button, Box, Typography } from '@mui/material'
import { FormControl, InputLabel, Select, MenuItem } from '@mui/material'
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
import { useI18n } from '../lib/i18n'
import { FONT_SIZE_MARKDOWN_PX, FONT_SIZE_HEADER_META_PX } from '../lib/constants'
import { AppTitle } from './AppTitle'
import RslHelperConnectButton from './RslHelperConnectButton'
import {
  DEFAULT_LANGUAGE,
  DEV_LANGUAGES,
  PRODUCTION_LANGUAGES,
  type DevLanguage,
  type Language,
  type ProductionLanguage,
} from '../lib/i18n/types'

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

export default function HelpDialog({ open, onClose, onStartTutorial, firstRunMode, connectEnabled, pushEndpointReachable, onToggleConnect }: { open: boolean; onClose: () => void; onStartTutorial?: () => void; firstRunMode?: boolean; connectEnabled?: boolean; pushEndpointReachable?: boolean; onToggleConnect?: () => void }) {
  const rehypePluginsSafe = [rehypeSanitize as unknown as Pluggable]
  const { lang, setLang, t } = useI18n()
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
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
  // Language selector is always visible; dev builds keep the blank-audit language.
  const languageOptions: ReadonlyArray<{ code: Language; label: string }> = React.useMemo(() => {
    const productionLabels: Record<ProductionLanguage, string> = {
      'en-US': 'English (EN)',
      'de-DE': 'Deutsch (DE)',
      'fr-FR': 'Français (FR)',
      'es-ES': 'Español (ES)',
      'it-IT': 'Italiano (IT)',
      'pt-BR': 'Português (BR)',
      'pt-PT': 'Português (PT)',
      'ru-RU': 'Русский (RU)',
      'uk-UA': 'Українська (UK)',
      'tr-TR': 'Türkçe (TR)',
    }
    const devLabels: Record<DevLanguage, string> = {
      empty: 'Empty (dev)',
    }
    const production = PRODUCTION_LANGUAGES.map((code) => ({ code, label: productionLabels[code] }))
    if (!isDev) return production
    const dev = DEV_LANGUAGES.map((code) => ({ code, label: devLabels[code] }))
    return [...dev, ...production]
  }, [isDev])
  const selectValue = React.useMemo(() => (
    languageOptions.some((opt) => opt.code === lang) ? lang : DEFAULT_LANGUAGE
  ), [lang, languageOptions])
  const languageLabel = t('helpLanguage')
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
      PaperProps={{
        sx: {
          maxHeight: '84vh',
          overflow: 'visible',
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
      }}
      onMouseMove={onDialogMouseMove}
      onMouseLeave={onDialogMouseLeave}
    >
      <DialogContent dividers>
        {/* Language selector — right-aligned, no sticky behaviour */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
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
        {/* App title — replaces the stripped README H1; shared component with main screen */}
        <Box sx={{ mb: 1.5 }}>
          <AppTitle />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.6 }}>
            v{APP_VERSION} — © Nusi㊷ - 2026
          </Typography>
        </Box>
        <Box data-allow-select={1 as const} data-allow-context={1 as const} data-color-mode={('dark' as const)} sx={{ '& .wmde-markdown': { bgcolor: 'transparent', fontSize: FONT_SIZE_MARKDOWN_PX, lineHeight: 1.7 } }}>
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
