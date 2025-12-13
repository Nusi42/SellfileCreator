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
import type { ExternalCommand, GearDbRawDeltaCommand, GearDbRawSnapshotCommand } from './lib/externalCommands'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderConfig, type SubstatTargetTable, type SellfileExportMode } from './lib/hsfBuilder'
import { parseConfigsFromText, buildReadableConfig, readHsfcFile, buildHsfcPayload, hsfcToBlob } from './lib/hsfcIO'
import { COPY_DIALOG_EVENT, writeTextSafe } from './lib/clipboard'
import {
  loadRuntimeGearSetsFromStorage,
  clearRuntimeGearSets,
  getPersistedRuntimeGearSetCount,
  listRuntimeGearSets,
  persistRuntimeGearSetsSnapshot,
} from './lib/gearSets/runtimeStore'
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
import { clampProgressRatio, type ProgressSnapshot } from './types/progress'

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Button } from '@mui/material'
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
import {
  computeMergedRules,
  buildRulesForConfig,
  prependKeepUniqueRules,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_KEEP_UNIQUES,
  type HsfRuleWithCfg,
} from './lib/merge'
import { buildRuleMatchIndexData, primeRuleMatchIndex } from './lib/ruleMatchIndex'
import { cloneRuleWithConfigIndex, getRuleConfigIndex, resolveMatchConfigName } from './lib/ruleConfigIndex'
import {
  buildDefaultKeepUniqueRules,
  type KeepUniqueDetectionSnapshot,
  type KeepUniqueRule,
  resolveKeepUniqueRulesWithMetasets,
  hashKeepUniqueCombination,
  resolveKeepUniqueRuleLabel,
  sanitizeKeepUniqueCountMode,
  KeepUniqueRuleActivation,
} from './lib/keepUniques'
import { fingerprintConfigForRules, fingerprintSubstatTargets, updateConfigRulesCache } from './lib/ruleCache'
import { hasConfigMeaningfulDifferences } from './lib/configDiff'
import { buildRuleTesterAutosavePayload, createRuleTesterMath, fingerprintRuleTesterItem, loadRuleTesterAutosaveDraft, type RuleTesterItem } from './lib/ruleTesterSession'
import { sortTesterRows } from './lib/testerSort'
import { setTesterSubstatSortState, useTesterSubstatSortPreferences } from './state/testerSubstatSortPreferences'
import { FILTER_PRESETS_VERSION, useFilterPresetsPreference, type FilterPreset, type FilterPresetSnapshot } from './state/filterPresetsPreference'
import FileDragOverlay from './components/FileDragOverlay'
import { BuilderColumn } from './components/AppLayout/BuilderColumn'
import { useFileDragDrop, routeFileByExtension } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import LogicHubDialog from './components/dialogs/LogicHubDialog'
import HelpDialog from './components/HelpDialog'
import MarkdownTooltip from './components/MarkdownTooltip'
import { TutorialCoach } from './components/tutorial/TutorialCoach'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import MetasetConflictDialog from './components/dialogs/MetasetConflictDialog'
import FileFormatErrorDialog from './components/dialogs/FileFormatErrorDialog'
import { useAutosave } from './hooks/useAutosave'
import { useDeferredHsfcPayload } from './hooks/useDeferredHsfcPayload'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import RulesFilterPanel, { type RulesFilterPanelHandle } from './components/RulesFilterPanel'
import { TESTER_CONFIG_FILTER_MODE_DEFAULT, type TesterConfigFilterMode } from './types/testerConfigFilterMode'
import { getAllKnownArtifactSetIds, type ArtifactSetId, type RankValue } from './lib/types'
import { DEFAULT_RULES_FILTER_STATE, filterHsfRules, filterTesterItems, isRulesFilterActive, normalizeRulesFilterForTester, type FilterHsfRulesResult, type RulesFilterState } from './lib/rulesFilter'
import {
  useAutosaveRestore,
  metasetsSignature,
  substatTargetsSignature,
  areAutosaveFiltersDefault,
  type AutosaveFilterView,
} from './hooks/useAutosaveRestore'
import { makeManageColorsIcon } from './lib/icons'
import type { ChampionLocation } from './lib/importers/gearDbNormalizer'
const TESTER_MATCH_RESET_TIMEOUT_MS = 1500
// Keep the chip spinner visible with at least a whisper of progress so the pulse animation can show.
const WORKLOAD_PENDING_MIN_RATIO = 0.02 as const
// Hold the spinner a touch longer so sequential builders do not flicker off between phases.
const WORKLOAD_SPINNER_HANG_MS = 450 as const
// Coalesce rapid edits so we do not restart the pipeline for every keystroke/reorder.
const PIPELINE_DEBOUNCE_MS = 200 as const

// Export pushes always land under `/hsf/` so receivers can route different
// payload types (HSF vs future uploads) without inspecting request bodies.
function buildSellfilePushUrl(endpoint: string, filename: string): string {
  // Drop leading slashes so filename always becomes the final segment.
  const normalizedFilename = filename.replace(/^\/+/, '')
  try {
    const url = new URL(endpoint)
    const segments = url.pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    if (lastSegment !== SELLFILE_PUSH_PATH_SEGMENT) {
      segments.push(SELLFILE_PUSH_PATH_SEGMENT)
    }
    segments.push(normalizedFilename)
    url.pathname = `/${segments.join('/')}`
    return url.toString()
  } catch {
    // Fallback for endpoints that are not URL-compatible (e.g., custom schemes).
    const separatorIndex = Math.min(
      ...['?', '#'].map((marker) => {
        const idx = endpoint.indexOf(marker)
        return idx === -1 ? Number.POSITIVE_INFINITY : idx
      })
    )
    const suffix = Number.isFinite(separatorIndex) ? endpoint.slice(separatorIndex) : ''
    const base = Number.isFinite(separatorIndex) ? endpoint.slice(0, separatorIndex) : endpoint
    const baseWithSlash = base.endsWith('/') ? base : `${base}/`
    const needsSegment = !baseWithSlash.toLowerCase().endsWith(`/${SELLFILE_PUSH_PATH_SEGMENT}/`)
    const baseWithSegment = needsSegment ? `${baseWithSlash}${SELLFILE_PUSH_PATH_SEGMENT}/` : baseWithSlash
    return `${baseWithSegment}${normalizedFilename}${suffix}`
  }
}
import { sellfileFilename, hsfcFilename, buildTimestamp } from './lib/filenames'
import { README_SEEN_VERSION_KEY, RULE_COUNT_LIMIT, SELLFILE_PUSH_PATH_SEGMENT } from './lib/constants'
import { DEFAULT_METASET_ICON_ID } from './lib/metasetIcons'
import { defaultMetasets, type Metaset } from './lib/metasets'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useDisplayPreferences, useDisplayPreferenceActions } from './state/preferencesState'
import { useAutoApplySelectedConfigPreference } from './state/builderPreferences'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/configDuplicates'
import { configsForRuleBuild } from './lib/ruleCacheHelpers'
import { evaluateFirst, type MatchingConfigDecision } from './lib/ruleEval'
import { importGearDatabaseFromFile } from './lib/importers/gearDbImporter'
import {
  createDatasetFromSnapshot,
  applyDeltaToDataset,
  type GearDbRawDataset,
} from './lib/importers/gearDbRawDataset'
import type { NormalizedGearArtifact } from './lib/importers/gearDbNormalizer'
import { TesterItemsGrid } from './components/TesterItemsGrid'
import type { TesterPreviewMatch, TesterPreviewRow } from './types/testerPreview'
import type { TesterMatchWorkerItemResult } from './workers/testerMatchWorkerTypes'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  LOGIC_HUB_DIALOG_TAB_GEAR,
  LOGIC_HUB_DIALOG_TABS,
} from './lib/finalSell'
import type { FinalSellRemainderConfig, FinalSellLevel, LogicHubDialogTab } from './lib/finalSell'
import { useConfigSelection } from './hooks/useConfigSelection'
import { useRuleCacheWorker } from './hooks/useRuleCacheWorker'
import { fingerprintKeepUniqueDetection } from './lib/keepUniqueFingerprint'
import { useTesterItemsActions } from './hooks/useTesterItemsActions'
// Local tag for tester reset triggers; persists only in memory.
type TesterMatchResetReason = 'restore' | 'hsfc' | 'gearDb'
import { getConfigHoverIndex, setConfigHoverIndex, subscribeConfigHover } from './lib/configHoverBridge'
import { useBuilderPreviewLayout } from './hooks/useBuilderPreviewLayout'
import { getDirtyBuilderFieldKeys, cloneBuilderConfig } from './lib/multiEditDraft'
import { useTooltipScrollGuard } from './hooks/useTooltipScrollGuard'
import { useModalCleanup } from './hooks/useModalCleanup'
import { useTutorialCoachState } from './hooks/useTutorialCoachState'
import { useExternalCommands } from './hooks/useExternalCommands'
import { useHsfcClipboard, type PendingImport } from './hooks/useHsfcClipboard'
import { useRuntimeCatalogLoader } from './hooks/useRuntimeCatalogLoader'
import { useRuntimeGearSetLoader } from './hooks/useRuntimeGearSetLoader'
import { useGearSetCatalogVersion } from './hooks/useGearSetCatalogVersion'
import {
  useRulesFilterCollapsedPreference,
  useRulesFilterOpenPreference,
  useRulesFilterStatePreference,
  RULES_FILTER_PREVIEW_MODES,
  type RulesFilterPreviewMode,
  resetRulesFilterPreferences,
  setRulesFilterOpenForMode,
  setRulesFilterStateForMode,
  setRulesFilterCollapsedForMode,
  useRulesFilterSyncPreference,
  cloneDefaultRulesFilterCollapsed,
  cloneDefaultRulesFilterState,
  type CollapsedSections,
} from './state/rulesFilterPersistence'
import { useKeepUniquesGridFilterMode, sanitizeKeepUniquesGridFilterMode } from './state/keepUniquesPreferences'
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

const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

const NO_AUTO_APPLY: () => boolean = () => false

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

function splitMergedRules(rules: readonly HsfRuleWithCfg[]): { baseRules: HsfRuleWithCfg[]; finalSellRules: HsfRuleWithCfg[] } {
  const baseRules: HsfRuleWithCfg[] = []
  const finalSellRules: HsfRuleWithCfg[] = []
  for (const rule of rules) {
    if (rule.__source === RULE_SOURCE_HSF || rule.__source === RULE_SOURCE_KEEP_UNIQUES) {
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
  const { customCfgs, selectedCfgIdx, metasets, substatTargets, finalSellRemainder, logicHubDialogTab, hsfcNote, keepUniqueRules, keepUniquesEnabled } = useAppState()
  const customCfgsRef = useRef(customCfgs)
  useEffect(() => { customCfgsRef.current = customCfgs }, [customCfgs])
  const {
    setCustomCfgs,
    setSelectedCfgIdx: setSelectedCfgIdxRaw,
    setMetasets,
    setSubstatTargets,
    setFinalSellRemainder,
    setLogicHubDialogTab,
    setHsfcNote,
    setKeepUniqueRules,
    setKeepUniquesEnabled,
  } = useAppActions()
  const [keepUniquesGridFilterMode, setKeepUniquesGridFilterMode] = useKeepUniquesGridFilterMode()
  const { runPipeline, flush: flushRuleCache, countRules } = useRuleCacheWorker()
  const { statButtonBorders } = useDisplayPreferences()
  const [autoApplySelectedConfig] = useAutoApplySelectedConfigPreference()
  const { setStatButtonBorders } = useDisplayPreferenceActions()
  // Use a deferred snapshot so bursty substatTargets updates (e.g., Restore Defaults) coalesce before recomputing merged rules.
  const ruleConfigs = useMemo(() => configsForRuleBuild(customCfgs), [customCfgs])
  const configNames = useMemo(() => customCfgs.map((cfg) => (typeof cfg?.name === 'string' ? cfg.name : '')), [customCfgs])
  const configModes = useMemo(() => customCfgs.map((cfg) => cfg.exportMode), [customCfgs])
  const substatTargetsForPreview = useDeferredValue(substatTargets)
  const metasetsForPreview = useDeferredValue(metasets)
  const ruleConfigsForPreview = useDeferredValue(ruleConfigs)
  const configModesForPreview = useDeferredValue(configModes)
  const configNamesForPreview = useDeferredValue(configNames)
  // Keep tester math reusable so seeding hooks share the same normalization as the dialog.
  const testerMath = useMemo(() => createRuleTesterMath(substatTargets), [substatTargets])
  const lastConfigNamesRef = useRef<string[]>(configNamesForPreview)
  // Track the last dispatched pipeline so deferred snapshots cannot retrigger identical worker runs.
  const lastPipelineSignatureRef = useRef<{ fingerprint: string | null; artifactSig: string | null } | null>(null)
  const testerItemIdRef = useRef(1)
  const allocTesterItemId = useCallback(() => {
    const id = testerItemIdRef.current
    testerItemIdRef.current += 1
    return id
  }, [])
  // Raw JSON endpoints stream their own dataset; keep the normalized snapshot
  // cached so deltas can mutate it without rebuilding from SQL blobs.
  const gearDbRawDatasetRef = useRef<GearDbRawDataset | null>(null)
  const [testerItems, setTesterItems] = useState<RuleTesterItem[]>([])
  const testerItemsRef = useRef(testerItems)
  useEffect(() => { testerItemsRef.current = testerItems }, [testerItems])
  // Cache warm fingerprints so lightweight updates can skip a full rebuild.
  const lastWarmFingerprintRef = useRef<string | null>(null)
  // Stable metaset fingerprint keeps warm reuse keyed to the actual set payloads.
  const fingerprintMetasetsForRules = useCallback((metasetList: readonly Metaset[]): string => {
    const parts = metasetList
      .map((meta) => {
        const sortedSets = Array.isArray(meta.sets) ? [...meta.sets].map(Number).sort((a, b) => a - b) : []
        return `${meta.id}:${sortedSets.join(',')}`
      })
      .sort((a, b) => a.localeCompare(b))
    return parts.join('|')
  }, [])
  // Keep-unique rules get a canonical hash so cosmetic edits do not churn the cache.
  const fingerprintKeepUniqueRuleList = useCallback((rules: readonly KeepUniqueRule[]): string => {
    if (!rules.length) return ''
    return rules.map((rule) => {
      const comboHash = hashKeepUniqueCombination(rule.combination)
      const activation = rule.activation ?? KeepUniqueRuleActivation.ProtectExisting
      const required = Number.isFinite(rule.requiredCount) ? Number(rule.requiredCount) : 0
      const mode = sanitizeKeepUniqueCountMode(rule.countMode)
      const modeKey = [
        mode.perRule ? 1 : 0,
        mode.perSlot ? 1 : 0,
        mode.perSet ? 1 : 0,
        mode.perFaction ? 1 : 0,
        mode.perMainStat ? 1 : 0,
      ].join('')
      return `${rule.id ?? comboHash}:${activation}:${required}:${modeKey}:${comboHash}`
    }).join('|')
  }, [])
  // Combined fingerprint captures every input that affects the warmed rule cache while ignoring display-only fields.
  const buildRulesFingerprint = useCallback((args: {
    substatTargetsKey: string
    configKeys: string[]
    metasets: readonly Metaset[]
    hsf: HsfFile | null
    keepUniqueRules: readonly KeepUniqueRule[]
    keepUniquesEnabled: boolean
    finalSell: FinalSellRemainderConfig | null | undefined
  }): string => {
    const {
      substatTargetsKey,
      configKeys,
      metasets,
      hsf: hsfFile,
      keepUniqueRules,
      keepUniquesEnabled: kuEnabled,
      finalSell,
    } = args
    // Metaset + keep-unique signatures ensure warm reuse stays aligned with resolved datasets.
    const metasetSig = fingerprintMetasetsForRules(metasets)
    const keepUniqueSig = `${kuEnabled ? 'on' : 'off'}:${fingerprintKeepUniqueRuleList(keepUniqueRules)}`
    // Final-sell settings affect injected rules, so fold them into the warm fingerprint.
    const finalSellSig = (() => {
      if (!finalSell) return 'fs:none'
      const levels = Array.isArray(finalSell.levels)
        ? [...finalSell.levels].map(Number).sort((a, b) => a - b).join(',')
        : ''
      const mode = typeof finalSell.setsMode === 'string' ? finalSell.setsMode : 'any'
      const artifactsFlag = finalSell.artifacts ? 1 : 0
      const accessoriesFlag = finalSell.accessories ? 1 : 0
      return `fs:${mode}:${artifactsFlag}:${accessoriesFlag}:${levels}`
    })()
    const hsfSig = (() => {
      if (!hsfFile) return 'hsf:none'
      const hash = (hsfFile as { Hash?: string }).Hash
      if (hash) return `hsf:${hash}`
      const ruleCount = Array.isArray(hsfFile.Rules) ? hsfFile.Rules.length : 0
      return `hsf:rules:${ruleCount}`
    })()
    return [substatTargetsKey, configKeys.join(','), metasetSig, hsfSig, finalSellSig, keepUniqueSig].join('|')
  }, [fingerprintKeepUniqueRuleList, fingerprintMetasetsForRules])
  const [testerRestoreDraft, setTesterRestoreDraft] = useState<{
    items: RuleTesterItem[]
    savedAt: string | null
    count: number
  } | null>(() => {
    const draft = loadRuleTesterAutosaveDraft({ math: testerMath, allocItemId: allocTesterItemId })
    if (!draft) return null
    return { items: draft.items, savedAt: draft.savedAt, count: draft.itemCount }
  })
  type TesterArtifactCacheEntry = { fingerprint: string; artifact: NormalizedGearArtifact }
  // Rule tester champion filters reuse the same metadata as the tester grid to keep icons/borders in sync.
  type TesterChampionOption = {
    id: number
    baseId: number | null
    rarity: RankValue | null
    name: string | null
    location: ChampionLocation | null
    count: number
  }
  const testerArtifactCacheRef = useRef<Map<number, TesterArtifactCacheEntry>>(new Map())
  // Record the fingerprints the worker most recently acknowledged so differential patches only
  // send artifacts whose content actually changed (manual edits happen frequently).
  const lastCommittedArtifactFingerprintsRef = useRef<Map<number, string>>(new Map())
  const testerAutosaveBaselineRef = useRef<string | null>(null)
  const testerPreviewArtifacts = useMemo<NormalizedGearArtifact[]>(() => {
    const cache = testerArtifactCacheRef.current
    const next: NormalizedGearArtifact[] = []
    const activeItemIds = new Set<number>()
    testerItems.forEach((item, idx) => {
      const itemId = Number.isFinite(item.itemId)
        ? item.itemId
        : -(idx + 1)
      const fingerprint = fingerprintRuleTesterItem(item)
      const cached = cache.get(itemId)
      if (cached && cached.fingerprint === fingerprint) {
        next.push(cached.artifact)
        activeItemIds.add(itemId)
        return
      }
      try {
        const artifact = buildPreviewArtifactFromTesterItem(item, {
          fallbackId: Number.isFinite(item.itemId) ? -Math.abs(item.itemId) : undefined,
          subOrder: item.subOrder,
        })
        cache.set(itemId, { fingerprint, artifact })
        next.push(artifact)
        activeItemIds.add(itemId)
      } catch {
        cache.delete(itemId)
      }
    })
    if (cache.size > activeItemIds.size) {
      for (const key of Array.from(cache.keys())) {
        if (!activeItemIds.has(key)) {
          cache.delete(key)
        }
      }
    }
    return next
  }, [testerItems])
  const testerArtifactsSignature = useMemo(() => {
    const cache = testerArtifactCacheRef.current
    const previewArtifactCount = testerPreviewArtifacts.length
    // Fast-path empty caches so the dependency on testerPreviewArtifacts is meaningful without changing existing behavior.
    if (previewArtifactCount === 0 && cache.size === 0) return '0'
    // Build a stable signature based on the same SSOT fingerprint used by the artifact cache.
    // Why: the pipeline uses this signature to decide whether tester rows are stale.
    // Why: missing fields (e.g. faction, gear set) can otherwise skip rebuilds and leave stale UI.
    const entries = Array.from(cache.entries()).sort((a, b) => a[0] - b[0])
    let sig = `${entries.length}`
    for (const [itemId, entry] of entries) {
      // Keep the item id in the signature so reorderings and insertions are detectable.
      // Use the canonical per-item fingerprint so edits to faction/main/rank/etc invalidate rebuilds.
      sig += `|${itemId}:${entry.fingerprint}`
    }
    return sig
  }, [testerPreviewArtifacts])
  const getArtifactItemId = useCallback((artifact: NormalizedGearArtifact, fallbackIdx?: number): number | null => {
    const testerId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? NaN)
    if (Number.isFinite(testerId)) return testerId
    const artifactId = Number((artifact as { id?: number } | undefined)?.id ?? NaN)
    if (Number.isFinite(artifactId)) return artifactId
    if (typeof fallbackIdx === 'number') return -(fallbackIdx + 1)
    return null
  }, [])
  const [testerPreviewRows, setTesterPreviewRows] = useState<TesterPreviewRow[]>([])
  const testerPreviewRowsRef = useRef<TesterPreviewRow[]>([])
  useEffect(() => { testerPreviewRowsRef.current = testerPreviewRows }, [testerPreviewRows])
  const recoverMissingRulesRef = useRef(false)
  const testerMatchesByItemId = useMemo(() => {
    const map = new Map<number, TesterPreviewMatch | null>()
    for (const row of testerPreviewRows) {
      const itemId = Number((row.artifact.testerItem as RuleTesterItem | undefined)?.itemId ?? NaN)
      if (Number.isFinite(itemId)) {
        map.set(itemId, row.match)
      }
    }
    return map
  }, [testerPreviewRows])
  const [keepUniqueDetection, setKeepUniqueDetection] = useState<KeepUniqueDetectionSnapshot | null>(null)
  const [keepUniqueGroupItemKeys, setKeepUniqueGroupItemKeys] = useState<Set<number>>(new Set())
  const keepUniqueDetectionRef = useRef<KeepUniqueDetectionSnapshot | null>(keepUniqueDetection)
  useEffect(() => { keepUniqueDetectionRef.current = keepUniqueDetection }, [keepUniqueDetection])
  const keepUniqueDetectionSignature = useMemo(
    () => fingerprintKeepUniqueDetection(keepUniqueDetection),
    [keepUniqueDetection],
  )
  const keepUniqueScanAppliedRef = useRef<string | null>(null)
  const keepUniqueAppliedStateRef = useRef<{
    baseRules: readonly HsfRuleWithCfg[] | null
    rulesByConfig: ConfigRulesStateSnapshot['rulesByConfig'] | null
    finalSellRules: readonly HsfRuleWithCfg[] | null
  }>({
    baseRules: null,
    rulesByConfig: null,
    finalSellRules: null,
  })
  // Force a re-apply when the detection fingerprint changes so late DB loads still inject keep-unique rules.
  useEffect(() => {
    if (!keepUniqueDetectionSignature) return
    if (keepUniqueDetectionSignature !== keepUniqueScanAppliedRef.current) {
      keepUniqueAppliedStateRef.current = {
        baseRules: null,
        rulesByConfig: null,
        finalSellRules: null,
      }
    }
  }, [keepUniqueDetectionSignature])
  const pendingKeepUniqueDetectionSigRef = useRef<string | null>(null)
  const resetKeepUniqueDetectionState = useCallback(() => {
    keepUniqueScanAppliedRef.current = null
    pendingKeepUniqueDetectionSigRef.current = null
    keepUniqueAppliedStateRef.current = {
      baseRules: null,
      rulesByConfig: null,
      finalSellRules: null,
    }
    setKeepUniqueDetection(null)
  }, [setKeepUniqueDetection])
  const resolvedKeepUniqueRules = useMemo(() => (
    resolveKeepUniqueRulesWithMetasets(keepUniqueRules, metasets)
  ), [keepUniqueRules, metasets])
  const keepUniquesActive = keepUniquesEnabled && resolvedKeepUniqueRules.length > 0
  const [gearEntriesBuilding, setGearEntriesBuilding] = useState(false)
  const [gearEntriesCommittedBuildId, setGearEntriesCommittedBuildId] = useState(0)
  const [gearEntriesActiveBuildId, setGearEntriesActiveBuildId] = useState(0)
  // Track tester-row progress separately so the preview chips can show determinate progress.
  const [gearEntriesProgress, setGearEntriesProgress] = useState<ProgressSnapshot | null>(null)
  const gearEntriesBuildingRef = useRef(gearEntriesBuilding)
  useEffect(() => { gearEntriesBuildingRef.current = gearEntriesBuilding }, [gearEntriesBuilding])
  const gearEntriesCommittedBuildIdRef = useRef(gearEntriesCommittedBuildId)
  useEffect(() => { gearEntriesCommittedBuildIdRef.current = gearEntriesCommittedBuildId }, [gearEntriesCommittedBuildId])
  const testerMatchResetRef = useRef<{ reason: TesterMatchResetReason; targetBuildId: number; startedAt: number } | null>(null)
  const [testerMatchResetReason, setTesterMatchResetReason] = useState<TesterMatchResetReason | null>(null)
  // Track the last keep-unique structural signature so cosmetic edits do not retrigger the pipeline.
  const keepUniqueStructureSigRef = useRef<string | null>(null)
  const beginTesterMatchReset = useCallback((reason: TesterMatchResetReason) => {
    resetKeepUniqueDetectionState()
    const targetBuildId = gearEntriesActiveBuildId > gearEntriesCommittedBuildId
      ? gearEntriesActiveBuildId
      : gearEntriesCommittedBuildId + 1
    testerMatchResetRef.current = {
      reason,
      targetBuildId,
      startedAt: Date.now(),
    }
    setTesterMatchResetReason(reason)
  }, [resetKeepUniqueDetectionState, gearEntriesActiveBuildId, gearEntriesCommittedBuildId])
  const testerMatchDetailsFrozen = Boolean(testerMatchResetReason)
  useEffect(() => {
    if (!testerMatchResetReason) return
    let pending = testerMatchResetRef.current
    if (!pending || pending.reason !== testerMatchResetReason) {
      if (!pending) setTesterMatchResetReason(null)
      return
    }
    if (gearEntriesActiveBuildId > pending.targetBuildId) {
      pending = {
        ...pending,
        targetBuildId: gearEntriesActiveBuildId,
      }
      testerMatchResetRef.current = pending
    }
    if (!gearEntriesBuilding && gearEntriesCommittedBuildId >= pending.targetBuildId) {
      testerMatchResetRef.current = null
      setTesterMatchResetReason(null)
      return
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const handleResetCheck = () => {
      const current = testerMatchResetRef.current
      if (!current || current.reason !== testerMatchResetReason) return
      if (gearEntriesBuildingRef.current) {
        timeoutId = setTimeout(handleResetCheck, TESTER_MATCH_RESET_TIMEOUT_MS)
        return
      }
      const committed = gearEntriesCommittedBuildIdRef.current
      if (committed >= current.targetBuildId) {
        testerMatchResetRef.current = null
        setTesterMatchResetReason(null)
        return
      }
      testerMatchResetRef.current = null
      setTesterMatchResetReason(null)
    }
    timeoutId = setTimeout(handleResetCheck, TESTER_MATCH_RESET_TIMEOUT_MS)
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [testerMatchResetReason, gearEntriesCommittedBuildId, gearEntriesBuilding, gearEntriesActiveBuildId])
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
  // Track metaset references across Keep Unique rules (counting each rule once) so
  // the UI can surface Keep Unique dependencies separately from config usage.
  const keepUniqueMetasetUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const rule of keepUniqueRules) {
      // Treat a rule that references the same metaset multiple times as a single hit
      // so the overlay reflects “number of rules” rather than raw ID frequency.
      const metaIds = Array.from(new Set(rule.combination.metaSetIds ?? []))
      if (!metaIds.length) continue
      for (const metaId of metaIds) {
        counts[metaId] = (counts[metaId] ?? 0) + 1
      }
    }
    return counts
  }, [keepUniqueRules])
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
      keepUniques: {
        enabled: keepUniquesActive,
        rules: resolvedKeepUniqueRules,
        detection: keepUniquesActive ? keepUniqueDetection : null,
      },
    })
      const { baseRules, finalSellRules } = splitMergedRules(mergedRules)
      if (keepUniquesActive && keepUniqueDetection) {
        // Seed applied-state refs so the detection effect knows this snapshot already includes the scan results.
        keepUniqueAppliedStateRef.current = {
          baseRules,
          rulesByConfig: initial.rulesByConfig,
          finalSellRules,
        }
        keepUniqueScanAppliedRef.current = fingerprintKeepUniqueDetection(keepUniqueDetection)
      }
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
  const configRulesStateRef = useRef(configRulesState)
  useEffect(() => { configRulesStateRef.current = configRulesState }, [configRulesState])
  const [rulesBuilding, setRulesBuilding] = useState(false)
  // Persist the current warm-cache snapshot so the preview chip can render an overlay.
  const [rulesBuildProgress, setRulesBuildProgress] = useState<ProgressSnapshot | null>(null)
  // Shared spinner ratio merges both rule + tester builders so the UI has a single busy signal.
  const [workloadProgressRatio, setWorkloadProgressRatio] = useState(0)
  const workloadSpinnerHangTimeoutRef = useRef<number | null>(null)
  const rulesWorkloadRatio = rulesBuilding ? clampProgressRatio(rulesBuildProgress) : 0
  const testerWorkloadRatio = gearEntriesBuilding ? clampProgressRatio(gearEntriesProgress) : 0
  const workloadDeterminateRatio = Math.max(rulesWorkloadRatio, testerWorkloadRatio)
  const workloadBusy = rulesBuilding || gearEntriesBuilding
  // Freeze config names to the last committed snapshot while rows build so displayed indices do not shift mid-run.
  const configNamesForGrid = useMemo(
    () => ((rulesBuilding || gearEntriesBuilding) ? lastConfigNamesRef.current : configNamesForPreview),
    [rulesBuilding, gearEntriesBuilding, configNamesForPreview],
  )
  // Keep tester chip labels in sync with the frozen config-name snapshot so chips never display mid-build indices.
  const testerConfigNamesForGrid = useMemo(() => configNamesForGrid.map((name) => {
    if (typeof name !== 'string') return null
    const trimmed = name.trim()
    return trimmed.length > 0 ? trimmed : null
  }), [configNamesForGrid])
  const restoringAutosaveRef = useRef(false)
  useEffect(() => {
    // Hang the spinner through idle gaps so sequence builds do not flash the chip.
    const clearHangTimeout = () => {
      if (workloadSpinnerHangTimeoutRef.current !== null) {
        window.clearTimeout(workloadSpinnerHangTimeoutRef.current)
        workloadSpinnerHangTimeoutRef.current = null
      }
    }
    if (workloadBusy) {
      clearHangTimeout()
      setWorkloadProgressRatio(Math.max(workloadDeterminateRatio, WORKLOAD_PENDING_MIN_RATIO))
      return () => {
        clearHangTimeout()
      }
    }
    clearHangTimeout()
    workloadSpinnerHangTimeoutRef.current = window.setTimeout(() => {
      workloadSpinnerHangTimeoutRef.current = null
      setWorkloadProgressRatio(0)
    }, WORKLOAD_SPINNER_HANG_MS)
    return () => {
      clearHangTimeout()
    }
  }, [workloadBusy, workloadDeterminateRatio])
  const rulesBuildingTokenRef = useRef<number | null>(null)
  // Track the active pipeline abort controller so we can cancel if needed.
  const pipelineAbortRef = useRef<AbortController | null>(null)
  const pipelineDebounceRef = useRef<number | null>(null)
  useEffect(() => {
    const abortController = new AbortController()
    pipelineAbortRef.current = abortController
    const prevState = configRulesStateRef.current
    const prevMatches = testerPreviewRowsRef.current
    const prevConfigNames = lastConfigNamesRef.current
    // Prefer live snapshots whenever deferred previews lag so fingerprints match the payload we send to the worker.
    const previewConfigsStale = (
      ruleConfigsForPreview.length !== ruleConfigs.length
      || ruleConfigsForPreview.some((cfg, idx) => cfg !== ruleConfigs[idx])
    )
    const configsForBuild = previewConfigsStale ? ruleConfigs : ruleConfigsForPreview
    // Align config-name snapshots with the config payload so match chips stay in sync.
    // Align config-name snapshot with the config payload so cfgIdx remaps stay deterministic.
    const previewNamesStale = (
      configNamesForPreview.length !== configNames.length
      || configNamesForPreview.some((name, idx) => name !== configNames[idx])
    )
    const configNamesForBuild = previewNamesStale ? configNames : configNamesForPreview
    // Config modes gate disabled/separator configs during matcher eval, so keep the snapshot aligned with the builder payload.
    const previewModesStale = (
      configModesForPreview.length !== configModes.length
      || configModesForPreview.some((mode, idx) => mode !== configModes[idx])
    )
    const configModesForBuild = previewModesStale ? configModes : configModesForPreview
    // Artifact signature drives match reuse; keep it alongside the fingerprint so duplicate builds can bail quickly.
    const pipelineArtifactSignature = testerArtifactsSignature
    // Mirror metasets and substat targets to the same snapshot to avoid stale warm fingerprints.
    const previewMetasetsStale = (
      metasetsForPreview.length !== metasets.length
      || metasetsForPreview.some((meta, idx) => meta !== metasets[idx])
    )
    const metasetsForBuild = previewMetasetsStale ? metasets : metasetsForPreview
    const substatTargetsForBuild = substatTargetsForPreview === substatTargets
      ? substatTargets
      : (substatTargetsForPreview ?? substatTargets)
    // Use the build-aligned snapshot for key comparisons so reorders are detected even if deferred previews lag.
    const nextSubstatTargetsKey = fingerprintSubstatTargets(substatTargetsForBuild)
    const nextConfigKeys = configsForBuild.map((cfg) => fingerprintConfigForRules(cfg, nextSubstatTargetsKey))
    const keepUniqueStructureSig = fingerprintKeepUniqueRuleList(resolvedKeepUniqueRules)
    const nextFingerprint = buildRulesFingerprint({
      substatTargetsKey: nextSubstatTargetsKey,
      configKeys: nextConfigKeys,
      metasets: metasetsForBuild,
      hsf,
      keepUniqueRules: resolvedKeepUniqueRules,
      keepUniquesEnabled,
      finalSell: finalSellRemainder,
    })
    // If the warmed state already covers this fingerprint, skip the worker warm pass and avoid toggling spinners.
    const canSkipWarm = lastWarmFingerprintRef.current === nextFingerprint
    // Name-only edits should not wake the worker; detect them explicitly.
    const configNamesChanged = (() => {
      if (prevConfigNames.length !== configNamesForBuild.length) return true
      for (let i = 0; i < configNamesForBuild.length; i += 1) {
        if (configNamesForBuild[i] !== prevConfigNames[i]) return true
      }
      return false
    })()
    // Artifact signature drift signals that the tester payload meaningfully changed.
    const artifactsChanged = !lastPipelineSignatureRef.current
      || lastPipelineSignatureRef.current.artifactSig !== pipelineArtifactSignature
    // When the preview empties out we need to purge the worker's artifact cache explicitly;
    // otherwise, stale cached artifacts would keep producing keep-unique rows.
    const workerNeedsReset = testerPreviewArtifacts.length === 0
      && lastPipelineSignatureRef.current?.artifactSig !== pipelineArtifactSignature
      && lastPipelineSignatureRef.current?.artifactSig !== undefined
      && lastPipelineSignatureRef.current?.artifactSig !== null
    // Skip redundant pipelines when deferred snapshots catch up without changing the rule or artifact signatures.
    if (
      canSkipWarm
      && !configNamesChanged
      && lastPipelineSignatureRef.current
      && lastPipelineSignatureRef.current.fingerprint === nextFingerprint
      && lastPipelineSignatureRef.current.artifactSig === pipelineArtifactSignature
      && !workerNeedsReset
    ) {
      keepUniqueStructureSigRef.current = keepUniqueStructureSig
      return () => {
        abortController.abort()
        if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
      }
    }
    const buildIndexMapping = (previousKeys: string[], nextKeys: string[]): number[] | null => {
      if (previousKeys.length !== nextKeys.length) return null
      const buckets = new Map<string, number[]>()
      previousKeys.forEach((key, idx) => {
        const list = buckets.get(key) ?? []
        list.push(idx)
        buckets.set(key, list)
      })
      const mapping: number[] = []
      for (const key of nextKeys) {
        const list = buckets.get(key)
        if (!list || list.length === 0) return null
        const sourceIdx = list.shift()!
        mapping.push(sourceIdx)
      }
      return mapping
    }
    const mapping = prevState
      && prevState.substatTargetsKey === nextSubstatTargetsKey
      ? buildIndexMapping(prevState.keys, nextConfigKeys)
      : null
    const hasArtifacts = testerPreviewArtifacts.length > 0

    if (!artifactsChanged && canSkipWarm && configNamesChanged && prevMatches.length > 0) {
      // Names changed but rule fingerprints are stable; update cached rows without rebuilding.
      const updatedRows = prevMatches.map((row) => {
        const remapName = (cfgIdx: number | null): string | null => {
          if (cfgIdx == null) return null
          return configNamesForBuild[cfgIdx] ?? null
        }
        return {
          ...row,
          match: row.match ? { ...row.match, cfgName: remapName(row.match.cfgIdx) } : null,
          baseMatch: row.baseMatch ? { ...row.baseMatch, cfgName: remapName(row.baseMatch.cfgIdx) } : null,
        }
      })
      setTesterPreviewRows(sortTesterRows(updatedRows))
      lastConfigNamesRef.current = configNamesForBuild
      return () => {
        abortController.abort()
        if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
      }
    }

    if (
      !artifactsChanged
      && !restoringAutosaveRef.current
      && mapping
      && mapping.some((idx, newIdx) => idx !== newIdx)
      && !hasArtifacts
    ) {
      // Fast path: reorder-only changes can remap cached rules without waking the worker.
      const inverse = new Map<number, number>()
      mapping.forEach((prevIdx, newIdx) => { inverse.set(prevIdx, newIdx) })
      const remapRulesForIndex = (rules: readonly HsfRuleWithCfg[], newIdx: number): HsfRuleWithCfg[] => (
        rules.map((rule) => cloneRuleWithConfigIndex(rule, newIdx))
      )
      const newRulesByConfig = new Map<number, HsfRuleWithCfg[]>()
      const newCountsByConfig = new Map<number, number>()
      const newTruncated: number[] = []
      const newExcluded: number[] = []
      const prevTruncated = new Set(prevState.truncatedConfigIndices)
      const prevExcluded = new Set(prevState.excludedByTotalLimitIndices)
      const customSegments: HsfRuleWithCfg[][] = []
      for (let newIdx = 0; newIdx < mapping.length; newIdx += 1) {
        const prevIdx = mapping[newIdx]!
        const prevRules = prevState.rulesByConfig.get(prevIdx) ?? []
        const remapped = remapRulesForIndex(prevRules, newIdx)
        newRulesByConfig.set(newIdx, remapped)
        customSegments.push(remapped)
        const prevCount = prevState.countsByConfig.get(prevIdx)
        if (prevTruncated.has(prevIdx)) {
          newCountsByConfig.set(newIdx, Number.POSITIVE_INFINITY)
          newTruncated.push(newIdx)
        } else {
          newCountsByConfig.set(newIdx, typeof prevCount === 'number' ? prevCount : remapped.length)
        }
        if (prevExcluded.has(prevIdx)) newExcluded.push(newIdx)
      }
      const mergedRules = prevState.baseRules.concat(...customSegments, prevState.finalSellRules)
      const ruleMatchIndex = buildRuleMatchIndexData(mergedRules)
      primeRuleMatchIndex(mergedRules, ruleMatchIndex)
      setConfigRulesState({
        ...prevState,
        rulesByConfig: newRulesByConfig,
        countsByConfig: newCountsByConfig,
        keys: nextConfigKeys,
        substatTargetsKey: nextSubstatTargetsKey,
        mergedRules,
        truncatedConfigIndices: newTruncated,
        excludedByTotalLimitIndices: newExcluded,
      })
      keepUniqueAppliedStateRef.current = {
        baseRules: prevState.baseRules,
        rulesByConfig: newRulesByConfig,
        finalSellRules: prevState.finalSellRules,
      }
      lastWarmFingerprintRef.current = nextFingerprint
      // Avoid flashing the preview spinner when we served this entirely from the cache.
      setRulesBuilding(false)
      setGearEntriesBuilding(false)
      setRulesBuildProgress(null)
      setGearEntriesProgress(null)
      if (prevMatches && prevMatches.length > 0) {
        const remapCfgIdx = (cfgIdx: number | null): number | null => {
          if (cfgIdx == null) return null
          const nextIdx = inverse.get(cfgIdx)
          return typeof nextIdx === 'number' ? nextIdx : null
        }
        const remapDecision = (decision: MatchingConfigDecision): MatchingConfigDecision => {
          const nextIdx = remapCfgIdx(decision.cfgIdx)
          const cfgIdx = typeof nextIdx === 'number' ? nextIdx : decision.cfgIdx
          return { ...decision, cfgIdx }
        }
        const remappedRows = prevMatches.map((row) => ({
          ...row,
          match: (() => {
            if (!row.match) return null
            const nextIdx = remapCfgIdx(row.match.cfgIdx)
            const nextName = nextIdx != null ? configNamesForBuild[nextIdx] ?? null : null
            return { ...row.match, cfgIdx: nextIdx, cfgName: nextName }
          })(),
          baseMatch: (() => {
            if (!row.baseMatch) return null
            const nextIdx = remapCfgIdx(row.baseMatch.cfgIdx)
            const nextName = nextIdx != null ? configNamesForBuild[nextIdx] ?? null : null
            return { ...row.baseMatch, cfgIdx: nextIdx, cfgName: nextName }
          })(),
          matchingCfgIndices: row.matchingCfgIndices.map((idx) => {
            const nextIdx = inverse.get(idx)
            return typeof nextIdx === 'number' ? nextIdx : idx
          }),
          matchingConfigDecisions: (row.matchingConfigDecisions ?? []).map(remapDecision),
        }))
        setTesterPreviewRows(sortTesterRows(remappedRows))
      }
      lastConfigNamesRef.current = configNamesForBuild
      return () => {
        abortController.abort()
        if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
      }
    }

    const launchPipeline = () => {
      const requestToken = (rulesBuildingTokenRef.current ?? 0) + 1
      rulesBuildingTokenRef.current = requestToken
      setGearEntriesActiveBuildId(requestToken)
      setRulesBuilding(true)
      setGearEntriesBuilding(true)
      setRulesBuildProgress(null)
      setGearEntriesProgress(null)

      const keepUniquesPayload = {
        enabled: keepUniquesEnabled && resolvedKeepUniqueRules.length > 0,
        rules: resolvedKeepUniqueRules,
        detection: null as KeepUniqueDetectionSnapshot | null,
      }
      const {
        patch: artifactPatch,
        fingerprints: nextArtifactFingerprints,
      } = (() => {
        const cache = testerArtifactCacheRef.current
        const prevFingerprints = lastCommittedArtifactFingerprintsRef.current
        const nextFingerprints = new Map<number, string>()
        const changed: Array<[number, NormalizedGearArtifact]> = []
        const removed: number[] = []
        // Only compute a diff when the worker previously accepted fingerprints and the cache
        // isn't being flushed; the first warm still sends the full artifact list.
        const diffOnly = prevFingerprints.size > 0 && !workerNeedsReset
        for (let idx = 0; idx < testerPreviewArtifacts.length; idx += 1) {
          const artifact = testerPreviewArtifacts[idx]
          if (!artifact) continue
          const itemId = getArtifactItemId(artifact, idx)
          if (!Number.isFinite(itemId)) continue
          const cached = cache.get(itemId!)
          const testerPayload = artifact.testerItem as RuleTesterItem | undefined
          const fingerprint = cached?.fingerprint ?? (testerPayload ? fingerprintRuleTesterItem(testerPayload) : '')
          nextFingerprints.set(itemId!, fingerprint ?? '')
          if (!diffOnly || prevFingerprints.get(itemId!) !== fingerprint) {
            changed.push([itemId!, artifact])
          }
        }
        prevFingerprints.forEach((_, itemId) => {
          if (!nextFingerprints.has(itemId)) removed.push(itemId)
        })
        return {
          patch: { changed, removed, signature: testerArtifactsSignature },
          fingerprints: nextFingerprints,
        }
      })()

      const toPreviewMatch = (
        result: TesterMatchWorkerItemResult['firstMatch'],
        rules: readonly HsfRuleWithCfg[],
      ): TesterPreviewMatch | null => {
        if (!result) return null
        const rule = rules[result.ruleIndex]
        const cfgIdx = result.cfgIdx ?? null
        const cfgName = resolveMatchConfigName(cfgIdx, configNamesForBuild, rule)
        const keepUniqueLabel = rule?.__source === RULE_SOURCE_KEEP_UNIQUES
          ? resolveKeepUniqueRuleLabel(rule)
          : null
        const effectiveCfgName = cfgName && cfgName.length > 0 ? cfgName : keepUniqueLabel
        return {
          ruleIndex: result.ruleIndex,
          keep: result.keep,
          cfgIdx,
          cfgName: effectiveCfgName && effectiveCfgName.length > 0 ? effectiveCfgName : null,
          ruleLabel: keepUniqueLabel ?? null,
          ruleSource: rule?.__source ?? null,
        }
      }

      // Guard against empty deferred snapshots on first load by falling back to immediate state.
      // Avoid empty payloads on first render by falling back to immediate snapshots when deferred values lag.
      const configsForPipeline = configsForBuild
      const metasetsForPipeline = metasetsForBuild
      const substatTargetsForPipeline = substatTargetsForBuild
      const pipelinePayload: Parameters<typeof runPipeline>[0] = {
        configs: configsForPipeline,
        metasets: metasetsForPipeline,
        substatTargets: substatTargetsForPipeline,
        hsf,
        ...(finalSellRemainder ? { finalSellRemainder } : {}),
        keepUniques: keepUniquesPayload,
        configModes: configModesForBuild,
        artifacts: [],
        artifactPatch,
        artifactSignature: testerArtifactsSignature,
        fingerprint: nextFingerprint,
        skipWarm: canSkipWarm,
        skipMatches: false,
        skipDetection: false,
        resetArtifacts: workerNeedsReset,
      }

      lastPipelineSignatureRef.current = { fingerprint: nextFingerprint, artifactSig: pipelineArtifactSignature }
      // One pipeline invocation per update after early fast paths.
      runPipeline(pipelinePayload, {
        signal: abortController.signal,
        onProgress: (progress) => {
          if (requestToken !== rulesBuildingTokenRef.current) return
          setRulesBuildProgress(progress)
          setGearEntriesProgress(progress)
        },
      })
        .then((result) => {
          const { state, matches, detection } = result
          if (abortController.signal.aborted || requestToken !== rulesBuildingTokenRef.current) return
          lastWarmFingerprintRef.current = nextFingerprint
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
          setConfigRulesState(snapshot)
          keepUniqueAppliedStateRef.current = {
            baseRules,
            rulesByConfig: state.rulesByConfig,
            finalSellRules,
          }
          keepUniqueStructureSigRef.current = keepUniqueStructureSig
          const matchMap = new Map<number, TesterMatchWorkerItemResult>()
          for (const entry of matches) {
            if (!entry) continue
            matchMap.set(entry.itemId, entry)
          }
          const rows: TesterPreviewRow[] = []
          const artifactEntries = testerPreviewArtifacts.map((artifact, idx) => [getArtifactItemId(artifact, idx), artifact] as [number | null, NormalizedGearArtifact])
          for (const [itemIdMaybe, artifact] of artifactEntries) {
            if (!artifact) continue
            const itemId = Number(itemIdMaybe ?? NaN)
            if (!Number.isFinite(itemId)) continue
            const matchEntry = matchMap.get(itemId)
            const match = toPreviewMatch(matchEntry?.firstMatch ?? null, state.mergedRules)
            const baseMatch = toPreviewMatch(matchEntry?.firstNonExcludedMatch ?? null, state.mergedRules)
            rows.push({
              artifact,
              match,
              baseMatch,
              matchingCfgIndices: matchEntry?.matchingConfigIndices ?? [],
              matchingConfigDecisions: matchEntry?.matchingConfigDecisions ?? [],
            })
          }
          setTesterPreviewRows(sortTesterRows(rows))
          setGearEntriesCommittedBuildId(requestToken)
          setGearEntriesActiveBuildId(requestToken)
          const uniqueKeys = new Set<number>()
          if (detection?.entries) {
            for (const entry of detection.entries) {
              if (!entry) continue
              for (const key of entry.itemKeys) uniqueKeys.add(key)
            }
          }
          setKeepUniqueDetection(detection ?? null)
          setKeepUniqueGroupItemKeys(uniqueKeys)
          // Persist the latest worker-acknowledged fingerprints so the next patch knows which
          // artifacts can be skipped safely.
          lastCommittedArtifactFingerprintsRef.current = nextArtifactFingerprints
          keepUniqueScanAppliedRef.current = detection ? fingerprintKeepUniqueDetection(detection) : null
          pendingKeepUniqueDetectionSigRef.current = null
          lastPipelineSignatureRef.current = { fingerprint: nextFingerprint, artifactSig: pipelineArtifactSignature }
          lastConfigNamesRef.current = configNamesForBuild
          if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
          const totalCustomRules = Array.from(state.countsByConfig.values()).reduce((acc, val) => (
            acc + (Number.isFinite(val) ? Number(val) : 0)
          ), 0)
          // Rare restore edge: if nothing built but configs exist, force a fresh warm+match once.
          const shouldRetryWarm = baseRules.length === 0
            && totalCustomRules === 0
            && configsForPipeline.length > 0
            && !recoverMissingRulesRef.current
          if (shouldRetryWarm) {
            recoverMissingRulesRef.current = true
            // Force a full warm/match pass so restored configs cannot get stuck empty.
            runPipeline(
              {
                ...pipelinePayload,
                artifacts: [],
                skipWarm: false,
                fingerprint: null,
              },
              {
                signal: abortController.signal,
                onProgress: (progress) => {
                  if (requestToken !== rulesBuildingTokenRef.current) return
                  setRulesBuildProgress(progress)
                  setGearEntriesProgress(progress)
                },
              },
            )
              .then((retryResult) => {
                if (abortController.signal.aborted || requestToken !== rulesBuildingTokenRef.current) return
                recoverMissingRulesRef.current = false
                lastWarmFingerprintRef.current = retryResult.fingerprint ?? null
                // Re-run the success handler with the retried payload.
                const { state: retryState, matches: retryMatches, detection: retryDetection } = retryResult
                const splitRetry = splitMergedRules(retryState.mergedRules)
                setConfigRulesState({
                  baseRules: splitRetry.baseRules,
                  finalSellRules: splitRetry.finalSellRules,
                  rulesByConfig: retryState.rulesByConfig,
                  countsByConfig: retryState.countsByConfig,
                  keys: retryState.keys,
                  substatTargetsKey: retryState.substatTargetsKey,
                  mergedRules: retryState.mergedRules,
                  truncatedConfigIndices: retryState.truncatedConfigIndices,
                  totalLimitHit: retryState.totalLimitHit,
                  excludedByTotalLimitIndices: retryState.excludedByTotalLimitIndices,
                })
                keepUniqueAppliedStateRef.current = {
                  baseRules: splitRetry.baseRules,
                  rulesByConfig: retryState.rulesByConfig,
                  finalSellRules: splitRetry.finalSellRules,
                }
                const retryMap = new Map<number, TesterMatchWorkerItemResult>()
                for (const entry of retryMatches) retryMap.set(entry.itemId, entry)
                const retryRows: TesterPreviewRow[] = []
                const entries = testerPreviewArtifacts.map((artifact, idx) => [getArtifactItemId(artifact, idx), artifact] as [number | null, NormalizedGearArtifact])
                for (const [itemIdMaybe, artifact] of entries) {
                  if (!artifact) continue
                  const itemId = Number(itemIdMaybe ?? NaN)
                  if (!Number.isFinite(itemId)) continue
                  const matchEntry = retryMap.get(itemId)
                  const match = toPreviewMatch(matchEntry?.firstMatch ?? null, retryState.mergedRules)
                  const baseMatch = toPreviewMatch(matchEntry?.firstNonExcludedMatch ?? null, retryState.mergedRules)
                  retryRows.push({
                    artifact,
                    match,
                    baseMatch,
                    matchingCfgIndices: matchEntry?.matchingConfigIndices ?? [],
                    matchingConfigDecisions: matchEntry?.matchingConfigDecisions ?? [],
                  })
                }
                setTesterPreviewRows(sortTesterRows(retryRows))
                setGearEntriesCommittedBuildId(requestToken)
                setGearEntriesActiveBuildId(requestToken)
                const retryUniqueKeys = new Set<number>()
                if (retryDetection?.entries) {
                  for (const entry of retryDetection.entries) {
                    if (!entry) continue
                    for (const key of entry.itemKeys) retryUniqueKeys.add(key)
                  }
                }
                setKeepUniqueDetection(retryDetection ?? null)
                setKeepUniqueGroupItemKeys(retryUniqueKeys)
                keepUniqueScanAppliedRef.current = retryDetection ? fingerprintKeepUniqueDetection(retryDetection) : null
                pendingKeepUniqueDetectionSigRef.current = null
                // Retry path accepts the same snapshot, so propagate the pending fingerprints as well.
                lastCommittedArtifactFingerprintsRef.current = nextArtifactFingerprints
                lastPipelineSignatureRef.current = { fingerprint: nextFingerprint, artifactSig: pipelineArtifactSignature }
                lastConfigNamesRef.current = configNamesForBuild
              })
              .catch(() => {
                if (abortController.signal.aborted) return
              })
            return
          }
          recoverMissingRulesRef.current = false
        })
        .catch(() => {
          if (abortController.signal.aborted) return
        })
        .finally(() => {
          if (requestToken !== rulesBuildingTokenRef.current) return
          setRulesBuilding(false)
          setGearEntriesBuilding(false)
          setRulesBuildProgress(null)
          setGearEntriesProgress(null)
        })
    }

    // Debounce pipeline launches to avoid restarting on every keystroke/config tweak.
    if (pipelineDebounceRef.current !== null) window.clearTimeout(pipelineDebounceRef.current)
    pipelineDebounceRef.current = window.setTimeout(() => {
      pipelineDebounceRef.current = null
      launchPipeline()
    }, PIPELINE_DEBOUNCE_MS)

    return () => {
      if (pipelineDebounceRef.current !== null) {
        window.clearTimeout(pipelineDebounceRef.current)
        pipelineDebounceRef.current = null
      }
      abortController.abort()
      if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
    }
  }, [
    runPipeline,
    ruleConfigs,
    ruleConfigsForPreview,
    configNames,
    metasets,
    metasetsForPreview,
    substatTargets,
    substatTargetsForPreview,
    hsf,
    finalSellRemainder,
    keepUniquesEnabled,
    resolvedKeepUniqueRules,
    configModes,
    configModesForPreview,
    testerPreviewArtifacts,
    testerArtifactsSignature,
    configNamesForPreview,
    getArtifactItemId,
    buildRulesFingerprint,
    fingerprintKeepUniqueRuleList,
  ])

  const awaitRuleCounts = useCallback((): { token: number; promise: Promise<Map<number, number>> } | null => null, [])
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
  const { t, lang, registerRuntimeCatalog } = useI18n()
  // Subscribe to runtime gear-set catalog changes so any consumers refresh.
  // Why: drag/drop patches must re-render chips/selects immediately.
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  // Read the persisted runtime-set count once at boot.
  // Why: restore dialog needs to know whether to offer the Gear Sets checkbox.
  const initialRuntimeGearSetCount = useMemo(() => getPersistedRuntimeGearSetCount(), [])
  // Track current persisted count (not in-memory) for dialog display.
  // Why: runtime sets stay dormant until user opts in.
  const [storedRuntimeGearSetCount, setStoredRuntimeGearSetCount] = useState(initialRuntimeGearSetCount)
  useEffect(() => {
    // Refresh the persisted count whenever the runtime catalog changes.
    // Why: importing/clearing runtime sets rewrites localStorage snapshots.
    setStoredRuntimeGearSetCount(getPersistedRuntimeGearSetCount())
  }, [gearSetCatalogVersion])
  const persistRuntimeGearSetsNow = useCallback(() => {
    // Persist the *current in-memory* runtime registry to localStorage.
    // Why: this is the only time we mutate storage after a restore decision.
    persistRuntimeGearSetsSnapshot()
    // Mirror the new persisted count so the next restore prompt stays accurate.
    setStoredRuntimeGearSetCount(listRuntimeGearSets().length)
  }, [])
  const testerFinalSellLabel = t('testerFinalSellChip')
  const specialRuleSourceLabels = useMemo(() => {
    const trimmed = testerFinalSellLabel.trim()
    return trimmed.length > 0
      ? { [RULE_SOURCE_FINAL_SELL]: [trimmed] }
      : {}
  }, [testerFinalSellLabel])
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
  const [previewSelectedCfgIdx, setPreviewSelectedCfgIdx] = useState<number | null>(selectedCfgIdx)
  useEffect(() => {
    startTransition(() => {
      setPreviewSelectedCfgIdx(selectedCfgIdx)
    })
  }, [selectedCfgIdx])
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
  const logicHubOpenRef = useRef(false)
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
    keepUniqueRules,
    keepUniquesEnabled,
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
    setKeepUniqueRules,
    setKeepUniquesEnabled,
    setHsfcNote,
    setSelectedCfgIdx: setSelectedCfgIdxRaw,
    setSelectedCfgIndices,
    setSelectionAnchor,
    setBuilder,
    setBuilderNameDraft: () => {},
    setBuilderNameDraftKey: () => {},
    setMultiEditDraft: setMultiEditDraftState,
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
    autoApplySelectedConfig,
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
      if (!logicHubOpenRef.current) {
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
      if (!logicHubOpenRef.current) {
        describeNextChange(descriptor ?? null)
      }
      return descriptor ?? null
    }
    if (logicHubOpenRef.current) {
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
  // Command push feedback needs its own lightweight toast so the global snackbar stays unobtrusive.
  const [gearDbCommandToast, setGearDbCommandToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null)
  // Small helper centralizes toast creation so every command path feels consistent.
  const showGearDbCommandToast = useCallback((message: string, severity: 'success' | 'error') => {
    setGearDbCommandToast({ message, severity })
  }, [])
  // Shared closer lets timers and manual dismissals reuse a single path.
  const dismissGearDbCommandToast = useCallback(() => {
    setGearDbCommandToast(null)
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
  const gearImportBusyCountRef = useRef(0)
  const beginGearImport = useCallback(() => {
    gearImportBusyCountRef.current += 1
    setGearImportBusy(true)
  }, [])
  const endGearImport = useCallback(() => {
    gearImportBusyCountRef.current = Math.max(0, gearImportBusyCountRef.current - 1)
    if (gearImportBusyCountRef.current === 0) {
      setGearImportBusy(false)
    }
  }, [])
  // Determine once whether to auto-open the README on this version.
  // External focus target for preview table (exact rule index in the effective rules array)
  const [focusRuleIndex, setFocusRuleIndex] = useState<number | null>(null)
  const [logicHubOpen, setLogicHubOpen] = useState<boolean>(false)
  const flushTransientUi = useCallback(() => {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } catch {}
  }, [])
  logicHubOpenRef.current = logicHubOpen
  if (!logicHubOpen) {
    finalSellHistorySessionRef.current = 'idle'
    finalSellSessionBaselineRef.current = null
    finalSellSessionModeRef.current = null
  }
  // View-only rules filter state
  const [filterOpen, setFilterOpenRaw, filterOpenByMode] = useRulesFilterOpenPreference(previewMode)
  const [rulesFilter, setRulesFilterRaw, rulesFilterByMode] = useRulesFilterStatePreference(previewMode)
  const [filterCollapsed, setFilterCollapsedRaw, filterCollapsedByMode] = useRulesFilterCollapsedPreference(previewMode)
  const [filtersSynced, setFiltersSyncedRaw] = useRulesFilterSyncPreference()
  // Rule Tester substat sorting is view-only but should persist across sessions like filters.
	  const testerSubstatSortPrefs = useTesterSubstatSortPreferences()
	  const testerSubstatSortSpec = useMemo(() => {
	    const priorities = testerSubstatSortPrefs.state.priorities
	    if (!priorities.length) return null
	    return {
	      priorities,
	      direction: testerSubstatSortPrefs.state.direction,
	      flipped: testerSubstatSortPrefs.state.flipped,
	      excludeGlyphs: testerSubstatSortPrefs.state.excludeGlyphs,
	    }
	  }, [
	    testerSubstatSortPrefs.state.direction,
	    testerSubstatSortPrefs.state.excludeGlyphs,
	    testerSubstatSortPrefs.state.flipped,
	    testerSubstatSortPrefs.state.priorities,
	  ])
  const testerRulesFilter = useMemo(() => normalizeRulesFilterForTester(rulesFilter), [rulesFilter])
  const setFilterOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    if (filtersSynced) {
      const resolved = typeof next === 'function' ? (next as (prev: boolean) => boolean)(filterOpen) : Boolean(next)
      for (const mode of RULES_FILTER_PREVIEW_MODES) {
        setRulesFilterOpenForMode(mode, resolved)
      }
    } else {
      setFilterOpenRaw(next)
    }
  }, [filtersSynced, filterOpen, setFilterOpenRaw])
  const setRulesFilter = useCallback((next: RulesFilterState | ((prev: RulesFilterState) => RulesFilterState)) => {
    if (filtersSynced) {
      const resolved = typeof next === 'function' ? (next as (prev: RulesFilterState) => RulesFilterState)(rulesFilter) : next
      for (const mode of RULES_FILTER_PREVIEW_MODES) {
        setRulesFilterStateForMode(mode, resolved)
      }
    } else {
      setRulesFilterRaw(next)
    }
  }, [filtersSynced, rulesFilter, setRulesFilterRaw])
  const setFilterCollapsed = useCallback((next: CollapsedSections | ((prev: CollapsedSections) => CollapsedSections)) => {
    if (filtersSynced) {
      const resolved = typeof next === 'function' ? (next as (prev: CollapsedSections) => CollapsedSections)(filterCollapsed) : next
      for (const mode of RULES_FILTER_PREVIEW_MODES) {
        setRulesFilterCollapsedForMode(mode, resolved)
      }
    } else {
      setFilterCollapsedRaw(next)
    }
  }, [filtersSynced, filterCollapsed, setFilterCollapsedRaw])
  const [limitConfigsToFiltered, setLimitConfigsToFiltered] = useState<boolean>(false)
  const [testerConfigFilterMode, setTesterConfigFilterMode] = useState<TesterConfigFilterMode>(TESTER_CONFIG_FILTER_MODE_DEFAULT)
  // Saved filter presets live outside autosave and must remain explicit user-controlled snapshots.
  const [filterPresets, setFilterPresets] = useFilterPresetsPreference()

  const createFilterPresetId = useCallback((): string => {
    // Prefer UUIDs for low collision risk, but provide a stable fallback for older browsers.
    try {
      const uuid = crypto?.randomUUID?.()
      if (uuid && typeof uuid === 'string') return uuid
    } catch {}
    return `preset_${Date.now()}_${Math.random().toString(16).slice(2)}`
  }, [])

  const buildFilterPresetSnapshot = useCallback((): FilterPresetSnapshot => {
    // Presets capture both modes so toggling between Sellfile preview and Rule Tester stays coherent.
    const views = {} as FilterPresetSnapshot['views']
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      const state = rulesFilterByMode[mode] ?? cloneDefaultRulesFilterState()
      const collapsed = filterCollapsedByMode[mode] ?? cloneDefaultRulesFilterCollapsed()
      const open = Boolean(filterOpenByMode[mode])
      // Deep clone to ensure future UI edits do not mutate the stored snapshot by reference.
      const clonedState = JSON.parse(JSON.stringify(state)) as RulesFilterState
      const clonedCollapsed = JSON.parse(JSON.stringify(collapsed)) as CollapsedSections
      views[mode] = { open, state: clonedState, collapsed: clonedCollapsed }
    }
    return {
      version: FILTER_PRESETS_VERSION,
      activeMode: previewMode,
      filtersSynced: Boolean(filtersSynced),
      limitConfigsToFiltered: Boolean(limitConfigsToFiltered),
      testerConfigFilterMode,
      testerSubstatSort: testerSubstatSortPrefs.state,
      views,
    }
  }, [
    filterCollapsedByMode,
    filterOpenByMode,
    filtersSynced,
    limitConfigsToFiltered,
    previewMode,
    rulesFilterByMode,
    testerConfigFilterMode,
    testerSubstatSortPrefs.state,
  ])

  const handleSaveFilterPreset = useCallback((name: string) => {
    // Presets allow duplicates; the internal ID is what disambiguates entries.
    const trimmed = name.trim()
    if (!trimmed) return
    const preset: FilterPreset = {
      id: createFilterPresetId(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      snapshot: buildFilterPresetSnapshot(),
    }
    setFilterPresets((prev) => [preset, ...(Array.isArray(prev) ? prev : [])])
  }, [buildFilterPresetSnapshot, createFilterPresetId, setFilterPresets])

  const handleApplyFilterPreset = useCallback((presetId: string) => {
    // Apply by ID so duplicates by name remain safe and predictable.
    const preset = (filterPresets ?? []).find((entry) => entry.id === presetId)
    if (!preset) return
    const snap = preset.snapshot
    // Sync preference must apply before derived setters (filterOpen/rulesFilter) decide how to fan-out.
    setFiltersSyncedRaw(Boolean(snap.filtersSynced))
    setLimitConfigsToFiltered(Boolean(snap.limitConfigsToFiltered))
    setTesterConfigFilterMode(snap.testerConfigFilterMode)
    // Tester sorting uses its own localStorage store; update it directly for immediate table refresh.
    setTesterSubstatSortState(snap.testerSubstatSort)
    // Apply per-mode filter views so switching tabs keeps the snapshot intact.
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      const view = snap.views?.[mode]
      if (!view) continue
      setRulesFilterOpenForMode(mode, Boolean(view.open))
      const clonedState = JSON.parse(JSON.stringify(view.state)) as RulesFilterState
      const clonedCollapsed = JSON.parse(JSON.stringify(view.collapsed)) as CollapsedSections
      setRulesFilterStateForMode(mode, clonedState)
      setRulesFilterCollapsedForMode(mode, clonedCollapsed)
    }
    // Switch to the snapshot's active mode last so the UI reveals the applied state immediately.
    setPreviewMode(snap.activeMode === 'tester' ? 'tester' : 'rules')
  }, [
    filterPresets,
    setFiltersSyncedRaw,
    setLimitConfigsToFiltered,
    setTesterConfigFilterMode,
    setPreviewMode,
  ])

  const handleDeleteFilterPreset = useCallback((presetId: string) => {
    // Deleting is purely local: remove the entry and keep the rest stable.
    setFilterPresets((prev) => (Array.isArray(prev) ? prev.filter((entry) => entry.id !== presetId) : []))
  }, [setFilterPresets])
  const handleToggleFiltersSynced = useCallback((next: boolean) => {
    setFiltersSyncedRaw(Boolean(next))
  }, [setFiltersSyncedRaw])
  const filtersSyncedPrevRef = useRef(filtersSynced)
  useEffect(() => {
    if (!filtersSynced || filtersSyncedPrevRef.current) return
    const sourceMode = previewMode
    const sourceOpen = Boolean(filterOpenByMode[sourceMode])
    const sourceState = rulesFilterByMode[sourceMode]
    const sourceCollapsed = filterCollapsedByMode[sourceMode]
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      setRulesFilterOpenForMode(mode, sourceOpen)
      setRulesFilterStateForMode(mode, sourceState)
      setRulesFilterCollapsedForMode(mode, sourceCollapsed)
    }
  }, [filtersSynced, previewMode, filterCollapsedByMode, filterOpenByMode, rulesFilterByMode])
  useEffect(() => {
    filtersSyncedPrevRef.current = filtersSynced
  }, [filtersSynced])
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
  const { handleRuntimeGearSets } = useRuntimeGearSetLoader({
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
        lang,
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
  }, [describeNextChange, lang, metasets, setCustomCfgs, syncSelectedCfgIdx, t])
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
      const descriptor = describeConfigsDeleted({ removed, t, lang, metasets })
      describeNextChange(descriptor)
      return prev.filter((_, i) => !deleteSet.has(i))
    })
    syncSelectedCfgIdx(null, { forceSync: true, suppressDraft: true })
  }, [describeNextChange, lang, metasets, selectedCfgIndices, setCustomCfgs, syncSelectedCfgIdx, t])
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
    logicHubDialogTab,
    setLogicHubDialogTab,
    keepUniqueRules,
    setKeepUniqueRules,
    keepUniquesEnabled,
    setKeepUniquesEnabled,
    testerItems,
    setTesterItems,
    previewMode,
    setPreviewMode,
    hsfcNote,
    setHsfcNote,
    builderRef,
    setBuilder,
    filterOpen,
    setFilterOpen,
    rulesFilter,
    setRulesFilter,
    logicHubOpen,
    setLogicHubOpen,
    t,
  })

  // Compute a stable key for configs that affects HSF rule generation (ignores display-only fields like `name`).
  // Why: Changing the config name should not cause a refresh of the Sellfile Preview table.
  const configRuleFingerprints = configRulesState.keys
  const ruleSubstatTargetsKey = configRulesState.substatTargetsKey

  const rulesByConfig = configRulesState.rulesByConfig
  const configRuleCounts = configRulesState.countsByConfig
  const mergedRules = configRulesState.mergedRules
  const mergedRulesRef = useRef(mergedRules)
  useEffect(() => { mergedRulesRef.current = mergedRules }, [mergedRules])
  const truncatedConfigIndices = configRulesState.truncatedConfigIndices
  const totalLimitHit = configRulesState.totalLimitHit
  const limitExceeded = totalLimitHit || truncatedConfigIndices.length > 0
  const configsExcludedByTotalLimit = useMemo(() => new Set<number>(configRulesState.excludedByTotalLimitIndices), [configRulesState.excludedByTotalLimitIndices])

  // Apply keep-unique rules immediately when a fresh detection snapshot is available so the tester grid sees them.
  useEffect(() => {
    // Exit early when keep-unique is off; detection is ignored in that state.
    if (!keepUniquesActive) return
    // No detection = nothing to inject yet.
    if (!keepUniqueDetection || !keepUniqueDetectionSignature) return
    // Skip redundant applications when both detection fingerprint and rule sources match.
    const pendingDetectionSignature = pendingKeepUniqueDetectionSigRef.current
    const applied = keepUniqueAppliedStateRef.current
    const baseRulesRef = configRulesState.baseRules
    const rulesByConfigRef = configRulesState.rulesByConfig
    const finalSellRulesRef = configRulesState.finalSellRules
    const alreadyApplied = (
      keepUniqueDetectionSignature === keepUniqueScanAppliedRef.current
      && applied.baseRules === baseRulesRef
      && applied.rulesByConfig === rulesByConfigRef
      && applied.finalSellRules === finalSellRulesRef
    )
    const detectionAwaitingApply = pendingDetectionSignature === keepUniqueDetectionSignature
    if (detectionAwaitingApply || alreadyApplied) return
    // Rebuild the merge list with keep-unique rules at the front so matches see them.
    setConfigRulesState((prev) => {
      // Flatten customs once; helper handles dedupe + injection.
      const flattenedCustoms: HsfRuleWithCfg[] = []
      for (let idx = 0; idx < prev.keys.length; idx += 1) {
        const segment = prev.rulesByConfig.get(idx)
        if (!segment || segment.length === 0) continue
        flattenedCustoms.push(...segment)
      }
      const { baseRules: nextBaseRules, mergedRules: merged } = prependKeepUniqueRules({
        baseRules: prev.baseRules,
        customRules: flattenedCustoms,
        finalSellRules: prev.finalSellRules,
        resolvedKeepUniqueRules,
        detection: keepUniqueDetection,
      })
      // Prime the rule-match index so testers and workers use the updated ordering.
      primeRuleMatchIndex(merged, buildRuleMatchIndexData(merged))
      for (let i = 0; i < merged.length; i += 1) {
        (merged[i] as HsfRuleWithCfg).__lineIdx = i
      }
      keepUniqueAppliedStateRef.current = {
        baseRules: nextBaseRules,
        rulesByConfig: prev.rulesByConfig,
        finalSellRules: prev.finalSellRules,
      }
      return {
        ...prev,
        baseRules: nextBaseRules,
        mergedRules: merged,
      }
    })
    // Record the applied signature to avoid re-applying the same snapshot.
    if (pendingKeepUniqueDetectionSigRef.current === keepUniqueDetectionSignature) {
      pendingKeepUniqueDetectionSigRef.current = null
    }
    keepUniqueScanAppliedRef.current = keepUniqueDetectionSignature
  }, [
    keepUniquesActive,
    keepUniqueDetection,
    keepUniqueDetectionSignature,
    resolvedKeepUniqueRules,
    configRulesState.baseRules,
    configRulesState.rulesByConfig,
    configRulesState.finalSellRules,
    setConfigRulesState,
  ])
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
  const exportRulesCountRef = useRef(exportRules.length)
  useEffect(() => { exportRulesCountRef.current = exportRules.length }, [exportRules.length])
  const hsfExportPayload = useMemo(
    () => buildHsfFileFromMerged(exportRules, { configNames }),
    [exportRules, configNames],
  )
  const buildDedupedExportPayload = useCallback(() => (
    buildDedupedHsfFileFromMerged(exportRules, { configNames })
  ), [configNames, exportRules])
  const hsfExportSig = useMemo(() => {
    try {
      return JSON.stringify(hsfExportPayload)
    } catch {
      return ''
    }
  }, [hsfExportPayload])
  const hsfExportSigRef = useRef(hsfExportSig)
  useEffect(() => { hsfExportSigRef.current = hsfExportSig }, [hsfExportSig])
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
    if (!exportRulesCountRef.current) return
    try {
      const blob = hsfToBlob(buildDedupedExportPayload())
      const filename = `Sellfile_deduped_${buildTimestamp()}.hsf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setLastExportSig(hsfExportSigRef.current)
      showToast(t('toastSellfileSaved'))
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to export deduped sellfile', err)
      }
    }
  }, [buildDedupedExportPayload, setLastExportSig, showToast, t])
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
    const readable = buildReadableConfig(cfg, metasets)
    const builderSnapshot = JSON.parse(JSON.stringify(cfg)) as BuilderConfig
    const rulesForCfg = mergedRules
      .map((rule, ruleIdx) => ({ rule, ruleIdx }))
      .filter(({ rule }) => getRuleConfigIndex(rule) === idx)
      .map(({ rule, ruleIdx }) => {
        const { __lineIdx: _omitLineIdx, __allKnownSets: _omitAllKnownSets, __source: _omitSource, ...rest } = rule as HsfRuleWithCfg & { __allKnownSets?: boolean }
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
  }, [customCfgs, metasets, mergedRules, setCopyDlgOpen, setCopyText])

  


  // Keep filter persistence snapshot sharable across autosave restore and writes.
  const autosaveFiltersState = useMemo(() => {
    const views = RULES_FILTER_PREVIEW_MODES.reduce<Record<RulesFilterPreviewMode, AutosaveFilterView>>((acc, mode) => {
      // Each preview mode tracks its own drawer state so autosave restores the exact surface the user left.
      acc[mode] = {
        open: Boolean(filterOpenByMode[mode]),
        state: rulesFilterByMode[mode],
        collapsed: filterCollapsedByMode[mode],
      }
      return acc
    }, {} as Record<RulesFilterPreviewMode, AutosaveFilterView>)
    return {
      activeMode: previewMode,
      views,
      testerConfigFilterMode,
    }
  }, [filterOpenByMode, rulesFilterByMode, filterCollapsedByMode, previewMode, testerConfigFilterMode])

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
    filters: autosaveFiltersState,
    keepUniqueRules,
    keepUniquesEnabled,
    logicHubDialogTab,
    keepUniquesGridFilterMode,
    storedRuntimeGearSetCount,
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
    resetRulesFilterPreferences()
    setTesterConfigFilterMode('off')
  }, [restoreDialogPending, restoreDraft, restoreFiltersDiffer, setTesterConfigFilterMode])
  useEffect(() => {
    if (!restoreDialogPending) filtersResetRef.current = false
  }, [restoreDialogPending])
  // Show the autosave restore prompt only after the README dialog is dismissed.
  const restoreDlgOpen = !tutorial.helpOpen && (restoreDialogPending || Boolean(testerRestoreDraft))
  const { applyGearDbDiff } = useTesterItemsActions({
    allocTesterItemId,
    setTesterItems,
    testerItemsRef,
  })

  const handleGearDbImport = useCallback(async (file: File, options?: { source?: 'manual' | 'command' }) => {
    const source = options?.source ?? 'manual'
    if (gearImportBusy) return
    // Any manual import resets the JSON dataset so future deltas do not apply
    // to stale rows pulled from a file.
    gearDbRawDatasetRef.current = null
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
      // Clear the mini-toast so stale status never overlaps the next push.
      dismissGearDbCommandToast()
    }
    beginGearImport()
    try {
      const { artifacts, inboxArtifacts } = await importGearDatabaseFromFile(file)
      const combined = [...artifacts, ...inboxArtifacts]
      if (combined.length === 0) {
        if (source === 'command') {
          const emptyMessage = t('toastGearDbImportEmpty')
          setGearDbCommandError(emptyMessage)
          // Bubble the empty import to the inline toast so the indicator is not the sole signal.
          showGearDbCommandToast(emptyMessage, 'error')
        } else {
          showToast(t('toastGearDbImportEmpty'), { severity: 'error', icon: <ErrorOutlineIcon fontSize="inherit" /> })
        }
        return
      }
      // Manual imports should guide the user to Tester view, but external pushes stay passive.
      if (source === 'manual') {
        setPreviewMode('tester')
      }
      const desiredTesterItems = combined.map((artifact) => artifact.testerItem)
      const { removedCount, addedCount } = applyGearDbDiff(desiredTesterItems)
      if (removedCount > 0 || addedCount > 0) {
        beginTesterMatchReset('gearDb')
      }
      const inboxCount = inboxArtifacts.length
      const totalCount = combined.length
      const diffSummary = t('toastGearDbDiffSummary', { added: addedCount, removed: removedCount })
      const message = inboxCount > 0
        ? `${t('toastGearDbImportedWithInbox', { count: totalCount, inboxCount })} ${diffSummary}`
        : `${t('toastGearDbImported', { count: totalCount })} ${diffSummary}`
      if (source === 'command') {
        setGearDbCommandError(null)
        setGearDbCommandSuccess(message)
        // Success toasts stay compact so they do not block the preview controls.
        showGearDbCommandToast(message, 'success')
      } else {
        showToast(message, { icon: <StorageIcon fontSize="inherit" /> })
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to import gear database', err)
      }
      if (source === 'command') {
        const fileErrorMessage = formatFileFormatErrorMessage(file.name)
        setGearDbCommandError(fileErrorMessage)
        setGearDbCommandSuccess(null)
        // Error toast matches the badge copy so screen readers hear the same text.
        showGearDbCommandToast(fileErrorMessage, 'error')
      } else {
        showFileFormatError(file.name)
      }
    } finally {
      endGearImport()
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
    beginTesterMatchReset,
    dismissGearDbCommandToast,
    showGearDbCommandToast,
    beginGearImport,
    endGearImport,
  ])

  // Accepts the raw snapshot payload pushed by the helper and rewires the tester queue.
  const handleGearDbRawSnapshot = useCallback((command: GearDbRawSnapshotCommand) => {
    beginGearImport()
    setGearDbCommandError(null)
    setGearDbCommandSuccess(null)
    dismissGearDbCommandToast()
    try {
      // Normalize the raw rows into the canonical tester dataset before diffing.
      const { dataset, testerItems, artifactCount, inboxCount } = createDatasetFromSnapshot(command)
      gearDbRawDatasetRef.current = dataset
      const { removedCount, addedCount } = applyGearDbDiff(testerItems)
      if (removedCount > 0 || addedCount > 0) {
        beginTesterMatchReset('gearDb')
      }
      const totalCount = artifactCount + inboxCount
      if (totalCount === 0) {
        const emptyMessage = t('toastGearDbImportEmpty')
        setGearDbCommandError(emptyMessage)
        setGearDbCommandSuccess(null)
        showGearDbCommandToast(emptyMessage, 'error')
        return
      }
      const diffSummary = t('toastGearDbDiffSummary', { added: addedCount, removed: removedCount })
      const message = inboxCount > 0
        ? `${t('toastGearDbImportedWithInbox', { count: totalCount, inboxCount })} ${diffSummary}`
        : `${t('toastGearDbImported', { count: totalCount })} ${diffSummary}`
      setGearDbCommandError(null)
      setGearDbCommandSuccess(message)
      showGearDbCommandToast(message, 'success')
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to apply gear DB snapshot', err)
      }
      gearDbRawDatasetRef.current = null
      const errorMessage = formatFileFormatErrorMessage('gearDbRawSnapshot.json')
      setGearDbCommandError(errorMessage)
      setGearDbCommandSuccess(null)
      showGearDbCommandToast(errorMessage, 'error')
    } finally {
      endGearImport()
    }
  }, [
    applyGearDbDiff,
    beginGearImport,
    beginTesterMatchReset,
    dismissGearDbCommandToast,
    endGearImport,
    formatFileFormatErrorMessage,
    setGearDbCommandError,
    setGearDbCommandSuccess,
    showGearDbCommandToast,
    t,
  ])

  // Deltas mutate the existing dataset; fall back to a file-format style error when no snapshot is active.
  const handleGearDbRawDelta = useCallback((command: GearDbRawDeltaCommand) => {
    const dataset = gearDbRawDatasetRef.current
    if (!dataset) {
      const missingMessage = formatFileFormatErrorMessage('gearDbRawDelta.json')
      setGearDbCommandError(missingMessage)
      setGearDbCommandSuccess(null)
      showGearDbCommandToast(missingMessage, 'error')
      return
    }
    beginGearImport()
    setGearDbCommandError(null)
    setGearDbCommandSuccess(null)
    dismissGearDbCommandToast()
    try {
      // Apply the mutation set to the cached dataset, then regenerate the tester payload.
      const { testerItems } = applyDeltaToDataset(dataset, command)
      const { removedCount, addedCount } = applyGearDbDiff(testerItems)
      if (removedCount > 0 || addedCount > 0) {
        beginTesterMatchReset('gearDb')
      }
      const diffSummary = t('toastGearDbDiffSummary', { added: addedCount, removed: removedCount })
      setGearDbCommandError(null)
      setGearDbCommandSuccess(diffSummary)
      showGearDbCommandToast(diffSummary, 'success')
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to apply gear DB delta', err)
      }
      gearDbRawDatasetRef.current = null
      const errorMessage = formatFileFormatErrorMessage('gearDbRawDelta.json')
      setGearDbCommandError(errorMessage)
      setGearDbCommandSuccess(null)
      showGearDbCommandToast(errorMessage, 'error')
    } finally {
      endGearImport()
    }
  }, [
    applyGearDbDiff,
    beginGearImport,
    beginTesterMatchReset,
    dismissGearDbCommandToast,
    endGearImport,
    formatFileFormatErrorMessage,
    setGearDbCommandError,
    setGearDbCommandSuccess,
    showGearDbCommandToast,
    t,
  ])

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
    keepUniqueRules,
    keepUniquesEnabled,
    selectedCfgIdx,
    selectedCfgIndices,
    describeNextChange,
    t,
    setCustomCfgs,
    setMetasets,
    applySubstatTargetsChange,
    applyFinalSellChange,
    applyNoteChange,
    setKeepUniqueRules,
    setKeepUniquesEnabled,
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
        // Duplicate via clone so downstream selection sees a unique object.
        const copy: BuilderConfig = cloneBuilderConfig(base)
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
  const handleRulesTableConfigureFinalSell = useCallback(() => { setLogicHubOpen(true) }, [setLogicHubOpen])
  const handleResetKeepUniques = useCallback(() => {
    // Reset keep rules to the seeded defaults and disable the feature so the user starts from a known baseline.
    setKeepUniqueRules(buildDefaultKeepUniqueRules())
    setKeepUniquesEnabled(false)
  }, [setKeepUniqueRules, setKeepUniquesEnabled])
  const handleResetGearTesterItems = useCallback(() => {
    // Treat manual resets like a full gear-db refresh so matcher + keep-unique detection clear immediately.
    beginTesterMatchReset('gearDb')
    setTesterItems([])
  }, [beginTesterMatchReset, setTesterItems])


  // Build autosave payload and write via useAutosave (enabled after restore choice)
  // Autosave should not be triggered by selection-only changes.
  // Pass selectedConfigIndex: null in autosave payload so selection changes
  // do not alter the payload. Explicit Save/Copy flows still include it.
  const trimmedHsfcNote = typeof hsfcNote === 'string' ? hsfcNote.trim() : ''
  const autosaveBuildParams = useMemo(() => ({
    version: APP_VERSION,
    metasets,
    substatTargets,
    configs: customCfgs,
    finalSellRemainder,
    selectedConfigIndex: null,
    ...(trimmedHsfcNote ? { note: trimmedHsfcNote } : {}),
    keepUniqueRules,
    keepUniquesEnabled,
  }), [customCfgs, finalSellRemainder, keepUniqueRules, keepUniquesEnabled, metasets, substatTargets, trimmedHsfcNote])
  const { payload: autosaveBasePayload } = useDeferredHsfcPayload(autosaveBuildParams)
  const autosavePayload = useMemo(() => {
    const filtersPayload = areAutosaveFiltersDefault(autosaveFiltersState) ? null : autosaveFiltersState
    return {
      ...autosaveBasePayload,
      LogicHubDialogTab: logicHubDialogTab, // Persist the active tab so the dialog re-opens where the user left off.
      KeepUniquesGridFilterMode: keepUniquesGridFilterMode,
      AutosaveSavedAt: new Date().toISOString(),
      ...(filtersPayload ? { Filters: filtersPayload } : {}),
    }
  }, [autosaveBasePayload, autosaveFiltersState, logicHubDialogTab, keepUniquesGridFilterMode])
  useAutosave({
    key: AUTOSAVE_KEY,
    payload: autosavePayload,
    enabled: autosaveEnabled && !tutorial.tutorialOpen && !autosaveSilencedByClear,
    debounceMs: 1000,
    beforeSave: persistRuntimeGearSetsNow,
  })
  const testerAutosavePayload = useMemo(() => buildRuleTesterAutosavePayload(testerItems), [testerItems])
  const testerAutosavePayloadSignature = `${testerAutosavePayload.ItemsCompressed ?? ''}#${testerAutosavePayload.ItemCount ?? 0}`
  if (testerAutosaveBaselineRef.current === null) {
    testerAutosaveBaselineRef.current = testerAutosavePayloadSignature
  }
  const testerGearTabActive = logicHubOpen && logicHubDialogTab === LOGIC_HUB_DIALOG_TAB_GEAR
  const testerAutosaveEnabled = testerGearTabActive || testerAutosaveBaselineRef.current !== testerAutosavePayloadSignature
  useAutosave({
    key: AUTOSAVE_TESTER_KEY,
    payload: testerAutosavePayload,
    enabled: testerAutosaveEnabled,
    beforeSave: persistRuntimeGearSetsNow,
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
  const filterResult = useMemo<FilterHsfRulesResult<HsfRuleWithCfg>>(() => (
    filterHsfRules(mergedRules, rulesFilter, metasets, {
      configNames,
      configModes,
      specialRuleLabels: specialRuleSourceLabels,
    })
  ), [mergedRules, rulesFilter, metasets, configNames, configModes, specialRuleSourceLabels])
  const filteredRules = filterResult.rules
  const testerFilterResult = useMemo(() => (
    filterTesterItems(testerPreviewRows, testerRulesFilter, metasets, {
      configNames,
      specialRuleLabels: specialRuleSourceLabels,
    })
  ), [testerPreviewRows, testerRulesFilter, metasets, configNames, specialRuleSourceLabels])
  const gearEntriesAfterRulesFilter = testerFilterResult.items
  const testerChampionOptions = useMemo<TesterChampionOption[]>(() => {
    // Cache champion metadata per id so the dropdown can render icons without rescanning rows.
    const map = new Map<number, TesterChampionOption>()
    for (const row of testerPreviewRows) {
      const championId = Number(row.artifact.equippedToChampionId ?? NaN)
      if (!Number.isFinite(championId) || championId <= 0) continue
      const trimmedName = row.artifact.equippedChampionName?.trim() || null
      const location = row.artifact.equippedChampionLocation ?? null
      // Base hero id + rarity keep dropdown avatars aligned with tester cards.
      const baseCandidate = row.artifact.equippedChampionBaseId
      const baseId = typeof baseCandidate === 'number' && Number.isFinite(baseCandidate) && baseCandidate > 0 ? baseCandidate : null
      const rarityCandidate = row.artifact.equippedChampionRarity
      const rarity = typeof rarityCandidate === 'number' && Number.isFinite(rarityCandidate) && rarityCandidate > 0
        ? (rarityCandidate as RankValue)
        : null
      const entry = map.get(championId)
      if (entry) {
        entry.count += 1
        // Keep the first non-empty metadata we encounter so duplicated champs stay stable.
        if (!entry.name && trimmedName) entry.name = trimmedName
        if (!entry.location && location) entry.location = location
        if (!entry.baseId && baseId) entry.baseId = baseId
        if (!entry.rarity && rarity) entry.rarity = rarity
      } else {
        map.set(championId, {
          id: championId,
          baseId,
          rarity,
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
  const gearEntriesForTable = useMemo(() => {
    let rows: TesterPreviewRow[] = gearEntriesAfterRulesFilter
    if (testerConfigFilterSelectedSet && testerConfigFilterSelectedSet.size > 0) {
      if (testerConfigFilterMode === 'first') {
        rows = gearEntriesAfterRulesFilter.filter((row) => {
          const cfgIdx = row.match?.cfgIdx
          return cfgIdx != null && testerConfigFilterSelectedSet.has(cfgIdx)
        })
      } else {
        rows = gearEntriesAfterRulesFilter.filter((row) => {
          const matches = row.matchingCfgIndices ?? []
          for (const cfgIdx of matches) {
            if (testerConfigFilterSelectedSet.has(cfgIdx)) return true
          }
          return false
        })
      }
    }
    return sortTesterRows(rows)
  }, [testerConfigFilterMode, testerConfigFilterSelectedSet, gearEntriesAfterRulesFilter])
  const hasManualTesterRows = useMemo(() => (
    testerPreviewRows.some((row) => row.artifact.source === 'tester')
  ), [testerPreviewRows])
  const suppressTesterMatchDetails = testerMatchDetailsFrozen
    || gearEntriesBuilding
  const testerBuilding = gearEntriesBuilding || rulesBuilding
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
  const filtersDirty = (previewMode === 'tester' ? testerFilterActive : filterActive)
    || limitConfigsToFiltered
    || testerConfigFilterMode !== TESTER_CONFIG_FILTER_MODE_DEFAULT
  const hsfRulesForTable = useMemo(() => {
    const baseRules = filterActive ? filteredRules : mergedRules
    if (!testerConfigFilterSelectedSet || testerConfigFilterSelectedSet.size === 0) return baseRules
    return baseRules.filter((rule) => {
      const cfgIdx = getRuleConfigIndex(rule)
      return cfgIdx !== null && testerConfigFilterSelectedSet.has(cfgIdx)
    })
  }, [filterActive, filteredRules, mergedRules, testerConfigFilterSelectedSet])
  const hsfRulesForTableRef = useRef(hsfRulesForTable)
  useEffect(() => { hsfRulesForTableRef.current = hsfRulesForTable }, [hsfRulesForTable])
  const hsfTableEmptyDueToFilters = (filterActive || testerConfigFilterActive) && mergedRules.length > 0 && hsfRulesForTable.length === 0
  const handleTesterRuleView = useCallback((ruleIndex: number, cfgIdx: number | null) => {
    setLogicHubOpen(false)
    const cfgSnapshot = customCfgsRef.current
    const hasValidConfig = cfgIdx != null && cfgIdx >= 0 && cfgIdx < cfgSnapshot.length
    if (hasValidConfig) {
      const targetCfgIdx = Number(cfgIdx)
      syncSelectedCfgIdx(targetCfgIdx, { forceSync: true })
      const cfg = cfgSnapshot[targetCfgIdx]
      if (cfg) setBuilder(cfg)
    } else {
      setPreviewMode('rules')
    }
    try {
      const targetRule = mergedRulesRef.current[ruleIndex]
      const effectiveRules = hsfRulesForTableRef.current
      const idxInEffective = targetRule ? effectiveRules.indexOf(targetRule) : -1
      if (idxInEffective >= 0) {
        setFocusRuleIndex(idxInEffective)
      } else {
        setFocusRuleIndex(null)
      }
    } catch {
      setFocusRuleIndex(null)
    }
  }, [setBuilder, setFocusRuleIndex, setPreviewMode, setLogicHubOpen, syncSelectedCfgIdx])
  const visibleConfigIndices = useMemo<Set<number> | null>(() => {
    if (!limitConfigsToFiltered) return null
    const indices = new Set(chipMatchingConfigIndices)
    if (previewMode === 'tester' && testerConfigFilterMode === 'off') {
      customCfgs.forEach((cfg, idx) => {
        if (cfg?.exportMode === 'separator') {
          indices.add(idx)
        }
      })
    }
    return indices
  }, [chipMatchingConfigIndices, customCfgs, limitConfigsToFiltered, previewMode, testerConfigFilterMode])
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

  const clearFilters = useCallback(() => {
    const next = JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
    setRulesFilter(next)
    setLimitConfigsToFiltered(false)
    setTesterConfigFilterMode(TESTER_CONFIG_FILTER_MODE_DEFAULT)
    scrollSelectedConfigIntoView()
  }, [scrollSelectedConfigIntoView, setLimitConfigsToFiltered, setRulesFilter, setTesterConfigFilterMode])
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
  const visibleConfigCount = useMemo(() => {
    if (visibleConfigIndices) return visibleConfigIndices.size
    return customCfgs.length
  }, [visibleConfigIndices, customCfgs.length])
  const focusRuleByIndex = useCallback((ruleIndex: number): boolean => {
    if (ruleIndex < 0 || ruleIndex >= mergedRules.length) return false
    const rule = mergedRules[ruleIndex]
    if (!rule) return false
    const cfgIdx = getRuleConfigIndex(rule)
    if (cfgIdx !== null && cfgIdx >= 0 && cfgIdx < customCfgs.length) {
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
      const result = filterHsfRules(rulesForConfig, rulesFilter, metasets, {
        configNames: names,
        configModes: modes,
        specialRuleLabels: specialRuleSourceLabels,
      })
      return result.matchingConfigIndices.has(targetIndex)
    } catch {
      return true
    }
  }, [metasets, substatTargets, rulesByConfig, rulesFilter, configRuleCounts, specialRuleSourceLabels])

  const prospectiveInsertIndex = useMemo(() => (
    selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length
      ? selectedCfgIdx + 1
      : customCfgs.length
  ), [selectedCfgIdx, customCfgs.length])

  const builderInsertMatchesRuleFilters = useMemo(() => {
    // Rule preview mode: "Preview configs" only hides chips when a rules filter is active.
    if (!filterActive || !limitConfigsToFiltered) return true
    // When the builder matches the selected config verbatim, reuse the current filter evaluation.
    if (editingConfigIndex !== null && !selectedIsDirty) {
      return matchingConfigIndices.has(editingConfigIndex)
    }
    // Otherwise, predict whether the inserted config would survive the current rules filter.
    const names = configNames.slice()
    names.splice(prospectiveInsertIndex, 0, builder.name ?? '')
    const modes = configModes.slice()
    const builderExportMode: SellfileExportMode = builder.exportMode
    modes.splice(prospectiveInsertIndex, 0, builderExportMode)
    return evaluateConfigAgainstFilters(builder, prospectiveInsertIndex, names, modes)
  }, [
    builder,
    configModes,
    configNames,
    editingConfigIndex,
    evaluateConfigAgainstFilters,
    filterActive,
    limitConfigsToFiltered,
    matchingConfigIndices,
    prospectiveInsertIndex,
    selectedIsDirty,
  ])

  const builderSaveMatchesRuleFilters = useMemo(() => {
    // Rule preview mode: saving only hides chips when the rules filter is active and "Preview configs" is on.
    if (!filterActive || !limitConfigsToFiltered) return true
    // No save target => never show the Apply warning.
    if (editingConfigIndex === null || editingConfigIndex < 0 || editingConfigIndex >= customCfgs.length) return true
    // Predict whether the saved config at its current index would survive the active rules filter.
    const names = configNames.slice()
    names[editingConfigIndex] = builder.name ?? ''
    const modes = configModes.slice()
    const builderExportMode: SellfileExportMode = builder.exportMode
    modes[editingConfigIndex] = builderExportMode
    return evaluateConfigAgainstFilters(builder, editingConfigIndex, names, modes)
  }, [
    builder,
    configModes,
    configNames,
    customCfgs.length,
    editingConfigIndex,
    evaluateConfigAgainstFilters,
    filterActive,
    limitConfigsToFiltered,
  ])

  const builderInsertBecomesTesterFirstMatch = useCallback((targetIndex: number): boolean => {
    // Tester preview mode: the chip filter is driven by the set of configs that are the *first match*
    // for at least one tester row that survives the tester-side filters.
    if (!limitConfigsToFiltered) return true
    if (builder.exportMode === 'disabled') return false
    // In tester mode, separators are always shown when config filtering is off (anchor chips remain visible).
    if (builder.exportMode === 'separator' && testerConfigFilterMode === 'off') return true
    const rows = gearEntriesAfterRulesFilter
    if (rows.length === 0) return false
    let ruleLimitHit = false
    const rulesForBuilder = buildRulesForConfig(
      { config: builder, metasets, substatTargets, cfgIdx: targetIndex },
      { limit: RULE_COUNT_LIMIT + 1, onLimit: () => { ruleLimitHit = true } },
    )
    // If the config generates more rules than we are willing to build in-render, assume it is visible.
    if (ruleLimitHit) return true
    if (rulesForBuilder.length === 0) return false
    for (const row of rows) {
      const currentMatchIdx = row.match?.cfgIdx ?? null
      // If an earlier config already wins, inserting/saving cannot make this config the first match.
      if (currentMatchIdx !== null && currentMatchIdx < targetIndex) continue
      if (evaluateFirst(rulesForBuilder, row.artifact.testerItem)) return true
    }
    return false
  }, [
    builder,
    limitConfigsToFiltered,
    metasets,
    substatTargets,
    testerConfigFilterMode,
    gearEntriesAfterRulesFilter,
  ])

  const insertHiddenByFilters = useMemo(() => {
    if (!limitConfigsToFiltered) return false
    if (previewMode === 'tester') {
      return !builderInsertBecomesTesterFirstMatch(prospectiveInsertIndex)
    }
    return !builderInsertMatchesRuleFilters
  }, [
    builderInsertBecomesTesterFirstMatch,
    builderInsertMatchesRuleFilters,
    limitConfigsToFiltered,
    previewMode,
    prospectiveInsertIndex,
  ])

  const saveHiddenByFilters = useMemo(() => {
    if (!limitConfigsToFiltered) return false
    if (editingConfigIndex === null) return false
    if (previewMode === 'tester') {
      return !builderInsertBecomesTesterFirstMatch(editingConfigIndex)
    }
    return !builderSaveMatchesRuleFilters
  }, [
    builderInsertBecomesTesterFirstMatch,
    builderSaveMatchesRuleFilters,
    editingConfigIndex,
    limitConfigsToFiltered,
    previewMode,
  ])

  const handleExternalCommand = useCallback((cmd: ExternalCommand) => {
    if (cmd.kind === 'selectRule') {
      if (cmd.rowNumber != null) {
        const zeroBasedIndex = Math.max(0, Math.floor(cmd.rowNumber) - 1)
        focusRuleByIndex(zeroBasedIndex)
      }
      return
    }

    if (cmd.kind === 'gearDbRawSnapshot') {
      handleGearDbRawSnapshot(cmd)
      return
    }

    if (cmd.kind === 'gearDbRawDelta') {
      handleGearDbRawDelta(cmd)
      return
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
  }, [focusRuleByIndex, handleGearDbImport, handleGearDbRawDelta, handleGearDbRawSnapshot, pushEndpoint])

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
    setKeepUniqueRules((prev) => {
      let mutated = false
      const next = prev.map((rule) => {
        const metaIds = rule.combination.metaSetIds ?? []
        if (metaIds.length === 0) return rule
        // Mirror config/builder reset behavior so Keep Unique combinations stay in sync.
        const mergedSets = new Set<number>(rule.combination.sets ?? [])
        if (mode === 'replaceSets') {
          for (const metaId of metaIds) {
            const meta = metasById.get(metaId)
            if (!meta) continue
            for (const setId of meta.sets) mergedSets.add(setId)
          }
        }
        const nextMeta = (mode === 'replaceMeta' && replacementId) ? [replacementId] : []
        const nextSets = mode === 'replaceSets' ? Array.from(mergedSets).sort((a, b) => a - b) as ArtifactSetId[] : (rule.combination.sets ?? [])
        const metaChanged = !stringArraysEqual(metaIds, nextMeta)
        const setsChanged = mode === 'replaceSets' ? !numberArraysEqual(rule.combination.sets ?? [], nextSets) : false
        if (!metaChanged && !setsChanged) return rule
        mutated = true
        return {
          ...rule,
          combination: {
            ...rule.combination,
            metaSetIds: nextMeta,
            sets: nextSets,
          },
        }
      })
      return mutated ? next : prev
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
  }, [describeNextChange, metasets, setBuilder, setCustomCfgs, setKeepUniqueRules, setMetasets, t])

  const builderPanelElement = (
    <BuilderPanel
      cfg={builder}
      onChange={setBuilder}
      onAddToCustom={() => {
        const currentBuilder = builderRef.current
        // Clone the builder snapshot so configs never share object identity.
        const insertedCfg = cloneBuilderConfig(currentBuilder)
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length)
          ? selectedCfgIdx + 1
          : customCfgs.length
        const nextCfgs = [
          ...customCfgs.slice(0, insertIdx),
          insertedCfg,
          ...customCfgs.slice(insertIdx),
        ]
        const descriptor = describeConfigAdded({
          index: insertIdx,
          cfg: insertedCfg,
          previous: customCfgs,
          t,
          lang,
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
        // Clone once so history + state updates see the same detached snapshot.
        const nextConfig = cloneBuilderConfig(currentBuilder)
        const previousCfg = customCfgs[selectedCfgIdx] ?? null
        if (previousCfg) {
          const descriptor = describeBuilderConfigUpdate({
            previous: previousCfg,
            next: nextConfig,
            index: selectedCfgIdx,
            t,
            lang,
            metasets,
          })
          describeNextChange(descriptor)
        } else {
          describeNextChange(null)
        }
        setCustomCfgs(prev => prev.map((c, i) => (i === selectedCfgIdx ? nextConfig : c)))
      }}
      registerAutoApplyHandler={registerAutoApplyHandler}
      metasets={metasets}
      onMetasetsChange={(next) => setMetasets(next)}
      describeNextChange={describeNextChange}
      onDeleteMetaset={(id, opts) => {
        // Determine replacement strategy before mutating metasets/configs/keep-unique rules
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
        const descriptor = describeMetasetDeleted({ metaset: metaToDelete, mode: deletionMode, replacementName, t, lang })
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

        const usedCount = metasetUsageCounts[id] || 0
        const keepUniqueUsedCount = keepUniqueMetasetUsageCounts[id] || 0

        // Update only configs that reference this metaset
        if (usedCount > 0) {
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
        }

        // Rewrite Keep Unique rules that referenced this metaset.
        if (keepUniqueUsedCount > 0) {
          setKeepUniqueRules((prev) => {
            let mutated = false
            const next = prev.map((rule) => {
              const metaIds = rule.combination.metaSetIds ?? []
              if (!metaIds.includes(id)) return rule
              // Rewrite Keep Unique combinations so deleted metaset IDs are dropped
              // or swapped, matching the config/builder behavior.
              const seen = new Set<string>()
              const nextMetaIds: string[] = []
              for (const metaId of metaIds) {
                const replacement = (metaId === id) ? replaceWithMetaId : metaId
                if (!replacement) continue
                if (seen.has(replacement)) continue
                seen.add(replacement)
                nextMetaIds.push(replacement)
              }
              let nextSets = rule.combination.sets ?? []
              if (replaceWithSets && metaToDelete) {
                const merged = new Set<number>(nextSets.map(Number))
                for (const s of metaToDelete.sets) merged.add(Number(s))
                nextSets = Array.from(merged).sort((a, b) => a - b) as ArtifactSetId[]
              }
              const metaChanged = metaIds.length !== nextMetaIds.length || metaIds.some((metaId, idx) => metaId !== nextMetaIds[idx])
              const currentSets = rule.combination.sets ?? []
              const setsChanged = replaceWithSets
                ? (currentSets.length !== nextSets.length || currentSets.some((setId, idx) => setId !== nextSets[idx]))
                : false
              if (!metaChanged && !setsChanged) return rule
              mutated = true
              return {
                ...rule,
                combination: {
                  ...rule.combination,
                  metaSetIds: nextMetaIds,
                  sets: nextSets,
                },
              }
            })
            return mutated ? next : prev
          })
        }
      }}
      substatTargets={substatTargets}
      onResetMetasets={handleResetMetasets}
      onSubstatTargetsChange={(next, opts) => { applySubstatTargetsChange(next, opts) }}
      substatTargetsDialogOpen={substatTargetsDialogOpen}
      onCloseSubstatTargetsDialog={closeSubstatTargetsDialog}
      setUsageCounts={setUsageCounts}
      metasetUsageCounts={metasetUsageCounts}
      keepUniqueMetasetUsageCounts={keepUniqueMetasetUsageCounts}
      substatColors={substatColors}
      configCount={customCfgs.length}
      selectedIsDirty={selectedIsDirty}
      insertHiddenByFilters={insertHiddenByFilters}
      saveHiddenByFilters={saveHiddenByFilters}
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
      keepUniqueRules: KeepUniqueRule[]
      keepUniquesEnabled: boolean
    },
  ) => {
    const {
      cfgs,
      metasets: nextMetas,
      substatTargets: nextSubstatTargets,
      selectedIndex,
      note,
      finalSellRemainder: fsr,
      keepUniqueRules,
      keepUniquesEnabled,
    } = payload

    const loadDescriptor = describeHsfcLoaded({ fileName, t })
    const resolvedSel = typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < cfgs.length
      ? selectedIndex
      : (cfgs.length > 0 ? 0 : null)
    const rawNote = typeof note === 'string' ? note : ''
    const importedNote = rawNote.trim().length > 0 ? rawNote : null
    beginTesterMatchReset('hsfc')

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
      setKeepUniqueRules(keepUniqueRules)
      setKeepUniquesEnabled(keepUniquesEnabled)
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
    setKeepUniqueRules,
    setKeepUniquesEnabled,
    setBuilder,
    setCustomCfgs,
    setLastExportSig,
    setMetasets,
    substatTargets,
    syncSelectedCfgIdx,
    t,
    beginTesterMatchReset,
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

  const handleHsfcFile = useCallback(async (file: File) => {
    if (tutorial.helpOpen) {
      tutorial.setHelpOpen(false)
      tutorial.setHelpFirstRunMode(false)
      try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
    }
    if (restoreDialogPending) dismissRestore()
    if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
    await importHsfcFile(file)
  }, [
    confirmClearOpen,
    confirmDeleteIdx,
    confirmDeleteTargets,
    dismissRestore,
    importHsfcFile,
    restoreDialogPending,
    tutorial,
  ])

  const handleHsfFile = useCallback(async (file: File) => {
    flushTransientUi()
    if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
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
  }, [
    confirmClearOpen,
    confirmDeleteIdx,
    confirmDeleteTargets,
    flushTransientUi,
    setHsf,
    showFileFormatError,
  ])

  const handleUnknownImportedFile = useCallback((file: File) => {
    showFileFormatError(file.name)
  }, [showFileFormatError])

  const handleManualFileSelection = useCallback(async (file: File) => {
    await routeFileByExtension(file, {
      onHsfc: handleHsfcFile,
      onHsf: handleHsfFile,
      onL10n: handleRuntimeCatalog,
      onGearDb: handleGearDbImport,
      onGearSets: handleRuntimeGearSets,
      onUnknownFile: handleUnknownImportedFile,
    })
  }, [
    handleGearDbImport,
    handleHsfcFile,
    handleHsfFile,
    handleRuntimeCatalog,
    handleRuntimeGearSets,
    handleUnknownImportedFile,
  ])

  // Global file-drag overlay and file routing handled by hook
  const { active: fileDragActive } = useFileDragDrop({
    onDragStart: () => {
      // Close context menus/popovers when a file drag starts so drop works cleanly
      try { tutorial.closeAllTransientUi() } catch {}
    },
    onHsfc: handleHsfcFile,
    onHsf: handleHsfFile,
    onL10n: handleRuntimeCatalog,
    onGearDb: handleGearDbImport,
    onGearSets: handleRuntimeGearSets,
    onUnknownFile: handleUnknownImportedFile,
  })

  // HSFC load/save/copy controls surfaced at the top of the builder column.
  const headerActionsElement = (
    <HeaderActions
      onAboutToOpenHsfc={() => {
        markSavedNow()
      }}
      onSelectFile={handleManualFileSelection}
      onSaveHsfc={() => {
        persistRuntimeGearSetsNow()
        const payload = buildHsfcPayload({
          version: APP_VERSION,
          metasets,
          substatTargets,
          configs: customCfgs,
          finalSellRemainder,
          selectedConfigIndex: selectedCfgIdx,
          ...(hsfcNote ? { note: hsfcNote } : {}),
          keepUniqueRules,
          keepUniquesEnabled,
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
  const metasetConflictDialogElement = metasetConflictOpen ? (
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
          setKeepUniqueRules(pendingImport.keepUniqueRules)
          setKeepUniquesEnabled(pendingImport.keepUniquesEnabled)
        } finally {
          setMetasetConflictOpen(false)
          setPendingImport(null)
          setConflictIds([])
        }
      }}
    />
  ) : null

  // Manual paste dialog for HSFC snippets.
  const pasteDialogElement = pasteDlgOpen ? (
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
  ) : null

  // Manual copy dialog when clipboard writes fail.
  const copyDialogElement = copyDlgOpen ? (
    <CopyDialog
      open={copyDlgOpen}
      text={copyText}
      inputRef={copyInputRef}
      onTextChange={setCopyText}
      onClose={() => setCopyDlgOpen(false)}
    />
  ) : null

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
        // Firefox does not render overlay scrollbars; keep the default width there
        '@media all and (min--moz-device-pixel-ratio:0)': {
          '*, *::before, *::after': {
            scrollbarWidth: 'auto',
          },
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
              <MarkdownTooltip markdown={t('helpOpenTooltip')}>
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
              </MarkdownTooltip>
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
          substatTargetsLabel={t('builderSubstatTargets')}
          substatTargetsTooltip={t('builderSubstatTargetsTooltip')}
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
        filtersDirty={filtersDirty}
        filterOpen={filterOpen}
        building={rulesBuilding}
        testerBuilding={testerBuilding}
        workloadProgressRatio={workloadProgressRatio}
        limitHit={totalLimitHit}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        onClearFilters={clearFilters}
        onSelectFile={handleManualFileSelection}
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
          const payload = dedupeDefault ? buildDedupedExportPayload() : hsfExportPayload
          const blob = hsfToBlob(payload)
          const filename = sellfileFilename()
          const target = pushExportEndpoint
          if (target) {
            const targetUrl = buildSellfilePushUrl(target, filename)

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
        onOpenLogicHubDialog={() => setLogicHubOpen(true)}
        keepUniquesEnabled={keepUniquesEnabled}
        onToggleKeepUniques={(next) => setKeepUniquesEnabled(next)}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
        testerSubstatSort={testerSubstatSortPrefs.state}
        useStatButtonColors={statButtonBorders}
        substatColors={substatColors}
        onClearTesterSubstatSort={testerSubstatSortPrefs.clear}
	        onSetTesterSubstatSortDirection={testerSubstatSortPrefs.setDirection}
	        onToggleTesterSubstatSortKeepSections={testerSubstatSortPrefs.toggleKeepSections}
	        onToggleTesterSubstatSortExcludeGlyphs={testerSubstatSortPrefs.toggleExcludeGlyphs}
	        onToggleTesterSubstatSortPriority={testerSubstatSortPrefs.togglePriorityKey}
	        onToggleTesterSubstatSortPriorityFlipped={testerSubstatSortPrefs.toggleFlipped}
	        filtersSynced={filtersSynced}
	        onToggleFiltersSynced={handleToggleFiltersSynced}
          filterPresets={filterPresets}
          onSaveFilterPreset={handleSaveFilterPreset}
          onApplyFilterPreset={handleApplyFilterPreset}
          onDeleteFilterPreset={handleDeleteFilterPreset}
	        testerCount={testerItems.length}
	        testerFilteredCount={gearEntriesForTable.length}
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
              showFaction={showFactionFilter}
              configChipFilterActive={limitConfigsToFiltered}
              onConfigChipFilterChange={setLimitConfigsToFiltered}
              testerConfigFilterMode={testerConfigFilterMode}
              onTesterConfigFilterModeChange={setTesterConfigFilterMode}
              configCount={customCfgs.length}
              collapsed={filterCollapsed}
              onCollapsedChange={setFilterCollapsed}
              testerChampionOptions={testerChampionOptions}
              substatColors={substatColors}
              useStatButtonColors={statButtonBorders}
              hasManualTesterItems={hasManualTesterRows}
            />
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            {previewMode === 'tester' ? (
              <Box sx={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }} data-tour-id="preview.tester-grid">
                <Box
                  data-tour-id="preview.tester-grid-top"
                  sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '50%', pointerEvents: 'none' }}
                />
                <TesterItemsGrid
                  rows={gearEntriesForTable}
                  filterActive={testerFilterActive || testerConfigFilterActive}
                  substatColors={substatColors}
                  useStatButtonColors={statButtonBorders}
                  onToggleStatColors={setStatButtonBorders}
                  onOpenManageColors={openColors}
                  colorBlindMode={colorBlindMode}
                  onChangeColorBlindMode={setColorBlindMode}
                  colorIconSrc={colorIconSrc}
                  configNames={testerConfigNamesForGrid}
                  onJumpToRule={handleTesterRuleView}
                  suppressMatchDetails={suppressTesterMatchDetails}
                  keepSections={testerSubstatSortSpec ? testerSubstatSortPrefs.state.keepSections : true}
                  substatSort={testerSubstatSortSpec}
                />
              </Box>
            ) : (
              <HsfRulesTableMemo
                rules={hsfRulesForTable}
                setHoveredCfgIdx={setHoveredCfgIdx}
                selectedCfgIdx={previewSelectedCfgIdx}
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
      {tutorial.helpOpen ? (
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
      ) : null}
      {/* Only mount the Note dialog when visible so config chip previews stay out of the tree. */}
      {noteOpen ? (
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
          keepUniqueRules={keepUniqueRules}
          useStatButtonColors={statButtonBorders}
          substatColors={substatColors}
        />
      ) : null}
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
      {/* Command pushes reuse a slimmer toast parked in the top-right corner. */}
      {gearDbCommandToast ? (
        <Snackbar
          open
          autoHideDuration={3000}
          onClose={dismissGearDbCommandToast}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          sx={{
            '& .MuiSnackbarContent-root': { p: 0 },
          }}
        >
          <Alert
            icon={gearDbCommandToast.severity === 'success' ? <StorageIcon fontSize="inherit" /> : <ErrorOutlineIcon fontSize="inherit" />}
            severity={gearDbCommandToast.severity}
            variant="filled"
            onClose={dismissGearDbCommandToast}
            sx={{
              alignItems: 'center',
              fontSize: Math.max(12, FONT_SIZE_BASE_PX - 2),
              px: 1.75,
              py: 1,
              minWidth: 240,
            }}
          >
            {gearDbCommandToast.message}
          </Alert>
        </Snackbar>
      ) : null}
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
      {restoreDlgOpen ? (
        <RestoreAutosaveDialog
          open={restoreDlgOpen}
          draft={restoreDraft}
          testerDraft={testerRestoreDraft ? { count: testerRestoreDraft.count, savedAt: testerRestoreDraft.savedAt } : null}
          storedGearSetsCount={storedRuntimeGearSetCount}
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
            const shouldResetTesterMatches = Boolean(
              (selection.configs && Array.isArray(draft?.Configs))
              || (selection.tester && testerRestoreDraft)
            )
            if (shouldResetTesterMatches) beginTesterMatchReset('restore')
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
              // Restore/clear runtime gear sets first so baked-in catalog lookups
              // remain stable while we sanitize incoming configs/metasets.
              if (selection.targets && restoreTargetsDiffer && draft.substatTargets && typeof draft.substatTargets === 'object') setSubstatTargets(draft.substatTargets)
              if (selection.note && typeof draft.Note === 'string') {
                applyNoteChange(draft.Note, { mode: 'restore', publish: false })
              }
              if (selection.filters && restoreFiltersDiffer && draft.Filters) {
                try {
                  const views = draft.Filters.views
                  if (views && typeof views === 'object') {
                    // Replay the saved view for every mode so toggling between Sellfile preview and Rule Tester feels seamless.
                    for (const mode of RULES_FILTER_PREVIEW_MODES) {
                      const view = views[mode]
                      if (!view) continue
                      setRulesFilterOpenForMode(mode, Boolean(view.open))
                      const clonedState = JSON.parse(JSON.stringify(view.state)) as RulesFilterState
                      setRulesFilterStateForMode(mode, clonedState)
                      const collapsed = view.collapsed ?? cloneDefaultRulesFilterCollapsed()
                      setRulesFilterCollapsedForMode(mode, collapsed)
                    }
                  }
                  setTesterConfigFilterMode(draft.Filters.testerConfigFilterMode ?? 'off')
                  if (draft.Filters.activeMode === 'rules' || draft.Filters.activeMode === 'tester') {
                    setPreviewMode(draft.Filters.activeMode)
                  }
                } catch {}
              }
              if (selection.gearSets) {
                // User opted in: hydrate runtime sets from localStorage now.
                // Why: configs restored below may rely on these IDs.
                clearRuntimeGearSets({ persist: false })
                loadRuntimeGearSetsFromStorage({ replace: true })
              } else {
                // User declined: clear in-memory only.
                // Why: storage stays untouched until the next autosave/manual save.
                clearRuntimeGearSets({ persist: false })
              }
              // If runtime gear sets were declined, strip any now-unknown runtime IDs
              // from restored artifacts/metasets so chips/selects don't show phantom sets.
              const bakedInSetIdSet = selection.gearSets
                ? null
                : new Set(getAllKnownArtifactSetIds().map((id) => Number(id)))
              // Sanitize metasets by removing unknown set IDs.
              // Why: metasets are expanded into config rules and chip labels.
              const sanitizeMetasets = (incoming: Metaset[]): Metaset[] => (
                bakedInSetIdSet
                  ? incoming.map((meta) => ({
                    ...meta,
                    sets: (meta.sets ?? []).filter((id) => bakedInSetIdSet.has(Number(id))),
                  }))
                  : incoming
              )
              // Sanitize configs by removing unknown runtime IDs.
              // Why: restored chips should not advertise dormant sets.
              const sanitizeConfigs = (incoming: BuilderConfig[]): BuilderConfig[] => (
                bakedInSetIdSet
                  ? incoming.map((cfg) => ({
                    ...cfg,
                    artifactSets: (cfg.artifactSets ?? []).filter((id) => bakedInSetIdSet.has(Number(id))),
                  }))
                  : incoming
              )
              if (selection.metasets && restoreMetasetsDiffer && Array.isArray(draft.Metasets)) {
                setMetasets(sanitizeMetasets(draft.Metasets))
              }
              if (selection.configs && Array.isArray(draft.Configs)) {
                if (draft.FinalSellRemainder && typeof draft.FinalSellRemainder === 'object') {
                  try {
                    const fsr = draft.FinalSellRemainder as FinalSellRemainderConfig
                    applyFinalSellChange(fsr, { publish: false })
                  } catch {}
                }
                const sanitizedCfgs = sanitizeConfigs(draft.Configs)
                setCustomCfgs(sanitizedCfgs)
                const len = draft.Configs.length
                if (len > 0) {
                  const savedSel = typeof draft.SelectedConfigIndex === 'number' ? draft.SelectedConfigIndex : (len - 1)
                  const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
                  syncSelectedCfgIdx(sel, { forceSync: true, suppressDraft: true })
                  try {
                    if (sanitizedCfgs[sel]) setBuilder(sanitizedCfgs[sel]!)
                  } catch {}
                } else {
                  syncSelectedCfgIdx(null, { forceSync: true, suppressDraft: true })
                }
              }
            }
            if (selection.tester && testerRestoreDraft) {
              const restoredItems = testerRestoreDraft.items
              setTesterItems(restoredItems)
              const maxItemId = testerRestoreDraft.items.reduce((max, item) => (
                Number.isFinite(item.itemId) && item.itemId > max ? item.itemId : max
              ), 0)
              testerItemIdRef.current = Math.max(testerItemIdRef.current, (maxItemId || 0) + 1)
            }
            const savedAutosaveTab = (draft?.LogicHubDialogTab ?? draft?.FinalSellDialogTab) as LogicHubDialogTab | undefined
            if (savedAutosaveTab) {
              // Clamp unknown values back to the default tab so corrupted autosave payloads stay recoverable.
              const normalizedTab = LOGIC_HUB_DIALOG_TABS.includes(savedAutosaveTab)
                ? savedAutosaveTab
                : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
              setLogicHubDialogTab(normalizedTab)
            }
            if (draft?.KeepUniquesGridFilterMode) {
              setKeepUniquesGridFilterMode(sanitizeKeepUniquesGridFilterMode(draft.KeepUniquesGridFilterMode))
            }
            if (selection.configs) {
              if (Array.isArray(draft?.KeepUniques)) setKeepUniqueRules(draft.KeepUniques)
              if (typeof draft?.KeepUniquesEnabled === 'boolean') {
                setKeepUniquesEnabled(Boolean(draft.KeepUniquesEnabled))
              }
            }
            // Coalesce downstream rebuilds into a single pass.
            restoringAutosaveRef.current = true
            acceptRestore()
            setTesterRestoreDraft(null)
            setTimeout(() => {
              restoringAutosaveRef.current = false
              flushTransientUi()
            }, 0)
          }}
        />
      ) : null}
      {/* Manage Colors Dialog */}
      {colorsDlgOpen ? (
        <ManageColorsDialog
          open={colorsDlgOpen}
          onClose={closeColors}
          substatColors={substatColors}
          setSubstatColors={setSubstatColors}
          onReset={resetColors}
        />
      ) : null}
      {/* Logic Hub configuration */}
      {logicHubOpen ? (
        <LogicHubDialog
          open={logicHubOpen}
          value={finalSellRemainder}
          onChange={(v) => applyFinalSellChange(v)}
          onClose={() => setLogicHubOpen(false)}
          onReset={() => applyFinalSellChange({
            artifacts: false,
            accessories: false,
            levels: FINAL_SELL_DEFAULT_LEVELS.slice() as FinalSellLevel[],
            setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
          }, { mode: 'reset' })}
          activeTab={logicHubDialogTab}
          onChangeTab={setLogicHubDialogTab}
          // Pass preview grid state so the Keep Uniques tab can mirror the tester visuals without duplicating selectors.
          keepUniqueRules={keepUniqueRules}
          onKeepUniqueRulesChange={setKeepUniqueRules}
          keepUniquesEnabled={keepUniquesEnabled}
          onKeepUniquesEnabledChange={setKeepUniquesEnabled}
          keepUniqueDetection={keepUniqueDetection}
          gearEntries={testerPreviewRows}
          keepUniqueItemKeys={keepUniqueGroupItemKeys}
          substatColors={substatColors}
          useStatButtonColors={statButtonBorders}
          onToggleStatColors={setStatButtonBorders}
          onOpenManageColors={openColors}
          colorBlindMode={colorBlindMode}
          onChangeColorBlindMode={setColorBlindMode}
          colorIconSrc={colorIconSrc}
          configNames={testerConfigNamesForGrid}
          metasets={metasets}
          suppressMatchDetails={suppressTesterMatchDetails}
          workloadProgressRatio={workloadProgressRatio}
          onResetKeepUniques={handleResetKeepUniques}
          onJumpToRule={handleTesterRuleView}
          customCfgs={customCfgs}
          testerItems={testerItems}
          setTesterItems={setTesterItems}
          allocTesterItemId={allocTesterItemId}
          testerMatches={testerMatchesByItemId}
          onResetGearTester={handleResetGearTesterItems}
        />
      ) : null}
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
      {fileFormatError ? (
        <FileFormatErrorDialog
          open={Boolean(fileFormatError)}
          fileName={fileFormatError?.fileName ?? null}
          onClose={handleFileFormatErrorClose}
        />
      ) : null}
    </Container>
  )
}
