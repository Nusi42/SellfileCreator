import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveRecipeOverridesTags } from '../../src/lib/noteRecipeOverrides.js'

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
