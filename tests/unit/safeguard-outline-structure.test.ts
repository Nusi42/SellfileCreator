/* eslint import/no-unused-modules: off */
/**
 * safeguard-outline-structure.test.ts
 *
 * The structural edits behind the bundle UI: group, ungroup, indent/outdent, and the subtree
 * moves shared by the inline arrows, the context menu, the keyboard and drag & drop.
 *
 * The property worth protecting above all others is that **group → ungroup is lossless**.
 * Grouping changes nothing about a member except its depth — a bundle only caps how many of its
 * members' picks survive, so there is nothing to restore on ungroup. That is what lets a user try
 * a bundle and back out without silently losing the numbers they tuned.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFactorySafeguardBuilderDefaults,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  groupSafeguardSelection,
  moveSafeguardSubtrees,
  resolveSafeguardDirectionalMove,
  shiftSafeguardEntryDepth,
  ungroupSafeguardBundle,
} from '../../src/lib/safeguardOutline.js'

// Named rule at a level, with a distinguishable quota so losslessness is observable.
const rule = (name: string, requiredCount: number, depth = 0): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name },
  requiredCount,
  ...(depth > 0 ? { depth } : {}),
})

const bundle = (name: string, requiredCount: number, depth = 0): SafeguardRule => ({
  ...rule(name, requiredCount, depth),
  bundle: true,
})

// Compact view of a list for readable assertions: name, level, container flag.
const shapeOf = (rules: readonly SafeguardRule[]): Array<[string, number, boolean]> =>
  rules.map((r) => [r.appearance?.name ?? '', r.depth ?? 0, r.bundle === true])

test('grouping wraps the selection and seeds the header from the first member', () => {
  const rules = [rule('a', 3), rule('b', 4), rule('c', 5)]
  const grouped = groupSafeguardSelection(rules, [0, 1])
  assert.ok(grouped)
  assert.equal(grouped!.bundleIndex, 0)
  assert.deepEqual(shapeOf(grouped!.rules), [
    ['', 0, true],      // the new header, unnamed until the user names it
    ['a', 1, false],
    ['b', 1, false],
    ['c', 0, false],
  ])
  // "These rules now share the quota they each had" — the header starts at the BEST of the
  // selected members' counts, and is plainly editable from there.
  assert.equal(grouped!.rules[0]?.requiredCount, 4)
})

test('grouping is lossless: members are untouched apart from their depth', () => {
  const rules = [rule('a', 3), rule('b', 4)]
  const grouped = groupSafeguardSelection(rules, [0, 1])!
  // Numbers survive verbatim, and nothing else about a member is rewritten — what changes is
  // only where their picks go, and that is derived from depth alone.
  assert.deepEqual(grouped.rules.slice(1).map((r) => r.requiredCount), [3, 4])
  assert.deepEqual(grouped.rules.slice(1).map((r) => r.bundle), [undefined, undefined])
})

test('ungrouping restores every member exactly, so the round trip is a no-op', () => {
  const original = [rule('a', 3), rule('b', 4), rule('c', 5)]
  const grouped = groupSafeguardSelection(original, [0, 1])!
  const restored = ungroupSafeguardBundle(grouped.rules, grouped.bundleIndex)
  assert.ok(restored)
  assert.deepEqual(shapeOf(restored!), shapeOf(original))
  assert.deepEqual(restored!.map((r) => r.requiredCount), original.map((r) => r.requiredCount))
})

test('grouping a bundle takes its members along', () => {
  const rules = [bundle('inner', 2), rule('m', 1, 1), rule('loose', 9)]
  const grouped = groupSafeguardSelection(rules, [0])!
  assert.deepEqual(shapeOf(grouped.rules), [
    ['', 0, true],       // new outer header
    ['inner', 1, true],
    ['m', 2, false],     // the inner bundle's member followed it down a level
    ['loose', 0, false],
  ])
})

test('ungrouping a bundle leaves the promoted member exactly as it was', () => {
  const rules = [bundle('B', 5), rule('m', 2, 1)]
  const restored = ungroupSafeguardBundle(rules, 0)!
  assert.equal(restored.length, 1)
  assert.equal(restored[0]?.requiredCount, 2, 'its own count never changed')
  assert.equal(restored[0]?.depth, undefined, 'and it is back at the top level')
})

test('indent only succeeds under a bundle, and takes the subtree with it', () => {
  // Nothing above but a plain rule → the outline cannot nest, so the action declines.
  assert.equal(shiftSafeguardEntryDepth([rule('a', 1), rule('b', 1)], 1, 1), null)
  // A bundle above adopts the entry and everything it owns.
  const rules = [bundle('B', 1), bundle('C', 1), rule('m', 1, 1)]
  const indented = shiftSafeguardEntryDepth(rules, 1, 1)
  assert.ok(indented)
  assert.deepEqual(shapeOf(indented!), [['B', 0, true], ['C', 1, true], ['m', 2, false]])
})

test('outdent lifts an entry out of its bundle and declines at top level', () => {
  const rules = [bundle('B', 1), rule('m', 1, 1)]
  const lifted = shiftSafeguardEntryDepth(rules, 1, -1)
  assert.ok(lifted)
  assert.deepEqual(shapeOf(lifted!), [['B', 0, true], ['m', 0, false]])
  // Already at top level: nothing to lift into.
  assert.equal(shiftSafeguardEntryDepth(lifted!, 0, -1), null)
})

test('moving a bundle relocates its whole subtree as one block', () => {
  const rules = [rule('first', 1), bundle('B', 2), rule('m1', 1, 1), rule('m2', 1, 1)]
  const moved = resolveSafeguardDirectionalMove(rules, [1], 'up')
  assert.ok(moved)
  assert.deepEqual(shapeOf(moved!), [
    ['B', 0, true], ['m1', 1, false], ['m2', 1, false], ['first', 0, false],
  ])
})

test('stepping a member past its bundle boundary moves it out rather than into limbo', () => {
  // 'm' is the last member of B; moving it down must leave the bundle, not vanish inside it.
  const rules = [bundle('B', 2), rule('m', 1, 1), rule('after', 1)]
  const moved = resolveSafeguardDirectionalMove(rules, [1], 'down')
  assert.ok(moved)
  assert.deepEqual(shapeOf(moved!), [['B', 0, true], ['after', 0, false], ['m', 0, false]])
})

test('a move that cannot go anywhere reports no change', () => {
  const rules = [rule('a', 1), rule('b', 1)]
  assert.equal(resolveSafeguardDirectionalMove(rules, [0], 'up'), null)
  assert.equal(resolveSafeguardDirectionalMove(rules, [1], 'down'), null)
  assert.equal(resolveSafeguardDirectionalMove(rules, [0], 'top'), null)
})

test('a drop re-bases the block to the requested level', () => {
  // The drag-and-drop path: horizontal pointer position asked for level 1.
  const rules = [bundle('B', 2), rule('m', 1, 1), rule('outsider', 3)]
  const dropped = moveSafeguardSubtrees(rules, [2], 2, 1)
  assert.deepEqual(shapeOf(dropped), [['B', 0, true], ['m', 1, false], ['outsider', 1, false]])
  // The quota it carried is untouched by the move.
  assert.equal(dropped[2]?.requiredCount, 3)
})

test('an illegal drop level is repaired rather than honoured', () => {
  // Asking for level 2 under a plain rule is impossible; the normalizer pulls it back.
  const rules = [rule('a', 1), rule('b', 2)]
  const dropped = moveSafeguardSubtrees(rules, [1], 1, 2)
  assert.deepEqual(shapeOf(dropped), [['a', 0, false], ['b', 0, false]])
})
