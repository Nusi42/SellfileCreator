/**
 * useAutosaveRestore
 *
 * Encapsulates autosave restore prompt and enablement logic. Keeps the
 * previous autosave intact until the user either restores it or makes a
 * change after dismissing. Exposes dialog state and whether autosave is
 * currently enabled.
 */
import { useMemo, useState } from 'react'
import { loadAutosave, removeAutosave } from '../lib/autosave'
import { parseSfcObject } from '../lib/sfcIO'
import { presetDraftFields, type PresetVariant } from '../lib/sfcPresetMatch'
import { AUTOSAVE_PRESET_ORIGIN_KEY } from '../lib/externalWsProtocol'
import { getPersistedRuntimeGearSetNameMap } from '../lib/gearSets/runtimeStore'
import { normalizeMetasetIconId } from '../lib/metasetIcons'
import type { SubstatTargetTable, BuilderRecipe } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { LogicHubDialogTab, FinalSellRemainderConfig } from '../lib/logicHub'
import { LOGIC_HUB_DIALOG_TAB_FINAL_SELL, LOGIC_HUB_DIALOG_TABS } from '../lib/logicHub'
import type { RulesFilterState } from '../lib/rulesFilter'
import { canonicalize } from '../lib/canonicalize'
// These two type-only imports back the AutosaveFilterView/AutosaveFiltersState shapes,
// which App.tsx still constructs for its live filter snapshot. Filter/sort view state is
// no longer restored, but the shared shape stays exported here as its single definition.
import {
  type RulesFilterPreviewMode,
  type CollapsedSections,
} from '../state/rulesFilterPersistence'
import type { GearInspectorRecipeFilterMode } from '../types/gearInspectorRecipeFilterMode'
import type { SafeguardRule } from '../lib/safeguards'
import {
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY,
  type NoteRecipeOverridesAnswers,
} from '../lib/noteRecipeOverrides'
import {
  NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY,
  type NoteSafeguardOverridesAnswers,
} from '../lib/noteSafeguardOverrides'
import type { BuilderPanelCollapsedSections } from '../state/builderPreferences'

export type RestoreDraft = {
  Version?: string
  Metasets?: Metaset[]
  substatTargets?: SubstatTargetTable
  Recipes?: BuilderRecipe[]
  FinalSellRemainder?: FinalSellRemainderConfig
  Safeguards?: SafeguardRule[]
  SafeguardsEnabled?: boolean
  RecipesEnabled?: boolean
  SelectedRecipeIndex?: number
  SelectedSafeguardRuleIdx?: number
  Note?: string
  NoteRecipeOverridesAnswers?: NoteRecipeOverridesAnswers
  NoteRecipeOverridesDisabled?: boolean
  NoteSafeguardOverridesAnswers?: NoteSafeguardOverridesAnswers
  AutosaveSavedAt?: string
  LogicHubDialogTab?: LogicHubDialogTab
}

export type AutosaveFilterView = {
  open: boolean
  state: RulesFilterState
  collapsed: CollapsedSections
}

export type AutosaveFiltersState = {
  activeMode: RulesFilterPreviewMode
  views: Record<RulesFilterPreviewMode, AutosaveFilterView>
  gearInspectorRecipeFilterMode?: GearInspectorRecipeFilterMode
  // Builder section collapse state — one entry per builder panel.
  // Absent means all sections are expanded (defaults).
  builderRecipeCollapsed?: BuilderPanelCollapsedSections
  builderSafeguardCollapsed?: BuilderPanelCollapsedSections
}

type InitialAutosaveState = {
  restoreDlgOpen: boolean
  restoreDraft: RestoreDraft | null
  enabled: boolean
}

export const metasetsSignature = (mets?: Metaset[] | null): string => {
  if (!mets || mets.length === 0) return '[]'
  const copy = mets.map((m) => ({
    name: m.name,
    sets: [...(m.sets ?? [])].sort((a, b) => a - b),
    iconId: normalizeMetasetIconId(m.iconId),
  }))
  copy.sort((a, b) => {
    const n = a.name.localeCompare(b.name)
    if (n !== 0) return n
    const as = JSON.stringify(a.sets)
    const bs = JSON.stringify(b.sets)
    return as.localeCompare(bs)
  })
  return JSON.stringify(copy)
}

/**
 * True when two metaset lists are interchangeable from the session's perspective:
 * same content (name + sets + iconId via metasetsSignature). Name is the metaset
 * primary key, so it is already part of the signature — a separate name-set check
 * would be fully redundant. Reference-satisfaction (do restored recipes/safeguards
 * still resolve their metaset names?) is a distinct concern handled by
 * metasetRefsUnsatisfied, not by content equality.
 */
export const metasetsEqualSession = (a: Metaset[] | null | undefined, b: Metaset[] | null | undefined): boolean => {
  // Treat missing/empty as equal to empty.
  const aList = a ?? []
  const bList = b ?? []
  // metasetsSignature is keyed on name+sets+iconId; equal signature ⇒ interchangeable.
  return metasetsSignature(aList) === metasetsSignature(bList)
}

/**
 * SSOT for "which metaset names do these recipes/safeguards reference?".
 * Recipes reference metasets through `artifactMetaSets` (a list of metaset *names*,
 * despite the legacy field name); safeguards through `combination.metaSetNames`.
 * Both point at metasets by name since the name-as-primary-key migration.
 */
export const collectReferencedMetasetNames = (
  recipes?: BuilderRecipe[] | null,
  safeguards?: SafeguardRule[] | null,
): Set<string> => {
  const names = new Set<string>()
  // Recipe metaset references: artifactMetaSets holds display names directly.
  for (const recipe of recipes ?? []) {
    for (const name of recipe.artifactMetaSets ?? []) names.add(name)
  }
  // Safeguard metaset references live under the rule's combination.
  for (const rule of safeguards ?? []) {
    for (const name of rule.combination?.metaSetNames ?? []) names.add(name)
  }
  return names
}

/**
 * True when restoring recipes/safeguards would leave a metaset reference dangling —
 * i.e. they name a metaset the current session's metaset list does not contain.
 * This is the name-world successor to the old ID-mismatch trigger: metasets can be
 * restored independently of recipes/safeguards, so a saved rule that references a
 * name absent from the session would render a raw, unresolved metaset chip. Surfacing
 * the Metasets row lets the user restore the referenced metasets and heal the chips.
 */
export const metasetRefsUnsatisfied = (
  referenced: Set<string>,
  sessionMetasets?: Metaset[] | null,
): boolean => {
  // No references ⇒ nothing can dangle.
  if (referenced.size === 0) return false
  // Index the session's metaset names for O(1) membership checks.
  const present = new Set((sessionMetasets ?? []).map((m) => m.name))
  // Any referenced name missing from the session is an unsatisfied reference.
  for (const name of referenced) {
    if (!present.has(name)) return true
  }
  return false
}

/**
 * Decide whether the restore dialog's "Metasets" row should surface for a draft.
 * SSOT for the row's visibility trigger — both App's live memo and the flow test
 * call this so the composed rule has exactly one definition.
 *
 * True when either:
 *  - the saved metaset list structurally differs from the session's content, OR
 *  - the saved recipes/safeguards reference a metaset name the session lacks
 *    (the name-world successor to the old ID-mismatch trigger; restoring metasets
 *    heals those otherwise-dangling chips).
 * A draft with no saved metaset slice never surfaces the row.
 */
export const restoreDraftMetasetsDiffer = (
  draft: RestoreDraft | null | undefined,
  sessionMetasets: Metaset[] | null | undefined,
): boolean => {
  // No saved metaset slice ⇒ nothing to restore, no row.
  if (!draft?.Metasets) return false
  // Content difference is reason enough on its own.
  if (!metasetsEqualSession(draft.Metasets, sessionMetasets)) return true
  // Content matches — surface the row only if a reference would dangle after restore.
  const referenced = collectReferencedMetasetNames(draft.Recipes, draft.Safeguards)
  return metasetRefsUnsatisfied(referenced, sessionMetasets)
}


export const substatTargetsSignature = (targets?: SubstatTargetTable | null): string => {
  if (!targets) return ''
  return JSON.stringify(canonicalize(targets))
}

export const finalSellSignature = (fsr?: FinalSellRemainderConfig | null): string => {
  if (!fsr) return ''
  return JSON.stringify(canonicalize(fsr))
}

function computeInitialAutosaveState(args: {
  key: string
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  recipes: BuilderRecipe[]
  finalSellRemainder: FinalSellRemainderConfig
  note: string | null
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers
  noteSafeguardOverridesAnswers: NoteSafeguardOverridesAnswers
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  storedRuntimeGearSetCount: number
}): InitialAutosaveState {
  try {
    // One-time migration from sfr→sfc rename (2026-04): if the new key is absent
    // but the old key exists, move the data over so users don't lose their session.
    const LEGACY_AUTOSAVE_KEY = args.key.replace('autosave.sfc.', 'autosave.sfr.')
    if (typeof window !== 'undefined' && LEGACY_AUTOSAVE_KEY !== args.key) {
      const newRaw = window.localStorage.getItem(args.key)
      const oldRaw = window.localStorage.getItem(LEGACY_AUTOSAVE_KEY)
      if (!newRaw && oldRaw) {
        // Migrate: copy old entry under the new key, then remove the old key.
        window.localStorage.setItem(args.key, oldRaw)
        removeAutosave(LEGACY_AUTOSAVE_KEY)
      } else if (newRaw && oldRaw) {
        // New key already present; just remove the stale legacy key.
        removeAutosave(LEGACY_AUTOSAVE_KEY)
      }
    }
    const entry = loadAutosave<unknown>(args.key)
    if (entry && args.recipes.length === 0) {
      // Build a dormant runtime-name map from localStorage.
      // Why: autosave drafts store readable set names even for runtime sets.
      // We must resolve those names without auto-applying runtime gear sets.
      const runtimeSetNameMap = getPersistedRuntimeGearSetNameMap()
      const parsed = parseSfcObject(
        entry.payload as unknown,
        { metasets: args.metasets, substatTargets: args.substatTargets },
        { runtimeSetNameMap },
      )
      // Preset-origin swap: a setup stamped with a PresetOrigin marker (written at save
      // time from the LIVE content match) is treated as "ride the current preset" rather
      // than "restore the stale saved body". When the marker names a built-in, we replace
      // the preset-IDENTITY slices (metasets, targets, recipes, final-sell, safeguards,
      // enabled flags, note) with the CURRENT bundled preset so users pick up preset
      // updates across app versions — exactly mirroring the simple-mode startup. Session
      // and override state (filters, sort, override answers, selected indices) still come
      // from the saved payload below, and the swap is silent (no UI change). SSOT for the
      // preset body lives in presetDraftFields; the same authority the simple path trusts.
      const presetOriginRaw = (entry.payload && typeof entry.payload === 'object')
        ? (entry.payload as Record<string, unknown>)[AUTOSAVE_PRESET_ORIGIN_KEY]
        : null
      const presetOrigin: PresetVariant | null = presetOriginRaw === 'beginner' || presetOriginRaw === 'lategame'
        ? presetOriginRaw
        : null
      // The current bundled preset body when the marker is valid, else null (custom body).
      const presetSwap = presetOrigin ? presetDraftFields(presetOrigin) : null
      // Preset-identity slices: from the bundled preset when swapping, else the saved body.
      const recipes = presetSwap ? presetSwap.recipes : parsed.recipes
      const savedMetasets = presetSwap ? presetSwap.metasets : parsed.metasets
      const savedSubstatTargets = presetSwap ? presetSwap.substatTargets : parsed.substatTargets
      const savedFinalSell = presetSwap ? (presetSwap.finalSellRemainder ?? null) : parsed.finalSellRemainder
      const savedSafeguards = (presetSwap ? presetSwap.safeguardRules : parsed.safeguardRules) ?? []
      const savedKeepEnabled = (presetSwap ? presetSwap.safeguardsEnabled : parsed.safeguardsEnabled) ?? false
      // Explicit false is meaningful — treat absent as the default (true).
      const savedRecipesEnabled = (presetSwap ? presetSwap.recipesEnabled : parsed.recipesEnabled) ?? true
      // The note also follows the preset body when swapping (its override DSL must match
      // the loaded preset so saved override answers prune/seed against the right note).
      const swappedNote = presetSwap ? presetSwap.note : parsed.note
      const metasetsMatchDefaults = metasetsEqualSession(savedMetasets as Metaset[], args.metasets)
      // Compare canonicalized copies so reordering the variant keys (common when
      // editing via the dialog) does not trick autosave into thinking the
      // session diverged.
      const substatTargetsMatchDefaults = substatTargetsSignature(savedSubstatTargets) === substatTargetsSignature(args.substatTargets)
      const finalSellMatches = finalSellSignature(savedFinalSell) === finalSellSignature(args.finalSellRemainder)
      // Legacy view-state keys (`Filters`, `GearInspectorSort`, `SafeguardsGridFilterMode`)
      // are no longer read: filter/sort/grid-filter state is now ephemeral (sessionOnly
      // stores) and never restored. Old .sfc payloads may still carry these keys; we
      // simply ignore them (unknown keys pass through parseSfcObject without error) so
      // they no longer gate the restore prompt or contribute to change detection.
      const safeguardsMatchDefaults = savedSafeguards.length === 0
        && !savedKeepEnabled
        && args.safeguardRules.length === 0
        && !args.safeguardsEnabled
      const recipesEnabledMatchesSession = savedRecipesEnabled === args.recipesEnabled
      // Override answers now come from parseSfcObject like every other document field —
      // the autosave payload and a saved .sfc share one reader, so these no longer need
      // to be dug out of the raw record here (they were the last hand-rolled exception).
      const savedRecipeOverridesAnswers = parsed.noteRecipeOverridesAnswers
      const savedOverridesDisabled = parsed.noteOverridesDisabled
      const savedSafeguardOverridesAnswers = parsed.noteSafeguardOverridesAnswers
      // Consider the note, recipe overrides, or safeguard overrides answers as a reason to restore.
      const notePresent = typeof parsed.note === 'string' && parsed.note.trim().length > 0
        || (savedRecipeOverridesAnswers && Object.keys(savedRecipeOverridesAnswers).length > 0)
        || (savedSafeguardOverridesAnswers && Object.keys(savedSafeguardOverridesAnswers).length > 0)
        || savedOverridesDisabled
      // Treat persisted runtime sets as restore-worthy even if recipes are empty.
      // Why: this is the only UX surface that can re-apply dormant sets.
      const hasStoredRuntimeGearSets = args.storedRuntimeGearSetCount > 0
      const essentiallyDefault = recipes.length === 0
        && metasetsMatchDefaults
        && substatTargetsMatchDefaults
        && finalSellMatches
        && !notePresent
        && safeguardsMatchDefaults
        && recipesEnabledMatchesSession
        && !hasStoredRuntimeGearSets
      if (!essentiallyDefault) {
        const payload = entry.payload as Record<string, unknown>
        const savedAtRaw = typeof payload['AutosaveSavedAt'] === 'string' ? payload['AutosaveSavedAt'] : null
        // Read selected recipe index from the raw payload (parseSfcObject always returns 0 — not useful here).
        const rawSelIdx = payload['SelectedRecipeIndex']
        const savedRecipeSelIdx = typeof rawSelIdx === 'number' && rawSelIdx >= 0 && rawSelIdx < recipes.length
          ? rawSelIdx
          : null
        // Read selected safeguard rule index from the raw payload; bounds-check against the saved list.
        const rawSelSgIdx = payload['SelectedSafeguardRuleIdx']
        const savedSgSelIdx = typeof rawSelSgIdx === 'number' && rawSelSgIdx >= 0 && rawSelSgIdx < savedSafeguards.length
          ? rawSelSgIdx
          : null
        return {
          restoreDlgOpen: true,
          restoreDraft: {
            Version: String(payload['Version'] ?? ''),
            Metasets: savedMetasets,
            substatTargets: savedSubstatTargets,
            Recipes: recipes,
            ...(savedFinalSell ? { FinalSellRemainder: savedFinalSell } : {}),
            ...(savedSafeguards.length ? { Safeguards: savedSafeguards } : {}),
            // Always include both enabled-state booleans — false is a meaningful saved value.
            SafeguardsEnabled: savedKeepEnabled,
            RecipesEnabled: savedRecipesEnabled,
            ...(savedRecipeSelIdx != null ? { SelectedRecipeIndex: savedRecipeSelIdx } : {}),
            ...(savedSgSelIdx != null ? { SelectedSafeguardRuleIdx: savedSgSelIdx } : {}),
            ...(swappedNote ? { Note: swappedNote } : {}),
            ...(savedRecipeOverridesAnswers ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: savedRecipeOverridesAnswers } : {}),
            ...(savedSafeguardOverridesAnswers ? { [NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY]: savedSafeguardOverridesAnswers } : {}),
            ...(savedOverridesDisabled ? { [NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY]: true } : {}),
            ...(savedAtRaw ? { AutosaveSavedAt: savedAtRaw } : {}),
            ...(() => {
              const rawLogicHubTab = typeof payload['LogicHubDialogTab'] === 'string'
                ? payload['LogicHubDialogTab']
                : null
              if (!rawLogicHubTab) return {}
              const normalized = LOGIC_HUB_DIALOG_TABS.includes(rawLogicHubTab as LogicHubDialogTab)
                ? rawLogicHubTab as LogicHubDialogTab
                : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
              return { LogicHubDialogTab: normalized }
            })(),
          },
          enabled: false,
        }
      }
    }
  } catch {}
  return { restoreDlgOpen: false, restoreDraft: null, enabled: true }
}

export function useAutosaveRestore(opts: {
  key: string
  version: string
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  recipes: BuilderRecipe[]
  finalSellRemainder: FinalSellRemainderConfig
  selectedRecipeIndex: number | null
  note: string | null
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers
  noteSafeguardOverridesAnswers: NoteSafeguardOverridesAnswers
  noteOverridesDisabled: boolean
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  recipesEnabled: boolean
  logicHubDialogTab: LogicHubDialogTab
  storedRuntimeGearSetCount: number
}) {
  const {
    key,
    version,
    metasets,
    substatTargets,
    recipes,
    finalSellRemainder,
    selectedRecipeIndex: _selectedRecipeIndex,
    note,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    logicHubDialogTab,
    storedRuntimeGearSetCount,
  } = opts

  // Compute initial autosave state once via useState's lazy initializer so we never
  // need a ref read during render for the lazy-init gate.
  const [initialAutosaveState] = useState<InitialAutosaveState>(() => computeInitialAutosaveState({
    key,
    metasets,
    substatTargets,
    recipes,
    finalSellRemainder,
    note,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    storedRuntimeGearSetCount,
  }))
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(initialAutosaveState.restoreDlgOpen)
  const [restoreDraft, setRestoreDraft] = useState<RestoreDraft | null>(initialAutosaveState.restoreDraft)
  const [enabled, setEnabled] = useState(initialAutosaveState.enabled)
  const [dismissBaseline, setDismissBaseline] = useState<string | null>(null)

  // Snapshot of current state used for divergence detection
  const snapshot = useMemo(() => {
    // Selection changes should not enable autosave by themselves.
    // Exclude SelectedRecipeIndex from the divergence snapshot.
    // Filter/sort/grid-filter view state is intentionally excluded: it is ephemeral
    // (sessionOnly stores) and no longer participates in divergence detection.
    const base = {
      Version: version,
      Metasets: metasets,
      substatTargets,
      Recipes: recipes,
      FinalSellRemainder: finalSellRemainder,
      Safeguards: safeguardRules,
      SafeguardsEnabled: safeguardsEnabled,
      RecipesEnabled: recipesEnabled,
      LogicHubDialogTab: logicHubDialogTab,
      // Persist note content and recipe overrides answers only when present.
      ...(note && note.trim() ? { Note: note } : {}),
      ...(Object.keys(noteRecipeOverridesAnswers).length > 0
        ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: noteRecipeOverridesAnswers }
        : {}),
      ...(Object.keys(noteSafeguardOverridesAnswers).length > 0
        ? { [NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY]: noteSafeguardOverridesAnswers }
        : {}),
      ...(noteOverridesDisabled ? { [NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY]: true } : {}),
    }
    return JSON.stringify(base)
  }, [
    version,
    metasets,
    substatTargets,
    recipes,
    finalSellRemainder,
    note,
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
    logicHubDialogTab,
  ])

  // After dismissing, enable autosave only after divergence from baseline.
  // Render-time state adjustment: when snapshot diverges from baseline, enable immediately.
  const canEnableFromDivergence = !enabled && !restoreDlgOpen && dismissBaseline !== null
  if (canEnableFromDivergence) {
    try {
      if (snapshot !== dismissBaseline) setEnabled(true)
    } catch {}
  }

  const dismiss = () => {
    setRestoreDlgOpen(false)
    try { setDismissBaseline(snapshot) } catch { setDismissBaseline(null) }
    // Keep previous autosave intact by not enabling here
  }

  const accept = () => {
    setRestoreDlgOpen(false)
    setEnabled(true)
    setRestoreDraft(null)
  }

  return { restoreDlgOpen, restoreDraft, dismissRestore: dismiss, acceptRestore: accept, autosaveEnabled: enabled }
}
