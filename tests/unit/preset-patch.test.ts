/* eslint import/no-unused-modules: "off" */
// Unit tests for the preset-patch system.
//
// Each test mirrors an example in presets/PATCHES.md — keep both in sync.
// The MD doc is authored against these exact patch payloads, so a failure
// here means the documented behavior has drifted and one of the two must
// be updated.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyPresetPatch,
  PresetPatchError,
  type PresetPatch,
  type RawSfcFile,
} from '../../src/lib/presetPatch.js'

// Minimal SFC fixture covering all sections the patch can touch. Field
// shapes mirror real preset files (appearance.name for modern entries,
// top-level name for legacy entries) so the resolver is exercised against
// both conventions.
const baseSfc = (): RawSfcFile => ({
  Version: '1.0.2-dev',
  Metasets: [
    { name: 'Nuker', setNames: ['Cruel', 'Lethal', 'Mercurial'], show: true },
    { name: 'Useless', setNames: ['Life', 'Offense'], show: true },
    { name: 'Support', setNames: ['Bolster'], show: false },
  ],
  Recipes: [
    // Legacy shape: name at top-level (matches beginner.sfc).
    { name: 'Keep everything', SellfileVisibility: 'Separator' },
    // Modern shape: name under appearance (matches lategame.sfc).
    { appearance: { name: 'Damage' }, SellfileVisibility: 'Active' },
    { appearance: { name: 'Damage' }, SellfileVisibility: 'Active' },
    { appearance: { name: 'Speed' }, SellfileVisibility: 'Active' },
  ],
  Safeguards: [
    { appearance: { name: 'Accessories' }, requiredCount: 5, activation: 'protectExisting' },
    { appearance: { name: 'SPD boots' }, requiredCount: 5, activation: 'protectExisting' },
    // Unnamed safeguards exist in lategame.sfc — only reachable by index.
    { requiredCount: 3, activation: 'anticipateGaps' },
  ],
  Note: [
    'Line 1',
    'Line 2 with TOKEN here',
    'Line 3',
  ],
  SafeguardsEnabled: true,
  RecipesEnabled: true,
})

// ── Top-level invariants ──────────────────────────────────────────────────

test('empty patch returns a deep clone (input not mutated)', () => {
  const input = baseSfc()
  const out = applyPresetPatch(input, {})
  assert.deepEqual(out, input)
  // Mutating output must not affect input.
  ;(out.Metasets as unknown[])[0] = { name: 'changed' }
  assert.equal((input.Metasets as Array<{ name: string }>)[0]!.name, 'Nuker')
})

// ── Metasets ──────────────────────────────────────────────────────────────

test('metasets.remove by name removes the entry', () => {
  const patch: PresetPatch = { metasets: { remove: ['Useless'] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const names = (out.Metasets as Array<{ name: string }>).map((m) => m.name)
  assert.deepEqual(names, ['Nuker', 'Support'])
})

test('metasets.remove by 1-based index removes the entry', () => {
  const patch: PresetPatch = { metasets: { remove: [2] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const names = (out.Metasets as Array<{ name: string }>).map((m) => m.name)
  assert.deepEqual(names, ['Nuker', 'Support'])
})

test('metasets.remove with multiple indices keeps target identity stable', () => {
  // Indices 1 and 3 must both refer to the BASE-SFC positions, not shifting
  // after the first removal.
  const patch: PresetPatch = { metasets: { remove: [1, 3] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const names = (out.Metasets as Array<{ name: string }>).map((m) => m.name)
  assert.deepEqual(names, ['Useless'])
})

test('metasets.edit can drop specific set names from a metaset', () => {
  // The "Nuker has Mercurial removed" scenario from the original requirement.
  const patch: PresetPatch = {
    metasets: { edit: [{ target: 'Nuker', removeSetNames: ['Mercurial'] }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const nuker = (out.Metasets as Array<{ name: string; setNames: string[] }>).find((m) => m.name === 'Nuker')!
  assert.deepEqual(nuker.setNames, ['Cruel', 'Lethal'])
})

test('metasets.edit can add set names (idempotent on duplicates)', () => {
  const patch: PresetPatch = {
    metasets: { edit: [{ target: 'Nuker', addSetNames: ['Lethal', 'Savage'] }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const nuker = (out.Metasets as Array<{ name: string; setNames: string[] }>).find((m) => m.name === 'Nuker')!
  assert.deepEqual(nuker.setNames, ['Cruel', 'Lethal', 'Mercurial', 'Savage'])
})

test('metasets.edit can replace setNames entirely', () => {
  const patch: PresetPatch = {
    metasets: { edit: [{ target: 'Nuker', setNames: ['Foo', 'Bar'] }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const nuker = (out.Metasets as Array<{ name: string; setNames: string[] }>).find((m) => m.name === 'Nuker')!
  assert.deepEqual(nuker.setNames, ['Foo', 'Bar'])
})

test('metasets.edit can rename and toggle show', () => {
  const patch: PresetPatch = {
    metasets: { edit: [{ target: 'Useless', rename: 'Hidden Trash', show: false }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const renamed = (out.Metasets as Array<{ name: string; show: boolean }>)[1]!
  assert.equal(renamed.name, 'Hidden Trash')
  assert.equal(renamed.show, false)
})

test('metasets.add appends new entries verbatim', () => {
  const patch: PresetPatch = {
    metasets: { add: [{ name: 'Brand New', setNames: ['Speed'], show: true }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.equal((out.Metasets as unknown[]).length, 4)
  assert.deepEqual((out.Metasets as Array<{ name: string }>)[3], {
    name: 'Brand New', setNames: ['Speed'], show: true,
  })
})

test('metasets: replace + add/remove combination throws', () => {
  const patch: PresetPatch = {
    metasets: { edit: [{ target: 'Nuker', setNames: ['x'], addSetNames: ['y'] }] },
  }
  assert.throws(() => applyPresetPatch(baseSfc(), patch), PresetPatchError)
})

test('metasets: unknown target name throws PresetPatchError', () => {
  const patch: PresetPatch = { metasets: { remove: ['NoSuchSet'] } }
  assert.throws(() => applyPresetPatch(baseSfc(), patch), (err) => {
    return err instanceof PresetPatchError && /not found/.test(err.message)
  })
})

test('metasets: out-of-range index throws PresetPatchError', () => {
  const patch: PresetPatch = { metasets: { remove: [99] } }
  assert.throws(() => applyPresetPatch(baseSfc(), patch), (err) => {
    return err instanceof PresetPatchError && /out of range/.test(err.message)
  })
})

// ── Recipes ───────────────────────────────────────────────────────────────

test('recipes: ambiguous name throws and lists indices', () => {
  // "Damage" appears at indices 2 and 3 — the error must point the user
  // at those positions so they can pick one to address by index.
  const patch: PresetPatch = { recipes: { remove: ['Damage'] } }
  assert.throws(() => applyPresetPatch(baseSfc(), patch), (err) => {
    return err instanceof PresetPatchError
      && /ambiguous/.test(err.message)
      && /2, 3/.test(err.message)
  })
})

test('recipes.remove by index removes one of two same-named entries', () => {
  const patch: PresetPatch = { recipes: { remove: [2] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const names = (out.Recipes as Array<{ appearance?: { name?: string }; name?: string }>)
    .map((r) => r.appearance?.name ?? r.name)
  assert.deepEqual(names, ['Keep everything', 'Damage', 'Speed'])
})

test('recipes.edit disable sets SellfileVisibility to Disabled (appearance schema)', () => {
  const patch: PresetPatch = { recipes: { edit: [{ target: 'Speed', disable: true }] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const speed = (out.Recipes as Array<{ appearance?: { name?: string }; SellfileVisibility?: string }>)[3]!
  assert.equal(speed.SellfileVisibility, 'Disabled')
})

test('recipes.edit disable also works on legacy top-level name', () => {
  const patch: PresetPatch = { recipes: { edit: [{ target: 'Keep everything', disable: true }] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const r = (out.Recipes as Array<{ SellfileVisibility?: string }>)[0]!
  assert.equal(r.SellfileVisibility, 'Disabled')
})

test('recipes.edit visibility wins over disable when both supplied', () => {
  const patch: PresetPatch = {
    recipes: { edit: [{ target: 'Speed', disable: true, visibility: 'Separator' }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const speed = (out.Recipes as Array<{ SellfileVisibility?: string }>)[3]!
  assert.equal(speed.SellfileVisibility, 'Separator')
})

test('recipes.edit disable=false re-activates only previously disabled recipes', () => {
  const sfc = baseSfc()
  ;(sfc.Recipes as Array<Record<string, unknown>>)[3]!['SellfileVisibility'] = 'Disabled'
  const patch: PresetPatch = { recipes: { edit: [{ target: 'Speed', disable: false }] } }
  const out = applyPresetPatch(sfc, patch)
  const speed = (out.Recipes as Array<{ SellfileVisibility?: string }>)[3]!
  assert.equal(speed.SellfileVisibility, 'Active')
})

test('recipes.add appends to the end of the array', () => {
  const patch: PresetPatch = {
    recipes: { add: [{ appearance: { name: 'Fresh' }, SellfileVisibility: 'Active' }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.equal((out.Recipes as unknown[]).length, 5)
  const last = (out.Recipes as Array<{ appearance?: { name?: string } }>)[4]!
  assert.equal(last.appearance?.name, 'Fresh')
})

// ── Safeguards ────────────────────────────────────────────────────────────

test('safeguards.edit disable sets activation to off', () => {
  const patch: PresetPatch = { safeguards: { edit: [{ target: 'SPD boots', disable: true }] } }
  const out = applyPresetPatch(baseSfc(), patch)
  const sg = (out.Safeguards as Array<{ activation?: string }>)[1]!
  assert.equal(sg.activation, 'off')
})

test('safeguards.edit can update requiredCount and explicit activation', () => {
  const patch: PresetPatch = {
    safeguards: {
      edit: [{ target: 'Accessories', requiredCount: 8, activation: 'anticipateGaps' }],
    },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const sg = (out.Safeguards as Array<{ requiredCount?: number; activation?: string }>)[0]!
  assert.equal(sg.requiredCount, 8)
  assert.equal(sg.activation, 'anticipateGaps')
})

test('safeguards.remove by index reaches unnamed entries', () => {
  // The 3rd safeguard is unnamed — only index targeting can address it.
  const patch: PresetPatch = { safeguards: { remove: [3] } }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.equal((out.Safeguards as unknown[]).length, 2)
})

test('safeguards.add appends new entries', () => {
  const patch: PresetPatch = {
    safeguards: { add: [{ appearance: { name: 'New SG' }, requiredCount: 1, activation: 'protectExisting' }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.equal((out.Safeguards as unknown[]).length, 4)
})

// ── Note ──────────────────────────────────────────────────────────────────

test('note.replace performs a basic string substitution', () => {
  const patch: PresetPatch = {
    note: { replace: [{ pattern: 'TOKEN', replacement: 'REPLACED' }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.deepEqual(out.Note, ['Line 1', 'Line 2 with REPLACED here', 'Line 3'])
})

test('note.replace supports multi-line regex with dotall flag', () => {
  // Match across Line 2 and Line 3 using `s` so `.` consumes newlines.
  const patch: PresetPatch = {
    note: { replace: [{ pattern: 'Line 2.*Line 3', flags: 'gs', replacement: 'COLLAPSED' }] },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.deepEqual(out.Note, ['Line 1', 'COLLAPSED'])
})

test('note.replace applies multiple ops in sequence', () => {
  const patch: PresetPatch = {
    note: {
      replace: [
        { pattern: 'Line 1', replacement: 'First' },
        { pattern: 'Line 3', replacement: 'Third' },
      ],
    },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  assert.deepEqual(out.Note, ['First', 'Line 2 with TOKEN here', 'Third'])
})

test('note.replace with invalid regex throws PresetPatchError', () => {
  const patch: PresetPatch = { note: { replace: [{ pattern: '(unclosed', replacement: 'x' }] } }
  assert.throws(() => applyPresetPatch(baseSfc(), patch), (err) => {
    return err instanceof PresetPatchError && /invalid regex/.test(err.message)
  })
})

test('note.append accepts a single string or an array of lines', () => {
  const out1 = applyPresetPatch(baseSfc(), { note: { append: 'Tail' } })
  assert.deepEqual(out1.Note, ['Line 1', 'Line 2 with TOKEN here', 'Line 3', 'Tail'])
  const out2 = applyPresetPatch(baseSfc(), { note: { append: ['A', 'B'] } })
  assert.deepEqual(out2.Note, ['Line 1', 'Line 2 with TOKEN here', 'Line 3', 'A', 'B'])
})

test('note.prepend adds lines to the start', () => {
  const out = applyPresetPatch(baseSfc(), { note: { prepend: ['Header'] } })
  assert.deepEqual(out.Note, ['Header', 'Line 1', 'Line 2 with TOKEN here', 'Line 3'])
})

test('note ops upgrade absent Note to array shape', () => {
  const sfc = baseSfc()
  delete sfc.Note
  const out = applyPresetPatch(sfc, { note: { append: 'Hello' } })
  assert.deepEqual(out.Note, ['Hello'])
})

test('note ops preserve string-shape input when no content was added', () => {
  const sfc = baseSfc()
  sfc.Note = 'single string note with TOKEN here'
  const out = applyPresetPatch(sfc, {
    note: { replace: [{ pattern: 'TOKEN', replacement: 'OK' }] },
  })
  assert.equal(out.Note, 'single string note with OK here')
})

// ── Global flags ──────────────────────────────────────────────────────────

test('global flags can be toggled independently', () => {
  const out = applyPresetPatch(baseSfc(), {
    safeguardsEnabled: false,
    recipesEnabled: false,
  })
  assert.equal(out.SafeguardsEnabled, false)
  assert.equal(out.RecipesEnabled, false)
})

test('omitted global flags do not change existing values', () => {
  const out = applyPresetPatch(baseSfc(), {})
  assert.equal(out.SafeguardsEnabled, true)
  assert.equal(out.RecipesEnabled, true)
})

// ── Combined / end-to-end ─────────────────────────────────────────────────

test('combined patch: rename + drop set + disable safeguard + edit note', () => {
  // Single patch exercising all four sections at once — mirrors the
  // headline example in PATCHES.md.
  const patch: PresetPatch = {
    metasets: {
      remove: ['Useless'],
      edit: [{ target: 'Nuker', removeSetNames: ['Mercurial'] }],
    },
    safeguards: { edit: [{ target: 'SPD boots', disable: true }] },
    note: { append: '<!-- patched for public release -->' },
  }
  const out = applyPresetPatch(baseSfc(), patch)
  const metasetNames = (out.Metasets as Array<{ name: string }>).map((m) => m.name)
  assert.deepEqual(metasetNames, ['Nuker', 'Support'])
  const nuker = (out.Metasets as Array<{ name: string; setNames: string[] }>)[0]!
  assert.deepEqual(nuker.setNames, ['Cruel', 'Lethal'])
  const spdBoots = (out.Safeguards as Array<{ appearance?: { name?: string }; activation?: string }>)[1]!
  assert.equal(spdBoots.activation, 'off')
  assert.deepEqual(
    out.Note,
    ['Line 1', 'Line 2 with TOKEN here', 'Line 3', '<!-- patched for public release -->'],
  )
})

// Keep the module boundary explicit so lint rules that check for exports do not warn.
export {}
