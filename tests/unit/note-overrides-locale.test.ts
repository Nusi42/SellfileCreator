import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitDslLocaleSegments,
  localizeDslDisplay,
  dslLocaleBase,
  localizeNoteProse,
  localizeNoteProseWithSourceMap,
  tokenize,
  CONDITIONAL_BLOCK_OPEN_REGEX,
  CONDITIONAL_BLOCK_CLOSE_REGEX,
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

// ── Block-level prose localization (`<!-- lang -->…<!-- /lang -->`) ────────────
// Whole-paragraph localization for the Note markdown, sharing the inline resolver's
// exact→prefix→base precedence. The group brackets define the fallback unit.

test('note with no prose-lang group is returned unchanged', () => {
  const note = '# Title\n\nSome **prose** with `chips` and no language markers.'
  assert.equal(localizeNoteProse(note, 'de-DE'), note)
})

test('prose group resolves to the matching language, replacing brackets + other variants', () => {
  const note =
    'Before.\n<!-- lang -->\nEnglish body.\n<!-- lang:de -->\nDeutscher Text.\n<!-- /lang -->\nAfter.'
  // Markers on their own lines: the one structural newline each marker contributes is
  // trimmed, so the picked slice is just the body (no leading/trailing blank line).
  // German active → only the German slice survives between Before/After.
  assert.equal(
    localizeNoteProse(note, 'de-DE'),
    'Before.\nDeutscher Text.\nAfter.',
  )
  // English/unknown active → the base (pre-variant) slice survives.
  assert.equal(
    localizeNoteProse(note, 'en-US'),
    'Before.\nEnglish body.\nAfter.',
  )
  assert.equal(
    localizeNoteProse(note, 'fr-FR'),
    'Before.\nEnglish body.\nAfter.',
  )
})

test('prose group falls back to the base as a whole when the language is absent', () => {
  // Only a `de` variant exists; an Italian viewer gets the full English base, never a mix.
  const note = '<!-- lang -->\nKeep your gear.\n<!-- lang:de -->\nBehalte deine Ausrüstung.\n<!-- /lang -->'
  assert.equal(localizeNoteProse(note, 'it-IT'), 'Keep your gear.')
  assert.equal(localizeNoteProse(note, 'de-DE'), 'Behalte deine Ausrüstung.')
})

test('prefix and exact-code precedence match the inline resolver (pt-BR beats pt)', () => {
  const note =
    '<!-- lang -->\nEN\n<!-- lang:pt -->\nPT generic\n<!-- lang:pt-BR -->\nPT Brasil\n<!-- /lang -->'
  assert.equal(localizeNoteProse(note, 'pt-BR'), 'PT Brasil')
  // pt-PT has no exact slice → falls to the bare `pt` prefix slice.
  assert.equal(localizeNoteProse(note, 'pt-PT'), 'PT generic')
})

test('multiple prose groups in one note each resolve independently', () => {
  const note =
    'A <!-- lang -->one<!-- lang:de -->eins<!-- /lang --> B ' +
    '<!-- lang -->two<!-- lang:de -->zwei<!-- /lang --> C'
  assert.equal(localizeNoteProse(note, 'de-DE'), 'A eins B zwei C')
  assert.equal(localizeNoteProse(note, 'en-US'), 'A one B two C')
})

test('group with no variants keeps its body verbatim, dropping only the brackets', () => {
  const note = 'X <!-- lang -->just base<!-- /lang --> Y'
  assert.equal(localizeNoteProse(note, 'de-DE'), 'X just base Y')
})

test('unterminated group degrades safely (open marker left as-is, no crash)', () => {
  const note = 'Intro <!-- lang -->dangling without a close'
  assert.equal(localizeNoteProse(note, 'de-DE'), note)
})

test('rich markdown (colored spans, blink, headings) survives inside a variant', () => {
  const note =
    '<!-- lang -->\n## Safe\n<span data-color="red">**Risk.**</span>\n' +
    '<!-- lang:de -->\n## Sicher\n<span data-color="red">**Gefahr.**</span>\n<!-- /lang -->'
  // Only the boundary newlines (right after `lang:de`, right before `/lang`) are
  // trimmed; the newline *inside* the variant body is preserved.
  assert.equal(
    localizeNoteProse(note, 'de-DE'),
    '## Sicher\n<span data-color="red">**Gefahr.**</span>',
  )
})

test('inline and line-split authoring of the same group render identically', () => {
  // The diff-friendly split form (open + base on one line; each `lang:xx` variant on its
  // own line) must resolve byte-for-byte the same as the compact inline form, for every
  // locale — this is what lets the bundled preset notes be stored split-by-line.
  const inline = 'A <!-- lang -->keep<!-- lang:de -->behalten<!-- /lang --> B'
  const split = 'A <!-- lang -->keep\n<!-- lang:de -->behalten<!-- /lang --> B'
  for (const lang of ['en-US', 'de-DE', 'fr-FR', 'pt-BR']) {
    assert.equal(localizeNoteProse(split, lang), localizeNoteProse(inline, lang))
  }
  assert.equal(localizeNoteProse(split, 'de-DE'), 'A behalten B')
  assert.equal(localizeNoteProse(split, 'en-US'), 'A keep B')
})

// ── Localized→raw source map (editor scroll-sync anchors) ────────────────────
// The edit-preview renders the LOCALIZED note, but the textarea shows the RAW draft. The
// source map lets the scroll sync translate a preview block's localized source offset back
// to a char offset in the raw draft, so prose blocks anchor at the right textarea line.

test('source map text equals plain localizeNoteProse (SSOT delegation)', () => {
  const note = 'Intro.\n<!-- lang -->\n## EN\nbody\n<!-- lang:de -->\n## DE\nKörper\n<!-- /lang -->\nTail.'
  for (const lang of ['en-US', 'de-DE', 'it-IT']) {
    assert.equal(localizeNoteProseWithSourceMap(note, lang).text, localizeNoteProse(note, lang))
  }
})

test('every segment maps localized text back to the identical raw substring', () => {
  const note = 'A.\n<!-- lang -->\n## What\nen\n<!-- lang:de -->\n## Was\nde\n<!-- /lang -->\nZ.'
  for (const lang of ['en-US', 'de-DE']) {
    const { text, segments } = localizeNoteProseWithSourceMap(note, lang)
    assert.ok(segments.length > 0)
    for (const s of segments) {
      assert.equal(
        text.slice(s.localStart, s.localStart + s.length),
        note.slice(s.rawStart, s.rawStart + s.length),
        `segment mismatch for ${lang}: ${JSON.stringify(s)}`,
      )
    }
  }
})

test('a heading offset maps to the active language’s heading in the raw note', () => {
  const note = 'Intro.\n<!-- lang -->\n## What is a Sellfile?\nen\n<!-- lang:de -->\n## Was ist ein Sellfile?\nde\n<!-- /lang -->'
  const mapHeading = (lang: string): string => {
    const { text, segments } = localizeNoteProseWithSourceMap(note, lang)
    const local = text.indexOf('## ')
    const seg = segments.find((s) => local >= s.localStart && local < s.localStart + s.length)!
    const raw = seg.rawStart + (local - seg.localStart)
    return note.slice(raw, raw + 5)
  }
  // English active → the offset lands on the EN heading; German → the DE heading.
  assert.equal(mapHeading('en-US'), '## Wh')
  assert.equal(mapHeading('de-DE'), '## Wa')
})

test('a note with no lang groups is one identity segment', () => {
  const note = '# Title\n\nPlain prose, no markers.'
  const { text, segments } = localizeNoteProseWithSourceMap(note, 'de-DE')
  assert.equal(text, note)
  assert.deepEqual(segments, [{ localStart: 0, rawStart: 0, length: note.length }])
})

// ── Conditional-block markers + legacy `end-if` reader ───────────────────────
// Regexes match an HTML comment's body (the text between `<!--` and `-->`).

test('conditional block close accepts the canonical /if-no-endpoint and the legacy end-if', () => {
  // Canonical close (the only form the writer emits).
  assert.ok(CONDITIONAL_BLOCK_CLOSE_REGEX.test(' /if-no-endpoint '))
  // Legacy form that shipped in earlier presets — still accepted so old saved notes keep working.
  assert.ok(CONDITIONAL_BLOCK_CLOSE_REGEX.test(' end-if '))
  assert.ok(CONDITIONAL_BLOCK_CLOSE_REGEX.test('end-if'))
  // The open marker is not a close; an unrelated close (collapse) does not match either.
  assert.equal(CONDITIONAL_BLOCK_CLOSE_REGEX.test(' if-no-endpoint '), false)
  assert.equal(CONDITIONAL_BLOCK_CLOSE_REGEX.test(' /collapse '), false)
})

test('conditional block open matches only the opener', () => {
  assert.ok(CONDITIONAL_BLOCK_OPEN_REGEX.test(' if-no-endpoint '))
  assert.equal(CONDITIONAL_BLOCK_OPEN_REGEX.test(' /if-no-endpoint '), false)
  assert.equal(CONDITIONAL_BLOCK_OPEN_REGEX.test(' end-if '), false)
})

// ── DSL string `[[xx]]` continuation merge (diff-friendly line-split authoring) ──
// A string token that opens with `[[xx]]` is folded onto the preceding string so the
// compact inline form and the line-split form tokenize identically.

const sig = (s: string) => tokenize(s).map((t) => `${t.kind}:${t.value}`)

test('split DSL string (EN then [[de]]…) tokenizes identically to inline EN[[de]]DE', () => {
  const inline = 'q "Account level?[[de]]Account-Level?"'
  const split = 'q "Account level?"\n  "[[de]]Account-Level?"'
  assert.deepEqual(sig(split), sig(inline))
  // The folded string carries the inline value, so localizeDslDisplay still resolves it.
  const [, q] = tokenize(split)
  assert.equal(localizeDslDisplay(q!.value, 'de-DE'), 'Account-Level?')
  assert.equal(localizeDslDisplay(q!.value, 'en-US'), 'Account level?')
})

test('each positional string + its [[de]] split fold back to the same two strings', () => {
  // A `cb` with a localized label AND a localized description, fully line-split.
  const inline = 'cb "`Lbl`[[de]]`Bez`" "Desc.[[de]]Beschr." id=x'
  const split =
    'cb "`Lbl`"\n   "[[de]]`Bez`"\n   "Desc."\n   "[[de]]Beschr." id=x'
  assert.deepEqual(sig(split), sig(inline))
  const strings = tokenize(split).filter((t) => t.kind === 'string').map((t) => t.value)
  assert.deepEqual(strings, ['`Lbl`[[de]]`Bez`', 'Desc.[[de]]Beschr.'])
})

test('a string NOT starting with [[xx]] is never folded (stays a separate token)', () => {
  // Adjacent plain strings (label + description) remain two distinct string tokens.
  assert.deepEqual(sig('cb "label" "description"'), [
    'word:cb', 'string:label', 'string:description',
  ])
})

export {}
