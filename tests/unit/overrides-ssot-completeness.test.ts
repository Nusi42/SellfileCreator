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
  LEVEL_MILESTONE_CHOICES,
  composeOperationText,
  operationFieldText,
  operationSupportsSliderValue,
  operationTermOptionsFor,
  parseOperationText,
  parseSelectorText,
  selectorFieldsFor,
  selectorTermOptionsFor,
  factionIdToName,
  factionNameToId,
  gearsetIdToName,
  gearsetNameToId,
  rarityNameToRank,
  rarityRankToName,
  slotIdToToken,
  slotTokenToId,
  statKeyToVariant,
  statVariantToKey,
} from '../../src/lib/overridesEditorModel.js'
import { rarityCodeFromRankValue, rarityCodeToName, rarityRankValueI18nKey, RANK_VALUES } from '../../src/lib/types.js'

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

test('editor assignment dropdown covers every grammar field (dotted families expand)', () => {
  for (const [domain, fields] of [['recipe', NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS], ['safeguard', NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS]] as const) {
    const bases = new Set(operationTermOptionsFor(domain).map((option) => option.field.split('.')[0]!))
    const missing = [...fields].filter((field) => !bases.has(field))
    assert.deepEqual(missing, [], `${domain} assignment fields with no dropdown entry: ${missing.join(', ')}`)
  }
})

test('every enumerated/listed editor value parses as a clean assignment', () => {
  const statKey = 'SPD'
  for (const domain of ['recipe', 'safeguard'] as const) {
    for (const option of operationTermOptionsFor(domain)) {
      if (!option.choices) continue
      const field = operationFieldText(option, '5', statKey)
      for (const value of option.choices) {
        // 'enum' choices are single values; 'list' choices parse as one-entry lists.
        // Multi-word names (gear sets, factions) must survive quoted.
        const text = composeOperationText(field, /\s/.test(value) ? `"${value}"` : value)
        assert.ok(parseOperationText(domain, domain, text) !== null, `${domain} ${text} must parse (stale editor metadata)`)
      }
    }
  }
})

test('every level-milestone choice parses in lvl= (single and range forms)', () => {
  for (const level of LEVEL_MILESTONE_CHOICES) {
    assert.ok(parseOperationText('recipe', 'recipe', `lvl=${level}`), `lvl=${level} must parse`)
  }
  assert.ok(parseOperationText('recipe', 'recipe', `lvl=${LEVEL_MILESTONE_CHOICES[1]}-${LEVEL_MILESTONE_CHOICES[4]}`))
})

test('editor selector hints match the grammar selector surfaces', () => {
  assert.deepEqual([...selectorFieldsFor('recipe')], [...NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS])
  assert.deepEqual([...selectorFieldsFor('safeguard')], [...NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS])
})

test('every $value-capable field accepts $value through the real grammar', () => {
  // operationSupportsSliderValue drives the visual calc widget; each spelling it
  // claims must actually resolve $value in the parser (host/block domain matters:
  // recipe numerics only take $value in cross-domain blocks under a safeguard host).
  const cases: Array<['recipe' | 'safeguard', 'recipe' | 'safeguard', string]> = [
    ['safeguard', 'safeguard', 'count'],
    ['safeguard', 'safeguard', 'improvchance'],
    // group.count shares the count grammar, so it takes $value in the same places count does.
    ['safeguard', 'safeguard', 'group.count'],
    ['recipe', 'safeguard', 'count'],  // recipe-hosted safeguard cross block
    ['recipe', 'safeguard', 'group.count'],
    ['safeguard', 'recipe', 'rank'],
    ['safeguard', 'recipe', 'minrolls'],
    ['safeguard', 'recipe', 'lockedminrolls'],
    ['safeguard', 'recipe', 'minsubstats'],
  ]
  for (const [host, block, field] of cases) {
    assert.ok(operationSupportsSliderValue(host, block, field), `${host}/${block} ${field} should support $value`)
    assert.ok(parseOperationText(host, block, `${field}=$value`), `${host}/${block} ${field}=$value must parse`)
  }
  // Negative: a plain recipe block (recipe host) must NOT offer $value on rank.
  assert.equal(operationSupportsSliderValue('recipe', 'recipe', 'rank'), false)
  // Negative: the group's boolean bucket chips take on/off, never a slider expression.
  assert.equal(operationSupportsSliderValue('safeguard', 'safeguard', 'group.perslot'), false)
})

// ── Localized value labels + numeric bounds ───────────────────────────────────
// Closed vocabularies render through valueLabelKeys (catalog terms) and numeric
// widgets through range (apply-side clamp mirrors). The compiler pins the tuple-keyed
// maps; these checks pin what it cannot: spelling membership, full coverage where a
// vocabulary is concept-localized, and that clamped fields keep their bounds.

// Option ids whose whole vocabulary must carry localized labels (star ranks,
// rarities, on/off, slots — the user-facing closed sets with catalog terms).
const FULLY_LABELED_OP_IDS: Record<'recipe' | 'safeguard', readonly string[]> = {
  recipe: ['export', 'rank', 'rarity', 'flex', 'minima.any', 'keep', 'action', 'autolate', 'slots'],
  safeguard: ['activation', 'ignprev', 'igncoll', 'ignvault', 'perfaction', 'permainstat', 'perslot', 'perset', 'perrule', 'rank', 'rarity'],
}

test('every valueLabelKeys entry names a real choice; localized vocabularies are fully covered', () => {
  for (const domain of ['recipe', 'safeguard'] as const) {
    for (const option of [...operationTermOptionsFor(domain), ...selectorTermOptionsFor(domain)]) {
      if (!option.valueLabelKeys) continue
      const choices = option.choices ?? []
      // Membership: a label for a token the grammar does not accept is spelling drift.
      const stray = Object.keys(option.valueLabelKeys).filter((key) => !choices.includes(key))
      assert.deepEqual(stray, [], `${domain} ${option.id} labels unknown values: ${stray.join(', ')}`)
    }
    for (const id of FULLY_LABELED_OP_IDS[domain]) {
      const option = operationTermOptionsFor(domain).find((entry) => entry.id === id)
      assert.ok(option, `${domain} dropdown entry '${id}' missing`)
      const unlabeled = (option.choices ?? []).filter((choice) => !option.valueLabelKeys?.[choice])
      assert.deepEqual(unlabeled, [], `${domain} ${id} has unlocalized values: ${unlabeled.join(', ')}`)
    }
  }
  // Selector twins of the localized concepts must be labeled too.
  for (const id of ['rank', 'rarity', 'flex', 'minima.any']) {
    const option = selectorTermOptionsFor('recipe').find((entry) => entry.id === id)
    assert.ok(option, `recipe condition entry '${id}' missing`)
    const unlabeled = (option.choices ?? []).filter((choice) => !option.valueLabelKeys?.[choice])
    assert.deepEqual(unlabeled, [], `recipe condition ${id} has unlocalized values: ${unlabeled.join(', ')}`)
  }
})

test('rarity value labels agree with the domain rarity-name/rank association', () => {
  // The editor map writes name → rarity*-key literally (compile-pinned keys); this
  // pins the ASSOCIATION against the types.ts SSOT the serializer derives names from.
  const option = operationTermOptionsFor('recipe').find((entry) => entry.id === 'rarity')!
  for (const rankValue of RANK_VALUES) {
    const dslName = rarityCodeToName(rarityCodeFromRankValue(rankValue)).toLowerCase()
    assert.equal(
      option.valueLabelKeys?.[dslName], rarityRankValueI18nKey(rankValue),
      `rarity '${dslName}' must use the rank-${rankValue} label key`,
    )
  }
})

test('minima.any is a star-rank chooser (its literal means "the N★ minima column")', () => {
  for (const option of [
    operationTermOptionsFor('recipe').find((entry) => entry.id === 'minima.any')!,
    selectorTermOptionsFor('recipe').find((entry) => entry.id === 'minima.any')!,
  ]) {
    assert.deepEqual([...(option.choices ?? [])], ['1', '2', '3', '4', '5', '6'])
    // Free numeric entry is gone: the widget is a closed choice, not a number field.
    assert.notEqual('widget' in option ? (option as { widget: string }).widget : (option as { value: string }).value, 'number')
  }
})

test('clamped numeric fields carry their apply-side bounds; bounds parse through the grammar', () => {
  // Fields whose resolvers clamp values must expose a range so the editor cannot
  // hold a value the apply step would discard.
  const mustHaveRange: Record<'recipe' | 'safeguard', readonly string[]> = {
    recipe: ['minrolls', 'lockedminrolls', 'minsubstats', 'substatmin', 'substatmin.stat', 'minima.star.stat'],
    safeguard: ['count', 'weight.stat'],
  }
  for (const domain of ['recipe', 'safeguard'] as const) {
    for (const id of mustHaveRange[domain]) {
      const option = operationTermOptionsFor(domain).find((entry) => entry.id === id)
      assert.ok(option?.range, `${domain} ${id} must declare a numeric range`)
      assert.ok(option.range.min <= (option.range.max ?? Infinity), `${domain} ${id} range must be ordered`)
      // Both bounds must be values the grammar accepts for the composed field text.
      const field = operationFieldText(option, '5', 'SPD')
      for (const bound of [option.range.min, option.range.max]) {
        if (bound === undefined) continue
        assert.ok(parseOperationText(domain, domain, composeOperationText(field, String(bound))), `${domain} ${field}=${bound} must parse`)
      }
    }
  }
})

test('domain-select controls: converters round-trip every vocabulary token', () => {
  // The Gear*Select value controls map DSL tokens ⇄ domain ids through the model's
  // converter SSOT; every choice of a control-tagged entry must survive the trip
  // (a miss would make the select silently unable to show a valid value).
  const roundTrips: Record<string, (token: string) => string | null> = {
    slots: (token) => { const id = slotTokenToId(token); return id === null ? null : slotIdToToken(id) },
    factions: (token) => { const id = factionNameToId(token); return id === null ? null : factionIdToName(id) },
    substats: (token) => { const variant = statKeyToVariant(token); return variant === null ? null : statVariantToKey(variant) },
    mainstats: (token) => { const variant = statKeyToVariant(token); return variant === null ? null : statVariantToKey(variant) },
    gearsets: (token) => { const id = gearsetNameToId(token); return id === null ? null : gearsetIdToName(id) },
    rankList: (token) => token,   // numeric strings pass through Number()/String()
    rarityList: (token) => { const rank = rarityNameToRank(token); return rank === null ? null : rarityRankToName(rank) },
    rankValue: (token) => token,
    starValue: (token) => token,
    rarityValue: (token) => (token === 'any' || token === 'auto' ? token : (() => { const rank = rarityNameToRank(token); return rank === null ? null : rarityRankToName(rank) })()),
  }
  for (const domain of ['recipe', 'safeguard'] as const) {
    for (const option of operationTermOptionsFor(domain)) {
      if (!option.control || option.control === 'metasets' || !option.choices) continue
      const roundTrip = roundTrips[option.control]
      assert.ok(roundTrip, `${domain} ${option.id}: control '${option.control}' has no converter round-trip`)
      for (const token of option.choices) {
        assert.equal(roundTrip(token), token, `${domain} ${option.id}: '${token}' must round-trip through the ${option.control} converters`)
      }
    }
  }
})

test('every choice-valued condition value parses as a selector term', () => {
  for (const option of selectorTermOptionsFor('recipe')) {
    if (option.value !== 'choice' || !option.choices) continue
    for (const choice of option.choices) {
      const text = `${option.token}=${choice}`
      assert.ok(parseSelectorText('recipe', 'recipe', text) !== null, `recipe selector '${text}' must parse (stale editor metadata)`)
    }
  }
})

test('condition-kind dropdown covers every grammar selector field', () => {
  // The metadata Record is compile-enforced over the selector-field union; this
  // closes the runtime loop: every field must surface at least one dropdown entry
  // (dotted families expand to several; `tag` maps onto the shared tag kinds).
  const recipeOptionTokens = selectorTermOptionsFor('recipe').map((option) => option.token)
  for (const field of NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS) {
    assert.ok(
      recipeOptionTokens.some((token) => token === field || token.startsWith(`${field}.`) || (field === 'tag' && token.startsWith('tag'))),
      `selector field '${field}' has no condition-kind dropdown entry`,
    )
  }
  // The safeguard dropdown is exactly the tag-grammar surface: every bare head from the
  // keyword SSOT (in its declared order), then the two `tag` match kinds. Derived rather
  // than spelled out, so a new selector keyword must appear in the dropdown to pass.
  const safeguardIds = selectorTermOptionsFor('safeguard').map((option) => option.id)
  const bareHeads = NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS.filter((keyword) => keyword !== 'tag')
  assert.deepEqual(safeguardIds, [...bareHeads, 'tag', 'tagIn'])
})
