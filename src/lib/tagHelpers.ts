/**
 * tagHelpers.ts
 *
 * Central tag normalization helpers used by recipe metadata and Note
 * recipe overrides parsing so matching stays consistent across the app.
 */

// Tag tokens stay compact so they travel well in filenames and SFR notes.
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

// Canonical recipe tag that excludes recipe matches from safeguard coverage checks.
export const SAFEGUARD_IGNORE_TAG = 'ignore_by_safeguards'
// Legacy aliases kept for backward compatibility with older SFR/test fixtures.
export const SAFEGUARD_IGNORE_TAG_LEGACY_ALIASES = Object.freeze([
  'ignore_keep_unique',
  'ignore_safeguard',
] as const)
// Normalize once so token checks stay consistent with recipe-tag grammar.
const SAFEGUARD_IGNORE_TAG_TOKEN = normalizeTagValue(SAFEGUARD_IGNORE_TAG) ?? SAFEGUARD_IGNORE_TAG
// Build a normalized legacy alias set once to keep hot-path checks allocation-free.
const SAFEGUARD_IGNORE_TAG_LEGACY_TOKEN_SET = new Set<string>(
  SAFEGUARD_IGNORE_TAG_LEGACY_ALIASES
    .map((token) => normalizeTagValue(token))
    .filter((token): token is string => Boolean(token)),
)

// Canonicalize special safeguard-ignore aliases into the new tag token.
const canonicalizeKnownTagAlias = (normalizedTag: string): string => (
  SAFEGUARD_IGNORE_TAG_LEGACY_TOKEN_SET.has(normalizedTag)
    ? SAFEGUARD_IGNORE_TAG_TOKEN
    : normalizedTag
)

export const hasIgnoreSafeguardTag = (tags: readonly string[] | null | undefined): boolean => {
  // Skip empty or missing tag lists to keep hot paths tight.
  if (!Array.isArray(tags) || tags.length === 0) return false
  // Walk the tags so we can normalize any loose inputs.
  for (const rawTag of tags) {
    // Normalize to the same token grammar used elsewhere.
    const normalized = normalizeTagValue(String(rawTag))
    // Skip malformed tokens that collapse outside the tag grammar.
    if (!normalized) continue
    // Treat canonical and legacy aliases as the same logical tag.
    if (canonicalizeKnownTagAlias(normalized) === SAFEGUARD_IGNORE_TAG_TOKEN) return true
  }
  // No matching tag found in this list.
  return false
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
    // Normalize and validate the tag grammar first.
    const normalized = normalizeTagValue(entry)
    // Skip anything that collapses to an empty token.
    if (!normalized) continue
    // Canonicalize known aliases so newly written payloads use one token.
    const canonical = canonicalizeKnownTagAlias(normalized)
    // Prevent duplicates without reordering.
    if (seen.has(canonical)) continue
    // Record the new token for the output.
    seen.add(canonical)
    next.push(canonical)
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

// Summarize tag presence across multiple recipes so multi-edit can flag mixed tags.
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
