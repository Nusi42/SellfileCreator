import React from 'react'
import { Dialog, DialogActions, DialogContent, Button, Box } from '@mui/material'
import { Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material'
import MDEditor from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import type { Pluggable } from 'unified'
import { keyframes } from '@emotion/react'

// README content is bundled at build time. We render it read-only.
// Why: Keep user-facing docs accessible offline from within the app.
// Vite's ?raw import reads the file contents as a string.
// @ts-ignore - Vite injects this import at build time
import README_MD from '../../README.md?raw'
import { APP_VERSION } from '../version'
import { useI18n } from '../lib/i18n'

export default function HelpDialog({ open, onClose, onStartTutorial, firstRunMode }: { open: boolean; onClose: () => void; onStartTutorial?: () => void; firstRunMode?: boolean }) {
  const rehypePluginsSafe = [rehypeSanitize as unknown as Pluggable]
  const { lang, setLang, t } = useI18n()
  const languageOptions: ReadonlyArray<{ code: typeof lang; label: string }> = [
    { code: 'empty', label: 'Empty (dev)' },
    { code: 'en-US', label: 'English (EN)' },
    { code: 'de-DE', label: 'Deutsch (DE)' },
    { code: 'fr-FR', label: 'Français (FR)' },
    { code: 'es-ES', label: 'Español (ES)' },
    { code: 'pt-PT', label: 'Português (PT)' },
    { code: 'ru-RU', label: 'Русский (RU)' },
    { code: 'uk-UA', label: 'Українська (UK)' },
    { code: 'tr-TR', label: 'Türkçe (TR)' },
  ] as const
  // Inject version into the README title line at render time.
  // Why: Keep the README.md in the repo clean and stable, but show users the app version contextually.
  const readmeWithVersion = React.useMemo(() => {
    try {
      const text = String(README_MD ?? '')
      const lines = text.split(/\r?\n/)
      const first = lines[0] ?? ''
      if (first.startsWith('# RSL Helper Sellfile Creator')) {
        // Insert a small version/author line under the title
        const badge = `###### v${APP_VERSION}`
        // Avoid duplicating if such a line already exists
        if ((lines[1] ?? '').startsWith('###### v')) {
          lines[1] = badge
        } else {
          lines.splice(1, 0, badge)
        }
        return lines.join('\n')
      }
      return text
    } catch {
      return String(README_MD ?? '')
    }
  }, [])

  // Periodic, varying highlight for the "Start Tutorial" button.
  // Why: Draw gentle attention on first runs without being repetitive or distracting.
  // A short animation plays every ~5s while the dialog is open; the variant rotates.
  const [effectIdx, setEffectIdx] = React.useState<number | null>(null)
  const prevIdxRef = React.useRef<number>(-1)
  React.useEffect(() => {
    if (!open) return
    const variants = 27
    const tick = (): number => {
      // Weighted pick:
      // - crazy effects (17..19): ~20%
      // - text-specific effects (10..16): ~30%
      // - subtle/general (0..9): ~50%
      const subtlePool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      const textPool = [10, 11, 12, 13, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26]
      const crazyPool = [17, 18, 19]
      const r = Math.random()
      const pool = r < 0.20 ? crazyPool : (r < 0.50 ? textPool : subtlePool)
      // avoid repeating the same variant twice in a row
      let next = pool[Math.floor(Math.random() * pool.length)]!
      if (next === prevIdxRef.current) next = (next + 1) % variants
      prevIdxRef.current = next
      setEffectIdx(next)
      // auto-clear after a short burst
      const clearId: number = window.setTimeout(() => setEffectIdx(null), 1200)
      return clearId
    }
    const id = window.setInterval(() => { const clearId = tick(); window.setTimeout(() => window.clearTimeout(clearId), 0) }, 5000)
    // trigger immediately once on open
    const firstClearId = tick()
    return () => { window.clearInterval(id); window.clearTimeout(firstClearId) }
  }, [open])

  // Keyframe variants (subtle ring/glow/sweep). Intentionally short and varied.
  const kfGlow = keyframes`
    0% { box-shadow: 0 0 0px 0 rgba(3,169,244,0), 0 0 0px 0 rgba(3,169,244,0); }
    30% { box-shadow: 0 0 12px 2px rgba(3,169,244,0.55), 0 0 0px 0 rgba(3,169,244,0); }
    100% { box-shadow: 0 0 0px 0 rgba(3,169,244,0), 0 0 0px 0 rgba(3,169,244,0); }
  `
  const kfRing = keyframes`
    0% { outline: 0px solid rgba(255,235,59,0); }
    35% { outline: 4px solid rgba(255,235,59,0.6); }
    100% { outline: 0px solid rgba(255,235,59,0); }
  `
  const kfSweep = keyframes`
    0% { background-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 100%); background-size: 200% 100%; background-position: -100% 0; }
    60% { background-position: 100% 0; }
    100% { background-position: 100% 0; }
  `
  const kfPulse = keyframes`
    0% { transform: translateZ(0) scale(1); filter: saturate(1); }
    35% { transform: translateZ(0) scale(1.04); filter: saturate(1.15); }
    100% { transform: translateZ(0) scale(1); filter: saturate(1); }
  `
  const kfTextWobble = keyframes`
    0% { letter-spacing: 0; transform: translateZ(0); }
    30% { letter-spacing: 1px; transform: translateY(-1px) rotate(-0.5deg); }
    60% { letter-spacing: -0.5px; transform: translateY(1px) rotate(0.5deg); }
    100% { letter-spacing: 0; transform: translateZ(0); }
  `
  const kfExplode = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
    30% { box-shadow: 0 0 18px 6px rgba(76, 175, 80, 0.6); }
    100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  `
  const kfCrumble = keyframes`
    0% { filter: none; transform: translateZ(0); }
    40% { filter: contrast(1.15) saturate(1.1); transform: translateY(1px) rotate(-0.3deg); }
    100% { filter: none; transform: translateZ(0); }
  `
  // Less subtle effects (rarer picks)
  const kfBouncePop = keyframes`
    0% { transform: scale(1); }
    40% { transform: scale(1.12); }
    70% { transform: scale(0.98); }
    100% { transform: scale(1); }
  `
  const kfRainbowFlash = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(0,0,0,0); filter: hue-rotate(0deg) saturate(1); }
    30% { box-shadow: 0 0 16px 6px rgba(255,255,255,0.6); filter: hue-rotate(180deg) saturate(1.6); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); filter: hue-rotate(360deg) saturate(1); }
  `
  const kfShakeBlast = keyframes`
    0% { transform: translate(0,0) rotate(0deg); }
    25% { transform: translate(-1px, 1px) rotate(-1deg); }
    50% { transform: translate(1px, -1px) rotate(1deg); }
    75% { transform: translate(-1px, 0px) rotate(-1deg); }
    100% { transform: translate(0,0) rotate(0deg); }
  `
  // Additional text-only effects
  const kfTextSlideOnly = keyframes`
    0% { transform: translateX(0); }
    50% { transform: translateX(6px); }
    100% { transform: translateX(0); }
  `
  const kfTextFlipYBack = keyframes`
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(180deg); }
  `
  const kfTextHoverLift = keyframes`
    0% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
    100% { transform: translateY(0); }
  `
  const kfTextSpinSmall = keyframes`
    0% { transform: rotate(0deg); }
    100% { transform: rotate(180deg); }
  `
  const kfTextRainbowOnly = keyframes`
    0% { filter: hue-rotate(0deg) saturate(1.0); }
    100% { filter: hue-rotate(360deg) saturate(1.6); }
  `
  const kfTextWaveSkew = keyframes`
    0% { letter-spacing: 0; transform: skewX(0deg); }
    50% { letter-spacing: 1px; transform: skewX(6deg); }
    100% { letter-spacing: 0; transform: skewX(0deg); }
  `
  const kfButtonSlide = keyframes`
    0% { transform: translateX(0); }
    50% { transform: translateX(8px); }
    100% { transform: translateX(0); }
  `
  const kfTextCatchUp = keyframes`
    0% { transform: translateX(0); }
    35% { transform: translateX(0); }
    85% { transform: translateX(8px); }
    100% { transform: translateX(0); }
  `
  // Text-specific set (applied to the button or child spans generically)
  const kfTextHeartbeat = keyframes`
    0% { transform: scale(1); }
    25% { transform: scale(1.10); }
    50% { transform: scale(1.0); }
    75% { transform: scale(1.08); }
    100% { transform: scale(1); }
  `
  const kfTextRainbow = keyframes`
    0% { filter: hue-rotate(0deg) saturate(1.0); }
    100% { filter: hue-rotate(360deg) saturate(1.4); }
  `
  const kfTextBackflip = keyframes`
    0% { transform: rotateY(0deg); }
    100% { transform: rotateY(360deg); }
  `
  const kfTextRotate = keyframes`
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  `
  const kfTextWave = keyframes`
    0% { letter-spacing: 0; }
    50% { letter-spacing: 1.2px; }
    100% { letter-spacing: 0; }
  `
  const kfTextGlow = keyframes`
    0% { text-shadow: 0 0 0px rgba(255,255,255,0); }
    50% { text-shadow: 0 0 8px rgba(255,255,255,0.8); }
    100% { text-shadow: 0 0 0px rgba(255,255,255,0); }
  `
  const kfTextSlideSkew = keyframes`
    0% { transform: translateX(0) skewX(0deg); }
    50% { transform: translateX(2px) skewX(4deg); }
    100% { transform: translateX(0) skewX(0deg); }
  `
  // Extra crazy set (still brief)
  const kfCrazySpinZoom = keyframes`
    0% { transform: rotate(0deg) scale(1); }
    50% { transform: rotate(540deg) scale(1.2); }
    100% { transform: rotate(720deg) scale(1); }
  `
  const kfCrazyWobble = keyframes`
    0% { transform: rotate(0deg) translate(0,0); }
    25% { transform: rotate(-6deg) translate(-2px,1px); }
    50% { transform: rotate(6deg) translate(2px,-1px); }
    75% { transform: rotate(-4deg) translate(-1px,0px); }
    100% { transform: rotate(0deg) translate(0,0); }
  `
  const kfCrazyBurst = keyframes`
    0% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    40% { box-shadow: 0 0 24px 10px rgba(255,255,255,0.75); }
    100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
  `
  // Compute effect style for the Start Tutorial button. No hook needed; all inputs are static
  // except for effectIdx.
  const effectSx = (() => {
    switch (effectIdx) {
      case 0: return { animation: `${kfGlow} 900ms ease-out` }
      case 1: return { animation: `${kfRing} 950ms ease-out` }
      case 2: return { position: 'relative', overflow: 'hidden', '&::after': { content: '""', position: 'absolute', inset: 0, animation: `${kfSweep} 1000ms ease-out`, pointerEvents: 'none' } }
      case 3: return { animation: `${kfPulse} 800ms ease-out` }
      case 4: return { '& .MuiButton-label, & .MuiButton-startIcon, & .MuiButton-endIcon': { animation: `${kfTextWobble} 900ms ease-out` } }
      case 5: return { animation: `${kfExplode} 850ms ease-out` }
      case 6: return { animation: `${kfCrumble} 900ms ease-out` }
      case 7: return { animation: `${kfBouncePop} 900ms cubic-bezier(.2,1.2,.2,1)` }
      case 8: return { animation: `${kfRainbowFlash} 950ms ease-out` }
      case 9: return { animation: `${kfShakeBlast} 800ms ease-in-out` }
      // Text-specific (applied to button content broadly)
      case 10: return { animation: `${kfTextHeartbeat} 900ms ease-in-out` }
      case 11: return { animation: `${kfTextRainbow} 1000ms linear` }
      case 12: return { animation: `${kfTextBackflip} 900ms ease-in-out`, transformStyle: 'preserve-3d' }
      case 13: return { animation: `${kfTextRotate} 950ms ease-in-out` }
      case 14: return { animation: `${kfTextWave} 850ms ease-in-out` }
      case 15: return { animation: `${kfTextGlow} 900ms ease-out` }
      case 16: return { animation: `${kfTextSlideSkew} 900ms ease-in-out` }
      // Crazy (rarer)
      case 17: return { animation: `${kfCrazySpinZoom} 1000ms ease-in-out` }
      case 18: return { animation: `${kfCrazyWobble} 950ms ease-in-out` }
      case 19: return { animation: `${kfCrazyBurst} 900ms ease-out` }
      // Text-only new set
      case 20: return { '& .start-tutorial-text': { display: 'inline-block', animation: `${kfTextSlideOnly} 850ms ease-in-out` } }
      case 21: return { '& .start-tutorial-text': { display: 'inline-block', transformStyle: 'preserve-3d', animation: `${kfTextFlipYBack} 900ms ease-in-out` } }
      case 22: return { '& .start-tutorial-text': { display: 'inline-block', animation: `${kfTextHoverLift} 900ms ease-in-out` } }
      case 23: return { '& .start-tutorial-text': { display: 'inline-block', animation: `${kfTextSpinSmall} 900ms ease-in-out` } }
      case 24: return { '& .start-tutorial-text': { display: 'inline-block', animation: `${kfTextRainbowOnly} 1000ms linear` } }
      case 25: return { '& .start-tutorial-text': { display: 'inline-block', animation: `${kfTextWaveSkew} 950ms ease-in-out` } }
      case 26: return { animation: `${kfButtonSlide} 950ms ease-in-out`, '& .start-tutorial-text': { display: 'inline-block', animation: `${kfTextCatchUp} 950ms ease-in-out` } }
      default: return {}
    }
  })()

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
    // Defer state updates to rAF to keep it smooth during mousemove
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

  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label={t('helpAriaLabel')}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { maxHeight: '84vh', overflow: 'visible' } }}
      onMouseMove={onDialogMouseMove}
      onMouseLeave={onDialogMouseLeave}
    >
      <DialogContent dividers>
        {isDev && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Typography variant="caption" color="text.secondary">{t('helpLanguageDev')}</Typography>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="i18n-language-select-label">Language</InputLabel>
              <Select
                labelId="i18n-language-select-label"
                id="i18n-language-select"
                label="Language"
                value={lang}
                onChange={(e) => setLang(e.target.value as typeof lang)}
              >
                {languageOptions.map((opt) => (
                  <MenuItem key={opt.code} value={opt.code}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
        <Box data-allow-select={1 as const} data-allow-context={1 as const} data-color-mode={('dark' as const)} sx={{ '& .wmde-markdown': { bgcolor: 'transparent', fontSize: 16, lineHeight: 1.7 } }}>
          <MDEditor.Markdown
            source={readmeWithVersion as unknown as string}
            rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
          />
        </Box>
      </DialogContent>
      {firstRunMode ? (
        <DialogActions sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1.25, overflow: 'visible', py: 1, minHeight: `${ACTIONS_MIN_HEIGHT_PX}px` }}>
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
        <DialogActions sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'visible', py: 1, minHeight: `${ACTIONS_MIN_HEIGHT_PX}px` }}>
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
          <Button onClick={onClose}>{t('close')}</Button>
        </DialogActions>
      )}
    </Dialog>
  )
}
