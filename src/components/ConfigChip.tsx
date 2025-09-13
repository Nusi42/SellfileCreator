import { useEffect, useState } from 'react'
import { Box, Divider, IconButton, Menu, MenuItem, Tooltip, Typography } from '@mui/material'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import {
  factionCodeToName,
  formatRank,
  labelOfVariant,
  rarityCodeToName,
  artifactSetName,
  compareVariants,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  artifactTypeName,
  compareArtifactTypes,
} from '../lib/types'
import { RARITY_AUTO_LABEL } from '../lib/constants'
import { APP_VERSION } from '../version'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { buildReadableConfig } from '../lib/hsfrIO'
import { artifactSetNames, compareArtifactSets } from '../lib/types'
import { writeTextSafe, triggerCopyDialog } from '../lib/clipboard'

export default function ConfigChip({
  index,
  cfg,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onMoveTop,
  onMoveBottom,
  onPasteAfter,
  selected,
  onSelect,
  isLast,
  linkedHover,
  onHover,
  metasets,
  substatColors,
  useStatButtonColors,
}: {
  index: number
  cfg: BuilderConfig
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onMoveTop: () => void
  onMoveBottom: () => void
  onPasteAfter: () => void
  selected: boolean
  onSelect: () => void
  isLast: boolean
  linkedHover: boolean
  onHover: (enter: boolean) => void
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
}) {
  const ellipsizeName = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  // Build compact summary without redundant labels; act is rendered separately
  const actText = cfg.keep ? 'Keep' : 'Sell'
  const restSummary = summaryParts(cfg, metasets, { substatColors, useStatButtonColors })
  const keepColor = cfg.keep ? 'success.main' : 'error.main'
  const isDisabled = cfg.enabled === false
  const [menu, setMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  useEffect(() => {
    if (!menu?.open) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [menu?.open])
  return (
    <Box
      id={`cfg-chip-${index}`}
      data-tour-id={selected ? 'chip.selected' : undefined}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : (linkedHover ? 'primary.main' : 'divider'),
        backgroundColor: selected ? 'action.selected' : (linkedHover ? 'action.hover' : 'transparent'),
        borderRadius: 5,
        pl: 1.2,
        pr: 0.5,
        py: 0.5,
        cursor: 'pointer',
      }}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onContextMenu={(e) => { try { e.preventDefault(); e.stopPropagation() } catch {} setMenu({ open: true, x: e.clientX, y: e.clientY }) }}
    >
      <Typography variant="caption" sx={{ mr: 0.5 }}>
        <Tooltip title="Click to edit this config"><Box component="span" sx={{ display: 'inline' }}>
          {`${index + 1}. `}
          {cfg.name ? `${ellipsizeName(cfg.name)} — ` : ''}
          {isDisabled ? (
            <Box component="span" sx={{ color: 'common.white', textDecoration: 'line-through' }}>
              <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
            </Box>
          ) : (
            <Box component="span" sx={{ color: keepColor, fontWeight: 600 }}>{actText}</Box>
          )}
          {restSummary && (
            <>
              {' | '}
              {restSummary}
            </>
          )}
        </Box></Tooltip>
      </Typography>
      <Tooltip title="Move up"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveUp() }} disabled={index === 0}><ArrowUpwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Move down"><span><IconButton size="small" onClick={(e) => { e.stopPropagation(); onMoveDown() }} disabled={isLast}><ArrowDownwardIcon fontSize="inherit" /></IconButton></span></Tooltip>
      <Tooltip title="Duplicate"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDuplicate() }}><ContentCopyIcon fontSize="inherit" /></IconButton></Tooltip>
      <Tooltip title="Delete"><IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete() }} color="error"><DeleteIcon fontSize="inherit" /></IconButton></Tooltip>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
      >
        <MenuItem onClick={() => { setMenu(null); onDuplicate() }}>Duplicate</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveTop() }} disabled={index === 0}>Move to Top</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveUp() }} disabled={index === 0}>Move Up</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveDown() }} disabled={isLast}>Move Down</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onMoveBottom() }} disabled={isLast}>Move to Bottom</MenuItem>
        <MenuItem onClick={async () => {
          setMenu(null)
          const readable = buildReadableConfig(cfg, metasets)
          // Include only referenced metasets alongside the single config for portability.
          const usedMetaIds = (cfg.artifactMetaSets ?? [])
          const metasOut = metasets
            .filter(m => usedMetaIds.includes(m.id))
            .map(m => ({
              id: m.id,
              name: m.name,
              setNames: m.sets.slice().sort(compareArtifactSets)
                .map((id) => artifactSetNames[Number(id)])
                .filter((x): x is string => Boolean(x)),
              show: m.show !== false,
            }))
          const payload = { Version: APP_VERSION, Metasets: metasOut, Configs: [readable] }
          const text = JSON.stringify(payload, null, 2)
          const ok = await writeTextSafe(text)
          if (!ok) triggerCopyDialog(text)
        }}>Copy to Clipboard</MenuItem>
        <MenuItem onClick={() => { setMenu(null); onPasteAfter() }}>Paste after</MenuItem>
        <Divider />
        <MenuItem onClick={() => { setMenu(null); onDelete() }} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>
    </Box>
  )
}


function summaryParts(
  cfg: BuilderConfig,
  metasets: Metaset[],
  opts: { substatColors: Record<number, { fg: string; bg: string }>; useStatButtonColors: boolean }
): JSX.Element | null {
  const parts: Array<JSX.Element> = []
  const addText = (text: string) => { if (text) parts.push(<Box key={`t-${parts.length}`} component="span">{text}</Box>) }
  const addNode = (node: JSX.Element) => parts.push(<Box key={`n-${parts.length}`} component="span">{node}</Box>)

  // Rank
  {
    const r = formatRank(cfg.rankCode)
    if (r && r !== 'Any') addText(r)
  }

  // Rarity
  {
    const rar = (cfg.rarityMode === 'auto') ? RARITY_AUTO_LABEL : rarityCodeToName(cfg.rarityCode)
    if (rar && rar !== 'Any') addText(rar)
  }

  // Faction
  if (cfg.factionCode && cfg.factionCode !== 0) addText(factionCodeToName(cfg.factionCode))

  // Slots (artifact types) — render icons used by the Builder for consistency
  // Why: visual parity with Builder; icons are easier to scan than text here.
  {
    const types = (cfg as unknown as { artifactTypes?: number[] }).artifactTypes
    if (types && types.length > 0) {
      const sorted = [...types].sort(compareArtifactTypes)
      const nodes = sorted.map((t, i) => {
        const Icon = artifactTypeIconFor(t)
        if (Icon) {
          return (
            // Inline icon baseline tends to sit a bit high next to caption text;
            // nudge it down slightly for visual centering in the chip.
            <Box key={`slot-${t}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', mr: 0.5, verticalAlign: '-0.20em' }}>
              <Icon fontSize="inherit" />
            </Box>
          )
        }
        // Fallback to text if icon not found (should not happen)
        return (
          <Box key={`slot-${t}-${i}`} component="span" sx={{ mr: 0.5 }}>{artifactTypeName(t)}</Box>
        )
      })
      addNode(<>{nodes}</>)
    }
  }

  // Main stats (colored if enabled) — follows Slots
  {
    const v = ((cfg as unknown as { mainStatsV?: number[] }).mainStatsV ?? []).slice()
    // Preferred stat ordering used across the app (same as substat chips/table)
    v.sort(compareVariants)
    if (v.length > 0) {
      const nodes = v.map((vk, i) => {
        const name = labelOfVariant(vk)
        const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        return (
          <Box key={`m-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>{name}</Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`m-sep-${i}`} component="span">,</Box>) })
      addNode(<>{interleaved}</>)
    }
  }

  // Substats (colored if enabled)
  {
    const sv = ((cfg as unknown as { substatsV?: number[] }).substatsV ?? []).slice()
    // Sort substats by the same preferred order
    sv.sort(compareVariants)
    const fv = (cfg as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV ?? []
    const bounds = (cfg as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number }> }).substatRollBoundsV as Record<number, { min?: number; max?: number }> | undefined
    if (sv.length > 0) {
      const fixedSet = new Set<number>(fv as number[])
      const nodes = sv.map((vk, i) => {
        const name = labelOfVariant(vk)
        const fg = (opts.substatColors[vk]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? undefined) as string | undefined
        // Integrate per-substat roll bounds into the label: 
        // examples: "SPD >= 5r", "SPD <= 4r", "SPD = 0r". Min/Max are mutually exclusive in the UI.
        const b = bounds ? bounds[vk] : undefined
        let rolls = ''
        if (b) {
          const min = typeof b.min === 'number' ? Math.max(0, Math.min(5, Math.floor(b.min))) : undefined
          const max = typeof b.max === 'number' ? Math.max(0, Math.min(5, Math.floor(b.max))) : undefined
          if (min !== undefined && max !== undefined && min === max) rolls = ` = ${min}r`
          else if (max !== undefined) rolls = ` <= ${max}r`
          else if (min !== undefined) rolls = ` >= ${min}r`
        }
        const label = `${name}${rolls}${fixedSet.has(vk as number) ? '🔒' : ''}`
        return (
          <Box key={`s-${vk}-${i}`} component="span" sx={{ color: opts.useStatButtonColors ? fg : undefined }}>{label}</Box>
        )
      })
      const interleaved: JSX.Element[] = []
      nodes.forEach((n, i) => { interleaved.push(n); if (i < nodes.length - 1) interleaved.push(<Box key={`s-sep-${i}`} component="span">,</Box>) })
      addNode(<><Box component="span">Subs: </Box>{interleaved}</>)
    } else {
      addText('Subs: Any')
    }
  }

  // Required Substats count (show only when > 0)
  if ((cfg.minCount ?? 0) > 0) {
    addText(`Req: ${cfg.minCount}`)
  }

  // Min required rolls (aggregate across selected; show only when > 0)
  if ((cfg.minRequiredRolls ?? 0) > 0) {
    // Compact math-like notation to indicate total roll requirement
    addText(`Σr ≥ ${cfg.minRequiredRolls}`)
  }

  // Sets (cropped at 50 chars), sorted by game order for consistency
  {
    const setIdsSorted = (cfg.artifactSets ?? []).slice().sort((a, b) => Number(a) - Number(b))
    const setNames = setIdsSorted.map(artifactSetName)
    const metaNames = (cfg.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id)
    const setsJoined = [...metaNames, ...setNames].join(', ')
    if (setsJoined) {
      const text = setsJoined.length > 50 ? `${setsJoined.slice(0, 49)}…` : setsJoined
      addText(text)
    }
  }

  if (parts.length === 0) return null
  // Interleave with separators
  const withSeps: JSX.Element[] = []
  parts.forEach((p, i) => { withSeps.push(p); if (i < parts.length - 1) withSeps.push(<Box key={`sep-${i}`} component="span"> | </Box>) })
  return <>{withSeps}</>
}
/**
 * ConfigChip
 *
 * Compact, clickable summary for a single BuilderConfig with context menu
 * actions (duplicate, move, copy, delete). Renders the human-readable summary.
 */
