/**
 * tagHelpers.ts
 *
 * Central tag normalization helpers used by config metadata and Note
 * config options parsing so matching stays consistent across the app.
 */

// Tag tokens stay compact so they travel well in filenames and HSFC notes.
// Reserve punctuation for future syntax; allow unicode letters/numbers plus underscores.
// Tags must start with a letter, combining mark, or underscore.
export const TAG_TOKEN_REGEX = /^[\p{L}\p{M}_][\p{L}\p{N}\p{M}_]*$/u

// Normalize a user-provided tag into a stable, matchable token.
export function normalizeTagValue(raw: string): string | null {
  // Keep callers resilient when inputs are loose or nullish.
  if (typeof raw !== 'string') return null
  // Trim first so we do not preserve accidental padding.
  const trimmed = raw.trim()
  // Empty tags are ignored everywhere.
  if (!trimmed) return null
  // Reject whitespace so tags remain a single token.
  if (/\s/u.test(trimmed)) return null
  // Normalize case so matching is deterministic.
  const normalized = trimmed.toLowerCase()
  // Reject tokens that do not match the shared tag grammar.
  if (!TAG_TOKEN_REGEX.test(normalized)) return null
  // Return a single canonical string for matching and storage.
  return normalized
}

// Normalize an unknown list into a stable, de-duped tag array.
export function normalizeTagList(source: unknown): string[] | undefined {
  // Only arrays are considered valid inputs.
  if (!Array.isArray(source)) return undefined
  // Track de-dupes while preserving order.
  const seen = new Set<string>()
  // Collect normalized tags in insertion order.
  const next: string[] = []
  for (const entry of source) {
    // Ignore non-string payloads to keep exports clean.
    if (typeof entry !== 'string') continue
    // Normalize and validate the tag grammar.
    const normalized = normalizeTagValue(entry)
    // Skip anything that collapses to an empty token.
    if (!normalized) continue
    // Prevent duplicates without reordering.
    if (seen.has(normalized)) continue
    // Record the new token for the output.
    seen.add(normalized)
    next.push(normalized)
  }
  // Return undefined when the result is empty.
  return next.length > 0 ? next : undefined
}

// Merge new tags into a list while keeping stable ordering.
export function mergeTagList(base: readonly string[], additions: readonly string[]): string[] {
  // Start with an empty array to preserve the original ordering.
  const next: string[] = []
  // Track what has already been included.
  const seen = new Set<string>()
  // Shared helper so base and additions share the same guardrails.
  const addUnique = (value: string) => {
    // Skip duplicates to keep a stable list.
    if (seen.has(value)) return
    // Mark the token as present before pushing.
    seen.add(value)
    next.push(value)
  }
  // Preserve the original base ordering first.
  base.forEach((tag) => addUnique(String(tag)))
  // Append new tags while ignoring duplicates.
  additions.forEach((tag) => addUnique(String(tag)))
  // Return the merged array for immediate use.
  return next
}

export interface TagPresenceSummary {
  total: number
  all: string[]
  common: string[]
  mixed: string[]
  counts: Record<string, number>
}

// Summarize tag presence across multiple configs so multi-edit can flag mixed tags.
export function summarizeTagPresence(
  tagLists: readonly (readonly string[] | null | undefined)[],
): TagPresenceSummary {
  // Track the total number of lists for common/mixed math.
  const total = tagLists.length
  // Preserve first-seen order so chips stay predictable.
  const ordered: string[] = []
  // Count how many lists include each tag.
  const counts: Record<string, number> = Object.create(null) as Record<string, number>
  tagLists.forEach((tags) => {
    // De-dupe within each list so counts stay accurate.
    const unique = new Set<string>((tags ?? []).map(String))
    unique.forEach((tag) => {
      // Seed ordering the first time we see a tag.
      if (counts[tag] == null) ordered.push(tag)
      counts[tag] = (counts[tag] ?? 0) + 1
    })
  })
  // Tags present in every list are common.
  const common = ordered.filter((tag) => counts[tag] === total && total > 0)
  // Tags present in some, but not all, lists are mixed.
  const mixed = ordered.filter((tag) => {
    const count = counts[tag] ?? 0
    return count > 0 && count < total
  })
  return {
    total,
    all: ordered,
    common,
    mixed,
    counts,
  }
}
