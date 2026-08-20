/**
 * tagHelpers.ts
 *
 * Central tag normalization helpers used by recipe metadata and Note
 * recipe overrides parsing so matching stays consistent across the app.
 */

// Ore sentinels come from the cross-language SSOT so TS and Rust cannot drift.
import { ORE_ANY, ORE_NOT_ORED, ORE_ORED, ORE_TAG_IGNORE, ORE_TAG_IGNORE_LEGACY, ORE_TAG_ONLY, ORE_TAG_ONLY_LEGACY } from './generated/domainConstants'

// Tag tokens stay compact so they travel well in filenames and SFC notes.
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
// Legacy aliases kept for backward compatibility with older SFC/test fixtures.
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

// Canonicalize every known legacy tag alias into its current token. Covers the
// safeguard-ignore aliases and the pre-rename rework spellings, so a saved payload is
// always written with the current names while old files still load correctly.
const canonicalizeKnownTagAlias = (normalizedTag: string): string => {
  // Safeguard-ignore aliases fold onto the canonical safeguard tag.
  if (SAFEGUARD_IGNORE_TAG_LEGACY_TOKEN_SET.has(normalizedTag)) return SAFEGUARD_IGNORE_TAG_TOKEN
  // Rework aliases fold onto if_reworked / if_not_reworked (defined below; hoisted const
  // arrow functions are only called at runtime, well after module init).
  return canonicalizeReworkTagToken(normalizedTag)
}

// Canonical recipe tags that gate generated HSF rules on an item's rework state
// ("rework" = a Chaos Ore was applied to the piece).
// These drive the `Ore` rule property: rules from a recipe tagged `if_reworked` match only
// gear that has been reworked, `if_not_reworked` matches only gear that was never reworked,
// and an untagged recipe stays unconstrained.
export const REWORK_ONLY_TAG = ORE_TAG_ONLY
export const REWORK_EXCLUDE_TAG = ORE_TAG_IGNORE
// Normalize once so token comparisons match the shared recipe-tag grammar.
const REWORK_ONLY_TAG_TOKEN = normalizeTagValue(REWORK_ONLY_TAG) ?? REWORK_ONLY_TAG
const REWORK_EXCLUDE_TAG_TOKEN = normalizeTagValue(REWORK_EXCLUDE_TAG) ?? REWORK_EXCLUDE_TAG

// Pre-rename spellings of the two rework tags, accepted on read so recipes saved before
// the rename keep gating exactly as their author intended. Kept as read-only aliases:
// normalizeTagList rewrites them to the canonical spelling whenever a payload is written.
export const REWORK_ONLY_TAG_LEGACY_ALIASES = Object.freeze([ORE_TAG_ONLY_LEGACY] as const)
export const REWORK_EXCLUDE_TAG_LEGACY_ALIASES = Object.freeze([ORE_TAG_IGNORE_LEGACY] as const)
// Normalize the alias lists once so hot-path lookups stay allocation-free.
const REWORK_ONLY_LEGACY_TOKEN_SET = new Set<string>(
  REWORK_ONLY_TAG_LEGACY_ALIASES
    .map((token) => normalizeTagValue(token))
    .filter((token): token is string => Boolean(token)),
)
const REWORK_EXCLUDE_LEGACY_TOKEN_SET = new Set<string>(
  REWORK_EXCLUDE_TAG_LEGACY_ALIASES
    .map((token) => normalizeTagValue(token))
    .filter((token): token is string => Boolean(token)),
)

/**
 * Fold a legacy rework-tag spelling onto its canonical token.
 *
 * Every rework helper routes through this, so the aliases are understood uniformly by
 * resolution, membership checks, and mutual exclusivity — instead of each one carrying
 * its own alias branch.
 */
const canonicalizeReworkTagToken = (normalizedTag: string): string => {
  // Fold the pre-rename "only" spelling onto if_reworked.
  if (REWORK_ONLY_LEGACY_TOKEN_SET.has(normalizedTag)) return REWORK_ONLY_TAG_TOKEN
  // Fold the pre-rename "ignore" spelling onto if_not_reworked.
  if (REWORK_EXCLUDE_LEGACY_TOKEN_SET.has(normalizedTag)) return REWORK_EXCLUDE_TAG_TOKEN
  // Everything else (including the canonical tokens) passes through untouched.
  return normalizedTag
}

/**
 * The two rework tags are mutually exclusive on a recipe: a piece cannot be both reworked
 * and never-reworked, so holding both is meaningless. The editors enforce this by dropping
 * the opposite tag whenever one is added (see `applyReworkTagExclusivity`).
 *
 * Ordered so index 0 is the winner when a legacy/hand-edited file carries both.
 */
export const REWORK_TAGS = Object.freeze([REWORK_ONLY_TAG, REWORK_EXCLUDE_TAG] as const)
// Same list as normalized tokens, for grammar-safe membership checks.
const REWORK_TAG_TOKENS = Object.freeze([REWORK_ONLY_TAG_TOKEN, REWORK_EXCLUDE_TAG_TOKEN] as const)

/** True when the tag is one of the two mutually exclusive rework tags. */
export const isReworkTag = (tag: string): boolean => {
  // Normalize first so loose spellings are recognized like everywhere else.
  const normalized = normalizeTagValue(String(tag))
  // Non-conforming tokens can never be a rework tag.
  if (!normalized) return false
  // Fold legacy spellings so pre-rename tags count as rework tags as well.
  const canonical = canonicalizeReworkTagToken(normalized)
  return REWORK_TAG_TOKENS.includes(canonical as (typeof REWORK_TAG_TOKENS)[number])
}

/** The other tag of the mutually exclusive rework pair, or null for any other tag. */
export const oppositeReworkTag = (tag: string): string | null => {
  // Normalize first so loose spellings resolve to a canonical token.
  const normalized = normalizeTagValue(String(tag))
  // Non-conforming tokens have no opposite.
  if (!normalized) return null
  // Fold legacy spellings so a pre-rename tag still evicts its counterpart.
  const canonical = canonicalizeReworkTagToken(normalized)
  // Only the two rework tags have an opposite.
  if (canonical === REWORK_ONLY_TAG_TOKEN) return REWORK_EXCLUDE_TAG
  if (canonical === REWORK_EXCLUDE_TAG_TOKEN) return REWORK_ONLY_TAG
  return null
}

/**
 * Return `tags` with the rework tag *opposite* to `addedTag` removed.
 *
 * This is the single definition of rework-tag mutual exclusivity — single-edit, multi-edit,
 * and paste flows all route through it so a recipe can never end up holding both. Passing a
 * non-rework tag is a no-op, which keeps call sites free of "is this special?" branching.
 */
export const applyReworkTagExclusivity = (
  tags: readonly string[],
  addedTag: string,
): string[] => {
  // Only the two rework tags evict anything; every other tag passes straight through.
  if (!isReworkTag(addedTag)) return [...tags]
  // Normalize the added tag so we can identify its counterpart.
  const addedToken = normalizeTagValue(String(addedTag))
  // Defensive: a tag that fails the grammar cannot evict anything.
  if (!addedToken) return [...tags]
  // Fold the added tag so a legacy spelling evicts the same counterpart as the new one.
  const addedCanonical = canonicalizeReworkTagToken(addedToken)
  // The opposite tag is simply the other entry in the pair.
  const opposite = addedCanonical === REWORK_ONLY_TAG_TOKEN ? REWORK_EXCLUDE_TAG_TOKEN : REWORK_ONLY_TAG_TOKEN
  // Drop EVERY spelling of the opposite tag (canonical and legacy), preserving the rest.
  return tags.filter((tag) => {
    const normalized = normalizeTagValue(String(tag))
    // Keep malformed tokens untouched; they are not rework tags.
    if (!normalized) return true
    return canonicalizeReworkTagToken(normalized) !== opposite
  })
}

/**
 * Resolve a recipe's tag list into the HSF `Ore` sentinel.
 *
 * Mirrors the `MainStatID` convention: ORE_ANY (-1) means "this rule does not care",
 * so an untagged recipe keeps today's behavior exactly. Tagging is the only way to
 * narrow a rule to one rework state.
 *
 * The editors keep the two tags mutually exclusive, so "both set" should not occur in
 * practice. A hand-edited or legacy file can still carry both; in that case `if_reworked`
 * wins. This is the single definition of that precedence; callers must not re-derive it.
 */
export const resolveChaosOreTagValue = (tags: readonly string[] | null | undefined): number => {
  // Missing or empty tag lists leave the rule unconstrained.
  if (!Array.isArray(tags) || tags.length === 0) return ORE_ANY
  // Track each side separately so the both-set case can be resolved by precedence.
  let wantsReworked = false
  let wantsNotReworked = false
  for (const rawTag of tags) {
    // Normalize to the shared tag grammar before comparing tokens.
    const normalized = normalizeTagValue(String(rawTag))
    // Skip malformed tokens that collapse outside the grammar.
    if (!normalized) continue
    // Fold legacy spellings onto the canonical tokens before comparing.
    const canonical = canonicalizeReworkTagToken(normalized)
    // Record which of the two rework tags is present.
    if (canonical === REWORK_ONLY_TAG_TOKEN) wantsReworked = true
    else if (canonical === REWORK_EXCLUDE_TAG_TOKEN) wantsNotReworked = true
  }
  // if_reworked wins when a file carries both (checked first, so no explicit tie-break).
  if (wantsReworked) return ORE_ORED
  if (wantsNotReworked) return ORE_NOT_ORED
  // No rework tag present leaves the rule unconstrained.
  return ORE_ANY
}

/**
 * Coerce a rule's raw `Ore` field into an Ore sentinel.
 *
 * Rules reach the UI from two sources: freshly built ones always carry a number, but a
 * loaded HSF file is untrusted JSON that can carry the value as a numeric string. Coerce
 * in one place so callers never mix a strict comparison with an ad-hoc `Number(...)`.
 */
export const normalizeOreValue = (ore: unknown): number => {
  // Absent means "this rule does not care", the same as an explicit ORE_ANY.
  if (ore === null || ore === undefined || ore === '') return ORE_ANY
  // Coerce numbers and numeric strings alike; anything unparseable stays unconstrained.
  const parsed = Number(ore)
  return Number.isFinite(parsed) ? parsed : ORE_ANY
}

/** True when the resolved Ore sentinel actually narrows a rule. */
export const isChaosOreConstrained = (ore: number | null | undefined): boolean => (
  // Only the two concrete states constrain; ORE_ANY and nullish do not.
  ore === ORE_ORED || ore === ORE_NOT_ORED
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

/**
 * SSOT for "which tags carry app-driven meaning".
 *
 * Most tags are free-form labels for the user's own organization and are deliberately
 * excluded from rule-generation fingerprints (see IGNORED_KEYS in recipeSnapshot.ts), so
 * renaming a label never rebuilds every rule. A handful of tags DO change behavior, and
 * those must take part in any cache key that decides whether generated rules can be
 * reused — otherwise toggling one silently serves stale rules until a reload.
 *
 * Every semantic tag is registered here exactly once, together with the value it
 * contributes to a fingerprint. Adding a new behavior-carrying tag means adding one entry
 * here; the cache key then picks it up automatically instead of each call site having to
 * remember to re-add it.
 *
 * The contribution is a DERIVED value, not the raw tag: equivalent spellings (canonical vs
 * pre-rename aliases) must collapse to the same fingerprint so loading an older file does
 * not needlessly invalidate its cached rules.
 */
export const SEMANTIC_TAG_CONTRIBUTIONS = Object.freeze({
  // Excludes a recipe's keeps from safeguard coverage; changes match ordering.
  ignoreSafeguardTag: {
    // Current spellings this entry recognizes; legacy aliases fold onto these on read.
    tags: [SAFEGUARD_IGNORE_TAG],
    contribute: (tags: readonly string[] | null | undefined) => hasIgnoreSafeguardTag(tags),
  },
  // Selects the emitted HSF `Ore` gate (rework state); changes the generated rules.
  oreTagGate: {
    // Both rework tags belong to this one gate, so they are registered together.
    tags: [REWORK_ONLY_TAG, REWORK_EXCLUDE_TAG],
    contribute: (tags: readonly string[] | null | undefined) => resolveChaosOreTagValue(tags),
  },
} as const)

/**
 * Fingerprint contributions for every behavior-carrying tag on a recipe.
 *
 * Callers building a rule-generation cache key should spread this in rather than pushing
 * individual tag-derived values, so a newly registered semantic tag cannot be forgotten.
 */
export const describeSemanticTags = (
  tags: readonly string[] | null | undefined,
): Record<string, unknown> => {
  // Evaluate each registered contribution against this recipe's tag list.
  const described: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(SEMANTIC_TAG_CONTRIBUTIONS)) {
    described[key] = entry.contribute(tags)
  }
  return described
}

/**
 * Every tag the app itself gives meaning to, in a stable display order.
 *
 * Derived from the semantic-tag registry's own `tags` vocabulary rather than re-listing
 * tokens, so a newly registered semantic tag shows up in the tag picker automatically.
 * Only the CURRENT spellings appear — legacy aliases still load, but should never be
 * offered for new use.
 */
export const APP_KNOWN_TAGS: readonly string[] = Object.freeze(
  Object.values(SEMANTIC_TAG_CONTRIBUTIONS).flatMap((entry) => [...entry.tags]),
)
// Membership set built once; the picker and isSemanticTag both consult it.
const APP_KNOWN_TAG_TOKEN_SET = new Set<string>(APP_KNOWN_TAGS)

/**
 * True when a tag carries app-driven meaning (as opposed to being a plain user label).
 *
 * Used by the tags picker to flag behavior-carrying tags. Derived from the same registry
 * as APP_KNOWN_TAGS and the cache key, so the three cannot drift apart. Legacy spellings
 * are folded first, so a pre-rename tag is recognized as semantic too.
 */
export const isSemanticTag = (tag: string): boolean => {
  // Normalize to the shared grammar before comparing tokens.
  const normalized = normalizeTagValue(String(tag))
  // Non-conforming tokens can never be app-known.
  if (!normalized) return false
  // Fold legacy aliases so pre-rename spellings count as semantic as well.
  return APP_KNOWN_TAG_TOKEN_SET.has(canonicalizeKnownTagAlias(normalized))
}

/** Vocabulary payload consumed by the tags picker in both builder panels. */
export interface TagVocabulary {
  /** Display order: app-known tags first, then the user's own tags alphabetically. */
  tags: string[]
  /** How many recipes/safeguards carry each tag (0 for unused app-known tags). */
  counts: Record<string, number>
  /** Subset of the tags list that the app itself gives meaning to. */
  appKnown: ReadonlySet<string>
}

/**
 * Build the tag vocabulary offered by the tags picker: every tag already used anywhere in
 * the document (recipes and safeguards alike) plus the app-known tags, so a tag can be
 * reused without remembering its exact spelling.
 *
 * Tags are normalized and de-duped (legacy spellings fold onto their current token), with
 * app-known ones first so they stay discoverable, then the user's own alphabetically.
 * `counts` reports how many entries carry each tag: the picker only needs the list, but the
 * counts let other callers tell "app-known but never used" apart from "in use".
 */
export function buildTagVocabulary(
  tagLists: readonly (readonly string[] | null | undefined)[],
): TagVocabulary {
  // Count occurrences across every supplied list so the picker can show usage.
  const counts: Record<string, number> = Object.create(null) as Record<string, number>
  for (const list of tagLists) {
    // De-dupe within one entry so a repeated tag counts once per recipe/safeguard.
    const unique = new Set<string>()
    for (const rawTag of list ?? []) {
      // Normalize + canonicalize so legacy spellings merge into their current token.
      const normalized = normalizeTagValue(String(rawTag))
      if (!normalized) continue
      unique.add(canonicalizeKnownTagAlias(normalized))
    }
    for (const tag of unique) counts[tag] = (counts[tag] ?? 0) + 1
  }
  // App-known tags lead the list so the meaningful ones are always discoverable.
  const appKnown = APP_KNOWN_TAG_TOKEN_SET
  // The rest are the user's own tags, sorted for predictable scanning.
  const userTags = Object.keys(counts)
    .filter((tag) => !appKnown.has(tag))
    .sort((a, b) => a.localeCompare(b))
  return { tags: [...APP_KNOWN_TAGS, ...userTags], counts, appKnown }
}

/**
 * The rework tag a multi-edit patch must clear when `addedTag` is applied to the whole
 * selection, or null when nothing needs clearing.
 *
 * Multi-edit cannot use `mergeTagsWithReworkExclusivity` (it stages tri-state patches
 * rather than rewriting arrays), so this is the one place that names the multi-edit half
 * of the exclusivity rule — both builder panels call it instead of repeating the branch.
 */
export const reworkTagToClearForMultiEdit = (
  addedTag: string,
  target: 'all' | 'none',
): string | null => (
  // Only ADDING a rework tag evicts its opposite; removals and plain tags clear nothing.
  target === 'all' && isReworkTag(addedTag) ? oppositeReworkTag(addedTag) : null
)

/**
 * Canonical tokens for a stored tag list, matching what `buildTagVocabulary` produces.
 *
 * The picker compares "already applied" against its vocabulary, and the vocabulary holds
 * canonical tokens while a recipe may still store a legacy spelling. Comparing the raw
 * stored strings would offer `if_reworked` to a recipe already carrying
 * `only_for_chaos_ored`, so both sides must be canonicalized through this one helper.
 */
export function canonicalTagTokens(tags: readonly string[] | null | undefined): Set<string> {
  // Collect canonical tokens; malformed entries simply drop out.
  const tokens = new Set<string>()
  for (const rawTag of tags ?? []) {
    // Same normalize + canonicalize pipeline the vocabulary uses.
    const normalized = normalizeTagValue(String(rawTag))
    if (!normalized) continue
    tokens.add(canonicalizeKnownTagAlias(normalized))
  }
  return tokens
}

/**
 * THE definition of "add these tags to that list" for the builder panels.
 *
 * Merges `additions` into `base` (order-preserving, de-duped) and then rebuilds the list
 * left-to-right so each entry evicts its rework opposite — a later rework tag therefore
 * wins over an earlier one, matching "adding one removes the other".
 *
 * Single-edit typing, the tag picker, and paste flows all route through here so they can
 * never disagree about de-duplication or mutual exclusivity.
 */
export function mergeTagsWithReworkExclusivity(
  base: readonly string[],
  additions: readonly string[],
): string[] {
  // Merge first so ordering follows "existing tags, then new ones".
  return mergeTagList(base, additions).reduce<string[]>(
    // Skip exact duplicates, then drop the opposite rework tag before appending.
    (acc, tag) => (acc.includes(tag) ? acc : [...applyReworkTagExclusivity(acc, tag), tag]),
    [],
  )
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
