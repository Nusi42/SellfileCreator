/**
 * separators.ts
 *
 * Shared separator (list divider) presentation SSOT. Recipe separators
 * (exportMode='separator') and safeguard separators (SafeguardRule.separator)
 * render with the identical divider decoration: leading '#' prefixes on the
 * stored name are style hints (dash/dot style, width, line alpha) and the
 * appearance fgColor is the line color. One definition here keeps the two chip
 * lists and the builder scaffold menus from drifting.
 */
import { alpha } from '@mui/material/styles'

const SEPARATOR_SOLID_BORDER_WIDTH_PX = 2
const SEPARATOR_HASHED_BASE_BORDER_WIDTH_PX = 1.5
const SEPARATOR_HASHED_BORDER_WIDTH_STEP_PX = 0.3
const SEPARATOR_HASHED_MIN_BORDER_WIDTH_PX = 0.8
const SEPARATOR_HASHED_LINE_ALPHA_BASE = 0.75
const SEPARATOR_HASHED_LINE_ALPHA_STEP = 0.15
const SEPARATOR_HASHED_LINE_ALPHA_MIN = 0.3

export type SeparatorDividerDecoration = {
  displayName: string
  hasLabel: boolean
  borderStyle: 'solid' | 'dashed' | 'dotted'
  borderWidthPx: number
  lineColor: string
  textColor: string
  minLineWidthPx: number
}

// Split a raw separator name into its '#' style prefix and the visible label.
const splitSeparatorName = (rawName: string | undefined): { hashCount: number; displayName: string } => {
  const trimmed = (rawName ?? '').trim()
  const hashMatch = trimmed.match(/^(#+)/)
  const hashPrefix = hashMatch?.[1] ?? ''
  return { hashCount: hashPrefix.length, displayName: trimmed.slice(hashPrefix.length).trimStart() }
}

/** Visible label of a separator name (the '#' style prefix stripped). */
export const parseSeparatorLabel = (rawName: string | undefined): string =>
  splitSeparatorName(rawName).displayName

// Separator dividers treat leading "#" prefixes as style hints (dash/dot width), and fgColor as the line color.
export function deriveSeparatorDividerDecoration(rawName: string | undefined, fgColor: string | undefined, baseColor: string): SeparatorDividerDecoration {
  const { hashCount, displayName } = splitSeparatorName(rawName)
  // Use fgColor from appearance when set; fall back to the theme base color.
  const resolvedColor = fgColor || baseColor
  const hasLabel = displayName.length > 0

  if (hashCount === 0) {
    return {
      displayName,
      hasLabel,
      borderStyle: 'solid',
      borderWidthPx: SEPARATOR_SOLID_BORDER_WIDTH_PX,
      lineColor: resolvedColor,
      textColor: resolvedColor,
      minLineWidthPx: hasLabel ? 16 : 32,
    }
  }

  const intensityStep = Math.max(0, hashCount - 1)
  const borderWidth = Math.max(SEPARATOR_HASHED_MIN_BORDER_WIDTH_PX, SEPARATOR_HASHED_BASE_BORDER_WIDTH_PX - intensityStep * SEPARATOR_HASHED_BORDER_WIDTH_STEP_PX)
  const lineAlpha = Math.max(SEPARATOR_HASHED_LINE_ALPHA_MIN, SEPARATOR_HASHED_LINE_ALPHA_BASE - intensityStep * SEPARATOR_HASHED_LINE_ALPHA_STEP)
  let lineColor: string
  try {
    lineColor = alpha(resolvedColor, lineAlpha)
  } catch {
    lineColor = resolvedColor
  }
  const textColor = resolvedColor
  const borderStyle: 'dashed' | 'dotted' = hashCount >= 3 ? 'dotted' : 'dashed'

  return {
    displayName,
    hasLabel,
    borderStyle,
    borderWidthPx: borderWidth,
    lineColor,
    textColor,
    minLineWidthPx: hasLabel ? 16 : 32,
  }
}
