import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_LANGUAGE, PRODUCTION_LANGUAGES, type ProductionLanguage } from '../../src/lib/i18n/types'

// Single source of truth for auditing catalog structure (keys + comments) against
// the English source of truth, by reading the catalog `.ts` files as text. Both the
// `sync-catalog-comments` CLI and `tests/unit/catalog-structure-parity.test.ts`
// import from here so the gate logic exists in exactly one place.
//
// Why text-based: the runtime catalog objects lose key ORDER guarantees only in
// theory (JS preserves insertion order), but they also drop COMMENT lines entirely.
// Comments and blank-line layout only exist in the source text, so structural
// parity (the thing that silently drifted before) must be checked against the file.

// Resolve catalog files from cwd so this works the same whether invoked from the
// CLI (tmp/tsc/scripts) or the compiled test (tmp/tsc/tests) — both run with the
// repo root as cwd.
const catalogRoot = (): string => join(process.cwd(), 'src', 'lib', 'i18n', 'catalogs')

// Absolute path to a locale's catalog source file.
export const catalogPath = (code: ProductionLanguage): string => join(catalogRoot(), `${code}.ts`)

// Read a catalog source file as text.
export const readCatalogText = (code: ProductionLanguage): string => readFileSync(catalogPath(code), 'utf8')

// A top-level catalog entry: `  someKey: "value",` (two-space indent, the object body).
const KEY_LINE = /^ {2}([a-zA-Z0-9_]+):\s/

// Pull the ordered list of top-level keys from a catalog's source text.
export const extractKeys = (content: string): string[] => {
  const keys: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(KEY_LINE)
    if (match && match[1]) keys.push(match[1])
  }
  return keys
}

// Pull the ordered list of comment texts (the part after `//`, trimmed) from source.
export const extractCommentTexts = (content: string): string[] => {
  const comments: string[] = []
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('//')) comments.push(trimmed.slice(2).trimStart())
  }
  return comments
}

// The drift a single locale carries relative to en-US.
export type StructureDrift = {
  code: ProductionLanguage
  // Keys in en-US missing here (would silently fall back to English at runtime).
  missingKeys: string[]
  // Keys here absent from en-US (dead — nothing consumes them).
  extraKeys: string[]
  // First positional key-order divergence, or null when order matches.
  orderMismatch: { index: number; expected: string; actual: string } | null
  // Comment lines that differ positionally from en-US (count or text), or null when identical.
  commentMismatch: { index: number; expected: string | null; actual: string | null } | null
}

// Compare one locale's catalog text to the English baseline text.
export const auditStructure = (
  code: ProductionLanguage,
  englishKeys: string[],
  englishComments: string[],
): StructureDrift => {
  const content = readCatalogText(code)
  const keys = extractKeys(content)
  const comments = extractCommentTexts(content)

  const keySet = new Set(keys)
  const englishKeySet = new Set(englishKeys)
  const missingKeys = englishKeys.filter((key) => !keySet.has(key))
  const extraKeys = keys.filter((key) => !englishKeySet.has(key))

  // First positional key-order divergence over the shared prefix.
  let orderMismatch: StructureDrift['orderMismatch'] = null
  const keyLimit = Math.min(keys.length, englishKeys.length)
  for (let i = 0; i < keyLimit; i += 1) {
    if (keys[i] !== englishKeys[i]) {
      orderMismatch = { index: i, expected: englishKeys[i] ?? '', actual: keys[i] ?? '' }
      break
    }
  }

  // First comment divergence (text or count) — comments must be verbatim English,
  // in the same order, same total count.
  let commentMismatch: StructureDrift['commentMismatch'] = null
  const commentLimit = Math.max(comments.length, englishComments.length)
  for (let i = 0; i < commentLimit; i += 1) {
    const expected = englishComments[i] ?? null
    const actual = comments[i] ?? null
    if (expected !== actual) {
      commentMismatch = { index: i, expected, actual }
      break
    }
  }

  return { code, missingKeys, extraKeys, orderMismatch, commentMismatch }
}

// Audit every non-English production locale against en-US. Returns one entry per
// locale (in PRODUCTION_LANGUAGES order, excluding en-US).
export const auditAllLocales = (): StructureDrift[] => {
  const englishContent = readCatalogText(DEFAULT_LANGUAGE)
  const englishKeys = extractKeys(englishContent)
  const englishComments = extractCommentTexts(englishContent)
  return PRODUCTION_LANGUAGES.filter((code) => code !== DEFAULT_LANGUAGE).map((code) =>
    auditStructure(code, englishKeys, englishComments),
  )
}

// True when a locale carries no structural drift at all.
export const isAligned = (drift: StructureDrift): boolean =>
  drift.missingKeys.length === 0 &&
  drift.extraKeys.length === 0 &&
  drift.orderMismatch === null &&
  drift.commentMismatch === null
