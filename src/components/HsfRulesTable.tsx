import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Divider, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tooltip } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import type { HsfRule } from '../lib/hsfTypes'
import { compareHsfSubstats, formatArtifactSets, formatArtifactTypes, formatLevel, formatRank, labelOfVariant, mainToVariant, rarityCodeToName, statIsAny, statNameFromId, StatId, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT, subToVariant, factionCodeToName, artifactSetName, compareArtifactTypes, artifactTypeName } from '../lib/types'
import { NBSP } from '../lib/constants'
import EllipsisTooltip from './EllipsisTooltip'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX, RULES_TABLE_SHOW_SET_ICONS_KEY, RULES_TABLE_SHOW_SLOT_ICONS_KEY, RULES_TABLE_OVERSCAN_FAST, RULES_TABLE_OVERSCAN_IDLE } from '../lib/constants'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon, SET_ICON_PX } from './SetIcon'

export function HsfRulesTable({ rules, hoveredCfgIdx, setHoveredCfgIdx, selectedCfgIdx, multiselectActive, onSelectCfgIdx, onConfigAction, onClearBase, substatColors, statButtonBorders, onToggleStatButtonBorders, colorBlindMode, onChangeColorBlindMode, emptyDueToFilter = false }: {
  rules: HsfRule[]
  hoveredCfgIdx: number | null
  setHoveredCfgIdx: (idx: number | null) => void
  selectedCfgIdx: number | null
  multiselectActive: boolean
  onSelectCfgIdx: (idx: number) => void
  onConfigAction: (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => void
  onClearBase: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  statButtonBorders: boolean
  onToggleStatButtonBorders: (next: boolean) => void
  colorBlindMode: 'normal' | 'okabeIto' | 'tritan'
  onChangeColorBlindMode: (mode: 'normal' | 'okabeIto' | 'tritan') => void
  emptyDueToFilter?: boolean
}) {
  // Virtualization state and helpers
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  // Sticky header height used to offset scroll targets for better alignment.
  // Why: In wrap (multi-line) mode, row heights are measured lazily. Using a
  // measured header height (instead of a magic number) improves accuracy when
  // re-scrolling to converge on the target row after measurements settle.
  const headerHeightRef = useRef<number>(0)
  const [containerW, setContainerW] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const viewportHRef = useRef(0)
  const [scrollTop, setScrollTop] = useState(0)
  // Track fast scrolling to adjust overscan dynamically.
  const lastScrollTopRef = useRef(0)
  const rafPendingRef = useRef(false)
  const [fastScroll, setFastScroll] = useState(false)
  const fastResetTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const rowHeightsRef = useRef<number[]>([])
  const prefixHeightsRef = useRef<number[]>([])
  const totalHeightRef = useRef<number>(0)
  // Version to trigger prefix recompute and a stable re-render when row heights change.
  const [heightsVersion, setHeightsVersion] = useState(0)
  // No custom scrolling animations: in multi-line we jump; in single-line we use native smooth.
  const WRAP_ROWS_KEY = 'sellfileCreator.rulesTableWrapRows.v1'
  const [wrapRows, setWrapRows] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(WRAP_ROWS_KEY)
      if (raw === 'true') return true
      if (raw === 'false') return false
    } catch {}
    return false
  })
  useEffect(() => {
    try { localStorage.setItem(WRAP_ROWS_KEY, String(wrapRows)) } catch {}
  }, [wrapRows])

  // Gate hover highlighting to the table area only
  const [isHoveringArea, setIsHoveringArea] = useState(false)

  // Display options: show slot icons and set icons
  const [showSlotIcons, setShowSlotIcons] = useState<boolean>(() => {
    try { return localStorage.getItem(RULES_TABLE_SHOW_SLOT_ICONS_KEY) !== 'false' } catch { return true }
  })
  useEffect(() => { try { localStorage.setItem(RULES_TABLE_SHOW_SLOT_ICONS_KEY, String(showSlotIcons)) } catch {} }, [showSlotIcons])
  const [showSetIcons, setShowSetIcons] = useState<boolean>(() => {
    try { return localStorage.getItem(RULES_TABLE_SHOW_SET_ICONS_KEY) !== 'false' } catch { return true }
  })
  useEffect(() => { try { localStorage.setItem(RULES_TABLE_SHOW_SET_ICONS_KEY, String(showSetIcons)) } catch {} }, [showSetIcons])

  // Context menus
  const [headerMenu, setHeaderMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  const [rowMenu, setRowMenu] = useState<null | { open: boolean; x: number; y: number; cfgIdx: number | null }>(null)
  useEffect(() => {
    const hasOpen = Boolean(headerMenu?.open || rowMenu?.open)
    if (!hasOpen) return
    const handler = (e: MouseEvent) => { e.preventDefault() }
    window.addEventListener('contextmenu', handler)
    return () => { window.removeEventListener('contextmenu', handler) }
  }, [headerMenu?.open, rowMenu?.open])

  // Header drag-to-reorder support
  const dragSrcIdxRef = useRef<number | null>(null)
  const onHeaderDragStart = (srcIdx: number) => { dragSrcIdxRef.current = srcIdx }
  const onHeaderDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const onHeaderDrop = (dstIdx: number) => {
    const srcIdx = dragSrcIdxRef.current
    dragSrcIdxRef.current = null
    if (srcIdx === null || srcIdx === dstIdx) return
    setCols(prev => {
      const arr = [...prev]
      const [moved] = arr.splice(srcIdx, 1)
      if (!moved) return prev
      arr.splice(dstIdx, 0, moved)
      return arr
    })
  }

  // Column resize support
  const resizeRef = useRef<{ idx: number; startX: number; startW: number } | null>(null)
  const startResize = (idx: number, clientX: number) => {
    const base = cols[idx]
    if (!base) return
    resizeRef.current = { idx, startX: clientX, startW: Number(base.width) || 40 }
    const onMove = (ev: MouseEvent) => {
      const st = resizeRef.current
      if (!st) return
      const dx = ev.clientX - st.startX
      const nextW = Math.max(40, st.startW + dx)
      setCols(prev => prev.map((c, i) => (i === st.idx ? { ...c, width: Math.floor(nextW) } : c)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      resizeRef.current = null
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Smooth scroll a given rule index into view within the table container
  const scrollRuleIndexIntoView = (ruleIndex: number, behavior: ScrollBehavior = 'smooth') => {
    const container = tableContainerRef.current
    if (!container || ruleIndex < 0 || ruleIndex >= rules.length) return
    let targetTop = 0
    if (!wrapRows) {
      targetTop = ruleIndex * fixedRowH
    } else {
      const pref = prefixHeightsRef.current
      // prefixHeightsRef holds prefix sums; fall back to fixed heights if unknown
      targetTop = pref[ruleIndex] ?? (ruleIndex * fixedRowH)
    }
    // Account for sticky header height for better alignment in the scroll container
    const headerNudge = Math.max(0, headerHeightRef.current || 0)
    const top = Math.max(0, targetTop - headerNudge)
    try { container.scrollTo({ top, behavior }) } catch { try { container.scrollTop = top } catch {} }
  }

  // When selection changes (e.g., user clicked a chip), scroll first matching rule into view
  const suppressNextScrollRef = useRef<boolean>(false)
  // Retry-based scroll alignment for wrap (multi-line) mode.
  // Why: Row heights are measured lazily; initial prefix sums assume fixed heights.
  // Re-attempting the scroll after measurements settle reliably lands on the exact row.
  const pendingScrollRef = useRef<{ index: number; attempts: number } | null>(null)
  const attemptScrollAlign = React.useCallback(() => {
    const pending = pendingScrollRef.current
    if (!pending) return
    const { index } = pending
    const container = tableContainerRef.current
    if (!container || index < 0 || index >= rules.length) { pendingScrollRef.current = null; return }
    const rowEl = container.querySelector(`[data-row-index="${index}"]`) as HTMLTableRowElement | null
    if (rowEl) {
      // The row is mounted: align precisely using element geometry.
      const cRect = container.getBoundingClientRect()
      const rRect = rowEl.getBoundingClientRect()
      const delta = rRect.top - cRect.top
      const header = Math.max(0, headerHeightRef.current || 0)
      const nextTop = Math.max(0, container.scrollTop + delta - header)
      // Final correction: use jump in wrap mode; smooth is reserved for single-line mode only.
      try { container.scrollTo({ top: nextTop, behavior: wrapRows ? 'auto' : 'smooth' }) } catch { try { container.scrollTop = nextTop } catch {} }
      pendingScrollRef.current = null
      return
    }
    // Row not yet mounted in the virtual window: nudge towards estimated offset.
    scrollRuleIndexIntoView(index, 'auto')
    // Decrement and schedule another attempt next frame if budget remains.
    pending.attempts -= 1
    if (pending.attempts <= 0) { pendingScrollRef.current = null; return }
    // Use rAF to avoid starving layout/paint; converge quickly without jank.
    requestAnimationFrame(() => attemptScrollAlign())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, wrapRows])
  useEffect(() => {
    if (selectedCfgIdx === null || selectedCfgIdx === undefined) return
    if (multiselectActive) return
    // If selection came from a table row click, skip this one automatic scroll
    if (suppressNextScrollRef.current) { suppressNextScrollRef.current = false; return }
    const idx = rules.findIndex((r) => (r as HsfRule & { __cfgIdx?: number }).__cfgIdx === selectedCfgIdx)
    if (idx >= 0) {
      // Kick off an initial scroll and schedule retries to converge in wrap mode.
      pendingScrollRef.current = { index: idx, attempts: wrapRows ? 8 : 1 }
      // Single-line: smooth; Multi-line: jump
      scrollRuleIndexIntoView(idx, wrapRows ? 'auto' : 'smooth')
      // Fast-follow attempt to catch the row once it mounts.
      requestAnimationFrame(() => attemptScrollAlign())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCfgIdx, rules, wrapRows, multiselectActive])

  useEffect(() => {
    const n = rules.length
    if (rowHeightsRef.current.length !== n) {
      const fixed = 30
      rowHeightsRef.current = Array.from({ length: n }, () => fixed)
    }
    const pref: number[] = new Array(n)
    let acc = 0
    for (let i = 0; i < n; i++) { pref[i] = acc; acc += rowHeightsRef.current[i] || 28 }
    prefixHeightsRef.current = pref
    totalHeightRef.current = acc
  }, [heightsVersion, rules.length])

  // Update a measured row height in wrap mode; only bump when the value changes
  // enough to matter to layout to prevent oscillations from sub-pixel rounding.
  const updateRowHeight = (rowIndex: number, measured: number) => {
    if (!wrapRows) return
    if (!Number.isFinite(measured) || measured <= 0) return
    const prev = rowHeightsRef.current[rowIndex]
    // Guard: only update when there is a real change (>= 1px) to avoid flicker.
    if (prev && Math.abs(prev - measured) < 1) return
    rowHeightsRef.current[rowIndex] = Math.floor(measured)
    // Trigger recompute of prefix sums and a re-render of the visible window math.
    setHeightsVersion(v => v + 1)
  }

  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const onScroll = () => {
      const next = el.scrollTop
      const prev = lastScrollTopRef.current
      lastScrollTopRef.current = next
      // Coalesce updates to once per animation frame
      if (!rafPendingRef.current) {
        rafPendingRef.current = true
        requestAnimationFrame(() => {
          rafPendingRef.current = false
          setScrollTop(lastScrollTopRef.current)
        })
      }
      // Heuristic: mark as fast scroll on large deltas relative to row height or viewport
      const delta = Math.abs(next - prev)
      const threshold = Math.max(2 * (fixedRowHRef.current || 30), (viewportHRef.current || 0) * 0.5)
      const isFast = delta > threshold
      if (isFast) {
        setFastScroll(true)
        if (fastResetTimerRef.current) { clearTimeout(fastResetTimerRef.current); fastResetTimerRef.current = null }
        fastResetTimerRef.current = window.setTimeout(() => { setFastScroll(false); fastResetTimerRef.current = null }, 120)
      }
    }
    const measure = () => {
      setViewportH(el.clientHeight)
      viewportHRef.current = el.clientHeight
      setContainerW(el.clientWidth)
      // Refresh sticky header height for accurate scroll offsets
      try { headerHeightRef.current = (el.querySelector('thead') as HTMLElement | null)?.offsetHeight || 0 } catch { headerHeightRef.current = 0 }
    }
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', measure)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
      if (fastResetTimerRef.current) { clearTimeout(fastResetTimerRef.current); fastResetTimerRef.current = null }
    }
  }, [])

  // When row heights are recomputed (wrap mode), re-attempt alignment if a scroll is pending.
  useEffect(() => {
    if (!wrapRows) return
    if (pendingScrollRef.current) attemptScrollAlign()
  }, [heightsVersion, wrapRows, attemptScrollAlign])

  const summarizeSubstats = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(compareHsfSubstats)
    const cond = (c?: string) => c === '>=' ? '≥' : c === '<=' ? '≤' : (c ?? '')
    return nonAny?.map((x) => `${ x.Condition === '¬' ? x.Condition : '' }${ statNameFromId(x.ID, x.IsFlat) } ${ (!x.Condition || x.Condition === '¬') ? '' : cond(x.Condition) } ${ (x.Condition === '>=' || x.Condition === '<=') ? x.Value : '' }`.trim()).join(' ∧ ')
  }

  const renderSubstatsInline = (s: HsfRule['Substats']) => {
    const nonAny = s?.filter(Boolean)?.filter(x => !statIsAny(x.ID)).sort(compareHsfSubstats)
    const cond = (c?: string) => c === '>=' ? '·' : c === '<=' ? '≤' : (c ?? '')
    // variant-level fallbacks are used below; keep id-level for ultimate fallback
    const knownIds = new Set<number>([
      StatId.HP,
      StatId.ATK,
      StatId.DEF,
      StatId.SPD,
      StatId.RES,
      StatId.ACC,
      StatId.CR,
      StatId.CDMG,
    ])
    if (!nonAny || nonAny.length === 0) return null
    return (
      <Box sx={{ display: 'inline-flex', gap: 0.25, alignItems: 'center', verticalAlign: 'middle', flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%' }}>
        {nonAny.map((x, idx) => {
          const neg = x.Condition === '¬'
          const op = (!x.Condition || neg) ? '' : cond(x.Condition)
          const val = (x.Condition === '>=' || x.Condition === '<=') ? String(x.Value) : ''
          const name = statNameFromId(x.ID, x.IsFlat)
          const label = `${neg ? '¬' : ''}${name}${op}${val}`
          const variantKey = subToVariant(x.ID, x.IsFlat)
          const isKnown = knownIds.has(x.ID)
          if (isKnown) {
            const fg: string = (substatColors[variantKey]?.fg
              ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variantKey]
              ?? '#90CAF9') as string
            const bg: string = (substatColors[variantKey]?.bg
              ?? DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[variantKey]
              ?? '#E3F2FD') as string
            return (
              <Chip
                key={`${x.ID}:${x.IsFlat ? 1 : 0}:${x.Condition ?? ''}:${x.Value ?? ''}:${idx}`}
                size="small"
                label={label}
                variant="outlined"
                sx={{
                  fontSize: 12,
                  height: 18,
                  borderColor: fg,
                  color: fg,
                  bgcolor: bg,
                  '& .MuiChip-label': { px: 0.75, py: 0, fontSize: 12, lineHeight: 1.15 },
                }}
              />
            )
          }
          // Fallback for non-standard/unknown substats (e.g., Roll Count or unknown IDs):
          // Use neutral styling matching table text (not part of the color dialog).
          return (
            <Chip
              key={`${x.ID}:${x.IsFlat ? 1 : 0}:${x.Condition ?? ''}:${x.Value ?? ''}:${idx}`}
              size="small"
              label={label}
              variant="outlined"
              sx={{
                fontSize: 12,
                height: 18,
                borderColor: 'text.secondary',
                color: 'inherit',
                bgcolor: 'transparent',
                '& .MuiChip-label': { px: 0.75, py: 0, fontSize: 12, lineHeight: 1.15 },
              }}
            />
          )
        })}
      </Box>
    )
  }


  type ColKey = keyof HsfRule | 'Idx' | 'CfgIdx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'MainStatName' | 'LevelLabel' | 'RankRarity'
  type ColMode = 'auto' | 'show' | 'hide'
  type ColCfg = { key: ColKey; label: string; width: number; visible: boolean; mode?: ColMode }
  const defaultCols: ColCfg[] = [
    { key: 'Idx', label: 'Idx', width: 72, visible: true },
    { key: 'CfgIdx', label: 'Cfg', width: 64, visible: true },
    { key: 'Keep', label: 'Keep', width: 64, visible: false },
    { key: 'Use', label: 'Use', width: 56, visible: false },
    { key: 'ArtifactSetNames', label: 'Sets', width: 170, visible: true },
    { key: 'ArtifactTypeNames', label: 'Slot', width: 100, visible: true },
    { key: 'RankRarity', label: 'Rank/Rarity', width: 160, visible: true },
    { key: 'MainStatName', label: 'Main', width: 75, visible: true },
    { key: 'LevelLabel', label: 'Level', width: 75, visible: true },
    { key: 'Faction', label: 'Faction', width: 70, visible: false, mode: 'auto' },
    { key: 'SubstatsSummary', label: 'Sub', width: 282, visible: true },
  ]
  const STORAGE_KEY = 'sellfileCreator.rulesTableCols.v2'
  const [cols, setCols] = useState<ColCfg[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return defaultCols
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return defaultCols
      const map = new Map<string, ColCfg>()
      for (const d of defaultCols) map.set(String(d.key), d)
      const restored: ColCfg[] = []
      for (const c of (parsed as Array<Record<string, unknown>>)) {
        const key = c.key as ColKey | undefined
        const base = key ? map.get(String(key)) : undefined
        if (base) {
          const width = Number(c.width ?? base.width) || base.width
          const visible = Boolean(c.visible ?? base.visible)
          const modeMaybe = (c.mode as ColMode | undefined) ?? base.mode
          const next: ColCfg = { ...base, width, visible, ...(modeMaybe !== undefined ? { mode: modeMaybe as ColMode } : {}) }
          restored.push(next)
        }
      }
      for (const d of defaultCols) if (!restored.find(x => x.key === d.key)) restored.push(d)
      // Ensure Rank/Rarity appears before Mainstat in case of legacy layouts
      const idxRR = restored.findIndex(c => c.key === 'RankRarity')
      const idxMain = restored.findIndex(c => c.key === 'MainStatName')
      if (idxRR !== -1 && idxMain !== -1 && idxRR > idxMain) {
        const rr = restored.splice(idxRR, 1)[0]!
        restored.splice(idxMain, 0, rr)
      }
      return restored
    } catch { return defaultCols }
  })
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cols)) } catch {} }, [cols])
  // Show the Faction column automatically when any rule (from HSFR or loaded HSF)
  // has a non-zero faction filter. Previously this only reacted to HSFR-built rows
  // (those carrying __cfgIdx), which hid the column for loaded HSF files.
  const anyWithFaction = useMemo(() => rules.some((r) => r && typeof r.Faction === 'number' && (r.Faction as number) !== 0), [rules])
  const isColVisible = React.useCallback((c: ColCfg) => {
    if (c.key === 'Faction') {
      const m = c.mode ?? 'auto'
      if (m === 'show') return true
      if (m === 'hide') return false
      return anyWithFaction
    }
    return c.visible
  }, [anyWithFaction])

  // Measured row height to match actual rendered size (accounts for borders/fonts)
  const [fixedRowH, setFixedRowH] = useState(30)
  const fixedRowHRef = useRef(30)
  useEffect(() => { fixedRowHRef.current = fixedRowH }, [fixedRowH])

  // Compute whether horizontal scroll is needed to avoid column width jitter
  const visibleColsForContainer = cols.filter(c => isColVisible(c))
  const totalVisibleWidth = visibleColsForContainer.reduce((sum, c) => sum + (c.width || 0), 0)
  // Add small hysteresis to avoid rapid flip-flopping when widths are near the container boundary.
  // This stabilizes layout (and the visible range math) to reduce the X–Y indicator flicker.
  const [needHScroll, setNeedHScroll] = useState(false)
  useEffect(() => {
    if (containerW <= 0) { setNeedHScroll(false); return }
    const ON_MARGIN = 8   // require a bit of extra overflow to turn on
    const OFF_MARGIN = 8  // require a bit of extra slack to turn off
    setNeedHScroll(prev => {
      if (!prev) {
        return totalVisibleWidth > (containerW + ON_MARGIN)
      }
      return !(totalVisibleWidth < (containerW - OFF_MARGIN))
    })
  }, [totalVisibleWidth, containerW])

  return (
    <Box
      onMouseEnter={() => setIsHoveringArea(true)}
      onMouseLeave={() => { setIsHoveringArea(false); setHoveredCfgIdx(null) }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}
    >
      <TableContainer
        ref={tableContainerRef}
        sx={{
          width: '100%',
          overflowY: 'auto',
          overflowX: needHScroll ? 'auto' : 'hidden',
          // Prevent scroll chaining to the page and stabilize scrollbar space
          overscrollBehaviorY: 'contain',
          overscrollBehaviorX: 'contain',
          scrollbarGutter: 'stable both-edges',
          // Isolate layout/paint of the scroller to avoid causing app-level scrollbars during rapid scroll
          contain: 'layout paint',
          maxHeight: 960,
          '@media (min-width:2320px)': {
            flex: 1,
            minHeight: 0,
            maxHeight: '100%',
            height: '100%',
          },
        }}
        data-tour-id="preview.table"
      >
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHead onContextMenu={(e) => { e.preventDefault(); setHeaderMenu({ open: true, x: e.clientX, y: e.clientY }) }}>
            <TableRow>
              {cols.filter(c => isColVisible(c)).map((c) => {
                const realIdx = cols.findIndex(x => x.key === c.key)
                return (
                  <TableCell
                    key={String(c.key)}
                    draggable
                    onDragStart={() => onHeaderDragStart(realIdx)}
                    onDragOver={onHeaderDragOver}
                    onDrop={() => onHeaderDrop(realIdx)}
                    sx={{ width: c.width, fontWeight: 600, fontSize: 13, userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    <Tooltip title={`${c.label} — drag to reorder; drag handle at right edge to resize; right-click for options`}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <span>{c.label}</span>
                      </Box>
                    </Tooltip>
                    <Box onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); startResize(realIdx, e.clientX) }} sx={{ position: 'absolute', right: 0, top: 0, height: '100%', width: 6, cursor: 'col-resize', zIndex: 2 }} />
                  </TableCell>
                )
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {(() => {
              const visibleCols = cols.filter(c => isColVisible(c))
              const colSpan = Math.max(1, visibleCols.length)
              // Smaller overscan during fast scroll to reduce render cost; increase when idle
              const overscan = fastScroll ? RULES_TABLE_OVERSCAN_FAST : RULES_TABLE_OVERSCAN_IDLE
              // When there are no rules, render a single placeholder row to communicate state.
              if (rules.length === 0) {
                return (
                  <TableRow>
                    <TableCell colSpan={colSpan} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                      {emptyDueToFilter ? 'No RSL Helper Sellfile rules due to the filter.' : 'No RSL Helper Sellfile rule yet.'}
                    </TableCell>
                  </TableRow>
                )
              }
              let start = 0, end = rules.length, padTop = 0, padBottom = 0
              if (rules.length > 200) {
                if (!wrapRows) {
                  start = Math.max(0, Math.floor(scrollTop / fixedRowH) - overscan)
                  // Use floor to avoid +/-1 oscillations when viewport height is near a row multiple
                  const visibleCount = Math.max(0, Math.floor((viewportH || 0) / fixedRowH)) + overscan * 2
                  end = Math.min(rules.length, start + visibleCount)
                  padTop = start * fixedRowH
                  padBottom = (rules.length - end) * fixedRowH
                } else {
                  const pref = prefixHeightsRef.current
                  const total = totalHeightRef.current
                  const viewBot = Math.min(total, scrollTop + (viewportH || 1))
                  // Binary search helpers over row top offsets (prefix sums):
                  // - upperBound: first index with top > x. The visible row at x is upperBound(x) - 1.
                  const upperBound = (arr: number[], x: number) => {
                    let lo = 0, hi = arr.length - 1, ans = arr.length
                    while (lo <= hi) {
                      const mid = (lo + hi) >>> 1
                      const v = arr[mid] ?? Number.POSITIVE_INFINITY
                      if (v > x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 }
                    }
                    return ans
                  }
                  const firstVisible = Math.max(0, upperBound(pref, scrollTop) - 1)
                  const lastVisibleExclusive = upperBound(pref, viewBot)
                  start = Math.max(0, firstVisible - overscan)
                  end = Math.min(rules.length, lastVisibleExclusive + overscan)
                  padTop = pref[start] || 0
                  const endOffset = pref[end] || total
                  padBottom = Math.max(0, total - endOffset)
                }
              }
              const rows = rules.slice(start, end)
              const baseIndex = start
              const spacerSx = { p: 0, border: 0, height: 0 }
              return (
                <>
                  {padTop > 0 && (
                    <TableRow key="spacer-top" sx={{ height: padTop }}>
                      <TableCell colSpan={colSpan} sx={spacerSx} />
                    </TableRow>
                  )}
                  {rows.map((r, i) => {
                    const idx = baseIndex + i
              const cfgIdx = (r as HsfRule & { __cfgIdx?: number }).__cfgIdx
              const isSelectedCfg = (selectedCfgIdx !== null && cfgIdx === selectedCfgIdx)
                    const isHoverCfg = (isHoveringArea && hoveredCfgIdx !== null && cfgIdx === hoveredCfgIdx)
                    return (
                <TableRow
                  key={idx}
                  hover
                  selected={isHoverCfg}
                  data-row-index={idx}
                  ref={(el) => {
                    if (!el) return
                    if (!wrapRows) {
                      if (i === 0) {
                        const h = el.offsetHeight
                        if (h && Math.abs(h - fixedRowH) >= 1) setFixedRowH(h)
                      }
                    } else {
                      // Measure per-row actual height for variable-height virtualization.
                      updateRowHeight(idx, el.offsetHeight)
                    }
                  }}
                  onMouseEnter={() => { if (isHoveringArea) setHoveredCfgIdx(cfgIdx ?? null) }}
                  onMouseLeave={() => setHoveredCfgIdx(null)}
                  onClick={() => {
                    if (cfgIdx !== undefined && cfgIdx !== null) {
                      // Mark that selection originated from table row; suppress auto-scroll once
                      suppressNextScrollRef.current = true
                      onSelectCfgIdx(cfgIdx as number)
                    }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); setRowMenu({ open: true, x: e.clientX, y: e.clientY, cfgIdx: cfgIdx ?? null }) }}
                  sx={(theme) => ({
                    backgroundColor: isSelectedCfg ? theme.palette.action.hover : undefined,
                    height: !wrapRows ? fixedRowH : undefined,
                    textDecoration: (r as HsfRule).Use === false ? 'line-through' : 'none',
                  })}
                >
                      {visibleCols.map((c) => {
                        let value: string = ''
                        if (c.key === 'SubstatsSummary') value = summarizeSubstats(r.Substats) || ''
                        else if (c.key === 'CfgIdx') value = (cfgIdx !== undefined && cfgIdx !== null) ? String((cfgIdx as number) + 1) : ''
                        else if (c.key === 'Keep') value = r.Keep ? 'Keep' : 'Sell'
                        else if (c.key === 'Use') value = r.Use ? '✓' : '-'
                    else if (c.key === 'ArtifactTypeNames') value = formatArtifactTypes(r.ArtifactType)
                    else if (c.key === 'ArtifactSetNames') {
                      const allKnown = Boolean((r as HsfRule & { __allKnownSets?: boolean }).__allKnownSets)
                      value = allKnown ? 'All Currently Known' : formatArtifactSets(r.ArtifactSet)
                    }
                    else if (c.key === 'RankRarity') {
                      const rank = formatRank(r.Rank)
                      const rarity = rarityCodeToName(r.Rarity)
                      value = [rank, rarity].filter(Boolean).join(NBSP)
                    }
                    else if (c.key === 'Faction') value = factionCodeToName(r.Faction)
                    else if (c.key === 'MainStatName') value = labelOfVariant(mainToVariant(r.MainStatID, r.MainStatF))
                    else if (c.key === 'LevelLabel') value = formatLevel(r.LVLForCheck)
                        else if (c.key === 'Idx') value = String(idx + 1)
                    else value = ''
                        const isSub = c.key === 'SubstatsSummary'
                        const isIdx = c.key === 'Idx'
                        const keep = Boolean(r.Keep)
                        const strike = (r as HsfRule).Use === false
                        let content: React.ReactNode = isSub ? renderSubstatsInline(r.Substats) : (value || '')
                        // Replace textual slots with icons when enabled
                        if (c.key === 'ArtifactTypeNames' && showSlotIcons) {
                          const types = (r.ArtifactType || []).slice().sort(compareArtifactTypes)
                          content = (
                            <Tooltip title={formatArtifactTypes(r.ArtifactType)}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%', overflow: wrapRows ? 'visible' : 'hidden', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                                {(() => {
                                  if (wrapRows) {
                                    return types.map((t, i) => {
                                      const Icon = artifactTypeIconFor(t)
                                      return Icon ? (
                                        <Box key={`slot-${t}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                                          <Icon fontSize="inherit" />
                                        </Box>
                                      ) : (
                                        <Box key={`slot-${t}-${i}`} component="span" sx={{ mr: 0.5 }}>{artifactTypeName(t)}</Box>
                                      )
                                    })
                                  }
                                  // Single-line mode: render only icons that fit, reserve space for an ellipsis if truncated
                                  const PAD_X = 12
                                  const GAP_PX = 4
                                  const SLOT_ICON_PX = 16
                                  const unit = SLOT_ICON_PX + GAP_PX
                                  const avail = Math.max(0, (c.width || 0) - PAD_X)
                                  const capacity = Math.max(0, Math.floor(avail / unit))
                                  const needsEllipsis = types.length > capacity
                                  const visibleCount = needsEllipsis ? Math.max(0, capacity - 1) : Math.min(types.length, capacity)
                                  const vis = types.slice(0, visibleCount)
                                  const overflow = Math.max(0, types.length - visibleCount)
                                  return (
                                    <>
                                      {vis.map((t, i) => {
                                        const Icon = artifactTypeIconFor(t)
                                        return Icon ? (
                                          <Box key={`slot-${t}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                                            <Icon fontSize="inherit" />
                                          </Box>
                                        ) : (
                                          <Box key={`slot-${t}-${i}`} component="span" sx={{ mr: 0.5 }}>{artifactTypeName(t)}</Box>
                                        )
                                      })}
                                      {overflow > 0 ? <Box component="span" sx={{ ml: 0.25 }}>…</Box> : null}
                                    </>
                                  )
                                })()}
                              </Box>
                            </Tooltip>
                          )
                        }
                        // Replace textual set names with icons when enabled (except for the "All Currently Known" shorthand)
                        if (c.key === 'ArtifactSetNames' && showSetIcons) {
                          const allKnown = Boolean((r as HsfRule & { __allKnownSets?: boolean }).__allKnownSets)
                          if (!allKnown) {
                            const names = (r.ArtifactSet || []).map(artifactSetName)
                            content = (
                              <Tooltip title={formatArtifactSets(r.ArtifactSet)}>
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%', overflow: wrapRows ? 'visible' : 'hidden', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                                  {(() => {
                                    if (wrapRows) return names.map((n, i) => <SetIcon key={`${n}-${i}`} name={n} sx={{ mr: 0 }} />)
                                    const PAD_X = 12
                                    const GAP_PX = 2
                                    const unit = SET_ICON_PX + GAP_PX
                                    const avail = Math.max(0, (c.width || 0) - PAD_X)
                                    const capacity = Math.max(0, Math.floor(avail / unit))
                                    const needsEllipsis = names.length > capacity
                                    const visibleCount = needsEllipsis ? Math.max(0, capacity - 1) : Math.min(names.length, capacity)
                                    const vis = names.slice(0, visibleCount)
                                    const overflow = Math.max(0, names.length - visibleCount)
                                    return (
                                      <>
                                        {vis.map((n, i) => <SetIcon key={`${n}-${i}`} name={n} sx={{ mr: 0 }} />)}
                                        {overflow > 0 ? <Box component="span" sx={{ ml: 0.25 }}>…</Box> : null}
                                      </>
                                    )
                                  })()}
                                </Box>
                              </Tooltip>
                            )
                          }
                        }
                        let cellInner: React.ReactNode = content
                        if (isSub) {
                          cellInner = (
                            <Tooltip title={summarizeSubstats(r.Substats) || ''}>
                              <span style={{ display: 'inline-block', width: '100%', overflow: 'hidden', textOverflow: wrapRows ? 'clip' : 'ellipsis', whiteSpace: wrapRows ? 'normal' : 'nowrap', textDecoration: strike ? 'line-through' : 'none' }}>{content}</span>
                            </Tooltip>
                          )
                        } else if (String(value).length && c.key !== 'ArtifactTypeNames' && c.key !== 'ArtifactSetNames') {
                          cellInner = (
                            <EllipsisTooltip title={value} wrap="block">
                              <span data-ellipsis-target style={{ display: 'inline-block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: strike ? 'line-through' : 'none' }}>{content}</span>
                            </EllipsisTooltip>
                          )
                        }
                        return (
                      <TableCell key={String(c.key)} sx={{ fontFamily: isSub ? 'inherit' : 'ui-monospace, monospace', fontSize: 13, width: c.width, color: isIdx ? (keep ? 'success.main' : 'warning.main') : undefined, textDecoration: strike ? 'line-through' : 'none', overflow: wrapRows ? 'visible' : 'hidden', textOverflow: wrapRows ? 'clip' : 'ellipsis', whiteSpace: wrapRows ? 'normal' : 'nowrap', wordBreak: wrapRows ? 'break-word' : 'normal' }}>
                        {cellInner}
                      </TableCell>
                        )
                      })}
                </TableRow>
                    )
                  })}
                  {padBottom > 0 && (
                    <TableRow key="spacer-bot" sx={{ height: padBottom }}>
                      <TableCell colSpan={colSpan} sx={spacerSx} />
                    </TableRow>
                  )}
                </>
              )
            })()}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Header context menu (columns + wrap toggle) */}
      <Menu open={Boolean(headerMenu?.open)} onClose={() => setHeaderMenu(null)} anchorReference="anchorPosition" {...(headerMenu?.open ? { anchorPosition: { top: headerMenu.y, left: headerMenu.x } } : {})}>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setWrapRows(!wrapRows)}>
          <Typography variant="body2" sx={{ minWidth: 140 }}>Multi-line rows</Typography>
          <Button
            size="small"
            variant={wrapRows ? 'contained' : 'outlined'}
            color={wrapRows ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setWrapRows(!wrapRows) }}
          >{wrapRows ? 'On' : 'Off'}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowSlotIcons(!showSlotIcons)}>
          <Typography variant="body2" sx={{ minWidth: 140 }}>Slots as icons</Typography>
          <Button
            size="small"
            variant={showSlotIcons ? 'contained' : 'outlined'}
            color={showSlotIcons ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowSlotIcons(!showSlotIcons) }}
          >{showSlotIcons ? 'On' : 'Off'}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowSetIcons(!showSetIcons)}>
          <Typography variant="body2" sx={{ minWidth: 140 }}>Sets as icons</Typography>
          <Button
            size="small"
            variant={showSetIcons ? 'contained' : 'outlined'}
            color={showSetIcons ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowSetIcons(!showSetIcons) }}
          >{showSetIcons ? 'On' : 'Off'}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => onToggleStatButtonBorders(!statButtonBorders)}>
          <Typography variant="body2" sx={{ minWidth: 140 }}>Color stat texts</Typography>
          <Button
            size="small"
            variant={statButtonBorders ? 'contained' : 'outlined'}
            color={statButtonBorders ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); onToggleStatButtonBorders(!statButtonBorders) }}
          >{statButtonBorders ? 'On' : 'Off'}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); }}>
          <Typography variant="body2" sx={{ minWidth: 140 }}>Color-blind palette</Typography>
          <Button
            size="small"
            variant={colorBlindMode === 'normal' ? 'outlined' : 'contained'}
            color={colorBlindMode === 'normal' ? 'warning' : 'success'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              const next: 'normal' | 'okabeIto' | 'tritan' =
                colorBlindMode === 'normal' ? 'okabeIto' : (colorBlindMode === 'okabeIto' ? 'tritan' : 'normal')
              onChangeColorBlindMode(next)
            }}
          >{colorBlindMode === 'normal' ? 'Normal' : (colorBlindMode === 'okabeIto' ? 'Okabe–Ito' : 'Tritan')}</Button>
        </MenuItem>
        <Divider />
        {/* Reset should sit above the column labels list */}
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button size="small" variant="outlined" color="error" onClick={() => { try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(WRAP_ROWS_KEY) } catch {} setCols(defaultCols); setWrapRows(false); setHeaderMenu(null) }}>Reset columns</Button>
          <Box sx={{ flex: 1 }} />
        </Box>
        {cols.map((c, idx) => {
          const isFaction = c.key === 'Faction'
          const val = isFaction ? (c.mode ?? 'auto') : (c.visible ? 'show' : 'hide')
          return (
            <MenuItem key={String(c.key)} onClick={(e) => { e.stopPropagation(); if (!isFaction) { const next = val === 'show' ? 'hide' : 'show'; setCols(prev => prev.map((x,i) => i === idx ? { ...x, visible: next === 'show' } : x)) } }} sx={{ gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 140 }}>{c.label}</Typography>
              {isFaction ? (
                <Button
                  size="small"
                  variant="contained"
                  color={val === 'auto' ? 'info' : (val === 'show' ? 'success' : 'warning')}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(e) => { e.stopPropagation(); const next: ColMode = val === 'auto' ? 'show' : (val === 'show' ? 'hide' : 'auto'); setCols(prev => prev.map((x,i) => i === idx ? { ...x, mode: next } : x)) }}
                >{val === 'auto' ? 'Auto' : (val === 'show' ? 'Shown' : 'Hidden')}</Button>
              ) : (
                <Tooltip title={val === 'show' ? 'Shown in table' : 'Hidden in table'}>
                  <Button
                    size="small"
                    variant={val === 'show' ? 'contained' : 'outlined'}
                    color={val === 'show' ? 'success' : 'warning'}
                    startIcon={val === 'show' ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(e) => { e.stopPropagation(); const next = val === 'show' ? 'hide' : 'show'; setCols(prev => prev.map((x,i) => i === idx ? { ...x, visible: next === 'show' } : x)) }}
                  >{val === 'show' ? 'Shown' : 'Hidden'}</Button>
                </Tooltip>
              )}
            </MenuItem>
          )
        })}
      </Menu>
      {/* Row context menu (acts on the originating config when available) */}
      <Menu
        open={Boolean(rowMenu?.open)}
        onClose={() => setRowMenu(null)}
        anchorReference="anchorPosition"
        {...(rowMenu?.open ? { anchorPosition: { top: rowMenu.y, left: rowMenu.x } } : {})}
      >
        {rowMenu?.cfgIdx === null ? (
          <MenuItem onClick={() => { setRowMenu(null); onClearBase() }}>Clear</MenuItem>
        ) : (
          <>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'duplicate') } }}>Duplicate</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_top') } }}>Move to Top</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_up') } }}>Move Up</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_down') } }}>Move Down</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_bottom') } }}>Move to Bottom</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'copy') } }}>Copy to Clipboard</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'paste_after') } }}>Paste after</MenuItem>
            <Divider />
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'delete') } }} sx={{ color: 'error.main' }}>Delete</MenuItem>
          </>
        )}
      </Menu>
    </Box>
  )
}

// Avoid re-rendering the large rules table when unrelated state (like builder name) changes
export const HsfRulesTableMemo = React.memo(HsfRulesTable)
/**
 * HsfRulesTable
 *
 * Read-only table that renders merged HSF rules and supports highlighting
 * by originating config, inline labels, and basic sorting.
 */
