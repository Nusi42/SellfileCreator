import type { ReactNode } from 'react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'
import type { Theme } from '@mui/material/styles'
import type { ArtifactTypeId, StatVariant } from '../../lib/types'
import { ALLOWED_MAIN_BY_SLOT, ArtifactType, StatVariant as StatVariantEnum } from '../../lib/types'
import InlineSelectClearButton from '../InlineSelectClearButton'
import InlineSelectExtraBadge from '../InlineSelectExtraBadge'
import { measureCssWidth } from '../../lib/domMeasurements'
import { pickEllipsisTarget } from '../../lib/ellipsis'
import {
  computeInlineSelectContentMaxWidth,
  computeInlineSelectPadding,
  estimateInlineSelectHiddenCount,
} from '../../lib/inlineSelectAffordances'
import { FONT_SIZE_BASE_PX } from '../../lib/constants'

// Keep override selects share a fixed height so the grid aligns across tabs.
export const KEEP_OVERRIDE_INLINE_SELECT_HEIGHT_PX = (FONT_SIZE_BASE_PX * 2.4375) + 2

// Keep override selects share CSS vars so padding can react to overflow detection.
const KEEP_OVERRIDE_INLINE_SELECT_PADDING_VAR = '--keep-override-inline-select-padding-right'
const KEEP_OVERRIDE_INLINE_SELECT_CONTENT_MAX_VAR = '--keep-override-inline-select-content-max-width'

// dedupeNumericArray keeps selection arrays stable without reordering user intent.
export function dedupeNumericArray<T extends number>(values: readonly T[]): T[] {
  const seen = new Set<number>()
  const result: T[] = []
  for (const value of values) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) continue
    if (seen.has(numeric)) continue
    seen.add(numeric)
    result.push(value)
  }
  return result
}

// dedupeStringArray keeps metaset ids stable without reordering user intent.
export function dedupeStringArray(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

// getMainStatOptionsForSlots returns allowed main stats for the selected slots.
export function getMainStatOptionsForSlots(slots: ArtifactTypeId[]): StatVariant[] {
  const union = new Set<StatVariant>()
  if (slots.length === 0) {
    Object.values(ALLOWED_MAIN_BY_SLOT).forEach((set) => {
      set.forEach((variant) => union.add(variant as StatVariant))
    })
  } else {
    slots.forEach((slotId) => {
      const options = ALLOWED_MAIN_BY_SLOT[Number(slotId) as ArtifactType]
      if (!options) return
      options.forEach((variant) => union.add(variant as StatVariant))
    })
  }
  if (union.size === 0) return [StatVariantEnum.Any]
  const sorted = Array.from(union).sort((a, b) => a - b)
  if (!sorted.includes(StatVariantEnum.Any)) {
    sorted.unshift(StatVariantEnum.Any)
  }
  return sorted
}

// getRuleSelectPaddingSx keeps inline selects aligned with chips and badges.
export function getRuleSelectPaddingSx(
  selectionCount: number,
  fixedHeightPx?: number,
): SystemStyleObject<Theme> {
  // Inline selects pad based on selection + badge visibility.
  const hasSelection = selectionCount > 0
  // Extra badge is assumed by default; the wrapper can override via CSS vars.
  const hasExtraBadge = selectionCount > 1
  // Pull the shared padding value from the inline select helper.
  const padding = computeInlineSelectPadding(hasSelection, hasExtraBadge)
  // Convert to px for the fallback when CSS vars are unset.
  const paddingRightPx = `${padding}px`
  // Content width caps so long labels don't underlap the affordances.
  const contentMaxWidth = computeInlineSelectContentMaxWidth(padding)
  // Let the wrapper override padding via CSS vars when overflow logic runs.
  const paddingRightVar = `var(${KEEP_OVERRIDE_INLINE_SELECT_PADDING_VAR}, ${paddingRightPx})`
  // Let the wrapper override max width so overflow math stays consistent.
  const contentMaxWidthVar = `var(${KEEP_OVERRIDE_INLINE_SELECT_CONTENT_MAX_VAR}, ${contentMaxWidth})`
  // Keep selects aligned and left-justified across the grid.
  const selectSx: SystemStyleObject<Theme> = {
    paddingRight: paddingRightVar,
    height: 'auto',
    width: '100%',
    minWidth: 0,
    textAlign: 'left',
    justifyContent: 'flex-start',
  }
  if (fixedHeightPx) {
    // Force a fixed control height so the grid rows stay aligned.
    selectSx.minHeight = `${fixedHeightPx}px`
    selectSx.height = `${fixedHeightPx}px`
    selectSx.lineHeight = `${fixedHeightPx}px`
    selectSx.display = 'flex'
    selectSx.alignItems = 'center'
    selectSx.justifyContent = 'flex-start'
  }
  return {
    width: '100%',
    minWidth: 0,
    ...(fixedHeightPx ? { minHeight: `${fixedHeightPx}px`, height: `${fixedHeightPx}px` } : null),
    '& .MuiSelect-select': selectSx,
    '& .MuiSelect-select > *': {
      minWidth: 0,
      maxWidth: contentMaxWidthVar,
    },
  }
}

type RuleSelectAffordancesProps = {
  selectionCount: number
  clearLabel: string
  onClear: () => void
  children: ReactNode
  disabled?: boolean
  layoutVersion?: number
  selectionLabels?: readonly string[]
  selectionSeparator?: string
}

// RuleSelectAffordances adds the clear + extra-count UI to inline selects.
export function RuleSelectAffordances({
  selectionCount,
  clearLabel,
  onClear,
  children,
  disabled = false,
  layoutVersion,
  selectionLabels,
  selectionSeparator,
}: RuleSelectAffordancesProps) {
  // Track the select container so we can detect text overflow.
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Only show the extra badge when text is genuinely truncated.
  const [showExtraBadge, setShowExtraBadge] = useState(false)
  // Track how many selections are actually hidden behind ellipsis.
  const [hiddenCount, setHiddenCount] = useState(0)
  // Determine whether we have a selection to clear.
  const hasSelection = selectionCount > 0
  // Compute padding for the no-badge layout.
  const paddingWithoutBadge = useMemo(
    () => computeInlineSelectPadding(hasSelection, false),
    [hasSelection],
  )
  // Compute padding for the badge layout.
  const paddingWithBadge = useMemo(
    () => computeInlineSelectPadding(hasSelection, true),
    [hasSelection],
  )
  // Pick the padding for the current render.
  const activePadding = showExtraBadge ? paddingWithBadge : paddingWithoutBadge
  // Convert the active padding into a content width cap.
  const contentMaxWidth = useMemo(
    () => computeInlineSelectContentMaxWidth(activePadding),
    [activePadding],
  )
  // Build the CSS vars so the select can consume the updated spacing.
  const paddingVars = useMemo<SystemStyleObject<Theme>>(
    () => ({
      [KEEP_OVERRIDE_INLINE_SELECT_PADDING_VAR]: `${activePadding}px`,
      [KEEP_OVERRIDE_INLINE_SELECT_CONTENT_MAX_VAR]: contentMaxWidth,
    }),
    [activePadding, contentMaxWidth],
  )
  // Only show the badge when there is more than one selection.
  const shouldEvaluateBadge = selectionCount > 1
  // Sync badge visibility whenever layout or content changes.
  useLayoutEffect(() => {
    if (!shouldEvaluateBadge) {
      setShowExtraBadge(false)
      setHiddenCount(0)
      return
    }
    const container = containerRef.current
    if (!container) {
      setShowExtraBadge(false)
      setHiddenCount(0)
      return
    }
    const updateBadge = () => {
      const selectDisplay = container.querySelector('.MuiSelect-select') as HTMLElement | null
      const ellipsisTarget = pickEllipsisTarget(selectDisplay ?? container)
      const style = getComputedStyle(ellipsisTarget)
      const supportsEllipsis = (
        (style.overflow === 'hidden' || style.overflowX === 'hidden')
        && style.textOverflow === 'ellipsis'
        && style.whiteSpace === 'nowrap'
      )
      if (!supportsEllipsis) {
        setShowExtraBadge(false)
        setHiddenCount(0)
        return
      }
      const visibleWidth = measureCssWidth(ellipsisTarget)
      if (visibleWidth <= 0) {
        setShowExtraBadge(false)
        setHiddenCount(0)
        return
      }
      const scrollWidth = Math.floor(ellipsisTarget.scrollWidth || 0)
      if (scrollWidth <= 0) {
        setShowExtraBadge(false)
        setHiddenCount(0)
        return
      }
      // Prefer the select's content box width so the label measure updates with column changes.
      const selectDisplayNode = selectDisplay ?? ellipsisTarget.closest('.MuiSelect-select') as HTMLElement | null
      const selectMetrics = selectDisplayNode ? getComputedStyle(selectDisplayNode) : null
      const selectWidth = selectDisplayNode ? measureCssWidth(selectDisplayNode) : visibleWidth
      const paddingLeft = selectMetrics
        ? Math.max(0, Number.parseFloat(selectMetrics.paddingLeft || '0') || 0)
        : 0
      const paddingRight = selectMetrics
        ? Math.max(0, Number.parseFloat(selectMetrics.paddingRight || '0') || 0)
        : 0
      const contentWidth = Math.max(0, selectWidth - paddingLeft - paddingRight)
      const noBadgeWidth = contentWidth > 0 ? contentWidth : visibleWidth
      const withBadgeWidth = noBadgeWidth
      // Use label-aware logic when labels are provided.
      if (selectionLabels && selectionLabels.length > 0) {
        const separatorOption = selectionSeparator ? { separator: selectionSeparator } : {}
        const hiddenNoBadge = estimateInlineSelectHiddenCount({
          labels: selectionLabels,
          root: ellipsisTarget,
          availableWidthPx: noBadgeWidth,
          ...separatorOption,
        })
        if (hiddenNoBadge <= 0) {
          setShowExtraBadge(false)
          setHiddenCount(0)
          return
        }
        const hiddenWithBadge = estimateInlineSelectHiddenCount({
          labels: selectionLabels,
          root: ellipsisTarget,
          availableWidthPx: Math.max(0, withBadgeWidth),
          ...separatorOption,
        })
        setShowExtraBadge(true)
        setHiddenCount(Math.max(0, hiddenWithBadge))
        return
      }
      // Fallback: show the badge when any overflow is detected.
      const isOverflowing = noBadgeWidth + 2 < scrollWidth
      setShowExtraBadge(isOverflowing)
      setHiddenCount(isOverflowing ? Math.max(0, selectionCount - 1) : 0)
    }
    updateBadge()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(() => {
      updateBadge()
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
    }
  }, [
    layoutVersion,
    paddingWithoutBadge,
    paddingWithBadge,
    selectionCount,
    selectionLabels,
    selectionSeparator,
    shouldEvaluateBadge,
    children,
  ])
  // Derive the extra count only when the badge is visible.
  const extraCount = showExtraBadge
    ? (selectionLabels && selectionLabels.length > 0 ? hiddenCount : Math.max(0, selectionCount - 1))
    : 0
  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        ...paddingVars,
        ...(disabled ? { pointerEvents: 'none', opacity: 0.6 } : {}),
      }}
      aria-disabled={disabled}
    >
      {children}
      <InlineSelectExtraBadge count={extraCount} />
      <InlineSelectClearButton
        disabled={disabled || selectionCount === 0}
        label={clearLabel}
        onClear={onClear}
      />
    </Box>
  )
}
