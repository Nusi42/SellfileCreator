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
import { getRuleConfigIndex, normalizeConfigName } from './ruleConfigIndex'

// Single source of truth listing every UI-only field attached to merged rules.
const EXPORT_RULE_METADATA_FIELDS: Array<keyof HsfRuleWithCfg> = [
  '__lineIdx',
  '__allKnownSets',
  '__source',
  '__rankMask',
  '__rarityMask',
  '__keepUniqueRuleId',
  '__keepUniqueRuleOrdinal',
  '__keepUniqueHash',
  '__keepUniqueRequired',
  '__keepUniqueScanMs',
  '__keepUniqueProjected',
  '__keepUniqueDeficit',
  '__keepUniqueItemKey',
]

/** Strip UTF‑8 BOM and parse `.hsf` JSON. Ensures a `Rules` array exists. */
export function parseHsfFile(text: string): HsfFile {
  const clean = text.replace(/^\uFEFF/, '')
  const parsed = JSON.parse(clean)
  if (Array.isArray(parsed)) {
    // Tests/fixtures store bare rule arrays; wrap them so downstream code gets the expected container.
    return { Rules: parsed as HsfRule[] }
  }
  if (!parsed || !Array.isArray((parsed as Record<string, unknown>).Rules)) {
    throw new Error("Invalid .hsf file: missing 'Rules' array")
  }
  return parsed as HsfFile
}

type ExportableRule = HsfRuleWithCfg
type ConfigNameList = Array<string | null | undefined>

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
  const cleaned: HsfRule[] = rules.map((r) => {
    const stripped = stripUiMetadata(r)
    // Preserve ConfigID/ConfigName ordering for readability while omitting diagnostics.
    const { ConfigID, ConfigName, ...others } = stripped
    const ordered: HsfRule = {
      ...(ConfigID !== undefined ? { ConfigID } : {}),
      ...(ConfigName !== undefined ? { ConfigName } : {}),
      ...(others as HsfRule),
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

type ExportMetadataOptions = { configNames?: ConfigNameList }

function applyConfigNamesForExport(rules: ExportableRule[], options?: ExportMetadataOptions): ExportableRule[] {
  const names = options?.configNames
  if (!names || names.length === 0) {
    return rules.map((rule) => ({ ...rule }))
  }
  return rules.map((rule) => {
    const clone = { ...rule }
    const cfgIdx = getRuleConfigIndex(rule)
    if (cfgIdx !== null) {
      const normalized = normalizeConfigName(names[cfgIdx] ?? null)
      if (normalized) {
        clone.ConfigName = normalized
      } else if ('ConfigName' in clone) {
        delete (clone as { ConfigName?: string }).ConfigName
      }
    }
    return clone
  })
}

/** Build an HSF file object from merged rules (strips UI-only fields). */
export function buildHsfFileFromMerged(rules: ExportableRule[], options?: ExportMetadataOptions): HsfFile {
  const prepared = applyConfigNamesForExport(rules, options)
  return cleanHsfForExport(prepared)
}

/** Convert an HSF file object to a Blob ready to download. */
export function hsfToBlob(file: HsfFile): Blob {
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
}

/** Build a deduplicated HSF file object from merged rules (dev export helper). */
export function buildDedupedHsfFileFromMerged(rules: HsfRuleWithCfg[], options?: ExportMetadataOptions): HsfFile {
  const deduped = dedupeHsfRulesForExport(rules)
  const prepared = applyConfigNamesForExport(deduped, options)
  return cleanHsfForExport(prepared)
}
