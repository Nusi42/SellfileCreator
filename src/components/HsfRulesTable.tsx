import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Divider, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tooltip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import type { HsfRule } from '../lib/hsfTypes'
import type { HsfRuleWithCfg } from '../lib/merge'
import { compareHsfSubstats, /* formatArtifactSets */ formatLevel, formatRank, /* labelOfVariant, */ mainToVariant, rarityCodeToName, statIsAny, /* statNameFromId, */ subToVariant, artifactSetName, compareArtifactTypes, artifactTypeI18nKey, artifactSetI18nKey, statVariantI18nKey, compareArtifactSets, factionI18nKey, type FactionId } from '../lib/types'
import EllipsisTooltip from './EllipsisTooltip'
import {
  NBSP,
  MENU_CONTROL_HEIGHT_PX,
  MENU_CONTROL_MIN_WIDTH_PX,
  MENU_LABEL_WIDTH_PX,
  RULES_TABLE_SMOOTH_SCROLL_NEARBY_VIEWPORTS,
  RULES_TABLE_OVERSCAN_FAST,
  RULES_TABLE_OVERSCAN_IDLE,
  RULES_TABLE_HOVER_PROPAGATION_MS,
  FONT_SIZE_BASE_PX,
  HOVER_BG_ALPHA,
  SELECTED_HOVER_BG_ALPHA,
} from '../lib/constants'
import { useDisplayPreferenceActions, useDisplayPreferences } from '../state/preferencesState'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon, SET_ICON_PX } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { useI18n } from '../lib/i18n'
import RuleSubstatChips from './RuleSubstatChips'

// Keeps context menu labels compact and consistent across locales (max two lines with ellipsis).
const HEADER_MENU_LABEL_SX = {
  width: MENU_LABEL_WIDTH_PX,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  wordBreak: 'break-word',
  lineHeight: 1.15,
  whiteSpace: 'normal',
} as const

// Preview rows stay at their fixed height (≈30px). Keep the inline faction icon
// slightly smaller than the default select size so the row metrics remain
// unchanged when toggling the "Factions as icons" option.
const FACTION_ICON_PREVIEW_PX = 20 as const
const FACTION_ICON_PREVIEW_SCALE = 1.25 as const
// Nudge the faction icon vertically so the glyph aligns with the centered text baseline.
const FACTION_ICON_PREVIEW_OFFSET_PX = 3 as const
// Slightly offset non-substat single-line spans without changing row height (used via translateY).
const SINGLE_LINE_PREVIEW_OFFSET_PX = 1 as const

export function HsfRulesTable({ rules, setHoveredCfgIdx, selectedCfgIdx, multiselectActive, onSelectCfgIdx, onConfigAction, onClearBase, substatColors, colorBlindMode, onChangeColorBlindMode, emptyDueToFilter = false, focusRuleIndex = null }: {
  rules: HsfRuleWithCfg[]
  setHoveredCfgIdx: (idx: number | null) => void
  selectedCfgIdx: number | null
  multiselectActive: boolean
  onSelectCfgIdx: (idx: number) => void
  onConfigAction: (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => void
  onClearBase: () => void
  substatColors: Record<number, { fg: string; bg: string }>
  colorBlindMode: 'normal' | 'okabeIto' | 'tritan'
  onChangeColorBlindMode: (mode: 'normal' | 'okabeIto' | 'tritan') => void
  emptyDueToFilter?: boolean
  // Optional external scroll target: rule index in the current rules array
  focusRuleIndex?: number | null
}) {
  const { t } = useI18n()
  const { showSlotIcons, showSetIcons, showFactionIcons, statButtonBorders } = useDisplayPreferences()
  const { setShowSlotIcons, setShowSetIcons, setShowFactionIcons, setStatButtonBorders } = useDisplayPreferenceActions()
  // Default fixed row height for single-line mode.
  // Why: Icons and typography can affect the actual rendered height; we measure
  // at runtime and correct scroll alignment, but use this baseline for initial
  // math before measurements settle.
  const DEFAULT_FIXED_ROW_HEIGHT_PX: number = 30
  // Virtualization state and helpers
  const tableContainerRef = useRef<HTMLDivElement | null>(null)
  // Sticky header height used to offset scroll targets for better alignment.
  // Why: In wrap (multi-line) mode, row heights are measured lazily. Using a
  // measured header height (instead of a magic number) improves accuracy when
  // re-scrolling to converge on the target row after measurements settle.
  const headerHeightRef = useRef<number>(0)
  // Small pixel correction applied when aligning scroll to account for sticky
  // header borders and sub‑pixel rounding differences across browsers.
  // Why: Without this, final alignment can be off by ~1–2px.
  const HEADER_SCROLL_FUDGE_PX: number = 2
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
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
  useEffect(() => {
    try { localStorage.setItem(WRAP_ROWS_KEY, String(wrapRows)) } catch {}
  }, [wrapRows])

  // Gate hover highlighting to the table area only
  const [isHoveringArea, setIsHoveringArea] = useState(false)
  // DOM-based hover highlight to avoid re-rendering rows during hover.
  const lastDomHoverCfgRef = useRef<number | null>(null)
  const hoveredRowElsRef = useRef<HTMLElement[] | null>(null)
  const lastPropagatedHoverRef = useRef<number | null>(null)
  const hoverThrottleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const hoverRafIdRef = useRef<number | null>(null)
  const pendingLocalHoverRef = useRef<number | null>(null)
  const scheduleHoverPropagation = (next: number | null) => {
    // Skip if value is unchanged to avoid redundant parent updates.
    if (lastPropagatedHoverRef.current === next) return
    // Coalesce rapid changes into at most one update per throttle window.
    if (hoverThrottleTimerRef.current !== null) {
      // Replace the pending target; timer will flush soon.
      // Store on ref so closure reads the latest value.
      pendingHoverTargetRef.current = next
      return
    }
    pendingHoverTargetRef.current = next
    hoverThrottleTimerRef.current = window.setTimeout(() => {
      hoverThrottleTimerRef.current = null
      const target = pendingHoverTargetRef.current
      lastPropagatedHoverRef.current = target ?? null
      try { setHoveredCfgIdx(target ?? null) } catch {}
    }, RULES_TABLE_HOVER_PROPAGATION_MS)
  }
  const pendingHoverTargetRef = useRef<number | null>(null)

  // Per-frame throttle for local hover updates (row highlight). Coalesces rapid
  // mouseenter events into a single state update per animation frame.
  const applyDomHover = (cfgIdx: number | null) => {
    const container = tableContainerRef.current
    if (!container) return
    // Clear previous
    if (hoveredRowElsRef.current) {
      for (const el of hoveredRowElsRef.current) { try { el.classList.remove('cfg-hover') } catch {} }
      hoveredRowElsRef.current = null
    }
    lastDomHoverCfgRef.current = cfgIdx
    if (cfgIdx === null || cfgIdx === undefined) return
    const list = Array.from(container.querySelectorAll(`tr[data-cfg-idx="${cfgIdx}"]`)) as HTMLElement[]
    for (const el of list) { try { el.classList.add('cfg-hover') } catch {} }
    hoveredRowElsRef.current = list
  }
  const scheduleLocalHover = (next: number | null) => {
    pendingLocalHoverRef.current = next
    if (hoverRafIdRef.current !== null) return
    hoverRafIdRef.current = requestAnimationFrame(() => {
      hoverRafIdRef.current = null
      const target = pendingLocalHoverRef.current ?? null
      // DOM highlight (no React state)
      if (target !== lastDomHoverCfgRef.current) applyDomHover(target)
      // Propagate to App (throttled separately)
      scheduleHoverPropagation(target)
    })
  }
  useEffect(() => () => {
    if (hoverThrottleTimerRef.current) { clearTimeout(hoverThrottleTimerRef.current); hoverThrottleTimerRef.current = null }
    if (hoverRafIdRef.current !== null) { try { cancelAnimationFrame(hoverRafIdRef.current) } catch {} hoverRafIdRef.current = null }
  }, [])

  useEffect(() => {
    // Virtualization swaps row elements as the user scrolls; reapply the hover class so
    // newly mounted rows for the active config keep their highlight without extra renders.
    const hovered = lastDomHoverCfgRef.current
    if (hovered === null || hovered === undefined) return
    applyDomHover(hovered)
  })

  // Measured row height to match actual rendered size (accounts for borders/fonts/icons).
  // Placed early so selection scrolling can consult an up-to-date value.
  const [fixedRowH, setFixedRowH] = useState(DEFAULT_FIXED_ROW_HEIGHT_PX)
  const fixedRowHRef = useRef(DEFAULT_FIXED_ROW_HEIGHT_PX)
  useEffect(() => { fixedRowHRef.current = fixedRowH }, [fixedRowH])

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
    const top = Math.max(0, Math.round(targetTop - headerNudge - HEADER_SCROLL_FUDGE_PX))
    try { container.scrollTo({ top, behavior }) } catch { try { container.scrollTop = top } catch {} }
  }

  // External request to focus a specific rule
  useEffect(() => {
    if (focusRuleIndex == null) return
    // Defer one frame to ensure measurements present
    requestAnimationFrame(() => {
      scrollRuleIndexIntoView(Math.max(0, Math.min(rules.length - 1, focusRuleIndex)), wrapRows ? 'auto' : 'smooth')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRuleIndex, rules, wrapRows])

  // When selection changes (e.g., user clicked a chip), scroll first matching rule into view
  const suppressNextScrollRef = useRef<boolean>(false)
  // Helper: compute visibility state for a config block in single-line mode.
  // Decides whether all rows for the config are fully visible, partially
  // visible, or not visible, and whether the full block can fit in the
  // current viewport. Also provides the top index to reveal the entire block.
  const computeSingleLineVisibilityForConfig = React.useCallback((cfgIdx: number) => {
    const total = rules.length
    let first = -1
    let last = -1
    for (let i = 0; i < total; i++) {
      const r = rules[i]
      if (r && r.__cfgIdx === cfgIdx) { first = i; break }
    }
    if (first === -1) return null
    for (let i = total - 1; i >= first; i--) {
      const r = rules[i]
      if (r && r.__cfgIdx === cfgIdx) { last = i; break }
    }
    if (last === -1) last = first
    const count = (last - first + 1)
    const container = tableContainerRef.current
    if (!container) return { first, last, count, fullyVisible: false, partiallyVisible: false, canFitAll: false, topIndexForFullFit: first }
    const header = Math.max(0, headerHeightRef.current || 0)
    const vp = Math.max(0, (viewportHRef.current || 0) - header)
    const rowH = fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX
    const visibleRows = Math.max(0, Math.floor(vp / rowH))
    const top = container.scrollTop
    const visTopRow = Math.floor((top + header) / rowH)
    const visBottomRow = Math.floor(((top + (viewportHRef.current || 0)) - 1) / rowH)
    const fullyVisible = first >= visTopRow && last <= visBottomRow
    const partiallyVisible = !fullyVisible && !(last < visTopRow || first > visBottomRow)
    const canFitAll = count <= Math.max(1, visibleRows)
    let topIndexForFullFit = first
    if (canFitAll) {
      const maxTop = Math.max(0, last - Math.max(0, visibleRows - 1))
      topIndexForFullFit = Math.min(first, maxTop)
    }
    return { first, last, count, fullyVisible, partiallyVisible, canFitAll, topIndexForFullFit }
  }, [rules])
  // Retry-based scroll alignment for wrap (multi-line) mode.
  // Why: Row heights are measured lazily; initial prefix sums assume fixed heights.
  // Re-attempting the scroll after measurements settle reliably lands on the exact row.
  // Pending scroll target stored by originating config idx so it survives
  // list changes (rule counts per config vary). We resolve the current row
  // index on each attempt for accuracy.
  const pendingScrollRef = useRef<{ cfgIdx: number; attempts: number } | null>(null)
  const attemptScrollAlign = React.useCallback(() => {
    const pending = pendingScrollRef.current
    if (!pending) return
    const { cfgIdx } = pending
    const container = tableContainerRef.current
    if (!container) { pendingScrollRef.current = null; return }
    const index = rules.findIndex((r) => r.__cfgIdx === cfgIdx)
    if (index < 0 || index >= rules.length) { pendingScrollRef.current = null; return }
    const rowEl = container.querySelector(`[data-row-index="${index}"]`) as HTMLTableRowElement | null
    if (rowEl) {
      // The row is mounted: align precisely using element geometry.
      const cRect = container.getBoundingClientRect()
      const rRect = rowEl.getBoundingClientRect()
      const delta = rRect.top - cRect.top
      const header = Math.max(0, headerHeightRef.current || 0)
      const nextTop = Math.max(0, Math.round(container.scrollTop + delta - header - HEADER_SCROLL_FUDGE_PX))
      // Final correction: use jump in wrap mode; smooth is reserved for single-line mode only.
      try { container.scrollTo({ top: nextTop, behavior: wrapRows ? 'auto' : 'smooth' }) } catch { try { container.scrollTop = nextTop } catch {} }
      pendingScrollRef.current = null
      return
    }
    // Row not yet mounted in the virtual window: nudge towards estimated offset.
    if (!wrapRows) {
      // Single-line mode: compute exact offset from fixedRowH and index.
      // This avoids large over/under-shoots when jumping across many rows.
      scrollRuleIndexIntoView(index, 'auto')
    } else {
      // Wrap mode: prefix-based estimate is sufficient; heights will settle with retries.
      scrollRuleIndexIntoView(index, 'auto')
    }
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
    const idx = rules.findIndex((r) => r.__cfgIdx === selectedCfgIdx)
    if (idx >= 0) {
      // Single-line mode: compute full-block visibility and align accordingly
      if (!wrapRows) {
        const vis = computeSingleLineVisibilityForConfig(selectedCfgIdx as number)
        if (vis) {
          if (vis.fullyVisible) { pendingScrollRef.current = null; return }
          const targetIndex = vis.canFitAll ? vis.topIndexForFullFit : vis.first
          if (fixedRowH === DEFAULT_FIXED_ROW_HEIGHT_PX) {
            pendingScrollRef.current = { cfgIdx: selectedCfgIdx as number, attempts: 6 }
            requestAnimationFrame(() => attemptScrollAlign())
            return
          }
          pendingScrollRef.current = { cfgIdx: selectedCfgIdx as number, attempts: 16 }
          const container = tableContainerRef.current
          const vp = viewportHRef.current || 0
          const targetTop = targetIndex * (fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX)
          const curTop = container ? container.scrollTop : 0
          const maxSmooth = Math.max(0, vp * RULES_TABLE_SMOOTH_SCROLL_NEARBY_VIEWPORTS)
          const distance = Math.abs(targetTop - curTop)
          const behavior: ScrollBehavior = (maxSmooth > 0 && distance <= maxSmooth) ? 'smooth' : 'auto'
          scrollRuleIndexIntoView(targetIndex, behavior)
          requestAnimationFrame(() => attemptScrollAlign())
          return
        }
      }
      // If in single-line mode and we haven't measured the real row height yet,
      // defer scrolling until after measurement to avoid under-scrolling by a
      // large margin. The measurement happens on first row render and updates
      // fixedRowH; our fixedRowH effect will then attempt alignment.
      if (!wrapRows && fixedRowH === DEFAULT_FIXED_ROW_HEIGHT_PX) {
        pendingScrollRef.current = { cfgIdx: selectedCfgIdx as number, attempts: 6 }
        requestAnimationFrame(() => attemptScrollAlign())
        return
      }
      // Kick off an initial scroll and schedule retries to converge.
      // In single-line mode, allow more follow-ups so geometry-based nudges can converge
      // even when starting far from the target due to baseline height mismatch.
      pendingScrollRef.current = { cfgIdx: selectedCfgIdx as number, attempts: wrapRows ? 8 : 16 }
      // Behavior:
      // - Multi-line: jump (auto) — measurement retries will align precisely.
      // - Single-line: smooth only if nearby; otherwise jump to avoid a long animation.
      if (wrapRows) {
        scrollRuleIndexIntoView(idx, 'auto')
      } else {
        const container = tableContainerRef.current
        const vp = viewportHRef.current || 0
        const targetTop = idx * (fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX)
        const curTop = container ? container.scrollTop : 0
        const maxSmooth = Math.max(0, vp * RULES_TABLE_SMOOTH_SCROLL_NEARBY_VIEWPORTS)
        const distance = Math.abs(targetTop - curTop)
        const behavior: ScrollBehavior = (maxSmooth > 0 && distance <= maxSmooth) ? 'smooth' : 'auto'
        scrollRuleIndexIntoView(idx, behavior)
      }
      // Fast-follow attempt to catch the row once it mounts.
      requestAnimationFrame(() => attemptScrollAlign())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCfgIdx, rules, wrapRows, multiselectActive, fixedRowH, computeSingleLineVisibilityForConfig])

  useEffect(() => {
    const n = rules.length
    if (rowHeightsRef.current.length !== n) {
      const fixed = DEFAULT_FIXED_ROW_HEIGHT_PX
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
      const threshold = Math.max(2 * (fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX), (viewportHRef.current || 0) * 0.5)
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
    return nonAny?.map((x) => {
      const v = subToVariant(x.ID, x.IsFlat)
      const name = t(statVariantI18nKey(v))
      const prefix = x.Condition === '¬' ? x.Condition : ''
      const op = (!x.Condition || x.Condition === '¬') ? '' : cond(x.Condition)
      const val = (x.Condition === '>=' || x.Condition === '<=') ? x.Value : ''
      return `${prefix}${name} ${op} ${val}`.trim()
    }).join(' ∧ ')
  }

  // Row renderer (memoized) to avoid re-computing heavy cells on unrelated updates (e.g., hover elsewhere)
  // (Per-row React.memo was explored but replaced with a DOM-based highlight
  // to avoid re-render cost entirely during hover.)


  type ColKey = keyof HsfRule | 'Idx' | 'CfgIdx' | 'SubstatsSummary' | 'ArtifactTypeNames' | 'ArtifactSetNames' | 'MainStatName' | 'LevelLabel' | 'RankRarity'
  type ColMode = 'auto' | 'show' | 'hide'
  type ColCfg = { key: ColKey; label: string; width: number; visible: boolean; mode?: ColMode }
  const colLabel = (key: ColKey): string => (
    key === 'Idx' ? t('colIdx') :
    key === 'CfgIdx' ? t('colCfg') :
    key === 'Keep' ? t('colKeep') :
    key === 'Use' ? t('colUse') :
    key === 'ArtifactSetNames' ? t('colSets') :
    key === 'ArtifactTypeNames' ? t('colSlot') :
    key === 'RankRarity' ? t('colRankRarity') :
    key === 'MainStatName' ? t('colMain') :
    key === 'LevelLabel' ? t('colLevel') :
    key === 'Faction' ? t('colFaction') :
    key === 'SubstatsSummary' ? t('colSub') : String(key)
  )
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
  // Show the Faction column automatically when any rule (from HSFC or loaded HSF)
  // has a non-zero faction filter. Previously this only reacted to HSFC-built rows
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

  

  // When the measured fixed row height changes in single-line mode, perform one
  // alignment attempt if a scroll is pending. This corrects smooth scroll
  // targets computed using the pre-measure baseline height.
  useEffect(() => {
    if (wrapRows) return
    if (pendingScrollRef.current) attemptScrollAlign()
  }, [fixedRowH, wrapRows, attemptScrollAlign])

  // Visible columns (memoized): used for header, width calc, and rows
  const visibleColsForContainer = useMemo(() => cols.filter(c => isColVisible(c)), [cols, isColVisible])
  // Compute whether horizontal scroll is needed to avoid column width jitter
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
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

  return (
    <Box
      onMouseEnter={() => setIsHoveringArea(true)}
      onMouseLeave={() => {
        setIsHoveringArea(false)
        if (hoverRafIdRef.current !== null) { try { cancelAnimationFrame(hoverRafIdRef.current) } catch {} hoverRafIdRef.current = null }
        pendingLocalHoverRef.current = null
        applyDomHover(null)
        scheduleHoverPropagation(null)
      }}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}
    >
      <TableContainer
        ref={tableContainerRef}
        sx={(theme) => {
          const hoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? HOVER_BG_ALPHA.dark : HOVER_BG_ALPHA.light)
          const selectedHoverBg = alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? SELECTED_HOVER_BG_ALPHA.dark : SELECTED_HOVER_BG_ALPHA.light)
          return {
            width: '100%',
            overflowY: 'auto',
            overflowX: needHScroll ? 'auto' : 'hidden',
            // Prevent scroll chaining to the page and stabilize scrollbar space
            overscrollBehaviorY: 'contain',
            overscrollBehaviorX: 'contain',
            scrollbarGutter: 'stable both-edges',
            // Isolate layout/paint of the scroller to avoid causing app-level scrollbars during rapid scroll
            contain: 'layout paint',
            // CSS-only hover highlight class for hovered config rows (added imperatively)
            '& tr.cfg-hover[data-selected-cfg="true"]': { backgroundColor: selectedHoverBg },
            '& tr.cfg-hover:not([data-selected-cfg="true"])': { backgroundColor: hoverBg },
            maxHeight: 960,
            '@media (min-width:2320px)': {
              flex: 1,
              minHeight: 0,
              maxHeight: '100%',
              height: '100%',
            },
          }
        }}
        data-tour-id="preview.table"
      >
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHead data-tour-id="preview.header" onContextMenu={(e) => { e.preventDefault(); setHeaderMenu({ open: true, x: e.clientX, y: e.clientY }) }}>
            <TableRow>
              {visibleColsForContainer.map((c) => {
                const realIdx = cols.findIndex(x => x.key === c.key)
                return (
                  <TableCell
                    key={String(c.key)}
                    draggable
                    onDragStart={() => onHeaderDragStart(realIdx)}
                    onDragOver={onHeaderDragOver}
                    onDrop={() => onHeaderDrop(realIdx)}
                    sx={{ width: c.width, fontWeight: 600, fontSize: FONT_SIZE_BASE_PX, userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    <Tooltip title={t('rulesHeaderHelp', { label: colLabel(c.key) })}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <span>{colLabel(c.key)}</span>
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
              const visibleCols = visibleColsForContainer
              const colSpan = Math.max(1, visibleCols.length)
              // Smaller overscan during fast scroll to reduce render cost; increase when idle
              const overscan = fastScroll ? RULES_TABLE_OVERSCAN_FAST : RULES_TABLE_OVERSCAN_IDLE
              // When there are no rules, render a single placeholder row to communicate state.
              if (rules.length === 0) {
                return (
                  <TableRow>
                    <TableCell colSpan={colSpan} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                      {emptyDueToFilter ? t('rulesEmptyFiltered') : t('rulesEmpty')}
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
                    const rule = r as HsfRuleWithCfg
                    const cfgIdx = rule.__cfgIdx
                    const lineIdx = typeof rule.__lineIdx === 'number' ? rule.__lineIdx : idx
                    const isSelectedCfg = (selectedCfgIdx !== null && cfgIdx === selectedCfgIdx)
                    return (
                <TableRow
                  key={idx}
                  hover
                  data-row-index={idx}
                  {...(cfgIdx !== undefined && cfgIdx !== null ? { 'data-cfg-idx': String(cfgIdx) } : {})}
                  data-selected-cfg={isSelectedCfg ? 'true' : undefined}
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
                  onMouseEnter={() => {
                    if (!isHoveringArea) return
                    const next = (cfgIdx ?? null)
                    scheduleLocalHover(next)
                  }}
                  // Do not clear on row leave; container onMouseLeave clears once.
                  onClick={() => {
                    if (cfgIdx !== undefined && cfgIdx !== null) {
                      // Mark that selection originated from table row; suppress auto-scroll once
                      suppressNextScrollRef.current = true
                      onSelectCfgIdx(cfgIdx as number)
                    }
                  }}
                  onContextMenu={(e) => { e.preventDefault(); setRowMenu({ open: true, x: e.clientX, y: e.clientY, cfgIdx: cfgIdx ?? null }) }}
                  sx={(theme) => ({
                    backgroundColor: isSelectedCfg ? theme.palette.action.selected : 'transparent',
                    height: !wrapRows ? fixedRowH : undefined,
                    textDecoration: rule.Use === false ? 'line-through' : 'none',
                  })}
                >
                      {visibleCols.map((c) => {
                        let value: string = ''
                        let factionLabel: string | null = null
                        if (c.key === 'SubstatsSummary') value = summarizeSubstats(rule.Substats) || ''
                        else if (c.key === 'CfgIdx') value = (cfgIdx !== undefined && cfgIdx !== null) ? String((cfgIdx as number) + 1) : ''
                        else if (c.key === 'Keep') value = rule.Keep ? t('keepValueKeep') : t('keepValueSell')
                        else if (c.key === 'Use') value = rule.Use ? '✓' : '-'
                    else if (c.key === 'ArtifactTypeNames') {
                      const ids = (rule.ArtifactType || []).slice().sort(compareArtifactTypes)
                      value = ids.map(id => t(artifactTypeI18nKey(id))).join(', ')
                    }
                    else if (c.key === 'ArtifactSetNames') {
                      const allKnown = Boolean(rule.__allKnownSets)
                      if (allKnown) {
                        value = t('setAllKnownShorthand')
                      } else {
                        const ids = (rule.ArtifactSet || []).slice().sort(compareArtifactSets)
                        value = ids.map((id) => t(artifactSetI18nKey(id))).join(', ')
                      }
                    }
                    else if (c.key === 'RankRarity') {
                      const rank = formatRank(rule.Rank)
                      const rc = Number(rule.Rarity)
                      const rarity = (() => {
                        switch (rc) {
                          case 1: return t('rarityCommon')
                          case 2: return t('rarityUncommon')
                          case 3: return t('rarityRare')
                          case 4: return t('rarityEpic')
                          case 5: return t('rarityLegendary')
                          case 15: return t('rarityMythical')
                          case 6: return `≥${NBSP}${t('rarityCommon')}`
                          case 7: return `≥${NBSP}${t('rarityUncommon')}`
                          case 8: return `≥${NBSP}${t('rarityRare')}`
                          case 9: return `≥${NBSP}${t('rarityEpic')}`
                          case 16: return `≥${NBSP}${t('rarityLegendary')}`
                          case 10: return `≤${NBSP}${t('rarityUncommon')}`
                          case 11: return `≤${NBSP}${t('rarityRare')}`
                          case 12: return `≤${NBSP}${t('rarityEpic')}`
                          case 13: return `≤${NBSP}${t('rarityLegendary')}`
                          case 14: return `≤${NBSP}${t('rarityMythical')}`
                          default: return rarityCodeToName(rc)
                        }
                      })()
                      value = [rank, rarity].filter(Boolean).join(NBSP)
                    }
                    else if (c.key === 'Faction') {
                      const fc = Number(rule.Faction)
                      const label = fc && fc !== 0 ? t(factionI18nKey(fc as FactionId)) : ''
                      factionLabel = label
                      value = showFactionIcons ? '' : label
                    }
                    else if (c.key === 'MainStatName') {
                      // When main stat is Any (MainStatID === -1 or undefined), render nothing.
                      // This matches the intended preview behavior post‑i18n.
                      const isAnyMain = (rule.MainStatID === undefined || rule.MainStatID === null || Number(rule.MainStatID) === -1)
                      value = isAnyMain ? '' : t(statVariantI18nKey(mainToVariant(rule.MainStatID, rule.MainStatF)))
                    }
                    else if (c.key === 'LevelLabel') value = formatLevel(rule.LVLForCheck)
                        else if (c.key === 'Idx') value = String(lineIdx + 1)
                    else value = ''
                        const isSub = c.key === 'SubstatsSummary'
                        const isIdx = c.key === 'Idx'
                        const keep = Boolean(rule.Keep)
                        const strike = rule.Use === false
                        let content: React.ReactNode = isSub
                          ? (
                            <RuleSubstatChips
                              substats={rule.Substats}
                              substatColors={substatColors}
                              wrap={wrapRows}
                            />
                          )
                          : (value || '')
                        // Replace textual slots with icons when enabled
                        if (c.key === 'ArtifactTypeNames' && showSlotIcons) {
                          const types = (rule.ArtifactType || []).slice().sort(compareArtifactTypes)
                          content = (
                            <Tooltip title={(rule.ArtifactType || []).slice().sort(compareArtifactTypes).map(id => t(artifactTypeI18nKey(id))).join(', ')}>
                              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%', overflow: wrapRows ? 'visible' : 'hidden', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                                {(() => {
                                  if (wrapRows) {
                                    return types.map((typeId, i) => {
                                      const Icon = artifactTypeIconFor(typeId)
                                      return Icon ? (
                                        <Box key={`slot-${typeId}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                                          <Icon fontSize="inherit" />
                                        </Box>
                                      ) : (
                                        <Box key={`slot-${typeId}-${i}`} component="span" sx={{ mr: 0.5 }}>{t(artifactTypeI18nKey(typeId))}</Box>
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
                                      {vis.map((typeId, i) => {
                                        const Icon = artifactTypeIconFor(typeId)
                                        return Icon ? (
                                          <Box key={`slot-${typeId}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                                            <Icon fontSize="inherit" />
                                          </Box>
                                        ) : (
                                          <Box key={`slot-${typeId}-${i}`} component="span" sx={{ mr: 0.5 }}>{t(artifactTypeI18nKey(typeId))}</Box>
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
                        if (c.key === 'Faction' && showFactionIcons) {
                          const fc = Number(rule.Faction)
                          if (fc && fc !== 0 && factionLabel) {
                            content = (
                              <Tooltip title={factionLabel}>
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    lineHeight: 0,
                                    width: `${FACTION_ICON_PREVIEW_PX}px`,
                                    height: `${FACTION_ICON_PREVIEW_PX}px`,
                                    transform: wrapRows ? undefined : `translateY(${FACTION_ICON_PREVIEW_OFFSET_PX}px)`,
                                  }}
                                >
                                  <FactionIcon
                                    faction={fc as FactionId}
                                    size={FACTION_ICON_PREVIEW_PX}
                                    sx={{ transform: `scale(${FACTION_ICON_PREVIEW_SCALE})`, transformOrigin: 'center center' }}
                                  />
                                </Box>
                              </Tooltip>
                            )
                          }
                        }
                        // Replace textual set names with icons when enabled (except for the "All Currently Known" shorthand)
                        if (c.key === 'ArtifactSetNames' && showSetIcons) {
                          const allKnown = Boolean(rule.__allKnownSets)
                          if (!allKnown) {
                            const names = (rule.ArtifactSet || []).map(artifactSetName)
                            content = (
                              <Tooltip title={(rule.ArtifactSet || []).map(id => t(artifactSetI18nKey(id))).join(', ')}>
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
                            <Tooltip title={summarizeSubstats(rule.Substats) || ''}>
                              <span style={{ display: 'inline-block', width: '100%', overflow: 'hidden', textOverflow: wrapRows ? 'clip' : 'ellipsis', whiteSpace: wrapRows ? 'normal' : 'nowrap', textDecoration: strike ? 'line-through' : 'none' }}>{content}</span>
                            </Tooltip>
                          )
                        } else if (String(value).length && c.key !== 'ArtifactTypeNames' && c.key !== 'ArtifactSetNames') {
                          cellInner = (
                            <EllipsisTooltip title={value} wrap="block">
                              <span
                                data-ellipsis-target
                                style={{
                                  display: 'inline-block',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  textDecoration: strike ? 'line-through' : 'none',
                                  transform: wrapRows ? undefined : `translateY(${SINGLE_LINE_PREVIEW_OFFSET_PX}px)`,
                                }}
                              >{content}</span>
                            </EllipsisTooltip>
                          )
                        }
                        return (
                      <TableCell key={String(c.key)} sx={{ fontFamily: isSub ? 'inherit' : 'ui-monospace, monospace', fontSize: FONT_SIZE_BASE_PX, width: c.width, color: isIdx ? (keep ? 'success.main' : 'warning.main') : undefined, textDecoration: strike ? 'line-through' : 'none', overflow: wrapRows ? 'visible' : 'hidden', textOverflow: wrapRows ? 'clip' : 'ellipsis', whiteSpace: wrapRows ? 'normal' : 'nowrap', wordBreak: wrapRows ? 'break-word' : 'normal' }}>
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
      <Menu
        open={Boolean(headerMenu?.open)}
        onClose={() => setHeaderMenu(null)}
        anchorReference="anchorPosition"
        {...(headerMenu?.open ? { anchorPosition: { top: headerMenu.y, left: headerMenu.x } } : {})}
        slotProps={{ paper: { 'data-tour-id': 'preview.header.menu' } as unknown as MuiPaperProps }}
      >
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setWrapRows(!wrapRows)}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuWrapRows')}</Typography>
          <Button
            size="small"
            variant={wrapRows ? 'contained' : 'outlined'}
            color={wrapRows ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setWrapRows(!wrapRows) }}
          >{wrapRows ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowSlotIcons(!showSlotIcons)}>
          <Typography
            variant="body2"
            sx={HEADER_MENU_LABEL_SX}
          >
            {t('rulesMenuSlotsAsIcons')}
          </Typography>
          <Button
            size="small"
            variant={showSlotIcons ? 'contained' : 'outlined'}
            color={showSlotIcons ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowSlotIcons(!showSlotIcons) }}
          >{showSlotIcons ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowFactionIcons(!showFactionIcons)}>
          <Typography
            variant="body2"
            sx={HEADER_MENU_LABEL_SX}
          >
            {t('rulesMenuFactionsAsIcons')}
          </Typography>
          <Button
            size="small"
            variant={showFactionIcons ? 'contained' : 'outlined'}
            color={showFactionIcons ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowFactionIcons(!showFactionIcons) }}
          >{showFactionIcons ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowSetIcons(!showSetIcons)}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuSetsAsIcons')}</Typography>
          <Button
            size="small"
            variant={showSetIcons ? 'contained' : 'outlined'}
            color={showSetIcons ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowSetIcons(!showSetIcons) }}
          >{showSetIcons ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setStatButtonBorders(!statButtonBorders)}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuColorStatTexts')}</Typography>
          <Button
            size="small"
            variant={statButtonBorders ? 'contained' : 'outlined'}
            color={statButtonBorders ? 'success' : 'warning'}
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setStatButtonBorders(!statButtonBorders) }}
          >{statButtonBorders ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); }}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuColorBlindPalette')}</Typography>
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
          >{colorBlindMode === 'normal' ? t('colorBlindNormal') : (colorBlindMode === 'okabeIto' ? t('colorBlindOkabeIto') : t('colorBlindTritan'))}</Button>
        </MenuItem>
        <Divider />
        {/* Reset should sit above the column labels list */}
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button size="small" variant="outlined" color="error" onClick={() => { try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(WRAP_ROWS_KEY) } catch {} setCols(defaultCols); setWrapRows(false); setHeaderMenu(null) }}>{t('headerMenuResetCols')}</Button>
          <Box sx={{ flex: 1 }} />
        </Box>
        {cols.map((c, idx) => {
          const isFaction = c.key === 'Faction'
          const val = isFaction ? (c.mode ?? 'auto') : (c.visible ? 'show' : 'hide')
          return (
            <MenuItem key={String(c.key)} onClick={(e) => { e.stopPropagation(); if (!isFaction) { const next = val === 'show' ? 'hide' : 'show'; setCols(prev => prev.map((x,i) => i === idx ? { ...x, visible: next === 'show' } : x)) } }} sx={{ gap: 1 }}>
              <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{colLabel(c.key)}</Typography>
              {isFaction ? (
                <Button
                  size="small"
                  variant="contained"
                  color={val === 'auto' ? 'info' : (val === 'show' ? 'success' : 'warning')}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(e) => { e.stopPropagation(); const next: ColMode = val === 'auto' ? 'show' : (val === 'show' ? 'hide' : 'auto'); setCols(prev => prev.map((x,i) => i === idx ? { ...x, mode: next } : x)) }}
                >{val === 'auto' ? t('headerMenuAuto') : (val === 'show' ? t('headerMenuShown') : t('headerMenuHidden'))}</Button>
              ) : (
                <Tooltip title={val === 'show' ? t('headerMenuShownInTable') : t('headerMenuHiddenInTable')}>
                  <Button
                    size="small"
                    variant={val === 'show' ? 'contained' : 'outlined'}
                    color={val === 'show' ? 'success' : 'warning'}
                    startIcon={val === 'show' ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(e) => { e.stopPropagation(); const next = val === 'show' ? 'hide' : 'show'; setCols(prev => prev.map((x,i) => i === idx ? { ...x, visible: next === 'show' } : x)) }}
                  >{val === 'show' ? t('headerMenuShown') : t('headerMenuHidden')}</Button>
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
          <MenuItem onClick={() => { setRowMenu(null); onClearBase() }}>{t('rowMenuClear')}</MenuItem>
        ) : (
          <>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'duplicate') } }}>{t('rowMenuDuplicate')}</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_top') } }}>{t('rowMenuMoveTop')}</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_up') } }}>{t('rowMenuMoveUp')}</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_down') } }}>{t('rowMenuMoveDown')}</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'move_bottom') } }}>{t('rowMenuMoveBottom')}</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'copy') } }}>{t('rowMenuCopy')}</MenuItem>
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'paste_after') } }}>{t('rowMenuPasteAfter')}</MenuItem>
            <Divider />
            <MenuItem onClick={() => { if (rowMenu && rowMenu.cfgIdx !== null) { const i = rowMenu.cfgIdx; setRowMenu(null); onConfigAction(i, 'delete') } }} sx={{ color: 'error.main' }}>{t('rowMenuDelete')}</MenuItem>
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
