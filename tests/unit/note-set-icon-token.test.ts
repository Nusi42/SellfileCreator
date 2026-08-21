/**
 * note-set-icon-token.test.ts
 *
 * Pins the note's `{set:Name}` inline gear-set icon token.
 *
 * The token has two independent render paths — the question prompt/label tokenizer and
 * the prose markdown pipeline — and both consume this one splitter, so the parsing
 * contract is what keeps them from drifting. The rendering itself is React and lives
 * outside these tests; what matters here is that every consumer sees the same segments.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTE_SET_ICON_TOKEN_KEYWORD,
  hasNoteSetIconToken,
  resolveNoteSetIconId,
  splitNoteSetIconSegments,
  stripNoteSetIconTokens,
} from '../../src/lib/noteSetIconToken.js'
import { ArtifactSet } from '../../src/lib/artifactSets.js'

test('the keyword is `set`, matching the {buff:…}/{debuff:…} family', () => {
  assert.equal(NOTE_SET_ICON_TOKEN_KEYWORD, 'set')
})

test('a token splits into an icon segment carrying the resolved id and name', () => {
  const segs = splitNoteSetIconSegments('keep {set:Speed} pieces')
  assert.deepEqual(segs, [
    { kind: 'text', text: 'keep ' },
    { kind: 'set', setId: ArtifactSet.Speed, name: 'Speed' },
    { kind: 'text', text: ' pieces' },
  ])
})

test('names are matched case-insensitively and tolerate padding', () => {
  // Authors type these by hand mid-sentence; a stray space must not break the icon.
  for (const raw of ['{set:speed}', '{set: Speed }', '{set:SPEED}']) {
    const segs = splitNoteSetIconSegments(raw)
    assert.equal(segs.length, 1, `${raw} yields one segment`)
    assert.deepEqual(segs[0], { kind: 'set', setId: ArtifactSet.Speed, name: 'Speed' })
  }
})

test('multi-word set names resolve', () => {
  const segs = splitNoteSetIconSegments('{set:Swift Parry}')
  assert.deepEqual(segs, [{ kind: 'set', setId: ArtifactSet.SwiftParry, name: 'Swift Parry' }])
})

test('an unknown set degrades to its bare name, never to empty or raw braces', () => {
  // A typo or a set renamed by the game must stay readable — dropping the words would
  // silently blank part of a sentence.
  const segs = splitNoteSetIconSegments('a {set:Nonexistent Set} b')
  assert.deepEqual(segs, [
    { kind: 'text', text: 'a ' },
    { kind: 'text', text: 'Nonexistent Set' },
    { kind: 'text', text: ' b' },
  ])
  assert.equal(resolveNoteSetIconId('Nonexistent Set'), null)
})

test('several tokens in one run all expand', () => {
  const segs = splitNoteSetIconSegments('{set:Speed}/{set:Savage}')
  assert.deepEqual(segs.map((s) => (s.kind === 'set' ? s.name : s.text)), ['Speed', '/', 'Savage'])
})

test('text with no token is left as a single run', () => {
  assert.equal(hasNoteSetIconToken('plain text'), false)
  assert.deepEqual(splitNoteSetIconSegments('plain text'), [{ kind: 'text', text: 'plain text' }])
})

test('stripping collapses tokens to their names, for width measurement', () => {
  // Option-label columns size themselves on character count; measuring the raw token
  // would reserve space for `{set:…}` markup that never renders.
  assert.equal(stripNoteSetIconTokens('{set:Speed} and {set:Swift Parry}'), 'Speed and Swift Parry')
  assert.equal(stripNoteSetIconTokens('no tokens here'), 'no tokens here')
})

test('a malformed token is left alone rather than half-consumed', () => {
  // Nothing resolvable here — an unmatched brace, a bare colon form, an empty name, or a
  // whitespace-only name. Every one must survive verbatim: collapsing any of them to an
  // empty string would look like the author's text had been deleted.
  for (const raw of ['{set:Speed', 'set:Speed}', '{set:}', '{set: }']) {
    assert.equal(stripNoteSetIconTokens(raw), raw, `${raw} survives verbatim`)
  }
})
