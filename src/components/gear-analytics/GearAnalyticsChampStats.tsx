/**
 * GearAnalyticsChampStats.tsx
 *
 * Champion gear-profile section within the Gear Analytics tab.
 * Filters by champion location (All / Collection / Vault) and an optional
 * "Fully Equipped" toggle, then shows a per-substat spline range chart.
 * An "Include Glyphs" toggle adds each substat's glyphValue to its totalValue
 * when computing min / avg / max — matching the sort-panel's glyph opt-in.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import type { GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import {
  buildChampionGearProfiles,
  filterChampionProfiles,
  computeChampSubstatTotalStats,
  type ChampSubstatStats,
  type ChampionDisplayInfo,
  type ChampAnalyticsLocation,
} from '../../lib/champAnalytics'
import { championIconUrl } from '../../lib/iconMaps/championIconMap'
import { resolveRarityAccentColor } from '../../lib/rarityColors'
import { CHAMPION_ICON_BORDER_RADIUS_PX } from '../../lib/constants'
import { useI18n } from '../../lib/i18n'
import { statVariantI18nKey } from '../../lib/gearAnalytics'
import { useSubstatColors } from '../../hooks/useSubstatColors'
import { useDisplayPreferences } from '../../state/preferencesState'

type Props = {
  rows: readonly GearInspectorPreviewRow[]
  /** Increment from outside to reset all controls to their factory defaults. */
  resetKey?: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a stat value with one decimal only when it's fractional. */
function fmtVal(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// ── Champion avatar ───────────────────────────────────────────────────────────

const AVATAR_SIZE = 20

type ChampAvatarProps = { champ: ChampionDisplayInfo }

function ChampAvatar({ champ }: ChampAvatarProps) {
  const theme = useTheme()
  const src = championIconUrl(champ.baseId ?? champ.id)
  const borderColor = resolveRarityAccentColor(champ.rarity) ?? theme.palette.divider
  return (
    <Tooltip title={champ.name} placement="top" arrow>
      <Box
        sx={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
          border: '1.5px solid',
          borderColor,
          overflow: 'hidden',
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: src ? 'transparent' : `color-mix(in srgb, ${borderColor} 14%, transparent)`,
        }}
      >
        {src ? (
          <Box
            component="img"
            src={src}
            alt={champ.name}
            draggable={false}
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', userSelect: 'none' }}
          />
        ) : (
          <Typography sx={{ fontSize: AVATAR_SIZE * 0.5, fontWeight: 700, color: borderColor, lineHeight: 1 }}>
            {champ.name.charAt(0).toUpperCase()}
          </Typography>
        )}
      </Box>
    </Tooltip>
  )
}

// ── Spline helper ─────────────────────────────────────────────────────────────

const SPLINE_VB_W = 100
const SPLINE_VB_H = 10
/** Padding units above y=0 so a full-height stroke isn't clipped by the container edge. */
const SPLINE_VB_PAD = 1

/**
 * Convert a sequence of (x, y) points to a Catmull-Rom cubic-bezier SVG path.
 * Sentinel points at x=0 and x=SPLINE_VB_W are prepended/appended so the curve
 * extends naturally to both edges of the track.
 * Returns { stroke, fill } where fill closes the area down to y=SPLINE_VB_H.
 */
function buildSplinePaths(
  buckets: readonly number[],
  maxVal: number,
): { stroke: string; fill: string } {
  const n = buckets.length
  if (n === 0) return { stroke: '', fill: '' }

  // Map each bucket to its SVG midpoint. y=0 is top; y=SPLINE_VB_H is baseline.
  const pts: Array<[number, number]> = buckets.map((cnt, i) => [
    (i + 0.5) / n * SPLINE_VB_W,
    SPLINE_VB_H - (cnt / maxVal) * SPLINE_VB_H,
  ])

  // Sentinel points extend the curve flush to the left and right track edges.
  const firstY = pts[0]![1]
  const lastY  = pts[n - 1]![1]
  const all: Array<[number, number]> = [[0, firstY], ...pts, [SPLINE_VB_W, lastY]]
  const m = all.length

  // Build Catmull-Rom cubic bezier commands.
  const parts: string[] = [`M ${all[0]![0]} ${all[0]![1]}`]
  for (let i = 0; i < m - 1; i++) {
    const p0 = all[Math.max(0, i - 1)]!
    const p1 = all[i]!
    const p2 = all[i + 1]!
    const p3 = all[Math.min(m - 1, i + 2)]!
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6
    parts.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)},${cp2x.toFixed(2)} ${cp2y.toFixed(2)},${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`)
  }

  const stroke = parts.join(' ')
  const fill   = `${stroke} L ${SPLINE_VB_W} ${SPLINE_VB_H} L 0 ${SPLINE_VB_H} Z`
  return { stroke, fill }
}

// ── Range bar row ─────────────────────────────────────────────────────────────

type RangeRowProps = { entry: ChampSubstatStats; labelColor?: string | undefined }

function SubstatRangeRow({ entry, labelColor }: RangeRowProps) {
  const theme = useTheme()
  const { t } = useI18n()
  const { min, avg, max, count, minChamp, maxChamp, buckets, samples } = entry
  // Localized stat label and min/avg/max series labels.
  const label = t(statVariantI18nKey(entry.variant))
  // Position avg relative to max — each row uses its own scale (no shared axis).
  const scale = max > 0 ? max : 1
  const avgPct = (avg / scale) * 100
  // Normalise bucket heights for the spline y-coordinates.
  const maxBucketCount = Math.max(...buckets, 1)
  const { stroke: splineStroke, fill: splineFill } = buildSplinePaths(buckets, maxBucketCount)

  // Cursor-hover state: nearest champion to the mouse x-position on the track.
  const [hovered, setHovered] = useState<{ display: ChampionDisplayInfo; total: number } | null>(null)

  const handleTrackMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (samples.length === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const targetValue = Math.max(0, ((e.clientX - rect.left) / rect.width) * max)
    // Linear scan: samples are sorted total-ascending then tiebreaker, so first minimum wins.
    let best = samples[0]!
    let bestDist = Math.abs(best.total - targetValue)
    for (let i = 1; i < samples.length; i++) {
      const dist = Math.abs(samples[i]!.total - targetValue)
      if (dist < bestDist) { best = samples[i]!; bestDist = dist }
    }
    setHovered({ display: best.display, total: best.total })
  }, [samples, max])

  const handleTrackMouseLeave = useCallback(() => setHovered(null), [])

  const trackTooltip = hovered ? (
    <Box sx={{ fontSize: '0.72rem', lineHeight: 1.6 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
        <ChampAvatar champ={hovered.display} />
        <Box>
          <Box sx={{ fontWeight: 600 }}>{hovered.display.name}</Box>
          <Box sx={{ color: 'text.secondary' }}>{label}: {fmtVal(hovered.total)}</Box>
        </Box>
      </Box>
      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.25 }}>
        {t('gearAnalyticsSeriesMin')} {fmtVal(min)} &nbsp;·&nbsp; {t('gearAnalyticsSeriesAvg')} {fmtVal(avg)} &nbsp;·&nbsp; {t('gearAnalyticsSeriesMax')} {fmtVal(max)}
      </Box>
    </Box>
  ) : ''

  return (
    <Box
      sx={{
        display: 'grid',
        // label | n | minVal | minAvatar | track | maxAvatar | maxVal
        gridTemplateColumns: `72px 28px 36px ${AVATAR_SIZE}px 1fr ${AVATAR_SIZE}px 36px`,
        alignItems: 'center',
        gap: 0.5,
        mb: 0.25,
        cursor: 'default',
        '&:hover .range-track': { filter: 'brightness(1.15)' },
      }}
    >
        {/* Stat label — colored by user-configured stat palette when provided. */}
        <Typography
          sx={{ fontSize: '0.73rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: labelColor }}
          title={label}
        >
          {label}
        </Typography>

        {/* Champion count */}
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', textAlign: 'right' }}>
          n={count}
        </Typography>

        {/* Min value */}
        <Typography sx={{ fontSize: '0.68rem', color: 'error.main', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {fmtVal(min)}
        </Typography>

        {/* Min champion avatar — directly left of the track. */}
        {minChamp ? <ChampAvatar champ={minChamp} /> : <Box sx={{ width: AVATAR_SIZE }} />}

        {/* Track: smooth spline showing the distribution of per-champion totals.
            Filled area + stroke curve; avg marker is a vertical overlay line.
            A followCursor Tooltip shows the nearest champion to the mouse x-position. */}
        <Tooltip title={trackTooltip} open={hovered !== null} followCursor placement="top" arrow>
        <Box
          className="range-track"
          onMouseMove={handleTrackMouseMove}
          onMouseLeave={handleTrackMouseLeave}
          sx={{ position: 'relative', height: 22, bgcolor: 'action.hover', borderRadius: 0.5, overflow: 'hidden' }}
        >
          <Box
            component="svg"
            viewBox={`0 ${-SPLINE_VB_PAD} ${SPLINE_VB_W} ${SPLINE_VB_H + SPLINE_VB_PAD}`}
            preserveAspectRatio="none"
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {/* Filled area under the curve. */}
            <path d={splineFill} fill={labelColor ?? theme.palette.primary.main} opacity={0.2} />
            {/* Smooth curve on top of the fill. */}
            <path d={splineStroke} fill="none" stroke={labelColor ?? theme.palette.primary.main} strokeWidth="1.2" opacity={0.75} />
          </Box>
          {/* Avg marker — solid vertical line overlaid on the curve. */}
          <Box sx={{
            position: 'absolute', left: `${avgPct}%`, width: 2, height: '100%',
            bgcolor: theme.palette.primary.main, transform: 'translateX(-50%)', zIndex: 1,
          }} />
        </Box>
        </Tooltip>

        {/* Max champion avatar — directly right of the track. */}
        {maxChamp ? <ChampAvatar champ={maxChamp} /> : <Box sx={{ width: AVATAR_SIZE }} />}

        {/* Max value */}
        <Typography sx={{ fontSize: '0.68rem', color: 'success.main', fontVariantNumeric: 'tabular-nums' }}>
          {fmtVal(max)}
        </Typography>
      </Box>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

// ── localStorage persistence ───────────────────────────────────────────────────

const LS_LOCATION         = 'gearAnalytics.champLocation'
const LS_FULLY_EQUIPPED   = 'gearAnalytics.champFullyEquipped'
const LS_INCLUDE_GLYPHS   = 'gearAnalytics.champIncludeGlyphs'

// Factory defaults — used both on first load and when the parent resets to defaults.
const DEFAULT_LOCATION: ChampAnalyticsLocation = 'collection'
const DEFAULT_FULLY_EQUIPPED = true
const DEFAULT_INCLUDE_GLYPHS = true

function readLocation(): ChampAnalyticsLocation {
  const v = localStorage.getItem(LS_LOCATION)
  if (v === 'all' || v === 'collection' || v === 'vault') return v
  return DEFAULT_LOCATION
}

function readFullyEquipped(): boolean {
  const v = localStorage.getItem(LS_FULLY_EQUIPPED)
  return v === null ? DEFAULT_FULLY_EQUIPPED : v === 'true'
}

function readIncludeGlyphs(): boolean {
  const v = localStorage.getItem(LS_INCLUDE_GLYPHS)
  return v === null ? DEFAULT_INCLUDE_GLYPHS : v === 'true'
}

export function GearAnalyticsChampStats({ rows, resetKey }: Props) {
  const { t } = useI18n()
  const [substatColors] = useSubstatColors()
  const { statButtonBorders } = useDisplayPreferences()

  // Filter/display state: persisted to localStorage so the user's preference survives reloads.
  const [location, setLocation] = useState<ChampAnalyticsLocation>(readLocation)
  const [fullyEquippedOnly, setFullyEquippedOnly] = useState<boolean>(readFullyEquipped)
  // When true, adds each substat's glyphValue to totalValue in the chart calculations.
  const [includeGlyphs, setIncludeGlyphs] = useState<boolean>(readIncludeGlyphs)

  useEffect(() => { localStorage.setItem(LS_LOCATION, location) }, [location])
  useEffect(() => { localStorage.setItem(LS_FULLY_EQUIPPED, String(fullyEquippedOnly)) }, [fullyEquippedOnly])
  useEffect(() => { localStorage.setItem(LS_INCLUDE_GLYPHS, String(includeGlyphs)) }, [includeGlyphs])
  // Restore factory defaults when the parent increments resetKey.
  // Multiple setState calls in a single effect are intentional — they batch together in React 18+
  // and restore all three controls atomically. The react-compiler rule is suppressed accordingly.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (resetKey === undefined) return
    setLocation(DEFAULT_LOCATION)
    setFullyEquippedOnly(DEFAULT_FULLY_EQUIPPED)
    setIncludeGlyphs(DEFAULT_INCLUDE_GLYPHS)
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Build champion profiles once from the full row set.
  const allProfiles = useMemo(() => buildChampionGearProfiles(rows), [rows])

  // Apply location + fully-equipped filters.
  const filteredProfiles = useMemo(
    () => filterChampionProfiles(allProfiles, location, fullyEquippedOnly),
    [allProfiles, location, fullyEquippedOnly],
  )

  // Set of champion IDs that pass the current filters.
  const activeChampIds = useMemo(
    () => new Set(filteredProfiles.map((p) => p.championId)),
    [filteredProfiles],
  )

  // Per-champion substat totals: sum each substat across all gear per champion,
  // then show the distribution of those totals across champions.
  // Pass includeGlyphs so glyph bonuses are optionally added to each substat's total.
  const substatStats = useMemo(
    () => computeChampSubstatTotalStats(rows, activeChampIds, includeGlyphs),
    [rows, activeChampIds, includeGlyphs],
  )

  return (
    <Box>
      {/* Section header */}
      <Tooltip title={t('gearAnalyticsChampStatsTitleDesc')} arrow placement="top-start">
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.68rem', display: 'inline-block', mb: 1, cursor: 'help' }}
        >
          {t('gearAnalyticsChampStatsTitle')}
        </Typography>
      </Tooltip>

      {/* Filter controls: location | fully-equipped | include glyphs */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
        {/* Champion location filter */}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={location}
          onChange={(_e, val) => { if (val !== null) setLocation(val as ChampAnalyticsLocation) }}
        >
          <ToggleButton value="all" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsChampLocationAll')}
          </ToggleButton>
          <ToggleButton value="collection" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsChampLocationCollection')}
          </ToggleButton>
          <ToggleButton value="vault" sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}>
            {t('gearAnalyticsChampLocationVault')}
          </ToggleButton>
        </ToggleButtonGroup>

        {/* Fully-equipped toggle: when selected, only champions with all 6 slots filled are included. */}
        <ToggleButton
          value="fullyEquipped"
          selected={fullyEquippedOnly}
          size="small"
          onClick={(e) => { e.preventDefault(); setFullyEquippedOnly(!fullyEquippedOnly) }}
          sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}
        >
          {t('gearAnalyticsChampFullyEquippedOnly')}
        </ToggleButton>

        {/* Glyph toggle: when selected, adds each substat's glyphValue to totalValue in the chart. */}
        <ToggleButton
          value="includeGlyphs"
          selected={includeGlyphs}
          size="small"
          onClick={(e) => { e.preventDefault(); setIncludeGlyphs(!includeGlyphs) }}
          sx={{ py: 0.5, px: 1.5, fontSize: '0.75rem' }}
        >
          {t('gearAnalyticsGlyphInclude')}
        </ToggleButton>
      </Box>

      {substatStats.length === 0 ? (
        <Box sx={{ py: 2, opacity: 0.4 }}>
          <Typography variant="caption" color="text.secondary">—</Typography>
        </Box>
      ) : (
        <Box>
          {/* One range bar row per substat. Each row uses its own max as the scale
              so that different stat magnitudes (e.g. SPD vs HP flat) are
              independently readable. */}
          {substatStats.map((entry) => (
            <SubstatRangeRow key={entry.variant} entry={entry} labelColor={statButtonBorders ? substatColors[entry.variant]?.fg : undefined} />
          ))}
        </Box>
      )}
    </Box>
  )
}
