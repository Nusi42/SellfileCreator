/**
 * Toggle for the tester grid instrumentation. Keeping this centralized lets us
 * silence the observers without touching the rest of the UI wiring.
 */
export const TESTER_GRID_METRICS_ENABLED = true

type DiffSample = {
  diff: number
  actual: number
  estimate: number
  key: string
  rowCount: number
  hasChildren: boolean
  expanded: boolean
}

type ColumnStats = {
  sampleCount: number
  minHeight: number
  maxHeight: number
  totalHeight: number
  maxOver: DiffSample | null
  maxUnder: DiffSample | null
}

// Track roll-up stats per column layout so we can compare 4-column vs 5-column modes.
const columnStatsByCount = new Map<number, ColumnStats>()
// Store the latest virtual estimate for each visible group to compare against actual measurements.
const groupEstimateByKey = new Map<string, {
  estimatedHeight: number
  columnCount: number
  rowCount: number
  collapsed: boolean
  hasChildren: boolean
}>()

// Carry the last virtualization snapshot so each log message has all relevant context.
const virtualizationState = {
  frames: 0,
  lastSnapshot: {
    columns: 0,
    groups: 0,
    rows: 0,
    visibleGroups: 0,
    scrollTop: 0,
    padTop: 0,
    padBottom: 0,
    viewportHeight: 0,
    totalHeight: 0,
    overscanPx: 0,
    shouldVirtualize: false,
  },
  lastLogTs: 0,
}

// Keep single running maxima for the three string lengths we care about.
const substatState = {
  samples: 0,
  combined: { len: 0, label: '', rowId: null as number | null },
  stat: { len: 0, label: '', rowId: null as number | null },
  value: { len: 0, label: '', rowId: null as number | null },
}

export type TesterGridGroupEstimatePayload = {
  groupKey: string
  estimatedHeight: number
  columnCount: number
  rowCount: number
  collapsed: boolean
  hasChildren: boolean
}

export type TesterGridGroupMeasurementPayload = {
  groupKey: string
  depth: number
  columnCount: number
  actualHeight: number
  rowCount: number
  hasChildren: boolean
  isExpanded: boolean
}

export type TesterGridVirtualizationFramePayload = {
  columns: number
  groups: number
  rows: number
  visibleGroups: number
  scrollTop: number
  padTop: number
  padBottom: number
  totalHeight: number
  viewportHeight: number
  overscanPx: number
  shouldVirtualize: boolean
}

export type TesterGridSubstatSamplePayload = {
  rowId: number | null
  combinedLabel: string
  statLabel: string
  valueLabel: string
  variantId: number | null
}

const describeLabel = (label: string): string => {
  // Collapse whitespace so cross-language strings remain readable in the console.
  const compact = label.replace(/\s+/g, ' ').trim()
  if (compact.length <= 48) return compact
  return `${compact.slice(0, 45)}…`
}

const acquireColumnStats = (columnCount: number): ColumnStats => {
  // Lazily initialize so idle column modes do not clutter the log.
  const existing = columnStatsByCount.get(columnCount)
  if (existing) return existing
  const fresh: ColumnStats = {
    sampleCount: 0,
    minHeight: Number.POSITIVE_INFINITY,
    maxHeight: 0,
    totalHeight: 0,
    maxOver: null,
    maxUnder: null,
  }
  columnStatsByCount.set(columnCount, fresh)
  return fresh
}

const updateDiffSample = (existing: DiffSample | null, next: DiffSample, chooseGreater: boolean): DiffSample => {
  if (!existing) return next
  // Some stats want the largest absolute mismatch while others want the smallest.
  return chooseGreater
    ? (next.diff > existing.diff ? next : existing)
    : (next.diff > existing.diff ? existing : next)
}

const trackGroupDiff = (stats: ColumnStats, entry: DiffSample): void => {
  if (entry.diff >= 0) {
    // Positive diff means the actual DOM is taller than the virtual estimate.
    stats.maxOver = updateDiffSample(stats.maxOver, entry, true)
    return
  }
  // Negative diff indicates an estimate that overshoots the DOM height.
  const normalized = { ...entry, diff: Math.abs(entry.diff) }
  stats.maxUnder = updateDiffSample(stats.maxUnder, normalized, true)
}

const logTesterGridSnapshot = (reason: string): void => {
  if (!TESTER_GRID_METRICS_ENABLED) return
  const { lastSnapshot } = virtualizationState
  const now = Date.now()
  virtualizationState.lastLogTs = now
  const columnSummaries: string[] = []
  for (const [columns, stats] of columnStatsByCount.entries()) {
    if (stats.sampleCount === 0) continue
    const minHeight = stats.minHeight === Number.POSITIVE_INFINITY ? 0 : Math.round(stats.minHeight)
    const maxHeight = Math.round(stats.maxHeight)
    // Sample average smooths out the occasional scrollbar resize spikes.
    const avgHeight = Math.round(stats.totalHeight / Math.max(1, stats.sampleCount))
    const overSample = stats.maxOver
    const over = overSample
      ? `+${Math.round(overSample.diff)}(est=${Math.round(overSample.estimate)} actual=${Math.round(overSample.actual)} rows=${overSample.rowCount} children=${overSample.hasChildren ? 1 : 0} expanded=${overSample.expanded ? 1 : 0})`
      : '+0'
    const underSample = stats.maxUnder
    const under = underSample
      ? `-${Math.round(underSample.diff)}(est=${Math.round(underSample.estimate)} actual=${Math.round(underSample.actual)} rows=${underSample.rowCount} children=${underSample.hasChildren ? 1 : 0} expanded=${underSample.expanded ? 1 : 0})`
      : '-0'
    columnSummaries.push(`${columns}c[min=${minHeight} max=${maxHeight} avg=${avgHeight} over=${over} under=${under}]`)
  }
  const columnBlock = columnSummaries.length > 0 ? columnSummaries.join(' ') : 'none'
  const substatBlock = [
    // Each block includes the text sample so the follow-up analysis can see the actual label, not just counts.
    `combo[len=${substatState.combined.len} text="${describeLabel(substatState.combined.label)}" row=${substatState.combined.rowId ?? 'n/a'}]`,
    `stat[len=${substatState.stat.len} text="${describeLabel(substatState.stat.label)}" row=${substatState.stat.rowId ?? 'n/a'}]`,
    `value[len=${substatState.value.len} text="${describeLabel(substatState.value.label)}" row=${substatState.value.rowId ?? 'n/a'}]`,
    `samples=${substatState.samples}`,
  ].join(' ')
  const message = [
    `[tester-grid] reason=${reason}`,
    `cols=${lastSnapshot.columns}`,
    `groups=${lastSnapshot.groups}`,
    `rows=${lastSnapshot.rows}`,
    `visible=${lastSnapshot.visibleGroups}`,
    `scrollTop=${Math.round(lastSnapshot.scrollTop)}`,
    `padTop=${Math.round(lastSnapshot.padTop)}`,
    `padBottom=${Math.round(lastSnapshot.padBottom)}`,
    `viewport=${Math.round(lastSnapshot.viewportHeight)}`,
    `total=${Math.round(lastSnapshot.totalHeight)}`,
    `overscan=${Math.round(lastSnapshot.overscanPx)}`,
    `virtual=${lastSnapshot.shouldVirtualize ? 1 : 0}`,
    `heights=${columnBlock}`,
    `substats=${substatBlock}`,
  ].join(' ')
  console.log(message)
}

export function recordTesterGridGroupEstimate(payload: TesterGridGroupEstimatePayload): void {
  if (!TESTER_GRID_METRICS_ENABLED) return
  groupEstimateByKey.set(payload.groupKey, {
    estimatedHeight: Math.max(0, payload.estimatedHeight),
    columnCount: payload.columnCount,
    rowCount: payload.rowCount,
    collapsed: payload.collapsed,
    hasChildren: payload.hasChildren,
  })
}

export function recordTesterGridGroupMeasurement(payload: TesterGridGroupMeasurementPayload): void {
  if (!TESTER_GRID_METRICS_ENABLED) return
  if (payload.depth !== 0) return
  const stats = acquireColumnStats(payload.columnCount)
  const actual = Math.max(0, payload.actualHeight)
  stats.sampleCount += 1
  stats.minHeight = Math.min(stats.minHeight, actual)
  stats.maxHeight = Math.max(stats.maxHeight, actual)
  stats.totalHeight += actual
  const estimate = groupEstimateByKey.get(payload.groupKey)
  if (!estimate) return
  const diff = actual - estimate.estimatedHeight
  const diffSample: DiffSample = {
    diff,
    actual,
    estimate: estimate.estimatedHeight,
    key: payload.groupKey,
    rowCount: payload.rowCount,
    hasChildren: payload.hasChildren,
    expanded: payload.isExpanded,
  }
  trackGroupDiff(stats, diffSample)
}

export function recordTesterGridVirtualizationFrame(payload: TesterGridVirtualizationFramePayload): void {
  if (!TESTER_GRID_METRICS_ENABLED) return
  virtualizationState.frames += 1
  virtualizationState.lastSnapshot = {
    columns: payload.columns,
    groups: payload.groups,
    rows: payload.rows,
    visibleGroups: payload.visibleGroups,
    scrollTop: payload.scrollTop,
    padTop: payload.padTop,
    padBottom: payload.padBottom,
    viewportHeight: payload.viewportHeight,
    totalHeight: payload.totalHeight,
    overscanPx: payload.overscanPx,
    shouldVirtualize: payload.shouldVirtualize,
  }
  logTesterGridSnapshot('virtualization')
}

export function recordTesterGridSubstatSample(payload: TesterGridSubstatSamplePayload): void {
  if (!TESTER_GRID_METRICS_ENABLED) return
  // Tally counts so we know roughly how many data points each session covered.
  substatState.samples += 1
  const combinedLen = payload.combinedLabel.length
  const statLen = payload.statLabel.length
  const valueLen = payload.valueLabel.length
  if (combinedLen > substatState.combined.len) {
    substatState.combined = {
      len: combinedLen,
      label: payload.combinedLabel,
      rowId: payload.rowId,
    }
  }
  if (statLen > substatState.stat.len) {
    substatState.stat = {
      len: statLen,
      label: payload.statLabel,
      rowId: payload.rowId,
    }
  }
  if (valueLen > substatState.value.len) {
    substatState.value = {
      len: valueLen,
      label: payload.valueLabel,
      rowId: payload.rowId,
    }
  }
}
