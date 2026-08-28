/**
 * useAutosaveRestore
 *
 * Encapsulates autosave restore prompt and enablement logic. Keeps the
 * previous autosave intact until the user either restores it or makes a
 * change after dismissing. Exposes dialog state and whether autosave is
 * currently enabled.
 */
import { useCallback, useMemo, useState } from 'react'
import { loadAutosave, removeAutosave } from '../lib/autosave'
import { parseSfcObject } from '../lib/sfcIO'
import { presetDraftFields, type PresetVariant } from '../lib/sfcPresetMatch'
import { AUTOSAVE_PRESET_ORIGIN_KEY, AUTOSAVE_DIVERGED_AT_KEY, AUTOSAVE_ANCHORED_KEY } from '../lib/externalWsProtocol'
import { readAutosaveAnchored, readAutosaveDivergedAt } from '../lib/sfcProvenance'
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
import type { RestoreOptionKey } from '../types/restoreAutosaveSelection'

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
  /**
   * When the saved document first diverged from its last save/load (epoch ms).
   * Distinct from AutosaveSavedAt, which is the last WRITE time and bumps on every
   * debounced save. Carried through so the restore can show the document's real
   * unsaved age; see lib/sfcProvenance.ts.
   */
  DivergedAt?: number
  /**
   * Which bundled preset this saved body still matched when it was written, or absent
   * for a custom setup. One of the two anchored markers (see restoreDraftIsAnchored):
   * the content is one click away from the preset buttons.
   */
  PresetOrigin?: PresetVariant
  /**
   * The body was CLEAN when written — just saved, just loaded, or undone back to its
   * save point — so it exists somewhere durable. The other anchored marker; see
   * AUTOSAVE_ANCHORED_KEY. Absent on dirty-era entries and on entries from before the
   * field existed.
   */
  Anchored?: true
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


/**
 * Which SFC-identity rows the restore dialog offers for this draft.
 *
 * SSOT for the row conditions: the dialog renders exactly these rows, and the restore
 * handler needs the same set to judge whether a restore covered the whole saved body
 * (see restoreCoversWholeSfcBody). Writing the conditions in both places would let the
 * two drift, and a drifted set would silently mis-anchor a restored preset.
 *
 * A row is offered only when the draft HAS that content, and for metasets/targets only
 * when it also differs from the session — an unoffered row therefore means the session
 * already equals the draft there.
 */
export function offeredRestoreSfcIdentityKeys(
  draft: RestoreDraft | null | undefined,
  opts: { metasetsDiffer: boolean; targetsDiffer: boolean },
): Set<RestoreOptionKey> {
  const offered = new Set<RestoreOptionKey>()
  if (!draft) return offered
  if ((draft.Recipes?.length ?? 0) > 0) offered.add('recipes')
  if ((draft.Metasets?.length ?? 0) > 0 && opts.metasetsDiffer) offered.add('metasets')
  if (draft.substatTargets && opts.targetsDiffer) offered.add('targets')
  // The note row stands for the whole note slice: its text and both override answer maps.
  if (
    (draft.Note && draft.Note.trim())
    || Object.keys(draft.NoteRecipeOverridesAnswers ?? {}).length > 0
    || Object.keys(draft.NoteSafeguardOverridesAnswers ?? {}).length > 0
    || draft.NoteRecipeOverridesDisabled
  ) offered.add('note')
  if ((draft.Safeguards?.length ?? 0) > 0) offered.add('safeguards')
  return offered
}

/**
 * Is the body this draft restores RECOVERABLE without the tab?
 *
 * The single definition of "which autosave markers make a restore clean", so the
 * restore handler asks one question instead of inspecting fields. Two markers answer it,
 * each a statement of recoverability in its own right: the body was clean when written
 * (Anchored — it exists in the .sfc the user saved or loaded), or it is byte-identical
 * to a bundled preset (PresetOrigin — one click away from the preset buttons, and the
 * projection above already swapped in the CURRENT preset body). A pre-field entry has
 * neither and stays recovered, which is exactly today's behaviour.
 *
 * Whether the restore is WHOLE is the caller's other half (restoreCoversWholeSfcBody);
 * a partial restore mixes in session content and is unsaved work regardless of markers.
 */
export function restoreDraftIsAnchored(draft: RestoreDraft | null | undefined): boolean {
  if (!draft) return false
  return draft.Anchored === true || draft.PresetOrigin !== undefined
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
        // Validated by the same SSOT the consumer uses, so a malformed/future stamp is
        // dropped here rather than travelling on as a bad age.
        const divergedAtRaw = readAutosaveDivergedAt(payload)
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
            // The divergence stamp must be forwarded explicitly: restoreDraft is an
            // allowlist projection, so anything not named here is dropped and the
            // restore would fall back to "age unknown" (stamping now).
            ...(divergedAtRaw !== null ? { [AUTOSAVE_DIVERGED_AT_KEY]: divergedAtRaw } : {}),
            // Forwarded whenever the marker named a valid built-in — which is exactly
            // when presetSwap ran, so the preset-identity slices in this draft ARE the
            // current bundled preset body. Without it the projection would drop the
            // marker (it is an allowlist) and a restored, never-edited preset would
            // land dirty.
            ...(presetOrigin ? { [AUTOSAVE_PRESET_ORIGIN_KEY]: presetOrigin } : {}),
            // The clean-at-write marker (same allowlist rule: name it or lose it).
            ...(readAutosaveAnchored(payload) ? { [AUTOSAVE_ANCHORED_KEY]: true as const } : {}),
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

  // Single definition of "baseline divergence against this snapshot from now on", shared by
  // the dismissal and re-arm paths so both can never drift apart. The guard mirrors the
  // React state setter's own failure mode: if the snapshot cannot be stored, fall back to
  // null (unarmed) rather than leaving a half-written baseline behind.
  const captureDivergenceBaseline = (nextBaseline: string) => {
    try { setDismissBaseline(nextBaseline) } catch { setDismissBaseline(null) }
  }

  // Pending-re-arm latch, held as STATE (not a ref) so it can be read and consumed during
  // render. rearmDivergence() cannot baseline synchronously: its caller has typically just
  // ENQUEUED the state updates that finish the startup load (React batches them, so nothing
  // has re-rendered yet) and baselining now would capture the PRE-load snapshot —
  // re-introducing the overwrite this exists to prevent. So the call only bumps `requested`;
  // the render-time block below consumes it on the first render in which the snapshot memo
  // reflects those updates.
  //
  // Bumping a counter also GUARANTEES such a render: when the caller enqueued no state
  // updates of its own (no saved answers to re-apply) nothing else would re-render, and a
  // latch with no following render would never be consumed — leaving the session unarmed
  // and silently dropping every later edit. `served` tracks which request has been handled,
  // so a re-render cannot re-baseline against a later (already user-edited) snapshot.
  const [rearm, setRearm] = useState({ requested: 0, served: 0 })

  // Render-time state adjustment, the same sanctioned pattern as the divergence check
  // below: consume the latch while rendering rather than in an effect, so the baseline
  // lands without an extra cascading commit.
  if (rearm.requested !== rearm.served) {
    setRearm({ requested: rearm.requested, served: rearm.requested })
    // Never override an already-enabled session, and never re-baseline while the prompt is
    // still up (the user has not decided yet — dismiss/accept own that transition). The
    // request is consumed either way rather than lingering and firing later.
    if (!enabled && !restoreDlgOpen) captureDivergenceBaseline(snapshot)
  }

  // After dismissing, enable autosave only after divergence from baseline.
  // Render-time state adjustment: when snapshot diverges from baseline, enable immediately.
  const canEnableFromDivergence = !enabled && !restoreDlgOpen && dismissBaseline !== null
  if (canEnableFromDivergence) {
    try {
      if (snapshot !== dismissBaseline) setEnabled(true)
    } catch {}
  }

  /**
   * Close the restore prompt without restoring.
   *
   * The baseline captured here is what "the user then changed something" is measured
   * against: once the live snapshot diverges from it, autosave re-enables and the stored
   * payload is overwritten (see canEnableFromDivergence above). That is right for a real
   * dismissal, where the next change IS a user edit.
   *
   * It is wrong when the app dismisses on the user's behalf and then loads a document
   * itself — the express boot does exactly that (App.tsx: the dismiss effect runs before
   * the startup preset/custom load). There the baseline would be snapshotted while state
   * is still empty, the programmatic load would read as divergence, and the freshly loaded
   * body would be written straight over the user's saved document. `armDivergence: false`
   * keeps autosave disabled until something re-arms it, so the stored payload survives a
   * startup load that the user never asked for.
   */
  const dismiss = (opts?: { armDivergence?: boolean }) => {
    setRestoreDlgOpen(false)
    // Default true: a bare dismiss() is the user closing the dialog.
    if (opts?.armDivergence === false) return
    captureDivergenceBaseline(snapshot)
    // Keep previous autosave intact by not enabling here
  }

  const accept = () => {
    setRestoreDlgOpen(false)
    setEnabled(true)
    setRestoreDraft(null)
  }

  /**
   * Re-arm divergence detection against the CURRENT state.
   *
   * Companion to `dismiss({ armDivergence: false })`: the express boot suppresses arming so
   * its own startup load cannot be mistaken for a user edit, then calls this once that load
   * has settled. Baselining on the POST-load snapshot is what makes the difference — from
   * here on, only a real user change diverges, and autosave re-enables exactly as it would
   * after a normal dismissal. Without this the express session would never re-enable
   * autosave at all and genuine edits would be lost, which is worse than the bug it fixes.
   *
   * Deliberately asynchronous: callers finish their load by ENQUEUEING state updates (the
   * express boot re-applies the saved override answers on the line above the call), and
   * React batches those, so no snapshot readable at call time — closure OR ref — yet
   * includes them. Baselining here would capture the pre-load state and let the load's own
   * updates read as the user's first edit. Instead this only requests a re-arm; the
   * render-time latch above performs it on the first render in which the caller's updates
   * are live. Stable identity so callers can list it in an effect dependency array honestly.
   */
  const rearmDivergence = useCallback(() => {
    // Bumping `requested` both records the request and forces a render, so the latch is
    // consumed even when the caller enqueued no state updates of its own.
    setRearm((prev) => ({ ...prev, requested: prev.requested + 1 }))
  }, [])

  return {
    restoreDlgOpen,
    restoreDraft,
    dismissRestore: dismiss,
    acceptRestore: accept,
    rearmAutosaveDivergence: rearmDivergence,
    autosaveEnabled: enabled,
  }
}
