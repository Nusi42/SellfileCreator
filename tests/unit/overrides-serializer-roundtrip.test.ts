import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  listOverrideBlocks,
  parseOverridesBlockDraft,
  createEmptyOverridesBlockDraft,
  createDraftOption,
  validateOverridesBlockDraft,
  validateRawBody,
  snapInsertionOffset,
} from '../../src/lib/overridesDraft.js'
import {
  serializeOverridesBlock,
  serializeCountExpression,
  serializeRecipeOperation,
  serializeSafeguardOperation,
  serializeRecipeSelector,
  serializeSafeguardSelector,
  SerializeError,
  composeLocalizedText,
} from '../../src/lib/overridesSerializer.js'
import {
  buildNoteRecipeOverridesSignature,
  resolveRecipeOverridesTags,
} from '../../src/lib/noteRecipeOverrides.js'
import { buildNoteSafeguardOverridesSignature } from '../../src/lib/noteSafeguardOverrides.js'
import { localizeDslDisplay } from '../../src/lib/noteOverridesParser.js'

// Load the real shipped preset note — the acceptance fixture for "fully edit a
// complete override like those in lategame.sfc".
const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
const note: string = (sfc.Note as string[]).join('\n')

const refs = listOverrideBlocks(note)

// Strip volatile per-session fields (React keys) so structural comparison is exact.
const stripKeys = (value: unknown): unknown => JSON.parse(
  JSON.stringify(value, (key, v: unknown) => (key === 'key' ? undefined : v)),
)

test('listOverrideBlocks finds every marker with exact spans', () => {
  // 14 recipe + 8 safeguard markers ship in the lategame preset.
  assert.equal(refs.filter((r) => r.domain === 'recipe').length, 14)
  assert.equal(refs.filter((r) => r.domain === 'safeguard').length, 8)
  for (const ref of refs) {
    assert.equal(note.slice(ref.from, ref.to), ref.raw, 'span must reproduce the raw slice')
  }
})

test('every lategame block maps to a fully structured draft with no diagnostics', () => {
  for (const ref of refs) {
    const { draft, diagnostics } = parseOverridesBlockDraft(ref.raw)
    assert.equal(diagnostics.length, 0, `block @${ref.from} should have no diagnostics`)
    assert.ok(draft, `block @${ref.from} should produce a draft`)
    if (draft!.kind !== 'question') continue
    for (const option of draft!.options) {
      // The shipped preset must never need the raw-body fallback — the structured
      // model covers everything it uses.
      assert.equal(option.body.kind, 'structured', `option "${option.label.base}" @${ref.from} should be structured`)
    }
  }
})

test('semantic round-trip: parse(serialize(draft)) equals the source parse', () => {
  for (const ref of refs) {
    const first = parseOverridesBlockDraft(ref.raw)
    assert.ok(first.draft)
    const serialized = serializeOverridesBlock(first.draft!)
    const second = parseOverridesBlockDraft(serialized)
    assert.equal(second.diagnostics.length, 0, `re-serialized block @${ref.from} must stay diagnostic-free`)
    assert.ok(second.draft, `re-serialized block @${ref.from} must re-parse`)
    // Draft-level comparison covers strings, locales, header tokens, slider params,
    // and every selector/operation AST (bodies are structured per the test above).
    assert.deepEqual(stripKeys(second.draft), stripKeys(first.draft), `block @${ref.from} must round-trip`)
  }
})

test('idempotence: canonical form is a serialize∘parse fixed point', () => {
  for (const ref of refs) {
    const first = serializeOverridesBlock(parseOverridesBlockDraft(ref.raw).draft!)
    const second = serializeOverridesBlock(parseOverridesBlockDraft(first).draft!)
    assert.equal(second, first, `block @${ref.from} canonical form must be stable`)
  }
})

test('whole-note re-serialization preserves signatures and default answers', () => {
  // Replace every block with its canonical serialization, back to front so spans hold.
  let next = note
  for (const ref of [...refs].reverse()) {
    const draft = parseOverridesBlockDraft(ref.raw).draft!
    next = next.slice(0, ref.from) + serializeOverridesBlock(draft) + next.slice(ref.to)
  }
  // Signatures hash question ids + structure; identical signatures pin the invariant
  // that pure re-serialization never invalidates stored answers.
  assert.equal(buildNoteRecipeOverridesSignature(next), buildNoteRecipeOverridesSignature(note))
  assert.equal(buildNoteSafeguardOverridesSignature(next), buildNoteSafeguardOverridesSignature(note))
  const before = resolveRecipeOverridesTags(note)
  const after = resolveRecipeOverridesTags(next)
  assert.deepEqual(
    after.questions.map((q) => ({ id: q.id, answer: q.defaultAnswer })),
    before.questions.map((q) => ({ id: q.id, answer: q.defaultAnswer })),
  )
})

test('localization survives the round-trip', () => {
  for (const ref of refs) {
    const draft = parseOverridesBlockDraft(ref.raw).draft!
    if (draft.kind !== 'question') continue
    const reparsed = parseOverridesBlockDraft(serializeOverridesBlock(draft)).draft!
    assert.ok(reparsed.kind === 'question')
    const beforePrompt = composeLocalizedText(draft.prompt)
    const afterPrompt = composeLocalizedText(reparsed.prompt)
    assert.equal(localizeDslDisplay(afterPrompt, 'de'), localizeDslDisplay(beforePrompt, 'de'))
    assert.equal(localizeDslDisplay(afterPrompt, 'en'), localizeDslDisplay(beforePrompt, 'en'))
  }
})

// ── Exhaustive emit↔parse tables for constructs lategame does not use ─────────

// Wrap a body string into a one-option recipe/safeguard block and re-parse it.
const roundTripBody = (domain: 'recipe' | 'safeguard', body: string) => {
  const keyword = domain === 'recipe' ? 'recipe-overrides' : 'safeguard-overrides'
  const block = `<!-- ${keyword}\n  q "q"\n  rb "opt" ${body}\n-->`
  const parse = parseOverridesBlockDraft(block)
  assert.equal(parse.diagnostics.length, 0, `body ${body} should parse clean`)
  assert.ok(parse.draft && parse.draft.kind === 'question')
  const option = (parse.draft as Extract<typeof parse.draft, { kind: 'question' }>).options[0]!
  return option
}

test('recipe operation table: every kind emits parse-exact DSL', () => {
  // One source body exercising each operation family, including ones lategame skips.
  const body = '{ @all { export=toggle rank>=3 rarity<=epic lvl=4-12 keep=late action=toggle '
    + 'autolate=uncommon minrolls=2 lockedminrolls=3 minsubstats=4 flex=on substatmin=3 '
    + 'substatmin.SPD=2 minima.any=5 minima.5.SPD=12 rolltarget.HP=300,600,,900 '
    + 'slots=Weapon,Helmet substats=+SPD,-ACC mainstats=SPD gearsets=+Speed,+-Daze,-Lifesteal '
    + 'metasets=+alpha,-beta } }'
  const option = roundTripBody('recipe', body)
  assert.ok(option.body.kind === 'structured')
  const ops = (option.body as { blocks: Array<{ operations: unknown[] }> }).blocks[0]!.operations
  // Re-emit every op and re-parse the emission — each must reproduce itself.
  for (const op of ops as Parameters<typeof serializeRecipeOperation>[0][]) {
    const emitted = serializeRecipeOperation(op)
    const back = roundTripBody('recipe', `{ @all { ${emitted} } }`)
    assert.ok(back.body.kind === 'structured')
    const reOps = (back.body as { blocks: Array<{ operations: unknown[] }> }).blocks[0]!.operations
    assert.deepEqual(reOps, [op], `op '${emitted}' must round-trip`)
  }
})

test('safeguard operation table: every kind emits parse-exact DSL', () => {
  const body = '{ @all { activation=anticipate_improvements count=8 ignprev=on igncoll=off '
    + 'ignvault=on perfaction=on permainstat=off perslot=on perset=off perrule=on '
    + 'substats=+SPD,-ACC substatmatch=persubstat weight.SPD=1.5 improvchance=10,20,30,40 '
    + 'rank=5,6 rarity=legendary,mythical faction=1,2 } }'
  const option = roundTripBody('safeguard', body)
  assert.ok(option.body.kind === 'structured')
  const ops = (option.body as { blocks: Array<{ operations: unknown[] }> }).blocks[0]!.operations
  for (const op of ops as Parameters<typeof serializeSafeguardOperation>[0][]) {
    const emitted = serializeSafeguardOperation(op)
    const back = roundTripBody('safeguard', `{ @all { ${emitted} } }`)
    assert.ok(back.body.kind === 'structured')
    const reOps = (back.body as { blocks: Array<{ operations: unknown[] }> }).blocks[0]!.operations
    assert.deepEqual(reOps, [op], `op '${emitted}' must round-trip`)
  }
})

test('count expressions round-trip including precedence and cross-slider refs', () => {
  // NOTE: binary '-' must be space-separated ('-' is a word token, so '$value-1'
  // would lex as one dead word) — the serializer always emits spaced operators.
  for (const expr of ['$value/8', '$value*2', '$value+1', '$value - 1', '($value+1)/2', '$value.other_slider/4', '- $value + 8']) {
    const option = roundTripBody('safeguard', `{ @all { count=${expr} } }`)
    assert.ok(option.body.kind === 'structured')
    const op = (option.body as { blocks: Array<{ operations: Array<{ kind: string; ast?: unknown }> }> }).blocks[0]!.operations[0]!
    assert.equal(op.kind, 'count')
    if (op.ast) {
      // Emission must re-parse to the identical AST.
      const emitted = serializeCountExpression(op.ast as Parameters<typeof serializeCountExpression>[0])
      const back = roundTripBody('safeguard', `{ @all { count=${emitted} } }`)
      const backOp = (back.body as { blocks: Array<{ operations: Array<{ ast?: unknown }> }> }).blocks[0]!.operations[0]!
      assert.deepEqual(backOp.ast, op.ast, `expr '${expr}' → '${emitted}' must round-trip`)
    }
  }
})

test('selector emission: tag-in brackets, comparisons, and paren handling', () => {
  // Safeguard grammar supports parens — or-under-and must wrap, not throw.
  const sgOption = roundTripBody('safeguard', '{ @(tag=a or tag=b) and not tag=c { count=1 } }')
  assert.ok(sgOption.body.kind === 'structured')
  const sgSel = (sgOption.body as { blocks: Array<{ selector: unknown }> }).blocks[0]!.selector
  const sgEmitted = serializeSafeguardSelector(sgSel as Parameters<typeof serializeSafeguardSelector>[0])
  const sgBack = roundTripBody('safeguard', `{ @${sgEmitted} { count=1 } }`)
  assert.deepEqual((sgBack.body as { blocks: Array<{ selector: unknown }> }).blocks[0]!.selector, sgSel)

  // Recipe grammar: comparison terms + tag in […] must round-trip.
  const rOption = roundTripBody('recipe', '{ @tag in [a,b] and rank>=5 and not rarity=epic { export=disabled } }')
  assert.ok(rOption.body.kind === 'structured')
  const rSel = (rOption.body as { blocks: Array<{ selector: unknown }> }).blocks[0]!.selector
  const rEmitted = serializeRecipeSelector(rSel as Parameters<typeof serializeRecipeSelector>[0])
  const rBack = roundTripBody('recipe', `{ @${rEmitted} { export=disabled } }`)
  assert.deepEqual((rBack.body as { blocks: Array<{ selector: unknown }> }).blocks[0]!.selector, rSel)

  // Recipe grammar has no parens: or-under-and is inexpressible and must throw.
  assert.throws(() => serializeRecipeSelector({
    kind: 'and',
    left: { kind: 'or', left: { kind: 'all' }, right: { kind: 'tagged' } },
    right: { kind: 'untagged' },
  }), SerializeError)
})

test('cross-domain blocks and else sections round-trip', () => {
  const body = '{ @tag=utility { export=active lvl=16 } safeguard @tag=utility { rank=6 rarity=legendary,mythical } '
    + 'else { @tag=utility { export=disabled } safeguard @tag=utility { activation=off } } }'
  const option = roundTripBody('recipe', body)
  assert.ok(option.body.kind === 'structured')
  const structured = option.body as { blocks: unknown[]; crossBlocks: unknown[]; elseBlocks: unknown[]; crossElseBlocks: unknown[] }
  assert.equal(structured.blocks.length, 1)
  assert.equal(structured.crossBlocks.length, 1)
  assert.equal(structured.elseBlocks.length, 1)
  assert.equal(structured.crossElseBlocks.length, 1)
})

test('templates serialize and re-parse cleanly', () => {
  for (const domain of ['recipe', 'safeguard'] as const) {
    const draft = createEmptyOverridesBlockDraft(domain)
    assert.ok(draft.kind === 'question')
    // Give it a minimal prompt/label so the block is a valid question.
    draft.prompt = { base: 'Question?', locales: [] }
    draft.options[0]!.label = { base: 'Yes', locales: [] }
    assert.deepEqual(validateOverridesBlockDraft(draft), [])
    const parsed = parseOverridesBlockDraft(serializeOverridesBlock(draft))
    assert.equal(parsed.diagnostics.length, 0)
    assert.ok(parsed.draft && parsed.draft.kind === 'question')
    const question = parsed.draft as Extract<typeof parsed.draft, { kind: 'question' }>
    assert.equal(question.options.length, 1)
    assert.equal(question.options[0]!.isDefault, true)
  }
  // Slider template keeps its params.
  const slider = createDraftOption('slider')
  assert.ok(slider.sliderParams)
})

test('spacer blocks round-trip (with and without columns)', () => {
  for (const raw of ['<!-- recipe-overrides [columns=1]\n\n-->', '<!-- safeguard-overrides [columns=2]-->', '<!-- recipe-overrides -->']) {
    const parsed = parseOverridesBlockDraft(raw)
    assert.ok(parsed.draft && parsed.draft.kind === 'spacer', `${raw} should be a spacer`)
    const serialized = serializeOverridesBlock(parsed.draft!)
    const again = parseOverridesBlockDraft(serialized)
    assert.deepEqual(stripKeys(again.draft), stripKeys(parsed.draft), `${raw} must round-trip`)
  }
})

test('escaping: quotes, newlines, and backtick chips survive', () => {
  const draft = createEmptyOverridesBlockDraft('recipe')
  assert.ok(draft.kind === 'question')
  draft.prompt = { base: 'Line one\nLine "two"', locales: [{ code: 'de', text: 'Zeile \\eins\\' }] }
  draft.options[0]!.label = { base: '`Chip` label', locales: [] }
  assert.deepEqual(validateOverridesBlockDraft(draft), [])
  const reparsed = parseOverridesBlockDraft(serializeOverridesBlock(draft))
  assert.equal(reparsed.diagnostics.length, 0)
  const question = reparsed.draft as Extract<NonNullable<typeof reparsed.draft>, { kind: 'question' }>
  assert.deepEqual(stripKeys(question.prompt), stripKeys(draft.prompt))
  assert.equal(question.options[0]!.label.base, '`Chip` label')
})

test('validation rejects marker-breaking strings and reserved ids', () => {
  const draft = createEmptyOverridesBlockDraft('recipe')
  assert.ok(draft.kind === 'question')
  draft.prompt = { base: 'bad --> text', locales: [] }
  draft.options[0]!.label = { base: 'ok', locales: [] }
  assert.ok(validateOverridesBlockDraft(draft).some((d) => d.message.includes("-->")))
  draft.prompt = { base: 'ok', locales: [] }
  draft.options[0]!.explicitId = 'set'
  assert.ok(validateOverridesBlockDraft(draft).some((d) => d.message.includes('reserved')))
})

test('raw-body validation flags unbalanced braces and stray tokens', () => {
  assert.deepEqual(validateRawBody('recipe', '{ @all { export=disabled } }'), [])
  // A brace deficit would swallow the following options — must be flagged.
  assert.ok(validateRawBody('recipe', '{ @all { export=disabled }').some((d) => d.message.includes('braces')))
  // Missing '@' before a selector-shaped expression is a real parser diagnostic.
  assert.ok(validateRawBody('recipe', '{ minrolls=3 { export=disabled } }').length > 0)
})

test('duplicate locale segments collapse first-wins and stay stable', () => {
  const raw = '<!-- recipe-overrides\n  q "Base[[de]]Erste[[de]]Zweite"\n  rb "opt" {}\n-->'
  const draft = parseOverridesBlockDraft(raw).draft!
  assert.ok(draft.kind === 'question')
  const question = draft as Extract<typeof draft, { kind: 'question' }>
  assert.deepEqual(question.prompt.locales, [{ code: 'de', text: 'Erste' }])
  const stable = serializeOverridesBlock(draft)
  assert.equal(serializeOverridesBlock(parseOverridesBlockDraft(stable).draft!), stable)
})

test('snapInsertionOffset avoids splitting blocks and mid-line carets', () => {
  const text = 'line one\n<!-- recipe-overrides\n  q "x"\n  rb "y" {}\n-->\ntail line'
  const blockStart = text.indexOf('<!--')
  const blockEnd = text.indexOf('-->') + 3
  // Caret inside the block → snaps past its end.
  assert.equal(snapInsertionOffset(text, blockStart + 10), blockEnd)
  // Mid-line caret → snaps to start of line.
  assert.equal(snapInsertionOffset(text, 4), 0)
})
