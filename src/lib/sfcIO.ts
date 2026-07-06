/**
 * SFC IO Helpers
 *
 * Responsibilities:
 * - Normalize readable SFC payloads to the internal StatVariant-based model.
 * - Build readable SFC payloads (labels, not numeric IDs) from internal state for Save/Copy.
 * - Parse pasted text that may be a single recipe, an array of recipes, or a full SFC object.
 *
 * This module deliberately contains only SFC read/write concerns to keep UI code tidy.
 */
import { normalizeExportModeFields, resolveExportModeField, coerceSellfileExportModeToken, normalizeRollTargetEntry, type BuilderRecipe, type SubstatTargetTable, type SellfileExportMode, type Star, type SubstatRollTargetEntry, type SubstatRollTargets } from './hsfBuilder'
import { normalizeRecipeKeepState, isMilestoneThresholdsActive, canEnableSubstatFlex, countPositiveSubstats } from './recipeNormalization'
import { FINAL_SELL_DEFAULT_LEVELS, RARITY_AUTO_LABEL } from './constants'
import { DEFAULT_METASET_ICON_ID, normalizeMetasetIconId } from './metasetIcons'
import { orderMetasets, type Metaset } from './metasets'
import {
  LEVEL_MILESTONES,
  type LevelMilestone,
  RARITY_CODES,
  RarityCode,
  artifactSetName,
  artifactTypeNames,
  compareArtifactSets,
  compareArtifactTypes,
  compareVariants,
  factionCodeToName,
  factionNames,
  findArtifactSetIdByName,
  formatRank,
  isLevelMilestone,
  isRarityCode,
  isRankCode,
  labelOfVariant,
  rarityCodeToName,
  variantFromLabel,
  RankCode,
  RANK_CODES,
  type ArtifactSetId,
} from './types'
import { NBSP } from './constants'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellRemainderConfig,
  type FinalSellSetsMode,
} from './logicHub'
import {
  SafeguardSubstatMatch,
  normalizeSafeguardSubstatMatch,
  normalizeSafeguardRule,
  sanitizeSafeguardCountMode,
  sortSafeguardCombination,
  sortSafeguardSubstats,
  type SafeguardRule,
  SafeguardRuleActivation,
  SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT,
} from './safeguards'
import { normalizeTagList } from './tagHelpers'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { appearancePersistField, readAppearanceFromRecord, type NameAppearance } from './nameAppearance'
import { normalizeArtifactSetSelections } from './gearSets/selection'
import { canonicalizeNoteRecipeOverridesMarkers } from './noteRecipeOverrides'

// Legacy safeguard note markers used `keep-uniques` wording.
// Normalize opening markers at the SFC boundary so runtime/editor state stays canonical.
const NOTE_LEGACY_SAFEGUARDS_MARKER_OPEN_REGEX = /<!--(\s*)keep-uniques\b/gi

// Canonicalize all known legacy note marker aliases at SFC IO boundaries.
const canonicalizeLegacyNoteMarkers = (note: string): string => (
  canonicalizeNoteRecipeOverridesMarkers(note)
    .replace(NOTE_LEGACY_SAFEGUARDS_MARKER_OPEN_REGEX, '<!--$1safeguards')
)

/** True when the SFC version string is at or below the given major.minor.patch ceiling.
 *  Pre-release / build-metadata suffixes (e.g. -dev, +build) are stripped before comparison.
 *  A missing or unparseable version is treated as old (returns true). */
function sfcVersionAtMost(version: string | undefined, major: number, minor: number, patch: number): boolean {
  if (!version) return true
  const core = version.replace(/[-+].*$/, '')
  const parts = core.split('.').map(Number)
  const vmaj = parts[0] ?? 0
  const vmin = parts[1] ?? 0
  const vpatch = parts[2] ?? 0
  if (vmaj !== major) return vmaj < major
  if (vmin !== minor) return vmin < minor
  return vpatch <= patch
}

/** Convert legacy space-separated improvchance values to canonical comma-separated form.
 *  "improvchance = 25 35 50 65" → "improvchance = 25, 35, 50, 65" (1–4 values). */
const migrateImprovchanceSpacesToCommas = (note: string): string =>
  note.replace(
    /\bimprovchance(\s*=\s*)(\d+(?:\.\d+)?)((?:\s+\d+(?:\.\d+)?){1,3})/g,
    (_, eq, first, rest: string) => `improvchance${eq}${first}${rest.replace(/\s+/g, ', ')}`,
  )

type LockedMinValue = Exclude<BuilderRecipe['lockedMinRequiredRolls'], undefined>
type AggregateMinValue = Exclude<BuilderRecipe['minRequiredRolls'], undefined>

// Readable SFC substat payload that merges selection, fixed, and roll bounds.
type ReadableSubstatBounds = {
  min?: number
  max?: number
  any?: boolean
  not?: boolean
}

// Each array element mirrors one selected substat with optional flags/bounds.
type ReadableSubstatEntry = {
  stat: string
  fixed?: true
  rollBounds?: ReadableSubstatBounds
}

const parseAggregateScopeToken = (value: unknown): 'locked' | 'selected' | null => {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v.startsWith('lock')) return 'locked'
  if (v.startsWith('sel')) return 'selected'
  return null
}

// Internal helpers for parsing unknown SFC shapes
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }
// no longer used: only label-based parsing is accepted for SFC
// function asNumber(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function asStringArray(v: unknown): string[] | undefined { return Array.isArray(v) ? (v as unknown[]).map((s) => String(s)) : undefined }
// (Legacy helpers removed for SFC schema simplification)
function parseSubstatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, isFlat } are no longer accepted in SFC; labels only
  return undefined
}
function parseMainStatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, f } are no longer accepted in SFC; labels only
  return undefined
}

/**
 * Resolve a readable set identifier to a numeric ArtifactSetId.
 *
 * Prefers baked-in catalog lookups; if not found, optionally falls back to a
 * persisted-runtime name map supplied by autosave restore.
 */
const resolveSetId = (value: unknown, runtimeNameMap?: Map<string, number>): number | undefined => {
  // Accept readable names first so SFC stays human-friendly.
  // Why: users don’t memorize numeric IDs.
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      // Try baked-in (and active runtime, if loaded) catalog lookup.
      const resolved = findArtifactSetIdByName(trimmed)
      if (resolved !== null) return Number(resolved)
      // If restore kept runtime sets dormant, fall back to persisted names.
      // Why: autosave drafts store readable names, not raw IDs.
      if (runtimeNameMap) {
        const runtimeResolved = runtimeNameMap.get(trimmed.toLowerCase())
        if (runtimeResolved !== undefined) return Number(runtimeResolved)
      }
    }
  }
  // Fall back to numeric parsing for legacy / advanced payloads.
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return undefined
  return Math.floor(numeric)
}

type ReadableArtifactSetEntry = {
  name?: unknown
  id?: unknown
  setId?: unknown
  excluded?: unknown
}

const parseReadableArtifactSetEntries = (
  value: unknown,
  runtimeNameMap?: Map<string, number>,
): ArtifactSetSelectionEntry[] => {
  // Accept only arrays; non-arrays map to empty selections.
  if (!Array.isArray(value)) return []
  // Collect entries before normalization so exclusions can override duplicates.
  const entries: ArtifactSetSelectionEntry[] = []
  for (const entry of value) {
    // Legacy arrays of names or numbers are still accepted.
    if (typeof entry === 'string' || typeof entry === 'number') {
      const resolved = resolveSetId(entry, runtimeNameMap)
      if (typeof resolved === 'number') {
        entries.push({ id: resolved as ArtifactSetId })
      }
      continue
    }
    // Skip non-objects after handling primitives.
    if (!entry || typeof entry !== 'object') continue
    const rec = entry as ReadableArtifactSetEntry
    const rawId = rec.id ?? rec.setId
    const idNumeric = rawId != null ? Number(rawId) : Number.NaN
    // Prefer numeric ids; fall back to name resolution for readable payloads.
    const resolvedId = Number.isFinite(idNumeric)
      ? idNumeric
      : resolveSetId(rec.name, runtimeNameMap)
    if (typeof resolvedId !== 'number') continue
    // Only a literal true marks the entry as excluded.
    const excluded = rec.excluded === true
    entries.push(excluded ? { id: resolvedId as ArtifactSetId, excluded: true } : { id: resolvedId as ArtifactSetId })
  }
  // Normalize to enforce deterministic order and exclusion precedence.
  return normalizeArtifactSetSelections(entries)
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function parseReadableTargetEntry(value: unknown): SubstatRollTargetEntry | null {
  if (!value || typeof value !== 'object') return null
  const rec = value as Record<string, unknown>
  const baseCandidate = toFiniteNumberOrNull(rec.base)
  const entry: SubstatRollTargetEntry = {}
  if (baseCandidate != null) entry.base = baseCandidate
  if (Array.isArray(rec.increments)) {
    entry.increments = (rec.increments as unknown[]).map((val) => {
      if (val == null) return null
      return toFiniteNumberOrNull(val)
    }) as Array<number | null>
  }
  return normalizeRollTargetEntry(entry)
}

function parseReadableRollTargetsMap(value: unknown): SubstatRollTargets | undefined {
  if (!value || typeof value !== 'object') return undefined
  const entries = value as Record<string, unknown>
  const out: SubstatRollTargets = {}
  for (const [label, entry] of Object.entries(entries)) {
    const variant = variantFromLabel(label)
    if (variant === null) continue
    const normalized = parseReadableTargetEntry(entry)
    if (!normalized) continue
    out[variant] = normalized
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function parseReadableSubstatBounds(value: unknown): ReadableSubstatBounds | undefined {
  if (!value || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  const bounds: ReadableSubstatBounds = {}
  // `not` is mutually exclusive with min/max/any; check it first.
  if (rec.not === true) {
    bounds.not = true
    return bounds
  }
  const minRaw = rec.min
  const maxRaw = rec.max
  const anyRaw = rec.any
  if (typeof minRaw === 'number' && Number.isFinite(minRaw)) bounds.min = Math.max(0, Math.min(5, Math.floor(minRaw)))
  if (typeof maxRaw === 'number' && Number.isFinite(maxRaw)) bounds.max = Math.max(0, Math.min(4, Math.floor(maxRaw)))
  if (anyRaw) bounds.any = true
  return (bounds.min !== undefined || bounds.max !== undefined || bounds.any) ? bounds : undefined
}

function parseReadableSubstatEntries(source: unknown): {
  substats: number[]
  fixed: number[]
  bounds: Record<number, ReadableSubstatBounds>
} {
  const selected: number[] = []
  const fixed: number[] = []
  const bounds: Record<number, ReadableSubstatBounds> = {}
  if (!Array.isArray(source)) return { substats: selected, fixed, bounds }
  const seen = new Set<number>()
  for (const entry of source as unknown[]) {
    let variant: number | undefined
    let fixedFlag = false
    let entryBounds: ReadableSubstatBounds | undefined
    if (typeof entry === 'string') {
      variant = parseSubstatLike(entry)
    } else if (isRecord(entry)) {
      const rec = entry as Record<string, unknown>
      const statLabel = rec.stat ?? rec.label ?? rec.name ?? rec.value
      if (typeof statLabel === 'string') variant = parseSubstatLike(statLabel)
      fixedFlag = rec.fixed === true
      const rollBoundsSource = isRecord(rec.rollBounds) ? rec.rollBounds : {
        min: rec.min,
        max: rec.max,
        any: rec.any,
      }
      entryBounds = parseReadableSubstatBounds(rollBoundsSource)
    }
    if (typeof variant !== 'number') continue
    if (!seen.has(variant)) {
      selected.push(variant)
      seen.add(variant)
    }
    if (fixedFlag && !fixed.includes(variant)) fixed.push(variant)
    if (entryBounds) bounds[variant] = entryBounds
  }
  return { substats: selected, fixed, bounds }
}

function parseLegacySubstatRollBounds(source: unknown): Record<number, ReadableSubstatBounds> | undefined {
  if (!source || typeof source !== 'object') return undefined
  const entries = source as Record<string, unknown>
  const out: Record<number, ReadableSubstatBounds> = {}
  for (const [label, raw] of Object.entries(entries)) {
    const variant = variantFromLabel(label)
    if (variant === null) continue
    const bounds = parseReadableSubstatBounds(raw)
    if (!bounds) continue
    out[variant] = bounds
  }
  return Object.keys(out).length ? out : undefined
}

function rollTargetsToReadable(
  targets: SubstatRollTargets | undefined,
): Record<string, SubstatRollTargetEntry> | undefined {
  if (!targets) return undefined
  const out: Record<string, SubstatRollTargetEntry> = {}
  for (const [variantKey, entry] of Object.entries(targets)) {
    const normalized = normalizeRollTargetEntry(entry)
    if (!normalized) continue
    const label = labelOfVariant(Number(variantKey))
    out[label] = normalized
  }
  const labels = Object.keys(out)
  if (!labels.length) return undefined
  labels.sort((a, b) => {
    const va = variantFromLabel(a)
    const vb = variantFromLabel(b)
    if (va === null || vb === null) return a.localeCompare(b)
    return compareVariants(va, vb)
  })
  const sorted: Record<string, SubstatRollTargetEntry> = {}
  for (const label of labels) {
    const entry = out[label]
    if (!entry) continue
    sorted[label] = entry
  }
  return sorted
}

const buildReadableArtifactSetEntries = (
  selections: readonly ArtifactSetSelectionEntry[],
): ReadableArtifactSetExportEntry[] => {
  // Normalize first so ordering/exclusion precedence is stable.
  const normalized = normalizeArtifactSetSelections(selections ?? [])
  // Sort deterministically so SFC diffs stay clean.
  const sorted = normalized
    .slice()
    .sort((a, b) => compareArtifactSets(Number(a.id), Number(b.id)))
  const entries: ReadableArtifactSetExportEntry[] = []
  for (const entry of sorted) {
    const name = artifactSetName(Number(entry.id) as ArtifactSetId)
    // Skip missing labels to avoid NaN/empty exports.
    if (!name || !name.trim()) continue
    entries.push(entry.excluded ? { name, excluded: true } : { name })
  }
  return entries
}

// Safeguard rarities store the 1..6 bucket; map those rank-like values to readable rarity names.
const SAFEGUARD_RARITY_LABEL: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
  6: 'Mythical',
}

// Merge metaset names from `extras` into the base recipe, preserving the catalog order.
function mergeMetasetNames(base: BuilderRecipe, metasets: Metaset[], extras: readonly string[] = []): BuilderRecipe {
  const baseOrdered = orderMetasets(base.artifactMetaSets, metasets)
  const extrasOrdered = extras.length ? orderMetasets(extras, metasets) : []
  const merged = extrasOrdered.length ? orderMetasets([...baseOrdered, ...extrasOrdered], metasets) : baseOrdered
  if (extrasOrdered.length || Array.isArray(base.artifactMetaSets)) {
    return { ...base, artifactMetaSets: merged }
  }
  if (merged.length > 0) {
    return { ...base, artifactMetaSets: merged }
  }
  return base
}

// Normalize SFC recipes (readable schema) to current BuilderRecipe
/**
 * Normalize a readable SFC recipe to BuilderRecipe with *V fields.
 *
 * `runtimeNameMap` is only supplied by autosave restore to resolve dormant
 * runtime set names without activating the runtime catalog.
 */
export function normalizeRecipe(input: unknown, runtimeNameMap?: Map<string, number>): BuilderRecipe {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const recipes = Array.isArray(rec['Recipes']) ? rec['Recipes'] : rec['Configs']
  if (Array.isArray(recipes) && recipes.length > 0) {
    const first = recipes[0]
    if (isRecord(first)) return normalizeRecipe(first)
  }
  const typeIdByName = new Map<string, number>(Object.entries(artifactTypeNames).map(([k, v]) => [v, Number(k)]))
  const parsedReadableSubstats = parseReadableSubstatEntries(rec['substats'])
  const legacyFixedSubstats = Array.isArray(rec['fixedSubstats'])
    ? ((rec['fixedSubstats'] as unknown[]).map((x) => parseSubstatLike(x)).filter((x): x is number => typeof x === 'number'))
    : []
  const mergedFixedSubstats = (() => {
    if (!legacyFixedSubstats.length) return parsedReadableSubstats.fixed
    const merged = new Set<number>(parsedReadableSubstats.fixed)
    for (const variant of legacyFixedSubstats) merged.add(variant)
    return Array.from(merged)
  })()
  const legacyBounds = parseLegacySubstatRollBounds(rec['substatRollBounds'])
  const mergedReadableBounds: Record<number, ReadableSubstatBounds> | undefined = (() => {
    const merged: Record<number, ReadableSubstatBounds> = {}
    if (legacyBounds) {
      for (const [vk, entry] of Object.entries(legacyBounds)) {
        merged[Number(vk)] = entry
      }
    }
    for (const [vk, entry] of Object.entries(parsedReadableSubstats.bounds)) {
      merged[Number(vk)] = entry
    }
    return Object.keys(merged).length ? merged : undefined
  })()

  let rankCode: RankCode = isRankCode(rec['rankCode']) ? (rec['rankCode'] as RankCode) : RankCode.Any
  if (typeof rec['Rank'] === 'string') {
    const raw = String(rec['Rank']).trim()
    // Normalize spaces, ASCII operators, and ASCII star to their canonical forms used in labels.
    const label = raw
      .replace(new RegExp(NBSP, 'g'), ' ')
      .replace(/\*/g, '★')
      .replace(/>=\s*/g, '≥ ')
      .replace(/<=\s*/g, '≤ ')
    if (label.length === 0 || /^(any)$/i.test(label)) {
      rankCode = RankCode.Any
    } else {
      for (const code of RANK_CODES) {
        if (formatRank(code).replace(new RegExp(NBSP, 'g'), ' ') === label) { rankCode = code; break }
      }
    }
  }

  // Rarity parsing: support numeric `rarityCode`, human-readable labels (e.g., "≥ Epic"), and "Auto".
  let rarityCode: RarityCode = isRarityCode(rec['rarityCode']) ? (rec['rarityCode'] as RarityCode) : RarityCode.Any
  let rarityMode: 'auto' | 'code' = 'code'
  if (typeof rec['Rarity'] === 'string') {
    const raw = String(rec['Rarity']).trim()
    // Normalize spaces and ASCII operators to their canonical forms used in labels.
    const label = raw
      .replace(new RegExp(NBSP, 'g'), ' ')
      .replace(/>=\s*/g, '≥ ')
      .replace(/<=\s*/g, '≤ ')
    if (label.length === 0 || /^(any)$/i.test(label)) {
      rarityCode = RarityCode.Any
    } else if (label.toLowerCase() === RARITY_AUTO_LABEL.toLowerCase()) {
      rarityMode = 'auto'
    } else {
      // Find the code whose name matches the provided label (exact match)
      for (const code of RARITY_CODES) {
        if (rarityCodeToName(code).replace(new RegExp(NBSP, 'g'), ' ') === label) { rarityCode = code; break }
      }
    }
  }

  const mainStatsVParsed: number[] = Array.isArray(rec['mainStats'])
    ? ((rec['mainStats'] as unknown[]).map((x) => parseMainStatLike(x)).filter((x): x is number => typeof x === 'number'))
    : []


  const exportMode: SellfileExportMode = resolveExportModeField({
    exportMode: (coerceSellfileExportModeToken(rec['exportMode'])
      ?? coerceSellfileExportModeToken(rec['ExportMode'])) ?? null,
    visibility: (coerceSellfileExportModeToken(rec['visibility'])
      ?? coerceSellfileExportModeToken(rec['Visibility'])
      ?? coerceSellfileExportModeToken(rec['sellfileVisibility'])
      ?? coerceSellfileExportModeToken(rec['SellfileVisibility'])) ?? null,
    sellfileMode: (coerceSellfileExportModeToken(rec['sellfileMode'])
      ?? coerceSellfileExportModeToken(rec['SellfileMode'])) ?? null,
    SellfileVisibility: typeof rec['SellfileVisibility'] === 'string' ? String(rec['SellfileVisibility']) : null,
    enabled: typeof rec['enabled'] === 'boolean' ? rec['enabled'] : null,
  })

  // Resolve appearance from the current nested form or legacy flat fields (incl. [#RRGGBB]).
  const baseAppearance = readAppearanceFromRecord(rec)
  const baseRecipe: BuilderRecipe = {
    ...(baseAppearance ? { appearance: baseAppearance } : {}),
    // Normalize tag metadata from either "Tags" or legacy "tags".
    tags: normalizeTagList(rec['Tags'] ?? rec['tags']) ?? [],
    keep: Boolean((rec['keep'] ?? true) as boolean),
    exportMode,
    // Prefer explicit min/max window when present; validated below and assigned into opt
    rankCode,
    rarityCode,
    ...(rarityMode === 'auto' ? { rarityMode: 'auto' as const } : {}),
    factionCode: (() => {
      if (typeof rec['factionCode'] === 'number') return Number(rec['factionCode'])
      if (typeof rec['Faction'] === 'string') {
        const fLabel = String(rec['Faction']).trim()
        if (fLabel.length === 0 || /^(any)$/i.test(fLabel)) return 0
        const byName = new Map<string, number>(Object.entries(factionNames).map(([k, v]) => [v, Number(k)]))
        const code = byName.get(fLabel)
        if (typeof code === 'number') return code
      }
      return 0
    })(),
    mainStatsV: mainStatsVParsed as number[],
    // Accept both new ('early'|'late') and legacy ('progressive'|'reachable') spellings.
    earlyKeepMode: ((): 'early' | 'late' => {
      const m = rec['earlyKeepMode'] as unknown
      if (m === 'late' || m === 'reachable') return 'late'
      return 'early'
    })(),
    substatsV: parsedReadableSubstats.substats as number[],
    fixedSubstatsV: mergedFixedSubstats as number[],
    minCount: (() => { const m = rec['minCount']; return (typeof m === 'number' && [0, 1, 2, 3, 4].includes(m)) ? (m as 0 | 1 | 2 | 3 | 4) : 0 })(),
    autoMinCount: Boolean((rec['autoMinCount'] ?? false) as boolean),
    autoSubstatFlex: rec['autoSubstatFlex'] === true,
    minRequiredRolls: (() => { const r = rec['minRequiredRolls']; return (typeof r === 'number' && [0,1,2,3,4,5].includes(r)) ? (r as 0|1|2|3|4|5) : 0 })(),
    autoMinRequiredRolls: Boolean((rec['autoMinRequiredRolls'] ?? true) as boolean),
    lockedMinRequiredRolls: (() => { const r = rec['lockedMinRequiredRolls']; return (typeof r === 'number' && [0,1,2,3,4,5].includes(r)) ? (r as 0|1|2|3|4|5) : 0 })(),
  }

  const __srbV = mergedReadableBounds
  const __sreV = parseReadableRollTargetsMap(rec['substatRollTargets'])

  const opt: Partial<BuilderRecipe> = {}
  let legacyMinRollsScopeLocked = false
  // Optional: Auto rarity supplements threshold (Late + Auto behavior)
  const ar = rec['autoRarityThreshold']
  if (typeof ar === 'string') {
    const v = ar.trim().toLowerCase()
    if (v.startsWith('uncom')) opt.autoRaritySupplementsThreshold = 'uncommon'
    else if (v.startsWith('rare')) opt.autoRaritySupplementsThreshold = 'rare'
    else if (v.startsWith('epic')) opt.autoRaritySupplementsThreshold = 'epic'
  }
  // New: min/max level window parsing (prefer these when present)
  const parseLevel = (v: unknown): LevelMilestone | undefined => {
    if (isLevelMilestone(v)) return v
    const numeric = Number(v)
    return isLevelMilestone(numeric) ? numeric : undefined
  }
  const defaultMinLevel = LEVEL_MILESTONES[0]!
  const defaultMaxLevel = LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!
  let minLevel = parseLevel(rec['minLevel']) ?? defaultMinLevel
  let maxLevel = parseLevel(rec['maxLevel']) ?? defaultMaxLevel
  if (minLevel > maxLevel) {
    minLevel = defaultMinLevel
    maxLevel = defaultMaxLevel
  }
  opt.minLevel = minLevel
  opt.maxLevel = maxLevel
  if (__srbV !== undefined) opt.substatRollBoundsV = __srbV
  if (__sreV !== undefined) opt.substatRollTargetsV = __sreV
  // Optional: target scope for aggregate min rolls (legacy fields)
  const legacyScopes: Array<'locked' | 'selected' | null> = [
    parseAggregateScopeToken(rec['substatMinTarget']),
    parseAggregateScopeToken(rec['minRollsTarget']),
  ]
  for (const scope of legacyScopes) {
    if (scope === 'locked') {
      legacyMinRollsScopeLocked = true
      break
    }
  }
  const __artTypes = Array.isArray(rec['artifactTypeNames'])
    ? ((rec['artifactTypeNames'] as unknown[]).map((n) => typeIdByName.get(String(n))).filter((x): x is number => typeof x === 'number'))
    : undefined
  const __artSets = Array.isArray(rec['artifactSetNames'])
    ? parseReadableArtifactSetEntries(rec['artifactSetNames'], runtimeNameMap)
    : undefined
  const __artMetaSets = asStringArray(rec['artifactMetaSets'])
  if (__artTypes !== undefined) opt.artifactTypes = __artTypes
  if (__artSets !== undefined) opt.artifactSets = __artSets
  if (__artMetaSets !== undefined) opt.artifactMetaSets = __artMetaSets
  if (Array.isArray(baseRecipe.tags) && baseRecipe.tags.length === 0) {
    delete (baseRecipe as unknown as Record<string, unknown>)['tags']
  }
  // Assemble normalized base
  let normalized: BuilderRecipe = { ...baseRecipe, ...opt }

  // Post-normalization to align SFC with in-app invariants:
  // - Conflicting bounds: when min/max are present, drop 'any' (UI cannot represent both simultaneously).
  // - Clamp numeric bounds to valid ranges (already clamped above; re-apply defensively).
  try {
    const subsV: number[] = Array.isArray(normalized.substatsV) ? normalized.substatsV.slice() : []
    const fixedV: number[] = Array.isArray(normalized.fixedSubstatsV) ? normalized.fixedSubstatsV.slice() : []
    // Ensure fixed are included in selected
    const union = Array.from(new Set<number>([...subsV, ...fixedV]))
    const bV: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> = { ...(normalized.substatRollBoundsV ?? {}) }
    // Sanitize each bounds entry
    for (const [k, raw] of Object.entries(bV)) {
      const v = Number(k)
      const m = raw ?? {}
      const out: { min?: number; max?: number; any?: boolean; not?: boolean } = {}
      // `not` is mutually exclusive; when set, preserve only it.
      if ((m as { not?: boolean }).not === true) {
        out.not = true
        bV[v] = out
        continue
      }
      if (typeof m.min === 'number' && Number.isFinite(m.min)) out.min = Math.max(0, Math.min(5, Math.floor(m.min)))
      if (typeof m.max === 'number' && Number.isFinite(m.max)) out.max = Math.max(0, Math.min(4, Math.floor(m.max)))
      // Drop 'any' when min/max present; keep only one form to avoid ambiguous states.
      const hasNumeric = (out.min !== undefined) || (out.max !== undefined)
      if (!hasNumeric && (m.any === true)) out.any = true
      bV[v] = out
      // Prune empty entries (defensive)
      if (out.min === undefined && out.max === undefined && !out.any) delete bV[v]
    }
    // Ensure wildcard for selected substats lacking bounds (UI default is ★)
    for (const v of union) {
      if (!bV[v]) bV[v] = { any: true }
    }
    // Apply union back to selection
    normalized.substatsV = union
    // If bounds emptied entirely, delete the key to satisfy exactOptionalPropertyTypes
    if (Object.keys(bV).length) {
      normalized.substatRollBoundsV = bV
    } else {
      delete (normalized as unknown as Record<string, unknown>)['substatRollBoundsV']
    }
  } catch {}

  let legacyLockedCarryValue: number | null = null
  let legacyManualMinValue: number | null = null
  if (legacyMinRollsScopeLocked) {
    const lockedCount = Array.isArray(normalized.fixedSubstatsV) ? normalized.fixedSubstatsV.length : 0
    const manualMinValue = typeof normalized.minRequiredRolls === 'number' ? normalized.minRequiredRolls : 0
    const lockedMinValue = typeof normalized.lockedMinRequiredRolls === 'number' ? normalized.lockedMinRequiredRolls : 0
    const manualActive = (normalized.autoMinRequiredRolls === false) && manualMinValue > 0
    const desiredLockedMin = manualActive ? Math.max(lockedMinValue, manualMinValue) : lockedMinValue
    legacyLockedCarryValue = (manualActive && lockedCount === 0 && desiredLockedMin > 0)
      ? desiredLockedMin
      : null
    if (desiredLockedMin > 0) {
      normalized.lockedMinRequiredRolls = desiredLockedMin as LockedMinValue
    }
    if (manualActive) {
      legacyManualMinValue = manualMinValue
    }
  }

  // Re-compute minCount when autoMinCount is true so stale stored values (written
  // before "not" substats were excluded from the count) don't survive a reload.
  if (normalized.autoMinCount) {
    const positiveCount = countPositiveSubstats(normalized.substatsV, normalized.substatRollBoundsV as Record<number, { not?: boolean }>)
    normalized.minCount = Math.min(4, Math.max(0, positiveCount)) as 0 | 1 | 2 | 3 | 4
  }

  if (!canEnableSubstatFlex(normalized)) {
    normalized.autoSubstatFlex = false
  }

  if ((normalized.rarityMode === 'auto') && ((normalized.earlyKeepMode ?? 'early') === 'late') && normalized.autoRaritySupplementsThreshold == null) {
    normalized.autoRaritySupplementsThreshold = 'rare'
  }

  normalized = normalizeExportModeFields(normalized as unknown as Record<string, unknown>) as unknown as BuilderRecipe
  // Full keep-state pipeline (includes faction/slot scope, keep mode, aggregate roll targets,
  // auto rarity supplements, auto substat flex) — single SSOT for all recipe normalizations.
  normalized = normalizeRecipeKeepState(normalized)
  if (legacyLockedCarryValue !== null && ((normalized.lockedMinRequiredRolls ?? 0) <= 0)) {
    const clamped = Math.max(0, Math.min(5, legacyLockedCarryValue)) as LockedMinValue
    normalized.lockedMinRequiredRolls = clamped
  }
  if (legacyManualMinValue !== null) {
    const lockedCount = Array.isArray(normalized.fixedSubstatsV) ? normalized.fixedSubstatsV.length : 0
    const shouldRestoreManual = !legacyMinRollsScopeLocked || lockedCount === 0
    if (shouldRestoreManual) {
      normalized.autoMinRequiredRolls = false
      normalized.minRequiredRolls = legacyManualMinValue as AggregateMinValue
    }
  }
  return normalized
}

/** Normalize SFC Minima (label-keyed) to the internal Substat Target table. */
export function normalizeSubstatTargets(src: unknown): SubstatTargetTable {
  // SFC stores per-rank targets keyed by stat label; convert them back to the
  // variant IDs we use internally so builder math does not depend on labels.
  const coerceStar = (rec: unknown): Record<number, number> => {
    const out: Record<number, number> = {}
    if (!rec || typeof rec !== 'object') return out
    for (const [k, v] of Object.entries(rec as Record<string, unknown>)) {
      const vk = variantFromLabel(k)
      if (vk === null) continue
      const num = Number(v)
      if (Number.isFinite(num)) out[vk as number] = num
    }
    return out
  }
  const s = (src && typeof src === 'object') ? (src as Record<string, unknown>) : {}
  const fallbackRaw = s['anyRankDefaultsTo']
  const coerceFallback = (): Star => {
    if (typeof fallbackRaw === 'number' && fallbackRaw >= 1 && fallbackRaw <= 6) return fallbackRaw as Star
    if (typeof fallbackRaw === 'string') {
      const lower = fallbackRaw.toLowerCase()
      if (lower === 'six' || lower === '6') return 6
      if (lower === 'five' || lower === '5') return 5
      if (lower === 'four' || lower === '4') return 4
      if (lower === 'three' || lower === '3') return 3
      if (lower === 'two' || lower === '2') return 2
      if (lower === 'one' || lower === '1') return 1
    }
    return 6
  }
  return {
    one: coerceStar(s['one']),
    two: coerceStar(s['two']),
    three: coerceStar(s['three']),
    four: coerceStar(s['four']),
    five: coerceStar(s['five']),
    six: coerceStar(s['six']),
    anyRankDefaultsTo: coerceFallback(),
  }
}

// Build a readable recipe object for SFC export/copy (labels, not numeric IDs)
/** Build a single readable SFC recipe from internal BuilderRecipe state. */
export function buildReadableRecipe(recipe: BuilderRecipe, metasets: Metaset[]) {
  // Metasets are included in the SFC payload separately; recipes now reference
  // metasets by ID. We keep the parameter for call‑site symmetry and future use.
  void metasets
  const mainV = (recipe as (BuilderRecipe & { mainStatsV?: number[] })).mainStatsV ?? []
  const subV = (recipe as (BuilderRecipe & { substatsV?: number[] })).substatsV ?? []
  const fixedV = (recipe as (BuilderRecipe & { fixedSubstatsV?: number[] })).fixedSubstatsV ?? []
  // Canonicalize label order for SFC: use preferred stat order via compareVariants.
  const mainLabels = mainV.slice().sort(compareVariants).map(labelOfVariant)
  const substatEntries: ReadonlyArray<ReadableSubstatEntry> = (() => {
    const entries: ReadableSubstatEntry[] = []
    if (!subV.length) return entries
    const sortedVariants = subV.slice().sort(compareVariants)
    const fixedSet = new Set<number>(fixedV)
    const boundsMap = (recipe as (BuilderRecipe & { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }> })).substatRollBoundsV ?? {}
    for (const variant of sortedVariants) {
      const entry: ReadableSubstatEntry = { stat: labelOfVariant(variant) }
      if (fixedSet.has(variant)) entry.fixed = true
      const maybeBounds = boundsMap[variant]
      if (maybeBounds) {
        // `not` is mutually exclusive; emit only it when set.
        if (maybeBounds.not === true) {
          entry.rollBounds = { not: true }
        } else {
          const normalized: ReadableSubstatBounds = {}
          if (typeof maybeBounds.min === 'number' && Number.isFinite(maybeBounds.min)) normalized.min = maybeBounds.min
          if (typeof maybeBounds.max === 'number' && Number.isFinite(maybeBounds.max)) normalized.max = maybeBounds.max
          // min/max and any are mutually exclusive — mirror the same invariant the
          // SFC reader enforces (sfcIO.ts lines ~606-608).
          const hasNumeric = normalized.min !== undefined || normalized.max !== undefined
          if (!hasNumeric && maybeBounds.any) normalized.any = true
          if (normalized.min !== undefined || normalized.max !== undefined || normalized.any) entry.rollBounds = normalized
        }
      }
      entries.push(entry)
    }
    return entries
  })()
  const exportMode: SellfileExportMode = recipe.exportMode
  const exportModeLabel = exportMode === 'separator'
    ? 'Separator'
    : exportMode === 'disabled'
      ? 'Disabled'
      : 'Active'
  const readableTargets = rollTargetsToReadable((recipe as BuilderRecipe).substatRollTargetsV)
  // Canonicalize tags for SFC output (includes legacy safeguard-ignore aliases).
  const tags = normalizeTagList(recipe.tags) ?? []
  return {
    // Appearance is persisted as a nested record and spread first so it leads the entry.
    ...appearancePersistField(recipe.appearance),
    // Emit tags only when non-empty to keep payloads clean.
    ...(tags.length > 0 ? { Tags: tags } : {}),
    keep: recipe.keep,
    SellfileVisibility: exportModeLabel,
    // For readability in SFC/clipboard, render Auto or explicit labels. "Any" when code is 0.
    Rank: (recipe.rankCode === RankCode.Any ? 'Any' : formatRank(recipe.rankCode)),
    Rarity: (recipe.rarityMode === 'auto' ? RARITY_AUTO_LABEL : (recipe.rarityCode === RarityCode.Any ? 'Any' : rarityCodeToName(recipe.rarityCode))),
    Faction: ((recipe.factionCode ?? 0) === 0 ? 'Any' : factionCodeToName(recipe.factionCode ?? 0)),
    mainStats: mainLabels,
    // New schema: emit explicit level window and omit legacy roll fields
    minLevel: ((recipe as BuilderRecipe).minLevel ?? LEVEL_MILESTONES[0]!),
    maxLevel: ((recipe as BuilderRecipe).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!),
    ...(recipe.earlyKeepMode === 'late' ? { earlyKeepMode: 'late' as const } : {}),
    substats: substatEntries,
    // Include only when applicable: Rarity=Auto and thresholds active in Late mode
    ...((recipe.rarityMode === 'auto' && recipe.earlyKeepMode === 'late' && isMilestoneThresholdsActive(recipe))
      ? { autoRarityThreshold: (recipe.autoRaritySupplementsThreshold ?? 'rare') }
      : {}),
    ...(readableTargets ? { substatRollTargets: readableTargets } : {}),
    minCount: recipe.minCount,
    autoMinCount: recipe.autoMinCount,
    ...(recipe.autoSubstatFlex && canEnableSubstatFlex(recipe) ? { autoSubstatFlex: true as const } : {}),
    minRequiredRolls: (recipe.minRequiredRolls ?? 0),
    autoMinRequiredRolls: (recipe.autoMinRequiredRolls ?? true),
    lockedMinRequiredRolls: (recipe.lockedMinRequiredRolls ?? 0),
    artifactTypeNames: (recipe.artifactTypes ?? []).slice().sort(compareArtifactTypes).map(t => artifactTypeNames[Number(t)]).filter(Boolean),
    // Artifact sets now serialize as objects so exclusions can be preserved.
    artifactSetNames: buildReadableArtifactSetEntries(recipe.artifactSets ?? []),
    // Metaset names are the primary key; emit them directly. Legacy readers
    // that only understand artifactMetaSetIds will skip this field gracefully.
    artifactMetaSetNames: (recipe.artifactMetaSets ?? []).slice(),
  }
}

/** Convert variant-keyed Substat Target tables to label-keyed maps for SFC export (SFC field remains "Minima"). */
export function substatTargetsToReadable(substatTargets: SubstatTargetTable) {
  const conv = (rec: Record<number, number>) => {
    const out: Record<string, number> = {}
    for (const [vk, val] of Object.entries(rec)) { out[labelOfVariant(Number(vk))] = val as number }
    return out
  }
  const fallbackLabel = (() => {
    if (!substatTargets.anyRankDefaultsTo) return 'six'
    switch (substatTargets.anyRankDefaultsTo) {
      case 1: return 'one'
      case 2: return 'two'
      case 3: return 'three'
      case 4: return 'four'
      case 5: return 'five'
      default: return 'six'
    }
  })()
  return {
    one: conv(substatTargets.one as Record<number, number>),
    two: conv(substatTargets.two as Record<number, number>),
    three: conv(substatTargets.three as Record<number, number>),
    four: conv(substatTargets.four as Record<number, number>),
    five: conv(substatTargets.five as Record<number, number>),
    six: conv(substatTargets.six as Record<number, number>),
    anyRankDefaultsTo: fallbackLabel,
  }
}

// Parse text that may be a single recipe, an array, or an SFC object with Recipes
/** Parse text as SFC content: returns normalized recipes array on success, [] on failure. */
export function parseRecipesFromText(text: string, metasetsForNames?: Metaset[]): BuilderRecipe[] {
  try {
    const parsed = JSON.parse(text) as unknown
    // Resolve metaset references from a raw recipe record. Reads artifactMetaSetNames
    // (current format) first; falls back to legacy artifactMetaSetIds mapped to names
    // via the embedded Metasets array.
    const resolveMetaNames = (rawRecipe: unknown, metas: Metaset[]): string[] => {
      const rec = (rawRecipe && typeof rawRecipe === 'object') ? (rawRecipe as Record<string, unknown>) : {}
      // Current format: names are the primary key.
      const names = Array.isArray(rec['artifactMetaSetNames']) ? (rec['artifactMetaSetNames'] as unknown[]).map(String) : []
      if (names.length) return names
      // Legacy fallback: IDs must be resolved to names via the embedded Metasets list.
      const ids = Array.isArray(rec['artifactMetaSetIds']) ? (rec['artifactMetaSetIds'] as unknown[]).map(String) : []
      if (!ids.length) return []
      const byId = new Map<string, string>()
      for (const m of metas) {
        // id may be present in legacy parsed Metaset entries (not on the Metaset type).
        const legacyId = String((m as unknown as Record<string, unknown>)['id'] ?? '')
        if (legacyId) byId.set(legacyId, m.name)
      }
      return ids.map(id => byId.get(id)).filter((x): x is string => typeof x === 'string')
    }
    const metasFromObj = (obj: Record<string, unknown>): Metaset[] | null => {
      const raws = obj['Metasets']
      if (!Array.isArray(raws)) return null
      try {
        return (raws as unknown[]).map((m) => {
          const mRec = (m || {}) as Record<string, unknown>
          const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
          const sets = names.map((n: unknown) => resolveSetId(n)).filter((x: unknown): x is number => typeof x === 'number')
          // id field is ignored; name is the primary key. Normalize iconId so clipboard
          // and single-recipe import paths preserve icon data, matching parseSfcObject.
          const iconId = normalizeMetasetIconId(mRec['iconId'])
          return { name: String(mRec['name']), sets, show: mRec['show'] !== false, iconId }
        })
      } catch { return null }
    }
    if (Array.isArray(parsed)) {
      const metas = metasetsForNames ?? []
      return parsed.map((raw) => {
        const base = normalizeRecipe(raw)
        const metaIds = metas.length ? resolveMetaNames(raw, metas) : []
        return mergeMetasetNames(base, metas, metaIds)
      })
    }
    if (isRecord(parsed)) {
      const recipes = Array.isArray(parsed['Recipes'])
        ? (parsed['Recipes'] as unknown[])
        : (Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : [])
      const metas = metasFromObj(parsed) ?? metasetsForNames ?? []
      if (recipes.length) {
        return recipes.map((raw) => {
          const base = normalizeRecipe(raw)
          const metaIds = metas.length ? resolveMetaNames(raw, metas) : []
          return mergeMetasetNames(base, metas, metaIds)
        })
      }
      const base = normalizeRecipe(parsed)
      const metaIds = metas.length ? resolveMetaNames(parsed, metas) : []
      return [mergeMetasetNames(base, metas, metaIds)]
    }
  } catch {
    // ignore
  }
  return []
}

/**
 * Parse a full SFC text payload and return normalized state slices.
 * Accepts a previous snapshot for metasets/substatTargets/allExplicit defaults.
 */
export function parseSfcText(
  text: string,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
  options?: { runtimeSetNameMap?: Map<string, number> },
): {
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  selectedIndex: number | null
  note?: string
  // null when the key was absent from the source (e.g. recipe-only clipboard copy).
  // Callers that perform a full replace (file import) should fall back to defaults;
  // callers that merge into existing state (clipboard paste) should skip applying.
  finalSellRemainder: FinalSellRemainderConfig | null
  safeguardRules: SafeguardRule[] | null
  safeguardsEnabled: boolean | null
  recipesEnabled: boolean
} {
  const parsed = JSON.parse(text) as unknown
  return parseSfcObject(parsed, prev, options)
}

/** Parse an SFC object (readable schema) into normalized slices. */
export function parseSfcObject(
  parsed: unknown,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
  options?: { runtimeSetNameMap?: Map<string, number> },
): {
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  selectedIndex: number | null
  note?: string
  // null when the key was absent from the source (e.g. recipe-only clipboard copy).
  // Callers that perform a full replace (file import) should fall back to defaults;
  // callers that merge into existing state (clipboard paste) should skip applying.
  finalSellRemainder: FinalSellRemainderConfig | null
  safeguardRules: SafeguardRule[] | null
  safeguardsEnabled: boolean | null
  recipesEnabled: boolean
} {
  const parsedRec = (typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
  const runtimeSetNameMap = options?.runtimeSetNameMap
  let rawRecipes = Array.isArray(parsed)
    ? parsed
    : (
      Array.isArray(parsedRec['Recipes'])
        ? (parsedRec['Recipes'] as unknown[])
        : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
    )
  // Convenience: accept a single readable-recipe object (tests/fixtures/*.sfc use this simplified shape).
  // Why: Developers often drag these fixtures into the app while validating builder output. The shape
  // matches what parseSfcText expects for each recipe, so when no `Recipes` array is present but we
  // detect the usual readable recipe keys, treat the payload as a one-item Recipes array.
  if (rawRecipes.length === 0 && parsedRec && typeof parsedRec === 'object') {
    const hasReadableRecipeKey = (() => {
      const keys = new Set(Object.keys(parsedRec))
      // Heuristic: any of these readable SFC recipe keys indicates a single-recipe payload.
      const hints = [
        'substats', 'fixedSubstats', 'mainStats', 'Rank', 'Rarity', 'Faction',
        'artifactTypeNames', 'artifactSetNames', 'artifactMetaSetNames',
        'minLevel', 'maxLevel', 'minCount', 'minRequiredRolls', 'substatRollBounds',
      ]
      for (const k of hints) if (keys.has(k)) return true
      return false
    })()
    if (hasReadableRecipeKey) rawRecipes = [parsedRec]
  }
  // Build a legacy-ID → name map from the raw Metasets array before constructing typed objects.
  // This is used below to resolve old artifactMetaSetIds in recipe records.
  const legacyMetaIdToName = new Map<string, string>()
  const metasets: Metaset[] = (() => {
    const raws = parsedRec['Metasets']
    if (!Array.isArray(raws)) return prev.metasets
    return raws.map((m: unknown) => {
      const mRec = (m || {}) as Record<string, unknown>
      const rawId = String(mRec['id'] ?? '')
      const rawName = String(mRec['name'] ?? '')
      // Populate legacy-ID map while we still have the raw record.
      if (rawId) legacyMetaIdToName.set(rawId, rawName)
      const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
      const sets = names
        .map((n: unknown) => resolveSetId(n, runtimeSetNameMap))
        .filter((x: unknown): x is number => typeof x === 'number')
      const iconId = normalizeMetasetIconId(mRec['iconId'])
      // id field intentionally omitted — name is now the primary key.
      return { name: rawName, sets, show: mRec['show'] !== false, iconId }
    })
  })()
  const substatTargets: SubstatTargetTable = (!Array.isArray(parsed) && parsedRec['Minima'])
    ? normalizeSubstatTargets(parsedRec['Minima'])
    : prev.substatTargets
  const recipes: BuilderRecipe[] = rawRecipes.map((raw) => {
    // Only autosave restore provides `runtimeSetNameMap`.
    const base = normalizeRecipe(raw, runtimeSetNameMap)
    const rec = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
    // Current format: artifactMetaSetNames contains display names directly.
    const names = Array.isArray(rec['artifactMetaSetNames']) ? (rec['artifactMetaSetNames'] as unknown[]).map(String) : []
    let resolvedNames = names
    if (!resolvedNames.length) {
      // Legacy fallback: map IDs to names via the legacyMetaIdToName map built above.
      const legacyIds = Array.isArray(rec['artifactMetaSetIds']) ? (rec['artifactMetaSetIds'] as unknown[]).map(String) : []
      if (legacyIds.length) {
        resolvedNames = legacyIds.map(id => legacyMetaIdToName.get(id)).filter((x): x is string => typeof x === 'string')
      }
    }
    return mergeMetasetNames(base, metasets, resolvedNames)
  })
  // Optional Final Sell configuration — null when the key is absent (e.g. recipe-only copy).
  const fsr = (() => {
    const DEFAULT_LEVELS: LevelMilestone[] = FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[]
    const DEFAULT_MODE = FINAL_SELL_DEFAULT_SETS_MODE
    // Array input (legacy bare-array format) never carries FinalSell — treat as absent.
    if (Array.isArray(parsed)) return null
    // Key absent → null so callers can distinguish "not present" from "present but disabled".
    if (!('FinalSellRemainder' in parsedRec)) return null
    const v = parsedRec['FinalSellRemainder']
    // Key present but invalid value → return the disabled config (explicit author intent).
    if (!v || typeof v !== 'object') return { artifacts: false, accessories: false, levels: DEFAULT_LEVELS, setsMode: DEFAULT_MODE }
    const rec = v as Record<string, unknown>
    const artifacts = rec['artifacts'] === true ? true : false
    const accessories = rec['accessories'] === true ? true : false
    const levelsRaw = Array.isArray(rec['levels']) ? (rec['levels'] as unknown[]) : []
    const allowed = new Set<LevelMilestone>(LEVEL_MILESTONES)
    const levels = levelsRaw.map(x => Number(x) as LevelMilestone).filter((l): l is LevelMilestone => allowed.has(l))
    const finalLevels = levels.length === 0 ? DEFAULT_LEVELS : Array.from(new Set(levels)).sort((a,b)=>a-b)
    const modeRaw = rec['setsMode']
    const setsMode: FinalSellSetsMode = modeRaw === FINAL_SELL_SETS_MODE_ANY
      ? FINAL_SELL_SETS_MODE_ANY
      : modeRaw === FINAL_SELL_SETS_MODE_EXPLICIT
        ? FINAL_SELL_SETS_MODE_EXPLICIT
        : DEFAULT_MODE
    return { artifacts, accessories, levels: finalLevels, setsMode }
  })()
  // null when neither key is present — caller should preserve current state rather than reset.
  const safeguardRules: SafeguardRule[] | null = (() => {
    // SFC boundary compatibility: accept both canonical and legacy keys.
    if (!('Safeguards' in parsedRec) && !('KeepUniques' in parsedRec)) return null
    const raws = Array.isArray(parsedRec['Safeguards'])
      ? parsedRec['Safeguards']
      : parsedRec['KeepUniques']
    if (!Array.isArray(raws)) return []
    const normalized: SafeguardRule[] = []
    for (const entry of raws) {
      const rule = normalizeSafeguardRule(entry)
      if (!rule) continue
      // Legacy-ID resolution: old SFC files stored metaSetIds (opaque IDs like "meta/1")
      // in safeguard combinations. normalizeSafeguardRule collects them verbatim into
      // metaSetNames; remap any that appear in the legacyMetaIdToName map built above.
      if (rule.combination.metaSetNames?.length && legacyMetaIdToName.size) {
        const remapped = rule.combination.metaSetNames.map(
          (n) => legacyMetaIdToName.get(n) ?? n,
        )
        normalized.push({ ...rule, combination: { ...rule.combination, metaSetNames: remapped } })
      } else {
        normalized.push(rule)
      }
    }
    return normalized
  })()
  // SFC boundary compatibility: keep legacy toggle key support on read only.
  // null when the key is absent — caller should preserve current state rather than reset.
  const safeguardsEnabled: boolean | null = (
    'SafeguardsEnabled' in parsedRec || 'KeepUniquesEnabled' in parsedRec
  )
    ? (parsedRec['SafeguardsEnabled'] === true || parsedRec['KeepUniquesEnabled'] === true)
    : null
  const recipesEnabled = parsedRec['RecipesEnabled'] !== false
  // Manual loads always start at the first recipe; selection is not persisted in SFC.
  const selectedIndex = recipes.length > 0 ? 0 : null
  // Canonicalize legacy note markers during SFC import so runtime state uses new wording only.
  // Accept both the legacy plain-string form and the current array-of-lines form.
  const rawVersion = typeof parsedRec['Version'] === 'string' ? parsedRec['Version'] : undefined
  const rawNote = parsedRec['Note']
  const noteStr = Array.isArray(rawNote)
    ? rawNote.map(String).join('\n')
    : typeof rawNote === 'string' ? rawNote : undefined
  // Files written before v1.0.13 used space-separated improvchance values; convert to commas.
  const migratedNoteStr = noteStr && sfcVersionAtMost(rawVersion, 1, 0, 13)
    ? migrateImprovchanceSpacesToCommas(noteStr)
    : noteStr
  const note = migratedNoteStr ? canonicalizeLegacyNoteMarkers(migratedNoteStr) : undefined
  return {
    recipes,
    metasets,
    substatTargets,
    selectedIndex,
    ...(note ? { note } : {}),
    finalSellRemainder: fsr,
    safeguardRules,
    safeguardsEnabled,
    recipesEnabled,
  }
}

/** Read a `.sfc` (or legacy `.sfr`/`.hsfc`)/JSON file and parse with parseSfcText semantics. */
export async function readSfcFile(
  file: File,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
): Promise<{
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  selectedIndex: number | null
  note?: string
  // null when the key was absent from the file (old SFC without these sections).
  finalSellRemainder: FinalSellRemainderConfig | null
  safeguardRules: SafeguardRule[] | null
  safeguardsEnabled: boolean | null
  recipesEnabled: boolean
}>
{
  const text = await file.text()
  return parseSfcText(text, prev)
}

/** Parse an internal autosave payload (not SFC); expects variant-keyed substatTargets and full BuilderRecipe objects. */

/**
 * Build a full, readable SFC payload object for Save/Copy, given current state.
 */
// Safeguard entries in SFC should stay human-readable; this tuple mirrors the
// in-memory shape but with labels instead of numeric IDs so saved files are self-explanatory.
type ReadableArtifactSetExportEntry = {
  // Human-readable set label for SFC exports.
  name: string
  // Optional exclusion marker so safeguard exports preserve "not" selections.
  excluded?: true
}

type ReadableSafeguardTuple = {
  slots: string[]
  // Keep sets readable but preserve exclusions with structured entries.
  sets: ReadableArtifactSetExportEntry[]
  metaSetNames: string[]
  ranks: string[]
  rarities: string[]
  mainStats: string[]
  factions: string[]
}

export type ReadableSafeguardRuleEntry = {
  // Nested appearance record (name + optional fgColor). Emitted first when present.
  appearance?: NameAppearance
  // Tags for safeguard-overrides DSL targeting; omitted when empty.
  tags?: string[]
  requiredCount: number
  activation: SafeguardRuleActivation
  countMode: SafeguardRule['countMode']
  ignorePreviousSafeguards_v2?: boolean
  ignoreEquippedInCollection?: boolean
  ignoreEquippedInVault?: boolean
  // Per-level improvement-chance thresholds; written as an object in the current format.
  // Legacy files may have a bare number (handled on import via normalizeLegacyImprovementChanceThreshold).
  improvementChanceThreshold?: { atLevel0: number; atLevel4: number | null; atLevel8: number | null; atLevel12: number | null }
  tuple: ReadableSafeguardTuple
  substats?: string[]
  substatMatch?: string
  substatWeights?: Record<string, number>
  // "Weight by Rank" toggle; written only when true (omitted → off on load, backward-compatible).
  weightMainStatByRank?: boolean
  // Tunable main-stat rank factor; written only when non-default (omitted → 1.0 on load).
  mainStatRankWeightFactor?: number
}

// Build a readable safeguard tuple from a combination filter.
const buildReadableSafeguardTuple = (combination: SafeguardRule['combination']): ReadableSafeguardTuple => {
  // Sort the combination so exported tuples stay deterministic.
  const sorted = sortSafeguardCombination(combination)
  const slotLabels = sorted.slots
    .map((slot) => artifactTypeNames[Number(slot)] ?? String(slot))
  // Preserve exclude flags while keeping readable set labels.
  const setLabels = buildReadableArtifactSetEntries(sorted.sets ?? [])
  const rankLabels = sorted.ranks
    .map((rank) => formatRank(rank as RankCode))
    .filter((label) => Boolean(label && label.trim()))
  const rarityLabels = sorted.rarities
    .map((rarity) => SAFEGUARD_RARITY_LABEL[Number(rarity)] ?? rarityCodeToName(rarity))
    .filter((label) => Boolean(label && label.trim()))
  const mainStatLabels = (sorted.mainStats ?? [])
    .map((stat) => labelOfVariant(stat))
    .filter((label) => Boolean(label && label.trim()))
  const factionLabels = sorted.factions
    .map((faction) => factionNames[Number(faction)] ?? String(faction))
    .filter((label) => Boolean(label && label.trim()))
  return {
    slots: slotLabels,
    sets: setLabels,
    metaSetNames: [...(sorted.metaSetNames ?? [])],
    ranks: rankLabels,
    rarities: rarityLabels,
    mainStats: mainStatLabels,
    factions: factionLabels,
  }
}

// Build a readable safeguard export entry from an in-memory rule.
export const buildReadableSafeguardRuleEntry = (rule: SafeguardRule): ReadableSafeguardRuleEntry => {
  // Persist the normalized scope object explicitly so the loader can rehydrate chips.
  const mode = sanitizeSafeguardCountMode(rule.countMode)
  // Capture selected substats in readable form so exports stay user-friendly.
  const substatVariants = sortSafeguardSubstats(rule.substats ?? [])
  // Map variants to readable labels; fall back to numeric IDs if needed.
  const substatLabels = substatVariants
    .map((variant) => {
      const label = labelOfVariant(variant)
      return label && label.trim().length > 0 ? label : String(variant)
    })
    .filter((label) => Boolean(label && label.trim()))
  // Substat matching only matters when a selection exists.
  const hasSubstatSelection = substatLabels.length > 0
  // Normalize the match so Min1 (the default) stays implicit unless overridden.
  const normalizedSubstatMatch = normalizeSafeguardSubstatMatch(rule.substatMatch)
  const shouldSerializeMatch = hasSubstatSelection
    && normalizedSubstatMatch !== SafeguardSubstatMatch.Min1
  // Weight controls are honored for min-count modes; Per Substat uses equal weighting.
  const allowSubstatWeights = hasSubstatSelection
    && normalizedSubstatMatch !== SafeguardSubstatMatch.PerSubstat
  // Serialize weights by readable label, but only for selected substats.
  const substatWeights: Record<string, number> = {}
  if (allowSubstatWeights) {
    const selectedSet = new Set(substatVariants.map((variant) => Number(variant)))
    const rawWeights = rule.substatWeights ?? {}
    for (const [rawKey, rawWeight] of Object.entries(rawWeights)) {
      const variant = Number(rawKey)
      // Only include weights for selected, valid variants.
      if (!Number.isFinite(variant) || !selectedSet.has(variant)) continue
      const label = labelOfVariant(variant)
      const key = label && label.trim().length > 0 ? label : String(variant)
      const weight = Number(rawWeight)
      if (!Number.isFinite(weight)) continue
      substatWeights[key] = weight
    }
  }
  // Build the base export entry in readable SFC form. The appearance record is spread
  // first so it appears as the leading field of every serialized safeguard entry.
  const entry: ReadableSafeguardRuleEntry = {
    ...appearancePersistField(rule.appearance),
    requiredCount: Math.max(1, Math.floor(rule.requiredCount)),
    activation: rule.activation ?? SafeguardRuleActivation.ProtectExisting,
    countMode: {
      perRule: mode.perRule,
      perSet: mode.perSet,
      perFaction: mode.perFaction,
      perMainStat: mode.perMainStat,
      perSlot: mode.perSlot,
    },
    ignorePreviousSafeguards_v2: rule.ignorePreviousSafeguards !== false,
    ignoreEquippedInCollection: rule.ignoreEquippedInCollection === true,
    ignoreEquippedInVault: rule.ignoreEquippedInVault === true,
    tuple: buildReadableSafeguardTuple(rule.combination),
  }
  // Serialize tags when the rule has any; omit the key for backward-compat.
  const normalizedTags = normalizeTagList(rule.tags)
  if (normalizedTags && normalizedTags.length > 0) entry.tags = normalizedTags
  // Serialize per-level thresholds only when the feature is enabled (non-null).
  const thr = rule.improvementChanceThreshold
  if (thr !== null && thr !== undefined) {
    const clampDecimal = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10
    entry.improvementChanceThreshold = {
      atLevel0:  clampDecimal(thr.atLevel0),
      atLevel4:  thr.atLevel4  != null ? clampDecimal(thr.atLevel4)  : null,
      atLevel8:  thr.atLevel8  != null ? clampDecimal(thr.atLevel8)  : null,
      atLevel12: thr.atLevel12 != null ? clampDecimal(thr.atLevel12) : null,
    }
  }
  // Capture substat filters when they are present.
  if (hasSubstatSelection) entry.substats = substatLabels
  // Avoid writing the implicit Any match.
  if (shouldSerializeMatch) entry.substatMatch = normalizedSubstatMatch
  // Only emit weights when they are non-default.
  if (Object.keys(substatWeights).length > 0) entry.substatWeights = substatWeights
  // Emit "Weight by Rank" only when enabled; omission loads as off (backward-compatible).
  if (rule.weightMainStatByRank) entry.weightMainStatByRank = true
  // Emit the main-stat rank factor only when it differs from the neutral default (1.0); omission
  // loads as 1.0 so files that never touched this control stay byte-identical to the old format.
  if (typeof rule.mainStatRankWeightFactor === 'number'
    && rule.mainStatRankWeightFactor !== SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT) {
    entry.mainStatRankWeightFactor = rule.mainStatRankWeightFactor
  }
  return entry
}

export function buildSfcPayload(args: {
  version: string,
  metasets: Metaset[],
  substatTargets: SubstatTargetTable,
  recipes: BuilderRecipe[],
  finalSellRemainder?: FinalSellRemainderConfig,
  note?: string,
  safeguardRules?: SafeguardRule[],
  safeguardsEnabled?: boolean,
  recipesEnabled?: boolean,
  }): {
    Version: string
    Metasets: Array<{ name: string; setNames: string[]; show?: boolean }>
    Minima: unknown
    Recipes: unknown[]
    FinalSellRemainder: FinalSellRemainderConfig
    Safeguards: Array<{
      name?: string
      requiredCount: number
      activation: SafeguardRuleActivation
      countMode: SafeguardRule['countMode']
      ignorePreviousSafeguards_v2?: boolean
      ignoreEquippedInCollection?: boolean
      ignoreEquippedInVault?: boolean
      tuple: ReadableSafeguardTuple
      substats?: string[]
      substatMatch?: string
      substatWeights?: Record<string, number>
      weightMainStatByRank?: boolean
      mainStatRankWeightFactor?: number
    }>
    SafeguardsEnabled: boolean
    RecipesEnabled: boolean
    // Array of lines for diff-friendliness; legacy files may still carry a plain string.
    Note?: string[]
  } {
  const {
    version,
    metasets,
    substatTargets,
    recipes,
    finalSellRemainder,
    note,
    safeguardRules = [],
    safeguardsEnabled = false,
    recipesEnabled = true,
  } = args
  const metasOut = metasets.map(m => {
    const iconId = normalizeMetasetIconId(m.iconId)
    // id field omitted — name is now the primary key.
    return {
      name: m.name,
      setNames: m.sets.slice().sort(compareArtifactSets)
        .map((id) => artifactSetName(Number(id) as ArtifactSetId))
        .filter((x): x is string => Boolean(x && x.trim())),
      show: m.show !== false,
      ...(iconId !== DEFAULT_METASET_ICON_ID ? { iconId } : {}),
    }
  })
  return {
    Version: version,
    Metasets: metasOut,
    Minima: substatTargetsToReadable(substatTargets),
    Recipes: recipes.map((recipe) => buildReadableRecipe(recipe, metasets)),
    FinalSellRemainder: (() => {
      if (finalSellRemainder) {
        const safeLevels = Array.from(new Set(finalSellRemainder.levels)).sort((a, b) => a - b) as LevelMilestone[]
        const setsMode = finalSellRemainder.setsMode ?? FINAL_SELL_DEFAULT_SETS_MODE
        return { ...finalSellRemainder, levels: safeLevels, setsMode }
      }
      return {
        artifacts: false,
        accessories: false,
        levels: FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[],
        setsMode: FINAL_SELL_DEFAULT_SETS_MODE,
      }
    })(),
    // Safeguard exports reuse the shared readable helper for clipboard parity.
    Safeguards: safeguardRules.map((rule) => buildReadableSafeguardRuleEntry(rule)),
    SafeguardsEnabled: safeguardsEnabled === true,
    RecipesEnabled: recipesEnabled !== false,
    // Canonicalize legacy marker aliases so exports never re-emit old note keywords.
    // Store as an array of lines so the saved file is diff-friendly and copy-readable.
    ...(note ? { Note: canonicalizeLegacyNoteMarkers(note).split('\n') } : {}),
  }
}

/** Convert an SFC payload object to a Blob ready to download. */
export function sfcToBlob(payload: unknown): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
