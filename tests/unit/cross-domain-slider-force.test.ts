import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRecipeOverridesTags,
  seedSafeguardAnswersFromRecipeDefaults,
  collectRecipeOverridesDiagnostics,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags } from '../../src/lib/noteSafeguardOverrides.js'

// `setval token=N` on a recipe option carries cross-domain slider-value directives. The actual
// cross-domain WRITE happens in the NoteDialog handler (persist-on-select); here we assert the
// parser surfaces the directives on the resolved option so the handler can act on them.
const note = [
  '<!-- recipe-overrides',
  'q "Tier"',
  'rb "Low" id=low setval impr_art=25 impr_acc=25 { }',
  'rb "High" id=high setval impr_art=50 impr_acc=50 +impr_tog -impr_off { }',
  '-->',
].join('\n')

const seed = resolveRecipeOverridesTags(note)
const q = seed.questions[0]!
const optByToken = (tok: string) => q.options.find((o) => o.token === tok)!

test('setval directives are parsed onto the resolved recipe option', () => {
  assert.deepEqual(optByToken('low').setValueDirectives, [
    { token: 'impr_art', value: 25 },
    { token: 'impr_acc', value: 25 },
  ])
  assert.deepEqual(optByToken('high').setValueDirectives, [
    { token: 'impr_art', value: 50 },
    { token: 'impr_acc', value: 50 },
  ])
})

test('+/- slider tokens are retained as set/unset tokens for cross-domain toggling', () => {
  const high = optByToken('high')
  assert.ok(high.setTokens.includes('impr_tog'), '+impr_tog retained in setTokens')
  assert.ok(high.unsetTokens.includes('impr_off'), '-impr_off retained in unsetTokens')
})

test('an unselected option still parses its setval (acted on only when selected)', () => {
  // Selecting `low` leaves `high` unselected; `high` keeps its directives for when it is picked.
  const r = resolveRecipeOverridesTags(note, { [q.id]: [optByToken('low').id] }, optByToken('low').id)
  const high = r.questions[0]!.options.find((o) => o.token === 'high')!
  assert.equal(high.setValueDirectives.length, 2)
})

// ── Load-time seeding (default-selected option forces sliders on import) ────────────
// A note whose first/default-selected recipe option carries setval directives must seed the
// matching safeguard sliders at LOAD, not only after an interactive selection change.
const seedNote = [
  '<!-- recipe-overrides',
  'q "Tier"',
  'rb "Low" * id=low setval min_spd_pieces=12 impr_art=33 { }',
  'rb "High" id=high setval min_spd_pieces=20 impr_art=50 { }',
  '-->',
  '<!-- safeguard-overrides',
  'q "Speed"',
  'slider "" id=min_spd_pieces min=1 max=64 default=16 unit=" pieces" { @tag=speed_set { count=$value } }',
  '-->',
  '<!-- safeguard-overrides',
  'q "Artifacts"',
  'slider "" id=impr_art min=0 max=90 default=25 toggle="Yes" unit="%" { @tagged { improvchance=$value } }',
  '-->',
].join('\n')

test('seedSafeguardAnswersFromRecipeDefaults applies the default option forces on load', () => {
  // Empty answers → the `*` default (Low) is selected; its setval forces seed the sliders.
  const seeded = seedSafeguardAnswersFromRecipeDefaults(seedNote)
  const sg = resolveNoteSafeguardOverridesTags(seedNote, seeded)
  const valueOf = (token: string) => {
    const q2 = sg.questions.find((x) => x.options.some((o) => o.token === token))!
    return seeded[q2.id]?.[0]
  }
  // Low forces 12 / 33, NOT the sliders' own defaults (16 / 25).
  assert.equal(valueOf('min_spd_pieces'), '12', 'speed slider seeded to Low force, not default 16')
  assert.equal(valueOf('impr_art'), '33', 'artifact slider seeded to Low force, not default 25')
})

test('seeding never clobbers an answer the user/autosave already set', () => {
  // Build the question→token map to address the speed question by id.
  const sg = resolveNoteSafeguardOverridesTags(seedNote)
  const spdQ = sg.questions.find((x) => x.options.some((o) => o.token === 'min_spd_pieces'))!
  // Pre-existing answer of 40 must survive; only the un-set artifact slider gets seeded.
  const seeded = seedSafeguardAnswersFromRecipeDefaults(seedNote, {}, { [spdQ.id]: ['40'] })
  assert.equal(seeded[spdQ.id]?.[0], '40', 'existing speed answer is preserved')
  const imprQ = sg.questions.find((x) => x.options.some((o) => o.token === 'impr_art'))!
  assert.equal(seeded[imprQ.id]?.[0], '33', 'un-set artifact slider still seeded')
})

// ── Diagnostics for malformed setval pairs ─────────────────────────────────────────
const diagnose = (n: string) => {
  const re = /<!--\s*recipe-overrides[\s\S]*?-->/g
  const diags: { from: number; to: number; message: string }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(n))) collectRecipeOverridesDiagnostics(m[0], m.index, diags)
  return diags
}

test('a non-numeric setval value is flagged as a diagnostic', () => {
  const n = ['<!-- recipe-overrides', 'q "T"', 'rb "A" id=a setval min_spd_pieces=x32 { }', '-->'].join('\n')
  const diags = diagnose(n)
  assert.ok(diags.some((d) => d.message.includes("'x32'") && d.message.includes('not a valid setval value')),
    'x32 should be flagged as an invalid setval value')
})

test('a setval target with no =value is flagged as a diagnostic', () => {
  const n = ['<!-- recipe-overrides', 'q "T"', 'rb "A" id=a setval min_dmgsurv_pieces { }', '-->'].join('\n')
  const diags = diagnose(n)
  assert.ok(diags.some((d) => d.message.includes('min_dmgsurv_pieces') && d.message.includes('missing its value')),
    'a bare setval target should be flagged as missing its value')
})

test('well-formed setval pairs produce no diagnostics', () => {
  const n = ['<!-- recipe-overrides', 'q "T"', 'rb "A" id=a setval min_spd_pieces=16 impr_art=33 { }', '-->'].join('\n')
  assert.equal(diagnose(n).length, 0, 'valid setval pairs must not be flagged')
})
