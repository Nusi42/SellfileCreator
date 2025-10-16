/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - HSFC (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, minima, and autosave
 * - Color management for substat chips and various dialogs
 */
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, hsfToBlob } from './lib/hsfIO'
import { getPushEndpoint } from './lib/runtimeConfig'
import { externalArtifactToTestItem, type ExternalCommand } from './lib/externalCommands'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderConfig, type SellfileVisibility } from './lib/hsfBuilder'
import { parseConfigsFromText, buildReadableConfig, readHsfcFile, buildHsfcPayload, hsfcToBlob } from './lib/hsfcIO'
import { COPY_DIALOG_EVENT, writeTextSafe } from './lib/clipboard'
// Autosave restore logic lives in useAutosaveRestore.
import {
  AUTOSAVE_KEY,
  PANEL_WIDTH_PX,
  SIDE_BY_SIDE_BREAKPOINT_PX,
  GRID_COLUMN_GAP_PX,
  FINAL_SELL_DEFAULT_LEVELS,
  FONT_SIZE_DISPLAY_REM,
  FONT_SIZE_HEADER_META_PX,
  FONT_SIZE_BASE_PX,
} from './lib/constants'

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Tooltip, Button } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
import { HsfRulesTableMemo } from './components/HsfRulesTable'
// Config chips list panel component
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
import { BuilderColumn } from './components/AppLayout/BuilderColumn'
import { useFileDragDrop } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import FinalSellDialog from './components/dialogs/FinalSellDialog'
import HelpDialog from './components/HelpDialog'
import { TutorialCoach } from './components/tutorial/TutorialCoach'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import MetasetConflictDialog from './components/dialogs/MetasetConflictDialog'
import { useAutosave } from './hooks/useAutosave'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import RuleTesterDialog from './components/dialogs/RuleTesterDialog'
import RulesFilterPanel from './components/RulesFilterPanel'
import { DEFAULT_RULES_FILTER_STATE, filterHsfRules, isRulesFilterActive, type FilterHsfRulesResult, type RulesFilterState } from './lib/rulesFilter'
import { useAutosaveRestore } from './hooks/useAutosaveRestore'
import { makeManageColorsIcon } from './lib/icons'
import { sellfileFilename, hsfcFilename } from './lib/filenames'
import { README_SEEN_VERSION_KEY } from './lib/constants'
import { DEFAULT_METASET_ICON_ID } from './lib/metasetIcons'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/configDuplicates'
import type { TestItem } from './lib/ruleEval'
import { FINAL_SELL_DEFAULT_SETS_MODE } from './lib/finalSell'
import type { FinalSellRemainderConfig } from './lib/finalSell'
import { useConfigSelection } from './hooks/useConfigSelection'
import { useBuilderPreviewLayout } from './hooks/useBuilderPreviewLayout'
import { useTooltipScrollGuard } from './hooks/useTooltipScrollGuard'
import { useTutorialCoachState } from './hooks/useTutorialCoachState'
import { useExternalCommands } from './hooks/useExternalCommands'
import { useHsfcClipboard, type PendingImport } from './hooks/useHsfcClipboard'
import { useRuntimeCatalogLoader } from './hooks/useRuntimeCatalogLoader'
import { useHsfcDialogs } from './hooks/useHsfcDialogs'
import { useHsfcHistoryController } from './hooks/useHsfcHistoryController'

// Components are organized under src/components

import type { ColorBlindMode } from './lib/constants'

export default function App({ colorBlindMode, setColorBlindMode }: { colorBlindMode: ColorBlindMode; setColorBlindMode: (m: ColorBlindMode) => void }) {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  // Shared app state via context — reduces prop drilling and keeps behavior consistent.
  const { customCfgs, selectedCfgIdx, metasets, minima, finalSellRemainder, hsfcNote } = useAppState()
  const { setCustomCfgs, setSelectedCfgIdx, setMetasets, setMinima, setFinalSellRemainder, setHsfcNote } = useAppActions()
  // Use a deferred snapshot so bursty minima updates (e.g., Restore Defaults) coalesce before recomputing merged rules.
  const minimaForPreview = useDeferredValue(minima)
  const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const [pendingTesterItems, setPendingTesterItems] = useState<TestItem[]>([])
  const exportBaselineResetRef = useRef(false)
  const {
    leftPaperRef,
    chipsContainerRef,
    chipsMaxHeight,
    previewPaperHeightStyle,
    sideBySideMinPaperHeightPx,
  } = useBuilderPreviewLayout()
  useTooltipScrollGuard()

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
  let requestDeleteSingleForSelection: (idx: number) => void = () => {}
  let requestDeleteMultiForSelection: (targets: number[]) => void = () => {}
  const {
    selectedCfgIndices,
    setSelectedCfgIndices,
    multiselectActive,
    hoveredCfgIdx,
    setHoveredCfgIdx,
    handleConfigHoverIdx,
    multiSelectedConfigs,
    multiEditHandle,
    applyMultiEditDraft,
    handleConfigSelect,
    handleConfigDelete,
    handleConfigDuplicate,
    handleConfigMoveUp,
    handleConfigMoveDown,
    handleConfigMoveTop,
    handleConfigMoveBottom,
    handleSelectAllConfigs,
    handleClearSelection,
    setSelectionAnchor,
  } = useConfigSelection({
    customCfgs,
    setCustomCfgs,
    selectedCfgIdx,
    setSelectedCfgIdx,
    setBuilder,
    requestDeleteSingle: (idx) => { requestDeleteSingleForSelection(idx) },
    requestDeleteMulti: (targets) => { requestDeleteMultiForSelection(targets) },
  })
  // Subtle highlight of the Config Chips area while hovering the Delete Configs button
  const [hoverDeleteConfigs, setHoverDeleteConfigs] = useState(false)
  // Ensure the hover highlight is cleared whenever Delete becomes disabled
  const deleteAllDisabled = (!customCfgs.length) || (selectedCfgIndices.length > 1)
  useEffect(() => {
    if (deleteAllDisabled && hoverDeleteConfigs) setHoverDeleteConfigs(false)
  }, [deleteAllDisabled, hoverDeleteConfigs])
  // Refs to avoid stale closures in tutorial snapshot/restore
  const hsfRef = React.useRef(hsf)
  useEffect(() => { hsfRef.current = hsf }, [hsf])
  const cfgsRef = React.useRef(customCfgs)
  useEffect(() => { cfgsRef.current = customCfgs }, [customCfgs])
  const selRef = React.useRef(selectedCfgIdx)
  useEffect(() => { selRef.current = selectedCfgIdx }, [selectedCfgIdx])
  const metasRef = React.useRef(metasets)
  useEffect(() => { metasRef.current = metasets }, [metasets])
  const minimaRef = React.useRef(minima)
  useEffect(() => { minimaRef.current = minima }, [minima])
  const fsrRef = React.useRef(finalSellRemainder)
  useEffect(() => { fsrRef.current = finalSellRemainder }, [finalSellRemainder])
  const noteRef = React.useRef(hsfcNote)
  useEffect(() => { noteRef.current = hsfcNote }, [hsfcNote])
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    resetHistory,
  } = useHsfcHistoryController({
    customCfgs,
    metasets,
    minima,
    finalSellRemainder,
    hsfcNote,
    selectedCfgIdx,
    setCustomCfgs,
    setMetasets,
    setMinima,
    setFinalSellRemainder,
    setHsfcNote,
    setSelectedCfgIdx,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setBuilder,
  })
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
  
  const [toastOpen, setToastOpen] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  // Determine once whether to auto-open the README on this version.
  // Rule Tester dialog state
  const [testerOpen, setTesterOpen] = useState<boolean>(false)
  // External focus target for preview table (exact rule index in the effective rules array)
  const [focusRuleIndex, setFocusRuleIndex] = useState<number | null>(null)
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
  useEffect(() => { try { localStorage.setItem('sellfileCreator.rulesFilter.open.v1', String(filterOpen)) } catch {} }, [filterOpen])
  useEffect(() => { try { localStorage.setItem('sellfileCreator.rulesFilter.state.v1', JSON.stringify(rulesFilter)) } catch {} }, [rulesFilter])

  const { t, registerRuntimeCatalog } = useI18n()
  const { handleRuntimeCatalog } = useRuntimeCatalogLoader({
    registerRuntimeCatalog,
    setToastOpen,
    setToastMsg,
    t,
  })
  const pushEndpoint = useMemo(() => getPushEndpoint(), [])
  const [pushEndpointReachable, setPushEndpointReachableState] = useState(() => Boolean(pushEndpoint))
  const setPushEndpointReachable = useCallback((next: boolean) => {
    setPushEndpointReachableState((prev) => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    setPushEndpointReachable(Boolean(pushEndpoint))
  }, [pushEndpoint, setPushEndpointReachable])
  const handleConfirmClearAll = useCallback(() => {
    setCustomCfgs([])
    setSelectedCfgIdx(null)
    setSelectedCfgIndices([])
    setSelectionAnchor(null)
    markNextSnapshotAsSaved()
    exportBaselineResetRef.current = true
  }, [markNextSnapshotAsSaved, setCustomCfgs, setSelectedCfgIdx, setSelectedCfgIndices, setSelectionAnchor])
  const handleConfirmDeleteSingle = useCallback((idx: number) => {
    setCustomCfgs(prev => prev.filter((_, i) => i !== idx))
    setSelectedCfgIdx((sel) => {
      if (sel === null) return sel
      if (sel === idx) return null
      if (sel > idx) return sel - 1
      return sel
    })
  }, [setCustomCfgs, setSelectedCfgIdx])
  const handleDeleteMultiConfirmed = useCallback((targetsParam: number[] | null) => {
    // Use the snapshot captured when opening the dialog so confirmation matches the displayed list.
    const source = Array.isArray(targetsParam) && targetsParam.length > 0
      ? targetsParam
      : selectedCfgIndices
    if (!source.length) return
    const uniqueTargets = Array.from(new Set(source.filter((idx) => Number.isInteger(idx) && idx >= 0))).sort((a, b) => a - b)
    if (!uniqueTargets.length) return
    const deleteSet = new Set(uniqueTargets)
    setCustomCfgs(prev => prev.filter((_, i) => !deleteSet.has(i)))
    setSelectedCfgIdx(null)
    setSelectedCfgIndices([])
    setSelectionAnchor(null)
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectedCfgIndices, setSelectionAnchor])
  const hsfcDialogs = useHsfcDialogs({
    customCfgCount: customCfgs.length,
    onConfirmClearAll: handleConfirmClearAll,
    onConfirmDeleteSingle: handleConfirmDeleteSingle,
    onConfirmDeleteMulti: handleDeleteMultiConfirmed,
  })
  const {
    confirmClearOpen,
    setConfirmClearOpen,
    confirmDeleteIdx,
    setConfirmDeleteIdx,
    confirmDeleteTargets,
    setConfirmDeleteTargets,
    requestClearAll,
    requestDeleteSingle,
    requestDeleteMulti,
    handleConfirmClear,
    handleConfirmDelete,
    handleConfirmDeleteMulti: confirmDeleteMultiDialog,
    autosaveSilencedByClear,
    noteOpen,
    noteMode,
    openNoteEditor,
    openNoteViewer,
    closeNote,
    pasteDlgOpen,
    setPasteDlgOpen,
    pasteText,
    setPasteText,
    pasteErr,
    setPasteErr,
    pasteSelectOnEmpty,
    setPasteSelectOnEmpty,
    pasteAfterIdx,
    setPasteAfterIdx,
    copyDlgOpen,
    setCopyDlgOpen,
    copyText,
    setCopyText,
    copyInputRef,
  } = hsfcDialogs
  requestDeleteSingleForSelection = requestDeleteSingle
  requestDeleteMultiForSelection = requestDeleteMulti
  const pushExportEndpoint = pushEndpointReachable && pushEndpoint ? pushEndpoint : undefined

  const tutorial = useTutorialCoachState({
    hsf,
    setHsf,
    customCfgs,
    setCustomCfgs,
    selectedCfgIdx,
    setSelectedCfgIdx,
    metasets,
    setMetasets,
    minima,
    setMinima,
    finalSellRemainder,
    setFinalSellRemainder,
    hsfcNote,
    setHsfcNote,
    builderRef,
    setBuilder,
    filterOpen,
    setFilterOpen,
    rulesFilter,
    setRulesFilter,
    setFinalSellOpen,
    t,
  })

  // Global file-drag overlay and file routing handled by hook
  const { active: fileDragActive } = useFileDragDrop({
    onDragStart: () => {
      // Close context menus/popovers when a file drag starts so drop works cleanly
      try { tutorial.closeAllTransientUi() } catch {}
    },
    onHsfc: async (file: File) => {
      // Keep drag & drop focused on the new file: close intro dialogs first.
      if (tutorial.helpOpen) {
        tutorial.setHelpOpen(false)
        tutorial.setHelpFirstRunMode(false)
        try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
      }
      if (restoreDialogPending) dismissRestore()
      // Ignore drops while confirmation dialogs are open
      if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
      const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = await readHsfcFile(file, { metasets, minima })
      // File load replaces current state; no conflict resolution here
      setCustomCfgs(cfgs)
      if (nextMetas !== metasets) setMetasets(nextMetas)
      if (nextMinima !== minima) { try { setMinima(nextMinima) } catch {} }
      setFinalSellRemainder(fsr)
      const resolvedSel = typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < cfgs.length
        ? selectedIndex
        : (cfgs.length > 0 ? 0 : null)
      setSelectedCfgIdx(resolvedSel)
      setSelectedCfgIndices(resolvedSel === null ? [] : [resolvedSel])
      setSelectionAnchor(resolvedSel)
      if (resolvedSel !== null && cfgs[resolvedSel]) setBuilder(cfgs[resolvedSel]!)
      const rawNote = typeof note === 'string' ? note : ''
      const importedNote = rawNote.trim().length > 0 ? rawNote : null
      if (importedNote !== null) {
        setHsfcNote(importedNote)
        openNoteViewer()
      } else {
        setHsfcNote(null)
        closeNote()
      }
      const nextHistory = makeHistoryStrings({
        customCfgs: cfgs,
        metasets: nextMetas,
        minima: nextMinima,
        finalSellRemainder: fsr,
        note: importedNote,
        selectedCfgIdx: resolvedSel,
      })
      resetHistory(nextHistory.payload, nextHistory.signature, { markSaved: true })
    },
    onHsf: async (file: File) => {
      // Ignore drops while confirmation dialogs are open
      if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
      const parsed = await readHsfFile(file)
      setHsf(parsed)
      exportBaselineResetRef.current = true
    },
    onL10n: async (file: File) => {
      // Allow testing of localization files by drag & drop
      await handleRuntimeCatalog(file)
    },
  })
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
      minima: minimaForPreview,
      finalSellRemainder,
    })
  }, [hsf, cfgsForMerge, metasets, minimaForPreview, finalSellRemainder])

  const configRuleCounts = useMemo((): ReadonlyMap<number, number> => {
    const counts = new Map<number, number>()
    for (const rule of mergedRules) {
      const cfgIdx = (rule as HsfRuleWithCfg).__cfgIdx
      if (typeof cfgIdx !== 'number' || cfgIdx < 0) continue
      counts.set(cfgIdx, (counts.get(cfgIdx) ?? 0) + 1)
    }
    return counts
  }, [mergedRules])

  const selectedIsDirty = useMemo(() => {
    if (selectedCfgIdx === null) return false
    const target = customCfgs[selectedCfgIdx]
    if (!target) return false
    try {
      return JSON.stringify(builder) !== JSON.stringify(target)
    } catch {
      return true
    }
  }, [builder, customCfgs, selectedCfgIdx])

  const hsfExportPayload = useMemo(() => buildHsfFileFromMerged(mergedRules), [mergedRules])
  const hsfExportSig = useMemo(() => {
    try {
      return JSON.stringify(hsfExportPayload)
    } catch {
      return ''
    }
  }, [hsfExportPayload])
  const [lastExportSig, setLastExportSig] = useState<string | null>(null)
  useEffect(() => {
    if (exportBaselineResetRef.current || lastExportSig === null) {
      setLastExportSig(hsfExportSig)
      exportBaselineResetRef.current = false
    }
  }, [hsfExportSig, lastExportSig])
  const hsfDirty = useMemo(() => lastExportSig !== null && hsfExportSig !== lastExportSig, [hsfExportSig, lastExportSig])

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

  


  const {
    restoreDlgOpen: restoreDialogPending,
    restoreDraft,
    dismissRestore,
    acceptRestore,
    autosaveEnabled,
  } = useAutosaveRestore({
    key: AUTOSAVE_KEY,
    version: APP_VERSION,
    metasets,
    minima,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: selectedCfgIdx,
    note: hsfcNote,
  })
  // Show the autosave restore prompt only after the README dialog is dismissed.
  const restoreDlgOpen = restoreDialogPending && !tutorial.helpOpen
  // no-op

  // ---- HSFC import conflict state ----
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  const [metasetConflictOpen, setMetasetConflictOpen] = useState(false)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [importIdMap, setImportIdMap] = useState<Map<string, string>>(new Map())
  // no separate stash for metas to add; computed on the fly

  const {
    insertIndexAfter,
    handlePasteText,
    pasteAfterIndex,
    handleConfigPasteAfter,
    handleCopyAllConfigs,
    handleCopyConfig,
    handlePasteAtEnd,
    prepareHsfcImport,
    finalizeImport,
  } = useHsfcClipboard({
    metasets,
    minima,
    customCfgs,
    hsfcNote,
    finalSellRemainder,
    selectedCfgIdx,
    selectedCfgIndices,
    setCustomCfgs,
    setMetasets,
    setMinima,
    setFinalSellRemainder,
    setHsfcNote,
    setSelectedCfgIdx,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setBuilder,
    setMetasetConflictOpen,
    setPendingImport,
    setConflictIds,
    setImportIdMap,
    setPasteDlgOpen,
    setPasteErr,
    setPasteText,
    setPasteSelectOnEmpty,
    setPasteAfterIdx,
    setCopyDlgOpen,
    setCopyText,
  })


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
  useAutosave({ key: AUTOSAVE_KEY, payload: autosavePayload, enabled: autosaveEnabled && !tutorial.tutorialOpen && !autosaveSilencedByClear })
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
  }, [setCopyDlgOpen, setCopyText])
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
  const scrollSelectedConfigIntoView = useCallback(() => {
    if (multiselectActive || selectedCfgIdx === null) return
    try {
      requestAnimationFrame(() => {
        const container = chipsContainerRef.current
        if (!container) return
        const el = document.getElementById(`cfg-chip-${selectedCfgIdx}`)
        if (!el) return
        const cRect = container.getBoundingClientRect()
        const eRect = el.getBoundingClientRect()
        const cur = container.scrollTop
        const topDelta = eRect.top - cRect.top
        const botDelta = eRect.bottom - cRect.bottom
        let target = cur
        if (topDelta < 0) {
          target = Math.max(0, cur + topDelta)
        } else if (botDelta > 0) {
          target = Math.max(0, cur + botDelta)
        }
        if (target !== cur) container.scrollTo({ top: target, behavior: 'smooth' })
      })
    } catch {}
  }, [chipsContainerRef, multiselectActive, selectedCfgIdx])
  useEffect(() => {
    scrollSelectedConfigIntoView()
  }, [scrollSelectedConfigIntoView, customCfgs.length, filterActive, limitConfigsToFiltered])
  const colorIconSrc = React.useMemo(() => makeManageColorsIcon(), [])
  const hasNamedConfigs = useMemo(() => customCfgs.some(cfg => Boolean(cfg?.name && cfg.name.trim().length > 0)), [customCfgs])
  const visibleConfigIndices = useMemo<Set<number> | null>(() => (limitConfigsToFiltered ? matchingConfigIndices : null), [limitConfigsToFiltered, matchingConfigIndices])
  const visibleConfigCount = useMemo(() => {
    if (visibleConfigIndices) return visibleConfigIndices.size
    return customCfgs.length
  }, [visibleConfigIndices, customCfgs.length])
  const focusRuleByIndex = useCallback((ruleIndex: number): boolean => {
    if (ruleIndex < 0 || ruleIndex >= mergedRules.length) return false
    const rule = mergedRules[ruleIndex]
    if (!rule) return false
    const cfgIdx = (rule as HsfRuleWithCfg).__cfgIdx
    if (typeof cfgIdx === 'number' && cfgIdx >= 0 && cfgIdx < customCfgs.length) {
      setSelectedCfgIdx(cfgIdx)
      setSelectedCfgIndices([cfgIdx])
      setSelectionAnchor(cfgIdx)
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
  }, [mergedRules, customCfgs, filterActive, filteredRules, setSelectedCfgIdx, setSelectedCfgIndices, setSelectionAnchor, setBuilder])
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

  const editingConfigIndex = useMemo(() => (
    selectedCfgIndices.length === 1 ? selectedCfgIndices[0]! : null
  ), [selectedCfgIndices])

  const prospectiveInsertIndex = useMemo(() => (
    selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length
      ? selectedCfgIdx + 1
      : customCfgs.length
  ), [selectedCfgIdx, customCfgs.length])

  const builderInsertMatchesFilter = useMemo(() => {
    if (!filterActive || !limitConfigsToFiltered) return true
    if (editingConfigIndex !== null && !selectedIsDirty) {
      return matchingConfigIndices.has(editingConfigIndex)
    }
    const names = configNames.slice()
    names.splice(prospectiveInsertIndex, 0, builder.name ?? '')
    const modes = configModes.slice()
    const builderVisibility: SellfileVisibility = builder.visibility
    modes.splice(prospectiveInsertIndex, 0, builderVisibility)
    return evaluateConfigAgainstFilters(builder, prospectiveInsertIndex, names, modes)
  }, [
    filterActive,
    limitConfigsToFiltered,
    configNames,
    configModes,
    prospectiveInsertIndex,
    builder,
    evaluateConfigAgainstFilters,
    editingConfigIndex,
    selectedIsDirty,
    matchingConfigIndices,
  ])

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

  useExternalCommands({
    pushEndpoint,
    onCommand: handleExternalCommand,
    onReachabilityChange: setPushEndpointReachable,
  })
  // Dirty flag: builder differs from currently selected config
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
          setSelectionAnchor(insertIdx)
          return next
        })
      }}
      editingIndex={selectedCfgIndices.length === 1 ? selectedCfgIdx : null}
      onUndo={undo}
      onRedo={redo}
      canUndo={canUndo}
      canRedo={canRedo}
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
      configRuleCounts={configRuleCounts}
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
        setSelectionAnchor(last)
      }}
      onApplyMultiEdit={applyMultiEditDraft}
      multiEdit={multiEditHandle}
      multiSelectedConfigs={multiSelectedConfigs}
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
      onDeleteSelected={() => {
        if (!selectedCfgIndices.length) return
        if (selectedCfgIndices.length === 1) {
          requestDeleteSingleForSelection(selectedCfgIndices[0]!)
        } else {
          requestDeleteMultiForSelection(selectedCfgIndices.slice())
        }
      }}
    />
  )

  // HSFC load/save/copy controls surfaced at the top of the builder column.
  const headerActionsElement = (
    <HeaderActions
      onAboutToOpenHsfc={() => {
        markSavedNow()
      }}
      onSelectHsfc={async (file) => {
        try {
          const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = await readHsfcFile(file, {
            metasets,
            minima,
          })
          // File load replaces current state; no conflict resolution here
          setCustomCfgs(cfgs)
          if (nextMetas !== metasets) setMetasets(nextMetas)
          if (nextMinima !== minima) {
            try {
              setMinima(nextMinima)
            } catch {}
          }
          setFinalSellRemainder(fsr)
          const resolvedSel =
            typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < cfgs.length
              ? selectedIndex
              : cfgs.length > 0
                ? 0
                : null
          setSelectedCfgIdx(resolvedSel)
          setSelectedCfgIndices(resolvedSel === null ? [] : [resolvedSel])
          setSelectionAnchor(resolvedSel)
          if (resolvedSel !== null && cfgs[resolvedSel]) setBuilder(cfgs[resolvedSel]!)
          const rawNote = typeof note === 'string' ? note : ''
          const importedNote = rawNote.trim().length > 0 ? rawNote : null
          if (importedNote !== null) {
            setHsfcNote(importedNote)
            openNoteViewer()
          } else {
            setHsfcNote(null)
            closeNote()
          }
          const nextHistory = makeHistoryStrings({
            customCfgs: cfgs,
            metasets: nextMetas,
            minima: nextMinima,
            finalSellRemainder: fsr,
            note: importedNote,
            selectedCfgIdx: resolvedSel,
          })
          resetHistory(nextHistory.payload, nextHistory.signature, { markSaved: true })
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
        try {
          setToastMsg(t('toastConfigsSaved'))
          setToastOpen(true)
        } catch {}
        markSavedNow()
      }}
      onDeleteAll={() => { requestClearAll() }}
      onHoverDeleteAll={(hover) => setHoverDeleteConfigs(Boolean(hover))}
      deleteDisabled={!customCfgs.length || selectedCfgIndices.length > 1}
      onOpenNote={() => { openNoteEditor() }}
      notePresent={Boolean(hsfcNote && hsfcNote.trim())}
      count={customCfgs.length}
      selectedCount={selectedCfgIndices.length}
      visibleCount={visibleConfigCount}
      hsfcDirty={isDirty}
    />
  )

  // Resolves ID conflicts when importing configs that reuse metaset identifiers.
  const metasetConflictDialogElement = (
    <MetasetConflictDialog
      open={metasetConflictOpen}
      count={conflictIds.length}
      onCancel={() => {
        setMetasetConflictOpen(false)
        setPendingImport(null)
        setConflictIds([])
      }}
      onChoose={(choice) => {
        try {
          if (!pendingImport) {
            setMetasetConflictOpen(false)
            return
          }
          const prep = prepareHsfcImport(metasets, pendingImport.metasets, pendingImport.cfgs)
          const { nextMetas, remapForConflicts } = finalizeImport(metasets, prep, choice)
          const idMap = new Map(importIdMap)
          for (const [k, v] of remapForConflicts) idMap.set(k, v)
          const cfgs = pendingImport.cfgs.map((c) => ({
            ...c,
            artifactMetaSets: (c.artifactMetaSets ?? []).map((id) => idMap.get(id) ?? id),
          }))
          const refIds = new Set<string>()
          for (const c of cfgs) for (const id of c.artifactMetaSets ?? []) refIds.add(String(id))
          const have = new Set(nextMetas.map((m) => m.id))
          const finalMetas = nextMetas.slice()
          for (const id of refIds) {
            if (!have.has(id)) {
              const existingNames = metasets.map((m) => m.name)
              const gen = generateMetasetNameWithFlag(existingNames)
              finalMetas.push({ id, name: gen.name, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
            }
          }
          setMetasets(finalMetas)
          if (pendingImport.mode === 'append') {
            const preLen = customCfgs.length
            setCustomCfgs((prev) => [...prev, ...cfgs])
            setFinalSellRemainder(pendingImport.finalSellRemainder)
            if ((!hsfcNote || !hsfcNote.trim()) && typeof pendingImport.note === 'string' && pendingImport.note.trim()) {
              setHsfcNote(pendingImport.note)
            }
            try {
              const sel = preLen + cfgs.length - 1
              setSelectedCfgIdx(sel)
              setBuilder(cfgs[cfgs.length - 1]!)
            } catch {}
          } else {
            const after = Math.max(0, Math.min((pendingImport.afterIdx ?? customCfgs.length - 1), customCfgs.length - 1))
            setCustomCfgs((prev) => {
              const insertIdx = Math.min(prev.length, after + 1)
              return [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
            })
            setFinalSellRemainder(pendingImport.finalSellRemainder)
            if ((!hsfcNote || !hsfcNote.trim()) && typeof pendingImport.note === 'string' && pendingImport.note.trim()) {
              setHsfcNote(pendingImport.note)
            }
            try {
              setSelectedCfgIdx(after + cfgs.length)
              setBuilder(cfgs[cfgs.length - 1]!)
            } catch {}
          }
        } finally {
          setMetasetConflictOpen(false)
          setPendingImport(null)
          setConflictIds([])
        }
      }}
    />
  )

  // Manual paste dialog for HSFC snippets.
  const pasteDialogElement = (
    <PasteDialog
      open={pasteDlgOpen}
      text={pasteText}
      error={pasteErr}
      onTextChange={(v) => {
        setPasteText(v)
        setPasteErr(null)
      }}
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
  )

  // Manual copy dialog when clipboard writes fail.
  const copyDialogElement = (
    <CopyDialog
      open={copyDlgOpen}
      text={copyText}
      inputRef={copyInputRef}
      onTextChange={setCopyText}
      onClose={() => setCopyDlgOpen(false)}
    />
  )

  return (
    <Container maxWidth="xl" sx={{ pt: 1.5, pb: 1.5 }}>
      {/* Full-screen, non-interactive overlay shown while dragging files over the app.
          We keep pointerEvents: 'none' so drops still reach the window handler. */}
      {(() => {
        const dragOverlayVisible = fileDragActive && !confirmClearOpen && confirmDeleteIdx === null && confirmDeleteTargets === null
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
                  onClick={() => { tutorial.setHelpFirstRunMode(false); tutorial.setHelpOpen(true) }}
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
        <BuilderColumn
          paperRef={leftPaperRef}
          sideBySideMinPaperHeightPx={sideBySideMinPaperHeightPx}
          title={t('appBuilderTitle')}
          caption={t('builderIntroCaption')}
          substatValuesLabel={t('builderSubstatValues')}
          onOpenSubstatValues={openMinimaDialog}
          builderPanel={builderPanelElement}
          headerActions={headerActionsElement}
          metasetConflictDialog={metasetConflictDialogElement}
          configChipsPanel={configChipsPanelElement}
          pasteDialog={pasteDialogElement}
          copyDialog={copyDialogElement}
        />

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
            exportBaselineResetRef.current = true
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
        hsfDirty={hsfDirty}
        onExport={async () => {
          const blob = hsfToBlob(hsfExportPayload)
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
                setLastExportSig(hsfExportSig)
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
          setLastExportSig(hsfExportSig)
          try { setToastMsg(t('toastSellfileSaved')) } catch {}
          try { setToastOpen(true) } catch {}
        }}
        exportDisabled={!mergedRules.length}
        finalSell={finalSellRemainder}
        onToggleFinalSell={(enabled) => {
          setFinalSellRemainder(prev => {
            const cur = prev ?? {
              artifacts: true,
              accessories: true,
              levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>,
              setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
            }
            if (enabled) {
              const hasTypes = cur.artifacts || cur.accessories
              const hasLevels = (cur.levels?.length ?? 0) > 0
              return {
                ...cur,
                artifacts: hasTypes ? cur.artifacts : true,
                accessories: hasTypes ? cur.accessories : true,
                levels: hasLevels ? cur.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>),
              }
            }
            return { ...cur, artifacts: false, accessories: false }
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
              onResetFilters={scrollSelectedConfigIntoView}
            />
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <HsfRulesTableMemo
               rules={filterActive ? filteredRules : mergedRules}
               setHoveredCfgIdx={setHoveredCfgIdx}
               selectedCfgIdx={selectedCfgIdx}
               multiselectActive={multiselectActive}
               focusRuleIndex={focusRuleIndex}
               onSelectCfgIdx={(idx) => {
                 // Guard against invalid indices to avoid crashes
                 setSelectedCfgIdx((prev) => (idx >= 0 && idx < customCfgs.length ? idx : prev))
                 if (idx >= 0 && idx < customCfgs.length && customCfgs[idx]) {
                   // Clicking preview rows resets to single selection
                   setSelectedCfgIndices([idx])
                   setSelectionAnchor(idx)
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
        open={tutorial.helpOpen}
        firstRunMode={tutorial.helpFirstRunMode}
        onClose={() => {
          tutorial.setHelpOpen(false)
          // Close without auto-start; manual Help never auto-starts
          tutorial.setHelpFirstRunMode(false)
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
        }}
        onStartTutorial={() => {
          try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
          tutorial.setHelpOpen(false)
          tutorial.setHelpFirstRunMode(false)
          tutorial.startTutorial()
        }}
      />
      <NoteDialog
        open={noteOpen}
        mode={noteMode}
        note={hsfcNote ?? ''}
        onChange={(v) => setHsfcNote(v)}
        onClose={() => closeNote()}
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
        onConfirmClear={handleConfirmClear}
        deleteIdx={confirmDeleteIdx}
        setDeleteIdx={setConfirmDeleteIdx}
        onConfirmDelete={handleConfirmDelete}
        deleteMultiTargets={confirmDeleteTargets}
        setDeleteMultiTargets={setConfirmDeleteTargets}
        onConfirmDeleteMulti={confirmDeleteMultiDialog}
      />
      {/* Restore autosaved HSFC dialog */}
      <RestoreAutosaveDialog
        open={restoreDlgOpen}
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
                const fsr = draft.FinalSellRemainder as FinalSellRemainderConfig
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
        onReset={() => setFinalSellRemainder({ artifacts: true, accessories: true, levels: FINAL_SELL_DEFAULT_LEVELS.slice() as Array<0|4|8|12|16>, setsMode: FINAL_SELL_DEFAULT_SETS_MODE })}
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
            setSelectionAnchor(cfgIdx)
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
        open={tutorial.tutorialOpen}
        steps={tutorial.tutorialSteps}
        stepIndex={tutorial.tutorialIdx}
        sections={tutorial.tutorialSections}
        onSkipTo={tutorial.handleTutorialSkipTo}
        onClose={tutorial.handleTutorialClose}
        onPrev={tutorial.handleTutorialPrev}
        onNext={tutorial.handleTutorialNext}
      />
    </Container>
  )
}
