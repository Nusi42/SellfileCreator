/**
 * safeguardMultiEditDraft.ts
 *
 * Multi-edit draft machinery for SafeguardRule lists. Mirrors the structure of
 * recipeMultiEditDraft but typed specifically for safeguard fields. Combination
 * sub-fields (slots, sets, mainStats, etc.) are flattened into top-level edit
 * keys via a SafeguardEditableFields projection so each field gets its own
 * mixed/dirty state.
 *
 * Generic types shared with the recipe side (MultiEditStatus, MultiEditArrayPatch)
 * are imported from recipeMultiEditDraft until a common extraction point is established.
 * MultiEditFieldCommit is NOT imported — safeguards use SafeguardMultiEditFieldCommit
 * to ensure patch generics resolve against SafeguardFieldKey instead of BuilderFieldKey.
 */
import type {
  MultiEditStatus,
  MultiEditArrayPatch,
} from './recipeMultiEditDraft'
import { areSelectionsIdentical } from './recipeMultiEditDraft'
import type { NameAppearance } from './nameAppearance'
import type {
  ArtifactTypeId,
  FactionId,
  RankValue,
  StatVariant,
} from './types'
import {
  type SafeguardRule,
  type SafeguardRuleActivation,
  type SafeguardRuleCountMode,
  type SafeguardCombination,
  type SafeguardSubstatMatch,
  type SafeguardImprovementChanceLevelThresholds,
  cloneSafeguardCombination,
  normalizeSafeguardSubstatDependents,
  normalizeSafeguardFactionSlotScope,
  parseMainStatRankWeightFactor,
  // Chip-by-chip count-mode equality, shared with every other scope consumer.
  areSafeguardCountModesEqual,
  cloneSafeguardGroupSettings,
} from './safeguards'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { normalizeArtifactSetSelections, pruneImplicitAnyExclusions } from './gearSets/selection'
import { isAccessorySlot, slotPatchIntroducesArtifact } from './gearInspectorDomain'

// ── editable field projection ─────────────────────────────────────────────────

/**
 * SafeguardEditableFields
 *
 * Flat view of all multi-editable SafeguardRule fields. Combination sub-fields
 * are lifted to the top level so each gets independent mixed/dirty tracking.
 * Read values with extractSafeguardEditableFields; write back with
 * applyEditableFieldKeyToRule.
 */
export type SafeguardEditableFields = {
  // Appearance sub-fields tracked independently so name and fgColor each have their own mixed state.
  appearanceName: string
  appearanceFgColor: string | undefined
  activation: SafeguardRuleActivation
  requiredCount: number
  countMode: SafeguardRuleCountMode
  // Group settings the member carries (null on an ungrouped rule). Staged edits land on every
  // selected member's group and the funnel's normalizer fans them out across each run; a rule
  // that is not grouped ignores them — multi-edit never creates a group.
  groupRequiredCount: number | null
  groupCountMode: SafeguardRuleCountMode | null
  // Boolean ignore toggles
  ignorePreviousSafeguards: boolean
  ignoreEquippedInCollection: boolean
  ignoreEquippedInVault: boolean
  // Tags for safeguard-overrides DSL targeting
  tags: string[]
  // Combination arrays (patched individually)
  slots: ArtifactTypeId[]
  sets: ArtifactSetSelectionEntry[]
  metaSetNames: string[]
  ranks: RankValue[]
  rarities: RankValue[]
  mainStats: StatVariant[]
  factions: FactionId[]
  // Substat fields
  substats: StatVariant[]
  substatMatch: SafeguardSubstatMatch
  substatWeights: Partial<Record<StatVariant, number>>
  // "Weight by Rank" scoring toggle (scalar bool — uses default equality/clone/apply paths).
  weightMainStatByRank: boolean
  // Tunable main-stat rank factor (scalar number — uses default equality/clone/apply paths).
  mainStatRankWeightFactor: number
  improvementChanceThreshold: SafeguardImprovementChanceLevelThresholds | null
}

export const SAFEGUARD_FIELD_KEYS = [
  'appearanceName',
  'appearanceFgColor',
  'activation',
  'requiredCount',
  'countMode',
  'groupRequiredCount',
  'groupCountMode',
  'ignorePreviousSafeguards',
  'ignoreEquippedInCollection',
  'ignoreEquippedInVault',
  'tags',
  'slots',
  'sets',
  'metaSetNames',
  'ranks',
  'rarities',
  'mainStats',
  'factions',
  'substats',
  'substatMatch',
  'substatWeights',
  'weightMainStatByRank',
  'mainStatRankWeightFactor',
  'improvementChanceThreshold',
] as const satisfies ReadonlyArray<keyof SafeguardEditableFields>

export type SafeguardFieldKey = typeof SAFEGUARD_FIELD_KEYS[number]

// The subset of editable fields that describe the gear FILTER, i.e. the flat keys that route into
// `rule.combination`. Named once here so the apply path and any future summary/aggregation share it.
export const SAFEGUARD_COMBINATION_FIELD_KEYS: ReadonlySet<SafeguardFieldKey> = new Set([
  'slots', 'sets', 'metaSetNames', 'ranks', 'rarities', 'mainStats', 'factions',
])

// ── patch type mapping ────────────────────────────────────────────────────────

// Only array-valued fields carry a structured patch; scalars are replaced wholesale.
type SafeguardFieldPatchByKey = {
  tags: MultiEditArrayPatch<string>
  slots: MultiEditArrayPatch<ArtifactTypeId>
  sets: MultiEditArrayPatch<ArtifactSetSelectionEntry>
  metaSetNames: MultiEditArrayPatch<string>
  ranks: MultiEditArrayPatch<RankValue>
  rarities: MultiEditArrayPatch<RankValue>
  mainStats: MultiEditArrayPatch<StatVariant>
  factions: MultiEditArrayPatch<FactionId>
  substats: MultiEditArrayPatch<StatVariant>
}

export type SafeguardMultiEditFieldPatch<K extends SafeguardFieldKey> =
  K extends keyof SafeguardFieldPatchByKey ? SafeguardFieldPatchByKey[K] : never

// ── field state and draft state ───────────────────────────────────────────────

export interface SafeguardMultiEditFieldState {
  // Current value shown in the UI (first rule's value if mixed, or staged value if dirty).
  value: unknown
  // 'common' = all rules share the same value; 'mixed' = rules differ.
  status: MultiEditStatus
  // True once the user has staged a change not yet applied to the rule list.
  dirty: boolean
  initialStatus: MultiEditStatus
  initialValue: unknown
  // Non-null when status === 'mixed'; holds the distinct values across the selection.
  mixedValues: unknown[] | null
  initialMixedValues: unknown[] | null
  // Non-null for array fields with a staged additive patch (add/remove/replace).
  patch: SafeguardMultiEditFieldPatch<SafeguardFieldKey> | null
}

export type SafeguardMultiEditFields = Record<SafeguardFieldKey, SafeguardMultiEditFieldState>

export interface SafeguardMultiEditDraftState {
  // Selected rule IDs (stable across reorders because safeguards have UUID ids).
  selection: string[]
  fields: SafeguardMultiEditFields
}

// ── commit type and handle types ──────────────────────────────────────────────

/**
 * SafeguardMultiEditFieldCommit
 *
 * Safeguard-specific commit type for updateField calls. Mirrors MultiEditFieldCommit
 * from recipeMultiEditDraft but uses SafeguardFieldKey / SafeguardMultiEditFieldPatch
 * so the patch generic resolves correctly. (MultiEditFieldCommit is parameterized on
 * BuilderFieldKey, which is recipe-specific, causing SafeguardMultiEditFieldPatch to
 * resolve to `never` at call sites.)
 */
export interface SafeguardMultiEditFieldCommit<T, K extends SafeguardFieldKey = SafeguardFieldKey> {
  value: T
  status?: MultiEditStatus
  mixedValues?: T[] | null
  patch?: SafeguardMultiEditFieldPatch<K> | null | undefined
}

export type SafeguardMultiEditUpdateFn = <K extends SafeguardFieldKey>(
  key: K,
  commit: SafeguardMultiEditFieldCommit<SafeguardEditableFields[K], K>,
) => void

export type SafeguardMultiEditResetFn = (key: SafeguardFieldKey) => void
export type SafeguardMultiEditResetAllFn = () => void

export interface SafeguardMultiEditDraftHandle {
  state: SafeguardMultiEditDraftState
  updateField: SafeguardMultiEditUpdateFn
  resetField: SafeguardMultiEditResetFn
  resetAll: SafeguardMultiEditResetAllFn
}

// ── field projection helpers ──────────────────────────────────────────────────

/**
 * extractSafeguardEditableFields
 *
 * Produces the flat editable projection of a SafeguardRule. Combination
 * sub-fields are lifted so multi-edit tracking stays field-granular.
 */
export function extractSafeguardEditableFields(rule: SafeguardRule): SafeguardEditableFields {
  const combo = rule.combination
  return {
    appearanceName: rule.appearance?.name ?? '',
    appearanceFgColor: rule.appearance?.fgColor,
    activation: rule.activation,
    requiredCount: rule.requiredCount,
    countMode: { ...rule.countMode },
    groupRequiredCount: rule.group ? rule.group.requiredCount : null,
    groupCountMode: rule.group ? { ...rule.group.countMode } : null,
    ignorePreviousSafeguards: rule.ignorePreviousSafeguards !== false,
    ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
    ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
    // Detach tags so multi-edit comparisons are not polluted by shared references.
    tags: Array.isArray(rule.tags) ? [...rule.tags] : [],
    slots: Array.isArray(combo.slots) ? [...combo.slots] : [],
    sets: normalizeArtifactSetSelections(combo.sets ?? []).map((e) =>
      e.excluded ? { id: e.id, excluded: true } : { id: e.id },
    ),
    metaSetNames: Array.isArray(combo.metaSetNames) ? [...combo.metaSetNames] : [],
    ranks: Array.isArray(combo.ranks) ? [...combo.ranks] : [],
    rarities: Array.isArray(combo.rarities) ? [...combo.rarities] : [],
    mainStats: Array.isArray(combo.mainStats) ? [...combo.mainStats] : [],
    factions: Array.isArray(combo.factions) ? [...combo.factions] : [],
    substats: Array.isArray(rule.substats) ? [...rule.substats] : [],
    substatMatch: rule.substatMatch,
    substatWeights: { ...(rule.substatWeights ?? {}) },
    weightMainStatByRank: rule.weightMainStatByRank === true,
    mainStatRankWeightFactor: parseMainStatRankWeightFactor(rule.mainStatRankWeightFactor),
    improvementChanceThreshold: rule.improvementChanceThreshold ?? null,
  }
}

/**
 * applyEditableFieldKeyToRule
 *
 * Writes one flat field value back into a SafeguardRule, routing combination
 * sub-fields into rule.combination. Does not mutate the source rule.
 */
export function applyEditableFieldKeyToRule(
  rule: SafeguardRule,
  key: SafeguardFieldKey,
  value: SafeguardEditableFields[SafeguardFieldKey],
): SafeguardRule {
  switch (key) {
    case 'slots':
    case 'sets':
    case 'metaSetNames':
    case 'ranks':
    case 'rarities':
    case 'mainStats':
    case 'factions': {
      // Route combination sub-fields into a shallow-cloned combination object.
      const nextCombo: SafeguardCombination = { ...rule.combination, [key]: value as unknown[] }
      return { ...rule, combination: nextCombo }
    }
    case 'appearanceName': {
      const name = (value as string) ?? ''
      const fgColor = rule.appearance?.fgColor
      const next = (name || fgColor) ? { name, ...(fgColor ? { fgColor } : {}) } : undefined
      const base = { ...rule }
      if (next) return { ...base, appearance: next }
      delete (base as { appearance?: NameAppearance }).appearance
      return base
    }
    case 'appearanceFgColor': {
      const fgColor = value as string | undefined
      const name = rule.appearance?.name ?? ''
      const next = (name || fgColor) ? { name, ...(fgColor ? { fgColor } : {}) } : undefined
      const base = { ...rule }
      if (next) return { ...base, appearance: next }
      delete (base as { appearance?: NameAppearance }).appearance
      return base
    }
    case 'groupRequiredCount': {
      // Only an existing member takes group edits; multi-edit never creates a group.
      if (!rule.group || value == null) return rule
      return { ...rule, group: { ...cloneSafeguardGroupSettings(rule.group), requiredCount: value as number } }
    }
    case 'groupCountMode': {
      if (!rule.group || value == null) return rule
      return { ...rule, group: { ...cloneSafeguardGroupSettings(rule.group), countMode: { ...(value as SafeguardRuleCountMode) } } }
    }
    default:
      // All other keys map 1:1 to SafeguardRule top-level fields.
      return { ...rule, [key]: value }
  }
}

// ── value equality and cloning ────────────────────────────────────────────────

/**
 * areSafeguardFieldValuesEqual
 *
 * Structural equality check per field key. Array fields use element-by-element
 * comparison; set selections normalize before comparing; scalars use ===.
 */
export function areSafeguardFieldValuesEqual(
  key: SafeguardFieldKey,
  left: unknown,
  right: unknown,
): boolean {
  if (left === right) return true
  if (left == null || right == null) return left === right
  switch (key) {
    case 'slots':
    case 'ranks':
    case 'rarities':
    case 'mainStats':
    case 'factions':
    case 'substats':
      // Simple number array comparison (order-sensitive as stored).
      return arePrimitiveArraysEqual(left as readonly unknown[], right as readonly unknown[])
    case 'tags':
    case 'metaSetNames':
      return arePrimitiveArraysEqual(left as readonly unknown[], right as readonly unknown[])
    case 'appearanceName':
    case 'appearanceFgColor':
      return left === right
    case 'sets':
      return areSetSelectionsEqual(left, right)
    case 'countMode':
    case 'groupCountMode':
      return areSafeguardCountModesEqual(left as SafeguardRuleCountMode, right as SafeguardRuleCountMode)
    case 'substatWeights': {
      const l = left as Record<number, number>
      const r = right as Record<number, number>
      const lKeys = Object.keys(l)
      const rKeys = Object.keys(r)
      if (lKeys.length !== rKeys.length) return false
      for (const k of lKeys) {
        if (l[Number(k)] !== r[Number(k)]) return false
      }
      return true
    }
    default:
      return left === right
  }
}

function arePrimitiveArraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  const a = left ?? []
  const b = right ?? []
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function areSetSelectionsEqual(left: unknown, right: unknown): boolean {
  const l = normalizeArtifactSetSelections(Array.isArray(left) ? left : [])
  const r = normalizeArtifactSetSelections(Array.isArray(right) ? right : [])
  if (l.length !== r.length) return false
  for (let i = 0; i < l.length; i += 1) {
    if (Number(l[i]!.id) !== Number(r[i]!.id)) return false
    if (Boolean(l[i]!.excluded) !== Boolean(r[i]!.excluded)) return false
  }
  return true
}

/**
 * cloneSafeguardFieldValue
 *
 * Produces a detached clone of a field value so draft state never shares
 * references with the live rule list.
 */
export function cloneSafeguardFieldValue(key: SafeguardFieldKey, value: unknown): unknown {
  if (value == null) return value
  switch (key) {
    case 'slots':
    case 'ranks':
    case 'rarities':
    case 'mainStats':
    case 'factions':
    case 'substats':
    case 'tags':
    case 'metaSetNames':
      return Array.isArray(value) ? [...value] : value
    case 'sets':
      return normalizeArtifactSetSelections(Array.isArray(value) ? value : []).map((e) =>
        e.excluded ? { id: e.id, excluded: true } : { id: e.id },
      )
    case 'appearanceName':
    case 'appearanceFgColor':
      return value  // primitives — no cloning needed
    case 'countMode':
    case 'groupCountMode':
      return { ...(value as SafeguardRuleCountMode) }
    case 'substatWeights':
      return { ...(value as Record<number, number>) }
    default:
      return value
  }
}

// ── patch clone and normalize ─────────────────────────────────────────────────

function cloneArrayPatchOf<T>(patch: MultiEditArrayPatch<T>): MultiEditArrayPatch<T> {
  return {
    add: patch.add ? [...patch.add] as readonly T[] : undefined,
    remove: patch.remove ? [...patch.remove] as readonly T[] : undefined,
    replace: patch.replace ? [...patch.replace] as readonly T[] : undefined,
    clear: patch.clear === true ? true : undefined,
  }
}

function cloneSetSelectionPatch(
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): MultiEditArrayPatch<ArtifactSetSelectionEntry> {
  const cloneEntries = (arr: readonly ArtifactSetSelectionEntry[] | undefined) =>
    arr
      ? normalizeArtifactSetSelections(arr).map((e) =>
          e.excluded ? { id: e.id, excluded: true } : { id: e.id },
        )
      : undefined
  return {
    add: cloneEntries(patch.add),
    remove: cloneEntries(patch.remove),
    replace: cloneEntries(patch.replace),
    clear: patch.clear === true ? true : undefined,
  }
}

export function cloneSafeguardFieldPatch<K extends SafeguardFieldKey>(
  key: K,
  patch: SafeguardMultiEditFieldPatch<K> | null | undefined,
): SafeguardMultiEditFieldPatch<K> | null {
  if (!patch) return null
  switch (key) {
    case 'sets':
      return cloneSetSelectionPatch(
        patch as MultiEditArrayPatch<ArtifactSetSelectionEntry>,
      ) as SafeguardMultiEditFieldPatch<K>
    case 'slots':
    case 'ranks':
    case 'rarities':
    case 'mainStats':
    case 'factions':
    case 'substats':
      return cloneArrayPatchOf(patch as MultiEditArrayPatch<number>) as SafeguardMultiEditFieldPatch<K>
    case 'tags':
    case 'metaSetNames':
      return cloneArrayPatchOf(patch as MultiEditArrayPatch<string>) as SafeguardMultiEditFieldPatch<K>
    default:
      return patch
  }
}

function isArrayPatchEmpty<T>(patch: MultiEditArrayPatch<T> | null | undefined): boolean {
  if (!patch) return true
  if (patch.clear) return false
  if (patch.replace !== undefined) return false
  if (patch.add && patch.add.length > 0) return false
  if (patch.remove && patch.remove.length > 0) return false
  return true
}

export function normalizeSafeguardFieldPatch<K extends SafeguardFieldKey>(
  key: K,
  patch: SafeguardMultiEditFieldPatch<K> | null | undefined,
): SafeguardMultiEditFieldPatch<K> | null {
  if (!patch) return null
  switch (key) {
    case 'tags':
    case 'slots':
    case 'sets':
    case 'metaSetNames':
    case 'ranks':
    case 'rarities':
    case 'mainStats':
    case 'factions':
    case 'substats':
      return isArrayPatchEmpty(patch as MultiEditArrayPatch<unknown>) ? null : patch
    default:
      return patch
  }
}

export function areSafeguardFieldPatchesEqual<K extends SafeguardFieldKey>(
  _key: K,
  left: SafeguardMultiEditFieldPatch<K> | null,
  right: SafeguardMultiEditFieldPatch<K> | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return false
  // All patch types are MultiEditArrayPatch variants; compare structurally.
  const l = left as MultiEditArrayPatch<unknown>
  const r = right as MultiEditArrayPatch<unknown>
  if (l.clear !== r.clear) return false
  if (!shallowArrayEqual(l.replace, r.replace)) return false
  if (!shallowArrayEqual(l.add, r.add)) return false
  if (!shallowArrayEqual(l.remove, r.remove)) return false
  return true
}

function shallowArrayEqual(
  a: readonly unknown[] | undefined,
  b: readonly unknown[] | undefined,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// ── dirty key enumeration ─────────────────────────────────────────────────────

export function getDirtySafeguardFieldKeys(
  fields: SafeguardMultiEditFields | null | undefined,
): SafeguardFieldKey[] {
  if (!fields) return []
  const dirty: SafeguardFieldKey[] = []
  for (const key of SAFEGUARD_FIELD_KEYS) {
    if (fields[key]?.dirty) dirty.push(key)
  }
  return dirty
}

// ── draft creation ────────────────────────────────────────────────────────────

/**
 * createSafeguardMultiEditDraft
 *
 * Builds a fresh draft from the current rule list and the ID-based selection.
 * Each field's initial status is 'common' when all selected rules share the
 * same value, or 'mixed' when they differ.
 */
export function createSafeguardMultiEditDraft(
  rules: SafeguardRule[],
  selection: string[],
): SafeguardMultiEditDraftState {
  if (rules.length === 0) {
    throw new Error('createSafeguardMultiEditDraft: expected at least one rule')
  }
  const fields = {} as SafeguardMultiEditFields
  for (const key of SAFEGUARD_FIELD_KEYS) {
    fields[key] = createFieldStateForKey(rules, key)
  }
  return { selection: selection.slice(), fields }
}

function createFieldStateForKey(
  rules: SafeguardRule[],
  key: SafeguardFieldKey,
): SafeguardMultiEditFieldState {
  const projected = rules.map((r) => extractSafeguardEditableFields(r))
  const first = projected[0]!
  const firstValue = first[key]
  const unique = collectUniqueValues(projected, key)
  const status: MultiEditStatus = unique.length > 1 ? 'mixed' : 'common'
  const clonedValue = cloneSafeguardFieldValue(key, firstValue)
  const initialValue = cloneSafeguardFieldValue(key, firstValue)
  const mixedValues = status === 'mixed'
    ? unique.map((v) => cloneSafeguardFieldValue(key, v))
    : null
  const initialMixedValues = mixedValues
    ? mixedValues.map((v) => cloneSafeguardFieldValue(key, v))
    : null
  return {
    value: clonedValue,
    status,
    dirty: false,
    initialStatus: status,
    initialValue,
    mixedValues,
    initialMixedValues,
    patch: null,
  }
}

function collectUniqueValues(
  projected: SafeguardEditableFields[],
  key: SafeguardFieldKey,
): unknown[] {
  const unique: unknown[] = []
  outer: for (const fields of projected) {
    const candidate = fields[key]
    for (const existing of unique) {
      if (areSafeguardFieldValuesEqual(key, existing, candidate)) continue outer
    }
    unique.push(candidate)
  }
  return unique
}

// ── draft sync ────────────────────────────────────────────────────────────────

/**
 * syncSafeguardMultiEditDraft
 *
 * Merges an existing draft's staged edits with a freshly computed base draft.
 * If the selection changed, the previous draft is discarded and the base is
 * returned directly. Dirty fields with patches are always preserved.
 */
export function syncSafeguardMultiEditDraft(
  previous: SafeguardMultiEditDraftState | null,
  base: SafeguardMultiEditDraftState,
): SafeguardMultiEditDraftState {
  if (previous == null) return base
  // ID-based selection comparison — reuse the index-array helper since it just
  // checks element-wise equality and works for string arrays too.
  if (!areSelectionsIdentical(previous.selection as unknown as number[], base.selection as unknown as number[])) return base
  const fields = {} as SafeguardMultiEditFields
  for (const key of SAFEGUARD_FIELD_KEYS) {
    const prevField = previous.fields[key]
    const baseField = base.fields[key]
    if (!prevField.dirty) {
      fields[key] = baseField
      continue
    }
    // Preserve staged edits unless they match the base initial state with no patch.
    const matchesBase = prevField.patch == null
      && prevField.status === baseField.initialStatus
      && areSafeguardFieldValuesEqual(key, prevField.value, baseField.initialValue)
    fields[key] = matchesBase
      ? baseField
      : {
          ...prevField,
          initialStatus: baseField.initialStatus,
          initialValue: baseField.initialValue,
          initialMixedValues: baseField.initialMixedValues
            ? baseField.initialMixedValues.map((v) => cloneSafeguardFieldValue(key, v))
            : null,
        }
  }
  return { selection: base.selection, fields }
}

// ── patch application ─────────────────────────────────────────────────────────

/**
 * applyMultiEditFieldToSafeguardRule
 *
 * Applies a single staged draft field to a SafeguardRule. Array fields with a
 * patch use additive add/remove/replace semantics; scalar fields are overwritten.
 */
export function applyMultiEditFieldToSafeguardRule(
  rule: SafeguardRule,
  key: SafeguardFieldKey,
  field: SafeguardMultiEditFieldState,
): SafeguardRule {
  const patch = field.patch
    ? cloneSafeguardFieldPatch(key, field.patch as SafeguardMultiEditFieldPatch<typeof key>)
    : null
  if (patch) {
    return applyPatchForKey(rule, key, patch)
  }
  // Scalar replace: write the staged value directly.
  const nextValue = cloneSafeguardFieldValue(
    key,
    field.value,
  ) as SafeguardEditableFields[SafeguardFieldKey]
  const current = extractSafeguardEditableFields(rule)[key]
  if (areSafeguardFieldValuesEqual(key, current, nextValue)) return rule
  return applyEditableFieldKeyToRule(rule, key, nextValue)
}

export function applyMultiEditFieldsToSafeguardRule(
  rule: SafeguardRule,
  fields: SafeguardMultiEditFields,
  dirtyKeys?: readonly SafeguardFieldKey[],
): SafeguardRule {
  const keys = dirtyKeys && dirtyKeys.length > 0 ? dirtyKeys : SAFEGUARD_FIELD_KEYS
  let nextRule = rule
  for (const key of keys) {
    const field = fields[key]
    if (!field?.dirty) continue
    const updated = applyMultiEditFieldToSafeguardRule(nextRule, key, field)
    if (updated !== nextRule) nextRule = updated
  }
  // Post-apply normalization: substat-dependent fields are meaningless without substats.
  // This mirrors the single-edit constraint in constrainSafeguardSubstats and ensures
  // rules that have no substats are not left with a stale improvement-chance or match setting.
  nextRule = normalizeSafeguardSubstatDependents(nextRule)
  // Faction filters only apply to accessories — fill empty slot scope with all three
  // accessory ids so a multi-edit that picks a faction (or skips it via mutual-exclusivity)
  // can never leave a rule in an internally inconsistent state at save time.
  nextRule = normalizeSafeguardFactionSlotScope(nextRule)
  // Drop bare exclusions on implicit-any selections (no include + no metaset);
  // HSF cannot express "all sets except X" so the NOT is silently ignored.
  nextRule = pruneRuleImplicitAnyExclusions(nextRule)
  return nextRule
}

// Per-rule wrapper around the shared implicit-any prune: an exclusion only
// survives when an explicit set or a metaset constrains the pool.
function pruneRuleImplicitAnyExclusions(rule: SafeguardRule): SafeguardRule {
  const combo = rule.combination
  const hasMetaset = (combo.metaSetNames?.length ?? 0) > 0
  const next = pruneImplicitAnyExclusions(combo.sets ?? [], hasMetaset)
  if (areSetSelectionsEqual(combo.sets ?? [], next)) return rule
  return { ...rule, combination: { ...combo, sets: next } }
}


function applyPatchForKey(
  rule: SafeguardRule,
  key: SafeguardFieldKey,
  patch: SafeguardMultiEditFieldPatch<SafeguardFieldKey>,
): SafeguardRule {
  switch (key) {
    case 'tags':
      return applyTagsPatch(rule, patch as MultiEditArrayPatch<string>)
    case 'slots':
      return applySlotsPatch(rule, patch as MultiEditArrayPatch<ArtifactTypeId>)
    case 'sets':
      return applySetsPatch(rule, patch as MultiEditArrayPatch<ArtifactSetSelectionEntry>)
    case 'metaSetNames':
      return applyMetaSetNamesPatch(rule, patch as MultiEditArrayPatch<string>)
    case 'ranks':
      return applyRanksPatch(rule, patch as MultiEditArrayPatch<RankValue>)
    case 'rarities':
      return applyRaritiesPatch(rule, patch as MultiEditArrayPatch<RankValue>)
    case 'mainStats':
      return applyMainStatsPatch(rule, patch as MultiEditArrayPatch<StatVariant>)
    case 'factions':
      return applyFactionsPatch(rule, patch as MultiEditArrayPatch<FactionId>)
    case 'substats':
      return applySubstatsPatch(rule, patch as MultiEditArrayPatch<StatVariant>)
    default:
      return rule
  }
}

// ── array patch helpers ───────────────────────────────────────────────────────

function applySlotsPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<ArtifactTypeId>): SafeguardRule {
  // Mutual exclusivity guard: introducing an artifact slot on a rule that already has
  // a faction selected would create an internally inconsistent combination (the
  // single-edit sanitizeCombinationForSlots would never emit). Skip per-rule so
  // mixed-state multi-edit clicks only apply to compatible rules.
  if ((rule.combination.factions?.length ?? 0) > 0
    && slotPatchIntroducesArtifact(patch as { add?: readonly number[]; replace?: readonly number[] })) {
    return rule
  }
  const current = Array.isArray(rule.combination.slots) ? rule.combination.slots.map(Number) : []
  const next = applyNumberArrayPatch(current, patch)
  if (arraysNumEqual(current, next)) return rule
  return { ...rule, combination: { ...rule.combination, slots: next as ArtifactTypeId[] } }
}

function applyRanksPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<RankValue>): SafeguardRule {
  const current = Array.isArray(rule.combination.ranks) ? rule.combination.ranks.map(Number) : []
  const next = applyNumberArrayPatch(current, patch)
  if (arraysNumEqual(current, next)) return rule
  return { ...rule, combination: { ...rule.combination, ranks: next as RankValue[] } }
}

function applyRaritiesPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<RankValue>): SafeguardRule {
  const current = Array.isArray(rule.combination.rarities) ? rule.combination.rarities.map(Number) : []
  const next = applyNumberArrayPatch(current, patch)
  if (arraysNumEqual(current, next)) return rule
  return { ...rule, combination: { ...rule.combination, rarities: next as RankValue[] } }
}

function applyMainStatsPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<StatVariant>): SafeguardRule {
  const current = Array.isArray(rule.combination.mainStats) ? rule.combination.mainStats.map(Number) : []
  const next = applyNumberArrayPatch(current, patch)
  if (arraysNumEqual(current, next)) return rule
  return { ...rule, combination: { ...rule.combination, mainStats: next as StatVariant[] } }
}

function applyFactionsPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<FactionId>): SafeguardRule {
  const current = Array.isArray(rule.combination.factions) ? rule.combination.factions.map(Number) : []
  const next = applyNumberArrayPatch(current, patch)
  if (arraysNumEqual(current, next)) return rule
  // Symmetric guard: if applying the patch would yield a non-empty factions list on
  // a rule whose slot scope includes any artifact piece, skip — the rule keeps both
  // its artifact slot(s) and its existing factions instead of one silently overwriting
  // the other.
  const hasArtifactSlot = (rule.combination.slots ?? []).some((s) => !isAccessorySlot(s))
  if (hasArtifactSlot && next.length > 0) return rule
  return { ...rule, combination: { ...rule.combination, factions: next as FactionId[] } }
}

function applySubstatsPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<StatVariant>): SafeguardRule {
  const current = Array.isArray(rule.substats) ? rule.substats.map(Number) : []
  const next = applyNumberArrayPatch(current, patch)
  if (arraysNumEqual(current, next)) return rule
  return { ...rule, substats: next as StatVariant[] }
}

function applySetsPatch(
  rule: SafeguardRule,
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): SafeguardRule {
  const current = normalizeArtifactSetSelections(rule.combination.sets ?? [])
  const next = applySetSelectionPatch(current, patch)
  if (areSetSelectionsEqual(current, next)) return rule
  return { ...rule, combination: { ...rule.combination, sets: next } }
}

function applySetSelectionPatch(
  current: readonly ArtifactSetSelectionEntry[],
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): ArtifactSetSelectionEntry[] {
  if (patch.clear) return []
  if (patch.replace && patch.replace.length >= 0) {
    return normalizeArtifactSetSelections(patch.replace)
  }
  const removeIds = new Set(
    normalizeArtifactSetSelections(patch.remove ?? []).map((e) => Number(e.id)),
  )
  const filtered = current.filter((e) => !removeIds.has(Number(e.id)))
  const adds = normalizeArtifactSetSelections(patch.add ?? [])
  return normalizeArtifactSetSelections([...filtered, ...adds])
}

function applyTagsPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<string>): SafeguardRule {
  // Tags are order-preserving; use string-patch but without the locale sort to
  // keep user-specified insertion order intact.
  const current = Array.isArray(rule.tags) ? rule.tags.map(String) : []
  const next = applyTagsStringPatch(current, patch)
  if (arraysStrEqual(current, next)) return rule
  return { ...rule, tags: next }
}

function applyMetaSetNamesPatch(rule: SafeguardRule, patch: MultiEditArrayPatch<string>): SafeguardRule {
  const current = Array.isArray(rule.combination.metaSetNames) ? rule.combination.metaSetNames.map(String) : []
  const next = applyStringArrayPatch(current, patch)
  if (arraysStrEqual(current, next)) return rule
  return { ...rule, combination: { ...rule.combination, metaSetNames: next } }
}

// ── low-level array patch ────────────────────────────────────────────────────

function applyNumberArrayPatch(
  source: readonly number[],
  patch: MultiEditArrayPatch<number>,
): number[] {
  if (patch.clear) return []
  if (patch.replace !== undefined) {
    return Array.from(new Set(patch.replace.map(Number))).sort((a, b) => a - b)
  }
  const set = new Set<number>(source.map(Number))
  if (patch.remove) { for (const v of patch.remove) set.delete(Number(v)) }
  if (patch.add) { for (const v of patch.add) set.add(Number(v)) }
  return Array.from(set).sort((a, b) => a - b)
}

function applyStringArrayPatch(
  source: readonly string[],
  patch: MultiEditArrayPatch<string>,
): string[] {
  if (patch.clear) return []
  if (patch.replace !== undefined) {
    return Array.from(new Set(patch.replace.map(String))).sort((a, b) => a.localeCompare(b))
  }
  const set = new Set<string>(source.map(String))
  if (patch.remove) { for (const v of patch.remove) set.delete(String(v)) }
  if (patch.add) { for (const v of patch.add) set.add(String(v)) }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

// Order-preserving variant used for tags (user-specified insertion order is meaningful).
function applyTagsStringPatch(
  source: readonly string[],
  patch: MultiEditArrayPatch<string>,
): string[] {
  if (patch.clear) return []
  if (patch.replace !== undefined) {
    // Dedupe while preserving order of first appearance.
    const seen = new Set<string>()
    const out: string[] = []
    for (const v of patch.replace) {
      const s = String(v)
      if (!seen.has(s)) { seen.add(s); out.push(s) }
    }
    return out
  }
  const removeSet = new Set<string>((patch.remove ?? []).map(String))
  const filtered = source.filter((v) => !removeSet.has(String(v)))
  const existingSet = new Set<string>(filtered.map(String))
  const added: string[] = []
  for (const v of (patch.add ?? [])) {
    const s = String(v)
    if (!existingSet.has(s)) { existingSet.add(s); added.push(s) }
  }
  return [...filtered, ...added]
}

function arraysNumEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (Number(a[i]) !== Number(b[i])) return false
  }
  return true
}

function arraysStrEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]) !== String(b[i])) return false
  }
  return true
}

// ── rule cloning ──────────────────────────────────────────────────────────────

/**
 * cloneSafeguardRuleForSelection
 *
 * Creates a deep-enough clone that selection identity checks never produce
 * false positives when the same rule ID appears with different field values.
 * Delegates to the canonical cloneSafeguardCombination for the combination blob.
 */
export function cloneSafeguardRuleForSelection(source: SafeguardRule): SafeguardRule {
  return {
    ...source,
    combination: cloneSafeguardCombination(source.combination),
    countMode: { ...source.countMode },
    ...(source.group ? { group: cloneSafeguardGroupSettings(source.group) } : {}),
    substats: [...(source.substats ?? [])],
    substatWeights: { ...(source.substatWeights ?? {}) },
    // Detach tags so selection snapshots are isolated.
    tags: [...(source.tags ?? [])],
  }
}
