import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SIMPLE_NOTE_DIALOG_HEIGHT,
  SIMPLE_NOTE_DIALOG_MIN_WIDTH,
  SIMPLE_NOTE_DIALOG_MIN_WIDTH_PX,
  SIMPLE_NOTE_DIALOG_WIDTH,
  SIMPLE_NOTE_VIEWPORT_INSET_PX,
} from '../../src/lib/constants.js'

// Simple (express) mode fills the viewport via CSS calc rather than page zoom — guard the derived
// width/height strings so the inset stays symmetric and the lengths stay viewport-relative.
test('simple-mode dialog width is the viewport minus the inset on both sides', () => {
  assert.equal(SIMPLE_NOTE_DIALOG_WIDTH, `calc(100vw - ${SIMPLE_NOTE_VIEWPORT_INSET_PX * 2}px)`)
})

test('simple-mode dialog height is the viewport minus the inset on both sides', () => {
  assert.equal(SIMPLE_NOTE_DIALOG_HEIGHT, `calc(100vh - ${SIMPLE_NOTE_VIEWPORT_INSET_PX * 2}px)`)
})

test('simple-mode viewport inset is a small positive gap', () => {
  assert.ok(SIMPLE_NOTE_VIEWPORT_INSET_PX > 0 && SIMPLE_NOTE_VIEWPORT_INSET_PX <= 48)
})

// The width floor is clamped with min() against the fill width so it can never overflow the viewport
// on tiny windows, while holding the express cards comfortably wide otherwise.
test('simple-mode min width clamps the px floor against the fill width', () => {
  assert.equal(SIMPLE_NOTE_DIALOG_MIN_WIDTH, `min(${SIMPLE_NOTE_DIALOG_MIN_WIDTH_PX}px, ${SIMPLE_NOTE_DIALOG_WIDTH})`)
  assert.ok(SIMPLE_NOTE_DIALOG_MIN_WIDTH_PX > 0)
})
