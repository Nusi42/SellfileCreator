import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  RECIPE_OVERRIDES_OP_FIELD,
  RECIPE_OVERRIDES_SELECTOR_TOKEN,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS,
  NOTE_RECIPE_OVERRIDES_ACTION_VALS,
  NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS,
  NOTE_RECIPE_OVERRIDES_EXPORT_VALS,
  NOTE_RECIPE_OVERRIDES_KEEP_VALS,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD,
  NOTE_RECIPE_OVERRIDES_SLOT_NAMES,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  SAFEGUARD_OVERRIDES_OP_FIELD,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS,
} from '../../src/lib/noteSafeguardOverrides.js'
import {
  NOTE_OVERRIDES_CONSTRAINT_KEYWORDS,
  NOTE_OVERRIDES_CROSS_KEYWORDS,
  NOTE_OVERRIDES_GROUP_TYPE_MAP,
  NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS,
  SLIDER_PARAM_KEYWORDS,
} from '../../src/lib/noteOverridesParser.js'
import {
  buildRecipeOverridesEbnfText,
  buildSafeguardOverridesEbnfText,
} from '../../src/lib/overridesEbnf.js'
import {
  composeOperationText,
  operationFieldsFor,
  parseOperationText,
  selectorFieldsFor,
} from '../../src/lib/overridesEditorModel.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// The DSL keeps ONE source of truth for its vocabulary: the parser accepts the field
// tokens in NOTE_*_ASSIGNMENT_FIELDS / NOTE_*_SELECTOR_FIELDS, and every other surface
// derives from those same constants — the Prism grammar builds its token patterns from
// them, the EBNF reference interpolates them, the visual editor's dropdowns map over
// them (with COMPILE-enforced metadata Records), and the op-kind → DSL-token maps feed
// tooltip + serializer emission. This suite pins the couplings the compiler cannot:
//   1. map VALUES must be real grammar tokens (spelling drift check),
//   2. every grammar field must be reachable by some op kind (dead-token check),
//   3. the EBNF text must mention every SSOT token (reference-doc drift check),
//   4. the editor's enum value metadata must actually parse (stale-values check).
// Together with the exhaustive Record/switch types in the serializer and editor model,
// adding a new field/param is compiler- and CI-driven — no surface can silently lag.

const recipeFields = new Set<string>(NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS)
const safeguardFields = new Set<string>(NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS)
const recipeSelectorFields = new Set<string>(NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS)
// Bare selector keywords that are not "fields" but are valid selector heads.
const SELECTOR_BUILTINS = new Set<string>([...NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS, 'not', 'and', 'or'])

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

// ── Reverse coverage: no dead grammar fields ──────────────────────────────────
// A field in the grammar list that NO operation kind emits would be a token the
// parser advertises (highlighting, EBNF, editor dropdown) but that produces no
// effect — either a leftover or a half-added feature. Both directions must match.

test('every recipe assignment field is emitted by at least one op kind', () => {
  const emitted = new Set(Object.values(RECIPE_OVERRIDES_OP_FIELD))
  const dead = [...recipeFields].filter((f) => !emitted.has(f))
  assert.deepEqual(dead, [], `assignment fields with no operation kind: ${dead.join(', ')}`)
})

test('every safeguard assignment field is emitted by at least one op kind', () => {
  const emitted = new Set(Object.values(SAFEGUARD_OVERRIDES_OP_FIELD))
  const dead = [...safeguardFields].filter((f) => !emitted.has(f))
  assert.deepEqual(dead, [], `assignment fields with no operation kind: ${dead.join(', ')}`)
})

// ── EBNF reference coverage ───────────────────────────────────────────────────
// The EBNF builders interpolate the SSOT lists, so these can only fail if someone
// reverts to hand-written token lists — exactly the drift this suite forbids.

const requireAll = (text: string, tokens: readonly string[], where: string): void => {
  const missing = tokens.filter((token) => !text.includes(token))
  assert.deepEqual(missing, [], `${where} is missing SSOT tokens: ${missing.join(', ')}`)
}

test('recipe EBNF mentions every SSOT token of its grammar', () => {
  const text = buildRecipeOverridesEbnfText()
  requireAll(text, [NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD], 'recipe EBNF (marker)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS, 'recipe EBNF (assignment fields)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS, 'recipe EBNF (selector fields)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_EXPORT_VALS, 'recipe EBNF (export values)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_KEEP_VALS, 'recipe EBNF (keep values)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_ACTION_VALS, 'recipe EBNF (action values)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS, 'recipe EBNF (autolate values)')
  requireAll(text, NOTE_RECIPE_OVERRIDES_SLOT_NAMES, 'recipe EBNF (slot names)')
  requireAll(text, NOTE_OVERRIDES_CONSTRAINT_KEYWORDS, 'recipe EBNF (constraint keywords)')
  const choiceKeywords = Object.entries(NOTE_OVERRIDES_GROUP_TYPE_MAP)
    .filter(([, logical]) => logical !== 'slider')
    .map(([keyword]) => keyword)
  requireAll(text, choiceKeywords, 'recipe EBNF (group keywords)')
  requireAll(text, [NOTE_OVERRIDES_CROSS_KEYWORDS.recipe], 'recipe EBNF (cross keyword)')
})

test('safeguard EBNF mentions every SSOT token of its grammar', () => {
  const text = buildSafeguardOverridesEbnfText()
  requireAll(text, [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD], 'safeguard EBNF (marker)')
  requireAll(text, NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS, 'safeguard EBNF (assignment fields)')
  requireAll(text, NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS, 'safeguard EBNF (activation values)')
  requireAll(text, NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS, 'safeguard EBNF (substat-match values)')
  requireAll(text, SLIDER_PARAM_KEYWORDS, 'safeguard EBNF (slider params)')
  requireAll(text, Object.keys(NOTE_OVERRIDES_GROUP_TYPE_MAP), 'safeguard EBNF (group keywords)')
  requireAll(text, NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS, 'safeguard EBNF (tag selector keywords)')
  requireAll(text, [NOTE_OVERRIDES_CROSS_KEYWORDS.safeguard], 'safeguard EBNF (cross keyword)')
})

// ── Visual-editor metadata coverage ───────────────────────────────────────────
// The metadata Records are compile-enforced (Record over the SSOT field union);
// these runtime checks close the loop on VALUES: dropdown order equals the grammar
// list, and every enumerated value actually parses as a clean assignment.

test('editor operation dropdowns cover exactly the grammar field lists, in order', () => {
  assert.deepEqual(operationFieldsFor('recipe').map((m) => m.field), [...NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS])
  assert.deepEqual(operationFieldsFor('safeguard').map((m) => m.field), [...NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS])
})

test('every enumerated editor value parses as a clean assignment', () => {
  for (const domain of ['recipe', 'safeguard'] as const) {
    for (const meta of operationFieldsFor(domain)) {
      if (!meta.values) continue
      for (const value of meta.values) {
        const parsed = parseOperationText(domain, domain, composeOperationText(meta.field, value))
        assert.ok(parsed !== null, `${domain} ${meta.field}=${value} must parse (stale editor enum metadata)`)
      }
    }
  }
})

test('editor selector hints match the grammar selector surfaces', () => {
  assert.deepEqual([...selectorFieldsFor('recipe')], [...NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS])
  assert.deepEqual([...selectorFieldsFor('safeguard')], [...NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS])
})
