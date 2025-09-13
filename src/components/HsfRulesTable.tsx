import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Chip, Divider, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import type { HsfRule } from '../lib/hsfTypes'
import { compareHsfSubstats, formatArtifactSets, formatArtifactTypes, formatLevel, formatRank, labelOfVariant, mainToVariant, rarityCodeToName, statIsAny, statNameFromId, StatId, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT, subToVariant, factionCodeToName } from '../lib/types'
import EllipsisTooltip from './EllipsisTooltip'
import { MENU_CONTROL_HEIGHT_PX, MENU_CONTROL_MIN_WIDTH_PX } from '../lib/constants'

export function HsfRulesTable({ rules, hoveredCfgIdx, setHoveredCfgIdx, selectedCfgIdx, onSelectCfgIdx, onConfigAction, onClearBase, substatColors, statButtonBorders, onToggleStatButtonBorders }: {
  rules: HsfRule[]
  hoveredCfgIdx: number | null
  setHoveredCfgIdx: (idx: number | null) => void
  selectedCfgIdx: number | null
  onSelectCfgIdx: (idx: number) => void
  onConfigAction: (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => void
  onClearBase: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  statButtonBorders: boolean
  onToggleStatButtonBorders: (next: boolean) => void
}) {
  // Virtualization state and helpers
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  const [containerW, setContainerW] = useState(0)
  const [viewportH, setViewportH] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const rowHeightsRef = useRef<number[]>([])
  const prefixHeightsRef = useRef<number[]>([])
  const totalHeightRef = useRef<number>(0)
  const [heightsVersion, _setHeightsVersion] = useState(0)
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
    // Nudge a bit to account for sticky header height
    const headerNudge = 4
    const top = Math.max(0, targetTop - headerNudge)
    try { container.scrollTo({ top, behavior }) } catch { try { container.scrollTop = top } catch {} }
  }

  // When selection changes (e.g., user clicked a chip), scroll first matching rule into view
  const suppressNextScrollRef = useRef<boolean>(false)
  useEffect(() => {
    if (selectedCfgIdx === null || selectedCfgIdx === undefined) return
    // If selection came from a table row click, skip this one automatic scroll
    if (suppressNextScrollRef.current) { suppressNextScrollRef.current = false; return }
    const idx = rules.findIndex((r) => (r as HsfRule & { __cfgIdx?: number }).__cfgIdx === selectedCfgIdx)
    if (idx >= 0) scrollRuleIndexIntoView(idx, 'smooth')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCfgIdx, rules, wrapRows])

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

  useEffect(() => {
    const el = tableContainerRef.current
    if (!el) return
    const onScroll = () => setScrollTop(el.scrollTop)
    const measure = () => { setViewportH(el.clientHeight); setContainerW(el.clientWidth) }
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
    }
  }, [])

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


  type ColKey = keyof HsfRule | 'Idx' | 'CfgIdx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'RarityNames' | 'MainStatName' | 'RankLabel' | 'LevelLabel'
  type ColMode = 'auto' | 'show' | 'hide'
  type ColCfg = { key: ColKey; label: string; width: number; visible: boolean; mode?: ColMode }
  const defaultCols: ColCfg[] = [
    { key: 'Idx', label: 'Idx', width: 72, visible: true },
    { key: 'CfgIdx', label: 'Cfg', width: 64, visible: true },
    { key: 'Keep', label: 'Keep', width: 64, visible: false },
    { key: 'Use', label: 'Use', width: 56, visible: false },
    { key: 'ArtifactSetNames', label: 'Sets', width: 170, visible: true },
    { key: 'ArtifactTypeNames', label: 'Slot', width: 100, visible: true },
    { key: 'RankLabel', label: 'Rank', width: 65, visible: true },
    { key: 'RarityNames', label: 'Rarity', width: 110, visible: true },
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
              const overscan = 20
              // When there are no rules, render a single placeholder row to communicate state.
              if (rules.length === 0) {
                return (
                  <TableRow>
                    <TableCell colSpan={colSpan} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                      No RSL Helper Sellfile rule yet.
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
                  const lowerBound = (arr: number[], x: number) => {
                    let lo = 0, hi = arr.length - 1, ans = arr.length
                    while (lo <= hi) {
                      const mid = (lo + hi) >>> 1
                      const v = arr[mid] ?? Number.POSITIVE_INFINITY
                      if (v >= x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 }
                    }
                    return ans
                  }
                  start = Math.max(0, lowerBound(pref, scrollTop) - overscan)
                  end = Math.min(rules.length, lowerBound(pref, viewBot) + overscan)
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
                  ref={(el) => { if (!wrapRows && i === 0 && el) { const h = el.offsetHeight; if (h && Math.abs(h - fixedRowH) >= 1) setFixedRowH(h) } }}
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
                    else if (c.key === 'RankLabel') value = formatRank(r.Rank)
                    else if (c.key === 'RarityNames') value = rarityCodeToName(r.Rarity)
                    else if (c.key === 'Faction') value = factionCodeToName(r.Faction)
                    else if (c.key === 'MainStatName') value = labelOfVariant(mainToVariant(r.MainStatID, r.MainStatF))
                    else if (c.key === 'LevelLabel') value = formatLevel(r.LVLForCheck)
                        else if (c.key === 'Idx') value = String(idx + 1)
                    else value = ''
                        const isSub = c.key === 'SubstatsSummary'
                        const isIdx = c.key === 'Idx'
                        const keep = Boolean(r.Keep)
                        const strike = (r as HsfRule).Use === false
                        const content = isSub ? renderSubstatsInline(r.Substats) : (value || '')
                        let cellInner: React.ReactNode = content
                        if (isSub) {
                          cellInner = (
                            <Tooltip title={summarizeSubstats(r.Substats) || ''}>
                              <span style={{ display: 'inline-block', width: '100%', overflow: 'hidden', textOverflow: wrapRows ? 'clip' : 'ellipsis', whiteSpace: wrapRows ? 'normal' : 'nowrap', textDecoration: strike ? 'line-through' : 'none' }}>{content}</span>
                            </Tooltip>
                          )
                        } else if (!wrapRows && String(value).length) {
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
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button size="small" variant="outlined" color="error" onClick={() => { try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(WRAP_ROWS_KEY) } catch {} setCols(defaultCols); setWrapRows(false); setHeaderMenu(null) }}>Reset columns</Button>
          <Button size="small" variant="outlined" onClick={() => {
            try {
              const container = tableContainerRef.current
              const available = container?.clientWidth || 1000
              const ctx = document.createElement('canvas').getContext('2d')
              const bodyFont = '12px ui-monospace, monospace'
              const normalFont = getComputedStyle(document.body).font || '12px sans-serif'
              const m = (text: string, mono = true) => { if (!ctx) return text.length * 7; ctx.font = mono ? bodyFont : normalFont; return Math.ceil(ctx.measureText(String(text)).width) }
              const pad = 24
              const maxRowsToCheck = Math.min(rules.length, 1000)
              const keys = cols.filter(c => isColVisible(c)).map(c => c.key)
              const widths = new Map<ColKey, number>()
              for (const c of cols.filter(c => isColVisible(c))) widths.set(c.key, Math.max(40, m(c.label, true) + pad))
              for (let i = 0; i < maxRowsToCheck; i++) {
                const r0 = rules[i]
                if (!r0) continue
                for (const k of keys) {
                  let text = ''
                  if (k === 'SubstatsSummary') text = summarizeSubstats(r0.Substats) || ''
                  else if (k === 'CfgIdx') {
                    const cidx = (r0 as HsfRule & { __cfgIdx?: number }).__cfgIdx
                    text = (cidx !== undefined && cidx !== null) ? String((cidx as number) + 1) : ''
                  }
                  else if (k === 'Keep') text = r0.Keep ? 'Keep' : 'Sell'
                  else if (k === 'Use') text = r0.Use ? '✓' : '-'
                  else if (k === 'ArtifactTypeNames') text = formatArtifactTypes(r0.ArtifactType)
                  else if (k === 'ArtifactSetNames') {
                    const allKnown = Boolean((r0 as HsfRule & { __allKnownSets?: boolean }).__allKnownSets)
                    text = allKnown ? 'All Currently Known' : formatArtifactSets(r0.ArtifactSet)
                  }
                  else if (k === 'RankLabel') text = formatRank(r0.Rank)
                  else if (k === 'RarityNames') text = rarityCodeToName(r0.Rarity)
                  else if (k === 'Faction') text = factionCodeToName(r0.Faction)
                  else if (k === 'MainStatName') text = labelOfVariant(mainToVariant(r0.MainStatID, r0.MainStatF))
                  else if (k === 'LevelLabel') text = formatLevel(r0.LVLForCheck)
                  else if (k === 'Idx') text = String(i + 1)
                  else text = ''
                  const mono = k !== 'SubstatsSummary'
                  const w = (k === 'SubstatsSummary') ? Math.min(480, m(text, false) + pad) : m(text, mono) + pad
                  widths.set(k, Math.max(widths.get(k) || 0, Math.max(40, w)))
                }
              }
              const visCols = cols.filter(c => isColVisible(c))
              const sum = visCols.reduce((acc, c) => acc + (widths.get(c.key) || c.width), 0)
              let scale = sum > available ? available / sum : 1
              if (!Number.isFinite(scale) || scale <= 0) scale = 1
              const next = cols.map(c => { if (!isColVisible(c)) return c; const base = widths.get(c.key) || c.width; const w = Math.max(40, Math.floor(base * scale)); return { ...c, width: w } })
              setCols(next)
            } catch {}
            setHeaderMenu(null)
          }}>Auto-fit widths</Button>
          <Box sx={{ flex: 1 }} />
        </Box>
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
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => onToggleStatButtonBorders(!statButtonBorders)}>
          <Typography variant="body2" sx={{ minWidth: 140 }}>Color stat buttons</Typography>
          <Button
            size="small"
            variant={statButtonBorders ? 'contained' : 'outlined'}
            color={statButtonBorders ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); onToggleStatButtonBorders(!statButtonBorders) }}
          >{statButtonBorders ? 'On' : 'Off'}</Button>
        </MenuItem>
        <Divider />
        {cols.map((c, idx) => {
          const isFaction = c.key === 'Faction'
          const val = isFaction ? (c.mode ?? 'auto') : (c.visible ? 'show' : 'hide')
          return (
            <MenuItem key={String(c.key)} onClick={(e) => { e.stopPropagation(); if (isFaction) { const next = val === 'auto' ? 'show' : val === 'show' ? 'hide' : 'auto'; setCols(prev => prev.map((x,i) => i === idx ? { ...x, mode: next as ColMode } : x)) } else { const next = val === 'show' ? 'hide' : 'show'; setCols(prev => prev.map((x,i) => i === idx ? { ...x, visible: next === 'show' } : x)) } }} sx={{ gap: 1 }}>
              <Typography variant="body2" sx={{ minWidth: 140 }}>{c.label}</Typography>
              {isFaction ? (
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={val}
                  onChange={(_, v) => { if (!v) return; setCols(prev => prev.map((x,i) => i === idx ? { ...x, mode: v as ColMode } : x)) }}
                >
                  <ToggleButton
                    value="auto"
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      borderWidth: 1,
                      borderColor: 'info.main',
                      color: 'info.main',
                      '&.Mui-selected': { bgcolor: 'info.main', color: '#fff', borderColor: 'info.main', '&:hover': { bgcolor: 'info.dark' } },
                    }}
                  >Auto</ToggleButton>
                  <ToggleButton
                    value="show"
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      borderWidth: 1,
                      borderColor: 'success.main',
                      color: 'success.main',
                      '&.Mui-selected': { bgcolor: 'success.main', color: '#fff', borderColor: 'success.main', '&:hover': { bgcolor: 'success.dark' } },
                    }}
                  >Show</ToggleButton>
                  <ToggleButton
                    value="hide"
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      borderWidth: 1,
                      borderColor: 'warning.main',
                      color: 'warning.main',
                      '&.Mui-selected': { bgcolor: 'warning.main', color: '#000', borderColor: 'warning.main', '&:hover': { bgcolor: 'warning.dark' } },
                    }}
                  >Hide</ToggleButton>
                </ToggleButtonGroup>
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
