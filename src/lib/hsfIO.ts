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

/** Remove UI-only fields (e.g., `__cfgIdx`) and wrap in HSF container. */
export function cleanHsfForExport(rules: Array<HsfRule & { __cfgIdx?: number; __lineIdx?: number; __allKnownSets?: boolean; __source?: unknown }>): HsfFile {
  const cleaned: HsfRule[] = rules.map((r) => {
    const { __cfgIdx, __lineIdx, __allKnownSets, __source, ...rest } = r
    return rest as HsfRule
  })
  return { Rules: cleaned }
}

/** Convenience: read a `.hsf`/JSON file, parse and return HSF payload. */
export async function readHsfFile(file: File): Promise<HsfFile> {
  const text = await file.text()
  return parseHsfFile(text)
}

/** Build an HSF file object from merged rules (strips UI-only fields). */
export function buildHsfFileFromMerged(rules: Array<HsfRule & { __cfgIdx?: number; __lineIdx?: number; __allKnownSets?: boolean; __source?: unknown }>): HsfFile {
  return cleanHsfForExport(rules)
}

/** Convert an HSF file object to a Blob ready to download. */
export function hsfToBlob(file: HsfFile): Blob {
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
}

/** Build a deduplicated HSF file object from merged rules (dev export helper). */
export function buildDedupedHsfFileFromMerged(rules: HsfRuleWithCfg[]): HsfFile {
  const deduped = dedupeHsfRulesForExport(rules)
  return cleanHsfForExport(deduped)
}
