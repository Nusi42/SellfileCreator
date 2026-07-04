import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildSelectorFromFlat,
  collectKnownSelectorTags,
  defaultViewForOption,
  flattenSelector,
  parseSelectorLeafText,
  parseSelectorText,
  parseSliderValueCalc,
  selectorLeafToView,
  selectorTermOptionsFor,
  selectorTermText,
  selectorViewOptionId,
  sliderValueCalcText,
  type AnyOverridesSelector,
} from '../../src/lib/overridesEditorModel.js'
import { listOverrideBlocks, parseOverridesBlockDraft } from '../../src/lib/overridesDraft.js'
import type { DraftSelectorBlock } from '../../src/lib/overridesDraftTypes.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// The visual condition rows are a lossless view over selector ASTs: flatten must
// invert buildSelectorFromFlat, and every leaf the rows can show must compose term
// text the parser re-parses to the identical leaf. The lategame preset is the
// acceptance fixture — every one of its selectors must be row-representable.

const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
const note: string = (sfc.Note as string[]).join('\n')

// Collect every selector block from every option body + fallback in the note.
const allBlocks = (): DraftSelectorBlock[] => {
  const blocks: DraftSelectorBlock[] = []
  for (const ref of listOverrideBlocks(note)) {
    const draft = parseOverridesBlockDraft(ref.raw).draft
    if (draft?.kind !== 'question') continue
    for (const option of draft.options) {
      if (option.body.kind !== 'structured') continue
      blocks.push(...option.body.blocks, ...option.body.crossBlocks, ...option.body.elseBlocks, ...option.body.crossElseBlocks)
    }
    if (draft.fallback) blocks.push(...draft.fallback.blocks, ...draft.fallback.crossBlocks)
  }
  return blocks
}

test('every lategame selector flattens to condition rows and rebuilds identically', () => {
  const blocks = allBlocks()
  assert.ok(blocks.length > 30, 'fixture should contain a meaningful number of selector blocks')
  for (const block of blocks) {
    const flat = flattenSelector(block.selector as AnyOverridesSelector)
    assert.ok(flat, `selector should flatten: ${JSON.stringify(block.selector)}`)
    // Every leaf must be representable as a row view.
    for (const term of flat!.terms) {
      assert.ok(selectorLeafToView(term.leaf), `leaf should have a row view: ${JSON.stringify(term.leaf)}`)
    }
    // Rebuild must reproduce the exact AST (left-associative fold).
    assert.deepEqual(buildSelectorFromFlat(flat!), block.selector)
  }
})

test('leaf → view → term text → parse reproduces the leaf for every lategame term', () => {
  for (const block of allBlocks()) {
    const flat = flattenSelector(block.selector as AnyOverridesSelector)!
    for (const term of flat.terms) {
      const view = selectorLeafToView(term.leaf)!
      const reparsed = parseSelectorLeafText(block.domain, block.domain, selectorTermText(view))
      // `tag any`/`tag none` display as tagged/untagged (semantic twins) — allow that
      // one canonicalization; everything else must round-trip structurally.
      const isTagAnyNone = term.leaf.kind === 'tag' && (term.leaf.mode === 'any' || term.leaf.mode === 'none')
      if (!isTagAnyNone) assert.deepEqual(reparsed, term.leaf, `term should round-trip: ${selectorTermText(view)}`)
      else assert.ok(reparsed, 'tag any/none views must still parse')
    }
  }
})

test('mixed and/or sequences flatten with per-gap connectives (grammar precedence)', () => {
  // `a and b or c` needs no parens — it must be row-representable with gaps [and, or].
  const parsed = parseSelectorText('recipe', 'recipe', 'tagged and untagged or all')
  assert.ok(parsed)
  const flat = flattenSelector(parsed! as AnyOverridesSelector)
  assert.ok(flat, 'precedence-shaped mixed tree must flatten')
  assert.deepEqual(flat!.connectives, ['and', 'or'])
  assert.equal(flat!.terms.length, 3)
  assert.deepEqual(buildSelectorFromFlat(flat!), parsed)
})

test('paren-requiring trees and negated composites are rejected (raw DSL fallback)', () => {
  // `(a or b) and c` cannot be written as a flat sequence without changing the AST.
  const orUnderAnd: AnyOverridesSelector = {
    kind: 'and',
    left: { kind: 'or', left: { kind: 'all' }, right: { kind: 'tagged' } },
    right: { kind: 'untagged' },
  }
  assert.equal(flattenSelector(orUnderAnd), null)
  const notOverComposite: AnyOverridesSelector = {
    kind: 'not',
    inner: { kind: 'and', left: { kind: 'all' }, right: { kind: 'tagged' } },
  }
  assert.equal(flattenSelector(notOverComposite), null)
})

test('slider-value calc widget state round-trips through its DSL text', () => {
  // Widget-representable expressions round-trip text → state → text.
  for (const text of ['$value', '$value/8', '$value*2', '$value - 1', '16']) {
    const calc = parseSliderValueCalc(text)
    assert.ok(calc, `'${text}' should be widget-representable`)
    assert.equal(sliderValueCalcText(calc!), text)
  }
  // Richer expressions stay in the free-text editor.
  for (const text of ['($value+1)/2', '$value.other_slider/4', '$value/8+1']) {
    assert.equal(parseSliderValueCalc(text), null, `'${text}' should fall back to text`)
  }
})

test('every condition-kind option seeds a parse-valid or completable default view', () => {
  for (const domain of ['recipe', 'safeguard'] as const) {
    for (const option of selectorTermOptionsFor(domain)) {
      const view = defaultViewForOption(option)
      // The dropdown id must map back to itself (kind switching is stable).
      assert.equal(selectorViewOptionId(view), option.id, `option ${option.id} default view maps back`)
      const leaf = parseSelectorLeafText(domain, domain, selectorTermText(view))
      // The single-tag kind starts empty (uncommitted until a value is typed);
      // everything else — including the empty `tag in []` list — must parse.
      if (option.value === 'tag') assert.equal(leaf, null)
      else assert.ok(leaf, `option ${option.id} default '${selectorTermText(view)}' must parse`)
    }
  }
})

test('collectKnownSelectorTags surfaces the tags used across the note', () => {
  const tags = collectKnownSelectorTags(note)
  for (const expected of ['marius', 'utility', 'scarce', 'setbonus', 'acc', 'spd']) {
    assert.ok(tags.includes(expected), `known tags should include '${expected}'`)
  }
})
