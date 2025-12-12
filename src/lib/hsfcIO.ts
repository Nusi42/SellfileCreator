/**
 * HSFC IO Helpers
 *
 * Responsibilities:
 * - Normalize readable HSFC payloads to the internal StatVariant-based model.
 * - Build readable HSFC payloads (labels, not numeric IDs) from internal state for Save/Copy.
 * - Parse pasted text that may be a single config, an array of configs, or a full HSFC object.
 *
 * This module deliberately contains only HSFC read/write concerns to keep UI code tidy.
 */
import { normalizeExportModeFields, resolveExportModeField, coerceSellfileExportModeToken, normalizeRollTargetEntry, type BuilderConfig, type SubstatTargetTable, type SellfileExportMode, type Star, type SubstatRollTargetEntry, type SubstatRollTargets } from './hsfBuilder'
import { normalizeKeepMode, normalizeAutoRaritySupplements, isMilestoneThresholdsActive, canEnableSubstatFlex, normalizeAutoSubstatFlex, normalizeAggregateRollTargets } from './configNormalization'
import { FINAL_SELL_DEFAULT_LEVELS, RARITY_AUTO_LABEL } from './constants'
import { DEFAULT_METASET_ICON_ID, normalizeMetasetIconId } from './metasetIcons'
import { orderMetasetIds, type Metaset } from './metasets'
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
} from './finalSell'
import { normalizeKeepUniqueRule, sanitizeKeepUniqueCountMode, type KeepUniqueRule, KeepUniqueRuleActivation } from './keepUniques'

type LockedMinValue = Exclude<BuilderConfig['lockedMinRequiredRolls'], undefined>
type AggregateMinValue = Exclude<BuilderConfig['minRequiredRolls'], undefined>

// Readable HSFC substat payload that merges selection, fixed, and roll bounds.
type ReadableSubstatBounds = {
  min?: number
  max?: number
  any?: boolean
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

// Internal helpers for parsing unknown HSFC shapes
function isRecord(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null }
// no longer used: only label-based parsing is accepted for HSFC
// function asNumber(v: unknown): number | undefined { return typeof v === 'number' && Number.isFinite(v) ? v : undefined }
function asStringArray(v: unknown): string[] | undefined { return Array.isArray(v) ? (v as unknown[]).map((s) => String(s)) : undefined }
// (Legacy helpers removed for HSFC schema simplification)
function parseSubstatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, isFlat } are no longer accepted in HSFC; labels only
  return undefined
}
function parseMainStatLike(v: unknown): number | undefined {
  if (typeof v === 'string') { const vk = variantFromLabel(v); if (vk !== null) return vk as number }
  // Objects like { id, f } are no longer accepted in HSFC; labels only
  return undefined
}

/**
 * Resolve a readable set identifier to a numeric ArtifactSetId.
 *
 * Prefers baked-in catalog lookups; if not found, optionally falls back to a
 * persisted-runtime name map supplied by autosave restore.
 */
const resolveSetId = (value: unknown, runtimeNameMap?: Map<string, number>): number | undefined => {
  // Accept readable names first so HSFC stays human-friendly.
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

// Keep Unique rarities store the 1..6 bucket; map those rank-like values to readable rarity names.
const KEEP_UNIQUE_RARITY_LABEL: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
  6: 'Mythical',
}

function mergeMetasetIds(base: BuilderConfig, metasets: Metaset[], extras: readonly string[] = []): BuilderConfig {
  const baseOrdered = orderMetasetIds(base.artifactMetaSets, metasets)
  const extrasOrdered = extras.length ? orderMetasetIds(extras, metasets) : []
  const merged = extrasOrdered.length ? orderMetasetIds([...baseOrdered, ...extrasOrdered], metasets) : baseOrdered
  if (extrasOrdered.length || Array.isArray(base.artifactMetaSets)) {
    return { ...base, artifactMetaSets: merged }
  }
  if (merged.length > 0) {
    return { ...base, artifactMetaSets: merged }
  }
  return base
}

// Normalize HSFC configs (readable schema) to current BuilderConfig
/**
 * Normalize a readable HSFC config to BuilderConfig with *V fields.
 *
 * `runtimeNameMap` is only supplied by autosave restore to resolve dormant
 * runtime set names without activating the runtime catalog.
 */
export function normalizeConfig(input: unknown, runtimeNameMap?: Map<string, number>): BuilderConfig {
  const rec: Record<string, unknown> = isRecord(input) ? input : {}
  const configs = rec['Configs']
  if (Array.isArray(configs) && configs.length > 0) {
    const first = configs[0]
    if (isRecord(first)) return normalizeConfig(first)
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

  const baseCfg: BuilderConfig = {
    name: typeof rec['name'] === 'string' ? String(rec['name']) : '',
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

  const opt: Partial<BuilderConfig> = {}
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
    ? ((rec['artifactSetNames'] as unknown[])
      .map((n) => resolveSetId(n, runtimeNameMap))
      .filter((x): x is number => typeof x === 'number'))
    : undefined
  const __artMetaSets = asStringArray(rec['artifactMetaSets'])
  if (__artTypes !== undefined) opt.artifactTypes = __artTypes
  if (__artSets !== undefined) opt.artifactSets = __artSets
  if (__artMetaSets !== undefined) opt.artifactMetaSets = __artMetaSets
  // Assemble normalized base
  let normalized: BuilderConfig = { ...baseCfg, ...opt }

  // Post-normalization to align HSFC with in-app invariants:
  // - Conflicting bounds: when min/max are present, drop 'any' (UI cannot represent both simultaneously).
  // - Clamp numeric bounds to valid ranges (already clamped above; re-apply defensively).
  try {
    const subsV: number[] = Array.isArray(normalized.substatsV) ? normalized.substatsV.slice() : []
    const fixedV: number[] = Array.isArray(normalized.fixedSubstatsV) ? normalized.fixedSubstatsV.slice() : []
    // Ensure fixed are included in selected
    const union = Array.from(new Set<number>([...subsV, ...fixedV]))
    const bV: Record<number, { min?: number; max?: number; any?: boolean }> = { ...(normalized.substatRollBoundsV ?? {}) }
    // Sanitize each bounds entry
    for (const [k, raw] of Object.entries(bV)) {
      const v = Number(k)
      const m = raw ?? {}
      const out: { min?: number; max?: number; any?: boolean } = {}
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

  if (!canEnableSubstatFlex(normalized)) {
    normalized.autoSubstatFlex = false
  }

  if ((normalized.rarityMode === 'auto') && ((normalized.earlyKeepMode ?? 'early') === 'late') && normalized.autoRaritySupplementsThreshold == null) {
    normalized.autoRaritySupplementsThreshold = 'rare'
  }

  normalized = normalizeExportModeFields(normalized as unknown as Record<string, unknown>) as unknown as BuilderConfig
  // Coerce keep mode to 'early' when thresholds are inactive to match UI behavior
  normalized = normalizeKeepMode(normalized)
  normalized = normalizeAggregateRollTargets(normalized)
  normalized = normalizeAutoSubstatFlex(normalized)
  // Remove auto rarity supplements flag when not applicable (not Auto, not Late, or thresholds inactive)
  normalized = normalizeAutoRaritySupplements(normalized)
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

/** Normalize HSFC Minima (label-keyed) to the internal Substat Target table. */
export function normalizeSubstatTargets(src: unknown): SubstatTargetTable {
  // HSFC stores per-rank targets keyed by stat label; convert them back to the
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

// Build a readable config object for HSFC export/copy (labels, not numeric IDs)
/** Build a single readable HSFC config from internal BuilderConfig state. */
export function buildReadableConfig(cfg: BuilderConfig, metasets: Metaset[]) {
  // Metasets are included in the HSFC payload separately; configs now reference
  // metasets by ID. We keep the parameter for call‑site symmetry and future use.
  void metasets
  const mainV = (cfg as (BuilderConfig & { mainStatsV?: number[] })).mainStatsV ?? []
  const subV = (cfg as (BuilderConfig & { substatsV?: number[] })).substatsV ?? []
  const fixedV = (cfg as (BuilderConfig & { fixedSubstatsV?: number[] })).fixedSubstatsV ?? []
  // Canonicalize label order for HSFC: use preferred stat order via compareVariants.
  const mainLabels = mainV.slice().sort(compareVariants).map(labelOfVariant)
  const substatEntries: ReadonlyArray<ReadableSubstatEntry> = (() => {
    const entries: ReadableSubstatEntry[] = []
    if (!subV.length) return entries
    const sortedVariants = subV.slice().sort(compareVariants)
    const fixedSet = new Set<number>(fixedV)
    const boundsMap = (cfg as (BuilderConfig & { substatRollBoundsV?: Record<number, { min?: number; max?: number; any?: boolean }> })).substatRollBoundsV ?? {}
    for (const variant of sortedVariants) {
      const entry: ReadableSubstatEntry = { stat: labelOfVariant(variant) }
      if (fixedSet.has(variant)) entry.fixed = true
      const maybeBounds = boundsMap[variant]
      if (maybeBounds) {
        const normalized: ReadableSubstatBounds = {}
        if (typeof maybeBounds.min === 'number' && Number.isFinite(maybeBounds.min)) normalized.min = maybeBounds.min
        if (typeof maybeBounds.max === 'number' && Number.isFinite(maybeBounds.max)) normalized.max = maybeBounds.max
        if (maybeBounds.any) normalized.any = true
        if (normalized.min !== undefined || normalized.max !== undefined || normalized.any) entry.rollBounds = normalized
      }
      entries.push(entry)
    }
    return entries
  })()
  const exportMode: SellfileExportMode = cfg.exportMode
  const exportModeLabel = exportMode === 'separator'
    ? 'Separator'
    : exportMode === 'disabled'
      ? 'Disabled'
      : 'Active'
  const readableTargets = rollTargetsToReadable((cfg as BuilderConfig).substatRollTargetsV)
  return {
    name: cfg.name,
    keep: cfg.keep,
    SellfileVisibility: exportModeLabel,
    // For readability in HSFC/clipboard, render Auto or explicit labels. "Any" when code is 0.
    Rank: (cfg.rankCode === RankCode.Any ? 'Any' : formatRank(cfg.rankCode)),
    Rarity: (cfg.rarityMode === 'auto' ? RARITY_AUTO_LABEL : (cfg.rarityCode === RarityCode.Any ? 'Any' : rarityCodeToName(cfg.rarityCode))),
    Faction: ((cfg.factionCode ?? 0) === 0 ? 'Any' : factionCodeToName(cfg.factionCode ?? 0)),
    mainStats: mainLabels,
    // New schema: emit explicit level window and omit legacy roll fields
    minLevel: ((cfg as BuilderConfig).minLevel ?? LEVEL_MILESTONES[0]!),
    maxLevel: ((cfg as BuilderConfig).maxLevel ?? LEVEL_MILESTONES[LEVEL_MILESTONES.length - 1]!),
    ...(cfg.earlyKeepMode === 'late' ? { earlyKeepMode: 'late' as const } : {}),
    substats: substatEntries,
    // Include only when applicable: Rarity=Auto and thresholds active in Late mode
    ...((cfg.rarityMode === 'auto' && cfg.earlyKeepMode === 'late' && isMilestoneThresholdsActive(cfg))
      ? { autoRarityThreshold: (cfg.autoRaritySupplementsThreshold ?? 'rare') }
      : {}),
    ...(readableTargets ? { substatRollTargets: readableTargets } : {}),
    minCount: cfg.minCount,
    autoMinCount: cfg.autoMinCount,
    ...(cfg.autoSubstatFlex && canEnableSubstatFlex(cfg) ? { autoSubstatFlex: true as const } : {}),
    minRequiredRolls: (cfg.minRequiredRolls ?? 0),
    autoMinRequiredRolls: (cfg.autoMinRequiredRolls ?? true),
    lockedMinRequiredRolls: (cfg.lockedMinRequiredRolls ?? 0),
    artifactTypeNames: (cfg.artifactTypes ?? []).slice().sort(compareArtifactTypes).map(t => artifactTypeNames[Number(t)]).filter(Boolean),
    artifactSetNames: (cfg.artifactSets ?? []).slice().sort(compareArtifactSets)
      .map((s) => artifactSetName(Number(s) as ArtifactSetId))
      .filter((x): x is string => Boolean(x && x.trim())),
    // Write compact metaset references by ID for smaller files. Names remain
    // available under Metasets[].name and are not duplicated here.
    artifactMetaSetIds: (cfg.artifactMetaSets ?? []).slice(),
  }
}

/** Convert variant-keyed Substat Target tables to label-keyed maps for HSFC export (HSFC field remains "Minima"). */
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

// Parse text that may be a single config, an array, or an HSFC object with Configs
/** Parse text as HSFC content: returns normalized configs array on success, [] on failure. */
export function parseConfigsFromText(text: string, metasetsForNames?: Metaset[]): BuilderConfig[] {
  try {
    const parsed = JSON.parse(text) as unknown
    const resolveMetaIds = (rawCfg: unknown, metas: Metaset[]): string[] => {
      const rec = (rawCfg && typeof rawCfg === 'object') ? (rawCfg as Record<string, unknown>) : {}
      // Prefer explicit IDs when present
      const ids = Array.isArray(rec['artifactMetaSetIds']) ? (rec['artifactMetaSetIds'] as unknown[]).map(String) : []
      if (ids.length) return ids
      // Backward compatibility: map names to IDs
      const names = Array.isArray(rec['artifactMetaSetNames']) ? (rec['artifactMetaSetNames'] as unknown[]).map(String) : []
      if (!names.length) return []
      const byName = new Map<string, string>(metas.map(m => [m.name, m.id]))
      return names.map(n => byName.get(String(n))).filter((x): x is string => typeof x === 'string')
    }
    const metasFromObj = (obj: Record<string, unknown>): Metaset[] | null => {
      const raws = obj['Metasets']
      if (!Array.isArray(raws)) return null
      try {
        return (raws as unknown[]).map((m) => {
          const mRec = (m || {}) as Record<string, unknown>
          const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
          const sets = names.map((n: unknown) => resolveSetId(n)).filter((x: unknown): x is number => typeof x === 'number')
          return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false }
        })
      } catch { return null }
    }
    if (Array.isArray(parsed)) {
      const metas = metasetsForNames ?? []
      return parsed.map((raw) => {
        const base = normalizeConfig(raw)
        const metaIds = metas.length ? resolveMetaIds(raw, metas) : []
        return mergeMetasetIds(base, metas, metaIds)
      })
    }
    if (isRecord(parsed)) {
      const cfgs = Array.isArray(parsed['Configs']) ? (parsed['Configs'] as unknown[]) : []
      const metas = metasFromObj(parsed) ?? metasetsForNames ?? []
      if (cfgs.length) {
        return cfgs.map((raw) => {
          const base = normalizeConfig(raw)
          const metaIds = metas.length ? resolveMetaIds(raw, metas) : []
          return mergeMetasetIds(base, metas, metaIds)
        })
      }
      const base = normalizeConfig(parsed)
      const metaIds = metas.length ? resolveMetaIds(parsed, metas) : []
      return [mergeMetasetIds(base, metas, metaIds)]
    }
  } catch {
    // ignore
  }
  return []
}

/**
 * Parse a full HSFC text payload and return normalized state slices.
 * Accepts a previous snapshot for metasets/substatTargets/allExplicit defaults.
 */
export function parseHsfcText(
  text: string,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
  options?: { runtimeSetNameMap?: Map<string, number> },
): {
  cfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  selectedIndex: number | null
  note?: string
  finalSellRemainder: FinalSellRemainderConfig
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
} {
  const parsed = JSON.parse(text) as unknown
  return parseHsfcObject(parsed, prev, options)
}

/** Parse an HSFC object (readable schema) into normalized slices. */
export function parseHsfcObject(
  parsed: unknown,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
  options?: { runtimeSetNameMap?: Map<string, number> },
): {
  cfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  selectedIndex: number | null
  note?: string
  finalSellRemainder: FinalSellRemainderConfig
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
} {
  const parsedRec = (typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {})
  const runtimeSetNameMap = options?.runtimeSetNameMap
  let rawCfgs = Array.isArray(parsed) ? parsed : (Array.isArray(parsedRec['Configs']) ? (parsedRec['Configs'] as unknown[]) : [])
  // Convenience: accept a single readable-config object (tests/fixtures/*.hsfc use this simplified shape).
  // Why: Developers often drag these fixtures into the app while validating builder output. The shape
  // matches what parseHsfcText expects for each config, so when no `Configs` array is present but we
  // detect the usual readable config keys, treat the payload as a one-item Configs array.
  if (rawCfgs.length === 0 && parsedRec && typeof parsedRec === 'object') {
    const hasReadableConfigKey = (() => {
      const keys = new Set(Object.keys(parsedRec))
      // Heuristic: any of these readable HSFC config keys indicates a single-config payload
      const hints = [
        'substats', 'fixedSubstats', 'mainStats', 'Rank', 'Rarity', 'Faction',
        'artifactTypeNames', 'artifactSetNames', 'artifactMetaSetNames',
        'minLevel', 'maxLevel', 'minCount', 'minRequiredRolls', 'substatRollBounds',
      ]
      for (const k of hints) if (keys.has(k)) return true
      return false
    })()
    if (hasReadableConfigKey) rawCfgs = [parsedRec]
  }
  const metasets: Metaset[] = (() => {
    const raws = parsedRec['Metasets']
    if (!Array.isArray(raws)) return prev.metasets
    return raws.map((m: unknown) => {
      const mRec = (m || {}) as Record<string, unknown>
      const names = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
      const sets = names
        .map((n: unknown) => resolveSetId(n, runtimeSetNameMap))
        .filter((x: unknown): x is number => typeof x === 'number')
      const iconId = normalizeMetasetIconId(mRec['iconId'])
      return { id: String(mRec['id']), name: String(mRec['name']), sets, show: mRec['show'] !== false, iconId }
    })
  })()
  const substatTargets: SubstatTargetTable = (!Array.isArray(parsed) && parsedRec['Minima'])
    ? normalizeSubstatTargets(parsedRec['Minima'])
    : prev.substatTargets
  const cfgs: BuilderConfig[] = rawCfgs.map((raw) => {
    // Only autosave restore provides `runtimeSetNameMap`.
    const base = normalizeConfig(raw, runtimeSetNameMap)
    const rec = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {}
    // Prefer explicit IDs, fallback to names
    const ids = Array.isArray(rec['artifactMetaSetIds']) ? (rec['artifactMetaSetIds'] as unknown[]).map(String) : []
    let resolvedIds = ids
    if (!resolvedIds.length) {
      const names = Array.isArray(rec['artifactMetaSetNames']) ? (rec['artifactMetaSetNames'] as unknown[]).map(String) : []
      if (names.length) {
        const byName = new Map<string, string>(metasets.map(m => [m.name, m.id]))
        resolvedIds = names.map(n => byName.get(String(n))).filter((x): x is string => typeof x === 'string')
      }
    }
    return mergeMetasetIds(base, metasets, resolvedIds)
  })
  // Optional Final Sell configuration
  const fsr = (() => {
    const DEFAULT_LEVELS: LevelMilestone[] = FINAL_SELL_DEFAULT_LEVELS.slice() as LevelMilestone[]
    const DEFAULT_MODE = FINAL_SELL_DEFAULT_SETS_MODE
    if (Array.isArray(parsed)) return { artifacts: false, accessories: false, levels: DEFAULT_LEVELS, setsMode: DEFAULT_MODE }
    const v = parsedRec['FinalSellRemainder']
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
  const keepUniqueRules: KeepUniqueRule[] = (() => {
    const raws = parsedRec['KeepUniques']
    if (!Array.isArray(raws)) return []
    const normalized: KeepUniqueRule[] = []
    for (const entry of raws) {
      const rule = normalizeKeepUniqueRule(entry)
      if (rule) normalized.push(rule)
    }
    return normalized
  })()
  const keepUniquesEnabled = parsedRec['KeepUniquesEnabled'] === true
  const savedSel = (!Array.isArray(parsed) && typeof parsedRec['SelectedConfigIndex'] === 'number') ? (parsedRec['SelectedConfigIndex'] as number) : (cfgs.length ? cfgs.length - 1 : null)
  const selectedIndex = (savedSel !== null && savedSel >= 0 && savedSel < cfgs.length) ? savedSel : (cfgs.length ? cfgs.length - 1 : null)
  const note = (!Array.isArray(parsed) && typeof parsedRec['Note'] === 'string') ? String(parsedRec['Note']) : undefined
  return {
    cfgs,
    metasets,
    substatTargets,
    selectedIndex,
    ...(note ? { note } : {}),
    finalSellRemainder: fsr,
    keepUniqueRules,
    keepUniquesEnabled,
  }
}

/** Read a `.hsfc`/JSON file and parse with the same semantics as parseHsfcText. */
export async function readHsfcFile(
  file: File,
  prev: { metasets: Metaset[]; substatTargets: SubstatTargetTable },
): Promise<{
  cfgs: BuilderConfig[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  selectedIndex: number | null
  note?: string
  finalSellRemainder: FinalSellRemainderConfig
  keepUniqueRules: KeepUniqueRule[]
  keepUniquesEnabled: boolean
}>
{
  const text = await file.text()
  return parseHsfcText(text, prev)
}

/** Parse an internal autosave payload (not HSFC); expects variant-keyed substatTargets and full BuilderConfig objects. */

/**
 * Build a full, readable HSFC payload object for Save/Copy, given current state.
 */
// Keep Unique entries in HSFC should stay human-readable; this tuple mirrors the
// in-memory shape but with labels instead of numeric IDs so saved files are self-explanatory.
type ReadableKeepUniqueTuple = {
  slots: string[]
  sets: string[]
  metaSetIds: string[]
  ranks: string[]
  rarities: string[]
  mainStats: string[]
  factions: string[]
}

export function buildHsfcPayload(args: {
  version: string,
  metasets: Metaset[],
  substatTargets: SubstatTargetTable,
  configs: BuilderConfig[],
  finalSellRemainder?: FinalSellRemainderConfig,
  selectedConfigIndex: number | null,
  note?: string,
  keepUniqueRules?: KeepUniqueRule[],
  keepUniquesEnabled?: boolean,
  }): {
    Version: string
    Metasets: Array<{ id: string; name: string; setNames: string[]; show?: boolean }>
    Minima: unknown
    Configs: unknown[]
    FinalSellRemainder: FinalSellRemainderConfig
    KeepUniques: Array<{ id: string; name?: string; requiredCount: number; activation: KeepUniqueRuleActivation; countMode: KeepUniqueRule['countMode']; tuple: ReadableKeepUniqueTuple }>
    KeepUniquesEnabled: boolean
    SelectedConfigIndex?: number
    Note?: string
  } {
  const {
    version,
    metasets,
    substatTargets,
    configs,
    finalSellRemainder,
    selectedConfigIndex,
    note,
    keepUniqueRules = [],
    keepUniquesEnabled = false,
  } = args
  const metasOut = metasets.map(m => {
    const iconId = normalizeMetasetIconId(m.iconId)
    return {
      id: m.id,
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
    Configs: configs.map((cfg) => buildReadableConfig(cfg, metasets)),
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
    KeepUniques: keepUniqueRules.map((rule) => {
      // Persist the normalized scope object explicitly so the loader can
      // rehydrate the same chip state without guessing at defaults.
      const mode = sanitizeKeepUniqueCountMode(rule.countMode)
      const trimmedName = typeof rule.name === 'string' ? rule.name.trim() : ''
      // Emit readable tuple fields so HSFC is inspectable without a catalog.
      const slotLabels = rule.combination.slots
        .map((slot) => artifactTypeNames[Number(slot)] ?? String(slot))
      const setLabels = rule.combination.sets
        .map((set) => artifactSetName(Number(set) as ArtifactSetId))
      const rankLabels = rule.combination.ranks
        .map((rank) => formatRank(rank as RankCode))
        .filter((label) => Boolean(label && label.trim()))
      const rarityLabels = rule.combination.rarities
        .map((rarity) => KEEP_UNIQUE_RARITY_LABEL[Number(rarity)] ?? rarityCodeToName(rarity))
        .filter((label) => Boolean(label && label.trim()))
      const mainStatLabels = (rule.combination.mainStats ?? [])
        .map((stat) => labelOfVariant(stat))
        .filter((label) => Boolean(label && label.trim()))
      const factionLabels = rule.combination.factions
        .map((faction) => factionNames[Number(faction)] ?? String(faction))
        .filter((label) => Boolean(label && label.trim()))
      return {
        id: rule.id,
        ...(trimmedName ? { name: trimmedName } : {}),
        requiredCount: Math.max(1, Math.floor(rule.requiredCount)),
        activation: rule.activation ?? KeepUniqueRuleActivation.ProtectExisting,
        countMode: {
          perRule: mode.perRule,
          perSet: mode.perSet,
          perFaction: mode.perFaction,
          perMainStat: mode.perMainStat,
          perSlot: mode.perSlot,
        },
        tuple: {
          slots: slotLabels,
          sets: setLabels,
          metaSetIds: [...(rule.combination.metaSetIds ?? [])],
          ranks: rankLabels,
          rarities: rarityLabels,
          mainStats: mainStatLabels,
          factions: factionLabels,
        },
      }
    }),
    KeepUniquesEnabled: keepUniquesEnabled === true,
    ...(selectedConfigIndex != null ? { SelectedConfigIndex: selectedConfigIndex } : (configs.length ? { SelectedConfigIndex: configs.length - 1 } : {})),
    ...(note ? { Note: note } : {}),
  }
}

/** Convert an HSFC payload object to a Blob ready to download. */
export function hsfcToBlob(payload: unknown): Blob {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}
