/* eslint import/no-unused-modules: off */

/**
 * The dirty badge words itself after the action its button performs.
 *
 * The dot over the export/push button used to be wired to the `.hsf` export signal
 * even when the button PUSHED the `.sfc`, so it reported a staleness that button
 * could not clear. Fixing the flag is only half of it: "not saved since" is the
 * wrong sentence for a push, and a push has no file to save.
 *
 * Each shape is its own whole catalog key, never a spliced sentence, so a
 * translator can reorder freely. These tests pin the key SELECTION — the English
 * text is the catalog's business and is deliberately not asserted.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildDirtyTooltip } from '../../src/lib/dateDisplay.js'

// Records which key the builder asked for, so a wrong sentence names the key.
const recordingTranslate = (seen: string[]) => (
  (key: string, params?: Record<string, string | number>): string => {
    seen.push(key)
    return params ? `${key}(${Object.keys(params).sort().join(',')})` : key
  }
) as unknown as Parameters<typeof buildDirtyTooltip>[1]

const MINUTE = 60_000
const NOW = 1_700_000_000_000

test('no timestamp: the plain shape follows the action', () => {
  for (const [describesPush, expected] of [[false, 'dirtyBadgeUnsaved'], [true, 'dirtyBadgeUnpushed']] as const) {
    const seen: string[] = []
    buildDirtyTooltip(null, recordingTranslate(seen), NOW, describesPush)
    assert.deepEqual(seen, [expected])
  }
})

test('a fresh stamp: the "since <time>" shape follows the action', () => {
  for (const [describesPush, expected] of [
    [false, 'dirtyBadgeNotSavedSince'],
    [true, 'dirtyBadgeNotPushedSince'],
  ] as const) {
    const seen: string[] = []
    buildDirtyTooltip(NOW, recordingTranslate(seen), NOW, describesPush)
    assert.deepEqual(seen, [expected], 'a just-stamped dot is still in the fresh tier')
  }
})

test('past the fresh tier: the duration shape follows the action', () => {
  // Far enough back that the ramp has left "fresh" and a span is worth showing.
  const since = NOW - 90 * MINUTE
  for (const [describesPush, expected] of [
    [false, 'dirtyBadgeUnsavedFor'],
    [true, 'dirtyBadgeUnpushedFor'],
  ] as const) {
    const seen: string[] = []
    buildDirtyTooltip(since, recordingTranslate(seen), NOW, describesPush)
    assert.ok(
      seen.includes(expected),
      `expected ${expected}, got ${JSON.stringify(seen)}`,
    )
    // The duration itself is a separate key, so no language splices "1h 20m" inline.
    assert.ok(
      seen.some((k) => k.startsWith('dirtyBadgeDuration')),
      'the unit words come from their own key',
    )
  }
})

test('the save wording is the default, so a non-pushing caller is unchanged', () => {
  const seen: string[] = []
  buildDirtyTooltip(null, recordingTranslate(seen), NOW)
  assert.deepEqual(seen, ['dirtyBadgeUnsaved'])
})
