import { Box, Tooltip, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { artifactSetDescriptions } from '../lib/setDescriptions'
// no theme import needed; using palette keywords directly

// Compact formatting constants for tooltip styling.
const TITLE_FG_OPACITY = 0.9 as const

/**
 * Build a structured, multi‑line tooltip for a set name, including per‑piece
 * effects for variable (1–9) sets when available. Returns undefined if we
 * lack a description so callers can omit the tooltip entirely.
 */
function pieceLabel(pieces: number | string): string {
  return typeof pieces === 'number' ? `${pieces} piece` : `${pieces} piece`
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
      .replace(/\s+and\s+(?=[+\-[])/gi, '\n')
      .replace(/\s+and\s+(?=(ignores|enables|applies|grants|places|gain|increases|decreases|reduces)\b)/gi, '\n')
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

export function getSetTooltipContent(name: string): ReactNode | undefined {
  const d = artifactSetDescriptions[name]
  if (!d) return undefined
  const header = pieceLabel(d.pieces)
  const by = d.byPieces
  return (
    <Box sx={{ maxWidth: 420 }}>
      <Typography variant="body2" sx={{ opacity: TITLE_FG_OPACITY }}>{header}</Typography>
      {by ? (
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
      )}
    </Box>
  )
}

/**
 * Convenience wrapper to conditionally wrap children with a Tooltip when a
 * description is present. Keeps callers clean and avoids duplication.
 */
export function WithSetTooltip({ name, children }: { name: string; children: ReactNode }) {
  const content = getSetTooltipContent(name)
  if (!content) return <>{children}</>
  return (
    <Tooltip title={content} arrow enterDelay={200} placement="right">
      <span>{children}</span>
    </Tooltip>
  )
}
