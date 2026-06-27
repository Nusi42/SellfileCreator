import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitDslLocaleSegments,
  localizeDslDisplay,
  dslLocaleBase,
  localizeNoteProse,
} from '../../src/lib/noteOverridesParser.js'

// The inline `[[xx]]` localization primitive used by recipe/safeguard override
// prompts, labels, details, and slider units. The English base before the first
// tag is the canonical identity source; per-locale segments only affect display.

test('a string with no tag is its own base and has no segments', () => {
  const { base, byLang } = splitDslLocaleSegments('Keep it')
  assert.equal(base, 'Keep it')
  assert.equal(byLang.size, 0)
  assert.equal(dslLocaleBase('Keep it'), 'Keep it')
})

test('base is the text before the first [[xx]] tag; segments run to the next tag/end', () => {
  const { base, byLang } = splitDslLocaleSegments('Keep them[[de]]Behalten[[fr]]Garder')
  assert.equal(base, 'Keep them')
  assert.equal(byLang.get('de'), 'Behalten')
  assert.equal(byLang.get('fr'), 'Garder')
  assert.equal(dslLocaleBase('Keep them[[de]]Behalten'), 'Keep them')
})

test('localizeDslDisplay resolves exact code, then language prefix, then base', () => {
  const raw = 'Hi[[de]]Hallo[[pt]]Olá[[pt-BR]]Oi'
  // Exact full-code match wins (pt-BR over pt).
  assert.equal(localizeDslDisplay(raw, 'pt-BR'), 'Oi')
  // Region with only a bare-language segment falls back to the prefix (pt-PT → pt).
  assert.equal(localizeDslDisplay(raw, 'pt-PT'), 'Olá')
  // `de-DE` resolves the bare `de` segment.
  assert.equal(localizeDslDisplay(raw, 'de-DE'), 'Hallo')
  // Unknown language → English base.
  assert.equal(localizeDslDisplay(raw, 'it-IT'), 'Hi')
})

test('markdown, chips, newlines, and em-dashes survive in segments', () => {
  const raw = '**Epic** `5★` — keep\\nnow[[de]]**Episch** `5★` — behalten\\njetzt'
  assert.equal(localizeDslDisplay(raw, 'en-US'), '**Epic** `5★` — keep\\nnow')
  assert.equal(localizeDslDisplay(raw, 'de-DE'), '**Episch** `5★` — behalten\\njetzt')
})

test('a string starting with [[en]] has an empty base but still resolves', () => {
  const raw = '[[en]]Yes[[de]]Ja'
  // No text before the first tag → empty base; explicit en/de segments resolve.
  assert.equal(localizeDslDisplay(raw, 'en-US'), 'Yes')
  assert.equal(localizeDslDisplay(raw, 'de-DE'), 'Ja')
})

// ── Block-level prose localization (`<!-- lang -->…<!-- end-lang -->`) ────────────
// Whole-paragraph localization for the Note markdown, sharing the inline resolver's
// exact→prefix→base precedence. The group brackets define the fallback unit.

test('note with no prose-lang group is returned unchanged', () => {
  const note = '# Title\n\nSome **prose** with `chips` and no language markers.'
  assert.equal(localizeNoteProse(note, 'de-DE'), note)
})

test('prose group resolves to the matching language, replacing brackets + other variants', () => {
  const note =
    'Before.\n<!-- lang -->\nEnglish body.\n<!-- lang:de -->\nDeutscher Text.\n<!-- end-lang -->\nAfter.'
  // German active → only the German slice survives between Before/After.
  assert.equal(
    localizeNoteProse(note, 'de-DE'),
    'Before.\n\nDeutscher Text.\n\nAfter.',
  )
  // English/unknown active → the base (pre-variant) slice survives.
  assert.equal(
    localizeNoteProse(note, 'en-US'),
    'Before.\n\nEnglish body.\n\nAfter.',
  )
  assert.equal(
    localizeNoteProse(note, 'fr-FR'),
    'Before.\n\nEnglish body.\n\nAfter.',
  )
})

test('prose group falls back to the base as a whole when the language is absent', () => {
  // Only a `de` variant exists; an Italian viewer gets the full English base, never a mix.
  const note = '<!-- lang -->\nKeep your gear.\n<!-- lang:de -->\nBehalte deine Ausrüstung.\n<!-- end-lang -->'
  assert.equal(localizeNoteProse(note, 'it-IT'), '\nKeep your gear.\n')
  assert.equal(localizeNoteProse(note, 'de-DE'), '\nBehalte deine Ausrüstung.\n')
})

test('prefix and exact-code precedence match the inline resolver (pt-BR beats pt)', () => {
  const note =
    '<!-- lang -->\nEN\n<!-- lang:pt -->\nPT generic\n<!-- lang:pt-BR -->\nPT Brasil\n<!-- end-lang -->'
  assert.equal(localizeNoteProse(note, 'pt-BR'), '\nPT Brasil\n')
  // pt-PT has no exact slice → falls to the bare `pt` prefix slice.
  assert.equal(localizeNoteProse(note, 'pt-PT'), '\nPT generic\n')
})

test('multiple prose groups in one note each resolve independently', () => {
  const note =
    'A <!-- lang -->one<!-- lang:de -->eins<!-- end-lang --> B ' +
    '<!-- lang -->two<!-- lang:de -->zwei<!-- end-lang --> C'
  assert.equal(localizeNoteProse(note, 'de-DE'), 'A eins B zwei C')
  assert.equal(localizeNoteProse(note, 'en-US'), 'A one B two C')
})

test('group with no variants keeps its body verbatim, dropping only the brackets', () => {
  const note = 'X <!-- lang -->just base<!-- end-lang --> Y'
  assert.equal(localizeNoteProse(note, 'de-DE'), 'X just base Y')
})

test('unterminated group degrades safely (open marker left as-is, no crash)', () => {
  const note = 'Intro <!-- lang -->dangling without a close'
  assert.equal(localizeNoteProse(note, 'de-DE'), note)
})

test('rich markdown (colored spans, blink, headings) survives inside a variant', () => {
  const note =
    '<!-- lang -->\n## Safe\n<span data-color="red">**Risk.**</span>\n' +
    '<!-- lang:de -->\n## Sicher\n<span data-color="red">**Gefahr.**</span>\n<!-- end-lang -->'
  assert.equal(
    localizeNoteProse(note, 'de-DE'),
    '\n## Sicher\n<span data-color="red">**Gefahr.**</span>\n',
  )
})

export {}
