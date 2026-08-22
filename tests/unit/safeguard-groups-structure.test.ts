/* eslint import/no-unused-modules: off */
/**
 * safeguard-groups-structure.test.ts
 *
 * The structural edits behind the safeguard group UI: group / ungroup / leave / join, the four
 * directional moves, drop membership, and the re-id of copied groups. Every entry point (context
 * menu, arrows, keyboard, drag & drop, Ctrl-copy, paste) funnels through these helpers, so the
 * one rule they share is pinned here: **a position move never changes membership; only
 * join/leave/drop-into-bracket do** — and a run always travels as one block.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  type SafeguardGroupSettings,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  groupSafeguardSelection,
  joinSafeguardAdjacentGroup,
  moveSafeguardEntriesForDrop,
  normalizeSafeguardGroups,
  remapSafeguardGroupIds,
  removeSafeguardFromGroup,
  resolveSafeguardDirectionalMove,
  resolveSafeguardDropMembership,
  safeguardGroupRunRange,
  ungroupSafeguardRun,
  withStoredSafeguardMembership,
} from '../../src/lib/safeguardGroups.js'

const settings = (id: string, requiredCount = 2): SafeguardGroupSettings => ({
  id,
  requiredCount,
  countMode: { perRule: true, perSet: false, perFaction: false, perMainStat: false, perSlot: false },
})
const rule = (name: string, requiredCount = 1): SafeguardRule => ({ ...createFactorySafeguardBuilderDefaults(), appearance: { name }, requiredCount })
const member = (name: string, group: SafeguardGroupSettings): SafeguardRule => ({ ...rule(name), group })
const names = (rules: readonly SafeguardRule[]): string[] => rules.map((r) => r.appearance?.name ?? '?')
const ids = (rules: readonly SafeguardRule[]): Array<string | null> => rules.map((r) => r.group?.id ?? null)

// a, [b, c, d], e — the fixture most tests start from.
const G = settings('g', 3)
const base = (): SafeguardRule[] => normalizeSafeguardGroups([rule('a'), member('b', G), member('c', G), member('d', G), rule('e')])

test('grouping gathers the selection at its first slot with a NEUTRAL seed', () => {
  const rules = [rule('a', 2), rule('b'), rule('c', 3), rule('d')]
  const grouped = groupSafeguardSelection(rules, [2, 0])
  assert.ok(grouped)
  // Moved together to the topmost member's slot, list order preserved.
  assert.deepEqual(names(grouped!.rules), ['a', 'c', 'b', 'd'])
  assert.deepEqual(grouped!.groupIndices, [0, 1])
  const g = grouped!.rules[0]?.group
  assert.ok(g)
  assert.equal(grouped!.rules[1]?.group?.id, g!.id)
  // Minimum of the members' counts: the tightest promise any member already made.
  assert.equal(g!.requiredCount, 2)
  // Members keep their own counts.
  assert.equal(grouped!.rules[0]?.requiredCount, 2)
  assert.equal(grouped!.rules[1]?.requiredCount, 3)
})

test('grouping needs two rules and never takes a separator', () => {
  assert.equal(groupSafeguardSelection([rule('a'), rule('b')], [0]), null)
  const withDivider = [rule('a'), { ...rule('#'), separator: true }, rule('b')]
  const grouped = groupSafeguardSelection(withDivider, [0, 1, 2])
  assert.ok(grouped)
  assert.deepEqual(ids(grouped!.rules).map((id) => id !== null), [true, true, false])
})

test('ungrouping dissolves the whole run; members keep the counts they never stopped carrying', () => {
  const next = ungroupSafeguardRun(base(), 2)
  assert.ok(next)
  assert.deepEqual(ids(next!), [null, null, null, null, null])
  assert.deepEqual(names(next!), ['a', 'b', 'c', 'd', 'e'])
})

test('leaving removes one member; a run left with one member is dissolved', () => {
  const rules = base()
  // Removing the middle member splits [b, c, d] into [b] and [d] — two runs of one, which the
  // normalizer (run by the helper) dissolves. Nothing is dropped.
  const next = removeSafeguardFromGroup(rules, 2)
  assert.ok(next)
  assert.deepEqual(names(next!), ['a', 'b', 'c', 'd', 'e'])
  assert.deepEqual(ids(next!), [null, null, null, null, null])
  // Removing an END member leaves a run of two, which survives.
  const edge = removeSafeguardFromGroup(rules, 3)
  assert.deepEqual(ids(edge!), [null, 'g', 'g', null, null])
})

test('joining adopts the neighbouring run and its settings', () => {
  const rules = base()
  const joined = joinSafeguardAdjacentGroup(rules, 0, 'below')
  assert.ok(joined)
  assert.deepEqual(safeguardGroupRunRange(joined!, 0), { start: 0, end: 4 })
  assert.equal(joined![0]?.group?.requiredCount, 3)
  // No run above `a`, and `c` already belongs to the run below it.
  assert.equal(joinSafeguardAdjacentGroup(rules, 0, 'above'), null)
  assert.equal(joinSafeguardAdjacentGroup(rules, 2, 'below'), null)
})

test('an ungrouped entry hops over a whole run and never lands inside it', () => {
  const rules = base()
  const down = resolveSafeguardDirectionalMove(rules, [0], 'down')
  assert.ok(down)
  assert.deepEqual(names(down!), ['b', 'c', 'd', 'a', 'e'])
  assert.deepEqual(ids(down!), ['g', 'g', 'g', null, null])
  const up = resolveSafeguardDirectionalMove(rules, [4], 'up')
  assert.ok(up)
  assert.deepEqual(names(up!), ['a', 'e', 'b', 'c', 'd'])
})

test('a member moves within its run and stops at the edge — leaving is explicit', () => {
  const rules = base()
  const up = resolveSafeguardDirectionalMove(rules, [2], 'up')
  assert.ok(up)
  assert.deepEqual(names(up!), ['a', 'c', 'b', 'd', 'e'])
  assert.deepEqual(ids(up!), [null, 'g', 'g', 'g', null])
  // At the run's top edge the move is a no-op rather than an exit.
  assert.equal(resolveSafeguardDirectionalMove(rules, [1], 'up'), null)
  assert.equal(resolveSafeguardDirectionalMove(rules, [3], 'down'), null)
  // 'top' / 'bottom' go to the run's own ends.
  const top = resolveSafeguardDirectionalMove(rules, [3], 'top')
  assert.deepEqual(names(top!), ['a', 'd', 'b', 'c', 'e'])
})

test('a fully selected run moves as one block', () => {
  const rules = base()
  const up = resolveSafeguardDirectionalMove(rules, [1, 2, 3], 'up')
  assert.ok(up)
  assert.deepEqual(names(up!), ['b', 'c', 'd', 'a', 'e'])
  assert.deepEqual(ids(up!), ['g', 'g', 'g', null, null])
  const bottom = resolveSafeguardDirectionalMove(rules, [1, 2, 3], 'bottom')
  assert.deepEqual(names(bottom!), ['a', 'e', 'b', 'c', 'd'])
})

test('a mixed selection widens partial runs so no run tears', () => {
  const rules = base()
  // b (member) + e (outsider) moving up: the whole run comes along, a is hopped.
  const up = resolveSafeguardDirectionalMove(rules, [1, 4], 'up')
  assert.ok(up)
  assert.deepEqual(names(up!), ['b', 'c', 'd', 'e', 'a'])
  assert.deepEqual(ids(up!), ['g', 'g', 'g', null, null])
})

test('drop membership: forced inside a run, optional at its edges, none elsewhere', () => {
  const rules = base()
  assert.equal(resolveSafeguardDropMembership(rules, 2).kind, 'forced')
  assert.equal(resolveSafeguardDropMembership(rules, 1).kind, 'optional')
  assert.equal(resolveSafeguardDropMembership(rules, 4).kind, 'optional')
  assert.equal(resolveSafeguardDropMembership(rules, 0).kind, 'none')
  assert.equal(resolveSafeguardDropMembership(rules, 5).kind, 'none')
  assert.equal(resolveSafeguardDropMembership(rules, 2).settings?.id, 'g')
})

test('a flush drop leaves the run; a joining drop adopts it — for moves and copies alike', () => {
  const rules = base()
  // Drag `c` out to the end, flush: it leaves the group.
  const out = moveSafeguardEntriesForDrop(rules, [2], 5, null, 'move')
  assert.ok(out)
  assert.deepEqual(names(out!.next), ['a', 'b', 'd', 'e', 'c'])
  assert.deepEqual(ids(out!.next), [null, 'g', 'g', null, null])
  assert.deepEqual(out!.newIndices, [4])
  // Drag `e` into the run (drop between b and c) joining: it adopts the settings.
  const membership = resolveSafeguardDropMembership(rules, 2)
  const joined = moveSafeguardEntriesForDrop(rules, [4], 2, membership.settings, 'move')
  assert.ok(joined)
  assert.deepEqual(names(joined!.next), ['a', 'b', 'e', 'c', 'd'])
  assert.deepEqual(ids(joined!.next), [null, 'g', 'g', 'g', 'g'])
  assert.equal(joined!.next[2]?.group?.requiredCount, 3)
  // Ctrl-copy `a` into the run: the copy joins, the source stays where it was.
  const copied = moveSafeguardEntriesForDrop(rules, [0], 2, membership.settings, 'copy')
  assert.ok(copied)
  assert.deepEqual(names(copied!.next), ['a', 'b', 'a', 'c', 'd', 'e'])
  assert.deepEqual(ids(copied!.next), [null, 'g', 'g', 'g', 'g', null])
})

test('dragging a whole run flush elsewhere keeps it intact; a partial run leaves', () => {
  const rules = base()
  const moved = moveSafeguardEntriesForDrop(rules, [1, 2, 3], 5, null, 'move')
  assert.ok(moved)
  assert.deepEqual(names(moved!.next), ['a', 'e', 'b', 'c', 'd'])
  // The run was not torn from anything, so it travels as the same group.
  assert.deepEqual(ids(moved!.next), [null, null, 'g', 'g', 'g'])
  // Two of three dragged flush: they leave, and the one left behind dissolves.
  const partial = moveSafeguardEntriesForDrop(rules, [1, 2], 5, null, 'move')
  assert.ok(partial)
  assert.deepEqual(names(partial!.next), ['a', 'd', 'e', 'b', 'c'])
  assert.deepEqual(ids(partial!.next), [null, null, null, null, null])
  // Ctrl-copy of a whole run flush: a second group under a fresh id, the source untouched.
  const copied = moveSafeguardEntriesForDrop(rules, [1, 2, 3], 5, null, 'copy')
  assert.ok(copied)
  assert.deepEqual(names(copied!.next), ['a', 'b', 'c', 'd', 'e', 'b', 'c', 'd'])
  const copyId = copied!.next[5]?.group?.id
  assert.ok(copyId && copyId !== 'g')
  assert.deepEqual(ids(copied!.next), [null, 'g', 'g', 'g', null, copyId, copyId, copyId])
})

test('re-id: a fully copied run becomes a new group; a partial copy stays a member', () => {
  const rules = base()
  const full = remapSafeguardGroupIds(rules, [1, 2, 3], [rules[1]!, rules[2]!, rules[3]!])
  const newId = full[0]?.group?.id
  assert.ok(newId && newId !== 'g')
  assert.ok(full.every((r) => r.group?.id === newId), 'the copies stay together under one fresh id')
  const partial = remapSafeguardGroupIds(rules, [2], [rules[2]!])
  assert.equal(partial[0]?.group?.id, 'g', 'a single copied member keeps its membership')
  // A clipboard paste (no source indices) treats every carried id as a full run.
  const pasted = remapSafeguardGroupIds(rules, null, [rules[1]!, rules[2]!])
  assert.notEqual(pasted[0]?.group?.id, 'g')
  assert.equal(pasted[0]?.group?.id, pasted[1]?.group?.id)
})

test('builder write-back keeps the STORED membership, not the draft snapshot', () => {
  const rules = base()
  // The builder loads member 'c' — the draft snapshots its group along with everything else.
  const draft: SafeguardRule = { ...rules[2]! }
  // The user then removes 'c' from the group through the chip menu, while that draft stays open.
  const afterLeave = removeSafeguardFromGroup(rules, 2)!
  assert.equal(afterLeave[2]?.group, undefined, 'the chip edit dropped the membership')
  // Pressing Apply writes the (now stale) draft back. Membership must NOT come back with it.
  const edited: SafeguardRule = { ...draft, requiredCount: 7 }
  const applied = afterLeave.map((r, i) => (i === 2 ? withStoredSafeguardMembership(edited, r) : r))
  assert.equal(applied[2]?.group, undefined, 'apply must not resurrect the group the user left')
  assert.equal(applied[2]?.requiredCount, 7, 'the edited fields still land')
  // The mirror case: a membership JOINED while the draft was open survives the write-back too.
  // 'e' (index 4) sits right below the run, and its draft snapshot carries no group at all.
  const ungroupedDraft: SafeguardRule = { ...rules[4]! }
  assert.equal(ungroupedDraft.group, undefined, 'the draft was snapshotted while still ungrouped')
  const joined = joinSafeguardAdjacentGroup(rules, 4, 'above')!
  assert.equal(joined[4]?.group?.id, 'g', 'the chip edit added the membership')
  const rejoined = joined.map((r, i) => (i === 4 ? withStoredSafeguardMembership({ ...ungroupedDraft, requiredCount: 9 }, r) : r))
  assert.equal(rejoined[4]?.group?.id, 'g', 'apply must not strip a group just joined')
  assert.equal(rejoined[4]?.requiredCount, 9, 'the edited fields still land')
})

test('a membership-only difference does not read as a pending builder edit', () => {
  const rules = base()
  // The builder loaded member 'c'; the user then removed it from the group via the chip menu.
  const draft: SafeguardRule = { ...rules[2]! }
  const stored = removeSafeguardFromGroup(rules, 2)![2]!
  // The dirty check compares what Apply would WRITE, so it rebases membership first. Comparing the
  // raw draft instead would report a pending change that Apply deliberately never writes — an
  // Apply button that lights up and then does nothing.
  const snapshotOf = (rule: SafeguardRule): string => JSON.stringify(createSafeguardRuleContentSnapshot(rule))
  assert.notEqual(snapshotOf(draft), snapshotOf(stored), 'the raw draft still carries the stale group')
  assert.equal(
    snapshotOf(withStoredSafeguardMembership(draft, stored)),
    snapshotOf(stored),
    'rebased onto the stored membership there is nothing left to apply',
  )
  // A REAL edit alongside the stale membership is still reported as dirty.
  const edited = withStoredSafeguardMembership({ ...draft, requiredCount: 7 }, stored)
  assert.notEqual(snapshotOf(edited), snapshotOf(stored), 'a genuine field change still counts')
})

test('the rebase keeps stored MEMBERSHIP but lets the group strip\'s SETTINGS through', () => {
  const rules = base()
  // The group strip edits requiredCount/countMode on the draft; those must still commit.
  const draft: SafeguardRule = { ...rules[2]!, group: { ...G, requiredCount: 9 } }
  const rebased = withStoredSafeguardMembership(draft, rules[2]!)
  assert.equal(rebased.group?.id, 'g', 'membership comes from the store')
  assert.equal(rebased.group?.requiredCount, 9, 'the strip edit survives the rebase')
  // A draft naming a DIFFERENT group cannot move the rule: the stored id wins, settings still ride.
  const moved = withStoredSafeguardMembership({ ...rules[2]!, group: settings('other', 5) }, rules[2]!)
  assert.equal(moved.group?.id, 'g', 'the draft cannot re-point membership at another group')
  assert.equal(moved.group?.requiredCount, 5)
  // A draft snapshotted while ungrouped, applied to a rule that has since JOINED, keeps the
  // store's settings rather than inventing any.
  const joined = joinSafeguardAdjacentGroup(rules, 4, 'above')!
  const late = withStoredSafeguardMembership({ ...rules[4]! }, joined[4]!)
  assert.equal(late.group?.id, 'g')
  assert.equal(late.group?.requiredCount, joined[4]?.group?.requiredCount)
})
