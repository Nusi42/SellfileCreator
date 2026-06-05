import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Box, Typography } from '@mui/material'
import { useI18n } from '../lib/i18n'
import type { DiffRow } from '../lib/gearDiff/verdictDiff'
import type { GearDiffRows } from '../hooks/useGearDiffCompare'

// Attribute the Gear Inspector grid puts on its scroll container; used to mirror scroll.
const GRID_SCROLL_SELECTOR = '[data-gear-inspector-grid-container]'

type GearDiffSplitViewProps = {
  // Changed rows (flat list; null when not comparing).
  diffRows: GearDiffRows | null
  // Render a reused Gear Inspector grid for a row set. The host binds shared props; the
  // same closure renders both panes — only the rows' `match` differs (baseline vs
  // current). `halfPaneColumns` tells the grid it's a half-width pane; the shared
  // collapse state keeps group collapse/expand synchronized across the two panes.
  renderGrid: (rows: DiffRow[], opts?: {
    halfPaneColumns?: boolean
    collapsedGroups?: Set<string>
    onCollapsedGroupsChange?: Dispatch<SetStateAction<Set<string>>>
  }) => ReactNode
}

// Mirror vertical scroll between the two panes. Both render the SAME changed rows in the
// SAME order with identical grouping/sort and uniform card heights, so a shared scrollTop
// maps to the same logical position. A reentrancy guard prevents scroll feedback loops.
function useSyncedScroll(
  leftRef: React.RefObject<HTMLDivElement | null>,
  rightRef: React.RefObject<HTMLDivElement | null>,
  // Re-run when the rendered content changes so we re-bind to freshly mounted containers.
  contentKey: unknown,
) {
  useEffect(() => {
    const left = leftRef.current?.querySelector<HTMLElement>(GRID_SCROLL_SELECTOR)
    const right = rightRef.current?.querySelector<HTMLElement>(GRID_SCROLL_SELECTOR)
    if (!left || !right) return
    let syncing = false
    const mirror = (src: HTMLElement, dst: HTMLElement) => () => {
      if (syncing) return
      syncing = true
      dst.scrollTop = src.scrollTop
      // Release on the next frame so the mirrored scroll event does not bounce back.
      requestAnimationFrame(() => { syncing = false })
    }
    const onLeft = mirror(left, right)
    const onRight = mirror(right, left)
    left.addEventListener('scroll', onLeft, { passive: true })
    right.addEventListener('scroll', onRight, { passive: true })
    return () => {
      left.removeEventListener('scroll', onLeft)
      right.removeEventListener('scroll', onRight)
    }
  }, [leftRef, rightRef, contentKey])
}

// Inline side-by-side before/after diff for the preview area. Left pane shows each
// changed row's BASELINE verdict; right pane shows its CURRENT verdict; scroll is synced.
export function GearDiffSplitView({ diffRows, renderGrid }: GearDiffSplitViewProps) {
  const { t } = useI18n()
  const leftPaneRef = useRef<HTMLDivElement | null>(null)
  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  // One collapse state shared by both panes so collapsing a group in either pane mirrors
  // in the other (both panes render the same groups in the same order).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set())

  // All changed rows. Each carries before/after matches; the grid sorts/groups them itself.
  const changed = useMemo<DiffRow[]>(() => diffRows ?? [], [diffRows])

  // Project each changed row so the grid renders the correct side's verdict. The card
  // reads `row.match`, so swap in beforeMatch/afterMatch per pane.
  const beforeRows = useMemo<DiffRow[]>(
    () => changed.map((r) => ({ ...r, match: r.beforeMatch })),
    [changed],
  )
  const afterRows = useMemo<DiffRow[]>(
    () => changed.map((r) => ({ ...r, match: r.afterMatch })),
    [changed],
  )

  // Re-bind scroll sync whenever the row set changes (the grids remount their containers).
  useSyncedScroll(leftPaneRef, rightPaneRef, changed.length)

  const isEmpty = changed.length === 0

  return (
    <Box data-testid="gear-diff-split-view" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {isEmpty ? (
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
          <Typography color="text.secondary">{t('gearDiffEmpty')}</Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 1, px: 1, pb: 1 }}>
          {/* Before pane */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>
              {t('gearDiffSplitBaselineHeading')}
            </Typography>
            <Box ref={leftPaneRef} sx={{ flex: 1, minHeight: 0 }}>{renderGrid(beforeRows, { halfPaneColumns: true, collapsedGroups, onCollapsedGroupsChange: setCollapsedGroups })}</Box>
          </Box>
          {/* After pane */}
          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="overline" color="text.secondary" sx={{ px: 1 }}>
              {t('gearDiffSplitCurrentHeading')}
            </Typography>
            <Box ref={rightPaneRef} sx={{ flex: 1, minHeight: 0 }}>{renderGrid(afterRows, { halfPaneColumns: true, collapsedGroups, onCollapsedGroupsChange: setCollapsedGroups })}</Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}

export default GearDiffSplitView
