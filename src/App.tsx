/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - SFR (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, substatTargets, and autosave
 * - Color management for substat chips and various dialogs
 */
import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, type ReactNode } from 'react'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, hsfToBlob } from './lib/hsfIO'
import { getPushEndpoint } from './lib/runtimeConfig'
import { EXTERNAL_WS_METHOD_UPLOAD_SELLFILE } from './lib/externalWsProtocol'
import type {
  ExternalCommand,
  GearDbArtifactsCommand,
  GearDbChampionsCommand,
  GearDbInboxArtifactsCommand,
  GearDbLastUsedCommand,
  GearDbRawSnapshotCommand,
} from './lib/externalCommands'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderRecipe, type SubstatTargetTable, type SellfileExportMode } from './lib/hsfBuilder'
import { parseRecipesFromText, buildReadableRecipe, readSfrFile, buildSfrPayload, sfrToBlob } from './lib/sfrIO'
import { parseRecipeNameDirectives } from './lib/recipeNameDirectives'
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
  AUTOSAVE_GEAR_INSPECTOR_KEY,
  PREVIEW_MODE_STORAGE_KEY,
  BUILDER_MODE_STORAGE_KEY,
  PANEL_WIDTH_PX,
  SIDE_BY_SIDE_BREAKPOINT_PX,
  GRID_COLUMN_GAP_PX,
  PREVIEW_PAPER_PADDING_UNITS,
  FINAL_SELL_DEFAULT_LEVELS,
  SMALL_BUTTON_HEIGHT_PX,
  ELLIPSIS_TEXT_SX,
  ACCESSORY_NO_SET_ID,
  FONT_SIZE_DISPLAY_REM,
  FONT_SIZE_HEADER_META_PX,
  FONT_SIZE_BASE_PX,
  GEAR_DB_DIFF_HISTORY_MAX_ITEMS,
  GEAR_DB_DIFF_HISTORY_MAX_UPDATES,
  GEAR_DB_DIFF_TOAST_MAX_ITEMS,
  GEAR_DB_DIFF_TOAST_SINGLE_SIDED_MAX_ITEMS,
  SELECTION_SCROLL_SOURCE_SELECT_RULE,
  SELECTION_SCROLL_SOURCE_USER,
  type SelectionScrollRequest,
  type SelectionScrollSource,
} from './lib/constants'
import { buildPreviewArtifactFromGearInspectorItem } from './lib/gearInspectorPreviewArtifacts'
import { clampProgressRatio, type ProgressSnapshot } from './types/progress'

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Button, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { alpha } from '@mui/material/styles'
import SettingsIcon from '@mui/icons-material/Settings'

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
import BuilderPanel, { createFactoryBuilderDefaults } from './components/RecipeBuilderPanel'
import CopyDialog from './components/CopyDialog'
import PasteDialog from './components/PasteDialog'
// Markdown preview for SFR Note (read-only). Requires installation:
//   npm i @uiw/react-md-editor rehype-sanitize @uiw/react-markdown-preview
// Styles are imported globally here.
// If the deps are missing, the app will fail to compile; install them as above.
import NoteDialog from './components/NoteDialog'
import { useManageColorsDialog } from './hooks/useManageColorsDialog'
import {
  computeMergedRules,
  buildRulesForRecipe,
  RULE_SOURCE_FINAL_SELL,
  RULE_SOURCE_HSF,
  RULE_SOURCE_SAFEGUARDS,
} from './lib/merge'
import { getRuleRecipeIndex, resolveMatchRecipeName } from './lib/ruleRecipeIndex'
import {
  type SafeguardDetectionSnapshot,
  type SafeguardRule,
  resolveSafeguardRulesWithMetasets,
  getSafeguardItemKey,
  resolveSafeguardRuleLabel,
  buildSafeguardCombinationFromRecipe,
  createSafeguardRuleId,
  cloneSafeguardRule,
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SAFEGUARD_DEFAULT_BEAT_EQUIPPED_PERCENTILE,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
  SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  normalizeSafeguardRule,
} from './lib/safeguards'
import { updateRecipeRulesCache } from './lib/ruleCache'
import { hasRecipeMeaningfulDifferences } from './lib/recipeDiff'
import { buildGearInspectorAutosavePayload, createGearInspectorMath, loadGearInspectorAutosaveDraft, type GearInspectorItem } from './lib/gearInspectorSession'
import { stableSerialize } from './lib/stableSerialize'
import {
  buildGearDbDiffSummary,
  encodeGearDbDiffToastEntries,
  formatGearDbDiffHistoryLines,
  isGearDbDatasetMatchingSnapshotCache,
  snapshotGearDbDataset,
  type GearArtifactSnapshot,
  type GearDbDiffEntry,
  type GearDbDiffHistoryEntry,
  type GearDbDiffHistoryLineSpec,
  type GearDbDiffToastEntry,
  type GearDbDiffToastPayload,
} from './lib/gearDbDiffToast'
import { isGearInspectorSyntheticSortKey, sortGearInspectorRows } from './lib/gearInspectorSort'
import { buildGearInspectorRuleTemplateRecipe } from './lib/gearInspectorRuleTemplates'
import { buildGearInspectorOutcomeSummary } from './lib/gearInspectorOutcomeSummary'
import { isDefaultGearInspectorSubstatSortState, setGearInspectorSubstatSortState, useGearInspectorSubstatSortPreferences } from './state/gearInspectorSubstatSortPreferences'
import { useGearInspectorGridNormalizedOverlayPreferences } from './state/gearInspectorGridNormalizedOverlayPreferences'
import { FILTER_PRESETS_VERSION, useFilterPresetsPreference, type FilterPreset, type FilterPresetSnapshot } from './state/filterPresetsPreference'
import FileDragOverlay from './components/FileDragOverlay'
import { BuilderColumn } from './components/AppLayout/BuilderColumn'
import SafeguardBuilderPanel from './components/SafeguardBuilderPanel'
import SafeguardChipsPanel from './components/SafeguardChipsPanel'
import { useFileDragDrop, routeFileByExtension, type FileRouteContext } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import { GearDbDiffToast } from './components/GearDbDiffToast'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import LogicHubDialog from './components/dialogs/LogicHubDialog'
import HelpDialog from './components/HelpDialog'
import MarkdownTooltip from './components/MarkdownTooltip'
import EllipsisTooltip from './components/EllipsisTooltip'
import { TutorialCoach } from './components/tutorial/TutorialCoach'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import MetasetConflictDialog from './components/dialogs/MetasetConflictDialog'
import FileFormatErrorDialog from './components/dialogs/FileFormatErrorDialog'
import SfrImportOptionsDialog, { type SfrImportModes, type SfrImportSelection } from './components/dialogs/SfrImportOptionsDialog'
import { useAutosave } from './hooks/useAutosave'
import { useNonUrgentStateDispatch } from './hooks/useNonUrgentStateDispatch'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import RulesFilterPanel, { type RulesFilterPanelHandle } from './components/RulesFilterPanel'
import { GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT, type GearInspectorRecipeFilterMode } from './types/gearInspectorRecipeFilterMode'
import { artifactTypeI18nKey, getAllKnownArtifactSetIds, type RankValue, type StatVariant } from './lib/types'
import { formatGearInspectorSetLabel } from './lib/gearInspectorFormatters'
import { DEFAULT_RULES_FILTER_STATE, filterHsfRules, filterGearInspectorItems, isRulesFilterActive, normalizeRulesFilterForGearInspector, type FilterHsfRulesResult, type RulesFilterState } from './lib/rulesFilter'
import {
  useAutosaveRestore,
  metasetsEqualSession,
  substatTargetsSignature,
  areAutosaveFiltersDefault,
  areFilterContentsDefault,
  type AutosaveFilterView,
} from './hooks/useAutosaveRestore'
import { makeManageColorsIcon } from './lib/icons'
import type { ChampionLocation } from './lib/importers/gearDbNormalizer'
const GEAR_INSPECTOR_MATCH_RESET_TIMEOUT_MS = 1500
// Endpoint push processing polls until worker + preview pipelines settle.
const ENDPOINT_PUSH_SETTLE_POLL_MS = 16
// Hard timeout keeps a wedged pipeline from blocking endpoint traffic forever.
const ENDPOINT_PUSH_SETTLE_TIMEOUT_MS = 15000
type HsfRuleWithRecipe = ReturnType<typeof computeMergedRules>[number]
// Keep the chip spinner visible with at least a whisper of progress so the pulse animation can show.
const WORKLOAD_PENDING_MIN_RATIO = 0.02 as const
// Hold the spinner a touch longer so sequential builders do not flicker off between phases.
const WORKLOAD_SPINNER_HANG_MS = 450 as const
// Coalesce rapid edits so we do not restart the pipeline for every keystroke/reorder.
const PIPELINE_DEBOUNCE_MS = 200 as const
// Stable empty metaset snapshot lets filter memos avoid recomputing on metaset edits
// when the current filters do not reference any metaset ids.
const EMPTY_METASETS: Metaset[] = []

// Centralize AbortError checks so every pipeline catch path applies the same rules.
// We treat browser DOMException and plain `{ name: "AbortError" }` objects equally.
// The worker can emit either shape depending on runtime and transport boundaries.
function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const maybe = error as { name?: unknown }
  if (typeof maybe.name === 'string' && maybe.name === 'AbortError') return true
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return error.name === 'AbortError'
  return false
}

// WebSocket endpoints may still host HTTP downloads; map ws(s) -> http(s).
import { sellfileFilename, sfrFilename } from './lib/filenames'
import { README_SEEN_VERSION_KEY, RULE_COUNT_LIMIT, SAFEGUARD_BUILDER_USER_DEFAULTS_KEY } from './lib/constants'
import { DEFAULT_METASET_ICON_ID } from './lib/metasetIcons'
import { cloneMetaset, defaultMetasets, type Metaset } from './lib/metasets'
import { normalizeArtifactSetSelections, splitArtifactSetSelections, type ArtifactSetSelectionEntry } from './lib/gearSets/selection'
import { generateMetasetNameWithFlag } from './lib/namegen'
import { useDisplayPreferences, useDisplayPreferenceActions } from './state/preferencesState'
import {
  useAutoApplySelectedRecipePreference,
  useBuilderRecipeCollapsedPreference,
  useBuilderSafeguardCollapsedPreference,
  resetBuilderCollapsedPreferences,
  setBuilderRecipeCollapsed,
  setBuilderSafeguardCollapsed,
} from './state/builderPreferences'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/recipeDuplicates'
import { recipesForRuleBuild } from './lib/ruleCacheHelpers'
import { evaluateFirst } from './lib/ruleEval'
import { importGearDatabaseFromFile } from './lib/importers/gearDbImporter'
import {
  buildArtifactRevisionMap,
  createDatasetFromSnapshot,
  type GearDbRawDataset,
} from './lib/importers/gearDbRawDataset'
import type {
  GearDbArtifactRow,
  GearDbChampionRow,
  GearDbLastUsedRow,
  NormalizedGearArtifact,
} from './lib/importers/gearDbNormalizer'
import { GearInspectorItemsGrid } from './components/GearInspectorItemsGrid'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from './types/gearInspectorPreview'
import type { GearInspectorMatchWorkerItemResult } from './workers/gearInspectorMatchWorkerTypes'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS,
  LOGIC_HUB_DIALOG_TAB_GEAR,
  LOGIC_HUB_DIALOG_TABS,
} from './lib/logicHub'
import type { FinalSellRemainderConfig, FinalSellLevel, LogicHubDialogTab } from './lib/logicHub'
import { useRecipeSelection } from './hooks/useRecipeSelection'
import { useSafeguardSelection } from './hooks/useSafeguardSelection'
import { useRuleCacheWorker } from './hooks/useRuleCacheWorker'
import { useGearInspectorItemsActions } from './hooks/useGearInspectorItemsActions'
import {
  resolveArtifactItemIdWithFallback,
} from './lib/itemIdentity'
// Local tag for Gear Inspector reset triggers; persists only in memory.
// Endpoint pushes get their own reason so the Gear Inspector grid can stay interactive.
type GearInspectorMatchResetReason = 'restore' | 'sfr' | 'gearDbManual' | 'gearDbEndpoint'
import { getRecipeHoverIndex, setRecipeHoverIndex, subscribeRecipeHover } from './lib/recipeHoverBridge'
import { useBuilderPreviewLayout } from './hooks/useBuilderPreviewLayout'
import { getDirtyBuilderFieldKeys, cloneBuilderRecipe } from './lib/recipeMultiEditDraft'
import { useTooltipScrollGuard } from './hooks/useTooltipScrollGuard'
import { useModalCleanup } from './hooks/useModalCleanup'
import { useTutorialCoachState } from './hooks/useTutorialCoachState'
import { useExternalCommands } from './hooks/useExternalCommands'
import { useSfrClipboard, type PendingImport } from './hooks/useSfrClipboard'
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
import { useSfrDialogs } from './hooks/useSfrDialogs'
import { useSfrHistoryController } from './hooks/useSfrHistoryController'
import type { HistoryEntryDescriptor, DescribeNextChangeFn } from './hooks/useSfrHistory'
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
import { createSfrLoadedDescriptor, createAutosaveRestoredDescriptor, makeClipboardSourceDescriptor } from './history/bulkLoadDescriptors'
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
import {
  collectMetasetIds,
  collectRecipeMetasetIds,
  collectSafeguardMetasetIds,
  getMetasetDependencyIssues,
} from './lib/sfrImportSelection'

// Components are organized under src/components

import type { ColorBlindMode } from './lib/constants'

const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

const NO_AUTO_APPLY: () => boolean = () => false

const DEFAULT_GEAR_DB_FILENAME = 'RslHelper.db'

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


// One-shot signal for scrolling Gear Inspector to a specific artifact card.
// Token increments allow repeated jumps to the same artifact id.
type GearInspectorArtifactFocusRequest = {
  artifactId: number
  token: number
}
// Tag Gear Inspector rebuild origin so endpoint pushes can keep card interactions alive.
type GearInspectorBuildOrigin = 'user' | 'endpoint'

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
    sfrNote,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
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
    setSfrNote,
    setNoteRecipeOverridesAnswers,
    setNoteRecipeOverridesDisabled,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
  } = useAppActions()
  const [safeguardsGridFilterMode, setSafeguardsGridFilterMode] = useSafeguardsGridFilterMode()
  const { runPipeline, flush: flushRuleCache, countRules } = useRuleCacheWorker()
  // These toggles now drive in-app rule transforms, not export-only behavior.
  const [dedupeDefault, setDedupeDefault] = useSellfileDedupPreference()
  const [omitDisabledForExport, setOmitDisabledForExport] = useSellfileOmitDisabledPreference()
  const { statButtonBorders } = useDisplayPreferences()
  const [autoApplySelectedRecipe] = useAutoApplySelectedRecipePreference()
  // Builder section collapse state — read here so the autosave memo can include it.
  // Both panel hooks share the same underlying stores, so updates from the panels are
  // immediately visible here and vice-versa (imperative reset/restore also updates the panels).
  const [builderRecipeCollapsed] = useBuilderRecipeCollapsedPreference()
  const [builderSafeguardCollapsed] = useBuilderSafeguardCollapsedPreference()
  const { setStatButtonBorders } = useDisplayPreferenceActions()
  // Normalize the note text so recipe overrides parsing never sees null.
  const recipeOverridesNoteText = (!noteRecipeOverridesDisabled && typeof sfrNote === 'string') ? sfrNote : ''
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
  // Apply recipe overrides for preview consumers (rules + note chips) without mutating SFR recipes.
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
  const metasetsForPreview = useDeferredValue(metasets)
  const recipeNamesForPreview = useDeferredValue(recipeNames)
  // Keep Gear Inspector math reusable so seeding hooks share the same normalization as the dialog.
  const gearInspectorMath = useMemo(() => createGearInspectorMath(effectiveSubstatTargets), [effectiveSubstatTargets])
  const lastRecipeNamesRef = useRef<string[]>(recipeNamesForPreview)
  const gearInspectorItemIdRef = useRef(1)
  const allocGearInspectorItemId = useCallback(() => {
    const id = gearInspectorItemIdRef.current
    gearInspectorItemIdRef.current += 1
    return id
  }, [])
  // Raw JSON endpoints stream their own dataset; keep the normalized snapshot
  // cached so deltas can mutate it without rebuilding from SQL blobs.
  const gearDbRawDatasetRef = useRef<GearDbRawDataset | null>(null)
  // Persists the artifact id → revision map from the last successfully applied push.
  // Compared against the incoming push to find the changed subset before snapshotting,
  // so unchanged artifacts skip the deep stat clone entirely.
  const gearDbRevisionMapRef = useRef<Map<number, number>>(new Map())
  // Snapshot map produced at the end of the last successful binary (SQLite) command import.
  // Reused as the "before" baseline for the next push and compared against the new import
  // via isGearDbDatasetMatchingSnapshotCache to skip all stat cloning when only non-tracked
  // fields (e.g. LastUse timestamps) changed — the most common case during active farming.
  const gearDbBinarySnapshotCacheRef = useRef<Map<number, GearArtifactSnapshot> | null>(null)
  // Accumulator for the separate per-type messages (artifacts/champions/inboxArtifacts/lastUsed).
  // Each arrival synthesizes a snapshot immediately so partial updates are never dropped.
  const gearDbRawPartsRef = useRef<{
    artifacts: GearDbArtifactRow[] | null
    inboxArtifacts: GearDbArtifactRow[] | null
    champions: GearDbChampionRow[] | null
    lastUsed: GearDbLastUsedRow[] | null
  }>({ artifacts: null, inboxArtifacts: null, champions: null, lastUsed: null })
  const [gearInspectorItems, setGearInspectorItems] = useState<GearInspectorItem[]>([])
  const gearInspectorItemsRef = useRef(gearInspectorItems)
  useEffect(() => { gearInspectorItemsRef.current = gearInspectorItems }, [gearInspectorItems])
  const [gearInspectorRestoreDraft, setGearInspectorRestoreDraft] = useState<{
    items: GearInspectorItem[]
    savedAt: string | null
    count: number
  } | null>(() => {
    const draft = loadGearInspectorAutosaveDraft({ math: gearInspectorMath, allocItemId: allocGearInspectorItemId })
    if (!draft) return null
    return { items: draft.items, savedAt: draft.savedAt, count: draft.itemCount }
  })
  // Gear Inspector champion filters reuse the same metadata as the Gear Inspector grid to keep icons/borders in sync.
  type GearInspectorChampionOption = {
    id: number
    baseId: number | null
    rarity: RankValue | null
    name: string | null
    location: ChampionLocation | null
    count: number
  }
  // Keep the initial Gear Inspector item array reference as a cheap "changed since load" baseline.
  const gearInspectorAutosaveBaselineRef = useRef<GearInspectorItem[] | null>(null)
  // Store latest Gear Inspector items for lazy autosave payload generation.
  const gearInspectorAutosaveItemsRef = useRef<GearInspectorItem[]>(gearInspectorItems)
  useEffect(() => {
    gearInspectorAutosaveItemsRef.current = gearInspectorItems
  }, [gearInspectorItems])
  const gearInspectorPreviewArtifacts = useMemo<NormalizedGearArtifact[]>(() => {
    const next: NormalizedGearArtifact[] = []
    gearInspectorItems.forEach((item, idx) => {
      try {
        const artifact = buildPreviewArtifactFromGearInspectorItem(item, {
          fallbackId: Number.isFinite(item.itemId) ? -Math.abs(item.itemId) : undefined,
          subOrder: item.subOrder,
        })
        next.push(artifact)
      } catch {
        void idx
      }
    })
    return next
  }, [gearInspectorItems])
  const getArtifactItemId = useCallback((artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
    // Share one resolver with worker/cache logic so key precedence cannot drift.
    return resolveArtifactItemIdWithFallback(artifact, fallbackIdx)
  }, [])
  const [gearInspectorPreviewRows, setGearInspectorPreviewRows] = useState<GearInspectorPreviewRow[]>([])
  const gearInspectorPreviewRowsRef = useRef<GearInspectorPreviewRow[]>([])
  useEffect(() => { gearInspectorPreviewRowsRef.current = gearInspectorPreviewRows }, [gearInspectorPreviewRows])
  const recoverMissingRulesRef = useRef(false)
  const gearInspectorMatchesByItemId = useMemo(() => {
    const map = new Map<number, GearInspectorPreviewMatch | null>()
    for (const row of gearInspectorPreviewRows) {
      const itemId = Number((row.artifact.gearInspectorItem as GearInspectorItem | undefined)?.itemId ?? NaN)
      if (Number.isFinite(itemId)) {
        map.set(itemId, row.match)
      }
    }
    return map
  }, [gearInspectorPreviewRows])
  // Summarize Gear Inspector outcomes so the preview header + note dialog share one chip.
  const gearInspectorOutcomeSummary = useMemo(
    () => buildGearInspectorOutcomeSummary(gearInspectorPreviewRows),
    [gearInspectorPreviewRows],
  )
  const [safeguardDetection, setSafeguardDetection] = useState<SafeguardDetectionSnapshot | null>(null)
  const resolvedSafeguardRules = useMemo(() => (
    resolveSafeguardRulesWithMetasets(safeguardRules, metasets)
  ), [safeguardRules, metasets])
  const safeguardsActive = safeguardsEnabled && resolvedSafeguardRules.length > 0
  const [gearEntriesBuilding, setGearEntriesBuilding] = useState(false)
  const [gearEntriesCommittedBuildId, setGearEntriesCommittedBuildId] = useState(0)
  const [gearEntriesActiveBuildId, setGearEntriesActiveBuildId] = useState(0)
  // Track which source initiated the active Gear Inspector build.
  const [activeGearInspectorBuildOrigin, setActiveGearInspectorBuildOrigin] = useState<GearInspectorBuildOrigin>('user')
  // Queue origin for the next pipeline launch (defaults to user interactions).
  const nextGearInspectorBuildOriginRef = useRef<GearInspectorBuildOrigin>('user')
  // Track Gear Inspector row progress separately so the preview chips can show determinate progress.
  const [gearEntriesProgress, setGearEntriesProgress] = useState<ProgressSnapshot | null>(null)
  const gearEntriesBuildingRef = useRef(gearEntriesBuilding)
  useEffect(() => { gearEntriesBuildingRef.current = gearEntriesBuilding }, [gearEntriesBuilding])
  const gearEntriesCommittedBuildIdRef = useRef(gearEntriesCommittedBuildId)
  useEffect(() => { gearEntriesCommittedBuildIdRef.current = gearEntriesCommittedBuildId }, [gearEntriesCommittedBuildId])
  // Mirror the active build id in a ref so beginGearInspectorMatchReset can read it
  // without closing over the state value — keeping the callback stable for the component lifetime.
  const gearEntriesActiveBuildIdRef = useRef(gearEntriesActiveBuildId)
  useEffect(() => { gearEntriesActiveBuildIdRef.current = gearEntriesActiveBuildId }, [gearEntriesActiveBuildId])
  const gearInspectorMatchResetRef = useRef<{ reason: GearInspectorMatchResetReason; targetBuildId: number; startedAt: number } | null>(null)
  const [gearInspectorMatchResetReason, setGearInspectorMatchResetReason] = useState<GearInspectorMatchResetReason | null>(null)
  // Ref-based setter so timer callbacks in the reset-check effect avoid the set-state-in-effect lint rule.
  const setGearInspectorMatchResetReasonRef = useRef(setGearInspectorMatchResetReason)
  useEffect(() => { setGearInspectorMatchResetReasonRef.current = setGearInspectorMatchResetReason }, [setGearInspectorMatchResetReason])
  const beginGearInspectorMatchReset = useCallback((reason: GearInspectorMatchResetReason) => {
    // Endpoint pushes should keep grid interactions available during rebuilds.
    nextGearInspectorBuildOriginRef.current = reason === 'gearDbEndpoint' ? 'endpoint' : 'user'
    // Read build ids from refs so this callback never re-creates when pipeline commits advance
    // state — a recreation would cascade through handleGearDbRawSnapshot → handleGearDbRawPart →
    // applyEndpointPushCommand → drainEndpointPushQueue → enqueueEndpointPush, causing stale
    // closures in the drain loop and unnecessary GC churn on every pipeline completion.
    const activeBuildId = gearEntriesActiveBuildIdRef.current
    const committedBuildId = gearEntriesCommittedBuildIdRef.current
    const targetBuildId = activeBuildId > committedBuildId ? activeBuildId : committedBuildId + 1
    gearInspectorMatchResetRef.current = {
      reason,
      targetBuildId,
      startedAt: Date.now(),
    }
    setGearInspectorMatchResetReason(reason)
  }, [])
  const gearInspectorMatchDetailsFrozen = Boolean(gearInspectorMatchResetReason)
  useEffect(() => {
    if (!gearInspectorMatchResetReason) return
    let pending = gearInspectorMatchResetRef.current
    if (!pending || pending.reason !== gearInspectorMatchResetReason) {
      if (!pending) setGearInspectorMatchResetReasonRef.current(null)
      return
    }
    if (gearEntriesActiveBuildId > pending.targetBuildId) {
      pending = {
        ...pending,
        targetBuildId: gearEntriesActiveBuildId,
      }
      gearInspectorMatchResetRef.current = pending
    }
    if (!gearEntriesBuilding && gearEntriesCommittedBuildId >= pending.targetBuildId) {
      gearInspectorMatchResetRef.current = null
      setGearInspectorMatchResetReasonRef.current(null)
      return
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const handleResetCheck = () => {
      const current = gearInspectorMatchResetRef.current
      if (!current || current.reason !== gearInspectorMatchResetReason) return
      if (gearEntriesBuildingRef.current) {
        timeoutId = setTimeout(handleResetCheck, GEAR_INSPECTOR_MATCH_RESET_TIMEOUT_MS)
        return
      }
      const committed = gearEntriesCommittedBuildIdRef.current
      if (committed >= current.targetBuildId) {
        gearInspectorMatchResetRef.current = null
        setGearInspectorMatchResetReasonRef.current(null)
        return
      }
      gearInspectorMatchResetRef.current = null
      setGearInspectorMatchResetReasonRef.current(null)
    }
    timeoutId = setTimeout(handleResetCheck, GEAR_INSPECTOR_MATCH_RESET_TIMEOUT_MS)
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId)
    }
  }, [gearInspectorMatchResetReason, gearEntriesCommittedBuildId, gearEntriesBuilding, gearEntriesActiveBuildId])
  const exportBaselineResetRef = useRef(false)
  const { forceSideBySide: forceSideBySideLayout } = useAutoSideBySideZoom()
  const {
    leftPaperRef,
    chipsContainerRef,
    chipsMaxHeight,
    chipsAvailableHeight,
    safeguardChipsContainerRef,
    safeguardChipsMaxHeight,
    previewPaperHeightStyle,
    sideBySideMinPaperHeightPx,
    isSideBySide,
    scheduleMeasurement,
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
      // Keep in-app transforms aligned with worker pipeline semantics.
      omitDisabledBeforeSafeguards: omitDisabledForExport,
      dedupeBeforeSafeguards: dedupeDefault,
    })
    const { baseRules, finalSellRules } = splitMergedRules(mergedRules)
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
  const [rulesBuilding, setRulesBuilding] = useState(false)
  const [rulesBuildProgress, setRulesBuildProgress] = useState<ProgressSnapshot | null>(null)
  // Shared spinner ratio merges both rule + Gear Inspector builders so the UI has a single busy signal.
  const [workloadProgressRatio, setWorkloadProgressRatio] = useState(0)
  // Ref-based setter so the spinner hang timeout avoids the set-state-in-effect lint rule.
  const setWorkloadProgressRatioRef = useRef(setWorkloadProgressRatio)
  useEffect(() => { setWorkloadProgressRatioRef.current = setWorkloadProgressRatio }, [setWorkloadProgressRatio])
  const workloadSpinnerHangTimeoutRef = useRef<number | null>(null)
  const rulesBuildingRef = useRef(rulesBuilding)
  useEffect(() => { rulesBuildingRef.current = rulesBuilding }, [rulesBuilding])
  const rulesWorkloadRatio = rulesBuilding ? clampProgressRatio(rulesBuildProgress) : 0
  const gearInspectorWorkloadRatio = gearEntriesBuilding ? clampProgressRatio(gearEntriesProgress) : 0
  const workloadDeterminateRatio = Math.max(rulesWorkloadRatio, gearInspectorWorkloadRatio)
  const workloadBusy = rulesBuilding || gearEntriesBuilding
  // Freeze recipe names to the last committed snapshot while rows build so displayed indices do not shift mid-run.
  const recipeNamesForGrid = useMemo(
    () => ((rulesBuilding || gearEntriesBuilding) ? lastRecipeNamesRef.current : recipeNamesForPreview),
    [rulesBuilding, gearEntriesBuilding, recipeNamesForPreview],
  )
  // Keep Gear Inspector chip labels in sync with the frozen recipe-name snapshot so chips never display mid-build indices.
  const gearInspectorRecipeNamesForGrid = useMemo(() => recipeNamesForGrid.map((name) => {
    if (typeof name !== 'string') return null
    const trimmed = name.trim()
    return trimmed.length > 0 ? trimmed : null
  }), [recipeNamesForGrid])
  // Preview mode is still tracked for UI layout, but pipeline matching is always computed.
  const [previewMode, setPreviewMode] = useState<'rules' | 'gearInspector'>(() => {
    if (typeof window === 'undefined') return 'rules'
    try {
      // Validate stored mode; unrecognized values fall back to 'rules'.
      const stored = localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)
      return stored === 'gearInspector' ? 'gearInspector' : 'rules'
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
  // Builder mode: 'recipe' | 'safeguard' — persisted to localStorage.
  const [builderMode, setBuilderMode] = useState<'recipe' | 'safeguard'>(() => {
    if (typeof window === 'undefined') return 'recipe'
    try {
      return localStorage.getItem(BUILDER_MODE_STORAGE_KEY) === 'safeguard' ? 'safeguard' : 'recipe'
    } catch {
      return 'recipe'
    }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(BUILDER_MODE_STORAGE_KEY, builderMode)
    } catch {}
  }, [builderMode])
  // Re-measure the builder Paper min-height whenever the mode switches.
  // The recipe chips ResizeObserver only fires when the chips container itself resizes;
  // hiding it (switching to safeguard mode) does not trigger a resize, so the stale
  // min-height from the taller panel stays applied until we force a fresh measurement.
  useEffect(() => {
    scheduleMeasurement()
  }, [builderMode, scheduleMeasurement])
  // Which safeguard rule is selected in the builder (transient — not persisted).
  const [selectedSafeguardRuleId, setSelectedSafeguardRuleId] = useState<string | null>(() => null)
  // External scroll request for SafeguardChipsPanel (e.g. Gear Inspector jump). Token increments on each new request.
  const [safeguardFocusRequest, setSafeguardFocusRequest] = useState<{ ruleId: string; token: number } | null>(null)
  const safeguardFocusTokenRef = useRef(0)

  // Safeguard builder draft — separate from safeguardRules list so edits stay local until
  // the user explicitly inserts or applies, mirroring the recipe builder's draft model.
  const [safeguardBuilderState, setSafeguardBuilderState] = useState<SafeguardRule>(() => ({
    id: createSafeguardRuleId(),
    combination: { slots: [], sets: [], metaSetIds: [], ranks: [], rarities: [], mainStats: [], factions: [] },
    name: '',
    requiredCount: 1,
    activation: SafeguardRuleActivation.ProtectExisting,
    countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
    ignorePreviousSafeguards: SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
    ignoreEquippedInCollection: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
    ignoreEquippedInVault: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
    beatEquippedPercentile: SAFEGUARD_DEFAULT_BEAT_EQUIPPED_PERCENTILE,
    substats: [],
    substatMatch: SafeguardSubstatMatch.Any,
    substatWeights: {},
  }))
  const safeguardBuilder = safeguardBuilderState
  const safeguardBuilderRef = React.useRef<SafeguardRule>(safeguardBuilderState)
  const setSafeguardBuilder = React.useCallback((next: React.SetStateAction<SafeguardRule>) => {
    setSafeguardBuilderState((prev) => {
      const resolved = typeof next === 'function' ? (next as (v: SafeguardRule) => SafeguardRule)(prev) : next
      safeguardBuilderRef.current = resolved
      return resolved
    })
  }, [])

  // Auto-apply handler for safeguard selection changes (mirrors recipe builder autoApplyNowRef).
  const safeguardAutoApplyNowRef = useRef<() => boolean>(NO_AUTO_APPLY)
  const registerSafeguardAutoApplyHandler = useCallback((fn: (() => boolean) | null) => {
    safeguardAutoApplyNowRef.current = fn ?? NO_AUTO_APPLY
  }, [])

  // Ref kept in sync with the visible-rule-ids set so shift-click in useSafeguardSelection
  // respects filters; declared early so it's stable across renders.
  const visibleSafeguardRuleIdsRef = useRef<ReadonlySet<string> | null>(null)

  // Shared metasets dialog opener registered by RecipeBuilderPanel; called by SafeguardBuilderPanel.
  const openMetasetsDialogRef = useRef<() => void>(() => {})
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
      setWorkloadProgressRatioRef.current(Math.max(workloadDeterminateRatio, WORKLOAD_PENDING_MIN_RATIO))
      return () => {
        clearHangTimeout()
      }
    }
    clearHangTimeout()
    workloadSpinnerHangTimeoutRef.current = window.setTimeout(() => {
      workloadSpinnerHangTimeoutRef.current = null
      setWorkloadProgressRatioRef.current(0)
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
    // Pipeline payloads use immediate state snapshots.
    // Why: deferred snapshots can emit follow-up renders for the same user click
    // and repeatedly restart the debounce window before dispatch.
    const recipesForBuild = recipesEnabled ? ruleRecipes : []
    // Keep recipe-name snapshots aligned with the same immediate payload so remaps stay deterministic.
    const recipeNamesForBuild = recipeNames
    // Recipe modes gate matcher behavior, so keep the same immediate snapshot as recipes/metasets.
    const recipeModesForBuild = recipeModes
    // Keep metasets/substat targets on the same immediate snapshot used for recipes.
    const metasetsForBuild = metasets
    const substatTargetsForBuild = effectiveSubstatTargets
    // Preview mode is a pure view toggle; pipeline work should not depend on it.
    // Keep matcher rows available regardless of which pane is currently visible.
    const includeMatchesInPipeline = true
    const launchPipeline = () => {
      // Consume queued origin once so later user edits fall back to interactive guards.
      const queuedBuildOrigin = nextGearInspectorBuildOriginRef.current
      nextGearInspectorBuildOriginRef.current = 'user'
      const requestToken = (rulesBuildingTokenRef.current ?? 0) + 1
      rulesBuildingTokenRef.current = requestToken
      const shouldTrackGearInspectorBuild = includeMatchesInPipeline || Boolean(gearInspectorMatchResetRef.current)
      if (shouldTrackGearInspectorBuild) setGearEntriesActiveBuildId(requestToken)
      // Build/progress toggles fan out through many memoized panels; transition them
      // so user input stays responsive while the worker pipeline spins up.
      startTransition(() => {
        setActiveGearInspectorBuildOrigin(queuedBuildOrigin)
        setRulesBuilding(true)
        setRulesBuildProgress(null)
        // Rules preview mode skips Gear Inspector rows, so avoid flipping build state/progress.
        if (includeMatchesInPipeline) {
          setGearEntriesBuilding(true)
          setGearEntriesProgress(null)
        } else {
          setGearEntriesBuilding(false)
        }
      })

      // Safeguards payload seeds the worker with the current rule set.
      const safeguardsPayload = {
        enabled: safeguardsEnabled && resolvedSafeguardRules.length > 0,
        rules: resolvedSafeguardRules,
        detection: null as SafeguardDetectionSnapshot | null,
      }
      const toPreviewMatch = (
        result: GearInspectorMatchWorkerItemResult['firstMatch'],
        rules: readonly HsfRuleWithRecipe[],
      ): GearInspectorPreviewMatch | null => {
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
        // Apply in-app transforms before safeguards in the worker pipeline.
        omitDisabledBeforeSafeguards: omitDisabledForExport,
        dedupeBeforeSafeguards: dedupeDefault,
        recipeModes: recipeModesForBuild,
        artifacts: gearInspectorPreviewArtifacts,
      }
      // Cancel the prior in-flight run only when dispatching a new payload.
      // Effect rerenders alone no longer abort active work.
      if (pipelineAbortRef.current) {
        pipelineAbortRef.current.abort()
        pipelineAbortRef.current = null
      }
      const abortController = new AbortController()
      pipelineAbortRef.current = abortController

      // One pipeline invocation per update after early fast paths.
      runPipeline(pipelinePayload, {
        signal: abortController.signal,
        onProgress: (progress) => {
          if (requestToken !== rulesBuildingTokenRef.current) return
          setRulesBuildProgress(progress)
          if (includeMatchesInPipeline) setGearEntriesProgress(progress)
        },
      })
        .then((result) => {
          const { state, matches, safeguardDetection } = result
          if (abortController.signal.aborted) {
            // Abort is expected control flow during rapid edit bursts.
            return
          }
          if (requestToken !== rulesBuildingTokenRef.current) return
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
          // Rule-table snapshots are large; transition the commit so input-heavy
          // dialogs keep handling clicks while preview state settles.
          startTransition(() => {
            setRecipeRulesState(snapshot)
          })
          if (includeMatchesInPipeline) {
            const matchMap = new Map<number, GearInspectorMatchWorkerItemResult>()
            for (const entry of matches) {
              if (!entry) continue
              matchMap.set(entry.itemId, entry)
            }
            const rows: GearInspectorPreviewRow[] = []
            const artifactEntries = gearInspectorPreviewArtifacts.map((artifact, idx) => [getArtifactItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
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
            // Gear Inspector row lists can be large; transition to avoid blocking edits.
            startTransition(() => {
              setGearInspectorPreviewRows(sortGearInspectorRows(rows))
            })
          }
          // Advance Gear Inspector build ids only when Gear Inspector rows were requested, or when a
          // pending reset wait explicitly needs a completion marker.
          if (includeMatchesInPipeline || gearInspectorMatchResetRef.current) {
            setGearEntriesCommittedBuildId(requestToken)
            setGearEntriesActiveBuildId(requestToken)
          }
          // Safeguard table snapshots are preview-only and can be deferred.
          startTransition(() => {
            setSafeguardDetection(safeguardDetection ?? null)
          })
          lastRecipeNamesRef.current = recipeNamesForBuild
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
                artifacts: gearInspectorPreviewArtifacts,
              },
              {
                signal: abortController.signal,
                onProgress: (progress) => {
                  if (requestToken !== rulesBuildingTokenRef.current) return
                  setRulesBuildProgress(progress)
                  if (includeMatchesInPipeline) setGearEntriesProgress(progress)
                },
              },
            )
              .then((retryResult) => {
                if (abortController.signal.aborted) {
                  // Retry aborts are still expected control flow during rapid edits.
                  // Non-abort failures still clear state in the retry catch below.
                  return
                }
                if (requestToken !== rulesBuildingTokenRef.current) return
                recoverMissingRulesRef.current = false
                // Re-run the success handler with the retried payload.
                const {
                  state: retryState,
                  matches: retryMatches,
                  safeguardDetection: retrySafeguardDetection,
                } = retryResult
                const splitRetry = splitMergedRules(retryState.mergedRules)
                // Retry snapshots are just as large; keep them out of the urgent lane.
                startTransition(() => {
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
                })
                if (includeMatchesInPipeline) {
                  const retryMap = new Map<number, GearInspectorMatchWorkerItemResult>()
                  for (const entry of retryMatches) retryMap.set(entry.itemId, entry)
                  const retryRows: GearInspectorPreviewRow[] = []
                  const entries = gearInspectorPreviewArtifacts.map((artifact, idx) => [getArtifactItemId(artifact, idx), artifact] as [number, NormalizedGearArtifact])
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
                  // Retry Gear Inspector rows can be large; schedule as non-urgent UI work.
                  startTransition(() => {
                    setGearInspectorPreviewRows(sortGearInspectorRows(retryRows))
                  })
                }
                if (includeMatchesInPipeline || gearInspectorMatchResetRef.current) {
                  setGearEntriesCommittedBuildId(requestToken)
                  setGearEntriesActiveBuildId(requestToken)
                }
                // Safeguard previews are informative, not input-critical.
                startTransition(() => {
                  setSafeguardDetection(retrySafeguardDetection ?? null)
                })
                lastRecipeNamesRef.current = recipeNamesForBuild
              })
              .catch((error: unknown) => {
                if (isAbortError(error)) return
              })
            return
          }
          recoverMissingRulesRef.current = false
        })
        .catch((error: unknown) => {
          if (isAbortError(error)) return
        })
        .finally(() => {
          if (requestToken !== rulesBuildingTokenRef.current) return
          // Clear active request markers once the latest pipeline settles.
          if (pipelineAbortRef.current === abortController) pipelineAbortRef.current = null
          // Completion toggles are UI-only and can be deferred behind user input.
          startTransition(() => {
            setRulesBuilding(false)
            setGearEntriesBuilding(false)
            setRulesBuildProgress(null)
            setGearEntriesProgress(null)
          })
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
    }
  }, [
    runPipeline,
    ruleRecipes,
    recipeNames,
    metasets,
    effectiveSubstatTargets,
    hsf,
    finalSellRemainder,
    omitDisabledForExport,
    dedupeDefault,
    safeguardsEnabled,
    resolvedSafeguardRules,
    recipeModes,
    recipesEnabled,
    gearInspectorPreviewArtifacts,
    getArtifactItemId,
  ])
  useEffect(() => {
    return () => {
      // Component teardown must cancel timers and active worker requests.
      if (pipelineDebounceRef.current !== null) {
        window.clearTimeout(pipelineDebounceRef.current)
        pipelineDebounceRef.current = null
      }
      if (pipelineAbortRef.current) {
        pipelineAbortRef.current.abort()
        pipelineAbortRef.current = null
      }
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
  const [logicHubOpen, setLogicHubOpen] = useState<boolean>(false)
  // substatTargetsDialogOpen is true when the Tools dialog is open on the Substat Targets tab.
  // This drives history coalescing so all edits within one "session" become a single undo entry.
  const substatTargetsDialogOpen = logicHubOpen && logicHubDialogTab === LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS
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
  // Render-time state adjustment: refresh persisted count when the catalog version changes.
  const [prevGearSetCatalogVersion, setPrevGearSetCatalogVersion] = useState(gearSetCatalogVersion)
  if (gearSetCatalogVersion !== prevGearSetCatalogVersion) {
    setPrevGearSetCatalogVersion(gearSetCatalogVersion)
    setStoredRuntimeGearSetCount(getPersistedRuntimeGearSetCount())
  }
  const persistRuntimeGearSetsNow = useCallback(() => {
    // Persist the *current in-memory* runtime registry to localStorage.
    // Why: this is the only time we mutate storage after a restore decision.
    persistRuntimeGearSetsSnapshot()
    // Mirror the new persisted count so the next restore prompt stays accurate.
    setStoredRuntimeGearSetCount(listRuntimeGearSets().length)
  }, [])
  const gearInspectorFinalSellLabel = t('testerFinalSellChip')
  const specialRuleSourceLabels = useMemo(() => {
    const trimmed = gearInspectorFinalSellLabel.trim()
    return trimmed.length > 0
      ? { [RULE_SOURCE_FINAL_SELL]: [trimmed] }
      : {}
  }, [gearInspectorFinalSellLabel])
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
    updateSelectionAnchor,
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
  // Danger-tint state for safeguard chips (mirrors recipes pattern).
  const [hoverDeleteSafeguards, setHoverDeleteSafeguards] = useState(false)
  const safeguardDeleteAllDisabled = safeguardRules.length === 0
  const highlightDeleteSafeguards = hoverDeleteSafeguards && !safeguardDeleteAllDisabled
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
      updateSelectionAnchor(normalized)
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
  }, [autoApplyNowRef, multiselectActive, selectedRecipeIdx, runWithSelectionDraftSuppressed, setSelectedRecipeIdxRaw, setSelectedRecipeIndices, updateSelectionAnchor])
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
  // Reset substatTargets history snapshots when the dialog closes — render-time comparison pattern.
  const [prevSubstatTargetsDialogOpen, setPrevSubstatTargetsDialogOpen] = useState(substatTargetsDialogOpen)
  if (substatTargetsDialogOpen !== prevSubstatTargetsDialogOpen) {
    setPrevSubstatTargetsDialogOpen(substatTargetsDialogOpen)
    if (!substatTargetsDialogOpen) {
      substatTargetsHistorySessionRef.current = 'idle'
      substatTargetsSessionBaselineRef.current = null
      substatTargetsSessionModeRef.current = null
    }
  }
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
  } = useSfrHistoryController({
    customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    sfrNote,
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
    setRecipesEnabled,
    setSfrNote,
    setSelectedRecipeIdx: setSelectedRecipeIdxRaw,
    setSelectedRecipeIndices,
    setSelectionAnchor: updateSelectionAnchor,
    setBuilder,
    setBuilderNameDraft: () => {},
    setBuilderNameDraftKey: () => {},
    setMultiEditDraft: setMultiEditDraftState,
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
    autoApplySelectedRecipe,
  })
  describeNextChangeRef.current = describeNextChange
  // Use one SSOT transition wrapper for heavy tab/dialog writes so every pathway
  // (builder, minima, safeguards, final-sell, gear) shares the same scheduling behavior.
  const setCustomRecipesTransition = useNonUrgentStateDispatch(setCustomRecipes)
  const setMetasetsTransition = useNonUrgentStateDispatch(setMetasets)
  const setSubstatTargetsTransition = useNonUrgentStateDispatch(setSubstatTargets)
  const setFinalSellRemainderTransition = useNonUrgentStateDispatch(setFinalSellRemainder)
  const setSafeguardRulesTransition = useNonUrgentStateDispatch(setSafeguardRules)
  const setSafeguardsEnabledTransition = useNonUrgentStateDispatch(setSafeguardsEnabled)
  const setRecipesEnabledTransition = useNonUrgentStateDispatch(setRecipesEnabled)
  const setGearInspectorItemsTransition = useNonUrgentStateDispatch(setGearInspectorItems)
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
    setCustomRecipesTransition(next)
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
  }, [describeNextChange, selectedRecipeIdx, setBuilder, setCustomRecipesTransition])

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
    // Minima dialog edits are non-urgent relative to click/typing responsiveness.
    setSubstatTargetsTransition(next)
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
  }, [describeNextChange, setSubstatTargetsTransition, substatTargets, substatTargetsDialogOpen])
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
        // Preserve current behavior while scheduling the heavy rebuild as non-urgent.
        setFinalSellRemainderTransition(resolvedNextState)
      }
      return null
    }
    // Final Sell toggles can invalidate many rows/rules; transition this commit.
    setFinalSellRemainderTransition(resolvedNextState)
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
  }, [describeNextChange, setFinalSellRemainderTransition])
  const applySafeguardsEnabledChange = useCallback((
    value: React.SetStateAction<boolean>,
    options?: { publish?: boolean },
  ): void => {
    // Keep the toggle change labeled so history never falls back to unnamed snapshots.
    // Toggle updates can trigger detection/matcher pipelines; schedule non-urgent.
    setSafeguardsEnabledTransition((prev) => {
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
  }, [describeNextChange, safeguardRules, setSafeguardsEnabledTransition])
  const applyRecipesEnabledChange = useCallback((
    value: React.SetStateAction<boolean>,
    options?: { publish?: boolean },
  ): void => {
    setRecipesEnabledTransition((prev) => {
      const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value
      if (prev === next) return prev
      if (options?.publish === false) return next
      describeNextChange({ kind: 'recipesEnabledChange', previousEnabled: prev, nextEnabled: next })
      return next
    })
  }, [describeNextChange, setRecipesEnabledTransition])
  const applySafeguardRulesChange = useCallback((
    value: React.SetStateAction<SafeguardRule[]>,
    options?: { mode?: 'edit' | 'reset'; publish?: boolean },
  ): void => {
    // Snapshot safeguard rules with structured tooltip lines for history.
    // Safeguards-tab edits often rewrite many rows; keep them in transition lane.
    setSafeguardRulesTransition((prev) => {
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
  }, [describeNextChange, metasets, setSafeguardRulesTransition])

  // ── safeguard multi-select / multi-edit (mirrors useRecipeSelection wiring) ─
  // Auto-apply the current draft before any selection change, just like the recipe builder.
  const handleSafeguardWillChangeSelection = useCallback(() => {
    safeguardAutoApplyNowRef.current()
  }, [])
  const {
    selectedRuleIds: selectedSafeguardRuleIds,
    multiselectActive: safeguardMultiselectActive,
    multiSelectedRules: multiSelectedSafeguardRules,
    multiEditHandle: safeguardMultiEditHandle,
    applyMultiEditDraft: applySafeguardMultiEditDraft,
    handleRuleSelect: handleSafeguardRuleSelect,
    handleRuleDelete: handleSafeguardRuleDelete,
    handleRuleDuplicate: handleSafeguardRuleDuplicate,
    handleRuleMoveUp: handleSafeguardRuleMoveUp,
    handleRuleMoveDown: handleSafeguardRuleMoveDown,
    handleRuleMoveTop: handleSafeguardRuleMoveTop,
    handleRuleMoveBottom: handleSafeguardRuleMoveBottom,
    handleSelectAllRules: handleSelectAllSafeguardRules,
    handleClearSelection: handleClearSafeguardSelection,
    handleDeleteSelected: handleSafeguardDeleteSelected,
    prepareDragSelection: prepareSafeguardDragSelection,
    handleRuleReorder: handleSafeguardRuleReorder,
  } = useSafeguardSelection({
    safeguardRules,
    applySafeguardRulesChange,
    selectedRuleId: selectedSafeguardRuleId,
    setSelectedRuleId: setSelectedSafeguardRuleId,
    onWillChangeSelection: handleSafeguardWillChangeSelection,
    onSelectionScrollRequest: (ruleId) => {
      safeguardFocusTokenRef.current += 1
      setSafeguardFocusRequest({ ruleId, token: safeguardFocusTokenRef.current })
    },
    visibleRuleIdsRef: visibleSafeguardRuleIdsRef,
    setSafeguardBuilder,
  })

  // Insert the draft as a new rule after the currently selected rule (or at end).
  // Auto-reset-after-insert is applied by SafeguardBuilderPanel after calling this.
  const handleInsertSafeguardFromBuilder = useCallback(() => {
    const current = safeguardBuilderRef.current
    const newId = createSafeguardRuleId()
    const newRule: SafeguardRule = { ...cloneSafeguardRule(current), id: newId }
    applySafeguardRulesChange((prev) => {
      const idx = selectedSafeguardRuleId !== null ? prev.findIndex((r) => r.id === selectedSafeguardRuleId) : -1
      if (idx === -1) return [...prev, newRule]
      const next = [...prev]
      next.splice(idx + 1, 0, newRule)
      return next
    })
    // Auto-enable safeguards when the first rule is inserted (mirrors old SafeguardsTab behaviour).
    if (safeguardRules.length === 0) applySafeguardsEnabledChange(true, { publish: false })
    setSelectedSafeguardRuleId(newId)
  }, [applySafeguardRulesChange, applySafeguardsEnabledChange, safeguardRules.length, selectedSafeguardRuleId])

  // Apply the draft to the currently selected rule.
  const handleApplySafeguardFromBuilder = useCallback(() => {
    if (selectedSafeguardRuleId === null) return
    const current = safeguardBuilderRef.current
    const updated: SafeguardRule = { ...cloneSafeguardRule(current), id: selectedSafeguardRuleId }
    applySafeguardRulesChange((prev) => prev.map((r) => (r.id === selectedSafeguardRuleId ? updated : r)))
  }, [applySafeguardRulesChange, selectedSafeguardRuleId])

  // Reset the builder draft to effective defaults: user-saved defaults if present, factory otherwise.
  const handleResetSafeguardBuilder = useCallback(() => {
    const factory = createFactorySafeguardBuilderDefaults()
    let effectiveDefaults = factory
    try {
      const raw = localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        // Validate via normalizeSafeguardRule, then strip the generated id.
        const normalized = normalizeSafeguardRule(JSON.parse(raw))
        if (normalized) {
          const { id: _id, ...rest } = normalized
          effectiveDefaults = { ...factory, ...rest }
        }
      }
    } catch {}
    setSafeguardBuilder({ id: createSafeguardRuleId(), ...effectiveDefaults })
  }, [setSafeguardBuilder])

  // Select a rule chip: auto-apply the current draft, then load the new rule into the draft.
  const handleSelectSafeguardRule = useCallback((ruleId: string) => {
    safeguardAutoApplyNowRef.current()
    setSelectedSafeguardRuleId(ruleId)
    const rule = safeguardRules.find((r) => r.id === ruleId)
    if (rule) setSafeguardBuilder(cloneSafeguardRule(rule))
  }, [safeguardRules, setSafeguardBuilder])

  // Shared helper: build a scaffolded SafeguardRule from a recipe without touching state.
  // Uses safeguardBuilderRef.current as the base so id/countMode/etc. are preserved.
  const buildScaffoldedSafeguardFromRecipe = useCallback((recipeIndex: number): SafeguardRule | null => {
    const recipe = customRecipes[recipeIndex]
    if (!recipe || recipe.exportMode === 'separator') return null
    const combination = buildSafeguardCombinationFromRecipe(recipe)
    const rawName = parseRecipeNameDirectives(recipe.name, '').displayName.trim()
    const safeguardName = `Protect: ${rawName || `Recipe ${recipeIndex + 1}`}`
    return {
      ...cloneSafeguardRule(safeguardBuilderRef.current),
      name: safeguardName,
      combination,
      requiredCount: 2,
      activation: SafeguardRuleActivation.AnticipateGaps,
      substats: [...(recipe.substatsV ?? [])],
      substatMatch: SafeguardSubstatMatch.Any,
      substatWeights: {},
    }
  }, [customRecipes])

  // Scaffold the builder draft from a recipe (loads into draft; user then inserts or applies manually).
  const handleScaffoldSafeguardFromRecipe = useCallback((recipeIndex: number) => {
    const scaffolded = buildScaffoldedSafeguardFromRecipe(recipeIndex)
    if (!scaffolded) return
    setSafeguardBuilder(scaffolded)
    if (builderMode !== 'safeguard') setBuilderMode('safeguard')
  }, [buildScaffoldedSafeguardFromRecipe, setSafeguardBuilder, builderMode])

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
      window.removeEventListener('contextmenu', onCtx, { capture: true })
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
      // Append the new entry first, then trim from the front.
      ...prev,
      {
        id: nextId,
        createdAt: params.createdAt,
        lineSpecs: params.lineSpecs,
        // Store a compact payload; decode only when a history preview is shown.
        compactEntries: encodeGearDbDiffToastEntries(params.entries),
        overflowCount: params.overflowCount,
      },
    ].slice(-GEAR_DB_DIFF_HISTORY_MAX_UPDATES)))
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
    // Build id used to detect when the Gear Inspector grid has updated.
    baselineBuildId: number
    // Timestamp captured when the update was queued.
    queuedAt: number
    // Structured header specs so history stays localizable.
    lineSpecs: GearDbDiffHistoryLineSpec[]
    // Shared retained diff entries (newest-window capped once for all surfaces).
    retainedEntries: GearDbDiffEntry[]
    // Number of retained entries to expose in the history surface.
    historyCount: number
    // Count of omitted entries beyond the history surface cap.
    historyOverflowCount: number
    // Number of retained entries to expose in the toast surface.
    toastCount: number
    // Count of omitted entries beyond the toast surface cap.
    toastOverflowCount: number
    // Matches captured before applying the dataset update.
    matchesBefore: Map<number, GearInspectorPreviewMatch | null>
  } | null>(null)
  // Monotonic id used to cancel stale pending payloads.
  const gearDbDiffToastRequestIdRef = useRef(0)
  // Build a stable match map keyed by artifact id so before/after comparisons line up.
  const buildMatchMapByArtifactId = useCallback((rows: GearInspectorPreviewRow[]): Map<number, GearInspectorPreviewMatch | null> => {
    // Map rows by id so add/remove/update comparisons are stable.
    const map = new Map<number, GearInspectorPreviewMatch | null>()
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
    // Keep the newest artifacts when the diff exceeds the UI caps.
    // Higher artifact ids are newer, so sort descending for truncation.
    const newestFirstEntries = [...params.entries].sort((left, right) => right.id - left.id)
    // Side-by-side add/remove batches can show two columns, so allow a wider toast window.
    let singleSidedKind: 'added' | 'removed' | null = null
    if (newestFirstEntries.length > 0) {
      const firstKind = newestFirstEntries[0]?.kind ?? null
      if (firstKind === 'added' || firstKind === 'removed') {
        // Validate uniform kind in one pass; mixed kinds fall back to the default toast cap.
        let isUniformKind = true
        for (const entry of newestFirstEntries) {
          if (entry.kind !== firstKind) {
            isUniformKind = false
            break
          }
        }
        if (isUniformKind) singleSidedKind = firstKind
      }
    }
    // Toast stays compact so it does not dominate the preview header area.
    const toastMaxEntries = singleSidedKind
      ? GEAR_DB_DIFF_TOAST_SINGLE_SIDED_MAX_ITEMS
      : GEAR_DB_DIFF_TOAST_MAX_ITEMS
    // Keep one shared retained list so history/toast do not duplicate diff payloads.
    const retainedMaxEntries = Math.max(GEAR_DB_DIFF_HISTORY_MAX_ITEMS, toastMaxEntries)
    const newestRetainedEntries = newestFirstEntries.slice(0, retainedMaxEntries)
    // Keep the shared list in ascending order for stable visual scanning everywhere.
    const retainedEntries = newestRetainedEntries.sort((left, right) => left.id - right.id)
    // Surfaces consume tail slices from the shared list (tail = newest ids).
    const historyCount = Math.min(retainedEntries.length, GEAR_DB_DIFF_HISTORY_MAX_ITEMS)
    const toastCount = Math.min(retainedEntries.length, toastMaxEntries)
    // Overflow counts still measure against each surface cap.
    const historyOverflowCount = Math.max(0, params.entries.length - historyCount)
    const toastOverflowCount = Math.max(0, params.entries.length - toastCount)
    // Advance the request id so stale updates do not leak through.
    const requestId = gearDbDiffToastRequestIdRef.current + 1
    gearDbDiffToastRequestIdRef.current = requestId
    // Capture the current build id so we can wait for the next commit.
    gearDbDiffToastPendingRef.current = {
      requestId,
      baselineBuildId: gearEntriesCommittedBuildIdRef.current,
      queuedAt,
      lineSpecs: params.lineSpecs,
      retainedEntries,
      historyCount,
      historyOverflowCount,
      toastCount,
      toastOverflowCount,
      // Snapshot matches before the gear list is rebuilt.
      matchesBefore: buildMatchMapByArtifactId(gearInspectorPreviewRowsRef.current),
    }
  }, [
    buildGearDbHistoryHeaderLines,
    buildMatchMapByArtifactId,
    hideGearDbUpdateToast,
    showGearDbDiffToast,
  ])
  // Drain the queued diff-toast once the Gear Inspector grid has committed a matching build.
  // Extracted as a stable callback so the effect body is a thin trigger.
  const drainGearDbDiffToast = useCallback(() => {
    const pending = gearDbDiffToastPendingRef.current
    // Nothing queued means nothing to render.
    if (!pending) return
    // Ignore stale entries if a newer diff request superseded this one.
    if (pending.requestId !== gearDbDiffToastRequestIdRef.current) return
    // Wait until the Gear Inspector grid has committed a new build for the update.
    if (gearEntriesBuildingRef.current) return
    // Ignore commits that predate the queued diff request.
    if (gearEntriesCommittedBuildIdRef.current <= pending.baselineBuildId) return
    // Map current preview rows so matches line up with the diff entries.
    const matchesAfter = buildMatchMapByArtifactId(gearInspectorPreviewRowsRef.current)
    // Enrich the shared retained list once; history/toast derive slices from it.
    const retainedEnriched = pending.retainedEntries.map((entry) => ({
      ...entry,
      beforeMatch: pending.matchesBefore.get(entry.id) ?? null,
      afterMatch: matchesAfter.get(entry.id) ?? null,
    }))
    // History reads the newest N entries from the shared enriched list.
    const historyEnriched = retainedEnriched.slice(-pending.historyCount)
    // Toast reads its own newest-N tail from the same shared enriched list.
    const toastEnriched = retainedEnriched.slice(-pending.toastCount)
    // Localize header lines now that the diff is ready to render.
    const headerLines = buildGearDbHistoryHeaderLines(pending.lineSpecs)
    // Store the capped diff in the session history menu.
    appendGearDbDiffHistory({
      lineSpecs: pending.lineSpecs,
      entries: historyEnriched,
      overflowCount: pending.historyOverflowCount,
      createdAt: pending.queuedAt,
    })
    // Commit the toast payload now that matches are current.
    // Honor the history menu toggle when showing endpoint success toasts.
    if (!hideGearDbUpdateToast) {
      showGearDbDiffToast({
        headerLines,
        lineSpecs: pending.lineSpecs,
        entries: toastEnriched,
        overflowCount: pending.toastOverflowCount,
      })
    }
    // Clear the queue so the toast does not re-render.
    gearDbDiffToastPendingRef.current = null
  }, [
    appendGearDbDiffHistory,
    buildGearDbHistoryHeaderLines,
    buildMatchMapByArtifactId,
    hideGearDbUpdateToast,
    showGearDbDiffToast,
  ])
  // Re-attempt drain whenever the build id or preview rows advance — render-time comparison.
  const drainTriggerKey = `${gearEntriesCommittedBuildId}|${gearInspectorPreviewRows.length}`
  const [prevDrainTriggerKey, setPrevDrainTriggerKey] = useState(drainTriggerKey)
  if (drainTriggerKey !== prevDrainTriggerKey) {
    setPrevDrainTriggerKey(drainTriggerKey)
    // Schedule drain after commit so React has committed the new state values.
    queueMicrotask(() => drainGearDbDiffToast())
  }
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
  // Keep callback identity stable so HsfRulesTable memoization can skip unrelated app rerenders.
  const handleFocusRuleSettled = useCallback(() => {
    setFocusRuleIndex(null)
  }, [])
  // Gear Inspector consumes this to expand + scroll to a targeted artifact card.
  const [gearInspectorArtifactFocusRequest, setGearInspectorArtifactFocusRequest] = useState<GearInspectorArtifactFocusRequest | null>(null)
  const gearInspectorArtifactFocusTokenRef = useRef(0)
  // Ref for the preview paper element (used for Paper sizing/layout).
  const previewPaperRef = useRef<HTMLDivElement | null>(null)
  const flushTransientUi = useCallback(() => {
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true })) } catch {}
    try { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) } catch {}
  }, [])
  const handleCloseLogicHub = useCallback(() => {
    setLogicHubOpen(false)
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
  // Gear Inspector substat sorting is view-only but should persist across sessions like filters.
	  const gearInspectorSubstatSortPrefs = useGearInspectorSubstatSortPreferences()
	  const clearGearInspectorSubstatSort = gearInspectorSubstatSortPrefs.clear
	  // Normalized overlay presets are reused by the Sort popout (shared presets + overwrite behavior).
	  const gearInspectorNormalizedOverlayPrefs = useGearInspectorGridNormalizedOverlayPreferences()
	  const gearInspectorSubstatSortSpec = useMemo(() => {
	    const priorities = gearInspectorSubstatSortPrefs.state.priorities
	    const excludeGlyphs = gearInspectorSubstatSortPrefs.state.excludeGlyphs
	    const selectedSubstats = priorities.filter((key) => !isGearInspectorSyntheticSortKey(Number(key))) as StatVariant[]
	    // Custom scoring spec mirrors the Sort popout's current selection + weights.
	    const customScoreSpec = selectedSubstats.length > 0
	      ? {
	          variants: selectedSubstats,
	          excludeGlyphs,
	          weights: gearInspectorSubstatSortPrefs.state.weights,
	        }
	      : null

	    const presets = gearInspectorNormalizedOverlayPrefs.state.presets
	    const presetScoreSpecs = gearInspectorSubstatSortPrefs.state.normalizedSourcePresetIds
	      .map((presetId) => presets[presetId])
	      .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
	      .map((preset) => ({
	        variants: preset.variants,
	        weights: preset.weights,
	        excludeGlyphs,
	      }))

	    const overlayActive = gearInspectorNormalizedOverlayPrefs.state.useSortWeights
	      || gearInspectorNormalizedOverlayPrefs.state.enabledPresetIds.length > 0

	    const activeOverlayScoreSpecs = (() => {
	      // "Use active" means normalized sort mirrors whatever the Gear Inspector grid overlay is currently showing.
	      if (!gearInspectorSubstatSortPrefs.state.normalizedUseActiveOverlay) return []
	      if (!overlayActive) return []
	      if (gearInspectorNormalizedOverlayPrefs.state.useSortWeights) {
	        // Overlay [S] uses the current Sort popout state (custom selection + weights).
	        return customScoreSpec ? [customScoreSpec] : []
	      }
	      return gearInspectorNormalizedOverlayPrefs.state.enabledPresetIds
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
	      if (gearInspectorSubstatSortPrefs.state.normalizedSourceIncludeCustom && customScoreSpec) {
	        out.push(customScoreSpec)
	      }
	      presetScoreSpecs.forEach((spec) => out.push(spec))
	      return out
	    })()

	    const normalizedScoreSpecs = gearInspectorSubstatSortPrefs.state.normalizedUseActiveOverlay
	      ? activeOverlayScoreSpecs
	      : localScoreSpecs
	    const normalizedAllowed = normalizedScoreSpecs.length > 0
	    const normalizedEffective = gearInspectorSubstatSortPrefs.state.normalized && normalizedAllowed

	    // Sorting can be active via priorities (classic mode) or via normalized specs (preset-only mode).
	    const hasAnySort = priorities.length > 0 || normalizedEffective
	    if (!hasAnySort) return null

	    return {
	      priorities,
	      direction: gearInspectorSubstatSortPrefs.state.direction,
	      flipped: gearInspectorSubstatSortPrefs.state.flipped,
	      excludeGlyphs,
	      normalized: normalizedEffective,
	      // Weights are included even when normalized is off so overlay [S] can still read them.
	      weights: gearInspectorSubstatSortPrefs.state.weights,
	      ...(normalizedEffective ? { normalizedScoreSpecs } : {}),
	    }
	  }, [
	    gearInspectorNormalizedOverlayPrefs.state.enabledPresetIds,
	    gearInspectorNormalizedOverlayPrefs.state.presets,
	    gearInspectorNormalizedOverlayPrefs.state.useSortWeights,
	    gearInspectorSubstatSortPrefs.state.direction,
	    gearInspectorSubstatSortPrefs.state.excludeGlyphs,
	    gearInspectorSubstatSortPrefs.state.flipped,
	    gearInspectorSubstatSortPrefs.state.normalized,
	    gearInspectorSubstatSortPrefs.state.normalizedSourceIncludeCustom,
	    gearInspectorSubstatSortPrefs.state.normalizedSourcePresetIds,
	    gearInspectorSubstatSortPrefs.state.normalizedUseActiveOverlay,
	    gearInspectorSubstatSortPrefs.state.priorities,
	    gearInspectorSubstatSortPrefs.state.weights,
	  ])
  const gearInspectorRulesFilter = useMemo(() => normalizeRulesFilterForGearInspector(rulesFilter), [rulesFilter])
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
  const [gearInspectorRecipeFilterMode, setGearInspectorRecipeFilterMode] = useState<GearInspectorRecipeFilterMode>(GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT)
  // Ref-based setter so the filter-reset layout effect avoids the set-state-in-effect lint rule.
  const setGearInspectorRecipeFilterModeRef = useRef(setGearInspectorRecipeFilterMode)
  useEffect(() => { setGearInspectorRecipeFilterModeRef.current = setGearInspectorRecipeFilterMode }, [setGearInspectorRecipeFilterMode])
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
    // Presets capture both modes so toggling between Sellfile preview and Gear Inspector stays coherent.
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
      testerRecipeFilterMode: gearInspectorRecipeFilterMode,
      testerSubstatSort: gearInspectorSubstatSortPrefs.state,
      views,
    }
  }, [
    filterCollapsedByMode,
    filterOpenByMode,
    filtersSynced,
    limitRecipesToFiltered,
    previewMode,
    rulesFilterByMode,
    gearInspectorRecipeFilterMode,
    gearInspectorSubstatSortPrefs.state,
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
    setGearInspectorRecipeFilterMode(snap.testerRecipeFilterMode)
    // Gear Inspector sorting uses its own localStorage store; update it directly for immediate table refresh.
    setGearInspectorSubstatSortState(snap.testerSubstatSort)
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
    setPreviewMode(snap.activeMode === 'gearInspector' ? 'gearInspector' : 'rules')
  }, [
    filterPresets,
    setFiltersSyncedRaw,
    setLimitRecipesToFiltered,
    setGearInspectorRecipeFilterMode,
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

  // Focus the filter name input when the filter panel opens via keyboard shortcut.
  const [prevFilterOpen, setPrevFilterOpen] = useState(filterOpen)
  if (filterOpen !== prevFilterOpen) {
    setPrevFilterOpen(filterOpen)
    if (filterOpen && filterShortcutPendingFocusRef.current) {
      filterShortcutPendingFocusRef.current = false
      // Schedule focus after the current render so the input is mounted.
      queueMicrotask(() => { rulesFilterPanelRef.current?.focusRecipeNameInput() })
    }
  }

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
      window.removeEventListener('keydown', onKeydown, { capture: true })
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
  const [pushEndpointReachable, setPushEndpointReachable] = useState(() => Boolean(pushEndpoint))
  const updatePushEndpointReachable = useCallback((next: boolean) => {
    setPushEndpointReachable((prev) => (prev === next ? prev : next))
  }, [])

  const handleConfirmClearAll = useCallback(() => {
    const descriptor = createRecipesClearedDescriptor(customRecipes.length)
    describeNextChange(descriptor)
    // Clearing recipes can trigger large downstream preview diffs; transition the write.
    setCustomRecipesTransition([])
    syncSelectedRecipeIdx(null, { forceSync: true, suppressDraft: true })
    markNextSnapshotAsSaved()
    exportBaselineResetRef.current = true
  }, [customRecipes.length, describeNextChange, markNextSnapshotAsSaved, setCustomRecipesTransition, syncSelectedRecipeIdx])
  const handleConfirmDeleteSingle = useCallback((idx: number) => {
    // Recipe deletes can shift large arrays; schedule as non-urgent.
    setCustomRecipesTransition(prev => {
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
  }, [describeNextChange, metasets, setCustomRecipesTransition, syncSelectedRecipeIdx])
  const handleDeleteMultiConfirmed = useCallback((targetsParam: number[] | null) => {
    // Use the snapshot captured when opening the dialog so confirmation matches the displayed list.
    const source = Array.isArray(targetsParam) && targetsParam.length > 0
      ? targetsParam
      : selectedRecipeIndices
    if (!source.length) return
    const uniqueTargets = Array.from(new Set(source.filter((idx) => Number.isInteger(idx) && idx >= 0))).sort((a, b) => a - b)
    if (!uniqueTargets.length) return
    const deleteSet = new Set(uniqueTargets)
    // Batch deletes can be heavy on large recipe lists.
    setCustomRecipesTransition(prev => {
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
  }, [describeNextChange, metasets, selectedRecipeIndices, setCustomRecipesTransition, syncSelectedRecipeIdx])
  const sfrDialogs = useSfrDialogs({
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
  } = sfrDialogs
  // Track when the note dialog opened automatically from an SFR import.
  // Why: auto-opened notes should hide the "Edit Note & Recipe Overrides…" button.
  const [noteAutoOpenedFromSfr, setNoteAutoOpenedFromSfr] = useState(false)
  // Manual openers reset the auto-open flag so the edit entry point returns.
  const openNoteEditorManual = useCallback(() => {
    setNoteAutoOpenedFromSfr(false)
    openNoteEditor()
  }, [openNoteEditor, setNoteAutoOpenedFromSfr])
  // Manual view opens should also clear auto-open gating.
  const openNoteViewerManual = useCallback(() => {
    setNoteAutoOpenedFromSfr(false)
    openNoteViewer()
  }, [openNoteViewer, setNoteAutoOpenedFromSfr])
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
    setNoteAutoOpenedFromSfr(false)
    closeNote()
  }, [closeNote, setNoteAutoOpenedFromSfr])

  const applyNoteChange = useCallback((
    value: React.SetStateAction<string | null>,
    options?: { mode?: NoteDescriptorMode; publish?: boolean },
  ): HistoryEntryDescriptor | null => {
    const mode = options?.mode ?? 'edit'
    const prevRaw = sfrNote ?? null
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
      setSfrNote(() => nextNormalized)
      return null
    }
    // Persist the updated note content immediately.
    setSfrNote(() => nextNormalized)
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
  }, [describeNextChange, sfrNote, noteMode, noteOpen, setSfrNote, setNoteRecipeOverridesAnswers])


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
    selectedSafeguardRuleId,
    setSelectedSafeguardRuleId,
    setSafeguardBuilder,
    safeguardsEnabled,
    setSafeguardsEnabled,
    recipesEnabled,
    setRecipesEnabled,
    gearInspectorItems,
    // Keep tutorial-driven Gear Inspector mutations on the same transition path as dialogs/imports.
    setGearInspectorItems: setGearInspectorItemsTransition,
    previewMode,
    setPreviewMode,
    sfrNote,
    setSfrNote,
    builderRef,
    setBuilder,
    logicHubOpen,
    setLogicHubOpen,
    setBuilderMode,
    suppressHistorySnapshot: suppressNextSnapshot,
    t,
  })

  // Compute a stable key for recipes that affects HSF rule generation (ignores display-only fields like `name`).
  // Why: Changing the recipe name should not cause a refresh of the Sellfile Preview table.
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

  const exportRulesCountRef = useRef(mergedRules.length)
  useEffect(() => { exportRulesCountRef.current = mergedRules.length }, [mergedRules.length])
  // Keep export payload creation lazy so large merged-rule snapshots do not run on every render.
  const buildExportPayload = useCallback(() => (
    buildHsfFileFromMerged(mergedRules, { recipeNames })
  ), [mergedRules, recipeNames])
  type ExportDirtyMetasetDigest = { id: string; sets: number[] }
  type ExportDirtySafeguardRuleDigest = {
    id: string
    activation: string
    requiredCount: number
    ignorePreviousSafeguards: boolean
    ignoreEquippedInCollection: boolean
    ignoreEquippedInVault: boolean
    countModeBits: string
    substats: number[]
    weights: Array<[number, number]>
    combination: string
  }
  type ExportDirtyDetectionDigest = {
    ruleId: string
    ruleActivation: string
    requiredCount: number
    currentCount: number
    projectedCount: number
    deficit: number
    groupsTracked: number
    perGroupRequiredCount: number
    coveredByExisting: boolean
    itemKeys: number[]
    placeholders: number
  }
  type ExportDirtyState = {
    omitDisabledForExport: boolean
    totalLimitHit: boolean
    substatTargetsKey: string
    recipeKeys: string[]
    recipeNames: string[]
    metasets: ExportDirtyMetasetDigest[]
    baseHsfHash: string | null
    baseHsfRuleCount: number
    finalSell: {
      setsMode: string
      artifacts: boolean
      accessories: boolean
      levels: number[]
    } | null
    safeguardsEnabled: boolean
    safeguardRules: ExportDirtySafeguardRuleDigest[]
    safeguardDetection: ExportDirtyDetectionDigest[] | null
    mergedRuleCount: number
  }

  const numberArraysEqual = (left: number[], right: number[]): boolean => {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let idx = 0; idx < left.length; idx += 1) if (left[idx] !== right[idx]) return false
    return true
  }
  const stringArraysEqual = (left: string[], right: string[]): boolean => {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let idx = 0; idx < left.length; idx += 1) if (left[idx] !== right[idx]) return false
    return true
  }
  const metasetDigestsEqual = (left: ExportDirtyMetasetDigest[], right: ExportDirtyMetasetDigest[]): boolean => {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let idx = 0; idx < left.length; idx += 1) {
      const a = left[idx]!
      const b = right[idx]!
      if (a.id !== b.id) return false
      if (!numberArraysEqual(a.sets, b.sets)) return false
    }
    return true
  }
  const safeguardRuleDigestsEqual = (left: ExportDirtySafeguardRuleDigest[], right: ExportDirtySafeguardRuleDigest[]): boolean => {
    if (left === right) return true
    if (left.length !== right.length) return false
    for (let idx = 0; idx < left.length; idx += 1) {
      const a = left[idx]!
      const b = right[idx]!
      if (
        a.id !== b.id
        || a.activation !== b.activation
        || a.requiredCount !== b.requiredCount
        || a.ignorePreviousSafeguards !== b.ignorePreviousSafeguards
        || a.ignoreEquippedInCollection !== b.ignoreEquippedInCollection
        || a.ignoreEquippedInVault !== b.ignoreEquippedInVault
        || a.countModeBits !== b.countModeBits
        || a.combination !== b.combination
      ) {
        return false
      }
      if (!numberArraysEqual(a.substats, b.substats)) return false
      if (a.weights.length !== b.weights.length) return false
      for (let weightIdx = 0; weightIdx < a.weights.length; weightIdx += 1) {
        const aw = a.weights[weightIdx]!
        const bw = b.weights[weightIdx]!
        if (aw[0] !== bw[0] || aw[1] !== bw[1]) return false
      }
    }
    return true
  }
  const safeguardDetectionDigestsEqual = (
    left: ExportDirtyDetectionDigest[] | null,
    right: ExportDirtyDetectionDigest[] | null,
  ): boolean => {
    if (left === right) return true
    if (!left || !right) return false
    if (left.length !== right.length) return false
    for (let idx = 0; idx < left.length; idx += 1) {
      const a = left[idx]!
      const b = right[idx]!
      if (
        a.ruleId !== b.ruleId
        || a.ruleActivation !== b.ruleActivation
        || a.requiredCount !== b.requiredCount
        || a.currentCount !== b.currentCount
        || a.projectedCount !== b.projectedCount
        || a.deficit !== b.deficit
        || a.groupsTracked !== b.groupsTracked
        || a.perGroupRequiredCount !== b.perGroupRequiredCount
        || a.coveredByExisting !== b.coveredByExisting
        || a.placeholders !== b.placeholders
      ) {
        return false
      }
      if (!numberArraysEqual(a.itemKeys, b.itemKeys)) return false
    }
    return true
  }
  const exportDirtyStatesEqual = (left: ExportDirtyState, right: ExportDirtyState): boolean => {
    if (
      left.omitDisabledForExport !== right.omitDisabledForExport
      || left.totalLimitHit !== right.totalLimitHit
      || left.substatTargetsKey !== right.substatTargetsKey
      || left.baseHsfHash !== right.baseHsfHash
      || left.baseHsfRuleCount !== right.baseHsfRuleCount
      || left.safeguardsEnabled !== right.safeguardsEnabled
      || left.mergedRuleCount !== right.mergedRuleCount
    ) {
      return false
    }
    if (!stringArraysEqual(left.recipeKeys, right.recipeKeys)) return false
    if (!stringArraysEqual(left.recipeNames, right.recipeNames)) return false
    if (!metasetDigestsEqual(left.metasets, right.metasets)) return false
    if (Boolean(left.finalSell) !== Boolean(right.finalSell)) return false
    if (left.finalSell && right.finalSell) {
      if (
        left.finalSell.setsMode !== right.finalSell.setsMode
        || left.finalSell.artifacts !== right.finalSell.artifacts
        || left.finalSell.accessories !== right.finalSell.accessories
      ) {
        return false
      }
      if (!numberArraysEqual(left.finalSell.levels, right.finalSell.levels)) return false
    }
    if (!safeguardRuleDigestsEqual(left.safeguardRules, right.safeguardRules)) return false
    if (!safeguardDetectionDigestsEqual(left.safeguardDetection, right.safeguardDetection)) return false
    return true
  }

  // Export dirty checks compare normalized structured state so we avoid one
  // huge concatenated signature string on every recompute.
  const hsfExportStateSig = useMemo<ExportDirtyState>(() => {
    const metasetDigests = metasets
      .map((meta) => ({
        id: String(meta.id),
        sets: (Array.isArray(meta.sets) ? [...meta.sets].map(Number).sort((a, b) => a - b) : []),
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    const baseHsfHash = hsf ? ((hsf as { Hash?: string }).Hash ?? null) : null
    const baseHsfRuleCount = hsf?.Rules?.length ?? 0
    const finalSellDigest = finalSellRemainder
      ? {
        setsMode: finalSellRemainder.setsMode ?? FINAL_SELL_DEFAULT_SETS_MODE,
        artifacts: finalSellRemainder.artifacts === true,
        accessories: finalSellRemainder.accessories === true,
        levels: Array.isArray(finalSellRemainder.levels)
          ? [...finalSellRemainder.levels].map(Number).sort((a, b) => a - b)
          : [],
      }
      : null
    const safeguardRuleDigests = resolvedSafeguardRules.map((rule) => {
      const countMode = rule.countMode
      const countModeBits = [
        countMode?.perRule ? 1 : 0,
        countMode?.perSlot ? 1 : 0,
        countMode?.perSet ? 1 : 0,
        countMode?.perFaction ? 1 : 0,
        countMode?.perMainStat ? 1 : 0,
      ].join('')
      const substats = Array.isArray(rule.substats)
        ? [...rule.substats].map(Number).sort((a, b) => a - b)
        : []
      const weights = Object.entries(rule.substatWeights ?? {})
        .map(([variant, value]) => [Number(variant), Number(value)] as [number, number])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      return {
        id: rule.id ?? '',
        activation: rule.activation ?? '',
        requiredCount: Number.isFinite(rule.requiredCount) ? Number(rule.requiredCount) : 0,
        ignorePreviousSafeguards: rule.ignorePreviousSafeguards !== false,
        ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
        ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
        countModeBits,
        substats,
        weights,
        combination: stableSerialize(rule.combination ?? null),
      }
    })
    const safeguardDetectionDigests = safeguardDetection
      ? safeguardDetection.entries.map((entry) => ({
        ruleId: entry.ruleId ?? '',
        ruleActivation: entry.ruleActivation ?? '',
        requiredCount: Number(entry.requiredCount),
        currentCount: Number(entry.currentCount),
        projectedCount: Number(entry.projectedCount),
        deficit: Number(entry.deficit),
        groupsTracked: Number(entry.groupsTracked),
        perGroupRequiredCount: Number(entry.perGroupRequiredCount),
        coveredByExisting: entry.coveredByExisting === true,
        itemKeys: [...entry.itemKeys].map(Number),
        placeholders: entry.placeholders.length,
      }))
      : null
    return {
      omitDisabledForExport,
      totalLimitHit: recipeRulesState.totalLimitHit,
      substatTargetsKey: recipeRulesState.substatTargetsKey,
      recipeKeys: [...recipeRulesState.keys],
      recipeNames: [...recipeNames],
      metasets: metasetDigests,
      baseHsfHash,
      baseHsfRuleCount,
      finalSell: finalSellDigest,
      safeguardsEnabled,
      safeguardRules: safeguardRuleDigests,
      safeguardDetection: safeguardDetectionDigests,
      mergedRuleCount: mergedRules.length,
    }
  }, [
    omitDisabledForExport,
    recipeRulesState.totalLimitHit,
    recipeRulesState.substatTargetsKey,
    recipeRulesState.keys,
    recipeNames,
    metasets,
    hsf,
    finalSellRemainder,
    safeguardsEnabled,
    resolvedSafeguardRules,
    safeguardDetection,
    mergedRules.length,
  ])
  const [lastExportSig, setLastExportSig] = useState<ExportDirtyState | null>(null)
  // Queue one export request while rule/Gear Inspector workers are still rebuilding state.
  const [queuedSellfileExport, setQueuedSellfileExport] = useState(false)
  const isSellfileExportBlockedByWorker = useCallback((): boolean => (
    // A queued debounce still means export snapshots are stale.
    pipelineDebounceRef.current !== null
    // Active pipeline requests must settle before we serialize payloads.
    || pipelineAbortRef.current !== null
    // UI build flags mirror in-flight worker work that mutates preview/export data.
    || rulesBuilding
    || gearEntriesBuilding
  ), [gearEntriesBuilding, rulesBuilding])
  const queueSellfileExportIfNeeded = useCallback((): boolean => {
    // Run immediately when no worker build is pending.
    if (!isSellfileExportBlockedByWorker()) return false
    // Keep one queued request while work is in flight.
    setQueuedSellfileExport(true)
    return true
  }, [isSellfileExportBlockedByWorker])
  // Establish the export signature baseline after resets or first render — render-time adjustment.
  if (exportBaselineResetRef.current || lastExportSig === null) {
    setLastExportSig(hsfExportStateSig)
    exportBaselineResetRef.current = false
  }
  const hsfDirty = lastExportSig !== null && !exportDirtyStatesEqual(hsfExportStateSig, lastExportSig)
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
        const { __lineIdx: _omitLineIdx, __allKnownSets: _omitAllKnownSets, __source: _omitSource, ...rest } = rule as (HsfRuleWithRecipe & { __allKnownSets?: boolean })
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

  


  // Keep filter and builder-layout persistence snapshot sharable across autosave restore and writes.
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
      gearInspectorRecipeFilterMode,
      // Builder section collapse is session state — autosave so the user's
      // working layout is offered for restore alongside the filter panel state.
      builderRecipeCollapsed,
      builderSafeguardCollapsed,
    }
  }, [filterOpenByMode, rulesFilterByMode, filterCollapsedByMode, previewMode, gearInspectorRecipeFilterMode, builderRecipeCollapsed, builderSafeguardCollapsed])

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
    note: sfrNote,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    filters: autosaveFiltersState,
    gearInspectorSort: gearInspectorSubstatSortPrefs.state,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    logicHubDialogTab,
    safeguardsGridFilterMode,
    storedRuntimeGearSetCount,
  })
  const currentTargetsSignature = useMemo(() => substatTargetsSignature(substatTargets), [substatTargets])
  const restoreMetasetsDiffer = useMemo(() => {
    if (!restoreDraft?.Metasets) return false
    return !metasetsEqualSession(restoreDraft.Metasets, metasets)
  }, [restoreDraft, metasets])
  const restoreTargetsDiffer = useMemo(() => {
    if (!restoreDraft?.substatTargets) return false
    return substatTargetsSignature(restoreDraft.substatTargets) !== currentTargetsSignature
  }, [restoreDraft, currentTargetsSignature])
  const restoreFiltersDiffer = Boolean(restoreDraft?.Filters && !areFilterContentsDefault(restoreDraft.Filters))
  // Sort differs when the saved TesterSort is present AND non-default — mirrors the Filters differ check.
  const restoreSortDiffer = Boolean(restoreDraft?.TesterSort && !isDefaultGearInspectorSubstatSortState(restoreDraft.TesterSort))
  const filtersResetRef = useRef(false)
  useLayoutEffect(() => {
    // Reset filter/sort state to a clean baseline when either has changed, so the user
    // sees the default before deciding whether to restore the autosaved layout.
    const hasFilterChange = restoreDialogPending && restoreDraft?.Filters && restoreFiltersDiffer
    const hasSortChange = restoreDialogPending && restoreSortDiffer
    if (!hasFilterChange && !hasSortChange) return
    if (filtersResetRef.current) return
    filtersResetRef.current = true
    if (hasFilterChange) {
      resetRulesFilterPreferences()
      setGearInspectorRecipeFilterModeRef.current('off')
      resetBuilderCollapsedPreferences()
    }
    if (hasSortChange) clearGearInspectorSubstatSort()
  }, [clearGearInspectorSubstatSort, restoreDialogPending, restoreDraft, restoreFiltersDiffer, restoreSortDiffer])
  // Clear the filters-reset guard when the restore dialog is dismissed — render-time comparison.
  const [prevRestoreDialogPending, setPrevRestoreDialogPending] = useState(restoreDialogPending)
  if (restoreDialogPending !== prevRestoreDialogPending) {
    setPrevRestoreDialogPending(restoreDialogPending)
    if (!restoreDialogPending) filtersResetRef.current = false
  }
  // Show the autosave restore prompt only after the README dialog is dismissed.
  const restoreDlgOpen = !tutorial.helpOpen && (restoreDialogPending || Boolean(gearInspectorRestoreDraft))
  const { applyGearDbDiff } = useGearInspectorItemsActions({
    allocGearInspectorItemId,
    // Route manual imports + endpoint snapshots/deltas through the shared
    // non-urgent dispatcher so DB payload commits do not preempt click handling.
    setGearInspectorItems: setGearInspectorItemsTransition,
    gearInspectorItemsRef,
  })

  const handleGearDbImport = useCallback(async (file: File, options?: { source?: 'manual' | 'command' }) => {
    const source = options?.source ?? 'manual'
    if (gearImportBusy) return
    // Manual imports should not prime endpoint delta baselines.
    if (source === 'manual') {
      gearDbRawDatasetRef.current = null
      // Reset the binary snapshot cache so command imports cannot diff against a
      // manual baseline that predates the raw dataset reset.
      gearDbBinarySnapshotCacheRef.current = null
    }
    // Capture the binary snapshot cache before the async import begins.
    // This holds the "after" snapshot from the previous binary push cycle so
    // we do not need to re-clone the prior dataset on each import call.
    const previousBinarySnapshot = source === 'command' ? gearDbBinarySnapshotCacheRef.current : null
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
      // Manual file/drag imports always open Gear Inspector preview so users see imported rows immediately.
      // Endpoint command pushes intentionally keep the current preview mode.
      if (source === 'manual') {
        setPreviewMode('gearInspector')
      }
      const desiredGearInspectorItems = combined.map((artifact) => artifact.gearInspectorItem)
      const { removedCount, addedCount } = applyGearDbDiff(desiredGearInspectorItems)
      if (removedCount > 0 || addedCount > 0) {
        beginGearInspectorMatchReset(source === 'command' ? 'gearDbEndpoint' : 'gearDbManual')
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
      // Build one canonical dataset so endpoint command pushes own a single baseline.
      const importedDataset: GearDbRawDataset = {
        snapshotId: null,
        champions: new Map(),
        lastUsed: new Map(),
        artifacts: new Map(artifacts.map((artifact) => [artifact.id, artifact])),
        inboxArtifacts: new Map(inboxArtifacts.map((artifact) => [artifact.id, artifact])),
      }
      if (source === 'command') {
        // Fast-path: if the newly imported dataset matches the cached snapshot from
        // the previous cycle, no tracked fields changed (e.g., only LastUse timestamps
        // were written by RSL Helper). Skip both snapshotGearDbDataset calls entirely.
        const isUnchanged = previousBinarySnapshot !== null
          && isGearDbDatasetMatchingSnapshotCache(importedDataset, previousBinarySnapshot)
        // "After" snapshot: reuse the cache when nothing changed; otherwise clone fresh.
        const importedSnapshots = isUnchanged
          ? previousBinarySnapshot
          : snapshotGearDbDataset(importedDataset)
        // "Before" snapshot: use the cached result from the previous cycle — it already
        // holds the prior state with no re-cloning. Fall back to a fresh clone only on
        // the very first binary import (cache is null) or after a reset.
        const previousGearInspectorSnapshots: Map<number, GearArtifactSnapshot> = previousBinarySnapshot
          ?? (gearDbRawDatasetRef.current
            ? snapshotGearDbDataset(gearDbRawDatasetRef.current)
            : new Map())
        // Advance the binary snapshot cache so the next cycle has a stable baseline.
        gearDbBinarySnapshotCacheRef.current = importedSnapshots
        // Command imports become the next canonical baseline for raw deltas.
        gearDbRawDatasetRef.current = importedDataset
        const diffDetails = buildGearDbDiffSummary(previousGearInspectorSnapshots, importedSnapshots)
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
        // Clear the binary snapshot cache so a corrupt/partial payload does not
        // become the baseline for the next push — force a full diff next cycle.
        gearDbBinarySnapshotCacheRef.current = null
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
    beginGearInspectorMatchReset,
    dismissGearDbCommandToast,
    showGearDbCommandToast,
    queueGearDbDiffToast,
    beginGearImport,
    endGearImport,
  ])

  // Accepts the raw snapshot payload pushed by the helper and rewires the Gear Inspector queue.
  const handleGearDbRawSnapshot = useCallback((command: GearDbRawSnapshotCommand) => {
    // Build a revision map for the incoming push before any normalization work.
    // Covering both arrays in one call keeps the iteration count minimal.
    const incomingRevisions = buildArtifactRevisionMap(command.artifacts, command.inboxArtifacts ?? [])
    // Compute which artifact ids actually changed relative to the last accepted push.
    // An id is "changed" when it is new, removed, or carries a different revision number.
    // Ids whose revision matches are unchanged and can skip the expensive deep clone.
    const previousRevisions = gearDbRevisionMapRef.current
    const changedIds = new Set<number>()
    // New or updated ids — present in incoming but absent/different in previous.
    for (const [id, rev] of incomingRevisions) {
      if (previousRevisions.get(id) !== rev) changedIds.add(id)
    }
    // Removed ids — present in previous but absent in incoming.
    for (const id of previousRevisions.keys()) {
      if (!incomingRevisions.has(id)) changedIds.add(id)
    }
    // If no revision data is available (e.g. SQLite path, first push with no revisions)
    // fall back to a full snapshot by passing null — snapshotGearDbDataset treats null
    // as "include all ids" while an empty Set means "include nothing".
    const changedIdsFilter = incomingRevisions.size > 0 ? changedIds : null
    // Capture the previous dataset so we can compute before/after diffs.
    const previousDataset = gearDbRawDatasetRef.current
    // Snapshot only the changed subset of previous artifacts — unchanged ones produce no diff entry.
    const previousSnapshots = previousDataset
      ? snapshotGearDbDataset(previousDataset, changedIdsFilter)
      : new Map()
    // Flag the import as busy so UI controls can reflect the update.
    beginGearImport()
    // Clear prior command results so the new push owns the status line.
    setGearDbCommandError(null)
    setGearDbCommandSuccess(null)
    // Clear any live toast so the diff payload can replace it.
    dismissGearDbCommandToast()
    try {
      // Normalize the raw rows into the canonical Gear Inspector dataset before diffing.
      const { dataset, gearInspectorItems, artifactCount, inboxCount } = createDatasetFromSnapshot(command)
      // Snapshot only the changed subset of incoming artifacts for the diff.
      const nextSnapshots = snapshotGearDbDataset(dataset, changedIdsFilter)
      // Build the per-item diff list for the endpoint toast.
      const diffDetails = buildGearDbDiffSummary(previousSnapshots, nextSnapshots)
      // Persist the dataset so future deltas can apply correctly.
      gearDbRawDatasetRef.current = dataset
      // Advance the revision baseline so the next push can skip its own unchanged artifacts.
      gearDbRevisionMapRef.current = incomingRevisions
      // Invalidate the binary snapshot cache — the JSON path has its own baseline now.
      // A subsequent binary push must build its "before" snapshot from the JSON dataset.
      gearDbBinarySnapshotCacheRef.current = null
      // Keep raw parts in sync so partial per-type updates merge against this baseline.
      gearDbRawPartsRef.current = {
        artifacts: command.artifacts,
        inboxArtifacts: command.inboxArtifacts,
        champions: command.champions,
        lastUsed: command.lastUsed,
      }
      // Diff the Gear Inspector queue so only net changes are enqueued.
      const { removedCount, addedCount } = applyGearDbDiff(gearInspectorItems)
      if (removedCount > 0 || addedCount > 0) {
        // Endpoint snapshots should refresh matches without dimming card details.
        beginGearInspectorMatchReset('gearDbEndpoint')
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
      // Clear accumulated parts so stale data does not seed the next snapshot.
      gearDbRawPartsRef.current = { artifacts: null, inboxArtifacts: null, champions: null, lastUsed: null }
      // Reset the revision baseline so the next push falls back to a full snapshot.
      gearDbRevisionMapRef.current = new Map()
      // Clear the binary snapshot cache so the next binary push starts fresh too.
      gearDbBinarySnapshotCacheRef.current = null
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
    beginGearInspectorMatchReset,
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

  // Handles the four separate per-type messages (artifacts / champions / inboxArtifacts / lastUsed).
  // Each message updates one slot of gearDbRawPartsRef and immediately synthesizes a snapshot so
  // that partial updates are never silently dropped — the endpoint may only send one or two types.
  // Missing slots default to empty arrays, so an "artifacts-only" message produces a valid result
  // with no champions or lastUsed data until those messages arrive.
  const handleGearDbRawPart = useCallback((
    cmd: GearDbArtifactsCommand | GearDbChampionsCommand | GearDbInboxArtifactsCommand | GearDbLastUsedCommand,
  ) => {
    const parts = gearDbRawPartsRef.current
    // Apply the incoming collection to the appropriate slot.
    if (cmd.kind === 'gearDbArtifacts') {
      parts.artifacts = cmd.artifacts
    } else if (cmd.kind === 'gearDbChampions') {
      parts.champions = cmd.champions
    } else if (cmd.kind === 'gearDbInboxArtifacts') {
      parts.inboxArtifacts = cmd.inboxArtifacts
    } else {
      // gearDbLastUsed — the only remaining variant.
      parts.lastUsed = cmd.lastUsed
    }
    // Synthesize a snapshot immediately using whatever parts are available.
    // Null slots fall back to empty arrays so normalization always succeeds.
    const syntheticSnapshot: GearDbRawSnapshotCommand = {
      kind: 'gearDbRawSnapshot',
      // Parts messages carry no shared snapshot id or version.
      snapshotId: null,
      payloadVersion: null,
      artifacts: parts.artifacts ?? [],
      inboxArtifacts: parts.inboxArtifacts ?? [],
      champions: parts.champions ?? [],
      lastUsed: parts.lastUsed ?? [],
    }
    handleGearDbRawSnapshot(syntheticSnapshot)
  }, [handleGearDbRawSnapshot])

  // ---- SFR import conflict state ----
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  // Shift-load selective imports can also hit metaset ID conflicts.
  // Why: merge mode reuses the same conflict dialog choices as clipboard imports.
  const [pendingSfrLoadImport, setPendingSfrLoadImport] = useState<PendingSfrLoadImport | null>(null)
  // Keep the parsed file in memory while the options dialog is open.
  // Why: avoid re-reading the file between Shift-load prompt and confirm.
  const [pendingSfrShiftDialogImport, setPendingSfrShiftDialogImport] = useState<{
    fileName: string
    payload: SfrLoadPayload
  } | null>(null)
  const [metasetConflictOpen, setMetasetConflictOpen] = useState(false)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [importIdMap, setImportIdMap] = useState<Map<string, string>>(() => new Map())
  // no separate stash for metas to add; computed on the fly

  const {
    insertIndexAfter,
    handlePasteText,
    pasteAfterIndex,
    handleRecipePasteAfter,
    handleCopyAllRecipes,
    handleCopyRecipe,
    handlePasteAtEnd,
    prepareSfrImport,
    finalizeImport,
  } = useSfrClipboard({
    metasets,
    substatTargets,
    customRecipes,
    sfrNote,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
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
    setRecipesEnabled,
    setSelectedRecipeIdx: syncSelectedRecipeIdx,
    setSelectedRecipeIndices,
    setSelectionAnchor: updateSelectionAnchor,
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
      // Reorder writes can touch large derived previews; treat as non-urgent.
      setCustomRecipesTransition(prev => {
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
      // Reorder writes can touch large derived previews; treat as non-urgent.
      setCustomRecipesTransition(prev => {
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
      // Reorder writes can touch large derived previews; treat as non-urgent.
      setCustomRecipesTransition(prev => {
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
      // Reorder writes can touch large derived previews; treat as non-urgent.
      setCustomRecipesTransition(prev => {
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
  }, [customRecipes, describeNextChange, insertIndexAfter, metasets, pasteAfterIndex, setCopyDlgOpen, setCopyText, setCustomRecipes, setCustomRecipesTransition, syncSelectedRecipeIdx])

  const handleMetasetsChange = useCallback((next: React.SetStateAction<Metaset[]>) => {
    // Reuse the shared transition dispatcher so metaset writes follow the same
    // non-urgent scheduling policy as other heavy dialog/tab edits.
    setMetasetsTransition(next)
  }, [setMetasetsTransition])
  const handleRulesTableClearBase = useCallback(() => { setHsf(null) }, [setHsf])
  const handleRulesTableEditFinalSell = useCallback(() => { setLogicHubOpen(true) }, [setLogicHubOpen])
  const handleResetGearInspectorItems = useCallback(() => {
    // Treat manual resets like a full gear-db refresh so matcher + safeguard detection clear immediately.
    beginGearInspectorMatchReset('gearDbManual')
    // Gear resets can clear large lists; schedule non-urgent.
    setGearInspectorItemsTransition([])
  }, [beginGearInspectorMatchReset, setGearInspectorItemsTransition])


  // Build autosave payload and write via useAutosave (enabled after restore choice)
  // Autosave should not be triggered by selection-only changes.
  // Pass selectedRecipeIndex: null in autosave payload so selection changes
  // do not alter the payload. Explicit Save/Copy flows still include it.
  const trimmedSfrNote = typeof sfrNote === 'string' ? sfrNote.trim() : ''
  // Keep autosave scheduling lightweight: only build the heavy SFR snapshot when the
  // debounced write actually executes, not on every render/update.
  const buildAutosavePayload = useCallback(() => {
    const basePayload = buildSfrPayload({
      version: APP_VERSION,
      metasets,
      substatTargets,
      recipes: customRecipes,
      finalSellRemainder,
      ...(trimmedSfrNote ? { note: trimmedSfrNote } : {}),
      safeguardRules,
      safeguardsEnabled,
      recipesEnabled,
    })
    const filtersPayload = areAutosaveFiltersDefault(autosaveFiltersState) ? null : autosaveFiltersState
    const gearInspectorSortPayload = isDefaultGearInspectorSubstatSortState(gearInspectorSubstatSortPrefs.state)
      ? null
      : gearInspectorSubstatSortPrefs.state
    // Persist recipe overrides answers in autosave only when non-empty.
    const recipeOverridesPayload = Object.keys(noteRecipeOverridesAnswers).length > 0
      ? noteRecipeOverridesAnswers
      : null
    // Persist recipe overrides disabled flag only when turned off.
    const recipeOverridesDisabledPayload = noteRecipeOverridesDisabled ? true : null
    return {
      ...basePayload,
      LogicHubDialogTab: logicHubDialogTab, // Persist the active tab so the dialog re-opens where the user left off.
      SafeguardsGridFilterMode: safeguardsGridFilterMode,
      AutosaveSavedAt: new Date().toISOString(),
      ...(recipeOverridesPayload ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: recipeOverridesPayload } : {}),
      ...(recipeOverridesDisabledPayload ? { [NOTE_RECIPE_OVERRIDES_DISABLED_KEY]: true } : {}),
      ...(filtersPayload ? { Filters: filtersPayload } : {}),
      ...(gearInspectorSortPayload ? { TesterSort: gearInspectorSortPayload } : {}),
    }
  }, [
    autosaveFiltersState,
    customRecipes,
    finalSellRemainder,
    logicHubDialogTab,
    metasets,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    safeguardRules,
    recipesEnabled,
    safeguardsEnabled,
    safeguardsGridFilterMode,
    substatTargets,
    gearInspectorSubstatSortPrefs.state,
    trimmedSfrNote,
  ])
  // Mutable references are enough to trigger autosave scheduling; avoid expensive payload
  // serialization in render by passing this signal instead of an eagerly-built object.
  const autosavePayloadSignal = useMemo(() => ({
    recipes: customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    note: trimmedSfrNote || null,
    safeguardRules,
    safeguardsEnabled,
    filters: autosaveFiltersState,
    logicHubDialogTab,
    safeguardsGridFilterMode,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    gearInspectorSort: gearInspectorSubstatSortPrefs.state,
  }), [
    autosaveFiltersState,
    customRecipes,
    finalSellRemainder,
    logicHubDialogTab,
    metasets,
    noteRecipeOverridesAnswers,
    noteRecipeOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
    safeguardsGridFilterMode,
    substatTargets,
    gearInspectorSubstatSortPrefs.state,
    trimmedSfrNote,
  ])
  useAutosave({
    key: AUTOSAVE_KEY,
    payloadSignal: autosavePayloadSignal,
    buildPayload: buildAutosavePayload,
    enabled: autosaveEnabled && !tutorial.tutorialOpen && !autosaveSilencedByClear,
    debounceMs: 1000,
    beforeSave: persistRuntimeGearSetsNow,
  })
  if (gearInspectorAutosaveBaselineRef.current === null) {
    gearInspectorAutosaveBaselineRef.current = gearInspectorItems
  }
  const gearInspectorGearTabActive = logicHubOpen && logicHubDialogTab === LOGIC_HUB_DIALOG_TAB_GEAR
  const gearInspectorAutosaveChangedSinceLoad = gearInspectorAutosaveBaselineRef.current !== gearInspectorItems
  const gearInspectorAutosaveEnabled = gearInspectorGearTabActive || gearInspectorAutosaveChangedSinceLoad
  // Build compressed Gear Inspector autosave payload only when a save actually runs.
  const buildGearInspectorAutosavePayloadCallback = useCallback(
    () => buildGearInspectorAutosavePayload(gearInspectorAutosaveItemsRef.current),
    [],
  )
  useAutosave({
    key: AUTOSAVE_GEAR_INSPECTOR_KEY,
    payloadSignal: gearInspectorItems,
    buildPayload: buildGearInspectorAutosavePayloadCallback,
    // Rules-only rebuilds do not mutate Gear Inspector items; keeping autosave enabled
    // avoids false disable/enable cycles that can repeatedly trigger compression work.
    // Still pause during Gear Inspector grid rebuilds, where large row changes are expected.
    enabled: gearInspectorAutosaveEnabled && !gearEntriesBuilding,
    debounceMs: 1000,
    // Avoid immediate compression spikes when Gear Inspector autosave first turns on.
    writeOnEnable: false,
    // Let compression/localStorage writes run during idle time when possible.
    idle: true,
    idleTimeoutMs: 5_000,
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



  // Compute active flags once so inactive filters can bypass full rule/Gear Inspector scans.
  // This avoids O(n) filtering work on interactions that do not change filter state.
  const filterActive = isRulesFilterActive(rulesFilter)
  const gearInspectorFilterActive = isRulesFilterActive(gearInspectorRulesFilter, { includeGearInspectorRange: true })
  // Metaset lists only affect filtering when metaset ids are selected in the filter UI.
  // If no metaset ids are selected, pin to EMPTY_METASETS so metaset edits don't retrigger scans.
  const metasetsForRulesFilter = (rulesFilter.sets?.metaSelected?.length ?? 0) > 0
    ? metasets
    : EMPTY_METASETS
  const metasetsForGearInspectorFilter = (gearInspectorRulesFilter.sets?.metaSelected?.length ?? 0) > 0
    ? metasets
    : EMPTY_METASETS
  const filterResult = useMemo<FilterHsfRulesResult<HsfRuleWithRecipe>>(() => {
    // No active rule filters means the table already uses mergedRules as-is.
    // Return a passthrough snapshot to skip the full filterHsfRules traversal.
    if (!filterActive) {
      return {
        rules: mergedRules,
        matchingRecipeIndices: new Set<number>(),
        recipeRuleCounts: new Map<number, number>(),
      }
    }
    return filterHsfRules(mergedRules, rulesFilter, metasetsForRulesFilter, {
      recipeNames,
      recipeTags,
      recipeModes,
      specialRuleLabels: specialRuleSourceLabels,
    })
  }, [
    filterActive,
    mergedRules,
    rulesFilter,
    metasetsForRulesFilter,
    recipeNames,
    recipeTags,
    recipeModes,
    specialRuleSourceLabels,
  ])
  const filteredRules = filterResult.rules
  const gearInspectorFilterResult = useMemo(() => {
    // No active Gear Inspector filters means we can pass rows through unchanged.
    // Avoid scanning every Gear Inspector row on unrelated state changes.
    if (!gearInspectorFilterActive) {
      return {
        items: gearInspectorPreviewRows,
        matchingRecipeIndices: new Set<number>(),
      }
    }
    return filterGearInspectorItems(gearInspectorPreviewRows, gearInspectorRulesFilter, metasetsForGearInspectorFilter, {
      recipeNames,
      recipeTags,
      specialRuleLabels: specialRuleSourceLabels,
    })
  }, [
    gearInspectorFilterActive,
    gearInspectorPreviewRows,
    gearInspectorRulesFilter,
    metasetsForGearInspectorFilter,
    recipeNames,
    recipeTags,
    specialRuleSourceLabels,
  ])
  const gearEntriesAfterRulesFilter = gearInspectorFilterResult.items
  const gearInspectorChampionOptions = useMemo<GearInspectorChampionOption[]>(() => {
    // Cache champion metadata per id so the dropdown can render icons without rescanning rows.
    const map = new Map<number, GearInspectorChampionOption>()
    for (const row of gearInspectorPreviewRows) {
      const championId = Number(row.artifact.equippedToChampionId ?? NaN)
      if (!Number.isFinite(championId) || championId <= 0) continue
      const trimmedName = row.artifact.equippedChampionName?.trim() || null
      const location = row.artifact.equippedChampionLocation ?? null
      // Base hero id + rarity keep dropdown avatars aligned with Gear Inspector cards.
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
  }, [gearInspectorPreviewRows])
  // ── Safeguard item-key sets: power the recipe-filter integration in safeguard builder mode ──
  const safeguardAnyMatchItemKeySet = useMemo(() => {
    if (!safeguardsActive || !safeguardDetection?.entries?.length) return null
    const set = new Set<number>()
    for (const entry of safeguardDetection.entries) {
      for (const key of entry.itemKeys) set.add(key)
    }
    return set
  }, [safeguardsActive, safeguardDetection])
  const safeguardSelectedRuleItemKeySet = useMemo(() => {
    if (!safeguardsActive || !selectedSafeguardRuleId || !safeguardDetection?.entries?.length) return null
    const entry = safeguardDetection.entries.find((e) => e.ruleId === selectedSafeguardRuleId)
    if (!entry) return null
    return new Set<number>(entry.itemKeys)
  }, [safeguardsActive, safeguardDetection, selectedSafeguardRuleId])
  // In safeguard mode the recipe-filter button operates on safeguard detection instead of recipe selection.
  const gearInspectorRecipeFilterActive = gearInspectorRecipeFilterMode !== 'off' && (
    builderMode === 'safeguard' ? true : selectedRecipeIndices.length > 0
  )
  const gearInspectorRecipeFilterSelectedSet = useMemo<Set<number> | null>(() => {
    if (!gearInspectorRecipeFilterActive) return null
    if (builderMode === 'safeguard') return null  // safeguard mode uses item-key sets instead
    if (!selectedRecipeIndices.length) return null
    return new Set(selectedRecipeIndices)
  }, [gearInspectorRecipeFilterActive, builderMode, selectedRecipeIndices])
  const gearEntriesForTable = useMemo(() => {
    let rows: GearInspectorPreviewRow[] = gearEntriesAfterRulesFilter
    if (builderMode === 'safeguard' && gearInspectorRecipeFilterMode !== 'off') {
      // Filter by safeguard detection: 'first' = selected rule, 'any' = any rule.
      const activeKeySet = gearInspectorRecipeFilterMode === 'first'
        ? safeguardSelectedRuleItemKeySet
        : safeguardAnyMatchItemKeySet
      if (activeKeySet) {
        rows = gearEntriesAfterRulesFilter.filter(
          (row) => activeKeySet.has(getSafeguardItemKey(row.artifact))
        )
      } else {
        rows = []
      }
    } else if (gearInspectorRecipeFilterSelectedSet && gearInspectorRecipeFilterSelectedSet.size > 0) {
      if (gearInspectorRecipeFilterMode === 'first') {
        rows = gearEntriesAfterRulesFilter.filter((row) => {
          const recipeIdx = row.match?.recipeIdx
          return recipeIdx != null && gearInspectorRecipeFilterSelectedSet.has(recipeIdx)
        })
      } else {
        rows = gearEntriesAfterRulesFilter.filter((row) => {
          const matches = row.matchingRecipeIndices ?? []
          for (const recipeIdx of matches) {
            if (gearInspectorRecipeFilterSelectedSet.has(recipeIdx)) return true
          }
          return false
        })
      }
    }
    return sortGearInspectorRows(rows)
  }, [builderMode, gearInspectorRecipeFilterMode, safeguardSelectedRuleItemKeySet, safeguardAnyMatchItemKeySet, gearInspectorRecipeFilterSelectedSet, gearEntriesAfterRulesFilter])
  // Summarize the filtered Gear Inspector rows so the preview chip mirrors the grid contents.
  const gearInspectorOutcomeSummaryForPreview = useMemo(
    () => buildGearInspectorOutcomeSummary(gearEntriesForTable),
    [gearEntriesForTable],
  )
  const hasManualGearInspectorRows = useMemo(() => (
    gearInspectorPreviewRows.some((row) => row.artifact.source === 'tester')
  ), [gearInspectorPreviewRows])
  // Endpoint DB pushes are frequent; keep matcher rows clickable while those builds run.
  const endpointDrivenGearInspectorBuild = gearEntriesBuilding && activeGearInspectorBuildOrigin === 'endpoint'
  // Reset reasons can outlive build flags briefly; treat endpoint resets as non-dimming too.
  const endpointDrivenGearInspectorReset = gearInspectorMatchResetReason === 'gearDbEndpoint'
  const suppressGearInspectorMatchDetails = !(endpointDrivenGearInspectorBuild || endpointDrivenGearInspectorReset) && (
    gearInspectorMatchDetailsFrozen
    || gearEntriesBuilding
  )
  const gearInspectorBuilding = gearEntriesBuilding || rulesBuilding
  const matchingRecipeIndices = filterResult.matchingRecipeIndices
  const gearInspectorMatchingRecipeIndices = gearInspectorFilterResult.matchingRecipeIndices
  const chipMatchingRecipeIndices = previewMode === 'gearInspector'
    ? gearInspectorMatchingRecipeIndices
    : matchingRecipeIndices
  const previewFilterActive = previewMode === 'gearInspector'
    ? (gearInspectorFilterActive || gearInspectorRecipeFilterActive)
    : (filterActive || gearInspectorRecipeFilterActive)
  const filtersDirty = (previewMode === 'gearInspector' ? gearInspectorFilterActive : filterActive)
    || limitRecipesToFiltered
    || gearInspectorRecipeFilterMode !== GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT
  // In safeguard mode, derive which recipe indices are "interesting" from the safeguard-filtered
  // gear rows so that the HSF rules table can be narrowed to the same scope.
  const safeguardMatchingRecipeIndexSet = useMemo<Set<number> | null>(() => {
    if (builderMode !== 'safeguard' || gearInspectorRecipeFilterMode === 'off') return null
    const activeKeySet = gearInspectorRecipeFilterMode === 'first'
      ? safeguardSelectedRuleItemKeySet
      : safeguardAnyMatchItemKeySet
    if (!activeKeySet) return null
    const recipeSet = new Set<number>()
    for (const row of gearEntriesAfterRulesFilter) {
      if (!activeKeySet.has(getSafeguardItemKey(row.artifact))) continue
      if (row.match?.recipeIdx != null) recipeSet.add(row.match.recipeIdx)
      for (const idx of row.matchingRecipeIndices ?? []) recipeSet.add(idx)
    }
    return recipeSet
  }, [builderMode, gearInspectorRecipeFilterMode, safeguardSelectedRuleItemKeySet, safeguardAnyMatchItemKeySet, gearEntriesAfterRulesFilter])
  const hsfRulesForTable = useMemo(() => {
    const baseRules = filterActive ? filteredRules : mergedRules
    const activeSet = builderMode === 'safeguard' ? safeguardMatchingRecipeIndexSet : gearInspectorRecipeFilterSelectedSet
    if (!activeSet || activeSet.size === 0) return baseRules
    return baseRules.filter((rule) => {
      const recipeIdx = getRuleRecipeIndex(rule)
      return recipeIdx !== null && activeSet.has(recipeIdx)
    })
  }, [builderMode, filterActive, filteredRules, mergedRules, safeguardMatchingRecipeIndexSet, gearInspectorRecipeFilterSelectedSet])
  const hsfRulesForTableRef = useRef(hsfRulesForTable)
  useEffect(() => { hsfRulesForTableRef.current = hsfRulesForTable }, [hsfRulesForTable])
  const hsfTableEmptyDueToFilters = (filterActive || gearInspectorRecipeFilterActive) && mergedRules.length > 0 && hsfRulesForTable.length === 0
  const gearInspectorArtifactIdBySafeguardItemKey = useMemo(() => {
    const byItemKey = new Map<number, number>()
    for (const row of gearInspectorPreviewRows) {
      const artifactId = Number(row.artifact?.id)
      if (!Number.isFinite(artifactId)) continue
      const itemKey = getSafeguardItemKey(row.artifact)
      if (!Number.isFinite(itemKey)) continue
      if (!byItemKey.has(itemKey)) {
        byItemKey.set(itemKey, artifactId)
      }
    }
    return byItemKey
  }, [gearInspectorPreviewRows])
  const openLogicHubSafeguardRule = useCallback((ruleId: string): boolean => {
    const normalizedRuleId = typeof ruleId === 'string' ? ruleId.trim() : ''
    if (normalizedRuleId.length === 0) return false
    // Safeguard jumps should not leave a stale Gear Inspector focus request queued.
    setGearInspectorArtifactFocusRequest(null)
    // Switch to Safeguard Builder mode and select the targeted rule inline.
    setBuilderMode('safeguard')
    // Load the rule into the draft builder so controls update immediately;
    // handleSelectSafeguardRule also auto-applies any pending draft changes first.
    handleSelectSafeguardRule(normalizedRuleId)
    // Request SafeguardChipsPanel to scroll the targeted chip into view.
    const token = ++safeguardFocusTokenRef.current
    setSafeguardFocusRequest({ ruleId: normalizedRuleId, token })
    return true
  }, [handleSelectSafeguardRule])
  const handleSafeguardPreviewStarSelect = useCallback((selection: SafeguardStarSelection) => {
    const normalizedRuleId = typeof selection.safeguardRuleId === 'string' ? selection.safeguardRuleId.trim() : ''
    // Missing ids can happen with malformed/legacy rows; still route users into Safeguard Builder.
    if (normalizedRuleId.length === 0) {
      setGearInspectorArtifactFocusRequest(null)
      setBuilderMode('safeguard')
      return
    }
    // Prefer the clicked row's concrete item-key so we can scroll directly to it in Gear Inspector.
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
    const targetArtifactId = gearInspectorArtifactIdBySafeguardItemKey.get(clickedItemKey) ?? null
    if (targetArtifactId != null) {
      // Concrete safeguards have real gear to inspect, so jump to Gear Inspector immediately.
      setLogicHubOpen(false)
      setPreviewMode('gearInspector')
      gearInspectorArtifactFocusTokenRef.current += 1
      setGearInspectorArtifactFocusRequest({
        artifactId: targetArtifactId,
        token: gearInspectorArtifactFocusTokenRef.current,
      })
      return
    }
    // No real gear was resolved for this safeguard, so open Safeguard Builder.
    openLogicHubSafeguardRule(normalizedRuleId)
  }, [openLogicHubSafeguardRule, setLogicHubOpen, setPreviewMode, gearInspectorArtifactIdBySafeguardItemKey])
  const handleGearInspectorFocusArtifactFilteredOut = useCallback(() => {
    // Keep the notification short because this only explains why auto-scroll did not occur.
    showToast(t('toastTesterFocusArtifactFiltered'), { icon: <HelpOutlineIcon fontSize="inherit" /> })
  }, [showToast, t])
  const handleGearInspectorRuleView = useCallback((ruleIndex: number, recipeIdx: number | null) => {
    setGearInspectorArtifactFocusRequest(null)
    const targetRule = mergedRulesRef.current[ruleIndex]
    if (targetRule?.__source === RULE_SOURCE_SAFEGUARDS) {
      const safeguardRuleId = typeof targetRule.__safeguardRuleId === 'string'
        ? targetRule.__safeguardRuleId
        : ''
      // Safeguard matches should switch to Safeguard Builder mode instead of opening LogicHub.
      if (openLogicHubSafeguardRule(safeguardRuleId)) return
      // Malformed safeguard rows can miss ids; still route into Safeguard Builder.
      setBuilderMode('safeguard')
      return
    }
    // Recipe matches should switch to Recipe Builder mode.
    setBuilderMode('recipe')
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
  }, [openLogicHubSafeguardRule, setBuilder, setBuilderMode, setFocusRuleIndex, setPreviewMode, setLogicHubOpen, syncSelectedRecipeIdx])
  const handleGearInspectorRuleTemplateCreate = useCallback((row: GearInspectorPreviewRow, intent: 'keep' | 'sell') => {
    const artifact = row.artifact
    // Build the baseline template based on level, rolls, and the item’s current stats.
    const baseRecipe = buildGearInspectorRuleTemplateRecipe({ artifact, intent })
    // Slot label is localized via the canonical i18n keys.
    const slotLabel = t(artifactTypeI18nKey(artifact.slot))
    // Pull the localized set name when available.
    const setLabelRaw = formatGearInspectorSetLabel({
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
    if (previewMode === 'gearInspector' && gearInspectorRecipeFilterMode === 'off') {
      customRecipes.forEach((recipe, idx) => {
        if (recipe?.exportMode === 'separator') {
          indices.add(idx)
        }
      })
    }
    return indices
  }, [chipMatchingRecipeIndices, customRecipes, limitRecipesToFiltered, previewMode, gearInspectorRecipeFilterMode])
  visibleRecipeIndicesRef.current = visibleRecipeIndices
  // In safeguard builder mode, limitRecipesToFiltered hides safeguard rule chips that have no
  // matching items in the current (possibly recipe-filtered) gear table.
  const visibleSafeguardRuleIds = useMemo<Set<string> | null>(() => {
    if (!limitRecipesToFiltered || builderMode !== 'safeguard') return null
    if (!safeguardDetection?.entries?.length) return new Set()
    const gearItemKeySet = new Set<number>()
    for (const row of gearEntriesForTable) gearItemKeySet.add(getSafeguardItemKey(row.artifact))
    const visible = new Set<string>()
    for (const entry of safeguardDetection.entries) {
      if (!entry.ruleId) continue
      for (const key of entry.itemKeys) {
        if (gearItemKeySet.has(key)) { visible.add(entry.ruleId); break }
      }
    }
    return visible
  }, [limitRecipesToFiltered, builderMode, safeguardDetection, gearEntriesForTable])
  // Keep the ref in sync so shift-click in useSafeguardSelection reads the latest visible set.
  visibleSafeguardRuleIdsRef.current = visibleSafeguardRuleIds
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
    setGearInspectorRecipeFilterMode(GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT)
    scrollSelectedRecipeIntoView()
  }, [scrollSelectedRecipeIntoView, setLimitRecipesToFiltered, setRulesFilter, setGearInspectorRecipeFilterMode])
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
    customRecipes,
    editingRecipeIndex,
    evaluateRecipeAgainstFilters,
    filterActive,
    limitRecipesToFiltered,
    recipeOverridesInstructions,
    normalizeRecipeTags,
  ])

  const builderInsertBecomesGearInspectorFirstMatch = useCallback((targetIndex: number): boolean => {
    // Gear Inspector preview mode: the chip filter is driven by the set of recipes that are the *first match*
    // for at least one Gear Inspector row that survives the Gear Inspector filters.
    if (!limitRecipesToFiltered) return true
    // Apply recipe overrides before testing the export mode.
    const builderEffective = resolveRecipeOverridesEffectiveRecipe(builder, recipeOverridesInstructions)
    const builderExportMode = builderEffective.exportMode
    if (builderExportMode === 'disabled') return false
    // In Gear Inspector mode, separators are always shown when recipe filtering is off (anchor chips remain visible).
    if (builderExportMode === 'separator' && gearInspectorRecipeFilterMode === 'off') return true
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
      if (evaluateFirst(rulesForBuilder, row.artifact.gearInspectorItem)) return true
    }
    return false
  }, [
    builder,
    recipeOverridesInstructions,
    effectiveSubstatTargets,
    limitRecipesToFiltered,
    metasets,
    gearInspectorRecipeFilterMode,
    gearEntriesAfterRulesFilter,
  ])

  const insertHiddenByFilters = useMemo(() => {
    if (!limitRecipesToFiltered) return false
    if (previewMode === 'gearInspector') {
      return !builderInsertBecomesGearInspectorFirstMatch(prospectiveInsertIndex)
    }
    return !builderInsertMatchesRuleFilters
  }, [
    builderInsertBecomesGearInspectorFirstMatch,
    builderInsertMatchesRuleFilters,
    limitRecipesToFiltered,
    previewMode,
    prospectiveInsertIndex,
  ])

  const saveHiddenByFilters = useMemo(() => {
    if (!limitRecipesToFiltered) return false
    if (editingRecipeIndex === null) return false
    if (previewMode === 'gearInspector') {
      return !builderInsertBecomesGearInspectorFirstMatch(editingRecipeIndex)
    }
    return !builderSaveMatchesRuleFilters
  }, [
    builderInsertBecomesGearInspectorFirstMatch,
    builderSaveMatchesRuleFilters,
    editingRecipeIndex,
    limitRecipesToFiltered,
    previewMode,
  ])

  // Endpoint pushes that mutate Gear Inspector/preview state must run in strict sequence.
  type EndpointPushCommand = Extract<ExternalCommand, {
    kind:
      | 'gearDbFileBinary'
      // Per-type messages that build up a synthetic snapshot through accumulation.
      | 'gearDbArtifacts'
      | 'gearDbChampions'
      | 'gearDbInboxArtifacts'
      | 'gearDbLastUsed'
  }>
  // Queue stores push commands while a prior push is still settling.
  const endpointPushQueueRef = useRef<EndpointPushCommand[]>([])
  // Guard ensures only one queue-drain loop runs at a time.
  const endpointPushDrainInFlightRef = useRef(false)
  // Cleanup flag prevents post-unmount queue work.
  const endpointPushQueueClosedRef = useRef(false)
  // Animation-frame helper allows waiting for paint/commit boundaries.
  const waitForAnimationFrame = useCallback(() => (
    new Promise<void>((resolve) => {
      if (typeof window === 'undefined') {
        resolve()
        return
      }
      window.requestAnimationFrame(() => resolve())
    })
  ), [])
  // Wait for worker + preview/Gear Inspector commits before processing the next push.
  const waitForEndpointPushSettle = useCallback(async () => {
    // Let React commit immediate state updates before polling pipeline refs.
    await waitForAnimationFrame()
    const startedAt = Date.now()
    while (!endpointPushQueueClosedRef.current) {
      // Pending debounce/abort refs indicate the worker pipeline still has queued work.
      const pipelinePending = pipelineDebounceRef.current !== null || pipelineAbortRef.current !== null
      // Build flags reflect in-flight worker + result commits.
      const buildPending = rulesBuildingRef.current || gearEntriesBuildingRef.current
      // Gear Inspector commit id should never trail the latest requested token once idle.
      const latestToken = rulesBuildingTokenRef.current ?? 0
      const gearInspectorCommitCaughtUp = gearEntriesCommittedBuildIdRef.current >= latestToken
      if (!pipelinePending && !buildPending && gearInspectorCommitCaughtUp) break
      if (Date.now() - startedAt >= ENDPOINT_PUSH_SETTLE_TIMEOUT_MS) break
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, ENDPOINT_PUSH_SETTLE_POLL_MS)
      })
    }
    // Give HSF preview + Gear Inspector grid one extra paint turn before dequeuing.
    await waitForAnimationFrame()
    await waitForAnimationFrame()
  }, [waitForAnimationFrame])
  // Apply one queued endpoint push and wait for full pipeline/UI settle.
  const applyEndpointPushCommand = useCallback(async (cmd: EndpointPushCommand) => {
    if (cmd.kind === 'gearDbFileBinary') {
      // Destructure before File construction so the local refs go out of scope
      // at the end of this block — before the long settle wait begins.
      const { name, bytes, contentType } = cmd
      // File's ctor copies data into internal Blob storage; the original buffer
      // is now redundant. Release the reference so GC can reclaim it during the
      // settle wait instead of holding both copies alive for up to 15 s.
      ;(cmd as { bytes: Uint8Array | null }).bytes = null
      const file = createGearDbFileFromBytes(name, bytes, contentType)
      if (!file) {
        if (import.meta.env.DEV) {
          console.error('Failed to decode gear DB binary payload from external command.')
        }
        return
      }
      await handleGearDbImport(file, { source: 'command' })
      await waitForEndpointPushSettle()
    }
    // Per-type partial messages — each one immediately synthesizes a snapshot from the
    // accumulated parts, so every arrival triggers a Gear Inspector update.
    if (
      cmd.kind === 'gearDbArtifacts'
      || cmd.kind === 'gearDbChampions'
      || cmd.kind === 'gearDbInboxArtifacts'
      || cmd.kind === 'gearDbLastUsed'
    ) {
      handleGearDbRawPart(cmd)
      await waitForEndpointPushSettle()
    }
  }, [
    handleGearDbImport,
    handleGearDbRawPart,
    waitForEndpointPushSettle,
  ])
  // Drain queue sequentially so each push fully settles before the next starts.
  const drainEndpointPushQueue = useCallback(async () => {
    if (endpointPushDrainInFlightRef.current) return
    endpointPushDrainInFlightRef.current = true
    try {
      while (!endpointPushQueueClosedRef.current) {
        const next = endpointPushQueueRef.current.shift()
        if (!next) break
        try {
          // Coalesce consecutive per-type messages: if more part commands are
          // queued right after this one, merge only the ref slot here and skip
          // the snapshot/settle cycle — the burst is not complete yet.
          // This avoids triggering the worker N times for a single 4-part burst.
          const isPartCmd = (
            next.kind === 'gearDbArtifacts'
            || next.kind === 'gearDbChampions'
            || next.kind === 'gearDbInboxArtifacts'
            || next.kind === 'gearDbLastUsed'
          )
          if (isPartCmd) {
            const queueHead = endpointPushQueueRef.current[0]
            const morePartsFollow = queueHead && (
              queueHead.kind === 'gearDbArtifacts'
              || queueHead.kind === 'gearDbChampions'
              || queueHead.kind === 'gearDbInboxArtifacts'
              || queueHead.kind === 'gearDbLastUsed'
            )
            if (morePartsFollow) {
              // Accumulate without processing; let the final burst element trigger the snapshot.
              const parts = gearDbRawPartsRef.current
              if (next.kind === 'gearDbArtifacts') parts.artifacts = next.artifacts
              else if (next.kind === 'gearDbChampions') parts.champions = next.champions
              else if (next.kind === 'gearDbInboxArtifacts') parts.inboxArtifacts = next.inboxArtifacts
              else parts.lastUsed = next.lastUsed
              continue
            }
          }
          await applyEndpointPushCommand(next)
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error('Failed to process endpoint push command', err)
          }
        }
      }
    } finally {
      endpointPushDrainInFlightRef.current = false
      // Commands may have arrived after the final shift; drain again if needed.
      if (!endpointPushQueueClosedRef.current && endpointPushQueueRef.current.length > 0) {
        void drainEndpointPushQueue()
      }
    }
  }, [applyEndpointPushCommand])
  // Queue ingress helper used by the external command dispatcher.
  const enqueueEndpointPush = useCallback((cmd: EndpointPushCommand) => {
    // Each gearDbFileBinary is a complete SQLite snapshot that supersedes any
    // pending copies waiting in the tail of the queue. Discard that trailing
    // run to avoid accumulating N large Uint8Array buffers simultaneously.
    if (cmd.kind === 'gearDbFileBinary') {
      const queue = endpointPushQueueRef.current
      let coalesceTo = -1
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const entry = queue[i]
        // Bounds guard: noUncheckedIndexedAccess makes array[i] T | undefined.
        if (!entry) break
        // Full-snapshot binary entries are superseded by the incoming binary.
        if (entry.kind === 'gearDbFileBinary') { coalesceTo = i; continue }
        // Per-type part commands are superseded by an incoming full binary.
        if (
          entry.kind === 'gearDbArtifacts'
          || entry.kind === 'gearDbChampions'
          || entry.kind === 'gearDbInboxArtifacts'
          || entry.kind === 'gearDbLastUsed'
        ) { coalesceTo = i; continue }
        break
      }
      // Remove the superseded suffix so its Uint8Array buffers can be GC'd.
      if (coalesceTo >= 0) queue.splice(coalesceTo)
    }
    endpointPushQueueRef.current.push(cmd)
    void drainEndpointPushQueue()
  }, [drainEndpointPushQueue])
  // Ensure queue state does not survive component teardown.
  useEffect(() => {
    // Reset the closed flag on mount (StrictMode may run cleanup/effect twice).
    endpointPushQueueClosedRef.current = false
    return () => {
      endpointPushQueueClosedRef.current = true
      endpointPushQueueRef.current = []
    }
  }, [])

  // Capture as a stable primitive so the useCallback dep array stays tight.
  const tutorialOpen = tutorial.tutorialOpen
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

    // Block gear-DB pushes while the tutorial is running.
    // The tutorial manages its own gear items; an endpoint push would corrupt that state.
    // selectRule (above) is left through since it only affects scroll position.
    if (tutorialOpen) return

    if (cmd.kind === 'gearDbFileBinary') {
      enqueueEndpointPush(cmd)
      return
    }

    // Per-type messages must be queued too so they are processed in arrival order
    // and do not interleave with concurrent snapshot / delta / file commands.
    if (cmd.kind === 'gearDbArtifacts') {
      enqueueEndpointPush(cmd)
      return
    }
    if (cmd.kind === 'gearDbChampions') {
      enqueueEndpointPush(cmd)
      return
    }
    if (cmd.kind === 'gearDbInboxArtifacts') {
      enqueueEndpointPush(cmd)
      return
    }
    if (cmd.kind === 'gearDbLastUsed') {
      enqueueEndpointPush(cmd)
      return
    }
  }, [
    enqueueEndpointPush,
    focusRuleByIndex,
    requestSelectionScroll,
    tutorialOpen,
  ])

  const { sendRequest: sendExternalRequest } = useExternalCommands({
    pushEndpoint,
    onCommand: handleExternalCommand,
    onReachabilityChange: updatePushEndpointReachable,
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
    // Resetting metasets can rewrite many safeguard combinations.
    setSafeguardRulesTransition((prev) => {
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
    // Resetting metasets can rewrite many recipes; keep off urgent lane.
    setCustomRecipesTransition((prev) => {
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
    // Replace the metaset catalog via the same centralized transition dispatcher.
    setMetasetsTransition(defaults)
  }, [areSetEntriesEqual, describeNextChange, mergeSelectionsWithMetasets, metasets, setBuilder, setCustomRecipesTransition, setMetasetsTransition, setSafeguardRulesTransition])

  // SafeguardBuilderPanel — shown in place of BuilderPanel when builderMode === 'safeguard'.
  const selectedSafeguardRuleIndex = selectedSafeguardRuleId !== null
    ? safeguardRules.findIndex((r) => r.id === selectedSafeguardRuleId)
    : -1
  // True when the builder's content differs from the currently-selected rule's saved state.
  // Mirrors the selectedIsDirty pattern used by the recipe builder.
  const safeguardBuilderIsDirty = useMemo(() => {
    if (selectedSafeguardRuleId === null) return false
    const selectedRule = safeguardRules.find((r) => r.id === selectedSafeguardRuleId)
    if (!selectedRule) return false
    return JSON.stringify(createSafeguardRuleContentSnapshot(safeguardBuilder))
      !== JSON.stringify(createSafeguardRuleContentSnapshot(selectedRule))
  }, [safeguardBuilder, selectedSafeguardRuleId, safeguardRules])
  const safeguardBuilderPanelElement = (
    <SafeguardBuilderPanel
      rule={safeguardBuilder}
      onChange={setSafeguardBuilder}
      editingRuleId={selectedSafeguardRuleId}
      editingRuleIndex={selectedSafeguardRuleIndex >= 0 ? selectedSafeguardRuleIndex : null}
      metasets={metasets}
      substatColors={substatColors}
      useStatButtonColors={statButtonBorders}
      colorBlindMode={colorBlindMode}
      recipes={customRecipes}
      selectedIsDirty={safeguardBuilderIsDirty}
      onInsertSafeguard={handleInsertSafeguardFromBuilder}
      onApplySafeguard={handleApplySafeguardFromBuilder}
      onResetSafeguard={handleResetSafeguardBuilder}
      onScaffoldFromRecipe={handleScaffoldSafeguardFromRecipe}
      registerAutoApplyHandler={registerSafeguardAutoApplyHandler}
      onUndo={undo}
      onRedo={redo}
      canUndo={canUndo}
      canRedo={canRedo}
      undoPreview={undoPreview}
      redoPreview={redoPreview}
      historyTimeline={historyTimeline}
      onJumpToHistoryIndex={jumpToHistoryIndex}
      onRequestClearHistory={requestClearHistory}
      onManageMetasets={() => openMetasetsDialogRef.current()}
      multiEdit={safeguardMultiEditHandle}
      multiSelectedRules={multiSelectedSafeguardRules}
      onApplyMultiEdit={safeguardMultiselectActive ? applySafeguardMultiEditDraft : null}
    />
  )

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
        // Persisting a new recipe can rebuild large rule tables; transition the write.
        setCustomRecipesTransition(nextRecipes)
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
        // Saving builder edits rewrites the recipe list and can trigger expensive previews.
        setCustomRecipesTransition(prev => prev.map((c, i) => (i === selectedRecipeIdx ? nextRecipe : c)))
      }}
      registerAutoApplyHandler={registerAutoApplyHandler}
      metasets={metasets}
      onMetasetsChange={handleMetasetsChange}
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
        // Deleting a metaset can fan out into recipe/safeguard recalculation; keep non-urgent.
        handleMetasetsChange(prev => prev.filter(m => m.id !== id))

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
          setCustomRecipesTransition(prev => {
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
          setSafeguardRulesTransition((prev) => {
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
      onResetMetasets={handleResetMetasets}
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
      recipesExcludedByTotalLimit={recipesExcludedByTotalLimit}
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
      onRegisterOpenMetasetsDialog={(opener) => { openMetasetsDialogRef.current = opener }}
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

  // SafeguardChipsPanel — shown in place of RecipeChipsPanel when builderMode === 'safeguard'.
  const safeguardChipsPanelElement = (
    <SafeguardChipsPanel
      rules={safeguardRules}
      selectedRuleId={selectedSafeguardRuleId}
      onSelect={handleSelectSafeguardRule}
      onRulesChange={(next) => applySafeguardRulesChange(next)}
      maxHeightPx={safeguardChipsMaxHeight}
      isSideBySide={isSideBySide}
      containerRef={safeguardChipsContainerRef}
      visibleRuleIds={visibleSafeguardRuleIds}
      metasets={metasetsForPreview}
      substatColors={substatColors}
      focusRuleRequest={safeguardFocusRequest}
      selectedRuleIds={selectedSafeguardRuleIds}
      onRuleSelect={handleSafeguardRuleSelect}
      onRuleDelete={handleSafeguardRuleDelete}
      onRuleDuplicate={handleSafeguardRuleDuplicate}
      onRuleMoveUp={handleSafeguardRuleMoveUp}
      onRuleMoveDown={handleSafeguardRuleMoveDown}
      onRuleMoveTop={handleSafeguardRuleMoveTop}
      onRuleMoveBottom={handleSafeguardRuleMoveBottom}
      onDeleteSelected={handleSafeguardDeleteSelected}
      onSelectAll={handleSelectAllSafeguardRules}
      onClearSelection={handleClearSafeguardSelection}
      highlightDelete={highlightDeleteSafeguards}
      onHighlightDelete={setHoverDeleteSafeguards}
      deleteAllDisabled={safeguardDeleteAllDisabled}
      onPrepareDragSelection={prepareSafeguardDragSelection}
      onReorderRules={handleSafeguardRuleReorder}
    />
  )

  const recipeChipsPanelElement = (
    <RecipeChipsPanel
      containerRef={chipsContainerRef}
      recipes={recipeOverridesRecipesForRules}
      exportModeOverrides={recipeOverridesExportModes.modes}
      maxHeightPx={chipsMaxHeight}
      chipsAvailableHeight={chipsAvailableHeight}
      selectedIndices={selectedRecipeIndices}
      // Chip relabeling across large recipe lists is expensive; consume the deferred
      // metaset snapshot so picker clicks can paint before chip refresh work starts.
      metasets={metasetsForPreview}
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

  // Shared SFR payload shape used by direct loads and selective Shift imports.
  type SfrLoadPayload = {
    recipes: BuilderRecipe[]
    metasets: Metaset[]
    substatTargets: SubstatTargetTable
    selectedIndex: number | null
    note?: string
    finalSellRemainder: FinalSellRemainderConfig
    safeguardRules: SafeguardRule[]
    safeguardsEnabled: boolean
    recipesEnabled: boolean
  }

  // Merge strategy for metaset conflict handling when selective import uses merge mode.
  type MetasetConflictStrategy = 'keepCurrent' | 'useIncoming' | 'keepBoth'

  type PendingSfrLoadImport = {
    fileName: string
    payload: SfrLoadPayload
    selection: SfrImportSelection
    modes: SfrImportModes
  }

  const applySfrLoadResult = useCallback((
    fileName: string,
    payload: SfrLoadPayload,
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
      recipesEnabled: payloadRecipesEnabled,
    } = payload

    const loadDescriptor = createSfrLoadedDescriptor(fileName)
    const resolvedSel = typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < recipes.length
      ? selectedIndex
      : (recipes.length > 0 ? 0 : null)
    const rawNote = typeof note === 'string' ? note : ''
    const importedNote = rawNote.trim().length > 0 ? rawNote : null
    beginGearInspectorMatchReset('sfr')

    if (importedNote !== null) {
      // Mark this as an auto-open so the view dialog hides the edit button.
      setNoteAutoOpenedFromSfr(true)
      applyNoteChange(importedNote, { mode: 'import', publish: false })
      openNoteViewer()
    } else {
      applyNoteChange(null, { mode: 'import', publish: false })
      handleCloseNote()
    }
    // SFR files do not carry recipe overrides answers, so reset to defaults.
    setNoteRecipeOverridesAnswers({})
    // SFR files never store the disabled flag, so re-enable parsing.
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
      setRecipesEnabled(payloadRecipesEnabled)
      applyFinalSellChange(fsr, { mode: 'import', publish: false })
      // Always select first recipe on manual SFR load (index is not persisted in the file).
      syncSelectedRecipeIdx(resolvedSel, { forceSync: true, suppressDraft: true })
      if (resolvedSel !== null && recipes[resolvedSel]) {
        setBuilder(recipes[resolvedSel]!)
      }
      // Always land on the first safeguard rule when loading a file, and load its data into the builder.
      // Why: setSelectedSafeguardRuleId alone only updates the chip highlight; the builder draft must
      // also be replaced so the panel does not display stale state from the previous SFR.
      const firstSafeguardRule = safeguardRules.length > 0 ? safeguardRules[0]! : null
      setSelectedSafeguardRuleId(firstSafeguardRule?.id ?? null)
      if (firstSafeguardRule) setSafeguardBuilder(cloneSafeguardRule(firstSafeguardRule))
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
    setNoteAutoOpenedFromSfr,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setBuilder,
    setCustomRecipes,
    setLastExportSig,
    setMetasets,
    setNoteRecipeOverridesAnswers,
    setNoteRecipeOverridesDisabled,
    substatTargets,
    syncSelectedRecipeIdx,
    setSelectedSafeguardRuleId,
    setSafeguardBuilder,
    beginGearInspectorMatchReset,
  ])

  // Guard selective imports so skipping metasets cannot break recipe/safeguard references.
  const getSelectiveImportMetasetIssues = useCallback((
    selection: SfrImportSelection,
    payload: SfrLoadPayload,
  ) => getMetasetDependencyIssues({
    selection: {
      recipes: selection.recipes,
      safeguards: selection.safeguards,
      metasets: selection.metasets,
    },
    incomingMetasetIds: collectMetasetIds(payload.metasets),
    recipeMetasetIds: collectRecipeMetasetIds(payload.recipes),
    safeguardMetasetIds: collectSafeguardMetasetIds(payload.safeguardRules),
  }), [])

  // Resolve incoming SFR data with selection + merge settings.
  // Why: Shift-load applies only selected sections instead of replacing everything.
  const applySelectiveSfrLoad = useCallback((args: {
    fileName: string
    payload: SfrLoadPayload
    selection: SfrImportSelection
    modes: SfrImportModes
    metasetConflictStrategy?: MetasetConflictStrategy
  }): { deferredConflict: boolean } => {
    const { fileName, payload, selection, modes, metasetConflictStrategy } = args
    const issues = getSelectiveImportMetasetIssues(selection, payload)
    // Keep runtime guard in App even if dialog validation misses a stale update.
    if (issues.length > 0) return { deferredConflict: false }
    // Start from identity map; merge remaps update this for recipes/safeguards.
    const metasetIdMap = new Map<string, string>()
    let nextMetasets: Metaset[] | null = null
    if (selection.metasets) {
      if (modes.metasets === 'replace') {
        nextMetasets = payload.metasets
      } else {
        const prep = prepareSfrImport(metasets, payload.metasets, payload.recipes)
        if (prep.conflicts.length > 0 && !metasetConflictStrategy) {
          // Defer apply until the metaset conflict dialog resolves merge strategy.
          setPendingSfrLoadImport({ fileName, payload, selection, modes })
          setConflictIds(prep.conflicts)
          setImportIdMap(prep.idMap)
          setMetasetConflictOpen(true)
          return { deferredConflict: true }
        }
        const strategy: MetasetConflictStrategy = metasetConflictStrategy ?? 'keepCurrent'
        const { nextMetas, remapForConflicts } = finalizeImport(metasets, prep, strategy)
        nextMetasets = nextMetas
        for (const [sourceId, targetId] of prep.idMap) metasetIdMap.set(sourceId, targetId)
        for (const [sourceId, targetId] of remapForConflicts) metasetIdMap.set(sourceId, targetId)
      }
    }
    // Remap recipe metaset references after merge conflict decisions.
    const remappedRecipes = payload.recipes.map((recipe) => ({
      ...recipe,
      artifactMetaSets: (recipe.artifactMetaSets ?? []).map((id) => metasetIdMap.get(id) ?? id),
    }))
    // Remap safeguard metaset references through the same map.
    const remappedSafeguards = payload.safeguardRules.map((rule) => ({
      ...rule,
      combination: {
        ...rule.combination,
        metaSetIds: (rule.combination.metaSetIds ?? []).map((id) => metasetIdMap.get(id) ?? id),
      },
    }))
    // Track whether any section modifies recipe/Gear Inspector match behavior.
    const affectsRecipesOrSafeguards = selection.recipes || selection.safeguards
    if (affectsRecipesOrSafeguards) beginGearInspectorMatchReset('sfr')
    // Prefix the descriptor so history shows selective load context.
    describeNextChange(createSfrLoadedDescriptor(fileName))
    if (selection.metasets && nextMetasets !== null) {
      setMetasets(nextMetasets)
    }
    // Keep substat targets/final sell coupled to recipe imports.
    if (selection.recipes) {
      try {
        applySubstatTargetsChange(payload.substatTargets, { mode: 'import', publish: false })
      } catch {}
      applyFinalSellChange(payload.finalSellRemainder, { mode: 'import', publish: false })
      if (modes.recipes === 'replace') {
        setCustomRecipes(remappedRecipes)
        const selected = typeof payload.selectedIndex === 'number'
          && payload.selectedIndex >= 0
          && payload.selectedIndex < remappedRecipes.length
          ? payload.selectedIndex
          : (remappedRecipes.length > 0 ? 0 : null)
        syncSelectedRecipeIdx(selected, { forceSync: true, suppressDraft: true })
        if (selected !== null && remappedRecipes[selected]) {
          setBuilder(remappedRecipes[selected]!)
        }
      } else {
        setCustomRecipes((prev) => {
          const next = [...prev, ...remappedRecipes]
          return next
        })
        const selected = remappedRecipes.length > 0
          ? customRecipes.length + remappedRecipes.length - 1
          : selectedRecipeIdx
        if (selected !== null && remappedRecipes.length > 0) {
          syncSelectedRecipeIdx(selected, { forceSync: true, suppressDraft: true })
          setBuilder(remappedRecipes[remappedRecipes.length - 1]!)
        }
      }
    }
    if (selection.note) {
      const incomingNoteRaw = typeof payload.note === 'string' ? payload.note : ''
      if (modes.note === 'append') {
        const current = typeof sfrNote === 'string' ? sfrNote.trim() : ''
        const incoming = incomingNoteRaw.trim()
        const joined = current && incoming
          ? `${current}\n\n${incoming}`
          : (current || incoming || '')
        if (joined.length > 0) {
          setNoteAutoOpenedFromSfr(true)
          applyNoteChange(joined, { mode: 'import', publish: false })
          openNoteViewer()
        } else {
          applyNoteChange(null, { mode: 'import', publish: false })
          handleCloseNote()
        }
      } else {
        const importedNote = incomingNoteRaw.trim().length > 0 ? incomingNoteRaw : null
        if (importedNote !== null) {
          setNoteAutoOpenedFromSfr(true)
          applyNoteChange(importedNote, { mode: 'import', publish: false })
          openNoteViewer()
        } else {
          applyNoteChange(null, { mode: 'import', publish: false })
          handleCloseNote()
        }
      }
      // Shift-load note import still resets recipe-overrides answers to canonical defaults.
      setNoteRecipeOverridesAnswers({})
      setNoteRecipeOverridesDisabled(false)
    }
    if (selection.safeguards) {
      if (modes.safeguards === 'replace') {
        setSafeguardRules(remappedSafeguards)
        setSafeguardsEnabled(payload.safeguardsEnabled)
        setRecipesEnabled(payload.recipesEnabled !== false)
        // Replace mode wipes existing rules, so the old selection is always stale.
        // Load the first incoming rule into the builder draft to match the landing chip.
        const firstRemapped = remappedSafeguards.length > 0 ? remappedSafeguards[0]! : null
        setSelectedSafeguardRuleId(firstRemapped?.id ?? null)
        if (firstRemapped) setSafeguardBuilder(cloneSafeguardRule(firstRemapped))
      } else {
        setSafeguardRules((prev) => [...prev, ...remappedSafeguards])
        setSafeguardsEnabled((prev) => prev || payload.safeguardsEnabled)
        setRecipesEnabled((prev) => prev || payload.recipesEnabled !== false)
      }
    }
    markNextSnapshotAsSaved()
    setLastExportSig(null)
    exportBaselineResetRef.current = true
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => { markSavedNow() })
    } else {
      setTimeout(() => { markSavedNow() }, 0)
    }
    flushTransientUi()
    return { deferredConflict: false }
  }, [
    applyFinalSellChange,
    applyNoteChange,
    applySubstatTargetsChange,
    beginGearInspectorMatchReset,
    customRecipes.length,
    describeNextChange,
    finalizeImport,
    flushTransientUi,
    getSelectiveImportMetasetIssues,
    handleCloseNote,
    markNextSnapshotAsSaved,
    markSavedNow,
    metasets,
    openNoteViewer,
    prepareSfrImport,
    selectedRecipeIdx,
    setBuilder,
    setCustomRecipes,
    setConflictIds,
    setImportIdMap,
    setLastExportSig,
    setMetasetConflictOpen,
    setMetasets,
    setNoteAutoOpenedFromSfr,
    setNoteRecipeOverridesAnswers,
    setNoteRecipeOverridesDisabled,
    setPendingSfrLoadImport,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setSelectedSafeguardRuleId,
    setSafeguardBuilder,
    sfrNote,
    syncSelectedRecipeIdx,
  ])

  const importSfrFile = useCallback(async (file: File, context?: FileRouteContext) => {
    flushTransientUi()
    try {
      const result = await readSfrFile(file, { metasets, substatTargets })
      // Shift modifier opens selective import options instead of immediate full replace.
      if (context?.shiftKey) {
        setPendingSfrShiftDialogImport({ fileName: file.name, payload: result })
      } else {
        applySfrLoadResult(file.name, result)
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to parse recipe file (.sfr/.hsfc)', err)
      }
      showFileFormatError(file.name)
      flushTransientUi()
    }
  }, [
    applySfrLoadResult,
    flushTransientUi,
    metasets,
    setPendingSfrShiftDialogImport,
    substatTargets,
    showFileFormatError,
  ])

  const handleSfrFile = useCallback(async (file: File, context?: FileRouteContext) => {
    if (tutorial.helpOpen) {
      tutorial.setHelpOpen(false)
      tutorial.setHelpFirstRunMode(false)
      try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
    }
    if (restoreDialogPending) dismissRestore()
    if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
    await importSfrFile(file, context)
  }, [
    confirmClearOpen,
    confirmDeleteIdx,
    confirmDeleteTargets,
    dismissRestore,
    importSfrFile,
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

  const handleManualFileSelection = useCallback(async (file: File, context?: FileRouteContext) => {
    const routeContext: FileRouteContext = context?.shiftKey === undefined
      ? { source: context?.source ?? 'manual' }
      : { source: context?.source ?? 'manual', shiftKey: context.shiftKey }
    await routeFileByExtension(file, {
      onSfr: handleSfrFile,
      onHsf: handleHsfFile,
      onL10n: handleRuntimeCatalog,
      onGearDb: handleGearDbImport,
      onGearSets: handleRuntimeGearSets,
      onUnknownFile: handleUnknownImportedFile,
    }, routeContext)
  }, [
    handleGearDbImport,
    handleSfrFile,
    handleHsfFile,
    handleRuntimeCatalog,
    handleRuntimeGearSets,
    handleUnknownImportedFile,
  ])

  // Global file-drag overlay and file routing handled by hook.
  // During the tutorial all file drops are silently ignored so the user cannot
  // accidentally import data that would clobber tutorial-driven state.
  const { active: fileDragActive } = useFileDragDrop({
    onDragStart: () => {
      // Close context menus/popovers when a file drag starts so drop works cleanly.
      // Skip when the tutorial is open — the drop will be blocked anyway.
      if (!tutorial.tutorialOpen) {
        try { tutorial.closeAllTransientUi() } catch {}
      }
    },
    // Use `void` so the arrow function always returns void regardless of the branch taken.
    // Handlers that don't accept a context arg are called with file only.
    onSfr: (file, ctx) => { if (!tutorial.tutorialOpen) void handleSfrFile(file, ctx) },
    onHsf: (file) => { if (!tutorial.tutorialOpen) void handleHsfFile(file) },
    onL10n: (file) => { if (!tutorial.tutorialOpen) void handleRuntimeCatalog(file) },
    onGearDb: (file, ctx) => { if (!tutorial.tutorialOpen) void handleGearDbImport(file, ctx) },
    onGearSets: (file) => { if (!tutorial.tutorialOpen) void handleRuntimeGearSets(file) },
    onUnknownFile: (file) => { if (!tutorial.tutorialOpen) void handleUnknownImportedFile(file) },
  })

  // Track whether a note exists so we can open in view mode.
  const notePresent = Boolean(sfrNote && sfrNote.trim())

  // Builder mode toggle — switches between Recipe Builder and Safeguard Builder.
  const builderModeToggle = (
    <ToggleButtonGroup
      value={builderMode}
      exclusive
      size="small"
      onChange={(_e, next: 'recipe' | 'safeguard' | null) => {
        if (next != null) setBuilderMode(next)
      }}
      aria-label={t('builderModeRecipe') + ' / ' + t('builderModeSafeguard')}
      sx={{ height: 32 }}
    >
      <MarkdownTooltip markdown={t('builderModeRecipeTooltip')}>
        <ToggleButton value="recipe" sx={{ px: 2, whiteSpace: 'nowrap', minWidth: 120 }}>
          {t('builderModeRecipe')}
        </ToggleButton>
      </MarkdownTooltip>
      <MarkdownTooltip markdown={t('builderModeSafeguardTooltip')}>
        <ToggleButton value="safeguard" sx={{ px: 2, whiteSpace: 'nowrap', minWidth: 140 }}>
          {t('builderModeSafeguard')}
        </ToggleButton>
      </MarkdownTooltip>
    </ToggleButtonGroup>
  )

  // Builder panel header right side: optional Substat Targets + global Recipes/FinalSell/Safeguards/Tools controls.
  const fsEnabled = (finalSellRemainder.artifacts || finalSellRemainder.accessories) && (finalSellRemainder.levels?.length ?? 0) > 0
  const safeguardsDisabledWarningForBuilder = builderMode === 'safeguard' && !safeguardsEnabled && safeguardRules.length > 0
  const recipesDisabledWarningForBuilder = builderMode === 'recipe' && !recipesEnabled
  const substatTargetsElement = (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
      {/* Recipes global enable toggle */}
      <MarkdownTooltip markdown={t('recipesToggleTooltip')}>
        <ToggleButton
          value="recipesToggle"
          selected={recipesEnabled}
          size="small"
          onClick={() => applyRecipesEnabledChange(!recipesEnabled)}
          aria-label={t('recipesToggleLabel')}
          aria-pressed={recipesEnabled}
          sx={(theme) => {
            const baseColor = recipesDisabledWarningForBuilder ? theme.palette.error : theme.palette.success
            return {
              height: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
              px: 1.25,
              lineHeight: 1,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              borderColor: baseColor.main,
              color: baseColor.main,
              '&.Mui-selected': {
                color: baseColor.contrastText,
                backgroundColor: baseColor.main,
                '&:hover': { backgroundColor: baseColor.dark },
              },
              '&:hover': {
                borderColor: baseColor.dark,
                backgroundColor: alpha(baseColor.main, 0.08),
              },
            }
          }}
        >
          <EllipsisTooltip title={t('recipesToggleLabel')} selector="[data-ellipsis-target]" wrap="block">
            <Box component="span" data-ellipsis-target sx={{ ...ELLIPSIS_TEXT_SX, width: '100%', typography: 'button', textAlign: 'center', lineHeight: 1, display: 'block' }}>
              {t('recipesToggleLabel')}
            </Box>
          </EllipsisTooltip>
        </ToggleButton>
      </MarkdownTooltip>
      {/* Final Sell split button: toggle + configure */}
      <Box data-tour-id="finalsell.toggle" sx={{ display: 'flex', flexShrink: 0 }}>
        <MarkdownTooltip markdown={t('finalSellToggleTooltip')}>
          <ToggleButton
            value="finalSellToggle"
            selected={fsEnabled}
            size="small"
            onClick={() => {
              applyFinalSellChange((prev) => {
                const cur = prev ?? {
                  artifacts: true,
                  accessories: true,
                  levels: FINAL_SELL_DEFAULT_LEVELS.slice() as FinalSellLevel[],
                  setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
                }
                if (!fsEnabled) {
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
            aria-label={t('finalSellToggleLabel')}
            aria-pressed={fsEnabled}
            sx={(theme) => ({
              height: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
              px: 1.25,
              lineHeight: 1,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              borderRight: 'none',
              borderColor: theme.palette.warning.main,
              color: theme.palette.warning.main,
              '&.Mui-selected': {
                color: theme.palette.warning.contrastText,
                backgroundColor: theme.palette.warning.main,
                '&:hover': { backgroundColor: theme.palette.warning.dark },
              },
              '&:hover': {
                borderColor: theme.palette.warning.dark,
                backgroundColor: alpha(theme.palette.warning.main, 0.1),
              },
            })}
          >
            <EllipsisTooltip title={t('finalSellToggleLabel')} selector="[data-ellipsis-target]" wrap="block">
              <Box component="span" data-ellipsis-target sx={{ ...ELLIPSIS_TEXT_SX, width: '100%', typography: 'button', textAlign: 'center', lineHeight: 1, display: 'block' }}>
                {t('finalSellToggleLabel')}
              </Box>
            </EllipsisTooltip>
          </ToggleButton>
        </MarkdownTooltip>
        <MarkdownTooltip markdown={t('finalSellConfigureTooltip')}>
          <IconButton
            size="small"
            aria-label={t('finalSellConfigureTooltip')}
            onClick={() => {
              setLogicHubDialogTab(LOGIC_HUB_DIALOG_TAB_FINAL_SELL)
              setLogicHubOpen(true)
            }}
            sx={(theme) => ({
              height: SMALL_BUTTON_HEIGHT_PX,
              width: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
              borderRadius: `0 4px 4px 0`,
              border: `1px solid ${theme.palette.warning.main}`,
              color: theme.palette.warning.main,
              '&:hover': {
                borderColor: theme.palette.warning.dark,
                backgroundColor: alpha(theme.palette.warning.main, 0.1),
                color: theme.palette.warning.dark,
              },
            })}
          >
            <SettingsIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </MarkdownTooltip>
      </Box>
      {/* Safeguards global enable toggle */}
      <MarkdownTooltip markdown={t('safeguardsToggleTooltip')}>
        <ToggleButton
          value="safeguardsToggle"
          selected={safeguardsEnabled}
          size="small"
          onClick={() => applySafeguardsEnabledChange(!safeguardsEnabled)}
          aria-label={t('safeguardsToggleLabel')}
          aria-pressed={safeguardsEnabled}
          sx={(theme) => {
            const baseColor = safeguardsDisabledWarningForBuilder ? theme.palette.error : theme.palette.success
            return {
              height: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
              px: 1.25,
              lineHeight: 1,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              borderColor: baseColor.main,
              color: baseColor.main,
              '&.Mui-selected': {
                color: baseColor.contrastText,
                backgroundColor: baseColor.main,
                '&:hover': { backgroundColor: baseColor.dark },
              },
              '&:hover': {
                borderColor: baseColor.dark,
                backgroundColor: alpha(baseColor.main, 0.08),
              },
            }
          }}
        >
          <EllipsisTooltip title={t('safeguardsToggleLabel')} selector="[data-ellipsis-target]" wrap="block">
            <Box component="span" data-ellipsis-target sx={{ ...ELLIPSIS_TEXT_SX, width: '100%', typography: 'button', textAlign: 'center', lineHeight: 1, display: 'block' }}>
              {t('safeguardsToggleLabel')}
            </Box>
          </EllipsisTooltip>
        </ToggleButton>
      </MarkdownTooltip>
      {/* Tools button (formerly Logic Hub) */}
      <MarkdownTooltip markdown={t('gearDialogOpenTooltip')}>
        <Button
          size="small"
          variant="outlined"
          onClick={() => setLogicHubOpen(true)}
          aria-label={t('openLogicHubAria')}
          data-tour-id="builder.tools-button"
          sx={{
            whiteSpace: 'nowrap',
            height: SMALL_BUTTON_HEIGHT_PX,
            minHeight: SMALL_BUTTON_HEIGHT_PX,
            px: 1.25,
            lineHeight: 1,
            textTransform: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {t('titleLogicHub')}
        </Button>
      </MarkdownTooltip>
    </Stack>
  )

  // SFR load/save/copy controls surfaced at the top of the builder column.
  const headerActionsElement = (
    <HeaderActions
      onAboutToOpenSfr={() => {
        markSavedNow()
      }}
      onSelectFile={handleManualFileSelection}
      onSaveSfr={() => {
        persistRuntimeGearSetsNow()
        const payload = buildSfrPayload({
          version: APP_VERSION,
          metasets,
          substatTargets,
          recipes: customRecipes,
          finalSellRemainder,
          ...(sfrNote ? { note: sfrNote } : {}),
          safeguardRules,
          safeguardsEnabled,
          recipesEnabled,
        })
        const blob = sfrToBlob(payload)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = sfrFilename()
        a.click()
        URL.revokeObjectURL(url)
        showToast(t('toastRecipesSaved'))
        markSavedNow()
      }}
      onOpenNote={() => { notePresent ? openNoteViewerManual() : openNoteEditorManual() }}
      notePresent={notePresent}
      count={builderMode === 'safeguard' ? safeguardRules.length : customRecipes.length}
      selectedCount={builderMode === 'safeguard' ? selectedSafeguardRuleIds.length : selectedRecipeIndices.length}
      visibleCount={builderMode === 'safeguard' ? safeguardRules.length : visibleRecipeCount}
      {...(builderMode === 'safeguard' ? {
        // Compute the safeguard-specific chip label with the same "N of M" selection pattern used
        // for recipes, but substituting safeguard-singular/plural words via recipesSelectedCount key.
        chipLabel: (() => {
          const n = safeguardRules.length
          const word = n === 1 ? t('safeguardOne') : t('safeguardMany')
          const sel = selectedSafeguardRuleIds.length
          if (sel >= 2 && sel < n) return t('recipesSelectedCount', { selected: sel, total: n, word })
          return `${n}\u00a0${word}`
        })(),
      } : {})}
      sfrDirty={isDirty}
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
        setPendingSfrLoadImport(null)
        setConflictIds([])
      }}
      onChoose={(choice) => {
        try {
          if (pendingSfrLoadImport) {
            applySelectiveSfrLoad({
              fileName: pendingSfrLoadImport.fileName,
              payload: pendingSfrLoadImport.payload,
              selection: pendingSfrLoadImport.selection,
              modes: pendingSfrLoadImport.modes,
              metasetConflictStrategy: choice,
            })
            return
          }
          if (!pendingImport) {
            setMetasetConflictOpen(false)
            return
          }
          const prep = prepareSfrImport(metasets, pendingImport.metasets, pendingImport.recipes)
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
          const shouldApplyNote = !normalizeNoteValue(sfrNote) && Boolean(normalizeNoteValue(incomingNote))
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
          setRecipesEnabled(pendingImport.recipesEnabled !== false)
        } finally {
          setMetasetConflictOpen(false)
          setPendingImport(null)
          setPendingSfrLoadImport(null)
          setConflictIds([])
        }
      }}
    />
  ) : null

  const sfrImportOptionsDialogElement = pendingSfrShiftDialogImport ? (
    <SfrImportOptionsDialog
      open={Boolean(pendingSfrShiftDialogImport)}
      fileName={pendingSfrShiftDialogImport.fileName}
      incomingRecipes={pendingSfrShiftDialogImport.payload.recipes}
      incomingNote={typeof pendingSfrShiftDialogImport.payload.note === 'string' ? pendingSfrShiftDialogImport.payload.note : null}
      incomingMetasets={pendingSfrShiftDialogImport.payload.metasets}
      incomingSafeguards={pendingSfrShiftDialogImport.payload.safeguardRules}
      onCancel={() => {
        setPendingSfrShiftDialogImport(null)
      }}
      onConfirm={(selection, modes) => {
        const pending = pendingSfrShiftDialogImport
        if (!pending) return
        const result = applySelectiveSfrLoad({
          fileName: pending.fileName,
          payload: pending.payload,
          selection,
          modes,
        })
        // Keep dialog closed after confirm even when conflict dialog opens next.
        // Why: conflict choice is the follow-up step for the same import action.
        setPendingSfrShiftDialogImport(null)
        if (!result.deferredConflict) {
          setPendingSfrLoadImport(null)
        }
      }}
    />
  ) : null

  // Manual paste dialog for SFR snippets.
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

  const runSellfileExportNow = useCallback(async () => {
    // Default export always serializes the active in-app ruleset.
    // Dedupe-by-default is already applied in the pre-safeguard pipeline.
    const payload = buildExportPayload()
    const blob = hsfToBlob(payload)
    const filename = sellfileFilename()
    const target = pushExportEndpoint
    if (target) {
      let pushToast: 'success' | 'failure' | null = null
      try {
        // Serialize once so WS upload payloads match the downloaded sellfile body.
        const payloadText = await blob.text()
        // Send the upload command using the shared endpoint compatibility shim.
        const response = await sendExternalRequest(EXTERNAL_WS_METHOD_UPLOAD_SELLFILE, {
          name: filename,
          contentType: blob.type || 'application/json',
          data: payloadText,
        })
        if (response.ok) {
          // A successful request proves endpoint reachability for later pushes.
          updatePushEndpointReachable(true)
          pushToast = 'success'
          setLastExportSig(hsfExportStateSig)
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
        updatePushEndpointReachable(false)
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
    // Local export path mirrors prior behavior and keeps push optional.
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setLastExportSig(hsfExportStateSig)
    showToast(t('toastSellfileSaved'))
  }, [
    buildExportPayload,
    hsfExportStateSig,
    pushExportEndpoint,
    sendExternalRequest,
    updatePushEndpointReachable,
    showToast,
    t,
  ])
  const handleExportSellfile = useCallback(() => {
    // No rules means both push/download should be a no-op.
    if (!exportRulesCountRef.current) return
    // Queue while pipeline work is pending so the payload reflects latest edits.
    if (queueSellfileExportIfNeeded()) return
    void runSellfileExportNow()
  }, [queueSellfileExportIfNeeded, runSellfileExportNow])
  useEffect(() => {
    // No queued request means nothing to flush.
    if (!queuedSellfileExport) return
    // Worker still busy; wait for the next state change.
    if (isSellfileExportBlockedByWorker()) return
    // Run on the next frame so transition commits land before payload capture.
    const frameId = window.requestAnimationFrame(() => {
      if (isSellfileExportBlockedByWorker()) return
      // Clear queue first so re-clicks during export can queue another action.
      setQueuedSellfileExport(false)
      if (!exportRulesCountRef.current) return
      void runSellfileExportNow()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [
    isSellfileExportBlockedByWorker,
    queuedSellfileExport,
    runSellfileExportNow,
  ])

  return (
    <Container maxWidth="xl" sx={{ pt: 1.5, pb: 1.5 }}>
      {/* Full-screen, non-interactive overlay shown while dragging files over the app.
          We keep pointerEvents: 'none' so drops still reach the window handler. */}
      {(() => {
        // Suppress overlay during tutorial — drops are blocked so the overlay would be misleading.
        const dragOverlayVisible = fileDragActive && !tutorial.tutorialOpen && !confirmClearOpen && confirmDeleteIdx === null && confirmDeleteTargets === null
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
        '.chips-dragging [data-recipe-chip="true"], .chips-dragging [data-recipe-chip="true"] *, .chips-dragging [data-safeguard-chip="true"], .chips-dragging [data-safeguard-chip="true"] *': {
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
          title={builderModeToggle}
          substatTargets={substatTargetsElement}
          builderPanel={
            // Always mount both builder panels; hide the inactive one with display:none so
            // the layout is already settled when the mode switch happens (no cascading reflows).
            <>
              <Box sx={{ display: builderMode === 'safeguard' ? undefined : 'none' }}>{safeguardBuilderPanelElement}</Box>
              <Box sx={{ display: builderMode === 'recipe' ? undefined : 'none' }}>{builderPanelElement}</Box>
            </>
          }
          headerActions={headerActionsElement}
          metasetConflictDialog={metasetConflictDialogElement}
          recipeChipsPanel={
            // Always mount both chips panels. Chips wrappers use display:flex so the
            // inner panel's flexGrow fills the available column space correctly.
            <>
              <Box sx={{ display: builderMode === 'safeguard' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>{safeguardChipsPanelElement}</Box>
              <Box sx={{ display: builderMode === 'recipe' ? 'flex' : 'none', flex: 1, flexDirection: 'column', minHeight: 0 }}>{recipeChipsPanelElement}</Box>
            </>
          }
          pasteDialog={builderMode === 'safeguard' ? null : pasteDialogElement}
          copyDialog={builderMode === 'safeguard' ? null : copyDialogElement}
        />

        <Paper ref={previewPaperRef} sx={{
          p: PREVIEW_PAPER_PADDING_UNITS,
          position: 'relative',
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
          {/* Transparent top-75% overlay — tutorial can spotlight the mode toggle + gear grid
              without covering the full paper height. */}
          <Box
            data-tour-id="preview.paper-top"
            sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '25%', pointerEvents: 'none', zIndex: 1 }}
          />
        <PreviewHeaderActions
        mergedCount={totalLimitHit ? Number.POSITIVE_INFINITY : mergedRules.length}
        {...(filterActive ? { filteredCount: totalLimitHit ? Number.POSITIVE_INFINITY : filteredRules.length } : {})}
        filterActive={previewFilterActive}
        filtersDirty={filtersDirty}
        filterOpen={filterOpen}
        building={rulesBuilding}
        gearInspectorBuilding={gearInspectorBuilding}
        workloadProgressRatio={workloadProgressRatio}
        limitHit={totalLimitHit}
        gearInspectorOutcomeSummary={gearInspectorOutcomeSummaryForPreview}
        gearInspectorOutcomeSummaryTotal={gearInspectorOutcomeSummary}
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
        onExport={handleExportSellfile}
        exportDisabled={!mergedRules.length}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
	        gearInspectorSubstatSort={gearInspectorSubstatSortPrefs.state}
	        useStatButtonColors={statButtonBorders}
	        substatColors={substatColors}
	        onClearGearInspectorSubstatSort={gearInspectorSubstatSortPrefs.clear}
	        onSetGearInspectorSubstatSortState={setGearInspectorSubstatSortState}
		        onSetGearInspectorSubstatSortDirection={gearInspectorSubstatSortPrefs.setDirection}
		        onToggleGearInspectorArtifactGroupBySet={gearInspectorSubstatSortPrefs.toggleArtifactGroupBySet}
		        onToggleGearInspectorArtifactGroupBySlot={gearInspectorSubstatSortPrefs.toggleArtifactGroupBySlot}
		        onToggleGearInspectorAccessoryGroupByFaction={gearInspectorSubstatSortPrefs.toggleAccessoryGroupByFaction}
		        onToggleGearInspectorAccessoryGroupBySet={gearInspectorSubstatSortPrefs.toggleAccessoryGroupBySet}
		        onToggleGearInspectorAccessoryGroupBySlot={gearInspectorSubstatSortPrefs.toggleAccessoryGroupBySlot}
		        onToggleGearInspectorGroupingHeaders={gearInspectorSubstatSortPrefs.toggleHideHeaders}
		        onToggleGearInspectorSubstatSortExcludeGlyphs={gearInspectorSubstatSortPrefs.toggleExcludeGlyphs}
	        onToggleGearInspectorSubstatSortPriority={gearInspectorSubstatSortPrefs.togglePriorityKey}
	        onToggleGearInspectorSubstatSortPriorityFlipped={gearInspectorSubstatSortPrefs.toggleFlipped}
	        onSetGearInspectorSubstatSortWeight={gearInspectorSubstatSortPrefs.setWeight}
	        onBumpGearInspectorSubstatSortWeight={gearInspectorSubstatSortPrefs.bumpWeight}
		        filtersSynced={filtersSynced}
		        onToggleFiltersSynced={handleToggleFiltersSynced}
	          filterPresets={filterPresets}
	          onSaveFilterPreset={handleSaveFilterPreset}
          onApplyFilterPreset={handleApplyFilterPreset}
          onDeleteFilterPreset={handleDeleteFilterPreset}
	        gearInspectorCount={gearInspectorItems.length}
        gearInspectorFilteredCount={gearEntriesForTable.length}
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
              gearInspectorRecipeFilterMode={gearInspectorRecipeFilterMode}
              onGearInspectorRecipeFilterModeChange={setGearInspectorRecipeFilterMode}
              builderMode={builderMode}
              recipeCount={builderMode === 'safeguard' ? safeguardRules.length : customRecipes.length}
              collapsed={filterCollapsed}
              onCollapsedChange={setFilterCollapsed}
              gearInspectorChampionOptions={gearInspectorChampionOptions}
              substatColors={substatColors}
              useStatButtonColors={statButtonBorders}
              hasManualGearInspectorItems={hasManualGearInspectorRows}
            />
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
            <Box
              aria-hidden={previewMode !== 'gearInspector'}
              data-tour-id={previewMode === 'gearInspector' ? 'preview.gear-inspector-grid' : undefined}
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
                visibility: previewMode === 'gearInspector' ? 'visible' : 'hidden',
                pointerEvents: previewMode === 'gearInspector' ? 'auto' : 'none',
                zIndex: previewMode === 'gearInspector' ? 1 : 0,
              }}
            >
              <Box
                data-tour-id={previewMode === 'gearInspector' ? 'preview.gear-inspector-grid-top' : undefined}
                sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '50%', pointerEvents: 'none' }}
              />
              <GearInspectorItemsGrid
                rows={gearEntriesForTable}
                allRows={gearInspectorPreviewRows}
                // Chance overlays should compare against the full Gear Inspector inventory, not the filtered slice.
                safeguardUpgradeChanceRows={gearInspectorPreviewRows}
                filterActive={gearInspectorFilterActive || gearInspectorRecipeFilterActive}
                substatColors={substatColors}
                useStatButtonColors={statButtonBorders}
                onToggleStatColors={setStatButtonBorders}
                onOpenManageColors={openColors}
                colorBlindMode={colorBlindMode}
                onChangeColorBlindMode={setColorBlindMode}
                colorIconSrc={colorIconSrc}
                recipeNames={gearInspectorRecipeNamesForGrid}
                focusArtifactRequest={gearInspectorArtifactFocusRequest}
                onFocusArtifactFilteredOut={handleGearInspectorFocusArtifactFilteredOut}
                onJumpToRule={handleGearInspectorRuleView}
                onJumpToSafeguardRule={openLogicHubSafeguardRule}
                onCreateRuleTemplate={handleGearInspectorRuleTemplateCreate}
                suppressMatchDetails={suppressGearInspectorMatchDetails}
                grouping={gearInspectorSubstatSortPrefs.state.grouping}
                substatSort={gearInspectorSubstatSortSpec}
                sortState={gearInspectorSubstatSortPrefs.state}
                safeguardUpgradeChanceRules={resolvedSafeguardRules}
                emptyStateVerticalAlign={emptyStateVerticalAlign}
              />
            </Box>
            <Box
              aria-hidden={previewMode === 'gearInspector'}
              sx={{
                // Keep the preview pane mounted in a stable absolute layer as well.
                position: 'absolute',
                inset: 0,
                height: '100%',
                minHeight: 0,
                width: '100%',
                overflow: 'hidden',
                visibility: previewMode === 'gearInspector' ? 'hidden' : 'visible',
                pointerEvents: previewMode === 'gearInspector' ? 'none' : 'auto',
                zIndex: previewMode === 'gearInspector' ? 0 : 1,
              }}
            >
              {/* Transparent top-third overlay — tutorial can spotlight Recipe #1 rows without covering the full table. */}
              <Box
                data-tour-id={previewMode !== 'gearInspector' ? 'preview.table-top' : undefined}
                sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '66.67%', pointerEvents: 'none', zIndex: 1 }}
              />
              <HsfRulesTableMemo
                rules={hsfRulesForTable}
                recipeNames={recipeNamesForGrid}
                setHoveredRecipeIdx={setHoveredRecipeIdx}
                selectedRecipeIdx={previewSelectedRecipeIdx}
                multiselectActive={multiselectActive}
                selectionScrollRequest={selectionScrollRequest}
                emptyStateVerticalAlign={emptyStateVerticalAlign}
                focusRuleIndex={focusRuleIndex}
                onFocusRuleSettled={handleFocusRuleSettled}
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
          note={sfrNote ?? ''}
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
          gearSummary={gearInspectorOutcomeSummary}
          summaryProgressRatio={workloadProgressRatio}
          hideEditButton={noteAutoOpenedFromSfr}
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
              // Diff toasts should clip overwide content instead of rendering a horizontal scrollbar.
              overflowX: 'hidden',
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
      {sfrImportOptionsDialogElement}
      {/* Restore autosaved SFR dialog */}
      {restoreDlgOpen ? (
        <RestoreAutosaveDialog
          open={restoreDlgOpen}
          draft={restoreDraft}
          gearInspectorDraft={gearInspectorRestoreDraft ? { count: gearInspectorRestoreDraft.count, savedAt: gearInspectorRestoreDraft.savedAt } : null}
          storedGearSetsCount={storedRuntimeGearSetCount}
          metasetsDiffer={restoreMetasetsDiffer}
          targetsDiffer={restoreTargetsDiffer}
          viewFilterDiffer={restoreFiltersDiffer || restoreSortDiffer}
          onDismiss={() => {
            dismissRestore()
            setGearInspectorRestoreDraft(null)
          }}
          onRestore={(selection) => {
            flushTransientUi()
            const draft = restoreDraft
            const restoreIssues = getMetasetDependencyIssues({
              selection: {
                recipes: selection.recipes,
                safeguards: selection.safeguards,
                metasets: selection.metasets,
              },
              // When metasets haven't changed the current session already holds them;
              // treat as no "new" incoming IDs so the dependency check never fires.
              incomingMetasetIds: restoreMetasetsDiffer
                ? collectMetasetIds(draft?.Metasets ?? [])
                : new Set<string>(),
              recipeMetasetIds: collectRecipeMetasetIds(draft?.Recipes ?? []),
              safeguardMetasetIds: collectSafeguardMetasetIds(draft?.Safeguards ?? []),
            })
            // Keep restore idempotent if the UI somehow calls restore with invalid dependencies.
            if (restoreIssues.length > 0) return
            const shouldResetGearInspectorMatches = Boolean(
              (selection.recipes && Array.isArray(draft?.Recipes))
              || (selection.safeguards && (Array.isArray(draft?.Safeguards) || typeof draft?.SafeguardsEnabled === 'boolean'))
              || (selection.tester && gearInspectorRestoreDraft)
            )
            if (shouldResetGearInspectorMatches) beginGearInspectorMatchReset('restore')
            const selectionKeys = Object.entries(selection).filter(([, value]) => value)
            if (selectionKeys.length > 0) {
              const autosaveDescriptor = createAutosaveRestoredDescriptor({
                version: typeof draft?.Version === 'string' ? draft.Version : null,
                savedAt: typeof draft?.AutosaveSavedAt === 'string'
                  ? draft.AutosaveSavedAt
                  : (selection.tester && gearInspectorRestoreDraft?.savedAt ? gearInspectorRestoreDraft.savedAt : null),
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
              if (selection.filters) {
                // Restore view/filter state when the draft has changed filter content.
                if (restoreFiltersDiffer && draft.Filters) {
                  try {
                    const views = draft.Filters.views
                    if (views && typeof views === 'object') {
                      // Replay the saved view for every mode so toggling between Sellfile preview and Gear Inspector feels seamless.
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
                    setGearInspectorRecipeFilterMode(draft.Filters.testerRecipeFilterMode ?? 'off')
                    if (draft.Filters.activeMode === 'rules' || draft.Filters.activeMode === 'gearInspector') {
                      setPreviewMode(draft.Filters.activeMode)
                    }
                    // Restore builder section collapse layout alongside the filter state.
                    if (draft.Filters.builderRecipeCollapsed) setBuilderRecipeCollapsed(draft.Filters.builderRecipeCollapsed)
                    if (draft.Filters.builderSafeguardCollapsed) setBuilderSafeguardCollapsed(draft.Filters.builderSafeguardCollapsed)
                  } catch {}
                }
                // Sort (TesterSort) is bundled with filters — restore it together.
                if (restoreSortDiffer && draft.TesterSort) setGearInspectorSubstatSortState(draft.TesterSort)
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
                : new Set<number>([
                  ...getAllKnownArtifactSetIds().map((id) => Number(id)),
                  // Keep accessory no-set available even when runtime sets are declined.
                  ACCESSORY_NO_SET_ID,
                ])
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
            if (selection.tester && gearInspectorRestoreDraft) {
              const restoredItems = gearInspectorRestoreDraft.items
              // Restores can include large Gear Inspector payloads; commit non-urgently like imports.
              setGearInspectorItemsTransition(restoredItems)
              const maxItemId = gearInspectorRestoreDraft.items.reduce((max, item) => (
                Number.isFinite(item.itemId) && item.itemId > max ? item.itemId : max
              ), 0)
              gearInspectorItemIdRef.current = Math.max(gearInspectorItemIdRef.current, (maxItemId || 0) + 1)
            }
            const savedAutosaveTab = draft?.LogicHubDialogTab as LogicHubDialogTab | undefined
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
            if (selection.safeguards) {
              if (Array.isArray(draft?.Safeguards)) setSafeguardRules(draft.Safeguards)
              if (typeof draft?.SafeguardsEnabled === 'boolean') setSafeguardsEnabled(Boolean(draft.SafeguardsEnabled))
              if (typeof draft?.RecipesEnabled === 'boolean') setRecipesEnabled(draft.RecipesEnabled !== false)
            }
            // Coalesce downstream rebuilds into a single pass.
            restoringAutosaveRef.current = true
            acceptRestore()
            setGearInspectorRestoreDraft(null)
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
          substatColors={substatColors}
          useStatButtonColors={statButtonBorders}
          onJumpToRule={handleGearInspectorRuleView}
          customRecipes={customRecipes}
          gearInspectorItems={gearInspectorItems}
          setGearInspectorItems={setGearInspectorItemsTransition}
          allocGearInspectorItemId={allocGearInspectorItemId}
          gearInspectorMatches={gearInspectorMatchesByItemId}
          onResetGearInspector={handleResetGearInspectorItems}
          rules={mergedRules}
          substatTargets={substatTargets}
          effectiveSubstatTargets={effectiveSubstatTargets}
          onSubstatTargetsChange={(m, opts) => { applySubstatTargetsChange(m, opts) }}
          recipeOverridesActive={substatTargetsOverridesActive}
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
