import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseQuestionMarkerOptions,
  resolveOptionColumnCount,
  tokenize,
  TokenCursor,
} from '../../src/lib/noteOverridesParser.js'
import { parseOverridesBlockDraft } from '../../src/lib/overridesDraft.js'
import { serializeOverridesBlock } from '../../src/lib/overridesSerializer.js'

// ── Why this test exists ──────────────────────────────────────────────────────
// `[columns=N]` sizes the CARD; `[optcols=N]` sizes the OPTION GRID inside it. They are two
// independent params sharing one bracket. These tests pin: (1) both keys parse, (2) the
// default-resolution rule (optcols → columns → 1), and (3) optcols survives a serialize round-trip
// and is omitted when 0.

const parseBracket = (inner: string) => {
  const cursor = new TokenCursor(tokenize(inner))
  return parseQuestionMarkerOptions(cursor)
}

test('parseQuestionMarkerOptions reads columns and optcols independently', () => {
  assert.deepEqual(parseBracket('[columns=2 optcols=4]'), { columns: 2, optionColumns: 4 })
  assert.deepEqual(parseBracket('[optcols=4]'), { columns: 0, optionColumns: 4 })
  assert.deepEqual(parseBracket('[columns=2]'), { columns: 2, optionColumns: 0 })
  assert.deepEqual(parseBracket(''), { columns: 0, optionColumns: 0 })
  // Order and comma separation both work.
  assert.deepEqual(parseBracket('[optcols=3, columns=6]'), { columns: 6, optionColumns: 3 })
})

test('resolveOptionColumnCount: optcols wins, else columns, else 1', () => {
  // Authored optcols always wins.
  assert.equal(resolveOptionColumnCount(2, 4), 4)
  assert.equal(resolveOptionColumnCount(0, 4), 4)
  // No optcols → inherit the card columns.
  assert.equal(resolveOptionColumnCount(2, 0), 2)
  assert.equal(resolveOptionColumnCount(6, 0), 6)
  // Neither authored → single column.
  assert.equal(resolveOptionColumnCount(0, 0), 1)
})

test('optcols survives a serialize round-trip and is omitted when 0', () => {
  const raw = [
    '<!-- safeguard-overrides [columns=2 optcols=4]',
    '  q "Mode?"',
    '  rb "None" { @tag=spd { activation=off } }',
    '  rb "Owned" { @tag=spd { activation=protect_existing } }',
    '-->',
  ].join('\n')
  const { draft, diagnostics } = parseOverridesBlockDraft(raw)
  assert.equal(diagnostics.length, 0, 'no diagnostics')
  assert.ok(draft && draft.kind === 'question')
  assert.equal(draft.columns, 2)
  assert.equal(draft.optionColumns, 4)
  // Emission keeps both attributes in one bracket.
  const out = serializeOverridesBlock(draft)
  assert.match(out, /\[columns=2 optcols=4\]/)
  // With optcols reset to 0, the attribute disappears but columns stays.
  const out0 = serializeOverridesBlock({ ...draft, optionColumns: 0 })
  assert.match(out0, /\[columns=2\]/)
  assert.doesNotMatch(out0, /optcols/)
})
