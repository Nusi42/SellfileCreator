/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - HSFC (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, minima, and autosave
 * - Color management for substat chips and various dialogs
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, hsfToBlob } from './lib/hsfIO'
import { getPushEndpoint } from './lib/runtimeConfig'
import { normalizeExternalCommand, externalArtifactToTestItem, type ExternalCommand } from './lib/externalCommands'
// import { artifactSetNames } from './lib/types'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderConfig, type SellfileVisibility } from './lib/hsfBuilder'
import { parseConfigsFromText, buildReadableConfig, readHsfcFile, buildHsfcPayload, hsfcToBlob, parseHsfcText } from './lib/hsfcIO'
import { COPY_DIALOG_EVENT, writeTextSafe, readTextSafe } from './lib/clipboard'
// Autosave load handled by useAutosaveRestore
import {
  AUTOSAVE_KEY,
  PANEL_WIDTH_PX,
  SIDE_BY_SIDE_BREAKPOINT_PX,
  GRID_COLUMN_GAP_PX,
  BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX,
  BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX,
  BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX,
  FINAL_SELL_DEFAULT_LEVELS,
  SCROLLING_TOOLTIP_HIDE_MS,
  FONT_SIZE_DISPLAY_REM,
  FONT_SIZE_HEADER_META_PX,
  FONT_SIZE_BASE_PX,
} from './lib/constants'
// (Removed local CRC32; autosave utils provide it.)

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Tooltip, Button } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
// ColorField moved into ManageColorsDialog; not used directly here
import { HsfRulesTableMemo } from './components/HsfRulesTable'
// Chips list panel (extracted)
import ConfigChipsPanel from './components/ConfigChipsPanel'
import ConfirmDialogs from './components/ConfirmDialogs'
import BuilderPanel from './components/BuilderPanel'
import CopyDialog from './components/CopyDialog'
import PasteDialog from './components/PasteDialog'
// Markdown preview for HSFC Note (read-only). Requires installation:
//   npm i @uiw/react-md-editor rehype-sanitize @uiw/react-markdown-preview
// Styles are imported globally here.
// If the deps are missing, the app will fail to compile; install them as above.
import NoteDialog from './components/NoteDialog'
import { useManageColorsDialog } from './hooks/useManageColorsDialog'
import { useMinimaDialog } from './hooks/useMinimaDialog'
import { computeMergedRules, buildRulesForConfig, type HsfRuleWithCfg } from './lib/merge'
import FileDragOverlay from './components/FileDragOverlay'
import { useFileDragDrop } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import FinalSellDialog from './components/dialogs/FinalSellDialog'
import HelpDialog from './components/HelpDialog'
import { TutorialCoach, type TutorialStep } from './components/tutorial/TutorialCoach'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import MetasetConflictDialog from './components/dialogs/MetasetConflictDialog'
import { useAutosave } from './hooks/useAutosave'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import RuleTesterDialog from './components/dialogs/RuleTesterDialog'
import RulesFilterPanel from './components/RulesFilterPanel'
import { DEFAULT_RULES_FILTER_STATE, filterHsfRules, isRulesFilterActive, type FilterHsfRulesResult, type RulesFilterState } from './lib/rulesFilter'
import LockIcon from '@mui/icons-material/Lock'
import { useAutosaveRestore } from './hooks/useAutosaveRestore'
import { makeManageColorsIcon } from './lib/icons'
import { sellfileFilename, hsfcFilename } from './lib/filenames'
import { README_SEEN_VERSION_KEY, TUTORIAL_SEEN_VERSION_KEY } from './lib/constants'
import { ArtifactType, StatVariant, ArtifactSet, artifactSetNames } from './lib/types'
import type { Metaset } from './lib/metasets'
import { makeMetasetId, defaultMetasets } from './lib/metasets'
import { DEFAULT_METASET_ICON_ID } from './lib/metasetIcons'
import { defaultMinima } from './lib/hsfBuilder'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/configDuplicates'
import type { TestItem } from './lib/ruleEval'

// Components are organized under src/components

import type { ColorBlindMode } from './lib/constants'

function arraysEqual(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}

export default function App({ colorBlindMode, setColorBlindMode }: { colorBlindMode: ColorBlindMode; setColorBlindMode: (m: ColorBlindMode) => void }) {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  // Shared app state via context — reduces prop drilling and keeps behavior consistent.
  const { customCfgs, selectedCfgIdx, metasets, minima, finalSellRemainder, hsfcNote } = useAppState()
  const { setCustomCfgs, setSelectedCfgIdx, setMetasets, setMinima, setFinalSellRemainder, setHsfcNote } = useAppActions()
  const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  // Multiselect: indices of selected chips; anchor for shift-range
  const [selectedCfgIndices, setSelectedCfgIndices] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [hoveredCfgIdx, setHoveredCfgIdx] = useState<number | null>(null)
  const [noteOpen, setNoteOpen] = useState<boolean>(false)
  const [noteMode, setNoteMode] = useState<'view' | 'edit'>('edit')
  const [pendingTesterItems, setPendingTesterItems] = useState<TestItem[]>([])
  const commandHandlerRef = useRef<(cmd: ExternalCommand) => void>(() => {})
  const commandAbortRef = useRef<AbortController | null>(null)
  // Measure left panel height to cap preview height
  const leftPaperRef = useRef<HTMLDivElement | null>(null)
  const [leftHeight, setLeftHeight] = useState<number>(0)
  // Maintain a floor so both side-by-side panels keep filling the viewport even when the builder content shrinks.
  const [sideBySideMinPaperHeight, setSideBySideMinPaperHeight] = useState<number>(0)
  const sideBySideMinPaperHeightRef = useRef(0)
  useEffect(() => { sideBySideMinPaperHeightRef.current = sideBySideMinPaperHeight }, [sideBySideMinPaperHeight])
  useEffect(() => {
    const el = leftPaperRef.current
    if (!el) return
    const measure = () => { try { setLeftHeight(el.offsetHeight) } catch {} }
    measure()
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure())
      ro.observe(el)
    }
    const onWin = () => measure()
    window.addEventListener('resize', onWin)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', onWin) }
  }, [])

  // Manage Colors dialog state + persisted substat colors
  const { open: colorsDlgOpen, openDialog: openColors, closeDialog: closeColors, substatColors, setSubstatColors, resetColors } = useManageColorsDialog()
  // Usage counts for sets and metasets across current configs
  const setUsageCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const cfg of customCfgs) {
      const sets = cfg.artifactSets ?? []
      const seen = new Set<number>()
      for (const sid of sets) {
        if (seen.has(sid)) continue
        seen.add(sid)
        counts[sid] = (counts[sid] ?? 0) + 1
      }
    }
    return counts
  }, [customCfgs])
  const metasetUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cfg of customCfgs) {
      const metas = cfg.artifactMetaSets ?? []
      const seen = new Set<string>()
      for (const mid of metas) {
        if (seen.has(mid)) continue
        seen.add(mid)
        counts[mid] = (counts[mid] ?? 0) + 1
      }
    }
    return counts
  }, [customCfgs])
  // colorsDlgOpen handled in useManageColorsDialog
  const chipsContainerRef = useRef<HTMLDivElement | null>(null)
  const [isSideBySide, setIsSideBySide] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`).matches
  })
  const isSideBySideRef = useRef(isSideBySide)
  useEffect(() => { isSideBySideRef.current = isSideBySide }, [isSideBySide])
  const [chipsMaxHeight, setChipsMaxHeight] = useState<number>(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  const chipsMaxHeightRef = useRef(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX)
  useEffect(() => { chipsMaxHeightRef.current = chipsMaxHeight }, [chipsMaxHeight])
  // Track the scheduled measurement so resize feedback loops only queue one pass at a time.
  const chipsMeasureQueuedRef = useRef(false)
  const chipsMeasureFrameRef = useRef<number | null>(null)

  const cancelScheduledChipsMeasure = useCallback(() => {
    if (typeof window === 'undefined') return
    if (chipsMeasureFrameRef.current !== null) {
      window.cancelAnimationFrame(chipsMeasureFrameRef.current)
      chipsMeasureFrameRef.current = null
    }
    chipsMeasureQueuedRef.current = false
  }, [])

  const runChipsMeasurement = useCallback(() => {
    if (!isSideBySideRef.current) {
      if (chipsMaxHeightRef.current !== BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX) {
        setChipsMaxHeight(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX)
      }
      return
    }
    const container = chipsContainerRef.current
    const paper = leftPaperRef.current
    if (!container || !paper || typeof window === 'undefined') return
    try {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? document.documentElement?.clientHeight ?? 0
      const paperRect = paper.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const paperAvailable = viewportHeight - paperRect.top - BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX
      const minPaperHeight = Math.max(0, Math.floor(paperAvailable))
      if (sideBySideMinPaperHeightRef.current !== minPaperHeight) {
        sideBySideMinPaperHeightRef.current = minPaperHeight
        setSideBySideMinPaperHeight(minPaperHeight)
      }
      if (!Number.isFinite(paperAvailable) || paperAvailable <= 0) return
      const offsetWithinPaper = containerRect.top - paperRect.top
      const rawAvailable = Math.floor(paperAvailable - offsetWithinPaper)
      const safeAvailable = rawAvailable - BUILDER_CONFIG_CHIPS_SIDE_BY_SIDE_SAFE_GAP_PX
      if (!Number.isFinite(safeAvailable) || safeAvailable <= 0) return
      const next = Math.max(BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX, safeAvailable)
      if (Math.abs(chipsMaxHeightRef.current - next) >= 4) {
        setChipsMaxHeight(next)
      }
    } catch {}
  }, [])

  const scheduleChipsMeasurement = useCallback(() => {
    if (!isSideBySideRef.current || typeof window === 'undefined') return
    if (chipsMeasureQueuedRef.current) return
    chipsMeasureQueuedRef.current = true
    chipsMeasureFrameRef.current = window.requestAnimationFrame(() => {
      chipsMeasureFrameRef.current = null
      chipsMeasureQueuedRef.current = false
      runChipsMeasurement()
    })
  }, [runChipsMeasurement])

  const applySideBySideTransition = useCallback((matches: boolean, { forceSchedule = false }: { forceSchedule?: boolean } = {}) => {
    const prev = isSideBySideRef.current
    if (!forceSchedule && prev === matches) return
    isSideBySideRef.current = matches
    if (prev !== matches) {
      setIsSideBySide(matches)
    }
    if (!matches) {
      cancelScheduledChipsMeasure()
      setSideBySideMinPaperHeight((prev) => (prev === 0 ? prev : 0))
      setChipsMaxHeight((prevHeight) => (prevHeight === BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX ? prevHeight : BUILDER_CONFIG_CHIPS_DEFAULT_MAX_HEIGHT_PX))
      return
    }
    scheduleChipsMeasurement()
  }, [cancelScheduledChipsMeasure, scheduleChipsMeasurement])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(`(min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`)
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => applySideBySideTransition(event.matches)
    // attach listener (addEventListener supported in modern browsers; fall back if needed)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange)
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange)
    }
    applySideBySideTransition(media.matches, { forceSchedule: true })
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', handleChange)
      } else if (typeof media.removeListener === 'function') {
        media.removeListener(handleChange)
      }
    }
  }, [applySideBySideTransition])

  useEffect(() => {
    if (!isSideBySide || typeof window === 'undefined') return
    const handleResize = () => {
      scheduleChipsMeasurement()
    }
    window.addEventListener('resize', handleResize)
    const viewport = window.visualViewport
    if (viewport && typeof viewport.addEventListener === 'function') {
      viewport.addEventListener('resize', handleResize)
    }
    // defer measurement until a frame after layout settles; reuse cached values immediately
    scheduleChipsMeasurement()
    return () => {
      window.removeEventListener('resize', handleResize)
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', handleResize)
      }
    }
  }, [isSideBySide, scheduleChipsMeasurement])

  // Subtle highlight of the Config Chips area while hovering the Delete Configs button
  const [hoverDeleteConfigs, setHoverDeleteConfigs] = useState(false)
  // Ensure the hover highlight is cleared whenever Delete becomes disabled
  const deleteAllDisabled = (!customCfgs.length) || (selectedCfgIndices.length > 1)
  useEffect(() => { if (deleteAllDisabled && hoverDeleteConfigs) setHoverDeleteConfigs(false) }, [deleteAllDisabled, hoverDeleteConfigs])
  // Hide tooltips while user is scrolling to prevent viewport scrollbar flicker
  const hideTipsTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  useEffect(() => {
    const markScrolling = () => {
      try {
        document.body.classList.add('scrolling')
        if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null }
        hideTipsTimerRef.current = window.setTimeout(() => {
          try { document.body.classList.remove('scrolling') } catch {}
          // Nudge Popper.js to recompute positions after we re-show tooltips.
          // Why: While hidden via CSS during scroll, poppers may not update; a
          // resize event prompts a fresh measurement to avoid stale placement.
          try { window.dispatchEvent(new Event('resize')) } catch {}
        }, SCROLLING_TOOLTIP_HIDE_MS)
      } catch {}
    }
    const onWheel = () => markScrolling()
    const onScroll = () => markScrolling()
    const onTouchMove = () => markScrolling()
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('scroll', onScroll, true as unknown as undefined)
      window.removeEventListener('touchmove', onTouchMove)
      if (hideTipsTimerRef.current) { clearTimeout(hideTipsTimerRef.current); hideTipsTimerRef.current = null }
      try { document.body.classList.remove('scrolling') } catch {}
    }
  }, [])
  const [builderState, setBuilderState] = useState<BuilderConfig>({
    name: '',
    keep: true,
    visibility: 'enabled',
    rankCode: 0,
    rarityCode: 0,
    rarityMode: 'auto',
    autoRaritySupplementsThreshold: 'rare',
    factionCode: 0,
    mainStatsV: [],
    minLevel: 0,
    maxLevel: 16,
    earlyKeepMode: 'early',
    rollBaseline: 'afterStart',
    rollMode: 'auto',
    substatsV: [],
    fixedSubstatsV: [],
    minCount: 0,
    autoMinCount: true,
    autoSubstatFlex: false,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
  })
  const builder = builderState
  // Keep a ref to the latest builder so tutorial helpers and action handlers can snapshot current
  // values without waiting for React to flush state updates.
  const builderRef = React.useRef(builder)
  const { open: minimaDialogOpen, openDialog: openMinimaDialog, closeDialog: closeMinimaDialog } = useMinimaDialog()
  const setBuilder = React.useCallback((next: React.SetStateAction<BuilderConfig>) => {
    setBuilderState(prev => {
      const resolved = typeof next === 'function'
        ? (next as (value: BuilderConfig) => BuilderConfig)(prev)
        : next
      builderRef.current = resolved
      return resolved
    })
  }, [])
  useEffect(() => { builderRef.current = builder }, [builder])
  // Refs to avoid stale closures in tutorial snapshot/restore
  const hsfRef = React.useRef(hsf)
  useEffect(() => { hsfRef.current = hsf }, [hsf])
  const cfgsRef = React.useRef(customCfgs)
  useEffect(() => { cfgsRef.current = customCfgs }, [customCfgs])
  const selRef = React.useRef(selectedCfgIdx)
  useEffect(() => { selRef.current = selectedCfgIdx }, [selectedCfgIdx])
  // Keep multiselect in sync with single selection when it changes elsewhere
  useEffect(() => {
    const selected = typeof selectedCfgIdx === 'number' ? [selectedCfgIdx] : []
    const multiActive = selectedCfgIndices.length > 1
    selectionAnchorRef.current = selectedCfgIdx ?? null
    setSelectedCfgIndices(prev => (multiActive || arraysEqual(prev, selected) ? prev : selected))
  }, [selectedCfgIdx, selectedCfgIndices.length])

  // If all configs are removed, clear any multiselect artifacts proactively
  useEffect(() => {
    const empty = customCfgs.length === 0
    selectionAnchorRef.current = empty ? null : selectionAnchorRef.current
    setSelectedCfgIndices(prev => (empty && prev.length > 0 ? [] : prev))
  }, [customCfgs.length])
  const metasRef = React.useRef(metasets)
  useEffect(() => { metasRef.current = metasets }, [metasets])
  const minimaRef = React.useRef(minima)
  useEffect(() => { minimaRef.current = minima }, [minima])
  const fsrRef = React.useRef(finalSellRemainder)
  useEffect(() => { fsrRef.current = finalSellRemainder }, [finalSellRemainder])
  const noteRef = React.useRef(hsfcNote)
  useEffect(() => { noteRef.current = hsfcNote }, [hsfcNote])
  // Production-only: restrict native context menu and text selection globally,
  // allowing it only on inputs, contenteditable, README, version info, and Note editor.
  useEffect(() => {
    if (!(import.meta as unknown as { env?: { PROD?: boolean } }).env?.PROD) return
    try { document.body.classList.add('restrict-ui') } catch {}
    const isAllowed = (el: Element | null): boolean => {
      let cur: Element | null = el
      while (cur) {
        if (cur instanceof HTMLInputElement || cur instanceof HTMLTextAreaElement) return true
        const he = cur as HTMLElement
        if (he && he.isContentEditable) return true
        if (he && (he.hasAttribute('data-allow-context') || he.hasAttribute('data-allow-select'))) return true
        cur = cur.parentElement
      }
      return false
    }
    const onCtx = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!isAllowed(t)) {
        // Prevent the native browser menu, but allow app-level contextmenu
        // handlers to run (do not stopPropagation).
        e.preventDefault()
      }
    }
    window.addEventListener('contextmenu', onCtx, { capture: true })
    return () => {
      window.removeEventListener('contextmenu', onCtx, true as unknown as undefined)
      try { document.body.classList.remove('restrict-ui') } catch {}
    }
  }, [])
  
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null)
  const [confirmDeleteMultiCount, setConfirmDeleteMultiCount] = useState<number | null>(null)
  // Autosave suppression for the specific "Delete Configs" action only.
  // Deleting all configs should not update autosave so users can reload and
  // restore the previous snapshot. Re-enables automatically when configs reappear.
  const [autosaveSilencedByClear, setAutosaveSilencedByClear] = useState<boolean>(false)
  useEffect(() => {
    if (autosaveSilencedByClear && customCfgs.length > 0) setAutosaveSilencedByClear(false)
  }, [autosaveSilencedByClear, customCfgs.length])
  // Chips panel now owns its context menu; no local state here
  // Manual paste fallback dialog
  const [pasteDlgOpen, setPasteDlgOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteErr, setPasteErr] = useState<string | null>(null)
  const [pasteSelectOnEmpty, setPasteSelectOnEmpty] = useState(false)
  const [pasteAfterIdx, setPasteAfterIdx] = useState<number | null>(null)
  // Manual copy fallback dialog
  const [copyDlgOpen, setCopyDlgOpen] = useState(false)
  const [copyText, setCopyText] = useState('')
  const copyInputRef = React.useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  // Determine once whether to auto-open the README on this version.
  const initialHelpFirstRun = useMemo(() => {
    try {
      return localStorage.getItem(README_SEEN_VERSION_KEY) !== APP_VERSION
    } catch {
      return false
    }
  }, [])
  // Help/README dialog state. Shows on first run for a new version.
  const [helpOpen, setHelpOpen] = useState<boolean>(initialHelpFirstRun)
  // When Help is opened automatically on first run for a version, replace Close with Start Tutorial
  const [helpFirstRunMode, setHelpFirstRunMode] = useState<boolean>(initialHelpFirstRun)
  const [tutorialOpen, setTutorialOpen] = useState<boolean>(false)
  const [tutorialSteps, setTutorialSteps] = useState<TutorialStep[]>([])
  const [tutorialIdx, setTutorialIdx] = useState<number>(0)
  const [tutorialSections, setTutorialSections] = useState<Array<{ label: string; index: number }>>([])
  // Track one-time tutorial actions to avoid repeating when navigating back/forward
  const [tutorialAddedBasic, setTutorialAddedBasic] = useState<boolean>(false)
  const [tutorialAddedAdvanced, setTutorialAddedAdvanced] = useState<boolean>(false)
  const [tutorialAddedSlowDD, setTutorialAddedSlowDD] = useState<boolean>(false)
  // Ensure Auto+Late example adds exactly once when stepping back/forward
  const [tutorialAddedAutoLate, setTutorialAddedAutoLate] = useState<boolean>(false)
  const [tutorialAddedDefaultMetas, setTutorialAddedDefaultMetas] = useState<boolean>(false)
  // Rule Tester dialog state
  const [testerOpen, setTesterOpen] = useState<boolean>(false)
  // External focus target for preview table (exact rule index in the effective rules array)
  const [focusRuleIndex, setFocusRuleIndex] = useState<number | null>(null)
  // Central store for any tutorial-related timers to avoid races when stepping/jumping
  const tutorialTimersRef = React.useRef<{ setsMenuRetryId: number | null; scrollAnimId: number | null }>({ setsMenuRetryId: null, scrollAnimId: null })
  const previewLowerOverlayRef = React.useRef<HTMLDivElement | null>(null)
  const previewLowerOverlayCleanupRef = React.useRef<(() => void) | null>(null)
  const previewLowerOverlayRafRef = React.useRef<number | null>(null)
  const [tutorialSnapshot, setTutorialSnapshot] = useState<null | {
    hsf: HsfFile | null
    cfgs: BuilderConfig[]
    sel: number | null
    metas: Metaset[]
    mins: typeof minima
    fsr: typeof finalSellRemainder
    note: typeof hsfcNote
    builder: BuilderConfig
    filterOpen: boolean
    rulesFilter: RulesFilterState
  }>(null)
  const [finalSellOpen, setFinalSellOpen] = useState<boolean>(false)
  // View-only rules filter state
  const [filterOpen, setFilterOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('sellfileCreator.rulesFilter.open.v1') === 'true' } catch { return false }
  })
  const [rulesFilter, setRulesFilter] = useState<RulesFilterState>(() => {
    try {
      const raw = localStorage.getItem('sellfileCreator.rulesFilter.state.v1')
      if (raw) return JSON.parse(raw) as RulesFilterState
    } catch {}
    return DEFAULT_RULES_FILTER_STATE
  })
  const [limitConfigsToFiltered, setLimitConfigsToFiltered] = useState<boolean>(true)
  const filterOpenRef = React.useRef(filterOpen)
  const rulesFilterRef = React.useRef<RulesFilterState>(rulesFilter)
  useEffect(() => { try { localStorage.setItem('sellfileCreator.rulesFilter.open.v1', String(filterOpen)) } catch {} }, [filterOpen])
  useEffect(() => { try { localStorage.setItem('sellfileCreator.rulesFilter.state.v1', JSON.stringify(rulesFilter)) } catch {} }, [rulesFilter])
  useEffect(() => { filterOpenRef.current = filterOpen }, [filterOpen])
  useEffect(() => { rulesFilterRef.current = rulesFilter }, [rulesFilter])

  const clearPreviewLowerHighlight = React.useCallback(() => {
    if (previewLowerOverlayCleanupRef.current) {
      try { previewLowerOverlayCleanupRef.current() } catch {}
      previewLowerOverlayCleanupRef.current = null
    }
    if (previewLowerOverlayRafRef.current !== null) {
      try { cancelAnimationFrame(previewLowerOverlayRafRef.current) } catch {}
      previewLowerOverlayRafRef.current = null
    }
    const overlay = previewLowerOverlayRef.current
    if (overlay) {
      try { overlay.remove() } catch {}
      previewLowerOverlayRef.current = null
    }
  }, [])

  const ensurePreviewLowerHighlight = React.useCallback((show: boolean) => {
    try {
      if (!show) {
        clearPreviewLowerHighlight()
        return
      }

      const container = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
      if (!container) {
        clearPreviewLowerHighlight()
        return
      }

      clearPreviewLowerHighlight()

      let overlay = previewLowerOverlayRef.current
      if (!overlay) {
        overlay = document.createElement('div')
        overlay.dataset.tourId = 'preview.table.lower'
        overlay.style.position = 'fixed'
        overlay.style.pointerEvents = 'none'
        overlay.style.background = 'transparent'
        overlay.style.opacity = '0'
        previewLowerOverlayRef.current = overlay
        document.body.appendChild(overlay)
      } else if (!document.body.contains(overlay)) {
        document.body.appendChild(overlay)
      }

      const scheduleUpdate = () => {
        if (previewLowerOverlayRafRef.current !== null) {
          try { cancelAnimationFrame(previewLowerOverlayRafRef.current) } catch {}
          previewLowerOverlayRafRef.current = null
        }
        previewLowerOverlayRafRef.current = requestAnimationFrame(() => {
          previewLowerOverlayRafRef.current = null
          const targetOverlay = previewLowerOverlayRef.current
          const targetContainer = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
          if (!targetOverlay || !targetContainer) {
            clearPreviewLowerHighlight()
            return
          }
          const rect = targetContainer.getBoundingClientRect()
          const lowerTop = rect.top + rect.height * 0.5
          const bottom = rect.bottom
          const height = Math.max(1, bottom - lowerTop)
          targetOverlay.style.display = height > 0 ? 'block' : 'none'
          targetOverlay.style.left = `${Math.round(rect.left)}px`
          targetOverlay.style.top = `${Math.round(lowerTop)}px`
          targetOverlay.style.width = `${Math.max(0, Math.round(rect.width))}px`
          targetOverlay.style.height = `${Math.max(1, Math.round(height))}px`
        })
      }

      const onResize = () => scheduleUpdate()
      const onScroll = () => scheduleUpdate()
      const onContainerScroll = () => scheduleUpdate()
      window.addEventListener('resize', onResize)
      window.addEventListener('scroll', onScroll, { passive: true })
      container.addEventListener('scroll', onContainerScroll, { passive: true })
      previewLowerOverlayCleanupRef.current = () => {
        window.removeEventListener('resize', onResize)
        window.removeEventListener('scroll', onScroll)
        container.removeEventListener('scroll', onContainerScroll)
        if (previewLowerOverlayRafRef.current !== null) {
          try { cancelAnimationFrame(previewLowerOverlayRafRef.current) } catch {}
          previewLowerOverlayRafRef.current = null
        }
      }
      scheduleUpdate()
      setTimeout(scheduleUpdate, 60)
    } catch {
      clearPreviewLowerHighlight()
    }
  }, [clearPreviewLowerHighlight])

  // Best-effort closer for transient UI (menus, popovers, dialogs).
  // Why: On tutorial exit/finish, ensure no tutorial-opened UI remains visible
  // (e.g., Manage Metasets dialog, Sets menu, context menus) so users return
  // to a clean, pre-tutorial app state with autosave re-enabled safely.
  const { t, registerRuntimeCatalog } = useI18n()
  const pushEndpoint = useMemo(() => getPushEndpoint(), [])
  const [pushEndpointReachable, setPushEndpointReachableState] = useState(() => Boolean(pushEndpoint))
  const setPushEndpointReachable = useCallback((next: boolean) => {
    setPushEndpointReachableState((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    setPushEndpointReachable(Boolean(pushEndpoint))
  }, [pushEndpoint, setPushEndpointReachable])
  const pushExportEndpoint = pushEndpointReachable && pushEndpoint ? pushEndpoint : undefined

  const closeAllTransientUi = React.useCallback(() => {
    try {
      // Close any menus/popovers and context menus with Escape (twice to catch portals)
      const pressEsc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      pressEsc(); setTimeout(pressEsc, 40)
    } catch {}
    try { ensurePreviewLowerHighlight(false) } catch {}
    try {
      // Ensure Final Sell dialog is closed; this state is UI-only and not part of HSFC.
      setFinalSellOpen(false)
    } catch {}
    try {
      // Targeted ESC on common menu/list surfaces (helps when overlay blocks clicks)
      const listbox = document.querySelector('ul[role="listbox"]') as HTMLElement | null
      const menuEl = document.querySelector('[data-tour-id="chips.menu"]') as HTMLElement | null
      const chipMenuEl = document.querySelector('[data-tour-id="chip.menu"]') as HTMLElement | null
      const previewHeaderMenuEl = document.querySelector('[data-tour-id="preview.header.menu"]') as HTMLElement | null
      listbox?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      menuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const menuUl = menuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      menuUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      chipMenuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const chipUl = chipMenuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      chipUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      previewHeaderMenuEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      const previewHeaderUl = previewHeaderMenuEl?.querySelector('ul[role="menu"]') as HTMLElement | null
      previewHeaderUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    } catch {}
    try {
      // Clear tutorial timers so no reopen happens after we close
      const t = tutorialTimersRef.current
      if (t.setsMenuRetryId !== null) { clearTimeout(t.setsMenuRetryId); t.setsMenuRetryId = null }
      if (t.scrollAnimId !== null) { try { cancelAnimationFrame(t.scrollAnimId) } catch {} t.scrollAnimId = null }
    } catch {}
    try {
      // Explicitly close Manage Metasets dialog if its Close button is present
      const btn = document.querySelector('[data-tour-id="metasets.close"]') as HTMLButtonElement | null
      btn?.click()
    } catch {}
    try {
      // Fallback click on the page to commit close for any lingering popovers
      setTimeout(() => {
        try {
          const target = document.body as HTMLElement
          const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
          target.dispatchEvent(new MouseEvent('mousedown', opts))
          target.dispatchEvent(new MouseEvent('mouseup', opts))
          target.dispatchEvent(new MouseEvent('click', opts))
        } catch {}
      }, 60)
    } catch {}
  }, [ensurePreviewLowerHighlight])

  useEffect(() => () => { ensurePreviewLowerHighlight(false) }, [ensurePreviewLowerHighlight])

  // Restores the pre-tutorial snapshot in a single synchronous batch.
  // Why: Prevents interleaving with any lingering tutorial timers/effects so the
  // user reliably returns to the exact pre-tutorial builder/config state.
  const restoreFromTutorialSnapshot = React.useCallback(() => {
    const snap = tutorialSnapshot
    if (!snap) return
    try {
      flushSync(() => {
        setHsf(snap.hsf)
        setCustomCfgs(snap.cfgs)
        setSelectedCfgIdx(snap.sel)
        setMetasets(snap.metas)
        setMinima(snap.mins)
        setFinalSellRemainder(snap.fsr)
        setHsfcNote(snap.note)
        setBuilder(snap.builder)
        setFilterOpen(snap.filterOpen)
        setRulesFilter(JSON.parse(JSON.stringify(snap.rulesFilter)) as RulesFilterState)
      })
    } catch {}
  }, [tutorialSnapshot, setCustomCfgs, setSelectedCfgIdx, setMetasets, setMinima, setFinalSellRemainder, setHsfcNote, setBuilder, setFilterOpen, setRulesFilter])
  // Start the interactive tutorial: runs a scripted tour with two examples.
  // Why: Provide a first-run, guided walkthrough of the crucial HSFC builder.
  const startTutorial = React.useCallback(() => {
    // Helpers to normalize UI state for each step so back/forward remain consistent
    const isMetasetsDialogOpen = () => Boolean(document.querySelector('[role="dialog"] [data-tour-id="metasets.close"]'))
    const ensureMetasetsDialog = (open: boolean) => {
      try {
        const openNow = isMetasetsDialogOpen()
        if (open && !openNow) {
          const btn = document.querySelector('[data-tour-id="builder.manage-metasets"]') as HTMLButtonElement | null
          btn?.click()
        } else if (!open && openNow) {
          const btn = document.querySelector('[data-tour-id="metasets.close"]') as HTMLButtonElement | null
          btn?.click()
        }
      } catch {}
    }
    // Timer for retry-opening Sets menu while highlighting metasets section
    const isSetsMenuOpen = () => {
      // Detect MUI Menu/Popover for Sets selector, not only metasets section
      return Boolean(
        document.querySelector('[data-tour-id="menu.metasets.section"]') ||
        document.querySelector('[role="menu"]') ||
        document.querySelector('.MuiMenu-paper, .MuiPopover-paper')
      )
    }
    const ensureSetsMenu = (open: boolean) => {
      try {
        const openNow = isSetsMenuOpen()
        if (open && !openNow) {
          const sel = document.querySelector('[data-tour-id="builder.sets"] .MuiSelect-select') as HTMLElement | null
          const el = sel || (document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null)
          if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
        } else if (!open) {
          // Unconditionally attempt to close; Escape is safe if already closed
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          // Also send ESC to the listbox itself, if present
          try { (document.querySelector('ul[role="listbox"]') as HTMLElement | null)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
          // Retry shortly in case a portal mounts late
          setTimeout(() => { try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {} }, 40)
          // Cancel any pending retry-opens to avoid reopening after we just closed it
          const t = tutorialTimersRef.current
          if (t.setsMenuRetryId !== null) { try { clearTimeout(t.setsMenuRetryId) } catch {}; t.setsMenuRetryId = null }
        }
      } catch {}
    }
    const isChipsMenuOpen = () => Boolean(document.querySelector('[data-tour-id="chips.menu"]'))
    const ensureChipsMenu = (open: boolean) => {
      try {
        const openNow = isChipsMenuOpen()
        if (open && !openNow) {
          const el = document.querySelector('[data-tour-id="chips.container"]') as HTMLElement | null
          if (el) {
            const r = el.getBoundingClientRect()
            el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
          }
        } else if (!open) {
          // Unconditional attempt to close the context menu; use both Escape and an outside click
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          // Also send ESC to the menu element and inner ul[role=menu]
          try {
            const menuEls = [
              document.querySelector('[data-tour-id="chips.menu"]') as HTMLElement | null,
              document.querySelector('[data-tour-id="chip.menu"]') as HTMLElement | null,
            ]
            for (const m of menuEls) {
              m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
              const menuUl = m?.querySelector('ul[role="menu"]') as HTMLElement | null
              menuUl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            }
          } catch {}
          setTimeout(() => {
            try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
            try {
              const target = document.body as HTMLElement
              const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
              target.dispatchEvent(new MouseEvent('mousedown', opts))
              target.dispatchEvent(new MouseEvent('mouseup', opts))
              target.dispatchEvent(new MouseEvent('click', opts))
            } catch {}
          }, 40)
        }
      } catch {}
    }
    const isFinalSellDialogOpen = () => Boolean(document.querySelector('[data-tour-id="finalsell.dialog"]'))
    const ensureFinalSellDialog = (open: boolean) => {
      try {
        const openNow = isFinalSellDialogOpen()
        if (open && !openNow) { setFinalSellOpen(true) }
        else if (!open && openNow) { setFinalSellOpen(false) }
      } catch {}
    }
    const isPreviewHeaderMenuOpen = () => Boolean(document.querySelector('[data-tour-id="preview.header.menu"]'))
    const ensurePreviewHeaderMenu = (open: boolean) => {
      try {
        const openNow = isPreviewHeaderMenuOpen()
        if (open && !openNow) {
          const head = document.querySelector('[data-tour-id="preview.header"]') as HTMLElement | null
          const el = head ?? (document.querySelector('[data-tour-id="preview.table"] thead') as HTMLElement | null)
          if (el) {
            const r = el.getBoundingClientRect()
            el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: r.left + Math.min(40, Math.max(8, r.width / 3)), clientY: r.top + Math.min(12, Math.max(8, r.height / 2)) }))
          }
        } else if (!open) {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          try {
            const menu = document.querySelector('[data-tour-id="preview.header.menu"]') as HTMLElement | null
            menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            const ul = menu?.querySelector('ul[role="menu"]') as HTMLElement | null
            ul?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
          } catch {}
          setTimeout(() => {
            try {
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
              const target = document.body as HTMLElement
              const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
              target.dispatchEvent(new MouseEvent('mousedown', opts))
              target.dispatchEvent(new MouseEvent('mouseup', opts))
              target.dispatchEvent(new MouseEvent('click', opts))
            } catch {}
          }, 40)
        }
      } catch {}
    }
    // Smoothly scroll the Sellfile Preview table to the end once (used in the
    // advanced preview step). Cancels on step change via closeAllTransientUi.
    const smoothScrollPreviewToEnd = () => {
      try {
        const container = document.querySelector('[data-tour-id="preview.table"]') as HTMLElement | null
        if (!container) return
        // Reset to top for a full walkthrough; then animate to the bottom.
        try { container.scrollTop = 0 } catch {}
        const startTop = container.scrollTop
        const endTop = Math.max(0, (container.scrollHeight - container.clientHeight))
        if (endTop <= startTop) return
        const DURATION_MS = 2400
        const startAt = performance.now()
        const easeInOut = (t: number) => (t < 0.5 ? 2*t*t : -1 + (4 - 2*t) * t)
        const tRef = tutorialTimersRef.current
        const step = (now: number) => {
          const p = Math.min(1, (now - startAt) / DURATION_MS)
          const eased = easeInOut(p)
          const nextTop = Math.round(startTop + (endTop - startTop) * eased)
          try { container.scrollTop = nextTop } catch {}
          if (p < 1) { tRef.scrollAnimId = requestAnimationFrame(step) } else { tRef.scrollAnimId = null }
        }
        if (tRef.scrollAnimId !== null) { try { cancelAnimationFrame(tRef.scrollAnimId) } catch {} tRef.scrollAnimId = null }
        tRef.scrollAnimId = requestAnimationFrame(step)
      } catch {}
    }
    // Capture snapshot for restore on exit/finish
    try {
      // Deep-clone snapshot to avoid aliasing if tutorial mutates nested arrays later.
      const cloneHsf = hsfRef.current ? (JSON.parse(JSON.stringify(hsfRef.current)) as HsfFile) : null
      const srcCfgs = cfgsRef.current
      const srcMetas = metasRef.current
      const srcMinima = minimaRef.current
      const srcFsr = fsrRef.current
      const srcBuilder = builderRef.current
      const cloneCfgs = srcCfgs.map(c => ({ ...c }))
      const cloneMetas = srcMetas.map(m => ({ ...m, sets: m.sets.slice() }))
      const cloneMinima = JSON.parse(JSON.stringify(srcMinima)) as typeof minima
      const cloneFsr = srcFsr ? JSON.parse(JSON.stringify(srcFsr)) as typeof finalSellRemainder : srcFsr
      const cloneBuilder = JSON.parse(JSON.stringify(srcBuilder)) as BuilderConfig
      const cloneRulesFilter = JSON.parse(JSON.stringify(rulesFilterRef.current)) as RulesFilterState
      setTutorialSnapshot({
        hsf: cloneHsf,
        cfgs: cloneCfgs,
        sel: selRef.current,
        metas: cloneMetas,
        mins: cloneMinima,
        fsr: cloneFsr,
        note: noteRef.current,
        builder: cloneBuilder,
        filterOpen: filterOpenRef.current,
        rulesFilter: cloneRulesFilter,
      })
    } catch {}
    // Reset app to a clean default state for the tutorial
    try {
      setHsf(null)
      setCustomCfgs([])
      setSelectedCfgIdx(null)
      // Start with no metasets during the tutorial to teach creation clearly
      setMetasets([])
      setMinima(defaultMinima())
      // During tutorial, keep Final Sell off to avoid confusion; keep default levels ready
      setFinalSellRemainder({ artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> })
      setHsfcNote(null)
      setBuilder({
        name: '',
        keep: true,
        visibility: 'enabled',
        rankCode: 0,
        rarityCode: 0,
        rarityMode: 'auto',
        factionCode: 0,
        mainStatsV: [],
        minLevel: 0,
        maxLevel: 16,
        earlyKeepMode: 'early',
        rollBaseline: 'afterStart',
        rollMode: 'auto',
        substatsV: [],
        fixedSubstatsV: [],
        minCount: 0,
        autoMinCount: true,
        autoSubstatFlex: false,
        minRequiredRolls: 0,
        autoMinRequiredRolls: true,
      })
      // Ensure the tutorial starts with the preview filter closed and cleared.
      setFilterOpen(false)
      setRulesFilter(JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState)
    } catch {}
    // addCurrentBuilder was inlined into onNext to avoid implicit adds on step transitions
    // Reset any previous tour
    setTutorialIdx(0)
    setTutorialAddedBasic(false)
    setTutorialAddedAdvanced(false)
    setTutorialAddedSlowDD(false)
    setTutorialAddedDefaultMetas(false)
    setTutorialAddedAutoLate(false)
    // Example 1: Basic — match README wording and ELI5 style
    const basic: TutorialStep[] = [
      {
        id: 'welcome',
        title: t('tutWelcomeTitle'),
        body: t('tutWelcomeBody'),
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'action',
        title: t('tutActionTitle'),
        body: t('tutActionBody'),
        targetIds: ['builder.action.keep', 'builder.action.sell'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false) },
      },
      {
        id: 'enabled',
        title: t('tutEnabledTitle'),
        body: t('tutEnabledBody'),
        targetId: 'builder.sellfileMode',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'basics',
        title: t('tutBasicsTitle'),
        body: t('tutBasicsBody'),
        targetIds: ['builder.rank', 'builder.rarity', 'builder.faction', 'builder.min-level', 'builder.max-level'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'slots',
        title: t('tutSlotsTitle'),
        body: t('tutSlotsBody'),
        targetId: 'builder.slot.boots',
        before: () => setBuilder(prev => ({ ...prev, artifactTypes: [ArtifactType.Boots] })),
      },
      {
        id: 'mainstat',
        title: t('tutMainTitle'),
        body: t('tutMainBody'),
        targetId: 'builder.mainstat.spd',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); setBuilder(prev => ({ ...prev, mainStatsV: [StatVariant.SPD] })) },
      },
      {
        id: 'sets',
        title: t('tutSetsTitle'),
        body: t('tutSetsBody'),
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureChipsMenu(false); ensureSetsMenu(false); setBuilder(prev => ({ ...prev, artifactSets: [ArtifactSet.Speed] })) },
      },
      {
        id: 'add',
        title: t('tutAddConfigTitle'),
        body: t('tutAddConfigBody'),
        targetId: 'builder.add-config',
      },
      {
        id: 'added',
        title: t('tutConfigAddedTitle'),
        body: t('tutConfigAddedBody'),
        targetIds: ['chip.selected', 'builder.add-config'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'preview-locate',
        title: t('tutSeeRulesTitle'),
        body: t('tutSeeRulesBody'),
        targetId: 'preview.paper',
      },
    ]

    // Example 2: Advanced — substats and roll thresholds (ELI5 wording)
    // Order: build advanced → add → show its preview → then cover Auto+Late example
    const advanced: TutorialStep[] = [
      {
        id: 'adv-intro',
        title: t('tutAdvIntroTitle'),
        body: t('tutAdvIntroBody'),
        targetId: 'builder.panel',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      
      {
        id: 'adv-select-slots-main',
        title: t('tutAdvSelectSlotsMainTitle'),
        body: t('tutAdvSelectSlotsMainBody'),
        targetIds: ['builder.slots', 'builder.mainstat'],
        before: () => setBuilder(prev => ({
          ...prev,
          artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots],
          mainStatsV: [StatVariant.HP, StatVariant.ATK, StatVariant.DEF],
        })),
      },
      {
        id: 'name',
        title: t('tutAdvNameTitle'),
        body: t('tutAdvNameBody'),
        targetId: 'builder.name',
        before: () => setBuilder(prev => ({ ...prev, name: 'DPS Core Rolls' })),
      },
      {
        id: 'subs',
        title: t('tutAdvChooseSubstatsTitle'),
        body: t('tutAdvChooseSubstatsBody'),
        targetId: 'builder.substats',
        before: () => setBuilder(prev => ({
          ...prev,
          substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG],
          fixedSubstatsV: [StatVariant.CDMG],
        })),
      },
      {
        id: 'min-rolls',
        title: t('tutAdvMinRollsTitle'),
        body: t('tutAdvMinRollsBody'),
        targetIds: ['builder.min-rolls.label', 'builder.min-rolls', 'builder.min-rolls.toggle'],
        before: () => setBuilder(prev => ({ ...prev, autoMinRequiredRolls: false, minRequiredRolls: 3 })),
      },
      {
        id: 'required',
        title: t('tutAdvRequiredTitle'),
        body: t('tutAdvRequiredBody'),
        targetIds: ['builder.required.label', 'builder.required', 'builder.flex-chip'],
        before: () => {
          setBuilder(prev => ({ ...prev, autoMinCount: false, autoSubstatFlex: false, minCount: 2 }))
          setTimeout(() => {
            try { setBuilder(prev => ({ ...prev, autoSubstatFlex: false })) } catch {}
          }, 0)
        },
      },
      {
        id: 'thresholds',
        title: t('builderMilestoneThresholds'),
        body: t('tutAdvMilestonesBody'),
        targetIds: ['builder.thresholds.label', 'builder.thresholds', 'builder.thresholds.auto-chip'],
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-open',
        title: t('tutMetasetsManageTitle'),
        body: t('tutMetasetsManageBody'),
        targetId: 'builder.manage-metasets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-add',
        title: t('tutMetasetsAddTitle'),
        body: t('tutMetasetsAddBody'),
        targetId: 'metasets.add',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-added',
        title: t('tutMetasetsAddedTitle'),
        body: t('tutMetasetsAddedBody'),
        targetId: 'metasets.dialog',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'metasets-defaults',
        title: t('tutMetasetsIncludedTitle'),
        body: t('tutMetasetsIncludedBody'),
        targetId: 'metasets.dialog',
        before: () => {
          ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false)
          if (!tutorialAddedDefaultMetas) {
            const wanted = new Set(['Nuker', 'Support - Debuffer', 'Support - Survivability'])
            const defs = defaultMetasets().filter(m => wanted.has(m.name))
            setMetasets(prev => {
              const have = new Set(prev.map(m => m.name))
              const add = defs.filter(d => !have.has(d.name))
              return add.length ? prev.concat(add) : prev
            })
            setTutorialAddedDefaultMetas(true)
          }
        },
      },
      {
        id: 'metasets-close',
        title: t('tutMetasetsCloseTitle'),
        body: t('tutMetasetsCloseBody'),
        targetId: 'metasets.close',
        before: () => { ensureMetasetsDialog(true); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-open',
        title: t('tutMetasetsSelectTitle'),
        body: t('tutMetasetsSelectBody'),
        targetId: 'builder.sets',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'sets-metasets',
        title: t('tutMetasetsInSetsTitle'),
        body: t('tutMetasetsInSetsBody'),
        targetId: 'menu.metasets.section',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(true); ensureChipsMenu(false)
          // Some environments render the menu on the next tick; retry opening once shortly after.
          const t = tutorialTimersRef.current
          if (t.setsMenuRetryId !== null) { try { clearTimeout(t.setsMenuRetryId) } catch {}; t.setsMenuRetryId = null }
          t.setsMenuRetryId = window.setTimeout(() => { try { ensureSetsMenu(true) } catch {} }, 60)
        },
      },
      // Example 2b: Accessories — Auto Rarity + Late (Banner SPD rolls)
      {
        id: 'adv-add',
        title: t('tutAdvAddTitle'),
        body: t('tutAdvAddBody'),
        targetId: 'builder.add-config',
      },
      {
        id: 'adv-added',
        title: t('tutAdvAddedTitle'),
        body: t('tutAdvAddedBody'),
        targetId: 'chips.container',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false) },
      },
      {
        id: 'adv-preview-early',
        title: t('tutAdvPreviewEarlyTitle'),
        body: t('tutAdvPreviewEarlyBody'),
        targetId: 'preview.table',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(false)
          // Give the table a tick to render, then animate a smooth scroll to the end
          setTimeout(() => { try { smoothScrollPreviewToEnd() } catch {} }, 120)
        },
      },
      {
        id: 'chips',
        title: t('tutConfigChipsTitle'),
        body: t('tutConfigChipsBody'),
        targetIds: ['chip.selected', 'chip.menu'],
        expand: 10,
        before: () => {
          // Keep context menu closed; only highlight the chips area and scroll it into view
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          try {
            const el = document.querySelector('[data-tour-id="chips.container"]') as HTMLElement | null
            el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
          } catch {}
          // Open the context menu on the selected chip for demonstration
          try {
            const chip = document.querySelector('[data-tour-id="chip.selected"]') as HTMLElement | null
            if (chip) {
              const r = chip.getBoundingClientRect()
              chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
            }
          } catch {}
        },
      },
      // Auto+Late example comes after advanced preview
      {
        id: 'auto-late-intro',
        title: t('tutAutoLateIntroTitle'),
        body: t('tutAutoLateIntroBody'),
        targetIds: ['builder.slots', 'builder.rarity', 'builder.thresholds', 'builder.substats', 'builder.min-rolls'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          // Configure: Banner, Rarity Auto, Late thresholds, SPD substat, 3 required rolls
          setBuilder(prev => ({
            ...prev,
            name: 'Banner SPD — Late 3 rolls',
            artifactTypes: [ArtifactType.Banner],
            mainStatsV: [],
            substatsV: [StatVariant.SPD],
            fixedSubstatsV: [],
            autoMinCount: false,
            autoSubstatFlex: false,
            minCount: 1,
            autoMinRequiredRolls: false,
            minRequiredRolls: 3,
            rarityCode: 0,
            rarityMode: 'auto',
            earlyKeepMode: 'late',
          }))
        },
      },
      {
        id: 'auto-late-add',
        title: t('tutAutoLateAddTitle'),
        body: t('tutAutoLateAddBody'),
        targetId: 'builder.add-config',
      },
      {
        id: 'auto-late-preview',
        title: t('tutAutoLatePreviewTitle'),
        body: t('tutAutoLatePreviewBody'),
        targetId: 'preview.table.lower',
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false)
          ensurePreviewLowerHighlight(true)
          try {
            const previewPaper = document.querySelector('[data-tour-id="preview.paper"]') as HTMLElement | null
            previewPaper?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
          } catch {}
          setTimeout(() => {
            try { smoothScrollPreviewToEnd() } catch {}
            ensurePreviewLowerHighlight(true)
            try {
              const previewPaper = document.querySelector('[data-tour-id="preview.paper"]') as HTMLElement | null
              previewPaper?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
            } catch {}
          }, 120)
        },
      },
      {
        id: 'finalsell-intro',
        title: t('tutFinalSellIntroTitle'),
        body: t('tutFinalSellIntroBody'),
        targetId: 'finalsell.toggle',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'finalsell-config',
        title: t('tutFinalSellConfigureTitle'),
        body: t('tutFinalSellConfigureBody'),
        targetId: 'finalsell.config',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'finalsell-dialog',
        title: t('tutFinalSellDialogTitle'),
        body: t('tutFinalSellDialogBody'),
        targetIds: ['finalsell.dialog', 'finalsell.dialog.types', 'finalsell.dialog.levels'],
        before: () => {
          ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewLowerHighlight(false)
          try {
            setFinalSellOpen(true)
            setFinalSellRemainder(prev => ({
              artifacts: true,
              accessories: false,
              levels: (prev?.levels?.length ? prev.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>)),
            }))
          } catch {}
        },
      },
      {
        id: 'note',
        title: t('tutNoteTitle'),
        body: t('tutNoteBody'),
        targetId: 'note.toggle',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewLowerHighlight(false) },
      },
      {
        id: 'save-explain',
        title: t('tutSaveExplainTitle'),
        body: t('tutSaveExplainBody'),
        targetId: 'hsfc.save',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'preview',
        title: t('tutPreviewFinishTitle'),
        body: t('tutPreviewFinishBody'),
        targetId: 'preview.paper',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'export-explain',
        title: t('tutExportExplainTitle'),
        body: t('tutExportExplainBody'),
        targetId: 'hsf.export',
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensurePreviewHeaderMenu(false); ensurePreviewLowerHighlight(false); try { setFinalSellOpen(false) } catch {} },
      },
      {
        id: 'preview-header-menu',
        title: t('tutPreviewHeaderMenuTitle'),
        body: t('tutPreviewHeaderMenuBody'),
        targetIds: ['preview.header', 'preview.header.menu'],
        expand: 10,
        before: () => { ensureMetasetsDialog(false); ensureSetsMenu(false); ensureChipsMenu(false); ensureFinalSellDialog(false); ensurePreviewHeaderMenu(true); ensurePreviewLowerHighlight(false) },
      },
    ]

    const steps = [...basic, ...advanced]
    setTutorialSteps(steps)
    // Build tutorial sections for breadcrumb navigation
    const find = (id: string) => steps.findIndex(s => s.id === id)
    const sections: Array<{ label: string; index: number }> = [
      { label: t('tutSectionBasicsLabel'), index: find('welcome') },
      { label: t('tutSectionAdvancedLabel'), index: find('adv-intro') },
      { label: t('tutSectionMetasetsLabel'), index: find('metasets-open') },
      { label: t('tutSectionConfigChipsLabel'), index: find('adv-add') },
      { label: t('tutSectionAutoLateLabel'), index: find('auto-late-intro') },
      { label: t('tutSectionFinalSellLabel'), index: find('finalsell-intro') },
      { label: t('tutSectionSaveExportLabel'), index: find('note') },
    ].filter(s => s.index >= 0)
    setTutorialSections(sections)
    setTutorialOpen(true)
  }, [
    setBuilder,
    setCustomCfgs,
    setFinalSellRemainder,
    setHsfcNote,
    setMetasets,
    setMinima,
    setSelectedCfgIdx,
    tutorialAddedDefaultMetas,
    setTutorialAddedDefaultMetas,
    setTutorialSteps,
    setTutorialSections,
    setTutorialOpen,
    ensurePreviewLowerHighlight,
    t,
  ])
  
  // Global file-drag overlay and file routing handled by hook
  const { active: fileDragActive } = useFileDragDrop({
    onDragStart: () => {
      // Close context menus/popovers when a file drag starts so drop works cleanly
      try { closeAllTransientUi() } catch {}
    },
    onHsfc: async (file: File) => {
      // Ignore drops while confirmation dialogs are open
      if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteMultiCount !== null) return
      const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = await readHsfcFile(file, { metasets, minima })
      // File load replaces current state; no conflict resolution here
      setCustomCfgs(cfgs)
      if (nextMetas !== metasets) setMetasets(nextMetas)
      if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
      setFinalSellRemainder(fsr)
      const sel = selectedIndex
      setSelectedCfgIdx(sel)
      if (sel !== null && cfgs[sel]) setBuilder(cfgs[sel]!)
      if (note && String(note).trim()) { setHsfcNote(String(note)); setNoteMode('view'); setNoteOpen(true) } else { setHsfcNote(null); setNoteOpen(false) }
      try { setLastSavedSig(JSON.stringify({ customCfgs: cfgs, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr })) } catch {}
    },
    onHsf: async (file: File) => {
      // Ignore drops while confirmation dialogs are open
      if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteMultiCount !== null) return
      const parsed = await readHsfFile(file)
      setHsf(parsed)
    },
    onL10n: async (file: File) => {
      // Allow testing of localization files by drag & drop
      try {
        const text = await file.text()
        const data = JSON.parse(text) as unknown

        const canonicalizeLangCode = (raw: string): string => {
          // Normalize language tags so contributors can use any casing/underscore variant.
          const parts = raw.split(/[-_]/).map((segment) => segment.trim()).filter(Boolean)
          if (parts.length === 0) return ''
          const [language, ...rest] = parts as [string, ...string[]]
          const normalized: string[] = [language.toLowerCase(), ...rest.map((segment) => segment.length <= 3 ? segment.toUpperCase() : segment)]
          return normalized.join('-')
        }
        const inferLangFromFileName = (name: string): string => {
          // Accept filenames such as de-DE.l10n.json, pt_br.l10n, etc.
          const withoutJson = name.replace(/\.json$/i, '')
          const match = /([^./\\]+)\.(?:l10n|i18n)$/i.exec(withoutJson)
          if (!match) return ''
          return canonicalizeLangCode(match[1] ?? '')
        }
        const asStringMap = (maybe: Record<string, unknown>): Record<string, string> | null => {
          // Guard against unexpected payloads; catalog values must stay strings.
          const entries = Object.entries(maybe)
          if (!entries.every(([, value]) => typeof value === 'string')) return null
          return entries.reduce<Record<string, string>>((acc, [key, value]) => {
            acc[key] = value as string
            return acc
          }, {})
        }

        let langCode = ''
        let catalog: Record<string, string> | null = null
        if (data && typeof data === 'object') {
          const obj = data as Record<string, unknown>
          if (typeof obj.lang === 'string' && obj.catalog && typeof obj.catalog === 'object') {
            langCode = canonicalizeLangCode(obj.lang)
            catalog = asStringMap(obj.catalog as Record<string, unknown>)
          } else {
            langCode = inferLangFromFileName(file.name)
            catalog = asStringMap(obj)
          }
        }
        if (!langCode || !catalog) throw new Error('Invalid l10n file')
        registerRuntimeCatalog(langCode, catalog)
        setToastMsg(t('toastL10nLoaded', { lang: langCode }))
        setToastOpen(true)
      } catch {
        setToastMsg(t('toastL10nLoadFailed'))
        setToastOpen(true)
      }
    },
  })
  // Track whether configs (and related data) differ from the last explicit Save
  const currentConfigSig = useMemo(() => JSON.stringify({ customCfgs, metasets, minima, finalSellRemainder }), [customCfgs, metasets, minima, finalSellRemainder])
  const [lastSavedSig, setLastSavedSig] = useState<string | null>(currentConfigSig)
  const isDirty = useMemo(() => lastSavedSig !== null && currentConfigSig !== lastSavedSig, [currentConfigSig, lastSavedSig])
  // Warn on close/tab navigation if there are unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])


  // Clipboard helpers moved to src/lib/clipboard.ts

// For a duplicate action on index `idx`, insert the new copy after the last
  // contiguous sibling that shares the same base name, starting from idx.
  // Compute insertion index strictly based on config index: always after idx.
  /** Compute the insertion index just after a given config index. */
  function insertIndexAfter(list: BuilderConfig[], idx: number): number {
    return Math.min(list.length, idx + 1)
  }
  /** Parse and insert pasted HSFC content either after selection or at end.
   *  Also copies Note only when the current note is empty. */
  function handlePasteText(text: string) {
    try {
      const parsed = parseHsfcText(text, { metasets, minima })
      const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      // Treat as full HSFC import path with potential metaset conflicts
      const prep = prepareHsfcImport(metasets, nextMetas, cfgs)
      if (prep.conflicts.length) {
        setPendingImport({ cfgs: prep.cfgsMapped, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr, selectedIndex, ...(note ? { note } : {}), mode: 'after' })
        setConflictIds(prep.conflicts)
        setImportIdMap(prep.idMap)
        setMetasetConflictOpen(true)
        setPasteDlgOpen(false)
        setPasteErr(null)
        return true
      }
      const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
      // Ensure referenced metaset IDs exist; create hidden placeholders with generated names
      {
        const refIds = new Set<string>()
        for (const c of prep.cfgsMapped) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
        const have = new Set(metasDone.map(m => m.id))
        const namesBase = new Set(metasDone.map(m => m.name))
        const finalMetas = metasDone.slice()
        for (const id of refIds) {
          if (!have.has(id)) {
            let genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
            // Avoid duplicates if generator returns an existing one
            while (namesBase.has(genName)) genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
            namesBase.add(genName)
            finalMetas.push({ id, name: genName, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
            have.add(id)
          }
        }
        setMetasets(finalMetas)
      }
      // Insert after selected or at end
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        return [...prev.slice(0, insertIdx), ...prep.cfgsMapped, ...prev.slice(insertIdx)]
      })
      setFinalSellRemainder(fsr)
      if ((!hsfcNote || !hsfcNote.trim()) && typeof note === 'string' && note.trim()) { setHsfcNote(note) }
      setPasteErr(null)
      return true
    } catch {
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
      })
      setPasteErr(null)
      return true
    }
  }

  /** Paste configs from the clipboard after the chip at index `idx`. */


  // Compute a stable key for configs that affects HSF rule generation (ignores display-only fields like `name`).
  // Why: Changing the config name should not cause a refresh of the Sellfile Preview table.
  const customCfgsBuildKey = useMemo(() => {
    try {
      const keyObjs = customCfgs.map((c) => ({
        keep: c.keep,
        visibility: c.visibility,
        minLevel: c.minLevel,
        maxLevel: c.maxLevel,
        rankCode: c.rankCode,
        rarityCode: c.rarityCode,
        rarityMode: c.rarityMode,
        autoRaritySupplementsThreshold: (c as { autoRaritySupplementsThreshold?: 'uncommon'|'rare'|'epic' }).autoRaritySupplementsThreshold ?? null,
        factionCode: c.factionCode,
        mainStatsV: c.mainStatsV,
        rollBaseline: c.rollBaseline,
        rollMode: c.rollMode,
        substatsV: c.substatsV,
        fixedSubstatsV: c.fixedSubstatsV,
        substatRollBoundsV: c.substatRollBoundsV,
        minCount: c.minCount,
        autoMinCount: c.autoMinCount,
        autoSubstatFlex: c.autoSubstatFlex,
        minRequiredRolls: c.minRequiredRolls,
        autoMinRequiredRolls: c.autoMinRequiredRolls,
        substatMinTarget: c.substatMinTarget,
        artifactTypes: c.artifactTypes,
        artifactSets: c.artifactSets,
        artifactMetaSets: c.artifactMetaSets,
        earlyKeepMode: c.earlyKeepMode,
      }))
      return JSON.stringify(keyObjs)
    } catch {
      // Fallback: length-based key to avoid crashes; worst case may refresh unnecessarily.
      return String(customCfgs.length)
    }
  }, [customCfgs])

  // Derive a view of configs that excludes display-only fields (like `name`).
  // Why: We want stable rule recomputation when rule-affecting fields change,
  // but avoid recompute on name edits. This mapping is synchronous and tied to the build key.
  const cfgsForMerge = useMemo(() => {
    return customCfgs.map((c) => {
      const { name: _omitName, ...rest } = c
      return rest
    })
  }, [customCfgsBuildKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merged rules for preview, computed via a pure helper. Depend on the build key so display-only edits won't refresh.
  const mergedRules = useMemo((): HsfRuleWithCfg[] => {
    return computeMergedRules({
      hsf,
      customCfgs: cfgsForMerge,
      metasets,
      minima,
      finalSellRemainder,
    })
  }, [hsf, cfgsForMerge, metasets, minima, finalSellRemainder])

  // Dev-only helper: bundle the builder config and its expanded HSF rules (with preview line numbers).
  const copyConfigWithRulesDev = React.useCallback(async (idx: number) => {
    if (!isDevBuild) return
    const cfg = customCfgs[idx]
    if (!cfg) return
    const readable = { __cfgIdx_ignoredWhenRead: idx + 1, ...buildReadableConfig(cfg, metasets) }
    const builderSnapshot = JSON.parse(JSON.stringify(cfg)) as BuilderConfig
    const rulesForCfg = mergedRules
      .map((rule, ruleIdx) => ({ rule, ruleIdx }))
      .filter(({ rule }) => rule.__cfgIdx === idx)
      .map(({ rule, ruleIdx }) => {
        const { __cfgIdx: _omitCfgIdx, __lineIdx: _omitLineIdx, __allKnownSets: _omitAllKnownSets, ...rest } = rule as HsfRuleWithCfg & { __allKnownSets?: boolean }
        const sanitized = JSON.parse(JSON.stringify(rest)) as HsfRule
        const line = typeof rule.__lineIdx === 'number' ? (rule.__lineIdx + 1) : (ruleIdx + 1)
        return { line, rule: sanitized }
      })
    const payload = {
      configNumber: idx + 1,
      name: cfg.name ?? null,
      builderConfig: builderSnapshot,
      readableConfig: readable,
      previewLines: rulesForCfg.map(r => r.line),
      rules: rulesForCfg,
    }
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
  }, [customCfgs, isDevBuild, metasets, mergedRules, setCopyDlgOpen, setCopyText])

  

  // Scroll the selected config chip into view within the chips container
  useEffect(() => {
    if (selectedCfgIdx === null) return
    const container = chipsContainerRef.current
    const el = document.getElementById(`cfg-chip-${selectedCfgIdx}`)
    if (!container || !el) return
    try {
      // Defer until after layout
      requestAnimationFrame(() => {
        const cRect = container.getBoundingClientRect()
        const eRect = el.getBoundingClientRect()
        const cur = container.scrollTop
        const topDelta = eRect.top - cRect.top
        const botDelta = eRect.bottom - cRect.bottom
        let target = cur
        if (topDelta < 0) {
          // Element is above viewport: align its top with container top
          target = Math.max(0, cur + topDelta)
        } else if (botDelta > 0) {
          // Element is below viewport: align its bottom with container bottom
          target = Math.max(0, cur + botDelta)
        }
        if (target !== cur) container.scrollTo({ top: target, behavior: 'smooth' })
      })
    } catch {}
  }, [selectedCfgIdx, customCfgs.length])

  const { restoreDlgOpen: dlgOpen, restoreDraft, dismissRestore, acceptRestore, autosaveEnabled } = useAutosaveRestore({
    key: AUTOSAVE_KEY,
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: selectedCfgIdx,
    note: hsfcNote,
  })
  // no-op

  // ---- HSFC import conflict state ----
  type PendingImport = {
    cfgs: BuilderConfig[]
    metasets: Metaset[]
    minima: typeof minima
    finalSellRemainder: typeof finalSellRemainder
    selectedIndex: number | null
    note?: string
    mode: 'append' | 'after'
    afterIdx?: number
  }
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [metasetConflictOpen, setMetasetConflictOpen] = useState(false)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [importIdMap, setImportIdMap] = useState<Map<string, string>>(new Map())
  // no separate stash for metas to add; computed on the fly

  function valueKey(sets: number[]): string {
    const arr = (sets || []).map(Number).slice().sort((a,b)=>a-b)
    return arr.join(',')
  }

  const prepareHsfcImport = useCallback((current: Metaset[], incoming: Metaset[], cfgsIn: BuilderConfig[]) => {
    const byIdCur = new Map(current.map(m => [m.id, m]))
    const byValCur = new Map<string, Metaset>()
    for (const m of current) byValCur.set(valueKey(m.sets), m)
    const idMap = new Map<string, string>()

    const conflicts: string[] = []
    const curVsIncById = new Map<string, { cur: Metaset; inc: Metaset }>()
    for (const inc of incoming) {
      const cur = byIdCur.get(inc.id)
      if (cur) {
        if (valueKey(cur.sets) !== valueKey(inc.sets)) { conflicts.push(inc.id); curVsIncById.set(inc.id, { cur, inc }) }
      }
    }

    const canonicalIncoming = new Map<string, string>() // valueKey -> canonical incoming ID (when not matching current)
    for (const inc of incoming) {
      const vkey = valueKey(inc.sets)
      if (curVsIncById.has(inc.id)) continue
      const curMatch = byValCur.get(vkey)
      if (curMatch) { idMap.set(inc.id, curMatch.id); continue }
      const existing = canonicalIncoming.get(vkey)
      if (existing) { idMap.set(inc.id, existing) } else { canonicalIncoming.set(vkey, inc.id) }
    }

    const toAdd: Metaset[] = []
    const seenAdd = new Set<string>()
    for (const inc of incoming) {
      if (curVsIncById.has(inc.id)) continue
      const target = idMap.get(inc.id) ?? inc.id
      if (byIdCur.has(target)) continue
      const vkey = valueKey(inc.sets)
      const canon = canonicalIncoming.get(vkey)
      if (canon && canon !== inc.id) continue
      if (seenAdd.has(target)) continue
      seenAdd.add(target)
      toAdd.push({ ...inc, id: target })
    }

    const cfgsMapped = cfgsIn.map(c => {
      const ids = (c.artifactMetaSets ?? []).slice()
      const mapped = ids.map(id => idMap.get(id) ?? id)
      return { ...c, artifactMetaSets: mapped }
    })

    return { idMap, toAdd, conflicts: Array.from(new Set(conflicts)), conflictPairs: curVsIncById, cfgsMapped }
  }, [])

  const finalizeImport = useCallback((baseCurrent: Metaset[], prep: ReturnType<typeof prepareHsfcImport>, strategy: 'keepCurrent' | 'useIncoming' | 'keepBoth') => {
    const { toAdd, conflicts: ids, conflictPairs } = prep
    let nextMetas = baseCurrent.slice()
    const remapForConflicts = new Map<string, string>()
    if (ids.length) {
      if (strategy === 'useIncoming') {
        const map = new Map(nextMetas.map(m => [m.id, m]))
        for (const id of ids) {
          const pair = conflictPairs.get(id)!
          map.set(id, { ...pair.inc })
        }
        nextMetas = Array.from(map.values())
      } else if (strategy === 'keepBoth') {
        for (const id of ids) {
          const pair = conflictPairs.get(id)!
          let newId = makeMetasetId()
          while (nextMetas.some(m => m.id === newId) || id === newId) newId = makeMetasetId()
          nextMetas.push({ ...pair.inc, id: newId })
          remapForConflicts.set(id, newId)
        }
      } else {
        // keepCurrent: no change to current entries
      }
    }
    for (const m of toAdd) nextMetas.push(m)
    return { nextMetas, remapForConflicts }
  }, [])

  const pasteAfterIndex = useCallback(async (idx: number) => {
    // Try clipboard first via safe helper
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const parsed = parseHsfcText(text, { metasets, minima })
        const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
        if (cfgs.length > 0) {
          const prep = prepareHsfcImport(metasets, nextMetas, cfgs)
          if (prep.conflicts.length) {
            setPendingImport({ cfgs: prep.cfgsMapped, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr, selectedIndex, ...(note ? { note } : {}), mode: 'after', afterIdx: idx })
            setConflictIds(prep.conflicts)
            setImportIdMap(prep.idMap)
            setMetasetConflictOpen(true)
            return
          }
          const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
          // Ensure referenced metaset IDs exist; create hidden placeholders
          {
            const refIds = new Set<string>()
            for (const c of prep.cfgsMapped) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
            const have = new Set(metasDone.map(m => m.id))
            const namesBase = new Set(metasDone.map(m => m.name))
            const finalMetas = metasDone.slice()
            for (const id of refIds) {
              if (!have.has(id)) {
                let genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
                while (namesBase.has(genName)) genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
                namesBase.add(genName)
                finalMetas.push({ id, name: genName, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
                have.add(id)
              }
            }
            setMetasets(finalMetas)
          }
          setCustomCfgs(prev => {
            const insertIdx = Math.min(prev.length, idx + 1)
            return [...prev.slice(0, insertIdx), ...prep.cfgsMapped, ...prev.slice(insertIdx)]
          })
          setFinalSellRemainder(fsr)
          if ((!hsfcNote || !hsfcNote.trim()) && typeof note === 'string' && note.trim()) { setHsfcNote(note) }
          try {
            setSelectedCfgIdx(idx + cfgs.length)
            setBuilder(cfgs[cfgs.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length > 0) {
        setCustomCfgs(prev => {
          const insertIdx = Math.min(prev.length, idx + 1)
          return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
        })
        try {
          setSelectedCfgIdx(idx + cfgs.length)
          setBuilder(cfgs[cfgs.length - 1]!)
        } catch {}
        return
      }
    }
    // Fallback: open manual dialog and target insertion after idx
    setSelectedCfgIdx(idx)
    setPasteAfterIdx(idx)
    setPasteText('')
    setPasteErr(null)
    setPasteDlgOpen(true)
  }, [metasets, minima, prepareHsfcImport, finalizeImport, setPendingImport, setConflictIds, setImportIdMap, setMetasetConflictOpen, setMetasets, setCustomCfgs, setFinalSellRemainder, hsfcNote, setHsfcNote, setSelectedCfgIdx, setBuilder, setPasteErr, setPasteDlgOpen, setPasteText, setPasteAfterIdx])
  const handleConfigHoverIdx = useCallback((idx: number | null) => {
    setHoveredCfgIdx(idx)
  }, [])

  const handleConfigSelect = useCallback((event: React.MouseEvent, idx: number) => {
    const cfg = customCfgs[idx]
    if (!cfg) return
    if (event.shiftKey && selectionAnchorRef.current !== null) {
      const anchor = selectionAnchorRef.current
      const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
      const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
      setSelectedCfgIndices(range)
      setSelectedCfgIdx(idx)
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedCfgIndices(prev => {
        const set = new Set(prev)
        if (set.has(idx)) {
          set.delete(idx)
        } else {
          set.add(idx)
        }
        const next = Array.from(set).sort((a, b) => a - b)
        setSelectedCfgIdx(next.length ? idx : null)
        selectionAnchorRef.current = next.length ? idx : null
        if (next.length === 1) {
          const only = customCfgs[next[0]!]!
          if (only) setBuilder(only)
        }
        return next
      })
    } else {
      setSelectedCfgIndices([idx])
      selectionAnchorRef.current = idx
      setSelectedCfgIdx(idx)
      setBuilder(cfg)
    }
  }, [customCfgs, setBuilder, setSelectedCfgIdx, setSelectedCfgIndices])

  const handleConfigDelete = useCallback((idx: number) => {
    if (selectedCfgIndices.length > 1 && selectedCfgIndices.includes(idx)) {
      setConfirmDeleteMultiCount(selectedCfgIndices.length)
    } else {
      setConfirmDeleteIdx(idx)
    }
  }, [selectedCfgIndices, setConfirmDeleteIdx, setConfirmDeleteMultiCount])

  const handleConfigDuplicate = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      const copies = selected.map(i => ({ ...prev[i]! }))
      const insertAfter = Math.max(...selected)
      const insertIdx = Math.min(prev.length, insertAfter + 1)
      const next = [...prev.slice(0, insertIdx), ...copies, ...prev.slice(insertIdx)]
      const newIdxStart = insertIdx
      const newIdxs = copies.map((_, i) => newIdxStart + i)
      setSelectedCfgIndices(newIdxs)
      setSelectedCfgIdx(newIdxs[newIdxs.length - 1] ?? null)
      selectionAnchorRef.current = newIdxs[newIdxs.length - 1] ?? null
      return next
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIndices, setSelectedCfgIdx])

  const handleConfigPasteAfter = useCallback((idx: number) => {
    const target = selectedCfgIndices.length > 1
      ? Math.max(...selectedCfgIndices)
      : idx
    void pasteAfterIndex(target)
  }, [selectedCfgIndices, pasteAfterIndex])

  const handleConfigMoveUp = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      const arr = [...prev]
      for (const i of selected) {
        if (i <= 0) continue
        const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
      }
      const selItems = selected.map(i => prev[i]!)
      const selSet = new Set(selItems)
      const newSel: number[] = []
      arr.forEach((item, i) => { if (selSet.has(item)) newSel.push(i) })
      setSelectedCfgIndices(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      selectionAnchorRef.current = newSel[newSel.length - 1] ?? null
      return arr
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIndices, setSelectedCfgIdx])

  const handleConfigMoveDown = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      const arr = [...prev]
      for (let k = selected.length - 1; k >= 0; k -= 1) {
        const i = selected[k]!
        if (i >= arr.length - 1) continue
        const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
      }
      const selItems = selected.map(i => prev[i]!)
      const selSet = new Set(selItems)
      const newSel: number[] = []
      arr.forEach((item, i) => { if (selSet.has(item)) newSel.push(i) })
      setSelectedCfgIndices(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      selectionAnchorRef.current = newSel[newSel.length - 1] ?? null
      return arr
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIndices, setSelectedCfgIdx])

  const handleConfigMoveTop = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      if (selected[0] === 0) return prev
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...block, ...remaining]
      const newSel = selected.map((_, i) => i)
      setSelectedCfgIndices(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      selectionAnchorRef.current = newSel[newSel.length - 1] ?? null
      return next
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIndices, setSelectedCfgIdx])

  const handleConfigMoveBottom = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      if (selected[selected.length - 1] === prev.length - 1) return prev
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...remaining, ...block]
      const base = next.length - block.length
      const newSel = block.map((_, i) => base + i)
      setSelectedCfgIndices(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      selectionAnchorRef.current = newSel[newSel.length - 1] ?? null
      return next
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIndices, setSelectedCfgIdx])

  const handleCopyAllConfigs = useCallback(async () => {
    const payload = buildHsfcPayload({
      version: APP_VERSION,
      metasets,
      minima,
      configs: customCfgs,
      finalSellRemainder,
      selectedConfigIndex: selectedCfgIdx,
      ...(hsfcNote && hsfcNote.trim() ? { note: hsfcNote } : {}),
    })
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) {
      setCopyText(text)
      setCopyDlgOpen(true)
    }
  }, [customCfgs, finalSellRemainder, hsfcNote, metasets, minima, selectedCfgIdx, setCopyDlgOpen, setCopyText])

  const handleCopyConfig = useCallback(async (idx: number) => {
    const multi = selectedCfgIndices.length > 1 && selectedCfgIndices.includes(idx)
    if (multi) {
      const sel = selectedCfgIndices.slice().sort((a, b) => a - b)
      const cfgs = sel.map(i => customCfgs[i]!).filter(Boolean)
      const readable = cfgs.map((c, index) => ({ __cfgIdx_ignoredWhenRead: sel[index]! + 1, ...buildReadableConfig(c, metasets) }))
      const usedMetaIds = new Set<string>()
      for (const c of cfgs) for (const id of (c.artifactMetaSets ?? [])) usedMetaIds.add(String(id))
      const metasOut = metasets
        .filter(m => usedMetaIds.has(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          setNames: m.sets.slice().sort((a, b) => a - b).map((idNum) => artifactSetNames[Number(idNum)]).filter((x): x is string => Boolean(x)),
          show: m.show !== false,
        }))
      const payload = { Version: APP_VERSION, Metasets: metasOut, Configs: readable }
      const text = JSON.stringify(payload, null, 2)
      const ok = await writeTextSafe(text)
      if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
    } else {
      const cfg = customCfgs[idx]
      if (!cfg) return
      const readable = { __cfgIdx_ignoredWhenRead: idx + 1, ...buildReadableConfig(cfg, metasets) }
      const usedMetaIds = cfg.artifactMetaSets ?? []
      const metasOut = metasets
        .filter(m => usedMetaIds.includes(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          setNames: m.sets.slice().sort((a, b) => a - b).map((idNum) => artifactSetNames[Number(idNum)]).filter((x): x is string => Boolean(x)),
          show: m.show !== false,
        }))
      const payload = { Version: APP_VERSION, Metasets: metasOut, Configs: [readable] }
      const text = JSON.stringify(payload, null, 2)
      const ok = await writeTextSafe(text)
      if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
    }
  }, [customCfgs, metasets, selectedCfgIndices, setCopyDlgOpen, setCopyText])

  const handleSelectAllConfigs = useCallback(() => {
    const all = customCfgs.map((_, i) => i)
    setSelectedCfgIndices(all)
    setSelectedCfgIdx(all[all.length - 1] ?? null)
    selectionAnchorRef.current = all[all.length - 1] ?? null
  }, [customCfgs, setSelectedCfgIndices, setSelectedCfgIdx])

  const handleClearSelection = useCallback(() => {
    setSelectedCfgIndices([])
    setSelectedCfgIdx(null)
    selectionAnchorRef.current = null
  }, [setSelectedCfgIndices, setSelectedCfgIdx])

  const handlePasteAtEnd = useCallback(async () => {
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const parsed = parseHsfcText(text, { metasets, minima })
        const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
        if (cfgs.length > 0) {
          const prep = prepareHsfcImport(metasets, nextMetas, cfgs)
          if (prep.conflicts.length) {
            setPendingImport({ cfgs: prep.cfgsMapped, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr, selectedIndex, ...(note ? { note } : {}), mode: 'append' })
            setConflictIds(prep.conflicts)
            setImportIdMap(prep.idMap)
            setMetasetConflictOpen(true)
            return
          }
          const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
          const refIds = new Set<string>()
          for (const c of prep.cfgsMapped) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
          const have = new Set(metasDone.map(m => m.id))
          const namesBase = new Set(metasDone.map(m => m.name))
          const finalMetas = metasDone.slice()
          for (const id of refIds) {
            if (!have.has(id)) {
              let genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
              while (namesBase.has(genName)) genName = generateMetasetNameWithFlag(Array.from(namesBase)).name
              namesBase.add(genName)
              finalMetas.push({ id, name: genName, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
              have.add(id)
            }
          }
          setMetasets(finalMetas)
          const preLen = customCfgs.length
          setCustomCfgs(prev => [...prev, ...prep.cfgsMapped])
          setFinalSellRemainder(fsr)
          if ((!hsfcNote || !hsfcNote.trim()) && typeof note === 'string' && note.trim()) { setHsfcNote(note) }
          try {
            const sel = preLen + cfgs.length - 1
            setSelectedCfgIdx(sel)
            setBuilder(cfgs[cfgs.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length > 0) {
        setCustomCfgs(prev => [...prev, ...cfgs])
        try {
          const sel = customCfgs.length + cfgs.length - 1
          setSelectedCfgIdx(sel)
          setBuilder(cfgs[cfgs.length - 1]!)
        } catch {}
        return
      }
    }
    setPasteDlgOpen(true)
    setPasteText('')
    setPasteErr(null)
    setPasteAfterIdx(customCfgs.length - 1)
  }, [customCfgs, metasets, minima, prepareHsfcImport, finalizeImport, setPendingImport, setConflictIds, setImportIdMap, setMetasetConflictOpen, setMetasets, setCustomCfgs, setFinalSellRemainder, hsfcNote, setHsfcNote, setSelectedCfgIdx, setBuilder, setPasteDlgOpen, setPasteText, setPasteErr, setPasteAfterIdx])

  // Build autosave payload and write via useAutosave (enabled after restore choice)
  // Autosave should not be triggered by selection-only changes.
  // Pass selectedConfigIndex: null in autosave payload so selection changes
  // do not alter the payload. Explicit Save/Copy flows still include it.
  const autosavePayload = useMemo(() => buildHsfcPayload({
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: null,
    ...(hsfcNote && hsfcNote.trim() ? { note: hsfcNote } : {}),
  }), [metasets, minima, customCfgs, finalSellRemainder, hsfcNote])
  useAutosave({ key: AUTOSAVE_KEY, payload: autosavePayload, enabled: autosaveEnabled && !tutorialOpen && !autosaveSilencedByClear })
  // Listen for child chip open-copy-dialog to open manual copy UI
  useEffect(() => {
    const onOpen = (e: Event) => {
      try {
        const detail = (e as CustomEvent<string>).detail
        if (typeof detail === 'string') { setCopyText(detail); setCopyDlgOpen(true) }
      } catch {}
    }
    window.addEventListener(COPY_DIALOG_EVENT, onOpen as EventListener)
    return () => window.removeEventListener(COPY_DIALOG_EVENT, onOpen as EventListener)
  }, [])
  // When copy dialog opens, preselect text for native copy (Ctrl/Cmd+C)
  useEffect(() => {
    const timer = copyDlgOpen
      ? window.setTimeout(() => {
        try {
          const el = copyInputRef.current
          if (el && typeof (el as HTMLInputElement).select === 'function') (el as HTMLInputElement).select()
        } catch {}
      }, 0)
      : undefined
    return () => { timer !== undefined && window.clearTimeout(timer) }
  }, [copyDlgOpen])
  

  // Drag/drop: handled by useFileDragDrop hook above



  // Manage Colors icon (bitmap), generated once at runtime
  const configNames = useMemo(() => customCfgs.map(cfg => cfg?.name ?? ''), [customCfgs])
  const configModes = useMemo(() => customCfgs.map((cfg) => cfg.visibility), [customCfgs])
  const filterResult = useMemo<FilterHsfRulesResult<HsfRuleWithCfg>>(() => (
    filterHsfRules(mergedRules, rulesFilter, metasets, { configNames, configModes })
  ), [mergedRules, rulesFilter, metasets, configNames, configModes])
  const filteredRules = filterResult.rules
  const matchingConfigIndices = filterResult.matchingConfigIndices
  const filterActive = isRulesFilterActive(rulesFilter)
  const colorIconSrc = React.useMemo(() => makeManageColorsIcon(), [])
  const hasNamedConfigs = useMemo(() => customCfgs.some(cfg => Boolean(cfg?.name && cfg.name.trim().length > 0)), [customCfgs])
  const visibleConfigIndices = useMemo<Set<number> | null>(() => (limitConfigsToFiltered ? matchingConfigIndices : null), [limitConfigsToFiltered, matchingConfigIndices])
  const focusRuleByIndex = useCallback((ruleIndex: number): boolean => {
    if (ruleIndex < 0 || ruleIndex >= mergedRules.length) return false
    const rule = mergedRules[ruleIndex]
    if (!rule) return false
    const cfgIdx = (rule as HsfRuleWithCfg).__cfgIdx
    if (typeof cfgIdx === 'number' && cfgIdx >= 0 && cfgIdx < customCfgs.length) {
      setSelectedCfgIdx(cfgIdx)
      setSelectedCfgIndices([cfgIdx])
      selectionAnchorRef.current = cfgIdx
      const cfg = customCfgs[cfgIdx]
      if (cfg) setBuilder(cfg)
    }
    try {
      const effective = filterActive ? filteredRules : mergedRules
      const idxInEffective = effective.indexOf(rule)
      if (idxInEffective >= 0) {
        setFocusRuleIndex(idxInEffective)
        window.setTimeout(() => setFocusRuleIndex(null), 300)
      } else {
        setFocusRuleIndex(null)
      }
    } catch {
      setFocusRuleIndex(null)
    }
    return true
  }, [mergedRules, customCfgs, filterActive, filteredRules, setSelectedCfgIdx, setSelectedCfgIndices, setBuilder])
  const showFactionFilter = useMemo(() => {
    try { return mergedRules.some(r => r.Faction !== undefined) } catch { return false }
  }, [mergedRules])

  const evaluateConfigAgainstFilters = useCallback((config: BuilderConfig, targetIndex: number, names: string[], modes: SellfileVisibility[]): boolean => {
    try {
      const rulesForConfig = buildRulesForConfig({ config, metasets, minima, cfgIdx: targetIndex })
      const result = filterHsfRules(rulesForConfig, rulesFilter, metasets, { configNames: names, configModes: modes })
      return result.matchingConfigIndices.has(targetIndex)
    } catch {
      return true
    }
  }, [metasets, minima, rulesFilter])

  const prospectiveInsertIndex = useMemo(() => (
    selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length
      ? selectedCfgIdx + 1
      : customCfgs.length
  ), [selectedCfgIdx, customCfgs.length])

  const builderInsertMatchesFilter = useMemo(() => {
    if (!filterActive || !limitConfigsToFiltered) return true
    const names = configNames.slice()
    names.splice(prospectiveInsertIndex, 0, builder.name ?? '')
    const modes = configModes.slice()
    const builderVisibility: SellfileVisibility = builder.visibility
    modes.splice(prospectiveInsertIndex, 0, builderVisibility)
    return evaluateConfigAgainstFilters(builder, prospectiveInsertIndex, names, modes)
  }, [filterActive, limitConfigsToFiltered, configNames, configModes, prospectiveInsertIndex, builder, evaluateConfigAgainstFilters])

  const configHiddenByFilters = filterActive && limitConfigsToFiltered && !builderInsertMatchesFilter

  const handleExternalCommand = useCallback((cmd: ExternalCommand) => {
    if (cmd.kind === 'selectRule') {
      if (cmd.rowNumber != null) {
        const zeroBasedIndex = Math.max(0, Math.floor(cmd.rowNumber) - 1)
        focusRuleByIndex(zeroBasedIndex)
      }
      return
    }

    if (cmd.kind === 'testerItems') {
      if (cmd.openTester) setTesterOpen(true)
      const converted: TestItem[] = []
      for (const artifact of cmd.items) {
        const mapped = externalArtifactToTestItem(artifact)
        if (mapped) converted.push(mapped)
      }
      if (converted.length > 0) {
        setPendingTesterItems((prev) => [...prev, ...converted])
      }
    }
  }, [focusRuleByIndex, setTesterOpen])

  useEffect(() => {
    commandHandlerRef.current = handleExternalCommand
  }, [handleExternalCommand])

  useEffect(() => {
    if (!pushEndpoint) return
    let cancelled = false
    const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms) })

    const run = async () => {
      while (!cancelled) {
        try {
          const base = pushEndpoint.endsWith('/') ? pushEndpoint : `${pushEndpoint}/`
          let commandsUrl: URL
          try {
            commandsUrl = new URL('commands', base)
          } catch {
            const fallback = base.endsWith('/') ? `${base}commands` : `${base}/commands`
            commandsUrl = new URL(fallback)
          }
          const controller = new AbortController()
          commandAbortRef.current = controller
          const response = await fetch(commandsUrl.toString(), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
          })
          commandAbortRef.current = null
          if (cancelled) return
          setPushEndpointReachable(true)
          if (response.status === 204) {
            await sleep(1000)
            continue
          }
          if (!response.ok) {
            await sleep(2000)
            continue
          }
          let payload: unknown = null
          try {
            payload = await response.json()
          } catch {}
          if (!payload) {
            await sleep(1000)
            continue
          }
          const record = isRecord(payload) ? payload : {}
          const eventsCandidate = Array.isArray(record.events)
            ? record.events as unknown[]
            : Array.isArray((record.Events as unknown[]))
              ? record.Events as unknown[]
              : []
          for (const raw of eventsCandidate) {
            const normalized = normalizeExternalCommand(raw)
            if (!normalized) continue
            try {
              commandHandlerRef.current(normalized)
            } catch (err) {
              if (import.meta.env.DEV) {
                console.error('Failed to apply external command', err)
              }
            }
          }
          if (eventsCandidate.length === 0) {
            await sleep(1000)
          } else {
            await sleep(100)
          }
        } catch (err) {
          commandAbortRef.current = null
          if (cancelled) return
          const name = (err as { name?: string }).name
          if (name === 'AbortError') {
            continue
          }
          setPushEndpointReachable(false)
          await sleep(2000)
        }
      }
    }

    run()

    return () => {
      cancelled = true
      const controller = commandAbortRef.current
      if (controller) {
        try { controller.abort() } catch {}
        commandAbortRef.current = null
      }
    }
  }, [pushEndpoint, setPushEndpointReachable])
  // Dirty flag: builder differs from currently selected config
  const selectedIsDirty = React.useMemo(() => {
    if (selectedCfgIdx === null) return false
    const target = customCfgs[selectedCfgIdx]
    if (!target) return false
    try {
      return JSON.stringify(builder) !== JSON.stringify(target)
    } catch {
      return true
    }
  }, [builder, customCfgs, selectedCfgIdx])
  const duplicateOfIndices = useMemo(() => computeDuplicateIndices(customCfgs), [customCfgs])

  const builderPanelElement = (
    <BuilderPanel
      cfg={builder}
      onChange={setBuilder}
      onAddToCustom={() => {
        const currentBuilder = builderRef.current
        setCustomCfgs(prev => {
          const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
            ? selectedCfgIdx + 1
            : prev.length
          const next = [...prev.slice(0, insertIdx), currentBuilder, ...prev.slice(insertIdx)]
          // Auto-select the newly added config chip
          setSelectedCfgIdx(insertIdx)
          setSelectedCfgIndices([insertIdx])
          selectionAnchorRef.current = insertIdx
          return next
        })
      }}
      editingIndex={selectedCfgIndices.length === 1 ? selectedCfgIdx : null}
      onUpdateSelected={() => {
        if (selectedCfgIdx === null) return
        const currentBuilder = builderRef.current
        setCustomCfgs(prev => prev.map((c, i) => (i === selectedCfgIdx ? currentBuilder : c)))
      }}
      metasets={metasets}
      onMetasetsChange={(next) => setMetasets(next)}
      onDeleteMetaset={(id, opts) => {
        // Determine replacement strategy before mutating metasets/configs
        const metaToDelete = metasets.find(m => m.id === id) || null
        const replaceWithSets = Boolean(opts?.replaceWithSets && metaToDelete && (metaToDelete.sets.length > 0))
        const replaceWithMetaId = opts?.replaceWithMetaId && opts.replaceWithMetaId !== id ? opts.replaceWithMetaId : null

        // Remove metaset from the list (cheap)
        setMetasets(prev => prev.filter(m => m.id !== id))

        // Update the live builder selection if it referenced this metaset
        const builderUses = (builder.artifactMetaSets ?? []).includes(id)
        if (builderUses) {
          setBuilder(prev => {
            const currentMeta = prev.artifactMetaSets ?? []
            if (!currentMeta.includes(id)) return prev
            let nextMeta = currentMeta.filter(x => x !== id)
            let nextSets = prev.artifactSets ?? []
            if (replaceWithSets && metaToDelete) {
              const merged = new Set<number>(nextSets)
              for (const s of metaToDelete.sets) merged.add(s)
              nextSets = Array.from(merged)
            } else if (replaceWithMetaId) {
              if (!nextMeta.includes(replaceWithMetaId)) nextMeta = nextMeta.concat(replaceWithMetaId)
            }
            return { ...prev, artifactMetaSets: nextMeta, artifactSets: nextSets }
          })
        }

        // If no configs reference this metaset, skip mapping the entire array
        const usedCount = metasetUsageCounts[id] || 0
        if (usedCount === 0) return

        // Update only configs that reference this metaset
        setCustomCfgs(prev => {
          let anyChanged = false
          const next = prev.map(c => {
            const currentMeta = c.artifactMetaSets ?? []
            if (!currentMeta.includes(id)) return c
            anyChanged = true
            let nextMeta = currentMeta.filter(x => x !== id)
            let nextSets = c.artifactSets ?? []
            if (replaceWithSets && metaToDelete) {
              const merged = new Set<number>(nextSets)
              for (const s of metaToDelete.sets) merged.add(s)
              nextSets = Array.from(merged)
            } else if (replaceWithMetaId) {
              if (!nextMeta.includes(replaceWithMetaId)) nextMeta = nextMeta.concat(replaceWithMetaId)
            }
            return { ...c, artifactMetaSets: nextMeta, artifactSets: nextSets }
          })
          return anyChanged ? next : prev
        })
      }}
      minima={minima}
      onMinimaChange={setMinima}
      minimaDialogOpen={minimaDialogOpen}
      onCloseMinimaDialog={closeMinimaDialog}
      setUsageCounts={setUsageCounts}
      metasetUsageCounts={metasetUsageCounts}
      substatColors={substatColors}
      configCount={customCfgs.length}
      selectedIsDirty={selectedIsDirty}
      configHiddenByFilters={configHiddenByFilters}
      onSelectConfigsByMetaset={(id) => {
        // Select all configs that reference the given metaset ID.
        const indices: number[] = []
        for (let i = 0; i < customCfgs.length; i += 1) {
          const ref = customCfgs[i]?.artifactMetaSets ?? []
          if (ref.includes(id)) indices.push(i)
        }
        setSelectedCfgIndices(indices)
        const lastIdx = indices.length - 1
        const last = lastIdx >= 0 ? indices[lastIdx]! : null
        setSelectedCfgIdx(last)
        selectionAnchorRef.current = last
      }}
    />
  )

  const configChipsPanelElement = (
    <ConfigChipsPanel
      containerRef={chipsContainerRef}
      configs={customCfgs}
      maxHeightPx={chipsMaxHeight}
      selectedIndices={selectedCfgIndices}
      metasets={metasets}
      substatColors={substatColors}
      hoveredIdx={hoveredCfgIdx}
      onHoverIdx={handleConfigHoverIdx}
      duplicateOfIndices={duplicateOfIndices}
      onSelect={handleConfigSelect}
      onDelete={handleConfigDelete}
      onDuplicate={handleConfigDuplicate}
      onPasteAfter={handleConfigPasteAfter}
      onMoveUp={handleConfigMoveUp}
      onMoveDown={handleConfigMoveDown}
      onMoveTop={handleConfigMoveTop}
      onMoveBottom={handleConfigMoveBottom}
      highlightDelete={hoverDeleteConfigs}
      onCopyAllConfigs={handleCopyAllConfigs}
      onCopyConfig={handleCopyConfig}
      {...(isDevBuild ? { onCopyConfigDev: copyConfigWithRulesDev } : {})}
      onSelectAll={handleSelectAllConfigs}
      onClearSelection={handleClearSelection}
      onPasteAtEnd={handlePasteAtEnd}
      visibleIndices={visibleConfigIndices}
    />
  )

  const previewPaperHeightPx = useMemo(() => {
    const base = leftHeight
    const floor = sideBySideMinPaperHeight
    const next = Math.max(base, floor)
    return next > 0 ? Math.round(next) : null
  }, [leftHeight, sideBySideMinPaperHeight])

  const sideBySideMinPaperHeightPx = useMemo(() => (sideBySideMinPaperHeight > 0 ? `${sideBySideMinPaperHeight}px` : undefined), [sideBySideMinPaperHeight])
  const previewPaperHeightStyle = useMemo(() => (previewPaperHeightPx ? `${previewPaperHeightPx}px` : undefined), [previewPaperHeightPx])

  return (
    <Container maxWidth="xl" sx={{ pt: 1.5, pb: 1.5 }}>
      {/* Full-screen, non-interactive overlay shown while dragging files over the app.
          We keep pointerEvents: 'none' so drops still reach the window handler. */}
      {(() => {
        const dragOverlayVisible = fileDragActive && !confirmClearOpen && confirmDeleteIdx === null && confirmDeleteMultiCount === null
        return <FileDragOverlay active={dragOverlayVisible} />
      })()}
      <GlobalStyles styles={(theme) => ({
        '*, *::before, *::after': {
          scrollbarWidth: 'thin',
          scrollbarColor: `${theme.palette.divider} transparent`,
        },
        // Hide MUI tooltips while scrolling to avoid viewport scrollbar flicker
        '.scrolling .MuiTooltip-popper': {
          display: 'none !important',
        },
        '::-webkit-scrollbar': {
          width: 10,
          height: 10,
        },
        '::-webkit-scrollbar-track': {
          backgroundColor: theme.palette.background.paper,
        },
        '::-webkit-scrollbar-thumb': {
          backgroundColor: theme.palette.divider,
          borderRadius: 8,
          border: `2px solid ${theme.palette.background.paper}`,
        },
        '::-webkit-scrollbar-thumb:hover': {
          backgroundColor: theme.palette.text.disabled,
        },
        'input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button': {
          WebkitAppearance: 'auto',
          margin: 0,
          opacity: 0.7,
          filter: theme.palette.mode === 'dark' ? 'invert(0.8)' : 'none',
        },
      })} />
      <Box
        sx={{
          mb: 1,
          width: '100%',
          maxWidth: PANEL_WIDTH_PX,
          mx: 'auto',
          [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
            position: 'relative',
            left: '50%',
            transform: 'translateX(-50%)',
            width: `${SIDE_BY_SIDE_BREAKPOINT_PX}px`,
            maxWidth: 'none',
            mx: 0,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
            flexWrap: 'wrap',
            width: '100%',
            maxWidth: PANEL_WIDTH_PX,
            [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
              // Anchor to the left edge of the two-column grid; only span the left panel width
              gridColumn: '1 / span 1',
            },
          }}
        >
          <Typography variant="h4" fontWeight={700} sx={{ whiteSpace: 'nowrap', fontSize: `${FONT_SIZE_DISPLAY_REM}rem` }}>RSL Helper Sellfile Creator</Typography>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 1, flex: 1, flexWrap: 'nowrap' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25, minWidth: 0 }}>
              <Typography variant="caption" color="text.secondary" data-allow-select={1 as const} data-allow-context={1 as const} sx={{ fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.15, textAlign: 'right' }}>
                v{APP_VERSION} — Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0, fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.15, textAlign: 'right' }}>
                Unofficial, fan-made tool — not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper. Trademarks belong to their owners.
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0, fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.15, textAlign: 'right' }}>
                Many thanks to [STBL] Nasgor for his invaluable contributions! — Remember: Bleibt Stabil!
              </Typography>
            </Box>
            <Box sx={{ alignSelf: 'flex-start' }}>
              <Tooltip title={t('helpOpenTooltip')}>
                <Button
                  size="medium"
                  variant="contained"
                  startIcon={<HelpOutlineIcon fontSize="small" />}
                  onClick={() => { setHelpFirstRunMode(false); setHelpOpen(true) }}
                  aria-label={t('helpAriaLabel')}
                  sx={{ height: 34, minHeight: 34, px: 1.25 }}
                >
                  {t('helpOpenLabel')}
                </Button>
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Box>

      

      <Stack spacing={2}>
        {/* Original vertical layout; pairs side-by-side only when viewport >= 2304px */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            // default: contained width with normal stacking
            [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
              // Center the pair relative to the viewport without Container influence
              // 1152 + 16 gap + 1152 = 2320
              position: 'relative',
              left: '50%',
              transform: 'translateX(-50%)',
              width: `${SIDE_BY_SIDE_BREAKPOINT_PX}px`,
              gridTemplateColumns: `${PANEL_WIDTH_PX}px ${PANEL_WIDTH_PX}px`,
              columnGap: `${GRID_COLUMN_GAP_PX}px`,
              alignItems: 'start',
            },
          }}
        >
        <Paper ref={leftPaperRef} sx={{ p: 2, width: '100%', maxWidth: PANEL_WIDTH_PX, mx: 'auto', [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: { mx: 0, width: PANEL_WIDTH_PX, ...(sideBySideMinPaperHeightPx ? { minHeight: sideBySideMinPaperHeightPx } : {}) } }} data-tour-id="builder.panel">
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', columnGap: 1, mb: 1.25 }}>
            <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>{t('appBuilderTitle')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('builderIntroCaption')}</Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={openMinimaDialog}
              sx={{ whiteSpace: 'nowrap', minWidth: 160, justifySelf: 'end' }}
            >
              {t('builderSubstatValues')}
            </Button>
          </Box>
          <Box sx={{ position: 'relative' }}>
            {builderPanelElement}

            {customCfgs.length > 0 && selectedCfgIndices.length > 1 && (
              <>
                <Box
                  sx={(theme) => ({
                    position: 'absolute',
                    inset: 0,
                    zIndex: 2,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)',
                    backdropFilter: 'blur(1.5px)',
                    WebkitBackdropFilter: 'blur(1.5px)',
                    pointerEvents: fileDragActive ? 'none' : 'auto',
                    cursor: 'not-allowed',
                    borderRadius: 1,
                  })}
                />
                <Tooltip title="Multiselect — editing disabled" followCursor slotProps={{ popper: { disablePortal: true } }}>
                  <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, pointerEvents: fileDragActive ? 'none' : 'auto' }}>
                    <LockIcon sx={{ fontSize: 42, opacity: 0.6 }} />
                  </Box>
                </Tooltip>
              </>
            )}
          </Box>
          {/* Merged: Custom Rules (HSFC) controls */}
          <HeaderActions
            onAboutToOpenHsfc={() => { try { setLastSavedSig(currentConfigSig) } catch {} }}
            onSelectHsfc={async (file) => {
              try {
                const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = await readHsfcFile(file, { metasets, minima })
                // File load replaces current state; no conflict resolution here
                setCustomCfgs(cfgs)
                if (nextMetas !== metasets) setMetasets(nextMetas)
                if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
                setFinalSellRemainder(fsr)
                const sel = selectedIndex
                setSelectedCfgIdx(sel)
                setSelectedCfgIndices(sel === null ? [] : [sel])
                selectionAnchorRef.current = sel
                if (sel !== null && cfgs[sel]) setBuilder(cfgs[sel]!)
                if (note && String(note).trim()) { setHsfcNote(String(note)); setNoteMode('view'); setNoteOpen(true) } else { setHsfcNote(null); setNoteOpen(false) }
                try { setLastSavedSig(JSON.stringify({ customCfgs: cfgs, metasets: nextMetas, minima: nextMinima, finalSellRemainder: fsr })) } catch {}
              } catch (err) {
                if (import.meta.env.DEV) {
                  console.error('Failed to parse .hsfc file', err)
                }
              }
            }}
            onSaveHsfc={() => {
              const payload = buildHsfcPayload({
                version: APP_VERSION,
                metasets,
                minima,
                configs: customCfgs,
                finalSellRemainder,
                selectedConfigIndex: selectedCfgIdx,
                ...(hsfcNote ? { note: hsfcNote } : {}),
              })
              const blob = hsfcToBlob(payload)
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = hsfcFilename()
              a.click()
              URL.revokeObjectURL(url)
              try { setToastMsg(t('toastConfigsSaved')); setToastOpen(true) } catch {}
              try { setLastSavedSig(currentConfigSig) } catch {}
            }}
            onDeleteAll={() => setConfirmClearOpen(true)}
            onHoverDeleteAll={(hover) => setHoverDeleteConfigs(Boolean(hover))}
            deleteDisabled={!customCfgs.length || selectedCfgIndices.length > 1}
            onOpenNote={() => { setNoteMode('edit'); setNoteOpen(true) }}
            notePresent={Boolean(hsfcNote && hsfcNote.trim())}
            count={customCfgs.length}
          />
          <MetasetConflictDialog
            open={metasetConflictOpen}
            count={conflictIds.length}
            onCancel={() => { setMetasetConflictOpen(false); setPendingImport(null); setConflictIds([]) }}
            onChoose={(choice) => {
              try {
                if (!pendingImport) { setMetasetConflictOpen(false); return }
                const prep = prepareHsfcImport(metasets, pendingImport.metasets, pendingImport.cfgs)
                const { nextMetas, remapForConflicts } = finalizeImport(metasets, prep, choice)
                const idMap = new Map(importIdMap)
                for (const [k,v] of remapForConflicts) idMap.set(k, v)
                const cfgs = pendingImport.cfgs.map(c => ({ ...c, artifactMetaSets: (c.artifactMetaSets ?? []).map(id => idMap.get(id) ?? id) }))
                // Ensure referenced IDs exist; create hidden placeholders if missing (merge into current metasets)
                const refIds = new Set<string>()
                for (const c of cfgs) for (const id of (c.artifactMetaSets ?? [])) refIds.add(String(id))
                const have = new Set(nextMetas.map(m => m.id))
                const finalMetas = nextMetas.slice()
                for (const id of refIds) {
                  if (!have.has(id)) {
                    const existingNames = metasets.map(m => m.name)
                    const gen = generateMetasetNameWithFlag(existingNames)
                    finalMetas.push({ id, name: gen.name, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
                  }
                }
                setMetasets(finalMetas)
                if (pendingImport.mode === 'append') {
                  const preLen = customCfgs.length
                  setCustomCfgs(prev => [...prev, ...cfgs])
                  setFinalSellRemainder(pendingImport.finalSellRemainder)
                  if ((!hsfcNote || !hsfcNote.trim()) && typeof pendingImport.note === 'string' && pendingImport.note.trim()) { setHsfcNote(pendingImport.note) }
                  try { const sel = preLen + cfgs.length - 1; setSelectedCfgIdx(sel); setBuilder(cfgs[cfgs.length - 1]!) } catch {}
                } else {
                  const after = Math.max(0, Math.min((pendingImport.afterIdx ?? customCfgs.length - 1), customCfgs.length - 1))
                  setCustomCfgs(prev => {
                    const insertIdx = Math.min(prev.length, after + 1)
                    return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
                  })
                  setFinalSellRemainder(pendingImport.finalSellRemainder)
                  if ((!hsfcNote || !hsfcNote.trim()) && typeof pendingImport.note === 'string' && pendingImport.note.trim()) { setHsfcNote(pendingImport.note) }
                  try { setSelectedCfgIdx(after + cfgs.length); setBuilder(cfgs[cfgs.length - 1]!) } catch {}
                }
              } finally {
                setMetasetConflictOpen(false)
                setPendingImport(null)
                setConflictIds([])
              }
            }}
          />
          {configChipsPanelElement}

          <PasteDialog
            open={pasteDlgOpen}
            text={pasteText}
            error={pasteErr}
            onTextChange={(v) => { setPasteText(v); setPasteErr(null) }}
            onCancel={() => setPasteDlgOpen(false)}
            onConfirm={() => {
              const preLen = customCfgs.length
              const parsed = parseConfigsFromText(pasteText, metasets)
              const ok = handlePasteText(pasteText)
              if (ok) {
                if (pasteAfterIdx !== null && parsed.length > 0) {
                  try {
                    setSelectedCfgIdx(pasteAfterIdx + parsed.length)
                    setBuilder(parsed[parsed.length - 1]!)
                  } catch {}
                  setPasteAfterIdx(null)
                } else if (pasteSelectOnEmpty && parsed.length > 0) {
                  try {
                    const sel = preLen + parsed.length - 1
                    setSelectedCfgIdx(sel)
                    setBuilder(parsed[parsed.length - 1]!)
                  } catch {}
                }
                setPasteSelectOnEmpty(false)
                setPasteDlgOpen(false)
              }
            }}
            confirmLabel={selectedCfgIdx !== null ? 'Insert after selected' : 'Add to end'}
          />

          <CopyDialog
            open={copyDlgOpen}
            text={copyText}
            inputRef={copyInputRef}
            onTextChange={setCopyText}
            onClose={() => setCopyDlgOpen(false)}
          />
        </Paper>

        <Paper sx={{ p: 2, width: '100%', maxWidth: PANEL_WIDTH_PX, mx: 'auto', display: 'flex', flexDirection: 'column',
          [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
            mx: 0,
            width: PANEL_WIDTH_PX,
            ...(previewPaperHeightStyle ? { height: previewPaperHeightStyle, minHeight: previewPaperHeightStyle } : { height: 'auto' }),
            overflow: 'hidden',
          }
        }} data-tour-id="preview.paper">
      <PreviewHeaderActions
        mergedCount={mergedRules.length}
        filteredCount={filteredRules.length}
        filterActive={filterActive}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        onSelectHsf={async (file) => {
          try {
            const parsed = await readHsfFile(file)
            setHsf(parsed)
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error('Failed to parse .hsf file', err)
            }
            setHsf(null)
          }
        }}
        onClearBase={() => setHsf(null)}
        {...(hsf ? { baseRuleCount: hsf.Rules.length } : {})}
        {...(pushExportEndpoint ? { pushEndpoint: pushExportEndpoint } : {})}
        onExport={async () => {
          const file: HsfFile = buildHsfFileFromMerged(mergedRules)
          const blob = hsfToBlob(file)
          const filename = sellfileFilename()
          const target = pushExportEndpoint
          if (target) {
            let targetUrl = target
            try {
              const parsed = new URL(target)
              const basePath = parsed.pathname?.length ? parsed.pathname : '/'
              // Append the generated filename as a final path segment so pushes keep distinct `.hsf` outputs.
              parsed.pathname = basePath.endsWith('/') ? `${basePath}${filename}` : `${basePath}/${filename}`
              targetUrl = parsed.toString()
            } catch {
              // Fallback for malformed URLs: preserve query/hash fragments while appending the filename.
              const separatorIndex = Math.min(
                ...['?', '#']
                  .map((marker) => {
                    const idx = target.indexOf(marker)
                    return idx === -1 ? Number.POSITIVE_INFINITY : idx
                  })
              )
              const suffix = Number.isFinite(separatorIndex) ? target.slice(separatorIndex) : ''
              const base = Number.isFinite(separatorIndex) ? target.slice(0, separatorIndex) : target
              const normalizedBase = base.endsWith('/') ? base : `${base}/`
              targetUrl = `${normalizedBase}${filename}${suffix}`
            }

            let pushToast: 'success' | 'failure' | null = null
            try {
              const response = await fetch(targetUrl, {
                method: 'PUT',
                headers: { 'Content-Type': blob.type || 'application/json' },
                body: blob,
              })
              setPushEndpointReachable(true)
              if (response.ok) {
                pushToast = 'success'
              } else {
                if (import.meta.env.DEV) {
                  console.error(`Push endpoint responded with ${response.status} for ${targetUrl}`)
                }
                pushToast = 'failure'
              }
            } catch (err) {
              if (import.meta.env.DEV) {
                console.error(`Failed to export sellfile to ${targetUrl}`, err)
              }
              setPushEndpointReachable(false)
              pushToast = 'failure'
            } finally {
              try {
                if (pushToast === 'success') {
                  setToastMsg(t('toastSellfileSaved'))
                } else if (pushToast === 'failure') {
                  setToastMsg(t('toastSellfileExportFailed'))
                }
              } catch {}
              try { setToastOpen(true) } catch {}
            }
            return
          }
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename
          a.click()
          URL.revokeObjectURL(url)
          try { setToastMsg(t('toastSellfileSaved')) } catch {}
          try { setToastOpen(true) } catch {}
        }}
        exportDisabled={!mergedRules.length}
        finalSell={finalSellRemainder}
        onToggleFinalSell={(enabled) => {
          setFinalSellRemainder(prev => {
            const cur = prev ?? { artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> }
            if (enabled) {
              const hasTypes = cur.artifacts || cur.accessories
              const hasLevels = (cur.levels?.length ?? 0) > 0
              return { artifacts: hasTypes ? cur.artifacts : true, accessories: hasTypes ? cur.accessories : true, levels: hasLevels ? cur.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>) }
            } else {
              return { ...cur, artifacts: false, accessories: false }
            }
          })
        }}
        onOpenFinalSellDialog={() => setFinalSellOpen(true)}
        onOpenRuleTester={() => setTesterOpen(true)}
      />
          {filterOpen && (
            <RulesFilterPanel
              state={rulesFilter}
              onChange={setRulesFilter}
              metasets={metasets}
              onClose={() => setFilterOpen(false)}
              showFaction={showFactionFilter}
              hasNamedConfigs={hasNamedConfigs}
              configChipFilterActive={limitConfigsToFiltered}
              onConfigChipFilterChange={setLimitConfigsToFiltered}
            />
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <HsfRulesTableMemo
               rules={filterActive ? filteredRules : mergedRules}
               setHoveredCfgIdx={setHoveredCfgIdx}
               selectedCfgIdx={selectedCfgIdx}
               multiselectActive={selectedCfgIndices.length > 1}
               focusRuleIndex={focusRuleIndex}
               onSelectCfgIdx={(idx) => {
                 // Guard against invalid indices to avoid crashes
                 setSelectedCfgIdx((prev) => (idx >= 0 && idx < customCfgs.length ? idx : prev))
                 if (idx >= 0 && idx < customCfgs.length && customCfgs[idx]) {
                   // Clicking preview rows resets to single selection
                   setSelectedCfgIndices([idx])
                   selectionAnchorRef.current = idx
                   setBuilder(customCfgs[idx]!)
                 }
               }}
               emptyDueToFilter={filterActive && (mergedRules.length > 0) && (filteredRules.length === 0)}
               onConfigAction={async (idx, action) => {
                if (action === 'duplicate') {
                  setCustomCfgs(prev => {
                    const base = prev[idx]
                    if (!base) return prev
                    const copy: BuilderConfig = { ...base }
                    const arr = [...prev]
                    const insertIdx = insertIndexAfter(arr, idx)
                    arr.splice(insertIdx, 0, copy)
                    return arr
                  })
                  return
                }
                if (action === 'delete') {
                  setCustomCfgs(prev => prev.filter((_, i) => i !== idx))
                  setSelectedCfgIdx((sel) => {
                    if (sel === null) return sel
                    if (sel === idx) return null
                    if (sel > idx) return sel - 1
                    return sel
                  })
                  return
                }
                if (action === 'copy') {
                  try {
                    const cfg = customCfgs[idx]
                    if (!cfg) return
                    const readable = buildReadableConfig(cfg, metasets)
                    const text = JSON.stringify(readable, null, 2)
                    const ok = await writeTextSafe(text)
                    if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
                  } catch {}
                  return
                }
                if (action === 'paste_after') {
                  await pasteAfterIndex(idx)
                  return
                }
                if (action === 'move_top') {
                  setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    const m = arr[idx]
                    if (!m) return prev
                    arr.splice(idx, 1)
                    arr.unshift(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel)))
                    return arr
                  })
                  return
                }
                if (action === 'move_bottom') {
                  setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    const m = arr[idx]
                    if (!m) return prev
                    arr.splice(idx, 1)
                    arr.push(m)
                    setSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? arr.length - 1 : (sel > idx ? sel : sel)))
                    return arr
                  })
                  return
                }
                if (action === 'move_up') {
                  setCustomCfgs(prev => {
                    if (idx === 0) return prev
                    const arr = [...prev]
                    if (!arr[idx-1] || !arr[idx]) return prev
                    const tmp = arr[idx-1]!; arr[idx-1] = arr[idx]!; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel)
                    return arr
                  })
                  return
                }
                if (action === 'move_down') {
                  setCustomCfgs(prev => {
                    if (idx === prev.length - 1) return prev
                    const arr = [...prev]
                    if (!arr[idx+1] || !arr[idx]) return prev
                    const tmp = arr[idx+1]!; arr[idx+1] = arr[idx]!; arr[idx] = tmp
                    setSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel)
                    return arr
                  })
                  return
               }
              }}
              onClearBase={() => setHsf(null)}
              onOpenManageColors={openColors}
              colorIconSrc={colorIconSrc}
              substatColors={substatColors}
              colorBlindMode={colorBlindMode}
              onChangeColorBlindMode={(m) => setColorBlindMode(m)}
              />
            </Box>
        </Paper>
        </Box>

      </Stack>

      {/* Help / README dialog. Marks the version as seen when closed. */}
      <HelpDialog
        open={helpOpen}
        firstRunMode={helpFirstRunMode}
        onClose={() => {
          setHelpOpen(false)
          // Close without auto-start; manual Help never auto-starts
          setHelpFirstRunMode(false)
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
        }}
        onStartTutorial={() => {
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
          setHelpOpen(false)
          setHelpFirstRunMode(false)
          startTutorial()
        }}
      />
      <NoteDialog
        open={noteOpen}
        mode={noteMode}
        note={hsfcNote ?? ''}
        onChange={(v) => setHsfcNote(v)}
        onClose={() => setNoteOpen(false)}
        configs={customCfgs}
        metasets={metasets}
        substatColors={substatColors}
      />
      <Snackbar
        open={toastOpen}
        autoHideDuration={3000}
        onClose={() => setToastOpen(false)}
        // True center of the viewport
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{
          '&.MuiSnackbar-root': {
            left: '50% !important',
            top: '50% !important',
            transform: 'translate(-50%, -50%)',
          },
        }}
      >
        <Alert
          icon={<SaveIcon fontSize="inherit" />}
          severity="success"
          variant="filled"
          onClose={() => setToastOpen(false)}
          sx={{
            alignItems: 'center',
            fontSize: FONT_SIZE_BASE_PX,
            px: 2.5,
            py: 1.5,
            minWidth: 360,
          }}
        >
          {toastMsg}
        </Alert>
      </Snackbar>
      <ConfirmDialogs
        openClear={confirmClearOpen}
        setOpenClear={setConfirmClearOpen}
        onConfirmClear={() => {
          // Suppress autosave for this clear-all action so the previous
          // autosave remains available to restore on reload.
          setAutosaveSilencedByClear(true)
          setCustomCfgs([])
          setSelectedCfgIdx(null)
          setSelectedCfgIndices([])
          selectionAnchorRef.current = null
        }}
        deleteIdx={confirmDeleteIdx}
        setDeleteIdx={setConfirmDeleteIdx}
        onConfirmDelete={() => {
          if (confirmDeleteIdx === null) return
          setCustomCfgs(prev => prev.filter((_, i) => i !== confirmDeleteIdx))
          setSelectedCfgIdx((sel) => {
            if (sel === null) return sel
            if (sel === confirmDeleteIdx) return null
            if (sel > confirmDeleteIdx) return sel - 1
            return sel
          })
        }}
        deleteMultiCount={confirmDeleteMultiCount}
        setDeleteMultiCount={setConfirmDeleteMultiCount}
        onConfirmDeleteMulti={() => {
          const sel = selectedCfgIndices.slice().sort((a,b)=>a-b)
          if (!sel.length) return
          setCustomCfgs(prev => prev.filter((_, i) => !sel.includes(i)))
          setSelectedCfgIdx(null)
          setSelectedCfgIndices([])
          selectionAnchorRef.current = null
        }}
      />
      {/* Restore autosaved HSFC dialog */}
      <RestoreAutosaveDialog
        open={dlgOpen}
        draft={restoreDraft}
        onDismiss={() => {
          dismissRestore()
        }}
        onRestore={() => {
          const draft = restoreDraft
          if (draft) {
            if (Array.isArray(draft.Metasets)) setMetasets(draft.Metasets)
            if (draft.Minima && typeof draft.Minima === 'object') setMinima(draft.Minima)
            if (Array.isArray(draft.Configs)) setCustomCfgs(draft.Configs)
            if (draft.FinalSellRemainder && typeof draft.FinalSellRemainder === 'object') {
              try {
                const fsr = draft.FinalSellRemainder as { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
                setFinalSellRemainder(fsr)
              } catch {}
            }
            if (typeof draft.Note === 'string') setHsfcNote(draft.Note)
            const len = draft.Configs?.length ?? 0
            if (len > 0) {
              const savedSel = typeof draft.SelectedConfigIndex === 'number' ? draft.SelectedConfigIndex : (len - 1)
              const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
              setSelectedCfgIdx(sel)
              try {
                const cfgs = (draft.Configs || [])
                if (cfgs[sel]) setBuilder(cfgs[sel]!)
              } catch {}
            } else {
              setSelectedCfgIdx(null)
            }
          }
          acceptRestore()
        }}
      />
      {/* Manage Colors Dialog */}
      <ManageColorsDialog
        open={colorsDlgOpen}
        onClose={closeColors}
        substatColors={substatColors}
        setSubstatColors={setSubstatColors}
        onReset={resetColors}
      />
      {/* Final Sell configuration */}
      <FinalSellDialog
        open={finalSellOpen}
        value={finalSellRemainder}
        onChange={(v) => setFinalSellRemainder(v)}
        onClose={() => setFinalSellOpen(false)}
        onReset={() => setFinalSellRemainder({ artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> })}
      />
      {/* Rule Tester dialog */}
      <RuleTesterDialog
        open={testerOpen}
        onClose={() => setTesterOpen(false)}
        rules={mergedRules}
        customCfgs={customCfgs}
        substatColors={substatColors}
        pendingExternalItems={pendingTesterItems}
        onConsumeExternalItems={() => setPendingTesterItems([])}
        onView={(ruleIndex, cfgIdx) => {
          // Close the Rule Tester dialog on View
          setTesterOpen(false)
          // Select config if available
          if (cfgIdx != null && cfgIdx >= 0 && cfgIdx < customCfgs.length) {
            setSelectedCfgIdx(cfgIdx)
            setSelectedCfgIndices([cfgIdx])
            selectionAnchorRef.current = cfgIdx
            const cfg = customCfgs[cfgIdx]
            if (cfg) setBuilder(cfg)
          }
          // Scroll to exact rule if visible in the current table view
          try {
            const targetRule = mergedRules[ruleIndex]
            const effective = filterActive ? filteredRules : mergedRules
            const idxInEffective = targetRule ? effective.indexOf(targetRule) : -1
            if (idxInEffective >= 0) setFocusRuleIndex(idxInEffective)
            else setFocusRuleIndex(null)
          } catch { setFocusRuleIndex(null) }
          // Clear the focus target after a short delay so subsequent clicks can retrigger
          try { setTimeout(() => setFocusRuleIndex(null), 300) } catch {}
        }}
      />
      {/* Tutorial overlay */}
      <TutorialCoach
        open={tutorialOpen}
        steps={tutorialSteps}
        stepIndex={tutorialIdx}
        sections={tutorialSections}
        onSkipTo={(idx) => {
          try {
            // Proactively close transient UI and cancel tutorial timers when jumping
            closeAllTransientUi()
            // Fast-forward/backward: reconstruct tutorial state as if we walked
            // through steps from the beginning to the target index.
            const steps = tutorialSteps
            // Baseline tutorial state (matches startTutorial)
            let nextHsf: HsfFile | null = null
            let nextCfgs: BuilderConfig[] = []
            let nextSel: number | null = null
            let nextMetas = [] as Metaset[]
            let nextMinima = defaultMinima()
            let nextFsr = { artifacts: false, accessories: false, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16> }
            let nextNote: string | null = null
            let nextBuilder: BuilderConfig = {
              name: '',
              keep: true,
              visibility: 'enabled',
              rankCode: 0,
              rarityCode: 0,
              rarityMode: 'auto',
              factionCode: 0,
              mainStatsV: [],
              minLevel: 0,
              maxLevel: 16,
              earlyKeepMode: 'early',
              rollBaseline: 'afterStart',
              rollMode: 'auto',
              substatsV: [],
              fixedSubstatsV: [],
              minCount: 0,
              autoMinCount: true,
              autoSubstatFlex: false,
              minRequiredRolls: 0,
              autoMinRequiredRolls: true,
            }
            const ensureSlowDD = () => {
              if (!nextMetas.some(m => m.name.trim().toLowerCase() === 'slow dd')) {
                const id = makeMetasetId()
                nextMetas = nextMetas.concat({ id, name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true, iconId: DEFAULT_METASET_ICON_ID })
              }
            }
            for (let i = 0; i <= idx && i < steps.length; i++) {
              const sid = steps[i]?.id
              if (!sid) continue
              switch (sid) {
                case 'slots': {
                  nextBuilder = { ...nextBuilder, artifactTypes: [ArtifactType.Boots] }
                  break
                }
                case 'mainstat': {
                  nextBuilder = { ...nextBuilder, mainStatsV: [StatVariant.SPD] }
                  break
                }
                case 'sets': {
                  nextBuilder = { ...nextBuilder, artifactSets: [ArtifactSet.Speed] }
                  break
                }
                case 'add': {
                  // Add current builder as a new config
                  nextCfgs = nextCfgs.concat(nextBuilder)
                  nextSel = nextCfgs.length - 1
                  break
                }
                case 'adv-select-slots-main': {
                  nextBuilder = { ...nextBuilder, artifactTypes: [ArtifactType.Chestplate, ArtifactType.Boots], mainStatsV: [StatVariant.HP, StatVariant.ATK, StatVariant.DEF] }
                  break
                }
                case 'name': {
                  nextBuilder = { ...nextBuilder, name: 'DPS Core Rolls' }
                  break
                }
                case 'subs': {
                  nextBuilder = { ...nextBuilder, substatsV: [StatVariant.SPD, StatVariant.CR, StatVariant.CDMG], fixedSubstatsV: [StatVariant.CDMG] }
                  break
                }
                case 'required': {
                  nextBuilder = { ...nextBuilder, autoMinCount: false, autoSubstatFlex: false, minCount: 2 }
                  break
                }
                case 'min-rolls': {
                  nextBuilder = { ...nextBuilder, autoMinRequiredRolls: false, minRequiredRolls: 3 }
                  break
                }
                case 'metasets-add': {
                  ensureSlowDD()
                  break
                }
                case 'metasets-defaults': {
                  const wanted = new Set(['Nuker', 'Support - Debuffer', 'Support - Survivability'])
                  const defs = defaultMetasets().filter(m => wanted.has(m.name))
                  const have = new Set(nextMetas.map(m => m.name))
                  const add = defs.filter(d => !have.has(d.name))
                  if (add.length) nextMetas = nextMetas.concat(add)
                  break
                }
                case 'sets-metasets': {
                  ensureSlowDD()
                  const slow = nextMetas.find(m => m.name.trim().toLowerCase() === 'slow dd')
                  if (slow) nextBuilder = { ...nextBuilder, artifactMetaSets: [slow.id], artifactSets: [] }
                  break
                }
                case 'adv-add': {
                  nextCfgs = nextCfgs.concat(nextBuilder)
                  nextSel = nextCfgs.length - 1
                  break
                }
                case 'auto-late-intro': {
                  nextBuilder = {
                    ...nextBuilder,
                    name: 'Banner SPD — Late 3 rolls',
                    artifactTypes: [ArtifactType.Banner],
                    mainStatsV: [],
                    substatsV: [StatVariant.SPD],
                    fixedSubstatsV: [],
                    autoMinCount: false,
                    autoSubstatFlex: false,
                    minCount: 1,
                    autoMinRequiredRolls: false,
                    minRequiredRolls: 3,
                    rarityCode: 0,
                    rarityMode: 'auto',
                    earlyKeepMode: 'late',
                  }
                  break
                }
                case 'auto-late-add': {
                  nextCfgs = nextCfgs.concat(nextBuilder)
                  nextSel = nextCfgs.length - 1
                  break
                }
                case 'finalsell-dialog': {
                  nextFsr = { artifacts: true, accessories: false, levels: (nextFsr.levels?.length ? nextFsr.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>)) }
                  break
                }
                default:
                  break
              }
            }
            // Commit reconstructed state
            setHsf(nextHsf)
            setCustomCfgs(nextCfgs)
            setSelectedCfgIdx(nextSel)
            setMetasets(nextMetas)
            setMinima(nextMinima)
            setFinalSellRemainder(nextFsr)
            setHsfcNote(nextNote)
            setBuilder(nextBuilder)
            setTutorialIdx(idx)
          } catch { setTutorialIdx(idx) }
        }}
        onClose={() => {
          // Ensure any tutorial-opened UI is closed before restoring and re-enabling autosave
          closeAllTransientUi()
          // Restore snapshot if present (do this before toggling tutorialOpen so autosave picks restored values)
          restoreFromTutorialSnapshot()
          setTutorialSnapshot(null)
          // Close the coach overlay last to keep autosave off until state is restored
          setTutorialOpen(false)
        }}
        onPrev={() => {
          try {
            const prev = Math.max(0, tutorialIdx - 1)
            const target = tutorialSteps[prev]
            if (target && target.id === 'sets-metasets') {
              // Reopen the Sets menu so the metasets section is visible when stepping back
              const openMenu = () => {
                try {
                  const sel = document.querySelector('[data-tour-id="builder.sets"] .MuiSelect-select') as HTMLElement | null
                  const el = sel || (document.querySelector('[data-tour-id="builder.sets"]') as HTMLElement | null)
                  if (el) el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }))
                } catch {}
              }
              openMenu()
              setTimeout(openMenu, 60)
            } else if (target && target.id === 'sets-open') {
              // Ensure menu is closed when stepping back to the step that precedes opening it
              try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
              setTimeout(() => {
                try {
                  const target = document.body as HTMLElement
                  const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
                  target.dispatchEvent(new MouseEvent('mousedown', opts))
                  target.dispatchEvent(new MouseEvent('mouseup', opts))
                  target.dispatchEvent(new MouseEvent('click', opts))
                } catch {}
              }, 60)
            }
          } catch {}
          setTutorialIdx((i) => Math.max(0, i - 1))
        }}
        onNext={() => {
          // Perform one-time actions when advancing from specific steps
          try {
            const cur = tutorialSteps[tutorialIdx]
            if (cur?.id === 'add' && !tutorialAddedBasic) {
              // Click Add as new config for the basic example once
              setTutorialAddedBasic(true)
              const snap = builderRef.current
              setCustomCfgs(prev => {
                const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
                  ? selectedCfgIdx + 1
                  : prev.length
                const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
                setSelectedCfgIdx(insertIdx)
                return next
              })
            } else if (cur?.id === 'adv-add' && !tutorialAddedAdvanced) {
              // Click Add as new config for the advanced example once
              setTutorialAddedAdvanced(true)
              const snap = builderRef.current
              setCustomCfgs(prev => {
                const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
                  ? selectedCfgIdx + 1
                  : prev.length
                const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
                setSelectedCfgIdx(insertIdx)
                return next
              })
            } else if (cur?.id === 'metasets-add' && !tutorialAddedSlowDD) {
              // Create the Slow DD metaset with specific sets once
              setTutorialAddedSlowDD(true)
              setMetasets(prev => {
                // Avoid duplicates by name
                if (prev.some(m => m.name.trim().toLowerCase() === 'slow dd')) return prev
                const id = makeMetasetId()
                const next = prev.concat({ id, name: 'Slow DD', sets: [ArtifactSet.Lethal, ArtifactSet.Savage, ArtifactSet.Stoneskin], show: true, iconId: DEFAULT_METASET_ICON_ID })
                return next
              })
            } else if (cur?.id === 'sets-metasets') {
              // Select the Slow DD metaset and then click outside to close the multi-select menu
              try {
                const slow = metasets.find(m => m.name.trim().toLowerCase() === 'slow dd')
                if (slow) {
                  // Click the item visually in the open menu if present (for user feedback)
                  try {
                    const section = document.querySelector('[data-tour-id="menu.metasets.section"]') as HTMLElement | null
                    if (section) {
                      const items = Array.from(section.querySelectorAll('*')) as HTMLElement[]
                      const match = items.find(el => (el.textContent || '').trim().toLowerCase().includes('slow dd'))
                      match?.click()
                    }
                  } catch {}
                  // Also update builder state to be deterministic
                  setBuilder(prev => ({
                    ...prev,
                    artifactMetaSets: [slow.id],
                    artifactSets: [],
                  }))
                }
              } catch {}
              // Close robustly: send Escape to listbox, then synthetic mouse events outside
              try {
                window.setTimeout(() => {
                  try {
                    const list = document.querySelector('ul[role="listbox"]') as HTMLElement | null
                    if (list) list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
                  } catch {}
                  try {
                    const target = document.body as HTMLElement
                    const opts = { bubbles: true, cancelable: true, view: window } as MouseEventInit
                    target.dispatchEvent(new MouseEvent('mousedown', opts))
                    target.dispatchEvent(new MouseEvent('mouseup', opts))
                    target.dispatchEvent(new MouseEvent('click', opts))
                  } catch {}
                }, 60)
              } catch {}
            } else if (cur?.id === 'auto-late-add' && !tutorialAddedAutoLate) {
              // Click Insert after selected for the Auto+Late accessories example once
              setTutorialAddedAutoLate(true)
              const snap = builderRef.current
              setCustomCfgs(prev => {
                const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
                  ? selectedCfgIdx + 1
                  : prev.length
                const next = [...prev.slice(0, insertIdx), snap, ...prev.slice(insertIdx)]
                setSelectedCfgIdx(insertIdx)
                return next
              })
            }
          } catch {}
          setTutorialIdx((i) => {
            const next = i + 1
            if (next >= tutorialSteps.length) {
              try { localStorage.setItem(TUTORIAL_SEEN_VERSION_KEY, APP_VERSION) } catch {}
              // Close transient UI first, then restore snapshot, then end tutorial
              closeAllTransientUi()
              restoreFromTutorialSnapshot()
              setTutorialSnapshot(null)
              setTutorialOpen(false)
              return i
            }
            return next
          })
        }}
      />
    </Container>
  )
}

// (no-op) placeholder removed; startTutorial is defined within App component.
