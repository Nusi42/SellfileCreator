/* eslint import/no-unused-modules: off */
/**
 * safeguard-outline-normalize.test.ts
 *
 * The Safeguards array is an outline: a `bundle` entry CAPS a shared quota across the entries
 * nested beneath it — merging their count-buckets and limiting each merged bucket to the best of
 * their counts — and `depth` records the level. `normalizeSafeguardOutline` is
 * the repair pass that keeps that array describing a POSSIBLE outline no matter where it came
 * from — a hand-edited file, an append import that joins two lists mid-bundle, a paste that
 * landed at the wrong level.
 *
 * Two properties matter enough to pin here:
 *  1. Repair NEVER drops an entry. Malformed depth is pulled to the deepest legal level, and
 *     everything the user wrote survives (CLAUDE.md: never silently discard user data).
 *  2. A list with no bundles is left exactly as it was, so every file written before the
 *     feature existed loads and re-saves byte-identically.
 *
 * The derivation itself lives in Rust (wasm/rule_engine_core/src/safeguards/outline.rs) and has
 * its own #[test]s; this suite covers the TypeScript facade and the write-back.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createFactorySafeguardBuilderDefaults,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  normalizeSafeguardOutline,
  resolveSafeguardOutline,
  safeguardAncestorIndices,
  safeguardBundleParentIndex,
  safeguardBundleDemand,
  safeguardBundleMemberIndices,
  safeguardOutlineHasBundles,
  safeguardPostOrder,
  safeguardSubtreeIndices,
  safeguardSubtreeSpan,
  SAFEGUARD_OUTLINE_NO_PARENT,
} from '../../src/lib/safeguardOutline.js'
import { SAFEGUARD_OUTLINE_MAX_DEPTH } from '../../src/lib/generated/domainConstants.js'
import { normalizeSafeguardRule } from '../../src/lib/safeguards.js'

// A plain rule at a given outline level, named so failures are readable.
const rule = (name: string, depth = 0): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name },
  ...(depth > 0 ? { depth } : {}),
})

// A bundle header at a given outline level.
const bundle = (name: string, depth = 0): SafeguardRule => ({ ...rule(name, depth), bundle: true })

// A divider at a given outline level.
const separator = (name: string, depth = 0): SafeguardRule => ({ ...rule(name, depth), separator: true })

// Reads back the depth every entry ended up with, for compact assertions.
const depthsOf = (rules: readonly SafeguardRule[]): number[] => rules.map((r) => r.depth ?? 0)

test('a bundle-free list is returned unchanged, by identity', () => {
  const rules = [rule('a'), rule('b'), separator('# section'), rule('c')]
  // Identity matters: downstream memos (including the outline resolver's own) key on it, so a
  // no-op repair must not invalidate them.
  assert.equal(normalizeSafeguardOutline(rules), rules)
  assert.equal(safeguardOutlineHasBundles(rules), false)
})

test('members nest under the preceding bundle and report parent/span/membership', () => {
  const rules = normalizeSafeguardOutline([
    bundle('Endgame'), rule('Rings', 1), rule('Amulets', 1), rule('Loose'),
  ])
  assert.deepEqual(depthsOf(rules), [0, 1, 1, 0])
  assert.equal(safeguardBundleParentIndex(rules, 1), 0)
  assert.equal(safeguardBundleParentIndex(rules, 3), SAFEGUARD_OUTLINE_NO_PARENT)
  // The bundle owns itself plus both members; the trailing rule stands alone.
  assert.equal(safeguardSubtreeSpan(rules, 0), 3)
  assert.equal(safeguardSubtreeSpan(rules, 3), 1)
  assert.deepEqual(safeguardSubtreeIndices(rules, 0), [0, 1, 2])
  // The bundle caps both members; each member lists only itself.
  assert.deepEqual(safeguardBundleMemberIndices(rules, 0), [1, 2])
  assert.deepEqual(safeguardBundleMemberIndices(rules, 1), [1])
})

test('evaluation order is post-order, and identical to array order without bundles', () => {
  const flat = [rule('a'), rule('b'), rule('c')]
  // This is the guarantee that every pre-bundle file keeps evaluating bit-identically.
  assert.deepEqual(safeguardPostOrder(flat), [0, 1, 2])
  const nested = normalizeSafeguardOutline([
    bundle('outer'), rule('loose member', 1), bundle('inner', 1), rule('deep', 2),
  ])
  // Members settle before the bundle that caps them, innermost first.
  assert.deepEqual(safeguardPostOrder(nested), [1, 3, 2, 0])
})

test("a bundle's demand is its own count, whatever its members ask for", () => {
  // The header owns the promise; the members' 3 and 2 only size what they hand over.
  const rules = normalizeSafeguardOutline([
    { ...bundle('Endgame'), requiredCount: 4 },
    { ...rule('Rings', 1), requiredCount: 3 },
    { ...rule('Amulets', 1), requiredCount: 2 },
  ])
  assert.equal(safeguardBundleDemand(rules, 0), 4)
  // Members hold no merged-bucket demand themselves — they feed one.
  assert.equal(safeguardBundleDemand(rules, 1), 0)
})

test('a bundle with nothing inside it promises nothing', () => {
  // Nothing feeds an empty header, so its count has nothing to apply to and must not leak
  // onto the sibling that follows it.
  const rules = normalizeSafeguardOutline([{ ...bundle('Endgame'), requiredCount: 5 }, rule('loose')])
  assert.equal(safeguardBundleDemand(rules, 0), 0)
})

test('grouping leaves members completely untouched apart from depth', () => {
  // A member's own count keeps meaning what it always meant — now as the size of its feed.
  // Nothing is rewritten, which is what makes group → ungroup lossless with no bookkeeping.
  const member: SafeguardRule = { ...rule('Rings', 1), requiredCount: 3 }
  const rules = normalizeSafeguardOutline([bundle('Endgame'), member])
  assert.equal((rules[1] as SafeguardRule).requiredCount, 3)
  assert.equal((rules[1] as SafeguardRule).bundle, undefined)
})

test('an impossible depth is repaired to the deepest legal level, never dropped', () => {
  // Nothing precedes this rule that could contain it, so depth 3 is meaningless.
  const rules = normalizeSafeguardOutline([rule('first'), rule('orphan', 3), bundle('b'), rule('child', 9)])
  assert.equal(rules.length, 4, 'repair must not discard entries')
  // The orphan flattens; the post-bundle entry may legally go exactly one level deeper.
  assert.deepEqual(depthsOf(rules), [0, 0, 0, 1])
})

test('a rule cannot adopt children — only a bundle opens a level', () => {
  const rules = normalizeSafeguardOutline([rule('plain'), rule('would-be child', 1)])
  assert.deepEqual(depthsOf(rules), [0, 0])
})

test('nesting is capped at the shared SAFEGUARD_OUTLINE_MAX_DEPTH', () => {
  // A chain of bundles deeper than the cap flattens at the limit rather than growing.
  const chain = Array.from({ length: SAFEGUARD_OUTLINE_MAX_DEPTH + 3 }, (_, level) => bundle(`b${level}`, level))
  const rules = normalizeSafeguardOutline(chain)
  assert.ok(depthsOf(rules).every((d) => d <= SAFEGUARD_OUTLINE_MAX_DEPTH))
})

test('appending two valid lists repairs only the seam', () => {
  // The append-import case: the incoming list starts at depth 1 with nothing above it.
  const existing = normalizeSafeguardOutline([bundle('Endgame'), rule('Rings', 1)])
  const incoming = [rule('Imported', 1), rule('Also imported')]
  const joined = normalizeSafeguardOutline([...existing, ...incoming])
  // The imported entry must NOT be silently swallowed by the existing bundle at full depth —
  // it is legal there (the bundle is still open), which is exactly what the repair decides.
  assert.deepEqual(depthsOf(joined), [0, 1, 1, 0])
  assert.equal(joined.length, 4)
})

test('separators keep their slot and level but are never members of a bundle', () => {
  const rules = normalizeSafeguardOutline([bundle('Endgame'), separator('# Rings', 1), rule('Ring rule', 1)])
  assert.equal((rules[1] as SafeguardRule).separator, true)
  assert.equal((rules[1] as SafeguardRule).depth, 1)
  assert.deepEqual(safeguardBundleMemberIndices(rules, 1), [])
  // The divider is not a member of the bundle either — only real rules are.
  assert.deepEqual(safeguardBundleMemberIndices(rules, 0), [2])
})

test('ancestors resolve outermost-first for the expand-before-scroll path', () => {
  const rules = normalizeSafeguardOutline([bundle('outer'), bundle('inner', 1), rule('deep', 2)])
  // Cross-panel jumps expand this chain before scrolling, so order matters.
  assert.deepEqual(safeguardAncestorIndices(rules, 2), [0, 1])
  assert.deepEqual(safeguardAncestorIndices(rules, 0), [])
})

test('the shipped lategame preset still resolves as a flat, bundle-free outline', () => {
  // Regression guard for the "loader must not be clever" rule: the preset fakes an outline
  // with '#'-prefixed separator labels, and those must stay pure line-style hints. Inferring
  // depth from them would silently turn dividers into quota-bearing bundles.
  const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8')) as {
    Safeguards: unknown[]
  }
  const rules = sfc.Safeguards
    .map((entry) => normalizeSafeguardRule(entry))
    .filter((entry): entry is SafeguardRule => entry !== null)
  assert.ok(rules.length > 0, 'the preset must contain safeguard entries')
  const outline = resolveSafeguardOutline(rules)
  assert.equal(outline.hasBundles, false, 'no preset entry may load as a bundle')
  assert.ok(outline.depths.every((d) => d === 0), "'#' separator labels must not become depth")
  // Post-order over a flat list is array order, so detection is unchanged for this preset.
  assert.deepEqual(outline.postOrder, rules.map((_, index) => index))
})
