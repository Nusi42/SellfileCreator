import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Button, Divider, Menu, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tooltip } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { PaperProps as MuiPaperProps } from '@mui/material/Paper'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import type { HsfRule } from '../lib/hsfTypes'
import { RULE_SOURCE_FINAL_SELL, RULE_SOURCE_HSF, RULE_SOURCE_HSFC, type HsfRuleWithCfg, type RuleSource } from '../lib/merge'
import { /* formatArtifactSets */ formatLevel, formatRank, /* labelOfVariant, */ mainToVariant, rarityCodeToName, artifactSetName, compareArtifactTypes, artifactTypeI18nKey, artifactSetI18nKey, statVariantI18nKey, compareArtifactSets, factionI18nKey, type FactionId } from '../lib/types'
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
  RULES_TABLE_SCROLL_HINT_HIDE_MS,
  FONT_SIZE_BASE_PX,
  HOVER_BG_ALPHA,
  SELECTED_HOVER_BG_ALPHA,
  RULE_COUNT_LIMIT,
} from '../lib/constants'
import { useDisplayPreferenceActions, useDisplayPreferences } from '../state/preferencesState'
import { artifactTypeIconFor } from './artifactTypeIcons'
import { SetIcon, SET_ICON_PX } from './SetIcon'
import { FactionIcon } from './FactionIcon'
import { useI18n } from '../lib/i18n'
import RuleSubstatChips from './RuleSubstatChips'
import { formatRuleSubstatSummary, formatRuleSubstatPlain } from '../lib/substatDisplay'
import { useContextMenuCloseOnOutsideRightClick } from '../hooks/useContextMenuCloseOnOutsideRightClick'
import { useContextMenuHint } from '../hooks/useContextMenuHint'
import { ContextMenuHintOverlay } from './ContextMenuHintOverlay'
import { useRulesTableColumnsPreference, type StoredColumnConfig } from '../state/rulesTableColumnsPreference'
import ContextMenuPaper from './ContextMenuPaper'

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
const FACTION_ICON_PREVIEW_SCALE = 1.2 as const
// Nudge the faction icon vertically so the glyph aligns with the centered text baseline.
const FACTION_ICON_PREVIEW_OFFSET_PX = 0 as const
// Single-line spans now stay centered with no vertical nudge; keep the constant for quick tuning across browsers.
const SINGLE_LINE_PREVIEW_OFFSET_PX = 3 as const

export function HsfRulesTable({ rules, setHoveredCfgIdx, selectedCfgIdx, multiselectActive, onSelectCfgIdx, onConfigAction, onClearBase, onConfigureFinalSell, onOpenManageColors, colorIconSrc, substatColors, colorBlindMode, onChangeColorBlindMode, emptyDueToFilter = false, limitExceeded = false, focusRuleIndex = null }: {
  rules: HsfRuleWithCfg[]
  setHoveredCfgIdx: (idx: number | null) => void
  selectedCfgIdx: number | null
  multiselectActive: boolean
  onSelectCfgIdx: (idx: number) => void
  onConfigAction: (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => void
  onClearBase: () => void
  onConfigureFinalSell: () => void
  onOpenManageColors: () => void
  colorIconSrc: string
  substatColors: Record<number, { fg: string; bg: string }>
  colorBlindMode: 'normal' | 'okabeIto' | 'tritan'
  onChangeColorBlindMode: (mode: 'normal' | 'okabeIto' | 'tritan') => void
  emptyDueToFilter?: boolean
  limitExceeded?: boolean
  // Optional external scroll target: rule index in the current rules array
  focusRuleIndex?: number | null
}) {
  const { t } = useI18n()
  const { showSlotIcons, showSetIcons, showFactionIcons, statButtonBorders } = useDisplayPreferences()
  const { setShowSlotIcons, setShowSetIcons, setShowFactionIcons, setStatButtonBorders } = useDisplayPreferenceActions()
  const applyNextColorBlindMode = React.useCallback(() => {
    const nextMode: 'normal' | 'okabeIto' | 'tritan' =
      colorBlindMode === 'normal' ? 'okabeIto' : (colorBlindMode === 'okabeIto' ? 'tritan' : 'normal')
    onChangeColorBlindMode(nextMode)
  }, [colorBlindMode, onChangeColorBlindMode])
  // Default fixed row height for single-line mode.
  // Why: Icons and typography can affect the actual rendered height; we measure
  // at runtime and correct scroll alignment, but use this baseline for initial
  // math before measurements settle.
  const DEFAULT_FIXED_ROW_HEIGHT_PX: number = 30
  // Virtualization kicks in once the rules list grows past this size.
  // Why: Smaller lists render in full, but we still reuse the same scroll-range
  // math so the position indicator reflects the actual viewport.
  const VIRTUALIZE_AFTER_RULES = 200
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
  const [showScrollRangeHint, setShowScrollRangeHint] = useState(false)
  const scrollRangeVisibleRef = useRef(false)
  const scrollRangeHideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const rowHeightsRef = useRef<number[]>([])
  const prefixHeightsRef = useRef<number[]>([])
  const totalHeightRef = useRef<number>(0)
  const prevRulesMetricsRef = useRef<{ length: number; totalHeight: number } | null>(null)
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

  // Render helpers cache derived strings/arrays per rule so repeated renders
  // (e.g. while scrolling or filtering) do not redo the expensive formatting work.
  const sortedArtifactTypesCacheRef = useRef<WeakMap<HsfRuleWithCfg, readonly number[]>>(new WeakMap())
  const sortedArtifactSetsCacheRef = useRef<WeakMap<HsfRuleWithCfg, readonly number[]>>(new WeakMap())
  const substatSummaryCacheRef = useRef<WeakMap<HsfRuleWithCfg, { withButtons?: string; plain?: string }>>(new WeakMap())
  const artifactTypeLabelCacheRef = useRef<WeakMap<HsfRuleWithCfg, string>>(new WeakMap())
  const artifactSetLabelCacheRef = useRef<WeakMap<HsfRuleWithCfg, string>>(new WeakMap())
  const rankRarityLabelCacheRef = useRef<WeakMap<HsfRuleWithCfg, string>>(new WeakMap())
  const factionLabelCacheRef = useRef<WeakMap<HsfRuleWithCfg, string>>(new WeakMap())

  useEffect(() => {
    artifactTypeLabelCacheRef.current = new WeakMap()
    artifactSetLabelCacheRef.current = new WeakMap()
    rankRarityLabelCacheRef.current = new WeakMap()
    factionLabelCacheRef.current = new WeakMap()
    substatSummaryCacheRef.current = new WeakMap()
  }, [t])

  const getSortedArtifactTypes = useCallback((rule: HsfRuleWithCfg): readonly number[] => {
    let cached = sortedArtifactTypesCacheRef.current.get(rule)
    if (!cached) {
      const raw = Array.isArray(rule.ArtifactType) ? [...rule.ArtifactType] : []
      raw.sort(compareArtifactTypes)
      cached = raw
      sortedArtifactTypesCacheRef.current.set(rule, cached)
    }
    return cached
  }, [])

  const getSortedArtifactSets = useCallback((rule: HsfRuleWithCfg): readonly number[] => {
    let cached = sortedArtifactSetsCacheRef.current.get(rule)
    if (!cached) {
      const raw = Array.isArray(rule.ArtifactSet) ? [...rule.ArtifactSet] : []
      raw.sort(compareArtifactSets)
      cached = raw
      sortedArtifactSetsCacheRef.current.set(rule, cached)
    }
    return cached
  }, [])

  const getSubstatSummary = useCallback((rule: HsfRuleWithCfg): string => {
    let entry = substatSummaryCacheRef.current.get(rule)
    if (!entry) {
      entry = {}
      substatSummaryCacheRef.current.set(rule, entry)
    }
    if (statButtonBorders) {
      if (entry.withButtons === undefined) {
        entry.withButtons = formatRuleSubstatSummary(rule.Substats, t) || ''
      }
      return entry.withButtons ?? ''
    }
    if (entry.plain === undefined) {
      entry.plain = formatRuleSubstatPlain(rule.Substats, t) || ''
    }
    return entry.plain ?? ''
  }, [statButtonBorders, t])

  const getSubstatTooltipSummary = useCallback((rule: HsfRuleWithCfg): string => {
    let entry = substatSummaryCacheRef.current.get(rule)
    if (!entry) {
      entry = {}
      substatSummaryCacheRef.current.set(rule, entry)
    }
    if (entry.withButtons === undefined) {
      entry.withButtons = formatRuleSubstatSummary(rule.Substats, t) || ''
    }
    return entry.withButtons ?? ''
  }, [t])

  const getArtifactTypeLabel = useCallback((rule: HsfRuleWithCfg): string => {
    let cached = artifactTypeLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const ids = getSortedArtifactTypes(rule)
      cached = ids.map((id) => t(artifactTypeI18nKey(id))).join(', ')
      artifactTypeLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [getSortedArtifactTypes, t])

  const getArtifactSetLabel = useCallback((rule: HsfRuleWithCfg): string => {
    if (rule.__allKnownSets) return t('setAllKnownShorthand')
    let cached = artifactSetLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const ids = getSortedArtifactSets(rule)
      cached = ids.map((id) => t(artifactSetI18nKey(id))).join(', ')
      artifactSetLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [getSortedArtifactSets, t])

  const getRankRarityLabel = useCallback((rule: HsfRuleWithCfg): string => {
    let cached = rankRarityLabelCacheRef.current.get(rule)
    if (cached === undefined) {
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
      cached = [rank, rarity].filter(Boolean).join(NBSP)
      rankRarityLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [t])

  const getFactionLabel = useCallback((rule: HsfRuleWithCfg): string => {
    let cached = factionLabelCacheRef.current.get(rule)
    if (cached === undefined) {
      const fc = Number(rule.Faction)
      cached = fc && fc !== 0 ? t(factionI18nKey(fc as FactionId)) : ''
      factionLabelCacheRef.current.set(rule, cached)
    }
    return cached
  }, [t])

  type ConfigRuleSpan = { first: number; last: number; count: number }
  const configRuleSpanMap = useMemo<Map<number, ConfigRuleSpan>>(() => {
    const spans = new Map<number, ConfigRuleSpan>()
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i] as HsfRuleWithCfg | undefined
      if (!rule) continue
      const cfgIdx = rule.__cfgIdx
      if (typeof cfgIdx !== 'number' || Number.isNaN(cfgIdx)) continue
      const existing = spans.get(cfgIdx)
      if (existing) {
        existing.last = i
        existing.count += 1
      } else {
        spans.set(cfgIdx, { first: i, last: i, count: 1 })
      }
    }
    return spans
  }, [rules])

  const getConfigSpan = useCallback((cfgIdx: number): ConfigRuleSpan | null => {
    return configRuleSpanMap.get(cfgIdx) ?? null
  }, [configRuleSpanMap])

  // Gate hover highlighting to the table area only
  const [isHoveringArea, setIsHoveringArea] = useState(false)
  // DOM-based hover highlight to avoid re-rendering rows during hover.
  const lastDomHoverCfgRef = useRef<number | null>(null)
  const hoveredRowElsRef = useRef<HTMLElement[] | null>(null)
  const lastPropagatedHoverRef = useRef<number | null>(null)
  const hoverThrottleTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const hoverRafIdRef = useRef<number | null>(null)
  const pendingLocalHoverRef = useRef<number | null>(null)
  const pendingHoverTargetRef = useRef<number | null>(null)
  const selectedRowElsRef = useRef<HTMLElement[] | null>(null)
  const lastSelectedCfgRef = useRef<number | null>(null)
  const applyDomSelection = useCallback((cfgIdx: number | null) => {
    const container = tableContainerRef.current
    if (!container) {
      lastSelectedCfgRef.current = cfgIdx
      return
    }
    if (selectedRowElsRef.current) {
      for (const el of selectedRowElsRef.current) {
        try { el.removeAttribute('data-selected-cfg') } catch {}
      }
      selectedRowElsRef.current = null
    }
    lastSelectedCfgRef.current = cfgIdx
    if (cfgIdx === null || cfgIdx === undefined) return
    const list = Array.from(container.querySelectorAll(`tr[data-cfg-idx="${cfgIdx}"]`)) as HTMLElement[]
    if (!list.length) return
    selectedRowElsRef.current = list
    for (const el of list) {
      try { el.setAttribute('data-selected-cfg', 'true') } catch {}
    }
  }, [])
  const scheduleHoverPropagation = (next: number | null) => {
    if (lastPropagatedHoverRef.current === next) {
      return
    }
    if (hoverThrottleTimerRef.current !== null) {
      const previousPending = pendingHoverTargetRef.current ?? null
      if (previousPending === next) {
        return
      }
      pendingHoverTargetRef.current = next
      return
    }
    pendingHoverTargetRef.current = next
    // Use a lightweight timeout to coalesce rapid row-enter events before
    // notifying the builder side; this keeps React state updates bounded
    // when users scrub the table quickly.
    hoverThrottleTimerRef.current = window.setTimeout(() => {
      hoverThrottleTimerRef.current = null
      const target = pendingHoverTargetRef.current ?? null
      const prevPropagated = lastPropagatedHoverRef.current
      if (target === prevPropagated) {
        lastPropagatedHoverRef.current = target
        pendingHoverTargetRef.current = target
        return
      }
      lastPropagatedHoverRef.current = target
      pendingHoverTargetRef.current = target
      try { setHoveredCfgIdx(target) } catch {}
    }, RULES_TABLE_HOVER_PROPAGATION_MS)
  }

  // Per-frame throttle for local hover updates (row highlight). Coalesces rapid
  // mouseenter events into a single state update per animation frame.
  const applyDomHover = (cfgIdx: number | null) => {
    const container = tableContainerRef.current
    if (!container) return
    if (hoveredRowElsRef.current) {
      for (const el of hoveredRowElsRef.current) { try { el.classList.remove('cfg-hover') } catch {} }
      hoveredRowElsRef.current = null
    }
    lastDomHoverCfgRef.current = cfgIdx
    if (cfgIdx === null || cfgIdx === undefined) {
      return
    }
    const list = Array.from(container.querySelectorAll(`tr[data-cfg-idx="${cfgIdx}"]`)) as HTMLElement[]
    for (const el of list) { try { el.classList.add('cfg-hover') } catch {} }
    hoveredRowElsRef.current = list
  }
  const scheduleLocalHover = (next: number | null) => {
    pendingLocalHoverRef.current = next
    if (hoverRafIdRef.current !== null) {
      return
    }
    // Keep the DOM-highlight work inside rAF so browsers can batch style
    // recalculations with the table virtualization updates.
    hoverRafIdRef.current = requestAnimationFrame(() => {
      hoverRafIdRef.current = null
      const target = pendingLocalHoverRef.current ?? null
      if (target !== lastDomHoverCfgRef.current) applyDomHover(target)
      scheduleHoverPropagation(target)
    })
  }
  useEffect(() => () => {
    if (hoverThrottleTimerRef.current) {
      clearTimeout(hoverThrottleTimerRef.current)
      hoverThrottleTimerRef.current = null
    }
    if (hoverRafIdRef.current !== null) {
      try { cancelAnimationFrame(hoverRafIdRef.current) } catch {}
      hoverRafIdRef.current = null
    }
  }, [])

  useEffect(() => {
    applyDomSelection(multiselectActive ? null : selectedCfgIdx)
  }, [selectedCfgIdx, multiselectActive, applyDomSelection])

  useEffect(() => {
    // Virtualization swaps row elements as the user scrolls; reapply the hover class so
    // newly mounted rows for the active config keep their highlight without extra renders.
    const hovered = lastDomHoverCfgRef.current
    if (hovered !== null && hovered !== undefined) {
      applyDomHover(hovered)
    }
    applyDomSelection(lastSelectedCfgRef.current ?? null)
  })

  // Measured row height to match actual rendered size (accounts for borders/fonts/icons).
  // Placed early so selection scrolling can consult an up-to-date value.
  const [fixedRowH, setFixedRowH] = useState(DEFAULT_FIXED_ROW_HEIGHT_PX)
  const fixedRowHRef = useRef(DEFAULT_FIXED_ROW_HEIGHT_PX)
  // Mirror the latest measured height onto the ref so async scroll handlers read current values.
  fixedRowHRef.current = fixedRowH

  // Context menus
  const [headerMenu, setHeaderMenu] = useState<null | { open: boolean; x: number; y: number }>(null)
  const [rowMenu, setRowMenu] = useState<null | { open: boolean; x: number; y: number; cfgIdx: number | null; source: RuleSource }>(null)
  const headerMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const rowMenuPaperRef = useRef<HTMLDivElement | null>(null)
  const closeHeaderMenu = useCallback(() => { setHeaderMenu(null) }, [setHeaderMenu])
  const closeRowMenu = useCallback(() => { setRowMenu(null) }, [setRowMenu])
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(headerMenu?.open),
    onClose: closeHeaderMenu,
    menuRef: headerMenuPaperRef,
  })
  useContextMenuCloseOnOutsideRightClick({
    open: Boolean(rowMenu?.open),
    onClose: closeRowMenu,
    menuRef: rowMenuPaperRef,
  })
  const {
    shouldShow: showRulesHeaderHint,
    markSeen: markRulesHeaderHintSeen,
  } = useContextMenuHint('rulesTableHeader')
  const {
    shouldShow: showRulesRowHint,
    markSeen: markRulesRowHintSeen,
  } = useContextMenuHint('rulesTableRows')
  const [headerHintPos, setHeaderHintPos] = useState<{ x: number; y: number } | null>(null)
  const [rowHintPos, setRowHintPos] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!showRulesHeaderHint) setHeaderHintPos(null)
  }, [showRulesHeaderHint])
  useEffect(() => {
    if (!showRulesRowHint) setRowHintPos(null)
  }, [showRulesRowHint])

  // Header drag-to-reorder support
  const dragSrcIdxRef = useRef<number | null>(null)
  const onHeaderDragStart = (srcIdx: number) => { dragSrcIdxRef.current = srcIdx }
  const onHeaderDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const onHeaderDrop = (dstIdx: number) => {
    const srcIdx = dragSrcIdxRef.current
    dragSrcIdxRef.current = null
    if (srcIdx === null || srcIdx === dstIdx) return
    updateColumns(prev => {
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
      updateColumns(prev => prev.map((c, i) => (i === st.idx ? { ...c, width: Math.floor(nextW) } : c)))
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
    const span = getConfigSpan(cfgIdx)
    if (!span) return null
    const { first, last, count } = span
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
  }, [getConfigSpan])
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
    const span = getConfigSpan(cfgIdx)
    const index = span?.first ?? -1
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
  }, [getConfigSpan, rules.length, wrapRows])
  useEffect(() => {
    if (selectedCfgIdx === null || selectedCfgIdx === undefined) return
    if (multiselectActive) return
    // If selection came from a table row click, skip this one automatic scroll
    if (suppressNextScrollRef.current) { suppressNextScrollRef.current = false; return }
    const span = getConfigSpan(selectedCfgIdx as number)
    const idx = span?.first ?? -1
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
  }, [selectedCfgIdx, wrapRows, multiselectActive, fixedRowH, computeSingleLineVisibilityForConfig, getConfigSpan, rules.length])

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

  useEffect(() => {
    const container = tableContainerRef.current
    const nextMetrics = { length: rules.length, totalHeight: totalHeightRef.current }
    const prev = prevRulesMetricsRef.current
    prevRulesMetricsRef.current = nextMetrics
    if (!container || !prev) return
    const viewport = viewportHRef.current || container.clientHeight || 0
    if (viewport <= 0) return
    const currentTop = container.scrollTop
    const maxTop = Math.max(0, nextMetrics.totalHeight - viewport)
    const overscrolled = currentTop > maxTop + 1
    const listShrunk = nextMetrics.length < prev.length
    const heightShrunk = nextMetrics.totalHeight < prev.totalHeight - 1
    let jumpToTop = nextMetrics.length === 0
    if (!jumpToTop && !wrapRows && (listShrunk || heightShrunk)) {
      const rowH = fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX
      if (rowH > 0) {
        const approxTopIndex = Math.floor(currentTop / rowH)
        if (approxTopIndex >= nextMetrics.length) jumpToTop = true
      }
    }
    if (!overscrolled && !jumpToTop) return
    const targetTop = jumpToTop ? 0 : Math.min(currentTop, maxTop)
    if (container.scrollTop !== targetTop) {
      try { container.scrollTo({ top: targetTop, behavior: 'auto' }) } catch { container.scrollTop = targetTop }
    }
    lastScrollTopRef.current = targetTop
    setScrollTop(targetTop)
  }, [rules.length, heightsVersion, wrapRows])

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
      if (!scrollRangeVisibleRef.current) {
        scrollRangeVisibleRef.current = true
        setShowScrollRangeHint(true)
      }
      if (scrollRangeHideTimerRef.current) {
        clearTimeout(scrollRangeHideTimerRef.current)
        scrollRangeHideTimerRef.current = null
      }
      scrollRangeHideTimerRef.current = window.setTimeout(() => {
        scrollRangeVisibleRef.current = false
        setShowScrollRangeHint(false)
        scrollRangeHideTimerRef.current = null
      }, RULES_TABLE_SCROLL_HINT_HIDE_MS)
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
      if (scrollRangeHideTimerRef.current) { clearTimeout(scrollRangeHideTimerRef.current); scrollRangeHideTimerRef.current = null }
    }
  }, [])

  // When row heights are recomputed (wrap mode), re-attempt alignment if a scroll is pending.
  useEffect(() => {
    if (!wrapRows) return
    if (pendingScrollRef.current) attemptScrollAlign()
  }, [heightsVersion, wrapRows, attemptScrollAlign])

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
  const defaultCols = useMemo<ColCfg[]>(() => ([
    { key: 'Idx', label: 'Idx', width: 72, visible: true },
    { key: 'CfgIdx', label: 'Cfg', width: 56, visible: true },
    { key: 'Keep', label: 'Keep', width: 61, visible: false },
    { key: 'Use', label: 'Use', width: 50, visible: false },
    { key: 'ArtifactSetNames', label: 'Sets', width: 170, visible: true },
    { key: 'ArtifactTypeNames', label: 'Slot', width: 100, visible: true },
    { key: 'RankRarity', label: 'Rank/Rarity', width: 160, visible: true },
    { key: 'MainStatName', label: 'Main', width: 75, visible: true },
    { key: 'LevelLabel', label: 'Level', width: 75, visible: true },
    // Default to hidden; users can opt-in via the header menu or auto mode.
    { key: 'Faction', label: 'Faction', width: 70, visible: false, mode: 'hide' },
    { key: 'SubstatsSummary', label: 'Sub', width: 340, visible: true },
  ]), [])
  const [storedCols, setStoredCols] = useRulesTableColumnsPreference()

  const restoreColumns = useCallback((prefs: StoredColumnConfig[]): ColCfg[] => {
    const map = new Map<string, ColCfg>()
    for (const d of defaultCols) map.set(String(d.key), d)
    const restored: ColCfg[] = []
    for (const pref of prefs) {
      const key = pref.key as ColKey | undefined
      const base = key ? map.get(String(key)) : undefined
      if (!base) continue
      const width = Number(pref.width ?? base.width) || base.width
      const visible = typeof pref.visible === 'boolean' ? pref.visible : base.visible
      const modeMaybe = pref.mode === 'auto' || pref.mode === 'show' || pref.mode === 'hide' ? pref.mode : base.mode
      const next: ColCfg = { ...base, width, visible, ...(modeMaybe !== undefined ? { mode: modeMaybe } : {}) }
      restored.push(next)
    }
    for (const d of defaultCols) if (!restored.find(x => x.key === d.key)) restored.push(d)
    const idxRR = restored.findIndex(c => c.key === 'RankRarity')
    const idxMain = restored.findIndex(c => c.key === 'MainStatName')
    if (idxRR !== -1 && idxMain !== -1 && idxRR > idxMain) {
      const rr = restored.splice(idxRR, 1)[0]!
      restored.splice(idxMain, 0, rr)
    }
    return restored
  }, [defaultCols])

  const columnsEqual = useCallback((a: ColCfg[], b: ColCfg[]) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      const left = a[i]!
      const right = b[i]!
      if (left.key !== right.key) return false
      if (left.width !== right.width) return false
      if (Boolean(left.visible) !== Boolean(right.visible)) return false
      if ((left.mode ?? 'auto') !== (right.mode ?? 'auto')) return false
    }
    return true
  }, [])

  const toStoredColumns = useCallback((colsInput: ColCfg[]): StoredColumnConfig[] => (
    colsInput.map(({ key, label, width, visible, mode }) => ({
      key: String(key),
      label,
      width,
      visible,
      ...(mode ? { mode } : {}),
    }))
  ), [])

  const cols = useMemo(() => restoreColumns(storedCols), [restoreColumns, storedCols])

  const updateColumns = useCallback((updater: (prev: ColCfg[]) => ColCfg[]) => {
    setStoredCols((prevPrefs) => {
      const prevCols = restoreColumns(prevPrefs)
      const nextCols = updater(prevCols)
      if (columnsEqual(prevCols, nextCols)) return prevPrefs
      return toStoredColumns(nextCols)
    })
  }, [columnsEqual, restoreColumns, setStoredCols, toStoredColumns])

  const updateFactionColumnMode = React.useCallback((columnIndex: number, currentMode: ColMode) => {
    const nextMode: ColMode = currentMode === 'auto' ? 'show' : (currentMode === 'show' ? 'hide' : 'auto')
    updateColumns(prev => prev.map((col, i) => (i === columnIndex ? { ...col, mode: nextMode } : col)))
  }, [updateColumns])
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

  let scrollRangeOverlay: { start: number; end: number; total: number } | null = null

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
      sx={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', position: 'relative' }}
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
        onMouseMove={(e) => {
          if (!showRulesRowHint || rowMenu?.open) return
          const target = e.target as HTMLElement | null
          if (target && target.closest('thead')) {
            setRowHintPos(null)
            return
          }
          setHeaderHintPos(null)
          const container = tableContainerRef.current
          if (container) {
            const rect = container.getBoundingClientRect()
            const withinContentX = e.clientX >= (rect.left + container.clientLeft)
              && e.clientX < (rect.left + container.clientLeft + container.clientWidth)
            const withinContentY = e.clientY >= (rect.top + container.clientTop)
              && e.clientY < (rect.top + container.clientTop + container.clientHeight)
            // Ignore scrollbar gutter regions so the hint only appears where a context menu can open.
            if (!withinContentX || !withinContentY) {
              setRowHintPos(null)
              return
            }
          }
          setRowHintPos({ x: e.clientX, y: e.clientY })
        }}
        onMouseLeave={() => {
          setHeaderHintPos(null)
          setRowHintPos(null)
        }}
      >
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', width: '100%' }}>
          <TableHead
            data-tour-id="preview.header"
            onContextMenu={(e) => {
              try {
                e.preventDefault()
                e.stopPropagation()
              } catch {}
              markRulesHeaderHintSeen()
              setHeaderHintPos(null)
              setRowHintPos(null)
              closeRowMenu()
              setHeaderMenu({ open: true, x: e.clientX, y: e.clientY })
            }}
            onMouseMove={(e) => {
              if (!showRulesHeaderHint || headerMenu?.open) return
              setRowHintPos(null)
              setHeaderHintPos({ x: e.clientX, y: e.clientY })
            }}
            onMouseLeave={() => setHeaderHintPos(null)}
          >
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
              scrollRangeOverlay = null
              const visibleCols = visibleColsForContainer
              const colSpan = Math.max(1, visibleCols.length)
              // Smaller overscan during fast scroll to reduce render cost; increase when idle
              const overscan = fastScroll ? RULES_TABLE_OVERSCAN_FAST : RULES_TABLE_OVERSCAN_IDLE
              // When there are no rules, render a single placeholder row to communicate state.
              if (rules.length === 0) {
                const limitText = new Intl.NumberFormat(undefined).format(RULE_COUNT_LIMIT)
                const emptyLabel = limitExceeded
                  ? t('rulesLimitExceeded', { limit: limitText })
                  : (emptyDueToFilter ? t('rulesEmptyFiltered') : t('rulesEmpty'))
                return (
                  <TableRow>
                    <TableCell colSpan={colSpan} sx={{ textAlign: 'center', color: 'text.secondary', py: 3 }}>
                      {emptyLabel}
                    </TableCell>
                  </TableRow>
                )
              }
              let start = 0, end = rules.length, padTop = 0, padBottom = 0
              let visibleStartIdx = 0
              let visibleEndIdxExclusive = rules.length
              const shouldVirtualize = rules.length > VIRTUALIZE_AFTER_RULES
              const resolveViewport = () => {
                if (viewportH && viewportH > 0) return viewportH
                if (viewportHRef.current && viewportHRef.current > 0) return viewportHRef.current
                const container = tableContainerRef.current
                return container ? container.clientHeight : 0
              }
              const upperBound = (arr: number[], x: number) => {
                let lo = 0, hi = arr.length - 1, ans = arr.length
                while (lo <= hi) {
                  const mid = (lo + hi) >>> 1
                  const v = arr[mid] ?? Number.POSITIVE_INFINITY
                  if (v > x) { ans = mid; hi = mid - 1 } else { lo = mid + 1 }
                }
                return ans
              }
              if (shouldVirtualize) {
                if (!wrapRows) {
                  const rowH = fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX
                  const rawVisibleStart = Math.max(0, Math.floor(scrollTop / rowH))
                  const estimatedVisible = Math.max(1, Math.ceil(resolveViewport() / rowH))
                  visibleStartIdx = rawVisibleStart
                  visibleEndIdxExclusive = Math.min(rules.length, rawVisibleStart + estimatedVisible)
                  start = Math.max(0, rawVisibleStart - overscan)
                  // Use floor to avoid +/-1 oscillations when viewport height is near a row multiple
                  const visibleCount = Math.max(0, Math.floor(resolveViewport() / rowH)) + overscan * 2
                  end = Math.min(rules.length, start + visibleCount)
                  padTop = start * fixedRowH
                  padBottom = (rules.length - end) * fixedRowH
                } else {
                  const pref = prefixHeightsRef.current
                  const total = totalHeightRef.current
                  const viewportPx = Math.max(1, resolveViewport())
                  const viewBot = Math.min(total, scrollTop + viewportPx)
                  const firstVisible = Math.max(0, upperBound(pref, scrollTop) - 1)
                  const lastVisibleExclusive = upperBound(pref, viewBot)
                  visibleStartIdx = firstVisible
                  visibleEndIdxExclusive = Math.max(firstVisible, lastVisibleExclusive)
                  start = Math.max(0, firstVisible - overscan)
                  end = Math.min(rules.length, lastVisibleExclusive + overscan)
                  padTop = pref[start] || 0
                  const endOffset = pref[end] || total
                  padBottom = Math.max(0, total - endOffset)
                }
              } else if (rules.length > 0) {
                if (!wrapRows) {
                  const rowH = fixedRowHRef.current || DEFAULT_FIXED_ROW_HEIGHT_PX
                  if (rowH > 0) {
                    const viewportPx = Math.max(rowH, resolveViewport())
                    const approxStart = Math.max(0, Math.floor(scrollTop / rowH))
                    const approxEnd = Math.max(approxStart + 1, Math.ceil((scrollTop + viewportPx) / rowH))
                    visibleStartIdx = Math.min(rules.length - 1, approxStart)
                    visibleEndIdxExclusive = Math.min(rules.length, approxEnd)
                  }
                } else {
                  const pref = prefixHeightsRef.current
                  const total = totalHeightRef.current
                  const viewportPx = Math.max(1, resolveViewport())
                  const viewBot = Math.min(total, scrollTop + viewportPx)
                  const firstVisible = Math.max(0, upperBound(pref, scrollTop) - 1)
                  const lastVisibleExclusive = Math.max(firstVisible + 1, upperBound(pref, viewBot))
                  visibleStartIdx = Math.min(rules.length - 1, firstVisible)
                  visibleEndIdxExclusive = Math.min(rules.length, lastVisibleExclusive)
                }
              }
              const rows = shouldVirtualize ? rules.slice(start, end) : rules
              const baseIndex = shouldVirtualize ? start : 0
              const spacerSx = { p: 0, border: 0, height: 0 }
              let firstVisibleLineIdx: number | null = null
              let lastVisibleLineIdx: number | null = null
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
                    const cfgIdxRaw = rule.__cfgIdx
                    const cfgIdxNumber = (typeof cfgIdxRaw === 'number' && Number.isFinite(cfgIdxRaw)) ? cfgIdxRaw : null
                    const lineIdx = typeof rule.__lineIdx === 'number' ? rule.__lineIdx : idx
                    if (idx >= visibleStartIdx && idx < visibleEndIdxExclusive) {
                      const lineForRange = lineIdx
                      if (firstVisibleLineIdx === null || lineForRange < firstVisibleLineIdx) firstVisibleLineIdx = lineForRange
                      if (lastVisibleLineIdx === null || lineForRange > lastVisibleLineIdx) lastVisibleLineIdx = lineForRange
                    }
                    const resolvedSource: RuleSource = (() => {
                      if (rule.__source === RULE_SOURCE_HSF || rule.__source === RULE_SOURCE_HSFC || rule.__source === RULE_SOURCE_FINAL_SELL) {
                        return rule.__source
                      }
                      if (cfgIdxNumber !== null) return RULE_SOURCE_HSFC
                      return RULE_SOURCE_HSF
                    })()
                return (
                <TableRow
                  key={idx}
                  hover
                  data-row-index={idx}
                  {...(cfgIdxNumber !== null ? { 'data-cfg-idx': String(cfgIdxNumber) } : {})}
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
                    const next = cfgIdxNumber
                    scheduleLocalHover(next)
                  }}
                  // Do not clear on row leave; container onMouseLeave clears once.
                  onClick={() => {
                    if (cfgIdxNumber !== null) {
                      // Mark that selection originated from table row; suppress auto-scroll once
                      suppressNextScrollRef.current = true
                      onSelectCfgIdx(cfgIdxNumber)
                    }
                  }}
                  onContextMenu={(e) => {
                    try {
                      e.preventDefault()
                      e.stopPropagation()
                    } catch {}
                    markRulesRowHintSeen()
                    setRowHintPos(null)
                    closeHeaderMenu()
                    setRowMenu({
                      open: true,
                      x: e.clientX,
                      y: e.clientY,
                      cfgIdx: cfgIdxNumber,
                      source: resolvedSource,
                    })
                  }}
                  onMouseMove={(e) => {
                    if (!showRulesRowHint || rowMenu?.open) return
                    setHeaderHintPos(null)
                    setRowHintPos({ x: e.clientX, y: e.clientY })
                  }}
                  sx={(theme) => ({
                    height: !wrapRows ? fixedRowH : undefined,
                    textDecoration: rule.Use === false ? 'line-through' : 'none',
                    '&[data-selected-cfg="true"]': {
                      backgroundColor: theme.palette.action.selected,
                    },
                  })}
                >
                      {visibleCols.map((c) => {
                        let value: string = ''
                        let factionLabel: string | null = null
                        if (c.key === 'SubstatsSummary') value = getSubstatSummary(rule)
                        else if (c.key === 'CfgIdx') value = (cfgIdxNumber !== null) ? String(cfgIdxNumber + 1) : ''
                        else if (c.key === 'Keep') value = rule.Keep ? t('keepValueKeep') : t('keepValueSell')
                        else if (c.key === 'Use') value = rule.Use ? '✓' : '-'
                    else if (c.key === 'ArtifactTypeNames') {
                      value = getArtifactTypeLabel(rule)
                    }
                    else if (c.key === 'ArtifactSetNames') {
                      value = getArtifactSetLabel(rule)
                    }
                    else if (c.key === 'RankRarity') {
                      value = getRankRarityLabel(rule)
                    }
                    else if (c.key === 'Faction') {
                      const label = getFactionLabel(rule)
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
                              colorize={statButtonBorders}
                            />
                          )
                          : (value || '')
                        // Replace textual slots with icons when enabled
                        if (c.key === 'ArtifactTypeNames' && showSlotIcons) {
                          const types = getSortedArtifactTypes(rule)
                          const tooltipTitle = getArtifactTypeLabel(rule)
                          content = (
                            <Tooltip title={tooltipTitle}>
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
                                    width: '100%',
                                    minWidth: `${FACTION_ICON_PREVIEW_PX}px`,
                                    height: `${FACTION_ICON_PREVIEW_PX}px`,
                                    position: 'relative',
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
                        if (c.key === 'ArtifactSetNames') {
                          const allKnown = Boolean(rule.__allKnownSets)
                          if (allKnown) {
                            const label = t('setAllKnownShorthand')
                            content = (
                              <EllipsisTooltip title={label} wrap="block">
                                <span
                                  data-ellipsis-target
                                  style={{
                                    display: 'inline-block',
                                    width: '100%',
                                    overflow: 'hidden',
                                    textOverflow: wrapRows ? 'clip' : 'ellipsis',
                                    whiteSpace: wrapRows ? 'normal' : 'nowrap',
                                    textDecoration: strike ? 'line-through' : 'none',
                                    transform: `translateY(${SINGLE_LINE_PREVIEW_OFFSET_PX}px)`,
                                  }}
                                >
                                  {content}
                                </span>
                              </EllipsisTooltip>
                            )
                          } else if (showSetIcons) {
                            const setIds = getSortedArtifactSets(rule)
                            const setEntries = setIds.map((id) => ({ id, label: artifactSetName(id) }))
                            const tooltipTitle = getArtifactSetLabel(rule)
                            content = (
                              <Tooltip title={tooltipTitle}>
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexWrap: wrapRows ? 'wrap' : 'nowrap', maxWidth: '100%', overflow: wrapRows ? 'visible' : 'hidden', whiteSpace: wrapRows ? 'normal' : 'nowrap' }}>
                                  {(() => {
                                    if (wrapRows) return setEntries.map(({ id, label }, i) => (
                                      <SetIcon key={`${id}-${i}`} setId={id} label={label} sx={{ mr: 0 }} />
                                    ))
                                    const PAD_X = 12
                                    const GAP_PX = 2
                                    const unit = SET_ICON_PX + GAP_PX
                                    const avail = Math.max(0, (c.width || 0) - PAD_X)
                                    const capacity = Math.max(0, Math.floor(avail / unit))
                                    const needsEllipsis = setEntries.length > capacity
                                    const visibleCount = needsEllipsis ? Math.max(0, capacity - 1) : Math.min(setEntries.length, capacity)
                                    const vis = setEntries.slice(0, visibleCount)
                                    const overflow = Math.max(0, setEntries.length - visibleCount)
                                    return (
                                      <>
                                        {vis.map(({ id, label }, i) => (
                                          <SetIcon key={`${id}-${i}`} setId={id} label={label} sx={{ mr: 0 }} />
                                        ))}
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
                            <Tooltip title={getSubstatTooltipSummary(rule) || ''}>
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
                                  transform: `translateY(${SINGLE_LINE_PREVIEW_OFFSET_PX}px)`,
                                }}
                              >{content}</span>
                            </EllipsisTooltip>
                          )
                        }
                        const alignY = wrapRows ? 'flex-start' : 'center'
                        // Allow faction icon halos to bleed outside the cell without
                        // forcing the row height to grow in single-line mode.
                        const factionIconOverflow = (!wrapRows && c.key === 'Faction' && showFactionIcons)
                        return (
                          <TableCell
                            key={String(c.key)}
                            sx={{
                              fontFamily: isSub ? 'inherit' : 'ui-monospace, monospace',
                              fontSize: FONT_SIZE_BASE_PX,
                              width: c.width,
                              color: isIdx ? (keep ? 'success.main' : 'warning.main') : undefined,
                              textDecoration: strike ? 'line-through' : 'none',
                              overflow: wrapRows || factionIconOverflow ? 'visible' : 'hidden',
                              textOverflow: wrapRows || factionIconOverflow ? 'clip' : 'ellipsis',
                              whiteSpace: wrapRows ? 'normal' : 'nowrap',
                              wordBreak: wrapRows ? 'break-word' : 'normal',
                            }}
                          >
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: alignY,
                                height: wrapRows ? 'auto' : '100%',
                                width: '100%',
                                overflow: wrapRows || factionIconOverflow ? 'visible' : 'hidden',
                                textOverflow: wrapRows || factionIconOverflow ? 'clip' : 'ellipsis',
                                whiteSpace: wrapRows ? 'normal' : 'nowrap',
                              }}
                            >
                              {cellInner}
                            </Box>
                          </TableCell>
                        )
                      })}
                </TableRow>
                    )
                  })}
                  {(() => {
                    if (rules.length === 0) return null
                    const fallbackFirstLine = (() => {
                      if (rows.length === 0) return null
                      const firstRule = rows[0] as HsfRuleWithCfg
                      if (typeof firstRule.__lineIdx === 'number') return firstRule.__lineIdx
                      return baseIndex
                    })()
                    const fallbackLastLine = (() => {
                      if (rows.length === 0) return null
                      const lastRule = rows[rows.length - 1] as HsfRuleWithCfg
                      if (typeof lastRule.__lineIdx === 'number') return lastRule.__lineIdx
                      return baseIndex + rows.length - 1
                    })()
                    const resolvedFirst = firstVisibleLineIdx ?? fallbackFirstLine
                    const resolvedLast = lastVisibleLineIdx ?? fallbackLastLine
                    if (resolvedFirst === null || resolvedLast === null) return null
                    const rangeStart = Math.min(resolvedFirst, resolvedLast) + 1
                    const rangeEnd = Math.max(resolvedFirst, resolvedLast) + 1
                    scrollRangeOverlay = { start: rangeStart, end: rangeEnd, total: rules.length }
                    return null
                  })()}
                  {padBottom > 0 && (
                    <TableRow key="spacer-bottom" sx={{ height: padBottom }}>
                      <TableCell colSpan={colSpan} sx={spacerSx} />
                    </TableRow>
                  )}
                </>
              )
            })()}
          </TableBody>
        </Table>
      </TableContainer>
      {scrollRangeOverlay ? (() => {
        const { start, end, total } = scrollRangeOverlay
        const startLabel = start.toLocaleString()
        const endLabel = end.toLocaleString()
        const totalLabel = total.toLocaleString()
        const label = start === end
          ? t('previewScrollRangeHintSingle', { start: startLabel, total: totalLabel })
          : t('previewScrollRangeHintRange', { start: startLabel, end: endLabel, total: totalLabel })
        return (
          <Box
            aria-hidden={!showScrollRangeHint}
            aria-live="polite"
            sx={(theme) => ({
              position: 'absolute',
              top: theme.spacing(1.5),
              right: theme.spacing(1.5),
              zIndex: theme.zIndex.tooltip,
              pointerEvents: 'none',
              px: 1.25,
              py: 0.5,
              borderRadius: theme.shape.borderRadius,
              backgroundColor: alpha(theme.palette.background.paper, theme.palette.mode === 'dark' ? 0.9 : 0.92),
              boxShadow: theme.shadows[3],
              color: theme.palette.text.primary,
              transition: theme.transitions.create(['opacity', 'transform'], { duration: theme.transitions.duration.shorter }),
              opacity: showScrollRangeHint ? 1 : 0,
              transform: showScrollRangeHint ? 'translateY(0)' : 'translateY(-6px)',
            })}
          >
            <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: 0.15 }}>
              {label}
            </Typography>
          </Box>
        )
      })() : null}
      <ContextMenuHintOverlay text={t('contextMenuHintRulesTableHeader')} position={(showRulesHeaderHint && !headerMenu?.open) ? headerHintPos : null} />
      <ContextMenuHintOverlay text={t('contextMenuHint')} position={(showRulesRowHint && !rowMenu?.open) ? rowHintPos : null} />
      
      {/* Header context menu (columns + wrap toggle) */}
      <Menu
        open={Boolean(headerMenu?.open)}
        onClose={closeHeaderMenu}
        anchorReference="anchorPosition"
        {...(headerMenu?.open ? { anchorPosition: { top: headerMenu.y, left: headerMenu.x } } : {})}
        slotProps={{
          paper: {
            component: ContextMenuPaper,
            onRequestClose: closeHeaderMenu,
            closeLabel: t('close'),
            ref: headerMenuPaperRef,
            'data-tour-id': 'preview.header.menu',
          } as unknown as MuiPaperProps,
        }}
      >
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setWrapRows(!wrapRows)}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuWrapRows')}</Typography>
          <Button
            size="small"
            variant={wrapRows ? 'contained' : 'outlined'}
            color="success"
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
            color="success"
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
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowFactionIcons(!showFactionIcons) }}
          >{showFactionIcons ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setShowSetIcons(!showSetIcons)}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuSetsAsIcons')}</Typography>
          <Button
            size="small"
            variant={showSetIcons ? 'contained' : 'outlined'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => { e.stopPropagation(); setShowSetIcons(!showSetIcons) }}
          >{showSetIcons ? t('commonOn') : t('commonOff')}</Button>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={() => setStatButtonBorders(!statButtonBorders)}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuColorStatTexts')}</Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 0.5,
              width: MENU_CONTROL_MIN_WIDTH_PX,
              height: MENU_CONTROL_HEIGHT_PX,
              minHeight: MENU_CONTROL_HEIGHT_PX,
            }}
            onClick={(e) => { e.stopPropagation() }}
          >
            <Button
              size="small"
              variant={statButtonBorders ? 'contained' : 'outlined'}
              color="success"
              sx={{ flex: '1 1 auto', minWidth: 0, height: '100%', lineHeight: 1, py: 0, px: 1 }}
              onClick={(e) => { e.stopPropagation(); setStatButtonBorders(!statButtonBorders) }}
            >{statButtonBorders ? t('commonOn') : t('commonOff')}</Button>
            <Tooltip title={t('manageColors')}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="info"
                  disabled={!statButtonBorders}
                  sx={{ flex: '0 0 auto', minWidth: 28, width: 28, height: '100%', lineHeight: 1, py: 0, ml: 'auto', px: 0.25 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!statButtonBorders) return
                    onOpenManageColors()
                  }}
                  aria-label={t('manageColorsAria')}
                >
                  <img src={colorIconSrc} width={16} height={16} alt={t('manageColors')} style={{ display: 'block' }} />
                </Button>
              </span>
            </Tooltip>
          </Box>
        </MenuItem>
        <MenuItem sx={{ gap: 1, alignItems: 'center' }} onClick={(e) => { e.stopPropagation(); applyNextColorBlindMode() }}>
          <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{t('rulesMenuColorBlindPalette')}</Typography>
          <Button
            size="small"
            variant={colorBlindMode === 'normal' ? 'outlined' : 'contained'}
            color="success"
            sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              applyNextColorBlindMode()
            }}
          >{colorBlindMode === 'normal' ? t('colorBlindNormal') : (colorBlindMode === 'okabeIto' ? t('colorBlindOkabeIto') : t('colorBlindTritan'))}</Button>
        </MenuItem>
        <Divider />
        {/* Reset should sit above the column labels list */}
        <Box sx={{ px: 1.5, pt: 1, pb: 0.5, display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => {
              try { localStorage.removeItem(WRAP_ROWS_KEY) } catch {}
              setStoredCols([])
              setWrapRows(false)
              closeHeaderMenu()
            }}
          >{t('headerMenuResetCols')}</Button>
          <Box sx={{ flex: 1 }} />
        </Box>
        {cols.map((c, idx) => {
          const isFaction = c.key === 'Faction'
          const val = isFaction ? (c.mode ?? 'auto') : (c.visible ? 'show' : 'hide')
          return (
            <MenuItem
              key={String(c.key)}
              onClick={(e) => {
                e.stopPropagation()
                if (isFaction) {
                  updateFactionColumnMode(idx, val as ColMode)
                } else {
                  const next = val === 'show' ? 'hide' : 'show'
                  updateColumns(prev => prev.map((x, i) => (i === idx ? { ...x, visible: next === 'show' } : x)))
                }
              }}
              sx={{ gap: 1 }}
            >
              <Typography variant="body2" sx={HEADER_MENU_LABEL_SX}>{colLabel(c.key)}</Typography>
              {isFaction ? (
                <Button
                  size="small"
                  variant={val === 'hide' ? 'outlined' : 'contained'}
                  color={val === 'auto' ? 'info' : 'success'}
                  sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    updateFactionColumnMode(idx, val as ColMode)
                  }}
                >{val === 'auto' ? t('headerMenuAuto') : (val === 'show' ? t('headerMenuShown') : t('headerMenuHidden'))}</Button>
              ) : (
                <Tooltip title={val === 'show' ? t('headerMenuShownInTable') : t('headerMenuHiddenInTable')}>
                  <Button
                    size="small"
                    variant={val === 'show' ? 'contained' : 'outlined'}
                    color="success"
                    startIcon={val === 'show' ? <VisibilityIcon /> : <VisibilityOffIcon />}
                    sx={{ minWidth: MENU_CONTROL_MIN_WIDTH_PX, height: MENU_CONTROL_HEIGHT_PX, minHeight: MENU_CONTROL_HEIGHT_PX, lineHeight: 1, py: 0 }}
                    onClick={(e) => { e.stopPropagation(); const next = val === 'show' ? 'hide' : 'show'; updateColumns(prev => prev.map((x, i) => (i === idx ? { ...x, visible: next === 'show' } : x))) }}
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
        onClose={closeRowMenu}
        anchorReference="anchorPosition"
        {...(rowMenu?.open ? { anchorPosition: { top: rowMenu.y, left: rowMenu.x } } : {})}
        slotProps={{
          paper: {
            component: ContextMenuPaper,
            onRequestClose: closeRowMenu,
            closeLabel: t('close'),
            ref: rowMenuPaperRef,
          } as unknown as MuiPaperProps,
        }}
      >
        {rowMenu?.source === RULE_SOURCE_HSF ? (
          <MenuItem onClick={() => { closeRowMenu(); onClearBase() }}>{t('rowMenuClear')}</MenuItem>
        ) : null}
        {rowMenu?.source === RULE_SOURCE_FINAL_SELL ? (
          <MenuItem onClick={() => { closeRowMenu(); onConfigureFinalSell() }}>{t('rowMenuConfigureFinalSell')}</MenuItem>
        ) : null}
        {rowMenu?.source === RULE_SOURCE_HSFC ? (
          <>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'duplicate') }}>{t('rowMenuDuplicate')}</MenuItem>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'move_top') }}>{t('rowMenuMoveTop')}</MenuItem>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'move_up') }}>{t('rowMenuMoveUp')}</MenuItem>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'move_down') }}>{t('rowMenuMoveDown')}</MenuItem>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'move_bottom') }}>{t('rowMenuMoveBottom')}</MenuItem>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'copy') }}>{t('rowMenuCopy')}</MenuItem>
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'paste_after') }}>{t('rowMenuPasteAfter')}</MenuItem>
            <Divider />
            <MenuItem onClick={() => { const i = rowMenu?.cfgIdx; closeRowMenu(); if (i !== null && i !== undefined) onConfigAction(i, 'delete') }} sx={{ color: 'error.main' }}>{t('rowMenuDelete')}</MenuItem>
          </>
        ) : null}
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
