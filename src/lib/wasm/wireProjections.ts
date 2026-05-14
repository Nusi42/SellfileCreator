// Wire projection and expansion helpers for the WASM boundary.
//
// Each project*ForWire converts a long-name app type → short-name wire type (TS → WASM input).
// Each expand*FromWire converts a short-name wire type → long-name app type (WASM output → TS).
//
// The Rust #[serde(rename = "short")] attributes are the SSOT for wire field names.
// This file replaces the auto-generated src/lib/generated/wasmRuleWireFields.ts (deleted).
// TypeScript callers import from here; the generated wasmRuleWireFields.ts is gone.

import type {
  SafeguardCombination,
  SafeguardRuleCountMode,
  SafeguardDetectionSnapshot,
  SafeguardDetectionEntry,
  SafeguardDetectionArtifact,
  SafeguardPlaceholderRequest,
  SafeguardCandidateOut,
  SafeguardRuleActivation,
} from '../safeguards'
import type { BuilderRecipe } from '../hsfBuilder'
import type { LevelMilestone } from '../types'

// ─── Wire shapes (short-name field names matching Rust serde renames) ────────

// SafeguardWasmExpectedGroupDomainIn (so/acs/ams/amb/afi)
export type SafeguardExpectedGroupDomainWire = {
  so: number[]
  acs: number[]
  ams: number[]
  amb: Record<string, number[]>
  afi: number[]
}

// AutoFlexRarityBoundsIn (mn/mx/a/n)
type AutoFlexRarityBoundsInWire = {
  mn?: number | null
  mx?: number | null
  a?: boolean | null
  n?: boolean | null
}

// AutoFlexRarityRecipeIn (rm/rc/asf/amc/mc/amr/mrr/sv/fsv/srb/ml/xl)
export type AutoFlexRarityRecipeInWire = {
  rm?: string | null
  rc?: number | null
  asf?: boolean | null
  amc?: boolean | null
  mc?: number | null
  amr?: boolean | null
  mrr?: number | null
  sv: number[]
  fsv: number[]
  srb: Record<string, AutoFlexRarityBoundsInWire>
  ml?: number | null
  xl?: number | null
}

// SafeguardWasmEntryOut (17 short-name fields; nested combination/countMode keep camelCase)
type SafeguardWasmEntryOutWire = {
  h: string
  co: object     // SafeguardWasmCombination runtime shape — compatible with SafeguardCombination
  ri: string | null
  ro: number | null
  ra: string
  cm: object     // SafeguardWasmCountMode runtime shape — compatible with SafeguardRuleCountMode
  pgc: number
  gt: number
  rc: number
  cc: number
  pc: number
  d: number
  cbe: boolean
  ik: number[]
  ar: object[]   // SafeguardWasmArtifactOut[] — compatible with SafeguardDetectionArtifact[]
  pl: object[]   // SafeguardWasmPlaceholderOut[] — compatible with SafeguardPlaceholderRequest[]
  ca: SafeguardCandidateOut[]
}

// SafeguardWasmSnapshotOut (sa/e)
export type SafeguardWasmSnapshotOutWire = {
  sa: number
  e: SafeguardWasmEntryOutWire[]
}

// ─── Existing helpers ported from wasmRuleWireFields.ts ──────────────────────

const RuleRaw_LONG_TO_SHORT: Record<string, string> = {
  "RecipeID": "r_id",
  "RecipeName": "r_n",
  "Keep": "k",
  "IsRuleTypeAND": "and",
  "Use": "u",
  "ArtifactSet": "as",
  "ArtifactType": "at",
  "Rank": "rk",
  "Rarity": "ra",
  "MainStatID": "ms",
  "MainStatF": "mf",
  "LVLForCheck": "lvl",
  "Faction": "f",
  "Substats": "ss",
  "__source": "_s",
  "__lineIdx": "_li",
  "__allKnownSets": "_aks",
  "__rankMask": "_rkm",
  "__rarityMask": "_ram",
  "__safeguardRuleId": "_sri",
  "__safeguardRuleOrdinal": "_sro",
  "__safeguardHash": "_sh",
  "__safeguardRequired": "_srq",
  "__safeguardScanMs": "_ssm",
  "__safeguardProjected": "_sp",
  "__safeguardDeficit": "_sd",
  "__safeguardItemKey": "_sik",
  "__safeguardPlaceholder": "_sph",
  "__safeguardPlaceholderMissing": "_spm",
}

const RuleRaw_SHORT_TO_LONG: Record<string, string> = Object.fromEntries(
  Object.entries(RuleRaw_LONG_TO_SHORT).map(([long, short]) => [short, long]),
)

const RuleSubRaw_LONG_TO_SHORT: Record<string, string> = {
  "ID": "id",
  "Value": "v",
  "IsFlat": "if",
  "NotAvailable": "na",
  "Condition": "c",
}

const RuleSubRaw_SHORT_TO_LONG: Record<string, string> = Object.fromEntries(
  Object.entries(RuleSubRaw_LONG_TO_SHORT).map(([long, short]) => [short, long]),
)

// Rename top-level keys in an object; values are aliased (not cloned).
// Undeclared keys pass through unchanged.
const renameKeys = (source: object, map: Record<string, string>): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const key in source) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    const mapped = map[key] ?? key
    out[mapped] = (source as Record<string, unknown>)[key]
  }
  return out
}

// Minify a RuleRaw-shaped object (HsfRule / HsfRuleWithRecipe) to the short-key wire form.
// Nested Substats array is also minified via the RuleSubRaw map.
export const minifyRuleRawForWire = (rule: object): Record<string, unknown> => {
  const top = renameKeys(rule, RuleRaw_LONG_TO_SHORT)
  const substatsShortKey = RuleRaw_LONG_TO_SHORT["Substats"] as string
  const subs = top[substatsShortKey]
  if (Array.isArray(subs)) {
    top[substatsShortKey] = subs.map((sub) => renameKeys(sub as object, RuleSubRaw_LONG_TO_SHORT))
  }
  return top
}

// Expand a short-key wire RuleRaw back to the long-key canonical form.
// Reverse of minifyRuleRawForWire; handles the nested Substats array too.
export const expandRuleRawFromWire = (rule: object): Record<string, unknown> => {
  const top = renameKeys(rule, RuleRaw_SHORT_TO_LONG)
  const subs = top["Substats"]
  if (Array.isArray(subs)) {
    top["Substats"] = subs.map((sub) => renameKeys(sub as object, RuleSubRaw_SHORT_TO_LONG))
  }
  return top
}

// ─── SafeguardWasmExpectedGroupDomainIn projection ───────────────────────────

// Project long-name domain to short-name wire form (input to WASM).
export const projectSafeguardExpectedGroupDomainForWire = (domain: {
  slotOrder: number[]
  accessoryCompatibleSetIds: number[]
  armorCompatibleSetIds: number[]
  allowedMainBySlot: Record<string, number[]>
  allFactionIds: number[]
}): SafeguardExpectedGroupDomainWire => ({
  so: domain.slotOrder,
  acs: domain.accessoryCompatibleSetIds,
  ams: domain.armorCompatibleSetIds,
  amb: domain.allowedMainBySlot,
  afi: domain.allFactionIds,
})

// ─── SafeguardWasmSnapshotOut expansion / projection ─────────────────────────

function expandSafeguardEntryFromWire(wire: SafeguardWasmEntryOutWire): SafeguardDetectionEntry {
  return {
    hash: wire.h,
    combination: wire.co as SafeguardCombination,
    ruleOrdinal: wire.ro ?? null,
    ruleActivation: wire.ra as SafeguardRuleActivation,
    countMode: wire.cm as SafeguardRuleCountMode,
    perGroupRequiredCount: wire.pgc,
    groupsTracked: wire.gt,
    requiredCount: wire.rc,
    currentCount: wire.cc,
    projectedCount: wire.pc,
    deficit: wire.d,
    coveredByExisting: wire.cbe,
    itemKeys: wire.ik,
    artifacts: wire.ar as SafeguardDetectionArtifact[],
    placeholders: wire.pl as SafeguardPlaceholderRequest[],
    candidates: wire.ca,
  }
}

// Expand WASM output snapshot (short names) → app-domain SafeguardDetectionSnapshot (long names).
export const expandSafeguardSnapshotFromWire = (wire: SafeguardWasmSnapshotOutWire): SafeguardDetectionSnapshot => ({
  scannedAt: wire.sa,
  entries: wire.e.map(expandSafeguardEntryFromWire),
})

// Project app-domain SafeguardDetectionSnapshot → wire form for WASM input.
// Used when sending a prior detection result back in the computeMergedRules payload.
// rule_id (ri) is omitted; WASM falls back to hash-based entry lookup.
function projectSafeguardEntryForWire(entry: SafeguardDetectionEntry): SafeguardWasmEntryOutWire {
  return {
    h: entry.hash,
    co: entry.combination,
    ri: null,
    ro: entry.ruleOrdinal,
    ra: entry.ruleActivation,
    cm: entry.countMode,
    pgc: entry.perGroupRequiredCount,
    gt: entry.groupsTracked,
    rc: entry.requiredCount,
    cc: entry.currentCount,
    pc: entry.projectedCount,
    d: entry.deficit,
    cbe: entry.coveredByExisting,
    ik: entry.itemKeys,
    ar: entry.artifacts,
    pl: entry.placeholders,
    ca: entry.candidates ?? [],
  }
}

// Project SafeguardDetectionSnapshot → wire form for WASM input (embed in computeMergedRules).
export const projectSafeguardSnapshotForWire = (snapshot: SafeguardDetectionSnapshot): SafeguardWasmSnapshotOutWire => ({
  sa: snapshot.scannedAt,
  e: snapshot.entries.map(projectSafeguardEntryForWire),
})

// ─── AutoFlexRarityRecipeIn projection / expansion ───────────────────────────

const toI32Array = (values: ReadonlyArray<number> | undefined | null): number[] =>
  Array.from(values ?? []).map((v) => Math.floor(v))

// Project BuilderRecipe → short-name wire form for WASM input (expand-auto-flex-rarity-branches).
export const projectAutoFlexRarityRecipeForWire = (recipe: BuilderRecipe): AutoFlexRarityRecipeInWire => ({
  ...(typeof recipe.rarityMode === 'string' ? { rm: recipe.rarityMode } : {}),
  ...(typeof recipe.rarityCode === 'number' ? { rc: recipe.rarityCode } : {}),
  ...(typeof recipe.autoSubstatFlex === 'boolean' ? { asf: recipe.autoSubstatFlex } : {}),
  ...(typeof recipe.autoMinCount === 'boolean' ? { amc: recipe.autoMinCount } : {}),
  ...(typeof recipe.minCount === 'number' ? { mc: recipe.minCount } : {}),
  ...(typeof recipe.autoMinRequiredRolls === 'boolean' ? { amr: recipe.autoMinRequiredRolls } : {}),
  ...(typeof recipe.minRequiredRolls === 'number' ? { mrr: recipe.minRequiredRolls } : {}),
  sv: toI32Array(recipe.substatsV),
  fsv: toI32Array(recipe.fixedSubstatsV),
  srb: Object.fromEntries(
    Object.entries(recipe.substatRollBoundsV ?? {}).map(([key, bounds]) => [
      key,
      {
        ...(bounds.min !== undefined ? { mn: bounds.min } : {}),
        ...(bounds.max !== undefined ? { mx: bounds.max } : {}),
        ...(bounds.any !== undefined ? { a: bounds.any } : {}),
        ...(bounds.not !== undefined ? { n: bounds.not } : {}),
      } as AutoFlexRarityBoundsInWire,
    ])
  ),
  ...(typeof recipe.minLevel === 'number' ? { ml: recipe.minLevel } : {}),
  ...(typeof recipe.maxLevel === 'number' ? { xl: recipe.maxLevel } : {}),
})

// Expand short-name wire branch (WASM output) → Partial<BuilderRecipe> for spreading.
export const expandAutoFlexRarityBranchFromWire = (wire: AutoFlexRarityRecipeInWire): Partial<BuilderRecipe> => (({
  ...(wire.rm != null ? { rarityMode: wire.rm } : {}),
  ...(wire.rc != null ? { rarityCode: wire.rc } : {}),
  ...(wire.asf != null ? { autoSubstatFlex: wire.asf } : {}),
  ...(wire.amc != null ? { autoMinCount: wire.amc } : {}),
  ...(wire.mc != null ? { minCount: wire.mc } : {}),
  ...(wire.amr != null ? { autoMinRequiredRolls: wire.amr } : {}),
  ...(wire.mrr != null ? { minRequiredRolls: wire.mrr } : {}),
  ...(wire.sv !== undefined ? { substatsV: wire.sv } : {}),
  ...(wire.fsv !== undefined ? { fixedSubstatsV: wire.fsv } : {}),
  substatRollBoundsV: Object.fromEntries(
    Object.entries(wire.srb).map(([key, bounds]) => [
      Number(key),
      {
        ...(bounds.mn != null ? { min: bounds.mn } : {}),
        ...(bounds.mx != null ? { max: bounds.mx } : {}),
        ...(bounds.a != null ? { any: bounds.a } : {}),
        ...(bounds.n != null ? { not: bounds.n } : {}),
      },
    ])
  ) as Record<number, { min?: number; max?: number; any?: boolean; not?: boolean }>,
  ...(wire.ml != null ? { minLevel: wire.ml as LevelMilestone } : {}),
  ...(wire.xl != null ? { maxLevel: wire.xl as LevelMilestone } : {}),
}) as Partial<BuilderRecipe>)
