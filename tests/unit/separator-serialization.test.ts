/**
 * separator-serialization.test.ts
 *
 * Separators (recipe exportMode='separator' and SafeguardRule.separator) persist
 * MINIMALLY — appearance plus the marker field, nothing else — and rehydrate to
 * working defaults on load. Safeguard separators are additionally inert: never
 * active, and their flag survives clone/snapshot/fingerprint plumbing.
 *
 * Bundle headers (SafeguardRule.bundle) are the other structural entry kind and are covered
 * here too: they ride the SAME clone → snapshot → fingerprint → normalize → isSafeguardRuleActive
 * plumbing, so the contract belongs beside the separator one rather than in a parallel file.
 * The one deliberate asymmetry is that a bundle IS active — it holds a live shared cap.
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

// ── safeguard bundle headers ─────────────────────────────────────────────────

const makeSafeguardBundle = (): SafeguardRule => ({
  ...createFactorySafeguardBuilderDefaults(),
  appearance: { name: 'Endgame Accessories', fgColor: '#88ccff' },
  bundle: true,
  requiredCount: 5,
})

test('a bundle header serializes without a tuple and carries its outline fields', () => {
  const entry = buildReadableSafeguardRuleEntry({ ...makeSafeguardBundle(), depth: 1, collapsed: true })
  const keys = Object.keys(entry)
  // A bundle caps its members rather than matching gear, so it has no filters to persist.
  assert.equal(keys.includes('tuple'), false, 'a bundle must not persist a combination tuple')
  assert.equal((entry as { Bundle?: true }).Bundle, true)
  assert.equal((entry as { depth?: number }).depth, 1)
  assert.equal((entry as { collapsed?: true }).collapsed, true)
  // The quota-bearing fields a bundle DOES own are still written.
  assert.equal((entry as { requiredCount?: number }).requiredCount, 5)
})

test('outline fields are omitted at their defaults so pre-bundle files re-save byte-identically', () => {
  // A plain top-level rule with no bundle context must serialize exactly as it always did.
  const entry = buildReadableSafeguardRuleEntry(createFactorySafeguardBuilderDefaults())
  for (const key of ['Bundle', 'depth', 'collapsed']) {
    assert.equal(key in entry, false, `${key} must be omitted at its default`)
  }
})

test("a bundle's own required count is persisted like any other rule's", () => {
  // The header's count IS the promise, so it is an ordinary stored number — no derivation, no
  // pin flag, nothing conditional about whether it round-trips.
  const written = buildReadableSafeguardRuleEntry({
    ...createFactorySafeguardBuilderDefaults(),
    bundle: true,
    requiredCount: 7,
  })
  assert.equal((written as { requiredCount?: number }).requiredCount, 7)
  assert.equal(normalizeSafeguardRule(written)?.requiredCount, 7)
})

test('a bundle entry loads back as a bundle with its outline placement intact', () => {
  const rule = normalizeSafeguardRule({
    appearance: { name: 'SPD core' },
    Bundle: true,
    depth: 2,
    requiredCount: 3,
    collapsed: true,
  })
  assert.ok(rule, 'bundle entries must not be skipped on load')
  assert.equal(rule!.bundle, true)
  assert.equal(rule!.depth, 2)
  assert.equal(rule!.collapsed, true)
  assert.equal(rule!.requiredCount, 3)
  // No tuple in the payload is expected for a bundle, not a parse failure.
  assert.deepEqual(rule!.combination.slots, [])
})

test('bundles are ACTIVE and the outline fields ride through clone/snapshot/fingerprint', () => {
  const bundle = makeSafeguardBundle()
  // Unlike a separator, a bundle holds a live promise — it must not be filtered out as inert.
  assert.equal(isSafeguardRuleActive(bundle), true)
  assert.equal(cloneSafeguardRule(bundle).bundle, true)
  assert.equal((createSafeguardRuleContentSnapshot(bundle) as { bundle?: boolean }).bundle, true)
  // Flipping an entry to a container changes what the engine emits → cache must bust.
  const { bundle: _dropped, ...plain } = bundle
  assert.notEqual(
    safeguardRuleContentFingerprint(bundle),
    safeguardRuleContentFingerprint(plain as SafeguardRule),
  )
  // So does moving it in or out of a bundle — depth decides which entries feed which header.
  assert.notEqual(
    safeguardRuleContentFingerprint(bundle),
    safeguardRuleContentFingerprint({ ...bundle, depth: 1 }),
  )
})

test('collapsing a bundle does NOT bust the rules cache', () => {
  // `collapsed` is display-only document state, like appearance.fgColor. If it entered the
  // fingerprint every chevron click would re-run the whole detection pipeline.
  const bundle = makeSafeguardBundle()
  assert.equal(
    safeguardRuleContentFingerprint(bundle),
    safeguardRuleContentFingerprint({ ...bundle, collapsed: true }),
  )
})
