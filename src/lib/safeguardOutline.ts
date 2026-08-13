/**
 * safeguardOutline.ts
 *
 * The Safeguards array is an outline, not a flat list: a `bundle` entry OWNS the promise for
 * whatever nests beneath it, and `depth` records the nesting level. A bundle never matches gear
 * itself — its members do, unchanged, and each member's own count sizes the gear it FEEDS the
 * bundle. The bundle then merges those feeds into buckets keyed by its own chips, ranks the pool
 * by the score each piece got from its own member, and keeps its own count out of each bucket.
 *
 * This module is the ONE place the app asks structural questions about that outline. Two rules
 * hold it together:
 *
 *  1. **Derivation lives in Rust.** Parent index, subtree span, member lists, evaluation order
 *     and each bundle's demand all come from `resolve_safeguard_outline`
 *     (wasm/rule_engine_core/src/safeguards/outline.rs) — the same code the detection scan and
 *     the native DLL's SFC reader use. There is deliberately no TypeScript re-implementation.
 *     Precedent: `getSafeguardCountKey`/`getSafeguardItemKey` ("Keep key derivation in wasm so
 *     JS cannot drift from detection semantics") and `should_include_recipe` in
 *     matcher_evaluator.rs. Counter-example to avoid: `safeguardFocusGroupKeyFor`, an unpinned
 *     TS mirror of a Rust key format that has already drifted.
 *  2. **Nothing is re-derived at a call site.** Writing `rule.depth ?? 0` or
 *     `rule.bundle === true` outside this module (and `safeguardEntryKind`) is the same
 *     violation as duplicating a constant — extract or import instead.
 *
 * The structural *edit* helpers at the bottom (group/ungroup/indent/outdent/move) are array
 * splices in service of the UI. Rust never needs them, so they are not mirrored logic; each one
 * simply produces a new array whose depths the authority above then repairs.
 */
import {
  cloneSafeguardRule,
  isSafeguardBundle,
  safeguardEntryKind,
  type SafeguardRule,
} from './safeguards'
import { resolveSafeguardOutlineWithLoadedWasm } from './wasm/wasmRuleEngine'
import type { SafeguardOutlineEntryIn } from './wasm/generated/rust-types/SafeguardOutlineEntryIn'
import type { SafeguardOutlineOut } from './wasm/generated/rust-types/SafeguardOutlineOut'
import { SAFEGUARD_OUTLINE_DEFAULT_DEPTH, SAFEGUARD_OUTLINE_MAX_DEPTH } from './generated/domainConstants'

/** Re-exported so consumers type against the resolver's output without reaching into wasm/. */
export type SafeguardOutline = SafeguardOutlineOut

/** Sentinel `parents[i]` value for an entry that sits at the top level. */
export const SAFEGUARD_OUTLINE_NO_PARENT = -1

/** The stored outline level of one entry, with the absent case resolved once, here. */
export const safeguardEntryDepth = (rule: SafeguardRule): number => (
  rule.depth ?? SAFEGUARD_OUTLINE_DEFAULT_DEPTH
)

// Minimal per-entry projection the Rust resolver consumes. Deliberately tiny: the outline
// needs no filters or substats, so the payload stays ~25 bytes per entry.
const toOutlineEntry = (rule: SafeguardRule): SafeguardOutlineEntryIn => ({
  depth: safeguardEntryDepth(rule),
  bundle: safeguardEntryKind(rule) === 'bundle',
  separator: safeguardEntryKind(rule) === 'separator',
  // A bundle's own count is the number it keeps per merged bucket, so counts cross the
  // boundary and the resolver reads the header's straight off.
  requiredCount: rule.requiredCount,
})

// One-slot memo keyed on the rules array identity. Every mutation path replaces the array
// (the store never mutates in place), so identity is a sound cache key and the resolver runs
// once per change rather than once per consumer per render.
let memoKey: readonly SafeguardRule[] | null = null
let memoValue: SafeguardOutline | null = null

/**
 * Resolves the outline for a safeguard list. Index-aligned with `rules` throughout, so
 * consumers index the result exactly as they index the array.
 */
export const resolveSafeguardOutline = (rules: readonly SafeguardRule[]): SafeguardOutline => {
  // Array identity is stable between mutations, so repeat callers in one render share a result.
  if (memoKey === rules && memoValue !== null) return memoValue
  const resolved = resolveSafeguardOutlineWithLoadedWasm(rules.map(toOutlineEntry))
  memoKey = rules
  memoValue = resolved
  return resolved
}

/** Index of the bundle owning `index`, or `SAFEGUARD_OUTLINE_NO_PARENT` at the top level. */
export const safeguardBundleParentIndex = (rules: readonly SafeguardRule[], index: number): number => (
  resolveSafeguardOutline(rules).parents[index] ?? SAFEGUARD_OUTLINE_NO_PARENT
)

/** How many array slots `index` owns, itself included — 1 for a leaf, N+1 for a bundle. */
export const safeguardSubtreeSpan = (rules: readonly SafeguardRule[], index: number): number => (
  resolveSafeguardOutline(rules).spans[index] ?? 1
)

/** Every index inside `index`'s subtree, the entry itself first (display order). */
export const safeguardSubtreeIndices = (rules: readonly SafeguardRule[], index: number): number[] => {
  const span = safeguardSubtreeSpan(rules, index)
  // Contiguity is what makes this a range rather than a walk — the outline invariant.
  return Array.from({ length: span }, (_, offset) => index + offset)
}

/** The chain of bundles containing `index`, outermost first. Empty at the top level. */
export const safeguardAncestorIndices = (rules: readonly SafeguardRule[], index: number): number[] => {
  const outline = resolveSafeguardOutline(rules)
  const chain: number[] = []
  // Walk up until a top-level entry is reached; the resolver guarantees termination.
  let cursor = outline.parents[index] ?? SAFEGUARD_OUTLINE_NO_PARENT
  while (cursor >= 0) {
    chain.unshift(cursor)
    cursor = outline.parents[cursor] ?? SAFEGUARD_OUTLINE_NO_PARENT
  }
  return chain
}

/**
 * How many pieces a bundle keeps per merged bucket — its own `requiredCount`. 0 for anything
 * that is not a bundle, and for an empty one (nothing feeds it, so it promises nothing).
 *
 * Read from the Rust authority rather than off the rule, so the number the chip shows is
 * literally the number the engine keeps.
 */
export const safeguardBundleDemand = (rules: readonly SafeguardRule[], index: number): number => (
  resolveSafeguardOutline(rules).demands[index] ?? 0
)

/** Member indices feeding a bundle: its plain-rule descendants. A rule lists only itself. */
export const safeguardBundleMemberIndices = (rules: readonly SafeguardRule[], index: number): number[] => (
  resolveSafeguardOutline(rules).pools[index] ?? []
)

/** Evaluation order: everything inside a bundle settles before the bundle itself. */
export const safeguardPostOrder = (rules: readonly SafeguardRule[]): number[] => (
  resolveSafeguardOutline(rules).postOrder
)

/** True when the list contains at least one bundle — the flat-list fast path for consumers. */
export const safeguardOutlineHasBundles = (rules: readonly SafeguardRule[]): boolean => (
  resolveSafeguardOutline(rules).hasBundles
)

/**
 * Repairs the depth sequence and writes it back onto the entries.
 *
 * Called from exactly three places: the mutation funnel (`applySafeguardRulesChange`), the SFC
 * parse path, and the clipboard/append-import path — so no edit, load or paste can leave the
 * array describing an impossible outline (an entry nested under a non-container, a level that
 * opens without a bundle above it, a depth past the cap). Returns the input array unchanged
 * when nothing needed repair, so it is safe to call unconditionally.
 */
export const normalizeSafeguardOutline = (rules: readonly SafeguardRule[]): SafeguardRule[] => {
  // The authority repairs; this function only applies the result.
  const { depths } = resolveSafeguardOutlineWithLoadedWasm(rules.map(toOutlineEntry))
  let changed = false
  const next = rules.map((rule, index) => {
    const repaired = depths[index] ?? SAFEGUARD_OUTLINE_DEFAULT_DEPTH
    if (repaired === safeguardEntryDepth(rule)) return rule
    changed = true
    // Omit the field entirely at top level so untouched files still re-save byte-identically.
    if (repaired === SAFEGUARD_OUTLINE_DEFAULT_DEPTH) {
      const { depth, ...rest } = rule
      void depth
      return rest
    }
    return { ...rule, depth: repaired }
  })
  // Preserve array identity when nothing moved — downstream memos key on it.
  return changed ? next : (rules as SafeguardRule[])
}

// ── Structural edits ────────────────────────────────────────────────────────────────────
// Pure array transforms. Each returns a NEW array and runs the normalizer, so callers never
// have to reason about the invariant themselves. All four move entry points (inline arrows,
// context menu, keyboard, drag & drop) funnel through these rather than splicing directly.

// Applies a depth delta to one entry, clamped to the legal range. Used by the shift helpers.
const withDepth = (rule: SafeguardRule, depth: number): SafeguardRule => {
  const clamped = Math.min(Math.max(depth, SAFEGUARD_OUTLINE_DEFAULT_DEPTH), SAFEGUARD_OUTLINE_MAX_DEPTH)
  // Top level stores no depth at all, keeping the persisted shape minimal.
  if (clamped === SAFEGUARD_OUTLINE_DEFAULT_DEPTH) {
    const { depth: previous, ...rest } = rule
    void previous
    return rest
  }
  return { ...rule, depth: clamped }
}

/**
 * Wraps the selected entries in a new bundle.
 *
 * The selection is gathered (in its existing relative order, subtrees intact) at the position of
 * its topmost member and a bundle header is inserted above it. The header is SEEDED FROM THE
 * FIRST SELECTED MEMBER's scope chips, so the merged buckets start out split the same way that
 * member already split its own — usually what the user means by "these belong together". The
 * members themselves are untouched apart from their depth.
 *
 * Returns the new array plus the index of the created bundle so the caller can select it.
 */
export const groupSafeguardSelection = (
  rules: readonly SafeguardRule[],
  selection: readonly number[],
): { rules: SafeguardRule[]; bundleIndex: number } | null => {
  // Nothing to wrap.
  if (selection.length === 0) return null
  // Expand the selection to whole subtrees: grouping a bundle takes its members along.
  const claimed = new Set<number>()
  for (const index of selection) {
    if (index < 0 || index >= rules.length) continue
    for (const owned of safeguardSubtreeIndices(rules, index)) claimed.add(owned)
  }
  if (claimed.size === 0) return null
  // Preserve the list's own ordering rather than the order the user happened to click in.
  const ordered = Array.from(claimed).sort((a, b) => a - b)
  const insertAt = ordered[0] as number
  // The new header inherits the level of the topmost member so it lands where the block was.
  const baseDepth = safeguardEntryDepth(rules[insertAt] as SafeguardRule)
  // Seed from the first selected entry that can actually carry a quota (skip dividers).
  const seedSource = ordered
    .map((index) => rules[index] as SafeguardRule)
    .find((rule) => safeguardEntryKind(rule) !== 'separator')
    ?? (rules[insertAt] as SafeguardRule)
  // Strip the seed's identity and structural markers: a header starts unnamed (the chip shows
  // a placeholder), is never also a divider, and starts expanded. Omitting rather than
  // assigning `undefined` is required by exactOptionalPropertyTypes.
  const {
    appearance: seedAppearance,
    separator: seedSeparator,
    collapsed: seedCollapsed,
    ...seedRest
  } = cloneSafeguardRule(seedSource)
  void seedAppearance
  void seedSeparator
  void seedCollapsed
  // Start the header at the BEST of the members' counts. Grouping three "keep 5" rules should
  // read as "keep 5 between them" on the first click rather than silently tightening to
  // whichever one happened to be selected first — and the number is plainly editable from
  // there, so this is a starting point, not a derivation.
  const seedCount = ordered
    .map((index) => rules[index] as SafeguardRule)
    .filter((rule) => safeguardEntryKind(rule) === 'rule')
    .reduce((best, rule) => Math.max(best, rule.requiredCount), 1)
  // The header inherits the seed's SCOPE CHIPS, which decide what counts as the same bucket
  // once the members' gear arrives. Everything else it carries is inert.
  const header: SafeguardRule = withDepth(
    { ...seedRest, bundle: true, requiredCount: seedCount },
    baseDepth,
  )
  // Members are otherwise UNTOUCHED — grouping only changes their depth. They keep their own
  // filters, substats, weights, chips and counts; what changes is where their picks go, since
  // a member inside a bundle feeds the header instead of keeping gear itself. That is what
  // makes grouping and ungrouping lossless without any bookkeeping.
  const members = ordered.map((index) => (
    withDepth(cloneSafeguardRule(rules[index] as SafeguardRule), safeguardEntryDepth(rules[index] as SafeguardRule) + 1)
  ))
  // Everything not selected keeps its place, with the block lifted out of the middle.
  const rest = rules.filter((_, index) => !claimed.has(index))
  const before = rest.slice(0, rules.slice(0, insertAt).filter((_, index) => !claimed.has(index)).length)
  const after = rest.slice(before.length)
  return {
    rules: normalizeSafeguardOutline([...before, header, ...members, ...after]),
    bundleIndex: before.length,
  }
}

/**
 * Dissolves a bundle, promoting its members one level.
 *
 * The inverse of grouping: a member's settings were never rewritten when it joined, so removing
 * the header simply sends its picks back to itself instead of into the pool.
 */
export const ungroupSafeguardBundle = (
  rules: readonly SafeguardRule[],
  index: number,
): SafeguardRule[] | null => {
  // Only a bundle header can be dissolved.
  if (!isSafeguardBundle(rules[index] as SafeguardRule)) return null
  const span = safeguardSubtreeSpan(rules, index)
  // Members are promoted a level and are otherwise unchanged — they never stopped carrying
  // their own counts, so removing the cap is all that ungrouping has to do.
  const members = rules.slice(index + 1, index + span).map((rule) => (
    withDepth(cloneSafeguardRule(rule), safeguardEntryDepth(rule) - 1)
  ))
  return normalizeSafeguardOutline([
    ...rules.slice(0, index),
    ...members,
    ...rules.slice(index + span),
  ])
}

/**
 * Shifts one entry (and its subtree) a level in or out.
 *
 * Indent only succeeds when the preceding sibling is a bundle that can adopt the entry; the
 * normalizer would otherwise pull it straight back. Outdent is always legal below top level.
 */
export const shiftSafeguardEntryDepth = (
  rules: readonly SafeguardRule[],
  index: number,
  delta: 1 | -1,
): SafeguardRule[] | null => {
  if (index < 0 || index >= rules.length) return null
  const current = safeguardEntryDepth(rules[index] as SafeguardRule)
  const target = current + delta
  // Nothing above top level to outdent into, nothing beyond the cap to indent into.
  if (target < SAFEGUARD_OUTLINE_DEFAULT_DEPTH || target > SAFEGUARD_OUTLINE_MAX_DEPTH) return null
  // Indenting needs a container immediately above at the entry's current level.
  if (delta === 1) {
    const previous = index > 0 ? (rules[index - 1] as SafeguardRule) : null
    const adoptable = previous !== null
      && isSafeguardBundle(previous)
      && safeguardEntryDepth(previous) === current
    if (!adoptable) return null
  }
  // The whole subtree moves together so relative structure inside it is preserved.
  const span = safeguardSubtreeSpan(rules, index)
  const next = rules.map((rule, cursor) => (
    cursor >= index && cursor < index + span
      ? withDepth(cloneSafeguardRule(rule), safeguardEntryDepth(rule) + delta)
      : rule
  ))
  return normalizeSafeguardOutline(next)
}

/**
 * Outline-aware implementation of the four directional move actions.
 *
 * Supplied to `useItemListManager.resolveDirectionalMove`, so the inline ↑/↓ buttons, the
 * context-menu Move entries and the keyboard shortcuts all relocate a whole subtree instead of
 * swapping single array slots — which would tear a bundle away from its members.
 *
 * Stepping past a bundle boundary moves an entry OUT of that bundle rather than into the middle
 * of it: the block is re-based to the depth of whatever now precedes it, and the normalizer
 * settles the rest. Returns null when the move would change nothing.
 */
export const resolveSafeguardDirectionalMove = (
  rules: readonly SafeguardRule[],
  movingIndices: readonly number[],
  direction: 'up' | 'down' | 'top' | 'bottom',
): SafeguardRule[] | null => {
  // Only the shallowest selected entries actually move; nested ones ride along in their subtree.
  const ordered = movingIndices.filter((index) => index >= 0 && index < rules.length).sort((a, b) => a - b)
  if (ordered.length === 0) return null
  const first = ordered[0] as number
  const last = ordered[ordered.length - 1] as number
  // Where the block lands, in pre-move index space.
  const target = (() => {
    switch (direction) {
      // One slot up means "before the entry that precedes the block" — and because that entry
      // may itself be a whole subtree, stepping over it lands before its root.
      case 'up': return first <= 0 ? null : first - 1
      // One slot down means "after the subtree that follows the block".
      case 'down': {
        const after = last + safeguardSubtreeSpan(rules, last)
        return after >= rules.length ? null : after + safeguardSubtreeSpan(rules, after)
      }
      case 'top': return first === 0 ? null : 0
      case 'bottom': {
        const after = last + safeguardSubtreeSpan(rules, last)
        return after >= rules.length ? null : rules.length
      }
      default: return null
    }
  })()
  if (target === null) return null
  // Moving to either end always lands at top level; otherwise adopt the depth of the neighbour
  // the block comes to rest against, so stepping past a bundle's last member leaves the bundle.
  const targetDepth = direction === 'top' || direction === 'bottom'
    ? SAFEGUARD_OUTLINE_DEFAULT_DEPTH
    : safeguardEntryDepth(rules[Math.max(0, Math.min(target, rules.length - 1))] as SafeguardRule)
  const next = moveSafeguardSubtrees(rules, ordered, target, targetDepth)
  // Identity is preserved by moveSafeguardSubtrees when nothing actually changed.
  return next === rules ? null : next
}

/**
 * Moves a set of subtrees to an insertion point, optionally re-basing them to a target depth.
 *
 * This is the shared implementation behind drag & drop and the four directional move actions:
 * each moving index contributes its whole subtree, the block keeps its internal structure, and
 * the normalizer repairs whatever the drop position makes illegal.
 */
export const moveSafeguardSubtrees = (
  rules: readonly SafeguardRule[],
  movingIndices: readonly number[],
  targetIndex: number,
  targetDepth?: number,
): SafeguardRule[] => {
  // Expand each moving entry to its subtree, deduped so overlapping selections move once.
  const claimed = new Set<number>()
  for (const index of movingIndices) {
    if (index < 0 || index >= rules.length) continue
    for (const owned of safeguardSubtreeIndices(rules, index)) claimed.add(owned)
  }
  if (claimed.size === 0) return rules as SafeguardRule[]
  const ordered = Array.from(claimed).sort((a, b) => a - b)
  // Re-base the block so its shallowest entry lands at the requested depth, keeping the
  // relative shape of everything nested inside it.
  const blockBase = Math.min(...ordered.map((index) => safeguardEntryDepth(rules[index] as SafeguardRule)))
  const shift = targetDepth === undefined ? 0 : targetDepth - blockBase
  const block = ordered.map((index) => {
    const rule = rules[index] as SafeguardRule
    return shift === 0 ? rule : withDepth(cloneSafeguardRule(rule), safeguardEntryDepth(rule) + shift)
  })
  // Count how many claimed entries sit before the drop point so the insertion lands correctly
  // once they are removed.
  const removedBefore = ordered.filter((index) => index < targetIndex).length
  const remaining = rules.filter((_, index) => !claimed.has(index))
  const insertAt = Math.max(0, Math.min(targetIndex - removedBefore, remaining.length))
  return normalizeSafeguardOutline([
    ...remaining.slice(0, insertAt),
    ...block,
    ...remaining.slice(insertAt),
  ])
}
