import test from 'node:test'
import assert from 'node:assert/strict'
import { filterHsfRules, sanitizeRulesFilterState } from '../src/lib/rulesFilter.js'

test('sanitizeRulesFilterState repairs missing required sub-objects', () => {
  // Why: localStorage can be partially-written, leaving required nodes undefined.
  const broken = {
    sets: { selected: ['1'], anyMode: 'include' },
    // Completely missing/invalid required sections.
    main: undefined,
    sub: undefined,
    faction: null,
    slots: undefined,
    rank: undefined,
    rarity: undefined,
    level: null,
  }

  const state = sanitizeRulesFilterState(broken)
  assert.ok(state.sets)
  assert.ok(Array.isArray(state.sets.selected))
  assert.ok(state.slots)
  assert.ok(Array.isArray(state.slots.selected))
  assert.ok(state.rank)
  assert.ok(Array.isArray(state.rank.selected))
  assert.ok(state.rarity)
  assert.ok(Array.isArray(state.rarity.selected))
  assert.ok(state.level)
  assert.ok(Array.isArray(state.level.selected))
  assert.ok(state.main)
  assert.ok(Array.isArray(state.main.selected))
  assert.ok(state.sub)
  assert.ok(Array.isArray(state.sub.selected))
  assert.ok(Array.isArray(state.sub.notSelected))
  assert.ok(state.faction)
  assert.ok(Array.isArray(state.faction.selected))
})

test('filterHsfRules does not throw after sanitizing storage payloads', () => {
  // This mirrors the crash signature (`.map` on undefined) seen when storage hydration
  // produced a partial RulesFilterState.
  const state = sanitizeRulesFilterState({ sub: { notSelected: null } })
  assert.doesNotThrow(() => {
    filterHsfRules([], state)
  })
})

export const __brokenLocalstorageRulesFilterTestMarker = true
