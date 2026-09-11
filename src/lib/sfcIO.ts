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
import { normalizeExportModeFields, resolveExportModeField, coerceSellfileExportModeToken, normalizeRollTargetEntry, quantizeTargetValueForVariant, defaultSubstatTargets, isFactoryDefaultTargetValue, type BuilderRecipe, type SubstatTargetTable, type SellfileExportMode, type Star, type SubstatRollTargetEntry, type SubstatRollTargets } from './hsfBuilder'
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
  // Entry-kind discriminator: the SSOT for rule vs separator at every branch.
  safeguardEntryKind,
  // Membership predicate: the SSOT for "does this entry belong to a group at all".
  isSafeguardGrouped,
  sanitizeSafeguardCountMode,
  sortSafeguardCombination,
  sortSafeguardSubstats,
  type SafeguardRule,
  SafeguardRuleActivation,
  SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT,
  normalizeSafeguardGroupSettings,
  cloneSafeguardGroupSettings,
  type SafeguardGroupSettings,
} from './safeguards'
// Group repair runs on the whole parsed array — which entries form a run is a property of
// the sequence, not of any single entry. The writer asks the same authority which entries to nest.
import { normalizeSafeguardGroups, resolveSafeguardGroups, SAFEGUARD_GROUP_NO_RUN } from './safeguardGroups'
import { normalizeTagList } from './tagHelpers'
// Recipe behaviour flags plus the legacy tag transcode that keeps older files loading.
import { normalizeReworkGate, transcodeLegacyNoteTagSelectors, transcodeLegacyRecipeTags } from './recipeFlags'
// SFC key names live in the cross-language SSOT so the Rust reader declares the same ones.
import {
  LEGACY_RECIPE_TAG_LAST_WRITING_VERSION,
  SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS,
  SFC_RECIPE_FIELD_REWORK_GATE,
} from './generated/domainConstants'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import { appearancePersistField, readAppearanceFromRecord, type NameAppearance } from './nameAppearance'
import { normalizeArtifactSetSelections } from './gearSets/selection'
import {
  canonicalizeNoteRecipeOverridesMarkers,
  dropDefaultSafeguardOverridesAnswers,
  normalizeNoteRecipeOverridesAnswers,
  NOTE_RECIPE_OVERRIDES_ANSWERS_KEY,
  NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY,
  type NoteRecipeOverridesAnswers,
} from './noteRecipeOverrides'
import {
  normalizeNoteSafeguardOverridesAnswers,
  NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY,
  type NoteSafeguardOverridesAnswers,
} from './noteSafeguardOverrides'

// Legacy safeguard note markers used `keep-uniques` wording.
// Normalize opening markers at the SFC boundary so runtime/editor state stays canonical.
const NOTE_LEGACY_SAFEGUARDS_MARKER_OPEN_REGEX = /<!--(\s*)keep-uniques\b/gi

// Canonicalize all known legacy note aliases at SFC IO boundaries: the marker wording,
// plus the behaviour-tag selectors that predate the recipe flags.
//
// The selector rewrite is gated on the same legacy window as the recipe-tag transcode, so a
// file cannot have its tags left alone while its notes are rewritten to match tags that are
// no longer there. Marker canonicalization is unconditional — it is pure wording, with no
// behaviour attached, and current files never contain the old spelling anyway.
const canonicalizeLegacyNoteMarkers = (note: string, sourceVersion?: string): string => {
  const canonical = canonicalizeNoteRecipeOverridesMarkers(note)
    .replace(NOTE_LEGACY_SAFEGUARDS_MARKER_OPEN_REGEX, '<!--$1safeguards')
  return usesLegacyBehaviourTags(sourceVersion) ? transcodeLegacyNoteTagSelectors(canonical) : canonical
}

/** True when the SFC version string is at or below the given major.minor.patch ceiling.
 *  Pre-release / build-metadata suffixes (e.g. -dev, +build) are stripped before comparison.
 *  A missing or unparseable version is treated as old (returns true) — hand-written and
 *  third-party files carry arbitrary Version strings, and reading those as NEW would skip
 *  the migrations they most likely need. */
function sfcVersionAtMost(version: string | undefined, major: number, minor: number, patch: number): boolean {
  if (!version) return true
  const core = version.replace(/[-+].*$/, '')
  const parts = core.split('.').map(Number)
  // A non-numeric segment parses to NaN, which `??` does NOT catch (it is not nullish) and
  // which loses every comparison below — so coerce it to 0 to honour the "unparseable is
  // old" contract above rather than silently reporting such a file as new.
  const segment = (raw: number | undefined): number => (Number.isFinite(raw) ? Number(raw) : 0)
  const vmaj = segment(parts[0])
  const vmin = segment(parts[1])
  const vpatch = segment(parts[2])
  if (vmaj !== major) return vmaj < major
  if (vmin !== minor) return vmin < minor
  return vpatch <= patch
}

/** The transcode window's ceiling, read off the cross-language spec rather than re-spelled
 *  as digits here — the Rust SFC reader gates on the very same constant. Split once at module
 *  load; a missing segment coerces to 0 exactly like `sfcVersionAtMost` treats one. */
const LEGACY_TAG_CEILING = LEGACY_RECIPE_TAG_LAST_WRITING_VERSION.split('.')
  .map((part) => Number(part) || 0)
const LEGACY_TAG_CEIL_MAJOR = LEGACY_TAG_CEILING[0] ?? 0
const LEGACY_TAG_CEIL_MINOR = LEGACY_TAG_CEILING[1] ?? 0
const LEGACY_TAG_CEIL_PATCH = LEGACY_TAG_CEILING[2] ?? 0

/**
 * True when a file predates the recipe flags and may still encode behaviour as magic tags.
 *
 * THE definition of the legacy-transcode window, so the recipe-tag pass and the note-selector
 * pass can never disagree about which files get converted. The ceiling is the last release
 * that wrote behaviour tags; anything newer already stores the flags, so a legacy spelling
 * there is a deliberate user label and must survive as one. A missing/unparseable Version
 * reads as old, which is what keeps hand-written files converting.
 */
export const usesLegacyBehaviourTags = (version: string | undefined): boolean => (
  sfcVersionAtMost(version, LEGACY_TAG_CEIL_MAJOR, LEGACY_TAG_CEIL_MINOR, LEGACY_TAG_CEIL_PATCH)
)

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

function parseReadableTargetEntry(value: unknown, variant: number): SubstatRollTargetEntry | null {
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
  // Variant-aware ingress quantization: classic values round to integers, anomalous
  // snap to the 1.25 grid — an SFC carrying "SPD": 4.5 must not persist fractional.
  return normalizeRollTargetEntry(entry, variant)
}

function parseReadableRollTargetsMap(value: unknown): SubstatRollTargets | undefined {
  if (!value || typeof value !== 'object') return undefined
  const entries = value as Record<string, unknown>
  const out: SubstatRollTargets = {}
  for (const [label, entry] of Object.entries(entries)) {
    const variant = variantFromLabel(label)
    if (variant === null) continue
    const normalized = parseReadableTargetEntry(entry, variant)
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
    const normalized = normalizeRollTargetEntry(entry, Number(variantKey))
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
 *
 * `sourceVersion` is the owning file's `Version`. It gates the legacy behaviour-tag
 * transcode: only files at or below the last tag-writing release are converted, so a legacy
 * spelling typed into a current file survives as the plain label the user meant. Omitted by
 * callers with no file context, which reads as "old" and therefore still converts.
 */
export function normalizeRecipe(
  input: unknown,
  runtimeNameMap?: Map<string, number>,
  sourceVersion?: string,
): BuilderRecipe {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const recipes = Array.isArray(rec['Recipes']) ? rec['Recipes'] : rec['Configs']
  if (Array.isArray(recipes) && recipes.length > 0) {
    const first = recipes[0]
    // Unwrapping a nested payload keeps the same file context.
    if (isRecord(first)) return normalizeRecipe(first, runtimeNameMap, sourceVersion)
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


  // Current format marks separators with the same boolean flag safeguard entries use
  // (`Separator: true`); the SellfileVisibility='Separator' label below is the legacy
  // spelling and stays readable for old .sfc files.
  const exportMode: SellfileExportMode = (rec['Separator'] === true || rec['separator'] === true)
    ? 'separator'
    : resolveExportModeField({
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
  // Split the stored tags into surviving labels plus the flags older files encoded as magic
  // tags — but ONLY for files old enough to have written them. A current file already stores
  // the real flag keys, so a legacy-looking tag there is a deliberate user label and
  // converting it would silently eat a name the user chose.
  const rawTagList = normalizeTagList(rec['Tags'] ?? rec['tags'])
  const transcodedTags = usesLegacyBehaviourTags(sourceVersion)
    ? transcodeLegacyRecipeTags(rawTagList)
    // Outside the window tags pass through untouched and carry no flags.
    : { tags: rawTagList ?? [] }
  // Explicit flag keys are authoritative when present — a current build wrote them, so
  // they must beat anything a leftover legacy tag in the same file implied.
  const ignoredBySafeguards = typeof rec[SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS] === 'boolean'
    ? Boolean(rec[SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS])
    : transcodedTags.ignoredBySafeguards === true
  const reworkGate = normalizeReworkGate(rec[SFC_RECIPE_FIELD_REWORK_GATE]) ?? transcodedTags.reworkGate
  const baseRecipe: BuilderRecipe = {
    ...(baseAppearance ? { appearance: baseAppearance } : {}),
    // Tags keep only the user's own labels; behaviour moved to the two flags below.
    tags: transcodedTags.tags,
    // Both flags are omitted unless set, so an untouched recipe round-trips unchanged.
    ...(ignoredBySafeguards ? { ignoredBySafeguards: true as const } : {}),
    ...(reworkGate ? { reworkGate } : {}),
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
      // Quantize on the stat's own grid, like the roll-target ingress beside it —
      // an SFC value that never passed through the UI must not persist off-grid
      // (it would display verbatim yet apply floored, silently widening the rule).
      if (Number.isFinite(num)) out[vk as number] = quantizeTargetValueForVariant(vk as number, num)
    }
    return out
  }
  // A document stores only the targets that DEVIATE from the app's factory
  // defaults (see substatTargetsToReadable), so loading seeds each rank with the
  // current defaults and overlays what the file carries. Two consequences, both
  // intended: an entry the file omits tracks the app — so a default we later
  // correct reaches existing documents instead of staying frozen at the value
  // that was current when they were saved — and the in-memory table stays DENSE,
  // exactly as before, so every reader, equality check and history diff is
  // unaffected by the sparser file format. A target the user cleared is written
  // as 0 (0 differs from the factory value) and overlays the seed as 0.
  const seeded = defaultSubstatTargets()
  const withDefaults = (bucket: Record<number, number>, base: Record<number, number>): Record<number, number> => (
    { ...base, ...bucket }
  )
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
    one: withDefaults(coerceStar(s['one']), seeded.one),
    two: withDefaults(coerceStar(s['two']), seeded.two),
    three: withDefaults(coerceStar(s['three']), seeded.three),
    four: withDefaults(coerceStar(s['four']), seeded.four),
    five: withDefaults(coerceStar(s['five']), seeded.five),
    six: withDefaults(coerceStar(s['six']), seeded.six),
    anyRankDefaultsTo: coerceFallback(),
  }
}

// First selectable recipe index for load-time selection: separators are list
// dividers, not editable content, so fresh loads land on the first real recipe.
// Falls back to index 0 when the list holds only separators (still selectable).
export const firstSelectableRecipeIndex = (recipes: readonly BuilderRecipe[]): number | null => {
  if (recipes.length === 0) return null
  const idx = recipes.findIndex((r) => r.exportMode !== 'separator')
  return idx >= 0 ? idx : 0
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
  // Separators are pure list dividers: persist ONLY the appearance and the marker flag
  // (the same shape safeguard separators use). Every other recipe field is irrelevant
  // to a divider and deliberately not written — the loader fills defaults.
  if (exportMode === 'separator') {
    const entry: ReadableSeparatorEntry = {
      ...appearancePersistField(recipe.appearance),
      Separator: true,
    }
    return entry
  }
  const exportModeLabel = exportMode === 'disabled' ? 'Disabled' : 'Active'
  const readableTargets = rollTargetsToReadable((recipe as BuilderRecipe).substatRollTargetsV)
  // Canonicalize tags for SFC output. Legacy behaviour tags were transcoded away on load,
  // so nothing here ever re-emits them.
  const tags = normalizeTagList(recipe.tags) ?? []
  return {
    // Appearance is persisted as a nested record and spread first so it leads the entry.
    ...appearancePersistField(recipe.appearance),
    // Emit tags only when non-empty to keep payloads clean.
    ...(tags.length > 0 ? { Tags: tags } : {}),
    // Behaviour flags are written only when set, so a recipe that leaves them at their
    // default re-serializes byte-identically to a file written before they existed.
    ...(recipe.ignoredBySafeguards ? { [SFC_RECIPE_FIELD_IGNORED_BY_SAFEGUARDS]: true as const } : {}),
    ...(recipe.reworkGate ? { [SFC_RECIPE_FIELD_REWORK_GATE]: recipe.reworkGate } : {}),
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
  // Write DEVIATIONS only: a value equal to the app's factory default is omitted,
  // so the document keeps tracking that default as it improves rather than
  // freezing today's number. normalizeSubstatTargets re-seeds the omitted entries
  // on load, so this round-trips losslessly. See isFactoryDefaultTargetValue.
  const conv = (rec: Record<number, number>, star: Star) => {
    const out: Record<string, number> = {}
    for (const [vk, val] of Object.entries(rec)) {
      const variant = Number(vk)
      const value = val as number
      if (isFactoryDefaultTargetValue(variant, star, value)) continue
      out[labelOfVariant(variant)] = value
    }
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
    one: conv(substatTargets.one as Record<number, number>, 1),
    two: conv(substatTargets.two as Record<number, number>, 2),
    three: conv(substatTargets.three as Record<number, number>, 3),
    four: conv(substatTargets.four as Record<number, number>, 4),
    five: conv(substatTargets.five as Record<number, number>, 5),
    six: conv(substatTargets.six as Record<number, number>, 6),
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
      // A bare array carries no file context, so the version reads as absent (= old) and the
      // legacy transcode still runs — the same fallback normalizeRecipe documents.
      return parsed.map((raw) => {
        const base = normalizeRecipe(raw, undefined, undefined)
        const metaIds = metas.length ? resolveMetaNames(raw, metas) : []
        return mergeMetasetNames(base, metas, metaIds)
      })
    }
    if (isRecord(parsed)) {
      const recipes = Array.isArray(parsed['Recipes'])
        ? (parsed['Recipes'] as unknown[])
        : (Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : [])
      const metas = metasFromObj(parsed) ?? metasetsForNames ?? []
      // A pasted SFC object carries its own Version; honour it exactly as parseSfcObject does,
      // or a current-version paste would have its plain user labels eaten by the transcode.
      const pastedVersion = typeof parsed['Version'] === 'string' ? parsed['Version'] : undefined
      if (recipes.length) {
        return recipes.map((raw) => {
          const base = normalizeRecipe(raw, undefined, pastedVersion)
          const metaIds = metas.length ? resolveMetaNames(raw, metas) : []
          return mergeMetasetNames(base, metas, metaIds)
        })
      }
      const base = normalizeRecipe(parsed, undefined, pastedVersion)
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
/**
 * Normalized slices produced by every SFC reader. Named once so parseSfcText /
 * parseSfcObject / readSfcFile cannot drift — the shape was previously written out
 * inline three times, so a field added to one was silently missing from the others.
 */
export type ParsedSfcResult = {
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
  // Dynamic-overrides answers carried by the document. `null` means the key was ABSENT —
  // distinct from `{}` (present but empty), so a legacy file that never stored them can be
  // told apart from one that deliberately stores none. Callers decide what absence means.
  noteRecipeOverridesAnswers: NoteRecipeOverridesAnswers | null
  noteSafeguardOverridesAnswers: NoteSafeguardOverridesAnswers | null
  // Absent key reads as false — overrides are enabled unless the document says otherwise.
  noteOverridesDisabled: boolean
}

export function parseSfcText(
  text: string,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
  options?: { runtimeSetNameMap?: Map<string, number> },
): ParsedSfcResult {
  const parsed = JSON.parse(text) as unknown
  return parseSfcObject(parsed, prev, options)
}

/** Parse an SFC object (readable schema) into normalized slices. */
export function parseSfcObject(
  parsed: unknown,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
  options?: { runtimeSetNameMap?: Map<string, number> },
): ParsedSfcResult {
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
  // Read the file Version before the recipes: it gates the legacy behaviour-tag transcode,
  // so it has to be known while each recipe is normalized rather than after.
  const rawVersion = typeof parsedRec['Version'] === 'string' ? parsedRec['Version'] : undefined
  const recipes: BuilderRecipe[] = rawRecipes.map((raw) => {
    // Only autosave restore provides `runtimeSetNameMap`.
    const base = normalizeRecipe(raw, runtimeSetNameMap, rawVersion)
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
    for (const rule of parseReadableSafeguardEntries(raws)) {
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
    // Repair the groups once for the whole array. Per-entry normalization only carries each
    // member's stored settings; which entries form a run (and that every member of a run
    // agrees) is a property of the sequence, so it is settled here — one of exactly three call
    // sites, all of which hand a complete list to the Rust authority.
    return normalizeSafeguardGroups(normalized)
  })()
  // SFC boundary compatibility: keep legacy toggle key support on read only.
  // null when the key is absent — caller should preserve current state rather than reset.
  const safeguardsEnabled: boolean | null = (
    'SafeguardsEnabled' in parsedRec || 'KeepUniquesEnabled' in parsedRec
  )
    ? (parsedRec['SafeguardsEnabled'] === true || parsedRec['KeepUniquesEnabled'] === true)
    : null
  const recipesEnabled = parsedRec['RecipesEnabled'] !== false
  // Manual loads (file/clipboard/preset) start at the first NON-SEPARATOR recipe —
  // selection is not persisted in SFC; autosave restore applies its own saved index.
  const selectedIndex = firstSelectableRecipeIndex(recipes)
  // Canonicalize legacy note markers during SFC import so runtime state uses new wording only.
  // Accept both the legacy plain-string form and the current array-of-lines form.
  const rawNote = parsedRec['Note']
  const noteStr = Array.isArray(rawNote)
    ? rawNote.map(String).join('\n')
    : typeof rawNote === 'string' ? rawNote : undefined
  // Files written before v1.0.13 used space-separated improvchance values; convert to commas.
  const migratedNoteStr = noteStr && sfcVersionAtMost(rawVersion, 1, 0, 13)
    ? migrateImprovchanceSpacesToCommas(noteStr)
    : noteStr
  const note = migratedNoteStr ? canonicalizeLegacyNoteMarkers(migratedNoteStr, rawVersion) : undefined
  // Dynamic-overrides answers ride beside the Note. Reuse the canonical normalizers so a
  // hand-edited or truncated file is sanitized exactly like an autosave payload (SSOT).
  // `null` preserves "key absent" — normalize* returns null for missing/invalid input.
  const noteRecipeOverridesAnswers = normalizeNoteRecipeOverridesAnswers(parsedRec[NOTE_RECIPE_OVERRIDES_ANSWERS_KEY])
  const noteSafeguardOverridesAnswers = normalizeNoteSafeguardOverridesAnswers(parsedRec[NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY])
  const noteOverridesDisabled = parsedRec[NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY] === true
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
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled,
  }
}

/** Read a `.sfc` (or legacy `.sfr`/`.hsfc`)/JSON file and parse with parseSfcText semantics. */
export async function readSfcFile(
  file: File,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
): Promise<ParsedSfcResult>
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

// Minimal persisted shape of a separator — identical for the Recipes and the
// Safeguards array: label/color plus the marker flag, deliberately NO other
// fields (they are irrelevant to a list divider; the loader rehydrates factory
// defaults). Legacy recipe files spelled the marker `SellfileVisibility:
// 'Separator'` instead — still accepted on read, never written anymore.
export type ReadableSeparatorEntry = {
  appearance?: NameAppearance
  Separator: true
}

// The settings a group persists (capitalised to match `Separator`). Written ONCE per group, on
// the group entry that holds the members — not repeated on each member. Carries no id: the SFC
// identifies a group by shape, so nothing on disk needs to be unique and ids are minted on load.
export type ReadableSafeguardGroup = {
  requiredCount: number
  countMode: SafeguardRule['countMode']
}

// A group as it persists: its settings plus the members it holds, in order. The nesting IS the
// grouping — there is no id to match and no way to express a torn or overlapping run.
export type ReadableSafeguardGroupEntry = {
  Group: ReadableSafeguardGroup
  members: Array<ReadableSafeguardRuleEntry | ReadableSeparatorEntry>
}

export type ReadableSafeguardRuleEntry = {
  // Nested appearance record (name + optional fgColor). Emitted first when present.
  appearance?: NameAppearance
  // No group field: membership is carried by the nesting (see ReadableSafeguardGroupEntry), not
  // by anything on the rule itself.
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

// The persisted shape of a group's settings: its count and its chips. No id — see the type.
const buildReadableSafeguardGroup = (group: SafeguardGroupSettings): ReadableSafeguardGroup => {
  const mode = sanitizeSafeguardCountMode(group.countMode)
  return {
    requiredCount: Math.max(1, Math.floor(group.requiredCount)),
    countMode: {
      perRule: mode.perRule,
      perSet: mode.perSet,
      perFaction: mode.perFaction,
      perMainStat: mode.perMainStat,
      perSlot: mode.perSlot,
    },
  }
}

// Build a readable safeguard export entry from an in-memory rule.
export const buildReadableSafeguardRuleEntry = (
  rule: SafeguardRule,
): ReadableSafeguardRuleEntry | ReadableSeparatorEntry => {
  const kind = safeguardEntryKind(rule)
  // Separators persist minimally — appearance + marker, nothing else (see the
  // ReadableSeparatorEntry doc). Applies to every persistence path
  // (file save, autosave, clipboard, preset snapshot) since they all funnel here.
  if (kind === 'separator') {
    return {
      ...appearancePersistField(rule.appearance),
      Separator: true,
    }
  }
  // Nothing about membership is written here: a member is persisted by being NESTED inside its
  // group entry (buildReadableSafeguardEntries), so a rule record looks the same whether or not
  // it belongs to a group — which is what lets a single copied member paste as an ordinary rule.
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
  // Emit the Mainstat rank factor only when the toggle is on AND it differs from the neutral
  // default (1.0). The factor is inert while the toggle is off, so persisting it then would be a
  // dormant no-op value; gating on the toggle keeps it out (mirrors how a deselected substat's
  // weight is not written). Omission loads as 1.0, so untouched files stay byte-identical.
  if (rule.weightMainStatByRank
    && typeof rule.mainStatRankWeightFactor === 'number'
    && rule.mainStatRankWeightFactor !== SAFEGUARD_MAIN_STAT_RANK_WEIGHT_FACTOR_DEFAULT) {
    entry.mainStatRankWeightFactor = rule.mainStatRankWeightFactor
  }
  return entry
}

/**
 * The inverse of `buildReadableSafeguardEntries`: walks a persisted safeguard array and returns a
 * flat rule list with membership re-attached.
 *
 * A group is one entry holding its `members`, so members arrive already contiguous and already
 * agreeing on their settings — the shape cannot express a torn or overlapping run. Each group
 * mints ONE fresh id here (ids are runtime-only; see `normalizeSafeguardGroupSettings`) and stamps
 * it onto every member it unnests. Separators are never members, matching the writer.
 *
 * Shared by the file/autosave reader and the clipboard paste path so a run copied from one
 * document lands as a run in the other.
 */
export const parseReadableSafeguardEntries = (raws: readonly unknown[]): SafeguardRule[] => {
  const out: SafeguardRule[] = []
  for (const entry of raws) {
    const rec = (entry && typeof entry === 'object') ? (entry as Record<string, unknown>) : null
    const members = rec && Array.isArray(rec['members']) ? (rec['members'] as unknown[]) : null
    // Not a group entry: an ordinary rule or a separator, ungrouped by construction.
    if (!members) {
      const rule = normalizeSafeguardRule(entry)
      if (rule) out.push(rule)
      continue
    }
    // One id for the whole nested run — this is the only place a loaded group's id comes from.
    const settings = normalizeSafeguardGroupSettings(rec?.['Group'] ?? rec?.['group'])
    for (const member of members) {
      const rule = normalizeSafeguardRule(member)
      if (!rule) continue
      // A separator cannot be a member; it survives as a plain divider rather than being dropped.
      if (!settings || safeguardEntryKind(rule) === 'separator') { out.push(rule); continue }
      out.push({ ...rule, group: cloneSafeguardGroupSettings(settings) })
    }
  }
  return out
}

/**
 * Projects a safeguard list to its persisted form, NESTING each group into a single entry.
 *
 * The SFC identifies a group by SHAPE: a group entry carries the settings once plus a `members`
 * array, and adjacency is implied by the nesting rather than by a shared id. Nothing on disk needs
 * to be unique, so no id is written and one is minted per group on load. The shape also cannot
 * express a torn or overlapping run, which is why the reader needs no group repair.
 *
 * One definition for every persistence path (file save, autosave, clipboard, preset snapshot) so
 * a copied run and a saved run agree byte for byte.
 */
export const buildReadableSafeguardEntries = (
  rules: readonly SafeguardRule[],
): Array<ReadableSafeguardRuleEntry | ReadableSeparatorEntry | ReadableSafeguardGroupEntry> => {
  // Flat-list fast path, mirroring `normalizeSafeguardGroups`: with no member there is no run to
  // nest, so the projection stays pure TypeScript. That matters beyond speed — the resolver below
  // is a SYNC wasm call that throws when the engine is not warm, and saving/autosaving/preset
  // canonicalization must not depend on warm-up for the overwhelmingly common group-free document.
  if (!rules.some((rule) => isSafeguardGrouped(rule))) {
    return rules.map((rule) => buildReadableSafeguardRuleEntry(rule))
  }
  const out: Array<ReadableSafeguardRuleEntry | ReadableSeparatorEntry | ReadableSafeguardGroupEntry> = []
  // Runs come from the Rust authority, never from comparing neighbours' ids here.
  const groups = resolveSafeguardGroups(rules)
  for (let index = 0; index < rules.length; index += 1) {
    const start = groups.runStarts[index] ?? SAFEGUARD_GROUP_NO_RUN
    // A run start always comes with a length of at least 1 (the resolver's contract); treating a
    // missing/zero length as "ungrouped" keeps a malformed payload from rewinding `index` below.
    const len = start < 0 ? 0 : (groups.runLens[index] ?? 0)
    // Ungrouped entry: written flat, exactly as before groups existed.
    if (len < 1) {
      out.push(buildReadableSafeguardRuleEntry(rules[index] as SafeguardRule))
      continue
    }
    // Emit the whole run once, at its head, then skip past its members.
    if (start !== index) continue
    const members = rules.slice(index, index + len)
    // The head's settings are the copy the engine reads, so they are the copy that persists.
    const settings = (members[0] as SafeguardRule).group as SafeguardGroupSettings
    out.push({
      Group: buildReadableSafeguardGroup(settings),
      members: members.map((member) => buildReadableSafeguardRuleEntry(member)),
    })
    index += len - 1
  }
  return out
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
  // Dynamic-overrides answers: the user's deviations from the Note DSL's authored defaults.
  // They belong to the DOCUMENT (they only mean anything against this file's Note), so they
  // ride along in the payload right after it. Autosave feeds the same three through here —
  // one writer for both the .sfc file and the localStorage snapshot (SSOT).
  noteRecipeOverridesAnswers?: NoteRecipeOverridesAnswers,
  noteSafeguardOverridesAnswers?: NoteSafeguardOverridesAnswers,
  noteOverridesDisabled?: boolean,
  }): {
    Version: string
    Metasets: Array<{ name: string; setNames: string[]; show?: boolean }>
    Minima: unknown
    Recipes: unknown[]
    FinalSellRemainder: FinalSellRemainderConfig
    // The entry types are the serializer's own (SSOT) — the old inline copy here had
    // silently drifted (missing appearance/tags/improvementChanceThreshold).
    // A group persists as one nested entry holding its members, so the array is heterogeneous.
    Safeguards: Array<ReadableSafeguardRuleEntry | ReadableSeparatorEntry | ReadableSafeguardGroupEntry>
    SafeguardsEnabled: boolean
    RecipesEnabled: boolean
    // Array of lines for diff-friendliness; legacy files may still carry a plain string.
    Note?: string[]
    // Emitted only when non-empty, so files without overrides stay byte-identical to before.
    [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]?: NoteRecipeOverridesAnswers
    [NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY]?: NoteSafeguardOverridesAnswers
    [NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY]?: boolean
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
    noteRecipeOverridesAnswers,
    noteSafeguardOverridesAnswers,
    noteOverridesDisabled = false,
  } = args
  // Safeguard answers that merely restate the document's own effective defaults are dropped
  // BEFORE the empty check, so an untouched preset emits no key at all. The baseline is the
  // note's seeded state (which includes cross-domain `setval` forces from the selected recipe
  // tier), not each slider's `default=` — see dropDefaultSafeguardOverridesAnswers. The loader
  // re-derives the same baseline, so omitted defaults come back identically.
  const safeguardAnswersLean = noteSafeguardOverridesAnswers
    ? dropDefaultSafeguardOverridesAnswers(note ?? '', noteRecipeOverridesAnswers ?? {}, noteSafeguardOverridesAnswers)
    : undefined
  // Drop empty answer maps so a document with no overrides emits no keys at all. One definition
  // for both domains — an empty map must never reach the payload as a bare `{}`.
  const omitWhenEmpty = <T extends object>(answers: T | undefined): T | undefined =>
    answers && Object.keys(answers).length > 0 ? answers : undefined
  const recipeAnswersOut = omitWhenEmpty(noteRecipeOverridesAnswers)
  const safeguardAnswersOut = omitWhenEmpty(safeguardAnswersLean)
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
    // Safeguard exports reuse the shared readable helper for clipboard parity; it nests groups.
    Safeguards: buildReadableSafeguardEntries(safeguardRules),
    SafeguardsEnabled: safeguardsEnabled === true,
    RecipesEnabled: recipesEnabled !== false,
    // Canonicalize legacy marker aliases so exports never re-emit old note keywords.
    // Store as an array of lines so the saved file is diff-friendly and copy-readable.
    // Passed the version we are WRITING, so the legacy selector rewrite does not fire: a
    // legacy spelling surviving to save is the author's own text and must round-trip as-is.
    ...(note ? { Note: canonicalizeLegacyNoteMarkers(note, version).split('\n') } : {}),
    // Dynamic-overrides answers sit directly after the Note they belong to. Each key is
    // omitted when it carries nothing, keeping override-free files unchanged on disk.
    ...(recipeAnswersOut ? { [NOTE_RECIPE_OVERRIDES_ANSWERS_KEY]: recipeAnswersOut } : {}),
    ...(safeguardAnswersOut ? { [NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY]: safeguardAnswersOut } : {}),
    ...(noteOverridesDisabled ? { [NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY]: true } : {}),
  }
}

// MIME type of every exported SFC payload — the download Blob and the endpoint push
// envelope's contentType share this one definition (SSOT), mirroring HSF_EXPORT_CONTENT_TYPE.
export const SFC_EXPORT_CONTENT_TYPE = 'application/json'

/**
 * Re-serialize an already-parsed document back into an SFC payload.
 *
 * Used by the SfcFileAsSellfile push path, which uploads the recipe DOCUMENT instead of a
 * compiled sellfile: the background flow has a ParsedSfcResult (from an account's autosave)
 * rather than the live builder state the interactive save path holds. Routing through
 * buildSfcPayload keeps one writer for every .sfc we emit — file download, autosave, and
 * push alike — so a field added there reaches all three.
 *
 * `version` is the APP_VERSION to stamp; the caller passes it because this module must not
 * depend on the app's version constant.
 */
export function buildSfcPayloadFromParsed(parsed: ParsedSfcResult, version: string) {
  return buildSfcPayload({
    version,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    recipes: parsed.recipes,
    // Absent (null) keys are omitted rather than written as null, matching how the
    // interactive save path spreads its optional fields.
    ...(parsed.finalSellRemainder ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    ...(parsed.note ? { note: parsed.note } : {}),
    ...(parsed.safeguardRules ? { safeguardRules: parsed.safeguardRules } : {}),
    ...(parsed.safeguardsEnabled !== null ? { safeguardsEnabled: parsed.safeguardsEnabled } : {}),
    recipesEnabled: parsed.recipesEnabled,
    ...(parsed.noteRecipeOverridesAnswers ? { noteRecipeOverridesAnswers: parsed.noteRecipeOverridesAnswers } : {}),
    ...(parsed.noteSafeguardOverridesAnswers ? { noteSafeguardOverridesAnswers: parsed.noteSafeguardOverridesAnswers } : {}),
    noteOverridesDisabled: parsed.noteOverridesDisabled,
  })
}

/**
 * The .sfc text of a payload — the ONE serialization every emitted document uses (the Save
 * download, the express Custom snapshot, the account-merge carry, the express restore's
 * in-memory File). Sharing it is what keeps a snapshot byte-faithful to a saved file.
 */
export function sfcToText(payload: unknown): string {
  return JSON.stringify(payload, null, 2)
}

/**
 * Change fingerprint of a serialized .sfc document.
 *
 * Auto-push under SfcFileAsSellfile compares this against the last PUSHED document to decide
 * whether anything actually changed (see externalWsProtocol.pushWatchesSfcDocument). It reads
 * the same bytes `sfcToText` produces, so the fingerprint moves exactly when the pushed file
 * would differ — no field can change the upload without changing this, and cosmetic churn
 * that serializes identically correctly reads as unchanged.
 *
 * DJB2: a change detector, not a security digest. Collisions only ever mean one skipped push
 * of an already-identical-looking document, and the next real edit moves it again.
 */
export function sfcTextFingerprint(text: string): string {
  let hash = 5381
  for (let i = 0; i < text.length; i += 1) {
    // (hash * 33) + char, kept in int32 so the result is stable across engines.
    hash = ((hash << 5) + hash) + text.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

/** Wrap already-serialized .sfc text as a download Blob (same MIME as every SFC export). */
export function sfcTextToBlob(text: string): Blob {
  return new Blob([text], { type: SFC_EXPORT_CONTENT_TYPE })
}

/** Convert an SFC payload object to a Blob ready to download. */
export function sfcToBlob(payload: unknown): Blob {
  return sfcTextToBlob(sfcToText(payload))
}

/**
 * Wrap .sfc text as a File for the regular file-load path, so programmatic loads (bundled
 * presets, the express Custom snapshot, the autosave body) parse and normalize exactly like
 * a file the user picked. The name only has to carry the extension the router dispatches on.
 */
export function sfcTextToFile(text: string, fileName: string): File {
  return new File([text], fileName, { type: SFC_EXPORT_CONTENT_TYPE })
}

/** The filename a programmatically restored custom (non-preset) document lands under. */
export const CUSTOM_SFC_FILENAME = 'custom.sfc'
