import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RECIPE_OVERRIDES_OP_FIELD,
  RECIPE_OVERRIDES_SELECTOR_TOKEN,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  SAFEGUARD_OVERRIDES_OP_FIELD,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
} from '../../src/lib/noteSafeguardOverrides.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// The DSL keeps ONE source of truth for its vocabulary: the parser accepts the field
// tokens in NOTE_*_ASSIGNMENT_FIELDS / NOTE_*_SELECTOR_FIELDS, and the Prism grammar
// (src/lib/prismDynamicOverrides.ts) derives its `field` / `selector-field` token
// patterns from those same arrays. Separately, the op-kind → DSL-token maps
// (RECIPE/SAFEGUARD_OVERRIDES_OP_FIELD, RECIPE_OVERRIDES_SELECTOR_TOKEN) feed the
// option-info tooltip's DSL reconstruction.
//
// The hazard these maps introduce: a map value could spell a field differently from
// the DSL surface token (e.g. internal `ignequippedcollection` vs DSL `igncoll`). Then
// the tooltip reconstructs DSL the parser would REJECT and the highlighter won't colour
// — silent drift. This test pins the invariant: every token the maps emit must be a real
// field/selector token the grammar knows. (The exhaustive Record<…['kind'], string> types
// already force every kind to be mapped; this closes the loop on the *values*.)

const recipeFields = new Set<string>(NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS)
const safeguardFields = new Set<string>(NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS)
const recipeSelectorFields = new Set<string>(NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS)
// Bare selector keywords that are not "fields" but are valid selector heads.
const SELECTOR_BUILTINS = new Set(['all', 'tagged', 'untagged', 'tag', 'not', 'and', 'or'])

test('every recipe op-field token is a known DSL assignment field', () => {
  const unknown = [...new Set(Object.values(RECIPE_OVERRIDES_OP_FIELD))].filter((f) => !recipeFields.has(f))
  assert.deepEqual(unknown, [], `RECIPE_OVERRIDES_OP_FIELD emits tokens absent from NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS: ${unknown.join(', ')}`)
})

test('every safeguard op-field token is a known DSL assignment field', () => {
  const unknown = [...new Set(Object.values(SAFEGUARD_OVERRIDES_OP_FIELD))].filter((f) => !safeguardFields.has(f))
  assert.deepEqual(unknown, [], `SAFEGUARD_OVERRIDES_OP_FIELD emits tokens absent from NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS: ${unknown.join(', ')}`)
})

test('every recipe selector token is a known selector field or builtin', () => {
  const unknown = [...new Set(Object.values(RECIPE_OVERRIDES_SELECTOR_TOKEN))]
    .filter((f) => !recipeSelectorFields.has(f) && !SELECTOR_BUILTINS.has(f))
  assert.deepEqual(unknown, [], `RECIPE_OVERRIDES_SELECTOR_TOKEN emits tokens that are neither selector fields nor builtins: ${unknown.join(', ')}`)
})
