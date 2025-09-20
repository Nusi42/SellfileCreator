import { Box, Tooltip, Typography, Divider } from '@mui/material'
import type { ReactNode } from 'react'
import { artifactSetDescriptions } from '../lib/setDescriptions'
import { useI18n } from '../lib/i18n'
// no theme import needed; using palette keywords directly

// Compact formatting constants for tooltip styling.
const TITLE_FG_OPACITY = 0.9 as const

/**
 * Build a structured, multi‑line tooltip for a set name, including per‑piece
 * effects for variable (1–9) sets when available. Returns undefined if we
 * lack a description so callers can omit the tooltip entirely.
 */
// Localized piece count label (kept simple; catalogs provide the suffix/format).
function pieceLabel(pieces: number | string, t: (k: string, p?: Record<string, string | number>) => string): string {
  return t('setPieceCount', { n: typeof pieces === 'number' ? pieces : String(pieces) })
}

function splitEffects(text: string): string[] {
  // Preserve explicit newlines from data; do not collapse whitespace globally.
  const explicit = String(text).split(/\n/g)
  const out: string[] = []
  for (const seg of explicit) {
    const s = seg.replace(/\s+/g, ' ').trim()
    if (!s) continue
    // Insert line breaks before common connectors when they denote a second effect.
    const withBreaks = s
    for (const piece of withBreaks.split(/\n|;\s*/g)) {
      const t = piece.trim()
      if (t) out.push(t)
    }
  }
  return out.length ? out : [String(text).trim()]
}

// Parse explicit inline tags in text to mark buffs/debuffs for coloring.
// Markup: {buff:Block Debuffs}, {debuff:Freeze}. Tags are removed from output.
function renderTagged(line: string): ReactNode {
  const out: ReactNode[] = []
  const re = /\{\s*(buff|debuff)\s*:\s*([^}]+?)\s*\}/ig
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    const [full, kindRaw, label] = m
    const start = m.index
    if (start > last) out.push(line.slice(last, start))
    const kind = String(kindRaw).toLowerCase()
    const color = kind === 'buff' ? 'info.main' : 'error.main'
    out.push(<Box component="span" key={`${start}-${label}`} sx={{ color, fontWeight: 500 }}>{label}</Box>)
    last = start + full.length
  }
  if (last < line.length) out.push(line.slice(last))
  return out.length ? out : line
}

function renderTooltipBody(d: ArtifactSetDescriptions[string]): ReactNode {
  const by = d.byPieces
  return by ? (
    <Box sx={{ mt: 0.5 }}>
      {Object.keys(by)
        .map(n => Number(n))
        .sort((a, b) => a - b)
        .map((n) => (
          <Typography key={n} variant="caption" sx={{ display: 'block' }}>{n}: {renderTagged(by[n] || '')}</Typography>
        ))}
    </Box>
  ) : (
    <Box sx={{ mt: 0.5 }}>
      {splitEffects(d.text).map((line, idx) => (
        <Typography key={idx} variant="caption" sx={{ display: 'block' }}>{renderTagged(line)}</Typography>
      ))}
    </Box>
  )
}

type ArtifactSetDescriptions = typeof artifactSetDescriptions

function getSetTooltipContent(name: string, t: (k: string, p?: Record<string, string | number>) => string): ReactNode | undefined {
  const d = artifactSetDescriptions[name]
  if (!d) return undefined
  const header = pieceLabel(d.pieces, t)
  return (
    <Box sx={{ maxWidth: 420 }}>
      <Typography variant="body2" sx={{ opacity: TITLE_FG_OPACITY }}>{header}</Typography>
      <Divider light sx={{ my: 0.5, opacity: 0.45 }} />
      {renderTooltipBody(d)}
    </Box>
  )
}

function getSetTooltipContentNamed(name: string, t: (k: string, p?: Record<string, string | number>) => string): ReactNode | undefined {
  const d = artifactSetDescriptions[name]
  if (!d) return undefined
  const header = t('setTooltipNamed', { name, count: pieceLabel(d.pieces, t) })
  return (
    <Box sx={{ maxWidth: 420 }}>
      <Typography variant="body2" sx={{ opacity: TITLE_FG_OPACITY }}>{header}</Typography>
      <Divider light sx={{ my: 0.5, opacity: 0.45 }} />
      {renderTooltipBody(d)}
    </Box>
  )
}

/**
 * Convenience wrapper to conditionally wrap children with a Tooltip when a
 * description is present. Keeps callers clean and avoids duplication.
 */
export function WithSetTooltip({ name, children, showName = false }: { name: string; children: ReactNode; showName?: boolean }) {
  const { t } = useI18n()
  const content = showName ? getSetTooltipContentNamed(name, t) : getSetTooltipContent(name, t)
  if (!content) return <>{children}</>
  return (
    <Tooltip
      title={content}
      arrow
      enterDelay={180}
      enterNextDelay={0}
      leaveDelay={0}
      placement="right"
      disableInteractive
    >
      <span>{children}</span>
    </Tooltip>
  )
}
