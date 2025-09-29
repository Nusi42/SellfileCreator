import { Box, Tooltip, Typography, Divider } from '@mui/material'
import type { ReactNode } from 'react'
import { artifactSetDescriptions } from '../lib/setDescriptions'
import { useI18n } from '../lib/i18n'
import { artifactSetI18nKey, artifactSetNames } from '../lib/types'
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
// Replace common stat abbreviations in set descriptions with localized labels
// using existing i18n keys. Keeps sentences otherwise unchanged.
function localizeStatsInline(line: string, t: (k: string) => string): string {
  let s = String(line)
  // Order matters: handle dotted tokens first.
  s = s.replace(/C\.RATE/g, t('statCR'))
  s = s.replace(/C\.DMG/g, t('statCDMG'))
  s = s.replace(/\bACC\b/g, t('statACC'))
  s = s.replace(/\bRES\b/g, t('statRES'))
  s = s.replace(/\bSPD\b/g, t('statSPD'))
  s = s.replace(/\bHP\b/g, t('statHP'))
  s = s.replace(/\bATK\b/g, t('statATK'))
  s = s.replace(/\bDEF\b/g, t('statDEF'))
  return s
}

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

// Body rendering is handled by localizeDescription (keeps English fallback and applies inline tags + stat label localization).

type ArtifactSetDescriptions = typeof artifactSetDescriptions

// Build a stable i18n key stem for set description lines, based on the set label key
// (e.g., 'setLife' -> 'setDesc_setLife_*'). Falls back to empty string when name
// cannot be resolved; callers use the English text then.
function getSetDescKeyStem(name: string): string {
  let id: number | null = null
  for (const [key, value] of Object.entries(artifactSetNames)) {
    if (value === name) { id = Number(key); break }
  }
  if (id == null) return ''
  const labelKey = artifactSetI18nKey(id)
  return `setDesc_${labelKey}`
}

function localizeDescription(d: ArtifactSetDescriptions[string], name: string, t: (k: string, p?: Record<string, string | number>) => string): ReactNode {
  const stem = getSetDescKeyStem(name)
  const tDyn = (k: string) => (t as unknown as (k: string) => string)(k)
  const by = d.byPieces
  if (by) {
    return (
      <Box sx={{ mt: 0.5 }}>
        {Object.keys(by)
          .map(n => Number(n))
          .sort((a, b) => a - b)
          .map((n) => {
            const key = stem ? `${stem}_by_${n}` : ''
            const raw = by[n] || ''
            // When we have a stem (resolved set), prefer catalog strictly (even if empty in 'empty' locale)
            const text = stem ? tDyn(key) : raw
            return (
              <Typography key={n} variant="caption" sx={{ display: 'block' }}>{n}: {renderTagged(localizeStatsInline(text, (k) => t(k)))}</Typography>
            )
          })}
      </Box>
    )
  }
  const key = stem ? `${stem}_text` : ''
  const text = stem ? tDyn(key) : d.text
  return (
    <Box sx={{ mt: 0.5 }}>
      {splitEffects(text).map((line, idx) => (
        <Typography key={idx} variant="caption" sx={{ display: 'block' }}>{renderTagged(localizeStatsInline(line, (k) => t(k)))}</Typography>
      ))}
    </Box>
  )
}

function getSetTooltipContent(name: string, t: (k: string, p?: Record<string, string | number>) => string): ReactNode | undefined {
  const d = artifactSetDescriptions[name]
  if (!d) return undefined
  const header = pieceLabel(d.pieces, t)
  return (
    <Box sx={{ maxWidth: 420 }}>
      <Typography variant="body2" sx={{ opacity: TITLE_FG_OPACITY }}>{header}</Typography>
      <Divider light sx={{ my: 0.5, opacity: 0.45 }} />
      {localizeDescription(d, name, t)}
    </Box>
  )
}

function getSetTooltipContentNamed(
  name: string,
  displayName: string,
  t: (k: string, p?: Record<string, string | number>) => string,
): ReactNode | undefined {
  const d = artifactSetDescriptions[name]
  if (!d) return undefined
  const header = t('setTooltipNamed', { name: displayName, count: pieceLabel(d.pieces, t) })
  return (
    <Box sx={{ maxWidth: 420 }}>
      <Typography variant="body2" sx={{ opacity: TITLE_FG_OPACITY }}>{header}</Typography>
      <Divider light sx={{ my: 0.5, opacity: 0.45 }} />
      {localizeDescription(d, name, t)}
    </Box>
  )
}

/**
 * Convenience wrapper to conditionally wrap children with a Tooltip when a
 * description is present. Keeps callers clean and avoids duplication.
 */
export function WithSetTooltip({
  name,
  displayName,
  children,
  showName = false,
}: {
  name: string
  displayName?: string
  children: ReactNode
  showName?: boolean
}) {
  const { t } = useI18n()
  const localizedName = displayName ?? name
  const content = showName
    ? getSetTooltipContentNamed(name, localizedName, t)
    : getSetTooltipContent(name, t)
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
