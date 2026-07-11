/**
 * separator-serialization.test.ts
 *
 * Separators (recipe exportMode='separator' and SafeguardRule.separator) persist
 * MINIMALLY — appearance plus the marker field, nothing else — and rehydrate to
 * working defaults on load. Safeguard separators are additionally inert: never
 * active, and their flag survives clone/snapshot/fingerprint plumbing.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildReadableRecipe,
  buildReadableSafeguardRuleEntry,
  normalizeRecipe,
} from '../../src/lib/sfcIO'
import {
  cloneSafeguardRule,
  createFactorySafeguardBuilderDefaults,
  createSafeguardRuleContentSnapshot,
  isSafeguardRuleActive,
  normalizeSafeguardRule,
  safeguardRuleContentFingerprint,
  SafeguardRuleActivation,
  type SafeguardRule,
} from '../../src/lib/safeguards'

// ── recipe separators ────────────────────────────────────────────────────────

test('a separator recipe serializes to appearance + Separator only (unified format)', () => {
  const separator = normalizeRecipe({
    appearance: { name: '# Damage - Any Set', fgColor: '#ff8800' },
    Separator: true,
  })
  assert.equal(separator.exportMode, 'separator')
  const readable = buildReadableRecipe(separator, [])
  assert.deepEqual(Object.keys(readable).sort(), ['Separator', 'appearance'])
  assert.deepEqual(readable, {
    appearance: { name: '# Damage - Any Set', fgColor: '#ff8800' },
    Separator: true,
  })
})

test('legacy SellfileVisibility="Separator" entries still load — and re-save in the new format', () => {
  // Old files (full entries or slim ones) spell the marker via the visibility label.
  const loaded = normalizeRecipe({ SellfileVisibility: 'Separator' })
  assert.equal(loaded.exportMode, 'separator')
  // Unnamed separator: no appearance key; the save side always writes the unified flag.
  assert.deepEqual(buildReadableRecipe(loaded, []), { Separator: true })
})

test('every separator in the shipped lategame preset is minimal and in the unified format', () => {
  const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
  const separators = (sfc.Recipes as Array<Record<string, unknown>>)
    .filter((rec) => rec.Separator === true)
  assert.ok(separators.length > 0, 'the preset must contain separator recipes')
  // No legacy-format separators may remain in the shipped preset.
  assert.equal((sfc.Recipes as Array<Record<string, unknown>>)
    .filter((rec) => rec.SellfileVisibility === 'Separator').length, 0)
  for (const rec of separators) {
    const extra = Object.keys(rec).filter((k) => k !== 'appearance' && k !== 'Separator')
    assert.deepEqual(extra, [], `separator "${(rec.appearance as { name?: string } | undefined)?.name ?? ''}" must carry no rule fields`)
  }
})

// ── safeguard separators ─────────────────────────────────────────────────────

const makeSafeguardSeparator = (): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name: '## Utility', fgColor: '#00ccff' },
  separator: true,
})

test('a safeguard separator serializes to appearance + Separator only', () => {
  const entry = buildReadableSafeguardRuleEntry(makeSafeguardSeparator())
  assert.deepEqual(entry, {
    appearance: { name: '## Utility', fgColor: '#00ccff' },
    Separator: true,
  })
})

test('a minimal safeguard separator entry loads with defaults + the flag', () => {
  const rule = normalizeSafeguardRule({ appearance: { name: '## Utility' }, Separator: true })
  assert.ok(rule, 'minimal separator entries must not be skipped on load')
  assert.equal(rule!.separator, true)
  assert.equal(rule!.appearance?.name, '## Utility')
  // Factory-default body so the builder can toggle it back to a working rule.
  assert.deepEqual(rule!.combination.sets, [])
  assert.equal(rule!.requiredCount, 1)
})

test('safeguard separators are never active and the flag rides through clone/snapshot/fingerprint', () => {
  const separator = makeSafeguardSeparator()
  // Inert regardless of the stored activation value.
  assert.equal(separator.activation, SafeguardRuleActivation.ProtectExisting)
  assert.equal(isSafeguardRuleActive(separator), false)
  assert.equal(cloneSafeguardRule(separator).separator, true)
  assert.equal((createSafeguardRuleContentSnapshot(separator) as { separator?: boolean }).separator, true)
  // Flipping the flag must change the content fingerprint (rules-cache bust).
  const { separator: _dropped, ...twinBase } = separator
  assert.notEqual(
    safeguardRuleContentFingerprint(separator),
    safeguardRuleContentFingerprint(twinBase as SafeguardRule),
  )
})
