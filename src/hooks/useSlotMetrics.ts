import { useMemo } from 'react'
import { useTheme } from '@mui/material/styles'
import { BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX } from '../lib/constants'
import { useI18n } from '../lib/i18n'
import { artifactTypeIconList } from '../components/artifactTypeIcons'

/** Icon fontSize="small" renders at 20px (matches artifactTypeIcons sizeFor('small')). */
const SLOT_ICON_SIZE_PX = 20

export type SlotMetrics = {
  labelFlexBasis: string | undefined
  contentWidthPx: string | undefined
  iconGapCss: string
  iconSizePx: string
  /** Returns the localized display name for a slot numeric ID. SSOT for all slot grids. */
  slotLabel: (id: number) => string
}

/**
 * useSlotMetrics
 *
 * Measures the longest localized slot label via canvas so slot icon-grid buttons
 * can pin their icons to the same horizontal position regardless of label length.
 * Used by both RecipeBuilderPanel and SafeguardBuilderPanel slot grids, and by
 * SafeguardChipsPanel for chip summaries. slotLabel is the SSOT for slot names.
 */
export function useSlotMetrics(): SlotMetrics {
  const theme = useTheme()
  const { t } = useI18n()

  // Stable slot-label resolver: all callers go through this function so
  // the localized names stay consistent across every slot grid and summary.
  const slotLabel = useMemo(() => (id: number): string => {
    switch (Number(id)) {
      case 5: return t('slotWeapon')
      case 1: return t('slotHelmet')
      case 6: return t('slotShield')
      case 3: return t('slotGauntlets')
      case 2: return t('slotChestplate')
      case 4: return t('slotBoots')
      case 7: return t('slotRing')
      case 8: return t('slotAmulet')
      case 9: return t('slotBanner')
      default: return String(id)
    }
  }, [t])

  const slotLabels = useMemo(
    // Map each icon-list entry through the shared label resolver for canvas measurement.
    () => artifactTypeIconList.map(({ id }) => slotLabel(Number(id))),
    [slotLabel],
  )

  // Measure geometry separately so slotLabel can be returned alongside the pixel values.
  const geometry = useMemo(() => {
    const gapCss = theme.spacing(0.75)
    const defaultGeometry = {
      labelFlexBasis: undefined as string | undefined,
      contentWidthPx: undefined as string | undefined,
      iconGapCss: gapCss,
      iconSizePx: `${SLOT_ICON_SIZE_PX}px`,
    }
    if (!slotLabels.length) return defaultGeometry
    if (typeof document === 'undefined') return defaultGeometry
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return defaultGeometry
    const buttonTypography = theme.typography.button ?? {}
    const fontFamily = buttonTypography.fontFamily ?? theme.typography.fontFamily ?? 'sans-serif'
    const fontStyle = buttonTypography.fontStyle ?? 'normal'
    const fontWeight = `${buttonTypography.fontWeight ?? theme.typography.fontWeightMedium ?? 500}`
    const htmlFontSize = typeof theme.typography.htmlFontSize === 'number'
      ? theme.typography.htmlFontSize
      : Number(theme.typography.htmlFontSize) || 16
    const parentFontSize = typeof theme.typography.fontSize === 'number'
      ? theme.typography.fontSize
      : parseFloat(String(theme.typography.fontSize)) || 14
    // Converts a CSS size token to pixels, handling rem/em/px and bare numbers.
    const parseSizeToPx = (value: unknown, fallbackPx: number, relativeToPx: number): number => {
      if (typeof value === 'number') return value
      if (value == null) return fallbackPx
      const str = String(value).trim()
      if (!str) return fallbackPx
      if (str.endsWith('rem')) return parseFloat(str) * htmlFontSize
      if (str.endsWith('em')) return parseFloat(str) * relativeToPx
      if (str.endsWith('px')) return parseFloat(str)
      const numeric = parseFloat(str)
      return Number.isNaN(numeric) ? fallbackPx : numeric
    }
    const fontSizePx = parseSizeToPx(buttonTypography.fontSize, parentFontSize, parentFontSize)
    const letterSpacingPx = parseSizeToPx(buttonTypography.letterSpacing, 0, fontSizePx)
    context.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`
    let maxWidth = 0
    // Find the widest label so all slot buttons can share that flex-basis.
    for (const label of slotLabels) {
      const measured = context.measureText(label).width
      const spacing = Math.max(label.length - 1, 0) * letterSpacingPx
      const total = measured + spacing
      if (total > maxWidth) maxWidth = total
    }
    const labelWidthPx = Math.ceil(maxWidth + BUILDER_SLOT_LABEL_WIDTH_BUFFER_PX)
    const gapPx = parseSizeToPx(gapCss, 0, fontSizePx)
    const contentWidthPx = Math.ceil(labelWidthPx + gapPx + SLOT_ICON_SIZE_PX)
    return {
      labelFlexBasis: labelWidthPx > 0 ? `${labelWidthPx}px` : undefined,
      contentWidthPx: contentWidthPx > 0 ? `${contentWidthPx}px` : undefined,
      iconGapCss: gapCss,
      iconSizePx: `${SLOT_ICON_SIZE_PX}px`,
    }
  }, [slotLabels, theme])

  // Combine geometry measurements with the shared slotLabel resolver.
  return useMemo<SlotMetrics>(() => ({ ...geometry, slotLabel }), [geometry, slotLabel])
}
