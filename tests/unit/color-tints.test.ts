import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TINT, ALPHA } from '../../src/lib/colorTints.js'

// Every TINT value must be a CHANNEL-var rgba string so it resolves per-scheme at the CSS layer.
test('TINT values are well-formed channel-var rgba strings', () => {
  const re = /^rgba\(var\(--mui-palette-[a-z-]+Channel\) \/ [0-9]*\.?[0-9]+\)$/
  const entries = Object.entries(TINT)
  assert.ok(entries.length > 0)
  for (const [name, value] of entries) {
    assert.match(value, re, `${name} = ${value}`)
  }
})

// A couple of stable anchors so accidental edits to the SSOT are caught.
test('TINT exposes the expected canonical tints', () => {
  assert.equal(TINT.textPrimary08, 'rgba(var(--mui-palette-text-primaryChannel) / 0.08)')
  assert.equal(TINT.paper92, 'rgba(var(--mui-palette-background-paperChannel) / 0.92)')
})

// ALPHA is a numeric scale in (0,1]; names follow a<NN> and match their value.
test('ALPHA values are numeric opacities in (0,1] matching their name', () => {
  for (const [name, value] of Object.entries(ALPHA)) {
    assert.equal(typeof value, 'number')
    assert.ok(value > 0 && value <= 1, `${name} = ${value} out of (0,1]`)
    // Name aNN encodes value*100 (a60 -> 0.6, a08 -> 0.08).
    const nn = Number(name.slice(1))
    assert.ok(Math.abs(value * 100 - nn) < 1e-6, `${name} should equal ${nn / 100}`)
  }
})
