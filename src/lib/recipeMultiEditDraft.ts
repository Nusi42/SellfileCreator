/**
 * multiEditDraft.ts
 *
 * Helper utilities for deriving and tracking multi-recipe edit state. A draft
 * represents the combined view of the currently selected recipes so the UI can
 * surface mixed fields and staged overrides before applying changes.
 */
import type { BuilderRecipe, SubstatRollTargetEntry } from './hsfBuilder'
// Roll-target normalization/equality have one definition (variant-aware, quantizer-backed).
import { normalizeRollTargetEntry, targetEntriesEqual } from './hsfBuilder'
import { normalizeKeepMode, canEnableSubstatFlex, normalizeAutoRaritySupplements, normalizeLevelWindow, normalizeAutoSubstatFlex, countPositiveSubstats, normalizeFactionSlotScope } from './recipeNormalization'
import { isAccessorySlot, slotPatchIntroducesArtifact } from './gearInspectorDomain'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { normalizeArtifactSetSelections, pruneImplicitAnyExclusions } from './gearSets/selection'
import type { NameAppearance } from './nameAppearance'

// Virtual sub-keys for appearance — tracked independently so name and fgColor each have
// their own mixed/dirty state. Not real keys of BuilderRecipe; read/write via helpers below.
export const BUILDER_FIELD_KEYS = [
  'appearanceName',   // maps to recipe.appearance?.name ?? ''
  'appearanceFgColor', // maps to recipe.appearance?.fgColor
  'tags',
  // Behaviour flags: plain values, so they need no patch shape (same as `keep` below).
  'ignoredBySafeguards',
  'reworkGate',
  'keep',
  'exportMode',
  'rankCode',
  'rarityCode',
  'rarityMode',
  'autoRaritySupplementsThreshold',
  'factionCode',
  'mainStatsV',
  'minLevel',
  'maxLevel',
  'earlyKeepMode',
  'substatsV',
  'fixedSubstatsV',
  'substatRollBoundsV',
  'substatRollTargetsV',
  'minCount',
  'autoMinCount',
  'autoSubstatFlex',
  'minRequiredRolls',
  'autoMinRequiredRolls',
  'lockedMinRequiredRolls',
  'artifactTypes',
  'artifactSets',
  'artifactMetaSets',
] as const  // no satisfies constraint — virtual sub-keys can't satisfy keyof BuilderRecipe

export type BuilderFieldKey = typeof BUILDER_FIELD_KEYS[number]

/**
 * Maps each BuilderFieldKey to the value type it carries.
 * Virtual sub-keys (`appearanceName`, `appearanceFgColor`) are not real properties
 * of BuilderRecipe; read/write via getRecipeFieldValue / setRecipeFieldValue.
 */
export type BuilderFieldValue<K extends BuilderFieldKey> =
  K extends 'appearanceName' ? string :
  K extends 'appearanceFgColor' ? string | undefined :
  K extends keyof BuilderRecipe ? BuilderRecipe[K] :
  never

export type MultiEditStatus = 'common' | 'mixed'

export interface MultiEditArrayPatch<T> {
  add?: readonly T[] | undefined
  remove?: readonly T[] | undefined
  replace?: readonly T[] | undefined
  clear?: boolean | undefined
}

export interface MultiEditRollPatchEntry {
  min?: number | null | undefined
  max?: number | null | undefined
  any?: boolean | null | undefined
  not?: boolean | null | undefined
}

export type MultiEditRollPatch = Record<number, MultiEditRollPatchEntry>

export interface MultiEditTargetPatchEntry {
  value?: SubstatRollTargetEntry | null | undefined
}

// Variant-keyed diff for per-substat target overrides. Each entry mirrors
// the Builder UI payload (base plus increments) so edits can be merged without
// perturbing untouched stats.
export type MultiEditTargetPatch = Record<number, MultiEditTargetPatchEntry>

type FieldPatchByKey = {
  tags: MultiEditArrayPatch<string>
  mainStatsV: MultiEditArrayPatch<number>
  substatsV: MultiEditArrayPatch<number>
  fixedSubstatsV: MultiEditArrayPatch<number>
  substatRollBoundsV: MultiEditRollPatch
  substatRollTargetsV: MultiEditTargetPatch
  artifactTypes: MultiEditArrayPatch<number>
  artifactSets: MultiEditArrayPatch<ArtifactSetSelectionEntry>
  artifactMetaSets: MultiEditArrayPatch<string>
}

export type MultiEditFieldPatch<K extends BuilderFieldKey> = K extends keyof FieldPatchByKey
  ? FieldPatchByKey[K]
  : never

export interface MultiEditFieldState {
  status: MultiEditStatus
  value: unknown
  dirty: boolean
  initialStatus: MultiEditStatus
  initialValue: unknown
  mixedValues: unknown[] | null
  initialMixedValues: unknown[] | null
  patch: MultiEditFieldPatch<BuilderFieldKey> | null
}

export type MultiEditFields = Record<BuilderFieldKey, MultiEditFieldState>

export interface MultiEditDraftState {
  selection: number[]
  fields: MultiEditFields
}

export interface MultiEditFieldCommit<T, K extends BuilderFieldKey = BuilderFieldKey> {
  value: T
  status?: MultiEditStatus
  mixedValues?: T[] | null
  patch?: MultiEditFieldPatch<K> | null | undefined
}

export type MultiEditUpdateFn = <K extends BuilderFieldKey>(
  key: K,
  commit: MultiEditFieldCommit<BuilderFieldValue<K>, K>,
) => void

export type MultiEditResetFn = (key: BuilderFieldKey) => void
export type MultiEditResetAllFn = () => void

export interface MultiEditDraftHandle {
  state: MultiEditDraftState
  updateField: MultiEditUpdateFn
  resetField: MultiEditResetFn
  resetAll: MultiEditResetAllFn
}

export function getDirtyBuilderFieldKeys(fields: MultiEditFields | null | undefined): BuilderFieldKey[] {
  if (!fields) return []
  const dirty: BuilderFieldKey[] = []
  for (const key of BUILDER_FIELD_KEYS) {
    const field = fields[key]
    if (field?.dirty) dirty.push(key)
  }
  return dirty
}

export function createMultiEditDraft(recipes: BuilderRecipe[], selection: number[]): MultiEditDraftState {
  if (recipes.length === 0) {
    throw new Error('createMultiEditDraft: expected at least one recipe')
  }
  const fields = {} as MultiEditFields
  for (const key of BUILDER_FIELD_KEYS) {
    fields[key] = createFieldStateForKey(recipes, key)
  }
  return {
    selection: selection.slice(),
    fields,
  }
}

export function syncMultiEditDraft(previous: MultiEditDraftState | null, base: MultiEditDraftState): MultiEditDraftState {
  if (previous == null) return base
  if (!areSelectionsIdentical(previous.selection, base.selection)) return base
  const fields = {} as MultiEditFields
  for (const key of BUILDER_FIELD_KEYS) {
    const prevField = previous.fields[key]
    const baseField = base.fields[key]
    if (!prevField.dirty) {
      fields[key] = baseField
      continue
    }
    // Only collapse to the base draft when there is no patch staged.
    // Why: tag edits often keep the same value/status but rely on patch diffs.
    const matchesBase = prevField.patch == null
      && prevField.status === baseField.initialStatus
      && areBuilderFieldValuesEqual(key, prevField.value, baseField.initialValue)
    fields[key] = matchesBase
      ? baseField
      : {
          ...prevField,
          initialStatus: baseField.initialStatus,
          initialValue: baseField.initialValue,
          initialMixedValues: cloneMixedValues(key, baseField.initialMixedValues),
        }
  }
  return {
    selection: base.selection,
    fields,
  }
}

export function areSelectionsIdentical(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function areBuilderFieldValuesEqual(key: BuilderFieldKey, left: unknown, right: unknown): boolean {
  if (left === right) return true
  if ((left == null) || (right == null)) return left === right
  switch (key) {
    case 'tags':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'artifactTypes':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'artifactSets':
      return areArtifactSetSelectionsEqual(left, right)
    case 'artifactMetaSets':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'substatRollBoundsV':
      return areRollBoundsEqual(
        left as BuilderRecipe['substatRollBoundsV'],
        right as BuilderRecipe['substatRollBoundsV'],
      )
    case 'substatRollTargetsV':
      return areRollTargetsEqual(
        left as BuilderRecipe['substatRollTargetsV'],
        right as BuilderRecipe['substatRollTargetsV'],
      )
    default:
      return left === right
  }
}

export function cloneBuilderFieldValue(key: BuilderFieldKey, value: unknown): unknown {
  if (value == null) return value
  switch (key) {
    case 'tags':
      return Array.isArray(value) ? [...value] : value
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
      return Array.isArray(value) ? [...value] : value
    case 'artifactSets':
      return cloneArtifactSetSelections(value)
    case 'artifactMetaSets':
      return Array.isArray(value) ? [...value] : value
    case 'substatRollBoundsV':
      return cloneRollBounds(value as SubstatRollBounds)
    case 'substatRollTargetsV':
      return cloneRollTargets(value as BuilderRecipe['substatRollTargetsV'])
    default:
      if (Array.isArray(value)) {
        return [...value]
      }
      if (typeof value === 'object') {
        return { ...(value as Record<string, unknown>) }
      }
      return value
  }
}

/**
 * Read a field value from a recipe, including virtual sub-keys that are not
 * real properties of BuilderRecipe (appearanceName, appearanceFgColor).
 */
export function getRecipeFieldValue(recipe: BuilderRecipe, key: BuilderFieldKey): unknown {
  if (key === 'appearanceName') return recipe.appearance?.name ?? ''
  if (key === 'appearanceFgColor') return recipe.appearance?.fgColor
  return recipe[key as keyof BuilderRecipe]
}

/**
 * Write a field value back into a recipe, composing appearance from its
 * virtual sub-keys to preserve the peer sub-field on the existing recipe.
 */
function setRecipeFieldValue(recipe: BuilderRecipe, key: BuilderFieldKey, value: unknown): BuilderRecipe {
  if (key === 'appearanceName') {
    const name = (value as string) ?? ''
    const fgColor = recipe.appearance?.fgColor
    const next: NameAppearance | undefined = (name || fgColor) ? { name, ...(fgColor ? { fgColor } : {}) } : undefined
    const base = { ...recipe }
    if (next) return { ...base, appearance: next }
    delete (base as { appearance?: NameAppearance }).appearance
    return base
  }
  if (key === 'appearanceFgColor') {
    const fgColor = value as string | undefined
    const name = recipe.appearance?.name ?? ''
    const next: NameAppearance | undefined = (name || fgColor) ? { name, ...(fgColor ? { fgColor } : {}) } : undefined
    const base = { ...recipe }
    if (next) return { ...base, appearance: next }
    delete (base as { appearance?: NameAppearance }).appearance
    return base
  }
  return { ...recipe, [key]: value }
}

/**
 * cloneBuilderRecipe
 *
 * Creates a field-aware clone so recipes stored elsewhere never share object
 * identity. Selection logic tracks entries by reference, so duplicate recipes
 * must receive fresh objects even when their payloads match.
 */
export function cloneBuilderRecipe(source: BuilderRecipe): BuilderRecipe {
  let clone: BuilderRecipe = { ...source }
  for (const key of BUILDER_FIELD_KEYS) {
    const rawValue = getRecipeFieldValue(source, key)
    if (rawValue === undefined && key !== 'appearanceFgColor') continue
    const clonedValue = cloneBuilderFieldValue(key, rawValue)
    clone = setRecipeFieldValue(clone, key, clonedValue)
  }
  return clone
}

function createFieldStateForKey(recipes: BuilderRecipe[], key: BuilderFieldKey): MultiEditFieldState {
  const first = recipes[0]!
  const firstValue = getRecipeFieldValue(first, key)
  const uniqueValues = collectUniqueValues(recipes, key)
  const status: MultiEditStatus = uniqueValues.length > 1 ? 'mixed' : 'common'
  const clonedValue = cloneBuilderFieldValue(key, firstValue)
  const initialValue = cloneBuilderFieldValue(key, firstValue)
  const mixedValues = status === 'mixed' ? cloneMixedValues(key, uniqueValues) : null
  const initialMixedValues = mixedValues ? cloneMixedValues(key, mixedValues) : null
  return {
    status,
    value: clonedValue,
    dirty: false,
    initialStatus: status,
    initialValue,
    mixedValues,
    initialMixedValues,
    patch: null,
  }
}

function arePrimitiveArraysEqual<T>(left: readonly T[] | undefined, right: readonly T[] | undefined): boolean {
  const a = left ?? []
  const b = right ?? []
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const normalizeArtifactSetSelectionEntries = (value: unknown): ArtifactSetSelectionEntry[] => (
  // Normalize to canonical entry objects so comparisons stay stable.
  // Only arrays can contain selection entries; everything else maps to empty.
  normalizeArtifactSetSelections(Array.isArray(value) ? value : [])
)

const areArtifactSetSelectionsEqual = (left: unknown, right: unknown): boolean => {
  // Normalize both sides so order and legacy formats compare correctly.
  const leftNorm = normalizeArtifactSetSelectionEntries(left)
  const rightNorm = normalizeArtifactSetSelectionEntries(right)
  if (leftNorm.length !== rightNorm.length) return false
  for (let i = 0; i < leftNorm.length; i += 1) {
    const leftEntry = leftNorm[i]!
    const rightEntry = rightNorm[i]!
    if (Number(leftEntry.id) !== Number(rightEntry.id)) return false
    if (Boolean(leftEntry.excluded) !== Boolean(rightEntry.excluded)) return false
  }
  return true
}

const cloneArtifactSetSelections = (value: unknown): ArtifactSetSelectionEntry[] => {
  // Normalize first so every entry has a consistent shape.
  const normalized = normalizeArtifactSetSelectionEntries(value)
  // Clone entries so recipes never share object references.
  return normalized.map((entry) => (
    entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id }
  ))
}

function areRollBoundsEqual(
  left: BuilderRecipe['substatRollBoundsV'],
  right: BuilderRecipe['substatRollBoundsV'],
): boolean {
  const a = normalizeRollBounds(left)
  const b = normalizeRollBounds(right)
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    const idx = Number(key)
    const leftEntry = a[idx]!
    const rightEntry = b[idx]!
    if (leftEntry.min !== rightEntry.min) return false
    if (leftEntry.max !== rightEntry.max) return false
    if (leftEntry.any !== rightEntry.any) return false
  }
  return true
}

function collectUniqueValues(recipes: BuilderRecipe[], key: BuilderFieldKey): unknown[] {
  const unique: unknown[] = []
  outer: for (const recipe of recipes) {
    const candidate = getRecipeFieldValue(recipe, key)
    for (const existing of unique) {
      if (areBuilderFieldValuesEqual(key, existing, candidate)) {
        continue outer
      }
    }
    unique.push(candidate)
  }
  return unique
}

function cloneMixedValues(key: BuilderFieldKey, values: unknown[] | null): unknown[] | null {
  if (!values || values.length === 0) return null
  return values.map((entry) => cloneBuilderFieldValue(key, entry))
}

export function cloneFieldPatch<K extends BuilderFieldKey>(
  key: K,
  patch: MultiEditFieldPatch<K> | null | undefined,
): MultiEditFieldPatch<K> | null {
  if (!patch) return null
  switch (key) {
    case 'tags':
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactMetaSets':
      return cloneArrayPatch(patch as MultiEditArrayPatch<unknown>) as MultiEditFieldPatch<K>
    case 'artifactSets':
      return cloneArtifactSetPatch(patch as MultiEditArrayPatch<ArtifactSetSelectionEntry>) as MultiEditFieldPatch<K>
    case 'substatRollBoundsV':
      return cloneRollPatch(patch as MultiEditRollPatch) as MultiEditFieldPatch<K>
    case 'substatRollTargetsV':
      return cloneTargetPatch(patch as MultiEditTargetPatch) as MultiEditFieldPatch<K>
    default:
      return patch
  }
}

function cloneArrayPatch<T>(patch: MultiEditArrayPatch<T>): MultiEditArrayPatch<T> {
  return {
    add: patch.add ? [...patch.add] as readonly T[] : undefined,
    remove: patch.remove ? [...patch.remove] as readonly T[] : undefined,
    replace: patch.replace ? [...patch.replace] as readonly T[] : undefined,
    clear: patch.clear === true ? true : undefined,
  }
}

function cloneArtifactSetPatch(
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): MultiEditArrayPatch<ArtifactSetSelectionEntry> {
  return {
    // Clone each list so patches never share references.
    add: patch.add ? cloneArtifactSetSelections(patch.add) : undefined,
    remove: patch.remove ? cloneArtifactSetSelections(patch.remove) : undefined,
    replace: patch.replace ? cloneArtifactSetSelections(patch.replace) : undefined,
    clear: patch.clear === true ? true : undefined,
  }
}

function cloneRollPatch(patch: MultiEditRollPatch): MultiEditRollPatch {
  const result: MultiEditRollPatch = {}
  for (const [key, entry] of Object.entries(patch)) {
    const idx = Number(key)
    result[idx] = { ...entry }
  }
  return result
}

function isArrayPatchEmpty<T>(patch: MultiEditArrayPatch<T> | null | undefined): boolean {
  if (!patch) return true
  if (patch.clear) return false
  if (patch.replace && patch.replace.length > 0) return false
  if (patch.add && patch.add.length > 0) return false
  if (patch.remove && patch.remove.length > 0) return false
  return true
}

function isRollPatchEmpty(patch: MultiEditRollPatch | null | undefined): boolean {
  if (!patch) return true
  for (const entry of Object.values(patch)) {
    if (entry == null) continue
    if (entry.any !== undefined) return false
    if (entry.min !== undefined) return false
    if (entry.max !== undefined) return false
    if (entry.not !== undefined) return false
  }
  return true
}

export function normalizeFieldPatch<K extends BuilderFieldKey>(
  key: K,
  patch: MultiEditFieldPatch<K> | null | undefined,
): MultiEditFieldPatch<K> | null {
  if (!patch) return null
  switch (key) {
    case 'tags':
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactSets':
    case 'artifactMetaSets':
      return isArrayPatchEmpty(patch as MultiEditArrayPatch<unknown>) ? null : patch
    case 'substatRollBoundsV':
      return isRollPatchEmpty(patch as MultiEditRollPatch) ? null : patch
    case 'substatRollTargetsV':
      return isTargetPatchEmpty(patch as MultiEditTargetPatch) ? null : patch
    default:
      return patch
  }
}

export function areFieldPatchesEqual<K extends BuilderFieldKey>(
  key: K,
  left: MultiEditFieldPatch<K> | null,
  right: MultiEditFieldPatch<K> | null,
): boolean {
  if (left === right) return true
  if (!left || !right) return !left && !right
  switch (key) {
    case 'tags':
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactMetaSets':
      return areArrayPatchesEqual(left as MultiEditArrayPatch<unknown>, right as MultiEditArrayPatch<unknown>)
    case 'artifactSets':
      return areArtifactSetPatchesEqual(
        left as MultiEditArrayPatch<ArtifactSetSelectionEntry>,
        right as MultiEditArrayPatch<ArtifactSetSelectionEntry>,
      )
    case 'substatRollBoundsV':
      return areRollPatchesEqual(left as MultiEditRollPatch, right as MultiEditRollPatch)
    case 'substatRollTargetsV':
      return areTargetPatchesEqual(left as MultiEditTargetPatch, right as MultiEditTargetPatch)
    default:
      return left === right
  }
}

function areArrayPatchesEqual<T>(left: MultiEditArrayPatch<T>, right: MultiEditArrayPatch<T>): boolean {
  if (left.clear !== right.clear) return false
  if (!arraysShallowEqual(left.replace, right.replace)) return false
  if (!arraysShallowEqual(left.add, right.add)) return false
  if (!arraysShallowEqual(left.remove, right.remove)) return false
  return true
}

function areArtifactSetEntryArraysEqual(
  left: readonly ArtifactSetSelectionEntry[] | undefined,
  right: readonly ArtifactSetSelectionEntry[] | undefined,
): boolean {
  // Normalize both sides so legacy formats and ordering do not matter.
  const leftNorm = normalizeArtifactSetSelectionEntries(left)
  const rightNorm = normalizeArtifactSetSelectionEntries(right)
  if (leftNorm.length !== rightNorm.length) return false
  for (let i = 0; i < leftNorm.length; i += 1) {
    const leftEntry = leftNorm[i]!
    const rightEntry = rightNorm[i]!
    if (Number(leftEntry.id) !== Number(rightEntry.id)) return false
    if (Boolean(leftEntry.excluded) !== Boolean(rightEntry.excluded)) return false
  }
  return true
}

function areArtifactSetPatchesEqual(
  left: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
  right: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): boolean {
  if (left.clear !== right.clear) return false
  if (!areArtifactSetEntryArraysEqual(left.replace, right.replace)) return false
  if (!areArtifactSetEntryArraysEqual(left.add, right.add)) return false
  if (!areArtifactSetEntryArraysEqual(left.remove, right.remove)) return false
  return true
}

function areRollPatchesEqual(left: MultiEditRollPatch, right: MultiEditRollPatch): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    const l = left[Number(key)] ?? {}
    const r = right[Number(key)] ?? {}
    if (l.any !== r.any) return false
    if (l.min !== r.min) return false
    if (l.max !== r.max) return false
    if (l.not !== r.not) return false
  }
  return true
}

// Deep clone to keep the draft immutable snapshots safe across renders and to
// ensure we never share references with BuilderRecipe.
function cloneTargetPatch(patch: MultiEditTargetPatch): MultiEditTargetPatch {
  const result: MultiEditTargetPatch = {}
  for (const [key, entry] of Object.entries(patch)) {
    const idx = Number(key)
    if (!entry) {
      result[idx] = {}
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
      result[idx] = {}
      continue
    }
    const value = entry.value
    if (value == null) {
      result[idx] = { value: null }
      continue
    }
    result[idx] = {
      value: {
        ...(typeof value.base === 'number' ? { base: value.base } : {}),
        ...(Array.isArray(value.increments)
          ? { increments: value.increments.map((v) => (v == null ? null : Number(v))) }
          : {}),
      },
    }
  }
  return result
}

function isTargetPatchEmpty(patch: MultiEditTargetPatch | null | undefined): boolean {
  if (!patch) return true
  for (const entry of Object.values(patch)) {
    if (!entry) continue
    if (entry.value !== undefined) return false
  }
  return true
}

function areTargetPatchesEqual(
  left: MultiEditTargetPatch,
  right: MultiEditTargetPatch,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false
    const idx = Number(key)
    const leftEntry = left[idx]?.value
    const rightEntry = right[idx]?.value
    if (leftEntry === undefined && rightEntry === undefined) continue
    // The patch key is the stat variant — compare on that stat's grid.
    if (!targetEntriesEqual(leftEntry ?? null, rightEntry ?? null, idx)) return false
  }
  return true
}

function arraysShallowEqual<T>(left: readonly T[] | undefined, right: readonly T[] | undefined): boolean {
  if (!left && !right) return true
  if (!left || !right) return false
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false
  }
  return true
}


type SubstatRollBounds = NonNullable<BuilderRecipe['substatRollBoundsV']>
type SubstatRollTargetsMap = NonNullable<BuilderRecipe['substatRollTargetsV']>

function cloneRollBounds(source: SubstatRollBounds): SubstatRollBounds {
  const result: SubstatRollBounds = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!entry) continue
    const idx = Number(key)
    result[idx] = { ...entry }
  }
  return result
}

function cloneRollTargets(
  source: BuilderRecipe['substatRollTargetsV'],
): BuilderRecipe['substatRollTargetsV'] {
  if (!source) return source
  const result: SubstatRollTargetsMap = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!entry) continue
    const idx = Number(key)
    const clone: SubstatRollTargetEntry = {}
    if (typeof entry.base === 'number' && Number.isFinite(entry.base)) {
      clone.base = entry.base
    }
    if (Array.isArray(entry.increments)) {
      clone.increments = entry.increments.map((value) => (
        typeof value === 'number' && Number.isFinite(value) ? value : null
      ))
    }
    result[idx] = clone
  }
  return Object.keys(result).length > 0 ? result : {}
}

function normalizeRollBounds(
  source: BuilderRecipe['substatRollBoundsV'],
): SubstatRollBounds {
  if (!source) return {}
  const result: SubstatRollBounds = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!entry) continue
    const idx = Number(key)
    result[idx] = { ...entry }
  }
  return result
}

function areRollTargetsEqual(
  left: BuilderRecipe['substatRollTargetsV'],
  right: BuilderRecipe['substatRollTargetsV'],
): boolean {
  const a = normalizeRollTargets(left)
  const b = normalizeRollTargets(right)
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    const idx = Number(key)
    if (!targetEntriesEqual(a[idx], b[idx], idx)) return false
  }
  return true
}

// Canonicalize target maps before comparing so we avoid spurious dirty
// states when the same numbers are provided in different shapes. The map key IS
// the stat variant, so every entry quantizes on its own grid — multi-edit writes
// land on exactly the values the flyout and SFC ingress would produce.
function normalizeRollTargets(
  source: BuilderRecipe['substatRollTargetsV'],
): SubstatRollTargetsMap {
  if (!source) return {}
  const result: SubstatRollTargetsMap = {}
  for (const [key, entry] of Object.entries(source)) {
    const normalized = normalizeRollTargetEntry(entry as SubstatRollTargetEntry | null | undefined, Number(key))
    if (!normalized) continue
    result[Number(key)] = normalized
  }
  return result
}
export function applyMultiEditFieldToRecipe(
  recipe: BuilderRecipe,
  key: BuilderFieldKey,
  field: MultiEditFieldState,
): BuilderRecipe {
  const patch = field.patch
    ? cloneFieldPatch(key, field.patch as MultiEditFieldPatch<typeof key>)
    : null
  if (patch) {
    // Per-rule mutual-exclusivity guard: a slots patch that introduces an artifact slot
    // on a rule that already has a faction set would silently destroy the faction
    // under the old slots-win normalization. Skip the patch for those rules so the
    // caller's mixed-state click only applies to compatible rules.
    if (key === 'artifactTypes'
      && (recipe.factionCode ?? 0) !== 0
      && slotPatchIntroducesArtifact(patch as { add?: readonly number[]; replace?: readonly number[] })) {
      return recipe
    }
    return applyPatchForKey(recipe, key, patch)
  }
  const nextValue = cloneBuilderFieldValue(key, field.value)
  if (areBuilderFieldValuesEqual(key, getRecipeFieldValue(recipe, key), nextValue)) return recipe
  // Scalar-replace mutual-exclusivity guard mirrors the patch path: skip writes that
  // would force an artifact slot onto a faction-set rule, or a faction onto an
  // artifact-slot rule. Single-edit handlers keep their slots-win/faction-wins
  // normalization; multi-edit prefers per-rule skip to avoid silent data loss.
  if (key === 'artifactTypes'
    && (recipe.factionCode ?? 0) !== 0
    && Array.isArray(nextValue)
    && (nextValue as readonly number[]).some((s) => !isAccessorySlot(s))) {
    return recipe
  }
  if (key === 'factionCode'
    && typeof nextValue === 'number'
    && nextValue !== 0
    && (recipe.artifactTypes ?? []).some((s) => !isAccessorySlot(s))) {
    return recipe
  }
  let nextRecipe: BuilderRecipe = setRecipeFieldValue(recipe, key, nextValue)
  switch (key) {
    case 'autoMinCount':
    case 'minCount':
      nextRecipe = normalizeAutoSubstatFlex(nextRecipe)
      break
    case 'autoSubstatFlex':
      if (nextRecipe.autoSubstatFlex && !canEnableSubstatFlex(nextRecipe)) {
        nextRecipe = { ...nextRecipe, autoSubstatFlex: false }
      }
      break
    case 'autoMinRequiredRolls':
    case 'minRequiredRolls':
      nextRecipe = normalizeKeepMode(nextRecipe)
      nextRecipe = normalizeAutoRaritySupplements(nextRecipe)
      nextRecipe = normalizeAutoSubstatFlex(nextRecipe)
      break
    case 'earlyKeepMode':
    case 'rarityMode':
    case 'autoRaritySupplementsThreshold':
      nextRecipe = normalizeAutoRaritySupplements(nextRecipe)
      break
    case 'minLevel':
    case 'maxLevel':
      nextRecipe = normalizeLevelWindow(nextRecipe)
      break
    default:
      break
  }
  return nextRecipe
}

export function applyMultiEditFieldsToRecipe(
  recipe: BuilderRecipe,
  fields: MultiEditFields,
  dirtyKeys?: readonly BuilderFieldKey[],
): BuilderRecipe {
  const keys = dirtyKeys && dirtyKeys.length > 0 ? dirtyKeys : BUILDER_FIELD_KEYS
  if (keys.length === 0) return recipe
  let nextRecipe = recipe
  for (const key of keys) {
    const field = fields[key]
    if (!field?.dirty) continue
    const updated = applyMultiEditFieldToRecipe(nextRecipe, key, field)
    if (updated !== nextRecipe) {
      nextRecipe = updated
    }
  }
  // Post-apply: enforce faction→accessory-slots invariant. Per-field application
  // skips conflicting writes (faction-set recipes don't gain artifact slots), so the
  // only case this normalizer fires for is "faction set, slots empty" — fill in
  // all three accessories so the saved recipe is internally consistent.
  nextRecipe = normalizeFactionSlotScope(nextRecipe)
  // Drop bare exclusions on implicit-any selections (no include + no metaset);
  // HSF cannot express "all sets except X" so the NOT is silently ignored.
  nextRecipe = pruneRecipeImplicitAnyExclusions(nextRecipe)
  return nextRecipe
}

// Per-recipe wrapper around the shared implicit-any prune: an exclusion only
// survives when an explicit set or a metaset constrains the pool.
function pruneRecipeImplicitAnyExclusions(recipe: BuilderRecipe): BuilderRecipe {
  const hasMetaset = (recipe.artifactMetaSets?.length ?? 0) > 0
  const next = pruneImplicitAnyExclusions(recipe.artifactSets, hasMetaset)
  if (areArtifactSetSelectionsEqual(normalizeArtifactSetSelections(recipe.artifactSets), next)) return recipe
  return { ...recipe, artifactSets: next }
}

function applyPatchForKey<K extends BuilderFieldKey>(
  recipe: BuilderRecipe,
  key: K,
  patch: MultiEditFieldPatch<K>,
): BuilderRecipe {
  switch (key) {
    case 'tags':
      return applyTagsPatch(recipe, patch as MultiEditArrayPatch<string>)
    case 'mainStatsV':
      return applyMainStatsPatch(recipe, patch as MultiEditArrayPatch<number>)
    case 'substatsV':
      return applySubstatsPatch(recipe, patch as MultiEditArrayPatch<number>)
    case 'fixedSubstatsV':
      return applyFixedSubstatsPatch(recipe, patch as MultiEditArrayPatch<number>)
    case 'substatRollBoundsV':
      return applySubstatRollPatch(recipe, patch as MultiEditRollPatch)
    case 'substatRollTargetsV':
      return applyTargetPatch(recipe, patch as MultiEditTargetPatch)
    case 'artifactTypes':
      return applyArtifactTypesPatch(recipe, patch as MultiEditArrayPatch<number>)
    case 'artifactSets':
      return applyArtifactSetsPatch(recipe, patch as MultiEditArrayPatch<ArtifactSetSelectionEntry>)
    case 'artifactMetaSets':
      return applyArtifactMetaSetsPatch(recipe, patch as MultiEditArrayPatch<string>)
    default:
      return recipe
  }
}

function applyMainStatsPatch(recipe: BuilderRecipe, patch: MultiEditArrayPatch<number>): BuilderRecipe {
  const current = Array.isArray(recipe.mainStatsV) ? recipe.mainStatsV.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  if (arraysEqualNumber(current, next)) return recipe
  return { ...recipe, mainStatsV: next }
}

function applySubstatsPatch(recipe: BuilderRecipe, patch: MultiEditArrayPatch<number>): BuilderRecipe {
  const current = Array.isArray(recipe.substatsV) ? recipe.substatsV.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  const currentSet = new Set<number>(current)
  const nextSet = new Set<number>(next)
  const added = next.filter(v => !currentSet.has(v))

  let nextFixed = Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV.filter(v => nextSet.has(Number(v))) : []
  // Remove duplicates
  nextFixed = Array.from(new Set(nextFixed.map(Number))).sort((a, b) => a - b)

  const boundsSource = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
  const nextBounds: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> = {}
  for (const [key, value] of Object.entries(boundsSource)) {
    const idx = Number(key)
    if (!nextSet.has(idx)) continue
    nextBounds[idx] = { ...value }
  }
  for (const variant of added) {
    nextBounds[variant] = { any: true }
  }
  const prunedBounds = normalizeBoundsObject(nextBounds)

  let nextMinCount = Number(recipe.minCount ?? 0)
  if (patch.clear || next.length === 0) {
    nextMinCount = 0
  } else if (recipe.autoMinCount) {
    nextMinCount = Math.min(4, countPositiveSubstats(next, prunedBounds as Record<number, { not?: boolean }>))
  } else {
    if (nextMinCount === 0 && next.length > 0) nextMinCount = 1
    if (nextMinCount > next.length) nextMinCount = next.length
  }
  nextMinCount = Math.max(0, Math.min(4, nextMinCount))

  let nextRecipe: BuilderRecipe = {
    ...recipe,
    substatsV: next,
    fixedSubstatsV: nextFixed,
    substatRollBoundsV: prunedBounds,
    minCount: nextMinCount as 0 | 1 | 2 | 3 | 4,
  }

  nextRecipe = normalizeKeepMode(nextRecipe)
  nextRecipe = normalizeAutoRaritySupplements(nextRecipe)
  if (nextRecipe.autoSubstatFlex && !canEnableSubstatFlex(nextRecipe)) {
    nextRecipe = { ...nextRecipe, autoSubstatFlex: false }
  }
  return nextRecipe
}

function applyFixedSubstatsPatch(recipe: BuilderRecipe, patch: MultiEditArrayPatch<number>): BuilderRecipe {
  const current = Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV.map(Number) : []
  const selectable = new Set<number>(Array.isArray(recipe.substatsV) ? recipe.substatsV.map(Number) : [])
  const next = applyNumberArrayPatch(current, patch, { sort: true, filter: selectable })
  if (arraysEqualNumber(current, next)) return recipe
  let nextRecipe: BuilderRecipe = { ...recipe, fixedSubstatsV: next }
  if (nextRecipe.autoSubstatFlex && !canEnableSubstatFlex(nextRecipe)) {
    nextRecipe = { ...nextRecipe, autoSubstatFlex: false }
  }
  return nextRecipe
}

function applySubstatRollPatch(recipe: BuilderRecipe, patch: MultiEditRollPatch): BuilderRecipe {
  const selectable = new Set<number>(Array.isArray(recipe.substatsV) ? recipe.substatsV.map(Number) : [])
  const currentBounds = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>
  const nextBounds: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> = {}
  let changed = false
  for (const [key, value] of Object.entries(currentBounds)) {
    const idx = Number(key)
    if (!selectable.has(idx)) {
      changed = true
      continue
    }
    nextBounds[idx] = { ...value }
  }
  for (const [key, entry] of Object.entries(patch)) {
    const idx = Number(key)
    if (!selectable.has(idx)) {
      if (Object.prototype.hasOwnProperty.call(nextBounds, idx)) {
        delete nextBounds[idx]
        changed = true
      }
      continue
    }
    const current = nextBounds[idx] ? { ...nextBounds[idx]! } : {}
    // `not: true` is mutually exclusive — clear all other fields.
    if (entry.not !== undefined) {
      if (entry.not) {
        if (!current.not || current.min !== undefined || current.max !== undefined || current.any) {
          current.not = true
          delete current.min
          delete current.max
          delete current.any
          changed = true
        }
      } else if (current.not) {
        delete current.not
        changed = true
      }
    }
    if (entry.any !== undefined) {
      if (entry.any) {
        if (!current.any || current.min !== undefined || current.max !== undefined || current.not) {
          current.any = true
          delete current.min
          delete current.max
          delete current.not
          changed = true
        }
      } else if (current.any) {
        delete current.any
        changed = true
      }
    }
    if (entry.min !== undefined) {
      if (entry.min == null) {
        if (current.min !== undefined) {
          delete current.min
          changed = true
        }
      } else {
        const clamped = Math.max(0, Math.min(5, Number(entry.min)))
        if (current.min !== clamped) {
          current.min = clamped
          delete current.not
          changed = true
        }
      }
    }
    if (entry.max !== undefined) {
      if (entry.max == null) {
        if (current.max !== undefined) {
          delete current.max
          changed = true
        }
      } else {
        const clamped = Math.max(0, Math.min(4, Number(entry.max)))
        if (current.max !== clamped) {
          current.max = clamped
          delete current.not
          changed = true
        }
      }
    }
    if (Object.keys(current).length === 0) {
      if (nextBounds[idx]) {
        delete nextBounds[idx]
        changed = true
      }
    } else {
      nextBounds[idx] = current
    }
  }
  if (!changed) return recipe
  let nextRecipe: BuilderRecipe = {
    ...recipe,
    substatRollBoundsV: normalizeBoundsObject(nextBounds),
  }
  // Bounds patch can flip not/positive; re-sync minCount to match current positive count.
  if (nextRecipe.autoMinCount) {
    const positiveCount = countPositiveSubstats(nextRecipe.substatsV, nextRecipe.substatRollBoundsV as Record<number, { not?: boolean }>)
    nextRecipe = { ...nextRecipe, minCount: Math.min(4, Math.max(0, positiveCount)) as 0 | 1 | 2 | 3 | 4 }
  }
  nextRecipe = normalizeKeepMode(nextRecipe)
  nextRecipe = normalizeAutoRaritySupplements(nextRecipe)
  if (nextRecipe.autoSubstatFlex && !canEnableSubstatFlex(nextRecipe)) {
    nextRecipe = { ...nextRecipe, autoSubstatFlex: false }
  }
  return nextRecipe
}

function applyTargetPatch(recipe: BuilderRecipe, patch: MultiEditTargetPatch): BuilderRecipe {
  if (!patch || Object.keys(patch).length === 0) return recipe
  const selectable = new Set<number>(Array.isArray(recipe.substatsV) ? recipe.substatsV.map(Number) : [])
  const current = (recipe.substatRollTargetsV ?? {}) as SubstatRollTargetsMap
  let nextEntries: SubstatRollTargetsMap | null = null
  let changed = false
  for (const [key, entry] of Object.entries(patch)) {
    const idx = Number(key)
    if (!selectable.has(idx)) continue
    // idx IS the stat variant — quantize the incoming patch on its own grid so a
    // multi-edit apply cannot persist an off-grid (or rounded-up) target.
    const normalized = normalizeRollTargetEntry(entry?.value ?? null, idx)
    const existing = current[idx]
    if (!normalized) {
      if (existing === undefined) continue
      if (!nextEntries) nextEntries = { ...current }
      delete nextEntries[idx]
      changed = true
      continue
    }
    if (targetEntriesEqual(existing, normalized, idx)) continue
    if (!nextEntries) nextEntries = { ...current }
    nextEntries[idx] = normalized
    changed = true
  }
  if (!changed) return recipe
  const normalizedEntries = normalizeRollTargets(nextEntries ?? {})
  const nextValue = Object.keys(normalizedEntries).length > 0
    ? normalizedEntries
    : ({} as SubstatRollTargetsMap)
  return {
    ...recipe,
    substatRollTargetsV: nextValue,
  }
}

function applyArtifactTypesPatch(recipe: BuilderRecipe, patch: MultiEditArrayPatch<number>): BuilderRecipe {
  const current = Array.isArray(recipe.artifactTypes) ? recipe.artifactTypes.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  if (arraysEqualNumber(current, next)) return recipe
  return { ...recipe, artifactTypes: next }
}

function applyArtifactSetsPatch(
  recipe: BuilderRecipe,
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): BuilderRecipe {
  // Normalize existing entries so we can apply add/remove safely.
  const current = normalizeArtifactSetSelectionEntries(recipe.artifactSets)
  // Apply the patch against canonical entries.
  const next = applyArtifactSetSelectionPatch(current, patch)
  // Skip cloning when the result matches the current selection.
  if (areArtifactSetSelectionsEqual(current, next)) return recipe
  return { ...recipe, artifactSets: next }
}

function applyArtifactSetSelectionPatch(
  current: readonly ArtifactSetSelectionEntry[],
  patch: MultiEditArrayPatch<ArtifactSetSelectionEntry>,
): ArtifactSetSelectionEntry[] {
  // Clear always wins and returns a fresh empty list.
  if (patch.clear) return []
  // Replace uses the provided entries as the new baseline.
  if (patch.replace && patch.replace.length > 0) {
    return normalizeArtifactSetSelectionEntries(patch.replace)
  }
  // Normalize remove entries into canonical ids.
  const removeEntries = normalizeArtifactSetSelectionEntries(patch.remove ?? [])
  const removeIds = new Set(removeEntries.map((entry) => Number(entry.id)))
  // Drop any entries whose IDs are in the remove list.
  const filtered = current.filter((entry) => !removeIds.has(Number(entry.id)))
  // Normalize add entries (includes + excludes).
  const addEntries = normalizeArtifactSetSelectionEntries(patch.add ?? [])
  // Merge adds with the filtered baseline (exclusions still take precedence).
  return normalizeArtifactSetSelectionEntries([...filtered, ...addEntries])
}

function applyArtifactMetaSetsPatch(recipe: BuilderRecipe, patch: MultiEditArrayPatch<string>): BuilderRecipe {
  const current = Array.isArray(recipe.artifactMetaSets) ? recipe.artifactMetaSets.map(String) : []
  const next = applyStringArrayPatch(current, patch)
  if (arraysEqualString(current, next)) return recipe
  return { ...recipe, artifactMetaSets: next }
}

function applyTagsPatch(recipe: BuilderRecipe, patch: MultiEditArrayPatch<string>): BuilderRecipe {
  // Normalize tags to strings before patching.
  const current = Array.isArray(recipe.tags) ? recipe.tags.map(String) : []
  // Apply standard string array patch semantics.
  const next = applyStringArrayPatch(current, patch)
  // Avoid allocation when nothing changes.
  if (arraysEqualString(current, next)) return recipe
  // Persist the updated tag list.
  return { ...recipe, tags: next }
}

interface NumberArrayPatchOptions {
  sort?: boolean
  filter?: Set<number>
}

function applyNumberArrayPatch(
  source: readonly number[],
  patch: MultiEditArrayPatch<number>,
  options: NumberArrayPatchOptions = {},
): number[] {
  let result: number[]
  if (patch.clear) {
    result = []
  } else if (patch.replace && patch.replace.length >= 0) {
    result = Array.from(new Set(patch.replace.map(Number)))
  } else {
    const set = new Set<number>(source.map(Number))
    if (patch.remove) {
      for (const value of patch.remove) set.delete(Number(value))
    }
    if (patch.add) {
      for (const value of patch.add) set.add(Number(value))
    }
    result = Array.from(set)
  }
  if (options.filter) {
    result = result.filter(v => options.filter!.has(Number(v)))
  }
  if (options.sort !== false) {
    result.sort((a, b) => a - b)
  }
  return result
}

function applyStringArrayPatch(
  source: readonly string[],
  patch: MultiEditArrayPatch<string>,
): string[] {
  let result: string[]
  if (patch.clear) {
    result = []
  } else if (patch.replace && patch.replace.length >= 0) {
    result = Array.from(new Set(patch.replace.map(String)))
  } else {
    const set = new Set<string>(source.map(String))
    if (patch.remove) {
      for (const value of patch.remove) set.delete(String(value))
    }
    if (patch.add) {
      for (const value of patch.add) set.add(String(value))
    }
    result = Array.from(set)
  }
  result.sort((a, b) => a.localeCompare(b))
  return result
}

function arraysEqualNumber(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (Number(left[i]) !== Number(right[i])) return false
  }
  return true
}

function arraysEqualString(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    if (String(left[i]) !== String(right[i])) return false
  }
  return true
}

function normalizeBoundsObject(
  source: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>,
): Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> {
  const result: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!entry) continue
    const idx = Number(key)
    const normalized: { min?: number; max?: number; any?: boolean; not?: boolean } = {}
    // `not` takes priority — all other fields are silently dropped when set.
    if (entry.not === true) {
      normalized.not = true
    } else if (entry.any) {
      normalized.any = true
    } else {
      if (typeof entry.min === 'number') normalized.min = Math.max(0, Math.min(5, Number(entry.min)))
      if (typeof entry.max === 'number') normalized.max = Math.max(0, Math.min(4, Number(entry.max)))
    }
    if (Object.keys(normalized).length > 0) {
      result[idx] = normalized
    }
  }
  return result
}
