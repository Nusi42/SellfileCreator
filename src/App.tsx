/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - HSFC (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, substatTargets, and autosave
 * - Color management for substat chips and various dialogs
 */
import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, type ReactNode } from 'react'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, buildDedupedHsfFileFromMerged, hsfToBlob } from './lib/hsfIO'
import { getPushEndpoint } from './lib/runtimeConfig'
import { externalArtifactToTestItem, type ExternalCommand } from './lib/externalCommands'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderConfig, type SubstatTargetTable, type SellfileExportMode } from './lib/hsfBuilder'
import { parseConfigsFromText, buildReadableConfig, readHsfcFile, buildHsfcPayload, hsfcToBlob } from './lib/hsfcIO'
import { COPY_DIALOG_EVENT, writeTextSafe } from './lib/clipboard'
// Autosave restore logic lives in useAutosaveRestore.
import {
  AUTOSAVE_KEY,
  AUTOSAVE_TESTER_KEY,
  PREVIEW_MODE_STORAGE_KEY,
  PANEL_WIDTH_PX,
  SIDE_BY_SIDE_BREAKPOINT_PX,
  GRID_COLUMN_GAP_PX,
  FINAL_SELL_DEFAULT_LEVELS,
  FONT_SIZE_DISPLAY_REM,
  FONT_SIZE_HEADER_META_PX,
  FONT_SIZE_BASE_PX,
} from './lib/constants'
import { buildPreviewArtifactFromTesterItem } from './lib/testerPreviewArtifacts'

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Tooltip, Button } from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import StorageIcon from '@mui/icons-material/Storage'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
import { HsfRulesTableMemo } from './components/HsfRulesTable'
// Config chips list panel component
import ConfigChipsPanel from './components/ConfigChipsPanel'
import ConfirmDialogs from './components/ConfirmDialogs'
import BuilderPanel, { createFactoryBuilderDefaults } from './components/BuilderPanel'
import CopyDialog from './components/CopyDialog'
import PasteDialog from './components/PasteDialog'
// Markdown preview for HSFC Note (read-only). Requires installation:
//   npm i @uiw/react-md-editor rehype-sanitize @uiw/react-markdown-preview
// Styles are imported globally here.
// If the deps are missing, the app will fail to compile; install them as above.
import NoteDialog from './components/NoteDialog'
import { useManageColorsDialog } from './hooks/useManageColorsDialog'
import { useSubstatTargetsDialog } from './hooks/useSubstatTargetsDialog'
import { computeMergedRules, buildRulesForConfig, buildFinalSellRules, RULE_SOURCE_FINAL_SELL, RULE_SOURCE_HSF, type HsfRuleWithCfg } from './lib/merge'
import { updateConfigRulesCache, fingerprintConfigForRules, fingerprintSubstatTargets, mergeArtifactSets } from './lib/ruleCache'
import { hasConfigMeaningfulDifferences } from './lib/configDiff'
import { buildRuleTesterAutosavePayload, createRuleTesterMath, diffRuleTesterItems, fingerprintRuleTesterItem, loadRuleTesterAutosaveDraft, type RuleTesterItem } from './lib/ruleTesterSession'
import { sortTesterRows } from './lib/testerSort'
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
import FileFormatErrorDialog from './components/dialogs/FileFormatErrorDialog'
import { useAutosave } from './hooks/useAutosave'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import RuleTesterDialog from './components/dialogs/RuleTesterDialog'
import RulesFilterPanel, { type RulesFilterPanelHandle } from './components/RulesFilterPanel'
import type { TesterConfigFilterMode } from './types/testerConfigFilterMode'
import { filterHsfRules, filterTesterItems, isRulesFilterActive, normalizeRulesFilterForTester, type FilterHsfRulesResult, type RulesFilterState } from './lib/rulesFilter'
import { useAutosaveRestore, metasetsSignature, substatTargetsSignature } from './hooks/useAutosaveRestore'
import { makeManageColorsIcon } from './lib/icons'
import type { ChampionLocation } from './lib/importers/gearDbNormalizer'
import { sellfileFilename, hsfcFilename, buildTimestamp } from './lib/filenames'
import { README_SEEN_VERSION_KEY, RULE_COUNT_LIMIT } from './lib/constants'
import { DEFAULT_METASET_ICON_ID } from './lib/metasetIcons'
import { defaultMetasets, type Metaset } from './lib/metasets'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useDisplayPreferences, useDisplayPreferenceActions } from './state/preferencesState'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/configDuplicates'
import { configsForRuleBuild } from './lib/ruleCacheHelpers'
import { evaluateMatchesByConfig, type TestItem } from './lib/ruleEval'
import { importGearDatabaseFromFile } from './lib/importers/gearDbImporter'
import type { NormalizedGearArtifact } from './lib/importers/gearDbNormalizer'
import { TesterItemsGrid } from './components/TesterItemsGrid'
import type { TesterPreviewMatch, TesterPreviewRow } from './types/testerPreview'
import { buildRuleMatchIndexData, primeRuleMatchIndex } from './lib/ruleMatchIndex'

const NO_AUTO_APPLY: () => boolean = () => false
const TESTER_PREVIEW_CHUNK_SIZE = 250
import { FINAL_SELL_DEFAULT_SETS_MODE } from './lib/finalSell'
import type { FinalSellRemainderConfig, FinalSellLevel } from './lib/finalSell'
import { useConfigSelection } from './hooks/useConfigSelection'
import { useRuleCacheWorker } from './hooks/useRuleCacheWorker'
import { getConfigHoverIndex, setConfigHoverIndex, subscribeConfigHover } from './lib/configHoverBridge'
import { useBuilderPreviewLayout } from './hooks/useBuilderPreviewLayout'
import { getDirtyBuilderFieldKeys } from './lib/multiEditDraft'
import { useTooltipScrollGuard } from './hooks/useTooltipScrollGuard'
import { useModalCleanup } from './hooks/useModalCleanup'
import { useTutorialCoachState } from './hooks/useTutorialCoachState'
import { useExternalCommands } from './hooks/useExternalCommands'
import { useHsfcClipboard, type PendingImport } from './hooks/useHsfcClipboard'
import { useRuntimeCatalogLoader } from './hooks/useRuntimeCatalogLoader'
import { useRulesFilterCollapsedPreference, useRulesFilterOpenPreference, useRulesFilterStatePreference, cloneDefaultRulesFilterState, cloneDefaultRulesFilterCollapsed } from './state/rulesFilterPersistence'
import { useSellfileDedupPreference, useSellfileOmitDisabledPreference } from './state/exportPreferences'
import { useHsfcDialogs } from './hooks/useHsfcDialogs'
import { useHsfcHistoryController } from './hooks/useHsfcHistoryController'
import type { HistoryEntryDescriptor, DescribeNextChangeFn } from './hooks/useHsfcHistory'
import { describeBuilderConfigUpdate, buildConfigLabel } from './history/builderUpdateDescriptor'
import {
  describeConfigAdded,
  describeConfigsCleared,
  describeConfigsDeleted,
  describeConfigsInserted,
} from './history/configCollectionDescriptors'
import { describeMetasetConflictResolved, describeMetasetDeleted, describeMetasetsReset } from './history/metasetDescriptors'
import { describeSubstatTargetsChange, areSubstatTargetTablesEqual, isDefaultSubstatTargetTable, appendDescriptorDetails } from './history/substatTargetDescriptors'
import { describeFinalSellChange, areFinalSellConfigsEqual, type FinalSellDescriptorMode } from './history/finalSellDescriptors'
import { describeNoteChange, normalizeNoteValue, type NoteDescriptorMode } from './history/noteDescriptors'
import { describeHsfcLoaded, describeAutosaveRestored, makeClipboardSourceDescriptor } from './history/bulkLoadDescriptors'
import { useAutoSideBySideZoom } from './hooks/useAutoSideBySideZoom'

// Components are organized under src/components

import type { ColorBlindMode } from './lib/constants'

type ConfigKeyAnalysis = {
  mapping: Array<number | null>
  removed: number[]
  identical: boolean
  reorderOnly: boolean
}

function analyzeConfigKeys(previous: readonly string[], next: readonly string[]): ConfigKeyAnalysis {
  const available = new Map<string, number[]>()
  for (let i = 0; i < previous.length; i += 1) {
    const key = previous[i]!
    const bucket = available.get(key)
    if (bucket) {
      bucket.push(i)
    } else {
      available.set(key, [i])
    }
  }
  const mapping: Array<number | null> = []
  for (let i = 0; i < next.length; i += 1) {
    const key = next[i]!
    const bucket = available.get(key)
    if (!bucket || bucket.length === 0) {
      mapping.push(null)
    } else {
      const prevIdx = bucket.shift()!
      mapping.push(prevIdx)
    }
  }
  const removed: number[] = []
  for (const bucket of available.values()) {
    while (bucket.length > 0) {
      removed.push(bucket.shift()!)
    }
  }
  const identical = previous.length === next.length
    && removed.length === 0
    && mapping.every((prevIdx, idx) => prevIdx === idx)
  const reorderOnly = previous.length === next.length
    && removed.length === 0
    && mapping.every((prevIdx) => prevIdx !== null)
    && !identical
  return { mapping, removed, identical, reorderOnly }
}

const DEFAULT_GEAR_DB_FILENAME = 'RslHelper.db'

const createGearDbFileFromBase64 = (name: string, base64?: string | null): File | null => {
  const atobFn = typeof globalThis !== 'undefined' && typeof globalThis.atob === 'function'
    ? globalThis.atob.bind(globalThis)
    : null
  if (!atobFn || typeof File !== 'function') {
    return null
  }
  const sanitized = (base64 ?? '').replace(/[\r\n\s]+/g, '')
  if (!sanitized) {
    return null
  }
  let binary: string
  try {
    binary = atobFn(sanitized)
  } catch {
    return null
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  const fileName = name && name.trim().length > 0 ? name : DEFAULT_GEAR_DB_FILENAME
  try {
    return new File([bytes], fileName, { type: 'application/octet-stream' })
  } catch {
    return null
  }
}

function remapRulesForIndex(rules: readonly HsfRuleWithCfg[], cfgIdx: number): HsfRuleWithCfg[] {
  for (const rule of rules) {
    if (rule.__cfgIdx !== cfgIdx) {
      (rule as HsfRuleWithCfg).__cfgIdx = cfgIdx
    }
  }
  return rules as HsfRuleWithCfg[]
}

function splitMergedRules(rules: readonly HsfRuleWithCfg[]): { baseRules: HsfRuleWithCfg[]; finalSellRules: HsfRuleWithCfg[] } {
  const baseRules: HsfRuleWithCfg[] = []
  const finalSellRules: HsfRuleWithCfg[] = []
  for (const rule of rules) {
    if (rule.__source === RULE_SOURCE_HSF) {
      baseRules.push(rule)
    } else if (rule.__source === RULE_SOURCE_FINAL_SELL) {
      finalSellRules.push(rule)
    }
  }
  return { baseRules, finalSellRules }
}

type ConfigRulesStateSnapshot = {
  baseRules: HsfRuleWithCfg[]
  finalSellRules: HsfRuleWithCfg[]
  rulesByConfig: Map<number, HsfRuleWithCfg[]>
  countsByConfig: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  mergedRules: HsfRuleWithCfg[]
  truncatedConfigIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
}

// Inserts/updates still flow through the worker; the UI only handles pure reorders locally.

export default function App({ colorBlindMode, setColorBlindMode }: { colorBlindMode: ColorBlindMode; setColorBlindMode: (m: ColorBlindMode) => void }) {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  // Shared app state via context — reduces prop drilling and keeps behavior consistent.
  const { customCfgs, selectedCfgIdx, metasets, substatTargets, finalSellRemainder, hsfcNote } = useAppState()
  const { setCustomCfgs, setSelectedCfgIdx: setSelectedCfgIdxRaw, setMetasets, setSubstatTargets, setFinalSellRemainder, setHsfcNote } = useAppActions()
  const { warmCache, flush: flushRuleCache, countRules } = useRuleCacheWorker()
  const { statButtonBorders } = useDisplayPreferences()
  const { setStatButtonBorders } = useDisplayPreferenceActions()
  // Use a deferred snapshot so bursty substatTargets updates (e.g., Restore Defaults) coalesce before recomputing merged rules.
  const ruleConfigs = useMemo(() => configsForRuleBuild(customCfgs), [customCfgs])
  const testerConfigNames = useMemo(() => customCfgs.map((cfg) => {
    if (!cfg || typeof cfg.name !== 'string') return null
    const trimmed = cfg.name.trim()
    return trimmed.length > 0 ? trimmed : null
  }), [customCfgs])
  const substatTargetsForPreview = useDeferredValue(substatTargets)
  const metasetsForPreview = useDeferredValue(metasets)
  const ruleConfigsForPreview = useDeferredValue(ruleConfigs)
  const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const testerRowIdRef = useRef(1)
  const allocTesterRowId = useCallback(() => {
    const id = testerRowIdRef.current
    testerRowIdRef.current += 1
    return id
  }, [])
  const [testerItems, setTesterItems] = useState<RuleTesterItem[]>([])
  const testerItemsRef = useRef(testerItems)
  useEffect(() => { testerItemsRef.current = testerItems }, [testerItems])
  const [testerRestoreDraft, setTesterRestoreDraft] = useState<{
    items: RuleTesterItem[]
    savedAt: string | null
    count: number
  } | null>(() => {
    const math = createRuleTesterMath(substatTargets)
    const draft = loadRuleTesterAutosaveDraft({ math, allocRowId: allocTesterRowId })
    if (!draft) return null
    return { items: draft.items, savedAt: draft.savedAt, count: draft.itemCount }
  })
  const [pendingTesterItems, setPendingTesterItems] = useState<TestItem[]>([])
  const pendingTesterItemsRef = useRef(pendingTesterItems)
  useEffect(() => { pendingTesterItemsRef.current = pendingTesterItems }, [pendingTesterItems])
  type TesterArtifactCacheEntry = { fingerprint: string; artifact: NormalizedGearArtifact }
  type TesterChampionOption = { id: number; name: string | null; location: ChampionLocation | null; count: number }
  const testerArtifactCacheRef = useRef<Map<number, TesterArtifactCacheEntry>>(new Map())
  const testerAutosaveBaselineRef = useRef<string | null>(null)
  const testerPreviewArtifacts = useMemo<NormalizedGearArtifact[]>(() => {
    const cache = testerArtifactCacheRef.current
    const next: NormalizedGearArtifact[] = []
    const activeRowIds = new Set<number>()
    testerItems.forEach((item, idx) => {
      const rowId = Number.isFinite(item.rowId)
        ? item.rowId
        : -(idx + 1)
      const fingerprint = fingerprintRuleTesterItem(item)
      const cached = cache.get(rowId)
      if (cached && cached.fingerprint === fingerprint) {
        next.push(cached.artifact)
        activeRowIds.add(rowId)
        return
      }
      try {
        const artifact = buildPreviewArtifactFromTesterItem(item, {
          fallbackId: Number.isFinite(item.rowId) ? -Math.abs(item.rowId) : undefined,
          subOrder: item.subOrder,
        })
        cache.set(rowId, { fingerprint, artifact })
        next.push(artifact)
        activeRowIds.add(rowId)
      } catch {
        cache.delete(rowId)
      }
    })
    if (cache.size > activeRowIds.size) {
      for (const key of Array.from(cache.keys())) {
        if (!activeRowIds.has(key)) {
          cache.delete(key)
        }
      }
    }
    return next
  }, [testerItems])
  const [testerPreviewRows, setTesterPreviewRows] = useState<TesterPreviewRow[]>([])
  const testerMatchesByRowId = useMemo(() => {
    const map = new Map<number, TesterPreviewMatch | null>()
    for (const row of testerPreviewRows) {
      const rowId = Number((row.artifact.testerItem as RuleTesterItem | undefined)?.rowId ?? NaN)
      if (Number.isFinite(rowId)) {
        map.set(rowId, row.match)
      }
    }
    return map
  }, [testerPreviewRows])
  const testerRowsBuildIdRef = useRef(0)
  const testerPreviewRowMapRef = useRef<Map<number, TesterPreviewRow>>(new Map())
  const testerPreviewMatchDepsRef = useRef<{ rules: readonly HsfRuleWithCfg[] | null; namesSignature: string | null }>({
    rules: null,
    namesSignature: null,
  })
  const [testerRowsBuilding, setTesterRowsBuilding] = useState(false)
  const exportBaselineResetRef = useRef(false)
  const { forceSideBySide: forceSideBySideLayout } = useAutoSideBySideZoom()
  const {
    leftPaperRef,
    chipsContainerRef,
    chipsMaxHeight,
    previewPaperHeightStyle,
    sideBySideMinPaperHeightPx,
  } = useBuilderPreviewLayout({ forceSideBySide: forceSideBySideLayout })
  useTooltipScrollGuard()
  useModalCleanup()

  // Manage Colors dialog state + persisted substat colors
  const {
    open: colorsDlgOpen,
    openDialog: openColors,
    closeDialog: closeColors,
    substatColors,
    setSubstatColors,
    resetColors,
  } = useManageColorsDialog()
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

  const [builderState, setBuilderState] = useState<BuilderConfig>(() => createFactoryBuilderDefaults())
  const builder = builderState
  // Keep a ref to the latest builder so tutorial helpers and action handlers can snapshot current
  // values without waiting for React to flush state updates.
  const builderRef = React.useRef(builder)
  const [configRulesState, setConfigRulesState] = useState<ConfigRulesStateSnapshot>(() => {
    const configsForRules = configsForRuleBuild(customCfgs)
    const baseRuleCount = Array.isArray(hsf?.Rules) ? (hsf?.Rules.length ?? 0) : 0
    const initial = updateConfigRulesCache({
      configs: configsForRules,
      metasets,
      substatTargets,
      baseRuleCount,
    })
    const mergedRules = computeMergedRules({
      hsf,
      customCfgs: configsForRules,
      metasets,
      substatTargets,
      ...(finalSellRemainder ? { finalSellRemainder } : {}),
      prebuiltCustomRules: initial.rulesByConfig,
    })
    const { baseRules, finalSellRules } = splitMergedRules(mergedRules)
    return {
      baseRules,
      finalSellRules,
      rulesByConfig: initial.rulesByConfig,
      countsByConfig: initial.countsByConfig,
      keys: initial.keys,
      substatTargetsKey: initial.substatTargetsKey,
      mergedRules,
      truncatedConfigIndices: initial.truncatedConfigIndices.slice(),
      totalLimitHit: initial.totalLimitHit,
      excludedByTotalLimitIndices: initial.excludedByTotalLimitIndices.slice(),
    }
  })
  const ruleCacheRequestTokenRef = useRef(0)
  const [rulesBuilding, setRulesBuilding] = useState(false)
  const pendingWarmRef = useRef<{ token: number; promise: Promise<ConfigRulesStateSnapshot> } | null>(null)
  const lastWarmInputsRef = useRef<{
    configs: BuilderConfig[] | null
    metasets: Metaset[] | null
    substatTargets: SubstatTargetTable | null
    hsf: HsfFile | null
    finalSell: FinalSellRemainderConfig | null | undefined
  } | null>(null)
  const immediateRuleConfigsRef = useRef(ruleConfigs)
  const immediateMetasetsRef = useRef(metasets)
  const immediateSubstatTargetsRef = useRef(substatTargets)
  useEffect(() => {
    immediateRuleConfigsRef.current = ruleConfigs
  }, [ruleConfigs])
  useEffect(() => {
    immediateMetasetsRef.current = metasets
  }, [metasets])
  useEffect(() => {
    immediateSubstatTargetsRef.current = substatTargets
  }, [substatTargets])

  useEffect(() => {
    if (
      ruleConfigsForPreview !== immediateRuleConfigsRef.current
      || metasetsForPreview !== immediateMetasetsRef.current
      || substatTargetsForPreview !== immediateSubstatTargetsRef.current
    ) {
      return undefined
    }

    const nextSubstatTargetsKey = fingerprintSubstatTargets(substatTargetsForPreview)
    const resolvedConfigsForFingerprint = ruleConfigsForPreview.map((cfg) => mergeArtifactSets(cfg, metasetsForPreview))
    const nextKeys = resolvedConfigsForFingerprint.map((cfg) => fingerprintConfigForRules(cfg, nextSubstatTargetsKey))

    const prevWarm = lastWarmInputsRef.current
    if (
      prevWarm
      && prevWarm.configs === ruleConfigsForPreview
      && prevWarm.metasets === metasetsForPreview
      && prevWarm.substatTargets === substatTargetsForPreview
      && prevWarm.hsf === hsf
      && prevWarm.finalSell === finalSellRemainder
    ) {
      return undefined
    }

    const canUseFingerprints = nextSubstatTargetsKey === configRulesState.substatTargetsKey
    const isBaseStable = !prevWarm || prevWarm.hsf === hsf
    const isFinalSellStable = !prevWarm || prevWarm.finalSell === finalSellRemainder
    if (canUseFingerprints) {
      const analysis = analyzeConfigKeys(configRulesState.keys, nextKeys)
      if (analysis.identical && isBaseStable && isFinalSellStable) {
        lastWarmInputsRef.current = {
          configs: ruleConfigsForPreview,
          metasets: metasetsForPreview,
          substatTargets: substatTargetsForPreview,
          hsf,
          finalSell: finalSellRemainder,
        }
        return undefined
      }
      if (analysis.identical && isBaseStable && !isFinalSellStable) {
        const nextFinalSellRules = buildFinalSellRules(finalSellRemainder)
        setConfigRulesState((prev) => {
          const customSegments: HsfRuleWithCfg[][] = []
          for (let idx = 0; idx < prev.keys.length; idx += 1) {
            customSegments.push(prev.rulesByConfig.get(idx) ?? [])
          }
          const mergedRules = prev.baseRules.concat(...customSegments, nextFinalSellRules)
          return {
            ...prev,
            finalSellRules: nextFinalSellRules,
            mergedRules,
          }
        })
        setRulesBuilding(false)
        lastWarmInputsRef.current = {
          configs: ruleConfigsForPreview,
          metasets: metasetsForPreview,
          substatTargets: substatTargetsForPreview,
          hsf,
          finalSell: finalSellRemainder,
        }
        return undefined
      }
      if (analysis.reorderOnly && isBaseStable && isFinalSellStable) {
        const mapping = analysis.mapping.map((value) => value!)
        setConfigRulesState((prev) => {
          const newRulesByConfig = new Map<number, HsfRuleWithCfg[]>()
          const newCountsByConfig = new Map<number, number>()
          const truncatedPrev = new Set(prev.truncatedConfigIndices)
          const excludedPrev = new Set(prev.excludedByTotalLimitIndices)
          const newTruncated: number[] = []
          const newExcluded: number[] = []
          const customSegments: HsfRuleWithCfg[][] = []
          for (let idx = 0; idx < mapping.length; idx += 1) {
            const previousIdx = mapping[idx]!
            const prevRules = prev.rulesByConfig.get(previousIdx) ?? []
            const remapped = remapRulesForIndex(prevRules, idx)
            newRulesByConfig.set(idx, remapped)
            const prevCount = prev.countsByConfig.get(previousIdx)
            const wasTruncated = truncatedPrev.has(previousIdx)
            if (wasTruncated) {
              newCountsByConfig.set(idx, Number.POSITIVE_INFINITY)
              newTruncated.push(idx)
            } else {
              const countValue = typeof prevCount === 'number' ? prevCount : remapped.length
              newCountsByConfig.set(idx, countValue)
            }
            if (excludedPrev.has(previousIdx)) newExcluded.push(idx)
            customSegments.push(remapped)
          }
          const mergedRules = prev.baseRules.concat(...customSegments, prev.finalSellRules)
          return {
            ...prev,
            baseRules: prev.baseRules,
            finalSellRules: prev.finalSellRules,
            rulesByConfig: newRulesByConfig,
            countsByConfig: newCountsByConfig,
            keys: nextKeys.slice(),
            substatTargetsKey: nextSubstatTargetsKey,
            mergedRules,
            truncatedConfigIndices: newTruncated,
            excludedByTotalLimitIndices: newExcluded,
          }
        })
        setRulesBuilding(false)
        lastWarmInputsRef.current = {
          configs: ruleConfigsForPreview,
          metasets: metasetsForPreview,
          substatTargets: substatTargetsForPreview,
          hsf,
          finalSell: finalSellRemainder,
        }
        return undefined
      }
      const mappingHasNull = analysis.mapping.some((value) => value === null)
      if (!mappingHasNull && analysis.removed.length > 0 && isBaseStable && isFinalSellStable) {
        const mapping = analysis.mapping.map((value) => value!)
        setConfigRulesState((prev) => {
          const newRulesByConfig = new Map<number, HsfRuleWithCfg[]>()
          const newCountsByConfig = new Map<number, number>()
          const truncatedPrev = new Set(prev.truncatedConfigIndices)
          const excludedPrev = new Set(prev.excludedByTotalLimitIndices)
          const newTruncated: number[] = []
          const newExcluded: number[] = []
          const customSegments: HsfRuleWithCfg[][] = []
          for (let idx = 0; idx < mapping.length; idx += 1) {
            const previousIdx = mapping[idx]!
            const prevRules = prev.rulesByConfig.get(previousIdx) ?? []
            const remapped = remapRulesForIndex(prevRules, idx)
            newRulesByConfig.set(idx, remapped)
            const prevCount = prev.countsByConfig.get(previousIdx)
            if (truncatedPrev.has(previousIdx)) {
              newCountsByConfig.set(idx, Number.POSITIVE_INFINITY)
              newTruncated.push(idx)
            } else {
              const countValue = typeof prevCount === 'number' ? prevCount : remapped.length
              newCountsByConfig.set(idx, countValue)
            }
            if (excludedPrev.has(previousIdx)) newExcluded.push(idx)
            customSegments.push(remapped)
          }
        const mergedRules = prev.baseRules.concat(...customSegments, prev.finalSellRules)
        primeRuleMatchIndex(mergedRules, buildRuleMatchIndexData(mergedRules))
        return {
          ...prev,
          rulesByConfig: newRulesByConfig,
          countsByConfig: newCountsByConfig,
            keys: nextKeys.slice(),
            substatTargetsKey: nextSubstatTargetsKey,
            mergedRules,
            truncatedConfigIndices: newTruncated,
            excludedByTotalLimitIndices: newExcluded,
          }
        })
        setRulesBuilding(false)
        lastWarmInputsRef.current = {
          configs: ruleConfigsForPreview,
          metasets: metasetsForPreview,
          substatTargets: substatTargetsForPreview,
          hsf,
          finalSell: finalSellRemainder,
        }
        return undefined
      }
    }

    lastWarmInputsRef.current = {
      configs: ruleConfigsForPreview,
      metasets: metasetsForPreview,
      substatTargets: substatTargetsForPreview,
      hsf,
      finalSell: finalSellRemainder,
    }
    const abortController = new AbortController()
    const requestToken = ruleCacheRequestTokenRef.current + 1
    ruleCacheRequestTokenRef.current = requestToken
    setRulesBuilding(true)

    const isAbortError = (error: unknown): boolean => {
      if (!error || typeof error !== 'object') return false
      const maybe = error as { name?: unknown }
      if (typeof maybe.name === 'string' && maybe.name === 'AbortError') return true
      if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
        return error.name === 'AbortError'
      }
      return false
    }

    const warmPromise = warmCache(
      {
        configs: ruleConfigsForPreview,
        metasets: metasetsForPreview,
        substatTargets: substatTargetsForPreview,
        hsf,
        ...(finalSellRemainder ? { finalSellRemainder } : {}),
      },
      { signal: abortController.signal },
    )
      .then(({ state }) => {
        if (abortController.signal.aborted) {
          const { baseRules, finalSellRules } = splitMergedRules(state.mergedRules)
          const snapshot: ConfigRulesStateSnapshot = {
            baseRules,
            finalSellRules,
            rulesByConfig: state.rulesByConfig,
            countsByConfig: state.countsByConfig,
            keys: state.keys,
            substatTargetsKey: state.substatTargetsKey,
            mergedRules: state.mergedRules,
            truncatedConfigIndices: state.truncatedConfigIndices,
            totalLimitHit: state.totalLimitHit,
            excludedByTotalLimitIndices: state.excludedByTotalLimitIndices,
          }
          if (requestToken === ruleCacheRequestTokenRef.current) {
            setRulesBuilding(false)
          }
          return snapshot
        }
        if (requestToken === ruleCacheRequestTokenRef.current) {
          const { baseRules, finalSellRules } = splitMergedRules(state.mergedRules)
          const snapshot: ConfigRulesStateSnapshot = {
            baseRules,
            finalSellRules,
            rulesByConfig: state.rulesByConfig,
            countsByConfig: state.countsByConfig,
            keys: state.keys,
            substatTargetsKey: state.substatTargetsKey,
            mergedRules: state.mergedRules,
            truncatedConfigIndices: state.truncatedConfigIndices,
            totalLimitHit: state.totalLimitHit,
            excludedByTotalLimitIndices: state.excludedByTotalLimitIndices,
          }
          startTransition(() => {
            setConfigRulesState(snapshot)
            setRulesBuilding(false)
          })
          return snapshot
        }
        const { baseRules, finalSellRules } = splitMergedRules(state.mergedRules)
        return {
          baseRules,
          finalSellRules,
          rulesByConfig: state.rulesByConfig,
          countsByConfig: state.countsByConfig,
          keys: state.keys,
          substatTargetsKey: state.substatTargetsKey,
          mergedRules: state.mergedRules,
          truncatedConfigIndices: state.truncatedConfigIndices,
          totalLimitHit: state.totalLimitHit,
          excludedByTotalLimitIndices: state.excludedByTotalLimitIndices,
        }
      })

    pendingWarmRef.current = { token: requestToken, promise: warmPromise }

    warmPromise.catch((error) => {
      if (abortController.signal.aborted) return
      if (isAbortError(error)) return
      console.error('rule cache update failed', error)
      if (pendingWarmRef.current?.token === requestToken) {
        pendingWarmRef.current = null
      }
      if (requestToken === ruleCacheRequestTokenRef.current) {
        setRulesBuilding(false)
      }
    })

    warmPromise.finally(() => {
      if (requestToken !== ruleCacheRequestTokenRef.current) {
        if (pendingWarmRef.current?.token === requestToken) {
          pendingWarmRef.current = null
        }
        return
      }
      if (pendingWarmRef.current?.token === requestToken) {
        pendingWarmRef.current = null
      }
      if (abortController.signal.aborted && requestToken === ruleCacheRequestTokenRef.current) {
        setRulesBuilding(false)
      }
    })

    return () => {
      abortController.abort()
    }
  }, [ruleConfigsForPreview, metasetsForPreview, substatTargetsForPreview, warmCache, hsf, finalSellRemainder, configRulesState])

  const awaitRuleCounts = useCallback((): { token: number; promise: Promise<Map<number, number>> } | null => {
    const pending = pendingWarmRef.current
    if (!pending) return null
    return {
      token: pending.token,
      promise: pending.promise.then((state) => state.countsByConfig),
    }
  }, [])
  const selectionGuardRef = useRef<(prev: number[], next: number[]) => void>(() => {})
  const autoApplyNowRef = useRef<() => boolean>(NO_AUTO_APPLY)
  const registerAutoApplyHandler = useCallback((fn: (() => boolean) | null) => {
    autoApplyNowRef.current = fn ?? NO_AUTO_APPLY
  }, [])
  const handleWillChangeSelection = useCallback((prev: number[], next: number[]) => {
    autoApplyNowRef.current()
    selectionGuardRef.current(prev, next)
  }, [autoApplyNowRef, selectionGuardRef])
  const selectionDraftSuppressionDepthRef = useRef(0)
  // Temporarily mute draft snapshots while a stateful action intentionally reassigns the selection.
  const runWithSelectionDraftSuppressed = useCallback(<T,>(fn: () => T): T => {
    selectionDraftSuppressionDepthRef.current += 1
    try {
      return fn()
    } finally {
      selectionDraftSuppressionDepthRef.current -= 1
    }
  }, [])
  const { open: substatTargetsDialogOpen, openDialog: openSubstatTargetsDialog, closeDialog: closeSubstatTargetsDialog } = useSubstatTargetsDialog()
  const setBuilder = React.useCallback((next: React.SetStateAction<BuilderConfig>) => {
    setBuilderState(prev => {
      const resolved = typeof next === 'function'
        ? (next as (value: BuilderConfig) => BuilderConfig)(prev)
        : next
      builderRef.current = resolved
      return resolved
    })
  }, [])
  const { t, registerRuntimeCatalog } = useI18n()
  let requestDeleteSingleForSelection: (idx: number) => void = () => {}
  let requestDeleteMultiForSelection: (targets: number[]) => void = () => {}
  const requestDeleteSingleRef = useRef<(idx: number) => void>(() => {})
  const requestDeleteMultiRef = useRef<(targets: number[]) => void>(() => {})
  const describeNextChangeRef = React.useRef<DescribeNextChangeFn>(() => {})
  const visibleConfigIndicesRef = useRef<ReadonlySet<number> | null>(null)
  const {
    selectedCfgIndices,
    setSelectedCfgIndices,
    multiselectActive,
    selectionAnchor,
    prepareDragSelection,
    setHoveredCfgIdx,
    handleConfigHoverIdx,
    multiSelectedConfigs,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleConfigSelect,
    handleConfigDelete,
    handleConfigDuplicate,
    handleConfigMoveUp,
    handleConfigMoveDown,
    handleConfigMoveTop,
    handleConfigMoveBottom,
    handleConfigReorder,
    handleSelectAllConfigs,
    handleClearSelection,
    setSelectionAnchor,
  } = useConfigSelection({
    customCfgs,
    setCustomCfgs,
    selectedCfgIdx,
    setSelectedCfgIdx: setSelectedCfgIdxRaw,
    setBuilder,
    onWillChangeSelection: handleWillChangeSelection,
    describeNextChange: (descriptor, options) => describeNextChangeRef.current(descriptor, options),
    t,
    requestDeleteSingle: (idx) => { requestDeleteSingleForSelection(idx) },
    requestDeleteMulti: (targets) => { requestDeleteMultiForSelection(targets) },
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
    visibleConfigIndicesRef,
  })
  const [hoverDeleteConfigs, setHoverDeleteConfigs] = useState(false)
  const deleteAllDisabled = (!customCfgs.length) || (selectedCfgIndices.length > 1)
  const highlightDeleteConfigs = hoverDeleteConfigs && !deleteAllDisabled
  const editingConfigIndex = useMemo(() => (
    selectedCfgIndices.length === 1 ? selectedCfgIndices[0]! : null
  ), [selectedCfgIndices])
  const syncSelectedCfgIdx = useCallback((value: React.SetStateAction<number | null>, options?: { preserveSelection?: boolean; forceSync?: boolean; suppressDraft?: boolean }) => {
    autoApplyNowRef.current()
    const applySelectionChange = () => {
      const next = typeof value === 'function' ? value(selectedCfgIdx) : value
      const normalized = (typeof next === 'number' && Number.isInteger(next) && next >= 0) ? next : null
      setSelectedCfgIdxRaw(normalized)
      setSelectionAnchor(normalized)
      if (options?.preserveSelection) return
      if (!multiselectActive || options?.forceSync === true || normalized === null) {
        setSelectedCfgIndices(normalized === null ? [] : [normalized])
      }
    }
    if (options?.suppressDraft) {
      runWithSelectionDraftSuppressed(applySelectionChange)
    } else {
      applySelectionChange()
    }
  }, [autoApplyNowRef, multiselectActive, selectedCfgIdx, runWithSelectionDraftSuppressed, setSelectedCfgIdxRaw, setSelectedCfgIndices, setSelectionAnchor])
  // Track final sell state for history session aggregation outside the render path.
  const fsrRef = React.useRef(finalSellRemainder)
  // Mirror the latest final-sell remainder into a ref so history helpers can read it without forcing extra renders.
  useEffect(() => { fsrRef.current = finalSellRemainder }, [finalSellRemainder])
  const finalSellHistorySessionRef = useRef<'idle' | 'active'>('idle')
  const finalSellSessionBaselineRef = useRef<FinalSellRemainderConfig | null>(null)
  const finalSellSessionModeRef = useRef<FinalSellDescriptorMode | null>(null)
  const finalSellOpenRef = useRef(false)
  const noteHistorySessionRef = useRef<'idle' | 'active'>('idle')
  const noteSessionBaselineRef = useRef<string | null>(null)
  const noteSessionModeRef = useRef<NoteDescriptorMode | null>(null)
  const substatTargetsHistorySessionRef = useRef<'idle' | 'active'>('idle')
  const substatTargetsSessionBaselineRef = useRef<SubstatTargetTable | null>(null)
  const substatTargetsSessionModeRef = useRef<'edit' | 'reset' | 'import' | null>(null)
  // Reset substatTargets history snapshots when the dialog closes so future edits start from a clean baseline.
  useEffect(() => {
    if (!substatTargetsDialogOpen) {
      substatTargetsHistorySessionRef.current = 'idle'
      substatTargetsSessionBaselineRef.current = null
      substatTargetsSessionModeRef.current = null
    }
  }, [substatTargetsDialogOpen])
  const {
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    markSavedNow,
    markNextSnapshotAsSaved,
    describeNextChange,
    captureSnapshotNow,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  } = useHsfcHistoryController({
    customCfgs,
    metasets,
    substatTargets,
    finalSellRemainder,
    hsfcNote,
    selectedCfgIdx,
    selectedCfgIndices,
    selectionAnchor,
    builder,
    builderNameDraft: '',
    builderNameDraftKey: null,
    multiEditDraft: multiEditDraftState ?? null,
    setCustomCfgs,
    setMetasets,
    setSubstatTargets,
    setFinalSellRemainder,
    setHsfcNote,
    setSelectedCfgIdx: setSelectedCfgIdxRaw,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setBuilder,
    setBuilderNameDraft: () => {},
    setBuilderNameDraftKey: () => {},
    setMultiEditDraft: setMultiEditDraftState,
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
  })
  describeNextChangeRef.current = describeNextChange

  // Builder and dialog both call through here so history/undo sees a single
  // cohesive change. While the dialog is open we aggregate edits until the
  // user closes it, which keeps undo/redo focused on “edited targets” instead
  // of every keystroke.
  const applySubstatTargetsChange = useCallback((
    value: React.SetStateAction<SubstatTargetTable>,
    options?: { mode?: 'edit' | 'reset' | 'import'; publish?: boolean },
  ): HistoryEntryDescriptor | null => {
    const previous = substatTargets
    const next = typeof value === 'function'
      ? (value as (p: SubstatTargetTable) => SubstatTargetTable)(previous)
      : value
    if (areSubstatTargetTablesEqual(previous, next)) {
      if (!options?.publish && substatTargetsDialogOpen) {
        // Keep existing descriptor when coalescing inside the dialog.
      } else if (!substatTargetsDialogOpen) {
        describeNextChange(null)
      }
      return null
    }
    const mode = options?.mode ?? (isDefaultSubstatTargetTable(next) && !isDefaultSubstatTargetTable(previous) ? 'reset' : 'edit')
    const descriptor = describeSubstatTargetsChange({ previous, next, mode, t })
    setSubstatTargets(next)
    if (options?.publish === false) {
      substatTargetsHistorySessionRef.current = 'idle'
      substatTargetsSessionBaselineRef.current = null
      substatTargetsSessionModeRef.current = null
      return descriptor ?? null
    }
    const baseline = substatTargetsSessionBaselineRef.current ?? previous
    const aggregateMode = substatTargetsSessionModeRef.current ?? mode
    const aggregateDescriptor = (baseline && next)
      ? describeSubstatTargetsChange({ previous: baseline, next, mode: aggregateMode, t })
      : descriptor
    if (substatTargetsDialogOpen) {
      // Dialog sessions stash the first baseline so every intermediate edit
      // describes `baseline -> latest`, allowing the header preview + history
      // tooltip to reflect the full set of changes.
      if (substatTargetsHistorySessionRef.current === 'idle') {
        substatTargetsHistorySessionRef.current = 'active'
        substatTargetsSessionBaselineRef.current = baseline
        substatTargetsSessionModeRef.current = aggregateMode
        describeNextChange(aggregateDescriptor ?? null)
      } else {
        describeNextChange(aggregateDescriptor ?? null, { writeMode: 'replace' })
      }
    } else {
      substatTargetsHistorySessionRef.current = 'idle'
      substatTargetsSessionBaselineRef.current = null
      substatTargetsSessionModeRef.current = null
      describeNextChange(descriptor ?? null)
    }
    return descriptor ?? null
  }, [describeNextChange, substatTargets, substatTargetsDialogOpen, setSubstatTargets, t])
  const applyFinalSellChange = useCallback((
    value: React.SetStateAction<FinalSellRemainderConfig>,
    options?: { mode?: FinalSellDescriptorMode; publish?: boolean },
  ): HistoryEntryDescriptor | null => {
    const mode: FinalSellDescriptorMode = options?.mode ?? 'edit'
    const previousSnapshot = fsrRef.current
    const prevState = previousSnapshot
    const resolvedNextState = typeof value === 'function'
      ? (value as (p: FinalSellRemainderConfig) => FinalSellRemainderConfig)(prevState)
      : value
    const changed = !areFinalSellConfigsEqual(prevState, resolvedNextState)
    const descriptor = changed
      ? describeFinalSellChange({
        previous: prevState,
        next: resolvedNextState,
        t,
        mode,
      })
      : null
    if (!changed) {
      if (!finalSellOpenRef.current) {
        describeNextChange(null)
      }
      if (resolvedNextState !== prevState) {
        setFinalSellRemainder(resolvedNextState)
      }
      return null
    }
    setFinalSellRemainder(resolvedNextState)
    if (options?.publish === false) {
      finalSellHistorySessionRef.current = 'idle'
      finalSellSessionBaselineRef.current = null
      finalSellSessionModeRef.current = null
      return descriptor ?? null
    }
    const baseline = finalSellSessionBaselineRef.current ?? previousSnapshot
    const aggregateMode = finalSellSessionModeRef.current ?? mode
    const aggregateDescriptor = describeFinalSellChange({ previous: baseline, next: resolvedNextState, mode: aggregateMode, t })
    if (!aggregateDescriptor) {
      if (!finalSellOpenRef.current) {
        describeNextChange(descriptor ?? null)
      }
      return descriptor ?? null
    }
    if (finalSellOpenRef.current) {
      if (finalSellHistorySessionRef.current === 'idle') {
        finalSellHistorySessionRef.current = 'active'
        finalSellSessionBaselineRef.current = baseline
        finalSellSessionModeRef.current = aggregateMode
        describeNextChange(aggregateDescriptor ?? null)
      } else {
        describeNextChange(aggregateDescriptor ?? null, { writeMode: 'replace' })
      }
    } else {
      finalSellHistorySessionRef.current = 'idle'
      finalSellSessionBaselineRef.current = null
      finalSellSessionModeRef.current = null
      describeNextChange(descriptor ?? null)
    }
    return descriptor ?? null
  }, [describeNextChange, setFinalSellRemainder, t])
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
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error'>('success')
  const [toastIcon, setToastIcon] = useState<ReactNode>(<SaveIcon fontSize="inherit" />)
  const showToast = useCallback((message: string, options?: { severity?: 'success' | 'error'; icon?: ReactNode }) => {
    setToastMsg(message)
    setToastSeverity(options?.severity ?? 'success')
    setToastIcon(options?.icon ?? <SaveIcon fontSize="inherit" />)
    setToastOpen(true)
  }, [])
  const [fileFormatError, setFileFormatError] = useState<{ fileName?: string | null } | null>(null)
  const showFileFormatError = useCallback((fileName?: string | null) => {
    setFileFormatError({ fileName: fileName ?? null })
  }, [])
  const handleFileFormatErrorClose = useCallback(() => {
    setFileFormatError(null)
  }, [])
  const [gearDbCommandError, setGearDbCommandError] = useState<string | null>(null)
  const clearGearDbCommandError = useCallback(() => { setGearDbCommandError(null) }, [])
  const [gearDbCommandSuccess, setGearDbCommandSuccess] = useState<string | null>(null)
  const clearGearDbCommandSuccess = useCallback(() => { setGearDbCommandSuccess(null) }, [])
  const formatFileFormatErrorMessage = useCallback((fileName?: string | null) => {
    const trimmed = (fileName ?? '').trim()
    if (!trimmed) {
      return t('fileFormatErrorMessage', { fileName: t('fileFormatErrorUnknownName') })
    }
    const truncated = trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
    return t('fileFormatErrorMessage', { fileName: `“${truncated}”` })
  }, [t])
  const [previewMode, setPreviewMode] = useState<'rules' | 'tester'>(() => {
    if (typeof window === 'undefined') return 'rules'
    try {
      const stored = localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)
      return stored === 'tester' ? 'tester' : 'rules'
    } catch {
      return 'rules'
    }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, previewMode)
    } catch {}
  }, [previewMode])
  const [gearImportBusy, setGearImportBusy] = useState(false)
  // Determine once whether to auto-open the README on this version.
  // Rule Tester dialog state
  const [testerOpen, setTesterOpen] = useState<boolean>(false)
  // External focus target for preview table (exact rule index in the effective rules array)
  const [focusRuleIndex, setFocusRuleIndex] = useState<number | null>(null)
  const [finalSellOpen, setFinalSellOpen] = useState<boolean>(false)
  const flushTransientUi = useCallback(() => {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } catch {}
  }, [])
  finalSellOpenRef.current = finalSellOpen
  if (!finalSellOpen) {
    finalSellHistorySessionRef.current = 'idle'
    finalSellSessionBaselineRef.current = null
    finalSellSessionModeRef.current = null
  }
  // View-only rules filter state
  const [filterOpenPref, setFilterOpenPref] = useRulesFilterOpenPreference()
  const [rulesFilterPref, setRulesFilterPref] = useRulesFilterStatePreference()
  const [filterCollapsedPref, setFilterCollapsedPref] = useRulesFilterCollapsedPreference()
  const filterOpen = filterOpenPref
  const setFilterOpen = setFilterOpenPref
  const rulesFilter = rulesFilterPref
  const testerRulesFilter = useMemo(() => normalizeRulesFilterForTester(rulesFilter), [rulesFilter])
  const setRulesFilter = setRulesFilterPref
  const filterCollapsed = filterCollapsedPref
  const setFilterCollapsed = setFilterCollapsedPref
  const [limitConfigsToFiltered, setLimitConfigsToFiltered] = useState<boolean>(true)
  const [testerConfigFilterMode, setTesterConfigFilterMode] = useState<TesterConfigFilterMode>('off')
  useEffect(() => {
    if (customCfgs.length === 0 && !limitConfigsToFiltered) {
      setLimitConfigsToFiltered(true)
    }
  }, [customCfgs.length, limitConfigsToFiltered])
  const rulesFilterPanelRef = useRef<RulesFilterPanelHandle | null>(null)
  const filterShortcutPendingFocusRef = useRef(false)

  useEffect(() => {
    if (!filterOpen || !filterShortcutPendingFocusRef.current) return
    filterShortcutPendingFocusRef.current = false
    rulesFilterPanelRef.current?.focusConfigNameInput()
  }, [filterOpen])

  useEffect(() => {
    const shouldIgnoreShortcutTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true
      if (target instanceof HTMLElement && target.isContentEditable) return true
      if (target.closest('[role="dialog"][aria-modal="true"]')) return true
      return false
    }

    const onKeydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.repeat) return
      const key = event.key?.toLowerCase?.()
      if (key !== 'f') return
      if (event.altKey || event.shiftKey) return
      if (!event.metaKey && !event.ctrlKey) return
      if (shouldIgnoreShortcutTarget(event.target)) return
      if (typeof document !== 'undefined') {
        const activeEl = document.activeElement
        if (shouldIgnoreShortcutTarget(activeEl)) return
      }
      event.preventDefault()
      if (filterOpen) {
        rulesFilterPanelRef.current?.focusConfigNameInput()
        return
      }
      filterShortcutPendingFocusRef.current = true
      setFilterOpen(true)
    }

    window.addEventListener('keydown', onKeydown, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeydown, true as unknown as undefined)
    }
  }, [filterOpen, setFilterOpen])

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

  const handleConfirmClearAll = useCallback(() => {
    const descriptor = describeConfigsCleared({ previousCount: customCfgs.length, t })
    describeNextChange(descriptor)
    setCustomCfgs([])
    syncSelectedCfgIdx(null, { forceSync: true, suppressDraft: true })
    markNextSnapshotAsSaved()
    exportBaselineResetRef.current = true
  }, [customCfgs.length, describeNextChange, markNextSnapshotAsSaved, setCustomCfgs, syncSelectedCfgIdx, t])
  const handleConfirmDeleteSingle = useCallback((idx: number) => {
    setCustomCfgs(prev => {
      if (idx < 0 || idx >= prev.length) {
        describeNextChange(null)
        return prev
      }
      const descriptor = describeConfigsDeleted({
        removed: [{ index: idx, cfg: prev[idx] }],
        t,
        metasets,
      })
      describeNextChange(descriptor)
      return prev.filter((_, i) => i !== idx)
    })
    syncSelectedCfgIdx((sel) => {
      if (sel === null) return sel
      if (sel === idx) return null
      if (sel > idx) return sel - 1
      return sel
    }, { suppressDraft: true })
  }, [describeNextChange, metasets, setCustomCfgs, syncSelectedCfgIdx, t])
  const handleDeleteMultiConfirmed = useCallback((targetsParam: number[] | null) => {
    // Use the snapshot captured when opening the dialog so confirmation matches the displayed list.
    const source = Array.isArray(targetsParam) && targetsParam.length > 0
      ? targetsParam
      : selectedCfgIndices
    if (!source.length) return
    const uniqueTargets = Array.from(new Set(source.filter((idx) => Number.isInteger(idx) && idx >= 0))).sort((a, b) => a - b)
    if (!uniqueTargets.length) return
    const deleteSet = new Set(uniqueTargets)
    setCustomCfgs(prev => {
      if (deleteSet.size === 0) {
        describeNextChange(null)
        return prev
      }
      const removed = uniqueTargets.map((idx) => ({ index: idx, cfg: prev[idx] }))
      const descriptor = describeConfigsDeleted({ removed, t, metasets })
      describeNextChange(descriptor)
      return prev.filter((_, i) => !deleteSet.has(i))
    })
    syncSelectedCfgIdx(null, { forceSync: true, suppressDraft: true })
  }, [describeNextChange, metasets, selectedCfgIndices, setCustomCfgs, syncSelectedCfgIdx, t])
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
  requestDeleteSingleRef.current = requestDeleteSingle
  requestDeleteMultiRef.current = requestDeleteMulti
  const [confirmClearHistoryOpen, setConfirmClearHistoryOpen] = useState(false)
  const requestClearHistory = useCallback(() => {
    setConfirmClearHistoryOpen(true)
  }, [])
  const handleConfirmClearHistory = useCallback(() => {
    clearHistory()
    describeNextChange(null)
    setConfirmClearHistoryOpen(false)
  }, [clearHistory, describeNextChange])
  const pushExportEndpoint = pushEndpointReachable && pushEndpoint ? pushEndpoint : undefined

  const handleCloseNote = useCallback(() => {
    noteHistorySessionRef.current = 'idle'
    noteSessionBaselineRef.current = null
    noteSessionModeRef.current = null
    closeNote()
  }, [closeNote])

  const applyNoteChange = useCallback((
    value: React.SetStateAction<string | null>,
    options?: { mode?: NoteDescriptorMode; publish?: boolean },
  ): HistoryEntryDescriptor | null => {
    const mode = options?.mode ?? 'edit'
    const prevRaw = hsfcNote ?? null
    const nextRaw = typeof value === 'function'
      ? (value as (prev: string | null) => string | null)(prevRaw)
      : value
    const prevNormalized = normalizeNoteValue(prevRaw)
    const nextNormalized = normalizeNoteValue(nextRaw)
    const changed = prevNormalized !== nextNormalized
    if (!changed) {
      if (options?.publish !== false) {
        if (!noteOpen || noteMode !== 'edit') {
          describeNextChange(null)
        } else if (noteHistorySessionRef.current === 'idle') {
          noteSessionBaselineRef.current = prevNormalized ?? null
        }
      } else {
        noteHistorySessionRef.current = 'idle'
        noteSessionBaselineRef.current = null
        noteSessionModeRef.current = null
      }
      setHsfcNote(() => nextNormalized)
      return null
    }
    setHsfcNote(() => nextNormalized)
    const descriptor = describeNoteChange({
      previous: prevNormalized,
      next: nextNormalized,
      mode,
      t,
    })
    if (options?.publish === false) {
      noteHistorySessionRef.current = 'idle'
      noteSessionBaselineRef.current = null
      noteSessionModeRef.current = null
      return descriptor
    }
    const baseline = noteSessionBaselineRef.current ?? prevNormalized ?? null
    const aggregateMode = noteSessionModeRef.current ?? mode
    const aggregateDescriptor = describeNoteChange({
      previous: baseline,
      next: nextNormalized ?? null,
      mode: aggregateMode,
      t,
    })
    const inDialogEdit = noteOpen && noteMode === 'edit'
    if (inDialogEdit) {
      if (noteHistorySessionRef.current === 'idle') {
        noteHistorySessionRef.current = 'active'
        noteSessionBaselineRef.current = baseline
        noteSessionModeRef.current = aggregateMode
        describeNextChange(aggregateDescriptor ?? descriptor)
      } else {
        describeNextChange(aggregateDescriptor ?? descriptor, { writeMode: 'replace' })
      }
    } else {
      noteHistorySessionRef.current = 'idle'
      noteSessionBaselineRef.current = null
      noteSessionModeRef.current = null
      describeNextChange(aggregateDescriptor ?? descriptor)
    }
    return aggregateDescriptor ?? descriptor
  }, [describeNextChange, hsfcNote, noteMode, noteOpen, setHsfcNote, t])

  const tutorial = useTutorialCoachState({
    hsf,
    setHsf,
    customCfgs,
    setCustomCfgs,
    selectedCfgIdx,
    setSelectedCfgIdx: syncSelectedCfgIdx,
    metasets,
    setMetasets,
    substatTargets,
    setSubstatTargets,
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

  // Compute a stable key for configs that affects HSF rule generation (ignores display-only fields like `name`).
  // Why: Changing the config name should not cause a refresh of the Sellfile Preview table.
  const configRuleFingerprints = configRulesState.keys
  const ruleSubstatTargetsKey = configRulesState.substatTargetsKey

  const rulesByConfig = configRulesState.rulesByConfig
  const configRuleCounts = configRulesState.countsByConfig
  const mergedRules = configRulesState.mergedRules
  const truncatedConfigIndices = configRulesState.truncatedConfigIndices
  const totalLimitHit = configRulesState.totalLimitHit
  const limitExceeded = totalLimitHit || truncatedConfigIndices.length > 0
  const configsExcludedByTotalLimit = useMemo(() => new Set<number>(configRulesState.excludedByTotalLimitIndices), [configRulesState.excludedByTotalLimitIndices])

  const selectedIsDirty = useMemo(() => {
    if (selectedCfgIdx === null) return false
    const target = customCfgs[selectedCfgIdx]
    if (!target) return false
    return hasConfigMeaningfulDifferences(builder, target, ruleSubstatTargetsKey)
  }, [builder, customCfgs, ruleSubstatTargetsKey, selectedCfgIdx])

  const builderUiDirty = multiselectActive && multiEditDraftState
    ? getDirtyBuilderFieldKeys(multiEditDraftState.fields).length > 0
    : selectedIsDirty

  const computeDraftHistoryDescriptor = useCallback((): HistoryEntryDescriptor => {
    if (multiselectActive && selectedCfgIndices.length > 1) {
      const labels = selectedCfgIndices
        .map((idx) => {
          const cfg = customCfgs[idx]
          return cfg ? buildConfigLabel(idx, cfg, t) : t('historyConfigLabel', { n: idx + 1 })
        })
      const title = t('historyDraftMultiTitle', { count: labels.length })
      if (labels.length === 0) return { title }
      const detailLines = labels.length <= 4
        ? labels
        : [...labels.slice(0, 4), t('historyConfigsMoreLine', { count: labels.length - 4 })]
      return detailLines.length > 0 ? { title, detailLines } : { title }
    }
    if (editingConfigIndex !== null && editingConfigIndex >= 0 && editingConfigIndex < customCfgs.length) {
      const cfg = customCfgs[editingConfigIndex]
      if (cfg) {
        const configNumber = editingConfigIndex + 1
        const rawName = (cfg.name ?? '').trim()
        const label = rawName ? `#${configNumber} - "${rawName}"` : `#${configNumber}`
        return { title: t('historyDraftConfigTitle', { label }) }
      }
    }
    return { title: t('historyDraftBuilderTitle') }
  }, [customCfgs, editingConfigIndex, multiselectActive, selectedCfgIndices, t])

  selectionGuardRef.current = (_prevSelection, _nextSelection) => {
    if (!builderUiDirty) return
    // Skip draft snapshots when the caller signalled that a config-changing action already captured intent.
    if (selectionDraftSuppressionDepthRef.current > 0) return
    if (captureSnapshotNow) {
      const descriptor = computeDraftHistoryDescriptor()
      captureSnapshotNow(descriptor)
    }
  }

  const [dedupeDefault, setDedupeDefault] = useSellfileDedupPreference()
  const [omitDisabledForExport, setOmitDisabledForExport] = useSellfileOmitDisabledPreference()
  const exportRules = useMemo(
    () => (omitDisabledForExport ? mergedRules.filter((rule) => rule?.Use !== false) : mergedRules),
    [mergedRules, omitDisabledForExport],
  )
  const hsfExportPayload = useMemo(() => buildHsfFileFromMerged(exportRules), [exportRules])
  const hsfExportPayloadDeduped = useMemo(() => buildDedupedHsfFileFromMerged(exportRules), [exportRules])
  const activeExportPayload = useMemo(
    () => (dedupeDefault ? hsfExportPayloadDeduped : hsfExportPayload),
    [dedupeDefault, hsfExportPayload, hsfExportPayloadDeduped],
  )
  const hsfExportSig = useMemo(() => {
    try {
      return JSON.stringify(activeExportPayload)
    } catch {
      return ''
    }
  }, [activeExportPayload])
  const [lastExportSig, setLastExportSig] = useState<string | null>(null)
  // Establish the export signature baseline after resets or first render to track unsaved changes.
  useEffect(() => {
    if (exportBaselineResetRef.current || lastExportSig === null) {
      setLastExportSig(hsfExportSig)
      exportBaselineResetRef.current = false
    }
  }, [hsfExportSig, lastExportSig])
  const hsfDirty = useMemo(() => lastExportSig !== null && hsfExportSig !== lastExportSig, [hsfExportSig, lastExportSig])
  const handleExportDeduped = useCallback(() => {
    if (!exportRules.length) return
    try {
      const blob = hsfToBlob(hsfExportPayloadDeduped)
      const filename = `Sellfile_deduped_${buildTimestamp()}.hsf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setLastExportSig(hsfExportSig)
      showToast(t('toastSellfileSaved'))
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to export deduped sellfile', err)
      }
    }
  }, [exportRules.length, hsfExportPayloadDeduped, hsfExportSig, setLastExportSig, showToast, t])
  const handleSetDedupeDefault = useCallback((next: boolean) => {
    setDedupeDefault(Boolean(next))
  }, [setDedupeDefault])
  const handleSetOmitDisabled = useCallback((next: boolean) => {
    setOmitDisabledForExport(Boolean(next))
  }, [setOmitDisabledForExport])

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
        const { __cfgIdx: _omitCfgIdx, __lineIdx: _omitLineIdx, __allKnownSets: _omitAllKnownSets, __source: _omitSource, ...rest } = rule as HsfRuleWithCfg & { __allKnownSets?: boolean }
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
    substatTargets,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: selectedCfgIdx,
    note: hsfcNote,
    filters: {
      open: filterOpen,
      state: rulesFilter,
      collapsed: filterCollapsed,
      testerConfigFilterMode,
    },
  })
  const currentMetasetSignature = useMemo(() => metasetsSignature(metasets), [metasets])
  const currentTargetsSignature = useMemo(() => substatTargetsSignature(substatTargets), [substatTargets])
  const restoreMetasetsDiffer = useMemo(() => {
    if (!restoreDraft?.Metasets) return false
    return metasetsSignature(restoreDraft.Metasets) !== currentMetasetSignature
  }, [restoreDraft, currentMetasetSignature])
  const restoreTargetsDiffer = useMemo(() => {
    if (!restoreDraft?.substatTargets) return false
    return substatTargetsSignature(restoreDraft.substatTargets) !== currentTargetsSignature
  }, [restoreDraft, currentTargetsSignature])
  const restoreFiltersDiffer = Boolean(restoreDraft?.Filters)
  const filtersResetRef = useRef(false)
  useLayoutEffect(() => {
    if (!restoreDialogPending || !restoreDraft?.Filters || !restoreFiltersDiffer) return
    if (filtersResetRef.current) return
    filtersResetRef.current = true
    setFilterOpenPref(false)
    setRulesFilterPref(cloneDefaultRulesFilterState())
    setFilterCollapsedPref(cloneDefaultRulesFilterCollapsed())
    setTesterConfigFilterMode('off')
  }, [restoreDialogPending, restoreDraft, restoreFiltersDiffer, setFilterOpenPref, setRulesFilterPref, setFilterCollapsedPref, setTesterConfigFilterMode])
  useEffect(() => {
    if (!restoreDialogPending) filtersResetRef.current = false
  }, [restoreDialogPending])
  // Show the autosave restore prompt only after the README dialog is dismissed.
  const restoreDlgOpen = !tutorial.helpOpen && (restoreDialogPending || Boolean(testerRestoreDraft))
  const appendTesterRuleItems = useCallback((items: TestItem[]) => {
    if (!items || items.length === 0) return
    setTesterItems((prev) => {
      if (items.length === 0) return prev
      const next = prev.slice()
      for (const addition of items) {
        const assignedRowId = allocTesterRowId()
        next.push({ ...(addition as RuleTesterItem), rowId: assignedRowId })
      }
      return next
    })
  }, [allocTesterRowId, setTesterItems])

  const applyGearDbDiff = useCallback((desiredTesterItems: TestItem[], mode: 'manual' | 'command') => {
    const pendingQueueInput = (mode === 'manual') ? [] : pendingTesterItemsRef.current
    const { removalRowIds, nextPendingQueue, additions } = diffRuleTesterItems(
      testerItemsRef.current,
      desiredTesterItems,
      pendingQueueInput,
      { retainManualItems: true },
    )
    const removedCount = removalRowIds.length
    if (removalRowIds.length > 0) {
      const removalSet = new Set(removalRowIds)
      setTesterItems((prev) => prev.filter((item) => !removalSet.has(item.rowId)))
    }
    if (mode === 'manual') {
      setPendingTesterItems([])
      appendTesterRuleItems(additions)
      return { removedCount, addedCount: additions.length }
    }
    if (nextPendingQueue !== pendingTesterItemsRef.current) {
      setPendingTesterItems(nextPendingQueue)
    }
    return { removedCount, addedCount: additions.length }
  }, [appendTesterRuleItems, setPendingTesterItems])

  const handleGearDbImport = useCallback(async (file: File, options?: { source?: 'manual' | 'command' }) => {
    const source = options?.source ?? 'manual'
    if (gearImportBusy) return
    if (tutorial.helpOpen) {
      tutorial.setHelpOpen(false)
      tutorial.setHelpFirstRunMode(false)
      try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
    }
    if (restoreDialogPending) dismissRestore()
    if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
    flushTransientUi()
    if (source === 'command') {
      setGearDbCommandError(null)
      setGearDbCommandSuccess(null)
    }
    setGearImportBusy(true)
    try {
      const { artifacts, inboxArtifacts } = await importGearDatabaseFromFile(file)
      const combined = [...artifacts, ...inboxArtifacts]
      if (combined.length === 0) {
        if (source === 'command') {
          setGearDbCommandError(t('toastGearDbImportEmpty'))
        } else {
          showToast(t('toastGearDbImportEmpty'), { severity: 'error', icon: <ErrorOutlineIcon fontSize="inherit" /> })
        }
        return
      }
      setPreviewMode('tester')
      const desiredTesterItems = combined.map((artifact) => artifact.testerItem)
      const { removedCount, addedCount } = applyGearDbDiff(desiredTesterItems, source)
      const inboxCount = inboxArtifacts.length
      const totalCount = combined.length
      const diffSummary = t('toastGearDbDiffSummary', { added: addedCount, removed: removedCount })
      const message = inboxCount > 0
        ? `${t('toastGearDbImportedWithInbox', { count: totalCount, inboxCount })} ${diffSummary}`
        : `${t('toastGearDbImported', { count: totalCount })} ${diffSummary}`
      if (source === 'command') {
        setGearDbCommandError(null)
        setGearDbCommandSuccess(message)
      } else {
        showToast(message, { icon: <StorageIcon fontSize="inherit" /> })
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to import gear database', err)
      }
      if (source === 'command') {
        setGearDbCommandError(formatFileFormatErrorMessage(file.name))
        setGearDbCommandSuccess(null)
      } else {
        showFileFormatError(file.name)
      }
    } finally {
      setGearImportBusy(false)
    }
  }, [
    gearImportBusy,
    tutorial,
    restoreDialogPending,
    dismissRestore,
    confirmClearOpen,
    confirmDeleteIdx,
    confirmDeleteTargets,
    flushTransientUi,
    showToast,
    showFileFormatError,
    t,
    formatFileFormatErrorMessage,
    setGearDbCommandError,
    setGearDbCommandSuccess,
    applyGearDbDiff,
  ])

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
      await importHsfcFile(file)
    },
    onHsf: async (file: File) => {
      flushTransientUi()
      // Ignore drops while confirmation dialogs are open
      if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
      try {
        const parsed = await readHsfFile(file)
        setHsf(parsed)
        exportBaselineResetRef.current = true
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('Failed to parse .hsf file', err)
        }
        showFileFormatError(file.name)
      } finally {
        flushTransientUi()
      }
    },
    onL10n: async (file: File) => {
      // Allow testing of localization files by drag & drop
      await handleRuntimeCatalog(file)
    },
    onGearDb: handleGearDbImport,
    onUnknownFile: async (file: File) => {
      showFileFormatError(file.name)
    },
  })

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
    substatTargets,
    customCfgs,
    hsfcNote,
    finalSellRemainder,
    selectedCfgIdx,
    selectedCfgIndices,
    describeNextChange,
    t,
    setCustomCfgs,
    setMetasets,
    applySubstatTargetsChange,
    applyFinalSellChange,
    applyNoteChange,
    setSelectedCfgIdx: syncSelectedCfgIdx,
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

  const handleDeleteSelected = useCallback(() => {
    if (!selectedCfgIndices.length) return
    if (selectedCfgIndices.length === 1) {
      requestDeleteSingleRef.current(selectedCfgIndices[0]!)
    } else {
      requestDeleteMultiRef.current(selectedCfgIndices.slice())
    }
  }, [selectedCfgIndices])

  const handleRulesTableSelectCfgIdx = useCallback((idx: number) => {
    syncSelectedCfgIdx((prev) => (idx >= 0 && idx < customCfgs.length ? idx : prev), { forceSync: true })
    if (idx < 0 || idx >= customCfgs.length) return
    const cfg = customCfgs[idx]
    if (!cfg) return
    setBuilder(cfg)
  }, [customCfgs, setBuilder, syncSelectedCfgIdx])

  const handleRulesTableConfigAction = useCallback(async (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => {
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
      syncSelectedCfgIdx((sel) => {
        if (sel === null) return sel
        if (sel === idx) return null
        if (sel > idx) return sel - 1
        return sel
      }, { suppressDraft: true })
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
        const current = arr[idx]
        if (!current) return prev
        arr.splice(idx, 1)
        arr.unshift(current)
        syncSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel)), { suppressDraft: true })
        return arr
      })
      return
    }
    if (action === 'move_bottom') {
      setCustomCfgs(prev => {
        if (idx === prev.length - 1) return prev
        const arr = [...prev]
        const current = arr[idx]
        if (!current) return prev
        arr.splice(idx, 1)
        arr.push(current)
        syncSelectedCfgIdx((sel) => sel === null ? sel : (sel === idx ? arr.length - 1 : (sel > idx ? sel : sel)), { suppressDraft: true })
        return arr
      })
      return
    }
    if (action === 'move_up') {
      setCustomCfgs(prev => {
        if (idx === 0) return prev
        const arr = [...prev]
        if (!arr[idx - 1] || !arr[idx]) return prev
        const tmp = arr[idx - 1]!
        arr[idx - 1] = arr[idx]!
        arr[idx] = tmp
        syncSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel, { suppressDraft: true })
        return arr
      })
      return
    }
    if (action === 'move_down') {
      setCustomCfgs(prev => {
        if (idx === prev.length - 1) return prev
        const arr = [...prev]
        if (!arr[idx + 1] || !arr[idx]) return prev
        const tmp = arr[idx + 1]!
        arr[idx + 1] = arr[idx]!
        arr[idx] = tmp
        syncSelectedCfgIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel, { suppressDraft: true })
        return arr
      })
      return
    }
  }, [customCfgs, insertIndexAfter, metasets, pasteAfterIndex, setCopyDlgOpen, setCopyText, setCustomCfgs, syncSelectedCfgIdx])

  const handleRulesTableClearBase = useCallback(() => { setHsf(null) }, [setHsf])
  const handleRulesTableConfigureFinalSell = useCallback(() => { setFinalSellOpen(true) }, [setFinalSellOpen])


  // Build autosave payload and write via useAutosave (enabled after restore choice)
  // Autosave should not be triggered by selection-only changes.
  // Pass selectedConfigIndex: null in autosave payload so selection changes
  // do not alter the payload. Explicit Save/Copy flows still include it.
  const autosavePayload = useMemo(() => {
    const base = buildHsfcPayload({
      version: APP_VERSION,
      metasets,
      substatTargets,
      configs: customCfgs,
      finalSellRemainder,
      selectedConfigIndex: null,
      ...(hsfcNote && hsfcNote.trim() ? { note: hsfcNote } : {}),
    })
    const filtersPayload = {
      open: filterOpen,
      state: rulesFilter,
      collapsed: filterCollapsed,
      testerConfigFilterMode,
    }
    return { ...base, AutosaveSavedAt: new Date().toISOString(), Filters: filtersPayload }
  }, [metasets, substatTargets, customCfgs, finalSellRemainder, hsfcNote, filterOpen, rulesFilter, filterCollapsed, testerConfigFilterMode])
  useAutosave({ key: AUTOSAVE_KEY, payload: autosavePayload, enabled: autosaveEnabled && !tutorial.tutorialOpen && !autosaveSilencedByClear })
  const testerAutosavePayload = useMemo(() => buildRuleTesterAutosavePayload(testerItems), [testerItems])
  const testerAutosavePayloadSignature = `${testerAutosavePayload.ItemsCompressed ?? ''}#${testerAutosavePayload.ItemCount ?? 0}`
  if (testerAutosaveBaselineRef.current === null) {
    testerAutosaveBaselineRef.current = testerAutosavePayloadSignature
  }
  const testerAutosaveEnabled = testerOpen || testerAutosaveBaselineRef.current !== testerAutosavePayloadSignature
  useAutosave({
    key: AUTOSAVE_TESTER_KEY,
    payload: testerAutosavePayload,
    enabled: testerAutosaveEnabled,
  })
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
  const configModes = useMemo(() => customCfgs.map((cfg) => cfg.exportMode), [customCfgs])
  const filterResult = useMemo<FilterHsfRulesResult<HsfRuleWithCfg>>(() => (
    filterHsfRules(mergedRules, rulesFilter, metasets, { configNames, configModes })
  ), [mergedRules, rulesFilter, metasets, configNames, configModes])
  const filteredRules = filterResult.rules
  useEffect(() => {
    const artifacts = testerPreviewArtifacts
    const names = customCfgs.map(cfg => (cfg?.name && cfg.name.length > 0) ? cfg.name : null)
    const namesSignature = names.map((name) => name ?? '').join('\u0001')
    const prevMatchDeps = testerPreviewMatchDepsRef.current
    const forceRebuildAllRows = prevMatchDeps.rules !== mergedRules
      || prevMatchDeps.namesSignature !== namesSignature
    const prevRowMap = testerPreviewRowMapRef.current
    const nextRowMap = new Map(prevRowMap)
    const seenRowIds = new Set<number>()
    let dirtyEntries: Array<{ artifact: NormalizedGearArtifact; rowId: number }> = []

    artifacts.forEach((artifact) => {
      const rowId = Number((artifact.testerItem as RuleTesterItem | undefined)?.rowId ?? NaN)
      if (!Number.isFinite(rowId)) return
      seenRowIds.add(rowId)
      const prevRow = prevRowMap.get(rowId)
      if (!prevRow || prevRow.artifact !== artifact) {
        dirtyEntries.push({ artifact, rowId })
      }
    })

    for (const [rowId] of prevRowMap) {
      if (!seenRowIds.has(rowId)) {
        nextRowMap.delete(rowId)
      }
    }

    if (forceRebuildAllRows) {
      dirtyEntries = []
      artifacts.forEach((artifact) => {
        const rowId = Number((artifact.testerItem as RuleTesterItem | undefined)?.rowId ?? NaN)
        if (!Number.isFinite(rowId)) return
        dirtyEntries.push({ artifact, rowId })
      })
    }

    if (dirtyEntries.length === 0 && nextRowMap.size === prevRowMap.size) {
      testerPreviewMatchDepsRef.current = { rules: mergedRules, namesSignature }
      setTesterRowsBuilding(false)
      return
    }

    const buildId = testerRowsBuildIdRef.current + 1
    testerRowsBuildIdRef.current = buildId
    if (dirtyEntries.length === 0) {
      testerPreviewMatchDepsRef.current = { rules: mergedRules, namesSignature }
      testerPreviewRowMapRef.current = nextRowMap
      setTesterPreviewRows(sortTesterRows(Array.from(nextRowMap.values())))
      setTesterRowsBuilding(false)
      return
    }

    testerPreviewMatchDepsRef.current = { rules: mergedRules, namesSignature }
    setTesterRowsBuilding(true)
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const hasRules = mergedRules.length > 0
    let index = 0

    const buildRow = hasRules
      ? (artifact: NormalizedGearArtifact): TesterPreviewRow => {
          const { firstMatch, matchingConfigIndices } = evaluateMatchesByConfig(
            mergedRules,
            artifact.testerItem,
            { configModes },
          )
          if (!firstMatch) {
            return { artifact, match: null, matchingCfgIndices: matchingConfigIndices }
          }
          const rule = mergedRules[firstMatch.ruleIndex]
          const cfgIdx = firstMatch.cfgIdx
          const cfgName = (cfgIdx != null && cfgIdx >= 0) ? (names[cfgIdx] ?? null) : null
          return {
            artifact,
            match: {
              keep: firstMatch.keep,
              cfgIdx: cfgIdx ?? null,
              cfgName: cfgName && cfgName.length > 0 ? cfgName : null,
              ruleIndex: firstMatch.ruleIndex,
              ruleLabel: null,
              ruleSource: rule?.__source ?? null,
            },
            matchingCfgIndices: matchingConfigIndices,
          }
        }
      : (artifact: NormalizedGearArtifact): TesterPreviewRow => ({
          artifact,
          match: null,
          matchingCfgIndices: [],
        })

    const processChunk = () => {
      if (cancelled || testerRowsBuildIdRef.current !== buildId) return
      const start = index
      const end = Math.min(start + TESTER_PREVIEW_CHUNK_SIZE, dirtyEntries.length)
      for (let cursor = start; cursor < end; cursor += 1) {
        const entry = dirtyEntries[cursor]
        if (!entry) continue
        nextRowMap.set(entry.rowId, buildRow(entry.artifact))
      }
      index = end
      if (index < dirtyEntries.length) {
        timeoutId = setTimeout(processChunk, 0)
        return
      }
      testerPreviewRowMapRef.current = nextRowMap
      setTesterPreviewRows(sortTesterRows(Array.from(nextRowMap.values())))
      if (testerRowsBuildIdRef.current === buildId) {
        setTesterRowsBuilding(false)
      }
    }

    processChunk()
    return () => {
      cancelled = true
      if (timeoutId !== null) clearTimeout(timeoutId)
      if (testerRowsBuildIdRef.current === buildId) {
        setTesterRowsBuilding(false)
      }
    }
  }, [testerPreviewArtifacts, mergedRules, customCfgs, configModes])
  const testerFilterResult = useMemo(() => (
    filterTesterItems(testerPreviewRows, testerRulesFilter, metasets, { configNames })
  ), [testerPreviewRows, testerRulesFilter, metasets, configNames])
  const testerRowsAfterRulesFilter = testerFilterResult.items
  const testerChampionOptions = useMemo<TesterChampionOption[]>(() => {
    const map = new Map<number, TesterChampionOption>()
    for (const row of testerPreviewRows) {
      const championId = Number(row.artifact.equippedToChampionId ?? NaN)
      if (!Number.isFinite(championId) || championId <= 0) continue
      const trimmedName = row.artifact.equippedChampionName?.trim() || null
      const location = row.artifact.equippedChampionLocation ?? null
      const entry = map.get(championId)
      if (entry) {
        entry.count += 1
        if (!entry.name && trimmedName) entry.name = trimmedName
        if (!entry.location && location) entry.location = location
      } else {
        map.set(championId, {
          id: championId,
          name: trimmedName,
          location,
          count: 1,
        })
      }
    }
    const sorted = Array.from(map.values())
    sorted.sort((a, b) => {
      const nameA = a.name?.toLocaleLowerCase() ?? ''
      const nameB = b.name?.toLocaleLowerCase() ?? ''
      if (nameA && nameB) return nameA.localeCompare(nameB)
      if (nameA) return -1
      if (nameB) return 1
      return a.id - b.id
    })
    return sorted
  }, [testerPreviewRows])
  const testerConfigFilterActive = testerConfigFilterMode !== 'off' && selectedCfgIndices.length > 0
  const testerConfigFilterSelectedSet = useMemo<Set<number> | null>(() => {
    if (!testerConfigFilterActive) return null
    if (!selectedCfgIndices.length) return null
    return new Set(selectedCfgIndices)
  }, [testerConfigFilterActive, selectedCfgIndices])
  const testerRowsForTable = useMemo(() => {
    let rows: TesterPreviewRow[] = testerRowsAfterRulesFilter
    if (testerConfigFilterSelectedSet && testerConfigFilterSelectedSet.size > 0) {
      if (testerConfigFilterMode === 'first') {
        rows = testerRowsAfterRulesFilter.filter((row) => {
          const cfgIdx = row.match?.cfgIdx
          return cfgIdx != null && testerConfigFilterSelectedSet.has(cfgIdx)
        })
      } else {
        rows = testerRowsAfterRulesFilter.filter((row) => {
          const matches = row.matchingCfgIndices ?? []
          for (const cfgIdx of matches) {
            if (testerConfigFilterSelectedSet.has(cfgIdx)) return true
          }
          return false
        })
      }
    }
    return sortTesterRows(rows)
  }, [testerConfigFilterMode, testerConfigFilterSelectedSet, testerRowsAfterRulesFilter])
  const testerBuilding = testerRowsBuilding
  const matchingConfigIndices = filterResult.matchingConfigIndices
  const testerMatchingConfigIndices = testerFilterResult.matchingConfigIndices
  const chipMatchingConfigIndices = previewMode === 'tester'
    ? testerMatchingConfigIndices
    : matchingConfigIndices
  const filterActive = isRulesFilterActive(rulesFilter)
  const testerFilterActive = isRulesFilterActive(testerRulesFilter, { includeTesterRange: true })
  const previewFilterActive = previewMode === 'tester'
    ? (testerFilterActive || testerConfigFilterActive)
    : (filterActive || testerConfigFilterActive)
  const hsfRulesForTable = useMemo(() => {
    const baseRules = filterActive ? filteredRules : mergedRules
    if (!testerConfigFilterSelectedSet || testerConfigFilterSelectedSet.size === 0) return baseRules
    return baseRules.filter((rule) => {
      const cfgIdx = (rule as HsfRuleWithCfg).__cfgIdx
      return typeof cfgIdx === 'number' && testerConfigFilterSelectedSet.has(cfgIdx)
    })
  }, [filterActive, filteredRules, mergedRules, testerConfigFilterSelectedSet])
  const hsfTableEmptyDueToFilters = (filterActive || testerConfigFilterActive) && mergedRules.length > 0 && hsfRulesForTable.length === 0
  const handleTesterRuleView = useCallback((ruleIndex: number, cfgIdx: number | null) => {
    setTesterOpen(false)
    const hasValidConfig = cfgIdx != null && cfgIdx >= 0 && cfgIdx < customCfgs.length
    if (hasValidConfig) {
      const targetCfgIdx = Number(cfgIdx)
      syncSelectedCfgIdx(targetCfgIdx, { forceSync: true })
      const cfg = customCfgs[targetCfgIdx]
      if (cfg) setBuilder(cfg)
    } else {
      setPreviewMode('rules')
    }
    try {
      const targetRule = mergedRules[ruleIndex]
      const effectiveRules = hsfRulesForTable
      const idxInEffective = targetRule ? effectiveRules.indexOf(targetRule) : -1
      if (idxInEffective >= 0) {
        setFocusRuleIndex(idxInEffective)
      } else {
        setFocusRuleIndex(null)
      }
    } catch {
      setFocusRuleIndex(null)
    }
  }, [customCfgs, hsfRulesForTable, mergedRules, setBuilder, setFocusRuleIndex, setPreviewMode, setTesterOpen, syncSelectedCfgIdx])
  const visibleConfigIndices = useMemo<Set<number> | null>(() => (
    limitConfigsToFiltered ? chipMatchingConfigIndices : null
  ), [chipMatchingConfigIndices, limitConfigsToFiltered])
  visibleConfigIndicesRef.current = visibleConfigIndices
  const selectAllLabelKey = visibleConfigIndices ? 'chipsMenuSelectVisible' : 'chipsMenuSelectAll'
  const scrollSelectedConfigIntoView = useCallback(() => {
    if (multiselectActive || selectedCfgIdx === null) return
    try {
      requestAnimationFrame(() => {
        const container = chipsContainerRef.current
        if (!container) return
        const el = document.getElementById(`cfg-chip-${selectedCfgIdx}`)
        if (!(el instanceof HTMLElement)) return
        let chipTop = el.offsetTop
        let offsetParent = el.offsetParent as HTMLElement | null
        while (offsetParent && offsetParent !== container) {
          chipTop += offsetParent.offsetTop
          offsetParent = offsetParent.offsetParent as HTMLElement | null
        }
        if (!Number.isFinite(chipTop)) return
        const chipHeight = el.offsetHeight
        const viewTop = container.scrollTop
        const viewBottom = viewTop + container.clientHeight
        const chipBottom = chipTop + chipHeight
        let target: number | null = null
        if (chipHeight >= container.clientHeight) {
          target = chipTop
        } else if (chipTop < viewTop) {
          target = chipTop
        } else if (chipBottom > viewBottom) {
          target = chipBottom - container.clientHeight
        }
        if (target === null) return
        const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight)
        const clampedTarget = Math.max(0, Math.min(target, maxScrollTop))
        if (Math.abs(clampedTarget - viewTop) > 0.5) {
          container.scrollTo({ top: clampedTarget, behavior: 'smooth' })
        }
      })
    } catch {}
  }, [chipsContainerRef, multiselectActive, selectedCfgIdx])
  // Keep the focused config chip in view as filters or list length change so keyboard navigation stays visible.
  useEffect(() => {
    scrollSelectedConfigIntoView()
  }, [scrollSelectedConfigIntoView, customCfgs.length, filterActive, limitConfigsToFiltered])
  useEffect(() => {
    if ((customCfgs.length === 0 || selectedCfgIndices.length === 0) && testerConfigFilterMode !== 'off') {
      setTesterConfigFilterMode('off')
    }
  }, [customCfgs.length, selectedCfgIndices.length, testerConfigFilterMode])
  const prevHoveredChipRef = React.useRef<number | null>(null)
  const hoverCountRef = React.useRef(customCfgs.length)
  hoverCountRef.current = customCfgs.length
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const applyChipLinkedHover = (idx: number | null, active: boolean) => {
      if (idx === null || idx < 0 || idx >= hoverCountRef.current) return
      const el = document.getElementById(`cfg-chip-${idx}`)
      if (!el) return
      el.setAttribute('data-linked-hover', active ? 'true' : 'false')
    }
    const unsubscribe = subscribeConfigHover((idx) => {
      const max = hoverCountRef.current
      const clamped = typeof idx === 'number' && (idx < 0 || idx >= max) ? null : idx
      if (idx !== clamped) {
        setConfigHoverIndex(clamped)
        return
      }
      const prev = prevHoveredChipRef.current
      if (prev !== null && prev !== clamped) {
        applyChipLinkedHover(prev, false)
      }
      if (clamped !== null) {
        applyChipLinkedHover(clamped, true)
      }
      prevHoveredChipRef.current = clamped
    })
    return () => {
      const prev = prevHoveredChipRef.current
      if (prev !== null) {
        applyChipLinkedHover(prev, false)
      }
      unsubscribe()
    }
  }, [])
  React.useEffect(() => {
    const current = getConfigHoverIndex()
    if (typeof current === 'number' && (current < 0 || current >= customCfgs.length)) {
      setConfigHoverIndex(null)
    }
  }, [customCfgs.length])
  const colorIconSrc = React.useMemo(() => makeManageColorsIcon(), [])
  const hasNamedConfigs = useMemo(() => customCfgs.some(cfg => Boolean(cfg?.name && cfg.name.trim().length > 0)), [customCfgs])
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
      syncSelectedCfgIdx(cfgIdx, { forceSync: true })
      const cfg = customCfgs[cfgIdx]
      if (cfg) setBuilder(cfg)
    }
    try {
      const effective = filterActive ? filteredRules : mergedRules
      const idxInEffective = effective.indexOf(rule)
      if (idxInEffective >= 0) {
        setFocusRuleIndex(idxInEffective)
      } else {
        setFocusRuleIndex(null)
      }
    } catch {
      setFocusRuleIndex(null)
    }
    return true
  }, [mergedRules, customCfgs, filterActive, filteredRules, setBuilder, syncSelectedCfgIdx])
  const showFactionFilter = useMemo(() => {
    try { return mergedRules.some(r => r.Faction !== undefined) } catch { return false }
  }, [mergedRules])

  const evaluateConfigAgainstFilters = useCallback((config: BuilderConfig, targetIndex: number, names: string[], modes: SellfileExportMode[]): boolean => {
    try {
      const cached = rulesByConfig.get(targetIndex)
      let rulesForConfig: HsfRuleWithCfg[]
      if (cached) {
        rulesForConfig = cached
        if (configRuleCounts.get(targetIndex) === Number.POSITIVE_INFINITY) {
          return true
        }
      } else {
        let limitHit = false
        rulesForConfig = buildRulesForConfig(
          { config, metasets, substatTargets, cfgIdx: targetIndex },
          {
            limit: RULE_COUNT_LIMIT + 1,
            onLimit: () => { limitHit = true },
          },
        )
        if (limitHit) return true
      }
      const result = filterHsfRules(rulesForConfig, rulesFilter, metasets, { configNames: names, configModes: modes })
      return result.matchingConfigIndices.has(targetIndex)
    } catch {
      return true
    }
  }, [metasets, substatTargets, rulesByConfig, rulesFilter, configRuleCounts])

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
    const builderExportMode: SellfileExportMode = builder.exportMode
    modes.splice(prospectiveInsertIndex, 0, builderExportMode)
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
    if (cmd.kind === 'gearDbFile') {
      const queueImport = (file: File | null) => {
        if (!file) {
          if (import.meta.env.DEV) {
            console.error('Failed to decode gear DB payload from external command.')
          }
          return
        }
        void handleGearDbImport(file, { source: 'command' })
      }

      const downloadPath = cmd.downloadPath?.trim()
      if (downloadPath) {
        const resolveDownloadUrl = (): string | null => {
          try {
            if (/^https?:\/\//i.test(downloadPath)) {
              return downloadPath
            }
            const base = pushEndpoint ?? ''
            if (!base) return null
            const baseUrl = base.endsWith('/') ? base : `${base}/`
            const relative = downloadPath.startsWith('/') ? downloadPath.slice(1) : downloadPath
            return new URL(relative, baseUrl).toString()
          } catch {
            return null
          }
        }
        const url = resolveDownloadUrl()
        if (url) {
          void (async () => {
            try {
              const response = await fetch(url, { cache: 'no-store' })
              if (!response.ok) throw new Error(`HTTP ${response.status}`)
              const blob = await response.blob()
              const fileName = cmd.name && cmd.name.trim().length > 0 ? cmd.name : DEFAULT_GEAR_DB_FILENAME
              const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
              await handleGearDbImport(file, { source: 'command' })
            } catch (err) {
              if (import.meta.env.DEV) {
                console.error('Failed to download gear DB payload', err)
              }
              const fallbackFile = createGearDbFileFromBase64(cmd.name, cmd.base64)
              queueImport(fallbackFile)
            }
          })()
          return
        }
      }

      const file = createGearDbFileFromBase64(cmd.name, cmd.base64)
      queueImport(file)
    }
  }, [focusRuleByIndex, setTesterOpen, handleGearDbImport, pushEndpoint])

  useExternalCommands({
    pushEndpoint,
    onCommand: handleExternalCommand,
    onReachabilityChange: setPushEndpointReachable,
  })
  // Dirty flag: builder differs from currently selected config
  const duplicateOfIndices = useMemo(() => computeDuplicateIndices(customCfgs), [customCfgs])

  const handleResetMetasets = useCallback((mode: 'delete' | 'replaceSets' | 'replaceMeta', replacementMetaId?: string) => {
    const defaults = defaultMetasets()
    const replacementId = mode === 'replaceMeta' ? (replacementMetaId || null) : null
    const replacementMetaName = replacementId ? (defaults.find((meta) => meta.id === replacementId)?.name ?? null) : null
    const descriptor = describeMetasetsReset({ mode, replacementName: replacementMetaName, t })
    describeNextChange(descriptor)
    const metasById = new Map(metasets.map((meta) => [meta.id, meta]))
    const stringArraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false
      }
      return true
    }
    const numberArraysEqual = (a: readonly number[], b: readonly number[]): boolean => {
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false
      }
      return true
    }
    setBuilder((prev) => {
      const currentMetaIds = prev.artifactMetaSets ?? []
      if (currentMetaIds.length === 0) {
        return prev
      }
      const mergedSets = new Set<number>(prev.artifactSets ?? [])
      if (mode === 'replaceSets') {
        for (const metaId of currentMetaIds) {
          const meta = metasById.get(metaId)
          if (!meta) continue
          for (const setId of meta.sets) mergedSets.add(setId)
        }
      }
      const nextMeta = (mode === 'replaceMeta' && replacementId) ? [replacementId] : []
      const nextSets = mode === 'replaceSets' ? Array.from(mergedSets).sort((a, b) => a - b) : (prev.artifactSets ?? [])
      const metaChanged = !stringArraysEqual(currentMetaIds, nextMeta)
      const setsChanged = mode === 'replaceSets' ? !numberArraysEqual(prev.artifactSets ?? [], nextSets) : false
      if (!metaChanged && !setsChanged) return prev
      return {
        ...prev,
        artifactMetaSets: nextMeta,
        artifactSets: mode === 'replaceSets' ? nextSets : (prev.artifactSets ?? []),
      }
    })
    setCustomCfgs((prev) => {
      let anyChanged = false
      const next = prev.map((cfg) => {
        const currentMetaIds = cfg.artifactMetaSets ?? []
        if (currentMetaIds.length === 0) return cfg
        const mergedSets = new Set<number>(cfg.artifactSets ?? [])
        if (mode === 'replaceSets') {
          for (const metaId of currentMetaIds) {
            const meta = metasById.get(metaId)
            if (!meta) continue
            for (const setId of meta.sets) mergedSets.add(setId)
          }
        }
        const nextMeta = (mode === 'replaceMeta' && replacementId) ? [replacementId] : []
        const nextSets = mode === 'replaceSets' ? Array.from(mergedSets).sort((a, b) => a - b) : (cfg.artifactSets ?? [])
        const metaChanged = !stringArraysEqual(currentMetaIds, nextMeta)
        const setsChanged = mode === 'replaceSets' ? !numberArraysEqual(cfg.artifactSets ?? [], nextSets) : false
        if (!metaChanged && !setsChanged) return cfg
        anyChanged = true
        return { ...cfg, artifactMetaSets: nextMeta, artifactSets: mode === 'replaceSets' ? nextSets : (cfg.artifactSets ?? []) }
      })
      return anyChanged ? next : prev
    })
    setMetasets(defaults)
  }, [describeNextChange, metasets, setBuilder, setCustomCfgs, setMetasets, t])

  const builderPanelElement = (
    <BuilderPanel
      cfg={builder}
      onChange={setBuilder}
      onAddToCustom={() => {
        const currentBuilder = builderRef.current
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length)
          ? selectedCfgIdx + 1
          : customCfgs.length
        const nextCfgs = [
          ...customCfgs.slice(0, insertIdx),
          currentBuilder,
          ...customCfgs.slice(insertIdx),
        ]
        const descriptor = describeConfigAdded({
          index: insertIdx,
          cfg: currentBuilder,
          previous: customCfgs,
          t,
          metasets,
        })
        describeNextChange(descriptor)
        setCustomCfgs(nextCfgs)
        // Auto-select the newly added config chip
        syncSelectedCfgIdx(insertIdx, { forceSync: true, suppressDraft: true })
      }}
      editingIndex={editingConfigIndex}
      onUndo={undo}
      onRedo={redo}
      canUndo={canUndo}
      canRedo={canRedo}
      undoPreview={undoPreview}
      redoPreview={redoPreview}
      historyTimeline={historyTimeline}
      onJumpToHistoryIndex={jumpToHistoryIndex}
      onRequestClearHistory={requestClearHistory}
      onUpdateSelected={() => {
        if (selectedCfgIdx === null) return
        const currentBuilder = builderRef.current
        const previousCfg = customCfgs[selectedCfgIdx] ?? null
        if (previousCfg) {
          const descriptor = describeBuilderConfigUpdate({
            previous: previousCfg,
            next: currentBuilder,
            index: selectedCfgIdx,
            t,
            metasets,
          })
          describeNextChange(descriptor)
        } else {
          describeNextChange(null)
        }
        setCustomCfgs(prev => prev.map((c, i) => (i === selectedCfgIdx ? currentBuilder : c)))
      }}
      registerAutoApplyHandler={registerAutoApplyHandler}
      metasets={metasets}
      onMetasetsChange={(next) => setMetasets(next)}
      describeNextChange={describeNextChange}
      onDeleteMetaset={(id, opts) => {
        // Determine replacement strategy before mutating metasets/configs
        const metaToDelete = metasets.find(m => m.id === id) || null
        const replaceWithSets = Boolean(opts?.replaceWithSets && metaToDelete && (metaToDelete.sets.length > 0))
        const replaceWithMetaId = opts?.replaceWithMetaId && opts.replaceWithMetaId !== id ? opts.replaceWithMetaId : null

        // Remove metaset from the list (cheap)
        if (!metaToDelete) {
          describeNextChange(null)
          return
        }
        const deletionMode: 'delete' | 'replaceSets' | 'replaceMeta' = replaceWithSets ? 'replaceSets' : (replaceWithMetaId ? 'replaceMeta' : 'delete')
        const replacementName = replaceWithMetaId ? (metasets.find((m) => m.id === replaceWithMetaId)?.name ?? null) : null
        const descriptor = describeMetasetDeleted({ metaset: metaToDelete, mode: deletionMode, replacementName, t })
        describeNextChange(descriptor)
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
      substatTargets={substatTargets}
      onResetMetasets={handleResetMetasets}
      onSubstatTargetsChange={(next, opts) => { applySubstatTargetsChange(next, opts) }}
      substatTargetsDialogOpen={substatTargetsDialogOpen}
      onCloseSubstatTargetsDialog={closeSubstatTargetsDialog}
      setUsageCounts={setUsageCounts}
      metasetUsageCounts={metasetUsageCounts}
      substatColors={substatColors}
      configCount={customCfgs.length}
      selectedIsDirty={selectedIsDirty}
      configHiddenByFilters={configHiddenByFilters}
      configRuleCounts={configRuleCounts}
      configRuleFingerprints={configRuleFingerprints}
      configsExcludedByTotalLimit={configsExcludedByTotalLimit}
      ruleSubstatTargetsKey={ruleSubstatTargetsKey}
      rulesBuilding={rulesBuilding}
      awaitRuleCounts={awaitRuleCounts}
      countRulesForConfigs={countRules}
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
        syncSelectedCfgIdx(last, { preserveSelection: indices.length > 1 })
      }}
      onApplyMultiEdit={applyMultiEditDraft}
      multiEdit={multiEditHandle}
      multiSelectedConfigs={multiSelectedConfigs}
      onBeforeMetasetsDialogClose={flushRuleCache}
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
      onCopyAllConfigs={handleCopyAllConfigs}
      onCopyConfig={handleCopyConfig}
      {...(isDevBuild ? { onCopyConfigDev: copyConfigWithRulesDev } : {})}
      onSelectAll={handleSelectAllConfigs}
      selectAllLabelKey={selectAllLabelKey}
      onClearSelection={handleClearSelection}
      onPasteAtEnd={handlePasteAtEnd}
      visibleIndices={visibleConfigIndices}
      highlightDelete={highlightDeleteConfigs}
      onHighlightDelete={setHoverDeleteConfigs}
      onDeleteAll={requestClearAll}
      deleteAllDisabled={deleteAllDisabled}
      onDeleteSelected={handleDeleteSelected}
      onPrepareDragSelection={prepareDragSelection}
      onReorderConfigs={handleConfigReorder}
    />
  )

  const applyHsfcLoadResult = useCallback((
    fileName: string,
    payload: {
      cfgs: BuilderConfig[]
      metasets: Metaset[]
      substatTargets: SubstatTargetTable
      selectedIndex: number | null
      note?: string
      finalSellRemainder: FinalSellRemainderConfig
    },
  ) => {
    const {
      cfgs,
      metasets: nextMetas,
      substatTargets: nextSubstatTargets,
      selectedIndex,
      note,
      finalSellRemainder: fsr,
    } = payload

    const loadDescriptor = describeHsfcLoaded({ fileName, t })
    const resolvedSel = typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < cfgs.length
      ? selectedIndex
      : (cfgs.length > 0 ? 0 : null)
    const rawNote = typeof note === 'string' ? note : ''
    const importedNote = rawNote.trim().length > 0 ? rawNote : null

    if (importedNote !== null) {
      applyNoteChange(importedNote, { mode: 'import', publish: false })
      openNoteViewer()
    } else {
      applyNoteChange(null, { mode: 'import', publish: false })
      handleCloseNote()
    }

    startTransition(() => {
      describeNextChange(loadDescriptor)
      setCustomCfgs(cfgs)
      if (nextMetas !== metasets) {
        setMetasets(nextMetas)
      }
      if (nextSubstatTargets !== substatTargets) {
        try {
          applySubstatTargetsChange(nextSubstatTargets, { mode: 'import', publish: false })
        } catch {}
      }
      applyFinalSellChange(fsr, { mode: 'import', publish: false })
      syncSelectedCfgIdx(resolvedSel, { forceSync: true, suppressDraft: true })
      if (resolvedSel !== null && cfgs[resolvedSel]) {
        setBuilder(cfgs[resolvedSel]!)
      }
    })

    markNextSnapshotAsSaved()
    setLastExportSig(null)
    exportBaselineResetRef.current = true
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => { markSavedNow() })
    } else {
      setTimeout(() => { markSavedNow() }, 0)
    }
    flushTransientUi()
  }, [
    applyFinalSellChange,
    applyNoteChange,
    applySubstatTargetsChange,
    describeNextChange,
    flushTransientUi,
    handleCloseNote,
    markNextSnapshotAsSaved,
    markSavedNow,
    metasets,
    openNoteViewer,
    setBuilder,
    setCustomCfgs,
    setLastExportSig,
    setMetasets,
    substatTargets,
    syncSelectedCfgIdx,
    t,
  ])

  const importHsfcFile = useCallback(async (file: File) => {
    flushTransientUi()
    try {
      const result = await readHsfcFile(file, { metasets, substatTargets })
      applyHsfcLoadResult(file.name, result)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to parse .hsfc file', err)
      }
      showFileFormatError(file.name)
      flushTransientUi()
    }
  }, [
    applyHsfcLoadResult,
    flushTransientUi,
    metasets,
    substatTargets,
    showFileFormatError,
  ])

  // HSFC load/save/copy controls surfaced at the top of the builder column.
  const headerActionsElement = (
    <HeaderActions
      onAboutToOpenHsfc={() => {
        markSavedNow()
      }}
      onSelectHsfc={importHsfcFile}
      onSaveHsfc={() => {
        const payload = buildHsfcPayload({
          version: APP_VERSION,
          metasets,
          substatTargets,
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
        showToast(t('toastConfigsSaved'))
        markSavedNow()
      }}
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
          const substatTargetsDescriptor = applySubstatTargetsChange(pendingImport.substatTargets, { mode: 'import', publish: false })
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
          const conflictDescriptor = describeMetasetConflictResolved({
            strategy: choice,
            conflictCount: prep.conflicts.length,
            newIdCount: remapForConflicts.size,
            t,
          })
          const withClipboardSource = (descriptor: HistoryEntryDescriptor | null): HistoryEntryDescriptor | null => (
            appendDescriptorDetails(descriptor, makeClipboardSourceDescriptor(t))
          )
          describeNextChange(withClipboardSource(conflictDescriptor))
          setMetasets(finalMetas)
          const finalSellDescriptor = applyFinalSellChange(pendingImport.finalSellRemainder, { mode: 'import', publish: false })
          const incomingNote = typeof pendingImport.note === 'string' ? pendingImport.note : null
          const shouldApplyNote = !normalizeNoteValue(hsfcNote) && Boolean(normalizeNoteValue(incomingNote))
          const noteDescriptor = shouldApplyNote
            ? applyNoteChange(incomingNote, { mode: 'import', publish: false })
            : null
          if (pendingImport.mode === 'append') {
            const preLen = customCfgs.length
            setCustomCfgs((prev) => {
              if (!cfgs.length) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return prev
              }
              const insertIdx = prev.length
              const next = [...prev, ...cfgs]
              const labels: string[] = []
              for (let i = 0; i < cfgs.length; i += 1) {
                const idxNew = insertIdx + i
                const cfg = next[idxNew]
                if (!cfg) continue
                labels.push(buildConfigLabel(idxNew, cfg, t))
              }
              const descriptor = describeConfigsInserted({
                mode: 'import',
                insertIndex: insertIdx,
                labels,
                previous: prev,
                t,
              })
              if (!descriptor) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return next
              }
              if (conflictDescriptor?.detailLines?.length) {
                descriptor.detailLines = [
                  ...(descriptor.detailLines ?? []),
                  ...conflictDescriptor.detailLines,
                ]
              }
              const descriptorWithSubstatTargets = appendDescriptorDetails(descriptor, substatTargetsDescriptor)
              const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
              const descriptorWithNote = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
              describeNextChange(withClipboardSource(descriptorWithNote))
              return next
            })
            try {
              const sel = preLen + cfgs.length - 1
              syncSelectedCfgIdx(sel, { forceSync: true, suppressDraft: true })
              setBuilder(cfgs[cfgs.length - 1]!)
            } catch {}
          } else {
            const after = Math.max(0, Math.min((pendingImport.afterIdx ?? customCfgs.length - 1), customCfgs.length - 1))
            setCustomCfgs((prev) => {
              const insertIdx = Math.min(prev.length, after + 1)
              if (!cfgs.length) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return prev
              }
              const next = [...prev.slice(0, insertIdx), ...cfgs, ...prev.slice(insertIdx)]
              const labels: string[] = []
              for (let i = 0; i < cfgs.length; i += 1) {
                const idxNew = insertIdx + i
                const cfg = next[idxNew]
                if (!cfg) continue
                labels.push(buildConfigLabel(idxNew, cfg, t))
              }
              const descriptor = describeConfigsInserted({
                mode: 'import',
                insertIndex: insertIdx,
                labels,
                previous: prev,
                t,
              })
              if (!descriptor) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return next
              }
              if (conflictDescriptor?.detailLines?.length) {
                descriptor.detailLines = [
                  ...(descriptor.detailLines ?? []),
                  ...conflictDescriptor.detailLines,
                ]
              }
              const descriptorWithSubstatTargets = appendDescriptorDetails(descriptor, substatTargetsDescriptor)
              const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
              const descriptorWithNote = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
              describeNextChange(withClipboardSource(descriptorWithNote))
              return next
            })
            try {
              syncSelectedCfgIdx(after + cfgs.length, { forceSync: true, suppressDraft: true })
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
              syncSelectedCfgIdx(pasteAfterIdx + parsed.length, { forceSync: true, suppressDraft: true })
              setBuilder(parsed[parsed.length - 1]!)
            } catch {}
            setPasteAfterIdx(null)
          } else if (pasteSelectOnEmpty && parsed.length > 0) {
            try {
              const sel = preLen + parsed.length - 1
              syncSelectedCfgIdx(sel, { forceSync: true, suppressDraft: true })
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
        '.chips-dragging .MuiTooltip-popper': {
          display: 'none !important',
        },
        'body.chips-dragging': {
          cursor: 'grabbing',
        },
        '.chips-dragging [data-config-chip="true"], .chips-dragging [data-config-chip="true"] *': {
          pointerEvents: 'none !important',
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
          width: forceSideBySideLayout ? `${SIDE_BY_SIDE_BREAKPOINT_PX}px` : '100%',
          maxWidth: forceSideBySideLayout ? 'none' : PANEL_WIDTH_PX,
          mx: forceSideBySideLayout ? 0 : 'auto',
          ...(forceSideBySideLayout
            ? {
                position: 'relative',
                left: '50%',
                transform: 'translateX(-50%)',
              }
            : {}),
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
            ...(forceSideBySideLayout
              ? {
                  gridColumn: '1 / span 1',
                }
              : {}),
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
                v{APP_VERSION} — © Nusi㊷ - 2025 — Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷
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
            width: forceSideBySideLayout ? `${SIDE_BY_SIDE_BREAKPOINT_PX}px` : '100%',
            ...(forceSideBySideLayout
              ? {
                  position: 'relative',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  gridTemplateColumns: `${PANEL_WIDTH_PX}px ${PANEL_WIDTH_PX}px`,
                  columnGap: `${GRID_COLUMN_GAP_PX}px`,
                  alignItems: 'start',
                }
              : {}),
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
          forceSideBySide={forceSideBySideLayout}
          title={t('appBuilderTitle')}
          caption={t('builderIntroCaption')}
          substatValuesLabel={t('builderSubstatValues')}
          onOpenSubstatValues={openSubstatTargetsDialog}
          builderPanel={builderPanelElement}
          headerActions={headerActionsElement}
          metasetConflictDialog={metasetConflictDialogElement}
          configChipsPanel={configChipsPanelElement}
          pasteDialog={pasteDialogElement}
          copyDialog={copyDialogElement}
        />

        <Paper sx={{
          p: 2,
          width: forceSideBySideLayout ? PANEL_WIDTH_PX : '100%',
          maxWidth: PANEL_WIDTH_PX,
          mx: forceSideBySideLayout ? 0 : 'auto',
          display: 'flex',
          flexDirection: 'column',
          height: previewPaperHeightStyle ?? 'auto',
          ...(previewPaperHeightStyle ? { minHeight: previewPaperHeightStyle } : {}),
          overflow: forceSideBySideLayout ? 'hidden' : undefined,
          [`@media (min-width:${SIDE_BY_SIDE_BREAKPOINT_PX}px)`]: {
            mx: 0,
            width: PANEL_WIDTH_PX,
            height: previewPaperHeightStyle ?? 'auto',
            ...(previewPaperHeightStyle ? { minHeight: previewPaperHeightStyle } : {}),
            overflow: 'hidden',
          }
        }} data-tour-id="preview.paper">
      <PreviewHeaderActions
        mergedCount={totalLimitHit ? Number.POSITIVE_INFINITY : mergedRules.length}
        {...(filterActive ? { filteredCount: totalLimitHit ? Number.POSITIVE_INFINITY : filteredRules.length } : {})}
        filterActive={previewFilterActive}
        building={rulesBuilding}
        testerBuilding={testerBuilding}
        limitHit={totalLimitHit}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        onSelectHsf={async (file) => {
          flushTransientUi()
          try {
            const parsed = await readHsfFile(file)
            setHsf(parsed)
            exportBaselineResetRef.current = true
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error('Failed to parse .hsf file', err)
            }
            setHsf(null)
            showFileFormatError(file.name)
          } finally {
            flushTransientUi()
          }
        }}
        onSelectGearDb={handleGearDbImport}
        onClearBase={() => setHsf(null)}
        {...(hsf ? { baseRuleCount: hsf.Rules.length } : {})}
        {...(pushExportEndpoint ? { pushEndpoint: pushExportEndpoint } : {})}
        hsfDirty={hsfDirty}
        dedupeDefault={dedupeDefault}
        onToggleDedupeDefault={handleSetDedupeDefault}
        omitDisabledForExport={omitDisabledForExport}
        onToggleOmitDisabled={handleSetOmitDisabled}
        onExportDeduped={handleExportDeduped}
        onExport={async () => {
          const payload = activeExportPayload
          const blob = hsfToBlob(payload)
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
              if (pushToast === 'success') {
                showToast(t('toastSellfileSaved'))
              } else if (pushToast === 'failure') {
                showToast(t('toastSellfileExportFailed'), { severity: 'error', icon: <ErrorOutlineIcon fontSize="inherit" /> })
              }
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
          showToast(t('toastSellfileSaved'))
        }}
        exportDisabled={!mergedRules.length}
        finalSell={finalSellRemainder}
        onToggleFinalSell={(enabled) => {
          applyFinalSellChange((prev) => {
            const cur = prev ?? {
              artifacts: true,
              accessories: true,
              levels: FINAL_SELL_DEFAULT_LEVELS.slice() as FinalSellLevel[],
              setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
            }
            if (enabled) {
              const hasTypes = cur.artifacts || cur.accessories
              const hasLevels = (cur.levels?.length ?? 0) > 0
              return {
                ...cur,
                artifacts: hasTypes ? cur.artifacts : true,
                accessories: hasTypes ? cur.accessories : true,
                levels: hasLevels ? cur.levels : (FINAL_SELL_DEFAULT_LEVELS.slice() as FinalSellLevel[]),
              }
            }
            return { ...cur, artifacts: false, accessories: false }
          }, { mode: 'quickToggle' })
        }}
        onOpenFinalSellDialog={() => setFinalSellOpen(true)}
        onOpenRuleTester={() => setTesterOpen(true)}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
        testerCount={testerItems.length}
        testerFilteredCount={testerRowsForTable.length}
        gearDbCommandError={gearDbCommandError}
        onClearGearDbCommandError={clearGearDbCommandError}
        gearDbCommandSuccess={gearDbCommandSuccess}
        onClearGearDbCommandSuccess={clearGearDbCommandSuccess}
      />
          {filterOpen && (
          <RulesFilterPanel
            ref={rulesFilterPanelRef}
            mode={previewMode}
            state={rulesFilter}
            onChange={setRulesFilter}
            metasets={metasets}
            onClose={() => setFilterOpen(false)}
            showFaction={showFactionFilter}
            hasNamedConfigs={hasNamedConfigs}
            configChipFilterActive={limitConfigsToFiltered}
            onConfigChipFilterChange={setLimitConfigsToFiltered}
            onResetFilters={scrollSelectedConfigIntoView}
            testerConfigFilterMode={testerConfigFilterMode}
            onTesterConfigFilterModeChange={setTesterConfigFilterMode}
            selectedConfigCount={selectedCfgIndices.length}
            configCount={customCfgs.length}
            collapsed={filterCollapsed}
            onCollapsedChange={setFilterCollapsed}
            testerChampionOptions={testerChampionOptions}
            substatColors={substatColors}
            useStatButtonColors={statButtonBorders}
          />
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {previewMode === 'tester' ? (
              <TesterItemsGrid
                rows={testerRowsForTable}
                filterActive={testerFilterActive || testerConfigFilterActive}
                substatColors={substatColors}
                useStatButtonColors={statButtonBorders}
                onToggleStatColors={setStatButtonBorders}
                onOpenManageColors={openColors}
                colorIconSrc={colorIconSrc}
                configNames={testerConfigNames}
                onJumpToRule={handleTesterRuleView}
              />
            ) : (
              <HsfRulesTableMemo
                rules={hsfRulesForTable}
                building={rulesBuilding}
                setHoveredCfgIdx={setHoveredCfgIdx}
                selectedCfgIdx={selectedCfgIdx}
                multiselectActive={multiselectActive}
                focusRuleIndex={focusRuleIndex}
                onFocusRuleSettled={() => setFocusRuleIndex(null)}
                onSelectCfgIdx={handleRulesTableSelectCfgIdx}
                emptyDueToFilter={hsfTableEmptyDueToFilters}
                limitExceeded={limitExceeded}
                onConfigAction={handleRulesTableConfigAction}
                onClearBase={handleRulesTableClearBase}
                onConfigureFinalSell={handleRulesTableConfigureFinalSell}
                onOpenManageColors={openColors}
                colorIconSrc={colorIconSrc}
                substatColors={substatColors}
                colorBlindMode={colorBlindMode}
                onChangeColorBlindMode={setColorBlindMode}
              />
            )}
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
        onChange={(value, options) => {
          const mode: NoteDescriptorMode = options?.mode === 'clear' ? 'clear' : 'edit'
          applyNoteChange(value, { mode })
        }}
        onClose={handleCloseNote}
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
          icon={toastIcon}
          severity={toastSeverity}
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
        clearHistoryOpen={confirmClearHistoryOpen}
        setClearHistoryOpen={setConfirmClearHistoryOpen}
        onConfirmClearHistory={handleConfirmClearHistory}
      />
      {/* Restore autosaved HSFC dialog */}
      <RestoreAutosaveDialog
        open={restoreDlgOpen}
        draft={restoreDraft}
        testerDraft={testerRestoreDraft ? { count: testerRestoreDraft.count, savedAt: testerRestoreDraft.savedAt } : null}
        metasetsDiffer={restoreMetasetsDiffer}
        targetsDiffer={restoreTargetsDiffer}
        filtersDiffer={restoreFiltersDiffer}
        onDismiss={() => {
          dismissRestore()
          setTesterRestoreDraft(null)
        }}
        onRestore={(selection) => {
          flushTransientUi()
          const draft = restoreDraft
          const selectionKeys = Object.entries(selection).filter(([, value]) => value)
          if (selectionKeys.length > 0) {
            const autosaveDescriptor = describeAutosaveRestored({
              version: typeof draft?.Version === 'string' ? draft.Version : null,
              savedAt: typeof draft?.AutosaveSavedAt === 'string'
                ? draft.AutosaveSavedAt
                : (selection.tester && testerRestoreDraft?.savedAt ? testerRestoreDraft.savedAt : null),
              t,
            })
            describeNextChange(autosaveDescriptor)
          }
          if (draft) {
            if (selection.metasets && restoreMetasetsDiffer && Array.isArray(draft.Metasets)) setMetasets(draft.Metasets)
            if (selection.targets && restoreTargetsDiffer && draft.substatTargets && typeof draft.substatTargets === 'object') setSubstatTargets(draft.substatTargets)
            if (selection.note && typeof draft.Note === 'string') {
              applyNoteChange(draft.Note, { mode: 'restore', publish: false })
            }
            if (selection.filters && restoreFiltersDiffer && draft.Filters) {
              try {
                setFilterOpen(Boolean(draft.Filters.open))
                const clonedState = JSON.parse(JSON.stringify(draft.Filters.state)) as RulesFilterState
                setRulesFilter(clonedState)
                const collapsedDraft = (draft.Filters.collapsed && typeof draft.Filters.collapsed === 'object')
                  ? (draft.Filters.collapsed as Record<string, boolean>)
                  : {}
                setFilterCollapsed((prev) => ({
                  ...prev,
                  ...collapsedDraft,
                }))
                setTesterConfigFilterMode(draft.Filters.testerConfigFilterMode ?? 'off')
              } catch {}
            }
            if (selection.configs && Array.isArray(draft.Configs)) {
              if (draft.FinalSellRemainder && typeof draft.FinalSellRemainder === 'object') {
                try {
                  const fsr = draft.FinalSellRemainder as FinalSellRemainderConfig
                  applyFinalSellChange(fsr, { publish: false })
                } catch {}
              }
              setCustomCfgs(draft.Configs)
              const len = draft.Configs.length
              if (len > 0) {
                const savedSel = typeof draft.SelectedConfigIndex === 'number' ? draft.SelectedConfigIndex : (len - 1)
                const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
                syncSelectedCfgIdx(sel, { forceSync: true, suppressDraft: true })
                try {
                  const cfgs = draft.Configs || []
                  if (cfgs[sel]) setBuilder(cfgs[sel]!)
                } catch {}
              } else {
                syncSelectedCfgIdx(null, { forceSync: true, suppressDraft: true })
              }
            }
          }
          if (selection.tester && testerRestoreDraft) {
            setTesterItems(testerRestoreDraft.items)
            const maxRowId = testerRestoreDraft.items.reduce((max, item) => (
              Number.isFinite(item.rowId) && item.rowId > max ? item.rowId : max
            ), 0)
            testerRowIdRef.current = Math.max(testerRowIdRef.current, (maxRowId || 0) + 1)
          }
          acceptRestore()
          setTesterRestoreDraft(null)
          flushTransientUi()
          setTimeout(flushTransientUi, 0)
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
        onChange={(v) => applyFinalSellChange(v)}
        onClose={() => setFinalSellOpen(false)}
        onReset={() => applyFinalSellChange({
          artifacts: true,
          accessories: true,
          levels: FINAL_SELL_DEFAULT_LEVELS.slice() as FinalSellLevel[],
          setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
        }, { mode: 'reset' })}
      />
      {/* Rule Tester dialog */}
      <RuleTesterDialog
        open={testerOpen}
        onClose={() => setTesterOpen(false)}
        customCfgs={customCfgs}
        substatColors={substatColors}
        testerItems={testerItems}
        setTesterItems={setTesterItems}
        allocTesterRowId={allocTesterRowId}
        testerMatches={testerMatchesByRowId}
        pendingExternalItems={pendingTesterItems}
        onConsumeExternalItems={() => setPendingTesterItems([])}
        onView={handleTesterRuleView}
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
      <FileFormatErrorDialog
        open={Boolean(fileFormatError)}
        fileName={fileFormatError?.fileName ?? null}
        onClose={handleFileFormatErrorClose}
      />
    </Container>
  )
}
