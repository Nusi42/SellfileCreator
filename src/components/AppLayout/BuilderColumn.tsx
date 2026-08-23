import { Box, Paper, Typography } from '@mui/material'
import type { MutableRefObject, ReactNode } from 'react'

import { SIDE_BY_SIDE_NATIVE_MEDIA_QUERY } from '../../lib/constants'
import { GoldCornerOrnaments, GOLD_CORNER_HOST_SX } from '../GoldCornerOrnament'
import { BuilderSplitter, BUILDER_SPLITTER_BOTTOM_VAR, BUILDER_SPLITTER_TOP_VAR } from './BuilderSplitter'

/**
 * BuilderColumn renders the builder-side layout as TWO stacked papers separated by a draggable
 * horizontal splitter: the rule form (plus its header and metaset controls) on top, and the chip
 * list — recipe chips or safeguard chips, matching the active builder mode — below. App.tsx
 * supplies the interactive pieces as React nodes so this component focuses on layout and styling.
 *
 * Wherever the handle is live, both papers size themselves from the CSS variables the drag writes,
 * so a gesture updates the layout on the fly without a single React render. The committed ratio
 * only supplies each variable's fallback. Until the user drags (`splitRatio === null`) that
 * fallback is `auto`, so the top paper sits at its natural content height and the bottom paper
 * takes the remaining space — how the column looked before it was split; the handle is opt-in.
 *
 * Only side-by-side mode has a fixed height budget to divide, so that is the only layout where the
 * handle is interactive; stacked mode renders it as a passive gap and lets both papers grow.
 */
export type BuilderColumnProps = {
  /**
   * Measures the column's total height and top offset. The preview column mirrors this height,
   * and the chips measurement derives its budget from this element's top edge — so it stays on
   * the column wrapper, not on either individual paper. It also carries the CSS custom
   * properties the builder splitter writes during a drag.
   */
  paperRef: MutableRefObject<HTMLDivElement | null>
  /** Measures the TOP paper alone, so the splitter knows the form's natural height. */
  formPaperRef: MutableRefObject<HTMLDivElement | null>
  sideBySideMinPaperHeightPx: string | undefined
  forceSideBySide?: boolean
  /** Explicit left-panel width in px when the splitter has been dragged; overrides PANEL_WIDTH_PX. */
  widthPx?: number | undefined
  /** True when the app is in side-by-side layout — gates the builder splitter's interactivity. */
  isSideBySide?: boolean
  /** Committed builder split ratio for the active mode, or null for the natural-height default. */
  splitRatio: number | null
  /** Natural split measured from the DOM; the start value when splitRatio is null. */
  splitFallbackRatio: number
  /** Height budget (CSS px) the two papers share, or null outside side-by-side. */
  splitUsableHeightPx: number | null
  /** Commits a dragged ratio; null resets to natural height. */
  onSplitResize: (ratio: number | null) => void
  title: ReactNode
  caption?: string
  substatTargets?: ReactNode
  builderPanel: ReactNode
  headerActions: ReactNode
  metasetConflictDialog: ReactNode
  recipeChipsPanel: ReactNode
  pasteDialog: ReactNode
  copyDialog: ReactNode
}

export function BuilderColumn({
  paperRef,
  formPaperRef,
  sideBySideMinPaperHeightPx,
  forceSideBySide = false,
  widthPx,
  isSideBySide = false,
  splitRatio,
  splitFallbackRatio,
  splitUsableHeightPx,
  onSplitResize,
  title,
  caption,
  substatTargets,
  builderPanel,
  headerActions,
  metasetConflictDialog,
  recipeChipsPanel,
  pasteDialog,
  copyDialog,
}: BuilderColumnProps) {
  // The handle only earns its affordances where there is a fixed budget to divide.
  const splitterInteractive = isSideBySide || forceSideBySide
  // Whenever the handle is live, BOTH papers size themselves from the CSS variables the drag
  // writes — never from a React-committed height. That is what makes a drag update the layout on
  // the fly: the gesture only touches the DOM, and the committed ratio merely supplies each
  // variable's fallback for the single re-render after mouseup.
  //
  // Crucially this must not be conditional on a ratio existing. Sizing the papers by `flex` while
  // splitRatio is null and only switching to `var(...)` after the first commit would leave the
  // variables unread during that first gesture, so the panels would sit still until mouseup — and
  // again after every double-click reset, which restores exactly that null state.
  const canSplit = splitterInteractive && splitUsableHeightPx != null && splitUsableHeightPx > 0
  // The fallback is the natural split (form at content height) until the user drags, and the
  // committed split afterwards. `natural` resolves to `auto`, so an undragged column lays out
  // exactly as it did before it was split.
  const naturalTopFallback = splitRatio != null
    ? `${Math.round(splitRatio * (splitUsableHeightPx ?? 0))}px`
    : 'auto'
  const topHeight = canSplit ? `var(${BUILDER_SPLITTER_TOP_VAR}, ${naturalTopFallback})` : undefined
  // The bottom paper always takes the remainder, so its fallback is simply "fill what is left".
  // Using flex-basis rather than a px fallback keeps the undragged layout self-correcting when
  // the form's natural height changes (mode switch, a section collapsing).
  const bottomHeight = canSplit ? `var(${BUILDER_SPLITTER_BOTTOM_VAR}, auto)` : undefined

  // Both papers share this base: the gold-corner anchor and the padding of a major work surface.
  const paperBaseSx = {
    p: 2,
    display: 'flex',
    flexDirection: 'column',
    // Anchor for the gold corner ornaments (a major work panel wears the mark).
    ...GOLD_CORNER_HOST_SX,
    // The papers are sized by the column, never by their own content overflowing.
    minWidth: 0,
  } as const

  return (
    <Box
      ref={paperRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        // During drag the column splitter writes --splitter-left-width directly to the DOM, so the
        // width updates without any React re-render. widthPx (the committed value) serves as the
        // fallback for the initial render and the single re-render after mouseup.
        // The 50% fallback covers the flash-guard window before the CSS var is first written.
        width: forceSideBySide ? `var(--splitter-left-width, ${widthPx != null ? `${widthPx}px` : '50%'})` : '100%',
        maxWidth: 'none',
        mx: 0,
        // In forced side-by-side (zoom) mode, lock the column to exactly the available viewport
        // height. minHeight + maxHeight together make it a fixed-height container so the two
        // papers divide that budget without the column itself ever growing beyond the viewport
        // and causing a document scrollbar.
        ...(forceSideBySide && sideBySideMinPaperHeightPx
          ? { minHeight: sideBySideMinPaperHeightPx, maxHeight: sideBySideMinPaperHeightPx, overflowY: 'hidden' }
          : {}),
        // Native side-by-side (no zoom) gets the same fixed-height treatment so that
        // chipsMaxHeight updates on mode switch cannot nudge the column height up or down.
        [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
          mx: 0,
          // CSS variable carries live drag updates; 50% fallback covers the flash-guard window.
          width: `var(--splitter-left-width, ${widthPx != null ? `${widthPx}px` : '50%'})`,
          ...(sideBySideMinPaperHeightPx
            ? { minHeight: sideBySideMinPaperHeightPx, maxHeight: sideBySideMinPaperHeightPx, overflowY: 'hidden' }
            : {}),
        },
      }}
      data-tour-id="builder.panel"
    >
      {/* ── Top paper: the builder form, its header, and the metaset controls ── */}
      <Paper
        ref={formPaperRef}
        sx={{
          ...paperBaseSx,
          // Never grow or shrink from flex: the height above is the single authority, and it
          // resolves to `auto` (natural content height) until the user drags. The form scrolls
          // internally once a drag gives it less room than it wants.
          flex: '0 0 auto',
          ...(topHeight ? { height: topHeight, overflowY: 'auto' } : {}),
          // Border overrides: reduce visual "frame" on edges that should feel open.
          // SBS left column — remove the leftmost edge; the inner (right) border stays.
          // Non-SBS full-width — remove left/right edges.
          // The bottom edge goes in both cases: the splitter gap below is the separation.
          ...(widthPx != null || forceSideBySide ? {
            borderLeft: 'none',
            borderBottom: 'none',
          } : {
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: 'none',
          }),
          [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
            // Flash-guard fires in SBS — apply SBS border overrides here too.
            borderLeft: 'none',
            borderBottom: 'none',
          },
        }}
        data-tour-id="builder.core"
      >
        <GoldCornerOrnaments />
        <Box sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: 1, mb: 2 }}>
            {typeof title === 'string' ? (
              <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
                {title}
              </Typography>
            ) : title}
            {caption ? (
              <Typography variant="caption" color="text.secondary">
                {caption}
              </Typography>
            ) : (
              <Box />
            )}
            {substatTargets ?? <Box />}
          </Box>
          {/* The builder panels scope overflowX:auto to the form grid and keep the name
              TextField above that scroll zone, so floating labels are never clipped here. */}
          <Box sx={{ position: 'relative', flexShrink: 0 }}>{builderPanel}</Box>
          <Box sx={{ flexShrink: 0 }}>{headerActions}</Box>
        </Box>
      </Paper>

      {/* ── The handle dividing the two papers ── */}
      <BuilderSplitter
        ratio={splitRatio}
        fallbackRatio={splitFallbackRatio}
        onResize={onSplitResize}
        containerRef={paperRef}
        usableHeightPx={splitUsableHeightPx}
        forceSideBySide={forceSideBySide}
        interactive={splitterInteractive}
      />

      {/* ── Bottom paper: the chip list for whichever builder mode is active ── */}
      <Paper
        sx={{
          ...paperBaseSx,
          // Takes whatever the form paper leaves. `flex: 1` with `minHeight: 0` handles the
          // undragged case (height resolves to `auto`); once the drag writes the variable, the
          // explicit height wins and flex-grow has nothing left to distribute.
          flex: 1,
          ...(bottomHeight ? { height: bottomHeight } : {}),
          // The chip list owns its own scrolling; the paper is the hard boundary.
          minHeight: 0,
          overflow: 'hidden',
          // Same edge treatment as the top paper, minus the bottom removal — this paper's
          // bottom IS the column's bottom, which the SBS layout wants open to the viewport.
          ...(widthPx != null || forceSideBySide ? {
            borderLeft: 'none',
            borderBottom: 'none',
          } : {
            borderLeft: 'none',
            borderRight: 'none',
          }),
          [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
            borderLeft: 'none',
            borderBottom: 'none',
          },
        }}
      >
        <GoldCornerOrnaments />
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {recipeChipsPanel}
        </Box>
      </Paper>

      {metasetConflictDialog}
      {pasteDialog}
      {copyDialog}
    </Box>
  )
}
