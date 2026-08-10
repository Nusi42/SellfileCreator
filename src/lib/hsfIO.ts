/**
 * HSF IO Helpers
 *
 * Responsibilities:
 * - Parse RSL Helper `.hsf` files from text (tolerates UTF‑8 BOM).
 * - Prepare rules for HSF export by stripping UI-only metadata.
 *
 * This module deliberately contains only HSF read/write concerns.
 * Core builder logic lives in `hsfBuilder.ts`, and HSF type definitions in `hsfTypes.ts`.
 */
import type { HsfFile, HsfRule, HsfSubstat } from './hsfTypes'
import { getRuleRecipeIndex, normalizeRecipeName } from './ruleRecipeIndex'
import { RULE_SOURCE_FINAL_SELL } from './ruleSources'
import { computeCrc32 } from './autosave'
// PROVISIONAL(anomalous): anomalous-substat detection for the export scrub below.
import { isAnomalousStatId } from './anomalousAccessories'
import { STAT_ID_ANY } from './generated/domainConstants'

type HsfRuleWithRecipe = ReturnType<(typeof import('./merge'))['computeMergedRules']>[number]

// Single source of truth listing every UI-only field attached to merged rules.
const EXPORT_RULE_METADATA_FIELDS: Array<keyof HsfRuleWithRecipe> = [
  '__lineIdx',
  '__allKnownSets',
  '__source',
  '__rankMask',
  '__rarityMask',
  '__safeguardRuleId',
  '__safeguardRuleOrdinal',
  '__safeguardHash',
  '__safeguardRequired',
  '__safeguardScanMs',
  '__safeguardProjected',
  '__safeguardDeficit',
  '__safeguardItemKey',
  '__safeguardPlaceholder',
  '__safeguardPlaceholderMissing',
]

/** Strip UTF‑8 BOM and parse `.hsf` JSON. Ensures a `Rules` array exists. */
type ExportableRule = HsfRuleWithRecipe
type RecipeNameList = Array<string | null | undefined>
type LegacyRuleMetadata = { ConfigID?: number; ConfigName?: string }

function normalizeRuleMetadata(rule: HsfRule & LegacyRuleMetadata): HsfRule {
  const normalized = { ...rule } as HsfRule & LegacyRuleMetadata
  // Promote legacy key names into canonical fields exactly once at parse-time.
  if (normalized.RecipeID == null && typeof normalized.ConfigID === 'number') {
    normalized.RecipeID = normalized.ConfigID
  }
  if (normalized.RecipeName == null && typeof normalized.ConfigName === 'string') {
    normalized.RecipeName = normalized.ConfigName
  }
  // Remove legacy aliases so runtime logic only sees recipe metadata keys.
  delete normalized.ConfigID
  delete normalized.ConfigName
  return normalized
}

export function parseHsfFile(text: string): HsfFile {
  const clean = text.replace(/^\uFEFF/, '')
  const parsed = JSON.parse(clean)
  if (Array.isArray(parsed)) {
    // Tests/fixtures store bare rule arrays; wrap them so downstream code gets the expected container.
    return { Rules: parsed.map((rule) => normalizeRuleMetadata(rule as HsfRule & LegacyRuleMetadata)) }
  }
  if (!parsed || !Array.isArray((parsed as Record<string, unknown>).Rules)) {
    throw new Error("Invalid .hsf file: missing 'Rules' array")
  }
  const typed = parsed as HsfFile & { Rules: Array<HsfRule & LegacyRuleMetadata> }
  return {
    ...typed,
    Rules: typed.Rules.map((rule) => normalizeRuleMetadata(rule)),
  }
}

function stripUiMetadata(rule: ExportableRule): ExportableRule {
  const cloned = { ...rule }
  // Drop every UI-only diagnostics field so exports only carry the HSF schema.
  for (const key of EXPORT_RULE_METADATA_FIELDS) {
    if (key in cloned) {
      delete (cloned as Record<string, unknown>)[key as string]
    }
  }
  return cloned
}

/** Remove UI-only fields (e.g., `__lineIdx`) and wrap in HSF container. */
export function cleanHsfForExport(rules: ExportableRule[]): HsfFile {
  const cleaned: HsfRule[] = rules.map((r, exportIndex) => {
    const stripped = stripUiMetadata(r) as ExportableRule & { rowIdx?: number }
    // Preserve RecipeID/RecipeName ordering for readability while omitting diagnostics.
    const { RecipeID, RecipeName: rawRecipeName, RowIdx: _prevRowIdx, rowIdx: _legacyRowIdx, ...rest } = stripped
    // RecipeName comes from recipe.appearance?.name which is already clean (no color directives).
    const RecipeName = rawRecipeName != null
      ? (rawRecipeName.trim() || undefined)
      : rawRecipeName
    // Builders already emit fields in the desired order; we simply reattach Recipe metadata.
    const others = rest as HsfRule
    const ordered: HsfRule = {
      ...(RecipeID !== undefined ? { RecipeID } : {}),
      ...(RecipeName !== undefined ? { RecipeName } : {}),
      ...others,
      // Stable 1-based row index lets host exports recover preview ordering even after merges/dedup.
      RowIdx: exportIndex + 1,
    }
    return ordered
  })
  return { Rules: cleaned }
}

/** Convenience: read a `.hsf`/JSON file, parse and return HSF payload. */
export async function readHsfFile(file: File): Promise<HsfFile> {
  const text = await file.text()
  return parseHsfFile(text)
}

// Fixed label written into the exported HSF for Final Sell rules so RSL Helper can display them correctly.
const FINAL_SELL_EXPORT_NAME = 'Final Sell' as const

type ExportMetadataOptions = { recipeNames?: RecipeNameList }

function applyRecipeNamesForExport(rules: ExportableRule[], options?: ExportMetadataOptions): ExportableRule[] {
  const names = options?.recipeNames
  if (!names || names.length === 0) {
    return rules.map((rule) => ({ ...rule }))
  }
  return rules.map((rule) => {
    const clone = { ...rule }
    // Final Sell rules always export under a fixed label regardless of RecipeID.
    if (clone.__source === RULE_SOURCE_FINAL_SELL) {
      clone.RecipeName = FINAL_SELL_EXPORT_NAME
      return clone
    }
    const recipeIdx = getRuleRecipeIndex(rule)
    if (recipeIdx !== null) {
      const normalized = normalizeRecipeName(names[recipeIdx] ?? null)
      if (normalized) {
        clone.RecipeName = normalized
      } else if ('RecipeName' in clone) {
        delete (clone as { RecipeName?: string }).RecipeName
      }
    }
    return clone
  })
}

// Neutral "Any" substat pad entry — mirrors the WASM builder's four-substat padding
// (safeguard_clone_any_substats in wasm/rule_engine_core) so scrubbed rules keep shape.
const anySubstatPadEntry = (): HsfSubstat => (
  { ID: STAT_ID_ANY, Value: 0, IsFlat: true, Condition: '', NotAvailable: false }
)

// PROVISIONAL(anomalous): anomalous-substat ids must never reach exported sellfiles —
// no sample .hsf demonstrates how RSL Helper RULES encode them, and we never guess at
// schema. NOTE the semantics gap this opens now that real gear carries these substats:
// a rule REQUIRING one can match pieces in the preview yet exports as NOTHING (the whole
// rule is dropped — exporting it minus the condition would broaden it, which is worse);
// a negated ("¬") line only drops that line, re-padded with a neutral Any entry. The
// console warning below discloses every divergence. Revisit as soon as a sample sellfile
// with these stats exists (docs/technical/anomalous-accessories.md checklist).
function scrubAnomalousSubstatsForExport(rules: ExportableRule[]): ExportableRule[] {
  const kept: ExportableRule[] = []
  let droppedRules = 0
  let droppedLines = 0
  for (const rule of rules) {
    const subs = rule.Substats
    // Fast path: rules without anomalous lines pass through untouched.
    const hasAnomalous = subs?.some((sub) => sub && isAnomalousStatId(Number(sub.ID)))
    if (!subs || !hasAnomalous) { kept.push(rule); continue }
    // Any REQUIRED anomalous line cannot be expressed in the export → drop the rule.
    if (subs.some((sub) => sub && isAnomalousStatId(Number(sub.ID)) && sub.Condition !== '¬')) {
      droppedRules += 1
      continue
    }
    // Only negated anomalous lines remain → drop those lines and restore the pad count.
    const remaining = subs.filter((sub) => !(sub && isAnomalousStatId(Number(sub.ID))))
    droppedLines += subs.length - remaining.length
    const pads = Array.from({ length: subs.length - remaining.length }, anySubstatPadEntry)
    kept.push({ ...rule, Substats: [...remaining, ...pads] })
  }
  if (droppedRules > 0 || droppedLines > 0) {
    // Permanent disclosure (not debug scaffolding): exports must never silently diverge
    // from the preview without a trace. See docs/technical/anomalous-accessories.md.
    console.warn(`[export] anomalous scrub: dropped ${droppedRules} unsatisfiable rule(s), ${droppedLines} vacuous not-line(s)`)
  }
  return kept
}

/** Build an HSF file object from merged rules (strips UI-only fields). */
export function buildHsfFileFromMerged(rules: ExportableRule[], options?: ExportMetadataOptions): HsfFile {
  // Scrub before name application so the fingerprint helper below hashes the same bytes.
  const scrubbed = scrubAnomalousSubstatsForExport(rules)
  const prepared = applyRecipeNamesForExport(scrubbed, options)
  return cleanHsfForExport(prepared)
}

// Fingerprint of the EXACT bytes that buildHsfFileFromMerged would export. The HSF
// export/push "dirty" indicator compares this against the fingerprint captured at the last
// export, so dirty ⟺ the exported file would actually differ — not merely "some input
// changed". It must hash precisely what gets serialized: cleanHsfForExport already strips
// every volatile/UI field (__safeguardScanMs timestamp, projected/deficit/itemKey, detection
// internals, __lineIdx, etc.), so the result is deterministic and content-pure — a gear-DB
// update that doesn't change the injected rules produces the same fingerprint (no false
// "dirty"), and an add-then-remove inventory round-trip returns to the prior fingerprint
// (correctly goes clean again). SSOT: the rule-cache worker computes this per pipeline commit
// via this same helper and returns it as mergedRulesHash; the main thread only compares that
// string against the hash captured at the last export (it does not recompute the crc). The two
// stay in lockstep because BOTH sides feed buildHsfFileFromMerged the recipe names produced by
// recipeNamesForExport (ruleCacheHelpers) over the SAME override-applied recipe list — so the
// bytes the worker fingerprints are exactly the bytes the main thread would export.
export function computeExportedHsfFingerprint(
  rules: ExportableRule[],
  options?: ExportMetadataOptions,
): string {
  return computeCrc32(JSON.stringify(buildHsfFileFromMerged(rules, options)))
}

// MIME type of every exported HSF payload — the download Blob and the endpoint push
// envelope's contentType field share this one definition (SSOT). The push path reads the
// constant directly instead of materializing a throwaway Blob (a ~58 MB pretty-printed
// string on large rule sets) just to ask it for `.type`.
export const HSF_EXPORT_CONTENT_TYPE = 'application/json'

/** Convert an HSF file object to a Blob ready to download. */
export function hsfToBlob(file: HsfFile): Blob {
  return new Blob([JSON.stringify(file, null, 2)], { type: HSF_EXPORT_CONTENT_TYPE })
}
