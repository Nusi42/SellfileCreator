/**
 * safeguard-overrides-groups.test.ts
 *
 * The safeguard-overrides DSL's group surface:
 *   - the `group.*` assignment family, which retunes the GROUP a matched rule belongs to
 *     (its own required count + bucket-scope chips) rather than the rule's own count/scope;
 *   - the `grouped` / `ungrouped` selector heads, which match on group MEMBERSHIP the way
 *     `tagged` / `untagged` match on tags.
 *
 * The behaviour that needs pinning hardest is the HEAD-WINS FAN-OUT: a group's settings must be
 * identical on every member (the normalizer enforces it and the engine reads the run's head), so
 * an override matching only SOME members writes the whole run instead of splitting it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides'
import {
  createFactorySafeguardBuilderDefaults,
  SAFEGUARD_DEFAULT_COUNT_MODE,
  type SafeguardRule,
} from '../../src/lib/safeguards'
import { safeguardListHasGroups } from '../../src/lib/safeguardGroups'
import { loadLategameNote, loadLategameSafeguardRules } from '../setup/presetFixtures.js'

// A run of two grouped members (same id, adjacent) plus one ungrouped bystander after them.
// Only `first` carries the `boots` tag, so selectors can address a NON-head member too.
const GROUP_ID = 'g_test'
const makeRules = (): SafeguardRule[] => {
  const first = createFactorySafeguardBuilderDefaults()
  first.tags = ['head']
  first.requiredCount = 3
  first.group = { id: GROUP_ID, requiredCount: 5, countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE } }
  const second = createFactorySafeguardBuilderDefaults()
  second.tags = ['boots']
  second.requiredCount = 2
  second.group = { id: GROUP_ID, requiredCount: 5, countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE } }
  const loner = createFactorySafeguardBuilderDefaults()
  loner.tags = ['boots']
  loner.requiredCount = 4
  return [first, second, loner]
}

// Wrap a body into a marker whose single option is selected by default, then apply it.
const sgNote = (selector: string, body: string): string =>
  `<!-- safeguard-overrides\n  q "q" id=q_sg\n  rb "opt" id=opt * { @${selector} { ${body} } }\n-->`

const applyBody = (selector: string, body: string, rules: SafeguardRule[]) => {
  const resolution = resolveNoteSafeguardOverridesTags(sgNote(selector, body))
  assert.equal(resolution.instructions.length, 1, `'${selector} { ${body} }' must yield one instruction`)
  return applySafeguardOverrides(rules, resolution.instructions)
}

test('group.count retunes the group, leaving every member\'s own count alone', () => {
  const out = applyBody('tag=head', 'group.count=9', makeRules())
  // The group's own count changed…
  assert.equal(out[0]!.group?.requiredCount, 9)
  // …while what each member FEEDS the group is untouched.
  assert.equal(out[0]!.requiredCount, 3)
  assert.equal(out[1]!.requiredCount, 2)
})

test('count and group.count are independent fields in one block', () => {
  const out = applyBody('tag=head', 'count=7 group.count=2', makeRules())
  assert.equal(out[0]!.requiredCount, 7, 'count sizes what the member feeds')
  assert.equal(out[0]!.group?.requiredCount, 2, 'group.count sizes what the group keeps')
})

test('matching a NON-head member writes the whole run (head-wins fan-out)', () => {
  // `boots` tags the run's SECOND member; the group's settings must still change for both,
  // because a run whose members disagree would be split by the normalizer.
  const out = applyBody('tag=boots', 'group.count=6', makeRules())
  assert.equal(out[0]!.group?.requiredCount, 6, 'the head receives the write it did not match')
  assert.equal(out[1]!.group?.requiredCount, 6)
  // Every member must hold an equal — but not shared — settings object.
  assert.notEqual(out[0]!.group, out[1]!.group, 'members must not share one mutable object')
  assert.deepEqual(out[0]!.group, out[1]!.group)
})

test('group.* is ignored on an ungrouped rule', () => {
  const out = applyBody('tag=boots', 'group.count=6', makeRules())
  // The bystander matches the selector but belongs to no group — nothing to retune.
  assert.equal(out[2]!.group, undefined)
  assert.equal(out[2]!.requiredCount, 4, 'its own count is untouched by a group-only op')
})

test('group.per* chips edit only the group\'s bucket scope', () => {
  const rules = makeRules()
  const out = applyBody('tag=head', 'group.perslot=off group.perset=off', rules)
  assert.equal(out[0]!.group?.countMode.perSlot, false)
  assert.equal(out[0]!.group?.countMode.perSet, false)
  // Chips the block did not name keep their previous value…
  assert.equal(out[0]!.group?.countMode.perFaction, SAFEGUARD_DEFAULT_COUNT_MODE.perFaction)
  // …and the member's OWN scope is a different object entirely.
  assert.deepEqual(out[0]!.countMode, rules[0]!.countMode)
})

test('per* and group.per* address different scopes in one block', () => {
  const out = applyBody('tag=head', 'perslot=off group.perslot=on', makeRules())
  assert.equal(out[0]!.countMode.perSlot, false, 'the member\'s own bucket scope')
  assert.equal(out[0]!.group?.countMode.perSlot, true, 'the group\'s bucket scope')
})

test('grouped / ungrouped select on membership', () => {
  const grouped = applyBody('grouped', 'count=1', makeRules())
  assert.equal(grouped[0]!.requiredCount, 1)
  assert.equal(grouped[1]!.requiredCount, 1)
  assert.equal(grouped[2]!.requiredCount, 4, 'the ungrouped bystander is not selected')

  const ungrouped = applyBody('ungrouped', 'count=1', makeRules())
  assert.equal(ungrouped[0]!.requiredCount, 3)
  assert.equal(ungrouped[1]!.requiredCount, 2)
  assert.equal(ungrouped[2]!.requiredCount, 1, 'only the ungrouped rule is selected')
})

test('grouped composes with tag conditions', () => {
  // `boots` tags one member and the bystander; `and grouped` must keep only the member.
  const out = applyBody('tag=boots and grouped', 'count=1', makeRules())
  assert.equal(out[1]!.requiredCount, 1)
  assert.equal(out[2]!.requiredCount, 4, 'the ungrouped boots rule is excluded')
})

test('two runs sharing an id are retuned independently', () => {
  // Membership is "adjacent AND same id": a separator between two stretches makes two runs.
  // Only the run containing a matched member may be written.
  const rules = makeRules()
  const separator = createFactorySafeguardBuilderDefaults()
  separator.separator = true
  const thirdA = createFactorySafeguardBuilderDefaults()
  thirdA.group = { id: GROUP_ID, requiredCount: 5, countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE } }
  const thirdB = createFactorySafeguardBuilderDefaults()
  thirdB.group = { id: GROUP_ID, requiredCount: 5, countMode: { ...SAFEGUARD_DEFAULT_COUNT_MODE } }
  const out = applyBody('tag=head', 'group.count=8', [...rules, separator, thirdA, thirdB])
  assert.equal(out[0]!.group?.requiredCount, 8, 'the matched run is retuned')
  assert.equal(out[1]!.group?.requiredCount, 8)
  assert.equal(out[4]!.group?.requiredCount, 5, 'the second run keeps its own settings')
  assert.equal(out[5]!.group?.requiredCount, 5)
})

test('a group.* op that changes nothing clones no rules', () => {
  const rules = makeRules()
  // Writing the value the group already holds must not clone (identity is the cheap check
  // the apply seam relies on to leave untouched rules by reference).
  const out = applySafeguardOverrides(
    rules,
    resolveNoteSafeguardOverridesTags(sgNote('tag=head', 'group.count=5')).instructions,
  )
  assert.equal(out[1], rules[1], 'an unchanged sibling is returned by reference')
  assert.equal(out[2], rules[2], 'the untouched bystander is returned by reference')
})

test('group.count clamps to the required-count bounds', () => {
  // 0 is below SAFEGUARD_REQUIRED_COUNT_MIN; the apply seam clamps exactly as a rule count does.
  const out = applyBody('tag=head', 'group.count=0', makeRules())
  assert.ok((out[0]!.group?.requiredCount ?? 0) >= 1, 'a sub-minimum count is clamped up')
})

test('group.count is slider-driven: $value and arithmetic resolve like count', () => {
  // The editor's calc widget builds exactly these shapes, so each must survive the slider
  // resolver — a group.count left unresolved would silently no-op at apply time.
  const sliderNote = (frag: string): string => [
    '<!-- safeguard-overrides',
    '  q "q" id=q_sg',
    `  slider "" id=sld min=0 max=40 step=1 default=16 { @tag=head { ${frag} } }`,
    '-->',
  ].join('\n')
  const runSlider = (frag: string, answer: string): SafeguardRule[] => {
    // A question's stored answer is an array (option ids mixed with one slider value).
    const { instructions } = resolveNoteSafeguardOverridesTags(sliderNote(frag), { q_sg: [answer] })
    return [...applySafeguardOverrides(makeRules(), instructions)]
  }
  // Bare $value → the slider position itself.
  assert.equal(runSlider('group.count=$value', '12')[0]!.group?.requiredCount, 12)
  // Arithmetic → evaluated, rounded and clamped.
  assert.equal(runSlider('group.count=$value/4', '12')[0]!.group?.requiredCount, 3)
  assert.equal(runSlider('group.count=$value*2', '3')[0]!.group?.requiredCount, 6)
  // The group's count and the member's own count can ride the same slider independently.
  const both = runSlider('count=$value group.count=$value/2', '8')
  assert.equal(both[0]!.requiredCount, 8, 'the member feeds the slider value')
  assert.equal(both[0]!.group?.requiredCount, 4, 'the group keeps half of it')
})

test('an unknown group.* suffix is skipped without disturbing its neighbours', () => {
  // Lenient parse: the bad field no-ops, the good ones on either side still apply.
  const out = applyBody('tag=head', 'group.count=6 group.perslots=on count=2', makeRules())
  assert.equal(out[0]!.group?.requiredCount, 6)
  assert.equal(out[0]!.requiredCount, 2, 'the assignment after the unknown field still applies')
})

// ── The shipped preset's live wiring ──────────────────────────────────────────
// Integration guard over the real note + real rules. EVERY count-writing factor block in the
// preset's safeguard sliders mirrors its member write with the group's own count at the same
// scale — `{ count=$value/8 group.count=$value/8 }` — so a group formed later out of any family
// is driven by its slider the moment it exists, at the scale its members promise (a group seeds
// from the MIN of its members' counts, so `$value` on `div8` members would silently 8× it). The
// preset ships NO groups today (measured inert — see lategame-preset-design.md), so every
// `group.count` is a strict no-op now. This pins both halves of that contract against the live
// note: each factor block resolves to a `count` AND a `groupCount` op with the SAME expression,
// and applying them writes every rule's own count while no rule grows a group.
test('every lategame slider factor block mirrors count with group.count and no-ops until a group exists', () => {
  const rules = loadLategameSafeguardRules()
  assert.equal(safeguardListHasGroups(rules), false, 'the preset ships no groups')
  const note = loadLategameNote()
  // Default answers: every slider at its default, so every factor block resolves.
  const { questions, instructions } = resolveNoteSafeguardOverridesTags(note, {})
  const countBlocks = instructions.filter((instruction) =>
    instruction.operations.some((op) => op.kind === 'count'))
  const groupCountBlocks = instructions.filter((instruction) =>
    instruction.operations.some((op) => op.kind === 'groupCount'))
  assert.ok(countBlocks.length > 0, 'the preset must resolve count-writing factor blocks')
  // The mirror is exact in both directions: no count without its group.count and no stray
  // group.count either (the per-slider `blk:count+groupCount` shape is pinned by the golden).
  assert.equal(groupCountBlocks.length, countBlocks.length, 'every count block mirrors group.count and nothing else does')
  for (const block of countBlocks) {
    const count = block.operations.find((op) => op.kind === 'count')
    const groupCount = block.operations.find((op) => op.kind === 'groupCount')
    assert.ok(groupCount, `a count block must carry its group.count mirror: ${JSON.stringify(block.selector)}`)
    // Same resolved value: the mirror is the SAME expression, resolved from the same slider.
    assert.equal(
      (groupCount as { value: number | null }).value,
      (count as { value: number | null }).value,
      `group.count must resolve to the same value as count: ${JSON.stringify(block.selector)}`,
    )
  }
  // Applying everything writes each rule's own count and grows no group anywhere.
  const out = applySafeguardOverrides(rules, instructions)
  assert.equal(out.length, rules.length)
  for (const [index, rule] of out.entries()) {
    assert.equal(rule.group, undefined, `rule ${index} must stay ungrouped — group.count is a no-op here`)
  }
  // And a concrete write still lands: answer the damage/survivability slider (addressed by its
  // DSL id — question ids are content hashes and would move with an edit to the prompt) with a
  // value distinct from the on-disk 32 and every damage/div1 rule follows.
  const damageSlider = questions.find((question) => question.options.some((option) => option.token === 'min_dmgsurv_pieces'))
  assert.ok(damageSlider, 'the preset carries the min_dmgsurv_pieces slider')
  const retuned = applySafeguardOverrides(
    rules,
    resolveNoteSafeguardOverridesTags(note, { [damageSlider.id]: ['20'] }).instructions,
  )
  const damageDiv1 = retuned.filter((rule) => (rule.tags ?? []).includes('damage') && (rule.tags ?? []).includes('div1'))
  assert.ok(damageDiv1.length > 0)
  for (const rule of damageDiv1) assert.equal(rule.requiredCount, 20)
})
