import React from 'react'
import { Box, Menu, MenuItem, Typography } from '@mui/material'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import { UI_BG_TRANSITION, SCROLLING_TOOLTIP_HIDE_MS } from '../lib/constants'
import ConfigChip from './ConfigChip'
import type { BuilderConfig } from '../lib/hsfBuilder'
import { resolveAutoRarityCode } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'

export default function ConfigChipsPanel(props: {
  containerRef: React.MutableRefObject<HTMLDivElement | null>
  configs: BuilderConfig[]
  selectedIndices: number[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonBorders: boolean
  hoveredIdx: number | null
  onHoverIdx: (idx: number | null) => void
  onSelect: (e: React.MouseEvent, idx: number) => void
  onDelete: (idx: number) => void
  onDuplicate: (idx: number) => void
  onPasteAfter: (idx: number) => void
  onMoveUp: (idx: number) => void
  onMoveDown: (idx: number) => void
  onMoveTop: (idx: number) => void
  onMoveBottom: (idx: number) => void
  highlightDelete: boolean
  onCopyAllConfigs: () => void
  onPasteAtEnd: () => void
  onSelectAll: () => void
  onCopyConfig: (idx: number) => void
  onClearSelection: () => void
}) {
  const {
    containerRef,
    configs,
    selectedIndices,
    metasets,
    substatColors,
    useStatButtonBorders,
    hoveredIdx,
    onHoverIdx,
    onSelect,
    onDelete,
    onDuplicate,
    onPasteAfter,
    onMoveUp,
    onMoveDown,
    onMoveTop,
    onMoveBottom,
    highlightDelete,
    onCopyAllConfigs,
    onPasteAtEnd,
    onSelectAll,
    onCopyConfig,
    onClearSelection,
  } = props

  const [menu, setMenu] = React.useState<null | { open: boolean; x: number; y: number }>(null)
  // While the chips container scrolls, hide tooltips to avoid transient
  // viewport scrollbar flicker. This mirrors the global App behavior but
  // also covers scrollbar-drag interactions that don't emit wheel/touch events.
  const hideTipsTimerRef = React.useRef<ReturnType<typeof window.setTimeout> | null>(null)
  React.useEffect(() => () => { if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null } }, [])
  const markScrolling = () => {
    try {
      document.body.classList.add('scrolling')
      if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null }
      hideTipsTimerRef.current = window.setTimeout(() => {
        try { document.body.classList.remove('scrolling') } catch {}
      }, SCROLLING_TOOLTIP_HIDE_MS)
    } catch {}
  }

  // Duplicate detection (ignoring name): compute the first-seen index for each
  // unique config shape so later identical ones can render with a red border
  // and a tooltip pointing to the original.
  const duplicateOf: Array<number | null> = React.useMemo(() => {
    const seen = new Map<string, number>()
    const out: Array<number | null> = []
    const keyOf = (c: BuilderConfig): string => {
      // Normalize arrays as order-insensitive for stable duplicate detection.
      const sortNum = (arr?: number[]) => (Array.isArray(arr) ? [...arr].map(Number).sort((a,b)=>a-b) : [])
      const sortStr = (arr?: string[]) => (Array.isArray(arr) ? [...arr].map(String).sort() : [])
      const normBounds = (m?: Record<number, { min?: number; max?: number; any?: boolean }>) => {
        const res: Record<string, { min?: number; max?: number; any?: boolean }> = {}
        if (!m) return res
        const keys = Object.keys(m as Record<string, unknown>).map(String).sort((a,b)=>Number(a)-Number(b))
        for (const k of keys) {
          const v = (m as Record<string, { min?: number; max?: number; any?: boolean }>)[k]
          if (!v) continue
          const obj: { min?: number; max?: number; any?: boolean } = {}
          if (typeof v.min === 'number') obj.min = v.min
          if (typeof v.max === 'number') obj.max = v.max
          if (typeof v.any === 'boolean') obj.any = v.any
          res[k] = obj
        }
        return res
      }
      const rarityMode = ((c as unknown as { rarityMode?: 'auto'|'code' }).rarityMode ?? 'code')
      const effectiveRarity = rarityMode === 'auto'
        ? resolveAutoRarityCode(c)
        : Number((c as unknown as { rarityCode?: number }).rarityCode ?? 0)
      const snap = {
        // ignore name
        keep: Boolean(c.keep),
        enabled: (c as unknown as { enabled?: boolean }).enabled !== false,
        rankCode: Number(c.rankCode),
        // Incorporate effective rarity for Auto so configs that resolve to
        // different rarity floors are not treated as duplicates.
        rarityCode: Number(effectiveRarity),
        rarityMode,
        factionCode: Number((c as unknown as { factionCode?: number }).factionCode ?? 0),
        mainStatsV: sortNum((c as unknown as { mainStatsV?: number[] }).mainStatsV),
        minLevel: (c as unknown as { minLevel?: 0|4|8|12|16 }).minLevel ?? 0,
        maxLevel: (c as unknown as { maxLevel?: 0|4|8|12|16 }).maxLevel ?? 16,
        earlyKeepMode: ((c as unknown as { earlyKeepMode?: 'early'|'late' }).earlyKeepMode ?? 'early'),
        startLevel: ((c as unknown as { startLevel?: 0|4|8|12|16|'any' }).startLevel ?? 0),
        rollBaseline: ((c as unknown as { rollBaseline?: 'afterStart'|'upToLevel' }).rollBaseline ?? 'afterStart'),
        rollMode: ((c as unknown as { rollMode?: 'off'|'strict'|'potential'|'auto' }).rollMode ?? 'auto'),
        substatsV: sortNum((c as unknown as { substatsV?: number[] }).substatsV),
        fixedSubstatsV: sortNum((c as unknown as { fixedSubstatsV?: number[] }).fixedSubstatsV),
        minCount: Number(c.minCount ?? 0),
        autoMinCount: Boolean(c.autoMinCount),
        minRequiredRolls: Number((c as unknown as { minRequiredRolls?: number }).minRequiredRolls ?? 0),
        autoMinRequiredRolls: Boolean((c as unknown as { autoMinRequiredRolls?: boolean }).autoMinRequiredRolls ?? true),
        substatRollBoundsV: normBounds((c as unknown as { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> }).substatRollBoundsV),
        artifactTypes: sortNum((c as unknown as { artifactTypes?: number[] }).artifactTypes),
        artifactSets: sortNum((c as unknown as { artifactSets?: number[] }).artifactSets),
        artifactMetaSets: sortStr((c as unknown as { artifactMetaSets?: string[] }).artifactMetaSets),
        substatMinTarget: ((c as unknown as { substatMinTarget?: 'locked'|'selected' }).substatMinTarget ?? 'selected'),
      }
      try { return JSON.stringify(snap) } catch { return String(Math.random()) }
    }
    configs.forEach((c, i) => {
      const k = keyOf(c)
      const prev = seen.get(k)
      if (prev === undefined) { seen.set(k, i); out.push(null) } else { out.push(prev) }
    })
    return out
  }, [configs])

  return (
    <>
      <Box
        ref={containerRef}
        sx={(theme) => ({
          mt: 2,
          display: 'flex',
          gap: 1,
          flexWrap: 'wrap',
          maxHeight: 220,
          overflowY: 'auto',
          overflowX: 'hidden',
          pr: 1,
          minHeight: 40,
          alignContent: configs.length === 0 ? 'center' : 'flex-start',
          position: 'relative',
          transition: UI_BG_TRANSITION,
          backgroundColor: highlightDelete
            ? (theme.palette.mode === 'dark' ? 'rgba(244,67,54,0.08)' : 'rgba(244,67,54,0.04)')
            : 'transparent',
        })}
        onScroll={markScrolling}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ open: true, x: e.clientX, y: e.clientY })
        }}
        onClick={(e) => {
          // Left click on empty area (not on a chip) clears selection
          // Ignore when user is holding multiselect modifiers.
          if (e.button !== 0) return
          if (e.shiftKey || e.ctrlKey || (e as unknown as MouseEvent).metaKey) return
          if (e.currentTarget === e.target) onClearSelection()
        }}
        data-tour-id="chips.container"
      >
        {configs.length === 0 ? (
          <Box sx={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="caption">No configs yet — right-click to Paste</Typography>
          </Box>
        ) : (
          configs.map((c, idx) => (
            <ConfigChip
              key={idx}
              index={idx}
              cfg={c}
              metasets={metasets}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonBorders}
              selected={selectedIndices.includes(idx)}
              isDuplicate={duplicateOf[idx] !== null}
              {...(duplicateOf[idx] !== null ? { duplicateOfIndex: duplicateOf[idx] as number } : {})}
              onSelect={(e) => onSelect(e, idx)}
              onDelete={() => onDelete(idx)}
              onDuplicate={() => onDuplicate(idx)}
              onPasteAfter={() => onPasteAfter(idx)}
              onCopy={() => onCopyConfig(idx)}
              onMoveUp={() => onMoveUp(idx)}
              onMoveDown={() => onMoveDown(idx)}
              onMoveTop={() => onMoveTop(idx)}
              onMoveBottom={() => onMoveBottom(idx)}
              isLast={idx === configs.length - 1}
              linkedHover={hoveredIdx !== null && hoveredIdx === idx}
              onHover={(enter) => onHoverIdx(enter ? idx : null)}
            />
          ))
        )}
      </Box>
      <Menu
        open={Boolean(menu?.open)}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        {...(menu?.open ? { anchorPosition: { top: menu.y, left: menu.x } } : {})}
        slotProps={{ paper: { 'data-tour-id': 'chips.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem onClick={() => { onSelectAll(); setMenu(null) }} disabled={configs.length === 0}>Select All</MenuItem>
        <MenuItem onClick={() => { onCopyAllConfigs(); setMenu(null) }} disabled={configs.length === 0}>Copy all Configs</MenuItem>
        <MenuItem onClick={() => { onPasteAtEnd(); setMenu(null) }}>Paste at End</MenuItem>
      </Menu>
    </>
  )
}
