import React from 'react'
import Box from '@mui/material/Box'
import type { SxProps } from '@mui/material/styles'
import { ANOMALOUS_SUBSTAT_VARIANTS, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, StatVariant, statVariantI18nKey, STAT_VARIANTS_PRIORITY } from './types'

export type HighlightSpec = { token: string; sx?: SxProps }

// Classic substats plus the accessory-only ones — this
// gate must agree with COLORIZED_SUBSTAT_IDS (substatDisplay.ts): one colorize
// decision, two id domains (variants here, stat ids there).
const COLORIZED_VARIANTS: readonly StatVariant[] = [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS]

export type SubstatColorMap = Record<number, { fg: string; bg: string }>

export function renderColoredStatText(
  t: (key: ReturnType<typeof statVariantI18nKey>) => string,
  text: string,
  substatColors: SubstatColorMap,
  colorize: boolean,
  highlights?: HighlightSpec[],
  // Optional rarity-word colorization: localized rarity label → already-adapted colour. When the
  // master colour flag is off the caller passes nothing/empty, so rarity words stay un-tinted.
  rarityLabelColors?: ReadonlyMap<string, string>,
): React.ReactNode {
  let parts: React.ReactNode[] = [text]

  if (colorize) {
    // One unified label → colour map: stat-variant labels and rarity labels tokenize together so a
    // single pass colours both (longest-match-first avoids partial overlaps).
    const labelToColor = new Map<string, string | undefined>()
    for (const variant of COLORIZED_VARIANTS) {
      const label = t(statVariantI18nKey(variant))
      if (label && text.includes(label)) {
        labelToColor.set(label, substatColors[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant])
      }
    }
    if (rarityLabelColors) {
      for (const [label, color] of rarityLabelColors) {
        // Don't clobber a stat label that happens to equal a rarity word; only add fresh tokens present in text.
        if (label && color && !labelToColor.has(label) && text.includes(label)) {
          labelToColor.set(label, color)
        }
      }
    }

    if (labelToColor.size > 0) {
      const escapeRegex = (raw: string) => raw.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
      const tokens = Array.from(labelToColor.keys()).sort((a, b) => b.length - a.length).map(escapeRegex)
      if (tokens.length > 0) {
        const comparatorPattern = '(?:\\s*≥\\s*\\d+)?'
        const pattern = new RegExp(`(${tokens.join('|')})${comparatorPattern}`, 'g')
        const coloredParts: React.ReactNode[] = []
        let lastIndex = 0
        let match: RegExpExecArray | null
        let keyIndex = 0

        while ((match = pattern.exec(text)) !== null) {
          const fullMatch = match[0]
          const label = match[1]
          const start = match.index
          const end = start + fullMatch.length
          if (start > lastIndex) {
            coloredParts.push(text.slice(lastIndex, start))
          }
          const color = label ? labelToColor.get(label) : undefined
          coloredParts.push(
            <Box component="span" key={`tok-${label}-${keyIndex++}`} sx={{ color }}>
              {fullMatch}
            </Box>,
          )
          lastIndex = end
        }

        if (lastIndex < text.length) {
          coloredParts.push(text.slice(lastIndex))
        }

        parts = coloredParts
      }
    }
  }

  if (!highlights || highlights.length === 0) {
    return parts.length === 1 ? parts[0] : parts
  }

  const highlightSpecs = highlights
    .filter((spec) => Boolean(spec?.token))
    .sort((a, b) => b.token.length - a.token.length)

  if (highlightSpecs.length === 0) return parts.length === 1 ? parts[0] : parts

  const highlightPieces: React.ReactNode[] = []
  let highlightKey = 0

  const splitWithHighlights = (segment: string): React.ReactNode[] => {
    if (!segment) return []
    const out: React.ReactNode[] = []
    let remaining = segment
    while (remaining.length > 0) {
      let closestIdx = -1
      let match: HighlightSpec | null = null
      for (const spec of highlightSpecs) {
        const idx = remaining.indexOf(spec.token)
        if (idx === -1) continue
        if (closestIdx === -1 || idx < closestIdx) {
          closestIdx = idx
          match = spec
        }
      }
      if (!match || closestIdx === -1) {
        out.push(remaining)
        break
      }
      if (closestIdx > 0) {
        out.push(remaining.slice(0, closestIdx))
      }
      const highlightSx: SxProps = { fontWeight: 600, ...(match.sx ?? {}) }
      out.push(
        <Box component="span" key={`highlight-${highlightKey++}`} sx={highlightSx}>
          {match.token}
        </Box>,
      )
      remaining = remaining.slice(closestIdx + match.token.length)
    }
    return out
  }

  for (const part of parts) {
    if (typeof part === 'string') {
      highlightPieces.push(...splitWithHighlights(part))
    } else {
      highlightPieces.push(part)
    }
  }

  return highlightPieces.length === 1 ? highlightPieces[0] : highlightPieces
}
