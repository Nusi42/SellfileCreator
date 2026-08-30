/**
 * safeguard-overrides-gearsets.test.ts
 *
 * The safeguard-overrides DSL's `gearsets=` / `metasets=` assignment fields
 * (recipe-side parity): parse → instruction → applySafeguardOverrides onto
 * SafeguardRule.combination.sets / .metaSetNames, including the `+-Name`
 * excluded-entry add and the cross-domain `safeguard @tag=… { gearsets=… }`
 * block inside a recipe-overrides option (the shape the lategame preset's
 * FW-Hard question uses to strip Daze from the utility safeguards).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides'
import { resolveRecipeOverridesTags } from '../../src/lib/noteRecipeOverrides'
import {
  createFactorySafeguardBuilderDefaults,
  type SafeguardRule,
} from '../../src/lib/safeguards'
import { findArtifactSetIdByName } from '../../src/lib/types'

const DAZE = findArtifactSetIdByName('daze')!
const SPEED = findArtifactSetIdByName('speed')!
const LIFESTEAL = findArtifactSetIdByName('lifesteal')!
assert.ok(DAZE != null && SPEED != null && LIFESTEAL != null, 'test set names must resolve')

// One utility-tagged rule with a metaset plus an included Daze entry, one untagged bystander.
const makeRules = (): SafeguardRule[] => {
  const utility = createFactorySafeguardBuilderDefaults()
  utility.tags = ['utility']
  utility.combination.metaSetNames = ['Utility']
  utility.combination.sets = [{ id: DAZE }]
  const bystander = createFactorySafeguardBuilderDefaults()
  return [utility, bystander]
}

// Wrap a single always-on safeguard block body into a marker with one default-selected option.
const sgNote = (body: string): string =>
  `<!-- safeguard-overrides\n  q "q" id=q_sg\n  rb "opt" id=opt * { @tag=utility { ${body} } }\n-->`

const applyBody = (body: string, rules: SafeguardRule[]) => {
  const resolution = resolveNoteSafeguardOverridesTags(sgNote(body))
  assert.equal(resolution.instructions.length, 1, `body '${body}' must yield one instruction`)
  return applySafeguardOverrides(rules, resolution.instructions)
}

test('gearsets replace: bare names overwrite the sets list with plain includes', () => {
  const out = applyBody('gearsets=Speed,Lifesteal', makeRules())
  assert.deepEqual(out[0]!.combination.sets, [{ id: SPEED }, { id: LIFESTEAL }])
  // The untagged rule is untouched (selector @tag=utility).
  assert.deepEqual(out[1]!.combination.sets, [])
})

test('gearsets mutate: +-Name flips an existing include to an excluded entry', () => {
  const out = applyBody('gearsets=+-Daze', makeRules())
  assert.deepEqual(out[0]!.combination.sets, [{ id: DAZE, excluded: true }])
  // Metaset selection is untouched by a sets-only op.
  assert.deepEqual(out[0]!.combination.metaSetNames, ['Utility'])
})

test('gearsets mutate: -Name removes the entry regardless of its excluded flag', () => {
  const rules = makeRules()
  rules[0]!.combination.sets = [{ id: DAZE, excluded: true }, { id: SPEED }]
  const out = applyBody('gearsets=-Daze,+Lifesteal', rules)
  assert.deepEqual(out[0]!.combination.sets, [{ id: SPEED }, { id: LIFESTEAL }])
})

test('metasets replace and mutate edit combination.metaSetNames', () => {
  const replaced = applyBody('metasets=Alpha,Beta', makeRules())
  assert.deepEqual(replaced[0]!.combination.metaSetNames, ['Alpha', 'Beta'])
  const mutated = applyBody('metasets=+Alpha,-Utility', makeRules())
  assert.deepEqual(mutated[0]!.combination.metaSetNames, ['Alpha'])
})

test('cross-domain: a recipe option safeguard block carries gearsets ops onto rules', () => {
  // The lategame FW-Hard shape: selecting the option adds the Daze exclusion.
  const note = '<!-- recipe-overrides\n  q "q" id=q_fw\n  rb "no" id=no * { }\n'
    + '  rb "yes" id=yes { safeguard @tag=utility { gearsets=+-Daze } }\n-->'
  const rules = makeRules()
  rules[0]!.combination.sets = []
  // Answers use the resolved (composite) option ids — look the "yes" option up first.
  const base = resolveRecipeOverridesTags(note)
  const yesId = base.questions[0]!.groups
    .flatMap((g) => g.options)
    .find((o) => o.id.includes(':yes#'))!.id
  const yes = resolveRecipeOverridesTags(note, { q_fw: [yesId] })
  assert.equal(yes.safeguardInstructions.length, 1)
  const out = applySafeguardOverrides(rules, yes.safeguardInstructions)
  assert.deepEqual(out[0]!.combination.sets, [{ id: DAZE, excluded: true }])
  // The default "no" option carries no safeguard block → rules pass through unchanged.
  const no = resolveRecipeOverridesTags(note)
  assert.equal(no.safeguardInstructions.length, 0)
})
