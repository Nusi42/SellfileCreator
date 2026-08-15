// Shared tag chip primitives used by RecipeBuilderPanel, SafeguardBuilderPanel and both chip
// lists. Double-click-to-copy and the per-tag colour are defined once here and applied to
// every tag chip.

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Chip, Box, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'
import { writeTextSafe, triggerCopyDialog } from '../lib/clipboard'
import { EllipsisTooltip } from './EllipsisTooltip'
import { useSchemePaper } from '../lib/themeContrastHooks'
import { resolveLabelChipColors } from '../lib/labelColors'
import { ALPHA } from '../lib/colorTints'
import { alpha } from '@mui/material/styles'

// Compact metrics for the tag chips rendered INSIDE a recipe/safeguard chip row (right of the
// summary text) — shared by both chip panels so the two lists stay identical.
export const INLINE_TAG_CHIP_SX = { height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } } as const

/**
 * Colour sx for a tag chip: every tag gets a stable hue derived from its text (see
 * lib/labelColors), adapted for contrast against the active scheme's paper — so a tag reads the
 * same colour on a recipe chip, a safeguard chip, the builder strip and the tags popover, in all
 * three themes. The hook resolves the surface once; the returned function is cheap per chip.
 */
export function useTagChipSx(): (tag: string) => SystemStyleObject<Theme> {
  const paper = useSchemePaper()
  return useCallback((tag: string): SystemStyleObject<Theme> => {
    const { fg, border, bg } = resolveLabelChipColors(tag, paper)
    return {
      color: fg,
      borderColor: border,
      backgroundColor: bg,
      // The delete glyph (removable list) follows the tag colour instead of the neutral grey.
      '& .MuiChip-deleteIcon': { color: alpha(fg, ALPHA.a60), '&:hover': { color: fg } },
    }
  }, [paper])
}

// Falls back to the manual copy dialog when the Clipboard API is unavailable.
function copyTagToClipboard(tag: string): void {
  writeTextSafe(tag).then(ok => { if (!ok) triggerCopyDialog(tag) })
}

// Small-chip row metrics: MUI small Chip is 24px tall; the strip uses gap 0.5 (4px).
// Used to bound the container during the measuring pass so no over-rows flash.
const TAG_CHIP_ROW_HEIGHT_PX = 24
const TAG_CHIP_GAP_PX = 4

export interface BuilderTagChipStripProps {
  tags: string[]
  /** Tags present in some but not all selected items (multi-edit mixed state). */
  mixedTagSet?: ReadonlySet<string>
  /** Sx applied to chips whose tag is in mixedTagSet. */
  mixedTagChipSx?: SxProps
  multiEditActive?: boolean
  /** Max chip rows before the remaining tags collapse into the "+N" badge. */
  maxRows?: number
}

/**
 * Width-aware tag chip strip: renders as many tag chips as fit inside the caller's
 * width across at most `maxRows` rows, collapsing the remainder into a "+N" badge —
 * so chips are never clipped by the panel border. Measurement-driven: a hidden pass
 * lays out every chip plus a probe badge, then a layout effect computes the visible
 * count before paint (no flash). The caller must give the strip a bounded width
 * (flex: 1 + minWidth: 0 inside nowrap rows).
 * No delete affordance; double-click copies the tag text to the clipboard.
 */
export function BuilderTagChipStrip({ tags, mixedTagSet, mixedTagChipSx, multiEditActive, maxRows = 1 }: BuilderTagChipStripProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const tagChipSx = useTagChipSx()
  // null = measuring pass (all chips rendered hidden-overflow); number = settled count.
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  // Ref-aliased setters: measurement runs in layout effects (the DOM must exist first),
  // so calls go through refs to satisfy the set-state-in-effect lint rule — the same
  // idiom useRuleCountBadge documents for its async count state.
  const setVisibleCountRef = useRef(setVisibleCount)
  // Width the last measurement ran against — resize only re-measures on width change
  // (height changes are caused by our own row collapse and must not loop the observer).
  const measuredWidthRef = useRef<number | null>(null)
  // Tag list identity for the current measurement; changing tags restarts measuring.
  const tagsKey = JSON.stringify(tags)
  const measuredTagsKeyRef = useRef<string | null>(null)
  // Bumped by the resize observer so a width change re-runs the measuring effect
  // even when visibleCount is already null (setState to null alone would no-op).
  const [measureEpoch, setMeasureEpoch] = useState(0)
  const setMeasureEpochRef = useRef(setMeasureEpoch)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Restart the measuring pass when the tag list changed since the last run.
    if (measuredTagsKeyRef.current !== tagsKey) {
      measuredTagsKeyRef.current = tagsKey
      measuredWidthRef.current = null
      if (visibleCount !== null) {
        // Re-render into the full measuring pass; this effect re-runs right after.
        setVisibleCountRef.current(null)
        return
      }
      // Already rendering the full pass (e.g. first mount) — measure it directly.
    } else if (visibleCount !== null) {
      return
    }
    // Measuring pass: children are [tag chips…, probe "+N" badge].
    const children = Array.from(container.children) as HTMLElement[]
    const probe = children.pop()
    if (!probe || children.length === 0) {
      setVisibleCountRef.current(tags.length)
      return
    }
    measuredWidthRef.current = container.clientWidth
    const containerLeft = container.getBoundingClientRect().left
    const baseTop = children[0]!.getBoundingClientRect().top
    // Chips whose top offset exceeds the allowed row band are overflow.
    // Half a row of tolerance absorbs sub-pixel layout jitter.
    const allowedTop = baseTop + (maxRows - 1) * (TAG_CHIP_ROW_HEIGHT_PX + TAG_CHIP_GAP_PX)
      + TAG_CHIP_ROW_HEIGHT_PX / 2
    let fitCount = 0
    for (const chip of children) {
      if (chip.getBoundingClientRect().top > allowedTop) break
      fitCount += 1
    }
    if (fitCount >= tags.length) {
      setVisibleCountRef.current(tags.length)
      return
    }
    // The "+N" badge must itself fit after the last visible chip on an allowed row;
    // drop trailing chips until it does (v = 0 shows the badge alone).
    const probeWidth = probe.getBoundingClientRect().width
    let v = fitCount
    while (v > 0) {
      const lastRect = children[v - 1]!.getBoundingClientRect()
      const probeRight = lastRect.right - containerLeft + TAG_CHIP_GAP_PX + probeWidth
      if (lastRect.top <= allowedTop && probeRight <= container.clientWidth) break
      v -= 1
    }
    setVisibleCountRef.current(v)
  }, [tagsKey, visibleCount, maxRows, tags.length, measureEpoch])

  // Re-measure when the available width changes (panel resize, sibling growth).
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const width = container.clientWidth
      if (measuredWidthRef.current !== null && width !== measuredWidthRef.current) {
        measuredWidthRef.current = null
        setVisibleCountRef.current(null)
        // Epoch bump guarantees the measuring effect re-runs even if it was already null.
        setMeasureEpochRef.current((epoch) => epoch + 1)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const measuring = visibleCount === null
  const shownTags = measuring ? tags : tags.slice(0, visibleCount)
  const hiddenTags = measuring ? [] : tags.slice(visibleCount)
  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: `${TAG_CHIP_GAP_PX}px`,
        // Absorb the remaining row width and stay shrinkable — the measurement needs a
        // bounded container instead of the content-sized box that used to clip chips.
        flex: '1 1 auto',
        minWidth: 0,
        // Clamp to the allowed rows; during measuring this hides the overflow pass.
        maxHeight: maxRows * TAG_CHIP_ROW_HEIGHT_PX + (maxRows - 1) * TAG_CHIP_GAP_PX,
        overflow: 'hidden',
      }}
    >
      {shownTags.map((tag) => (
        // OS tooltip reveals the full tag when the 120px chip cap ellipses it —
        // the app-wide EllipsisTooltip pattern (title only while actually truncated).
        <EllipsisTooltip key={tag} title={tag}>
          <Chip
            size="small"
            variant="outlined"
            label={tag}
            sx={[
              { maxWidth: 120 },
              tagChipSx(tag),
              ...(multiEditActive && mixedTagSet?.has(tag) && mixedTagChipSx ? [mixedTagChipSx as SystemStyleObject<Theme>] : []),
            ]}
            onDoubleClick={(e) => { e.stopPropagation(); copyTagToClipboard(tag) }}
          />
        </EllipsisTooltip>
      ))}
      {/* Probe badge (measuring) or the real overflow badge; hover lists hidden tags. */}
      {measuring ? (
        <Chip size="small" label={`+${tags.length}`} sx={{ opacity: 0.7, visibility: 'hidden' }} />
      ) : hiddenTags.length > 0 ? (
        <Chip size="small" label={`+${hiddenTags.length}`} sx={{ opacity: 0.7 }} title={hiddenTags.join(', ')} />
      ) : null}
    </Box>
  )
}

export interface BuilderTagChipListProps {
  tags: string[]
  mixedTagSet?: ReadonlySet<string>
  mixedTagChipSx?: SxProps
  multiEditActive?: boolean
  onRemove: (tag: string) => void
  /** Shown when tags is empty. */
  emptyLabel: string
}

/**
 * Full removable chip list for the tags popover.
 * Wraps in a flex Box so callers can drop it directly into a Stack or Box.
 * Double-click copies the tag text; the delete icon fires onRemove.
 */
export function BuilderTagChipList({ tags, mixedTagSet, mixedTagChipSx, multiEditActive, onRemove, emptyLabel }: BuilderTagChipListProps) {
  const tagChipSx = useTagChipSx()
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {tags.length > 0 ? (
        tags.map((tag) => (
          // Same ellipsis→OS-tooltip affordance as the strip; inert while the label fits.
          <EllipsisTooltip key={tag} title={tag}>
            <Chip
              size="small"
              variant="outlined"
              label={tag}
              onDelete={() => onRemove(tag)}
              onDoubleClick={(e) => { e.stopPropagation(); copyTagToClipboard(tag) }}
              sx={[
                tagChipSx(tag),
                ...(multiEditActive && mixedTagSet?.has(tag) && mixedTagChipSx ? [mixedTagChipSx as SystemStyleObject<Theme>] : []),
              ]}
            />
          </EllipsisTooltip>
        ))
      ) : (
        <Typography variant="caption" color="text.secondary">
          {emptyLabel}
        </Typography>
      )}
    </Box>
  )
}
