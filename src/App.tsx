/**
 * App
 *
 * Top-level React component that orchestrates:
 * - Base HSF load/preview/merge and export
 * - SFC (custom rules) load/save/copy and state management
 * - Rule builder UI, metasets, substatTargets, and autosave
 * - Color management for substat chips and various dialogs
 */
import { scopeColorsText } from './lib/colorScope'
import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, type ReactNode } from 'react'
import { APP_VERSION } from './version'
import { readHsfFile, buildHsfFileFromMerged, hsfToBlob, HSF_EXPORT_CONTENT_TYPE } from './lib/hsfIO'
import { getSimpleMode, getPushEndpoint } from './lib/runtimeConfig'
import { accountDisplayLabel, buildAccountRpcParams, classifyInboundAccountStamp, getActiveAccount, getUnstampedDefaultAccount, takeAccountMergeCarry } from './lib/accounts'
import { claimAutoPushOwnership, refreshAutoPushOwnershipIfOwner } from './lib/autoPushOwnership'
import { buildDocumentOverridesView } from './lib/documentOverrides'
import { createBackgroundAccountPushService, type BackgroundAccountPushService } from './lib/backgroundAccountPush'
import { runHeadlessRuleCachePipeline } from './lib/headlessRuleCachePipeline'
import AccountSwitcher from './components/AccountSwitcher'
import { GoldCornerOrnaments } from './components/GoldCornerOrnament'
import {
  resolveSellfileUploadTarget,
  EXTERNAL_WS_METHOD_SELECT_ARTIFACTS,
  buildRslHelperWsEndpoint,
  getSimpleExpertMode,
  setSimpleExpertMode as persistSimpleExpertMode,
  getSimpleVariant,
  setSimpleVariant as persistSimpleVariant,
  AUTOSAVE_PRESET_ORIGIN_KEY,
  AUTOSAVE_SIMPLE_EXPERT_MODE_KEY,
  getRslHelperConnectEnabled,
  getRslHelperPort,
  extractRslHelperPortFromEndpoint,
  // Aliased so the React state setter can follow the setX naming convention without conflict.
  setRslHelperConnectEnabled as persistRslHelperConnectEnabled,
  // Aliased for symmetry with the connect-enabled writer above.
  setRslHelperPort as persistRslHelperPort,
} from './lib/externalWsProtocol'
import { isGearDbPartCommand } from './lib/externalCommands'
import type {
  ExternalCommand,
  GearDbPartCommand,
  GearDbRawSnapshotCommand,
} from './lib/externalCommands'
import type { HsfFile, HsfRule } from './lib/hsfTypes'
import { type BuilderRecipe, type SubstatTargetTable, type SellfileExportMode } from './lib/hsfBuilder'
import { normalizeFactionSlotScope } from './lib/recipeNormalization'
import { applyClientCapabilitiesPacket } from './lib/clientCapabilities'
import { parseRecipesFromText, buildReadableRecipe, readSfcFile, buildSfcPayload, sfcToBlob, SFC_EXPORT_CONTENT_TYPE, parseSfcText, firstSelectableRecipeIndex, type ParsedSfcResult } from './lib/sfcIO'
import { loadAutosave, saveAutosave } from './lib/autosave'
import { currentSfcMatchesAnyPreset, matchedPreset, presetRaw, presetFilename } from './lib/sfcPresetMatch'
import type { SfcSetupFields, PresetVariant } from './lib/sfcPresetMatch'
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
  AUTOSAVE_CUSTOM_GEAR_KEY,
  PANEL_WIDTH_PX,
  SIDE_BY_SIDE_NATIVE_MEDIA_QUERY,
  GRID_COLUMN_GAP_PX,
  APP_EDGE_GAP_PX,
  PREVIEW_PAPER_PADDING_UNITS,
  FINAL_SELL_DEFAULT_LEVELS,
  SMALL_BUTTON_HEIGHT_PX,
  ELLIPSIS_BUTTON_LABEL_SX,
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
import { buildPreviewArtifactsFromGearInspectorItems } from './lib/gearInspectorPreviewArtifacts'
import { clampProgressRatio, type ProgressSnapshot } from './types/progress'

import { Box, Container, Paper, Stack, Typography, GlobalStyles, Button, IconButton, ToggleButton, ToggleButtonGroup } from '@mui/material'

import SettingsIcon from '@mui/icons-material/Settings'

import SaveIcon from '@mui/icons-material/Save'
import StorageIcon from '@mui/icons-material/Storage'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import { Snackbar, Alert } from '@mui/material'
// Icons for App header and controls are imported within components that use them
import { HsfRulesTableMemo, type SafeguardStarSelection } from './components/HsfRulesTable'
// Recipe chips list panel component
import RecipeChipsPanel from './components/RecipeChipsPanel'
import ConfirmDialogs from './components/ConfirmDialogs'
import BuilderPanel, { createFactoryBuilderDefaults } from './components/RecipeBuilderPanel'
import CopyDialog from './components/CopyDialog'
import PasteDialog from './components/PasteDialog'
// Markdown preview for SFC Note (read-only). Requires installation:
//   npm i @uiw/react-md-editor rehype-sanitize @uiw/react-markdown-preview
// Styles are imported globally here.
// If the deps are missing, the app will fail to compile; install them as above.
import NoteDialog from './components/NoteDialog'
import { useManageColorsDialog } from './hooks/useManageColorsDialog'
import { useSlotTints, DEFAULT_SLOT_TINTS } from './lib/slotTints'
import { SlotTintProvider } from './lib/slotTintContext'
import { useRarityColors, DEFAULT_RARITY_COLORS } from './lib/rarityColors'
import { RarityPaletteProvider } from './lib/rarityColorContext'
import { StatColorProvider } from './lib/statColorContext'
import { DEFAULT_STAT_COLOR_SCOPE, DEFAULT_RARITY_COLOR_SCOPE, DEFAULT_SLOT_COLOR_SCOPE } from './lib/colorScope'
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
  type SafeguardRankByArtifactId,
  type SafeguardRankOverlayEntry,
  getSafeguardItemKey,
  resolveSafeguardRuleLabel,
  buildSafeguardCombinationFromRecipe,
  cloneSafeguardRule,
  SAFEGUARD_DEFAULT_COUNT_MODE,
  SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT,
  SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
  SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
  SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  normalizeSafeguardRule,
  normalizeSafeguardFactionSlotScope,
  computeArtifactSetContentHash,
  safeguardEffectiveCountModeForDisplay,
  safeguardFocusBucketKeyFor,
  normalizeSafeguardSubstatMatch,
  firstSelectableSafeguardIndex,
} from './lib/safeguards'
// Safeguard groups: structural facts come from the Rust authority through this facade; the
// repair runs at the mutation funnel plus the append-import seam.
import { normalizeSafeguardGroups, withStoredSafeguardMembership } from './lib/safeguardGroups'
import { updateRecipeRulesCache } from './lib/ruleCache'
import {
  PIPELINE_CACHE_MAX_ENTRIES,
  PIPELINE_CACHE_TTL_MS,
  PIPELINE_CACHE_BUDGET_BYTES,
  PIPELINE_CACHE_MIN_ENTRIES,
  SharedGraphBudget,
  retainPipelineCacheEntry,
  releasePipelineCacheEntry,
} from './lib/pipelineCache'
import { hasRecipeMeaningfulDifferences } from './lib/recipeDiff'
import { buildGearInspectorAutosavePayload, createGearInspectorMath, loadCustomGearAutosaveDraft, loadGearInspectorAutosaveDraft, newGearInspectorCompressionCache, partitionGearInspectorItemsForPersistence, type GearInspectorItem } from './lib/gearInspectorSession'
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
import { isGearInspectorSyntheticSortKey, sortGearInspectorRows, GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE } from './lib/gearInspectorSort'
import { buildGearInspectorRuleTemplateRecipe } from './lib/gearInspectorRuleTemplates'
import { buildGearInspectorOutcomeSummary, buildGearInspectorOutcomeSummaryPair } from './lib/gearInspectorOutcomeSummary'
import { writeAccountStatsSnapshot } from './lib/accountSummaries'
import { setGearInspectorSubstatSortState, useGearInspectorSubstatSortPreferences } from './state/gearInspectorSubstatSortPreferences'
import { mergeSortState, subtractSortState, reapplySortScalars, sortStateContains, sortStateHasContribution } from './lib/gearInspectorSortMerge'
import { useGearInspectorGridNormalizedOverlayPreferences } from './state/gearInspectorGridNormalizedOverlayPreferences'
import { useShowSafeguardImprovementChance } from './state/gearInspectorGridPreferences'
import { FILTER_PRESETS_VERSION, filterPresetSnapshotsEqual, useFilterPresetsPreference, type FilterPreset, type FilterPresetSnapshot } from './state/filterPresetsPreference'
import { sortPresetSnapshotsEqual, useSortPresetsPreference, type SortPreset } from './state/sortPresetsPreference'
import { createPresetId } from './state/presetUtils'
import { useSplitterRatio, SPLITTER_MIN_WIDTH_PX } from './state/splitterPreference'
import FileDragOverlay from './components/FileDragOverlay'
import { BuilderColumn } from './components/AppLayout/BuilderColumn'
import { SideBySideSplitter } from './components/AppLayout/SideBySideSplitter'
import { AppTitle } from './components/AppTitle'
import UpdateNoticeLine from './components/UpdateNoticeLine'
import SafeguardBuilderPanel from './components/SafeguardBuilderPanel'
import SafeguardChipsPanel from './components/SafeguardChipsPanel'
import { useFileDragDrop, routeFileByExtension, type FileRouteContext } from './hooks/useFileDragDrop'
import HeaderActions from './components/HeaderActions'
import { GearDiffPreview } from './components/GearDiffPreview'
import ManageColorsDialog from './components/dialogs/ManageColorsDialog'
import LogicHubDialog from './components/dialogs/LogicHubDialog'
import HelpDialog from './components/HelpDialog'
import ThemeEditorMenu, { PsychedelicEffect } from './components/ThemeEditorMenu'
import MarkdownTooltip from './components/MarkdownTooltip'
import EllipsisTooltip from './components/EllipsisTooltip'
import { TutorialCoach } from './components/tutorial/TutorialCoach'
import RestoreAutosaveDialog from './components/dialogs/RestoreAutosaveDialog'
import MetasetConflictDialog from './components/dialogs/MetasetConflictDialog'
import FileFormatErrorDialog from './components/dialogs/FileFormatErrorDialog'
import SfcImportOptionsDialog, { type SfcImportModes, type SfcImportSelection } from './components/dialogs/SfcImportOptionsDialog'
import RslHelperConnectButton from './components/RslHelperConnectButton'
import PongFlyout from './components/PongFlyout'
import SellfallFlyout from './components/SellfallFlyout'
import { useAutosave } from './hooks/useAutosave'
import { useNonUrgentStateDispatch } from './hooks/useNonUrgentStateDispatch'
import PreviewHeaderActions from './components/PreviewHeaderActions'
import RulesFilterPanel, { type RulesFilterPanelHandle } from './components/RulesFilterPanel'
import { GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT, type GearInspectorRecipeFilterMode } from './types/gearInspectorRecipeFilterMode'
import { artifactTypeI18nKey, getAllKnownArtifactSetIds, type RankValue, type StatVariant } from './lib/types'
import { formatGearInspectorSetLabel } from './lib/gearInspectorFormatters'
import { DEFAULT_RULES_FILTER_STATE, filterHsfRules, filterGearInspectorItems, isRulesFilterActive, normalizeRulesFilterForGearInspector, type FilterHsfRulesResult, type RulesFilterState } from './lib/rulesFilter'
import { mergeRulesFilterState, subtractRulesFilterState, reapplyRulesFilterScalars, rulesFilterStateContains, rulesFilterStateHasContribution, projectFilterStateToMode, presetPayloadView, presetPayloadForMode } from './lib/rulesFilterMerge'
import type { GearAnalyticsDim, GearAnalyticsOutcome, GearAnalyticsSource } from './lib/gearAnalytics'
import { EMPTY_GEAR_ANALYTICS_DIM, improvChanceBinsToRange, rangeToImprovChanceBins } from './lib/gearAnalytics'
import {
  useAutosaveRestore,
  restoreDraftMetasetsDiffer,
  substatTargetsSignature,
} from './hooks/useAutosaveRestore'
import type { ChampionLocation } from './lib/importers/gearDbNormalizer'
import { TINT } from './lib/colorTints'
import { buildTagVocabulary } from './lib/tagHelpers'
import { playAttentionPulse, attentionPulseIterationsForMs } from './lib/attentionPulse'
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
// Minimum gap between end of one endpoint apply+settle cycle and start of the next.
const ENDPOINT_PUSH_COOLDOWN_MS = 5000 as const
// Pipeline result cache limits — count cap, sliding TTL, byte budget and min-entry floor —
// live in lib/pipelineCache.ts (the cache-policy SSOT) together with the shared-graph byte
// accounting; see that module for the sizing rationale.
// Duration of the Diff-button border-chase when the diff reference changes (kept in sync
// with the keyframe duration in PreviewHeaderActions).
const GEAR_DIFF_REFERENCE_PULSE_MS = 1000
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

// Fingerprint of the cID (equipped-champion) assignments across all artifact rows.
// RSL Helper does not bump artifact revisions when equipment changes, so the revision
// diff alone cannot detect equipment-only pushes. This fingerprint covers that gap
// and lets handleGearDbRawSnapshot short-circuit no-op pushes entirely.
function computeArtifactCidFingerprint(
  artifacts: readonly GearDbArtifactRow[],
  inboxArtifacts: readonly GearDbArtifactRow[],
): number {
  // 1000003 and 7919 are coprime primes — keeps (ID, cID) pairs from aliasing
  // across different artifacts or champion assignments.
  let h = 0
  for (const r of artifacts) {
    h = (h * 1000003 + r.ID + (r.cID ?? 0) * 7919) | 0
  }
  for (const r of inboxArtifacts) {
    h = (h * 1000003 + r.ID + (r.cID ?? 0) * 7919) | 0
  }
  return h
}

// Fingerprint of the lastUsed rows in a snapshot. RSL Helper pushes lastUsed as a
// standalone packet after each game round, with NO change to artifact revisions or
// cID — so the revision/cID short-circuit alone would discard it and the timestamps
// would never reach the UI. Hashing (id, lastUse) lets the short-circuit detect a
// lastUsed-only change and let it through. Mirrors computeArtifactCidFingerprint.
function computeLastUsedFingerprint(lastUsed: readonly GearDbLastUsedRow[]): number {
  let h = 0
  for (const r of lastUsed) {
    // Resolve id under either casing (helper occasionally capitalizes the column).
    const id = Number(r.id ?? r.ID) | 0
    // Fold the timestamp string in via a cheap rolling char hash so any value change
    // (a fresh game-round timestamp) perturbs the fingerprint.
    let tsHash = 0
    const ts = r.lastUse
    if (typeof ts === 'string') {
      for (let i = 0; i < ts.length; i += 1) tsHash = (tsHash * 31 + ts.charCodeAt(i)) | 0
    } else if (typeof ts === 'number') {
      tsHash = ts | 0
    }
    h = (h * 1000003 + id + tsHash * 7919) | 0
  }
  return h
}

// Fingerprint of champion-intrinsic fields the UI filters/renders but that do NOT change
// any artifact row (so revision/cID/lastUsed fingerprints all miss them). The driving
// case: a champion moves vault↔collection — gear is untouched, yet the Gear Inspector
// filters artifacts by equipped-champion location, so the view must refresh. We hash
// (id, location, baseHeroId, name, rarity) — the fields consumed downstream — so any of
// them changing lets the short-circuit through. Location is the primary trigger.
function computeChampionFingerprint(champions: readonly GearDbChampionRow[]): number {
  let h = 0
  for (const c of champions) {
    const id = Number(c.ID) | 0
    // Location is encoded by the Vault/RVault flags; fold both so either flip registers.
    const loc = ((Number(c.Vault) > 0 ? 1 : 0) * 2 + (Number(c.RVault) > 0 ? 1 : 0)) | 0
    const base = Number(c.BaseHeroID) | 0
    const rarity = Number(c.Rarity) | 0
    // Cheap rolling hash of the name so renames register too.
    let nameHash = 0
    if (typeof c.Name === 'string') {
      for (let i = 0; i < c.Name.length; i += 1) nameHash = (nameHash * 31 + c.Name.charCodeAt(i)) | 0
    }
    h = (h * 1000003 + id + loc * 31 + base * 131 + rarity * 17 + nameHash * 7919) | 0
  }
  return h
}

// WebSocket endpoints may still host HTTP downloads; map ws(s) -> http(s).
import { sellfileFilename, sfcFilename } from './lib/filenames'
import { README_SEEN_VERSION_KEY, RULE_COUNT_LIMIT, SAFEGUARD_BUILDER_USER_DEFAULTS_KEY, SIMPLE_MODE_TRANSITION_MS } from './lib/constants'
import { DEFAULT_METASET_ICON_ID, type MetasetIconId } from './lib/metasetIcons'
import { cloneMetaset, defaultMetasets, type Metaset } from './lib/metasets'
import { normalizeArtifactSetSelections, splitArtifactSetSelections, type ArtifactSetSelectionEntry } from './lib/gearSets/selection'
import { useDisplayPreferences, useDisplayPreferenceActions } from './state/preferencesState'
import { useAutoApplyBuilderPreference } from './state/builderPreferences'
import { usePreviewModePreference, useBuilderModePreference } from './state/previewBuilderModePreferences'
import { useAppActions, useAppState } from './state/appState'
import { useI18n } from './lib/i18n'
import { computeDuplicateIndices } from './lib/recipeDuplicates'
import { recipesForRuleBuild, recipeNamesForExport } from './lib/ruleCacheHelpers'
import { ALLOW_TEST_HOOKS } from './lib/testHooks'
import { evaluateFirst, type TestItem } from './lib/ruleEval'
import { importGearDatabaseFromArrayBuffer, importGearDatabaseFromFile } from './lib/importers/gearDbImporter'
import {
  applyGearDbPartToSlots,
  buildArtifactRevisionMap,
  buildRestoredGearDbBaselines,
  patchArtifactRowsCID,
  createDatasetFromSnapshot,
  type GearDbRawDataset,
  type GearDbRawParts,
} from './lib/importers/gearDbRawDataset'
import {
  mergeChampionRows,
  mergeLastUsedRows,
} from './lib/importers/gearDbLookups'
import type {
  GearDbArtifactRow,
  GearDbChampionRow,
  GearDbLastUsedRow,
  NormalizedGearArtifact,
} from './lib/importers/gearDbNormalizer'
import { GearInspectorItemsGridMemo as GearInspectorItemsGrid } from './components/GearInspectorItemsGrid'
import type { GearInspectorOutcomeSummary, GearInspectorPreviewMatch, GearInspectorPreviewRow } from './types/gearInspectorPreview'
import { buildVerdictMapFromRows, type DiffRow } from './lib/gearDiff/verdictDiff'
import { useGearDiffCompare, type GearDiffDelta, type GearDiffRows, type ImprovementChanceByArtifactId } from './hooks/useGearDiffCompare'
import { useChangePulse } from './hooks/useChangePulse'
import GearDiffSplitView from './components/GearDiffSplitView'
import type { GearInspectorMatchWorkerItemResult } from './workers/gearInspectorMatchWorkerTypes'
import type { ImprovementChanceWasmEntry } from './lib/wasm/wasmRuleEngine'
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
import type { PipelineResult } from './hooks/useRuleCacheWorker'
import { ts } from './lib/logTimestamp'
import { useGearInspectorItemsActions } from './hooks/useGearInspectorItemsActions'
import {
  resolveArtifactItemIdWithFallback,
  GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED,
  nextGearInspectorCustomItemId,
  reseedGearInspectorCustomIdCursor,
} from './lib/itemIdentity'
// Local tag for Gear Inspector reset triggers; persists only in memory.
// Endpoint pushes get their own reason so the Gear Inspector grid can stay interactive.
type GearInspectorMatchResetReason = 'restore' | 'sfc' | 'gearDbManual' | 'gearDbEndpoint'
import { getChipHover, setChipHover, subscribeChipHover, type ChipHoverTarget } from './lib/chipHoverBridge'
import { useBuilderPreviewLayout } from './hooks/useBuilderPreviewLayout'
import { getDirtyBuilderFieldKeys, cloneBuilderRecipe } from './lib/recipeMultiEditDraft'
import { useTooltipScrollGuard } from './hooks/useTooltipScrollGuard'
import { useModalCleanup } from './hooks/useModalCleanup'
import { useEasterEggTrigger } from './hooks/useEasterEggTrigger'
import { useTutorialCoachState } from './hooks/useTutorialCoachState'
import { useExternalCommands } from './hooks/useExternalCommands'
import { useSfcClipboard, type PendingImport } from './hooks/useSfcClipboard'
import { useRuntimeCatalogLoader } from './hooks/useRuntimeCatalogLoader'
import { useRuntimeGearSetLoader } from './hooks/useRuntimeGearSetLoader'
import { useGearSetCatalogVersion } from './hooks/useGearSetCatalogVersion'
import {
  useRulesFilterCollapsedPreference,
  useRulesFilterOpenPreference,
  useRulesFilterStatePreference,
  RULES_FILTER_PREVIEW_MODES,
  setRulesFilterOpenForMode,
  setRulesFilterStateForMode,
  setRulesFilterCollapsedForMode,
  useRulesFilterSyncPreference,
  cloneDefaultRulesFilterCollapsed,
  cloneDefaultRulesFilterState,
  type CollapsedSections,
} from './state/rulesFilterPersistence'
import { getSellfileLastPushAtForAccount, hasExplicitSellfileAutoPushForAccount, markSellfileLastPushErrorForAccount, markSellfileLastPushForAccount, useSellfileDedupPreference, useSellfileOmitDisabledPreference, useSellfileAutoPushPreference } from './state/exportPreferences'
import { useHideGearDbUpdateToastPreference, getPersistEndpointGearPreferenceSnapshot, getRestoreCustomGearPreferenceSnapshot } from './state/gearDbPreferences'
import { useSfcDialogs } from './hooks/useSfcDialogs'
import { useSfcHistoryController } from './hooks/useSfcHistoryController'
import { useUpdateCheck } from './hooks/useUpdateCheck'
import type { HistoryEntryDescriptor, DescribeNextChangeFn } from './hooks/useSfcHistory'
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
import { createSfcLoadedDescriptor, createAutosaveRestoredDescriptor, makeClipboardSourceDescriptor } from './history/bulkLoadDescriptors'
import {
  createSafeguardsEnabledChangeDescriptor,
  createSafeguardsRulesChangeDescriptor,
  isSafeguardRuleOrderChanged,
} from './history/safeguardsDescriptors'
import { buildInsertionLocation, snapshotRecipeLabel } from './history/historyLabelUtils'
import { useAutoSideBySideZoom } from './hooks/useAutoSideBySideZoom'
import {
  applyRecipeOverrides,
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY,
  pruneNoteRecipeOverridesAnswers,
  resolveRecipeOverridesExportMode,
  resolveRecipeOverridesEffectiveRecipe,
  seedSafeguardAnswersFromRecipeDefaults,
  type RecipeOverridesInstructions,
  type NoteRecipeOverridesAnswers,
} from './lib/noteRecipeOverrides'
import {
  pruneNoteSafeguardOverridesAnswers,
  NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY,
  type SafeguardOverridesResolution,
  type NoteSafeguardOverridesAnswers,
} from './lib/noteSafeguardOverrides'
import {
  collectMetasetIds,
  collectRecipeMetasetIds,
  collectSafeguardMetasetIds,
  getMetasetDependencyIssues,
} from './lib/sfcImportSelection'

// Components are organized under src/components

import type { ColorBlindMode } from './lib/constants'

const isDevBuild: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

const NO_AUTO_APPLY: () => boolean = () => false


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
// Stores a processed pipeline result so undo/redo revisits skip the worker AND all JS
// post-processing. processedRows is null only when includeMatchesInPipeline was false at
// cache-fill time (the cache key encodes that flag, so a null entry is never served to a
// caller that needs rows).
type PipelineCacheEntry = {
  result: PipelineResult
  processedSnapshot: RecipeRulesStateSnapshot
  processedRows: GearInspectorPreviewRow[] | null
  processedSafeguardDetection: SafeguardDetectionSnapshot | null
  processedImprovementChance: Map<number, ImprovementChanceWasmEntry> | null
  insertedAt: number
}

// Inserts/updates still flow through the worker; the UI only handles pure reorders locally.

// presetPayloadView / presetPayloadForMode live in lib/rulesFilterMerge.ts (SSOT alongside the
// rest of the preset filter algebra) and are imported above.

// Resolve the simple-mode expert choice at startup, preferring the durable autosave copy
// over the standalone localStorage key. The standalone key is written once at click time;
// the embedded WebView host kills the process without firing unload events, so that lone
// write is not always flushed and the choice was lost (next launch re-opened the express
// dialog). The autosave copy is rewritten continuously on a debounce during the session,
// so it is reliably on disk by the time the host kills the WebView. Falls back to the
// standalone key when no autosave copy exists (e.g. first session, or a normal browser).
function resolveSimpleExpertModeAtStartup(): boolean {
  // Prefer the durable autosave copy when present.
  const entry = loadAutosave<Record<string, unknown>>(AUTOSAVE_KEY)
  const fromAutosave = entry?.payload[AUTOSAVE_SIMPLE_EXPERT_MODE_KEY]
  if (typeof fromAutosave === 'boolean') return fromAutosave
  // No autosave copy yet — fall back to the standalone key.
  return getSimpleExpertMode()
}

// Synchronously stamp the expert choice into the existing autosave entry at click time, so
// it is durably on disk immediately — independent of the 1s autosave debounce — for the case
// where the WebView host kills the process right after the toggle. Patches only this one key
// (leaving the rest of the saved payload intact) and no-ops when no autosave entry exists yet
// (the debounced write will create one shortly, and the standalone key still covers startup).
function stampSimpleExpertModeIntoAutosave(expert: boolean): void {
  const entry = loadAutosave<Record<string, unknown>>(AUTOSAVE_KEY)
  if (!entry) return
  saveAutosave(AUTOSAVE_KEY, { ...entry.payload, [AUTOSAVE_SIMPLE_EXPERT_MODE_KEY]: expert })
}

export default function App({ colorBlindMode, setColorBlindMode }: { colorBlindMode: ColorBlindMode; setColorBlindMode: (m: ColorBlindMode) => void }) {
  // Session-constant: true when ?express was present in the URL at load time.
  const [simpleMode] = useState(getSimpleMode)
  const [hsf, setHsf] = useState<HsfFile | null>(null)
  // Shared app state via context — reduces prop drilling and keeps behavior consistent.
  const {
    customRecipes,
    selectedRecipeIdx,
    metasets,
    substatTargets,
    finalSellRemainder,
    logicHubDialogTab,
    sfcNote,
    noteRecipeOverridesAnswers,
    noteOverridesDisabled,
    noteSafeguardOverridesAnswers,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
  } = useAppState()
  const customRecipesRef = useRef(customRecipes)
  useEffect(() => { customRecipesRef.current = customRecipes }, [customRecipes])
  const safeguardRulesRef = useRef(safeguardRules)
  useEffect(() => { safeguardRulesRef.current = safeguardRules }, [safeguardRules])
  const {
    setCustomRecipes,
    setSelectedRecipeIdx: setSelectedRecipeIdxRaw,
    setMetasets,
    setSubstatTargets,
    setFinalSellRemainder,
    setLogicHubDialogTab,
    setSfcNote,
    setNoteRecipeOverridesAnswers,
    setNoteOverridesDisabled,
    setNoteSafeguardOverridesAnswers,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
  } = useAppActions()
  // Best-effort GitHub release check — silent on failure, session-dismissible banner.
  const updateCheck = useUpdateCheck()
  const { runPipeline, flush: flushRuleCache, countRules, scoreCandidates: scoreSafeguardCandidatesViaWorker } = useRuleCacheWorker()
  // These toggles now drive in-app rule transforms, not export-only behavior.
  const [dedupeDefault, setDedupeDefault] = useSellfileDedupPreference()
  const [omitDisabledForExport, setOmitDisabledForExport] = useSellfileOmitDisabledPreference()
  // Auto-push: when enabled and an endpoint is active, push the sellfile on every dirty-state change.
  const [autoPushEnabled, setAutoPushEnabled] = useSellfileAutoPushPreference()
  const { statColorScope, rarityColorScope, slotColorScope, autoSideBySideZoomEnabled, autoSideBySideMinZoom } = useDisplayPreferences()
  // Stat-text coloring (chips/preview/summaries) is on whenever the stat group is not 'off'.
  const colorStatTextsOn = scopeColorsText(statColorScope)
  const [autoApplySelectedRecipe] = useAutoApplyBuilderPreference()
  // Builder section collapse state — read here so the autosave memo can include it.
  // Colour-scope setters are still wired to the central theme popout (see below); the old
  // table-header master toggle that flipped all groups at once moved there too.
  const { setStatColorScope, setRarityColorScope, setSlotColorScope } = useDisplayPreferenceActions()
  // Full note-override derivation chain in ONE memo — the builder in
  // lib/documentOverrides.ts is the SSOT shared with the background account-push flow,
  // so App must not re-derive any step inline. Recomputing everything on any input
  // change is fine: each step is a cheap pure transform, and every input here is
  // already a pipeline input, so the identity churn adds no extra pipeline runs.
  const documentOverridesView = useMemo(() => buildDocumentOverridesView({
    note: sfcNote,
    noteOverridesDisabled,
    recipeOverridesAnswers: noteRecipeOverridesAnswers,
    safeguardOverridesAnswers: noteSafeguardOverridesAnswers,
    recipes: customRecipes,
    substatTargets,
    safeguardRules,
    metasets,
    recipesEnabled,
  }), [
    sfcNote,
    noteOverridesDisabled,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    customRecipes,
    substatTargets,
    safeguardRules,
    metasets,
    recipesEnabled,
  ])
  const {
    // The recipe resolution feeds UI (chips/diagnostics) via its instruction list below.
    recipeOverridesResolution,
    // Override-applied recipes for preview consumers (SFC recipes never mutated).
    recipeOverridesRecipesForRules,
    // Substat targets with override substat-target overrides applied.
    effectiveSubstatTargets,
    substatTargetsOverridesActive,
    // Build-normalized pipeline recipe list + the export names derived from it —
    // the SAME list the worker fingerprints, so export bytes match the worker crc.
    ruleRecipes,
    exportRecipeNames,
    // Per-recipe export modes resolved from override instructions.
    recipeModes,
    // Safeguards: metaset-resolved + overrides for the pipeline; raw + overrides for display.
    resolvedSafeguardRules,
    effectiveSafeguardRules,
    displaySafeguardRules,
  } = documentOverridesView
  // Keep a stable instruction map for downstream UI and filter logic.
  const recipeOverridesInstructions = recipeOverridesResolution.instructions
  // Display/match labels reflect the recipes as the user sees them in the builder (raw customRecipes).
  const recipeNames = useMemo(() => recipeNamesForExport(customRecipes), [customRecipes])
  const recipeFgColors = useMemo(() => customRecipes.map((recipe) => recipe?.appearance?.fgColor ?? null), [customRecipes])
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
  const metasetsForPreview = useDeferredValue(metasets)
  const recipeNamesForPreview = useDeferredValue(recipeNames)
  const recipeFgColorsForPreview = useDeferredValue(recipeFgColors)
  // Keep Gear Inspector math reusable so seeding hooks share the same normalization as the dialog.
  const gearInspectorMath = useMemo(() => createGearInspectorMath(effectiveSubstatTargets), [effectiveSubstatTargets])
  // State (not ref) so the useMemo below can read it during render without violating react-hooks/refs.
  const [lastRecipeNames, setLastRecipeNames] = useState<string[]>(recipeNamesForPreview)
  const [lastRecipeFgColors, setLastRecipeFgColors] = useState<Array<string | null>>(recipeFgColorsForPreview)
  // Custom-gear ids are allocated DESCENDING from INT32_MAX so they never collide with
  // real DB artifact ids (small positives) in the shared safeguard item-key space. The ref
  // holds the allocator CURSOR (one above the next id); the first alloc returns the sentinel.
  // See itemIdentity.ts for the reserved band + rationale.
  const gearInspectorItemIdRef = useRef(GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED)
  const allocGearInspectorItemId = useCallback(() => {
    const id = nextGearInspectorCustomItemId(gearInspectorItemIdRef.current)
    // Band exhaustion is unreachable in practice (~1e9 ids); fall back to the sentinel.
    const next = id ?? GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED - 1
    gearInspectorItemIdRef.current = next
    return next
  }, [])
  // Raw JSON endpoints stream their own dataset; keep the normalized snapshot
  // cached so deltas can mutate it without rebuilding from SQL blobs.
  const gearDbRawDatasetRef = useRef<GearDbRawDataset | null>(null)
  // Persists the artifact id → revision map from the last successfully applied push.
  // Compared against the incoming push to find the changed subset before snapshotting,
  // so unchanged artifacts skip the deep stat clone entirely.
  const gearDbRevisionMapRef = useRef<Map<number, number>>(new Map())
  // Fingerprint of the last accepted snapshot's cID assignments; compared against
  // incoming fingerprints to short-circuit no-op pushes (see computeArtifactCidFingerprint).
  const gearDbCidFingerprintRef = useRef<number>(0)
  // Fingerprint of the last accepted snapshot's lastUsed rows; lets the short-circuit
  // detect a lastUsed-only push (sent after each game round, with no revision/cID
  // change) and apply it instead of discarding it. See computeLastUsedFingerprint.
  const gearDbLastUsedFingerprintRef = useRef<number>(0)
  // Fingerprint of the last accepted snapshot's champion-intrinsic fields (location,
  // baseHeroId, name, rarity). Catches champion-only changes — e.g. a champ moving
  // vault↔collection — that leave every artifact row untouched. See
  // computeChampionFingerprint.
  const gearDbChampionFingerprintRef = useRef<number>(0)
  // Snapshot map produced at the end of the last successful binary (SQLite) command import.
  // Reused as the "before" baseline for the next push and compared against the new import
  // via isGearDbDatasetMatchingSnapshotCache to skip all stat cloning when only non-tracked
  // fields (e.g. LastUse timestamps) changed — the most common case during active farming.
  const gearDbBinarySnapshotCacheRef = useRef<Map<number, GearArtifactSnapshot> | null>(null)
  // Accumulator for the separate per-type messages (artifacts/champions/inboxArtifacts/lastUsed).
  // Each arrival synthesizes a snapshot immediately so partial updates are never dropped.
  const gearDbRawPartsRef = useRef<GearDbRawParts>(
    { artifacts: null, inboxArtifacts: null, champions: null, lastUsed: null, equippedByArtifact: null },
  )
  const [gearInspectorItems, setGearInspectorItems] = useState<GearInspectorItem[]>(
    // eslint-disable-next-line react-hooks/refs -- mount-only initializer; the id ref is seeded above and read once here, not on re-renders
    () => {
      // Custom ("manual") gear lives in its OWN key and is reloaded at startup in every
      // mode (no dialog), gated only by the per-account "restore custom gear" flag
      // (default ON). Seeding it into the initial item state means it's present from the
      // first render, independent of the endpoint restore dialog.
      if (!getRestoreCustomGearPreferenceSnapshot()) return []
      const customItems = loadCustomGearAutosaveDraft({ math: gearInspectorMath, allocItemId: allocGearInspectorItemId })
      if (!customItems || customItems.length === 0) return []
      // Keep the descending allocator cursor below every restored custom id (SSOT helper).
      gearInspectorItemIdRef.current = reseedGearInspectorCustomIdCursor(gearInspectorItemIdRef.current, customItems)
      return customItems
    }
  )
  const gearInspectorItemsRef = useRef(gearInspectorItems)
  useEffect(() => { gearInspectorItemsRef.current = gearInspectorItems }, [gearInspectorItems])
  const [gearInspectorRestoreDraft, setGearInspectorRestoreDraft] = useState<{
    items: GearInspectorItem[]
    savedAt: string | null
    count: number
  } | null>(
    // eslint-disable-next-line react-hooks/refs -- mount-only initializer; allocGearInspectorItemId reads a ref safely at mount, not on re-renders
    () => {
      const draft = loadGearInspectorAutosaveDraft({ math: gearInspectorMath, allocItemId: allocGearInspectorItemId })
      if (!draft) return null
      return { items: draft.items, savedAt: draft.savedAt, count: draft.itemCount }
    }
  )
  // True once any gear-DB endpoint push has been applied this session.
  // Why: RSL Helper data is authoritative and always newer than the localStorage
  // autosave draft. Once fresh gear has landed (even before the restore dialog is
  // shown — e.g. the user Connected from the README dialog first), the restore
  // prompt must NOT offer to restore the stale Gear Inspector draft, or it would
  // overwrite sane new data with old data. Set at the single ingestion sink
  // (applyEndpointPushCommand); consumed when deriving the restore offer.
  const [endpointGearDataApplied, setEndpointGearDataApplied] = useState(false)
  // Gear Inspector champion filters reuse the same metadata as the Gear Inspector grid to keep icons/borders in sync.
  type GearInspectorChampionOption = {
    id: number
    baseId: number | null
    rarity: RankValue | null
    name: string | null
    location: ChampionLocation | null
    count: number
  }
  // Capture the initial item array once at mount for cheap "changed since load" diffing.
  const [gearInspectorAutosaveBaseline] = useState<GearInspectorItem[]>(() => gearInspectorItems)
  // Store latest Gear Inspector items for lazy autosave payload generation.
  const gearInspectorAutosaveItemsRef = useRef<GearInspectorItem[]>(gearInspectorItems)
  useEffect(() => {
    gearInspectorAutosaveItemsRef.current = gearInspectorItems
  }, [gearInspectorItems])
  // Items → pipeline artifacts through the shared projection (SSOT with the background
  // account-push flow, so both paths key safeguard detection identically).
  const gearInspectorPreviewArtifacts = useMemo<NormalizedGearArtifact[]>(
    () => buildPreviewArtifactsFromGearInspectorItems(gearInspectorItems),
    [gearInspectorItems],
  )
  // Content fingerprint of the artifact dataset, used in the pipeline cache key so an
  // add-then-remove endpoint round-trip (artifact set returns to a prior matching-identical
  // state) reuses the cached result instead of recomputing. Folds only the WASM-projected,
  // output-affecting fields (excludes lastUsed/display fields) — see computeArtifactSetContentHash.
  // Recomputed only when the preview artifacts change.
  const artifactContentHash = useMemo(
    () => computeArtifactSetContentHash(gearInspectorPreviewArtifacts),
    [gearInspectorPreviewArtifacts],
  )
  const getArtifactItemId = useCallback((artifact: NormalizedGearArtifact, fallbackIdx?: number): number => {
    // Share one resolver with worker/cache logic so key precedence cannot drift.
    return resolveArtifactItemIdWithFallback(artifact, fallbackIdx)
  }, [])
  const [gearInspectorPreviewRows, setGearInspectorPreviewRows] = useState<GearInspectorPreviewRow[]>([])
  const gearInspectorPreviewRowsRef = useRef<GearInspectorPreviewRow[]>([])
  // Monotonically-increasing counter stamped on the preview DOM whenever the Gear Inspector
  // preview rows commit via startTransition. Tests read data-gear-results-version to confirm
  // that a new pipeline's rows are visible in the DOM before snapshotting outcomes.
  const [gearInspectorResultsVersion, setGearInspectorResultsVersion] = useState(0)
  useEffect(() => { gearInspectorPreviewRowsRef.current = gearInspectorPreviewRows }, [gearInspectorPreviewRows])
  const recoverMissingRulesRef = useRef(false)
  // Live sell/keep verdict map. Built via the shared projection so the gear-diff
  // baseline snapshot and this map stay keyed identically (see verdictDiff.ts).
  const gearInspectorMatchesByItemId = useMemo(
    () => buildVerdictMapFromRows(gearInspectorPreviewRows),
    [gearInspectorPreviewRows],
  )
  // Whether the inline before/after split-view is shown in the preview area.
  const [gearDiffSplitOpen, setGearDiffSplitOpen] = useState(false)
  // Auto-baseline mode (default on): keep a baseline pinned at the last undo checkpoint so
  // the diff is always available — the header delta chip can then show "what changed since
  // the last edit" without the user opening the split-view first.
  const [gearDiffAutoMode, setGearDiffAutoMode] = useState(true)
  // Diff-chip visibility: 'auto' shows the delta chip when a meaningful delta exists (default);
  // 'off' hides it entirely regardless of delta values.
  const [gearDiffChipMode, setGearDiffChipMode] = useState<'off' | 'auto'>('auto')
  // Diff-row filter mode: which verdict side the Gear Inspector filter tests in the split-view.
  // 'any' keeps a row when it passes before OR after (union); 'before'/'after' tests only one side.
  const [gearDiffFilterMode, setGearDiffFilterMode] = useState<'any' | 'before' | 'after'>('any')
  // Gear-diff compare mode: pins a "before" snapshot and diffs it against the live verdict
  // map. The "after" side is always the live pipeline output (see hook note). `active` gates
  // the heavy row-join work to when the split-view is actually open; the cheap delta (for
  // the header chip) is computed regardless.
  // Refs holding the live rank/improvement overlays for the gear-diff baseline capture.
  // Created here (before the hook call) but populated in an effect further down, because
  // safeguardRankByArtifactId / improvementChanceByArtifactId are declared much later in
  // this component and JS bindings aren't hoisted — the hook only reads these at pin time.
  const gearDiffRankRef = useRef<SafeguardRankByArtifactId | null>(null)
  const gearDiffImprovementRef = useRef<ImprovementChanceByArtifactId | null>(null)
  const gearDiffCompare = useGearDiffCompare({
    currentRows: gearInspectorPreviewRows,
    currentVerdicts: gearInspectorMatchesByItemId,
    currentRankRef: gearDiffRankRef,
    currentImprovementRef: gearDiffImprovementRef,
    active: gearDiffSplitOpen,
  })
  // "Reference moved" cue: the baseline object identity changes only when a new reference is
  // pinned (auto-track re-pin, Set reference, note-open, or a load), so this briefly runs the
  // Diff button's border-chase. Gated to non-null so clearing the reference doesn't flash.
  const gearDiffReferencePulsing = useChangePulse(gearDiffCompare.baseline, GEAR_DIFF_REFERENCE_PULSE_MS)
    && gearDiffCompare.baseline != null
  // Toggle auto-baseline mode. (The toggle/reference handlers that need `t` are defined
  // after the i18n hook below.)
  const handleToggleGearDiffAuto = useCallback(() => {
    setGearDiffAutoMode((prev) => !prev)
  }, [])
  const handleChangeDiffChipMode = useCallback((mode: 'off' | 'auto') => {
    setGearDiffChipMode(mode)
  }, [])
  const handleChangeDiffFilterMode = useCallback((mode: 'any' | 'before' | 'after') => {
    setGearDiffFilterMode(mode)
  }, [])
  const [safeguardDetection, setSafeguardDetection] = useState<SafeguardDetectionSnapshot | null>(null)
  // Pre-computed improvement-chance map returned by the WASM worker; null when not computed.
  const [improvementChanceByArtifactId, setImprovementChanceByArtifactId] =
    useState<Map<number, ImprovementChanceWasmEntry> | null>(null)
  // Current export fingerprint from the latest pipeline result (worker-computed crc of the
  // exact bytes an HSF export would produce). Captured alongside safeguardDetection on every
  // pipeline-commit path (fresh/cache-hit/retry); drives the HSF export/push dirty indicator.
  // null until the first pipeline completes.
  const [currentMergedRulesHash, setCurrentMergedRulesHash] = useState<string | null>(null)
  // resolvedSafeguardRules / effectiveSafeguardRules / displaySafeguardRules now come from
  // documentOverridesView (lib/documentOverrides.ts SSOT) — destructured near the top.
  // The instruction merge for prop-drilling below also lives on the view.
  const effectiveSafeguardInstructions = documentOverridesView.effectiveSafeguardInstructions
  // Keep a stable ref so applySafeguardOverridesToRules always reads the latest display rules
  // even when the callback was memoized before the last override answer changed.
  const displaySafeguardRulesRef = useRef(displaySafeguardRules)
  useEffect(() => { displaySafeguardRulesRef.current = displaySafeguardRules }, [displaySafeguardRules])
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
  // State (not ref) so the render-time baseline check can read it without violating react-hooks/refs.
  const [exportBaselineResetPending, setExportBaselineResetPending] = useState(false)
  // Suppression ref for auto side-by-side zoom. Written below once isSimpleView/noteOpen are known;
  // the hook reads it inside its evaluate() and we call reevaluate() when the condition flips so the
  // zoom updates immediately instead of on the next resize. (Ref keeps the hook decoupled from the
  // later declaration order of those two values.)
  const sideBySideZoomSuppressedRef = useRef(false)
  // Live auto-zoom settings (theme flyout) threaded into the hook via a ref so changes apply without
  // re-subscribing the resize listener. Seeded with the current pref values for the first evaluate().
  const sideBySideZoomSettingsRef = useRef<{ enabled: boolean; minZoom: number }>({
    enabled: autoSideBySideZoomEnabled,
    minZoom: autoSideBySideMinZoom,
  })
  const { forceSideBySide: forceSideBySideLayout, canvasWidthPx: sideBySideCanvasWidthPx, reevaluate: reevaluateSideBySideZoom } = useAutoSideBySideZoom({
    suppressedRef: sideBySideZoomSuppressedRef,
    settingsRef: sideBySideZoomSettingsRef,
  })
  // Keep the settings ref current and re-evaluate immediately whenever the user changes either pref.
  useEffect(() => {
    sideBySideZoomSettingsRef.current = { enabled: autoSideBySideZoomEnabled, minZoom: autoSideBySideMinZoom }
    reevaluateSideBySideZoom()
  }, [autoSideBySideZoomEnabled, autoSideBySideMinZoom, reevaluateSideBySideZoom])
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
  // Persisted split ratio (0.0–1.0) for the draggable splitter. Only active in side-by-side mode.
  // Absolute left/right px are derived below from the measured container width so panels scale
  // correctly as the browser window is resized.
  const [splitterRatio, setSplitterRatio] = useSplitterRatio()
  // Live right-panel width during an active drag gesture. The splitter calls onResizeLive on
  // every mousemove; we rAF-throttle to once per frame so we get at most ~60 re-renders/sec.
  // Null means no drag is in progress; the committed splitterRightPx is used instead.
  const [liveRightWidthPx, setLiveRightWidthPx] = useState<number | null>(null)
  const liveRightWidthRafRef = useRef<number | null>(null)
  // Latest value from the splitter — read inside the rAF callback to avoid stale closures.
  const latestLiveRightWidthRef = useRef<number>(0)
  const handleSplitterResizeLive = useCallback((rightPx: number) => {
    latestLiveRightWidthRef.current = rightPx
    // Coalesce multiple mousemove events within one animation frame into a single setState.
    if (liveRightWidthRafRef.current != null) return
    liveRightWidthRafRef.current = requestAnimationFrame(() => {
      liveRightWidthRafRef.current = null
      setLiveRightWidthPx(latestLiveRightWidthRef.current)
    })
  }, [])
  const handleSplitterResize = useCallback((ratio: number) => {
    // Commit the final ratio to localStorage and clear the transient drag state.
    setSplitterRatio(ratio)
    setLiveRightWidthPx(null)
    if (liveRightWidthRafRef.current != null) {
      cancelAnimationFrame(liveRightWidthRafRef.current)
      liveRightWidthRafRef.current = null
    }
  }, [setSplitterRatio])
  // Ref for the flex container that holds both panels + the splitter handle. The splitter writes
  // CSS custom properties here directly during drag so no React re-renders occur mid-gesture.
  const splitterContainerRef = useRef<HTMLDivElement>(null)
  // Measured width of the panels container. Tracked by a ResizeObserver so the px values derived
  // from the ratio stay correct as the window is resized. Seeded to 0 — the useLayoutEffect
  // below initialises CSS vars on the first paint before the observer fires.
  const [containerWidthPx, setContainerWidthPx] = useState<number>(0)
  /* eslint-disable react-you-might-not-need-an-effect/no-initialize-state -- ResizeObserver pattern: DOM measurement is not available until after mount */
  useEffect(() => {
    const el = splitterContainerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      // offsetWidth / contentRect can differ when borders/padding are present; use contentRect
      // for layout consistency since the panels live inside the content box.
      const width = entries[0]?.contentRect.width ?? el.offsetWidth
      setContainerWidthPx(Math.round(width))
    })
    ro.observe(el)
    // Capture the initial size synchronously for the first render.
    setContainerWidthPx(Math.round(el.offsetWidth))
    return () => ro.disconnect()
  }, [])
  /* eslint-enable react-you-might-not-need-an-effect/no-initialize-state */
  // Usable width shared by both panels (container width minus the splitter handle gap).
  const containerUsablePx = Math.max(0, containerWidthPx - GRID_COLUMN_GAP_PX)
  // Derive absolute px from ratio + measured container width; clamp to enforce min panel size.
  const splitterLeftPx = containerUsablePx > 0
    ? Math.max(SPLITTER_MIN_WIDTH_PX, Math.min(containerUsablePx - SPLITTER_MIN_WIDTH_PX, Math.round(splitterRatio * containerUsablePx)))
    // Pre-measurement fallback: estimate the container as the (dynamic) forced canvas width minus the
    // splitter gap — the same width the canvas actually renders at.
    : Math.round(splitterRatio * (sideBySideCanvasWidthPx - GRID_COLUMN_GAP_PX))
  const splitterRightPx = containerUsablePx > 0
    ? containerUsablePx - splitterLeftPx
    : sideBySideCanvasWidthPx - GRID_COLUMN_GAP_PX - splitterLeftPx
  // Keep --splitter-left-width / --splitter-right-width in sync with the committed value.
  // useLayoutEffect runs synchronously before paint so there is no flash on initial render
  // when the user has a saved ratio that differs from the default.
  useLayoutEffect(() => {
    const el = splitterContainerRef.current
    if (!el) return
    el.style.setProperty('--splitter-left-width', `${splitterLeftPx}px`)
    el.style.setProperty('--splitter-right-width', `${splitterRightPx}px`)
  }, [splitterLeftPx, splitterRightPx])
  // Width passed to the note panel so it aligns with the builder column and leaves the
  // gear inspector visible. splitterLeftPx is in the zoomed layout coordinate space; the
  // floating panel is inside #root (zoom:0.81), so it scales to the right visual size automatically.
  // Undefined in single-column mode: the note uses the standard centered Dialog instead.
  const noteDrawerWidthPx = (isSideBySide || forceSideBySideLayout) ? splitterLeftPx : undefined
  // Top / left offsets for the floating note panel measured from getBoundingClientRect() so they
  // are viewport-relative and work correctly as position:fixed coordinates even under CSS zoom.
  const [sbsRowTopPx, setSbsRowTopPx] = useState(0)
  const [sbsRowLeftPx, setSbsRowLeftPx] = useState(0)
  useLayoutEffect(() => {
    if (!(isSideBySide || forceSideBySideLayout)) return
    const el = splitterContainerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setSbsRowTopPx(rect.top)
    setSbsRowLeftPx(rect.left)
  }, [isSideBySide, forceSideBySideLayout])
  const noteDrawerTopPx = (isSideBySide || forceSideBySideLayout) ? sbsRowTopPx : undefined
  const noteDrawerLeftPx = (isSideBySide || forceSideBySideLayout) ? sbsRowLeftPx : undefined
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
  // Slot glyph tints (artifact/accessory) — gated by slotColorScope; fed to both the SlotTintProvider
  // (renders the tint everywhere) and the Manage Colors dialog (edits them).
  const [slotTints, setSlotTints] = useSlotTints()
  // Rarity palette (rarity 1–6) — one editable palette feeds raw accents (borders/charts) and
  // contrast-adapted rarity labels, gated by rarityColorScope. Fed to the provider + dialog.
  const [rarityColors, setRarityColors] = useRarityColors()
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
  // Tag vocabulary offered by both builder panels' tags flyout. Sourced from recipes AND
  // safeguards together so a tag coined on one side can be reused on the other without the
  // user recalling its exact spelling; buildTagVocabulary folds in the app-known tags.
  const tagVocabulary = useMemo(
    () => buildTagVocabulary([
      ...customRecipes.map((recipe) => recipe.tags),
      ...safeguardRules.map((rule) => rule.tags),
    ]),
    [customRecipes, safeguardRules],
  )
  // Track metaset references across Safeguard rules (counting each rule once) so
  // the UI can surface Safeguard dependencies separately from recipe usage.
  const safeguardMetasetUsageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const rule of safeguardRules) {
      // Treat a rule that references the same metaset multiple times as a single hit
      // so the overlay reflects “number of rules” rather than raw ID frequency.
      const metaIds = Array.from(new Set(rule.combination.metaSetNames ?? []))
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
    () => ((rulesBuilding || gearEntriesBuilding) ? lastRecipeNames : recipeNamesForPreview),
    [rulesBuilding, gearEntriesBuilding, recipeNamesForPreview, lastRecipeNames],
  )
  const recipeFgColorsForGrid = useMemo(
    () => ((rulesBuilding || gearEntriesBuilding) ? lastRecipeFgColors : recipeFgColorsForPreview),
    [rulesBuilding, gearEntriesBuilding, recipeFgColorsForPreview, lastRecipeFgColors],
  )
  // Keep Gear Inspector chip labels in sync with the frozen recipe-name snapshot so chips never display mid-build indices.
  const gearInspectorRecipeNamesForGrid = useMemo(() => recipeNamesForGrid.map((name) => {
    if (typeof name !== 'string') return null
    const trimmed = name.trim()
    return trimmed.length > 0 ? trimmed : null
  }), [recipeNamesForGrid])
  const gearInspectorRecipeFgColorsForGrid = useMemo(
    () => recipeFgColorsForGrid.map((c) => (typeof c === 'string' && c.trim() ? c.trim() : null)),
    [recipeFgColorsForGrid],
  )
  // Preview mode (Sellfile Preview vs Gear Inspector) and builder mode (Recipe vs Safeguard)
  // are REMEMBERABLE-VIEW state — the "Remember last view" toggle governs whether they resume on
  // reload (see state/previewBuilderModePreferences.ts). The hooks are useState-shaped so the
  // downstream setters/readers below are unchanged. Preview mode is tracked for UI layout;
  // pipeline matching is always computed regardless.
  const [previewMode, setPreviewMode] = usePreviewModePreference()
  const [builderMode, setBuilderMode] = useBuilderModePreference()
  // Re-measure the builder Paper min-height whenever the mode switches.
  // The recipe chips ResizeObserver only fires when the chips container itself resizes;
  // hiding it (switching to safeguard mode) does not trigger a resize, so the stale
  // min-height from the taller panel stays applied until we force a fresh measurement.
  useEffect(() => {
    scheduleMeasurement()
  }, [builderMode, scheduleMeasurement])
  // Which safeguard rule is selected in the builder (transient — not persisted); stored as list index.
  const [selectedSafeguardRuleIdx, setSelectedSafeguardRuleIdx] = useState<number | null>(() => null)
  // Default focus bucket for the weights flyout candidate list. Seeded when the user clicks a rank /
  // improvement-chance chip in the Gear Inspector (focuses that gear's bucket). Carries the rule
  // index it was seeded for so it auto-invalidates when a different rule is selected or the selection
  // goes multi/empty — the effective key (derived below) only applies while that exact rule is the
  // sole selection, so no scattered clears or clobber-races are needed.
  const [safeguardCandidateFocusGroup, setSafeguardCandidateFocusGroup] =
    useState<{ ruleIdx: number; key: string | null } | null>(null)
  // External scroll request for SafeguardChipsPanel (e.g. Gear Inspector jump). Token increments on each new request.
  const [safeguardFocusRequest, setSafeguardFocusRequest] = useState<{ ruleIdx: number; token: number } | null>(null)
  const safeguardFocusTokenRef = useRef(0)
  // Monotonic token bumped whenever a Gear Inspector chip jump selects a safeguard. An effect pulses
  // the substat-weights button on each change (after the panel re-renders) to point the user at it.
  const [safeguardWeightsPulseToken, setSafeguardWeightsPulseToken] = useState(0)

  // Safeguard builder draft — separate from safeguardRules list so edits stay local until
  // the user explicitly inserts or applies, mirroring the recipe builder's draft model.
  const [safeguardBuilderState, setSafeguardBuilderState] = useState<SafeguardRule>(() => ({
    combination: { slots: [], sets: [], metaSetNames: [], ranks: [], rarities: [], mainStats: [], factions: [] },
    name: '',
    requiredCount: 1,
    activation: SafeguardRuleActivation.ProtectExisting,
    countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE },
    // New builder draft opts into rank-aware main-stat scoring by default (UI default ON).
    weightMainStatByRank: true,
    // Neutral factor by default so the toggle behaves as before until the user tunes it.
    mainStatRankWeightFactor: SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT,
    ignorePreviousSafeguards: SAFEGUARD_DEFAULT_IGNORE_PREVIOUS_SAFEGUARDS,
    ignoreEquippedInCollection: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_COLLECTION,
    ignoreEquippedInVault: SAFEGUARD_DEFAULT_IGNORE_EQUIPPED_IN_VAULT,
    improvementChanceThreshold: SAFEGUARD_DEFAULT_IMPROVEMENT_CHANCE_THRESHOLD,
    substats: [],
    substatMatch: SafeguardSubstatMatch.Min1,
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
  const visibleSafeguardRuleIdsRef = useRef<ReadonlySet<number> | null>(null)

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
  // Pipeline result cache: skip re-running the worker AND all JS post-processing when
  // undo/redo revisits a state we already evaluated.
  // Key = historyCrc:historySize:flags (including includeMatchesInPipeline bit); evicted by LRU size cap or TTL.
  // Stores both the raw worker result and the pre-built UI state so cache hits can call
  // setState with the exact same object references, letting React.memo skip row re-renders.
  const pipelineCacheRef = useRef<Map<string, PipelineCacheEntry>>(new Map())
  // Recency-order Set: a Set iterates in insertion order, so the FIRST key is the least-recently
  // USED. A hit re-inserts its key (delete + add) to move it to the back, and eviction drops the
  // first key — making this a true LRU, not FIFO. Also enables O(1) key removal on TTL eviction.
  const pipelineCacheOrderRef = useRef<Set<string>>(new Set())
  // Shared-graph byte budget over the cached generations (distinct graphs counted once —
  // consecutive entries share rules/detection/improvement graphs via the worker's
  // unchanged-elision). Policy constants + accounting live in lib/pipelineCache.ts.
  const pipelineCacheBudgetRef = useRef<SharedGraphBudget>(new SharedGraphBudget())
  // ── Pipeline-cache mutation SSOT ──────────────────────────────────────────────────
  // Every insert/delete/clear flows through these three helpers so the byte budget can
  // never drift from the map contents. Do NOT mutate pipelineCacheRef/OrderRef directly.
  const pipelineCacheDelete = useCallback((key: string): void => {
    const entry = pipelineCacheRef.current.get(key)
    if (entry) {
      releasePipelineCacheEntry(pipelineCacheBudgetRef.current, entry)
      pipelineCacheRef.current.delete(key)
    }
    // Always drop the recency key, even without a map entry: a stale order key would
    // otherwise make the insert-time eviction loop spin forever (it evicts front-first
    // and relies on the order set strictly shrinking).
    pipelineCacheOrderRef.current.delete(key)
  }, [])
  const pipelineCacheClear = useCallback((): void => {
    pipelineCacheBudgetRef.current.clear()
    pipelineCacheRef.current.clear()
    pipelineCacheOrderRef.current.clear()
  }, [])
  const pipelineCacheInsert = useCallback((key: string, entry: PipelineCacheEntry): void => {
    // Replace-on-reinsert: releases the overwritten entry's charge and moves the key to
    // the back of the recency order (delete + re-add) in one step.
    pipelineCacheDelete(key)
    pipelineCacheRef.current.set(key, entry)
    pipelineCacheOrderRef.current.add(key)
    retainPipelineCacheEntry(pipelineCacheBudgetRef.current, entry)
    // Evict LRU-first until both caps hold, but never below the min-entry floor (the
    // just-inserted key sits at the recency back, so the floor always protects it).
    while (
      pipelineCacheOrderRef.current.size > PIPELINE_CACHE_MIN_ENTRIES
      && (pipelineCacheOrderRef.current.size > PIPELINE_CACHE_MAX_ENTRIES
        || pipelineCacheBudgetRef.current.totalBytes > PIPELINE_CACHE_BUDGET_BYTES)
    ) {
      const oldest = pipelineCacheOrderRef.current.values().next().value!
      pipelineCacheDelete(oldest)
    }
  }, [pipelineCacheDelete])
  // Pipeline cache hit/miss tally for measuring real-world farming hit rate. Exposed on
  // window (test hooks) and logged in dev so we can verify the round-trip cache actually fires
  // on representative endpoint traffic instead of assuming it does.
  const pipelineCacheStatsRef = useRef({ hits: 0, misses: 0 })
  // Ref-shadowed so launchPipeline can read the current signature without adding it to the
  // pipeline dep array (which would cause spurious re-runs on selection-only history steps).
  // Initialized to null; the update effect below keeps it current after the first render.
  const currentEntrySignatureRef = useRef<{ crc: string; size: number } | null>(null)
  // Ref-shadowed so launchPipeline can include recipe overrides in the cache key without adding
  // them to the effect dep array — the effect already re-runs via ruleRecipes/recipeModes changes.
  const noteRecipeOverridesAnswersRef = useRef(noteRecipeOverridesAnswers)
  useLayoutEffect(() => { noteRecipeOverridesAnswersRef.current = noteRecipeOverridesAnswers })
  const noteOverridesDisabledRef = useRef(noteOverridesDisabled)
  useLayoutEffect(() => { noteOverridesDisabledRef.current = noteOverridesDisabled })
  // Ref-shadowed so launchPipeline can include safeguard overrides in the cache key without adding
  // them to the dep array — changes re-run the effect via effectiveSafeguardRules dependency.
  const noteSafeguardOverridesAnswersRef = useRef(noteSafeguardOverridesAnswers)
  useLayoutEffect(() => { noteSafeguardOverridesAnswersRef.current = noteSafeguardOverridesAnswers })
  // Ref-shadowed note so the simple-mode startup restore can prune/seed saved override
  // answers against the freshly-loaded note without a stale closure.
  const sfcNoteRef = useRef(sfcNote)
  useLayoutEffect(() => { sfcNoteRef.current = sfcNote })
  // Gear Inspector substat sorting is view-only but should persist across sessions like filters.
  // Declared here so the pipeline effect (below) can reference both sort prefs and the improvement-chance
  // flag without TDZ errors — their derived values are consumed inside the effect dep array.
  const gearInspectorSubstatSortPrefs = useGearInspectorSubstatSortPreferences()
  // Reactive flag: true when the improvement-chance overlay toggle is on.
  const showSafeguardImprovementChance = useShowSafeguardImprovementChance()
  // True when the improvement-chance sort key appears in the active sort priority list.
  const safeguardChanceSortEnabled = (gearInspectorSubstatSortPrefs.state.priorities ?? [])
    .some((k) => Number(k) === GEAR_INSPECTOR_SORT_KEY_SAFEGUARD_IMPROVEMENT_CHANCE)
  // NOTE: the pipeline cache is NOT cleared on artifact changes anymore. Its key now embeds a
  // CONTENT hash of the artifact dataset (artifactContentHash), so a changed artifact set simply
  // yields a different key (miss) while a return to a prior matching-identical set yields the
  // same key (hit — the add-then-remove farming round-trip). An in-flight run that completes
  // after the artifacts changed writes its result under the hash of the artifacts it actually
  // processed, so it can never be served as a stale hit for a different set. LRU + TTL bound the
  // entry count and bytes (see lib/pipelineCache.ts for the caps/budget).
  // Wipe the pipeline cache whenever the base HSF changes.
  // The cache key is history-based (recipes/metasets CRC) and does not include HSF identity,
  // so any result cached against a different (or absent) HSF is now stale.
  // Declared before the pipeline effect so it runs first in the same React commit.
  useEffect(() => {
    pipelineCacheClear()
  }, [hsf, pipelineCacheClear])

  // Proactively evict entries that have exceeded the TTL so GC can reclaim their memory
  // even when no new pipeline runs happen to trigger a lookup-based eviction.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of pipelineCacheRef.current) {
        if (now - entry.insertedAt > PIPELINE_CACHE_TTL_MS) {
          pipelineCacheDelete(key)
        }
      }
    }, 60_000)
    return () => window.clearInterval(id)
  }, [pipelineCacheDelete])

  useEffect(() => {
    // Pipeline payloads use immediate state snapshots.
    // Why: deferred snapshots can emit follow-up renders for the same user click
    // and repeatedly restart the debounce window before dispatch.
    // Master Recipes toggle gating lives on the SSOT view (documentOverrides.pipelineRecipes).
    const recipesForBuild = documentOverridesView.pipelineRecipes
    // Keep recipe-name snapshots aligned with the same immediate payload so remaps stay deterministic.
    const recipeNamesForBuild = recipeNames
    const recipeFgColorsForBuild = recipeFgColors
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
      // Resolve the pipeline cache key + entry up front (key spec documented below) so the
      // "rebuilding" indicators can be skipped on a cache hit. Otherwise undo/redo revisits
      // — which hit the cache and never touch the worker — still flash the worker/progress
      // UI, reading as "the worker started again".
      const currentSig = currentEntrySignatureRef.current
      // Artifact term of the cache key: a CONTENT hash of the dataset this pipeline will
      // process (the same `gearInspectorPreviewArtifacts` used below), so an add-then-remove
      // round-trip back to a matching-identical state reuses the cached result. This replaced
      // a monotonic version counter that changed on every artifact edit and so never hit on a
      // round-trip. Read from the memo (consistent with the artifacts in this render closure).
      const overridesKey = noteOverridesDisabledRef.current
        ? 'off'
        : JSON.stringify(noteRecipeOverridesAnswersRef.current)
      const sgOverridesKey = noteOverridesDisabledRef.current
        ? 'off'
        : JSON.stringify(noteSafeguardOverridesAnswersRef.current)
      const cacheKey = currentSig
        ? `${currentSig.crc}:${currentSig.size}:a${artifactContentHash}:${includeMatchesInPipeline ? 1 : 0}${omitDisabledForExport ? 1 : 0}${dedupeDefault ? 1 : 0}${showSafeguardImprovementChance ? 1 : 0}${safeguardChanceSortEnabled ? 1 : 0}:${overridesKey}:sg${sgOverridesKey}`
        : null
      const nowMs = Date.now()
      const rawEntry = cacheKey ? (pipelineCacheRef.current.get(cacheKey) ?? null) : null
      // Treat entries past their TTL as misses and remove them eagerly to free memory.
      const cachedEntry = rawEntry !== null && nowMs - rawEntry.insertedAt <= PIPELINE_CACHE_TTL_MS
        ? rawEntry : null
      if (rawEntry !== null && cachedEntry === null) {
        pipelineCacheDelete(cacheKey!)
      }
      // True-LRU + sliding-TTL renewal on a hit: slide the TTL forward (insertedAt = now) and
      // move the key to the back of the recency order (delete + re-add) so a frequently revisited
      // state survives eviction and ageing. Only on a real hit — a stale/missing entry is not
      // renewed. Done before serving so the served entry already reflects its refreshed recency.
      if (cachedEntry !== null && cacheKey !== null) {
        cachedEntry.insertedAt = nowMs
        pipelineCacheOrderRef.current.delete(cacheKey)
        pipelineCacheOrderRef.current.add(cacheKey)
      }
      // Tally hit/miss for measurement. A null cacheKey (no history signature yet) is neither.
      if (cacheKey !== null) {
        const stats = pipelineCacheStatsRef.current
        if (cachedEntry !== null) stats.hits += 1
        else stats.misses += 1
        // Test builds expose the live tally; dev logs each lookup outcome with the running rate.
        if (ALLOW_TEST_HOOKS) {
          ;(window as unknown as { __pipelineCacheStats?: { hits: number; misses: number } }).__pipelineCacheStats = stats
        }
        if (import.meta.env.DEV) {
          const total = stats.hits + stats.misses
          const rate = total > 0 ? Math.round((stats.hits / total) * 100) : 0
          console.log(`[pipeline-cache] ${cachedEntry !== null ? 'HIT ' : 'MISS'} hits=${stats.hits} misses=${stats.misses} rate=${rate}%`)
        }
      }
      // Build/progress toggles fan out through many memoized panels; transition them so
      // user input stays responsive while the worker spins up. Skip entirely on a cache
      // hit so undo/redo revisits don't flash the rebuilding indicator.
      if (cachedEntry === null) {
        startTransition(() => {
          setActiveGearInspectorBuildOrigin(queuedBuildOrigin)
          setRulesBuilding(true)
          setRulesBuildProgress(null)
          // Rules preview mode skips Gear Inspector rows, so avoid flipping build state/progress.
          setGearEntriesBuilding(includeMatchesInPipeline)
          if (includeMatchesInPipeline) setGearEntriesProgress(null)
        })
      }

      // Safeguards payload seeds the worker with the current (overrides-applied) rule set.
      // effectiveSafeguardRules has safeguard-overrides DSL applied on top of resolved rules.
      const safeguardsPayload = {
        enabled: safeguardsEnabled && effectiveSafeguardRules.length > 0,
        rules: effectiveSafeguardRules,
        detection: null as SafeguardDetectionSnapshot | null,
      }
      const toPreviewMatch = (
        result: GearInspectorMatchWorkerItemResult['firstMatch'],
        rules: readonly HsfRuleWithRecipe[],
      ): GearInspectorPreviewMatch | null => {
        if (!result) return null
        const rule = rules[result.ruleIndex]
        // Branch on source the same way HsfRulesTable does: a safeguard match is a safeguard,
        // never a recipe — even though its injected HSF row inherits the originating recipe's
        // RecipeID/RecipeName. Mixing the two produced chips that read as a recipe (name +
        // recipe index) but behaved as a safeguard (tooltip, tint, jump target).
        const isSafeguardRule = rule?.__source === RULE_SOURCE_SAFEGUARDS
        // Recipe identity is suppressed for safeguard matches so the chip shows the safeguard
        // ordinal (not the inherited recipe number) and its label/colour come from the safeguard.
        const recipeIdx = isSafeguardRule ? null : (result.recipeIdx ?? null)
        const recipeName = isSafeguardRule
          ? null
          : resolveMatchRecipeName(recipeIdx, recipeNamesForBuild, rule)
        const recipeFgColor = (recipeIdx != null && recipeIdx >= 0 && recipeIdx < recipeFgColorsForBuild.length)
          ? (recipeFgColorsForBuild[recipeIdx] ?? null)
          : null
        // Safeguards use rule ordinals + their own appearance label instead of recipe names.
        // Resolve the label LIVE from the current safeguard state (by 1-based ordinal), the
        // same source as fgColor below — the merged `rule` snapshot bakes RecipeName at
        // rule-build time, so reading the name off it left the chip stale after a rename
        // while the colour updated. Fall back to the snapshot/ordinal when the live rule is
        // absent (e.g. mid-rebuild) so the chip never blanks.
        const liveSafeguardRule = (isSafeguardRule && rule?.__safeguardRuleOrdinal)
          ? (effectiveSafeguardRules[rule.__safeguardRuleOrdinal - 1] ?? null)
          : null
        const safeguardLabel = isSafeguardRule
          ? (resolveSafeguardRuleLabel(liveSafeguardRule) ?? resolveSafeguardRuleLabel(rule))
          : null
        // Safeguard fgColor from the rule's appearance — index is 1-based ordinal.
        const ruleLabelFgColor = (isSafeguardRule && rule?.__safeguardRuleOrdinal)
          ? (effectiveSafeguardRules[rule.__safeguardRuleOrdinal - 1]?.appearance?.fgColor ?? null)
          : null
        // Recipe matches use the recipe name; safeguard matches use the safeguard label.
        const effectiveRecipeName = isSafeguardRule
          ? safeguardLabel
          : (recipeName && recipeName.length > 0 ? recipeName : null)
        return {
          ruleIndex: result.ruleIndex,
          keep: result.keep,
          recipeIdx,
          recipeName: effectiveRecipeName && effectiveRecipeName.length > 0 ? effectiveRecipeName : null,
          recipeFgColor,
          ruleLabelFgColor,
          ruleLabel: safeguardLabel ?? null,
          ruleSource: rule?.__source ?? null,
          // Legacy ID field; always null in new sessions since SafeguardRule no longer carries id.
          safeguardRuleId: rule?.__safeguardRuleId ?? null,
          // 1-based ordinal for ordinal-based identity checks (preferred over safeguardRuleId).
          safeguardRuleOrdinal: rule?.__safeguardRuleOrdinal ?? null,
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
        // Request WASM improvement-chance computation when the overlay or sort column is active.
        computeImprovementChance: showSafeguardImprovementChance || safeguardChanceSortEnabled,
      }
      // (cache key + entry resolved above, before the rebuilding-indicator guard.)
      // Cancel the prior in-flight run only when dispatching a new payload.
      // Effect rerenders alone no longer abort active work.
      if (pipelineAbortRef.current) {
        pipelineAbortRef.current.abort()
        pipelineAbortRef.current = null
      }
      const abortController = new AbortController()
      pipelineAbortRef.current = abortController

      // On a cache hit resolve immediately without touching the worker.
      // On a miss dispatch to the worker as usual.
      const resultPromise = cachedEntry !== null
        ? Promise.resolve(cachedEntry.result)
        : runPipeline(pipelinePayload, {
            signal: abortController.signal,
            onProgress: (progress) => {
              if (requestToken !== rulesBuildingTokenRef.current) return
              setRulesBuildProgress(progress)
              if (includeMatchesInPipeline) setGearEntriesProgress(progress)
            },
          })
      resultPromise
        .then((result) => {
          // Abort/stale-token guards apply to both cache hits and misses.
          if (abortController.signal.aborted) {
            // Abort is expected control flow during rapid edit bursts.
            return
          }
          if (requestToken !== rulesBuildingTokenRef.current) return

          // Fast path: processed outputs are already cached — skip all JS post-processing
          // and serve the exact same object references so React.memo in row components
          // can skip re-rendering unchanged rows on undo/redo revisits.
          if (cachedEntry !== null) {
            // Rule-table snapshots are large; transition so input-heavy dialogs stay responsive.
            startTransition(() => {
              setRecipeRulesState(cachedEntry.processedSnapshot)
            })
            if (includeMatchesInPipeline && cachedEntry.processedRows !== null) {
              startTransition(() => {
                setGearInspectorPreviewRows(cachedEntry.processedRows!)
                // Increment version in the same transition so DOM updates atomically.
                setGearInspectorResultsVersion((v) => v + 1)
              })
            }
            if (includeMatchesInPipeline || gearInspectorMatchResetRef.current) {
              setGearEntriesCommittedBuildId(requestToken)
              setGearEntriesActiveBuildId(requestToken)
            }
            startTransition(() => {
              // Serve the cached detection but with a fresh scannedAt — the entries are
              // content-identical (same artifacts), only the "last scanned" display time is
              // current. Everything else in the snapshot is reused as-is.
              const cachedDetection = cachedEntry.processedSafeguardDetection
              setSafeguardDetection(
                cachedDetection ? { ...cachedDetection, scannedAt: Date.now() } : null,
              )
              setImprovementChanceByArtifactId(cachedEntry.processedImprovementChance)
              // The cache stored the full pipeline result, so the worker-computed export
              // fingerprint is recovered exactly (no recompute) — see PipelineCacheEntry.
              setCurrentMergedRulesHash(cachedEntry.result.mergedRulesHash)
            })
            setLastRecipeNames(recipeNamesForBuild)
            setLastRecipeFgColors(recipeFgColorsForBuild)
            recoverMissingRulesRef.current = false
            return
          }

          // Slow path: fresh worker result — process, display, then cache processed outputs
          // so future revisits can use the fast path above.
          const { state, matches, safeguardDetection, improvementChanceByArtifactId: improvementChanceResult } = result
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
          let processedRows: GearInspectorPreviewRow[] | null = null
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
            processedRows = sortGearInspectorRows(rows)
            // Gear Inspector row lists can be large; transition to avoid blocking edits.
            startTransition(() => {
              setGearInspectorPreviewRows(processedRows!)
              // Increment version in the same transition so DOM updates atomically.
              setGearInspectorResultsVersion((v) => v + 1)
            })
          }
          // Advance Gear Inspector build ids only when Gear Inspector rows were requested, or when a
          // pending reset wait explicitly needs a completion marker.
          if (includeMatchesInPipeline || gearInspectorMatchResetRef.current) {
            setGearEntriesCommittedBuildId(requestToken)
            setGearEntriesActiveBuildId(requestToken)
          }
          // Safeguard table snapshots and improvement-chance results are preview-only; defer them.
          startTransition(() => {
            setSafeguardDetection(safeguardDetection ?? null)
            setImprovementChanceByArtifactId(improvementChanceResult ?? null)
            // Capture the export fingerprint of the committed merged rules (drives hsfDirty).
            setCurrentMergedRulesHash(result.mergedRulesHash)
          })
          setLastRecipeNames(recipeNamesForBuild)
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
            // Do not cache the retry result; the next normal run will populate the cache.
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
                  improvementChanceByArtifactId: retryImprovementChanceResult,
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
                    // Increment version in the same transition so DOM updates atomically.
                    setGearInspectorResultsVersion((v) => v + 1)
                  })
                }
                if (includeMatchesInPipeline || gearInspectorMatchResetRef.current) {
                  setGearEntriesCommittedBuildId(requestToken)
                  setGearEntriesActiveBuildId(requestToken)
                }
                // Safeguard previews and improvement-chance results are informative, not input-critical.
                startTransition(() => {
                  setSafeguardDetection(retrySafeguardDetection ?? null)
                  setImprovementChanceByArtifactId(retryImprovementChanceResult ?? null)
                  setCurrentMergedRulesHash(retryResult.mergedRulesHash)
                })
                setLastRecipeNames(recipeNamesForBuild)
            setLastRecipeFgColors(recipeFgColorsForBuild)
              })
              .catch((error: unknown) => {
                if (isAbortError(error)) return
                // Retry failed for reasons other than caller abort — surface it so we
                // can see why the recovery path didn't populate rules either.
                console.error(`${ts()} [pipeline] retry worker rejected:`, error)
              })
            return
          }
          recoverMissingRulesRef.current = false

          // Cache the processed outputs so the next revisit of this history state is instant.
          // Insertion, LRU/count/byte-budget eviction and budget bookkeeping all live in
          // pipelineCacheInsert (the mutation SSOT above).
          if (cacheKey !== null) {
            pipelineCacheInsert(cacheKey, {
              result,
              processedSnapshot: snapshot,
              processedRows,
              processedSafeguardDetection: safeguardDetection ?? null,
              processedImprovementChance: improvementChanceResult ?? null,
              insertedAt: Date.now(),
            })
          }
        })
        .catch((error: unknown) => {
          // Aborts are expected control flow during rapid edit bursts — stay silent.
          if (isAbortError(error)) return
          // Any other rejection means the worker pipeline failed (WASM trap, merge error,
          // invalid payload, etc). Surface it to the console so the developer sees why
          // no rules were produced instead of a silent progress-bar disappearance.
          console.error(`${ts()} [pipeline] worker rejected:`, error)
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
    // The gated pipeline recipe list (recipesEnabled ? ruleRecipes : []) read inside.
    documentOverridesView.pipelineRecipes,
    recipeNames,
    recipeFgColors,
    metasets,
    effectiveSubstatTargets,
    hsf,
    finalSellRemainder,
    omitDisabledForExport,
    dedupeDefault,
    safeguardsEnabled,
    effectiveSafeguardRules,
    recipeModes,
    recipesEnabled,
    gearInspectorPreviewArtifacts,
    // Content hash of the artifact set; gates the pipeline cache key. Derived from
    // gearInspectorPreviewArtifacts (already a dep) but listed explicitly so the lint
    // rule sees the read inside cacheKey — and so a content-identical array re-identity
    // does not needlessly re-key the cache.
    artifactContentHash,
    getArtifactItemId,
    showSafeguardImprovementChance,
    safeguardChanceSortEnabled,
    // Stable mutation-SSOT helpers for the pipeline cache (lookup-expiry + insert).
    pipelineCacheDelete,
    pipelineCacheInsert,
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
  // Gear-diff toggle/reference handlers (need `t`, so defined after the i18n hook).
  // Stable refs avoid re-creating these as compare state changes each pipeline commit.
  const gearDiffPinBaselineRef = useRef(gearDiffCompare.pinBaseline)
  useEffect(() => { gearDiffPinBaselineRef.current = gearDiffCompare.pinBaseline }, [gearDiffCompare.pinBaseline])
  // Toggle the inline diff split-view. Shows/hides the view; when opening with no reference
  // set, auto-pins the current state as the baseline so the diff is immediately meaningful.
  // The reference is otherwise owned by Auto-track / Set reference, so the diff data stays
  // available (and the header chip stays visible) whether the view is open or closed.
  const handleToggleGearDiffMode = useCallback(() => {
    if (!gearDiffSplitOpen && gearDiffCompare.baseline === null) {
      // No reference yet — create one from the current state before opening the view.
      gearDiffPinBaselineRef.current(t('gearDiffPinBaseline'))
    }
    setGearDiffSplitOpen((open) => !open)
  }, [gearDiffSplitOpen, gearDiffCompare.baseline, t])
  // Manual "Set reference": pin the current state as the comparison baseline now.
  const handleSetGearDiffReference = useCallback(() => {
    gearDiffPinBaselineRef.current(t('gearDiffPinBaseline'))
  }, [t])
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
  const gearInspectorFinalSellLabel = t('gearInspectorFinalSellChip')
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
  // Forward-bound safeguard request callbacks — wired to useSfcDialogs below.
  // Safeguard chip deletes call these, which open the centralized count-aware
  // ConfirmDialogs (mirrors the recipe pair above). The refs let cross-render
  // callers (e.g. Delete keyboard shortcut) reach the latest helper without
  // re-creating their own callback on every selection change.
  let requestDeleteSafeguardSingleForSelection: (idx: number) => void = () => {}
  let requestDeleteSafeguardMultiForSelection: (targets: number[]) => void = () => {}
  const requestDeleteSafeguardSingleRef = useRef<(idx: number) => void>(() => {})
  const requestDeleteSafeguardMultiRef = useRef<(targets: number[]) => void>(() => {})
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
    targetSafeguardOrdinal: null,
  }))
  // Bump the request token whenever a selection should auto-scroll the preview.
  // Why: a monotonic counter lets the table ignore unrelated renders.
  // Accepts an optional safeguard ordinal for safeguard chip selections (mutually exclusive with targetRecipeIdx).
  const requestSelectionScroll = useCallback((source: SelectionScrollSource, targetRecipeIdx: number | null, targetSafeguardOrdinal?: number | null) => {
    // Increment the token so the preview sees a fresh scroll request.
    // Why: the token change is the sole trigger signal.
    setSelectionScrollRequest((prev) => ({
      // Preserve the monotonic counter to avoid reusing prior tokens.
      token: prev.token + 1,
      // Keep the source so the preview can resolve scroll precedence.
      source,
      // Stash the target so the preview scrolls to the intended recipe or safeguard block.
      targetRecipeIdx,
      targetSafeguardOrdinal: targetSafeguardOrdinal ?? null,
    }))
  }, [])
  const visibleRecipeIndicesRef = useRef<ReadonlySet<number> | null>(null)
  const {
    selectedRecipeIndices,
    setSelectedRecipeIndices,
    multiselectActive,
    selectionAnchor,
    prepareDragSelection,
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
  // 1-based ordinal of the selected safeguard rule, derived from its index in the list.
  // Used to drive HSF row highlight and "Selection on" filtering (mirrors selectedRecipeIdx).
  const selectedSafeguardOrdinal = useMemo(() => {
    if (selectedSafeguardRuleIdx === null) return null
    return selectedSafeguardRuleIdx >= 0 && selectedSafeguardRuleIdx < safeguardRules.length
      ? selectedSafeguardRuleIdx + 1
      : null
  }, [selectedSafeguardRuleIdx, safeguardRules.length])
  // Transitional copy so safeguard highlight updates are deferred like recipe highlight.
  const [previewSelectedSafeguardOrdinal, setPreviewSelectedSafeguardOrdinal] = useState<number | null>(null)
  useEffect(() => {
    startTransition(() => {
      setPreviewSelectedSafeguardOrdinal(selectedSafeguardOrdinal)
    })
  }, [selectedSafeguardOrdinal])
  const syncSelectedRecipeIdx = useCallback((value: React.SetStateAction<number | null>, options?: { preserveSelection?: boolean; forceSync?: boolean; suppressDraft?: boolean; skipAutoApply?: boolean }) => {
    // skipAutoApply skips the pending-edit flush; use it for bulk replacements like SFC
    // loads where the entire recipe list is being replaced and auto-applying stale state
    // would silently overwrite a freshly-loaded recipe.
    if (!options?.skipAutoApply) autoApplyNowRef.current()
    const applySelectionChange = () => {
      const next = typeof value === 'function' ? value(selectedRecipeIdx) : value
      const normalized = (typeof next === 'number' && Number.isInteger(next) && next >= 0) ? next : null
      setSelectedRecipeIdxRaw(normalized)
      updateSelectionAnchor(normalized)
      if (options?.preserveSelection) return
      if (!multiselectActive || options?.forceSync === true || normalized === null) {
        // When auto-apply is suppressed, also suppress the will-change callback so the
        // secondary autoApplyNow path through handleWillChangeSelection cannot fire.
        const suppressWillChange = options?.skipAutoApply === true || undefined
        setSelectedRecipeIndices(normalized === null ? [] : [normalized], suppressWillChange ? { suppressWillChange: true } : undefined)
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
  }
  useLayoutEffect(() => {
    if (!substatTargetsDialogOpen) {
      substatTargetsHistorySessionRef.current = 'idle'
      substatTargetsSessionBaselineRef.current = null
      substatTargetsSessionModeRef.current = null
    }
  }, [substatTargetsDialogOpen])
  // Nonce incremented inside startTransition on every SFC load/selective import.
  // The useEffect below watches it to call markSavedNow() AFTER the history snapshot
  // effect fires in the same commit — ensuring the safety-net does not fire early
  // (the rAF fires before React's useEffect for deferred transition renders).
  const [sfcLoadNonce, setSfcLoadNonce] = useState(0)
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
    currentEntrySignature,
    undoPreview,
    redoPreview,
    historyTimeline,
    jumpToHistoryIndex,
    clearHistory,
  } = useSfcHistoryController({
    customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    sfcNote,
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
    setSfcNote,
    setSelectedRecipeIdx: setSelectedRecipeIdxRaw,
    setSelectedRecipeIndices,
    setSelectionAnchor: updateSelectionAnchor,
    setBuilder,
    setBuilderNameDraft: () => {},
    setBuilderNameDraftKey: () => {},
    setMultiEditDraft: setMultiEditDraftState,
    suppressSelectionDraft: runWithSelectionDraftSuppressed,
    autoApplySelectedRecipe,
    selectedSafeguardRuleIdx,
    setSelectedSafeguardRuleIdx,
    setSafeguardBuilder,
  })
  useLayoutEffect(() => { describeNextChangeRef.current = describeNextChange })
  // Keep the ref in sync so launchPipeline (200ms-debounced) reads the correct value when it fires.
  useEffect(() => { currentEntrySignatureRef.current = currentEntrySignature }, [currentEntrySignature])
  // Auto-baseline: when auto mode is on and the diff split-view is open, re-pin the
  // baseline on each new undo checkpoint (rule-state signature change). At signature-change
  // time the pipeline has not yet recomputed, so the still-current rows are the pre-edit
  // "before" — exactly the checkpoint to diff the upcoming change against.
  const gearDiffAutoSignatureRef = useRef<string | null>(null)
  // Tracks whether the rule set was empty (no recipes AND no safeguards) at the previously
  // recorded checkpoint, so the first load over an empty setup is not treated as a diff.
  const gearDiffPrevRulesEmptyRef = useRef(true)
  // Reacting to the derived undo-signature is the right tool here: edits funnel in from
  // many call sites (builder, safeguards, overrides, SFC load), so there is no single
  // event to hook — the signature change IS the checkpoint signal.
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- derived checkpoint signal, not a single discrete event */
  useEffect(() => {
    if (!gearDiffAutoMode) return
    const crc = currentEntrySignature?.crc ?? null
    // Read the (post-change) rule emptiness now; the value recorded last run reflects the
    // PREVIOUS checkpoint's emptiness, which gates the pin decision below.
    const rulesEmptyNow = customRecipesRef.current.length === 0 && safeguardRulesRef.current.length === 0
    // Pin the still-current (pre-recompute) rows as the new baseline so the diff reflects
    // the change the latest checkpoint introduced — even with the split closed. Skipped:
    //  - the first run after enabling (no prior checkpoint),
    //  - an empty row set (before the gear DB loads there is nothing to compare),
    //  - a transition OUT of an empty setup (e.g. loading your first SFC), which would
    //    otherwise show everything as a flip.
    if (
      gearDiffAutoSignatureRef.current !== null
      && gearDiffAutoSignatureRef.current !== crc
      && gearInspectorPreviewRowsRef.current.length > 0
      && !gearDiffPrevRulesEmptyRef.current
    ) {
      gearDiffPinBaselineRef.current(t('gearDiffPinBaseline'))
    }
    gearDiffAutoSignatureRef.current = crc
    gearDiffPrevRulesEmptyRef.current = rulesEmptyNow
  }, [currentEntrySignature, gearDiffAutoMode, t])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */
  // Note: a gear-DB load/push (artifact-set change) intentionally does NOT touch the diff
  // reference — the diff is intersection-based (see useGearDiffCompare.delta), so inventory
  // changes never show as a diff, and an active comparison survives a push. The "first load
  // over an empty setup produces no diff" case is handled by the auto-tracker's empty-rows /
  // empty-rules guards above.
  // Hold the diff display steady from a rule edit until the worker commits new verdicts, so
  // the header chip and split-view list don't flash empty during the re-pin → rebuild window:
  // the auto-tracker re-pins the baseline to the pre-edit state the instant an edit changes
  // the signature, dropping the live delta to 0 until the new verdicts land. While a rebuild
  // is pending (current signature has no matching verdicts commit yet) we show the last
  // committed diff. Set reference / override toggles don't change the signature, so they
  // update immediately.
  //
  // Snapshot the diff at each verdicts commit via the setState-in-render pattern (React's
  // getDerivedStateFromProps equivalent): the live map only changes when a pipeline result
  // lands, and on that render the delta/diffRows memos are already recomputed, so we capture
  // the fresh values plus the signature they correspond to.
  const [gearDiffFreeze, setGearDiffFreeze] = useState<{
    prevVerdicts: typeof gearInspectorMatchesByItemId
    delta: GearDiffDelta | null
    diffRows: GearDiffRows | null
    commitSig: string | null
  }>(() => ({
    prevVerdicts: gearInspectorMatchesByItemId,
    delta: gearDiffCompare.delta,
    diffRows: gearDiffCompare.diffRows,
    commitSig: currentEntrySignature?.crc ?? null,
  }))
  if (gearDiffFreeze.prevVerdicts !== gearInspectorMatchesByItemId) {
    setGearDiffFreeze({
      prevVerdicts: gearInspectorMatchesByItemId,
      delta: gearDiffCompare.delta,
      diffRows: gearDiffCompare.diffRows,
      commitSig: currentEntrySignature?.crc ?? null,
    })
  }
  // True while the current rule signature has not yet produced its verdicts commit.
  const gearDiffRebuildPending = (currentEntrySignature?.crc ?? null) !== gearDiffFreeze.commitSig
  const gearDiffDisplayDelta = gearDiffRebuildPending ? gearDiffFreeze.delta : gearDiffCompare.delta
  const gearDiffDisplayRows = gearDiffRebuildPending ? gearDiffFreeze.diffRows : gearDiffCompare.diffRows
  // Safety-net: after every SFC load/selective import the nonce changes, which causes
  // this effect to fire in the same React commit as the transition render — AFTER the
  // history snapshot effect (which runs first because useSfcHistoryController was called
  // earlier in the component).  markSavedNow() is idempotent if the snapshot effect
  // already consumed markNextAsSavedRef; it also clears any leaked true value in the
  // edge case where the transition produced no new history entry (identical payload).
  // This replaces the previous rAF-based safety net, which fired before transitions
  // committed and inadvertently prevented markNextSnapshotAsSaved from being honoured.
  useEffect(() => {
    // Must run in the same React commit as the transition render, after the history snapshot
    // effect — timing that cannot be achieved from the SFC load event handler directly.
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (sfcLoadNonce > 0) markSavedNow()
  }, [sfcLoadNonce, markSavedNow])
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

  // Writes the current display safeguard rules (raw stored rules + override instructions applied)
  // back as the new stored safeguard rules, mirroring the recipe overrides apply pattern.
  const applySafeguardOverridesToRules = useCallback(() => {
    // applySafeguardOverrides returns a readonly array; cast to mutable for state dispatch.
    const next = displaySafeguardRulesRef.current as SafeguardRule[]
    // Record the change in history before committing — mirrors applySafeguardRulesChange.
    const descriptor = createSafeguardsRulesChangeDescriptor({
      previous: safeguardRules,
      next,
      metasets,
      mode: 'edit',
    })
    if (descriptor) describeNextChange(descriptor)
    setSafeguardRulesTransition(next)
  }, [describeNextChange, metasets, safeguardRules, setSafeguardRulesTransition])

  // Stable callback for NoteDialog: receives the latest safeguard overrides resolution on every
  // note or answer change. The resolution is already consumed via the effectiveSafeguardRules memo;
  // this callback exists so the type contract is satisfied without routing state through an extra ref.
  const handleSafeguardOverridesResolutionChange = useCallback((_resolution: SafeguardOverridesResolution) => {
    // effectiveSafeguardRules is already derived from safeguardOverridesResolution in App.tsx, so
    // there is nothing additional to propagate here — the memo handles it reactively.
  }, [])

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
    // Eagerly resolve next from the current value so the descriptor can be queued
    // before the state update — more reliable than capturing a variable inside an updater.
    const prev = safeguardsEnabled
    const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value
    // Skip no-op toggles so history stays clean.
    if (prev === next) return
    const descriptor = createSafeguardsEnabledChangeDescriptor({
      previousEnabled: prev,
      nextEnabled: next,
      rules: safeguardRules,
    })
    // Queue descriptor before the state update so the history effect captures it reliably.
    if (options?.publish !== false && descriptor !== null) {
      describeNextChange(descriptor)
    }
    setSafeguardsEnabledTransition(value)
  }, [describeNextChange, safeguardRules, safeguardsEnabled, setSafeguardsEnabledTransition])
  const applyRecipesEnabledChange = useCallback((
    value: React.SetStateAction<boolean>,
    options?: { publish?: boolean },
  ): void => {
    // Eagerly resolve next from the current value to compute the descriptor before
    // the state update — same fix applied across all enable-change helpers.
    const prev = recipesEnabled
    const next = typeof value === 'function' ? (value as (p: boolean) => boolean)(prev) : value
    if (prev === next) return
    const descriptor: HistoryEntryDescriptor = { kind: 'recipesEnabledChange', previousEnabled: prev, nextEnabled: next }
    if (options?.publish !== false) describeNextChange(descriptor)
    setRecipesEnabledTransition(value)
  }, [describeNextChange, recipesEnabled, setRecipesEnabledTransition])
  const applySafeguardRulesChange = useCallback((
    value: React.SetStateAction<SafeguardRule[]>,
    options?: { mode?: 'edit' | 'reset'; publish?: boolean; displayOnly?: boolean },
  ): void => {
    // Safeguards-tab edits often rewrite many rows; keep them in transition lane.
    // Eagerly resolve next from the current rules so the descriptor can be computed
    // and queued before the transition commits — mirrors useItemListManager's snapshot
    // pattern (const prev = items) and avoids relying on React's eager-state evaluation
    // to flush the updater synchronously, which is not guaranteed in React 19+.
    const prev = safeguardRules
    const resolved = typeof value === 'function' ? (value as (p: SafeguardRule[]) => SafeguardRule[])(prev) : value
    // Repair the group structure for every mutation that reaches state. This is the single
    // funnel all safeguard edits pass through, so no insert, delete, reorder, paste or
    // multi-edit can leave a run split, a group of one, or two members of a run disagreeing
    // about their group's count. `prev` lets the normalizer tell which member was just edited
    // (by identity), so a group-strip edit on one member fans out to its whole run. Identity is
    // preserved when nothing needed repair, so the memoized resolver is not invalidated.
    const next = normalizeSafeguardGroups(resolved, prev)
    // Reordering keeps rule contents intact, so compare ID order explicitly.
    const orderChanged = isSafeguardRuleOrderChanged(prev, next)
    // Describe the rule changes so history stays informative.
    const descriptor = createSafeguardsRulesChangeDescriptor({
      previous: prev,
      next,
      metasets,
      mode: options?.mode ?? 'edit',
    })
    // Skip no-op updates so we do not add empty history entries. `displayOnly` opts out of that
    // guard for a change that touches only presentation state — real but deliberately invisible
    // to the descriptor (and to the content fingerprint, so it never re-runs the pipeline).
    if (!descriptor && !orderChanged && options?.displayOnly !== true) return
    // Queue the descriptor before the state update so the history snapshot effect
    // captures it reliably regardless of when React evaluates the transition.
    if (options?.publish !== false && descriptor) describeNextChange(descriptor)
    // Commit through an updater that re-applies the group repair against whatever state React
    // actually holds. Two things matter here: the repair must reach state (committing the
    // caller's raw value would leave a split run or a disagreeing member in the store, with
    // `next` only ever informing the descriptor), and the functional form must be preserved so
    // an interleaved update is not clobbered by the eagerly-resolved snapshot taken above.
    setSafeguardRulesTransition((current) => normalizeSafeguardGroups(
      typeof value === 'function' ? (value as (p: SafeguardRule[]) => SafeguardRule[])(current) : value,
      current,
    ))
  }, [describeNextChange, metasets, safeguardRules, setSafeguardRulesTransition])

  // ── safeguard multi-select / multi-edit (mirrors useRecipeSelection wiring) ─
  // Auto-apply the current draft before any selection change, just like the recipe builder.
  const handleSafeguardWillChangeSelection = useCallback(() => {
    safeguardAutoApplyNowRef.current()
  }, [])
  const {
    selectedRuleIndices: selectedSafeguardRuleIndices,
    setSelectedRuleIndices: setSelectedSafeguardRuleIndices,
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
    // The hook's `handleDeleteSelected` would route through the let-bound
    // closures, which works for chip clicks but not for keyboard handlers that
    // capture stable callbacks. We define our own ref-based wrapper below.
    prepareDragSelection: prepareSafeguardDragSelection,
    handleRuleReorder: handleSafeguardRuleReorder,
  } = useSafeguardSelection({
    safeguardRules,
    applySafeguardRulesChange,
    selectedRuleIdx: selectedSafeguardRuleIdx,
    setSelectedRuleIdx: setSelectedSafeguardRuleIdx,
    onWillChangeSelection: handleSafeguardWillChangeSelection,
    onSelectionScrollRequest: (ruleIdx) => {
      // Scroll the chips panel to keep the newly selected chip visible.
      safeguardFocusTokenRef.current += 1
      setSafeguardFocusRequest({ ruleIdx, token: safeguardFocusTokenRef.current })
      // Also scroll the HSF preview table to the first row for this safeguard.
      const ordinal = ruleIdx + 1
      if (ordinal > 0) requestSelectionScroll(SELECTION_SCROLL_SOURCE_USER, null, ordinal)
    },
    visibleRuleIndicesRef: visibleSafeguardRuleIdsRef,
    setSafeguardBuilder,
    // Route safeguard chip deletes through the centralized ConfirmDialogs so
    // multi-select deletes show the count instead of the singular dialog.
    requestDeleteSingle: (idx) => { requestDeleteSafeguardSingleForSelection(idx) },
    requestDeleteMulti: (targets) => { requestDeleteSafeguardMultiForSelection(targets) },
  })

  // Insert the draft as a new rule after the currently selected rule (or at end).
  // Auto-reset-after-insert is applied by SafeguardBuilderPanel after calling this.
  const handleInsertSafeguardFromBuilder = useCallback(() => {
    const current = safeguardBuilderRef.current
    // Enforce the faction→accessory-slots invariant at save: empty slots with a
    // faction set would silently target artifact that can never match.
    const newRule: SafeguardRule = normalizeSafeguardFactionSlotScope({ ...cloneSafeguardRule(current) })
    // Compute insertion index from current state before enqueuing the updater.
    // Why: functional state updaters are lazy — React evaluates them at render time,
    // not synchronously, so any index captured inside the updater is unavailable here.
    const afterIdx = selectedSafeguardRuleIdx !== null && selectedSafeguardRuleIdx >= 0
      ? selectedSafeguardRuleIdx
      : safeguardRules.length - 1
    const insertedIdx = (afterIdx === -1 || afterIdx >= safeguardRules.length - 1)
      ? safeguardRules.length
      : afterIdx + 1
    applySafeguardRulesChange((prev) => {
      // Insert after the currently-selected rule, or append when nothing is selected.
      if (afterIdx === -1 || afterIdx >= prev.length - 1) {
        return [...prev, newRule]
      }
      const next = [...prev]
      next.splice(insertedIdx, 0, newRule)
      return next
    })
    // Auto-enable safeguards when the first rule is inserted.
    if (safeguardRules.length === 0) applySafeguardsEnabledChange(true, { publish: false })
    // Update both the primary index and the multi-select array so chip highlight is correct.
    setSelectedSafeguardRuleIdx(insertedIdx)
    setSelectedSafeguardRuleIndices([insertedIdx], { suppressWillChange: true })
  }, [applySafeguardRulesChange, applySafeguardsEnabledChange, safeguardRules.length, selectedSafeguardRuleIdx, setSelectedSafeguardRuleIndices])

  // Apply the draft to the currently selected rule.
  const handleApplySafeguardFromBuilder = useCallback(() => {
    if (selectedSafeguardRuleIdx === null) return
    const current = safeguardBuilderRef.current
    // Same faction→accessory-slots normalization as the insert path.
    const updated: SafeguardRule = normalizeSafeguardFactionSlotScope({ ...cloneSafeguardRule(current) })
    applySafeguardRulesChange((prev) => prev.map((r, i) => {
      if (i !== selectedSafeguardRuleIdx) return r
      // The stored rule stays authoritative about MEMBERSHIP: a group edit made from the chip menu
      // while this draft sat open must survive the write-back (see the helper's contract).
      return withStoredSafeguardMembership(updated, r)
    }))
  }, [applySafeguardRulesChange, selectedSafeguardRuleIdx])

  // Reset the builder draft to effective defaults: user-saved defaults if present, factory otherwise.
  const handleResetSafeguardBuilder = useCallback(() => {
    const factory = createFactorySafeguardBuilderDefaults()
    let effectiveDefaults = factory
    try {
      const raw = localStorage.getItem(SAFEGUARD_BUILDER_USER_DEFAULTS_KEY)
      if (raw) {
        // Validate via normalizeSafeguardRule (id field no longer exists on SafeguardRule).
        const normalized = normalizeSafeguardRule(JSON.parse(raw))
        if (normalized) effectiveDefaults = { ...factory, ...normalized }
      }
    } catch {}
    // Reset clears the rule's SETTINGS, not its place in the list: a member stays a member of its
    // group (membership is structure, edited through the chip list, not a field of the form).
    setSafeguardBuilder((prev) => ({ ...effectiveDefaults, ...(prev.group ? { group: prev.group } : {}) }))
  }, [setSafeguardBuilder])

  // Select a rule chip: auto-apply the current draft, then load the new rule into the draft.
  const handleSelectSafeguardRule = useCallback((ruleIdx: number) => {
    safeguardAutoApplyNowRef.current()
    setSelectedSafeguardRuleIdx(ruleIdx)
    // Collapse the multi-select to just this rule so SafeguardChipsPanel highlights it correctly.
    // SafeguardChipsPanel uses selectedRuleIndices (not selectedRuleIdx) when onRuleSelect is
    // provided, so the single-select scalar alone is not enough.
    setSelectedSafeguardRuleIndices([ruleIdx], { suppressWillChange: true })
    // Load the STORED rule (metaset names already intact on safeguardRules — only
    // resolvedSafeguardRules expands them) so the builder reflects pre-override values and the
    // per-control override badges render. Mirrors handleSafeguardRuleSelect, the direct chip-click
    // path, which also loads from safeguardRules; loading the override-applied displaySafeguardRules
    // here would make the draft equal its own effective form and suppress every override badge.
    const rule = safeguardRules[ruleIdx]
    if (rule) setSafeguardBuilder(cloneSafeguardRule(rule))
    // Scroll the HSF preview to the first row of this safeguard — mirrors recipe chip scroll.
    const ordinal = ruleIdx + 1
    if (ordinal > 0) requestSelectionScroll(SELECTION_SCROLL_SOURCE_USER, null, ordinal)
  }, [safeguardRules, setSafeguardBuilder, setSelectedSafeguardRuleIndices, requestSelectionScroll])

  // Shared helper: build a scaffolded SafeguardRule from a recipe without touching state.
  // Uses safeguardBuilderRef.current as the base so id/countMode/etc. are preserved.
  const buildScaffoldedSafeguardFromRecipe = useCallback((recipeIndex: number): SafeguardRule | null => {
    const recipe = customRecipes[recipeIndex]
    if (!recipe || recipe.exportMode === 'separator') return null
    const combination = buildSafeguardCombinationFromRecipe(recipe)
    const rawName = (recipe.appearance?.name ?? '').trim()
    const safeguardName = `Protect: ${rawName || `Recipe ${recipeIndex + 1}`}`
    return {
      ...cloneSafeguardRule(safeguardBuilderRef.current),
      appearance: { name: safeguardName },
      combination,
      requiredCount: 2,
      activation: SafeguardRuleActivation.AnticipateGaps,
      substats: [...(recipe.substatsV ?? [])],
      substatMatch: SafeguardSubstatMatch.Min1,
      substatWeights: {},
    }
  }, [customRecipes])

  // Scaffold the builder draft from a recipe (loads into draft; user then inserts or applies manually).
  const handleScaffoldSafeguardFromRecipe = useCallback((recipeIndex: number) => {
    const scaffolded = buildScaffoldedSafeguardFromRecipe(recipeIndex)
    if (!scaffolded) return
    setSafeguardBuilder(scaffolded)
    if (builderMode !== 'safeguard') setBuilderMode('safeguard')
  }, [buildScaffoldedSafeguardFromRecipe, setSafeguardBuilder, builderMode, setBuilderMode])

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
  // 'warning' joined for disclosures that are neither success nor failure (e.g. the
  // anomalous export scrub) — MUI Alert renders all three natively.
  const [toastSeverity, setToastSeverity] = useState<'success' | 'error' | 'warning'>('success')
  const [toastIcon, setToastIcon] = useState<ReactNode>(<SaveIcon fontSize="inherit" />)
  const showToast = useCallback((message: string, options?: { severity?: 'success' | 'error' | 'warning'; icon?: ReactNode }) => {
    setToastMsg(message)
    setToastSeverity(options?.severity ?? 'success')
    setToastIcon(options?.icon ?? <SaveIcon fontSize="inherit" />)
    setToastOpen(true)
  }, [setToastMsg, setToastSeverity, setToastIcon, setToastOpen])
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
    // Gear update toasts are not useful in express mode — suppress them.
    if (simpleMode) return
    // Clear any prior diff payload so text stays compact.
    setGearDbCommandToast({ message, severity })
  }, [simpleMode])
  // Diff toasts carry rich UI payloads instead of plain strings.
  const showGearDbDiffToast = useCallback((payload: GearDbDiffToastPayload) => {
    // Gear update toasts are not useful in express mode — suppress them.
    if (simpleMode) return
    // Severity stays 'success' so the diff list remains the success/update path; the
    // shared style spec (below) decides the actual surface colour at render time.
    setGearDbCommandToast({ severity: 'success', diff: payload })
  }, [simpleMode])
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
  const clearGearDbCommandError = useCallback(() => { setGearDbCommandError(null) }, [setGearDbCommandError])
  const [gearDbCommandSuccess, setGearDbCommandSuccess] = useState<string | null>(null)
  const clearGearDbCommandSuccess = useCallback(() => { setGearDbCommandSuccess(null) }, [setGearDbCommandSuccess])
  // History toast toggle keeps endpoint updates quiet without hiding status badges.
  // Persisted to localStorage so the preference survives reloads.
  const [hideGearDbUpdateToast, setHideGearDbUpdateToast] = useHideGearDbUpdateToastPreference()
  // Toggle helper keeps the checkbox handler stable for the header menu.
  const toggleHideGearDbUpdateToast = useCallback((next: boolean) => {
    setHideGearDbUpdateToast(next)
  }, [setHideGearDbUpdateToast])
  // Pause toggle silently drops endpoint pushes for the session without queuing them.
  const [pauseEndpointUpdates, setPauseEndpointUpdates] = useState(false)
  // Toggle helper keeps the checkbox handler stable for the header menu.
  const togglePauseEndpointUpdates = useCallback((next: boolean) => {
    setPauseEndpointUpdates(next)
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
  // Accepts building/committedBuildId/previewRows captured at render time so all three reflect
  // the just-committed state — queueMicrotask fires before useEffect, so reading refs directly
  // (for any of these values) would still see stale data when the microtask runs.
  const drainGearDbDiffToast = useCallback((building: boolean, committedBuildId: number, previewRows: GearInspectorPreviewRow[]) => {
    const pending = gearDbDiffToastPendingRef.current
    // Nothing queued means nothing to render.
    if (!pending) return
    // Ignore stale entries if a newer diff request superseded this one.
    if (pending.requestId !== gearDbDiffToastRequestIdRef.current) return
    // Wait until the Gear Inspector grid has committed a new build for the update.
    if (building) return
    // Ignore commits that predate the queued diff request.
    if (committedBuildId <= pending.baselineBuildId) return
    // Map the render-time preview rows so matches line up with the diff entries.
    // Using the state value (not gearInspectorPreviewRowsRef) is critical — the ref is
    // updated by a useEffect that runs after the microtask, so it would still be stale here.
    const matchesAfter = buildMatchMapByArtifactId(previewRows)
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
  // Re-attempt drain whenever the build id, building flag, or preview rows advance.
  // Including gearEntriesBuilding ensures the drain retries once startTransition commits
  // the building=false update — without it, updates that keep the row count constant
  // (e.g. a single piece level-up) never get a second drain attempt after the first one
  // bails on building=true.
  const drainTriggerKey = `${gearEntriesBuilding}|${gearEntriesCommittedBuildId}|${gearInspectorPreviewRows.length}`
  const [prevDrainTriggerKey, setPrevDrainTriggerKey] = useState(drainTriggerKey)
  if (drainTriggerKey !== prevDrainTriggerKey) {
    setPrevDrainTriggerKey(drainTriggerKey)
    // Capture all three state values now — queueMicrotask fires before useEffect, so refs
    // updated by effects (building flag, committedBuildId, preview rows) would still be
    // stale when the microtask runs. Passing them as arguments avoids all three races.
    const drainBuilding = gearEntriesBuilding
    const drainCommittedBuildId = gearEntriesCommittedBuildId
    const drainPreviewRows = gearInspectorPreviewRows
    // Scheduling during render is intentional: moving this to useEffect would let other
    // effects update gearDbDiffToastPendingRef before the drain fires, masking diffs.
    // The guarded render-time pattern above ensures we schedule at most once per change.
    // react-hooks/refs fires because drainGearDbDiffToast reads a ref via closure;
    // @eslint-react/purity fires because queueMicrotask itself is a render-time side effect.
    // eslint-disable-next-line react-hooks/refs, @eslint-react/purity -- see comment above
    queueMicrotask(() => drainGearDbDiffToast(drainBuilding, drainCommittedBuildId, drainPreviewRows))
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
  }, [setFocusRuleIndex])
  // Gear Inspector consumes this to expand + scroll to a targeted artifact card.
  const [gearInspectorArtifactFocusRequest, setGearInspectorArtifactFocusRequest] = useState<GearInspectorArtifactFocusRequest | null>(null)
  // Selected gear items: optimistically updated on click and reconciled with endpoint response.
  // Only active when the WebSocket push endpoint is connected.
  const [selectedGearItemIds, setSelectedGearItemIds] = useState<ReadonlySet<number>>(() => new Set())
  // Set when an endpoint push changes the dataset; cleared by the deferred filter-reconciliation effect.
  const pendingEndpointSelectionFilterRef = useRef(false)
  // Incremented each time an endpoint push begins rebuilding rows so the grid can capture a scroll anchor.
  const [endpointScrollRestoreToken, setEndpointScrollRestoreToken] = useState(0)
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
  useLayoutEffect(() => { logicHubOpenRef.current = logicHubOpen })
  useLayoutEffect(() => {
    if (!logicHubOpen) {
      finalSellHistorySessionRef.current = 'idle'
      finalSellSessionBaselineRef.current = null
      finalSellSessionModeRef.current = null
    }
  }, [logicHubOpen])
  // View-only rules filter state
  const [filterOpen, setFilterOpenRaw, filterOpenByMode] = useRulesFilterOpenPreference(previewMode)
  const [rulesFilter, setRulesFilterRaw, rulesFilterByMode] = useRulesFilterStatePreference(previewMode)
  const [filterCollapsed, setFilterCollapsedRaw, filterCollapsedByMode] = useRulesFilterCollapsedPreference(previewMode)
  const [filtersSynced, setFiltersSyncedRaw] = useRulesFilterSyncPreference()
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

	    // Sorting can be active via priorities (classic mode), normalized specs (preset-only mode), or
	    // a non-default direction alone ('asc') — the latter reverses the natural order with no priorities.
	    const directionActive = gearInspectorSubstatSortPrefs.state.direction === 'asc'
	    const hasAnySort = priorities.length > 0 || normalizedEffective || directionActive
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
  // Built-ins are seeded and merged by parsePresets inside the store, so no client-side merge needed.
  const [filterPresets, setFilterPresets] = useFilterPresetsPreference()
  // Saved sort presets — independent of filter presets so users manage sort configs separately.
  const [sortPresets, setSortPresets] = useSortPresetsPreference()

  // Delegate to the shared SSOT id generator (presetUtils) so every preset store mints ids identically.
  const createFilterPresetId = useCallback((): string => createPresetId(), [])

  const buildFilterPresetSnapshot = useCallback((includeSort: boolean): FilterPresetSnapshot => {
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
    // exactOptionalPropertyTypes: only spread the sort field when the user opted in.
    const sortField: Pick<FilterPresetSnapshot, 'gearInspectorSubstatSort'> = includeSort
      ? { gearInspectorSubstatSort: gearInspectorSubstatSortPrefs.state }
      : {}
    return {
      version: FILTER_PRESETS_VERSION,
      filtersSynced: Boolean(filtersSynced),
      limitRecipesToFiltered: Boolean(limitRecipesToFiltered),
      gearInspectorRecipeFilterMode: gearInspectorRecipeFilterMode,
      ...sortField,
      views,
    }
  }, [
    filterCollapsedByMode,
    filterOpenByMode,
    filtersSynced,
    limitRecipesToFiltered,
    rulesFilterByMode,
    gearInspectorRecipeFilterMode,
    gearInspectorSubstatSortPrefs.state,
  ])

  const handleSaveFilterPreset = useCallback((name: string, includeSort: boolean, color: string | undefined, iconId: MetasetIconId | undefined, pinned: boolean, exclusive: boolean) => {
    // Presets allow duplicates; the internal ID is what disambiguates entries.
    const trimmed = name.trim()
    if (!trimmed) return
    // exactOptionalPropertyTypes: spread each optional field only when set so absent fields stay absent.
    const colorField: Pick<FilterPreset, 'color'> = color ? { color } : {}
    const iconField: Pick<FilterPreset, 'iconId'> = iconId ? { iconId } : {}
    const pinnedField: Pick<FilterPreset, 'pinned'> = pinned ? { pinned: true } : {}
    // Absent = OR/merge (the default); only persist the flag when the user opts into replace.
    const exclusiveField: Pick<FilterPreset, 'exclusive'> = exclusive ? { exclusive: true } : {}
    const preset: FilterPreset = {
      id: createFilterPresetId(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      snapshot: buildFilterPresetSnapshot(includeSort),
      ...colorField,
      ...iconField,
      ...pinnedField,
      ...exclusiveField,
    }
    setFilterPresets((prev) => [preset, ...(Array.isArray(prev) ? prev : [])])
  }, [buildFilterPresetSnapshot, createFilterPresetId, setFilterPresets])

  const handleApplyFilterPreset = useCallback((presetId: string) => {
    // Apply by ID so duplicates by name remain safe and predictable.
    const preset = (filterPresets ?? []).find((entry) => entry.id === presetId)
    if (!preset) return
    const snap = preset.snapshot
    // OR mode (the default): merge the preset's payload into the CURRENT filter panel (projected to
    // that panel via cross-panel mapping) without switching the preview mode or touching globals.
    // setRulesFilter/setFilterCollapsed are sync-aware (they fan out to both modes when synced).
    if (!preset.exclusive) {
      // Resolve against the ACTIVE panel so a stale other-panel view can't override what the
      // user configured here (see presetPayloadView). Needs the view itself for `collapsed`,
      // so it calls the shared resolver directly rather than presetPayloadForMode.
      const view = presetPayloadView(preset, previewMode)
      if (!view) return
      const payload = projectFilterStateToMode(view.state, previewMode)
      setRulesFilter((prev) => mergeRulesFilterState(prev, payload))
      // Expand any section the preset expands so the merged filters are immediately visible
      // (collapsed === true means collapsed, so a section stays collapsed only when both agree).
      setFilterCollapsed((prev) => {
        const next = { ...prev } as CollapsedSections
        for (const key of Object.keys(next) as (keyof CollapsedSections)[]) {
          next[key] = Boolean(prev[key]) && Boolean(view.collapsed[key])
        }
        return next
      })
      return
    }
    // Exclusive mode: REPLACE the entire filter (legacy behavior).
    // Sync preference must apply before derived setters (filterOpen/rulesFilter) decide how to fan-out.
    setFiltersSyncedRaw(Boolean(snap.filtersSynced))
    setLimitRecipesToFiltered(Boolean(snap.limitRecipesToFiltered))
    setGearInspectorRecipeFilterMode(snap.gearInspectorRecipeFilterMode)
    // Only restore sort when the preset explicitly includes it (undefined = preserve current sort).
    if (snap.gearInspectorSubstatSort !== undefined) {
      setGearInspectorSubstatSortState(snap.gearInspectorSubstatSort)
    }
    // Replace both panels' filter views from the snapshot; the preview mode is left untouched
    // (presets are mode-agnostic and never switch the active panel).
    for (const mode of RULES_FILTER_PREVIEW_MODES) {
      const view = snap.views?.[mode]
      if (!view) continue
      setRulesFilterOpenForMode(mode, Boolean(view.open))
      const clonedState = JSON.parse(JSON.stringify(view.state)) as RulesFilterState
      const clonedCollapsed = JSON.parse(JSON.stringify(view.collapsed)) as CollapsedSections
      setRulesFilterStateForMode(mode, clonedState)
      setRulesFilterCollapsedForMode(mode, clonedCollapsed)
    }
  }, [
    filterPresets,
    previewMode,
    setRulesFilter,
    setFilterCollapsed,
    setFiltersSyncedRaw,
    setLimitRecipesToFiltered,
    setGearInspectorRecipeFilterMode,
  ])

  // Translates a Gear Analytics cross-filter selection into a RulesFilterState applied to the
  // Gear Inspector filter only. Does not switch tabs — the user navigates manually.
  const handleApplyGearAnalyticsFilter = useCallback((dim: GearAnalyticsDim) => {
    // Improvement-chance bins → inspector's [min,max] range. Selecting bins inherently excludes
    // unassessed items, so includeUnassessed is false when a bin selection is active. When no bins
    // are selected, omit the key so the default range (from the spread below) carries through.
    const improvChanceRange = improvChanceBinsToRange(dim.improvChanceBins)
    const next: RulesFilterState = {
      ...DEFAULT_RULES_FILTER_STATE,
      slots: {
        selected: dim.slots.size > 0 ? [...dim.slots] as RulesFilterState['slots']['selected'] : [],
        anyMode: 'include',
      },
      rank: {
        selected: dim.ranks.size > 0 ? [...dim.ranks] as RulesFilterState['rank']['selected'] : [],
        anyMode: 'include',
      },
      rarity: {
        selected: dim.rarities.size > 0 ? [...dim.rarities] as RulesFilterState['rarity']['selected'] : [],
        anyMode: 'include',
      },
      sets: {
        selected: dim.sets.size > 0
          ? [...dim.sets].map((id) => ({ id: id as RulesFilterState['sets']['selected'][number]['id'] }))
          : [],
        anyMode: 'include',
      },
      level: {
        selected: dim.levels.size > 0 ? [...dim.levels] as RulesFilterState['level']['selected'] : [],
        anyMode: 'include',
      },
      main: {
        selected: dim.mainStats.size > 0 ? [...dim.mainStats] as RulesFilterState['main']['selected'] : [],
        anyMode: 'include',
      },
      gearInspectorSources: dim.sources.size > 0 ? { selected: [...dim.sources] } : { selected: [] },
      // Spread the bin-derived range only when bins are selected; otherwise the default range from
      // the DEFAULT_RULES_FILTER_STATE spread above remains in effect.
      ...(improvChanceRange
        ? { gearInspectorImprovementChance: { min: improvChanceRange.min, max: improvChanceRange.max, includeUnassessed: false } }
        : {}),
      // 'keep' and 'safe' both map to the keep flag; 'none' maps to unmatched (no rule triggered).
      gearInspectorResult: dim.outcomes.size > 0
        ? {
            keep:      dim.outcomes.has('keep') || dim.outcomes.has('safe'),
            sell:      dim.outcomes.has('sell'),
            matched:   false,
            unmatched: dim.outcomes.has('none'),
          }
        : { keep: false, sell: false, matched: false, unmatched: false },
    }
    // Apply to the Gear Inspector filter only — the sellfile preview filter is left untouched.
    setRulesFilterStateForMode('gearInspector', next)
  }, [])

  // Inverse of handleApplyGearAnalyticsFilter: maps a RulesFilterState back to a GearAnalyticsDim.
  // Used to populate the "Copy from Gear Inspector" button in the Gear Analytics tab.
  // Note: gearInspectorResult.keep covers both 'keep' and 'safe' (no distinction in the filter).
  const gearInspectorDimForAnalytics = useMemo<GearAnalyticsDim>(() => {
    const f = rulesFilterByMode['gearInspector'] ?? DEFAULT_RULES_FILTER_STATE
    const slots = new Set((f.slots?.selected ?? []).map(Number))
    const ranks = new Set((f.rank?.selected ?? []).map(Number))
    const rarities = new Set((f.rarity?.selected ?? []).map(Number))
    const sets = new Set(
      (f.sets?.selected ?? []).filter((e) => !e.excluded).map((e) => Number(e.id)),
    )
    const levels = new Set((f.level?.selected ?? []).map(Number))
    const mainStats = new Set((f.main?.selected ?? []).map(Number))
    // Inspector improvement-chance range → overlapping histogram bins (empty for the full 0–100 range).
    const ic = f.gearInspectorImprovementChance
    const improvChanceBins = rangeToImprovChanceBins(ic?.min ?? 0, ic?.max ?? 100)
    const sources = new Set<GearAnalyticsSource>((f.gearInspectorSources?.selected ?? []) as GearAnalyticsSource[])
    const outcomes = new Set<GearAnalyticsOutcome>()
    // keep=true covers both 'keep' (rule triggered, keep) and 'safe' (safeguarded);
    // the filter cannot distinguish them so both are included in the dim.
    if (f.gearInspectorResult?.keep) { outcomes.add('keep'); outcomes.add('safe') }
    if (f.gearInspectorResult?.sell) outcomes.add('sell')
    if (f.gearInspectorResult?.unmatched) outcomes.add('none')
    if (slots.size === 0 && ranks.size === 0 && rarities.size === 0 && sets.size === 0 &&
        levels.size === 0 && mainStats.size === 0 && sources.size === 0 && outcomes.size === 0 &&
        improvChanceBins.size === 0) {
      return EMPTY_GEAR_ANALYTICS_DIM
    }
    return { slots, ranks, rarities, sets, outcomes, sources, levels, mainStats, improvChanceBins }
  }, [rulesFilterByMode])

  const handleDeleteFilterPreset = useCallback((presetId: string) => {
    // Deleting is purely local: remove the entry and keep the rest stable.
    setFilterPresets((prev) => (Array.isArray(prev) ? prev.filter((entry) => entry.id !== presetId) : []))
  }, [setFilterPresets])

  const handleHideFilterPreset = useCallback((presetId: string, hidden: boolean) => {
    // Spread the hidden flag onto the matching entry; omit the field entirely when unhiding.
    setFilterPresets((prev) => Array.isArray(prev)
      ? prev.map((entry) => entry.id !== presetId ? entry : hidden ? { ...entry, hidden: true as const } : (({ hidden: _h, ...rest }) => rest)(entry))
      : [],
    )
  }, [setFilterPresets])
  const handleTogglePinFilterPreset = useCallback((presetId: string, pinned: boolean) => {
    // Spread pinned onto the matching entry; omit the field entirely when un-pinning (incl. default-pinned built-ins).
    setFilterPresets((prev) => Array.isArray(prev)
      ? prev.map((entry) => entry.id !== presetId ? entry : pinned ? { ...entry, pinned: true as const } : (({ pinned: _p, ...rest }) => rest)(entry))
      : [],
    )
  }, [setFilterPresets])
  const handleMoveFilterPreset = useCallback((presetId: string, direction: 'up' | 'down') => {
    setFilterPresets((prev) => {
      if (!Array.isArray(prev)) return prev
      const idx = prev.findIndex((entry) => entry.id === presetId)
      // Guard against stale IDs or already-at-boundary moves.
      if (idx < 0) return prev
      if (direction === 'up' && idx === 0) return prev
      if (direction === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      // Swap the two adjacent entries to reorder; temp variable avoids TS undefined-index errors.
      const tmp = next[idx]!
      next[idx] = next[swapIdx]!
      next[swapIdx] = tmp
      return next
    })
  }, [setFilterPresets])

  // --- Sort preset handlers -------------------------------------------------

  const handleSaveSortPreset = useCallback((name: string, includeFilter: boolean, color: string | undefined, iconId: MetasetIconId | undefined, pinned: boolean, exclusive: boolean) => {
    const trimmed = name.trim()
    if (!trimmed) return
    // Capture the filter snapshot without sort (sort lives in snapshot already; no need to double-store).
    const filterField: Pick<SortPreset, 'filterSnapshot'> = includeFilter
      ? { filterSnapshot: buildFilterPresetSnapshot(false) }
      : {}
    // exactOptionalPropertyTypes: spread each optional field only when set so absent fields stay absent.
    const colorField: Pick<SortPreset, 'color'> = color ? { color } : {}
    const iconField: Pick<SortPreset, 'iconId'> = iconId ? { iconId } : {}
    const pinnedField: Pick<SortPreset, 'pinned'> = pinned ? { pinned: true } : {}
    // Absent = OR/stack (the default); only persist the flag when the user opts into replace.
    const exclusiveField: Pick<SortPreset, 'exclusive'> = exclusive ? { exclusive: true } : {}
    const preset: SortPreset = {
      // Reuse the same UUID strategy as filter presets for low collision risk.
      id: createFilterPresetId(),
      name: trimmed,
      savedAt: new Date().toISOString(),
      // Deep-clone so subsequent sort mutations don't corrupt the saved snapshot.
      snapshot: JSON.parse(JSON.stringify(gearInspectorSubstatSortPrefs.state)) as typeof gearInspectorSubstatSortPrefs.state,
      ...filterField,
      ...colorField,
      ...iconField,
      ...pinnedField,
      ...exclusiveField,
    }
    setSortPresets((prev) => [preset, ...(Array.isArray(prev) ? prev : [])])
  }, [buildFilterPresetSnapshot, createFilterPresetId, gearInspectorSubstatSortPrefs, setSortPresets])

  const handleApplySortPreset = useCallback((presetId: string) => {
    // Look through user presets + built-ins for the matching ID.
    const preset = sortPresets.find((entry) => entry.id === presetId)
    if (!preset) return
    // OR mode (default) stacks the preset's sort levels onto the current sort; exclusive replaces.
    setGearInspectorSubstatSortState(
      preset.exclusive
        ? preset.snapshot
        : mergeSortState(gearInspectorSubstatSortPrefs.state, preset.snapshot),
    )
    // Restore the captured filter state only when the preset explicitly includes it.
    if (preset.filterSnapshot !== undefined) {
      const snap = preset.filterSnapshot
      setFiltersSyncedRaw(Boolean(snap.filtersSynced))
      setLimitRecipesToFiltered(Boolean(snap.limitRecipesToFiltered))
      setGearInspectorRecipeFilterMode(snap.gearInspectorRecipeFilterMode)
      for (const mode of RULES_FILTER_PREVIEW_MODES) {
        const view = snap.views?.[mode]
        if (!view) continue
        setRulesFilterOpenForMode(mode, Boolean(view.open))
        setRulesFilterStateForMode(mode, JSON.parse(JSON.stringify(view.state)) as RulesFilterState)
        setRulesFilterCollapsedForMode(mode, JSON.parse(JSON.stringify(view.collapsed)) as CollapsedSections)
      }
      // The preview mode is left untouched — restoring a sort preset never switches the active panel.
    }
  }, [
    sortPresets,
    gearInspectorSubstatSortPrefs.state,
    setFiltersSyncedRaw,
    setLimitRecipesToFiltered,
    setGearInspectorRecipeFilterMode,
  ])

  // Untoggle a pinned sort preset: pure-subtract its stacked levels, then re-derive only the shared
  // scalar modes (direction, grouping, normalized, …) from the other still-active OR sort presets —
  // mirroring the filter-preset un-OR. Exclusive presets clear the entire sort (legacy).
  const handleUnapplySortPreset = useCallback((presetId: string) => {
    const preset = sortPresets.find((entry) => entry.id === presetId)
    if (!preset) return
    if (preset.exclusive) {
      clearGearInspectorSubstatSort()
      return
    }
    const current = gearInspectorSubstatSortPrefs.state
    // Active OR sort presets (other than this one) whose shared modes must survive.
    const survivors = sortPresets.filter((p) => (
      p.id !== presetId && !p.exclusive
      && sortStateHasContribution(p.snapshot) && sortStateContains(current, p.snapshot)
    ))
    let next = subtractSortState(current, preset.snapshot)
    for (const s of survivors) next = reapplySortScalars(next, s.snapshot)
    setGearInspectorSubstatSortState(next)
  }, [sortPresets, gearInspectorSubstatSortPrefs.state, clearGearInspectorSubstatSort])

  const handleDeleteSortPreset = useCallback((presetId: string) => {
    // Guard: built-ins are never in the user list, but filter defensively.
    setSortPresets((prev) => (Array.isArray(prev) ? prev.filter((entry) => entry.id !== presetId) : []))
  }, [setSortPresets])

  const handleHideSortPreset = useCallback((presetId: string, hidden: boolean) => {
    setSortPresets((prev) => Array.isArray(prev)
      ? prev.map((entry) => entry.id !== presetId ? entry : hidden ? { ...entry, hidden: true as const } : (({ hidden: _h, ...rest }) => rest)(entry))
      : [],
    )
  }, [setSortPresets])
  const handleTogglePinSortPreset = useCallback((presetId: string, pinned: boolean) => {
    // Spread pinned onto the matching entry; omit the field entirely when un-pinning.
    setSortPresets((prev) => Array.isArray(prev)
      ? prev.map((entry) => entry.id !== presetId ? entry : pinned ? { ...entry, pinned: true as const } : (({ pinned: _p, ...rest }) => rest)(entry))
      : [],
    )
  }, [setSortPresets])

  const handleMoveSortPreset = useCallback((presetId: string, direction: 'up' | 'down') => {
    setSortPresets((prev) => {
      if (!Array.isArray(prev)) return prev
      const idx = prev.findIndex((entry) => entry.id === presetId)
      if (idx < 0) return prev
      if (direction === 'up' && idx === 0) return prev
      if (direction === 'down' && idx === prev.length - 1) return prev
      const next = [...prev]
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      const tmp = next[idx]!
      next[idx] = next[swapIdx]!
      next[swapIdx] = tmp
      return next
    })
  }, [setSortPresets])

  // A pinned filter preset is "active" when the live state, captured as a snapshot, equals its snapshot.
  // Capture with matching includeSort so a sort-agnostic preset (sort omitted) ignores the live sort.
  // An OR preset is "satisfied" when the CURRENT panel's filter already contains its payload AND
  // the payload actually contributes something (never an always-on button). Shared by the pinned
  // applied state and the untoggle re-merge so both agree on "currently on" for this panel.
  const orPresetApplied = useCallback((preset: FilterPreset): boolean => {
    const payload = presetPayloadForMode(preset, previewMode)
    if (!payload || !rulesFilterStateHasContribution(payload)) return false
    return rulesFilterStateContains(rulesFilter, payload)
  }, [rulesFilter, previewMode])

  // OR presets: button is applied when the current filter contains the preset's payload (containment).
  // Exclusive presets: button is applied when the live snapshot exactly equals the preset's snapshot.
  const isFilterPresetApplied = useCallback((preset: FilterPreset): boolean => {
    if (!preset.exclusive) return orPresetApplied(preset)
    const includeSort = preset.snapshot.gearInspectorSubstatSort !== undefined
    return filterPresetSnapshotsEqual(buildFilterPresetSnapshot(includeSort), preset.snapshot)
  }, [buildFilterPresetSnapshot, orPresetApplied])
  // A preset is "applicable" in the current panel when its cross-panel-projected payload still
  // contributes something there. Thanks to Keep/Sell mapping, Sell presets apply to the Sellfile
  // preview too; only presets whose payload is purely Gear-Inspector-specific (e.g. matched/sources
  // with no Keep/Sell or shared field) project to nothing and are disabled in the Sellfile preview.
  const isFilterPresetApplicable = useCallback((preset: FilterPreset): boolean => {
    const payload = presetPayloadForMode(preset, previewMode)
    return payload ? rulesFilterStateHasContribution(payload) : true
  }, [previewMode])
  // A pinned sort preset is "applied" when the live sort state satisfies its snapshot.
  const isSortPresetApplied = useCallback((preset: SortPreset): boolean => {
    // OR presets are applied when the current sort already contains their stacked levels; exclusive
    // presets require an exact snapshot match (legacy behavior).
    if (!preset.exclusive) {
      return sortStateHasContribution(preset.snapshot)
        && sortStateContains(gearInspectorSubstatSortPrefs.state, preset.snapshot)
    }
    return sortPresetSnapshotsEqual(gearInspectorSubstatSortPrefs.state, preset.snapshot)
  }, [gearInspectorSubstatSortPrefs.state])

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
  }
  useLayoutEffect(() => {
    if (filterOpen && filterShortcutPendingFocusRef.current) {
      filterShortcutPendingFocusRef.current = false
      // Schedule focus after the current render so the input is mounted.
      queueMicrotask(() => { rulesFilterPanelRef.current?.focusRecipeNameInput() })
    }
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
  // Initialize from localStorage; migrate users who previously loaded via ?endpoint= URL param.
  const [rslHelperConnectEnabled, setRslHelperConnectEnabled] = useState<boolean>(() => {
    const launchEndpoint = getPushEndpoint()
    if (launchEndpoint) {
      // Adopt the launch URL's port BEFORE stripping the param — the endpoint we actually
      // connect to is rebuilt from the persisted port below, so dropping it here would send
      // a helper launched on a non-default port to the stale/default one instead.
      const launchPort = extractRslHelperPortFromEndpoint(launchEndpoint)
      if (launchPort !== null) persistRslHelperPort(launchPort)
      // Persist the preference so subsequent loads auto-connect without a URL param.
      persistRslHelperConnectEnabled(true)
      // Strip the endpoint param from the address bar so it does not linger.
      try {
        const cleanUrl = new URL(window.location.href)
        cleanUrl.searchParams.delete('endpoint')
        history.replaceState(null, '', cleanUrl.toString())
      } catch {}
      return true
    }
    return getRslHelperConnectEnabled()
  })
  // Derive the WebSocket endpoint from the toggle state; re-reads port from localStorage when enabled.
  const pushEndpoint = useMemo(
    () => (rslHelperConnectEnabled ? buildRslHelperWsEndpoint(getRslHelperPort()) : undefined),
    [rslHelperConnectEnabled]
  )
  const [pushEndpointReachable, setPushEndpointReachable] = useState(() => Boolean(pushEndpoint))
  const updatePushEndpointReachable = useCallback((next: boolean) => {
    setPushEndpointReachable((prev) => (prev === next ? prev : next))
  }, [])
  const handleToggleRslHelperConnect = useCallback(() => {
    setRslHelperConnectEnabled((prev) => {
      const next = !prev
      persistRslHelperConnectEnabled(next)
      return next
    })
  }, [setRslHelperConnectEnabled])

  // Expert mode: restored on startup so the app skips express UI if the user was expert last
  // time. Reads the durable autosave copy first (the standalone key is lost when the WebView
  // host kills the process), falling back to the standalone key. See resolveSimpleExpertModeAtStartup.
  const [expertMode, setExpertMode] = useState(() => simpleMode ? resolveSimpleExpertModeAtStartup() : false)
  // True when express UI should be shown (builder/preview/header hidden, dialog-only view).
  const isSimpleView = simpleMode && !expertMode
  // Captured once at startup — false when express was requested but expert was already persisted.
  // Used to gate auto-behaviors (preset load, note auto-open) that should only run in simple mode.
  const [isSimpleViewAtStart] = useState(() => simpleMode && !expertMode)
  // Increments each time a silent auto-push succeeds; drives the blink animation on the button.
  const [autoPushFlashSeq, setAutoPushFlashSeq] = useState(0)
  // Increments on every background account-push attempt (success or failure, any account);
  // replays the same pulse on the account switcher button (background work is toast-free).
  const [accountPushFlashSeq, setAccountPushFlashSeq] = useState(0)
  // Last successful push for the ACTIVE account — the simple dialog labels its auto-push
  // button with it. The raw scoped key has no reactive store, so the two push-signal
  // counters double as recompute triggers (each successful push increments one of them).
  const activeAccountLastPushAt = useMemo(
    () => getSellfileLastPushAtForAccount(getActiveAccount().id),
    // eslint-disable-next-line @eslint-react/exhaustive-deps, react-hooks/exhaustive-deps -- the counters are deliberate recompute triggers for a non-reactive raw storage key
    [autoPushFlashSeq, accountPushFlashSeq],
  )

  const handleConfirmClearAll = useCallback(() => {
    const descriptor = createRecipesClearedDescriptor(customRecipes.length)
    describeNextChange(descriptor)
    // Clearing recipes can trigger large downstream preview diffs; transition the write.
    setCustomRecipesTransition([])
    syncSelectedRecipeIdx(null, { forceSync: true, suppressDraft: true })
    markNextSnapshotAsSaved()
    setExportBaselineResetPending(true)
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
  // Safeguard single-delete confirm: filter out the index, then collapse focus
  // and multi-select state. Mirrors the recipe handler pair above. History is
  // captured automatically by applySafeguardRulesChange via its descriptor.
  const handleConfirmDeleteSafeguardSingle = useCallback((idx: number) => {
    applySafeguardRulesChange((prev) => {
      if (idx < 0 || idx >= prev.length) return prev
      return prev.filter((_, i) => i !== idx)
    })
    // Drop or shift the focused rule index so the builder form stays consistent.
    setSelectedSafeguardRuleIdx((sel) => {
      if (sel === null) return sel
      if (sel === idx) return null
      if (sel > idx) return sel - 1
      return sel
    })
    // Collapse the multi-select set (matches recipe collapse-on-delete UX).
    setSelectedSafeguardRuleIndices([], { suppressWillChange: true })
  }, [applySafeguardRulesChange, setSelectedSafeguardRuleIndices])

  // Safeguard multi-delete confirm: filter out all targets, then clear focus
  // and multi-select state. Deduplicates and bounds-checks the incoming list
  // exactly like handleDeleteMultiConfirmed does for recipes.
  const handleConfirmDeleteSafeguardMulti = useCallback((targetsParam: number[] | null) => {
    if (!targetsParam || targetsParam.length === 0) return
    const uniqueTargets = Array.from(
      new Set(targetsParam.filter((idx) => Number.isInteger(idx) && idx >= 0)),
    ).sort((a, b) => a - b)
    if (uniqueTargets.length === 0) return
    const deleteSet = new Set(uniqueTargets)
    applySafeguardRulesChange((prev) => prev.filter((_, i) => !deleteSet.has(i)))
    setSelectedSafeguardRuleIdx(null)
    setSelectedSafeguardRuleIndices([], { suppressWillChange: true })
  }, [applySafeguardRulesChange, setSelectedSafeguardRuleIndices])

  const sfcDialogs = useSfcDialogs({
    customRecipeCount: customRecipes.length,
    safeguardRuleCount: safeguardRules.length,
    onConfirmClearAll: handleConfirmClearAll,
    onConfirmDeleteSingle: handleConfirmDeleteSingle,
    onConfirmDeleteMulti: handleDeleteMultiConfirmed,
    onConfirmDeleteSafeguardSingle: handleConfirmDeleteSafeguardSingle,
    onConfirmDeleteSafeguardMulti: handleConfirmDeleteSafeguardMulti,
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
    requestDeleteSafeguardSingle,
    requestDeleteSafeguardMulti,
    confirmDeleteSafeguardIdx,
    setConfirmDeleteSafeguardIdx,
    confirmDeleteSafeguardTargets,
    setConfirmDeleteSafeguardTargets,
    handleConfirmDeleteSafeguard,
    handleConfirmDeleteSafeguardMulti: confirmDeleteSafeguardMultiDialog,
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
  } = sfcDialogs
  // Suppress auto side-by-side page zoom while simple mode shows only the note dialog: the
  // builder/preview panels are display:none behind it, and the dialog fills the viewport via its own
  // CSS (NOTE_DIALOG_SIMPLE_PAPER_SX) rather than via page zoom. Keep the ref in sync and re-evaluate
  // immediately whenever the condition flips.
  const suppressSideBySideZoom = isSimpleView && noteOpen
  useEffect(() => {
    sideBySideZoomSuppressedRef.current = suppressSideBySideZoom
    reevaluateSideBySideZoom()
  }, [suppressSideBySideZoom, reevaluateSideBySideZoom])
  // Track when the note dialog opened automatically from an SFC import.
  // Why: auto-opened notes should hide the "Edit Note & Recipe Overrides…" button.
  const [noteAutoOpenedFromSfc, setNoteAutoOpenedFromSfc] = useState(false)
  // Manual openers reset the auto-open flag so the edit entry point returns.
  const openNoteEditorManual = useCallback(() => {
    setNoteAutoOpenedFromSfc(false)
    openNoteEditor()
  }, [openNoteEditor, setNoteAutoOpenedFromSfc])
  // Manual view opens should also clear auto-open gating.
  const openNoteViewerManual = useCallback(() => {
    setNoteAutoOpenedFromSfc(false)
    // Explicitly opening the Note dialog means "I'm about to tune overrides" — pin a fresh
    // reference now so override changes in the dialog diff against the state at open time.
    // Only when auto-tracking is on, though: with auto off the user owns the reference and we
    // must not create one automatically (the explicit Set reference action stays available).
    // (Auto-opens from loading an SFC/preset go through openNoteViewer directly and keep the
    // pre-load reference instead.)
    if (gearDiffAutoMode) gearDiffPinBaselineRef.current(t('gearDiffPinBaseline'))
    openNoteViewer()
  }, [openNoteViewer, setNoteAutoOpenedFromSfc, gearDiffAutoMode, t])
  requestDeleteSingleForSelection = requestDeleteSingle
  requestDeleteMultiForSelection = requestDeleteMulti
  useLayoutEffect(() => { requestDeleteSingleRef.current = requestDeleteSingle })
  useLayoutEffect(() => { requestDeleteMultiRef.current = requestDeleteMulti })
  // Bind the safeguard forward callbacks now that the request helpers exist.
  requestDeleteSafeguardSingleForSelection = requestDeleteSafeguardSingle
  requestDeleteSafeguardMultiForSelection = requestDeleteSafeguardMulti
  useLayoutEffect(() => { requestDeleteSafeguardSingleRef.current = requestDeleteSafeguardSingle })
  useLayoutEffect(() => { requestDeleteSafeguardMultiRef.current = requestDeleteSafeguardMulti })
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
    setNoteAutoOpenedFromSfc(false)
    closeNote()
  }, [closeNote, setNoteAutoOpenedFromSfc])

  // SFC loads close the note dialog when the loaded document carries no note — EXCEPT in
  // simple view, where the note dialog IS the entire UI: closing it there leaves a black
  // screen (the shell renders hidden). Keep/force it open instead; a no-note document
  // simply shows the simple action bar with an empty note. SSOT for every load path.
  const closeNoteAfterLoad = useCallback(() => {
    if (isSimpleView) openNoteViewer()
    else handleCloseNote()
  }, [isSimpleView, openNoteViewer, handleCloseNote])

  const applyNoteChange = useCallback((
    value: React.SetStateAction<string | null>,
    options?: {
      mode?: NoteDescriptorMode
      publish?: boolean
      // Override answers carried BY the imported document (a .sfc that stored them).
      // Import mode normally resets to the note's authored defaults; when the file supplies
      // its own answers these take precedence, so reopening a saved file restores the exact
      // configuration the user saved. `null`/absent keeps the reset+seed behavior.
      importedRecipeAnswers?: NoteRecipeOverridesAnswers | null
      importedSafeguardAnswers?: NoteSafeguardOverridesAnswers | null
    },
  ): HistoryEntryDescriptor | null => {
    const mode = options?.mode ?? 'edit'
    // Resolve the import-mode answers ONCE so the changed and unchanged branches below
    // (both of which reseed on import) cannot diverge.
    const resolveImportRecipeAnswers = (note: string): NoteRecipeOverridesAnswers =>
      options?.importedRecipeAnswers
        // Prune against the note that actually arrived: a hand-edited file may name
        // questions this note no longer has.
        ? pruneNoteRecipeOverridesAnswers(note, options.importedRecipeAnswers)
        : {}
    const resolveImportSafeguardAnswers = (note: string): NoteSafeguardOverridesAnswers => {
      const stored = options?.importedSafeguardAnswers
        ? pruneNoteSafeguardOverridesAnswers(note, options.importedSafeguardAnswers)
        : {}
      // Seed cross-domain forces from the resolved recipe answers, then let the file's own
      // stored answers win — seeding never overwrites an answer that already exists.
      return seedSafeguardAnswersFromRecipeDefaults(note, resolveImportRecipeAnswers(note), stored)
    }
    const prevRaw = sfcNote ?? null
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
      // An import is a FULL state replacement, not an in-place edit: the override answers must be
      // reset+seeded even when the note TEXT is unchanged. This happens when the same preset is
      // loaded twice in a row (e.g. restore an `endgame` session → load that same preset again):
      // the text matches, so the normal answer-reconciliation below is skipped, leaving the stale
      // restored answers (or a bare {} cleared by the caller) in place — so the loaded preset's
      // default mode shows the wrong slider values. Reconcile here too. (Edit/clear/restore keep
      // the old skip: edits leave answers as-is, and restore's caller sets answers explicitly.)
      if (mode === 'import') {
        setNoteRecipeOverridesAnswers(resolveImportRecipeAnswers(nextNormalized ?? ''))
        setNoteSafeguardOverridesAnswers(resolveImportSafeguardAnswers(nextNormalized ?? ''))
      }
      setSfcNote(() => nextNormalized)
      return null
    }
    // Persist the updated note content immediately.
    setSfcNote(() => nextNormalized)
    // Keep recipe overrides answers aligned with the current note markers.
    // Why: an import adopts the incoming document's own answers; an edit prunes stale entries.
    setNoteRecipeOverridesAnswers((prev) => {
      // An import uses the answers the DOCUMENT carried (a saved .sfc restores its own
      // configuration); with none, this resolves to {} → the note's `*` default mode.
      if (mode === 'import') return resolveImportRecipeAnswers(nextNormalized ?? '')
      // Prune or reset answers based on the new note content.
      return nextNormalized ? pruneNoteRecipeOverridesAnswers(nextNormalized, prev) : {}
    })
    // Safeguard overrides answers: same policy as recipe — imports reset, edits prune.
    // Safeguard question IDs are explicit DSL tokens (not positional), so pruning is safe.
    // On import we do NOT clear to {}: the new note's default recipe mode may force safeguard
    // sliders via cross-domain setval/+/-, and those forces only fire on a selection CHANGE — never
    // for the resolved `*` default. Seed them here so a loaded preset shows its authored slider
    // values, not each slider's own default=. This is the single source of truth for the import
    // seed; the SFC/shift-load callers must NOT pre-seed (this runs last and would clobber it).
    setNoteSafeguardOverridesAnswers((prev) => {
      if (mode === 'import') return resolveImportSafeguardAnswers(nextNormalized ?? '')
      return nextNormalized ? pruneNoteSafeguardOverridesAnswers(nextNormalized, prev) : {}
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
  }, [describeNextChange, sfcNote, noteMode, noteOpen, setSfcNote, setNoteRecipeOverridesAnswers, setNoteSafeguardOverridesAnswers])

  // Bridges requestSfcSync (from useExternalCommands, declared later) back into the
  // tutorial hook so it can re-request a fresh sync when the tutorial closes.
  const requestSfcSyncRef = useRef<(() => void) | null>(null)

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
    selectedSafeguardRuleIdx,
    setSelectedSafeguardRuleIdx,
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
    sfcNote,
    setSfcNote,
    builderRef,
    setBuilder,
    logicHubOpen,
    setLogicHubOpen,
    setBuilderMode,
    suppressHistorySnapshot: suppressNextSnapshot,
    // Re-request a fresh sync on tutorial close so gear pushed (and dropped) during
    // the walkthrough is re-delivered instead of leaving the restored snapshot stale.
    requestSfcSyncRef,
    t,
    // In simple mode the full UI is hidden on first run; defer the first-run
    // help dialog until the user explicitly switches to expert mode.
    suppressInitialHelpOpen: isSimpleViewAtStart,
  })

  const rulesByRecipe = recipeRulesState.rulesByRecipe
  const recipeRuleCounts = recipeRulesState.countsByRecipe
  const mergedRules = recipeRulesState.mergedRules
  const mergedRulesRef = useRef(mergedRules)
  useEffect(() => { mergedRulesRef.current = mergedRules }, [mergedRules])
  const truncatedRecipeIndices = recipeRulesState.truncatedRecipeIndices
  const totalLimitHit = recipeRulesState.totalLimitHit
  const limitExceeded = totalLimitHit || truncatedRecipeIndices.length > 0
  const recipesExcludedByTotalLimit = useMemo(() => new Set<number>(recipeRulesState.excludedByTotalLimitIndices), [recipeRulesState.excludedByTotalLimitIndices])
  // Emitted HSF rule counts per safeguard (0-based index): item keep rows + anticipate
  // placeholders, derived from the latest merged ruleset. Mirrors recipeRuleCounts for
  // the safeguard builder's rules chip; reflects the applied state (drafts count after Apply).
  const safeguardRuleCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const rule of mergedRules) {
      if (rule.__source !== RULE_SOURCE_SAFEGUARDS) continue
      const ordinal = rule.__safeguardRuleOrdinal
      if (typeof ordinal !== 'number') continue
      counts.set(ordinal - 1, (counts.get(ordinal - 1) ?? 0) + 1)
    }
    return counts
  }, [mergedRules])
  const selectedIsDirty = useMemo(() => {
    if (selectedRecipeIdx === null) return false
    const target = customRecipes[selectedRecipeIdx]
    if (!target) return false
    // Structural comparison only — intentionally independent of the pipeline's
    // substat-targets key so prospective/compare evaluations cannot churn it and
    // spuriously mark the builder dirty (see recipeDiff.ts STRUCTURAL_FINGERPRINT_KEY).
    return hasRecipeMeaningfulDifferences(builder, target)
  }, [builder, customRecipes, selectedRecipeIdx])

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

  const selectionGuardFn = useCallback((_prevSelection: number[], _nextSelection: number[]) => {
    if (!builderUiDirty) return
    // Skip draft snapshots when the caller signalled that a recipe-changing action already captured intent.
    if (selectionDraftSuppressionDepthRef.current > 0) return
    if (captureSnapshotNow) {
      const descriptor = computeDraftHistoryDescriptor()
      // Force the next payload change to append so the draft snapshot stays in history.
      captureSnapshotNow(descriptor, { forceAppend: true })
    }
  }, [builderUiDirty, captureSnapshotNow, computeDraftHistoryDescriptor])
  useLayoutEffect(() => { selectionGuardRef.current = selectionGuardFn })

  const exportRulesCountRef = useRef(mergedRules.length)
  useEffect(() => { exportRulesCountRef.current = mergedRules.length }, [mergedRules.length])
  // Keep export payload creation lazy so large merged-rule snapshots do not run on every render.
  const buildExportPayload = useCallback(() => (
    // Use exportRecipeNames (override-applied, via the recipeNamesForExport SSOT) — NOT the raw
    // display recipeNames — so these exported bytes match the worker's export-dirty fingerprint.
    buildHsfFileFromMerged(mergedRules, { recipeNames: exportRecipeNames })
  ), [mergedRules, exportRecipeNames])
  // Serialize the LIVE document into an .sfc payload. One definition for both consumers —
  // the "Save SFC" download and the SfcFileAsSellfile push — so a field can never reach the
  // saved file but go missing from the pushed one.
  const buildCurrentSfcPayload = useCallback(() => buildSfcPayload({
    version: APP_VERSION,
    metasets,
    substatTargets,
    recipes: customRecipes,
    finalSellRemainder,
    ...(sfcNote ? { note: sfcNote } : {}),
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    // Save the user's dynamic-overrides answers with the file so reopening it restores
    // the same configured state instead of snapping back to the note's authored defaults.
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
  }), [
    metasets, substatTargets, customRecipes, finalSellRemainder, sfcNote,
    safeguardRules, safeguardsEnabled, recipesEnabled,
    noteRecipeOverridesAnswers, noteSafeguardOverridesAnswers, noteOverridesDisabled,
  ])
  // Baseline = the export fingerprint captured at the last export/push (null until first
  // export or after an SFC load resets it). hsfDirty compares the current fingerprint to it.
  // (currentMergedRulesHash is declared earlier, next to the other pipeline-result state, so
  // the pipeline-result handler above can set it.)
  const [lastExportedHash, setLastExportedHash] = useState<string | null>(null)
  // Queue one export request while rule/Gear Inspector workers are still rebuilding state.
  // 'loud' = show success toast; 'silent' = suppress success toast (auto-push); false = no pending export.
  const [queuedSellfileExport, setQueuedSellfileExport] = useState<false | 'loud' | 'silent'>(false)
  const isSellfileExportBlockedByWorker = useCallback((): boolean => (
    // A queued debounce still means export snapshots are stale.
    pipelineDebounceRef.current !== null
    // Active pipeline requests must settle before we serialize payloads.
    || pipelineAbortRef.current !== null
    // UI build flags mirror in-flight worker work that mutates preview/export data.
    || rulesBuilding
    || gearEntriesBuilding
  ), [gearEntriesBuilding, rulesBuilding])
  const queueSellfileExportIfNeeded = useCallback((silent = false): boolean => {
    // Run immediately when no worker build is pending.
    if (!isSellfileExportBlockedByWorker()) return false
    // Keep one queued request while work is in flight; preserve the caller's toast intent.
    setQueuedSellfileExport(silent ? 'silent' : 'loud')
    return true
  }, [isSellfileExportBlockedByWorker])
  // Establish the export-fingerprint baseline once the first pipeline result is available, or
  // after a reset (SFC load/import/restore). Adopting the current fingerprint as baseline means
  // a freshly-loaded file starts CLEAN; hsfDirty only flips once the fingerprint later diverges.
  // The fingerprint is null until the first pipeline completes, so we wait for it.
  if (currentMergedRulesHash !== null && (exportBaselineResetPending || lastExportedHash === null)) {
    setLastExportedHash(currentMergedRulesHash)
    if (exportBaselineResetPending) setExportBaselineResetPending(false)
  }
  // Dirty ⟺ the exported HSF would differ from what was last exported. Because the fingerprint
  // is the crc of the actual export bytes (volatile detection fields stripped), gear-DB churn
  // that doesn't change the rules keeps it equal (no false dirty), and an add-then-remove
  // inventory round-trip returns it to the baseline (correctly clean again).
  const hsfDirty = lastExportedHash !== null
    && currentMergedRulesHash !== null
    && currentMergedRulesHash !== lastExportedHash

  // Capture the moment each dirty state began (rising edge of clean→dirty) so the
  // badge tooltip can show "not saved since <time>". Cleared when saved again. This
  // is a derived checkpoint stamped on a state transition — the same intentional
  // set-state-on-edge pattern used elsewhere in this file — so the lint rules that
  // assume effects mirror props are disabled here. Date.now() is fine in app code
  // (only workflow scripts forbid it).
  const [sfcDirtySince, setSfcDirtySince] = useState<number | null>(null)
  const prevSfcDirtyRef = useRef(isDirty)
  /* eslint-disable react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-chain-state-updates */
  useEffect(() => {
    if (isDirty && !prevSfcDirtyRef.current) setSfcDirtySince(Date.now())
    else if (!isDirty) setSfcDirtySince(null)
    prevSfcDirtyRef.current = isDirty
  }, [isDirty])
  const [hsfDirtySince, setHsfDirtySince] = useState<number | null>(null)
  const prevHsfDirtyForTsRef = useRef(hsfDirty)
  useEffect(() => {
    if (hsfDirty && !prevHsfDirtyForTsRef.current) setHsfDirtySince(Date.now())
    else if (!hsfDirty) setHsfDirtySince(null)
    prevHsfDirtyForTsRef.current = hsfDirty
  }, [hsfDirty])
  /* eslint-enable react-hooks/set-state-in-effect, react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-chain-state-updates */

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
      name: recipe.appearance?.name ?? null,
      builderRecipe: builderSnapshot,
      readableRecipe: readable,
      previewLines: rulesForRecipe.map(r => r.line),
      rules: rulesForRecipe,
    }
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) { setCopyText(text); setCopyDlgOpen(true) }
  }, [customRecipes, metasets, mergedRules, setCopyDlgOpen, setCopyText])

  


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
    note: sfcNote,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    logicHubDialogTab,
    storedRuntimeGearSetCount,
  })
  const currentTargetsSignature = useMemo(() => substatTargetsSignature(substatTargets), [substatTargets])
  // SSOT for the "Metasets" restore-row trigger lives in restoreDraftMetasetsDiffer
  // (content difference OR an unsatisfied metaset reference); see useAutosaveRestore.
  const restoreMetasetsDiffer = useMemo(
    () => restoreDraftMetasetsDiffer(restoreDraft, metasets),
    [restoreDraft, metasets],
  )
  const restoreTargetsDiffer = useMemo(() => {
    if (!restoreDraft?.substatTargets) return false
    return substatTargetsSignature(restoreDraft.substatTargets) !== currentTargetsSignature
  }, [restoreDraft, currentTargetsSignature])
  // Filter/sort/collapse view state is ephemeral and no longer saved, so there is no
  // "View, Filter & Sort" restore unit and no pre-dialog reset of it.
  const [prevRestoreDialogPending, setPrevRestoreDialogPending] = useState(restoreDialogPending)
  if (restoreDialogPending !== prevRestoreDialogPending) {
    setPrevRestoreDialogPending(restoreDialogPending)
  }
  // Show the autosave restore prompt only after the README dialog is dismissed.
  // Suppress in express simple mode — the preset SFC is the source of truth there.
  // When express was requested but expert was already on (isSimpleViewAtStart=false), restore normally.
  const restoreDlgOpen = !isSimpleViewAtStart && !tutorial.helpOpen && (restoreDialogPending || Boolean(gearInspectorRestoreDraft))

  // Silent gear-only restore used when starting in express mode.
  // Applies the saved Gear Inspector items without touching recipes, notes, or any other SFC data.
  // The SFC autosave (restoreDialogPending) is simply dismissed — the preset SFC takes priority.
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler, @eslint-react/set-state-in-effect, react-you-might-not-need-an-effect/no-derived-state, react-hooks/set-state-in-effect */
  const handleSilentGearRestore = useCallback(() => {
    // Express boot: restore the endpoint/imported draft unless authoritative RSL Helper
    // gear already superseded it this session. Custom ("manual") pieces are NOT handled
    // here — they load from their own key into the initial item state (see the
    // gearInspectorItems initializer), so they're already present in every mode. We append
    // the endpoint draft onto the live items (which hold the seeded custom gear) so the
    // restore never wipes them; de-dup by itemId guards against a double apply.
    if (gearInspectorRestoreDraft && !endpointGearDataApplied) {
      beginGearInspectorMatchReset('restore')
      const liveIds = new Set(gearInspectorItemsRef.current.map((item) => item.itemId))
      const endpointAdditions = gearInspectorRestoreDraft.items.filter((item) => !liveIds.has(item.itemId))
      const nextItems = [...endpointAdditions, ...gearInspectorItemsRef.current]
      setGearInspectorItemsTransition(nextItems)
      // Keep the descending allocator cursor below every restored custom id (SSOT helper).
      gearInspectorItemIdRef.current = reseedGearInspectorCustomIdCursor(
        gearInspectorItemIdRef.current,
        nextItems,
      )
    }
    markNextSnapshotAsSaved()
    setLastExportedHash(null)
    setExportBaselineResetPending(true)
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => { markSavedNow() })
    } else {
      setTimeout(() => { markSavedNow() }, 0)
    }
    restoringAutosaveRef.current = true
    acceptRestore()
    setGearInspectorRestoreDraft(null)
    setTimeout(() => {
      restoringAutosaveRef.current = false
      flushTransientUi()
    }, 0)
  }, [
    gearInspectorRestoreDraft,
    endpointGearDataApplied,
    beginGearInspectorMatchReset,
    setGearInspectorItemsTransition,
    markNextSnapshotAsSaved,
    setLastExportedHash,
    setExportBaselineResetPending,
    markSavedNow,
    acceptRestore,
    flushTransientUi,
  ])

  // In express simple mode: dismiss the SFC autosave (preset overrides) and silently restore gear data.
  // When expert was already on at startup (isSimpleViewAtStart=false), the restore dialog runs normally.
  useEffect(() => {
    if (!isSimpleViewAtStart) return
    if (restoreDialogPending) dismissRestore()
    if (gearInspectorRestoreDraft) handleSilentGearRestore()
  }, [isSimpleViewAtStart, restoreDialogPending, dismissRestore, gearInspectorRestoreDraft, handleSilentGearRestore])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler, @eslint-react/set-state-in-effect, react-you-might-not-need-an-effect/no-derived-state, react-hooks/set-state-in-effect */

  const { applyGearDbDiff } = useGearInspectorItemsActions({
    allocGearInspectorItemId,
    // Route manual imports + endpoint snapshots/deltas through the shared
    // non-urgent dispatcher so DB payload commits do not preempt click handling.
    setGearInspectorItems: setGearInspectorItemsTransition,
    gearInspectorItemsRef,
  })

  const handleGearDbImport = useCallback(async (file: File | ArrayBuffer, options?: { source?: 'manual' | 'command' }) => {
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
      const { artifacts, inboxArtifacts } = await (
        file instanceof ArrayBuffer
          ? importGearDatabaseFromArrayBuffer(file)
          : importGearDatabaseFromFile(file)
      )
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
        // Manual/SQLite imports carry no endpoint revision stream; leave empty so the
        // next endpoint push re-normalizes every row once (no false reuse) and seeds
        // its own revision baseline from then on.
        artifactRevisions: new Map(),
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
        // True only when the previous baseline was empty — i.e. the very first binary push
        // after a fresh start or reset. Subsequent pushes are treated as diffs.
        const isInitial = previousGearInspectorSnapshots.size === 0
        const importSpec = { kind: 'import' as const, totalCount, inboxCount, isInitial }
        const diffSpec = {
          // Use snapshot diff counts so summary lines mirror the toast entries.
          kind: 'diff' as const,
          addedCount: diffDetails.addedCount,
          removedCount: diffDetails.removedCount,
          updatedCount: diffDetails.updatedCount,
        }
        // On the initial import lead with the "Imported X" summary; on diffs lead with
        // the icon row so the change counts are the primary headline in the history list.
        const lineSpecs = appendGearDbTimestampLineSpec(
          isInitial ? [importSpec, diffSpec] : [diffSpec, importSpec],
          queuedAt,
        )
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
        const fileName = file instanceof File ? file.name : undefined
        const fileErrorMessage = formatFileFormatErrorMessage(fileName)
        setGearDbCommandError(fileErrorMessage)
        setGearDbCommandSuccess(null)
        // Error toast matches the badge copy so screen readers hear the same text.
        showGearDbCommandToast(fileErrorMessage, 'error')
      } else {
        showFileFormatError(file instanceof File ? file.name : undefined)
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
    setPreviewMode,
  ])

  // Accepts the raw snapshot payload pushed by the helper and rewires the Gear Inspector queue.
  const handleGearDbRawSnapshot = useCallback((command: GearDbRawSnapshotCommand, retainItems?: readonly TestItem[]) => {
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
    // Short-circuit when artifact revisions, cID assignments AND lastUsed are all
    // unchanged. Revisions cover stat/level edits; the cID fingerprint catches equipment
    // reassignments that do not bump artifact revisions (e.g. packets 01 = 02 at session
    // start, or duplicate champion pushes with identical slot mappings); the lastUsed
    // fingerprint catches the standalone lastUsed packet RSL Helper sends after each game
    // round — it changes neither revisions nor cID, so without this check it would be
    // discarded and the "last used" timestamps would never reach the UI.
    // When we do not short-circuit, none of beginGearImport / the worker settle cycle run.
    if (previousDataset !== null && changedIds.size === 0 && incomingRevisions.size > 0) {
      const cidFingerprint = computeArtifactCidFingerprint(command.artifacts, command.inboxArtifacts ?? [])
      const lastUsedFingerprint = computeLastUsedFingerprint(command.lastUsed ?? [])
      const championFingerprint = computeChampionFingerprint(command.champions)
      if (
        cidFingerprint === gearDbCidFingerprintRef.current
        && lastUsedFingerprint === gearDbLastUsedFingerprintRef.current
        && championFingerprint === gearDbChampionFingerprintRef.current
      ) return
    }
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
      // Pass the previous dataset so protected fields (lastUseLocalTimestamp, isLocked)
      // are merged rather than silently overwritten when the new feed omits them.
      const { dataset, gearInspectorItems, artifactCount, inboxCount } = createDatasetFromSnapshot(
        command, gearDbRawDatasetRef.current ?? undefined,
      )
      // Snapshot only the changed subset of incoming artifacts for the diff.
      const nextSnapshots = snapshotGearDbDataset(dataset, changedIdsFilter)
      // Build the per-item diff list for the endpoint toast.
      const diffDetails = buildGearDbDiffSummary(previousSnapshots, nextSnapshots)
      // Persist the dataset so future deltas can apply correctly.
      gearDbRawDatasetRef.current = dataset
      // Advance the revision baseline so the next push can skip its own unchanged artifacts.
      gearDbRevisionMapRef.current = incomingRevisions
      // Advance the cID fingerprint so the next duplicate push can be short-circuited.
      gearDbCidFingerprintRef.current = computeArtifactCidFingerprint(command.artifacts, command.inboxArtifacts ?? [])
      // Advance the lastUsed fingerprint so the next identical lastUsed push short-circuits
      // while a fresh post-game-round timestamp still gets through.
      gearDbLastUsedFingerprintRef.current = computeLastUsedFingerprint(command.lastUsed ?? [])
      // Advance the champion fingerprint so a later champion-only change (e.g. vault↔
      // collection move) is not short-circuited away.
      gearDbChampionFingerprintRef.current = computeChampionFingerprint(command.champions)
      // Invalidate the binary snapshot cache — the JSON path has its own baseline now.
      // A subsequent binary push must build its "before" snapshot from the JSON dataset.
      gearDbBinarySnapshotCacheRef.current = null
      // Keep raw parts in sync so partial per-type updates merge against this baseline.
      // Preserve equippedByArtifact: when champions arrive before artifacts the map
      // must survive until artifacts land so patchCID can still apply it then.
      const preservedEquippedByArtifact = gearDbRawPartsRef.current.equippedByArtifact
      gearDbRawPartsRef.current = {
        artifacts: command.artifacts,
        inboxArtifacts: command.inboxArtifacts,
        champions: command.champions,
        lastUsed: command.lastUsed,
        equippedByArtifact: preservedEquippedByArtifact,
      }
      // Diff the Gear Inspector queue so only net changes are enqueued.
      // retainItems carries existing items from source types not yet received in this
      // endpoint session (e.g. regular artifacts when only inboxArtifacts has arrived).
      // Including them in the desired set prevents partial snapshots from removing gear
      // that was loaded from file or autosave before all per-type messages have arrived.
      const desiredItems = retainItems && retainItems.length > 0
        ? [...retainItems, ...gearInspectorItems]
        : gearInspectorItems
      const { removedCount, addedCount } = applyGearDbDiff(desiredItems)
      // Reconcile selection: drop any artifact IDs that are no longer in the
      // incoming dataset. Uses functional-update form so the callback never
      // captures selectedGearItemIds in its closure (avoids recreation on click).
      if (removedCount > 0) {
        const validIds = new Set(
          desiredItems.flatMap(item => item.previewExtras?.id != null ? [item.previewExtras.id] : [])
        )
        setSelectedGearItemIds(prev => {
          if (prev.size === 0) return prev
          const pruned = new Set([...prev].filter(id => validIds.has(id)))
          // Return previous reference when nothing changed to skip a re-render.
          return pruned.size === prev.size ? prev : pruned
        })
      }
      if (removedCount > 0 || addedCount > 0) {
        // Signal a deferred filter-based reconciliation once gearEntriesForTable settles.
        pendingEndpointSelectionFilterRef.current = true
        // Capture scroll anchor before WASM rebuild kicks off so the grid can restore position afterward.
        setEndpointScrollRestoreToken(prev => prev + 1)
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
      // True only when there was no prior dataset — i.e. the very first JSON push.
      const isInitial = previousDataset === null
      const importSpec = { kind: 'import' as const, totalCount, inboxCount, isInitial }
      const diffSpec = {
        // Use snapshot diff counts so summary lines mirror the toast entries.
        kind: 'diff' as const,
        addedCount: diffDetails.addedCount,
        removedCount: diffDetails.removedCount,
        updatedCount: diffDetails.updatedCount,
      }
      // Build structured header specs so history stays localizable.
      // On the initial import lead with the "Imported X" summary; on diffs lead with
      // the icon row so the change counts are the primary headline in the history list.
      const lineSpecs = appendGearDbTimestampLineSpec(
        isInitial ? [importSpec, diffSpec] : [diffSpec, importSpec],
        queuedAt,
      )
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
      gearDbRawPartsRef.current = { artifacts: null, inboxArtifacts: null, champions: null, lastUsed: null, equippedByArtifact: null }
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
    setSelectedGearItemIds,
    showGearDbCommandToast,
    t,
  ])

  // Handles the streamed per-type messages (artifacts / champions / inboxArtifacts /
  // lastUsed / ArtifactByHeroID equips). Each message updates one slot of gearDbRawPartsRef
  // and immediately synthesizes a snapshot so that partial updates are never silently
  // dropped — the endpoint may only send one or two types. Missing slots default to empty
  // arrays, so an "artifacts-only" message produces a valid result with no champions or
  // lastUsed data until those messages arrive.
  const handleGearDbRawPart = useCallback((cmd: GearDbPartCommand) => {
    const parts = gearDbRawPartsRef.current
    // Apply the incoming collection to the appropriate slot (shared SSOT — the
    // burst-coalescing fast path in drainEndpointPushQueue calls the same helper).
    applyGearDbPartToSlots(parts, cmd)
    // Patch cID on artifact rows using the champion slot map when available.
    // The endpoint reverses the relationship — champions list their artifacts
    // instead of artifacts carrying their equipped-champion id (cID).
    //
    // Reconstruct the equipped-champion + lastUsed baselines from the currently
    // rendered queue (restored from autosave / file import). These are merged UNDER
    // the incoming packet — the packet always wins per id, the baseline fills any id
    // the packet omits. This must run even when a slot already holds a (possibly
    // sparse or empty) array: RSL Helper's pushes arrive incomplete and out of order,
    // so a non-null-but-sparse champions/lastUsed packet would otherwise wipe known
    // metadata established by an earlier message or by the restored session.
    const restored = buildRestoredGearDbBaselines(gearInspectorItemsRef.current)
    // equippedByArtifact: prefer the authoritative champion-slot map from the packet;
    // otherwise fall back to the artifact→champion map derived from restored items.
    let equippedBy = parts.equippedByArtifact
    if ((equippedBy == null || equippedBy.size === 0) && restored.equippedByArtifact.size > 0) {
      equippedBy = restored.equippedByArtifact
    }
    // cID patching is the shared SSOT in gearDbRawDataset (see patchArtifactRowsCID for
    // the no-short-circuit rationale) — the background account-push flow uses it too.
    const patchCID = (rows: GearDbArtifactRow[]): GearDbArtifactRow[] => patchArtifactRowsCID(rows, equippedBy)
    // Champions: overlay the packet rows on top of the restored baseline so the
    // synthetic snapshot always carries the equippedChampion reference fields
    // (baseHeroId / name / rarity / location) for ids the packet did not include.
    const syntheticChampions = mergeChampionRows(parts.champions ?? [], restored.champions)
    // LastUsed: overlay packet timestamps on the restored baseline. mergeLastUsedRows
    // lets packet entries win per id while preserving timestamps the packet omits.
    const syntheticLastUsed = mergeLastUsedRows(parts.lastUsed ?? [], restored.lastUsed)
    // Synthesize a snapshot immediately using whatever parts are available.
    // Null slots fall back to empty arrays so normalization always succeeds.
    const syntheticSnapshot: GearDbRawSnapshotCommand = {
      kind: 'gearDbRawSnapshot',
      // Parts messages carry no shared snapshot id or version.
      snapshotId: null,
      payloadVersion: null,
      artifacts: patchCID(parts.artifacts ?? []),
      inboxArtifacts: patchCID(parts.inboxArtifacts ?? []),
      champions: syntheticChampions,
      lastUsed: syntheticLastUsed,
    }
    // Collect existing items for part types not yet received so the diff treats
    // them as "desired" and never removes gear loaded from file or autosave while
    // the per-type endpoint burst is still in flight.
    //
    // Artifacts and champions are NEVER legitimately empty — an account always has
    // gear and champions.  An empty array for these types means "the endpoint hasn't
    // sent this data yet", so we retain existing items from autosave / file import.
    // inboxArtifacts CAN be legitimately empty (user claimed everything), so only
    // null (not yet received) triggers retention for inbox.
    const current = gearInspectorItemsRef.current
    const hasNoArtifacts = !parts.artifacts || parts.artifacts.length === 0
    const hasNoInbox = !parts.inboxArtifacts  // null only — empty [] is valid for inbox
    const retainItems = (hasNoArtifacts || hasNoInbox)
      ? current.filter((item) => (
          (hasNoArtifacts && item.previewExtras?.source === 'artifacts')
          || (hasNoInbox && item.previewExtras?.source === 'inbox')
        ))
      : undefined
    handleGearDbRawSnapshot(syntheticSnapshot, retainItems)
  }, [handleGearDbRawSnapshot, gearInspectorItemsRef])

  // ---- SFC import conflict state ----
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)
  // Shift-load selective imports can also hit metaset ID conflicts.
  // Why: merge mode reuses the same conflict dialog choices as clipboard imports.
  const [pendingSfcLoadImport, setPendingSfcLoadImport] = useState<PendingSfcLoadImport | null>(null)
  // Keep the parsed file in memory while the options dialog is open.
  // Why: avoid re-reading the file between Shift-load prompt and confirm.
  const [pendingSfcShiftDialogImport, setPendingSfcShiftDialogImport] = useState<{
    fileName: string
    payload: SfcLoadPayload
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
    prepareSfcImport,
    finalizeImport,
  } = useSfcClipboard({
    metasets,
    substatTargets,
    customRecipes,
    sfcNote,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    setNoteOverridesDisabled,
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

  // Safeguard Delete-key handler — mirrors handleDeleteSelected for recipes.
  // Reads request helpers from refs so the callback identity stays stable
  // across renders (only depends on the selection set itself).
  const handleSafeguardDeleteSelected = useCallback(() => {
    if (!selectedSafeguardRuleIndices.length) return
    if (selectedSafeguardRuleIndices.length === 1) {
      requestDeleteSafeguardSingleRef.current(selectedSafeguardRuleIndices[0]!)
    } else {
      requestDeleteSafeguardMultiRef.current(selectedSafeguardRuleIndices.slice())
    }
  }, [selectedSafeguardRuleIndices])

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
  const trimmedSfcNote = typeof sfcNote === 'string' ? sfcNote.trim() : ''
  // Shadow of the current setup fields, populated by a useLayoutEffect far below (where
  // currentSfcFields is memoized). Lets the debounced autosave-build stamp a preset-origin
  // marker, computing the ~400k content match only when a write actually fires.
  const currentSfcFieldsRef = useRef<SfcSetupFields | null>(null)
  // Keep autosave scheduling lightweight: only build the heavy SFC snapshot when the
  // debounced write actually executes, not on every render/update.
  const buildAutosavePayload = useCallback(() => {
    const basePayload = buildSfcPayload({
      version: APP_VERSION,
      metasets,
      substatTargets,
      recipes: customRecipes,
      finalSellRemainder,
      ...(trimmedSfcNote ? { note: trimmedSfcNote } : {}),
      safeguardRules,
      safeguardsEnabled,
      recipesEnabled,
      // Dynamic-overrides answers now travel INSIDE the SFC payload (buildSfcPayload drops
      // empty maps itself), so autosave and the saved .sfc file share one writer. The three
      // hand-rolled spreads that used to live below are gone with it.
      noteRecipeOverridesAnswers,
      noteSafeguardOverridesAnswers,
      noteOverridesDisabled,
    })
    // Filter/sort/collapse view state is EPHEMERAL — no longer written to the .sfc autosave
    // (see the sessionOnly stores). Legacy files may still carry `Filters`/`GearInspectorSort`/
    // `SafeguardsGridFilterMode`; the loader tolerates and ignores them.
    // Stamp the preset origin when the live setup still matches a built-in preset
    // (ignoring dynamic overrides). The full body is still written for expert-mode
    // restore; simple-mode load reads this marker to swap in the current built-in.
    // Computed here (not in render) so the ~400k content match runs only on the
    // debounced write, never on the hot path — matching the "treat it holy" intent.
    const presetOrigin = currentSfcFieldsRef.current ? matchedPreset(currentSfcFieldsRef.current) : null
    return {
      ...basePayload,
      ...(presetOrigin ? { [AUTOSAVE_PRESET_ORIGIN_KEY]: presetOrigin } : {}),
      // Durable copy of the simple-mode expert choice (only meaningful for simple launches).
      // Read back in preference to the standalone key, which the WebView host loses on kill.
      ...(simpleMode ? { [AUTOSAVE_SIMPLE_EXPERT_MODE_KEY]: expertMode } : {}),
      LogicHubDialogTab: logicHubDialogTab, // Persist the active tab so the dialog re-opens where the user left off.
      AutosaveSavedAt: new Date().toISOString(),
      // Capture current selections so they can be restored alongside their content.
      // Not included in autosavePayloadSignal, so selection-only changes do not trigger writes.
      ...(typeof selectedRecipeIdx === 'number' ? { SelectedRecipeIndex: selectedRecipeIdx } : {}),
      ...(typeof selectedSafeguardRuleIdx === 'number' ? { SelectedSafeguardRuleIdx: selectedSafeguardRuleIdx } : {}),
    }
  }, [
    customRecipes,
    finalSellRemainder,
    logicHubDialogTab,
    metasets,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    safeguardRules,
    recipesEnabled,
    safeguardsEnabled,
    substatTargets,
    trimmedSfcNote,
    selectedRecipeIdx,
    selectedSafeguardRuleIdx,
    simpleMode,
    expertMode,
  ])
  // Mutable references are enough to trigger autosave scheduling; avoid expensive payload
  // serialization in render by passing this signal instead of an eagerly-built object.
  const autosavePayloadSignal = useMemo(() => ({
    recipes: customRecipes,
    metasets,
    substatTargets,
    finalSellRemainder,
    note: trimmedSfcNote || null,
    safeguardRules,
    safeguardsEnabled,
    logicHubDialogTab,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    // Filter/sort/grid-filter view state is ephemeral and not part of the saved payload, so
    // it is deliberately absent from the change signal — toggling it must not trigger a write.
    // Toggling Go Expert / Go Simple must schedule a write so the durable autosave copy of
    // the flag is committed during the session (the WebView host kills the process without
    // unload events, so a teardown flush never runs).
    expertMode,
  }), [
    customRecipes,
    finalSellRemainder,
    logicHubDialogTab,
    metasets,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
    substatTargets,
    trimmedSfcNote,
    expertMode,
  ])
  useAutosave({
    key: AUTOSAVE_KEY,
    payloadSignal: autosavePayloadSignal,
    buildPayload: buildAutosavePayload,
    enabled: autosaveEnabled && !tutorial.tutorialOpen && !autosaveSilencedByClear,
    debounceMs: 1000,
    beforeSave: persistRuntimeGearSetsNow,
  })
  const gearInspectorGearTabActive = logicHubOpen && logicHubDialogTab === LOGIC_HUB_DIALOG_TAB_GEAR
  const gearInspectorAutosaveChangedSinceLoad = gearInspectorAutosaveBaseline !== gearInspectorItems
  const gearInspectorAutosaveEnabled = gearInspectorGearTabActive || gearInspectorAutosaveChangedSinceLoad
  // Two independent autosave streams share the live item array but persist to separate
  // keys: endpoint/imported gear (AUTOSAVE_GEAR_INSPECTOR_KEY, gated by the persist toggle)
  // and custom/manual gear (AUTOSAVE_CUSTOM_GEAR_KEY, always). Each owns a compression
  // cache — a shared one would thrash between the two filtered arrays. SSOT partition helper.
  const endpointGearCompressionCacheRef = useRef(newGearInspectorCompressionCache())
  const customGearCompressionCacheRef = useRef(newGearInspectorCompressionCache())
  const buildEndpointGearAutosavePayloadCallback = useCallback(() => {
    const { endpointItems } = partitionGearInspectorItemsForPersistence(gearInspectorAutosaveItemsRef.current)
    // Perf/sanity toggle (account manager): with persistence off, REAL gear data
    // (endpoint or file import) stays out of localStorage entirely.
    const persisted = getPersistEndpointGearPreferenceSnapshot() ? endpointItems : []
    return buildGearInspectorAutosavePayload(persisted, endpointGearCompressionCacheRef.current)
  }, [])
  const buildCustomGearAutosavePayloadCallback = useCallback(() => {
    // Custom ("manual") pieces always persist to their dedicated key, independent of the
    // endpoint persistence toggle — they are user-authored and RSL Helper never sends them.
    const { customItems } = partitionGearInspectorItemsForPersistence(gearInspectorAutosaveItemsRef.current)
    return buildGearInspectorAutosavePayload(customItems, customGearCompressionCacheRef.current)
  }, [])
  useAutosave({
    key: AUTOSAVE_GEAR_INSPECTOR_KEY,
    payloadSignal: gearInspectorItems,
    buildPayload: buildEndpointGearAutosavePayloadCallback,
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
  // Custom-gear autosave: separate key, same debounce/idle profile. Small payload (a
  // handful of hand-made pieces), so it can stay enabled whenever items changed since load.
  useAutosave({
    key: AUTOSAVE_CUSTOM_GEAR_KEY,
    payloadSignal: gearInspectorItems,
    buildPayload: buildCustomGearAutosavePayloadCallback,
    enabled: gearInspectorAutosaveEnabled && !gearEntriesBuilding,
    debounceMs: 1000,
    writeOnEnable: false,
    idle: true,
    idleTimeoutMs: 5_000,
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
      improvementChanceByArtifactId,
    })
  }, [
    gearInspectorFilterActive,
    gearInspectorPreviewRows,
    gearInspectorRulesFilter,
    metasetsForGearInspectorFilter,
    recipeNames,
    recipeTags,
    specialRuleSourceLabels,
    improvementChanceByArtifactId,
  ])
  const gearEntriesAfterRulesFilter = gearInspectorFilterResult.items
  // Companion context groups for opacity rendering; present only when Matched/Unmatched is active.
  const gearInspectorContextGroupById = gearInspectorFilterResult.contextGroupById ?? null
  // Gear-diff split-view rows after applying the active Gear Inspector filter. An item is
  // shown (in BOTH panes) when the filter matches EITHER its baseline OR its current verdict,
  // so a piece that filters in on only one side still shows the other side for comparison.
  // Scope/context grouping is intentionally not applied here — the diff is a plain filter.
  const gearDiffFilteredRows = useMemo<GearDiffRows | null>(() => {
    // Use the frozen display rows so the split-view list holds steady during a rebuild.
    const dr = gearDiffDisplayRows
    if (!dr) return null
    if (!gearInspectorFilterActive) return dr
    if (dr.length === 0) return dr
    const filterOpts = {
      recipeNames,
      recipeTags,
      specialRuleLabels: specialRuleSourceLabels,
      improvementChanceByArtifactId,
    }
    // Scope (the "matched" result mode) drives context/companion grouping that has no meaning
    // in a before/after diff — neutralize it so the diff stays a plain filter (set/slot/etc.
    // narrow it; Keep/Sell still work via the before-OR-after test below).
    const diffFilter = gearInspectorRulesFilter.gearInspectorResult?.matched
      ? { ...gearInspectorRulesFilter, gearInspectorResult: { ...gearInspectorRulesFilter.gearInspectorResult, matched: false } }
      : gearInspectorRulesFilter
    // Project each changed row to its baseline / current verdict, then filter each side.
    // Which sides are tested depends on gearDiffFilterMode:
    //   'any'    → row kept when it passes before OR after (union — default)
    //   'before' → row kept only when it passes the baseline-verdict filter
    //   'after'  → row kept only when it passes the current-verdict filter
    const keepIds = new Set<number>()
    if (gearDiffFilterMode !== 'after') {
      const beforeVariants = dr.map((r) => ({ ...r, match: r.beforeMatch }))
      for (const r of filterGearInspectorItems(beforeVariants, diffFilter, metasetsForGearInspectorFilter, filterOpts).items) keepIds.add(r.artifact.id)
    }
    if (gearDiffFilterMode !== 'before') {
      const afterVariants = dr.map((r) => ({ ...r, match: r.afterMatch }))
      for (const r of filterGearInspectorItems(afterVariants, diffFilter, metasetsForGearInspectorFilter, filterOpts).items) keepIds.add(r.artifact.id)
    }
    return dr.filter((r) => keepIds.has(r.artifact.id))
  }, [
    gearDiffDisplayRows,
    gearDiffFilterMode,
    gearInspectorFilterActive,
    gearInspectorRulesFilter,
    metasetsForGearInspectorFilter,
    recipeNames,
    recipeTags,
    specialRuleSourceLabels,
    improvementChanceByArtifactId,
  ])
  // Derive the set of recipe indices that are the first match for at least one filtered Gear Inspector row.
  // Built from already-computed worker results — no WASM evaluation needed. Used to short-circuit the
  // expensive evaluateFirst loop in builderInsertBecomesGearInspectorFirstMatch when the builder is clean.
  const firstMatchRecipeIndices = useMemo(() => {
    const s = new Set<number>()
    for (const row of gearEntriesAfterRulesFilter) {
      if (row.match?.recipeIdx != null) s.add(row.match.recipeIdx)
    }
    return s
  }, [gearEntriesAfterRulesFilter])
  const gearInspectorChampionOptions = useMemo<GearInspectorChampionOption[]>(() => {
    // Cache champion metadata per id so the dropdown can render icons without rescanning rows.
    const map = new Map<number, GearInspectorChampionOption>()
    for (const row of gearInspectorPreviewRows) {
      const championId = Number(row.artifact.equippedChampion?.id ?? NaN)
      if (!Number.isFinite(championId) || championId <= 0) continue
      const trimmedName = row.artifact.equippedChampion?.name?.trim() || null
      const location = row.artifact.equippedChampion?.location ?? null
      // Base hero id + rarity keep dropdown avatars aligned with Gear Inspector cards.
      const baseCandidate = row.artifact.equippedChampion?.baseHeroId
      const baseId = typeof baseCandidate === 'number' && Number.isFinite(baseCandidate) && baseCandidate > 0 ? baseCandidate : null
      const rarityCandidate = row.artifact.equippedChampion?.rarity
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
  // Items that are candidates in any currently-selected safeguard rule — mirrors recipe "By Match: Any".
  // "Any" for recipes shows gear matching any selected recipe (even non-first matches); here we union
  // all candidates (ranked items) from the selected rules' detection entries, regardless of which
  // rule ultimately won the item.  When nothing is selected, returns null (no filter), matching
  // the recipe-mode convention where an empty selection means the filter is a no-op.
  const safeguardAnyMatchItemKeySet = useMemo(() => {
    if (!safeguardsActive || !safeguardDetection?.entries?.length) return null
    // Determine selected ordinals — same logic as safeguardSelectedRuleItemKeySet.
    const selectedOrdinals: ReadonlySet<number> = safeguardMultiselectActive
      ? new Set(selectedSafeguardRuleIndices.map((idx) => idx + 1))
      : (selectedSafeguardRuleIdx !== null ? new Set([selectedSafeguardRuleIdx + 1]) : new Set())
    if (selectedOrdinals.size === 0) return null
    const set = new Set<number>()
    for (const entry of safeguardDetection.entries) {
      if (entry.ruleOrdinal === null || !selectedOrdinals.has(entry.ruleOrdinal)) continue
      // Disabled rules (activation=Off) are evaluated by WASM but must not surface as gear-inspector matches,
      // mirroring how disabled recipes are excluded from row.match.recipeIdx by the matcher.
      if (entry.ruleActivation === SafeguardRuleActivation.Off) continue
      // Include every positively-ranked candidate for this rule (item key, not artifact id).
      for (const candidate of entry.candidates ?? []) {
        if (candidate.candidateRank > 0) set.add(candidate.itemKey)
      }
    }
    // Always return the Set even when empty: empty set = chip selected with no matches → show nothing.
    // Returning null here would be indistinguishable from "no chip selected → no filter → show all".
    return set
  }, [safeguardsActive, safeguardDetection, safeguardMultiselectActive, selectedSafeguardRuleIndices, selectedSafeguardRuleIdx])
  // Items whose first eval match is any currently-selected safeguard rule — mirrors "By Match: First".
  // Unions item keys from all selected ordinals when multiple chips are selected, mirroring how
  // gearInspectorRecipeFilterSelectedSet collects all selected recipe indices.
  // Uses ruleOrdinal for identity so two rules with the same display name remain distinct.
  const safeguardSelectedRuleItemKeySet = useMemo(() => {
    if (!safeguardsActive || !safeguardDetection?.entries?.length) return null
    // selectedSafeguardRuleIndices / selectedSafeguardRuleIdx are 0-based; ruleOrdinal is 1-based.
    const selectedOrdinals: ReadonlySet<number> = safeguardMultiselectActive
      ? new Set(selectedSafeguardRuleIndices.map((idx) => idx + 1))
      : (selectedSafeguardRuleIdx !== null ? new Set([selectedSafeguardRuleIdx + 1]) : new Set())
    if (selectedOrdinals.size === 0) return null
    const set = new Set<number>()
    for (const entry of safeguardDetection.entries) {
      // Disabled rules (activation=Off) are evaluated by WASM but must not surface as gear-inspector matches,
      // mirroring how disabled recipes are excluded from row.match.recipeIdx by the matcher.
      if (entry.ruleActivation === SafeguardRuleActivation.Off) continue
      if (entry.ruleOrdinal !== null && selectedOrdinals.has(entry.ruleOrdinal)) {
        for (const key of entry.itemKeys) set.add(key)
      }
    }
    // Always return the Set even when empty: empty set = chip selected with no matches → show nothing.
    // Returning null here would be indistinguishable from "no chip selected → no filter → show all".
    return set
  }, [safeguardsActive, safeguardDetection, safeguardMultiselectActive, selectedSafeguardRuleIndices, selectedSafeguardRuleIdx])
  // Full detection entry for the currently-editing safeguard — used to populate
  // the candidate rank list in the weight popover (null when not yet run).
  const safeguardBuilderDetectionEntry = useMemo(() => {
    if (selectedSafeguardRuleIdx === null || !safeguardDetection?.entries?.length) return null
    const targetOrdinal = selectedSafeguardRuleIdx + 1
    return safeguardDetection.entries.find((e) => e.ruleOrdinal === targetOrdinal) ?? null
  }, [safeguardDetection, selectedSafeguardRuleIdx])
  // Rules-chip value for the safeguard builder: the selected rule's emitted count, or
  // the multiselect total (mirrors the recipe builder's multi-edit sum). A new unsaved
  // draft (no selection) shows 0 — it contributes no rules until Insert/Apply.
  const safeguardBuilderRuleCount = useMemo(() => {
    if (safeguardMultiselectActive && selectedSafeguardRuleIndices.length >= 2) {
      return selectedSafeguardRuleIndices.reduce((sum, idx) => sum + (safeguardRuleCounts.get(idx) ?? 0), 0)
    }
    return selectedSafeguardRuleIdx !== null ? (safeguardRuleCounts.get(selectedSafeguardRuleIdx) ?? 0) : 0
  }, [safeguardRuleCounts, safeguardMultiselectActive, selectedSafeguardRuleIndices, selectedSafeguardRuleIdx])
  // Maps between safeguard item-key space (used by the candidate list) and Gear Inspector artifact ids
  // (used by overlay chips + the improvement-chance map). Declared here so the focus-bucket and chance
  // memos below can consume them.
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
  // Reverse of the above (artifact id → safeguard item key). Translates a clicked Gear Inspector
  // chip's artifactId into the item-key space the safeguard candidate list works in.
  const safeguardItemKeyByArtifactId = useMemo(() => {
    const byArtifactId = new Map<number, number>()
    for (const [itemKey, artifactId] of gearInspectorArtifactIdBySafeguardItemKey) {
      if (!byArtifactId.has(artifactId)) byArtifactId.set(artifactId, itemKey)
    }
    return byArtifactId
  }, [gearInspectorArtifactIdBySafeguardItemKey])
  // Effective candidate-list focus bucket: the seeded key applies only while its rule is the sole
  // selection (single-select, same index). A different rule, multi-select, or empty selection makes
  // it inert without any explicit clear — the seed simply no longer matches.
  const safeguardCandidateFocusBucketKey = useMemo<string | null>(() => {
    if (safeguardCandidateFocusGroup == null) return null
    if (safeguardMultiselectActive) return null
    if (safeguardCandidateFocusGroup.ruleIdx !== selectedSafeguardRuleIdx) return null
    return safeguardCandidateFocusGroup.key
  }, [safeguardCandidateFocusGroup, safeguardMultiselectActive, selectedSafeguardRuleIdx])
  // Handler the weights flyout uses to push manual focus changes (toggle/clear) back up, tagged with
  // the current rule so it persists across reopens on the same selection.
  const handleSafeguardCandidateFocusBucketKeyChange = useCallback((key: string | null) => {
    if (selectedSafeguardRuleIdx === null) { setSafeguardCandidateFocusGroup(null); return }
    setSafeguardCandidateFocusGroup({ ruleIdx: selectedSafeguardRuleIdx, key })
  }, [selectedSafeguardRuleIdx])
  // Improvement chance for the currently-edited rule, keyed by safeguard item key (the space the
  // candidate list works in). Picks the per-rule chance from chancesByRuleOrdinal so the column
  // reflects the rule in the flyout, not the artifact's headline rule. Null when chance is disabled.
  const safeguardCandidateImprovementChanceByItemKey = useMemo<ReadonlyMap<number, number> | null>(() => {
    if (selectedSafeguardRuleIdx === null || improvementChanceByArtifactId == null) return null
    const targetOrdinal = selectedSafeguardRuleIdx + 1
    const byItemKey = new Map<number, number>()
    for (const [artifactId, entry] of improvementChanceByArtifactId) {
      // Find this rule's chance among the per-ordinal entries; skip artifacts the rule does not rank.
      const perRule = entry.chancesByRuleOrdinal?.find((c) => c.ruleOrdinal === targetOrdinal)
      if (perRule == null) continue
      const itemKey = safeguardItemKeyByArtifactId.get(artifactId)
      if (itemKey == null) continue
      byItemKey.set(itemKey, perRule.chancePercent)
    }
    return byItemKey.size > 0 ? byItemKey : null
  }, [selectedSafeguardRuleIdx, improvementChanceByArtifactId, safeguardItemKeyByArtifactId])
  // Safeguard rank overlay for the Gear Inspector: maps artifact id → best candidate rank + quota status.
  // Context-aware: one rule selected → that rule's rank; multiple selected → best among those; none → best across all.
  const safeguardRankByArtifactId = useMemo<SafeguardRankByArtifactId | null>(() => {
    if (!safeguardsActive || !safeguardDetection?.entries?.length) return null
    // selectedSafeguardRuleIndices are 0-based; detection entries use 1-based ordinals.
    const selectedOrdinals: ReadonlySet<number> = safeguardMultiselectActive
      ? new Set<number>(selectedSafeguardRuleIndices.map((idx) => idx + 1))
      : (selectedSafeguardRuleIdx !== null ? new Set<number>([selectedSafeguardRuleIdx + 1]) : new Set<number>())
    const hasSelection = selectedOrdinals.size > 0
    // Disabled rules (activation=Off) are evaluated by WASM but must not surface as gear-inspector matches,
    // mirroring how disabled recipes are excluded from row.match.recipeIdx by the matcher.
    const activeEntries = safeguardDetection.entries.filter((e) => e.ruleActivation !== SafeguardRuleActivation.Off)
    if (activeEntries.length === 0) return null
    // Always rank against ALL active entries so a piece ranked only by an UNSELECTED rule still
    // surfaces (dimmed) instead of vanishing. inSelection records whether the chosen primary rank
    // comes from a currently-selected rule; the overlay dims chips where it does not.
    // rank = global rank across the whole rule; bucketRank = rank within the piece's bucket.
    type RankRec = { rank: number; bucketRank: number; isWithinQuota: boolean; ruleOrdinal: number | null; inSelection: boolean }
    const result = new Map<number, RankRec>()
    // Track all other applicable rule ordinals per artifact (sorted by rank ascending) for tooltip extras.
    // bucketRank is carried per entry so the tooltip can show each rule's own global · bucket ranks.
    // isWithinQuota + inSelection are carried per entry so the chip can colour and dim by the rule
    // it actually displays (the top-sorted row), keeping colour, number, dim, and click on one rule.
    const otherRulesPerArtifact = new Map<number, Array<{ rank: number; bucketRank: number; isWithinQuota: boolean; inSelection: boolean; ruleOrdinal: number | null }>>()
    for (const entry of activeEntries) {
      // Only entries with scored candidates carry rank data.
      if (!entry.candidates?.length) continue
      const entryInSelection = !hasSelection || (entry.ruleOrdinal !== null && selectedOrdinals.has(entry.ruleOrdinal))
      for (const candidate of entry.candidates) {
        if (candidate.candidateRank <= 0) continue
        const existing = result.get(candidate.itemKey)
        const candRec: RankRec = { rank: candidate.candidateRank, bucketRank: candidate.bucketRank, isWithinQuota: candidate.isWithinQuota, ruleOrdinal: entry.ruleOrdinal, inSelection: entryInSelection }
        // Primary preference: a selected-rule candidacy always wins over an unselected one, so a
        // selected piece shows ITS rank in the selected rule (not a better rank elsewhere). Within the
        // same selection tier, keep the best (lowest) rank. The displaced record drops into otherRules.
        const candWins = !existing
          || (candRec.inSelection && !existing.inSelection)
          || (candRec.inSelection === existing.inSelection && candRec.rank < existing.rank)
        if (candWins) {
          if (existing) {
            const others = otherRulesPerArtifact.get(candidate.itemKey) ?? []
            others.push({ rank: existing.rank, bucketRank: existing.bucketRank, isWithinQuota: existing.isWithinQuota, inSelection: existing.inSelection, ruleOrdinal: existing.ruleOrdinal })
            otherRulesPerArtifact.set(candidate.itemKey, others)
          }
          result.set(candidate.itemKey, candRec)
        } else {
          const others = otherRulesPerArtifact.get(candidate.itemKey) ?? []
          others.push({ rank: candidate.candidateRank, bucketRank: candidate.bucketRank, isWithinQuota: candidate.isWithinQuota, inSelection: entryInSelection, ruleOrdinal: entry.ruleOrdinal })
          otherRulesPerArtifact.set(candidate.itemKey, others)
        }
      }
    }
    // Merge otherRules (sorted by rank, deduplicated by ordinal, excluding primary) into the result.
    const merged = new Map<number, SafeguardRankOverlayEntry>()
    result.forEach(({ rank, bucketRank, isWithinQuota, ruleOrdinal, inSelection }, artifactId) => {
      const others = otherRulesPerArtifact.get(artifactId) ?? []
      const seen = new Set<number>()
      const otherRules: Array<{ ruleOrdinal: number; rank: number; bucketRank: number; isWithinQuota: boolean; inSelection: boolean }> = []
      for (const o of others.sort((a, b) => a.rank - b.rank)) {
        if (typeof o.ruleOrdinal !== 'number' || o.ruleOrdinal === ruleOrdinal) continue
        if (seen.has(o.ruleOrdinal)) continue
        seen.add(o.ruleOrdinal)
        otherRules.push({ ruleOrdinal: o.ruleOrdinal, rank: o.rank, bucketRank: o.bucketRank, isWithinQuota: o.isWithinQuota, inSelection: o.inSelection })
      }
      merged.set(artifactId, { rank, bucketRank, isWithinQuota, ruleOrdinal, inSelection, otherRules })
    })
    return merged.size > 0 ? merged : null
  }, [safeguardsActive, safeguardDetection, safeguardMultiselectActive, selectedSafeguardRuleIndices, selectedSafeguardRuleIdx])

  // Mirror the live rank/improvement overlays into the refs the gear-diff hook reads at pin
  // time. Declared far above (before the hook call); populated here now that both maps exist.
  useEffect(() => { gearDiffRankRef.current = safeguardRankByArtifactId }, [safeguardRankByArtifactId])
  useEffect(() => { gearDiffImprovementRef.current = improvementChanceByArtifactId }, [improvementChanceByArtifactId])

  // Lookup map for the candidate list hover card tooltip (shows scaled GearInspectorGridCard).
  // Keyed by safeguard item key (not artifact DB id) so detection entry lookups stay consistent.
  const safeguardPreviewRowByItemKey = useMemo(() => {
    if (!safeguardsActive || gearInspectorPreviewRows.length === 0) return null
    const map = new Map<number, GearInspectorPreviewRow>()
    for (const row of gearInspectorPreviewRows) {
      map.set(getSafeguardItemKey(row.artifact), row)
    }
    return map
  }, [safeguardsActive, gearInspectorPreviewRows])


  // In safeguard mode the recipe-filter button operates on safeguard detection instead of recipe selection.
  // Requires an active selection in both modes: no selection → filter is a no-op, same as recipes.
  const gearInspectorRecipeFilterActive = gearInspectorRecipeFilterMode !== 'off' && (
    builderMode === 'safeguard'
      ? (safeguardMultiselectActive ? selectedSafeguardRuleIndices.length > 0 : selectedSafeguardRuleIdx !== null)
      : selectedRecipeIndices.length > 0
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
      // Filter by safeguard detection: 'first' = items won by a selected rule,
      // 'any' = items that are candidates of a selected rule (even if another rule won).
      // Null key set means no chip selected → no filter; empty Set means selected chip has no matches → show nothing.
      const activeKeySet = gearInspectorRecipeFilterMode === 'first'
        ? safeguardSelectedRuleItemKeySet
        : safeguardAnyMatchItemKeySet
      if (activeKeySet) {
        rows = gearEntriesAfterRulesFilter.filter(
          (row) => activeKeySet.has(getSafeguardItemKey(row.artifact))
        )
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
  // Summarize Gear Inspector outcomes — single pass over all rows, split by scoped visibility.
  // Placed after gearEntriesForTable so the scoped half has a defined dep.
  const { scoped: gearInspectorOutcomeSummaryForPreview, total: gearInspectorOutcomeSummary } = useMemo(() => {
    // In context mode only primaries represent the active filter; companions (regardless of tag or
    // source) are contextual and must not inflate the scoped counts.
    const contextMap = gearInspectorContextGroupById
    const scopedIds = new Set(
      gearEntriesForTable
        .filter((r) => !contextMap || contextMap.get(r.artifact.id) === 'primary')
        .map((r) => r.artifact.id)
    )
    return buildGearInspectorOutcomeSummaryPair(gearInspectorPreviewRows, scopedIds)
  }, [gearInspectorPreviewRows, gearEntriesForTable, gearInspectorContextGroupById])
  // Persist the live pipeline results as the account's stats snapshot — the switcher's
  // summary lines (rule count + gear outcome chip) read it per account, since these are
  // pipeline RESULTS no autosave can provide at menu-open cost (lib/accountSummaries.ts).
  // Guarded on rows existing so the boot window (gear autosave not yet restored) cannot
  // clobber a real snapshot with zeros.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- persisting the snapshot IS the reaction to pipeline results changing; there is no user event to attach it to
    if (gearInspectorPreviewRows.length === 0) return
    writeAccountStatsSnapshot(getActiveAccount().id, {
      rules: mergedRules.length,
      gear: gearInspectorOutcomeSummary,
    })
  }, [gearInspectorOutcomeSummary, mergedRules.length, gearInspectorPreviewRows.length])
  // When the diff view is open it acts as a filter narrowing the grid to changed rows; the header
  // chip must mirror that scope instead of the full Gear Inspector count. Project each changed row
  // to its current (after) verdict so the summary reflects the live outcome of the changed items.
  const gearInspectorOutcomeSummaryForDiff = useMemo<GearInspectorOutcomeSummary | null>(() => {
    if (!gearDiffSplitOpen || !gearDiffFilteredRows) return null
    return buildGearInspectorOutcomeSummary(gearDiffFilteredRows.map((r) => ({ ...r, match: r.afterMatch })))
  }, [gearDiffSplitOpen, gearDiffFilteredRows])
  // Deferred filter-based selection reconciliation: fires after the full filter pipeline settles
  // following an endpoint push. Drops selections for items hidden by the active filter; in context
  // mode additionally drops companions and "other" items (only primary stays selected).
  useEffect(() => {
    if (!pendingEndpointSelectionFilterRef.current) return
    pendingEndpointSelectionFilterRef.current = false
    const visibleIds = new Set(gearEntriesForTable.map(row => row.artifact.id))
    const contextMap = gearInspectorContextGroupById
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state, @eslint-react/set-state-in-effect
    setSelectedGearItemIds(prev => {
      if (prev.size === 0) return prev
      const pruned = new Set([...prev].filter(id => {
        // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
        if (!visibleIds.has(id)) return false
        // In context mode, only primary items remain selected; companions and others are dropped.
        return contextMap == null || contextMap.get(id) === 'primary'
      }))
      return pruned.size === prev.size ? prev : pruned
    })
  }, [gearEntriesForTable, gearInspectorContextGroupById])
  // Set of safeguard item keys currently visible in the Gear Inspector (after all filters).
  // Non-null only when a filter is active; null means everything is visible (no dimming needed).
  // Used by the safeguard candidate list to dim items hidden by the current filter.
  const gearInspectorVisibleItemKeySet = useMemo<ReadonlySet<number> | null>(() => {
    if (!gearInspectorFilterActive && !gearInspectorRecipeFilterActive) return null
    const set = new Set<number>()
    for (const row of gearEntriesForTable) set.add(getSafeguardItemKey(row.artifact))
    return set
  }, [gearInspectorFilterActive, gearInspectorRecipeFilterActive, gearEntriesForTable])

  // Opaque key that changes when the filter selection changes but stays stable across DB/rule
  // updates with the same filter active.  The grid uses it to suppress card entering animations
  // on filter switches while still animating for genuine data changes.
  const gearInspectorEnterKey = useMemo(() => {
    if (builderMode === 'safeguard') {
      // Use all selected indices (sorted) so the key changes correctly during multi-select.
      const sgIndices = selectedSafeguardRuleIndices.slice().sort((a, b) => a - b).join(',')
      return `sg:${gearInspectorRecipeFilterMode}:${sgIndices || 'none'}`
    }
    const indices = selectedRecipeIndices.slice().sort((a, b) => a - b).join(',')
    return `r:${gearInspectorRecipeFilterMode}:${indices}`
  }, [builderMode, gearInspectorRecipeFilterMode, selectedSafeguardRuleIndices, selectedRecipeIndices])
  const hasManualGearInspectorRows = useMemo(() => (
    gearInspectorPreviewRows.some((row) => row.artifact.source === 'manual')
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
  // Mirrors gearInspectorRecipeFilterSelectedSet for safeguards: a Set of selected ordinals,
  // or null when Selection is off / no chip is selected / not in safeguard mode.
  // Gated on gearInspectorRecipeFilterMode (the "Selection" toggle) — same flag that drives
  // gearInspectorRecipeFilterSelectedSet — not limitRecipesToFiltered (the "Narrow" toggle).
  // Multi-select: includes all selected ordinals so the HSF table filters the full selection.
  const safeguardOrdinalFilterSet = useMemo<Set<number> | null>(() => {
    if (gearInspectorRecipeFilterMode === 'off' || builderMode !== 'safeguard') return null
    const ordinals: number[] = safeguardMultiselectActive
      ? selectedSafeguardRuleIndices.map((idx) => idx + 1)
      : (selectedSafeguardOrdinal !== null ? [selectedSafeguardOrdinal] : [])
    return ordinals.length > 0 ? new Set(ordinals) : null
  }, [gearInspectorRecipeFilterMode, builderMode, safeguardMultiselectActive, selectedSafeguardRuleIndices, selectedSafeguardOrdinal])
  const hsfRulesForTable = useMemo(() => {
    const baseRules = filterActive ? filteredRules : mergedRules
    // Safeguard selection filter: keeps only rows whose ordinal is in the set —
    // equivalent to how gearInspectorRecipeFilterSelectedSet filters recipe rows.
    if (safeguardOrdinalFilterSet !== null) {
      return baseRules.filter((rule) => {
        const ordinal = rule.__safeguardRuleOrdinal
        return typeof ordinal === 'number' && safeguardOrdinalFilterSet.has(ordinal)
      })
    }
    const activeSet = builderMode === 'safeguard' ? safeguardMatchingRecipeIndexSet : gearInspectorRecipeFilterSelectedSet
    if (!activeSet || activeSet.size === 0) return baseRules
    return baseRules.filter((rule) => {
      const recipeIdx = getRuleRecipeIndex(rule)
      return recipeIdx !== null && activeSet.has(recipeIdx)
    })
  }, [builderMode, filterActive, filteredRules, mergedRules, safeguardMatchingRecipeIndexSet, gearInspectorRecipeFilterSelectedSet, safeguardOrdinalFilterSet])
  const hsfRulesForTableRef = useRef(hsfRulesForTable)
  useEffect(() => { hsfRulesForTableRef.current = hsfRulesForTable }, [hsfRulesForTable])
  const hsfTableEmptyDueToFilters = (filterActive || gearInspectorRecipeFilterActive || safeguardOrdinalFilterSet !== null) && mergedRules.length > 0 && hsfRulesForTable.length === 0
  // Resolve the bucket key for a clicked artifact under a given rule — so the weights flyout can
  // default-focus that gear's bucket. Returns null when the rule has no per-bucket dimension, the gear
  // has no detection record, or anything is missing (focus simply stays unset).
  const resolveSafeguardFocusBucketKey = useCallback((ruleIdx: number, artifactId: number): string | null => {
    const rule = safeguardRules[ruleIdx]
    if (!rule) return null
    // Detection entry for this specific rule (1-based ordinal) holds the scored artifacts.
    const entry = safeguardDetection?.entries?.find((e) => e.ruleOrdinal === ruleIdx + 1) ?? null
    const itemKey = safeguardItemKeyByArtifactId.get(artifactId) ?? null
    if (entry == null || itemKey == null) return null
    const artifact = entry.artifacts.find((a) => a.itemKey === itemKey) ?? null
    if (artifact == null) return null
    // Use the same effective (redundancy-suppressed) count mode the list uses for its cutoff label.
    const effectiveMode = safeguardEffectiveCountModeForDisplay(rule.combination, rule.countMode)
    // perSubstat rules bucket per (bucket × substat). Seed the focus to the gear's BEST substat
    // sub-bucket (lowest bucketRank) so the flyout opens on the substat this piece is most relevant
    // to — matching how the row's own focus buttons scope. Falls back to the bucket key when
    // the rule isn't perSubstat or the candidate carries no sub-buckets.
    const isMultiPerSubstat = normalizeSafeguardSubstatMatch(rule.substatMatch) === SafeguardSubstatMatch.PerSubstat
      && (rule.substats?.length ?? 0) > 1
    if (isMultiPerSubstat) {
      const candidate = entry.candidates?.find((c) => c.itemKey === itemKey) ?? null
      const buckets = candidate?.substatBuckets ?? []
      // Best = lowest positive bucketRank; ties keep the first (rule substat order).
      const best = buckets.reduce<typeof buckets[number] | null>((acc, b) => {
        if (b.bucketRank <= 0) return acc
        if (acc == null || b.bucketRank < acc.bucketRank) return b
        return acc
      }, null)
      if (best != null) return safeguardFocusBucketKeyFor(artifact, effectiveMode, best.variant as StatVariant)
    }
    return safeguardFocusBucketKeyFor(artifact, effectiveMode)
  }, [safeguardRules, safeguardDetection, safeguardItemKeyByArtifactId])
  const openLogicHubSafeguardRule = useCallback((ruleIdx: number, artifactId?: number): boolean => {
    if (ruleIdx < 0 || ruleIdx >= safeguardRules.length) return false
    // Safeguard jumps should not leave a stale Gear Inspector focus request queued.
    setGearInspectorArtifactFocusRequest(null)
    // Switch to Safeguard Builder mode and select the targeted rule inline.
    setBuilderMode('safeguard')
    // Load the rule into the draft builder so controls update immediately;
    // handleSelectSafeguardRule also auto-applies any pending draft changes first.
    // (handleSelectSafeguardRule clears any prior candidate focus bucket as part of selecting.)
    handleSelectSafeguardRule(ruleIdx)
    // When the jump came from a concrete gear chip, seed the weights flyout's default focus to that
    // gear's bucket so opening the flyout lands on the relevant group. Tagged with ruleIdx so it
    // only applies while this rule stays the sole selection.
    if (typeof artifactId === 'number' && Number.isFinite(artifactId)) {
      setSafeguardCandidateFocusGroup({ ruleIdx, key: resolveSafeguardFocusBucketKey(ruleIdx, artifactId) })
    }
    // Pulse the substat-weights button to point the user at the flyout for the focused bucket.
    // Bumped on every qualifying jump so repeat clicks re-blink; the effect runs after the panel renders.
    setSafeguardWeightsPulseToken((token) => token + 1)
    // Request SafeguardChipsPanel to scroll the targeted chip into view.
    const token = ++safeguardFocusTokenRef.current
    setSafeguardFocusRequest({ ruleIdx, token })
    return true
  }, [handleSelectSafeguardRule, safeguardRules, setGearInspectorArtifactFocusRequest, setBuilderMode, resolveSafeguardFocusBucketKey])
  const handleSafeguardPreviewStarSelect = useCallback((selection: SafeguardStarSelection) => {
    // safeguardRuleOrdinal is 1-based; convert to 0-based index for openLogicHubSafeguardRule.
    const ruleOrdinal = selection.safeguardRuleOrdinal
    const ruleIdx = typeof ruleOrdinal === 'number' ? ruleOrdinal - 1 : -1
    // Missing ordinals can happen with malformed rows; still route users into Safeguard Builder.
    if (ruleIdx < 0) {
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
      openLogicHubSafeguardRule(ruleIdx)
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
    openLogicHubSafeguardRule(ruleIdx)
  }, [openLogicHubSafeguardRule, setLogicHubOpen, setPreviewMode, setBuilderMode, setGearInspectorArtifactFocusRequest, gearInspectorArtifactIdBySafeguardItemKey])
  // Candidate list row click: resolve safeguard item key → artifact id, switch to Gear Inspector, scroll.
  const handleSafeguardCandidateSelect = useCallback((itemKey: number) => {
    const artifactId = gearInspectorArtifactIdBySafeguardItemKey.get(itemKey) ?? null
    if (artifactId == null) return
    setPreviewMode('gearInspector')
    gearInspectorArtifactFocusTokenRef.current += 1
    setGearInspectorArtifactFocusRequest({
      artifactId,
      token: gearInspectorArtifactFocusTokenRef.current,
    })
  }, [gearInspectorArtifactIdBySafeguardItemKey, setPreviewMode, setGearInspectorArtifactFocusRequest])

  const handleGearInspectorFocusArtifactFilteredOut = useCallback(() => {
    // Keep the notification short because this only explains why auto-scroll did not occur.
    showToast(t('toastGearInspectorFocusArtifactFiltered'), { icon: <HelpOutlineIcon fontSize="inherit" /> })
  }, [showToast, t])
  // Stable ref so handleGearInspectorRuleView can trigger chip scroll even though
  // scrollSelectedRecipeIntoView is declared later in the same component.
  const scrollSelectedRecipeIntoViewRef = useRef<() => void>(() => {})
  const handleGearInspectorRuleView = useCallback((ruleIndex: number, recipeIdx: number | null, artifactId?: number) => {
    setGearInspectorArtifactFocusRequest(null)
    const targetRule = mergedRulesRef.current[ruleIndex]
    if (targetRule?.__source === RULE_SOURCE_SAFEGUARDS) {
      // __safeguardRuleOrdinal is 1-based; convert to 0-based index.
      const safeguardRuleOrdinal = typeof targetRule.__safeguardRuleOrdinal === 'number'
        ? targetRule.__safeguardRuleOrdinal
        : 0
      // Safeguard matches should switch to Safeguard Builder mode instead of opening LogicHub.
      // Forward the clicked card's artifactId so the jump seeds the weights-flyout focus bucket —
      // making a primary safeguard-match chip behave like the rank / improvement-chance chips.
      if (openLogicHubSafeguardRule(safeguardRuleOrdinal - 1, artifactId)) return
      // Malformed safeguard rows can miss ordinals; still route into Safeguard Builder.
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
      // Force-scroll the chips panel to the target recipe even when it is already selected.
      // Why: the normal path (onSelectionScrollRequest gated on selectionChanged in handleRecipeSelect)
      // never fires for repeated clicks on the same recipe. Call via ref to avoid forward-declaration.
      scrollSelectedRecipeIntoViewRef.current()
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
  }, [openLogicHubSafeguardRule, scrollSelectedRecipeIntoViewRef, setBuilder, setBuilderMode, setFocusRuleIndex, setPreviewMode, setLogicHubOpen, syncSelectedRecipeIdx, setGearInspectorArtifactFocusRequest])
  // Jump from an "other matches" recipe chip to THAT recipe (not the card's primary match). Matching
  // chips are always recipe-source (safeguards never appear as other-matches), so this resolves the
  // recipe's owning rule index and routes through handleGearInspectorRuleView's recipe branch.
  const handleGearInspectorRecipeMatchJump = useCallback((recipeIdx: number) => {
    if (!Number.isFinite(recipeIdx) || recipeIdx < 0) return
    // Find the merged rule that belongs to this recipe so the rule-view focus (HSF table) lands right;
    // the recipe branch only needs a non-safeguard ruleIndex, so the first owning rule is sufficient.
    const ruleIndex = mergedRulesRef.current.findIndex((rule) => getRuleRecipeIndex(rule) === recipeIdx)
    handleGearInspectorRuleView(ruleIndex, recipeIdx)
  }, [handleGearInspectorRuleView])
  // Whole-row preview click: route the clicked row to its source recipe or safeguard, reusing the
  // same select+mode-switch+scroll path as the Gear Inspector "jump to rule" affordance.
  // Why a shared handler: builder-mode switch, chip scroll, and preview focus already live in
  // handleGearInspectorRuleView; forking them here would violate the single-source-of-truth gate.
  const handleActivateRuleRow = useCallback((rule: HsfRuleWithRecipe) => {
    // Filtered views preserve rule object identity (filterHsfRules pushes originals), so identity
    // lookup resolves the clicked row back to its absolute mergedRules index for rule-view focus.
    const ruleIndex = mergedRulesRef.current.indexOf(rule)
    if (ruleIndex < 0) return
    // Recipe index is null for safeguard rows; handleGearInspectorRuleView branches on __source.
    const recipeIdx = getRuleRecipeIndex(rule)
    handleGearInspectorRuleView(ruleIndex, recipeIdx)
  }, [handleGearInspectorRuleView])
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
    const isSetKnown = setLabel.length > 0 && setLabel !== t('gearInspectorValueUnknown')
    // Prefix the set name with a bullet to keep the label compact.
    const setSuffix = isSetKnown ? ` • ${setLabel}` : ''
    // Combine the labels into the final recipe name.
    const name = t('gearInspectorRuleTemplateName', { slot: slotLabel, set: setSuffix }).trim()
    // Clone to ensure the new recipe has unique references for history + multi-edit.
    const nextRecipe = cloneBuilderRecipe({ ...baseRecipe, appearance: { name } })
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
  useLayoutEffect(() => { visibleRecipeIndicesRef.current = visibleRecipeIndices })
  // In safeguard builder mode, limitRecipesToFiltered hides safeguard rule chips that have no
  // matching items in the current (possibly recipe-filtered) gear table.
  const visibleSafeguardRuleIds = useMemo<Set<number> | null>(() => {
    if (!limitRecipesToFiltered || builderMode !== 'safeguard') return null
    if (!safeguardDetection?.entries?.length) return new Set()
    const gearItemKeySet = new Set<number>()
    for (const row of gearEntriesForTable) gearItemKeySet.add(getSafeguardItemKey(row.artifact))
    // ruleOrdinal is 1-based; convert to 0-based index for the visible-indices set.
    const visible = new Set<number>()
    for (const entry of safeguardDetection.entries) {
      if (entry.ruleOrdinal === null) continue
      for (const key of entry.itemKeys) {
        if (gearItemKeySet.has(key)) { visible.add(entry.ruleOrdinal - 1); break }
      }
    }
    return visible
  }, [limitRecipesToFiltered, builderMode, safeguardDetection, gearEntriesForTable])
  // Keep the ref in sync so shift-click in useSafeguardSelection reads the latest visible set.
  useLayoutEffect(() => { visibleSafeguardRuleIdsRef.current = visibleSafeguardRuleIds })
  const selectAllLabelKey = visibleRecipeIndices ? 'chipsMenuSelectVisible' : 'chipsMenuSelectAll'
  // Plain index-based navigate — used by arrow/page/home/end keyboard navigation in RecipeChipsPanel.
  // Routes through handleRecipeSelect with no modifiers so the builder form loads the recipe,
  // selection indices update, and the scroll request fires — the same as a plain left-click.
  const handleRecipeNavigateTo = useCallback((idx: number) => {
    handleRecipeSelect({ shiftKey: false, ctrlKey: false, metaKey: false } as unknown as React.MouseEvent, idx)
  }, [handleRecipeSelect])
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
  // Keep the ref current so handleGearInspectorRuleView always calls the latest version.
  useLayoutEffect(() => { scrollSelectedRecipeIntoViewRef.current = scrollSelectedRecipeIntoView })
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

  // Untoggle a pinned filter preset. Exclusive presets clear the whole filter (legacy).
  // OR presets "un-OR": pure-subtract this preset's *selections* (slot/set arrays, result flags),
  // then re-derive only the shared *scalar modes* (anyMode, match, …) from the other still-active
  // presets. Additive selections are removed outright ("really un-OR; so be it"), while a shared
  // mode that a disjoint survivor still needs is preserved (it isn't a selection being removed):
  //   • All Artifacts + All Accessories share anyMode 'off' → restored from the survivor → it stays toggled.
  //   • "Show only Sell" and "Scoped Sell" share the `sell` flag (a selection) → removed → untoggling
  //     either one clears it, and the other reads untoggled.
  // Declared after clearFilters so the dependency reference is initialized at render.
  const handleUnapplyFilterPreset = useCallback((presetId: string) => {
    const presets = filterPresets ?? []
    const preset = presets.find((entry) => entry.id === presetId)
    if (!preset) return
    if (preset.exclusive) {
      clearFilters()
      return
    }
    const payload = presetPayloadForMode(preset, previewMode)
    if (!payload) return
    // Other OR presets currently active on this panel — their shared modes must survive.
    const survivors = presets.filter((p) => p.id !== presetId && !p.exclusive && orPresetApplied(p))
    // Sync-aware setter fans out to both panels when "sync views" is on.
    setRulesFilter((prev) => {
      let next = subtractRulesFilterState(prev, payload)
      for (const s of survivors) {
        const other = presetPayloadForMode(s, previewMode)
        if (other) next = reapplyRulesFilterScalars(next, other)
      }
      return next
    })
  }, [filterPresets, previewMode, orPresetApplied, clearFilters, setRulesFilter])
  // Previously-highlighted chip target, so we can clear it when the hover moves or ends.
  const prevHoveredChipRef = React.useRef<ChipHoverTarget>(null)
  // Live chip counts per kind, read inside the (mount-once) subscriber to bound-check targets.
  const hoverRecipeCountRef = React.useRef(customRecipes.length)
  const hoverSafeguardCountRef = React.useRef(safeguardRules.length)
  useLayoutEffect(() => { hoverRecipeCountRef.current = customRecipes.length })
  useLayoutEffect(() => { hoverSafeguardCountRef.current = safeguardRules.length })
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    // Resolve the chip DOM element + valid count for a target's kind (SSOT for both chip lists).
    const resolveChip = (target: NonNullable<ChipHoverTarget>): { el: HTMLElement | null; max: number } => {
      if (target.kind === 'safeguard') {
        // Safeguard chips key on data-safeguard-chip-index (0-based rule index).
        const el = document.querySelector(`[data-safeguard-chip-index="${target.id}"]`) as HTMLElement | null
        return { el, max: hoverSafeguardCountRef.current }
      }
      // Recipe chips key on their id (0-based recipe index).
      return { el: document.getElementById(`recipe-chip-${target.id}`), max: hoverRecipeCountRef.current }
    }
    // Toggle the linked-hover attribute on the chip a target points at, if it is in range + mounted.
    const applyChipLinkedHover = (target: ChipHoverTarget, active: boolean) => {
      if (target === null || target.id < 0) return
      const { el, max } = resolveChip(target)
      if (target.id >= max || !el) return
      el.setAttribute('data-linked-hover', active ? 'true' : 'false')
    }
    const unsubscribe = subscribeChipHover((target) => {
      // Drop out-of-range targets (list shrank under a stale hover) back to null.
      const max = target === null ? 0 : (target.kind === 'safeguard' ? hoverSafeguardCountRef.current : hoverRecipeCountRef.current)
      const clamped: ChipHoverTarget = target !== null && (target.id < 0 || target.id >= max) ? null : target
      if (clamped !== target) {
        setChipHover(clamped)
        return
      }
      const prev = prevHoveredChipRef.current
      // Clear the previous chip whenever the target changed (different chip, kind, or cleared).
      if (prev !== null && (clamped === null || prev.kind !== clamped.kind || prev.id !== clamped.id)) {
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
  // Reconcile a stale hover when either chip list shrinks (e.g. deleting the hovered recipe/safeguard).
  React.useEffect(() => {
    const current = getChipHover()
    if (current === null) return
    const max = current.kind === 'safeguard' ? safeguardRules.length : customRecipes.length
    if (current.id < 0 || current.id >= max) setChipHover(null)
  }, [customRecipes.length, safeguardRules.length])
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
  }, [mergedRules, customRecipes, filterActive, filteredRules, setBuilder, syncSelectedRecipeIdx, setFocusRuleIndex])
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
    names.splice(prospectiveInsertIndex, 0, builder.appearance?.name ?? '')
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
    names[editingRecipeIndex] = builder.appearance?.name ?? ''
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
      // When the builder is clean and the insert position matches the current recipe's saved position,
      // the worker-cached first-match set reflects exactly what inserting/saving would produce.
      if (!selectedIsDirty && prospectiveInsertIndex === editingRecipeIndex) {
        return editingRecipeIndex === null || !firstMatchRecipeIndices.has(editingRecipeIndex)
      }
      return !builderInsertBecomesGearInspectorFirstMatch(prospectiveInsertIndex)
    }
    return !builderInsertMatchesRuleFilters
  }, [
    builderInsertBecomesGearInspectorFirstMatch,
    builderInsertMatchesRuleFilters,
    editingRecipeIndex,
    firstMatchRecipeIndices,
    limitRecipesToFiltered,
    previewMode,
    prospectiveInsertIndex,
    selectedIsDirty,
  ])

  const saveHiddenByFilters = useMemo(() => {
    if (!limitRecipesToFiltered) return false
    if (editingRecipeIndex === null) return false
    if (previewMode === 'gearInspector') {
      // When the builder is clean, the worker-cached first-match set is accurate — skip WASM evaluation.
      if (!selectedIsDirty) return !firstMatchRecipeIndices.has(editingRecipeIndex)
      return !builderInsertBecomesGearInspectorFirstMatch(editingRecipeIndex)
    }
    return !builderSaveMatchesRuleFilters
  }, [
    builderInsertBecomesGearInspectorFirstMatch,
    builderSaveMatchesRuleFilters,
    editingRecipeIndex,
    firstMatchRecipeIndices,
    limitRecipesToFiltered,
    previewMode,
    selectedIsDirty,
  ])

  // Endpoint pushes that mutate Gear Inspector/preview state must run in strict sequence.
  // The binary-DB transport plus every streamed per-type packet (GearDbPartCommand is
  // the SSOT for the latter, so a new packet type joins this union automatically).
  type EndpointPushCommand = Extract<ExternalCommand, { kind: 'gearDbFileBinary' }> | GearDbPartCommand
  // Queue stores push commands while a prior push is still settling.
  const endpointPushQueueRef = useRef<EndpointPushCommand[]>([])
  // Guard ensures only one queue-drain loop runs at a time.
  const endpointPushDrainInFlightRef = useRef(false)
  // Cleanup flag prevents post-unmount queue work.
  const endpointPushQueueClosedRef = useRef(false)
  // Timestamp (ms) when the last apply+settle cycle completed; 0 = never.
  const lastEndpointAppliedAtRef = useRef(0)
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
      // Scope `bytes` and `file` to the import phase only by running them inside an
      // async IIFE.  Before this change they were function-scoped consts, keeping the
      // 68 MB Uint8Array AND the File/Blob copy alive for the entire settle wait (up
      // to 60 s) — alongside the sql.js WASM copy (~200 MB) and the rule-cache
      // pipeline (~256 MB pre-grow), totalling ~500+ MB in concurrent allocations.
      // After the IIFE resolves, V8 can GC `bytes` and `file` before waiting.
      const importSucceeded = await (async () => {
        const { bytes } = cmd
        // Null cmd.bytes early so the queued-command object no longer pins the
        // Uint8Array.  The IIFE's local `bytes` still holds the reference until
        // this scope exits, after which both the view and its backing buffer are
        // GC-eligible — before the settle wait below begins.
        ;(cmd as { bytes: Uint8Array | null }).bytes = null
        if (!bytes || bytes.length === 0) return false
        // Pass the raw ArrayBuffer directly, bypassing the File ctor and
        // file.arrayBuffer() copies (saves 2 × 89 MB per import cycle).
        await handleGearDbImport(bytes.buffer as ArrayBuffer, { source: 'command' })
        return true
        // `bytes` (and thus bytes.buffer) drop here — before the settle wait.
      })()
      if (!importSucceeded) return
      // Mark that authoritative gear data has landed so the restore prompt drops its
      // stale Gear Inspector offer (see endpointGearDataApplied).
      setEndpointGearDataApplied(true)
      await waitForEndpointPushSettle()
    }
    // Per-type partial messages — each one immediately synthesizes a snapshot from the
    // accumulated parts, so every arrival triggers a Gear Inspector update.
    if (isGearDbPartCommand(cmd)) {
      handleGearDbRawPart(cmd)
      // Same as the snapshot path: fresh gear is now authoritative.
      setEndpointGearDataApplied(true)
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
          if (isGearDbPartCommand(next)) {
            const queueHead = endpointPushQueueRef.current[0]
            const morePartsFollow = queueHead && isGearDbPartCommand(queueHead)
            if (morePartsFollow) {
              // Accumulate without processing; let the final burst element trigger the
              // snapshot. Slot assignment is the shared SSOT so this fast path and
              // handleGearDbRawPart can never disagree about how a packet is stored.
              applyGearDbPartToSlots(gearDbRawPartsRef.current, next)
              continue
            }
          }
          // Enforce minimum gap between apply+settle cycles to avoid hammering the
          // worker pipeline with back-to-back restarts under heavy endpoint traffic.
          const elapsed = Date.now() - lastEndpointAppliedAtRef.current
          const cooldownRemaining = lastEndpointAppliedAtRef.current === 0
            ? 0
            : Math.max(0, ENDPOINT_PUSH_COOLDOWN_MS - elapsed)
          if (cooldownRemaining > 0) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, cooldownRemaining)
            })
          }
          await applyEndpointPushCommand(next)
          lastEndpointAppliedAtRef.current = Date.now()
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
    const queue = endpointPushQueueRef.current
    // Each gearDbFileBinary is a complete SQLite snapshot that supersedes any
    // pending copies waiting in the tail of the queue. Discard that trailing
    // run to avoid accumulating N large Uint8Array buffers simultaneously.
    if (cmd.kind === 'gearDbFileBinary') {
      let coalesceTo = -1
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const entry = queue[i]
        // Bounds guard: noUncheckedIndexedAccess makes array[i] T | undefined.
        if (!entry) break
        // Full-snapshot binary entries are superseded by the incoming binary.
        if (entry.kind === 'gearDbFileBinary') { coalesceTo = i; continue }
        // Per-type part commands are superseded by an incoming full binary.
        if (isGearDbPartCommand(entry)) { coalesceTo = i; continue }
        break
      }
      // Remove the superseded suffix so its Uint8Array buffers can be GC'd.
      if (coalesceTo >= 0) queue.splice(coalesceTo)
    }
    // Per-type full-snapshot pushes (artifacts / inboxArtifacts / champions /
    // lastUsed) each carry a COMPLETE replacement collection for their type. When
    // a drain stalls during a farm burst, RSL Helper can enqueue several ~11.8 MB
    // `gearDbArtifacts` snapshots that all sit pending at once — only the newest
    // matters. Drop any pending entry of the SAME kind so we retain a single live
    // copy per type instead of N. We only coalesce same-kind entries (not across
    // types), preserving the relative order of the other pending part messages.
    else if (isGearDbPartCommand(cmd)) {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        const entry = queue[i]
        if (!entry) break
        // Superseded only by an identical kind; remove it so its big arrays GC.
        if (entry.kind === cmd.kind) queue.splice(i, 1)
      }
    }
    queue.push(cmd)
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

  // Background account-push service (lib/backgroundAccountPush.ts): builds and uploads a
  // NON-active bound account's sellfile when stamped gear data arrives for it. A ref
  // bridges the hook-order gap — the service needs sendExternalRequest, which comes from
  // useExternalCommands below, which itself needs handleExternalCommand.
  const backgroundAccountPushRef = useRef<BackgroundAccountPushService | null>(null)
  // Identities we already toasted an inbound drop for — RSL Helper re-syncs continuously,
  // so an unroutable identity must complain once per session, not once per packet.
  const inboundDropToastSeenRef = useRef<Set<string>>(new Set())
  // Capture as a stable primitive so the useCallback dep array stays tight.
  const tutorialOpen = tutorial.tutorialOpen
  const handleExternalCommand = useCallback((cmd: ExternalCommand) => {
    // Capability handshake — handled before anything else so a client that announces its
    // features in the same burst as its first gear packet has them in force by the time
    // that gear triggers a push. Carries no account stamp, so it skips the routing below.
    if (cmd.kind === 'clientCapabilities') {
      // A rename re-renders the `{client}` strings via the i18n subscription inside
      // applyClientCapabilitiesPacket; capabilities are read on demand at push time, so
      // neither needs App state here.
      applyClientCapabilitiesPacket(cmd)
      return
    }
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

    // Block gear-DB pushes while the tutorial is running or the user has explicitly paused updates.
    // The tutorial manages its own gear items; an endpoint push would corrupt that state.
    // selectRule (above) is left through since it only affects scroll position.
    if (tutorialOpen || pauseEndpointUpdates) return

    // Verify the packet's optional game-account stamp (RSL Helper protocol phase 2) before
    // any gear data is queued. Absent stamps attribute to the active account (pre-stamping
    // Helper versions); a first stamp on a never-bound account adopts the id ('bound');
    // a stamp for a DIFFERENT account never merges into the active inspector — a KNOWN
    // bound account is handed to the background push service (it builds and uploads THAT
    // account's sellfile if its auto-push is on); an unknown account drops with a toast.
    const inboundPlayerId = 'playerId' in cmd ? cmd.playerId : undefined
    const inboundPlayerName = 'playerName' in cmd ? cmd.playerName : undefined
    // Dropped-packet notice: the small corner toast, once per identity per session —
    // the endpoint re-sends every sync cycle, so per-packet toasting would spam.
    const toastInboundDrop = (dropKey: string, incoming: string) => {
      if (inboundDropToastSeenRef.current.has(dropKey)) return
      inboundDropToastSeenRef.current.add(dropKey)
      showGearDbCommandToast(
        // Shared name → Player ID label resolution; names are optional on accounts.
        t('accountInboundMismatchToast', { incoming, active: accountDisplayLabel(getActiveAccount()) || t('accountUnnamed') }),
        'error',
      )
    }
    if (classifyInboundAccountStamp({ playerId: inboundPlayerId, playerName: inboundPlayerName }) === 'mismatch') {
      // The single-owner gate lives INSIDE noteInboundGearCommand (it resolves the target
      // account, so it owns the per-account ownership check): a non-owner tab returns false
      // there without queuing a push, and a stood-down tab is NOT a drop — the owner tab,
      // which receives the same broadcast packet, handles it. So only toast-drop when the
      // service genuinely could not service the data (unknown account, disposed, etc.).
      if (backgroundAccountPushRef.current?.noteInboundGearCommand(cmd)) return
      toastInboundDrop(`stamp:${inboundPlayerId ?? inboundPlayerName ?? ''}`, inboundPlayerId ?? inboundPlayerName ?? '')
      return
    }
    // UNSTAMPED data with a flagged non-active receiver (account manager's "default for
    // data without Player ID"): the data belongs to that account, not the active view —
    // route it to the background service. A binary-DB push cannot be background-serviced,
    // so it drops with the mismatch toast rather than polluting the active account.
    if (!inboundPlayerId && !inboundPlayerName) {
      const unstampedTarget = getUnstampedDefaultAccount()
      if (unstampedTarget && unstampedTarget.id !== getActiveAccount().id) {
        // Same in-service single-owner gate as the stamped-mismatch path above.
        if (backgroundAccountPushRef.current?.noteInboundGearCommand(cmd, unstampedTarget)) return
        toastInboundDrop(`unstamped:${unstampedTarget.id}`, unstampedTarget.displayName)
        return
      }
    }
    // Endpoint gear data is always wanted — it is newer and authoritative. We do NOT
    // block it while the restore dialog is open; instead, once any gear push lands we
    // drop the restore prompt's stale Gear Inspector offer (endpointGearDataApplied),
    // so fresh data is never overwritten by the localStorage autosave draft.

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
    // ArtifactByHeroID — equip-only updates, the sole feed for gear moves.
    if (cmd.kind === 'gearDbEquipped') {
      enqueueEndpointPush(cmd)
      return
    }
  }, [
    enqueueEndpointPush,
    focusRuleByIndex,
    pauseEndpointUpdates,
    requestSelectionScroll,
    showGearDbCommandToast,
    t,
    tutorialOpen,
  ])

  const { sendRequest: sendExternalRequest, requestSfcSync } = useExternalCommands({
    pushEndpoint,
    onCommand: handleExternalCommand,
    onReachabilityChange: updatePushEndpointReachable,
  })
  // Keep the tutorial hook (declared earlier) able to re-request a fresh sync on close.
  // Why: endpoint pushes are dropped while the tutorial runs (it manages its own gear);
  // on close the pre-tutorial snapshot is restored, so any gear RSL Helper pushed during
  // the walkthrough must be re-fetched or the user is left looking at stale data.
  // A ref bridges the hook-order gap — useExternalCommands runs after useTutorialCoachState.
  useEffect(() => {
    requestSfcSyncRef.current = requestSfcSync
  }, [requestSfcSync])
  // Toast/translator bridge for the background-push service: read through a ref so
  // the service's effect does NOT depend on `t` — dispose() discards pending
  // coalesced bursts without flushing, so a locale switch mid-stream must not
  // recreate the service and drop an account's queued push. (Same ref pattern as
  // exportRulesCountRef.)
  const backgroundPushFeedbackRef = useRef({ showToast, t })
  useEffect(() => { backgroundPushFeedbackRef.current = { showToast, t } }, [showToast, t])
  // (Re)create the background account-push service whenever its transport changes.
  // Outcomes are deliberately TOAST-FREE: push attempts (success or failure) pulse the
  // account switcher button instead, and failures additionally persist a per-account
  // error marker the switcher list renders ("Push failed <date>") until a push succeeds.
  // The one exception is the anomalous scrub disclosure below — a data-divergence
  // warning that must surface even for background uploads.
  useEffect(() => {
    const service = createBackgroundAccountPushService({
      sendRequest: sendExternalRequest,
      runPipeline: runHeadlessRuleCachePipeline,
      // Per-account single-owner gate so two tabs never background-push the same account.
      claimAutoPushOwnership,
      onOutcome: (outcome) => {
        // autoPushOff means nothing was attempted — no feedback warranted.
        if (outcome.kind === 'autoPushOff') return
        // noDocument counts as a failure: auto-push was expected but could not run.
        if (outcome.kind === 'failed' || outcome.kind === 'noDocument') {
          markSellfileLastPushErrorForAccount(outcome.account.id)
        }
        // Any attempt (success or failure), for ANY account, replays the switcher pulse.
        setAccountPushFlashSeq((s) => s + 1)
      },
    })
    backgroundAccountPushRef.current = service
    return () => {
      service.dispose()
      if (backgroundAccountPushRef.current === service) backgroundAccountPushRef.current = null
    }
  }, [sendExternalRequest])
  // Optimistically apply gear selection and notify the endpoint; fire-and-forget.
  // Selection is the source of truth in the app — the endpoint can push a correction
  // event if it needs to override, but we do not revert on a bare error response
  // (which would cause a visible "deselect then immediately reselect" flicker).
  const handleGearItemsSelect = useCallback((nextIds: ReadonlySet<number>) => {
    setSelectedGearItemIds(nextIds)
    if (!pushExportEndpoint) return
    // Silently swallow errors; the optimistic update stands regardless. The account stamp
    // guards against applying the selection to the wrong roster once Helper consumes it.
    void sendExternalRequest(EXTERNAL_WS_METHOD_SELECT_ARTIFACTS, { ...buildAccountRpcParams(), artifactIds: [...nextIds] }).catch(() => {})
  }, [pushExportEndpoint, sendExternalRequest, setSelectedGearItemIds])
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
    const replacementMetaName = replacementId ? (defaults.find((meta) => meta.name === replacementId)?.name ?? null) : null
    const descriptor: HistoryEntryDescriptor = {
      kind: 'metasetsReset',
      mode,
      ...(replacementMetaName ? { replacementName: replacementMetaName } : {}),
    }
    describeNextChange(descriptor)
    const metasById = new Map(metasets.map((meta) => [meta.name, meta]))
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
        const metaIds = rule.combination.metaSetNames ?? []
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
              metaSetNames: nextMeta,
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
            metaSetNames: nextMeta,
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
  // selectedSafeguardRuleIdx is already the index; validate it's in bounds.
  const selectedSafeguardRuleIndex = selectedSafeguardRuleIdx !== null
    && selectedSafeguardRuleIdx >= 0
    && selectedSafeguardRuleIdx < safeguardRules.length
    ? selectedSafeguardRuleIdx
    : -1
  // True when the builder's content differs from the currently-selected rule's saved state.
  // Mirrors the selectedIsDirty pattern used by the recipe builder.
  const safeguardBuilderIsDirty = useMemo(() => {
    if (selectedSafeguardRuleIdx === null) return false
    const selectedRule = safeguardRules[selectedSafeguardRuleIdx]
    if (!selectedRule) return false
    // Compare what Apply would actually WRITE, not the raw draft: membership comes from the stored
    // rule, so a group edit made from the chip menu while this draft sat open is not a pending
    // change. Without the rebase the draft's stale `group` reads as dirty and the button offers an
    // Apply that (correctly) writes nothing — and stays lit until the rule is reloaded.
    return JSON.stringify(createSafeguardRuleContentSnapshot(withStoredSafeguardMembership(safeguardBuilder, selectedRule)))
      !== JSON.stringify(createSafeguardRuleContentSnapshot(selectedRule))
  }, [safeguardBuilder, selectedSafeguardRuleIdx, safeguardRules])
  const safeguardBuilderPanelElement = (
    <SafeguardBuilderPanel
      tagVocabulary={tagVocabulary}
      rule={safeguardBuilder}
      onChange={setSafeguardBuilder}
      editingRuleIdx={selectedSafeguardRuleIndex >= 0 ? selectedSafeguardRuleIndex : null}
      allRules={safeguardRules}
      editingRuleIndex={selectedSafeguardRuleIndex >= 0 ? selectedSafeguardRuleIndex : null}
      metasets={metasets}
      substatColors={substatColors}
      useStatButtonColors={colorStatTextsOn}
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
      detectionEntry={safeguardBuilderDetectionEntry}
      detectionEntries={safeguardDetection?.entries ?? null}
      safeguardRuleCount={safeguardBuilderRuleCount}
      previewRowByItemKey={safeguardPreviewRowByItemKey}
      onSelectCandidate={handleSafeguardCandidateSelect}
      scoreCandidates={scoreSafeguardCandidatesViaWorker}
      {...(gearInspectorVisibleItemKeySet != null ? { visibleItemKeys: gearInspectorVisibleItemKeySet } : {})}
      multiEdit={safeguardMultiEditHandle}
      multiSelectedRules={multiSelectedSafeguardRules}
      onApplyMultiEdit={safeguardMultiselectActive ? applySafeguardMultiEditDraft : null}
      safeguardOverridesInstructions={effectiveSafeguardInstructions}
      candidateFocusBucketKey={safeguardCandidateFocusBucketKey}
      onCandidateFocusBucketKeyChange={handleSafeguardCandidateFocusBucketKeyChange}
      {...(safeguardCandidateImprovementChanceByItemKey != null ? { improvementChanceByItemKey: safeguardCandidateImprovementChanceByItemKey } : {})}
    />
  )

  const builderPanelElement = (
    <BuilderPanel
      tagVocabulary={tagVocabulary}
      recipe={builder}
      onChange={setBuilder}
      onAddToCustom={() => {
        const currentBuilder = builderRef.current
        // Clone the builder snapshot so recipes never share object identity.
        // Enforce the faction→accessory-slots invariant: faction set + empty slots
        // would silently target artifact that can never match.
        const insertedRecipe = normalizeFactionSlotScope(cloneBuilderRecipe(currentBuilder))
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
        // Same faction→accessory-slots normalization as the insert path.
        const nextRecipe = normalizeFactionSlotScope(cloneBuilderRecipe(currentBuilder))
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
      onMetasetRenamed={(previousName, nextName) => {
        // Cascade the rename into all places that reference metasets by name.
        setBuilder(prev => {
          const currentMeta = prev.artifactMetaSets ?? []
          if (!currentMeta.includes(previousName)) return prev
          return { ...prev, artifactMetaSets: currentMeta.map(n => (n === previousName ? nextName : n)) }
        })
        setCustomRecipesTransition(prev => {
          let anyChanged = false
          const next = prev.map(c => {
            const currentMeta = c.artifactMetaSets ?? []
            if (!currentMeta.includes(previousName)) return c
            anyChanged = true
            return { ...c, artifactMetaSets: currentMeta.map(n => (n === previousName ? nextName : n)) }
          })
          return anyChanged ? next : prev
        })
        setSafeguardRulesTransition(prev => {
          let mutated = false
          const next = prev.map(rule => {
            const metaIds = rule.combination.metaSetNames ?? []
            if (!metaIds.includes(previousName)) return rule
            mutated = true
            return {
              ...rule,
              combination: {
                ...rule.combination,
                metaSetNames: metaIds.map(n => (n === previousName ? nextName : n)),
              },
            }
          })
          return mutated ? next : prev
        })
      }}
      onDeleteMetaset={(id, opts) => {
        // Determine replacement strategy before mutating metasets/recipes/safeguard rules
        const metaToDelete = metasets.find(m => m.name === id) || null
        const replaceWithSets = Boolean(opts?.replaceWithSets && metaToDelete && (metaToDelete.sets.length > 0))
        const replaceWithMetaId = opts?.replaceWithMetaId && opts.replaceWithMetaId !== id ? opts.replaceWithMetaId : null

        // Remove metaset from the list (cheap)
        if (!metaToDelete) {
          describeNextChange(null)
          return
        }
        const deletionMode: 'delete' | 'replaceSets' | 'replaceMeta' = replaceWithSets ? 'replaceSets' : (replaceWithMetaId ? 'replaceMeta' : 'delete')
        const replacementName = replaceWithMetaId ? (metasets.find((m) => m.name === replaceWithMetaId)?.name ?? null) : null
        const descriptor: HistoryEntryDescriptor = {
          kind: 'metasetDeleted',
          metaset: cloneMetaset(metaToDelete),
          mode: deletionMode,
          ...(replacementName ? { replacementName } : {}),
        }
        describeNextChange(descriptor)
        // Deleting a metaset can fan out into recipe/safeguard recalculation; keep non-urgent.
        handleMetasetsChange(prev => prev.filter(m => m.name !== id))

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
              const metaIds = rule.combination.metaSetNames ?? []
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
                  metaSetNames: nextMetaIds,
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
      onSelectSafeguardsByMetaset={(id) => {
        // Select all safeguard rules that reference the given metaset ID.
        const indices: number[] = []
        for (let i = 0; i < safeguardRules.length; i += 1) {
          const metas = safeguardRules[i]?.combination.metaSetNames ?? []
          if (metas.includes(id)) indices.push(i)
        }
        setSelectedSafeguardRuleIndices(indices)
        const last = indices.length > 0 ? indices[indices.length - 1]! : null
        setSelectedSafeguardRuleIdx(last)
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
      rules={displaySafeguardRules as SafeguardRule[]}
      // The pre-override rules the panel's clipboard actions serialize; `rules` above is the
      // override-applied display list and must never be the source of persistable data.
      storedRules={safeguardRules}
      selectedRuleIdx={selectedSafeguardRuleIdx}
      onSelect={handleSelectSafeguardRule}
      onRulesChange={(next, options) => applySafeguardRulesChange(next, options)}
      maxHeightPx={safeguardChipsMaxHeight}
      isSideBySide={isSideBySide}
      containerRef={safeguardChipsContainerRef}
      visibleRuleIndices={visibleSafeguardRuleIds}
      metasets={metasetsForPreview}
      substatColors={substatColors}
      focusRuleRequest={safeguardFocusRequest}
      selectedRuleIndices={selectedSafeguardRuleIndices}
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
      exportModeOverrides={recipeModes}
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
      onNavigateTo={handleRecipeNavigateTo}
    />
  )

  // Shared SFC payload shape used by direct loads and selective Shift imports.
  // The parser's own result shape (SSOT in sfcIO). Previously restated here, which is how
  // it drifted from the reader; aliasing means a new payload field cannot go missing again.
  type SfcLoadPayload = ParsedSfcResult

  // Merge strategy for metaset conflict handling when selective import uses merge mode.
  type MetasetConflictStrategy = 'keepCurrent' | 'useIncoming' | 'keepBoth'

  type PendingSfcLoadImport = {
    fileName: string
    payload: SfcLoadPayload
    selection: SfcImportSelection
    modes: SfcImportModes
  }

  const applySfcLoadResult = useCallback((
    fileName: string,
    payload: SfcLoadPayload,
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
      noteRecipeOverridesAnswers: importedRecipeAnswers,
      noteSafeguardOverridesAnswers: importedSafeguardAnswers,
      noteOverridesDisabled: importedOverridesDisabled,
    } = payload

    const loadDescriptor = createSfcLoadedDescriptor(fileName)
    // Fallback lands on the first NON-SEPARATOR recipe (SSOT: firstSelectableRecipeIndex).
    const resolvedSel = typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < recipes.length
      ? selectedIndex
      : firstSelectableRecipeIndex(recipes)
    const rawNote = typeof note === 'string' ? note : ''
    const importedNote = rawNote.trim().length > 0 ? rawNote : null
    beginGearInspectorMatchReset('sfc')

    if (importedNote !== null) {
      // Mark this as an auto-open so the view dialog hides the edit button.
      setNoteAutoOpenedFromSfc(true)
    } else {
      closeNoteAfterLoad()
    }
    // Non-history state — not part of the signature, safe outside the transition.
    setNoteRecipeOverridesAnswers({})
    // SFC files may now carry the disabled flag; absent (legacy files) reads as false.
    setNoteOverridesDisabled(importedOverridesDisabled)
    // Safeguard + recipe overrides answers are resolved by the import-mode `applyNoteChange`
    // below (its SSOT) — it runs last in this batch and would overwrite anything set here, so
    // any seed here is dead. Clearing keeps the pre-commit state consistent; the import path
    // reapplies the document's own stored answers (or reseeds when the file carries none).
    setNoteSafeguardOverridesAnswers({})

    startTransition(() => {
      describeNextChange(loadDescriptor)
      // Note change moved inside the transition so sfcNote and customRecipes commit in the
      // same render batch. sfcNote is part of the history signature; if it were committed
      // urgently (outside the transition), the first render would consume markNextAsSavedRef
      // and the second render (customRecipes etc.) would land in a dirty state.
      // applyNoteChange with publish:false never calls describeNextChange, so loadDescriptor is safe.
      // Hand the document's own override answers to the import so a saved .sfc reopens in the
      // configuration it was saved in, instead of snapping back to the note's authored defaults.
      applyNoteChange(importedNote, {
        mode: 'import',
        publish: false,
        importedRecipeAnswers,
        importedSafeguardAnswers,
      })
      // Open the viewer inside the SAME transition so the dialog mounts together with the
      // freshly-committed sfcNote. Opening it urgently (outside the transition) made the
      // dialog render once against the OLD sfcNote before this commit, flashing stale content.
      if (importedNote !== null) openNoteViewer()
      // SFC files do not carry an HSF; clear any previously loaded base file.
      setHsf(null)
      setCustomRecipes(recipes)
      if (nextMetas !== metasets) {
        setMetasets(nextMetas)
      }
      if (nextSubstatTargets !== substatTargets) {
        try {
          applySubstatTargetsChange(nextSubstatTargets, { mode: 'import', publish: false })
        } catch {}
      }
      // File import replaces everything; null (absent key in old SFC) falls back to defaults.
      setSafeguardRules(safeguardRules ?? [])
      setSafeguardsEnabled(safeguardsEnabled ?? false)
      setRecipesEnabled(payloadRecipesEnabled)
      if (fsr !== null) applyFinalSellChange(fsr, { mode: 'import', publish: false })
      // Always select first recipe on manual SFC load (index is not persisted in the file).
      // skipAutoApply: the whole recipe list is being replaced, so auto-applying the old
      // draft before the selection changes would silently corrupt the newly loaded recipes.
      syncSelectedRecipeIdx(resolvedSel, { forceSync: true, suppressDraft: true, skipAutoApply: true })
      if (resolvedSel !== null && recipes[resolvedSel]) {
        setBuilder(recipes[resolvedSel]!)
      }
      // Land on the first NON-SEPARATOR safeguard rule when loading a file, and load its
      // data into the builder (autosave restore applies its own saved index elsewhere).
      // Why: setSelectedSafeguardRuleIdx alone only updates the primary index; the multi-select
      // indices (selectedSafeguardRuleIndices) and the builder draft must also be reset so the
      // chip highlight and panel content stay in sync with the new SFC's rules.
      const sgLoadSel = firstSelectableSafeguardIndex(safeguardRules ?? [])
      setSelectedSafeguardRuleIdx(sgLoadSel)
      // Reset the multi-select index array; suppressWillChange avoids auto-applying the stale draft.
      setSelectedSafeguardRuleIndices(sgLoadSel !== null ? [sgLoadSel] : [], { suppressWillChange: true })
      const sgLoadRule = sgLoadSel !== null ? (safeguardRules ?? [])[sgLoadSel] : undefined
      if (sgLoadRule) setSafeguardBuilder(cloneSafeguardRule(sgLoadRule))
      // Increment nonce so the post-transition safety-net effect fires after the history
      // snapshot effect in this same commit (see sfcLoadNonce useEffect above).
      setSfcLoadNonce((n) => n + 1)
    })

    markNextSnapshotAsSaved()
    setLastExportedHash(null)
    setExportBaselineResetPending(true)
    flushTransientUi()
  }, [
    applyFinalSellChange,
    applyNoteChange,
    applySubstatTargetsChange,
    closeNoteAfterLoad,
    describeNextChange,
    flushTransientUi,
    markNextSnapshotAsSaved,
    metasets,
    openNoteViewer,
    setNoteAutoOpenedFromSfc,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setBuilder,
    setCustomRecipes,
    setLastExportedHash,
    setMetasets,
    setNoteRecipeOverridesAnswers,
    setNoteOverridesDisabled,
    setNoteSafeguardOverridesAnswers,
    substatTargets,
    syncSelectedRecipeIdx,
    setSelectedSafeguardRuleIdx,
    setSelectedSafeguardRuleIndices,
    setSafeguardBuilder,
    setHsf,
    setSfcLoadNonce,
    beginGearInspectorMatchReset,
  ])

  // Guard selective imports so skipping metasets cannot break recipe/safeguard references.
  const getSelectiveImportMetasetIssues = useCallback((
    selection: SfcImportSelection,
    payload: SfcLoadPayload,
  ) => getMetasetDependencyIssues({
    selection: {
      recipes: selection.recipes,
      safeguards: selection.safeguards,
      metasets: selection.metasets,
    },
    incomingMetasetIds: collectMetasetIds(payload.metasets),
    recipeMetasetIds: collectRecipeMetasetIds(payload.recipes),
    safeguardMetasetIds: collectSafeguardMetasetIds(payload.safeguardRules ?? []),
  }), [])

  // Resolve incoming SFC data with selection + merge settings.
  // Why: Shift-load applies only selected sections instead of replacing everything.
  const applySelectiveSfcLoad = useCallback((args: {
    fileName: string
    payload: SfcLoadPayload
    selection: SfcImportSelection
    modes: SfcImportModes
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
        const prep = prepareSfcImport(metasets, payload.metasets, payload.recipes)
        if (prep.conflicts.length > 0 && !metasetConflictStrategy) {
          // Defer apply until the metaset conflict dialog resolves merge strategy.
          setPendingSfcLoadImport({ fileName, payload, selection, modes })
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
    // Remap safeguard metaset references through the same map; null means absent in source.
    const remappedSafeguards = (payload.safeguardRules ?? []).map((rule) => ({
      ...rule,
      combination: {
        ...rule.combination,
        metaSetNames: (rule.combination.metaSetNames ?? []).map((id) => metasetIdMap.get(id) ?? id),
      },
    }))
    // Track whether any section modifies recipe/Gear Inspector match behavior.
    const affectsRecipesOrSafeguards = selection.recipes || selection.safeguards
    if (affectsRecipesOrSafeguards) beginGearInspectorMatchReset('sfc')
    // Prefix the descriptor so history shows selective load context.
    describeNextChange(createSfcLoadedDescriptor(fileName))
    if (selection.metasets && nextMetasets !== null) {
      setMetasets(nextMetasets)
    }
    // Keep substat targets/final sell coupled to recipe imports.
    if (selection.recipes) {
      try {
        applySubstatTargetsChange(payload.substatTargets, { mode: 'import', publish: false })
      } catch {}
      if (payload.finalSellRemainder !== null) {
        applyFinalSellChange(payload.finalSellRemainder, { mode: 'import', publish: false })
      }
      if (modes.recipes === 'replace') {
        setCustomRecipes(remappedRecipes)
        // Fallback lands on the first NON-SEPARATOR recipe (SSOT: firstSelectableRecipeIndex).
        const selected = typeof payload.selectedIndex === 'number'
          && payload.selectedIndex >= 0
          && payload.selectedIndex < remappedRecipes.length
          ? payload.selectedIndex
          : firstSelectableRecipeIndex(remappedRecipes)
        // skipAutoApply: replacing the full recipe list; auto-applying stale state would
        // corrupt the freshly-loaded recipes with builder content from the previous session.
        syncSelectedRecipeIdx(selected, { forceSync: true, suppressDraft: true, skipAutoApply: true })
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
        const current = typeof sfcNote === 'string' ? sfcNote.trim() : ''
        const incoming = incomingNoteRaw.trim()
        const joined = current && incoming
          ? `${current}\n\n${incoming}`
          : (current || incoming || '')
        if (joined.length > 0) {
          setNoteAutoOpenedFromSfc(true)
          applyNoteChange(joined, { mode: 'import', publish: false })
          openNoteViewer()
        } else {
          applyNoteChange(null, { mode: 'import', publish: false })
          closeNoteAfterLoad()
        }
      } else {
        const importedNote = incomingNoteRaw.trim().length > 0 ? incomingNoteRaw : null
        if (importedNote !== null) {
          setNoteAutoOpenedFromSfc(true)
          // Replacing the note also adopts the incoming document's override answers; they are
          // pruned against that note, so entries it no longer declares are dropped.
          applyNoteChange(importedNote, {
            mode: 'import',
            publish: false,
            importedRecipeAnswers: payload.noteRecipeOverridesAnswers,
            importedSafeguardAnswers: payload.noteSafeguardOverridesAnswers,
          })
          openNoteViewer()
        } else {
          applyNoteChange(null, { mode: 'import', publish: false })
          closeNoteAfterLoad()
        }
      }
      // The import-mode applyNoteChange above is the SSOT for BOTH answer maps: it adopts the
      // incoming document's stored answers when it has them and otherwise resets + seeds from
      // the new note's default recipe mode. Do NOT reset either map here — that ran after the
      // call and silently discarded whatever it had just resolved.
      // The disabled flag is not part of applyNoteChange, so it is applied here.
      setNoteOverridesDisabled(payload.noteOverridesDisabled)
    }
    if (selection.safeguards) {
      if (modes.safeguards === 'replace') {
        setSafeguardRules(remappedSafeguards)
        // null (absent key) falls back to false for file-import replace.
        setSafeguardsEnabled(payload.safeguardsEnabled ?? false)
        setRecipesEnabled(payload.recipesEnabled !== false)
        // Replace mode wipes existing rules, so the old selection is always stale.
        // Land on the first NON-SEPARATOR rule; reset both the primary index and the
        // multi-select indices so chip highlight and builder draft stay consistent.
        const sgReplaceSel = firstSelectableSafeguardIndex(remappedSafeguards)
        setSelectedSafeguardRuleIdx(sgReplaceSel)
        // suppressWillChange avoids auto-applying the stale draft during the reset.
        setSelectedSafeguardRuleIndices(sgReplaceSel !== null ? [sgReplaceSel] : [], { suppressWillChange: true })
        const sgReplaceRule = sgReplaceSel !== null ? remappedSafeguards[sgReplaceSel] : undefined
        if (sgReplaceRule) setSafeguardBuilder(cloneSafeguardRule(sgReplaceRule))
      } else {
        // Append concatenates two independently valid lists, which can leave the seam illegal
        // (an imported group whose id collides with an existing one would otherwise merge into
        // it when the two touch). Repair across the join — one of the three normalizer call
        // sites, alongside the mutation funnel and the SFC parse path.
        setSafeguardRules((prev) => normalizeSafeguardGroups([...prev, ...remappedSafeguards]))
        setSafeguardsEnabled((prev) => prev || (payload.safeguardsEnabled ?? false))
        setRecipesEnabled((prev) => prev || payload.recipesEnabled !== false)
      }
    }
    markNextSnapshotAsSaved()
    setLastExportedHash(null)
    setExportBaselineResetPending(true)
    // markSavedNow in the rAF is a safety net: this function uses urgent (non-transition)
    // updates, so useEffect fires before the rAF and the rAF is truly a fallback.
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
    closeNoteAfterLoad,
    customRecipes.length,
    describeNextChange,
    finalizeImport,
    flushTransientUi,
    getSelectiveImportMetasetIssues,
    markNextSnapshotAsSaved,
    markSavedNow,
    metasets,
    openNoteViewer,
    prepareSfcImport,
    selectedRecipeIdx,
    setBuilder,
    setCustomRecipes,
    setConflictIds,
    setImportIdMap,
    setLastExportedHash,
    setMetasetConflictOpen,
    setMetasets,
    setNoteAutoOpenedFromSfc,
    setNoteOverridesDisabled,
    setPendingSfcLoadImport,
    setSafeguardRules,
    setSafeguardsEnabled,
    setRecipesEnabled,
    setSelectedSafeguardRuleIdx,
    setSelectedSafeguardRuleIndices,
    setSafeguardBuilder,
    sfcNote,
    syncSelectedRecipeIdx,
  ])

  const importSfcFile = useCallback(async (file: File, context?: FileRouteContext) => {
    flushTransientUi()
    try {
      const result = await readSfcFile(file, { metasets, substatTargets })
      // Shift modifier opens selective import options instead of immediate full replace.
      if (context?.shiftKey) {
        setPendingSfcShiftDialogImport({ fileName: file.name, payload: result })
      } else {
        applySfcLoadResult(file.name, result)
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Failed to parse recipe file (.sfc/.sfr/.hsfc)', err)
      }
      showFileFormatError(file.name)
      flushTransientUi()
    }
  }, [
    applySfcLoadResult,
    flushTransientUi,
    metasets,
    setPendingSfcShiftDialogImport,
    substatTargets,
    showFileFormatError,
  ])

  const handleSfcFile = useCallback(async (file: File, context?: FileRouteContext) => {
    if (tutorial.helpOpen) {
      tutorial.setHelpOpen(false)
      tutorial.setHelpFirstRunMode(false)
      try { localStorage.setItem(README_SEEN_VERSION_KEY, APP_VERSION) } catch {}
    }
    if (restoreDialogPending) dismissRestore()
    if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
    await importSfcFile(file, context)
  }, [
    confirmClearOpen,
    confirmDeleteIdx,
    confirmDeleteTargets,
    dismissRestore,
    importSfcFile,
    restoreDialogPending,
    tutorial,
  ])

  const handleHsfFile = useCallback(async (file: File) => {
    flushTransientUi()
    if (confirmClearOpen || confirmDeleteIdx !== null || confirmDeleteTargets !== null) return
    try {
      const parsed = await readHsfFile(file)
      setHsf(parsed)
      setExportBaselineResetPending(true)
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
      onSfc: handleSfcFile,
      onHsf: handleHsfFile,
      onL10n: handleRuntimeCatalog,
      onGearDb: handleGearDbImport,
      onGearSets: handleRuntimeGearSets,
      onUnknownFile: handleUnknownImportedFile,
    }, routeContext)
  }, [
    handleGearDbImport,
    handleSfcFile,
    handleHsfFile,
    handleRuntimeCatalog,
    handleRuntimeGearSets,
    handleUnknownImportedFile,
  ])

  // Loads the beginner or lategame preset SFC directly without a confirmation dialog.
  // Used by the express-mode preset toggle in NoteDialog. Persists the chosen
  // variant so the selection survives reloads.
  const handleLoadSimplePreset = useCallback((variant: PresetVariant) => {
    persistSimpleVariant(variant)
    // Raw text + filename come from the preset SSOT (sfcPresetMatch) so the bundled
    // preset is consumed in exactly one place across the app.
    const file = new File([presetRaw(variant)], presetFilename(variant), { type: 'application/json' })
    void handleManualFileSelection(file, { shiftKey: false })
  }, [handleManualFileSelection])

  // Saved dynamic-override state for the simple-mode startup restore: the tuned
  // recipe/safeguard answers and the overrides-disabled flag, read from autosave.
  type SavedSimpleOverrides = {
    recipeAnswers: NoteRecipeOverridesAnswers
    safeguardAnswers: NoteSafeguardOverridesAnswers
    disabled: boolean
  }

  // Snapshot the autosave entry ONCE at first render, before any effect can write to it.
  // Why: on a fresh launch with no prior save, autosave is enabled from the first render,
  // so useAutosave's writeOnEnable persists the EMPTY default state before the post-paint
  // simple-startup restore effect runs. If the resolvers below re-read localStorage live,
  // they pick up that empty draft (no PresetOrigin marker → treated as a note-less "custom"
  // body), the SFC load closes the note dialog, and simple view — which hides all other UI —
  // goes black. Capturing the PRE-write entry here keeps the restore authoritative: a genuine
  // prior session restores; a truly fresh launch sees null and falls back to a preset.
  const [simpleStartupAutosaveEntry] = useState<{ crc: string; payload: Record<string, unknown> } | null>(
    () => loadAutosave<Record<string, unknown>>(AUTOSAVE_KEY),
  )

  // Read the user's saved override answers from the captured autosave payload, or null when
  // none exist (fresh session / answers never tuned). Both restore branches re-apply
  // these because an SFC load resets answers to the note's defaults.
  const readSavedSimpleOverrideAnswers = useCallback((): SavedSimpleOverrides | null => {
    const entry = simpleStartupAutosaveEntry
    if (!entry) return null
    const payload = entry.payload
    const recipeAnswers = (payload[NOTE_RECIPE_OVERRIDES_ANSWERS_KEY] as NoteRecipeOverridesAnswers | undefined) ?? {}
    const safeguardAnswers = (payload[NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY] as NoteSafeguardOverridesAnswers | undefined) ?? {}
    const disabled = Boolean(payload[NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY])
    // Nothing tuned and not disabled — let the freshly-loaded note's defaults stand.
    if (Object.keys(recipeAnswers).length === 0 && Object.keys(safeguardAnswers).length === 0 && !disabled) return null
    return { recipeAnswers, safeguardAnswers, disabled }
  }, [simpleStartupAutosaveEntry])

  // Load the autosaved custom SFC body through the normal SFC load path (same path the
  // preset buttons use), so it parses/normalizes identically. Returns a promise that
  // resolves after the load is dispatched so callers can sequence answer re-application.
  const loadSavedCustomSfc = useCallback((): Promise<void> => {
    const entry = simpleStartupAutosaveEntry
    // No saved custom body to restore — fall back to the lategame preset.
    if (!entry) { handleLoadSimplePreset('lategame'); return Promise.resolve() }
    // The autosave payload IS a superset of the readable SFC schema, so serializing it
    // back to text yields a valid .sfc the loader understands (extra keys are ignored).
    const text = JSON.stringify(entry.payload, null, 2)
    const file = new File([text], 'custom.sfc', { type: 'application/json' })
    return handleManualFileSelection(file, { shiftKey: false })
  }, [handleLoadSimplePreset, handleManualFileSelection, simpleStartupAutosaveEntry])

  // Resolve what to load on simple-mode startup, authoritatively from autosave.
  // The PresetOrigin marker (stamped at save time from the LIVE content match) wins:
  // a saved setup that was still a built-in reloads the CURRENT built-in of that name,
  // never the stale saved body — so users ride preset updates across app versions.
  // Without a marker we treat the saved body as the user's own custom setup. The
  // variant token is only a fallback when no autosave exists at all.
  const resolveSimpleStartupSource = useCallback((): { kind: 'preset'; variant: PresetVariant } | { kind: 'custom' } => {
    const entry = simpleStartupAutosaveEntry
    if (entry) {
      const origin = entry.payload[AUTOSAVE_PRESET_ORIGIN_KEY]
      // Marker present and valid: reload the current built-in of that name.
      if (origin === 'beginner' || origin === 'lategame') return { kind: 'preset', variant: origin }
      // No marker but a saved body exists: it diverged from any preset — it's custom.
      return { kind: 'custom' }
    }
    // First-ever launch: no autosave. Honor the persisted variant token, default Midgame+.
    const token = getSimpleVariant()
    return { kind: 'preset', variant: token === 'beginner' ? 'beginner' : 'lategame' }
  }, [simpleStartupAutosaveEntry])

  // Re-apply the saved override answers on top of the freshly-loaded note, mirroring the
  // autosave-restore path: prune answers to the current note, re-seed missing forced
  // safeguard sliders from the loaded recipe defaults, and restore the disabled flag.
  const applySavedSimpleOverrideAnswers = useCallback((saved: SavedSimpleOverrides) => {
    const note = sfcNoteRef.current ?? ''
    const prunedRecipeAnswers = pruneNoteRecipeOverridesAnswers(note, saved.recipeAnswers)
    setNoteRecipeOverridesAnswers(prunedRecipeAnswers)
    const prunedSafeguardAnswers = pruneNoteSafeguardOverridesAnswers(note, saved.safeguardAnswers)
    setNoteSafeguardOverridesAnswers(seedSafeguardAnswersFromRecipeDefaults(note, prunedRecipeAnswers, prunedSafeguardAnswers))
    setNoteOverridesDisabled(saved.disabled)
  }, [setNoteRecipeOverridesAnswers, setNoteSafeguardOverridesAnswers, setNoteOverridesDisabled])

  // Resolve once the freshly-loaded SFC's note has committed into sfcNoteRef, so callers
  // that prune against the loaded note (applySavedSimpleOverrideAnswers) don't run against
  // a stale/empty note. Polls per animation frame and resolves the moment the note is
  // present, with a hard frame cap so an SFC that legitimately has no note can't spin —
  // after the cap we resolve anyway and let the (empty-note) prune proceed as before.
  const waitForLoadedNote = useCallback((): Promise<void> => {
    // No rAF (non-browser/test): fall back to a microtask so behavior stays deterministic.
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return Promise.resolve()
    }
    // ~30 frames (~0.5s at 60fps) is comfortably above the observed WebView commit lag
    // while still bailing fast if the note never arrives.
    const MAX_FRAMES = 30
    return new Promise<void>((resolve) => {
      let frames = 0
      const tick = () => {
        // Note has landed (the common case) — apply immediately.
        if ((sfcNoteRef.current ?? '') !== '') { resolve(); return }
        // Give up after the cap so a genuinely note-less SFC doesn't hang the restore.
        if (frames >= MAX_FRAMES) { resolve(); return }
        frames += 1
        window.requestAnimationFrame(tick)
      }
      window.requestAnimationFrame(tick)
    })
  }, [])

  // Restore the user's last simple-mode session once when starting in express mode.
  // Skipped when expert mode was already on — the user gets the normal app.
  //
  // Source of truth is resolveSimpleStartupSource (autosave PresetOrigin marker):
  //  - preset origin: (re)load the CURRENT bundled preset of that name — never an old
  //    saved body — so preset updates are picked up across app versions. Saved dynamic-
  //    override answers are re-applied on top so the user's tuning sticks.
  //  - custom: restore the autosaved SFC body (the user's own setup). Its note carries
  //    the override DSL; saved answers are re-applied the same way.
  const simplePresetLoadDoneRef = useRef(false)
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!isSimpleViewAtStart || simplePresetLoadDoneRef.current) return
    simplePresetLoadDoneRef.current = true
    // An SFC load resets override answers to the note's defaults, so capture the
    // user's saved answers up front and re-apply them after the load settles.
    const savedAnswers = readSavedSimpleOverrideAnswers()
    // Resolve the SFC source: the current built-in (preset origin) or the saved body.
    const source = resolveSimpleStartupSource()
    const loadPromise = source.kind === 'custom'
      ? loadSavedCustomSfc()
      : (handleLoadSimplePreset(source.variant), Promise.resolve())
    // Re-apply saved override answers AFTER the loaded note has actually committed.
    // applySavedSimpleOverrideAnswers prunes the saved answers against sfcNoteRef.current,
    // so it must not run until the load's note has landed in that ref (synced via a
    // layout effect). The previous single-rAF guess flushed reliably on desktop Chromium
    // but not inside the embedded WebView, where the commit lands a frame later — apply
    // then pruned against an empty note and silently dropped every saved override. Instead
    // wait for the note to become present before applying (bounded so we never spin).
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (savedAnswers) {
      void loadPromise.then(() => waitForLoadedNote().then(() => applySavedSimpleOverrideAnswers(savedAnswers)))
    }
  }, [
    isSimpleViewAtStart,
    handleLoadSimplePreset,
    loadSavedCustomSfc,
    resolveSimpleStartupSource,
    readSavedSimpleOverrideAnswers,
    applySavedSimpleOverrideAnswers,
    waitForLoadedNote,
  ])

  // Keep the openNoteViewer ref stable so the auto-open effect can call it once.
  const openNoteViewerRef = useRef(openNoteViewer)
  useLayoutEffect(() => { openNoteViewerRef.current = openNoteViewer })

  // Auto-open the note dialog and enable auto-push when starting in express simple mode.
  // Skipped when expert mode was already on.
  const simpleAutoOpenDoneRef = useRef(false)
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (!isSimpleViewAtStart || simpleAutoOpenDoneRef.current) return
    simpleAutoOpenDoneRef.current = true
    openNoteViewerRef.current()
    // Default auto-push to on in express mode ONLY when this account never configured it —
    // auto-push is account-specific and an explicit off must survive simple starts and
    // account switches (hasExplicit… distinguishes '0' from an absent key).
    if (!autoPushEnabled && !hasExplicitSellfileAutoPushForAccount(getActiveAccount().id)) {
      setAutoPushEnabled(true)
    }
  }, [isSimpleViewAtStart, autoPushEnabled, setAutoPushEnabled])

  // When express was requested but expert mode was already on, briefly pulse the Note button
  // to draw attention to it — the user opted for the full UI last time.
  // Waits for the Restore dialog to close before starting so it doesn't compete with it.
  const simpleNoteBlinkDoneRef = useRef(false)
  useEffect(() => {
    if (!simpleMode || isSimpleViewAtStart) return
    if (restoreDlgOpen) return // restore dialog still visible — wait
    if (simpleNoteBlinkDoneRef.current) return // already played once
    simpleNoteBlinkDoneRef.current = true
    const btn = typeof document !== 'undefined'
      ? (document.querySelector('[data-tour-id="note.toggle"]') as HTMLElement | null)
      : null
    const anim = playAttentionPulse(btn)
    return () => { anim?.cancel() }
  }, [simpleMode, isSimpleViewAtStart, restoreDlgOpen])

  // Number of pulse cycles that reads as a deliberate ~3s "look here" blink. Derived from the shared
  // cycle length so it stays correct if the pulse timing changes.
  const attentionPulseLongIterations = useMemo(() => attentionPulseIterationsForMs(3000), [])
  // ~2.5s blink for the substat-weights button after a Gear Inspector chip jump — long enough to
  // notice across the panel without feeling stuck.
  const attentionPulseWeightsIterations = useMemo(() => attentionPulseIterationsForMs(2500), [])

  // Task: pulse the in-dialog "Simple Mode" toggle whenever it newly becomes visible, so the user
  // notices where the control is. It is visible exactly when simple+expert AND the dialog is open,
  // so the single false → true edge of that combined condition covers both triggers: switching
  // simple → expert from inside the open dialog, and (re)opening the dialog while already expert.
  const prevGoSimpleVisibleRef = useRef(simpleMode && expertMode && noteOpen)
  useEffect(() => {
    const visible = simpleMode && expertMode && noteOpen
    const wasVisible = prevGoSimpleVisibleRef.current
    prevGoSimpleVisibleRef.current = visible
    if (!visible || wasVisible) return // only on the newly-visible edge
    // Wait out the Fade-in so the pulse plays on a fully visible button.
    let anim: Animation | null = null
    const timer = setTimeout(() => {
      const btn = typeof document !== 'undefined'
        ? (document.querySelector('[data-attention-id="note.goSimple"]') as HTMLElement | null)
        : null
      anim = playAttentionPulse(btn, attentionPulseLongIterations)
    }, SIMPLE_MODE_TRANSITION_MS)
    return () => { clearTimeout(timer); anim?.cancel() }
  }, [simpleMode, expertMode, noteOpen, attentionPulseLongIterations])

  // Task: in simple+expert mode, when the user closes the note dialog the "Note & dynamic overrides"
  // toggle in the header becomes the way back into it — pulse it on the close transition so the user
  // notices it. Mirrors the simple→expert toggle pulse above.
  const prevNoteOpenSimpleExpertRef = useRef(noteOpen)
  useEffect(() => {
    const wasOpen = prevNoteOpenSimpleExpertRef.current
    prevNoteOpenSimpleExpertRef.current = noteOpen
    // Only on the open → closed edge, and only in simple+expert mode (where the header is visible).
    if (!simpleMode || !expertMode || noteOpen || !wasOpen) return
    const btn = typeof document !== 'undefined'
      ? (document.querySelector('[data-tour-id="note.toggle"]') as HTMLElement | null)
      : null
    const anim = playAttentionPulse(btn, attentionPulseLongIterations)
    return () => { anim?.cancel() }
  }, [simpleMode, expertMode, noteOpen, attentionPulseLongIterations])

  // Task: when a Gear Inspector chip jump selects a safeguard (openLogicHubSafeguardRule bumps
  // safeguardWeightsPulseToken), pulse the substat-weights button so the user notices the flyout for
  // the focused bucket. Reuses the shared attention pulse (same as the note toggle). The jump also
  // sets builderMode='safeguard', so the panel mounts this render; a rAF defers the pulse until after
  // the button paints. Skips the initial mount (token 0) and missing/disabled buttons.
  const prevWeightsPulseTokenRef = useRef(safeguardWeightsPulseToken)
  useEffect(() => {
    const prev = prevWeightsPulseTokenRef.current
    prevWeightsPulseTokenRef.current = safeguardWeightsPulseToken
    // Only fire on an actual bump (not the initial mount or unrelated re-renders).
    if (safeguardWeightsPulseToken === prev) return
    let anim: Animation | null = null
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(() => {
          const btn = typeof document !== 'undefined'
            ? (document.querySelector('[data-attention-id="safeguard.weights"]') as HTMLElement | null)
            : null
          // Disabled buttons carry the attribute too; skip them so a no-substat rule doesn't blink.
          if (btn && btn.getAttribute('aria-disabled') !== 'true' && !(btn as HTMLButtonElement).disabled) {
            anim = playAttentionPulse(btn, attentionPulseWeightsIterations)
          }
        })
      : null
    return () => { if (raf != null) cancelAnimationFrame(raf); anim?.cancel() }
  }, [safeguardWeightsPulseToken, attentionPulseWeightsIterations])

  // Show the deferred first-run help dialog once the user is in expert mode AND
  // has closed the NoteDialog, so it never overlays the note dialog.
  // (legitimate multi-condition watch; no single event triggers this transition)
  const simpleDeferredHelpDoneRef = useRef(false)
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler */
  useEffect(() => {
    if (!tutorial.helpFirstRunPending) return
    if (!expertMode || noteOpen) return
    if (simpleDeferredHelpDoneRef.current) return
    simpleDeferredHelpDoneRef.current = true
    tutorial.setHelpOpen(true)
    tutorial.setHelpFirstRunMode(true)
  }, [expertMode, noteOpen, tutorial])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

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
    onSfc: (file, ctx) => { if (!tutorial.tutorialOpen) void handleSfcFile(file, ctx) },
    onHsf: (file) => { if (!tutorial.tutorialOpen) void handleHsfFile(file) },
    onL10n: (file) => { if (!tutorial.tutorialOpen) void handleRuntimeCatalog(file) },
    onGearDb: (file, ctx) => { if (!tutorial.tutorialOpen) void handleGearDbImport(file, ctx) },
    onGearSets: (file) => { if (!tutorial.tutorialOpen) void handleRuntimeGearSets(file) },
    onUnknownFile: (file) => { if (!tutorial.tutorialOpen) void handleUnknownImportedFile(file) },
  })

  // Track whether a note exists so we can open in view mode.
  const notePresent = Boolean(sfcNote && sfcNote.trim())

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

  // Easter egg hooks — declared here so the closures inside substatTargetsElement can reference them.
  const recordFinalSellEasterEggClick = useEasterEggTrigger(10, 10_000)
  const [pongOpen, setPongOpen] = useState(false)
  const recordRecipesEasterEggClick = useEasterEggTrigger(10, 10_000)
  const [sellfallOpen, setSellfallOpen] = useState(false)

  // Builder panel header right side: optional Substat Targets + global Recipes/FinalSell/Safeguards/Tools controls.
  const fsEnabled = (finalSellRemainder.artifacts || finalSellRemainder.accessories) && (finalSellRemainder.levels?.length ?? 0) > 0
  const safeguardsDisabledWarningForBuilder = builderMode === 'safeguard' && !safeguardsEnabled && safeguardRules.length > 0
  const recipesDisabledWarningForBuilder = builderMode === 'recipe' && !recipesEnabled
  const substatTargetsElement = (
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
      {/* Recipes global enable toggle */}
      <MarkdownTooltip markdown={t('recipesToggleTooltip')}>
        <ToggleButton
          value="recipesToggle"
          selected={recipesEnabled}
          size="small"
          onClick={() => {
              applyRecipesEnabledChange(!recipesEnabled)
              if (recordRecipesEasterEggClick('sellfall')) setSellfallOpen(true)
            }}
          aria-label={t('recipesToggleLabel')}
          aria-pressed={recipesEnabled}
          sx={(theme) => {
            const baseKey = recipesDisabledWarningForBuilder ? 'error' : 'success'
            const baseVars = recipesDisabledWarningForBuilder ? theme.vars?.palette.error : theme.vars?.palette.success
            const baseRaw  = recipesDisabledWarningForBuilder ? theme.palette.error : theme.palette.success
            const mainColor      = baseVars?.main ?? baseRaw.main
            const darkColor      = baseVars?.dark ?? baseRaw.dark
            const contrastText   = baseVars?.contrastText ?? baseRaw.contrastText
            return {
              height: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
              px: 1.25,
              lineHeight: 1,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              borderColor: mainColor,
              color: mainColor,
              '&.Mui-selected': {
                color: contrastText,
                backgroundColor: mainColor,
                '&:hover': { backgroundColor: darkColor },
              },
              '&:hover': {
                borderColor: darkColor,
                backgroundColor: `rgba(var(--mui-palette-${baseKey}-mainChannel) / 0.08)`,
              },
            }
          }}
        >
          <EllipsisTooltip title={t('recipesToggleLabel')} selector="[data-ellipsis-target]" wrap="block">
            <Box component="span" data-ellipsis-target sx={ELLIPSIS_BUTTON_LABEL_SX}>
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
              if (recordFinalSellEasterEggClick('pong')) setPongOpen(true)
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
              borderColor: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
              color: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
              '&.Mui-selected': {
                color: (theme.vars?.palette.warning.contrastText ?? theme.palette.warning.contrastText),
                backgroundColor: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                '&:hover': { backgroundColor: (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark) },
              },
              '&:hover': {
                borderColor: (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark),
                backgroundColor: TINT.warningBgFaint,
              },
            })}
          >
            <EllipsisTooltip title={t('finalSellToggleLabel')} selector="[data-ellipsis-target]" wrap="block">
              <Box component="span" data-ellipsis-target sx={ELLIPSIS_BUTTON_LABEL_SX}>
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
              // Left corners stay at 0 (joined to ToggleButton); right corners use theme.
              borderRadius: `0 ${theme.shape.borderRadius}px ${theme.shape.borderRadius}px 0`,
              border: `1px solid ${(theme.vars?.palette.warning.main ?? theme.palette.warning.main)}`,
              color: (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
              '&:hover': {
                borderColor: (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark),
                backgroundColor: TINT.warningBgFaint,
                color: (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark),
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
            const baseKey = safeguardsDisabledWarningForBuilder ? 'error' : 'success'
            const baseVars = safeguardsDisabledWarningForBuilder ? theme.vars?.palette.error : theme.vars?.palette.success
            const baseRaw  = safeguardsDisabledWarningForBuilder ? theme.palette.error : theme.palette.success
            const mainColor      = baseVars?.main ?? baseRaw.main
            const darkColor      = baseVars?.dark ?? baseRaw.dark
            const contrastText   = baseVars?.contrastText ?? baseRaw.contrastText
            return {
              height: SMALL_BUTTON_HEIGHT_PX,
              minHeight: SMALL_BUTTON_HEIGHT_PX,
              px: 1.25,
              lineHeight: 1,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              borderColor: mainColor,
              color: mainColor,
              '&.Mui-selected': {
                color: contrastText,
                backgroundColor: mainColor,
                '&:hover': { backgroundColor: darkColor },
              },
              '&:hover': {
                borderColor: darkColor,
                backgroundColor: `rgba(var(--mui-palette-${baseKey}-mainChannel) / 0.08)`,
              },
            }
          }}
        >
          <EllipsisTooltip title={t('safeguardsToggleLabel')} selector="[data-ellipsis-target]" wrap="block">
            <Box component="span" data-ellipsis-target sx={ELLIPSIS_BUTTON_LABEL_SX}>
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

  // Safeguard chip label: "N rules" or "X of N rules" when some are selected.
  const safeguardChipLabel = (() => {
    const n = safeguardRules.length
    const word = n === 1 ? t('safeguardOne') : t('safeguardMany')
    const sel = selectedSafeguardRuleIndices.length
    if (sel >= 2 && sel < n) return t('recipesSelectedCount', { selected: sel, total: n, word })
    return `${n} ${word}`
  })()

  // Single assembly of the mutable slices that define the current setup, so the
  // preset-nudge check and the simple-mode preset match canonicalize identical
  // fields (SSOT — avoids the two call sites drifting).
  const currentSfcFields = useMemo<SfcSetupFields>(() => ({
    metasets,
    substatTargets,
    recipes: customRecipes,
    finalSellRemainder,
    ...(sfcNote ? { note: sfcNote } : {}),
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
  }), [
    metasets,
    substatTargets,
    customRecipes,
    finalSellRemainder,
    sfcNote,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
  ])

  // Suppress the "load a preset" arrows when the current setup already matches a
  // bundled preset (ignoring dynamic overrides) — the nudge would be redundant.
  // Only computed while the nudge is active so the payload build stays off the
  // hot path for the common case.
  const sfcMatchesPreset = useMemo(() => {
    if (!tutorial.sfcLoadNudgeActive) return false
    return currentSfcMatchesAnyPreset(currentSfcFields)
  }, [tutorial.sfcLoadNudgeActive, currentSfcFields])

  // An express SFC counts as "empty" when it has no note and no custom recipes.
  // Emptiness alone does NOT decide custom-ness: an empty SAVED doc is the user's own
  // (custom) setup — e.g. a freshly created account — while an empty live doc WITHOUT
  // a saved doc is the transient fresh-start state that gets a preset loaded into it
  // (startup does this; handleGoSimple covers the in-session entry). The forbidden
  // state "preset selected but nothing loaded" must never exist.
  const sfcIsEmpty = !notePresent && customRecipes.length === 0

  // Which simple-mode preset the live SFC matches: 'beginner' | 'lategame' | null.
  // Gated on simple view so the ~400k canonicalization stays off the hot path in
  // normal/expert mode (mirrors the sfcMatchesPreset guard above). Empty is no match —
  // it is either a custom (empty saved) setup or about to receive a preset load; the
  // toggle resolves null to Custom-when-available, Midgame+ otherwise.
  const simplePresetMatch = useMemo<'beginner' | 'lategame' | null>(() => {
    if (!isSimpleView) return null
    if (sfcIsEmpty) return null
    return matchedPreset(currentSfcFields)
  }, [isSimpleView, sfcIsEmpty, currentSfcFields])

  // Entering simple view IN-SESSION (Go Simple). Startup entries load their content via
  // the express startup effect; this path must do the same when there is NOTHING yet —
  // an empty live doc with no saved doc gets the startup source loaded immediately, so
  // "Midgame+ selected but nothing loaded (empty note)" cannot exist. An existing saved
  // doc (even an empty one) is the user's own custom setup and stays untouched.
  const handleGoSimple = useCallback(() => {
    setExpertMode(false)
    persistSimpleExpertMode(false)
    stampSimpleExpertModeIntoAutosave(false)
    if (sfcIsEmpty && loadAutosave(AUTOSAVE_KEY) === null) {
      const source = resolveSimpleStartupSource()
      if (source.kind === 'preset') handleLoadSimplePreset(source.variant)
      else void loadSavedCustomSfc()
    }
  }, [setExpertMode, sfcIsEmpty, resolveSimpleStartupSource, handleLoadSimplePreset, loadSavedCustomSfc])

  // Shadow the current setup fields so the debounced autosave-build callback (defined
  // far above) can compute the preset-origin marker lazily — only when a write actually
  // fires (1s debounce), never on the render hot path.
  useLayoutEffect(() => { currentSfcFieldsRef.current = currentSfcFields })

  // Latch: once the live SFC is a real custom setup (non-preset, non-empty) in
  // simple view, the Old/Custom button stays available for the rest of the
  // session even after the user switches to a preset. Reset on entering expert.
  //
  // Seeded synchronously from autosave at startup: when express mode restores a
  // custom setup (resolveSimpleStartupSource → 'custom'), the live SFC won't
  // match a preset once it finishes loading, so the latch effect below WILL set
  // this true — but only after the async load + commit settles. Seeding it here
  // lets the toggle render 'custom' from the first paint instead of flashing the
  // 'lategame' fallback, which is especially visible in the embedded-window tool.
  const [customAvailable, setCustomAvailable] = useState(
    () => isSimpleViewAtStart && resolveSimpleStartupSource().kind === 'custom',
  )
  // The toggle selection the express startup restore is heading toward, resolved once
  // synchronously from autosave. Passed to NoteDialog so it can hold this value until
  // the (async) SFC load commits a live preset match — preventing the first-paint flash
  // of the 'lategame' fallback before a restored custom (or beginner) setup loads.
  const [simpleStartupSelection] = useState<'beginner' | 'lategame' | 'custom' | null>(() => {
    if (!isSimpleViewAtStart) return null
    const source = resolveSimpleStartupSource()
    return source.kind === 'custom' ? 'custom' : source.variant
  })
  // Snapshot of the latest custom SFC text so the Old/Custom button can restore
  // it after the user tries a preset. Same serialization as save/autosave so the
  // restored File round-trips byte-faithfully.
  const customSfcSnapshotRef = useRef<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect, react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state -- customAvailable is a *latching* derived signal: it must persist across renders after the source condition clears (user switches to a preset), so it cannot be pure-derived during render. The snapshot ref is updated alongside it. */
  // Detect a custom setup and refresh its snapshot whenever the live SFC is in a
  // custom state, so post-preset edits remain restorable.
  useEffect(() => {
    if (!isSimpleView) return
    if (simplePresetMatch !== null) return
    // Empty is custom ONLY when a saved doc exists (the user's own empty setup, e.g. a
    // fresh account). Empty WITHOUT a saved doc is the transient window while a preset
    // load is on its way — latching there would snapshot the void and hijack the
    // persisted variant. The autosave parse is trivial here (the doc is empty).
    if (sfcIsEmpty && loadAutosave(AUTOSAVE_KEY) === null) return
    // Serialize identically to sfcToBlob (JSON.stringify(payload, null, 2)). Shares the
    // document writer with "Save .sfc": the latch stands in for the user's whole custom
    // document, so it must carry exactly the same fields — overrides included.
    customSfcSnapshotRef.current = JSON.stringify(buildCurrentSfcPayload(), null, 2)
    setCustomAvailable(true)
    // A live custom setup (e.g. the user edited a preset) becomes the persisted
    // selection so a reload restores it rather than a preset.
    persistSimpleVariant('custom')
    // buildCurrentSfcPayload stands in for the whole document: its own memo lists every
    // field the snapshot serializes, so its identity changes exactly when the latch must
    // be re-taken. Listing those fields again here would be the same dependency twice.
  }, [
    isSimpleView,
    simplePresetMatch,
    sfcIsEmpty,
    buildCurrentSfcPayload,
  ])

  // Clear the latch and snapshot when leaving simple view (Go Expert / session
  // restart) so a fresh session starts without a stale Old/Custom button.
  useEffect(() => {
    if (expertMode || !isSimpleView) {
      setCustomAvailable(false)
      customSfcSnapshotRef.current = null
    }
  }, [expertMode, isSimpleView])
  /* eslint-enable react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect, react-you-might-not-need-an-effect/no-event-handler, react-you-might-not-need-an-effect/no-derived-state */

  // Restore the snapshotted custom SFC through the normal load path used by the
  // preset buttons, so it round-trips through parse/normalize identically.
  const handleLoadSimpleCustom = useCallback(() => {
    const text = customSfcSnapshotRef.current
    if (!text) return
    // Persist 'custom' so the next reload restores the custom SFC, not a preset.
    persistSimpleVariant('custom')
    const file = new File([text], 'custom.sfc', { type: 'application/json' })
    void handleManualFileSelection(file, { shiftKey: false })
  }, [handleManualFileSelection])

  // Serialize the current document exactly like "Save .sfc" (same writer, same formatting)
  // so the shift-switch merge carry round-trips through the regular parse/normalize path.
  const getAccountMergeSfcText = useCallback(
    () => JSON.stringify(buildCurrentSfcPayload(), null, 2),
    [buildCurrentSfcPayload],
  )

  // One switcher component, two mount points (header + simple Note dialog) so both entry
  // points share behavior; the compact variant only changes the button chrome.
  const accountSwitcherElement = <AccountSwitcher getMergeSfcText={getAccountMergeSfcText} flashSeq={accountPushFlashSeq} />
  const accountSwitcherCompactElement = <AccountSwitcher getMergeSfcText={getAccountMergeSfcText} flashSeq={accountPushFlashSeq} compact />

  // The theme popout, built here and handed to the simple Note dialog's title bar (same
  // node-prop pattern as the account switcher above). Simple mode hides the app header, so the
  // Note dialog title is that session's only route to theme settings — it mirrors Help/README,
  // where the very same component sits left of the language picker.
  const themeMenuElement = (
    <ThemeEditorMenu
      colorBlindMode={colorBlindMode}
      setColorBlindMode={setColorBlindMode}
      onOpenManageColors={openColors}
    />
  )

  // One-shot account-merge carry (shift-switch): taken from storage on mount — clearing it
  // immediately makes the flow crash-safe (a failed import never replays on the next launch).
  const [accountMergeCarry] = useState(takeAccountMergeCarry)
  const accountMergeCarryConsumedRef = useRef(false)
  /* eslint-disable react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect -- the carry is EXTERNAL state (localStorage written by the previous account's session before the reload); it can only be surfaced after the restore flow settles, which is inherently an effect, and the consumed-ref guarantees a single fire. */
  useEffect(() => {
    // Wait until the startup restore flow settles so the import applies to the target
    // account's restored document, then surface the carry through the existing
    // shift-import options dialog (selection + merge modes + metaset conflicts).
    if (!accountMergeCarry || accountMergeCarryConsumedRef.current || restoreDlgOpen) return
    accountMergeCarryConsumedRef.current = true
    // Failure-toast timer captured for cleanup; null when the carry parsed fine.
    let failureToastTimer: number | null = null
    try {
      // Same parser the file-import path uses — the carry is a regular .sfc text.
      const payload = parseSfcText(accountMergeCarry.sfcText, { metasets, substatTargets })
      setPendingSfcShiftDialogImport({
        fileName: t('accountMergeSourceLabel', { name: accountMergeCarry.fromDisplayName }),
        payload,
      })
    } catch {
      // Unreadable carry: report and continue — the target account is untouched. Deferred a
      // tick so the toast state flips outside this effect's synchronous commit.
      failureToastTimer = window.setTimeout(() => showToast(t('accountMergeCarryFailed'), { severity: 'error', icon: <ErrorOutlineIcon fontSize="inherit" /> }), 0)
    }
    return () => { if (failureToastTimer !== null) window.clearTimeout(failureToastTimer) }
  }, [accountMergeCarry, restoreDlgOpen, metasets, substatTargets, setPendingSfcShiftDialogImport, showToast, t])
  /* eslint-enable react-hooks/set-state-in-effect, @eslint-react/set-state-in-effect */

  // SFC load/save/copy controls surfaced at the top of the builder column.
  const headerActionsElement = (
    <HeaderActions
      onAboutToOpenSfc={() => {
        markSavedNow()
      }}
      onSelectFile={handleManualFileSelection}
      onSaveSfc={() => {
        persistRuntimeGearSetsNow()
        const blob = sfcToBlob(buildCurrentSfcPayload())
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = sfcFilename()
        a.click()
        URL.revokeObjectURL(url)
        showToast(t('toastRecipesSaved'))
        markSavedNow()
      }}
      onOpenNote={() => { notePresent ? openNoteViewerManual() : openNoteEditorManual() }}
      notePresent={notePresent}
      count={builderMode === 'safeguard' ? safeguardRules.length : customRecipes.length}
      selectedCount={builderMode === 'safeguard' ? selectedSafeguardRuleIndices.length : selectedRecipeIndices.length}
      visibleCount={builderMode === 'safeguard' ? safeguardRules.length : visibleRecipeCount}
      {...(builderMode === 'safeguard' ? {
        // Computed above as safeguardChipLabel to avoid an IIFE in JSX.
        chipLabel: safeguardChipLabel,
      } : {})}
      sfcDirty={isDirty}
      sfcDirtySince={sfcDirtySince}
      sfcLoadNudgeActive={tutorial.sfcLoadNudgeActive && !sfcMatchesPreset}
      sfcLoadNudgeFading={tutorial.sfcLoadNudgeFading}
      onSfcLoadNudgeDismiss={tutorial.clearSfcLoadNudge}
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
        setPendingSfcLoadImport(null)
        setConflictIds([])
      }}
      onChoose={(choice) => {
        try {
          if (pendingSfcLoadImport) {
            applySelectiveSfcLoad({
              fileName: pendingSfcLoadImport.fileName,
              payload: pendingSfcLoadImport.payload,
              selection: pendingSfcLoadImport.selection,
              modes: pendingSfcLoadImport.modes,
              metasetConflictStrategy: choice,
            })
            return
          }
          if (!pendingImport) {
            setMetasetConflictOpen(false)
            return
          }
          const prep = prepareSfcImport(metasets, pendingImport.metasets, pendingImport.recipes)
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
          const have = new Set(nextMetas.map((m) => m.name))
          const finalMetas = nextMetas.slice()
          for (const id of refIds) {
            if (!have.has(id)) {
              finalMetas.push({ name: id, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
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
          // Only apply when the clipboard source explicitly included the key (see PendingImport).
          const finalSellDescriptor = pendingImport.finalSellRemainder !== null
            ? applyFinalSellChange(pendingImport.finalSellRemainder, { mode: 'import', publish: false })
            : null
          const incomingNote = typeof pendingImport.note === 'string' ? pendingImport.note : null
          const shouldApplyNote = !normalizeNoteValue(sfcNote) && Boolean(normalizeNoteValue(incomingNote))
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
          // Only overwrite when the clipboard source explicitly included these keys.
          if (pendingImport.safeguardRules !== null) setSafeguardRules(pendingImport.safeguardRules)
          if (pendingImport.safeguardsEnabled !== null) setSafeguardsEnabled(pendingImport.safeguardsEnabled)
          setRecipesEnabled(pendingImport.recipesEnabled !== false)
        } finally {
          setMetasetConflictOpen(false)
          setPendingImport(null)
          setPendingSfcLoadImport(null)
          setConflictIds([])
        }
      }}
    />
  ) : null

  const sfcImportOptionsDialogElement = pendingSfcShiftDialogImport ? (
    <SfcImportOptionsDialog
      open={Boolean(pendingSfcShiftDialogImport)}
      fileName={pendingSfcShiftDialogImport.fileName}
      incomingRecipes={pendingSfcShiftDialogImport.payload.recipes}
      incomingNote={typeof pendingSfcShiftDialogImport.payload.note === 'string' ? pendingSfcShiftDialogImport.payload.note : null}
      incomingMetasets={pendingSfcShiftDialogImport.payload.metasets}
      incomingSafeguards={pendingSfcShiftDialogImport.payload.safeguardRules ?? []}
      onCancel={() => {
        setPendingSfcShiftDialogImport(null)
      }}
      onConfirm={(selection, modes) => {
        const pending = pendingSfcShiftDialogImport
        if (!pending) return
        const result = applySelectiveSfcLoad({
          fileName: pending.fileName,
          payload: pending.payload,
          selection,
          modes,
        })
        // Keep dialog closed after confirm even when conflict dialog opens next.
        // Why: conflict choice is the follow-up step for the same import action.
        setPendingSfcShiftDialogImport(null)
        if (!result.deferredConflict) {
          setPendingSfcLoadImport(null)
        }
      }}
    />
  ) : null

  // Manual paste dialog for SFC snippets.
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

  const runSellfileExportNow = useCallback(async (forceLocal = false, silent = false) => {
    // Default export always serializes the active in-app ruleset.
    // Dedupe-by-default is already applied in the pre-safeguard pipeline.
    // Built lazily via a memo: the SfcFileAsSellfile push path uploads the .sfc document
    // instead and must not pay to serialize an .hsf (multi-MB on large rule sets) it drops.
    let payloadCache: ReturnType<typeof buildExportPayload> | null = null
    const payloadOnce = () => (payloadCache ??= buildExportPayload())
    const filename = sellfileFilename()
    const outcomeToast = (successKey: 'toastSellfileSaved' | 'toastSellfilePushed') => {
      if (!silent) showToast(t(successKey))
    }
    // forceLocal bypasses the push path so the menu "Export to file" item always downloads.
    const target = forceLocal ? null : pushExportEndpoint
    if (target) {
      let pushToast: 'success' | 'failure'
      try {
        // Send the upload command using the shared endpoint compatibility shim.
        // Pass the object directly so the WS envelope serialises it inline — no double-encoding.
        // No Blob here: the push only needs the payload object + the shared content type;
        // materializing the download Blob would add a throwaway multi-MB pretty-print.
        // With the SfcFileAsSellfile capability the client wants the recipe DOCUMENT under
        // `uploadSfcFile` instead of the compiled sellfile — same resolver the background
        // push uses, so the two paths cannot disagree about what a client receives.
        const uploadTarget = resolveSellfileUploadTarget()
        const upload = uploadTarget.sfcDocument
          ? { fileName: sfcFilename(), contentType: SFC_EXPORT_CONTENT_TYPE, data: buildCurrentSfcPayload() }
          : { fileName: filename, contentType: HSF_EXPORT_CONTENT_TYPE, data: payloadOnce() }
        const response = await sendExternalRequest(uploadTarget.method, {
          // Account stamp first so a phase-2 Helper can save sellfiles per game account;
          // pre-stamping versions ignore the extra params (confirmed harmless).
          ...buildAccountRpcParams(),
          ...upload,
        })
        if (response.ok) {
          // A successful request proves endpoint reachability for later pushes.
          updatePushEndpointReachable(true)
          pushToast = 'success'
          // Record the success for the account menu's "Pushed <date>" summary line.
          markSellfileLastPushForAccount(getActiveAccount().id)
          setLastExportedHash(currentMergedRulesHash)
          // Notify the express-mode button so it plays its blink animation.
          if (silent) setAutoPushFlashSeq((s) => s + 1)
        } else {
          console.error(`${ts()} [push] endpoint error: ${JSON.stringify(response.error)}`)
          pushToast = 'failure'
        }
      } catch (err) {
        console.error(`${ts()} [push] WebSocket error: ${err instanceof Error ? err.message : String(err)}`)
        updatePushEndpointReachable(false)
        pushToast = 'failure'
      }
      if (pushToast === 'success') {
        // Push path: report the endpoint upload as a "push", not a file export.
        outcomeToast('toastSellfilePushed')
      } else {
        showToast(t('toastSellfilePushFailed'), { severity: 'error', icon: <ErrorOutlineIcon fontSize="inherit" /> })
      }
      return
    }
    // Local export path mirrors prior behavior and keeps push optional. The Blob is
    // built only on this branch (the push path above sends the payload object).
    const blob = hsfToBlob(payloadOnce())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setLastExportedHash(currentMergedRulesHash)
    outcomeToast('toastSellfileSaved')
  }, [
    buildExportPayload,
    buildCurrentSfcPayload,
    currentMergedRulesHash,
    pushExportEndpoint,
    sendExternalRequest,
    setAutoPushFlashSeq,
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
  // Silent variant used by auto-push — same logic but suppresses the success toast.
  const handleExportSellfileSilent = useCallback(() => {
    if (!exportRulesCountRef.current) return
    if (queueSellfileExportIfNeeded(true)) return
    void runSellfileExportNow(false, true)
  }, [queueSellfileExportIfNeeded, runSellfileExportNow])
  // Auto-push: fire on the rising edge of hsfDirty (or when autoPushEnabled turns on while already dirty).
  const prevHsfDirtyRef = useRef(false)
  const prevAutoPushRef = useRef(false)
  useEffect(() => {
    const wasDirty = prevHsfDirtyRef.current
    const wasAutoPush = prevAutoPushRef.current
    prevHsfDirtyRef.current = hsfDirty
    prevAutoPushRef.current = autoPushEnabled
    const shouldPush = autoPushEnabled && hsfDirty && !!pushExportEndpoint
    // Only act on state transitions to avoid repeated pushes while conditions hold.
    const justBecameDirty = hsfDirty && !wasDirty
    const justEnabledAutoPush = autoPushEnabled && !wasAutoPush
    // Rising-edge detection requires tracking prev values across renders; an event handler
    // cannot observe the transition from false→true without this effect pattern.
    // Single-owner gate (per account): with two tabs open each would otherwise auto-push
    // this tab's active account. Only the tab that owns THIS account's auto-push acts; a
    // second tab on the same account stands down (manual push and receiving data are
    // unaffected). The claim doubles as the owner's heartbeat. Evaluated inline so the push
    // call stays the last statement (the rising-edge effect pattern below).
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler
    if (shouldPush && (justBecameDirty || justEnabledAutoPush) && claimAutoPushOwnership(getActiveAccount().id)) {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state
      handleExportSellfileSilent()
    }
  }, [hsfDirty, autoPushEnabled, pushExportEndpoint, handleExportSellfileSilent])
  // Keep this tab's auto-push claim warm while the user is looking at it, so the tab in
  // focus stays the auto-push owner without a steady heartbeat (lazy by design — friendly
  // to background-tab freezing). Only refreshes an existing claim; never steals ownership.
  useEffect(() => {
    // Refresh only THIS tab's active-account claim (the account it foreground-owns); the
    // background service keeps its own accounts' claims warm as their packets arrive.
    const refresh = () => { if (document.visibilityState === 'visible') refreshAutoPushOwnershipIfOwner(getActiveAccount().id) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  // Secondary action: always triggers a local file download regardless of push endpoint.
  // Exposed via the split-button dropdown when an endpoint is active.
  const handleExportSellfileLocal = useCallback(() => {
    if (!exportRulesCountRef.current) return
    void runSellfileExportNow(true)
  }, [runSellfileExportNow])
  useEffect(() => {
    // No queued request means nothing to flush.
    if (!queuedSellfileExport) return
    // Worker still busy; wait for the next state change.
    if (isSellfileExportBlockedByWorker()) return
    // Run on the next frame so transition commits land before payload capture.
    const frameId = window.requestAnimationFrame(() => {
      if (isSellfileExportBlockedByWorker()) return
      // Capture toast intent before clearing so the export sees the correct flag.
      const wasSilent = queuedSellfileExport === 'silent'
      setQueuedSellfileExport(false)
      if (!exportRulesCountRef.current) return
      void runSellfileExportNow(false, wasSilent)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [
    isSellfileExportBlockedByWorker,
    queuedSellfileExport,
    runSellfileExportNow,
  ])

  // Suppress overlay during tutorial — drops are blocked so the overlay would be misleading.
  const dragOverlayVisible = fileDragActive && !tutorial.tutorialOpen && !confirmClearOpen && confirmDeleteIdx === null && confirmDeleteTargets === null

  // Display/callback props shared by every Gear Inspector grid instance (main preview +
  // gear-diff surfaces). Defined once so the diff modal/split-view reuse the same grid
  // wiring instead of forking it (SSOT). Surface-specific props (rows, selection, focus,
  // panel width, context groups) are passed per call site.
  const gearGridSharedProps = useMemo(() => ({
    substatColors,
    useStatButtonColors: colorStatTextsOn,
    // Colour-scope master toggle + colour-blind cycle now live in the central theme popout,
    // so the grid no longer receives those props here.
    recipeNames: gearInspectorRecipeNamesForGrid,
    recipeFgColors: gearInspectorRecipeFgColorsForGrid,
    onJumpToRule: handleGearInspectorRuleView,
    onJumpToRecipeMatch: handleGearInspectorRecipeMatchJump,
    onJumpToSafeguardRule: openLogicHubSafeguardRule,
    onCreateRuleTemplate: handleGearInspectorRuleTemplateCreate,
    grouping: gearInspectorSubstatSortPrefs.state.grouping,
    substatSort: gearInspectorSubstatSortSpec,
    sortState: gearInspectorSubstatSortPrefs.state,
    safeguardRules: resolvedSafeguardRules,
    improvementChanceByArtifactId,
    safeguardRankByArtifactId,
  }), [
    substatColors, colorStatTextsOn, gearInspectorRecipeNamesForGrid, gearInspectorRecipeFgColorsForGrid,
    handleGearInspectorRuleView, handleGearInspectorRecipeMatchJump, openLogicHubSafeguardRule, handleGearInspectorRuleTemplateCreate,
    gearInspectorSubstatSortPrefs.state, gearInspectorSubstatSortSpec, resolvedSafeguardRules,
    improvementChanceByArtifactId, safeguardRankByArtifactId,
  ])

  // Renders a reused Gear Inspector grid for a set of diff rows (modal + split-view).
  // The diff rows ARE GearInspectorPreviewRows (each carrying its baseline/current match),
  // so the same component renders them; the before/after panes convey the verdict through
  // each card's normal sell/keep styling.
  const renderGearDiffGrid = useCallback((
    diffRows: DiffRow[],
    opts?: {
      halfPaneColumns?: boolean
      collapsedGroups?: Set<string>
      onCollapsedGroupsChange?: React.Dispatch<React.SetStateAction<Set<string>>>
      showGroupDeltas?: boolean
      // "Before" pane: render the pinned-state rank chips + improvement chances instead of
      // the live ones, so each side of the split-view shows its own overlays. Falls back to
      // the live maps when nothing was captured (e.g. pinned before any safeguard ranks).
      useBaselineMaps?: boolean
    },
  ) => (
    <GearInspectorItemsGrid
      {...gearGridSharedProps}
      rows={diffRows}
      allRows={diffRows}
      halfPaneColumns={opts?.halfPaneColumns ?? false}
      showGroupDeltas={opts?.showGroupDeltas ?? false}
      // Per-pane overlay override: the before pane swaps in the baseline rank/improvement
      // maps (spread AFTER gearGridSharedProps so these win). The after pane keeps the live
      // maps already carried by gearGridSharedProps.
      {...(opts?.useBaselineMaps
        ? {
            safeguardRankByArtifactId: gearDiffCompare.baselineRankByArtifactId ?? gearGridSharedProps.safeguardRankByArtifactId,
            improvementChanceByArtifactId: gearDiffCompare.baselineImprovementByArtifactId ?? gearGridSharedProps.improvementChanceByArtifactId,
          }
        : {})}
      {...(opts?.collapsedGroups ? { collapsedGroups: opts.collapsedGroups } : {})}
      {...(opts?.onCollapsedGroupsChange ? { onCollapsedGroupsChange: opts.onCollapsedGroupsChange } : {})}
      // Gear selection works in diff mode when a push endpoint is connected. Both panes
      // share one selection set + handler, so selecting on either side selects on the other.
      gearSelectionEnabled={!!pushExportEndpoint}
      selectedGearItemIds={selectedGearItemIds}
      onGearItemsSelect={handleGearItemsSelect}
      hasGearInspectorData
      // Full right-panel width so the metrics hook can derive the half-pane column count
      // from the same source as the normal gear inspector (halved when halfPaneColumns=true).
      {...(isSideBySide ? { panelWidthPx: liveRightWidthPx ?? splitterRightPx } : {})}
    />
  ), [gearGridSharedProps, gearDiffCompare.baselineRankByArtifactId, gearDiffCompare.baselineImprovementByArtifactId, pushExportEndpoint, selectedGearItemIds, handleGearItemsSelect, isSideBySide, liveRightWidthPx, splitterRightPx])

  return (
    <SlotTintProvider scope={slotColorScope} tints={slotTints}>
    <RarityPaletteProvider scope={rarityColorScope} colors={rarityColors}>
    <StatColorProvider scope={statColorScope} substatColors={substatColors}>
    <Container maxWidth={false} disableGutters sx={{
      // No top padding of its own: #root already supplies APP_EDGE_GAP_PX on every edge, and
      // any extra here would make the top gap larger than the left/right/bottom ones.
      pt: 0,
      // In SBS the papers fill to the viewport bottom — no bottom padding so the
      // Container doesn't push content off-screen or leave a dark strip. Outside SBS the
      // bottom edge is likewise owned by #root's gap, so this stays 0 in both modes.
      pb: 0,
      // Flash-guard: mirror the SBS pb=0 before React state fires.
      [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: { pb: 0 },
    }}>
      {/* Full-screen, non-interactive overlay shown while dragging files over the app.
          We keep pointerEvents: 'none' so drops still reach the window handler. */}
      <FileDragOverlay active={dragOverlayVisible} />
      <GlobalStyles styles={(theme) => ({
        // Deliberately NO scrollbar-gutter:stable on html: the forced-SBS canvas and the 100vw
        // spans size against the FULL viewport width, so a permanently reserved gutter shrinks
        // clientWidth under them and the side-by-side clip below would then cut off their right
        // edge once the zoom applies.
        // Vertical scroll is OWNED BY #root (see below), so html/body never scroll —
        // pinning them keeps the app scrollbar off the true viewport edge and inside
        // the decorative gap instead.
        //
        // Horizontal is NOT clipped here. Outside side-by-side the app is a single column that can
        // legitimately be wider than a narrow window (e.g. the builder grid at its 220px-per-column
        // floor), and the user must be able to reach that content — #root below owns that scrollbar.
        // The clip is re-applied for side-by-side only (in the media block BELOW the #root rule —
        // it must come last to win on equal specificity), where the full-bleed 100vw header/canvas
        // spans include the scrollbar gutter and would otherwise let a momentary vertical scrollbar
        // spawn a spurious horizontal one. ('clip' forbids scrolling without creating a scroll
        // container, which 'hidden' would not.)
        html: {
          overflowY: 'hidden',
        },
        body: {
          overflowY: 'hidden',
        },
        // #root is the app's single vertical scroll container and carries the fixed
        // decorative edge gap. scrollbar-gutter:stable both-edges reserves symmetric
        // space on BOTH sides so the (virtually never shown) app scrollbar renders
        // inside the gap and never reflows content or breaks the left/right symmetry.
        // Reserving the gutter on #root is safe where reserving it on html was not:
        // the forced-SBS zoom math and the 100vw full-bleed spans size against
        // documentElement (html) clientWidth, NOT #root's, so shrinking #root's
        // content box here does not clip them. The padding + zoom scale together, so
        // the gap stays proportional to the shrunken canvas in forced side-by-side.
        '#root': {
          height: '100%',
          overflowY: 'auto',
          // 'auto' (not 'clip') outside side-by-side so content wider than a narrow window stays
          // reachable; the side-by-side block below restores the clip, where the full-bleed 100vw
          // spans would otherwise raise a spurious bar. See the html rules above.
          overflowX: 'auto',
          scrollbarGutter: 'stable both-edges',
          padding: `${APP_EDGE_GAP_PX}px`,
        },
        // Side-by-side only: re-apply the horizontal clip on html and #root. MUST stay AFTER the
        // base html/#root rules above — a media query adds no specificity, so declaring it earlier
        // would let the later `overflow-x: auto` win and the clip would never take effect.
        [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
          html: { overflowX: 'clip' },
          '#root': { overflowX: 'clip' },
        },
        '*, *::before, *::after': {
          scrollbarWidth: 'thin',
          // Thumb color: custom override (--app-scrollbar-thumb) falls back to the divider color.
          scrollbarColor: `var(--app-scrollbar-thumb, ${theme.vars?.palette.divider ?? theme.palette.divider}) transparent`,
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
        '::-webkit-scrollbar': {},
        '::-webkit-scrollbar-track': {
          backgroundColor: (theme.vars?.palette.background.paper ?? theme.palette.background.paper),
        },
        '::-webkit-scrollbar-thumb': {
          // Thumb color: custom override (--app-scrollbar-thumb) falls back to the divider color.
          backgroundColor: `var(--app-scrollbar-thumb, ${theme.vars?.palette.divider ?? theme.palette.divider})`,
          borderRadius: 8,
          border: `2px solid ${(theme.vars?.palette.background.paper ?? theme.palette.background.paper)}`,
        },
        '::-webkit-scrollbar-thumb:hover': {
          backgroundColor: (theme.vars?.palette.text.disabled ?? theme.palette.text.disabled),
        },
        'input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button': {
          WebkitAppearance: 'auto',
          margin: 0,
          opacity: 0.7,
          filter: 'none',
          // Invert the native spinner glyphs on dark surfaces.
          ...theme.applyStyles('dark', { filter: 'invert(0.8)' }),
        },
      })} />
      {/* Header: hidden in express simple mode — the dialog is the whole UI. */}
      <Box
        sx={{
          mb: 1,
          // Hide the full header when in express simple mode.
          ...(isSimpleView ? { display: 'none' } : {}),
          // Side-by-side: fill #root's (gap-inset) content box so the header spans the full
          // two-panel width WITHIN the app edge gap. Single-column: fill the Container width,
          // same as the BuilderColumn paper (which uses maxWidth:none / width:100%).
          // Forced mode: match the dynamic canvas width so the header spans exactly the two-panel
          // canvas (widens past the target when height drove the zoom, so no side bars).
          // Native mode uses 100% (not 100vw) so the full-bleed span stops at the edge gap
          // instead of reaching the true viewport edge and covering it.
          width: (isSideBySide || forceSideBySideLayout)
            ? (forceSideBySideLayout ? `${sideBySideCanvasWidthPx}px` : '100%')
            : '100%',
          maxWidth: 'none',
          mx: 0,
          ...(forceSideBySideLayout
            ? {
                // Forced canvas is a fixed px width centered in #root's content box, then zoomed.
                position: 'relative',
                left: '50%',
                transform: 'translateX(-50%)',
              }
            : {}),
          // Flash-guard: mirror the native side-by-side layout before React's state fires.
          [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
            width: '100%',
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
            maxWidth: 'none',
            ...(forceSideBySideLayout
              ? {
                  gridColumn: '1 / span 1',
                }
              : {}),
            [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
              // Span the full two-panel width so the right-aligned buttons reach the preview edge.
              gridColumn: '1 / span 1',
              maxWidth: 'none',
            },
          }}
        >
          {/* App title — shared component also used in HelpDialog */}
          <AppTitle />
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 1, flex: 1, flexWrap: 'nowrap' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25, minWidth: 0 }}>
              <Typography variant="caption" data-allow-select={1 as const} data-allow-context={1 as const} sx={{ color: 'text.disabled', fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.15, textAlign: 'right' }}>
                v{APP_VERSION} — © Nusi㊷ - 2026 — {t('appFooterBlurb')} Made by [STBL] Nusi㊷
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0, fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.15, textAlign: 'right' }}>
                {t('appFooterDisclaimer')}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0, fontSize: `${FONT_SIZE_HEADER_META_PX}px`, lineHeight: 1.15, textAlign: 'right' }}>
                Many thanks to [STBL] Nasgor for his invaluable contributions! — Remember: Bleibt Stabil!
              </Typography>
              {/* Update notice — animated entry/nag/exit handled inside the component */}
              {updateCheck.update && (
                <UpdateNoticeLine update={updateCheck.update} onDismiss={updateCheck.dismiss} />
              )}
            </Box>
            <Box sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 0.75 }}>
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
              {/* Account switcher — switch/create/manage accounts; shift-pick merges (see lib/accounts.ts) */}
              {accountSwitcherElement}
              {/* Connect to RSL Helper — persistent toggle with off/connecting/connected states */}
              <RslHelperConnectButton
                connectEnabled={rslHelperConnectEnabled}
                pushEndpointReachable={pushEndpointReachable}
                onToggleConnect={handleToggleRslHelperConnect}
              />
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Main panels: hidden in express simple mode — the note dialog is the whole UI. */}
      <Stack spacing={2} sx={isSimpleView ? { display: 'none' } : undefined}>
        {/* Layout container: stacks vertically in single-column mode, flex-row in side-by-side.
            In side-by-side, the GRID_COLUMN_GAP_PX gap is replaced by the SideBySideSplitter
            handle so the user can drag to resize both panels. */}
        <Box
          sx={{
            // Single-column mode: grid with spacing between stacked panels.
            display: isSideBySide ? 'flex' : 'grid',
            gap: isSideBySide ? 0 : 2,
            ...(isSideBySide && forceSideBySideLayout
              ? {
                  // Forced-zoom path: the canvas is rendered at sideBySideCanvasWidthPx and then
                  // scaled by the zoom. canvasWidthPx = (viewportW − 2·gap) / zoom, so after scaling
                  // it fills the gap-inset viewport exactly — target width when width is binding, and
                  // wider when height drove the zoom so the spare width is used instead of side bars.
                  // Centered in #root's content box (which the app edge gap already insets).
                  flexDirection: 'row',
                  // stretch so the splitter can fill the height of the taller panel.
                  alignItems: 'stretch',
                  position: 'relative',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: `${sideBySideCanvasWidthPx}px`,
                }
              : isSideBySide
                ? {
                    // Native side-by-side: fill #root's (gap-inset) content box. The panels stop at
                    // the app edge gap instead of the true viewport edge, so the decorative gap and
                    // the app scrollbar gutter stay clear on both sides.
                    flexDirection: 'row',
                    alignItems: 'stretch',
                    width: '100%',
                  }
                : {}),
            // Flash-guard media query mirrors the native fluid side-by-side layout for the
            // initial CSS paint before React's matchMedia state has had a chance to fire.
            [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'stretch',
              width: '100%',
            },
          }}
          ref={splitterContainerRef}
        >
        <BuilderColumn
          paperRef={leftPaperRef}
          sideBySideMinPaperHeightPx={sideBySideMinPaperHeightPx}
          forceSideBySide={forceSideBySideLayout}
          widthPx={isSideBySide ? splitterLeftPx : undefined}
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

        {/* Draggable splitter handle — always interactive in side-by-side mode.
            During drag, writes CSS vars directly to splitterContainerRef (no re-renders)
            and notifies onResizeLive so the column count updates without waiting for mouseup. */}
        {isSideBySide && (
          <SideBySideSplitter
            ratio={splitterRatio}
            onResize={handleSplitterResize}
            onResizeLive={handleSplitterResizeLive}
            containerRef={splitterContainerRef}
            forceSideBySide={forceSideBySideLayout}
            interactive
          />
        )}

        <Paper ref={previewPaperRef} sx={{
          p: PREVIEW_PAPER_PADDING_UNITS,
          position: 'relative',
          // In side-by-side, width tracks the CSS variable written by the splitter during drag.
          // splitterRightPx (the committed JS value) is the var's fallback for the single
          // re-render after mouseup and for non-side-by-side mode.
          width: isSideBySide
            ? `var(--splitter-right-width, ${splitterRightPx}px)`
            : (forceSideBySideLayout ? PANEL_WIDTH_PX : '100%'),
          // Always fill the available container — no maxWidth cap in single-column either.
          maxWidth: 'none',
          mx: 0,
          display: 'flex',
          flexDirection: 'column',
          height: previewPaperHeightStyle ?? 'auto',
          ...(previewPaperHeightStyle ? { minHeight: previewPaperHeightStyle } : {}),
          overflow: forceSideBySideLayout ? 'hidden' : undefined,
          // Border overrides: reduce visual "frame" on edges that should feel open.
          // SBS right panel — remove the rightmost and bottom edges; inner (left) border stays.
          // Non-SBS full-width — remove left/right edges.
          ...(isSideBySide || forceSideBySideLayout ? {
            borderRight: 'none',
            borderBottom: 'none',
          } : {
            borderLeft: 'none',
            borderRight: 'none',
          }),
          // Flash-guard media query: the CSS var may not be initialised yet on the first paint.
          // Use the var with a 50% fallback so the panel fills its half of the fluid container.
          [`@media ${SIDE_BY_SIDE_NATIVE_MEDIA_QUERY}`]: {
            mx: 0,
            width: `var(--splitter-right-width, 50%)`,
            height: previewPaperHeightStyle ?? 'auto',
            ...(previewPaperHeightStyle ? { minHeight: previewPaperHeightStyle } : {}),
            overflow: 'hidden',
            // Flash-guard fires in SBS — apply SBS border overrides here too.
            borderRight: 'none',
            borderBottom: 'none',
          }
        }} data-tour-id="preview.paper" data-gear-results-version={gearInspectorResultsVersion}>
          {/* Gold corner ornaments — the preview panel is a major work panel and wears the mark. */}
          <GoldCornerOrnaments />
          {/* Transparent top-75% overlay — tutorial can spotlight the mode toggle + gear grid
              without covering the full paper height. */}
          <Box
            data-tour-id="preview.paper-top"
            sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: '25%', pointerEvents: 'none', zIndex: 1 }}
          />
        <PreviewHeaderActions
        mergedCount={totalLimitHit ? Number.POSITIVE_INFINITY : mergedRules.length}
        {...(filterActive || gearInspectorRecipeFilterActive ? { filteredCount: totalLimitHit ? Number.POSITIVE_INFINITY : hsfRulesForTable.length } : {})}
        filterActive={previewFilterActive}
        filtersDirty={filtersDirty}
        filterOpen={filterOpen}
        building={rulesBuilding}
        gearInspectorBuilding={gearInspectorBuilding}
        workloadProgressRatio={workloadProgressRatio}
        limitHit={totalLimitHit}
        gearInspectorOutcomeSummary={gearInspectorOutcomeSummaryForDiff ?? gearInspectorOutcomeSummaryForPreview}
        gearInspectorOutcomeSummaryTotal={gearInspectorOutcomeSummary}
        onToggleFilter={() => setFilterOpen((v) => !v)}
        onClearFilters={clearFilters}
        onSelectFile={handleManualFileSelection}
        onClearBase={() => setHsf(null)}
        {...(hsf ? { baseRuleCount: hsf.Rules.length } : {})}
        {...(pushExportEndpoint ? { pushEndpoint: pushExportEndpoint } : {})}
        hsfDirty={hsfDirty}
        hsfDirtySince={hsfDirtySince}
        dedupeDefault={dedupeDefault}
        onToggleDedupeDefault={handleSetDedupeDefault}
        omitDisabledForExport={omitDisabledForExport}
        onToggleOmitDisabled={handleSetOmitDisabled}
        autoPushEnabled={autoPushEnabled}
        onToggleAutoPush={setAutoPushEnabled}
        onExport={handleExportSellfile}
        onExportLocal={handleExportSellfileLocal}
        exportDisabled={!mergedRules.length}
        previewMode={previewMode}
        onChangePreviewMode={setPreviewMode}
	        gearInspectorSubstatSort={gearInspectorSubstatSortPrefs.state}
	        useStatButtonColors={colorStatTextsOn}
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
          onUnapplyFilterPreset={handleUnapplyFilterPreset}
          isFilterPresetApplicable={isFilterPresetApplicable}
          onDeleteFilterPreset={handleDeleteFilterPreset}
          onMoveFilterPreset={handleMoveFilterPreset}
          onHideFilterPreset={handleHideFilterPreset}
          onTogglePinFilterPreset={handleTogglePinFilterPreset}
          isFilterPresetApplied={isFilterPresetApplied}
          sortPresets={sortPresets}
          onSaveSortPreset={handleSaveSortPreset}
          onApplySortPreset={handleApplySortPreset}
          onUnapplySortPreset={handleUnapplySortPreset}
          onDeleteSortPreset={handleDeleteSortPreset}
          onMoveSortPreset={handleMoveSortPreset}
          onHideSortPreset={handleHideSortPreset}
          onTogglePinSortPreset={handleTogglePinSortPreset}
          isSortPresetApplied={isSortPresetApplied}
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
        pauseEndpointUpdates={pauseEndpointUpdates}
        onTogglePauseEndpointUpdates={togglePauseEndpointUpdates}
        diffModeActive={gearDiffSplitOpen}
        diffAutoMode={gearDiffAutoMode}
        onToggleDiffMode={handleToggleGearDiffMode}
        onSetDiffReference={handleSetGearDiffReference}
        onToggleDiffAuto={handleToggleGearDiffAuto}
        diffChipMode={gearDiffChipMode}
        onChangeDiffChipMode={handleChangeDiffChipMode}
        diffFilterMode={gearDiffFilterMode}
        onChangeDiffFilterMode={handleChangeDiffFilterMode}
        diffDelta={gearDiffDisplayDelta}
        diffReferencePulsing={gearDiffReferencePulsing}
        // Passed as a slot so the filter panel shares the header control row's horizontal
        // scroll region (one combined scrollbar) and the export action group stays pinned.
        filterPanelSlot={filterOpen ? (
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
              useStatButtonColors={colorStatTextsOn}
              hasManualGearInspectorItems={hasManualGearInspectorRows}
              combinedScroll
            />
          ) : null}
      />
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
              {gearDiffSplitOpen ? (
                // Diff mode: replace the single grid with the before/after split-view.
                <GearDiffSplitView
                  diffRows={gearDiffFilteredRows}
                  renderGrid={renderGearDiffGrid}
                />
              ) : (
                <GearInspectorItemsGrid
                  {...gearGridSharedProps}
                  rows={gearEntriesForTable}
                  allRows={gearInspectorPreviewRows}
                  filterActive={gearInspectorFilterActive || gearInspectorRecipeFilterActive}
                  focusArtifactRequest={gearInspectorArtifactFocusRequest}
                  onFocusArtifactFilteredOut={handleGearInspectorFocusArtifactFilteredOut}
                  suppressMatchDetails={suppressGearInspectorMatchDetails}
                  contextGroupById={gearInspectorContextGroupById}
                  emptyStateVerticalAlign={emptyStateVerticalAlign}
                  enterKey={gearInspectorEnterKey}
                  scrollRestoreToken={endpointScrollRestoreToken}
                  gearSelectionEnabled={!!pushExportEndpoint}
                  selectedGearItemIds={selectedGearItemIds}
                  onGearItemsSelect={handleGearItemsSelect}
                  {...(isSideBySide ? { panelWidthPx: liveRightWidthPx ?? splitterRightPx } : {})}
                />
              )}
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
                recipeFgColors={recipeFgColorsForGrid}
                onHoverChipTarget={setChipHover}
                selectedRecipeIdx={previewSelectedRecipeIdx}
                selectedSafeguardOrdinal={previewSelectedSafeguardOrdinal}
                multiselectActive={multiselectActive}
                selectionScrollRequest={selectionScrollRequest}
                isSideBySide={isSideBySide}
                emptyStateVerticalAlign={emptyStateVerticalAlign}
                focusRuleIndex={focusRuleIndex}
                onFocusRuleSettled={handleFocusRuleSettled}
                onSelectRecipeIdx={handleRulesTableSelectRecipeIdx}
                onSelectSafeguardRule={handleSafeguardPreviewStarSelect}
                onActivateRuleRow={handleActivateRuleRow}
                emptyDueToFilter={hsfTableEmptyDueToFilters}
                limitExceeded={limitExceeded}
                onRecipeAction={handleRulesTableRecipeAction}
                onClearBase={handleRulesTableClearBase}
                onConfigureFinalSell={handleRulesTableEditFinalSell}
                substatColors={substatColors}
              />
            </Box>
          </Box>
        </Paper>
        </Box>

      </Stack>

      {/* Psychedelic animation — always mounted so it runs regardless of which dialogs are open. */}
      <PsychedelicEffect />
      {/* Help / README dialog. Marks the version as seen when closed. */}
      {tutorial.helpOpen ? (
        <HelpDialog
          open={tutorial.helpOpen}
          firstRunMode={tutorial.helpFirstRunMode}
          onClose={() => {
            // First-run dismissal without tutorial → nudge the Load SFC button.
            if (tutorial.helpFirstRunMode) tutorial.triggerSfcLoadNudge()
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
          connectEnabled={rslHelperConnectEnabled}
          pushEndpointReachable={pushEndpointReachable}
          onToggleConnect={handleToggleRslHelperConnect}
          colorBlindMode={colorBlindMode}
          setColorBlindMode={setColorBlindMode}
          onOpenManageColors={openColors}
        />
      ) : null}
      {/* Only mount the Note dialog when visible so recipe chip previews stay out of the tree. */}
      {noteOpen ? (
        <NoteDialog
          mode={noteMode}
          note={sfcNote ?? ''}
          onChange={(value, options) => {
            const mode: NoteDescriptorMode = options?.mode === 'clear' ? 'clear' : 'edit'
            applyNoteChange(value, { mode })
          }}
          onClose={handleCloseNote}
          onRequestEdit={openNoteEditorManual}
          onRequestView={openNoteViewerManual}
          recipeOverridesAnswers={noteRecipeOverridesAnswers}
          onRecipeOverridesAnswersChange={setNoteRecipeOverridesAnswers}
          noteOverridesDisabled={noteOverridesDisabled}
          onNoteOverridesDisabledChange={setNoteOverridesDisabled}
          // Apply recipe overrides instructions to stored recipes when requested by the note dialog.
          onApplyRecipeOverrides={applyRecipeOverridesToRecipes}
          // Apply display safeguard rules (overrides applied) back to stored rules when requested.
          onApplySafeguardOverrides={applySafeguardOverridesToRules}
          // Safeguard overrides answers live in app state; the SFC writer persists them on save.
          safeguardOverridesAnswers={noteSafeguardOverridesAnswers}
          onSafeguardOverridesAnswersChange={setNoteSafeguardOverridesAnswers}
          onSafeguardOverridesResolutionChange={handleSafeguardOverridesResolutionChange}
          // Use recipe-overrides-resolved recipes so note chips mirror current answers.
          recipes={recipeOverridesRecipesForRules}
          metasets={metasets}
          safeguardRules={safeguardRules}
          useStatButtonColors={colorStatTextsOn}
          substatColors={substatColors}
          gearSummary={gearInspectorOutcomeSummary}
          summaryProgressRatio={workloadProgressRatio}
          hideEditButton={noteAutoOpenedFromSfc}
          rules={mergedRules}
          substatTargets={effectiveSubstatTargets}
          simpleMode={simpleMode}
          expertMode={expertMode}
          onGoExpert={() => { setExpertMode(true); persistSimpleExpertMode(true); stampSimpleExpertModeIntoAutosave(true) }}
          onGoSimple={handleGoSimple}
          autoPushExpressEnabled={autoPushEnabled}
          onToggleAutoPushExpress={setAutoPushEnabled}
          autoPushFlashSeq={autoPushFlashSeq}
          autoPushLastPushAt={activeAccountLastPushAt}
          rslHelperConnectEnabled={rslHelperConnectEnabled}
          pushEndpointReachable={pushEndpointReachable}
          onToggleRslHelperConnect={handleToggleRslHelperConnect}
          accountSwitcherNode={accountSwitcherCompactElement}
          themeMenuNode={themeMenuElement}
          onLoadSimplePreset={handleLoadSimplePreset}
          simplePresetMatch={simplePresetMatch}
          simpleCustomAvailable={customAvailable}
          onLoadSimpleCustom={handleLoadSimpleCustom}
          simpleStartupSelection={simpleStartupSelection}
          {...(noteDrawerWidthPx != null ? { drawerWidthPx: noteDrawerWidthPx } : {})}
          {...(noteDrawerTopPx != null ? { drawerTopPx: noteDrawerTopPx } : {})}
          {...(noteDrawerLeftPx != null ? { drawerLeftPx: noteDrawerLeftPx } : {})}
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
          {gearDbCommandToast.diff
            ? (
              // Diff/update toasts render the shared GearDiffPreview directly (no Alert
              // chrome) so the toast, history tooltip, and history flyout are one card.
              // Clip mode keeps the transient toast from stealing the scroll wheel; a click
              // dismisses it (replacing the removed Alert close button) alongside auto-hide.
              <Box
                onClick={dismissGearDbCommandToast}
                sx={{ minWidth: 320, maxWidth: 560, cursor: 'pointer' }}
              >
                <GearDiffPreview
                  payload={gearDbCommandToast.diff}
                  substatColors={substatColors}
                  useStatButtonColors={colorStatTextsOn}
                  scrollMode="clip"
                />
              </Box>
            )
            : (
              // Error / plain-text toasts keep the filled severity Alert (icon + close).
              <Alert
                icon={gearDbCommandToast.severity === 'success' ? <StorageIcon fontSize="inherit" /> : <ErrorOutlineIcon fontSize="inherit" />}
                severity={gearDbCommandToast.severity}
                variant="filled"
                onClose={dismissGearDbCommandToast}
                sx={{
                  alignItems: 'center',
                  fontSize: Math.max(12, FONT_SIZE_BASE_PX - 2),
                  lineHeight: 1.35,
                  px: 1.75,
                  py: 1,
                  minWidth: 240,
                  maxWidth: 560,
                  whiteSpace: 'pre-line',
                  // Clip overwide content instead of rendering a horizontal scrollbar.
                  overflowX: 'hidden',
                }}
              >
                {gearDbCommandToast.message}
              </Alert>
            )}
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
        deleteSafeguardIdx={confirmDeleteSafeguardIdx}
        setDeleteSafeguardIdx={setConfirmDeleteSafeguardIdx}
        onConfirmDeleteSafeguard={handleConfirmDeleteSafeguard}
        deleteSafeguardMultiTargets={confirmDeleteSafeguardTargets}
        setDeleteSafeguardMultiTargets={setConfirmDeleteSafeguardTargets}
        onConfirmDeleteSafeguardMulti={confirmDeleteSafeguardMultiDialog}
        clearHistoryOpen={confirmClearHistoryOpen}
        setClearHistoryOpen={setConfirmClearHistoryOpen}
        onConfirmClearHistory={handleConfirmClearHistory}
      />
      {sfcImportOptionsDialogElement}
      {/* Restore autosaved SFC dialog */}
      {restoreDlgOpen ? (
        <RestoreAutosaveDialog
          open={restoreDlgOpen}
          draft={restoreDraft}
          gearInspectorDraft={gearInspectorRestoreDraft ? { count: gearInspectorRestoreDraft.count, savedAt: gearInspectorRestoreDraft.savedAt } : null}
          // Once the background endpoint data lands the snapshot offer is superseded.
          // Keep the row visible but disabled so the dialog doesn't resize and the
          // user can't accidentally click through to dismiss it (see the prop docs).
          gearInspectorDisabled={endpointGearDataApplied}
          storedGearSetsCount={storedRuntimeGearSetCount}
          metasetsDiffer={restoreMetasetsDiffer}
          targetsDiffer={restoreTargetsDiffer}
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
              || (selection.gearInspector && gearInspectorRestoreDraft)
            )
            if (shouldResetGearInspectorMatches) beginGearInspectorMatchReset('restore')
            const selectionKeys = Object.entries(selection).filter(([, value]) => value)
            if (selectionKeys.length > 0) {
              const autosaveDescriptor = createAutosaveRestoredDescriptor({
                version: typeof draft?.Version === 'string' ? draft.Version : null,
                savedAt: typeof draft?.AutosaveSavedAt === 'string'
                  ? draft.AutosaveSavedAt
                  : (selection.gearInspector && gearInspectorRestoreDraft?.savedAt ? gearInspectorRestoreDraft.savedAt : null),
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
                const prunedRecipeAnswers = pruneNoteRecipeOverridesAnswers(restoredNote, restoredAnswers)
                setNoteRecipeOverridesAnswers(prunedRecipeAnswers)
                const restoredSafeguardAnswers = draft.NoteSafeguardOverridesAnswers ?? {}
                const prunedSafeguardAnswers = pruneNoteSafeguardOverridesAnswers(restoredNote, restoredSafeguardAnswers)
                // Re-seed any forced safeguard sliders the saved draft is MISSING — exactly as the
                // import path does. A draft saved before the seed fix (or while overrides were
                // disabled/cleared) carries an empty/partial NoteSafeguardOverridesAnswers; without
                // this, restore reinstates those gaps and the forced sliders fall back to their own
                // `default=` instead of the restored recipe mode's authored values. The seed resolves
                // forces from the RESTORED recipe selection (so a saved `endgame` keeps endgame's
                // forces, not lategame's) and its no-clobber design preserves every saved slider edit.
                setNoteSafeguardOverridesAnswers(
                  seedSafeguardAnswersFromRecipeDefaults(restoredNote, prunedRecipeAnswers, prunedSafeguardAnswers),
                )
                setNoteOverridesDisabled(Boolean(draft.NoteRecipeOverridesDisabled))
              }
              // Filter/sort/collapse view state is ephemeral and no longer restored — the
              // "View, Filter & Sort" restore unit was removed. Legacy drafts may still carry
              // `Filters`/`GearInspectorSort`; they are simply ignored here.
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
              // getAllKnownArtifactSetIds already includes ACCESSORY_NO_SET_ID (-99).
              const bakedInSetIdSet = selection.gearSets
                ? null
                : new Set<number>([
                  ...getAllKnownArtifactSetIds().map((id) => Number(id)),
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
              // Apply FinalSell when restoring either recipes or safeguards — it is shared config
              // ("what to sell from everything remaining after your rules") and must be restored
              // even in safeguards-only sessions where the user has no recipes to restore.
              if ((selection.recipes || selection.safeguards) && draft.FinalSellRemainder && typeof draft.FinalSellRemainder === 'object') {
                try {
                  applyFinalSellChange(draft.FinalSellRemainder as FinalSellRemainderConfig, { publish: false })
                } catch {}
              }
              if (selection.recipes && Array.isArray(draft.Recipes)) {
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
            // The Gear Inspector checkbox restores the endpoint/imported draft only —
            // custom ("manual") pieces load from their own key into the initial item state
            // (see the gearInspectorItems initializer), independent of this dialog. Append
            // the endpoint draft onto the live items (which already hold the seeded custom
            // gear) so the restore never wipes them; de-dup by itemId guards a double apply.
            if (selection.gearInspector && gearInspectorRestoreDraft && !endpointGearDataApplied) {
              const liveIds = new Set(gearInspectorItemsRef.current.map((item) => item.itemId))
              const endpointAdditions = gearInspectorRestoreDraft.items.filter((item) => !liveIds.has(item.itemId))
              const restoredItems = [...endpointAdditions, ...gearInspectorItemsRef.current]
              // Restores can include large Gear Inspector payloads; commit non-urgently like imports.
              setGearInspectorItemsTransition(restoredItems)
              // Keep the descending allocator cursor below every restored custom id (SSOT helper).
              gearInspectorItemIdRef.current = reseedGearInspectorCustomIdCursor(
                gearInspectorItemIdRef.current,
                restoredItems,
              )
            }
            const savedAutosaveTab = draft?.LogicHubDialogTab as LogicHubDialogTab | undefined
            if (savedAutosaveTab) {
              // Clamp unknown values back to the default tab so corrupted autosave payloads stay recoverable.
              const normalizedTab = LOGIC_HUB_DIALOG_TABS.includes(savedAutosaveTab)
                ? savedAutosaveTab
                : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
              setLogicHubDialogTab(normalizedTab)
            }
            // SafeguardsGridFilterMode is ephemeral view state now — not restored (legacy
            // drafts may still carry it; ignored).
            if (selection.safeguards) {
              if (Array.isArray(draft?.Safeguards)) setSafeguardRules(draft.Safeguards)
              if (typeof draft?.SafeguardsEnabled === 'boolean') setSafeguardsEnabled(Boolean(draft.SafeguardsEnabled))
              if (typeof draft?.RecipesEnabled === 'boolean') setRecipesEnabled(draft.RecipesEnabled !== false)
              // Restore safeguard selection only when the referenced index is in bounds.
              const sgSelIdx = draft?.SelectedSafeguardRuleIdx
              const restoredRules = Array.isArray(draft?.Safeguards) ? draft.Safeguards : []
              if (typeof sgSelIdx === 'number' && sgSelIdx >= 0 && sgSelIdx < restoredRules.length) {
                // Mirror syncSelectedRecipeIdx: flush any pending builder edits before changing
                // the selection, so in-progress changes are not silently discarded.
                safeguardAutoApplyNowRef.current()
                setSelectedSafeguardRuleIdx(sgSelIdx)
                // Collapse multi-select to this rule so the chip highlights correctly.
                // setSelectedSafeguardRuleIdx alone updates the external scalar but not the
                // internal selectedIndices array inside the selection hook.
                setSelectedSafeguardRuleIndices([sgSelIdx], { suppressWillChange: true })
                const selRule = restoredRules[sgSelIdx]
                if (selRule) setSafeguardBuilder(selRule)
                // Scroll HsfRulesTable to the restored safeguard row (1-based ordinal).
                requestSelectionScroll(SELECTION_SCROLL_SOURCE_USER, null, sgSelIdx + 1)
              }
            }
            // Clear dirty markers after restore: markNextSnapshotAsSaved anchors the upcoming
            // history snapshot as saved; rAF markSavedNow is a safety net for the edge case where
            // the effect fires without a new entry. setLastExportedHash(null) + setExportBaselineResetPending(true)
            // reset the HSF export baseline. Do NOT call markSavedNow() synchronously — it clears
            // markNextAsSavedRef immediately, defeating markNextSnapshotAsSaved.
            markNextSnapshotAsSaved()
            setLastExportedHash(null)
            setExportBaselineResetPending(true)
            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
              window.requestAnimationFrame(() => { markSavedNow() })
            } else {
              setTimeout(() => { markSavedNow() }, 0)
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
          slotTints={slotTints}
          setSlotTints={setSlotTints}
          rarityColors={rarityColors}
          setRarityColors={setRarityColors}
          statColorScope={statColorScope}
          setStatColorScope={setStatColorScope}
          rarityColorScope={rarityColorScope}
          setRarityColorScope={setRarityColorScope}
          slotColorScope={slotColorScope}
          setSlotColorScope={setSlotColorScope}
          onReset={() => {
            resetColors()
            setSlotTints(DEFAULT_SLOT_TINTS)
            setRarityColors(DEFAULT_RARITY_COLORS)
            // Also restore the per-group scopes to their factory defaults (v1.0.26 effective look).
            setStatColorScope(DEFAULT_STAT_COLOR_SCOPE)
            setRarityColorScope(DEFAULT_RARITY_COLOR_SCOPE)
            setSlotColorScope(DEFAULT_SLOT_COLOR_SCOPE)
          }}
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
          useStatButtonColors={colorStatTextsOn}
          onJumpToRule={handleGearInspectorRuleView}
          customRecipes={customRecipes}
          gearInspectorItems={gearInspectorItems}
          setGearInspectorItems={setGearInspectorItemsTransition}
          allocGearInspectorItemId={allocGearInspectorItemId}
          gearInspectorMatches={gearInspectorMatchesByItemId}
          onResetGearInspector={handleResetGearInspectorItems}
          gearInspectorPreviewRows={gearInspectorPreviewRows}
          improvementChanceByArtifactId={improvementChanceByArtifactId}
          onApplyGearAnalyticsFilter={handleApplyGearAnalyticsFilter}
          gearInspectorDim={gearInspectorDimForAnalytics}
          rules={mergedRules}
          substatTargets={substatTargets}
          effectiveSubstatTargets={effectiveSubstatTargets}
          onSubstatTargetsChange={(m, opts) => { applySubstatTargetsChange(m, opts) }}
          recipeOverridesActive={substatTargetsOverridesActive}
          emptyStateVerticalAlign={emptyStateVerticalAlign}
          // Shared selection: Gear Analytics' Not-Fully-Equipped grid can click-toggle the
          // same artifact-id set the Gear Inspector reads (and which optionally syncs to the
          // WebSocket push endpoint via handleGearItemsSelect).
          selectedGearItemIds={selectedGearItemIds}
          onGearItemsSelect={handleGearItemsSelect}
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
      {/* Easter egg: Pong flyout — opened by 10 rapid clicks on the Final Sell toggle button */}
      {pongOpen && <PongFlyout onClose={() => setPongOpen(false)} />}
      {/* Easter egg: Sellfall flyout — opened by 10 rapid clicks on the Recipes toggle button */}
      {sellfallOpen && <SellfallFlyout onClose={() => setSellfallOpen(false)} />}
    </Container>
    </StatColorProvider>
    </RarityPaletteProvider>
    </SlotTintProvider>
  )
}
