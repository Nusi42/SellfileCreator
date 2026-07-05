/* eslint import/no-unused-modules: off */

// Guards the "Metasets" row trigger in the Restore Last Saved State dialog.
// Regression context: the old ID-mismatch trigger was lost when metasets migrated
// to name-as-primary-key, so a content-equal draft whose recipes/safeguards
// referenced a metaset absent from the session silently stopped surfacing the row.
// The reference-satisfaction helpers below are the name-world replacement.
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  metasetsEqualSession,
  collectReferencedMetasetNames,
  metasetRefsUnsatisfied,
  restoreDraftMetasetsDiffer,
  type RestoreDraft,
} from '../../src/hooks/useAutosaveRestore.js'
import { defaultMetasets, type Metaset } from '../../src/lib/metasets.js'
import { presetDraftFields } from '../../src/lib/sfcPresetMatch.js'
import type { BuilderRecipe } from '../../src/lib/hsfBuilder.js'
import type { SafeguardRule } from '../../src/lib/safeguards.js'

// Minimal metaset — only name/sets/iconId feed the signature the helpers use.
const meta = (name: string): Metaset => ({ name, sets: [], iconId: null })

// The helpers read only artifactMetaSets / combination.metaSetNames; cast a partial.
const recipeRef = (...names: string[]): BuilderRecipe =>
  ({ artifactMetaSets: names } as unknown as BuilderRecipe)
const safeguardRef = (...names: string[]): SafeguardRule =>
  ({ combination: { metaSetNames: names } } as unknown as SafeguardRule)

test('metasetsEqualSession is pure content equality (name-keyed signature)', () => {
  // Same content, order-independent → equal.
  assert.equal(metasetsEqualSession([meta('A'), meta('B')], [meta('B'), meta('A')]), true)
  // Different name → not equal.
  assert.equal(metasetsEqualSession([meta('A')], [meta('C')]), false)
  // Missing/empty treated as empty.
  assert.equal(metasetsEqualSession(null, []), true)
})

test('collectReferencedMetasetNames unions recipe + safeguard references', () => {
  const names = collectReferencedMetasetNames(
    [recipeRef('Nuker'), recipeRef('Nuker', 'Support')],
    [safeguardRef('Tank')],
  )
  assert.deepEqual([...names].sort(), ['Nuker', 'Support', 'Tank'])
})

test('collectReferencedMetasetNames tolerates null/empty inputs', () => {
  assert.equal(collectReferencedMetasetNames(null, null).size, 0)
  assert.equal(collectReferencedMetasetNames([recipeRef()], []).size, 0)
})

test('metasetRefsUnsatisfied flags a referenced name absent from the session', () => {
  const referenced = collectReferencedMetasetNames([recipeRef('Nuker')], null)
  // Session lacks "Nuker" → reference dangles.
  assert.equal(metasetRefsUnsatisfied(referenced, [meta('Support')]), true)
  // Session has "Nuker" → satisfied.
  assert.equal(metasetRefsUnsatisfied(referenced, [meta('Nuker')]), false)
})

test('metasetRefsUnsatisfied is false when nothing is referenced', () => {
  assert.equal(metasetRefsUnsatisfied(new Set(), []), false)
})

// ---------------------------------------------------------------------------
// Composed flow: restoreDraftMetasetsDiffer — the exact trigger App feeds into
// the restore dialog's "Metasets" row. These cases are the real regression guard;
// the helper tests above only cover the pieces in isolation.
// ---------------------------------------------------------------------------

// Build a RestoreDraft carrying only the slices this trigger reads.
const draft = (parts: Partial<RestoreDraft>): RestoreDraft => ({ ...parts })

test('flow: no saved metaset slice never surfaces the row', () => {
  assert.equal(restoreDraftMetasetsDiffer(null, [meta('A')]), false)
  assert.equal(restoreDraftMetasetsDiffer(draft({ Recipes: [recipeRef('A')] }), [meta('A')]), false)
})

test('flow: content difference surfaces the row', () => {
  // Saved metasets differ in content from the session → row shows.
  assert.equal(
    restoreDraftMetasetsDiffer(draft({ Metasets: [meta('A'), meta('B')] }), [meta('A')]),
    true,
  )
})

test('flow: content-equal but a recipe references a metaset the session lacks → row shows', () => {
  // THE regression: metaset content is identical to the session, but a saved recipe
  // references "Ghost", which the session's metaset list does not contain. Before the
  // fix this returned false and the row silently vanished.
  const d = draft({ Metasets: [meta('A')], Recipes: [recipeRef('A'), recipeRef('Ghost')] })
  assert.equal(restoreDraftMetasetsDiffer(d, [meta('A')]), true)
})

test('flow: content-equal but a safeguard references a missing metaset → row shows', () => {
  const d = draft({ Metasets: [meta('A')], Safeguards: [safeguardRef('Ghost')] })
  assert.equal(restoreDraftMetasetsDiffer(d, [meta('A')]), true)
})

test('flow: content-equal and every reference resolves → row stays hidden', () => {
  // Metasets match and both a recipe and a safeguard reference only present names.
  const d = draft({
    Metasets: [meta('A'), meta('B')],
    Recipes: [recipeRef('A')],
    Safeguards: [safeguardRef('B')],
  })
  assert.equal(restoreDraftMetasetsDiffer(d, [meta('B'), meta('A')]), false)
})

test('flow: content-equal with no recipe/safeguard references → row stays hidden', () => {
  const d = draft({ Metasets: [meta('A')] })
  assert.equal(restoreDraftMetasetsDiffer(d, [meta('A')]), false)
})

// ---------------------------------------------------------------------------
// Real preset data: drive the trigger with the actual bundled presets
// (presets/beginner.sfc, presets/lategame.sfc) and the app's real metaset
// defaults, so the "what happens when the app receives the same vs. new
// defaults" matrix is exercised against ground-truth shapes — not fixtures.
//
// Ground truth (parsed at test time, asserted below so a preset change trips here):
//  - defaultMetasets() == the beginner preset's 12 metasets (same names/order)
//  - beginner recipes/safeguards reference NO metasets
//  - lategame carries 13 metasets (adds "Scarce (Mercurial)", renames Nuker→Damage)
//    and its 191 recipes + 115 safeguards reference all 13 by name
// ---------------------------------------------------------------------------

// Build a restore draft from a bundled preset's real setup fields.
const draftFromPreset = (variant: 'beginner' | 'lategame'): RestoreDraft => {
  const fields = presetDraftFields(variant)
  return {
    Metasets: fields.metasets,
    Recipes: fields.recipes,
    Safeguards: fields.safeguardRules ?? [],
  }
}

test('real: default metasets mirror the beginner preset (ground-truth guard)', () => {
  // If this drifts, the scenarios below need revisiting — fail loudly, don't rot silently.
  const names = (m: Metaset[]) => m.map((x) => x.name)
  assert.deepEqual(names(defaultMetasets()), names(presetDraftFields('beginner').metasets))
})

test('real: fresh app on defaults, beginner autosave → same defaults, row hidden', () => {
  // Session holds the app's factory defaults; the saved draft is the beginner preset
  // (whose metasets ARE the defaults and whose recipes reference no metasets).
  // Same defaults in, same defaults out → nothing to restore, row stays hidden.
  assert.equal(restoreDraftMetasetsDiffer(draftFromPreset('beginner'), defaultMetasets()), false)
})

test('real: lategame autosave, session on defaults → new defaults differ, row shows', () => {
  // The app shipped/loaded the beginner defaults, but the saved draft is a lategame
  // setup. Its metaset list differs in content (Damage vs Nuker names, +Scarce),
  // so the content check alone surfaces the row.
  assert.equal(restoreDraftMetasetsDiffer(draftFromPreset('lategame'), defaultMetasets()), true)
})

test('real: lategame autosave restored against its own metasets → row hidden', () => {
  // Session already carries the lategame metasets (e.g. user loaded that preset).
  // Content matches AND every recipe/safeguard reference resolves → row stays hidden.
  const lategame = presetDraftFields('lategame')
  assert.equal(restoreDraftMetasetsDiffer(draftFromPreset('lategame'), lategame.metasets), false)
})

test('real: app receives NEW defaults that drop a metaset lategame recipes still reference → row shows', () => {
  // Regression scenario with real data: a saved lategame draft whose metaset slice was
  // trimmed to match the session's content exactly, yet its recipes/safeguards still
  // reference "Scarce (Mercurial)" — a metaset a NEW default set no longer ships.
  const lategame = presetDraftFields('lategame')
  // New defaults = lategame metasets minus "Scarce (Mercurial)".
  const droppedName = 'Scarce (Mercurial)'
  const newDefaults = lategame.metasets.filter((m) => m.name !== droppedName)
  // Sanity: the drop is real and the preset genuinely references the dropped name.
  assert.equal(newDefaults.length, lategame.metasets.length - 1)
  const referenced = collectReferencedMetasetNames(lategame.recipes, lategame.safeguardRules ?? [])
  assert.equal(referenced.has(droppedName), true)
  // Draft's metaset slice is content-equal to the new defaults (also trimmed), so the
  // content check passes — only the dangling reference can surface the row.
  const trimmedDraft: RestoreDraft = {
    Metasets: newDefaults,
    Recipes: lategame.recipes,
    Safeguards: lategame.safeguardRules ?? [],
  }
  assert.equal(metasetsEqualSession(trimmedDraft.Metasets, newDefaults), true)
  assert.equal(restoreDraftMetasetsDiffer(trimmedDraft, newDefaults), true)
})

test('real: app receives SAME defaults (lategame unchanged) → row hidden despite heavy references', () => {
  // The app ships the identical lategame defaults again. Draft metasets match and all
  // 13 referenced names resolve — the 191 recipes / 115 safeguards must NOT force the row.
  const lategame = presetDraftFields('lategame')
  const sameDefaults = presetDraftFields('lategame').metasets
  const d: RestoreDraft = {
    Metasets: lategame.metasets,
    Recipes: lategame.recipes,
    Safeguards: lategame.safeguardRules ?? [],
  }
  assert.equal(restoreDraftMetasetsDiffer(d, sameDefaults), false)
})
