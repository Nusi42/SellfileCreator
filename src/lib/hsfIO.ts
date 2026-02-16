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
import type { HsfFile, HsfRule } from './hsfTypes'
import type { HsfRuleWithCfg } from './merge'
import { dedupeHsfRulesForExport } from './hsfDeduplicate'
import { getRuleRecipeIndex, normalizeRecipeName } from './ruleRecipeIndex'

// Single source of truth listing every UI-only field attached to merged rules.
const EXPORT_RULE_METADATA_FIELDS: Array<keyof HsfRuleWithCfg> = [
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
type ExportableRule = HsfRuleWithCfg
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
    const { RecipeID, RecipeName, RowIdx: _prevRowIdx, rowIdx: _legacyRowIdx, ...rest } = stripped
    // Builders already emit fields in the desired order; we simply reattach Config metadata.
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

type ExportMetadataOptions = { recipeNames?: RecipeNameList }

function applyRecipeNamesForExport(rules: ExportableRule[], options?: ExportMetadataOptions): ExportableRule[] {
  const names = options?.recipeNames
  if (!names || names.length === 0) {
    return rules.map((rule) => ({ ...rule }))
  }
  return rules.map((rule) => {
    const clone = { ...rule }
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

/** Build an HSF file object from merged rules (strips UI-only fields). */
export function buildHsfFileFromMerged(rules: ExportableRule[], options?: ExportMetadataOptions): HsfFile {
  const prepared = applyRecipeNamesForExport(rules, options)
  return cleanHsfForExport(prepared)
}

/** Convert an HSF file object to a Blob ready to download. */
export function hsfToBlob(file: HsfFile): Blob {
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
}

/** Build a deduplicated HSF file object from merged rules (dev export helper). */
export function buildDedupedHsfFileFromMerged(rules: HsfRuleWithCfg[], options?: ExportMetadataOptions): HsfFile {
  const deduped = dedupeHsfRulesForExport(rules)
  const prepared = applyRecipeNamesForExport(deduped, options)
  return cleanHsfForExport(prepared)
}
