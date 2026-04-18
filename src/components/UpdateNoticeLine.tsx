/**
 * UpdateNoticeLine
 *
 * Renders the update-available caption inside the header meta column.
 * Owns the full animation lifecycle: entry fade-in → nagging opacity pulse
 * for 3 minutes → idle static → exit fade-out on dismiss.
 * onDismiss is called only after the exit animation completes so the parent
 * can unmount the component without an abrupt pop.
 */
import { useEffect, useRef, useState } from 'react'
import { Typography } from '@mui/material'
import { FONT_SIZE_HEADER_META_PX } from '../lib/constants'
import type { UpdateCheckResult } from '../hooks/useUpdateCheck'

// Durations in ms — kept as named constants so they're easy to adjust.
const ENTRY_MS = 380
const NAG_DURATION_MS = 3 * 60 * 1000
const EXIT_MS = 260

type Phase = 'entering' | 'nagging' | 'idle' | 'exiting'

export default function UpdateNoticeLine({
  update,
  onDismiss,
}: {
  update: UpdateCheckResult
  onDismiss: () => void
}) {
  const [phase, setPhase] = useState<Phase>('entering')
  // Prevents a second dismiss if the user clicks × while the exit is already running.
  const dismissingRef = useRef(false)

  // Schedule the full phase timeline once on mount so effects don't chain.
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('nagging'), ENTRY_MS)
    const t2 = setTimeout(() => setPhase('idle'), ENTRY_MS + NAG_DURATION_MS)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const handleDismiss = () => {
    if (dismissingRef.current) return
    dismissingRef.current = true
    setPhase('exiting')
    // Let the exit animation finish before the parent clears the update state.
    setTimeout(onDismiss, EXIT_MS)
  }

  // Map phase to the CSS animation string applied to the element.
  const animation =
    phase === 'entering' ? `sfcUpdateFadeIn ${ENTRY_MS}ms ease-out forwards`
    : phase === 'nagging' ? 'sfcUpdateNag 2.8s ease-in-out infinite'
    : phase === 'exiting' ? `sfcUpdateFadeOut ${EXIT_MS}ms ease-in forwards`
    : 'none'

  return (
    <Typography
      component="span"
      variant="caption"
      sx={{
        // Keyframes are scoped to this element via MUI's sx injection.
        '@keyframes sfcUpdateFadeIn': {
          from: { opacity: 0, transform: 'translateY(-5px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
        '@keyframes sfcUpdateNag': {
          '0%, 100%': { opacity: 1 },
          '50%':       { opacity: 0.3 },
        },
        '@keyframes sfcUpdateFadeOut': {
          from: { opacity: 1, transform: 'translateY(0)' },
          to:   { opacity: 0, transform: 'translateY(-5px)' },
        },
        animation,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        justifyContent: 'flex-end',
        mt: 0,
        fontSize: `${FONT_SIZE_HEADER_META_PX}px`,
        lineHeight: 1.15,
        color: 'primary.main',
      }}
    >
      v{update.latestVersion} available —{' '}
      <a
        href={update.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: 'inherit', textDecoration: 'underline' }}
      >
        Download
      </a>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss update notification"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, opacity: 0.6, fontSize: 'inherit' }}
      >
        ×
      </button>
    </Typography>
  )
}
