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
import { EXTERNAL_WS_METHOD_UPLOAD_SELLFILE } from './lib/externalWsProtocol'
import type { ExternalCommand, GearDbRawDeltaCommand, GearDbRawSnapshotCommand } from './lib/externalCommands'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderRecipe, type SubstatTargetTable, type SellfileExportMode } from './lib/hsfBuilder'
import { parseRecipesFromText, buildReadableRecipe, readHsfcFile, buildHsfcPayload, hsfcToBlob } from './lib/hsfcIO'
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
  PREVIEW_PAPER_PADDING_UNITS,
  FINAL_SELL_DEFAULT_LEVELS,
  FONT_SIZE_DISPLAY_REM,
  FONT_SIZE_HEADER_META_PX,
  FONT_SIZE_BASE_PX,
  GEAR_DB_DIFF_TOAST_MAX_ITEMS,
  SELECTION_SCROLL_SOURCE_SELECT_RULE,
  SELECTION_SCROLL_SOURCE_USER,
  type SelectionScrollRequest,
  type SelectionScrollSource,
} from './lib/constants'
import { buildPreviewArtifactFromTesterItem } from './lib/testerPreviewArtifacts'
import { clampProgressRatio, type ProgressSnapshot } from './types/progress'
import { measureCssWidth } from './lib/domMeasurements'
import { KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT } from './lib/keepOverrideLayout'
import {
  parseSpacingPx,
  resolveTesterCardWidthPx,
  TESTER_GRID_COLUMN_GAP_UNITS,
  TESTER_GRID_CONTAINER_PADDING_END_UNITS,
  TESTER_GRID_ROW_PADDING_UNITS,
} from './lib/testerGridLayout'

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Button } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import SaveIcon from '@mui/icons-material/Save'
import StorageIcon from '@mui/icons-material/Storage'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
import { HsfRulesTableMemo, type SafeguardStarSelection } from './components/HsfRulesTable'
// Recipe chips list panel component
import RecipeChipsPanel from './components/RecipeChipsPanel'
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
  buildRulesForRecipe,
  prependSafeguardRules,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_SAFEGUARDS,
} from './lib/merge'
import { cloneRuleWithRecipeIndex, getRuleRecipeIndex, resolveMatchRecipeName } from './lib/ruleRecipeIndex'
import {
  buildDefaultSafeguardRules,
  type SafeguardDetectionSnapshot,
  type SafeguardRule,
  resolveSafeguardRulesWithMetasets,
  hashSafeguardCombination,
  getSafeguardItemKey,
  resolveSafeguardRuleLabel,
  normalizeSafeguardSubstatMatch,
  sanitizeSafeguardCountMode,
  SafeguardSubstatMatch,
  SafeguardRuleActivation,
} from './lib/safeguards'
import { fingerprintRecipeForRules, fingerprintSubstatTargets, updateRecipeRulesCache } from './lib/ruleCache'
import { hasRecipeMeaningfulDifferences } from './lib/recipeDiff'
import { buildRuleTesterAutosavePayload, createRuleTesterMath, fingerprintRuleTesterItem, loadRuleTesterAutosaveDraft, type RuleTesterItem } from './lib/ruleTesterSession'
import {
  buildGearDbDiffSummary,
  collectGearDbDeltaArtifactIds,
  formatGearDbDiffHistoryLines,
  snapshotGearDbDataset,
  type GearDbDiffEntry,
  type GearDbDiffHistoryEntry,
  type GearDbDiffHistoryLineSpec,
  type GearDbDiffToastEntry,
  type GearDbDiffToastPayload,
} from './lib/gearDbDiffToast'
import { normalizeTesterSortWeight, sortTesterRows, TESTER_SORT_KEY_LAST_USAGE, TESTER_SORT_WEIGHT_DEFAULT } from './lib/testerSort'
import { buildTesterRuleTemplateRecipe } from './lib/testerRuleTemplates'
import { buildTesterOutcomeSummary } from './lib/testerOutcomeSummary'
import { isDefaultTesterSubstatSortState, setTesterSubstatSortState, useTesterSubstatSortPreferences } from './state/testerSubstatSortPreferences'
import { useTesterGridNormalizedOverlayPreferences } from './state/testerGridNormalizedOverlayPreferences'
import { FILTER_PRESETS_VERSION, useFilterPresetsPreference, type FilterPreset, type FilterPresetSnapshot } from './state/filterPresetsPreference'
import FileDragOverlay from './components/FileDragOverlay'
import { BuilderColumn } from './components/AppLayout/BuilderColumn'
import { useFileDragDrop, routeFileByExtension } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import { GearDbDiffToast } from './components/GearDbDiffToast'
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
import { TESTER_RECIPE_FILTER_MODE_DEFAULT, type TesterRecipeFilterMode } from './types/testerRecipeFilterMode'
import { artifactTypeI18nKey, getAllKnownArtifactSetIds, type RankValue, type StatVariant } from './lib/types'
import { formatTesterSetLabel } from './lib/testerFormatters'
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
type HsfRuleWithRecipe = ReturnType<typeof computeMergedRules>[number]
// Keep the chip spinner visible with at least a whisper of progress so the pulse animation can show.
const WORKLOAD_PENDING_MIN_RATIO = 0.02 as const
// Hold the spinner a touch longer so sequential builders do not flicker off between phases.
const WORKLOAD_SPINNER_HANG_MS = 450 as const
// Coalesce rapid edits so we do not restart the pipeline for every keystroke/reorder.
const PIPELINE_DEBOUNCE_MS = 200 as const

// WebSocket endpoints may still host HTTP downloads; map ws(s) -> http(s).
function coerceWsEndpointToHttp(endpoint: string): string | null {
  try {
    const url = new URL(endpoint)
    if (url.protocol === 'ws:') {
      url.protocol = 'http:'
      return url.toString()
    }
    if (url.protocol === 'wss:') {
      url.protocol = 'https:'
      return url.toString()
    }
  } catch {
    // ignore invalid values
  }
  return null
}
import { sellfileFilename, hsfcFilename, buildTimestamp } from './lib/filenames'
import { README_SEEN_VERSION_KEY, RULE_COUNT_LIMIT } from './lib/constants'
import { DEFAULT_METASET_ICON_ID } from './lib/metasetIcons'
import { cloneMetaset, defaultMetasets, type Metaset } from './lib/metasets'
import { normalizeArtifactSetSelections, splitArtifactSetSelections, type ArtifactSetSelectionEntry } from './lib/gearSets/selection'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useDisplayPreferences, useDisplayPreferenceActions } from './state/preferencesState'
import { useAutoApplySelectedRecipePreference } from './state/builderPreferences'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/recipeDuplicates'
import { recipesForRuleBuild } from './lib/ruleCacheHelpers'
import { evaluateFirst, type MatchingRecipeDecision } from './lib/ruleEval'
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
  LOGIC_HUB_DIALOG_TAB_SAFEGUARDS,
  LOGIC_HUB_DIALOG_TABS,
} from './lib/logicHub'
import type { FinalSellRemainderConfig, FinalSellLevel, LogicHubDialogTab } from './lib/logicHub'
import { useRecipeSelection } from './hooks/useRecipeSelection'
import { useRuleCacheWorker } from './hooks/useRuleCacheWorker'
import { fingerprintSafeguardDetection } from './lib/safeguardFingerprint'
import { useTesterItemsActions } from './hooks/useTesterItemsActions'
import {
  resolveArtifactItemIdWithFallback,
  resolveCanonicalTestItemId,
} from './lib/itemIdentity'
// Local tag for tester reset triggers; persists only in memory.
type TesterMatchResetReason = 'restore' | 'hsfc' | 'gearDb'
import { getRecipeHoverIndex, setRecipeHoverIndex, subscribeRecipeHover } from './lib/recipeHoverBridge'
import { useBuilderPreviewLayout } from './hooks/useBuilderPreviewLayout'
import { getDirtyBuilderFieldKeys, cloneBuilderRecipe } from './lib/multiEditDraft'
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
import { useSafeguardsGridFilterMode, sanitizeSafeguardsGridFilterMode } from './state/safeguardsPreferences'
import { useSellfileDedupPreference, useSellfileOmitDisabledPreference } from './state/exportPreferences'
import { useHsfcDialogs } from './hooks/useHsfcDialogs'
import { useHsfcHistoryController } from './hooks/useHsfcHistoryController'
import type { HistoryEntryDescriptor, DescribeNextChangeFn } from './hooks/useHsfcHistory'
import { createBuilderRecipeUpdateDescriptor } from './history/builderUpdateDescriptor'
import {
  createRecipeAddedDescriptor,
  createRecipeOverridesAppliedDescriptor,
  createRecipesDuplicatedDescriptor,
  createRecipesClearedDescriptor,
  createRecipesDeletedDescriptor,
  createRecipesInsertedDescriptor,
  createRecipesMovedDescriptor,
} from './history/recipeCollectionDescriptors'
import {
  createSubstatTargetsChangeDescriptor,
  areSubstatTargetTablesEqual,
  isDefaultSubstatTargetTable,
  appendDescriptorDetails,
} from './history/substatTargetDescriptors'
import { createFinalSellChangeDescriptor, areFinalSellSettingsEqual, type FinalSellDescriptorMode } from './history/finalSellDescriptors'
import { createNoteChangeDescriptor, normalizeNoteValue, type NoteDescriptorMode } from './history/noteDescriptors'
import { createHsfcLoadedDescriptor, createAutosaveRestoredDescriptor, makeClipboardSourceDescriptor } from './history/bulkLoadDescriptors'
import {
  createSafeguardsEnabledChangeDescriptor,
  createSafeguardsRulesChangeDescriptor,
  isSafeguardRuleOrderChanged,
} from './history/safeguardsDescriptors'
import { buildInsertionLocation, snapshotRecipeLabel } from './history/historyLabelUtils'
import { useAutoSideBySideZoom } from './hooks/useAutoSideBySideZoom'
import {
  applyRecipeOverrides,
  applyRecipeOverridesSubstatTargetsOverrides,
  buildRecipeOverridesExportModeResolution,
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_RECIPE_OVERRIDES_DISABLED_KEY,
  pruneNoteRecipeOverridesAnswers,
  resolveRecipeOverridesExportMode,
  resolveRecipeOverridesEffectiveRecipe,
  resolveRecipeOverridesTags,
  type RecipeOverridesInstructions,
} from './lib/noteRecipeOverrides'

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

const createGearDbFileFromBytes = (name: string, bytes: Uint8Array, contentType?: string | null): File | null => {
  if (!bytes || bytes.length === 0 || typeof File !== 'function') {
    return null
  }
  const fileName = name && name.trim().length > 0 ? name : DEFAULT_GEAR_DB_FILENAME
  try {
    // Avoid copying into an intermediate buffer; File can ingest typed arrays directly.
    // Cast to ArrayBuffer-backed view to satisfy DOM typing without a clone.
    const view = bytes as Uint8Array<ArrayBuffer>
    return new File([view], fileName, { type: contentType || 'application/octet-stream' })
  } catch {
    return null
  }
}

function splitMergedRules(rules: readonly HsfRuleWithRecipe[]): { baseRules: HsfRuleWithRecipe[]; finalSellRules: HsfRuleWithRecipe[] } {
  const baseRules: HsfRuleWithRecipe[] = []
  const finalSellRules: HsfRuleWithRecipe[] = []
  for (const rule of rules) {
    // Keep override sources belong with base rules so downstream logic can reuse them.
    if (
      rule.__source === RULE_SOURCE_HSF
      || rule.__source === RULE_SOURCE_SAFEGUARDS
    ) {
      baseRules.push(rule)
    } else if (rule.__source === RULE_SOURCE_FINAL_SELL) {
      finalSellRules.push(rule)
    }
  }
  return { baseRules, finalSellRules }
}

type RecipeRulesStateSnapshot = {
  baseRules: HsfRuleWithRecipe[]
  finalSellRules: HsfRuleWithRecipe[]
  rulesByRecipe: Map<number, HsfRuleWithRecipe[]>
  countsByRecipe: Map<number, number>
  keys: string[]
  substatTargetsKey: string
  mergedRules: HsfRuleWithRecipe[]
  truncatedRecipeIndices: number[]
  totalLimitHit: boolean
  excludedByTotalLimitIndices: number[]
}

// One-shot signal used to focus a Safeguards card after cross-surface jumps.
// Token increments force downstream effects even when the same rule is requested twice.
type SafeguardFocusRequest = {
  ruleId: string
  token: number
}

// One-shot signal for scrolling Rule Tester to a specific artifact card.
// Token increments allow repeated jumps to the same artifact id.
type TesterArtifactFocusRequest = {
  artifactId: number
  token: number
}

// Inserts/updates still flow through the worker; the UI only handles pure reorders locally.

export default function App({ colorBlindMode, setColorBlindMode }: { colorBlindMode: ColorBlindMode; setColorBlindMode: (m: ColorBlindMode) => void }) {
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  // Shared app state via context — reduces prop drilling and keeps behavior consistent.
  const {
    customRecipes,
    selectedRecipeIdx,
    metasets,
    substatTargets,
    finalSellRemainder,
    logicHubDialogTab,
    hsfcNote,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
  } = useAppState()
  const customRecipesRef = useRef(customRecipes)
  useEffect(() => { customRecipesRef.current = customRecipes }, [customRecipes])
  const {
    setCustomRecipes,
    setSelectedRecipeIdx: setSelectedRecipeIdxRaw,
    setMetasets,
    setSubstatTargets,
    setFinalSellRemainder,
    setLogicHubDialogTab,
    setHsfcNote,
    setNoteRecipeOverridesAnswers,
    setNoteRecipeOverridesDisabled,
    setSafeguardRules,
    setSafeguardsEnabled,
  } = useAppActions()
  const [safeguardsGridFilterMode, setSafeguardsGridFilterMode] = useSafeguardsGridFilterMode()
  const { runPipeline, flush: flushRuleCache, countRules } = useRuleCacheWorker()
  const { statButtonBorders } = useDisplayPreferences()
  const [autoApplySelectedRecipe] = useAutoApplySelectedRecipePreference()
  const { setStatButtonBorders } = useDisplayPreferenceActions()
  // Normalize the note text so recipe overrides parsing never sees null.
  const recipeOverridesNoteText = (!noteRecipeOverridesDisabled && typeof hsfcNote === 'string') ? hsfcNote : ''
  // Resolve recipe overrides tag actions based on the current note + answers.
  const recipeOverridesResolution = useMemo(
    () => resolveRecipeOverridesTags(recipeOverridesNoteText, noteRecipeOverridesAnswers),
    [recipeOverridesNoteText, noteRecipeOverridesAnswers],
  )
  // Keep a stable instruction map for downstream UI and filter logic.
  const recipeOverridesInstructions = recipeOverridesResolution.instructions
  // Resolve recipe overrides-driven export modes for every recipe.
  const recipeOverridesExportModes = useMemo(
    () => buildRecipeOverridesExportModeResolution(customRecipes, recipeOverridesInstructions),
    [customRecipes, recipeOverridesInstructions],
  )
  // Apply recipe overrides for preview consumers (rules + note chips) without mutating HSFC recipes.
  const recipeOverridesRecipesForRules = useMemo(
    () => applyRecipeOverrides(customRecipes, recipeOverridesInstructions),
    [customRecipes, recipeOverridesInstructions],
  )
  const recipeOverridesSubstatTargetsResolution = useMemo(
    () => applyRecipeOverridesSubstatTargetsOverrides(substatTargets, customRecipes, recipeOverridesInstructions),
    [substatTargets, customRecipes, recipeOverridesInstructions],
  )
  const effectiveSubstatTargets = recipeOverridesSubstatTargetsResolution.substatTargets
  const substatTargetsOverridesActive = recipeOverridesSubstatTargetsResolution.overridesActive
  // Use a deferred snapshot so bursty substatTargets updates (e.g., Restore Defaults) coalesce before recomputing merged rules.
  const ruleRecipes = useMemo(() => recipesForRuleBuild(recipeOverridesRecipesForRules), [recipeOverridesRecipesForRules])
  const recipeNames = useMemo(() => customRecipes.map((recipe) => (typeof recipe?.name === 'string' ? recipe.name : '')), [customRecipes])
  // Normalize tags once so every filter path uses the same tag tokens.
  const normalizeRecipeTags = useCallback((recipe: BuilderRecipe | null | undefined): string[] => {
    // Coerce tags into strings so recipe filters can consume them safely.
    const rawTags = Array.isArray(recipe?.tags) ? recipe.tags : []
    // Trim and drop empty values to keep filter matching predictable.
    const normalized: string[] = []
    for (const tag of rawTags) {
      const trimmed = (typeof tag === 'string' ? tag : String(tag)).trim()
      if (trimmed.length > 0) normalized.push(trimmed)
    }
    return normalized
  }, [])
  // Keep tags in a parallel list so recipe filters can match either name or tag tokens.
  const recipeTags = useMemo(
    () => customRecipes.map((recipe) => normalizeRecipeTags(recipe)),
    [customRecipes, normalizeRecipeTags],
  )
  const recipeModes = useMemo(() => recipeOverridesExportModes.modes, [recipeOverridesExportModes])
  const substatTargetsForPreview = useDeferredValue(effectiveSubstatTargets)
  const metasetsForPreview = useDeferredValue(metasets)
  const ruleRecipesForPreview = useDeferredValue(ruleRecipes)
  const recipeModesForPreview = useDeferredValue(recipeModes)
  const recipeNamesForPreview = useDeferredValue(recipeNames)
  // Keep tester math reusable so seeding hooks share the same normalization as the dialog.
  const testerMath = useMemo(() => createRuleTesterMath(effectiveSubstatTargets), [effectiveSubstatTargets])
  const lastRecipeNamesRef = useRef<string[]>(recipeNamesForPreview)
  // Track the last safeguard label signature so name-only edits can update chips without a rebuild.
  const lastSafeguardLabelSignatureRef = useRef<string>('')
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
  const fingerprintSafeguardRuleList = useCallback((rules: readonly SafeguardRule[]): string => {
    if (!rules.length) return ''
    return rules.map((rule) => {
      const comboHash = hashSafeguardCombination(rule.combination)
      const activation = rule.activation ?? SafeguardRuleActivation.ProtectExisting
      const required = Number.isFinite(rule.requiredCount) ? Number(rule.requiredCount) : 0
      // Include ignore toggles so cache fingerprints track safeguard behavior changes.
      const ignorePrevious = rule.ignorePreviousSafeguards !== false ? 1 : 0
      const ignoreCollection = rule.ignoreEquippedInCollection === true ? 1 : 0
      const ignoreVault = rule.ignoreEquippedInVault === true ? 1 : 0
      const mode = sanitizeSafeguardCountMode(rule.countMode)
      const modeKey = [
        mode.perRule ? 1 : 0,
        mode.perSlot ? 1 : 0,
        mode.perSet ? 1 : 0,
        mode.perFaction ? 1 : 0,
        mode.perMainStat ? 1 : 0,
      ].join('')
      // Track whether a substat selection exists so match defaults stay aligned.
      const hasSubstatSelection = Array.isArray(rule.substats) && rule.substats.length > 0
      const substats = hasSubstatSelection ? rule.substats.map(Number).sort((a, b) => a - b).join(',') : ''
      // Normalize match only when substats are active to avoid churn.
      const substatMatch = hasSubstatSelection
        ? normalizeSafeguardSubstatMatch(rule.substatMatch)
        : SafeguardSubstatMatch.Any
      // Weights only affect the fingerprint when Per Substat is not active.
      const weightEntries = hasSubstatSelection && substatMatch !== SafeguardSubstatMatch.PerSubstat
        ? Object.entries(rule.substatWeights ?? {})
          .map(([key, raw]) => {
            const variant = Number(key)
            if (!Number.isFinite(variant)) return null
            const normalized = normalizeTesterSortWeight(Number(raw))
            if (normalized === TESTER_SORT_WEIGHT_DEFAULT) return null
            return `${variant}:${normalized.toFixed(2)}`
          })
          .filter((entry): entry is string => Boolean(entry))
          .sort()
          .join(',')
        : ''
      return `${rule.id ?? comboHash}:${activation}:${required}:${ignorePrevious}${ignoreCollection}${ignoreVault}:${modeKey}:${comboHash}:${substatMatch}:${substats}:${weightEntries}`
    }).join('|')
  }, [])
  // Combined fingerprint captures every input that affects the warmed rule cache while ignoring display-only fields.
  const buildRulesFingerprint = useCallback((args: {
    substatTargetsKey: string
    recipeKeys: string[]
    metasets: readonly Metaset[]
    hsf: HsfFile | null
    safeguardRules: readonly SafeguardRule[]
    safeguardsEnabled: boolean
    finalSell: FinalSellRemainderConfig | null | undefined
  }): string => {
    const {
      substatTargetsKey,
      recipeKeys,
      metasets,
      hsf: hsfFile,
      safeguardRules,
      safeguardsEnabled: kuEnabled,
      finalSell,
    } = args
    // Metaset + safeguard signatures ensure warm reuse stays aligned with resolved datasets.
    const metasetSig = fingerprintMetasetsForRules(metasets)
    const safeguardSig = `${kuEnabled ? 'on' : 'off'}:${fingerprintSafeguardRuleList(safeguardRules)}`
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
    return [
      substatTargetsKey,
      recipeKeys.join(','),
      metasetSig,
      hsfSig,
      finalSellSig,
      safeguardSig,
    ].join('|')
  }, [fingerprintSafeguardRuleList, fingerprintMetasetsForRules])
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
      // Prefer canonical DB-backed ids so cache keys are stable across reloads.
      const canonicalItemId = resolveCanonicalTestItemId(item)
      // Keep fallback ids deterministic for malformed/manual rows.
      const itemId = canonicalItemId ?? -(idx + 1)
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
  const getArtifactItemId = useCallback((artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
    // Share one resolver with worker/cache logic so key precedence cannot drift.
    return resolveArtifactItemIdWithFallback(artifact, fallbackIdx)
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
  // Summarize tester outcomes so the preview header + note dialog share one chip.
  const testerOutcomeSummary = useMemo(
    () => buildTesterOutcomeSummary(testerPreviewRows),
    [testerPreviewRows],
  )
  const [safeguardDetection, setSafeguardDetection] = useState<SafeguardDetectionSnapshot | null>(null)
  const [safeguardGroupItemKeys, setSafeguardGroupItemKeys] = useState<Set<number>>(new Set())
  const safeguardDetectionRef = useRef<SafeguardDetectionSnapshot | null>(safeguardDetection)
  useEffect(() => { safeguardDetectionRef.current = safeguardDetection }, [safeguardDetection])
  const safeguardDetectionSignature = useMemo(
    () => fingerprintSafeguardDetection(safeguardDetection),
    [safeguardDetection],
  )
  const safeguardScanAppliedRef = useRef<string | null>(null)
  const keepOverrideAppliedStateRef = useRef<{
    baseRules: readonly HsfRuleWithRecipe[] | null
    rulesByRecipe: RecipeRulesStateSnapshot['rulesByRecipe'] | null
    finalSellRules: readonly HsfRuleWithRecipe[] | null
  }>({
    baseRules: null,
    rulesByRecipe: null,
    finalSellRules: null,
  })
  // Force a re-apply when Safeguards detection changes so late DB loads still inject keep overrides.
  useEffect(() => {
    if (!safeguardDetectionSignature) return
    if (safeguardDetectionSignature !== safeguardScanAppliedRef.current) {
      keepOverrideAppliedStateRef.current = {
        baseRules: null,
        rulesByRecipe: null,
        finalSellRules: null,
      }
    }
  }, [safeguardDetectionSignature])
  const resetKeepOverrideDetectionState = useCallback(() => {
    // Clear applied signatures so the next detection snapshot can re-inject rules.
    safeguardScanAppliedRef.current = null
    keepOverrideAppliedStateRef.current = {
      baseRules: null,
      rulesByRecipe: null,
      finalSellRules: null,
    }
    setSafeguardDetection(null)
    setSafeguardGroupItemKeys(new Set())
  }, [setSafeguardDetection, setSafeguardGroupItemKeys])
  const resolvedSafeguardRules = useMemo(() => (
    resolveSafeguardRulesWithMetasets(safeguardRules, metasets)
  ), [safeguardRules, metasets])
  const safeguardsActive = safeguardsEnabled && resolvedSafeguardRules.length > 0
  const keepOverridesActive = safeguardsActive
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
  // Track the last safeguard structural signature so cosmetic edits do not retrigger the pipeline.
  const safeguardStructureSigRef = useRef<string | null>(null)
  const beginTesterMatchReset = useCallback((reason: TesterMatchResetReason) => {
    resetKeepOverrideDetectionState()
    const targetBuildId = gearEntriesActiveBuildId > gearEntriesCommittedBuildId
      ? gearEntriesActiveBuildId
      : gearEntriesCommittedBuildId + 1
    testerMatchResetRef.current = {
      reason,
      targetBuildId,
      startedAt: Date.now(),
    }
    setTesterMatchResetReason(reason)
  }, [resetKeepOverrideDetectionState, gearEntriesActiveBuildId, gearEntriesCommittedBuildId])
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
    isSideBySide,
  } = useBuilderPreviewLayout({ forceSideBySide: forceSideBySideLayout })
  // Empty-state messaging reads better when stacked (top-aligned) but looks balanced side-by-side (centered).
  const emptyStateVerticalAlign = isSideBySide ? 'center' : 'top'
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
  // Usage counts for sets and metasets across current recipes
  const setUsageCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    for (const recipe of customRecipes) {
      // Only count explicit inclusions so exclusions do not inflate usage stats.
      const sets = splitArtifactSetSelections(recipe.artifactSets).included
      const seen = new Set<number>()
      for (const sid of sets) {
        if (seen.has(sid)) continue
        seen.add(sid)
        counts[sid] = (counts[sid] ?? 0) + 1
      }
    }
    return counts
  }, [customRecipes])
  // Track metaset references across Safeguard rules (counting each rule once) so
  // the UI can surface Safeguard dependencies separately from recipe usage.
  const safeguardMetasetUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const rule of safeguardRules) {
      // Treat a rule that references the same metaset multiple times as a single hit
      // so the overlay reflects “number of rules” rather than raw ID frequency.
      const metaIds = Array.from(new Set(rule.combination.metaSetIds ?? []))
      if (!metaIds.length) continue
      for (const metaId of metaIds) {
        counts[metaId] = (counts[metaId] ?? 0) + 1
      }
    }
    return counts
  }, [safeguardRules])
  const metasetUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const recipe of customRecipes) {
      const metas = recipe.artifactMetaSets ?? []
      const seen = new Set<string>()
      for (const mid of metas) {
        if (seen.has(mid)) continue
        seen.add(mid)
        counts[mid] = (counts[mid] ?? 0) + 1
      }
    }
    return counts
  }, [customRecipes])
  // colorsDlgOpen handled in useManageColorsDialog

  const [builderState, setBuilderState] = useState<BuilderRecipe>(() => createFactoryBuilderDefaults())
  const builder = builderState
  // Keep a ref to the latest builder so tutorial helpers and action handlers can snapshot current
  // values without waiting for React to flush state updates.
  const builderRef = React.useRef(builder)
  const [recipeRulesState, setRecipeRulesState] = useState<RecipeRulesStateSnapshot>(() => {
    // Seed the cache using recipe overrides-effective export modes.
    const recipesForRules = recipesForRuleBuild(recipeOverridesRecipesForRules)
    const baseRuleCount = Array.isArray(hsf?.Rules) ? (hsf?.Rules.length ?? 0) : 0
    const initial = updateRecipeRulesCache({
      recipes: recipesForRules,
      metasets,
      substatTargets: effectiveSubstatTargets,
      baseRuleCount,
    })
    const mergedRules = computeMergedRules({
      hsf,
      customRecipes: recipesForRules,
      metasets,
      substatTargets: effectiveSubstatTargets,
      ...(finalSellRemainder ? { finalSellRemainder } : {}),
      prebuiltCustomRules: initial.rulesByRecipe,
      safeguards: {
        enabled: safeguardsActive,
        rules: resolvedSafeguardRules,
        detection: safeguardsActive ? safeguardDetection : null,
      },
    })
      const { baseRules, finalSellRules } = splitMergedRules(mergedRules)
      if (keepOverridesActive && safeguardDetection) {
        // Seed applied-state refs so detection effects know this snapshot already includes the scan results.
        keepOverrideAppliedStateRef.current = {
          baseRules,
          rulesByRecipe: initial.rulesByRecipe,
          finalSellRules,
        }
        if (safeguardDetection) {
          safeguardScanAppliedRef.current = fingerprintSafeguardDetection(safeguardDetection)
        }
      }
      return {
        baseRules,
        finalSellRules,
        rulesByRecipe: initial.rulesByRecipe,
      countsByRecipe: initial.countsByRecipe,
      keys: initial.keys,
      substatTargetsKey: initial.substatTargetsKey,
      mergedRules,
      truncatedRecipeIndices: initial.truncatedRecipeIndices.slice(),
      totalLimitHit: initial.totalLimitHit,
      excludedByTotalLimitIndices: initial.excludedByTotalLimitIndices.slice(),
    }
  })
  const recipeRulesStateRef = useRef(recipeRulesState)
  useEffect(() => { recipeRulesStateRef.current = recipeRulesState }, [recipeRulesState])
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
  // Freeze recipe names to the last committed snapshot while rows build so displayed indices do not shift mid-run.
  const recipeNamesForGrid = useMemo(
    () => ((rulesBuilding || gearEntriesBuilding) ? lastRecipeNamesRef.current : recipeNamesForPreview),
    [rulesBuilding, gearEntriesBuilding, recipeNamesForPreview],
  )
  // Keep tester chip labels in sync with the frozen recipe-name snapshot so chips never display mid-build indices.
  const testerRecipeNamesForGrid = useMemo(() => recipeNamesForGrid.map((name) => {
    if (typeof name !== 'string') return null
    const trimmed = name.trim()
    return trimmed.length > 0 ? trimmed : null
  }), [recipeNamesForGrid])
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
    const prevState = recipeRulesStateRef.current
    const prevMatches = testerPreviewRowsRef.current
    const prevRecipeNames = lastRecipeNamesRef.current
    // Prefer live snapshots whenever deferred previews lag so fingerprints match the payload we send to the worker.
    const previewRecipesStale = (
      ruleRecipesForPreview.length !== ruleRecipes.length
      || ruleRecipesForPreview.some((recipe, idx) => recipe !== ruleRecipes[idx])
    )
    const recipesForBuild = previewRecipesStale ? ruleRecipes : ruleRecipesForPreview
    // Align recipe-name snapshots with the recipe payload so match chips stay in sync.
    // Align recipe-name snapshot with the recipe payload so recipeIdx remaps stay deterministic.
    const previewNamesStale = (
      recipeNamesForPreview.length !== recipeNames.length
      || recipeNamesForPreview.some((name, idx) => name !== recipeNames[idx])
    )
    const recipeNamesForBuild = previewNamesStale ? recipeNames : recipeNamesForPreview
    // Recipe modes gate disabled/separator recipes during matcher eval, so keep the snapshot aligned with the builder payload.
    const previewModesStale = (
      recipeModesForPreview.length !== recipeModes.length
      || recipeModesForPreview.some((mode, idx) => mode !== recipeModes[idx])
    )
    const recipeModesForBuild = previewModesStale ? recipeModes : recipeModesForPreview
    // Keep a stable label map so safeguard name edits can update tester chips without a rebuild.
    const safeguardLabelMap = (() => {
      // Build a lookup by rule id so injected rows can resolve live names.
      const map = new Map<string, string>()
      for (const rule of safeguardRules) {
        if (!rule || typeof rule.id !== 'string') continue
        const label = resolveSafeguardRuleLabel(rule)
        if (!label) continue
        map.set(rule.id, label)
      }
      return map
    })()
    // Hash the label map so we can detect name-only changes cheaply.
    const safeguardLabelSignature = Array.from(safeguardLabelMap.entries())
      .map(([id, label]) => `${id}:${label}`)
      .join('|')
    // Compare against the last applied signature so we can refresh chips without rebuilding rules.
    const safeguardLabelsChanged = safeguardLabelSignature !== lastSafeguardLabelSignatureRef.current
    // Artifact signature drives match reuse; keep it alongside the fingerprint so duplicate builds can bail quickly.
    const pipelineArtifactSignature = testerArtifactsSignature
    // Mirror metasets and substat targets to the same snapshot to avoid stale warm fingerprints.
    const previewMetasetsStale = (
      metasetsForPreview.length !== metasets.length
      || metasetsForPreview.some((meta, idx) => meta !== metasets[idx])
    )
    const metasetsForBuild = previewMetasetsStale ? metasets : metasetsForPreview
    const substatTargetsForBuild = substatTargetsForPreview === effectiveSubstatTargets
      ? effectiveSubstatTargets
      : (substatTargetsForPreview ?? effectiveSubstatTargets)
    // Use the build-aligned snapshot for key comparisons so reorders are detected even if deferred previews lag.
    const nextSubstatTargetsKey = fingerprintSubstatTargets(substatTargetsForBuild)
    const nextRecipeKeys = recipesForBuild.map((recipe) => fingerprintRecipeForRules(recipe, nextSubstatTargetsKey))
    const safeguardStructureSig = fingerprintSafeguardRuleList(resolvedSafeguardRules)
    const nextFingerprint = buildRulesFingerprint({
      substatTargetsKey: nextSubstatTargetsKey,
      recipeKeys: nextRecipeKeys,
      metasets: metasetsForBuild,
      hsf,
      safeguardRules: resolvedSafeguardRules,
      safeguardsEnabled,
      finalSell: finalSellRemainder,
    })
    // If the warmed state already covers this fingerprint, skip the worker warm pass and avoid toggling spinners.
    const canSkipWarm = lastWarmFingerprintRef.current === nextFingerprint
    // Name-only edits should not wake the worker; detect them explicitly.
    const recipeNamesChanged = (() => {
      if (prevRecipeNames.length !== recipeNamesForBuild.length) return true
      for (let i = 0; i < recipeNamesForBuild.length; i += 1) {
        if (recipeNamesForBuild[i] !== prevRecipeNames[i]) return true
      }
      return false
    })()
    // Artifact signature drift signals that the tester payload meaningfully changed.
    const artifactsChanged = !lastPipelineSignatureRef.current
      || lastPipelineSignatureRef.current.artifactSig !== pipelineArtifactSignature
    // When the preview empties out we need to purge the worker's artifact cache explicitly;
    // otherwise, stale cached artifacts would keep producing safeguard rows.
    const workerNeedsReset = testerPreviewArtifacts.length === 0
      && lastPipelineSignatureRef.current?.artifactSig !== pipelineArtifactSignature
      && lastPipelineSignatureRef.current?.artifactSig !== undefined
      && lastPipelineSignatureRef.current?.artifactSig !== null
    // Skip redundant pipelines when deferred snapshots catch up without changing the rule or artifact signatures.
    if (
      canSkipWarm
      && !recipeNamesChanged
      && !safeguardLabelsChanged
      && lastPipelineSignatureRef.current
      && lastPipelineSignatureRef.current.fingerprint === nextFingerprint
      && lastPipelineSignatureRef.current.artifactSig === pipelineArtifactSignature
      && !workerNeedsReset
    ) {
      safeguardStructureSigRef.current = safeguardStructureSig
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
      ? buildIndexMapping(prevState.keys, nextRecipeKeys)
      : null
    const hasArtifacts = testerPreviewArtifacts.length > 0

    if (!artifactsChanged && canSkipWarm && (recipeNamesChanged || safeguardLabelsChanged) && prevMatches.length > 0) {
      // Names changed but rule fingerprints are stable; update cached rows without rebuilding.
      const resolveRecipeName = (recipeIdx: number | null): string | null => {
        // Builder recipe names still key off the recipe index snapshot.
        if (recipeIdx == null) return null
        return recipeNamesForBuild[recipeIdx] ?? null
      }
      const resolveSafeguardLabel = (ruleIndex: number | null): string | null => {
        // Keep-unique labels are mapped by rule id so they can refresh without rebuilding rules.
        if (ruleIndex == null || !prevState?.mergedRules) return null
        const rule = prevState.mergedRules[ruleIndex]
        if (!rule || rule.__source !== RULE_SOURCE_SAFEGUARDS) return null
        const ruleId = rule.__safeguardRuleId
        if (ruleId && safeguardLabelMap.has(ruleId)) {
          return safeguardLabelMap.get(ruleId) ?? null
        }
        return resolveSafeguardRuleLabel(rule)
      }
      const refreshMatch = (match: TesterPreviewMatch | null): TesterPreviewMatch | null => {
        // Recompute recipe names, while safeguard matches use the live rule label map.
        if (!match) return null
        const nextRecipeName = resolveRecipeName(match.recipeIdx)
        const safeguardLabel = match.ruleSource === RULE_SOURCE_SAFEGUARDS
          ? resolveSafeguardLabel(match.ruleIndex)
          : null
        const resolvedRecipeName = match.ruleSource === RULE_SOURCE_SAFEGUARDS
          ? (safeguardLabel ?? match.recipeName ?? null)
          : nextRecipeName
        const resolvedRuleLabel = match.ruleSource === RULE_SOURCE_SAFEGUARDS
          ? (safeguardLabel ?? match.ruleLabel ?? null)
          : match.ruleLabel
        return { ...match, recipeName: resolvedRecipeName, ruleLabel: resolvedRuleLabel }
      }
      const updatedRows = prevMatches.map((row) => ({
        ...row,
        match: refreshMatch(row.match),
        baseMatch: refreshMatch(row.baseMatch),
      }))
      setTesterPreviewRows(sortTesterRows(updatedRows))
      lastRecipeNamesRef.current = recipeNamesForBuild
      lastSafeguardLabelSignatureRef.current = safeguardLabelSignature
      return () => {
        abortController.abort()
        if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
      }
    }
    if (!artifactsChanged && canSkipWarm && safeguardLabelsChanged && prevMatches.length === 0 && !recipeNamesChanged) {
      // No rows to refresh, but we still want to record the latest safeguard labels.
      lastRecipeNamesRef.current = recipeNamesForBuild
      lastSafeguardLabelSignatureRef.current = safeguardLabelSignature
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
      const remapRulesForIndex = (rules: readonly HsfRuleWithRecipe[], newIdx: number): HsfRuleWithRecipe[] => (
        rules.map((rule) => cloneRuleWithRecipeIndex(rule, newIdx))
      )
      const newRulesByRecipe = new Map<number, HsfRuleWithRecipe[]>()
      const newCountsByRecipe = new Map<number, number>()
      const newTruncated: number[] = []
      const newExcluded: number[] = []
      const prevTruncated = new Set(prevState.truncatedRecipeIndices)
      const prevExcluded = new Set(prevState.excludedByTotalLimitIndices)
      const customSegments: HsfRuleWithRecipe[][] = []
      for (let newIdx = 0; newIdx < mapping.length; newIdx += 1) {
        const prevIdx = mapping[newIdx]!
        const prevRules = prevState.rulesByRecipe.get(prevIdx) ?? []
        const remapped = remapRulesForIndex(prevRules, newIdx)
        newRulesByRecipe.set(newIdx, remapped)
        customSegments.push(remapped)
        const prevCount = prevState.countsByRecipe.get(prevIdx)
        if (prevTruncated.has(prevIdx)) {
          newCountsByRecipe.set(newIdx, Number.POSITIVE_INFINITY)
          newTruncated.push(newIdx)
        } else {
          newCountsByRecipe.set(newIdx, typeof prevCount === 'number' ? prevCount : remapped.length)
        }
        if (prevExcluded.has(prevIdx)) newExcluded.push(newIdx)
      }
      const mergedRules = prevState.baseRules.concat(...customSegments, prevState.finalSellRules)
      setRecipeRulesState({
        ...prevState,
        rulesByRecipe: newRulesByRecipe,
        countsByRecipe: newCountsByRecipe,
        keys: nextRecipeKeys,
        substatTargetsKey: nextSubstatTargetsKey,
        mergedRules,
        truncatedRecipeIndices: newTruncated,
        excludedByTotalLimitIndices: newExcluded,
      })
      keepOverrideAppliedStateRef.current = {
        baseRules: prevState.baseRules,
        rulesByRecipe: newRulesByRecipe,
        finalSellRules: prevState.finalSellRules,
      }
      lastWarmFingerprintRef.current = nextFingerprint
      // Avoid flashing the preview spinner when we served this entirely from the cache.
      setRulesBuilding(false)
      setGearEntriesBuilding(false)
      setRulesBuildProgress(null)
      setGearEntriesProgress(null)
      if (prevMatches && prevMatches.length > 0) {
        // Keep-unique labels may have drifted; resolve them from the live rule list.
        const resolveSafeguardLabel = (ruleIndex: number | null): string | null => {
          if (ruleIndex == null) return null
          const rule = prevState.mergedRules[ruleIndex]
          if (!rule || rule.__source !== RULE_SOURCE_SAFEGUARDS) return null
          const ruleId = rule.__safeguardRuleId
          if (ruleId && safeguardLabelMap.has(ruleId)) {
            return safeguardLabelMap.get(ruleId) ?? null
          }
          return resolveSafeguardRuleLabel(rule)
        }
        const remapRecipeIdx = (recipeIdx: number | null): number | null => {
          if (recipeIdx == null) return null
          const nextIdx = inverse.get(recipeIdx)
          return typeof nextIdx === 'number' ? nextIdx : null
        }
        const remapDecision = (decision: MatchingRecipeDecision): MatchingRecipeDecision => {
          const nextIdx = remapRecipeIdx(decision.recipeIdx)
          const recipeIdx = typeof nextIdx === 'number' ? nextIdx : decision.recipeIdx
          return { ...decision, recipeIdx }
        }
        const remappedRows = prevMatches.map((row) => ({
          ...row,
          match: (() => {
            if (!row.match) return null
            const nextIdx = remapRecipeIdx(row.match.recipeIdx)
            const nextName = nextIdx != null ? recipeNamesForBuild[nextIdx] ?? null : null
            const safeguardLabel = row.match.ruleSource === RULE_SOURCE_SAFEGUARDS
              ? resolveSafeguardLabel(row.match.ruleIndex)
              : null
            const recipeName = row.match.ruleSource === RULE_SOURCE_SAFEGUARDS
              ? (safeguardLabel ?? row.match.recipeName ?? null)
              : nextName
            const ruleLabel = row.match.ruleSource === RULE_SOURCE_SAFEGUARDS
              ? (safeguardLabel ?? row.match.ruleLabel ?? null)
              : row.match.ruleLabel
            return { ...row.match, recipeIdx: nextIdx, recipeName, ruleLabel }
          })(),
          baseMatch: (() => {
            if (!row.baseMatch) return null
            const nextIdx = remapRecipeIdx(row.baseMatch.recipeIdx)
            const nextName = nextIdx != null ? recipeNamesForBuild[nextIdx] ?? null : null
            const safeguardLabel = row.baseMatch.ruleSource === RULE_SOURCE_SAFEGUARDS
              ? resolveSafeguardLabel(row.baseMatch.ruleIndex)
              : null
            const recipeName = row.baseMatch.ruleSource === RULE_SOURCE_SAFEGUARDS
              ? (safeguardLabel ?? row.baseMatch.recipeName ?? null)
              : nextName
            const ruleLabel = row.baseMatch.ruleSource === RULE_SOURCE_SAFEGUARDS
              ? (safeguardLabel ?? row.baseMatch.ruleLabel ?? null)
              : row.baseMatch.ruleLabel
            return { ...row.baseMatch, recipeIdx: nextIdx, recipeName, ruleLabel }
          })(),
          matchingRecipeIndices: row.matchingRecipeIndices.map((idx) => {
            const nextIdx = inverse.get(idx)
            return typeof nextIdx === 'number' ? nextIdx : idx
          }),
          matchingRecipeDecisions: (row.matchingRecipeDecisions ?? []).map(remapDecision),
        }))
        setTesterPreviewRows(sortTesterRows(remappedRows))
      }
      lastRecipeNamesRef.current = recipeNamesForBuild
      lastSafeguardLabelSignatureRef.current = safeguardLabelSignature
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

      // Safeguards payload seeds the worker with the current rule set.
      const safeguardsPayload = {
        enabled: safeguardsEnabled && resolvedSafeguardRules.length > 0,
        rules: resolvedSafeguardRules,
        detection: null as SafeguardDetectionSnapshot | null,
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
          const cached = cache.get(itemId)
          const testerPayload = artifact.testerItem as RuleTesterItem | undefined
          const fingerprint = cached?.fingerprint ?? (testerPayload ? fingerprintRuleTesterItem(testerPayload) : '')
          nextFingerprints.set(itemId, fingerprint ?? '')
          if (!diffOnly || prevFingerprints.get(itemId) !== fingerprint) {
            changed.push([itemId, artifact])
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
        rules: readonly HsfRuleWithRecipe[],
      ): TesterPreviewMatch | null => {
        if (!result) return null
        const rule = rules[result.ruleIndex]
        const recipeIdx = result.recipeIdx ?? null
        const recipeName = resolveMatchRecipeName(recipeIdx, recipeNamesForBuild, rule)
        // Safeguards use rule ordinals instead of recipe names.
        const safeguardLabel = rule?.__source === RULE_SOURCE_SAFEGUARDS
          ? resolveSafeguardRuleLabel(rule)
          : null
        const effectiveRecipeName = recipeName && recipeName.length > 0
          ? recipeName
          : safeguardLabel
        return {
          ruleIndex: result.ruleIndex,
          keep: result.keep,
          recipeIdx,
          recipeName: effectiveRecipeName && effectiveRecipeName.length > 0 ? effectiveRecipeName : null,
          ruleLabel: safeguardLabel ?? null,
          ruleSource: rule?.__source ?? null,
        }
      }

      // Guard against empty deferred snapshots on first load by falling back to immediate state.
      // Avoid empty payloads on first render by falling back to immediate snapshots when deferred values lag.
      const recipesForPipeline = recipesForBuild
      const metasetsForPipeline = metasetsForBuild
      const substatTargetsForPipeline = substatTargetsForBuild
      const pipelinePayload: Parameters<typeof runPipeline>[0] = {
        recipes: recipesForPipeline,
        metasets: metasetsForPipeline,
        substatTargets: substatTargetsForPipeline,
        hsf,
        ...(finalSellRemainder ? { finalSellRemainder } : {}),
        safeguards: safeguardsPayload,
        recipeModes: recipeModesForBuild,
        artifacts: [],
        artifactPatch,
        artifactSignature: testerArtifactsSignature,
        fingerprint: nextFingerprint,
        skipWarm: canSkipWarm,
        skipMatches: false,
        skipDetection: false,
        resetArtifacts: workerNeedsReset,
      }

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
          const { state, matches, safeguardDetection } = result
          if (abortController.signal.aborted) {
            // Clear reuse fingerprints when the active run is cancelled mid-flight.
            if (requestToken === rulesBuildingTokenRef.current) {
              lastPipelineSignatureRef.current = null
              lastCommittedArtifactFingerprintsRef.current = new Map()
              lastWarmFingerprintRef.current = null
            }
            return
          }
          if (requestToken !== rulesBuildingTokenRef.current) return
          lastWarmFingerprintRef.current = nextFingerprint
          const { baseRules, finalSellRules } = splitMergedRules(state.mergedRules)
          const snapshot: RecipeRulesStateSnapshot = {
            baseRules,
            finalSellRules,
            rulesByRecipe: state.rulesByRecipe,
            countsByRecipe: state.countsByRecipe,
            keys: state.keys,
            substatTargetsKey: state.substatTargetsKey,
            mergedRules: state.mergedRules,
            truncatedRecipeIndices: state.truncatedRecipeIndices,
            totalLimitHit: state.totalLimitHit,
            excludedByTotalLimitIndices: state.excludedByTotalLimitIndices,
          }
          setRecipeRulesState(snapshot)
          keepOverrideAppliedStateRef.current = {
            baseRules,
            rulesByRecipe: state.rulesByRecipe,
            finalSellRules,
          }
          safeguardStructureSigRef.current = safeguardStructureSig
          const matchMap = new Map<number, TesterMatchWorkerItemResult>()
          for (const entry of matches) {
            if (!entry) continue
            matchMap.set(entry.itemId, entry)
          }
          const rows: TesterPreviewRow[] = []
          const artifactEntries = testerPreviewArtifacts.map((artifact, idx) => [getArtifactItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
          for (const [itemId, artifact] of artifactEntries) {
            if (!artifact) continue
            const matchEntry = matchMap.get(itemId)
            const match = toPreviewMatch(matchEntry?.firstMatch ?? null, state.mergedRules)
            const baseMatch = toPreviewMatch(matchEntry?.firstNonExcludedMatch ?? null, state.mergedRules)
            rows.push({
              artifact,
              match,
              baseMatch,
              matchingRecipeIndices: matchEntry?.matchingRecipeIndices ?? [],
              matchingRecipeDecisions: matchEntry?.matchingRecipeDecisions ?? [],
            })
          }
          setTesterPreviewRows(sortTesterRows(rows))
          setGearEntriesCommittedBuildId(requestToken)
          setGearEntriesActiveBuildId(requestToken)
          // Collect Safeguards item keys for the tab-level grid filter.
          const uniqueKeys = new Set<number>()
          if (safeguardDetection?.entries) {
            for (const entry of safeguardDetection.entries) {
              if (!entry) continue
              for (const key of entry.itemKeys) uniqueKeys.add(key)
            }
          }
          setSafeguardDetection(safeguardDetection ?? null)
          setSafeguardGroupItemKeys(uniqueKeys)
          // Persist the latest worker-acknowledged fingerprints so the next patch knows which
          // artifacts can be skipped safely.
          lastCommittedArtifactFingerprintsRef.current = nextArtifactFingerprints
          safeguardScanAppliedRef.current = safeguardDetection
            ? fingerprintSafeguardDetection(safeguardDetection)
            : null
          lastPipelineSignatureRef.current = { fingerprint: nextFingerprint, artifactSig: pipelineArtifactSignature }
          lastRecipeNamesRef.current = recipeNamesForBuild
          lastSafeguardLabelSignatureRef.current = safeguardLabelSignature
          if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
          const totalCustomRules = Array.from(state.countsByRecipe.values()).reduce((acc, val) => (
            acc + (Number.isFinite(val) ? Number(val) : 0)
          ), 0)
          // Rare restore edge: if nothing built but recipes exist, force a fresh warm+match once.
          const shouldRetryWarm = baseRules.length === 0
            && totalCustomRules === 0
            && recipesForPipeline.length > 0
            && !recoverMissingRulesRef.current
          if (shouldRetryWarm) {
            recoverMissingRulesRef.current = true
            // Force a full warm/match pass so restored recipes cannot get stuck empty.
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
                if (abortController.signal.aborted) {
                  // Clear reuse fingerprints when the active retry run is cancelled.
                  if (requestToken === rulesBuildingTokenRef.current) {
                    lastPipelineSignatureRef.current = null
                    lastCommittedArtifactFingerprintsRef.current = new Map()
                    lastWarmFingerprintRef.current = null
                  }
                  return
                }
                if (requestToken !== rulesBuildingTokenRef.current) return
                recoverMissingRulesRef.current = false
                lastWarmFingerprintRef.current = retryResult.fingerprint ?? null
                // Re-run the success handler with the retried payload.
                const {
                  state: retryState,
                  matches: retryMatches,
                  safeguardDetection: retrySafeguardDetection,
                } = retryResult
                const splitRetry = splitMergedRules(retryState.mergedRules)
                setRecipeRulesState({
                  baseRules: splitRetry.baseRules,
                  finalSellRules: splitRetry.finalSellRules,
                  rulesByRecipe: retryState.rulesByRecipe,
                  countsByRecipe: retryState.countsByRecipe,
                  keys: retryState.keys,
                  substatTargetsKey: retryState.substatTargetsKey,
                  mergedRules: retryState.mergedRules,
                  truncatedRecipeIndices: retryState.truncatedRecipeIndices,
                  totalLimitHit: retryState.totalLimitHit,
                  excludedByTotalLimitIndices: retryState.excludedByTotalLimitIndices,
                })
                keepOverrideAppliedStateRef.current = {
                  baseRules: splitRetry.baseRules,
                  rulesByRecipe: retryState.rulesByRecipe,
                  finalSellRules: splitRetry.finalSellRules,
                }
                safeguardStructureSigRef.current = safeguardStructureSig
                const retryMap = new Map<number, TesterMatchWorkerItemResult>()
                for (const entry of retryMatches) retryMap.set(entry.itemId, entry)
                const retryRows: TesterPreviewRow[] = []
                const entries = testerPreviewArtifacts.map((artifact, idx) => [getArtifactItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
                for (const [itemId, artifact] of entries) {
                  if (!artifact) continue
                  const matchEntry = retryMap.get(itemId)
                  const match = toPreviewMatch(matchEntry?.firstMatch ?? null, retryState.mergedRules)
                  const baseMatch = toPreviewMatch(matchEntry?.firstNonExcludedMatch ?? null, retryState.mergedRules)
                  retryRows.push({
                    artifact,
                    match,
                    baseMatch,
                    matchingRecipeIndices: matchEntry?.matchingRecipeIndices ?? [],
                    matchingRecipeDecisions: matchEntry?.matchingRecipeDecisions ?? [],
                  })
                }
                setTesterPreviewRows(sortTesterRows(retryRows))
                setGearEntriesCommittedBuildId(requestToken)
                setGearEntriesActiveBuildId(requestToken)
                const retryUniqueKeys = new Set<number>()
                if (retrySafeguardDetection?.entries) {
                  for (const entry of retrySafeguardDetection.entries) {
                    if (!entry) continue
                    for (const key of entry.itemKeys) retryUniqueKeys.add(key)
                  }
                }
                setSafeguardDetection(retrySafeguardDetection ?? null)
                setSafeguardGroupItemKeys(retryUniqueKeys)
                safeguardScanAppliedRef.current = retrySafeguardDetection
                  ? fingerprintSafeguardDetection(retrySafeguardDetection)
                  : null
                // Retry path accepts the same snapshot, so propagate the pending fingerprints as well.
                lastCommittedArtifactFingerprintsRef.current = nextArtifactFingerprints
                lastPipelineSignatureRef.current = { fingerprint: nextFingerprint, artifactSig: pipelineArtifactSignature }
                lastRecipeNamesRef.current = recipeNamesForBuild
                lastSafeguardLabelSignatureRef.current = safeguardLabelSignature
              })
              .catch(() => {
                // Never keep stale signature/fingerprint snapshots after a failed retry.
                if (requestToken === rulesBuildingTokenRef.current) {
                  lastPipelineSignatureRef.current = null
                  lastCommittedArtifactFingerprintsRef.current = new Map()
                  lastWarmFingerprintRef.current = null
                }
              })
            return
          }
          recoverMissingRulesRef.current = false
        })
        .catch(() => {
          // Never keep stale signature/fingerprint snapshots after a failed/aborted run.
          if (requestToken === rulesBuildingTokenRef.current) {
            lastPipelineSignatureRef.current = null
            lastCommittedArtifactFingerprintsRef.current = new Map()
            lastWarmFingerprintRef.current = null
          }
        })
        .finally(() => {
          if (requestToken !== rulesBuildingTokenRef.current) return
          setRulesBuilding(false)
          setGearEntriesBuilding(false)
          setRulesBuildProgress(null)
          setGearEntriesProgress(null)
        })
    }

    // Debounce pipeline launches to avoid restarting on every keystroke/recipe tweak.
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
    ruleRecipes,
    ruleRecipesForPreview,
    recipeNames,
    metasets,
    metasetsForPreview,
    effectiveSubstatTargets,
    substatTargetsForPreview,
    hsf,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    resolvedSafeguardRules,
    recipeModes,
    recipeModesForPreview,
    testerPreviewArtifacts,
    testerArtifactsSignature,
    recipeNamesForPreview,
    getArtifactItemId,
    buildRulesFingerprint,
    fingerprintSafeguardRuleList,
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
  const setBuilder = React.useCallback((next: React.SetStateAction<BuilderRecipe>) => {
    setBuilderState(prev => {
      const resolved = typeof next === 'function'
        ? (next as (value: BuilderRecipe) => BuilderRecipe)(prev)
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
  // Track explicit selection scroll requests so preview auto-scroll stays intentional.
  // Why: endpoint updates re-render selections without user intent.
  const [selectionScrollRequest, setSelectionScrollRequest] = useState<SelectionScrollRequest>(() => ({
    // Start at zero so the first explicit request increments to 1.
    token: 0,
    // Default to user so the initial value has a stable source.
    source: SELECTION_SCROLL_SOURCE_USER,
    // No target until the first explicit selection request.
    targetRecipeIdx: null,
  }))
  // Bump the request token whenever a selection should auto-scroll the preview.
  // Why: a monotonic counter lets the table ignore unrelated renders.
  const requestSelectionScroll = useCallback((source: SelectionScrollSource, targetRecipeIdx: number | null) => {
    // Increment the token so the preview sees a fresh scroll request.
    // Why: the token change is the sole trigger signal.
    setSelectionScrollRequest((prev) => ({
      // Preserve the monotonic counter to avoid reusing prior tokens.
      token: prev.token + 1,
      // Keep the source so the preview can resolve scroll precedence.
      source,
      // Stash the target so the preview scrolls to the intended recipe.
      targetRecipeIdx,
    }))
  }, [])
  const visibleRecipeIndicesRef = useRef<ReadonlySet<number> | null>(null)
  const {
    selectedRecipeIndices,
    setSelectedRecipeIndices,
    multiselectActive,
    selectionAnchor,
    prepareDragSelection,
    setHoveredRecipeIdx,
    handleRecipeHoverIdx,
    multiSelectedRecipes,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleRecipeSelect,
    handleRecipeDelete,
    handleRecipeDuplicate,
    handleRecipeMoveUp,
    handleRecipeMoveDown,
    handleRecipeMoveTop,
    handleRecipeMoveBottom,
    handleRecipeReorder,
    handleSelectAllRecipes,
    handleClearSelection,
    setSelectionAnchor,
  } = useRecipeSelection({
    customRecipes,
    setCustomRecipes,
    selectedRecipeIdx,
    setSelectedRecipeIdx: setSelectedRecipeIdxRaw,
    setBuilder,
    onWillChangeSelection: handleWillChangeSelection,
    onSelectionScrollRequest: requestSelectionScroll,
    describeNextChange: (descriptor, options) => describeNextChangeRef.current(descriptor, options),
    requestDeleteSingle: (idx) => { requestDeleteSingleForSelection(idx) },
    requestDeleteMulti: (targets) => { requestDeleteMultiForSelection(targets) },
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
    visibleRecipeIndicesRef,
  })
  const [hoverDeleteRecipes, setHoverDeleteRecipes] = useState(false)
  const deleteAllDisabled = (!customRecipes.length) || (selectedRecipeIndices.length > 1)
  const highlightDeleteRecipes = hoverDeleteRecipes && !deleteAllDisabled
  const editingRecipeIndex = useMemo(() => (
    selectedRecipeIndices.length === 1 ? selectedRecipeIndices[0]! : null
  ), [selectedRecipeIndices])
  const [previewSelectedRecipeIdx, setPreviewSelectedRecipeIdx] = useState<number | null>(selectedRecipeIdx)
  useEffect(() => {
    startTransition(() => {
      setPreviewSelectedRecipeIdx(selectedRecipeIdx)
    })
  }, [selectedRecipeIdx])
  const syncSelectedRecipeIdx = useCallback((value: React.SetStateAction<number | null>, options?: { preserveSelection?: boolean; forceSync?: boolean; suppressDraft?: boolean }) => {
    autoApplyNowRef.current()
    const applySelectionChange = () => {
      const next = typeof value === 'function' ? value(selectedRecipeIdx) : value
      const normalized = (typeof next === 'number' && Number.isInteger(next) && next >= 0) ? next : null
      setSelectedRecipeIdxRaw(normalized)
      setSelectionAnchor(normalized)
      if (options?.preserveSelection) return
      if (!multiselectActive || options?.forceSync === true || normalized === null) {
        setSelectedRecipeIndices(normalized === null ? [] : [normalized])
      }
    }
    if (options?.suppressDraft) {
      runWithSelectionDraftSuppressed(applySelectionChange)
    } else {
      applySelectionChange()
    }
  }, [autoApplyNowRef, multiselectActive, selectedRecipeIdx, runWithSelectionDraftSuppressed, setSelectedRecipeIdxRaw, setSelectedRecipeIndices, setSelectionAnchor])
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
    suppressNextSnapshot,
    captureSnapshotNow,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  } = useHsfcHistoryController({
    customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    hsfcNote,
    selectedRecipeIdx,
    selectedRecipeIndices,
    selectionAnchor,
    builder,
    builderNameDraft: '',
    builderNameDraftKey: null,
    multiEditDraft: multiEditDraftState ?? null,
    setCustomRecipes,
    setMetasets,
    setSubstatTargets,
    setFinalSellRemainder,
    setSafeguardRules,
    setSafeguardsEnabled,
    setHsfcNote,
    setSelectedRecipeIdx: setSelectedRecipeIdxRaw,
    setSelectedRecipeIndices,
    setSelectionAnchor,
    setBuilder,
    setBuilderNameDraft: () => {},
    setBuilderNameDraftKey: () => {},
    setMultiEditDraft: setMultiEditDraftState,
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
    autoApplySelectedRecipe,
  })
  describeNextChangeRef.current = describeNextChange
  const applyRecipeOverridesToRecipes = useCallback((instructions: RecipeOverridesInstructions) => {
    // Compute the updated recipes once so list + builder sync with one payload.
    const prev = customRecipesRef.current
    // Apply the runtime recipe overrides instructions to the stored recipes.
    const next = applyRecipeOverrides(prev, instructions)
    // Track which recipes changed and how many export modes flipped.
    const changedIndices: number[] = []
    let enableCount = 0
    let disableCount = 0
    next.forEach((recipe, idx) => {
      const previousRecipe = prev[idx]
      if (!previousRecipe || recipe === previousRecipe) return
      changedIndices.push(idx)
      if (previousRecipe.exportMode !== recipe.exportMode) {
        if (recipe.exportMode === 'active') enableCount += 1
        if (recipe.exportMode === 'disabled') disableCount += 1
      }
    })
    // Skip state updates when nothing changed.
    if (changedIndices.length === 0) {
      describeNextChange(null)
      return
    }
    // Persist the updated list so future edits start from the applied values.
    setCustomRecipes(next)
    // Sync the builder when the selected recipe changed under the overrides.
    if (selectedRecipeIdx !== null) {
      const nextSelected = next[selectedRecipeIdx]
      const prevSelected = prev[selectedRecipeIdx]
      if (nextSelected && nextSelected !== prevSelected) {
        setBuilder(nextSelected)
      }
    }
    // Record the recipe overrides apply in history for undo/redo.
    const labels = changedIndices
      .map((idx) => {
        const recipe = next[idx]
        return recipe ? snapshotRecipeLabel(idx, recipe) : null
      })
      .filter((label): label is ReturnType<typeof snapshotRecipeLabel> => Boolean(label))
    const descriptor = createRecipeOverridesAppliedDescriptor({
      labels,
      enableCount,
      disableCount,
    })
    describeNextChange(descriptor)
  }, [describeNextChange, selectedRecipeIdx, setBuilder, setCustomRecipes])

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
    const descriptor = createSubstatTargetsChangeDescriptor({ previous, next, mode })
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
      ? createSubstatTargetsChangeDescriptor({ previous: baseline, next, mode: aggregateMode })
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
  }, [describeNextChange, substatTargets, substatTargetsDialogOpen, setSubstatTargets])
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
    const changed = !areFinalSellSettingsEqual(prevState, resolvedNextState)
    const descriptor = changed
      ? createFinalSellChangeDescriptor({
        previous: prevState,
        next: resolvedNextState,
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
    const aggregateDescriptor = createFinalSellChangeDescriptor({
      previous: baseline,
      next: resolvedNextState,
      mode: aggregateMode,
    })
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
  }, [describeNextChange, setFinalSellRemainder])
  const applySafeguardsEnabledChange = useCallback((
    value: React.SetStateAction<boolean>,
    options?: { publish?: boolean },
  ): void => {
    // Keep the toggle change labeled so history never falls back to unnamed snapshots.
    setSafeguardsEnabled((prev) => {
      // Resolve the next value so we can compare and label the transition.
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value
      // Skip no-op toggles so history stays clean.
      if (prev === next) return prev
      // Build the history descriptor before mutating state.
      const descriptor = createSafeguardsEnabledChangeDescriptor({
        previousEnabled: prev,
        nextEnabled: next,
        rules: safeguardRules,
      })
      // Allow callers to suppress history when needed.
      if (options?.publish === false) return next
      // Emit the descriptor so the toggle action is labeled.
      describeNextChange(descriptor ?? null)
      return next
    })
  }, [describeNextChange, safeguardRules, setSafeguardsEnabled])
  const applySafeguardRulesChange = useCallback((
    value: React.SetStateAction<SafeguardRule[]>,
    options?: { mode?: 'edit' | 'reset'; publish?: boolean },
  ): void => {
    // Snapshot safeguard rules with structured tooltip lines for history.
    setSafeguardRules((prev) => {
      // Resolve the next rules list so we can diff against the previous state.
      const next = typeof value === 'function' ? (value as (p: SafeguardRule[]) => SafeguardRule[])(prev) : value
      // Reordering keeps rule contents intact, so compare ID order explicitly.
      const orderChanged = isSafeguardRuleOrderChanged(prev, next)
      // Describe the rule changes so history stays informative.
      const descriptor = createSafeguardsRulesChangeDescriptor({
        previous: prev,
        next,
        metasets,
        mode: options?.mode ?? 'edit',
      })
      // Skip no-op updates so we do not add empty history entries.
      if (!descriptor && !orderChanged) return prev
      // Allow callers to suppress history when needed.
      if (options?.publish === false || !descriptor) return next
      // Emit the descriptor so the rule edit is labeled in history.
      describeNextChange(descriptor)
      return next
    })
  }, [describeNextChange, metasets, setSafeguardRules])
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
  type GearDbCommandToastState = {
    // Severity controls alert color and icon.
    severity: 'success' | 'error'
    // Plain-text copy for legacy command notifications.
    message?: string
    // Rich diff payload for endpoint updates.
    diff?: GearDbDiffToastPayload
  }
  const [gearDbCommandToast, setGearDbCommandToast] = useState<GearDbCommandToastState | null>(null)
  // Small helper centralizes toast creation so every command path feels consistent.
  const showGearDbCommandToast = useCallback((message: string, severity: 'success' | 'error') => {
    // Clear any prior diff payload so text stays compact.
    setGearDbCommandToast({ message, severity })
  }, [])
  // Diff toasts carry rich UI payloads instead of plain strings.
  const showGearDbDiffToast = useCallback((payload: GearDbDiffToastPayload) => {
    // Force success styling so the diff list stays readable.
    setGearDbCommandToast({ severity: 'success', diff: payload })
  }, [])
  // Shared closer lets timers and manual dismissals reuse a single path.
  const dismissGearDbCommandToast = useCallback(() => {
    // Clear the live toast so it does not linger between updates.
    setGearDbCommandToast(null)
    // Cancel any pending diff payloads still waiting on a rebuild.
    gearDbDiffToastPendingRef.current = null
  }, [])
  // Session-only endpoint update history (latest appended at the end).
  const [gearDbDiffHistory, setGearDbDiffHistory] = useState<GearDbDiffHistoryEntry[]>([])
  // Monotonic id keeps menu rendering stable across app updates.
  const gearDbDiffHistoryIdRef = useRef(0)
  // Append helper centralizes history entry creation for every endpoint update.
  const appendGearDbDiffHistory = useCallback((params: {
    lineSpecs: GearDbDiffHistoryLineSpec[]
    entries: GearDbDiffToastEntry[]
    overflowCount: number
    createdAt: number
  }) => {
    // Increment once so ids stay monotonic for the session.
    const nextId = gearDbDiffHistoryIdRef.current + 1
    gearDbDiffHistoryIdRef.current = nextId
    // Store a capped copy of the diff so history mirrors the toast surface.
    setGearDbDiffHistory((prev) => ([
      ...prev,
      {
        id: nextId,
        createdAt: params.createdAt,
        lineSpecs: params.lineSpecs,
        entries: params.entries,
        overflowCount: params.overflowCount,
      },
    ]))
  }, [])
  // Clear history on demand; session-only state should reset instantly.
  const clearGearDbDiffHistory = useCallback(() => {
    setGearDbDiffHistory([])
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
  // History toast toggle keeps endpoint updates quiet without hiding status badges.
  const [hideGearDbUpdateToast, setHideGearDbUpdateToast] = useState(false)
  // Toggle helper keeps the checkbox handler stable for the header menu.
  const toggleHideGearDbUpdateToast = useCallback((next: boolean) => {
    setHideGearDbUpdateToast(next)
  }, [])
  const formatFileFormatErrorMessage = useCallback((fileName?: string | null) => {
    const trimmed = (fileName ?? '').trim()
    if (!trimmed) {
      return t('fileFormatErrorMessage', { fileName: t('fileFormatErrorUnknownName') })
    }
    const truncated = trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed
    return t('fileFormatErrorMessage', { fileName: `“${truncated}”` })
  }, [t])
  const buildGearDbHistoryHeaderLines = useCallback((lineSpecs: GearDbDiffHistoryLineSpec[]) => {
    // Use the shared formatter so history + toast text stay aligned.
    return formatGearDbDiffHistoryLines(lineSpecs, t)
  }, [t])
  const appendGearDbTimestampLineSpec = useCallback((
    lineSpecs: GearDbDiffHistoryLineSpec[],
    queuedAt: number,
  ): GearDbDiffHistoryLineSpec[] => {
    // Preserve the existing ordering so "Received" always stays last.
    return [...lineSpecs, { kind: 'timestamp', at: queuedAt }]
  }, [])
  const buildGearDbCommandMessages = useCallback((lineSpecs: GearDbDiffHistoryLineSpec[]) => {
    // Build header lines once so tooltip + toast copy match exactly.
    const headerLines = buildGearDbHistoryHeaderLines(lineSpecs)
    // Keep the tooltip multi-line while keeping the toast compact.
    const tooltipMessage = headerLines.join('\n\n')
    const toastMessage = headerLines.join('\n')
    return { headerLines, tooltipMessage, toastMessage }
  }, [buildGearDbHistoryHeaderLines])
  // Keep a single pending diff so rapid endpoint updates collapse into the latest toast.
  const gearDbDiffToastPendingRef = useRef<{
    // Monotonic id for the queued payload.
    requestId: number
    // Build id used to detect when the tester grid has updated.
    baselineBuildId: number
    // Timestamp captured when the update was queued.
    queuedAt: number
    // Structured header specs so history stays localizable.
    lineSpecs: GearDbDiffHistoryLineSpec[]
    // Capped diff entries before match enrichment.
    entries: GearDbDiffEntry[]
    // Count of omitted entries beyond the cap.
    overflowCount: number
    // Matches captured before applying the dataset update.
    matchesBefore: Map<number, TesterPreviewMatch | null>
  } | null>(null)
  // Monotonic id used to cancel stale pending payloads.
  const gearDbDiffToastRequestIdRef = useRef(0)
  // Build a stable match map keyed by artifact id so before/after comparisons line up.
  const buildMatchMapByArtifactId = useCallback((rows: TesterPreviewRow[]): Map<number, TesterPreviewMatch | null> => {
    // Map rows by id so add/remove/update comparisons are stable.
    const map = new Map<number, TesterPreviewMatch | null>()
    for (const row of rows) {
      const id = Number(row.artifact?.id ?? NaN)
      if (!Number.isFinite(id) || id <= 0) continue
      map.set(id, row.match ?? null)
    }
    return map
  }, [])
  // Queue a diff toast so we can enrich it with match results after the rebuild completes.
  const queueGearDbDiffToast = useCallback((params: {
    lineSpecs: GearDbDiffHistoryLineSpec[]
    entries: GearDbDiffEntry[]
    queuedAt: number
  }) => {
    // Capture the shared timestamp so history + toast stay aligned.
    const queuedAt = params.queuedAt
    // Localize header lines once for the pending toast payload.
    const headerLines = buildGearDbHistoryHeaderLines(params.lineSpecs)
    // Empty diffs can show immediately without waiting on matches.
    if (params.entries.length === 0) {
      // No per-item diff means we can show the header immediately.
      if (!hideGearDbUpdateToast) {
        showGearDbDiffToast({ headerLines, lineSpecs: params.lineSpecs, entries: [], overflowCount: 0 })
      }
      // Skip history entries when nothing changed so the list stays meaningful.
      return
    }
    // Cap the stored entries so history only retains what the UI can display.
    const cappedEntries = params.entries.slice(0, GEAR_DB_DIFF_TOAST_MAX_ITEMS)
    const overflowCount = Math.max(0, params.entries.length - cappedEntries.length)
    // Advance the request id so stale updates do not leak through.
    const requestId = gearDbDiffToastRequestIdRef.current + 1
    gearDbDiffToastRequestIdRef.current = requestId
    // Capture the current build id so we can wait for the next commit.
    gearDbDiffToastPendingRef.current = {
      requestId,
      baselineBuildId: gearEntriesCommittedBuildIdRef.current,
      queuedAt,
      lineSpecs: params.lineSpecs,
      entries: cappedEntries,
      overflowCount,
      // Snapshot matches before the gear list is rebuilt.
      matchesBefore: buildMatchMapByArtifactId(testerPreviewRowsRef.current),
    }
  }, [buildGearDbHistoryHeaderLines, buildMatchMapByArtifactId, hideGearDbUpdateToast, showGearDbDiffToast])
  // Wait for the tester grid to commit so diff toasts can capture match details.
  useEffect(() => {
    const pending = gearDbDiffToastPendingRef.current
    // Nothing queued means nothing to render.
    if (!pending) return
    // Ignore stale entries if a newer diff request superseded this one.
    if (pending.requestId !== gearDbDiffToastRequestIdRef.current) return
    // Wait until the tester grid has committed a new build for the update.
    if (gearEntriesBuildingRef.current) return
    // Ignore commits that predate the queued diff request.
    if (gearEntriesCommittedBuildIdRef.current <= pending.baselineBuildId) return
    // Map current preview rows so matches line up with the diff entries.
    const matchesAfter = buildMatchMapByArtifactId(testerPreviewRowsRef.current)
    // Enrich each diff entry with before/after match info.
    const enriched: GearDbDiffToastEntry[] = pending.entries.map((entry) => ({
      ...entry,
      beforeMatch: pending.matchesBefore.get(entry.id) ?? null,
      afterMatch: matchesAfter.get(entry.id) ?? null,
    }))
    // Carry the overflow count from the queued diff so history stays consistent.
    const overflowCount = pending.overflowCount
    // Localize header lines now that the diff is ready to render.
    const headerLines = buildGearDbHistoryHeaderLines(pending.lineSpecs)
    // Store the capped diff in the session history menu.
    appendGearDbDiffHistory({
      lineSpecs: pending.lineSpecs,
      entries: enriched,
      overflowCount,
      createdAt: pending.queuedAt,
    })
    // Commit the toast payload now that matches are current.
    // Honor the history menu toggle when showing endpoint success toasts.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!hideGearDbUpdateToast) {
      showGearDbDiffToast({
        headerLines,
        lineSpecs: pending.lineSpecs,
        entries: enriched,
        overflowCount,
      })
    }
    // Clear the queue so the toast does not re-render.
    gearDbDiffToastPendingRef.current = null
  }, [
    appendGearDbDiffHistory,
    buildGearDbHistoryHeaderLines,
    buildMatchMapByArtifactId,
    gearEntriesCommittedBuildId,
    hideGearDbUpdateToast,
    showGearDbDiffToast,
    testerPreviewRows,
  ])
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
  // Safeguards tab consumes this to select + expand the requested safeguard rule.
  const [logicHubSafeguardFocusRequest, setLogicHubSafeguardFocusRequest] = useState<SafeguardFocusRequest | null>(null)
  const logicHubSafeguardFocusTokenRef = useRef(0)
  // Rule Tester consumes this to expand + scroll to a targeted artifact card.
  const [testerArtifactFocusRequest, setTesterArtifactFocusRequest] = useState<TesterArtifactFocusRequest | null>(null)
  const testerArtifactFocusTokenRef = useRef(0)
  const theme = useTheme()
  // Track preview paper width so keep-override grids can match Rule Tester cards.
  const previewPaperRef = useRef<HTMLDivElement | null>(null)
  // Cache the latest width so ResizeObserver churn stays minimal.
  const previewPaperWidthRef = useRef<number | null>(null)
  const [previewPaperWidthPx, setPreviewPaperWidthPx] = useState<number | null>(null)
  useLayoutEffect(() => {
    const node = previewPaperRef.current
    if (!node) return
    const measure = () => {
      const nextWidth = measureCssWidth(node)
      if (!Number.isFinite(nextWidth) || nextWidth <= 0) return
      if (previewPaperWidthRef.current === nextWidth) return
      previewPaperWidthRef.current = nextWidth
      setPreviewPaperWidthPx(nextWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(() => { measure() })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  // Keep-override grids match the Rule Tester card width; cache the latest 4-column measurement.
  const [testerCardWidthMeasuredPx, setTesterCardWidthMeasuredPx] = useState<number | null>(null)
  const [testerGridScrollbarWidthPx, setTesterGridScrollbarWidthPx] = useState<number>(0)
  // Ref prevents width churn from triggering redundant state updates.
  const testerCardWidthRef = useRef<number | null>(null)
  const handleTesterCardWidthMeasured = useCallback((widthPx: number) => {
    // Ignore invalid measurements so we never collapse the keep-override grid.
    if (!Number.isFinite(widthPx) || widthPx <= 0) return
    // Normalize to two decimals to align with grid width math.
    const normalizedWidth = Math.round(widthPx * 100) / 100
    if (testerCardWidthRef.current === normalizedWidth) return
    testerCardWidthRef.current = normalizedWidth
    setTesterCardWidthMeasuredPx(normalizedWidth)
  }, [])
  // Resolve a fallback card width from the preview panel even when the tester view is hidden.
  const previewPaperPaddingPx = useMemo(
    () => parseSpacingPx(theme.spacing(PREVIEW_PAPER_PADDING_UNITS)),
    [theme],
  )
  const testerGridGapPx = useMemo(
    () => parseSpacingPx(theme.spacing(TESTER_GRID_COLUMN_GAP_UNITS)),
    [theme],
  )
  const testerGridContainerPaddingEndPx = useMemo(
    () => parseSpacingPx(theme.spacing(TESTER_GRID_CONTAINER_PADDING_END_UNITS)),
    [theme],
  )
  const testerGridRowPaddingPx = useMemo(
    () => parseSpacingPx(theme.spacing(TESTER_GRID_ROW_PADDING_UNITS)),
    [theme],
  )
  const testerCardWidthFromPanelPx = useMemo(
    () => resolveTesterCardWidthPx({
      panelWidthPx: previewPaperWidthPx,
      panelPaddingPx: previewPaperPaddingPx,
      containerPaddingInlineEndPx: testerGridContainerPaddingEndPx,
      scrollbarWidthPx: testerGridScrollbarWidthPx,
      gridGapPx: testerGridGapPx,
      rowPaddingPx: testerGridRowPaddingPx,
      columnCount: KEEP_OVERRIDE_REFERENCE_COLUMN_COUNT,
    }),
    [
      previewPaperPaddingPx,
      previewPaperWidthPx,
      testerGridContainerPaddingEndPx,
      testerGridScrollbarWidthPx,
      testerGridGapPx,
      testerGridRowPaddingPx,
    ],
  )
  const resolvedTesterCardWidthPx = testerCardWidthMeasuredPx ?? testerCardWidthFromPanelPx
  const flushTransientUi = useCallback(() => {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } catch {}
  }, [])
  const handleCloseLogicHub = useCallback(() => {
    // Closing the dialog should also clear any pending one-shot safeguard focus request.
    setLogicHubOpen(false)
    setLogicHubSafeguardFocusRequest(null)
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
	  const clearTesterSubstatSort = testerSubstatSortPrefs.clear
	  // Normalized overlay presets are reused by the Sort popout (shared presets + overwrite behavior).
	  const testerNormalizedOverlayPrefs = useTesterGridNormalizedOverlayPreferences()
	  const testerSubstatSortSpec = useMemo(() => {
	    const priorities = testerSubstatSortPrefs.state.priorities
	    const excludeGlyphs = testerSubstatSortPrefs.state.excludeGlyphs
	    const selectedSubstats = priorities.filter((key) => Number(key) !== TESTER_SORT_KEY_LAST_USAGE) as StatVariant[]
	    // Custom scoring spec mirrors the Sort popout's current selection + weights.
	    const customScoreSpec = selectedSubstats.length > 0
	      ? {
	          variants: selectedSubstats,
	          excludeGlyphs,
	          weights: testerSubstatSortPrefs.state.weights,
	        }
	      : null

	    const presets = testerNormalizedOverlayPrefs.state.presets
	    const presetScoreSpecs = testerSubstatSortPrefs.state.normalizedSourcePresetIds
	      .map((presetId) => presets[presetId])
	      .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
	      .map((preset) => ({
	        variants: preset.variants,
	        weights: preset.weights,
	        excludeGlyphs,
	      }))

	    const overlayActive = testerNormalizedOverlayPrefs.state.useSortWeights
	      || testerNormalizedOverlayPrefs.state.enabledPresetIds.length > 0

	    const activeOverlayScoreSpecs = (() => {
	      // "Use active" means normalized sort mirrors whatever the tester-grid overlay is currently showing.
	      if (!testerSubstatSortPrefs.state.normalizedUseActiveOverlay) return []
	      if (!overlayActive) return []
	      if (testerNormalizedOverlayPrefs.state.useSortWeights) {
	        // Overlay [S] uses the current Sort popout state (custom selection + weights).
	        return customScoreSpec ? [customScoreSpec] : []
	      }
	      return testerNormalizedOverlayPrefs.state.enabledPresetIds
	        .map((presetId) => presets[presetId])
	        .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
	        .map((preset) => ({
	          variants: preset.variants,
	          weights: preset.weights,
	          excludeGlyphs,
	        }))
	    })()

	    const localScoreSpecs = (() => {
	      // Local sources are controlled in the Sort popout ("[C]" + preset toggles).
	      const out: Array<{ variants: StatVariant[]; weights: Partial<Record<StatVariant, number>>; excludeGlyphs: boolean }> = []
	      if (testerSubstatSortPrefs.state.normalizedSourceIncludeCustom && customScoreSpec) {
	        out.push(customScoreSpec)
	      }
	      presetScoreSpecs.forEach((spec) => out.push(spec))
	      return out
	    })()

	    const normalizedScoreSpecs = testerSubstatSortPrefs.state.normalizedUseActiveOverlay
	      ? activeOverlayScoreSpecs
	      : localScoreSpecs
	    const normalizedAllowed = normalizedScoreSpecs.length > 0
	    const normalizedEffective = testerSubstatSortPrefs.state.normalized && normalizedAllowed

	    // Sorting can be active via priorities (classic mode) or via normalized specs (preset-only mode).
	    const hasAnySort = priorities.length > 0 || normalizedEffective
	    if (!hasAnySort) return null

	    return {
	      priorities,
	      direction: testerSubstatSortPrefs.state.direction,
	      flipped: testerSubstatSortPrefs.state.flipped,
	      excludeGlyphs,
	      normalized: normalizedEffective,
	      // Weights are included even when normalized is off so overlay [S] can still read them.
	      weights: testerSubstatSortPrefs.state.weights,
	      ...(normalizedEffective ? { normalizedScoreSpecs } : {}),
	    }
	  }, [
	    testerNormalizedOverlayPrefs.state.enabledPresetIds,
	    testerNormalizedOverlayPrefs.state.presets,
	    testerNormalizedOverlayPrefs.state.useSortWeights,
	    testerSubstatSortPrefs.state.direction,
	    testerSubstatSortPrefs.state.excludeGlyphs,
	    testerSubstatSortPrefs.state.flipped,
	    testerSubstatSortPrefs.state.normalized,
	    testerSubstatSortPrefs.state.normalizedSourceIncludeCustom,
	    testerSubstatSortPrefs.state.normalizedSourcePresetIds,
	    testerSubstatSortPrefs.state.normalizedUseActiveOverlay,
	    testerSubstatSortPrefs.state.priorities,
	    testerSubstatSortPrefs.state.weights,
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
  const [limitRecipesToFiltered, setLimitRecipesToFiltered] = useState<boolean>(false)
  const [testerRecipeFilterMode, setTesterRecipeFilterMode] = useState<TesterRecipeFilterMode>(TESTER_RECIPE_FILTER_MODE_DEFAULT)
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
      limitRecipesToFiltered: Boolean(limitRecipesToFiltered),
      testerRecipeFilterMode,
      testerSubstatSort: testerSubstatSortPrefs.state,
      views,
    }
  }, [
    filterCollapsedByMode,
    filterOpenByMode,
    filtersSynced,
    limitRecipesToFiltered,
    previewMode,
    rulesFilterByMode,
    testerRecipeFilterMode,
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
    setLimitRecipesToFiltered(Boolean(snap.limitRecipesToFiltered))
    setTesterRecipeFilterMode(snap.testerRecipeFilterMode)
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
    setLimitRecipesToFiltered,
    setTesterRecipeFilterMode,
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
    rulesFilterPanelRef.current?.focusRecipeNameInput()
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
        rulesFilterPanelRef.current?.focusRecipeNameInput()
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
  // Keep an HTTP-compatible base for optional download paths.
  const pushEndpointHttpBase = useMemo(
    () => (pushEndpoint ? coerceWsEndpointToHttp(pushEndpoint) : null),
    [pushEndpoint],
  )
  const [pushEndpointReachable, setPushEndpointReachableState] = useState(() => Boolean(pushEndpoint))
  const setPushEndpointReachable = useCallback((next: boolean) => {
    setPushEndpointReachableState((prev) => (prev === next ? prev : next))
  }, [])

  const handleConfirmClearAll = useCallback(() => {
    const descriptor = createRecipesClearedDescriptor(customRecipes.length)
    describeNextChange(descriptor)
    setCustomRecipes([])
    syncSelectedRecipeIdx(null, { forceSync: true, suppressDraft: true })
    markNextSnapshotAsSaved()
    exportBaselineResetRef.current = true
  }, [customRecipes.length, describeNextChange, markNextSnapshotAsSaved, setCustomRecipes, syncSelectedRecipeIdx])
  const handleConfirmDeleteSingle = useCallback((idx: number) => {
    setCustomRecipes(prev => {
      if (idx < 0 || idx >= prev.length) {
        describeNextChange(null)
        return prev
      }
      const descriptor = createRecipesDeletedDescriptor({
        removed: [{ index: idx, recipe: prev[idx] }],
        metasets,
      })
      describeNextChange(descriptor)
      return prev.filter((_, i) => i !== idx)
    })
    syncSelectedRecipeIdx((sel) => {
      if (sel === null) return sel
      if (sel === idx) return null
      if (sel > idx) return sel - 1
      return sel
    }, { suppressDraft: true })
  }, [describeNextChange, metasets, setCustomRecipes, syncSelectedRecipeIdx])
  const handleDeleteMultiConfirmed = useCallback((targetsParam: number[] | null) => {
    // Use the snapshot captured when opening the dialog so confirmation matches the displayed list.
    const source = Array.isArray(targetsParam) && targetsParam.length > 0
      ? targetsParam
      : selectedRecipeIndices
    if (!source.length) return
    const uniqueTargets = Array.from(new Set(source.filter((idx) => Number.isInteger(idx) && idx >= 0))).sort((a, b) => a - b)
    if (!uniqueTargets.length) return
    const deleteSet = new Set(uniqueTargets)
    setCustomRecipes(prev => {
      if (deleteSet.size === 0) {
        describeNextChange(null)
        return prev
      }
      const removed = uniqueTargets.map((idx) => ({ index: idx, recipe: prev[idx] }))
      const descriptor = createRecipesDeletedDescriptor({ removed, metasets })
      describeNextChange(descriptor)
      return prev.filter((_, i) => !deleteSet.has(i))
    })
    syncSelectedRecipeIdx(null, { forceSync: true, suppressDraft: true })
  }, [describeNextChange, metasets, selectedRecipeIndices, setCustomRecipes, syncSelectedRecipeIdx])
  const hsfcDialogs = useHsfcDialogs({
    customRecipeCount: customRecipes.length,
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
  // Track when the note dialog opened automatically from an HSFC import.
  // Why: auto-opened notes should hide the "Edit Note & Recipe Overrides…" button.
  const [noteAutoOpenedFromHsfc, setNoteAutoOpenedFromHsfc] = useState(false)
  // Manual openers reset the auto-open flag so the edit entry point returns.
  const openNoteEditorManual = useCallback(() => {
    setNoteAutoOpenedFromHsfc(false)
    openNoteEditor()
  }, [openNoteEditor, setNoteAutoOpenedFromHsfc])
  // Manual view opens should also clear auto-open gating.
  const openNoteViewerManual = useCallback(() => {
    setNoteAutoOpenedFromHsfc(false)
    openNoteViewer()
  }, [openNoteViewer, setNoteAutoOpenedFromHsfc])
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
    // Closing ends the auto-open session so later opens behave normally.
    setNoteAutoOpenedFromHsfc(false)
    closeNote()
  }, [closeNote, setNoteAutoOpenedFromHsfc])

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
    // Persist the updated note content immediately.
    setHsfcNote(() => nextNormalized)
    // Keep recipe overrides answers aligned with the current note markers.
    // Why: answers are session-only, so imports reset them while edits prune stale entries.
    setNoteRecipeOverridesAnswers((prev) => {
      // Imports never carry answers, so clear them.
      if (mode === 'import') return {}
      // Prune or reset answers based on the new note content.
      return nextNormalized ? pruneNoteRecipeOverridesAnswers(nextNormalized, prev) : {}
    })
    const descriptor = createNoteChangeDescriptor({
      previous: prevNormalized,
      next: nextNormalized,
      mode,
    })
    if (options?.publish === false) {
      noteHistorySessionRef.current = 'idle'
      noteSessionBaselineRef.current = null
      noteSessionModeRef.current = null
      return descriptor
    }
    const baseline = noteSessionBaselineRef.current ?? prevNormalized ?? null
    const aggregateMode = noteSessionModeRef.current ?? mode
    const aggregateDescriptor = createNoteChangeDescriptor({
      previous: baseline,
      next: nextNormalized ?? null,
      mode: aggregateMode,
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
  }, [describeNextChange, hsfcNote, noteMode, noteOpen, setHsfcNote, setNoteRecipeOverridesAnswers])


  const tutorial = useTutorialCoachState({
    hsf,
    setHsf,
    customRecipes,
    setCustomRecipes,
    selectedRecipeIdx,
    setSelectedRecipeIdx: syncSelectedRecipeIdx,
    metasets,
    setMetasets,
    substatTargets,
    setSubstatTargets,
    finalSellRemainder,
    setFinalSellRemainder,
    logicHubDialogTab,
    setLogicHubDialogTab,
    safeguardRules,
    setSafeguardRules,
    safeguardsEnabled,
    setSafeguardsEnabled,
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
    suppressHistorySnapshot: suppressNextSnapshot,
    t,
  })

  // Compute a stable key for recipes that affects HSF rule generation (ignores display-only fields like `name`).
  // Why: Changing the recipe name should not cause a refresh of the Sellfile Preview table.
  const recipeRuleFingerprints = recipeRulesState.keys
  const ruleSubstatTargetsKey = recipeRulesState.substatTargetsKey

  const rulesByRecipe = recipeRulesState.rulesByRecipe
  const recipeRuleCounts = recipeRulesState.countsByRecipe
  const mergedRules = recipeRulesState.mergedRules
  const mergedRulesRef = useRef(mergedRules)
  useEffect(() => { mergedRulesRef.current = mergedRules }, [mergedRules])
  const truncatedRecipeIndices = recipeRulesState.truncatedRecipeIndices
  const totalLimitHit = recipeRulesState.totalLimitHit
  const limitExceeded = totalLimitHit || truncatedRecipeIndices.length > 0
  const recipesExcludedByTotalLimit = useMemo(() => new Set<number>(recipeRulesState.excludedByTotalLimitIndices), [recipeRulesState.excludedByTotalLimitIndices])

  // Apply safeguard rules immediately when fresh detection snapshots arrive.
  useEffect(() => {
    // Exit early when the safeguard feature is off.
    if (!keepOverridesActive) return
    // Require a detection snapshot before injecting safeguard rules.
    if (safeguardsActive && (!safeguardDetection || !safeguardDetectionSignature)) return
    // Skip redundant applications when both detection fingerprints and rule sources match.
    const applied = keepOverrideAppliedStateRef.current
    const baseRulesRef = recipeRulesState.baseRules
    const rulesByRecipeRef = recipeRulesState.rulesByRecipe
    const finalSellRulesRef = recipeRulesState.finalSellRules
    const uniqueApplied = !safeguardsActive
      || safeguardDetectionSignature === safeguardScanAppliedRef.current
    const alreadyApplied = (
      uniqueApplied
      && applied.baseRules === baseRulesRef
      && applied.rulesByRecipe === rulesByRecipeRef
      && applied.finalSellRules === finalSellRulesRef
    )
    if (alreadyApplied) return
    // Rebuild the merge list with keep-override rules at the front so matches see them.
    setRecipeRulesState((prev) => {
      // Flatten customs once; helpers handle dedupe + injection.
      const flattenedCustoms: HsfRuleWithRecipe[] = []
      for (let idx = 0; idx < prev.keys.length; idx += 1) {
        const segment = prev.rulesByRecipe.get(idx)
        if (!segment || segment.length === 0) continue
        flattenedCustoms.push(...segment)
      }
      const safeguardResult = prependSafeguardRules({
        baseRules: prev.baseRules,
        customRules: flattenedCustoms,
        finalSellRules: prev.finalSellRules,
        resolvedSafeguardRules,
        detection: safeguardsActive ? safeguardDetection : null,
      })
      for (let i = 0; i < safeguardResult.mergedRules.length; i += 1) {
        (safeguardResult.mergedRules[i] as HsfRuleWithRecipe).__lineIdx = i
      }
      keepOverrideAppliedStateRef.current = {
        baseRules: safeguardResult.baseRules,
        rulesByRecipe: prev.rulesByRecipe,
        finalSellRules: prev.finalSellRules,
      }
      return {
        ...prev,
        baseRules: safeguardResult.baseRules,
        mergedRules: safeguardResult.mergedRules,
      }
    })
    // Record applied signatures to avoid re-applying the same snapshot.
    if (safeguardsActive && safeguardDetectionSignature) {
      safeguardScanAppliedRef.current = safeguardDetectionSignature
    }
  }, [
    keepOverridesActive,
    safeguardsActive,
    safeguardDetection,
    safeguardDetectionSignature,
    resolvedSafeguardRules,
    recipeRulesState.baseRules,
    recipeRulesState.rulesByRecipe,
    recipeRulesState.finalSellRules,
    setRecipeRulesState,
  ])
  const selectedIsDirty = useMemo(() => {
    if (selectedRecipeIdx === null) return false
    const target = customRecipes[selectedRecipeIdx]
    if (!target) return false
    return hasRecipeMeaningfulDifferences(builder, target, ruleSubstatTargetsKey)
  }, [builder, customRecipes, ruleSubstatTargetsKey, selectedRecipeIdx])

  const builderUiDirty = multiselectActive && multiEditDraftState
    ? getDirtyBuilderFieldKeys(multiEditDraftState.fields).length > 0
    : selectedIsDirty

  const computeDraftHistoryDescriptor = useCallback((): HistoryEntryDescriptor => {
    if (multiselectActive && selectedRecipeIndices.length > 1) {
      const labels = selectedRecipeIndices
        .map((idx) => {
          const recipe = customRecipes[idx]
          return recipe ? snapshotRecipeLabel(idx, recipe) : { index: idx, name: null }
        })
      return { kind: 'builderDraft', mode: 'multi', labels }
    }
    if (editingRecipeIndex !== null && editingRecipeIndex >= 0 && editingRecipeIndex < customRecipes.length) {
      const recipe = customRecipes[editingRecipeIndex]
      if (recipe) {
        return { kind: 'builderDraft', mode: 'recipe', label: snapshotRecipeLabel(editingRecipeIndex, recipe) }
      }
    }
    return { kind: 'builderDraft', mode: 'builder' }
  }, [customRecipes, editingRecipeIndex, multiselectActive, selectedRecipeIndices])

  selectionGuardRef.current = (_prevSelection, _nextSelection) => {
    if (!builderUiDirty) return
    // Skip draft snapshots when the caller signalled that a recipe-changing action already captured intent.
    if (selectionDraftSuppressionDepthRef.current > 0) return
    if (captureSnapshotNow) {
      const descriptor = computeDraftHistoryDescriptor()
      // Force the next payload change to append so the draft snapshot stays in history.
      captureSnapshotNow(descriptor, { forceAppend: true })
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
    () => buildHsfFileFromMerged(exportRules, { recipeNames }),
    [exportRules, recipeNames],
  )
  const buildDedupedExportPayload = useCallback(() => (
    buildDedupedHsfFileFromMerged(exportRules, { recipeNames })
  ), [recipeNames, exportRules])
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

  // Dev-only helper: bundle the builder recipe and its expanded HSF rules (with preview line numbers).
  const copyRecipeWithRulesDev = React.useCallback(async (idx: number) => {
    if (!isDevBuild) return
    const recipe = customRecipes[idx]
    if (!recipe) return
    const readable = buildReadableRecipe(recipe, metasets)
    const builderSnapshot = JSON.parse(JSON.stringify(recipe)) as BuilderRecipe
    const rulesForRecipe = mergedRules
      .map((rule, ruleIdx) => ({ rule, ruleIdx }))
      .filter(({ rule }) => getRuleRecipeIndex(rule) === idx)
      .map(({ rule, ruleIdx }) => {
        const { __lineIdx: _omitLineIdx, __allKnownSets: _omitAllKnownSets, __source: _omitSource, ...rest } = rule as HsfRuleWithRecipe & { __allKnownSets?: boolean }
        const sanitized = JSON.parse(JSON.stringify(rest)) as HsfRule
        const line = typeof rule.__lineIdx === 'number' ? (rule.__lineIdx + 1) : (ruleIdx + 1)
        return { line, rule: sanitized }
      })
    const payload = {
      recipeNumber: idx + 1,
      name: recipe.name ?? null,
      builderRecipe: builderSnapshot,
      readableRecipe: readable,
      previewLines: rulesForRecipe.map(r => r.line),
      rules: rulesForRecipe,
    }
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
  }, [customRecipes, metasets, mergedRules, setCopyDlgOpen, setCopyText])

  


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
      testerRecipeFilterMode,
    }
  }, [filterOpenByMode, rulesFilterByMode, filterCollapsedByMode, previewMode, testerRecipeFilterMode])

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
    recipes: customRecipes,
    finalSellRemainder,
    selectedRecipeIndex: selectedRecipeIdx,
    note: hsfcNote,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    filters: autosaveFiltersState,
    testerSort: testerSubstatSortPrefs.state,
    safeguardRules,
    safeguardsEnabled,
    logicHubDialogTab,
    safeguardsGridFilterMode,
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
  const restoreSortDiffer = Boolean(restoreDraft && Object.prototype.hasOwnProperty.call(restoreDraft, 'TesterSort'))
  const filtersResetRef = useRef(false)
  useLayoutEffect(() => {
    if (!restoreDialogPending || !restoreDraft?.Filters || !restoreFiltersDiffer) return
    if (filtersResetRef.current) return
    filtersResetRef.current = true
    resetRulesFilterPreferences()
    setTesterRecipeFilterMode('off')
  }, [restoreDialogPending, restoreDraft, restoreFiltersDiffer, setTesterRecipeFilterMode])
  const sortResetRef = useRef(false)
  useLayoutEffect(() => {
    if (!restoreDialogPending || !restoreSortDiffer) return
    if (sortResetRef.current) return
    sortResetRef.current = true
    // Match the filter restore UX: default to a known baseline unless the user explicitly restores.
    clearTesterSubstatSort()
  }, [clearTesterSubstatSort, restoreDialogPending, restoreSortDiffer])
  useEffect(() => {
    if (!restoreDialogPending) filtersResetRef.current = false
  }, [restoreDialogPending])
  useEffect(() => {
    if (!restoreDialogPending) sortResetRef.current = false
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
    // Snapshot the current tester preview so command pushes can diff against it.
    const previousTesterSnapshots = source === 'command'
      ? snapshotGearDbDataset({
        snapshotId: null,
        champions: new Map(),
        lastUsed: new Map(),
        artifacts: new Map(
          testerPreviewArtifacts
            .filter((artifact) => Number.isFinite(Number(artifact.id)) && Number(artifact.id) > 0)
            .map((artifact) => [Number(artifact.id), artifact]),
        ),
        inboxArtifacts: new Map(),
      })
      : new Map()
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
      // Manual imports show the inventory count so inbox items read as a separate add-on.
      const inventoryCount = Math.max(0, totalCount - inboxCount)
      // Manual toasts keep the longer phrasing for clarity outside endpoint updates.
      // Manual imports only track adds/removals, so updated stays at zero.
      const diffSummary = t('toastGearDbDiffSummary', { added: addedCount, removed: removedCount, updated: 0 })
      const importSummary = inboxCount > 0
        ? t('toastGearDbImportedShortWithInbox', { count: inventoryCount, inboxCount })
        : t('toastGearDbImportedShort', { count: totalCount })
      if (source === 'command') {
        // Snapshot the imported dataset so we can compute a command diff preview.
        const nextSnapshots = snapshotGearDbDataset({
          snapshotId: null,
          champions: new Map(),
          lastUsed: new Map(),
          artifacts: new Map(artifacts.map((artifact) => [artifact.id, artifact])),
          inboxArtifacts: new Map(inboxArtifacts.map((artifact) => [artifact.id, artifact])),
        })
        const diffDetails = buildGearDbDiffSummary(previousTesterSnapshots, nextSnapshots)
        // Capture a shared timestamp so toast + history stay aligned.
        const queuedAt = Date.now()
        // Build structured header specs so history can re-localize later.
        const lineSpecs = appendGearDbTimestampLineSpec([
          { kind: 'import', totalCount, inboxCount },
          {
            // Use snapshot diff counts so summary lines mirror the toast entries.
            kind: 'diff',
            addedCount: diffDetails.addedCount,
            removedCount: diffDetails.removedCount,
            updatedCount: diffDetails.updatedCount,
          },
        ], queuedAt)
        // Build the tooltip copy from the structured line specs.
        const { tooltipMessage } = buildGearDbCommandMessages(lineSpecs)
        setGearDbCommandError(null)
        setGearDbCommandSuccess(tooltipMessage)
        queueGearDbDiffToast({
          lineSpecs,
          entries: diffDetails.entries,
          queuedAt,
        })
      } else {
        const message = `${importSummary} ${diffSummary}`
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
    appendGearDbTimestampLineSpec,
    buildGearDbCommandMessages,
    formatFileFormatErrorMessage,
    setGearDbCommandError,
    setGearDbCommandSuccess,
    applyGearDbDiff,
    beginTesterMatchReset,
    dismissGearDbCommandToast,
    showGearDbCommandToast,
    queueGearDbDiffToast,
    testerPreviewArtifacts,
    beginGearImport,
    endGearImport,
  ])

  // Accepts the raw snapshot payload pushed by the helper and rewires the tester queue.
  const handleGearDbRawSnapshot = useCallback((command: GearDbRawSnapshotCommand) => {
    // Capture the previous dataset so we can compute before/after diffs.
    const previousDataset = gearDbRawDatasetRef.current
    // Snapshot the previous artifacts to diff against the incoming snapshot.
    const previousSnapshots = previousDataset ? snapshotGearDbDataset(previousDataset) : new Map()
    // Flag the import as busy so UI controls can reflect the update.
    beginGearImport()
    // Clear prior command results so the new push owns the status line.
    setGearDbCommandError(null)
    setGearDbCommandSuccess(null)
    // Clear any live toast so the diff payload can replace it.
    dismissGearDbCommandToast()
    try {
      // Normalize the raw rows into the canonical tester dataset before diffing.
      const { dataset, testerItems, artifactCount, inboxCount } = createDatasetFromSnapshot(command)
      // Snapshot the incoming dataset so we can compute per-item diffs.
      const nextSnapshots = snapshotGearDbDataset(dataset)
      // Build the per-item diff list for the endpoint toast.
      const diffDetails = buildGearDbDiffSummary(previousSnapshots, nextSnapshots)
      // Persist the dataset so future deltas can apply correctly.
      gearDbRawDatasetRef.current = dataset
      // Diff the tester queue so only net changes are enqueued.
      const { removedCount, addedCount } = applyGearDbDiff(testerItems)
      if (removedCount > 0 || addedCount > 0) {
        // Rebuild tester matches when the queue changed.
        beginTesterMatchReset('gearDb')
      }
      // Empty snapshots should still show a clear error status.
      const totalCount = artifactCount + inboxCount
      if (totalCount === 0) {
        const emptyMessage = t('toastGearDbImportEmpty')
        setGearDbCommandError(emptyMessage)
        setGearDbCommandSuccess(null)
        showGearDbCommandToast(emptyMessage, 'error')
        return
      }
      // Build summary specs for the header and the status badge.
      // Capture a shared timestamp so badge + history remain in sync.
      const queuedAt = Date.now()
      // Build structured header specs so history stays localizable.
      const lineSpecs = appendGearDbTimestampLineSpec([
        { kind: 'import', totalCount, inboxCount },
        {
          // Use snapshot diff counts so summary lines mirror the toast entries.
          kind: 'diff',
          addedCount: diffDetails.addedCount,
          removedCount: diffDetails.removedCount,
          updatedCount: diffDetails.updatedCount,
        },
      ], queuedAt)
      // Build the tooltip copy from the structured line specs.
      const { tooltipMessage } = buildGearDbCommandMessages(lineSpecs)
      // Update the header indicator with the full tooltip summary.
      setGearDbCommandError(null)
      setGearDbCommandSuccess(tooltipMessage)
      // Queue the rich toast payload so matches can be attached later.
      queueGearDbDiffToast({
        lineSpecs,
        entries: diffDetails.entries,
        queuedAt,
      })
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
    appendGearDbTimestampLineSpec,
    buildGearDbCommandMessages,
    dismissGearDbCommandToast,
    endGearImport,
    formatFileFormatErrorMessage,
    queueGearDbDiffToast,
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
    // Mark the import as busy so controls can show progress.
    beginGearImport()
    // Clear prior status so the delta owns the indicators.
    setGearDbCommandError(null)
    setGearDbCommandSuccess(null)
    // Drop the live toast so the diff payload can take over.
    dismissGearDbCommandToast()
    try {
      // Limit diff work to artifact rows touched by the delta.
      const touchedIds = collectGearDbDeltaArtifactIds(command)
      // Snapshot the affected items before mutating the dataset.
      const previousSnapshots = touchedIds.size > 0 ? snapshotGearDbDataset(dataset, touchedIds) : new Map()
      // Apply the mutation set to the cached dataset, then regenerate the tester payload.
      const { testerItems } = applyDeltaToDataset(dataset, command)
      // Snapshot the affected items after the delta so we can diff.
      const nextSnapshots = touchedIds.size > 0 ? snapshotGearDbDataset(dataset, touchedIds) : new Map()
      // Build the per-item diff list for the endpoint toast.
      const diffDetails = buildGearDbDiffSummary(previousSnapshots, nextSnapshots)
      // Apply the gear diff so only net changes hit the tester queue.
      const { removedCount, addedCount } = applyGearDbDiff(testerItems)
      if (removedCount > 0 || addedCount > 0) {
        // Rebuild tester matches when the queue changed.
        beginTesterMatchReset('gearDb')
      }
      // Capture a shared timestamp so badge + history remain aligned.
      const queuedAt = Date.now()
      // Build structured header specs so history stays localizable.
      const lineSpecs = appendGearDbTimestampLineSpec([
        {
          // Use snapshot diff counts so summary lines mirror the toast entries.
          kind: 'diff',
          addedCount: diffDetails.addedCount,
          removedCount: diffDetails.removedCount,
          updatedCount: diffDetails.updatedCount,
        },
      ], queuedAt)
      // Build the tooltip copy from the structured line specs.
      const { tooltipMessage } = buildGearDbCommandMessages(lineSpecs)
      setGearDbCommandError(null)
      // Update the badge tooltip so users see the latest status.
      setGearDbCommandSuccess(tooltipMessage)
      // Queue the toast payload to render after match rebuild.
      queueGearDbDiffToast({
        lineSpecs,
        entries: diffDetails.entries,
        queuedAt,
      })
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
    appendGearDbTimestampLineSpec,
    buildGearDbCommandMessages,
    dismissGearDbCommandToast,
    endGearImport,
    formatFileFormatErrorMessage,
    queueGearDbDiffToast,
    setGearDbCommandError,
    setGearDbCommandSuccess,
    showGearDbCommandToast,
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
    handleRecipePasteAfter,
    handleCopyAllRecipes,
    handleCopyRecipe,
    handlePasteAtEnd,
    prepareHsfcImport,
    finalizeImport,
  } = useHsfcClipboard({
    metasets,
    substatTargets,
    customRecipes,
    hsfcNote,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    selectedRecipeIdx,
    selectedRecipeIndices,
    describeNextChange,
    t,
    setCustomRecipes,
    setMetasets,
    applySubstatTargetsChange,
    applyFinalSellChange,
    applyNoteChange,
    setSafeguardRules,
    setSafeguardsEnabled,
    setSelectedRecipeIdx: syncSelectedRecipeIdx,
    setSelectedRecipeIndices,
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
    if (!selectedRecipeIndices.length) return
    if (selectedRecipeIndices.length === 1) {
      requestDeleteSingleRef.current(selectedRecipeIndices[0]!)
    } else {
      requestDeleteMultiRef.current(selectedRecipeIndices.slice())
    }
  }, [selectedRecipeIndices])

  const handleRulesTableSelectRecipeIdx = useCallback((idx: number) => {
    syncSelectedRecipeIdx((prev) => (idx >= 0 && idx < customRecipes.length ? idx : prev), { forceSync: true })
    if (idx < 0 || idx >= customRecipes.length) return
    const recipe = customRecipes[idx]
    if (!recipe) return
    setBuilder(recipe)
  }, [customRecipes, setBuilder, syncSelectedRecipeIdx])

  const handleRulesTableRecipeAction = useCallback(async (idx: number, action: 'duplicate' | 'delete' | 'copy' | 'paste_after' | 'move_top' | 'move_bottom' | 'move_up' | 'move_down') => {
    if (action === 'duplicate') {
      setCustomRecipes(prev => {
        const base = prev[idx]
        if (!base) {
          // Avoid noisy history entries when the target row is missing.
          describeNextChange(null)
          return prev
        }
        // Duplicate via clone so downstream selection sees a unique object.
        const copy: BuilderRecipe = cloneBuilderRecipe(base)
        // Build the next list so the descriptor can compute insertion details.
        const arr = [...prev]
        // Compute the insertion index before mutating order.
        const insertIdx = insertIndexAfter(arr, idx)
        // Insert the clone into the list.
        arr.splice(insertIdx, 0, copy)
        // Snapshot the insertion location + label for history.
        const labels = [snapshotRecipeLabel(insertIdx, copy)]
        // Describe the duplicate action for history/undo.
        const descriptor = createRecipesDuplicatedDescriptor({
          labels,
          location: buildInsertionLocation(insertIdx, prev),
        })
        // Publish the descriptor so history matches the recipe list behavior.
        describeNextChange(descriptor)
        return arr
      })
      return
    }
    if (action === 'delete') {
      setCustomRecipes(prev => {
        const removed = [{ index: idx, recipe: prev[idx] }]
        // Describe the delete action to keep history aligned with chip menus.
        const descriptor = createRecipesDeletedDescriptor({ removed, metasets })
        // Publish the descriptor so undo/redo shows the deleted recipe.
        describeNextChange(descriptor)
        return prev.filter((_, i) => i !== idx)
      })
      syncSelectedRecipeIdx((sel) => {
        if (sel === null) return sel
        if (sel === idx) return null
        if (sel > idx) return sel - 1
        return sel
      }, { suppressDraft: true })
      return
    }
    if (action === 'copy') {
      try {
        const recipe = customRecipes[idx]
        if (!recipe) return
        const readable = buildReadableRecipe(recipe, metasets)
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
      setCustomRecipes(prev => {
        if (idx === 0) return prev
        const arr = [...prev]
        const current = arr[idx]
        if (!current) return prev
        arr.splice(idx, 1)
        arr.unshift(current)
        // Describe the move using the shared recipe move descriptor.
        const descriptor = createRecipesMovedDescriptor({
          direction: 'top',
          labels: [snapshotRecipeLabel(0, arr[0]!)],
        })
        // Publish the descriptor so history matches chip actions.
        describeNextChange(descriptor)
        syncSelectedRecipeIdx((sel) => sel === null ? sel : (sel === idx ? 0 : (sel < idx ? sel : sel)), { suppressDraft: true })
        return arr
      })
      return
    }
    if (action === 'move_bottom') {
      setCustomRecipes(prev => {
        if (idx === prev.length - 1) return prev
        const arr = [...prev]
        const current = arr[idx]
        if (!current) return prev
        arr.splice(idx, 1)
        arr.push(current)
        // Describe the move using the shared recipe move descriptor.
        const descriptor = createRecipesMovedDescriptor({
          direction: 'bottom',
          labels: [snapshotRecipeLabel(arr.length - 1, arr[arr.length - 1]!)],
        })
        // Publish the descriptor so history matches chip actions.
        describeNextChange(descriptor)
        syncSelectedRecipeIdx((sel) => sel === null ? sel : (sel === idx ? arr.length - 1 : (sel > idx ? sel : sel)), { suppressDraft: true })
        return arr
      })
      return
    }
    if (action === 'move_up') {
      setCustomRecipes(prev => {
        if (idx === 0) return prev
        const arr = [...prev]
        if (!arr[idx - 1] || !arr[idx]) return prev
        const tmp = arr[idx - 1]!
        arr[idx - 1] = arr[idx]!
        arr[idx] = tmp
        // Describe the move using the shared recipe move descriptor.
        const descriptor = createRecipesMovedDescriptor({
          direction: 'up',
          labels: [snapshotRecipeLabel(idx - 1, arr[idx - 1]!)],
        })
        // Publish the descriptor so history matches chip actions.
        describeNextChange(descriptor)
        syncSelectedRecipeIdx((sel) => sel === null ? sel : sel === idx ? idx - 1 : sel === idx - 1 ? idx : sel, { suppressDraft: true })
        return arr
      })
      return
    }
    if (action === 'move_down') {
      setCustomRecipes(prev => {
        if (idx === prev.length - 1) return prev
        const arr = [...prev]
        if (!arr[idx + 1] || !arr[idx]) return prev
        const tmp = arr[idx + 1]!
        arr[idx + 1] = arr[idx]!
        arr[idx] = tmp
        // Describe the move using the shared recipe move descriptor.
        const descriptor = createRecipesMovedDescriptor({
          direction: 'down',
          labels: [snapshotRecipeLabel(idx + 1, arr[idx + 1]!)],
        })
        // Publish the descriptor so history matches chip actions.
        describeNextChange(descriptor)
        syncSelectedRecipeIdx((sel) => sel === null ? sel : sel === idx ? idx + 1 : sel === idx + 1 ? idx : sel, { suppressDraft: true })
        return arr
      })
      return
    }
  }, [customRecipes, describeNextChange, insertIndexAfter, metasets, pasteAfterIndex, setCopyDlgOpen, setCopyText, setCustomRecipes, syncSelectedRecipeIdx])

  const handleRulesTableClearBase = useCallback(() => { setHsf(null) }, [setHsf])
  const handleRulesTableEditFinalSell = useCallback(() => { setLogicHubOpen(true) }, [setLogicHubOpen])
  const handleResetSafeguards = useCallback(() => {
    // Reset Safeguards to an empty list and log a single history snapshot.
    const nextRules = buildDefaultSafeguardRules()
    const descriptor = createSafeguardsRulesChangeDescriptor({
      previous: safeguardRules,
      next: nextRules,
      metasets,
      mode: 'reset',
    })
    describeNextChange(descriptor ?? null)
    setSafeguardRules(nextRules)
    setSafeguardsEnabled(false)
  }, [describeNextChange, safeguardRules, metasets, setSafeguardRules, setSafeguardsEnabled])
  const handleResetGearTesterItems = useCallback(() => {
    // Treat manual resets like a full gear-db refresh so matcher + safeguard detection clear immediately.
    beginTesterMatchReset('gearDb')
    setTesterItems([])
  }, [beginTesterMatchReset, setTesterItems])


  // Build autosave payload and write via useAutosave (enabled after restore choice)
  // Autosave should not be triggered by selection-only changes.
  // Pass selectedRecipeIndex: null in autosave payload so selection changes
  // do not alter the payload. Explicit Save/Copy flows still include it.
  const trimmedHsfcNote = typeof hsfcNote === 'string' ? hsfcNote.trim() : ''
  const autosaveBuildParams = useMemo(() => ({
    version: APP_VERSION,
    metasets,
    substatTargets,
    recipes: customRecipes,
    finalSellRemainder,
    selectedRecipeIndex: null,
    ...(trimmedHsfcNote ? { note: trimmedHsfcNote } : {}),
    safeguardRules,
    safeguardsEnabled,
  }), [
    customRecipes,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    metasets,
    substatTargets,
    trimmedHsfcNote,
  ])
  const { payload: autosaveBasePayload } = useDeferredHsfcPayload(autosaveBuildParams)
  const autosavePayload = useMemo(() => {
    const filtersPayload = areAutosaveFiltersDefault(autosaveFiltersState) ? null : autosaveFiltersState
    const testerSortPayload = isDefaultTesterSubstatSortState(testerSubstatSortPrefs.state)
      ? null
      : testerSubstatSortPrefs.state
    // Persist recipe overrides answers in autosave only when non-empty.
    const recipeOverridesPayload = Object.keys(noteRecipeOverridesAnswers).length > 0
      ? noteRecipeOverridesAnswers
      : null
    // Persist recipe overrides disabled flag only when turned off.
    const recipeOverridesDisabledPayload = noteRecipeOverridesDisabled ? true : null
    return {
      ...autosaveBasePayload,
      LogicHubDialogTab: logicHubDialogTab, // Persist the active tab so the dialog re-opens where the user left off.
      SafeguardsGridFilterMode: safeguardsGridFilterMode,
      AutosaveSavedAt: new Date().toISOString(),
      ...(recipeOverridesPayload ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: recipeOverridesPayload } : {}),
      ...(recipeOverridesDisabledPayload ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
      ...(filtersPayload ? { Filters: filtersPayload } : {}),
      ...(testerSortPayload ? { TesterSort: testerSortPayload } : {}),
    }
  }, [
    autosaveBasePayload,
    autosaveFiltersState,
    logicHubDialogTab,
    safeguardsGridFilterMode,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    testerSubstatSortPrefs.state,
  ])
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
  const filterResult = useMemo<FilterHsfRulesResult<HsfRuleWithRecipe>>(() => (
    filterHsfRules(mergedRules, rulesFilter, metasets, {
      recipeNames,
      recipeTags,
      recipeModes,
      specialRuleLabels: specialRuleSourceLabels,
    })
  ), [mergedRules, rulesFilter, metasets, recipeNames, recipeTags, recipeModes, specialRuleSourceLabels])
  const filteredRules = filterResult.rules
  const testerFilterResult = useMemo(() => (
    filterTesterItems(testerPreviewRows, testerRulesFilter, metasets, {
      recipeNames,
      recipeTags,
      specialRuleLabels: specialRuleSourceLabels,
    })
  ), [testerPreviewRows, testerRulesFilter, metasets, recipeNames, recipeTags, specialRuleSourceLabels])
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
  const testerRecipeFilterActive = testerRecipeFilterMode !== 'off' && selectedRecipeIndices.length > 0
  const testerRecipeFilterSelectedSet = useMemo<Set<number> | null>(() => {
    if (!testerRecipeFilterActive) return null
    if (!selectedRecipeIndices.length) return null
    return new Set(selectedRecipeIndices)
  }, [testerRecipeFilterActive, selectedRecipeIndices])
  const gearEntriesForTable = useMemo(() => {
    let rows: TesterPreviewRow[] = gearEntriesAfterRulesFilter
    if (testerRecipeFilterSelectedSet && testerRecipeFilterSelectedSet.size > 0) {
      if (testerRecipeFilterMode === 'first') {
        rows = gearEntriesAfterRulesFilter.filter((row) => {
          const recipeIdx = row.match?.recipeIdx
          return recipeIdx != null && testerRecipeFilterSelectedSet.has(recipeIdx)
        })
      } else {
        rows = gearEntriesAfterRulesFilter.filter((row) => {
          const matches = row.matchingRecipeIndices ?? []
          for (const recipeIdx of matches) {
            if (testerRecipeFilterSelectedSet.has(recipeIdx)) return true
          }
          return false
        })
      }
    }
    return sortTesterRows(rows)
  }, [testerRecipeFilterMode, testerRecipeFilterSelectedSet, gearEntriesAfterRulesFilter])
  // Summarize the filtered tester rows so the preview chip mirrors the grid contents.
  const testerOutcomeSummaryForPreview = useMemo(
    () => buildTesterOutcomeSummary(gearEntriesForTable),
    [gearEntriesForTable],
  )
  const hasManualTesterRows = useMemo(() => (
    testerPreviewRows.some((row) => row.artifact.source === 'tester')
  ), [testerPreviewRows])
  const suppressTesterMatchDetails = testerMatchDetailsFrozen
    || gearEntriesBuilding
  const testerBuilding = gearEntriesBuilding || rulesBuilding
  const matchingRecipeIndices = filterResult.matchingRecipeIndices
  const testerMatchingRecipeIndices = testerFilterResult.matchingRecipeIndices
  const chipMatchingRecipeIndices = previewMode === 'tester'
    ? testerMatchingRecipeIndices
    : matchingRecipeIndices
  const filterActive = isRulesFilterActive(rulesFilter)
  const testerFilterActive = isRulesFilterActive(testerRulesFilter, { includeTesterRange: true })
  const previewFilterActive = previewMode === 'tester'
    ? (testerFilterActive || testerRecipeFilterActive)
    : (filterActive || testerRecipeFilterActive)
  const filtersDirty = (previewMode === 'tester' ? testerFilterActive : filterActive)
    || limitRecipesToFiltered
    || testerRecipeFilterMode !== TESTER_RECIPE_FILTER_MODE_DEFAULT
  const hsfRulesForTable = useMemo(() => {
    const baseRules = filterActive ? filteredRules : mergedRules
    if (!testerRecipeFilterSelectedSet || testerRecipeFilterSelectedSet.size === 0) return baseRules
    return baseRules.filter((rule) => {
      const recipeIdx = getRuleRecipeIndex(rule)
      return recipeIdx !== null && testerRecipeFilterSelectedSet.has(recipeIdx)
    })
  }, [filterActive, filteredRules, mergedRules, testerRecipeFilterSelectedSet])
  const hsfRulesForTableRef = useRef(hsfRulesForTable)
  useEffect(() => { hsfRulesForTableRef.current = hsfRulesForTable }, [hsfRulesForTable])
  const hsfTableEmptyDueToFilters = (filterActive || testerRecipeFilterActive) && mergedRules.length > 0 && hsfRulesForTable.length === 0
  const testerArtifactIdBySafeguardItemKey = useMemo(() => {
    const byItemKey = new Map<number, number>()
    for (const row of testerPreviewRows) {
      const artifactId = Number(row.artifact?.id)
      if (!Number.isFinite(artifactId)) continue
      const itemKey = getSafeguardItemKey(row.artifact)
      if (!Number.isFinite(itemKey)) continue
      if (!byItemKey.has(itemKey)) {
        byItemKey.set(itemKey, artifactId)
      }
    }
    return byItemKey
  }, [testerPreviewRows])
  const openLogicHubSafeguardRule = useCallback((ruleId: string): boolean => {
    const normalizedRuleId = typeof ruleId === 'string' ? ruleId.trim() : ''
    if (normalizedRuleId.length === 0) return false
    // Safeguard jumps should not leave a stale tester focus request queued.
    setTesterArtifactFocusRequest(null)
    logicHubSafeguardFocusTokenRef.current += 1
    setLogicHubSafeguardFocusRequest({
      ruleId: normalizedRuleId,
      token: logicHubSafeguardFocusTokenRef.current,
    })
    setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_SAFEGUARDS)
    setLogicHubOpen(true)
    return true
  }, [setLogicHubDialogTab, setLogicHubOpen])
  const handleSafeguardPreviewStarSelect = useCallback((selection: SafeguardStarSelection) => {
    const normalizedRuleId = typeof selection.safeguardRuleId === 'string' ? selection.safeguardRuleId.trim() : ''
    // Missing ids can happen with malformed/legacy rows; still route users into Safeguards.
    if (normalizedRuleId.length === 0) {
      setTesterArtifactFocusRequest(null)
      setLogicHubSafeguardFocusRequest(null)
      setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_SAFEGUARDS)
      setLogicHubOpen(true)
      return
    }
    // Prefer the clicked row's concrete item-key so we can scroll directly to it in Rule Tester.
    const clickedItemKey = (
      typeof selection.safeguardItemKey === 'number'
      && Number.isFinite(selection.safeguardItemKey)
    )
      ? selection.safeguardItemKey
      : null
    // Row-specific routing: placeholder rows (or rows without item keys) should never jump to unrelated gear.
    const clickedRowHasConcreteItem = selection.isPlaceholder !== true && clickedItemKey != null
    if (!clickedRowHasConcreteItem) {
      openLogicHubSafeguardRule(normalizedRuleId)
      return
    }
    // Concrete rows should jump only to the exact backing artifact referenced by that row's item key.
    const targetArtifactId = testerArtifactIdBySafeguardItemKey.get(clickedItemKey) ?? null
    if (targetArtifactId != null) {
      // Concrete safeguards have real gear to inspect, so jump to Rule Tester immediately.
      setLogicHubSafeguardFocusRequest(null)
      setLogicHubOpen(false)
      setPreviewMode('tester')
      testerArtifactFocusTokenRef.current += 1
      setTesterArtifactFocusRequest({
        artifactId: targetArtifactId,
        token: testerArtifactFocusTokenRef.current,
      })
      return
    }
    // No real gear was resolved for this safeguard, so open Safeguards editing.
    openLogicHubSafeguardRule(normalizedRuleId)
  }, [openLogicHubSafeguardRule, setLogicHubDialogTab, setLogicHubOpen, setPreviewMode, testerArtifactIdBySafeguardItemKey])
  const handleTesterFocusArtifactFilteredOut = useCallback(() => {
    // Keep the notification short because this only explains why auto-scroll did not occur.
    showToast(t('toastTesterFocusArtifactFiltered'), { icon: <HelpOutlineIcon fontSize="inherit" /> })
  }, [showToast, t])
  const handleTesterRuleView = useCallback((ruleIndex: number, recipeIdx: number | null) => {
    setTesterArtifactFocusRequest(null)
    const targetRule = mergedRulesRef.current[ruleIndex]
    if (targetRule?.__source === RULE_SOURCE_SAFEGUARDS) {
      const safeguardRuleId = typeof targetRule.__safeguardRuleId === 'string'
        ? targetRule.__safeguardRuleId
        : ''
      // Safeguard matches should open the Safeguards tab directly instead of jumping back to preview rows.
      if (openLogicHubSafeguardRule(safeguardRuleId)) return
      // Malformed safeguard rows can miss ids; still route into Safeguards so users land on the right surface.
      setLogicHubSafeguardFocusRequest(null)
      setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_SAFEGUARDS)
      setLogicHubOpen(true)
      return
    }
    setLogicHubSafeguardFocusRequest(null)
    setLogicHubOpen(false)
    const recipeSnapshot = customRecipesRef.current
    const hasValidRecipe = recipeIdx != null && recipeIdx >= 0 && recipeIdx < recipeSnapshot.length
    if (hasValidRecipe) {
      const targetRecipeIdx = Number(recipeIdx)
      syncSelectedRecipeIdx(targetRecipeIdx, { forceSync: true })
      const recipe = recipeSnapshot[targetRecipeIdx]
      if (recipe) setBuilder(recipe)
    } else {
      setPreviewMode('rules')
    }
    try {
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
  }, [openLogicHubSafeguardRule, setBuilder, setFocusRuleIndex, setPreviewMode, setLogicHubDialogTab, setLogicHubOpen, syncSelectedRecipeIdx])
  const handleTesterRuleTemplateCreate = useCallback((row: TesterPreviewRow, intent: 'keep' | 'sell') => {
    const artifact = row.artifact
    // Build the baseline template based on level, rolls, and the item’s current stats.
    const baseRecipe = buildTesterRuleTemplateRecipe({ artifact, intent })
    // Slot label is localized via the canonical i18n keys.
    const slotLabel = t(artifactTypeI18nKey(artifact.slot))
    // Pull the localized set name when available.
    const setLabelRaw = formatTesterSetLabel({
      setId: artifact.set,
      slot: artifact.slot,
      translate: t,
      lang,
    })
    // Skip placeholder markers so unknown sets do not pollute the name.
    const setLabel = setLabelRaw.trim()
    const isSetKnown = setLabel.length > 0 && setLabel !== t('testerValueUnknown')
    // Prefix the set name with a bullet to keep the label compact.
    const setSuffix = isSetKnown ? ` • ${setLabel}` : ''
    // Combine the labels into the final recipe name.
    const name = t('testerRuleTemplateName', { slot: slotLabel, set: setSuffix }).trim()
    // Clone to ensure the new recipe has unique references for history + multi-edit.
    const nextRecipe = cloneBuilderRecipe({ ...baseRecipe, name })
    // Insert after the current selection when possible so creation feels local.
    const previous = customRecipesRef.current
    const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < previous.length)
      ? selectedRecipeIdx + 1
      : previous.length
    // Assemble the next list to preserve order + insert position.
    const nextRecipes = [
      ...previous.slice(0, insertIdx),
      nextRecipe,
      ...previous.slice(insertIdx),
    ]
    // History entries capture the inserted recipe details for undo + hover.
    const descriptor = createRecipeAddedDescriptor({
      index: insertIdx,
      recipe: nextRecipe,
      previous,
      metasets,
    })
    // Apply the mutation and focus the new chip in one gesture.
    describeNextChange(descriptor)
    setCustomRecipes(nextRecipes)
    // Sync the builder panel with the newly inserted recipe immediately.
    setBuilder(nextRecipe)
    syncSelectedRecipeIdx(insertIdx, { forceSync: true, suppressDraft: true })
  }, [describeNextChange, lang, metasets, selectedRecipeIdx, setBuilder, setCustomRecipes, syncSelectedRecipeIdx, t])
  const visibleRecipeIndices = useMemo<Set<number> | null>(() => {
    if (!limitRecipesToFiltered) return null
    const indices = new Set(chipMatchingRecipeIndices)
    if (previewMode === 'tester' && testerRecipeFilterMode === 'off') {
      customRecipes.forEach((recipe, idx) => {
        if (recipe?.exportMode === 'separator') {
          indices.add(idx)
        }
      })
    }
    return indices
  }, [chipMatchingRecipeIndices, customRecipes, limitRecipesToFiltered, previewMode, testerRecipeFilterMode])
  visibleRecipeIndicesRef.current = visibleRecipeIndices
  const selectAllLabelKey = visibleRecipeIndices ? 'chipsMenuSelectVisible' : 'chipsMenuSelectAll'
  const scrollSelectedRecipeIntoView = useCallback(() => {
    if (multiselectActive || selectedRecipeIdx === null) return
    try {
      requestAnimationFrame(() => {
        const container = chipsContainerRef.current
        if (!container) return
        const el = document.getElementById(`recipe-chip-${selectedRecipeIdx}`)
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
	          // Keep chip auto-scroll smooth to preserve the "focus follows selection" feel.
	          // Why: this is a small, bounded scroll within the chips container (not a massive virtualized jump).
	          container.scrollTo({ top: clampedTarget, behavior: 'smooth' })
	        }
	      })
	    } catch {}
	  }, [chipsContainerRef, multiselectActive, selectedRecipeIdx])
  // Keep the focused recipe chip in view as filters or list length change so keyboard navigation stays visible.
  useEffect(() => {
    scrollSelectedRecipeIntoView()
  }, [scrollSelectedRecipeIntoView, customRecipes.length, filterActive, limitRecipesToFiltered])

  const clearFilters = useCallback(() => {
    const next = JSON.parse(JSON.stringify(DEFAULT_RULES_FILTER_STATE)) as RulesFilterState
    setRulesFilter(next)
    setLimitRecipesToFiltered(false)
    setTesterRecipeFilterMode(TESTER_RECIPE_FILTER_MODE_DEFAULT)
    scrollSelectedRecipeIntoView()
  }, [scrollSelectedRecipeIntoView, setLimitRecipesToFiltered, setRulesFilter, setTesterRecipeFilterMode])
  const prevHoveredChipRef = React.useRef<number | null>(null)
  const hoverCountRef = React.useRef(customRecipes.length)
  hoverCountRef.current = customRecipes.length
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const applyChipLinkedHover = (idx: number | null, active: boolean) => {
      if (idx === null || idx < 0 || idx >= hoverCountRef.current) return
      const el = document.getElementById(`recipe-chip-${idx}`)
      if (!el) return
      el.setAttribute('data-linked-hover', active ? 'true' : 'false')
    }
    const unsubscribe = subscribeRecipeHover((idx) => {
      const max = hoverCountRef.current
      const clamped = typeof idx === 'number' && (idx < 0 || idx >= max) ? null : idx
      if (idx !== clamped) {
        setRecipeHoverIndex(clamped)
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
    const current = getRecipeHoverIndex()
    if (typeof current === 'number' && (current < 0 || current >= customRecipes.length)) {
      setRecipeHoverIndex(null)
    }
  }, [customRecipes.length])
  const colorIconSrc = React.useMemo(() => makeManageColorsIcon(), [])
  const visibleRecipeCount = useMemo(() => {
    if (visibleRecipeIndices) return visibleRecipeIndices.size
    return customRecipes.length
  }, [visibleRecipeIndices, customRecipes.length])
  const focusRuleByIndex = useCallback((ruleIndex: number): boolean => {
    if (ruleIndex < 0 || ruleIndex >= mergedRules.length) return false
    const rule = mergedRules[ruleIndex]
    if (!rule) return false
    const recipeIdx = getRuleRecipeIndex(rule)
    if (recipeIdx !== null && recipeIdx >= 0 && recipeIdx < customRecipes.length) {
      syncSelectedRecipeIdx(recipeIdx, { forceSync: true })
      const recipe = customRecipes[recipeIdx]
      if (recipe) setBuilder(recipe)
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
  }, [mergedRules, customRecipes, filterActive, filteredRules, setBuilder, syncSelectedRecipeIdx])
  const showFactionFilter = useMemo(() => {
    try { return mergedRules.some(r => r.Faction !== undefined) } catch { return false }
  }, [mergedRules])

  // Mirror preview filter matching so insert/apply warnings stay accurate.
  const evaluateRecipeAgainstFilters = useCallback((
    recipe: BuilderRecipe,
    targetIndex: number,
    names: string[],
    tags: string[][],
    modes: SellfileExportMode[],
  ): boolean => {
    try {
      const cached = rulesByRecipe.get(targetIndex)
      let rulesForRecipe: HsfRuleWithRecipe[]
      if (cached) {
        rulesForRecipe = cached
        if (recipeRuleCounts.get(targetIndex) === Number.POSITIVE_INFINITY) {
          return true
        }
      } else {
        let limitHit = false
        const effectiveRecipe = resolveRecipeOverridesEffectiveRecipe(recipe, recipeOverridesInstructions)
        rulesForRecipe = buildRulesForRecipe(
          { recipe: effectiveRecipe, metasets, substatTargets: effectiveSubstatTargets, recipeIdx: targetIndex },
          {
            limit: RULE_COUNT_LIMIT + 1,
            onLimit: () => { limitHit = true },
          },
        )
        if (limitHit) return true
      }
      // Include recipe tags so the name filter matches the same tokens as the table.
      const result = filterHsfRules(rulesForRecipe, rulesFilter, metasets, {
        recipeNames: names,
        recipeTags: tags,
        recipeModes: modes,
        specialRuleLabels: specialRuleSourceLabels,
      })
      return result.matchingRecipeIndices.has(targetIndex)
    } catch {
      return true
    }
  }, [
    recipeOverridesInstructions,
    effectiveSubstatTargets,
    metasets,
    rulesByRecipe,
    rulesFilter,
    recipeRuleCounts,
    specialRuleSourceLabels,
  ])

  const prospectiveInsertIndex = useMemo(() => (
    selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < customRecipes.length
      ? selectedRecipeIdx + 1
      : customRecipes.length
  ), [selectedRecipeIdx, customRecipes.length])

  const builderInsertMatchesRuleFilters = useMemo(() => {
    // Rule preview mode: "Preview recipes" only hides chips when a rules filter is active.
    if (!filterActive || !limitRecipesToFiltered) return true
    // When the builder matches the selected recipe verbatim, reuse the current filter evaluation.
    if (editingRecipeIndex !== null && !selectedIsDirty) {
      return matchingRecipeIndices.has(editingRecipeIndex)
    }
    // Otherwise, predict whether the inserted recipe would survive the current rules filter.
    const names = recipeNames.slice()
    names.splice(prospectiveInsertIndex, 0, builder.name ?? '')
    // Keep tag filters aligned with the name list for the insert prediction.
    const tags = recipeTags.slice()
    // Normalize builder tags so preview name filters see the same tokens.
    tags.splice(prospectiveInsertIndex, 0, normalizeRecipeTags(builder))
    const modes = recipeModes.slice()
    // Resolve recipe overrides for the builder export mode.
    const builderExportMode: SellfileExportMode = resolveRecipeOverridesExportMode(builder, recipeOverridesInstructions)
    modes.splice(prospectiveInsertIndex, 0, builderExportMode)
    // Ensure rule generation sees the same effective export mode as the filter list.
    // Clone only when the effective export mode diverges from the stored value.
    const builderForRules = builderExportMode === builder.exportMode
      ? builder
      : (() => {
          // Avoid mutating the live builder snapshot while we test filters.
          const clone = cloneBuilderRecipe(builder)
          clone.exportMode = builderExportMode
          return clone
        })()
    return evaluateRecipeAgainstFilters(builderForRules, prospectiveInsertIndex, names, tags, modes)
  }, [
    builder,
    recipeModes,
    recipeNames,
    recipeTags,
    editingRecipeIndex,
    evaluateRecipeAgainstFilters,
    filterActive,
    limitRecipesToFiltered,
    normalizeRecipeTags,
    matchingRecipeIndices,
    prospectiveInsertIndex,
    selectedIsDirty,
    recipeOverridesInstructions,
  ])

  const builderSaveMatchesRuleFilters = useMemo(() => {
    // Rule preview mode: saving only hides chips when the rules filter is active and "Preview recipes" is on.
    if (!filterActive || !limitRecipesToFiltered) return true
    // No save target => never show the Apply warning.
    if (editingRecipeIndex === null || editingRecipeIndex < 0 || editingRecipeIndex >= customRecipes.length) return true
    // Predict whether the saved recipe at its current index would survive the active rules filter.
    const names = recipeNames.slice()
    names[editingRecipeIndex] = builder.name ?? ''
    // Keep tag filters aligned with the name list for the save prediction.
    const tags = recipeTags.slice()
    // Normalize builder tags so preview name filters see the same tokens.
    tags[editingRecipeIndex] = normalizeRecipeTags(builder)
    const modes = recipeModes.slice()
    // Resolve recipe overrides for the builder export mode.
    const builderExportMode: SellfileExportMode = resolveRecipeOverridesExportMode(builder, recipeOverridesInstructions)
    modes[editingRecipeIndex] = builderExportMode
    // Ensure rule generation sees the same effective export mode as the filter list.
    // Clone only when the effective export mode diverges from the stored value.
    const builderForRules = builderExportMode === builder.exportMode
      ? builder
      : (() => {
          // Avoid mutating the live builder snapshot while we test filters.
          const clone = cloneBuilderRecipe(builder)
          clone.exportMode = builderExportMode
          return clone
        })()
    return evaluateRecipeAgainstFilters(builderForRules, editingRecipeIndex, names, tags, modes)
  }, [
    builder,
    recipeModes,
    recipeNames,
    recipeTags,
    customRecipes.length,
    editingRecipeIndex,
    evaluateRecipeAgainstFilters,
    filterActive,
    limitRecipesToFiltered,
    recipeOverridesInstructions,
    normalizeRecipeTags,
  ])

  const builderInsertBecomesTesterFirstMatch = useCallback((targetIndex: number): boolean => {
    // Tester preview mode: the chip filter is driven by the set of recipes that are the *first match*
    // for at least one tester row that survives the tester-side filters.
    if (!limitRecipesToFiltered) return true
    // Apply recipe overrides before testing the export mode.
    const builderEffective = resolveRecipeOverridesEffectiveRecipe(builder, recipeOverridesInstructions)
    const builderExportMode = builderEffective.exportMode
    if (builderExportMode === 'disabled') return false
    // In tester mode, separators are always shown when recipe filtering is off (anchor chips remain visible).
    if (builderExportMode === 'separator' && testerRecipeFilterMode === 'off') return true
    const rows = gearEntriesAfterRulesFilter
    if (rows.length === 0) return false
    let ruleLimitHit = false
    // Ensure the rules we build reflect the recipe overrides export mode.
    // Clone only when the effective export mode diverges from the stored value.
    const builderForRules = builderEffective
    const rulesForBuilder = buildRulesForRecipe(
      { recipe: builderForRules, metasets, substatTargets: effectiveSubstatTargets, recipeIdx: targetIndex },
      { limit: RULE_COUNT_LIMIT + 1, onLimit: () => { ruleLimitHit = true } },
    )
    // If the recipe generates more rules than we are willing to build in-render, assume it is visible.
    if (ruleLimitHit) return true
    if (rulesForBuilder.length === 0) return false
    for (const row of rows) {
      const currentMatchIdx = row.match?.recipeIdx ?? null
      // If an earlier recipe already wins, inserting/saving cannot make this recipe the first match.
      if (currentMatchIdx !== null && currentMatchIdx < targetIndex) continue
      if (evaluateFirst(rulesForBuilder, row.artifact.testerItem)) return true
    }
    return false
  }, [
    builder,
    recipeOverridesInstructions,
    effectiveSubstatTargets,
    limitRecipesToFiltered,
    metasets,
    testerRecipeFilterMode,
    gearEntriesAfterRulesFilter,
  ])

  const insertHiddenByFilters = useMemo(() => {
    if (!limitRecipesToFiltered) return false
    if (previewMode === 'tester') {
      return !builderInsertBecomesTesterFirstMatch(prospectiveInsertIndex)
    }
    return !builderInsertMatchesRuleFilters
  }, [
    builderInsertBecomesTesterFirstMatch,
    builderInsertMatchesRuleFilters,
    limitRecipesToFiltered,
    previewMode,
    prospectiveInsertIndex,
  ])

  const saveHiddenByFilters = useMemo(() => {
    if (!limitRecipesToFiltered) return false
    if (editingRecipeIndex === null) return false
    if (previewMode === 'tester') {
      return !builderInsertBecomesTesterFirstMatch(editingRecipeIndex)
    }
    return !builderSaveMatchesRuleFilters
  }, [
    builderInsertBecomesTesterFirstMatch,
    builderSaveMatchesRuleFilters,
    editingRecipeIndex,
    limitRecipesToFiltered,
    previewMode,
  ])

  const handleExternalCommand = useCallback((cmd: ExternalCommand) => {
    if (cmd.kind === 'selectRule') {
      if (cmd.rowNumber != null) {
        // External selectRule commands are explicit scroll intents.
        // Why: treat them like direct user navigation for the preview.
        // Signal that this selection came from an explicit selectRule command.
        // Why: preview scroll should follow external rule jumps.
        requestSelectionScroll(SELECTION_SCROLL_SOURCE_SELECT_RULE, null)
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
            const base = pushEndpointHttpBase ?? ''
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

    if (cmd.kind === 'gearDbFileBinary') {
      const file = createGearDbFileFromBytes(cmd.name, cmd.bytes, cmd.contentType)
      if (!file) {
        if (import.meta.env.DEV) {
          console.error('Failed to decode gear DB binary payload from external command.')
        }
        return
      }
      void handleGearDbImport(file, { source: 'command' })
    }
  }, [focusRuleByIndex, handleGearDbImport, handleGearDbRawDelta, handleGearDbRawSnapshot, pushEndpointHttpBase, requestSelectionScroll])

  const { sendRequest: sendExternalRequest } = useExternalCommands({
    pushEndpoint,
    onCommand: handleExternalCommand,
    onReachabilityChange: setPushEndpointReachable,
  })
  // Dirty flag: builder differs from currently selected recipe
  const duplicateOfIndices = useMemo(() => computeDuplicateIndices(customRecipes), [customRecipes])

  // Compare two selection arrays by id + excluded flag.
  const areSetEntriesEqual = useCallback((left: BuilderRecipe['artifactSets'], right: BuilderRecipe['artifactSets']): boolean => {
    const leftNorm = normalizeArtifactSetSelections(left ?? [])
    const rightNorm = normalizeArtifactSetSelections(right ?? [])
    if (leftNorm.length !== rightNorm.length) return false
    for (let i = 0; i < leftNorm.length; i += 1) {
      const l = leftNorm[i]!
      const r = rightNorm[i]!
      if (Number(l.id) !== Number(r.id)) return false
      if (Boolean(l.excluded) !== Boolean(r.excluded)) return false
    }
    return true
  }, [])

  // Merge metaset-derived ids into explicit selections while preserving exclusions.
  const mergeSelectionsWithMetasets = useCallback((
    selections: BuilderRecipe['artifactSets'],
    metasToMerge: readonly Metaset[],
  ): ArtifactSetSelectionEntry[] => {
    const normalized = normalizeArtifactSetSelections(selections ?? [])
    const split = splitArtifactSetSelections(normalized)
    const excluded = new Set(split.excluded.map(Number))
    const included = new Set(split.included.map(Number))
    for (const meta of metasToMerge) {
      for (const setId of meta.sets) {
        const numeric = Number(setId)
        if (excluded.has(numeric)) continue
        included.add(numeric)
      }
    }
    return normalizeArtifactSetSelections([
      ...Array.from(excluded).map((id) => ({ id, excluded: true })),
      ...Array.from(included).map((id) => ({ id })),
    ])
  }, [])

  const handleResetMetasets = useCallback((mode: 'delete' | 'replaceSets' | 'replaceMeta', replacementMetaId?: string) => {
    const defaults = defaultMetasets()
    const replacementId = mode === 'replaceMeta' ? (replacementMetaId || null) : null
    const replacementMetaName = replacementId ? (defaults.find((meta) => meta.id === replacementId)?.name ?? null) : null
    const descriptor: HistoryEntryDescriptor = {
      kind: 'metasetsReset',
      mode,
      ...(replacementMetaName ? { replacementName: replacementMetaName } : {}),
    }
    describeNextChange(descriptor)
    const metasById = new Map(metasets.map((meta) => [meta.id, meta]))
    const stringArraysEqual = (a: readonly string[], b: readonly string[]): boolean => {
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
      if (mode === 'replaceSets') {
        const metasToMerge = currentMetaIds.map((metaId) => metasById.get(metaId)).filter((meta): meta is Metaset => Boolean(meta))
        const nextSets: ArtifactSetSelectionEntry[] = mergeSelectionsWithMetasets(prev.artifactSets, metasToMerge)
        const nextMeta: string[] = []
        const metaChanged = !stringArraysEqual(currentMetaIds, nextMeta)
        const setsChanged = !areSetEntriesEqual(prev.artifactSets, nextSets)
        if (!metaChanged && !setsChanged) return prev
        return {
          ...prev,
          artifactMetaSets: nextMeta,
          artifactSets: nextSets,
        }
      }
      const nextMeta = (mode === 'replaceMeta' && replacementId) ? [replacementId] : []
      const metaChanged = !stringArraysEqual(currentMetaIds, nextMeta)
      if (!metaChanged) return prev
      return {
        ...prev,
        artifactMetaSets: nextMeta,
        artifactSets: prev.artifactSets ?? [],
      }
    })
    setSafeguardRules((prev) => {
      let mutated = false
      const next = prev.map((rule) => {
        const metaIds = rule.combination.metaSetIds ?? []
        if (metaIds.length === 0) return rule
        // Mirror recipe/builder reset behavior so Safeguard combinations stay in sync.
        const nextMeta = (mode === 'replaceMeta' && replacementId) ? [replacementId] : []
        if (mode === 'replaceSets') {
          const metasToMerge = metaIds.map((metaId) => metasById.get(metaId)).filter((meta): meta is Metaset => Boolean(meta))
          const nextSets: ArtifactSetSelectionEntry[] = mergeSelectionsWithMetasets(rule.combination.sets, metasToMerge)
          const metaChanged = !stringArraysEqual(metaIds, nextMeta)
          const setsChanged = !areSetEntriesEqual(rule.combination.sets, nextSets)
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
        }
        const metaChanged = !stringArraysEqual(metaIds, nextMeta)
        if (!metaChanged) return rule
        mutated = true
        return {
          ...rule,
          combination: {
            ...rule.combination,
            metaSetIds: nextMeta,
            sets: rule.combination.sets ?? [],
          },
        }
      })
      return mutated ? next : prev
    })
    setCustomRecipes((prev) => {
      let anyChanged = false
      const next = prev.map((recipe) => {
        const currentMetaIds = recipe.artifactMetaSets ?? []
        if (currentMetaIds.length === 0) return recipe
        const nextMeta = (mode === 'replaceMeta' && replacementId) ? [replacementId] : []
        if (mode === 'replaceSets') {
          const metasToMerge = currentMetaIds.map((metaId) => metasById.get(metaId)).filter((meta): meta is Metaset => Boolean(meta))
          const nextSets: ArtifactSetSelectionEntry[] = mergeSelectionsWithMetasets(recipe.artifactSets, metasToMerge)
          const metaChanged = !stringArraysEqual(currentMetaIds, nextMeta)
          const setsChanged = !areSetEntriesEqual(recipe.artifactSets, nextSets)
          if (!metaChanged && !setsChanged) return recipe
          anyChanged = true
          return { ...recipe, artifactMetaSets: nextMeta, artifactSets: nextSets }
        }
        const metaChanged = !stringArraysEqual(currentMetaIds, nextMeta)
        if (!metaChanged) return recipe
        anyChanged = true
        return { ...recipe, artifactMetaSets: nextMeta, artifactSets: recipe.artifactSets ?? [] }
      })
      return anyChanged ? next : prev
    })
    setMetasets(defaults)
  }, [areSetEntriesEqual, describeNextChange, mergeSelectionsWithMetasets, metasets, setBuilder, setCustomRecipes, setSafeguardRules, setMetasets])

  const builderPanelElement = (
    <BuilderPanel
      recipe={builder}
      onChange={setBuilder}
      onAddToCustom={() => {
        const currentBuilder = builderRef.current
        // Clone the builder snapshot so recipes never share object identity.
        const insertedRecipe = cloneBuilderRecipe(currentBuilder)
        const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < customRecipes.length)
          ? selectedRecipeIdx + 1
          : customRecipes.length
        const nextRecipes = [
          ...customRecipes.slice(0, insertIdx),
          insertedRecipe,
          ...customRecipes.slice(insertIdx),
        ]
        const descriptor = createRecipeAddedDescriptor({
          index: insertIdx,
          recipe: insertedRecipe,
          previous: customRecipes,
          metasets,
        })
        describeNextChange(descriptor)
        setCustomRecipes(nextRecipes)
        // Auto-select the newly added recipe chip
        syncSelectedRecipeIdx(insertIdx, { forceSync: true, suppressDraft: true })
      }}
      editingIndex={editingRecipeIndex}
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
        if (selectedRecipeIdx === null) return
        const currentBuilder = builderRef.current
        // Clone once so history + state updates see the same detached snapshot.
        const nextRecipe = cloneBuilderRecipe(currentBuilder)
        const previousRecipe = customRecipes[selectedRecipeIdx] ?? null
        if (previousRecipe) {
          const descriptor = createBuilderRecipeUpdateDescriptor({
            previous: previousRecipe,
            next: nextRecipe,
            index: selectedRecipeIdx,
            metasets,
          })
          describeNextChange(descriptor)
        } else {
          describeNextChange(null)
        }
        setCustomRecipes(prev => prev.map((c, i) => (i === selectedRecipeIdx ? nextRecipe : c)))
      }}
      registerAutoApplyHandler={registerAutoApplyHandler}
      metasets={metasets}
      onMetasetsChange={(next) => setMetasets(next)}
      describeNextChange={describeNextChange}
      onDeleteMetaset={(id, opts) => {
        // Determine replacement strategy before mutating metasets/recipes/safeguard rules
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
        const descriptor: HistoryEntryDescriptor = {
          kind: 'metasetDeleted',
          metaset: cloneMetaset(metaToDelete),
          mode: deletionMode,
          ...(replacementName ? { replacementName } : {}),
        }
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
              nextSets = mergeSelectionsWithMetasets(nextSets, [metaToDelete])
            } else if (replaceWithMetaId) {
              if (!nextMeta.includes(replaceWithMetaId)) nextMeta = nextMeta.concat(replaceWithMetaId)
            }
            return { ...prev, artifactMetaSets: nextMeta, artifactSets: nextSets }
          })
        }

        const usedCount = metasetUsageCounts[id] || 0
        const safeguardUsedCount = safeguardMetasetUsageCounts[id] || 0

        // Update only recipes that reference this metaset
        if (usedCount > 0) {
          setCustomRecipes(prev => {
            let anyChanged = false
            const next = prev.map(c => {
              const currentMeta = c.artifactMetaSets ?? []
              if (!currentMeta.includes(id)) return c
              anyChanged = true
              let nextMeta = currentMeta.filter(x => x !== id)
              let nextSets = c.artifactSets ?? []
              if (replaceWithSets && metaToDelete) {
                nextSets = mergeSelectionsWithMetasets(nextSets, [metaToDelete])
              } else if (replaceWithMetaId) {
                if (!nextMeta.includes(replaceWithMetaId)) nextMeta = nextMeta.concat(replaceWithMetaId)
              }
              return { ...c, artifactMetaSets: nextMeta, artifactSets: nextSets }
            })
            return anyChanged ? next : prev
          })
        }

        // Rewrite Safeguard rules that referenced this metaset.
        if (safeguardUsedCount > 0) {
          setSafeguardRules((prev) => {
            let mutated = false
            const next = prev.map((rule) => {
              const metaIds = rule.combination.metaSetIds ?? []
              if (!metaIds.includes(id)) return rule
              // Rewrite Safeguard combinations so deleted metaset IDs are dropped
              // or swapped, matching the recipe/builder behavior.
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
                nextSets = mergeSelectionsWithMetasets(nextSets, [metaToDelete])
              }
              const metaChanged = metaIds.length !== nextMetaIds.length || metaIds.some((metaId, idx) => metaId !== nextMetaIds[idx])
              const currentSets = rule.combination.sets ?? []
              const setsChanged = replaceWithSets ? !areSetEntriesEqual(currentSets, nextSets) : false
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
      effectiveSubstatTargets={effectiveSubstatTargets}
      substatTargetsOverridesActive={substatTargetsOverridesActive}
      onResetMetasets={handleResetMetasets}
      onSubstatTargetsChange={(next, opts) => { applySubstatTargetsChange(next, opts) }}
      substatTargetsDialogOpen={substatTargetsDialogOpen}
      onCloseSubstatTargetsDialog={closeSubstatTargetsDialog}
      recipeOverridesInstructions={recipeOverridesInstructions}
      setUsageCounts={setUsageCounts}
      metasetUsageCounts={metasetUsageCounts}
      safeguardMetasetUsageCounts={safeguardMetasetUsageCounts}
      substatColors={substatColors}
      recipeCount={customRecipes.length}
      selectedIsDirty={selectedIsDirty}
      insertHiddenByFilters={insertHiddenByFilters}
      saveHiddenByFilters={saveHiddenByFilters}
      recipeRuleCounts={recipeRuleCounts}
      recipeRuleFingerprints={recipeRuleFingerprints}
      recipesExcludedByTotalLimit={recipesExcludedByTotalLimit}
      ruleSubstatTargetsKey={ruleSubstatTargetsKey}
      rulesBuilding={rulesBuilding}
      awaitRuleCounts={awaitRuleCounts}
      countRulesForRecipes={countRules}
      onSelectRecipesByMetaset={(id) => {
        // Select all recipes that reference the given metaset ID.
        const indices: number[] = []
        for (let i = 0; i < customRecipes.length; i += 1) {
          const ref = customRecipes[i]?.artifactMetaSets ?? []
          if (ref.includes(id)) indices.push(i)
        }
        setSelectedRecipeIndices(indices)
        const lastIdx = indices.length - 1
        const last = lastIdx >= 0 ? indices[lastIdx]! : null
        syncSelectedRecipeIdx(last, { preserveSelection: indices.length > 1 })
      }}
      onApplyMultiEdit={applyMultiEditDraft}
      multiEdit={multiEditHandle}
      multiSelectedRecipes={multiSelectedRecipes}
      onBeforeMetasetsDialogClose={flushRuleCache}
    />
  )

  // Flush pending auto-apply edits before any recipe order mutation.
  const flushAutoApplyBeforeReorder = useCallback(() => {
    // Use the shared auto-apply handler so disabled states short-circuit cleanly.
    autoApplyNowRef.current()
  }, [autoApplyNowRef])

  const handleRecipeMoveUpWithAutoApply = useCallback((idx: number) => {
    // Commit debounced edits before indices shift so the moved recipe keeps them.
    flushAutoApplyBeforeReorder()
    // Delegate to the selection-aware move handler.
    handleRecipeMoveUp(idx)
  }, [flushAutoApplyBeforeReorder, handleRecipeMoveUp])

  const handleRecipeMoveDownWithAutoApply = useCallback((idx: number) => {
    // Commit debounced edits before indices shift so the moved recipe keeps them.
    flushAutoApplyBeforeReorder()
    // Delegate to the selection-aware move handler.
    handleRecipeMoveDown(idx)
  }, [flushAutoApplyBeforeReorder, handleRecipeMoveDown])

  const handleRecipeMoveTopWithAutoApply = useCallback((idx: number) => {
    // Commit debounced edits before indices shift so the moved recipe keeps them.
    flushAutoApplyBeforeReorder()
    // Delegate to the selection-aware move handler.
    handleRecipeMoveTop(idx)
  }, [flushAutoApplyBeforeReorder, handleRecipeMoveTop])

  const handleRecipeMoveBottomWithAutoApply = useCallback((idx: number) => {
    // Commit debounced edits before indices shift so the moved recipe keeps them.
    flushAutoApplyBeforeReorder()
    // Delegate to the selection-aware move handler.
    handleRecipeMoveBottom(idx)
  }, [flushAutoApplyBeforeReorder, handleRecipeMoveBottom])

  const handleRecipeReorderWithAutoApply = useCallback((movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => {
    // Commit debounced edits before indices shift so the moved recipes keep them.
    flushAutoApplyBeforeReorder()
    // Delegate to the selection-aware reorder handler.
    handleRecipeReorder(movingIndices, targetIndex, options)
  }, [flushAutoApplyBeforeReorder, handleRecipeReorder])

  const recipeChipsPanelElement = (
    <RecipeChipsPanel
      containerRef={chipsContainerRef}
      recipes={recipeOverridesRecipesForRules}
      exportModeOverrides={recipeOverridesExportModes.modes}
      maxHeightPx={chipsMaxHeight}
      selectedIndices={selectedRecipeIndices}
      metasets={metasets}
      substatColors={substatColors}
      onHoverIdx={handleRecipeHoverIdx}
      duplicateOfIndices={duplicateOfIndices}
      onSelect={handleRecipeSelect}
      onDelete={handleRecipeDelete}
      onDuplicate={handleRecipeDuplicate}
      onPasteAfter={handleRecipePasteAfter}
      onMoveUp={handleRecipeMoveUpWithAutoApply}
      onMoveDown={handleRecipeMoveDownWithAutoApply}
      onMoveTop={handleRecipeMoveTopWithAutoApply}
      onMoveBottom={handleRecipeMoveBottomWithAutoApply}
      onCopyAllRecipes={handleCopyAllRecipes}
      onCopyRecipe={handleCopyRecipe}
      {...(isDevBuild ? { onCopyRecipeDev: copyRecipeWithRulesDev } : {})}
      onSelectAll={handleSelectAllRecipes}
      selectAllLabelKey={selectAllLabelKey}
      onClearSelection={handleClearSelection}
      onPasteAtEnd={handlePasteAtEnd}
      visibleIndices={visibleRecipeIndices}
      highlightDelete={highlightDeleteRecipes}
      onHighlightDelete={setHoverDeleteRecipes}
      onDeleteAll={requestClearAll}
      deleteAllDisabled={deleteAllDisabled}
      onDeleteSelected={handleDeleteSelected}
      onPrepareDragSelection={prepareDragSelection}
      onReorderRecipes={handleRecipeReorderWithAutoApply}
    />
  )

  const applyHsfcLoadResult = useCallback((
    fileName: string,
    payload: {
      recipes: BuilderRecipe[]
      metasets: Metaset[]
      substatTargets: SubstatTargetTable
      selectedIndex: number | null
      note?: string
      finalSellRemainder: FinalSellRemainderConfig
      safeguardRules: SafeguardRule[]
      safeguardsEnabled: boolean
    },
  ) => {
    const {
      recipes,
      metasets: nextMetas,
      substatTargets: nextSubstatTargets,
      selectedIndex,
      note,
      finalSellRemainder: fsr,
      safeguardRules,
      safeguardsEnabled,
    } = payload

    const loadDescriptor = createHsfcLoadedDescriptor(fileName)
    const resolvedSel = typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < recipes.length
      ? selectedIndex
      : (recipes.length > 0 ? 0 : null)
    const rawNote = typeof note === 'string' ? note : ''
    const importedNote = rawNote.trim().length > 0 ? rawNote : null
    beginTesterMatchReset('hsfc')

    if (importedNote !== null) {
      // Mark this as an auto-open so the view dialog hides the edit button.
      setNoteAutoOpenedFromHsfc(true)
      applyNoteChange(importedNote, { mode: 'import', publish: false })
      openNoteViewer()
    } else {
      applyNoteChange(null, { mode: 'import', publish: false })
      handleCloseNote()
    }
    // HSFC files do not carry recipe overrides answers, so reset to defaults.
    setNoteRecipeOverridesAnswers({})
    // HSFC files never store the disabled flag, so re-enable parsing.
    setNoteRecipeOverridesDisabled(false)

    startTransition(() => {
      describeNextChange(loadDescriptor)
      setCustomRecipes(recipes)
      if (nextMetas !== metasets) {
        setMetasets(nextMetas)
      }
      if (nextSubstatTargets !== substatTargets) {
        try {
          applySubstatTargetsChange(nextSubstatTargets, { mode: 'import', publish: false })
        } catch {}
      }
      setSafeguardRules(safeguardRules)
      setSafeguardsEnabled(safeguardsEnabled)
      applyFinalSellChange(fsr, { mode: 'import', publish: false })
      syncSelectedRecipeIdx(resolvedSel, { forceSync: true, suppressDraft: true })
      if (resolvedSel !== null && recipes[resolvedSel]) {
        setBuilder(recipes[resolvedSel]!)
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
    setNoteAutoOpenedFromHsfc,
    setSafeguardRules,
    setSafeguardsEnabled,
    setBuilder,
    setCustomRecipes,
    setLastExportSig,
    setMetasets,
    setNoteRecipeOverridesAnswers,
    setNoteRecipeOverridesDisabled,
    substatTargets,
    syncSelectedRecipeIdx,
    beginTesterMatchReset,
  ])

  const importHsfcFile = useCallback(async (file: File) => {
    flushTransientUi()
    try {
      const result = await readHsfcFile(file, { metasets, substatTargets })
      applyHsfcLoadResult(file.name, result)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to parse recipe file (.sfr/.hsfc)', err)
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

  // Track whether a note exists so we can open in view mode.
  const notePresent = Boolean(hsfcNote && hsfcNote.trim())
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
          recipes: customRecipes,
          finalSellRemainder,
          selectedRecipeIndex: selectedRecipeIdx,
          ...(hsfcNote ? { note: hsfcNote } : {}),
          safeguardRules,
          safeguardsEnabled,
        })
        const blob = hsfcToBlob(payload)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = hsfcFilename()
        a.click()
        URL.revokeObjectURL(url)
        showToast(t('toastRecipesSaved'))
        markSavedNow()
      }}
      onOpenNote={() => { notePresent ? openNoteViewerManual() : openNoteEditorManual() }}
      notePresent={notePresent}
      count={customRecipes.length}
      selectedCount={selectedRecipeIndices.length}
      visibleCount={visibleRecipeCount}
      hsfcDirty={isDirty}
    />
  )

  // Resolves ID conflicts when importing recipes that reuse metaset identifiers.
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
          const prep = prepareHsfcImport(metasets, pendingImport.metasets, pendingImport.recipes)
          const { nextMetas, remapForConflicts } = finalizeImport(metasets, prep, choice)
          const idMap = new Map(importIdMap)
          for (const [k, v] of remapForConflicts) idMap.set(k, v)
          const recipes = pendingImport.recipes.map((c) => ({
            ...c,
            artifactMetaSets: (c.artifactMetaSets ?? []).map((id) => idMap.get(id) ?? id),
          }))
          const substatTargetsDescriptor = applySubstatTargetsChange(pendingImport.substatTargets, { mode: 'import', publish: false })
          const refIds = new Set<string>()
          for (const c of recipes) for (const id of c.artifactMetaSets ?? []) refIds.add(String(id))
          const have = new Set(nextMetas.map((m) => m.id))
          const finalMetas = nextMetas.slice()
          for (const id of refIds) {
            if (!have.has(id)) {
              const existingNames = metasets.map((m) => m.name)
              const gen = generateMetasetNameWithFlag(existingNames)
              finalMetas.push({ id, name: gen.name, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
            }
          }
          const conflictDescriptor: HistoryEntryDescriptor = {
            kind: 'metasetConflictResolved',
            strategy: choice,
            conflictCount: prep.conflicts.length,
            newIdCount: remapForConflicts.size,
          }
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
            const preLen = customRecipes.length
            setCustomRecipes((prev) => {
              if (!recipes.length) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return prev
              }
              const insertIdx = prev.length
              const next = [...prev, ...recipes]
              const labels = recipes.map((recipe, offset) => snapshotRecipeLabel(insertIdx + offset, recipe))
              const descriptor = createRecipesInsertedDescriptor({
                mode: 'import',
                labels,
                location: buildInsertionLocation(insertIdx, prev),
              })
              if (!descriptor) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return next
              }
              const descriptorWithConflict = appendDescriptorDetails(descriptor, conflictDescriptor)
              const descriptorWithSubstatTargets = appendDescriptorDetails(descriptorWithConflict, substatTargetsDescriptor)
              const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
              const descriptorWithNote = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
              describeNextChange(withClipboardSource(descriptorWithNote))
              return next
            })
            try {
              const sel = preLen + recipes.length - 1
              syncSelectedRecipeIdx(sel, { forceSync: true, suppressDraft: true })
              setBuilder(recipes[recipes.length - 1]!)
            } catch {}
          } else {
            const after = Math.max(0, Math.min((pendingImport.afterIdx ?? customRecipes.length - 1), customRecipes.length - 1))
            setCustomRecipes((prev) => {
              const insertIdx = Math.min(prev.length, after + 1)
              if (!recipes.length) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return prev
              }
              const next = [...prev.slice(0, insertIdx), ...recipes, ...prev.slice(insertIdx)]
              const labels = recipes.map((recipe, offset) => snapshotRecipeLabel(insertIdx + offset, recipe))
              const descriptor = createRecipesInsertedDescriptor({
                mode: 'import',
                labels,
                location: buildInsertionLocation(insertIdx, prev),
              })
              if (!descriptor) {
                const combined = appendDescriptorDetails(conflictDescriptor ?? null, substatTargetsDescriptor)
                const combinedWithFinal = appendDescriptorDetails(combined, finalSellDescriptor)
                const combinedWithNote = appendDescriptorDetails(combinedWithFinal, noteDescriptor)
                describeNextChange(withClipboardSource(combinedWithNote))
                return next
              }
              const descriptorWithConflict = appendDescriptorDetails(descriptor, conflictDescriptor)
              const descriptorWithSubstatTargets = appendDescriptorDetails(descriptorWithConflict, substatTargetsDescriptor)
              const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
              const descriptorWithNote = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
              describeNextChange(withClipboardSource(descriptorWithNote))
              return next
            })
            try {
              syncSelectedRecipeIdx(after + recipes.length, { forceSync: true, suppressDraft: true })
              setBuilder(recipes[recipes.length - 1]!)
            } catch {}
          }
          setSafeguardRules(pendingImport.safeguardRules)
          setSafeguardsEnabled(pendingImport.safeguardsEnabled)
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
        const preLen = customRecipes.length
        const parsed = parseRecipesFromText(pasteText, metasets)
        const ok = handlePasteText(pasteText)
        if (ok) {
          if (pasteAfterIdx !== null && parsed.length > 0) {
            try {
              syncSelectedRecipeIdx(pasteAfterIdx + parsed.length, { forceSync: true, suppressDraft: true })
              setBuilder(parsed[parsed.length - 1]!)
            } catch {}
            setPasteAfterIdx(null)
          } else if (pasteSelectOnEmpty && parsed.length > 0) {
            try {
              const sel = preLen + parsed.length - 1
              syncSelectedRecipeIdx(sel, { forceSync: true, suppressDraft: true })
              setBuilder(parsed[parsed.length - 1]!)
            } catch {}
          }
          setPasteSelectOnEmpty(false)
          setPasteDlgOpen(false)
        }
      }}
      confirmLabel={selectedRecipeIdx !== null ? 'Insert after selected' : 'Add to end'}
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
        '.chips-dragging [data-recipe-chip="true"], .chips-dragging [data-recipe-chip="true"] *': {
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
                v{APP_VERSION} — © Nusi㊷ - 2026 — Build and preview sell files for RSL Helper. Made by [STBL] Nusi㊷
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
          substatTargetsLabel={t('builderSubstatTargets')}
          substatTargetsTooltip={t('builderSubstatTargetsTooltip')}
          onOpenSubstatValues={openSubstatTargetsDialog}
          builderPanel={builderPanelElement}
          headerActions={headerActionsElement}
          metasetConflictDialog={metasetConflictDialogElement}
          recipeChipsPanel={recipeChipsPanelElement}
          pasteDialog={pasteDialogElement}
          copyDialog={copyDialogElement}
        />

        <Paper ref={previewPaperRef} sx={{
          p: PREVIEW_PAPER_PADDING_UNITS,
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
        testerOutcomeSummary={testerOutcomeSummaryForPreview}
        testerOutcomeSummaryTotal={testerOutcomeSummary}
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
            let pushToast: 'success' | 'failure' | null = null
            try {
              // Serialize the sellfile payload so the WS server can persist it.
              const payloadText = await blob.text()
              // Send an upload request that matches both WS protocol flavors.
              const response = await sendExternalRequest(EXTERNAL_WS_METHOD_UPLOAD_SELLFILE, {
                name: filename,
                contentType: blob.type || 'application/json',
                data: payloadText,
              })
              if (response.ok) {
                // Mark the endpoint as reachable once a request succeeds.
                setPushEndpointReachable(true)
                pushToast = 'success'
                setLastExportSig(hsfExportSig)
              } else {
                if (import.meta.env.DEV) {
                  console.error('Push endpoint responded with error', response.error)
                }
                pushToast = 'failure'
              }
            } catch (err) {
              if (import.meta.env.DEV) {
                console.error('Failed to export sellfile over WebSocket', err)
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
        safeguardsEnabled={safeguardsEnabled}
        onToggleSafeguards={(next) => applySafeguardsEnabledChange(next)}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
	        testerSubstatSort={testerSubstatSortPrefs.state}
	        useStatButtonColors={statButtonBorders}
	        substatColors={substatColors}
	        onClearTesterSubstatSort={testerSubstatSortPrefs.clear}
	        onSetTesterSubstatSortState={setTesterSubstatSortState}
		        onSetTesterSubstatSortDirection={testerSubstatSortPrefs.setDirection}
		        onToggleTesterArtifactGroupBySet={testerSubstatSortPrefs.toggleArtifactGroupBySet}
		        onToggleTesterArtifactGroupBySlot={testerSubstatSortPrefs.toggleArtifactGroupBySlot}
		        onToggleTesterAccessoryGroupByFaction={testerSubstatSortPrefs.toggleAccessoryGroupByFaction}
		        onToggleTesterAccessoryGroupBySet={testerSubstatSortPrefs.toggleAccessoryGroupBySet}
		        onToggleTesterAccessoryGroupBySlot={testerSubstatSortPrefs.toggleAccessoryGroupBySlot}
		        onToggleTesterGroupingHeaders={testerSubstatSortPrefs.toggleHideHeaders}
		        onToggleTesterSubstatSortExcludeGlyphs={testerSubstatSortPrefs.toggleExcludeGlyphs}
	        onToggleTesterSubstatSortPriority={testerSubstatSortPrefs.togglePriorityKey}
	        onToggleTesterSubstatSortPriorityFlipped={testerSubstatSortPrefs.toggleFlipped}
	        onSetTesterSubstatSortWeight={testerSubstatSortPrefs.setWeight}
	        onBumpTesterSubstatSortWeight={testerSubstatSortPrefs.bumpWeight}
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
        gearDbHistoryEntries={gearDbDiffHistory}
        onClearGearDbHistory={clearGearDbDiffHistory}
        hideGearDbUpdateToast={hideGearDbUpdateToast}
        onToggleHideGearDbUpdateToast={toggleHideGearDbUpdateToast}
      />
          {filterOpen && (
            <RulesFilterPanel
              ref={rulesFilterPanelRef}
              mode={previewMode}
              state={rulesFilter}
              onChange={setRulesFilter}
              metasets={metasets}
              showFaction={showFactionFilter}
              recipeChipFilterActive={limitRecipesToFiltered}
              onRecipeChipFilterChange={setLimitRecipesToFiltered}
              testerRecipeFilterMode={testerRecipeFilterMode}
              onTesterRecipeFilterModeChange={setTesterRecipeFilterMode}
              recipeCount={customRecipes.length}
              collapsed={filterCollapsed}
              onCollapsedChange={setFilterCollapsed}
              testerChampionOptions={testerChampionOptions}
              substatColors={substatColors}
              useStatButtonColors={statButtonBorders}
              hasManualTesterItems={hasManualTesterRows}
            />
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            <Box
              aria-hidden={previewMode !== 'tester'}
              data-tour-id={previewMode === 'tester' ? 'preview.tester-grid' : undefined}
              sx={{
                // Keep both panes mounted and layered with fixed geometry across mode switches.
                position: 'absolute',
                inset: 0,
                height: '100%',
                minHeight: 0,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                visibility: previewMode === 'tester' ? 'visible' : 'hidden',
                pointerEvents: previewMode === 'tester' ? 'auto' : 'none',
                zIndex: previewMode === 'tester' ? 1 : 0,
              }}
            >
              <Box
                data-tour-id={previewMode === 'tester' ? 'preview.tester-grid-top' : undefined}
                sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '50%', pointerEvents: 'none' }}
              />
              <TesterItemsGrid
                rows={gearEntriesForTable}
                // Chance overlays should compare against the full tester inventory, not the filtered slice.
                safeguardUpgradeChanceRows={testerPreviewRows}
                filterActive={testerFilterActive || testerRecipeFilterActive}
                substatColors={substatColors}
                useStatButtonColors={statButtonBorders}
                onToggleStatColors={setStatButtonBorders}
                onOpenManageColors={openColors}
                colorBlindMode={colorBlindMode}
                onChangeColorBlindMode={setColorBlindMode}
                colorIconSrc={colorIconSrc}
                onCardWidthMeasured={handleTesterCardWidthMeasured}
                onScrollbarWidthMeasured={setTesterGridScrollbarWidthPx}
                recipeNames={testerRecipeNamesForGrid}
                focusArtifactRequest={testerArtifactFocusRequest}
                onFocusArtifactFilteredOut={handleTesterFocusArtifactFilteredOut}
                onJumpToRule={handleTesterRuleView}
                onJumpToSafeguardRule={openLogicHubSafeguardRule}
                onCreateRuleTemplate={handleTesterRuleTemplateCreate}
                suppressMatchDetails={suppressTesterMatchDetails}
                grouping={testerSubstatSortPrefs.state.grouping}
                substatSort={testerSubstatSortSpec}
                sortState={testerSubstatSortPrefs.state}
                safeguardUpgradeChanceRules={resolvedSafeguardRules}
                emptyStateVerticalAlign={emptyStateVerticalAlign}
              />
            </Box>
            <Box
              aria-hidden={previewMode === 'tester'}
              sx={{
                // Keep the preview pane mounted in a stable absolute layer as well.
                position: 'absolute',
                inset: 0,
                height: '100%',
                minHeight: 0,
                width: '100%',
                overflow: 'hidden',
                visibility: previewMode === 'tester' ? 'hidden' : 'visible',
                pointerEvents: previewMode === 'tester' ? 'none' : 'auto',
                zIndex: previewMode === 'tester' ? 0 : 1,
              }}
            >
              <HsfRulesTableMemo
                rules={hsfRulesForTable}
                recipeNames={recipeNamesForGrid}
                setHoveredRecipeIdx={setHoveredRecipeIdx}
                selectedRecipeIdx={previewSelectedRecipeIdx}
                multiselectActive={multiselectActive}
                selectionScrollRequest={selectionScrollRequest}
                emptyStateVerticalAlign={emptyStateVerticalAlign}
                focusRuleIndex={focusRuleIndex}
                onFocusRuleSettled={() => setFocusRuleIndex(null)}
                onSelectRecipeIdx={handleRulesTableSelectRecipeIdx}
                onSelectSafeguardRule={handleSafeguardPreviewStarSelect}
                emptyDueToFilter={hsfTableEmptyDueToFilters}
                limitExceeded={limitExceeded}
                onRecipeAction={handleRulesTableRecipeAction}
                onClearBase={handleRulesTableClearBase}
                onConfigureFinalSell={handleRulesTableEditFinalSell}
                onOpenManageColors={openColors}
                colorIconSrc={colorIconSrc}
                substatColors={substatColors}
                colorBlindMode={colorBlindMode}
                onChangeColorBlindMode={setColorBlindMode}
              />
            </Box>
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
      {/* Only mount the Note dialog when visible so recipe chip previews stay out of the tree. */}
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
          onRequestEdit={openNoteEditorManual}
          onRequestView={openNoteViewerManual}
          recipeOverridesAnswers={noteRecipeOverridesAnswers}
          onRecipeOverridesAnswersChange={setNoteRecipeOverridesAnswers}
          recipeOverridesDisabled={noteRecipeOverridesDisabled}
          onRecipeOverridesDisabledChange={setNoteRecipeOverridesDisabled}
          // Apply recipe overrides instructions to stored recipes when requested by the note dialog.
          onApplyRecipeOverrides={applyRecipeOverridesToRecipes}
          // Use recipe-overrides-resolved recipes so note chips mirror current answers.
          recipes={recipeOverridesRecipesForRules}
          metasets={metasets}
          safeguardRules={safeguardRules}
          useStatButtonColors={statButtonBorders}
          substatColors={substatColors}
          gearSummary={testerOutcomeSummary}
          summaryProgressRatio={workloadProgressRatio}
          hideEditButton={noteAutoOpenedFromHsfc}
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
              alignItems: gearDbCommandToast.diff ? 'flex-start' : 'center',
              fontSize: Math.max(12, FONT_SIZE_BASE_PX - 2),
              lineHeight: 1.35,
              px: 1.75,
              py: 1,
              minWidth: gearDbCommandToast.diff ? 320 : 240,
              maxWidth: 560,
              whiteSpace: gearDbCommandToast.diff ? 'normal' : 'pre-line',
            }}
          >
            {gearDbCommandToast.diff
              ? (
                <GearDbDiffToast
                  payload={gearDbCommandToast.diff}
                  substatColors={substatColors}
                  useStatButtonColors={statButtonBorders}
                  // Boost contrast for colored glyphs on the success toast background.
                  useCountPill={gearDbCommandToast.severity === 'success'}
                />
              )
              : gearDbCommandToast.message}
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
          sortDiffer={restoreSortDiffer}
          onDismiss={() => {
            dismissRestore()
            setTesterRestoreDraft(null)
          }}
          onRestore={(selection) => {
            flushTransientUi()
            const draft = restoreDraft
            const shouldResetTesterMatches = Boolean(
              (selection.recipes && Array.isArray(draft?.Recipes))
              || (selection.tester && testerRestoreDraft)
            )
            if (shouldResetTesterMatches) beginTesterMatchReset('restore')
            const selectionKeys = Object.entries(selection).filter(([, value]) => value)
            if (selectionKeys.length > 0) {
              const autosaveDescriptor = createAutosaveRestoredDescriptor({
                version: typeof draft?.Version === 'string' ? draft.Version : null,
                savedAt: typeof draft?.AutosaveSavedAt === 'string'
                  ? draft.AutosaveSavedAt
                  : (selection.tester && testerRestoreDraft?.savedAt ? testerRestoreDraft.savedAt : null),
              })
              describeNextChange(autosaveDescriptor)
            }
            if (draft) {
              // Restore/clear runtime gear sets first so baked-in catalog lookups
              // remain stable while we sanitize incoming recipes/metasets.
              if (selection.targets && restoreTargetsDiffer && draft.substatTargets && typeof draft.substatTargets === 'object') setSubstatTargets(draft.substatTargets)
              if (selection.note) {
                const restoredNote = typeof draft.Note === 'string' ? draft.Note : ''
                if (restoredNote) {
                  applyNoteChange(restoredNote, { mode: 'restore', publish: false })
                } else {
                  applyNoteChange(null, { mode: 'restore', publish: false })
                }
                const restoredAnswers = draft.NoteRecipeOverridesAnswers ?? {}
                setNoteRecipeOverridesAnswers(pruneNoteRecipeOverridesAnswers(restoredNote, restoredAnswers))
                setNoteRecipeOverridesDisabled(Boolean(draft.NoteRecipeOverridesDisabled))
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
                  setTesterRecipeFilterMode(draft.Filters.testerRecipeFilterMode ?? 'off')
                  if (draft.Filters.activeMode === 'rules' || draft.Filters.activeMode === 'tester') {
                    setPreviewMode(draft.Filters.activeMode)
                  }
                } catch {}
              }
              if (selection.sort && restoreSortDiffer && draft.TesterSort) {
                setTesterSubstatSortState(draft.TesterSort)
              }
              if (selection.gearSets) {
                // User opted in: hydrate runtime sets from localStorage now.
                // Why: recipes restored below may rely on these IDs.
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
              // Why: metasets are expanded into recipe rules and chip labels.
              const sanitizeMetasets = (incoming: Metaset[]): Metaset[] => (
                bakedInSetIdSet
                  ? incoming.map((meta) => ({
                    ...meta,
                    sets: (meta.sets ?? []).filter((id) => bakedInSetIdSet.has(Number(id))),
                  }))
                  : incoming
              )
              // Sanitize recipes by removing unknown runtime IDs.
              // Why: restored chips should not advertise dormant sets.
              const sanitizeRecipes = (incoming: BuilderRecipe[]): BuilderRecipe[] => (
                bakedInSetIdSet
                  ? incoming.map((recipe) => ({
                    ...recipe,
                    artifactSets: normalizeArtifactSetSelections(recipe.artifactSets ?? [])
                      .filter((entry) => bakedInSetIdSet.has(Number(entry.id)))
                      .map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id })),
                  }))
                  : incoming
              )
              if (selection.metasets && restoreMetasetsDiffer && Array.isArray(draft.Metasets)) {
                setMetasets(sanitizeMetasets(draft.Metasets))
              }
              if (selection.recipes && Array.isArray(draft.Recipes)) {
                if (draft.FinalSellRemainder && typeof draft.FinalSellRemainder === 'object') {
                  try {
                    const fsr = draft.FinalSellRemainder as FinalSellRemainderConfig
                    applyFinalSellChange(fsr, { publish: false })
                  } catch {}
                }
                const sanitizedRecipes = sanitizeRecipes(draft.Recipes)
                setCustomRecipes(sanitizedRecipes)
                const len = draft.Recipes.length
                if (len > 0) {
                  const savedSel = typeof draft.SelectedRecipeIndex === 'number' ? draft.SelectedRecipeIndex : (len - 1)
                  const sel = savedSel >= 0 && savedSel < len ? savedSel : len - 1
                  syncSelectedRecipeIdx(sel, { forceSync: true, suppressDraft: true })
                  try {
                    if (sanitizedRecipes[sel]) setBuilder(sanitizedRecipes[sel]!)
                  } catch {}
                } else {
                  syncSelectedRecipeIdx(null, { forceSync: true, suppressDraft: true })
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
            const savedSafeguardsGridFilterMode = draft?.SafeguardsGridFilterMode
            if (savedSafeguardsGridFilterMode) {
              setSafeguardsGridFilterMode(sanitizeSafeguardsGridFilterMode(savedSafeguardsGridFilterMode))
            }
            if (selection.recipes) {
              if (Array.isArray(draft?.Safeguards)) setSafeguardRules(draft.Safeguards)
              if (typeof draft?.SafeguardsEnabled === 'boolean') {
                setSafeguardsEnabled(Boolean(draft.SafeguardsEnabled))
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
		          onClose={handleCloseLogicHub}
          onReset={() => applyFinalSellChange({
            artifacts: false,
            accessories: false,
            levels: FINAL_SELL_DEFAULT_LEVELS.slice() as FinalSellLevel[],
            setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
          }, { mode: 'reset' })}
	          activeTab={logicHubDialogTab}
	          onChangeTab={setLogicHubDialogTab}
          focusSafeguardRule={logicHubSafeguardFocusRequest}
	          // Pass preview grid state so the Safeguards tab can mirror the tester visuals without duplicating selectors.
	          safeguardRules={safeguardRules}
          onSafeguardRulesChange={applySafeguardRulesChange}
          safeguardsEnabled={safeguardsEnabled}
          onSafeguardsEnabledChange={applySafeguardsEnabledChange}
          safeguardDetection={safeguardDetection}
          gearEntries={testerPreviewRows}
          safeguardItemKeys={safeguardGroupItemKeys}
          testerCardWidthPx={resolvedTesterCardWidthPx}
          substatColors={substatColors}
          useStatButtonColors={statButtonBorders}
          onToggleStatColors={setStatButtonBorders}
          onOpenManageColors={openColors}
          colorBlindMode={colorBlindMode}
          onChangeColorBlindMode={setColorBlindMode}
          colorIconSrc={colorIconSrc}
          recipeNames={testerRecipeNamesForGrid}
          metasets={metasets}
          suppressMatchDetails={suppressTesterMatchDetails}
          workloadProgressRatio={workloadProgressRatio}
          onResetSafeguards={handleResetSafeguards}
          onJumpToRule={handleTesterRuleView}
          customRecipes={customRecipes}
          testerItems={testerItems}
	          setTesterItems={setTesterItems}
	          allocTesterItemId={allocTesterItemId}
          testerMatches={testerMatchesByItemId}
          onResetGearTester={handleResetGearTesterItems}
          rules={mergedRules}
          substatTargets={substatTargets}
          emptyStateVerticalAlign={emptyStateVerticalAlign}
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
