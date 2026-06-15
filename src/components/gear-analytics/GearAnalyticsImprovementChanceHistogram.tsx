/**
 * GearAnalyticsImprovementChanceHistogram.tsx
 *
 * Improvement-chance distribution for the Gear Analytics dashboard. Bins items by their
 * safeguard improvement-chance percentage (deciles 0–10 … 90–100) and renders the counts as
 * a click-to-filter bar chart. Reuses GearAnalyticsBar so binning maps onto the existing bar
 * row UX (selection, collapse, Easter-egg peer reactions) — bins are just BarEntry rows whose
 * IDs are bin indices.
 *
 * Only items with a matching safeguard (and excluding the degenerate +16/100% case) are binned;
 * that exclusion lives in countByImprovementChanceBin so it stays in sync with the grid overlay/sort.
 */
import { useMemo } from 'react'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import {
  countByImprovementChanceBin,
  improvementChanceBinLabel,
  sqrtBarWidthScale,
} from '../../lib/gearAnalytics'
import { GearAnalyticsBar, type BarEntry } from './GearAnalyticsBar'
import type { GearAnalyticsEggPeer } from '../../lib/easterEggAnimUtils'

type Props = {
  title: string
  /** Optional tooltip shown on hover over the section title. */
  description?: string
  /** Rows filtered by every dimension EXCEPT improvement chance (crossfilter rule). */
  rows: readonly GearInspectorPreviewRow[]
  /** Per-artifact improvement-chance map — drives binning. */
  chanceByArtifactId: ReadonlyMap<number, { chancePercent: number; hasMatchingSafeguard: boolean }>
  /** Selected bin indices for the cross-filter. */
  selected: ReadonlySet<number>
  /** Toggle a bin index in the cross-filter. */
  onToggle: (id: number | string) => void
  /** Fired once when this chart's Easter egg triggers so siblings can react. */
  onEasterEgg?: () => void
  /** Sympathetic animation trigger when a sibling fires its Easter egg. */
  peerDanceTrigger?: GearAnalyticsEggPeer | null
  /** Collapsed state and toggle handler — wired to the dashboard's section collapse map. */
  collapsed?: boolean
  onToggleCollapse?: (applyToAll: boolean) => void
}

export function GearAnalyticsImprovementChanceHistogram({
  title,
  description,
  rows,
  chanceByArtifactId,
  selected,
  onToggle,
  onEasterEgg,
  peerDanceTrigger,
  collapsed,
  onToggleCollapse,
}: Props) {
  // Bin counts → bar rows, ordered by ascending bin index (0–10% first, 90–100% last).
  const data: BarEntry[] = useMemo(() => {
    const counts = countByImprovementChanceBin(rows, chanceByArtifactId)
    return Array.from(counts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bin, count]) => ({ id: bin, label: improvementChanceBinLabel(bin), count }))
  }, [rows, chanceByArtifactId])

  return (
    <GearAnalyticsBar
      title={title}
      {...(description !== undefined && { description })}
      data={data}
      selected={selected}
      onToggle={onToggle}
      // sqrt width scale: the improvement-chance distribution is strongly bimodal (spikes at the
      // 0–10% and 90–100% bins), so a linear scale would flatten every middle bin to a sliver.
      widthScale={sqrtBarWidthScale}
      {...(onEasterEgg !== undefined && { onEasterEgg })}
      {...(peerDanceTrigger !== undefined && { peerDanceTrigger })}
      {...(collapsed !== undefined && { collapsed })}
      {...(onToggleCollapse !== undefined && { onToggleCollapse })}
    />
  )
}
