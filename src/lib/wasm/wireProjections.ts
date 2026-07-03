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
  SafeguardRuleActivation,
} from '../safeguards'
import type { BuilderRecipe } from '../hsfBuilder'
import type { LevelMilestone } from '../types'
// Generated ts-rs bindings pin every wire shape below to the Rust structs (the serde
// renames in wasm_merged_rules_wire_format.rs / the #[derive(TS)] structs are the SSOT).
// A Rust-side rename/add/remove regenerates these types and breaks compilation HERE
// instead of silently drifting at runtime.
import type { RuleRaw } from './generated/rust-types/RuleRaw'
import type { RuleRawWire } from './generated/rust-types/RuleRawWire'
import type { RuleSubRaw } from './generated/rust-types/RuleSubRaw'
import type { RuleSubRawWire } from './generated/rust-types/RuleSubRawWire'
import type { SafeguardWasmSnapshotOut } from './generated/rust-types/SafeguardWasmSnapshotOut'
import type { SafeguardWasmEntryOut } from './generated/rust-types/SafeguardWasmEntryOut'
import type { SafeguardWasmCombination } from './generated/rust-types/SafeguardWasmCombination'
import type { SafeguardWasmCountMode } from './generated/rust-types/SafeguardWasmCountMode'
import type { SafeguardWasmArtifactOut } from './generated/rust-types/SafeguardWasmArtifactOut'
import type { SafeguardWasmPlaceholderOut } from './generated/rust-types/SafeguardWasmPlaceholderOut'
import type { SafeguardWasmExpectedGroupDomainIn } from './generated/rust-types/SafeguardWasmExpectedGroupDomainIn'
import type { AutoFlexRarityRecipeIn } from './generated/rust-types/AutoFlexRarityRecipeIn'
import type { AutoFlexRarityBoundsIn } from './generated/rust-types/AutoFlexRarityBoundsIn'

// ─── Wire shapes (aliases of the generated Rust types) ───────────────────────

// SafeguardWasmExpectedGroupDomainIn (so/acs/ams/amb/afi) — generated type used directly.
export type SafeguardExpectedGroupDomainWire = SafeguardWasmExpectedGroupDomainIn

// Rust declares every field as Option<T> with #[serde(default)], so the PROJECTION side may
// omit keys entirely (serde fills the defaults) — hence Partial, applied to the nested
// bounds records too (srb re-declared because Partial is shallow). WASM OUTPUT always
// carries all fields, so expansion reads the full generated type.
export type AutoFlexRarityRecipeInWire = Partial<Omit<AutoFlexRarityRecipeIn, 'srb'>> & {
  srb?: Record<string, Partial<AutoFlexRarityBoundsIn>>
}
type AutoFlexRarityBoundsInWire = Partial<AutoFlexRarityBoundsIn>

// SafeguardWasmSnapshotOut (sa/e) — generated type used directly.
export type SafeguardWasmSnapshotOutWire = SafeguardWasmSnapshotOut

// ─── RuleRaw rename maps ──────────────────────────────────────────────────────

// Long→short rename map for RuleRaw. `satisfies` pins BOTH sides to the generated types:
// every long field of RuleRaw must be present as a key, and every value must be an actual
// RuleRawWire field — a Rust rename/add/remove fails compilation here. (Pairing long names
// to the WRONG short name is not expressible in the type system; the round-trip unit tests
// cover that.)
const RuleRaw_LONG_TO_SHORT = {
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
} as const satisfies Record<keyof RuleRaw, keyof RuleRawWire>

// Invert a literal rename map at runtime while preserving the exact literal key/value
// pairing at the type level — the ONE definition of the inversion used by both rename
// maps below (the mapped-type return means callers keep full key inference).
const invertRenameMap = <const M extends Record<string, string>>(map: M): { [K in keyof M as M[K] & string]: K } =>
  Object.fromEntries(Object.entries(map).map(([long, short]) => [short, long])) as { [K in keyof M as M[K] & string]: K }

// Inverse map DERIVED from the forward map (never hand-written a second time), then pinned
// to the generated wire type: totality over `keyof RuleRawWire` is compiler-checked, so a
// new/renamed short field in Rust also fails compilation here.
const RuleRaw_SHORT_TO_LONG: Record<keyof RuleRawWire, keyof RuleRaw> = invertRenameMap(RuleRaw_LONG_TO_SHORT)

// Same double-pinned pattern for the nested substat rows.
const RuleSubRaw_LONG_TO_SHORT = {
  "ID": "id",
  "Value": "v",
  "IsFlat": "if",
  "NotAvailable": "na",
  "Condition": "c",
} as const satisfies Record<keyof RuleSubRaw, keyof RuleSubRawWire>

const RuleSubRaw_SHORT_TO_LONG: Record<keyof RuleSubRawWire, keyof RuleSubRaw> = invertRenameMap(RuleSubRaw_LONG_TO_SHORT)

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
  artifactCompatibleSetIds: number[]
  allowedMainBySlot: Record<string, number[]>
  allFactionIds: number[]
}): SafeguardExpectedGroupDomainWire => ({
  so: domain.slotOrder,
  acs: domain.accessoryCompatibleSetIds,
  ams: domain.artifactCompatibleSetIds,
  amb: domain.allowedMainBySlot,
  afi: domain.allFactionIds,
})

// ─── SafeguardWasmSnapshotOut expansion / projection ─────────────────────────

// Wire→domain casts below bridge the generated WASM types to their brand-typed domain
// mirrors (SafeguardWasmCombination ↔ SafeguardCombination etc.) — structurally identical
// by construction; the generated side pins the actual wire field set.
function expandSafeguardEntryFromWire(wire: SafeguardWasmEntryOut): SafeguardDetectionEntry {
  return {
    hash: wire.h,
    combination: wire.co as unknown as SafeguardCombination,
    ruleOrdinal: wire.ro ?? null,
    ruleActivation: wire.ra as SafeguardRuleActivation,
    countMode: wire.cm as unknown as SafeguardRuleCountMode,
    perGroupRequiredCount: wire.pgc,
    groupsTracked: wire.gt,
    requiredCount: wire.rc,
    currentCount: wire.cc,
    projectedCount: wire.pc,
    deficit: wire.d,
    coveredByExisting: wire.cbe,
    itemKeys: wire.ik,
    artifacts: wire.ar as unknown as SafeguardDetectionArtifact[],
    placeholders: wire.pl as unknown as SafeguardPlaceholderRequest[],
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
function projectSafeguardEntryForWire(entry: SafeguardDetectionEntry): SafeguardWasmEntryOut {
  return {
    h: entry.hash,
    co: entry.combination as unknown as SafeguardWasmCombination,
    ri: null,
    ro: entry.ruleOrdinal,
    ra: entry.ruleActivation,
    cm: entry.countMode as unknown as SafeguardWasmCountMode,
    pgc: entry.perGroupRequiredCount,
    gt: entry.groupsTracked,
    rc: entry.requiredCount,
    cc: entry.currentCount,
    pc: entry.projectedCount,
    d: entry.deficit,
    cbe: entry.coveredByExisting,
    ik: entry.itemKeys,
    ar: entry.artifacts as unknown as SafeguardWasmArtifactOut[],
    pl: entry.placeholders as unknown as SafeguardWasmPlaceholderOut[],
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
    Object.entries(wire.srb ?? {}).map(([key, bounds]) => [
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
