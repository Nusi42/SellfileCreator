/**
 * recipeFlags.ts
 *
 * The two behaviour-carrying recipe flags and the legacy tag transcode that feeds them.
 *
 * These behaviours used to be encoded as "magic" tags the app searched for inside the
 * user's free-form tag list. They are now explicit fields on BuilderRecipe, so a tag is
 * once again just a label. This module is the single definition of:
 *   - how a flag maps onto the HSF `Ore` property, and
 *   - how a legacy file's tags are transcoded into the flags on load.
 */

import {
  LEGACY_TAGS_IGNORED_BY_SAFEGUARDS,
  LEGACY_TAGS_NOT_REWORKED,
  LEGACY_TAGS_REWORKED,
  ORE_ANY,
  ORE_NOT_ORED,
  ORE_ORED,
  REWORK_GATE_NOT_REWORKED,
  REWORK_GATE_REWORKED,
} from './generated/domainConstants'
import type { BuilderRecipe, ReworkGate } from './hsfBuilder/types'
import { normalizeTagValue } from './tagHelpers'

/**
 * Resolve a recipe's rework gate into the HSF `Ore` sentinel.
 *
 * Mirrors the `MainStatID` convention: ORE_ANY (-1) means "this rule does not care", so a
 * recipe with no gate keeps matching every piece. Setting a gate is the only way to narrow
 * a rule to one rework state. This is the single definition of that mapping; call sites
 * must not compare the gate token to a sentinel themselves.
 */
export const oreSentinelForReworkGate = (gate: ReworkGate | null | undefined): number => {
  // A recipe that has been explicitly gated narrows to exactly one state.
  if (gate === REWORK_GATE_REWORKED) return ORE_ORED
  if (gate === REWORK_GATE_NOT_REWORKED) return ORE_NOT_ORED
  // Anything else (absent, or a token from a newer file we do not know) stays unconstrained,
  // which is the safe direction: a rule that matches more can still be narrowed by its
  // other conditions, whereas guessing a state would silently drop matches.
  return ORE_ANY
}

/** The HSF `Ore` sentinel a recipe's rules should carry. */
export const oreSentinelForRecipe = (recipe: Pick<BuilderRecipe, 'reworkGate'>): number => (
  oreSentinelForReworkGate(recipe.reworkGate)
)

/**
 * DSL field tokens for the two flags, in the overrides grammar.
 *
 * Defined here beside the flags themselves so the grammar list, the parser, the
 * serializer, and the legacy note rewrite below all spell them the same way.
 */
export const DSL_FIELD_IGNORED_BY_SAFEGUARDS = 'ignoredbysafeguards'
export const DSL_FIELD_REWORK_GATE = 'reworkgate'

/** True when this recipe's keeps are excluded from safeguard coverage checks. */
export const isIgnoredBySafeguards = (
  recipe: Pick<BuilderRecipe, 'ignoredBySafeguards'> | null | undefined,
): boolean => recipe?.ignoredBySafeguards === true

/**
 * Coerce an unknown SFC value into a rework gate.
 *
 * Loaded files are untrusted JSON: an unrecognized token (a hand edit, or a gate added by a
 * future build) resolves to "no gate" rather than throwing, matching how the rest of the
 * loader degrades. Returns undefined so the caller can omit the field entirely.
 */
export const normalizeReworkGate = (value: unknown): ReworkGate | undefined => {
  // Compare against the wire tokens; anything else is not a gate we understand.
  if (value === REWORK_GATE_REWORKED) return REWORK_GATE_REWORKED
  if (value === REWORK_GATE_NOT_REWORKED) return REWORK_GATE_NOT_REWORKED
  return undefined
}

// ---------------------------------------------------------------------------
// Legacy tag transcode
//
// Everything below exists only to keep files written before the flags existed working.
// It is read-only: no writer ever emits these tags again. Delete this section, the
// LEGACY_TAGS_* constants, and their spec block together once the app reaches
// LEGACY_RECIPE_TAG_TRANSCODE_REMOVE_AT.
// ---------------------------------------------------------------------------

// Build the lookup sets once, normalized through the same grammar the tag list uses, so a
// loose spelling in an old file is recognized exactly as the tag picker would have matched it.
const toTokenSet = (tags: readonly string[]): ReadonlySet<string> => new Set(
  tags
    .map((tag) => normalizeTagValue(tag))
    .filter((tag): tag is string => Boolean(tag)),
)
const IGNORED_BY_SAFEGUARDS_TOKENS = toTokenSet(LEGACY_TAGS_IGNORED_BY_SAFEGUARDS)
const REWORKED_TOKENS = toTokenSet(LEGACY_TAGS_REWORKED)
const NOT_REWORKED_TOKENS = toTokenSet(LEGACY_TAGS_NOT_REWORKED)

/**
 * What a single legacy behaviour tag encoded, for callers that classify one token at a time.
 *
 * `transcodeLegacyRecipeTags` below walks a whole tag ARRAY; the overrides DSL parser instead
 * sees one `tag=<value>` selector and needs to know which flag it folds onto. Both read the
 * same token sets, so a legacy spelling can never be recognized in a file but not in a note.
 */
export type LegacyRecipeFlag =
  | { kind: 'ignoredBySafeguards' }
  | { kind: 'reworkGate'; gate: ReworkGate }

/**
 * Classify one tag token as a legacy behaviour flag, or null when it is a plain label.
 *
 * Takes the RAW token and normalizes it here, so callers cannot forget the grammar step that
 * makes a loose old spelling match the way the tag picker would have matched it.
 */
export const legacyRecipeFlagForTagToken = (rawTag: string): LegacyRecipeFlag | null => {
  // A token that fails the tag grammar was never a behaviour tag.
  const normalized = normalizeTagValue(rawTag)
  if (!normalized) return null
  if (IGNORED_BY_SAFEGUARDS_TOKENS.has(normalized)) return { kind: 'ignoredBySafeguards' }
  if (REWORKED_TOKENS.has(normalized)) return { kind: 'reworkGate', gate: REWORK_GATE_REWORKED }
  if (NOT_REWORKED_TOKENS.has(normalized)) return { kind: 'reworkGate', gate: REWORK_GATE_NOT_REWORKED }
  return null
}

/** Flags recovered from a legacy tag list, plus the tags that remain as plain labels. */
export interface TranscodedRecipeTags {
  /** The tag list with every behaviour-carrying token removed. */
  tags: string[]
  /** Present only when a legacy tag asked for it, so callers can omit the field otherwise. */
  ignoredBySafeguards?: true
  /** Present only when a legacy tag selected a gate. */
  reworkGate?: ReworkGate
}

/**
 * Split a legacy tag list into the flags it was encoding plus the labels that survive.
 *
 * Runs unconditionally on load rather than behind a version check: hand-written and
 * third-party `.sfc` files carry arbitrary (or missing) `Version` strings, so gating on the
 * version would silently drop the semantics of a file that simply failed to declare itself.
 * The removal constant governs when we delete this code, not when it stops firing.
 *
 * A file carrying both rework spellings is contradictory. `reworked` wins, preserving the
 * precedence the tag-era resolver documented, so such a file keeps loading the same way.
 */
export const transcodeLegacyRecipeTags = (
  rawTags: readonly string[] | null | undefined,
): TranscodedRecipeTags => {
  // Nothing to transcode; hand back an empty list so callers need no null branch.
  if (!Array.isArray(rawTags) || rawTags.length === 0) return { tags: [] }
  // Surviving labels, in their original order.
  const tags: string[] = []
  // Track each rework side separately so the contradictory case can be resolved below.
  let wantsReworked = false
  let wantsNotReworked = false
  let ignoredBySafeguards = false
  for (const rawTag of rawTags) {
    // Normalize to the shared grammar before matching, then classify.
    const normalized = normalizeTagValue(String(rawTag))
    // A token that fails the grammar was never a behaviour tag; keep it as-is so we do
    // not quietly discard something the user typed.
    if (!normalized) {
      tags.push(String(rawTag))
      continue
    }
    if (IGNORED_BY_SAFEGUARDS_TOKENS.has(normalized)) { ignoredBySafeguards = true; continue }
    if (REWORKED_TOKENS.has(normalized)) { wantsReworked = true; continue }
    if (NOT_REWORKED_TOKENS.has(normalized)) { wantsNotReworked = true; continue }
    // An ordinary label survives the transcode untouched.
    tags.push(normalized)
  }
  return {
    tags,
    // Omit rather than write false, so an untouched recipe stays byte-identical on save.
    ...(ignoredBySafeguards ? { ignoredBySafeguards: true as const } : {}),
    ...(wantsReworked
      ? { reworkGate: REWORK_GATE_REWORKED }
      : wantsNotReworked ? { reworkGate: REWORK_GATE_NOT_REWORKED } : {}),
  }
}

/**
 * Rewrite legacy behaviour-tag selectors inside a note's overrides DSL.
 *
 * The tags themselves are transcoded out of the recipe arrays on load, so a note still
 * saying `@tag=ignore_by_safeguards { … }` would select nothing. This rewrites those
 * selectors onto the equivalent flag comparison so shipped presets and user notes keep
 * working. Part of the same legacy window as the tag transcode above — delete both together.
 *
 * Deliberately narrow: only the single-value `tag=X` / `tag:X` form is rewritten, because
 * that is the only form we have ever shipped in a note. The `tag in [a,b]` list form is
 * left untouched — a flag comparison cannot express set membership, and a blind textual
 * substitution there would produce invalid DSL rather than a working selector.
 */
export const transcodeLegacyNoteTagSelectors = (note: string): string => (
  // One pass per family, each mapping the tag selector onto its flag equivalent.
  LEGACY_NOTE_SELECTOR_REWRITES.reduce(
    (text, { pattern, replacement }) => text.replace(pattern, replacement),
    note,
  )
)

// Build the rewrite table once. Each entry matches `tag` + `=` or `:` + one legacy
// spelling, tolerating the whitespace the tokenizer allows around the operator.
const legacySelectorRewrite = (tags: readonly string[], replacement: string) => ({
  // Alternation over every shipped spelling of this family, word-bounded so a longer
  // user tag that merely starts with one of them is never touched.
  pattern: new RegExp(String.raw`\btag\s*[=:]\s*(?:${tags.join('|')})\b`, 'gi'),
  replacement,
})
const LEGACY_NOTE_SELECTOR_REWRITES = [
  legacySelectorRewrite(LEGACY_TAGS_IGNORED_BY_SAFEGUARDS, `${DSL_FIELD_IGNORED_BY_SAFEGUARDS}=on`),
  legacySelectorRewrite(LEGACY_TAGS_REWORKED, `${DSL_FIELD_REWORK_GATE}=${REWORK_GATE_REWORKED}`),
  legacySelectorRewrite(LEGACY_TAGS_NOT_REWORKED, `${DSL_FIELD_REWORK_GATE}=${REWORK_GATE_NOT_REWORKED}`),
]

// ---------------------------------------------------------------------------
// Reading the `Ore` property back off generated/loaded HSF rules.
//
// These sit here rather than beside the tag helpers because they are about the rule
// property, not about tags — the rules table reads them straight off a loaded file.
// ---------------------------------------------------------------------------

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
