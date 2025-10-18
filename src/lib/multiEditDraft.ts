/**
 * multiEditDraft.ts
 *
 * Helper utilities for deriving and tracking multi-config edit state. A draft
 * represents the combined view of the currently selected configs so the UI can
 * surface mixed fields and staged overrides before applying changes.
 */
import type { BuilderConfig } from './hsfBuilder'
import { normalizeKeepMode, normalizeSubstatMinTarget, canEnableSubstatFlex, normalizeAutoRaritySupplements, normalizeLevelWindow } from './keepMode'

export const BUILDER_FIELD_KEYS = [
  'name',
  'keep',
  'visibility',
  'rankCode',
  'rarityCode',
  'rarityMode',
  'autoRaritySupplementsThreshold',
  'factionCode',
  'mainStatsV',
  'minLevel',
  'maxLevel',
  'earlyKeepMode',
  'rollBaseline',
  'substatsV',
  'fixedSubstatsV',
  'substatRollBoundsV',
  'minCount',
  'autoMinCount',
  'autoSubstatFlex',
  'minRequiredRolls',
  'autoMinRequiredRolls',
  'substatMinTarget',
  'artifactTypes',
  'artifactSets',
  'artifactMetaSets',
] as const satisfies ReadonlyArray<keyof BuilderConfig>

export type BuilderFieldKey = typeof BUILDER_FIELD_KEYS[number]

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
}

export type MultiEditRollPatch = Record<number, MultiEditRollPatchEntry>

type FieldPatchByKey = {
  mainStatsV: MultiEditArrayPatch<number>
  substatsV: MultiEditArrayPatch<number>
  fixedSubstatsV: MultiEditArrayPatch<number>
  substatRollBoundsV: MultiEditRollPatch
  artifactTypes: MultiEditArrayPatch<number>
  artifactSets: MultiEditArrayPatch<number>
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
  commit: MultiEditFieldCommit<BuilderConfig[K], K>,
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

export function createMultiEditDraft(configs: BuilderConfig[], selection: number[]): MultiEditDraftState {
  if (configs.length === 0) {
    throw new Error('createMultiEditDraft: expected at least one config')
  }
  const fields = {} as MultiEditFields
  for (const key of BUILDER_FIELD_KEYS) {
    fields[key] = createFieldStateForKey(configs, key)
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
    const matchesBase = prevField.status === baseField.initialStatus
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
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'artifactTypes':
    case 'artifactSets':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'artifactMetaSets':
      return arePrimitiveArraysEqual(left as readonly unknown[] | undefined, right as readonly unknown[] | undefined)
    case 'substatRollBoundsV':
      return areRollBoundsEqual(
        left as BuilderConfig['substatRollBoundsV'],
        right as BuilderConfig['substatRollBoundsV'],
      )
    default:
      return left === right
  }
}

export function cloneBuilderFieldValue(key: BuilderFieldKey, value: unknown): unknown {
  if (value == null) return value
  switch (key) {
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactSets':
      return Array.isArray(value) ? [...value] : value
    case 'artifactMetaSets':
      return Array.isArray(value) ? [...value] : value
    case 'substatRollBoundsV':
      return cloneRollBounds(value as SubstatRollBounds)
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

function createFieldStateForKey(configs: BuilderConfig[], key: BuilderFieldKey): MultiEditFieldState {
  const first = configs[0]!
  const firstValue = first[key]
  const uniqueValues = collectUniqueValues(configs, key)
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

function areRollBoundsEqual(
  left: BuilderConfig['substatRollBoundsV'],
  right: BuilderConfig['substatRollBoundsV'],
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

function collectUniqueValues(configs: BuilderConfig[], key: BuilderFieldKey): unknown[] {
  const unique: unknown[] = []
  outer: for (const cfg of configs) {
    const candidate = cfg[key]
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
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactSets':
    case 'artifactMetaSets':
      return cloneArrayPatch(patch as MultiEditArrayPatch<unknown>) as MultiEditFieldPatch<K>
    case 'substatRollBoundsV':
      return cloneRollPatch(patch as MultiEditRollPatch) as MultiEditFieldPatch<K>
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
  }
  return true
}

export function normalizeFieldPatch<K extends BuilderFieldKey>(
  key: K,
  patch: MultiEditFieldPatch<K> | null | undefined,
): MultiEditFieldPatch<K> | null {
  if (!patch) return null
  switch (key) {
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactSets':
    case 'artifactMetaSets':
      return isArrayPatchEmpty(patch as MultiEditArrayPatch<unknown>) ? null : patch
    case 'substatRollBoundsV':
      return isRollPatchEmpty(patch as MultiEditRollPatch) ? null : patch
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
    case 'mainStatsV':
    case 'substatsV':
    case 'fixedSubstatsV':
    case 'artifactTypes':
    case 'artifactSets':
    case 'artifactMetaSets':
      return areArrayPatchesEqual(left as MultiEditArrayPatch<unknown>, right as MultiEditArrayPatch<unknown>)
    case 'substatRollBoundsV':
      return areRollPatchesEqual(left as MultiEditRollPatch, right as MultiEditRollPatch)
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


type SubstatRollBounds = NonNullable<BuilderConfig['substatRollBoundsV']>

function cloneRollBounds(source: SubstatRollBounds): SubstatRollBounds {
  const result: SubstatRollBounds = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!entry) continue
    const idx = Number(key)
    result[idx] = { ...entry }
  }
  return result
}

function normalizeRollBounds(
  source: BuilderConfig['substatRollBoundsV'],
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
export function applyMultiEditFieldToConfig(
  cfg: BuilderConfig,
  key: BuilderFieldKey,
  field: MultiEditFieldState,
): BuilderConfig {
  const patch = field.patch
    ? cloneFieldPatch(key, field.patch as MultiEditFieldPatch<typeof key>)
    : null
  if (patch) {
    return applyPatchForKey(cfg, key, patch)
  }
  const nextValue = cloneBuilderFieldValue(key, field.value) as BuilderConfig[typeof key]
  if (areBuilderFieldValuesEqual(key, cfg[key], nextValue)) return cfg
  let nextCfg: BuilderConfig = { ...cfg, [key]: nextValue }
  switch (key) {
    case 'substatMinTarget':
      nextCfg = normalizeSubstatMinTarget(nextCfg)
      break
    case 'autoMinCount':
    case 'minCount':
      nextCfg = normalizeSubstatMinTarget(nextCfg)
      if (nextCfg.autoSubstatFlex && !canEnableSubstatFlex(nextCfg)) {
        nextCfg = { ...nextCfg, autoSubstatFlex: false }
      }
      break
    case 'autoSubstatFlex':
      if (nextCfg.autoSubstatFlex && !canEnableSubstatFlex(nextCfg)) {
        nextCfg = { ...nextCfg, autoSubstatFlex: false }
      }
      break
    case 'autoMinRequiredRolls':
    case 'minRequiredRolls':
      nextCfg = normalizeKeepMode(nextCfg)
      nextCfg = normalizeAutoRaritySupplements(nextCfg)
      if (nextCfg.autoSubstatFlex && !canEnableSubstatFlex(nextCfg)) {
        nextCfg = { ...nextCfg, autoSubstatFlex: false }
      }
      break
    case 'earlyKeepMode':
    case 'rarityMode':
    case 'autoRaritySupplementsThreshold':
      nextCfg = normalizeAutoRaritySupplements(nextCfg)
      break
    case 'minLevel':
    case 'maxLevel':
      nextCfg = normalizeLevelWindow(nextCfg)
      break
    default:
      break
  }
  return nextCfg
}

export function applyMultiEditFieldsToConfig(
  cfg: BuilderConfig,
  fields: MultiEditFields,
  dirtyKeys?: readonly BuilderFieldKey[],
): BuilderConfig {
  const keys = dirtyKeys && dirtyKeys.length > 0 ? dirtyKeys : BUILDER_FIELD_KEYS
  if (keys.length === 0) return cfg
  let nextCfg = cfg
  for (const key of keys) {
    const field = fields[key]
    if (!field?.dirty) continue
    const updated = applyMultiEditFieldToConfig(nextCfg, key, field)
    if (updated !== nextCfg) {
      nextCfg = updated
    }
  }
  return nextCfg
}

function applyPatchForKey<K extends BuilderFieldKey>(
  cfg: BuilderConfig,
  key: K,
  patch: MultiEditFieldPatch<K>,
): BuilderConfig {
  switch (key) {
    case 'mainStatsV':
      return applyMainStatsPatch(cfg, patch as MultiEditArrayPatch<number>)
    case 'substatsV':
      return applySubstatsPatch(cfg, patch as MultiEditArrayPatch<number>)
    case 'fixedSubstatsV':
      return applyFixedSubstatsPatch(cfg, patch as MultiEditArrayPatch<number>)
    case 'substatRollBoundsV':
      return applySubstatRollPatch(cfg, patch as MultiEditRollPatch)
    case 'artifactTypes':
      return applyArtifactTypesPatch(cfg, patch as MultiEditArrayPatch<number>)
    case 'artifactSets':
      return applyArtifactSetsPatch(cfg, patch as MultiEditArrayPatch<number>)
    case 'artifactMetaSets':
      return applyArtifactMetaSetsPatch(cfg, patch as MultiEditArrayPatch<string>)
    default:
      return cfg
  }
}

function applyMainStatsPatch(cfg: BuilderConfig, patch: MultiEditArrayPatch<number>): BuilderConfig {
  const current = Array.isArray(cfg.mainStatsV) ? cfg.mainStatsV.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  if (arraysEqualNumber(current, next)) return cfg
  return { ...cfg, mainStatsV: next }
}

function applySubstatsPatch(cfg: BuilderConfig, patch: MultiEditArrayPatch<number>): BuilderConfig {
  const current = Array.isArray(cfg.substatsV) ? cfg.substatsV.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  const currentSet = new Set<number>(current)
  const nextSet = new Set<number>(next)
  const added = next.filter(v => !currentSet.has(v))

  let nextFixed = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV.filter(v => nextSet.has(Number(v))) : []
  // Remove duplicates
  nextFixed = Array.from(new Set(nextFixed.map(Number))).sort((a, b) => a - b)

  const boundsSource = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
  const nextBounds: Record<number, { min?: number; max?: number; any?: boolean }> = {}
  for (const [key, value] of Object.entries(boundsSource)) {
    const idx = Number(key)
    if (!nextSet.has(idx)) continue
    nextBounds[idx] = { ...value }
  }
  for (const variant of added) {
    nextBounds[variant] = { any: true }
  }
  const prunedBounds = normalizeBoundsObject(nextBounds)

  let nextMinCount = Number(cfg.minCount ?? 0)
  if (patch.clear || next.length === 0) {
    nextMinCount = 0
  } else if (cfg.autoMinCount) {
    nextMinCount = Math.min(4, next.length)
  } else {
    if (nextMinCount === 0 && next.length > 0) nextMinCount = 1
    if (nextMinCount > next.length) nextMinCount = next.length
  }
  nextMinCount = Math.max(0, Math.min(4, nextMinCount))

  let nextCfg: BuilderConfig = {
    ...cfg,
    substatsV: next,
    fixedSubstatsV: nextFixed,
    substatRollBoundsV: prunedBounds,
    minCount: nextMinCount as 0 | 1 | 2 | 3 | 4,
  }

  nextCfg = normalizeKeepMode(nextCfg)
  nextCfg = normalizeAutoRaritySupplements(nextCfg)
  nextCfg = normalizeSubstatMinTarget(nextCfg)
  if (nextCfg.autoSubstatFlex && !canEnableSubstatFlex(nextCfg)) {
    nextCfg = { ...nextCfg, autoSubstatFlex: false }
  }
  return nextCfg
}

function applyFixedSubstatsPatch(cfg: BuilderConfig, patch: MultiEditArrayPatch<number>): BuilderConfig {
  const current = Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV.map(Number) : []
  const selectable = new Set<number>(Array.isArray(cfg.substatsV) ? cfg.substatsV.map(Number) : [])
  const next = applyNumberArrayPatch(current, patch, { sort: true, filter: selectable })
  if (arraysEqualNumber(current, next)) return cfg
  let nextCfg: BuilderConfig = { ...cfg, fixedSubstatsV: next }
  nextCfg = normalizeSubstatMinTarget(nextCfg)
  if (nextCfg.autoSubstatFlex && !canEnableSubstatFlex(nextCfg)) {
    nextCfg = { ...nextCfg, autoSubstatFlex: false }
  }
  return nextCfg
}

function applySubstatRollPatch(cfg: BuilderConfig, patch: MultiEditRollPatch): BuilderConfig {
  const selectable = new Set<number>(Array.isArray(cfg.substatsV) ? cfg.substatsV.map(Number) : [])
  const currentBounds = (cfg.substatRollBoundsV ?? {}) as Record<number, { min?: number; max?: number; any?: boolean }>
  const nextBounds: Record<number, { min?: number; max?: number; any?: boolean }> = {}
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
    if (entry.any !== undefined) {
      if (entry.any) {
        if (!current.any || current.min !== undefined || current.max !== undefined) {
          current.any = true
          delete current.min
          delete current.max
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
  if (!changed) return cfg
  let nextCfg: BuilderConfig = {
    ...cfg,
    substatRollBoundsV: normalizeBoundsObject(nextBounds),
  }
  nextCfg = normalizeKeepMode(nextCfg)
  nextCfg = normalizeAutoRaritySupplements(nextCfg)
  if (nextCfg.autoSubstatFlex && !canEnableSubstatFlex(nextCfg)) {
    nextCfg = { ...nextCfg, autoSubstatFlex: false }
  }
  return nextCfg
}

function applyArtifactTypesPatch(cfg: BuilderConfig, patch: MultiEditArrayPatch<number>): BuilderConfig {
  const current = Array.isArray(cfg.artifactTypes) ? cfg.artifactTypes.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  if (arraysEqualNumber(current, next)) return cfg
  return { ...cfg, artifactTypes: next }
}

function applyArtifactSetsPatch(cfg: BuilderConfig, patch: MultiEditArrayPatch<number>): BuilderConfig {
  const current = Array.isArray(cfg.artifactSets) ? cfg.artifactSets.map(Number) : []
  const next = applyNumberArrayPatch(current, patch, { sort: true })
  if (arraysEqualNumber(current, next)) return cfg
  return { ...cfg, artifactSets: next }
}

function applyArtifactMetaSetsPatch(cfg: BuilderConfig, patch: MultiEditArrayPatch<string>): BuilderConfig {
  const current = Array.isArray(cfg.artifactMetaSets) ? cfg.artifactMetaSets.map(String) : []
  const next = applyStringArrayPatch(current, patch)
  if (arraysEqualString(current, next)) return cfg
  return { ...cfg, artifactMetaSets: next }
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
  source: Record<number, { min?: number; max?: number; any?: boolean }>,
): Record<number, { min?: number; max?: number; any?: boolean }> {
  const result: Record<number, { min?: number; max?: number; any?: boolean }> = {}
  for (const [key, entry] of Object.entries(source)) {
    if (!entry) continue
    const idx = Number(key)
    const normalized: { min?: number; max?: number; any?: boolean } = {}
    if (entry.any) {
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
