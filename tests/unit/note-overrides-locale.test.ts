import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitDslLocaleSegments,
  localizeDslDisplay,
  dslLocaleBase,
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

export {}
