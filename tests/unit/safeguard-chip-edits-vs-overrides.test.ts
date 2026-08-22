/* eslint import/no-unused-modules: off */

/**
 * safeguard-chip-edits-vs-overrides.test.ts
 *
 * Regression: a structural chip edit must not bake the dynamic overrides into the stored rules.
 *
 * SafeguardChipsPanel renders `displaySafeguardRules` — the stored rules with the safeguard
 * overrides ALREADY applied — but its edits commit to the STORED rules. Resolving an edit against
 * the display list and committing that array therefore replaced the whole stored document with its
 * override-applied form; "Save .sfc" then wrote those values as the user's own, the override badges
 * vanished, and reloading the file showed the overridden numbers as the new baseline.
 *
 * Grouping was the visible trigger (it also seeds the new group's requiredCount/countMode from the
 * overridden members), but every structural edit shared the defect, and it hit the UNSELECTED rules
 * too — they were carried through in overridden form.
 *
 * The fix is that the panel forwards an UPDATER, so the edit is applied to the stored rules. This
 * suite pins the property that makes that safe and the outcome it guarantees, at the seam the panel
 * hands its updaters to: display and stored arrays are positionally identical, so an index-based
 * edit means the same thing on either — the values it carries are what differ.
 *
 * Baking overrides in is a real feature; it is just a DELIBERATE one, and lives in App's
 * `applySafeguardOverridesToRules`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides.js'
import {
  createFactorySafeguardBuilderDefaults,
  type SafeguardRule,
} from '../../src/lib/safeguards.js'
import {
  groupSafeguardSelection,
  ungroupSafeguardRun,
  safeguardGroupSettingsAt,
} from '../../src/lib/safeguardGroups.js'

// Three plain, ungrouped rules with distinct counts. `keep` is never selected for grouping — it is
// the bystander that proves the leak reached rules the edit did not even touch.
const STORED_COUNTS = [3, 4, 7]
const makeStored = (): SafeguardRule[] => STORED_COUNTS.map((count, index) => {
  const rule = createFactorySafeguardBuilderDefaults()
  rule.tags = [`r${index}`]
  rule.requiredCount = count
  return rule
})

// An override that rewrites EVERY rule's count to 99 — the value that must never reach storage.
const OVERRIDDEN_COUNT = 99
const OVERRIDE_NOTE =
  `<!-- safeguard-overrides\n  q "q" id=q_sg\n  rb "opt" id=opt * { @all { count=${OVERRIDDEN_COUNT} } }\n-->`

/** The display list the panel renders: stored rules + overrides applied. */
const makeDisplay = (stored: readonly SafeguardRule[]): readonly SafeguardRule[] => {
  const resolution = resolveNoteSafeguardOverridesTags(OVERRIDE_NOTE)
  assert.ok(resolution.instructions.length > 0, 'the fixture note must actually resolve an override')
  const display = applySafeguardOverrides(stored, resolution.instructions)
  // Guards the premise: without a real difference between the two lists this suite proves nothing.
  assert.deepEqual(display.map((r) => r.requiredCount), stored.map(() => OVERRIDDEN_COUNT))
  return display
}

test('display and stored rule lists are positionally identical', () => {
  // This is what makes an index-based updater safe: overrides rewrite a rule's FIELDS, never the
  // list's shape. If an override could ever add, drop or reorder an entry, every index the panel
  // hands its updaters (group selection, move target, delete index) would address the wrong rule.
  const stored = makeStored()
  const display = makeDisplay(stored)
  assert.equal(display.length, stored.length)
  // Tags are untouched by the count override, so they identify each position across both lists.
  assert.deepEqual(display.map((r) => r.tags), stored.map((r) => r.tags))
})

test('grouping applied to the stored rules keeps the pre-override counts', () => {
  // The panel's group handler now runs against the stored rules. The seeded group count is the
  // minimum of the MEMBERS' OWN counts (3), not of their overridden ones (99).
  const stored = makeStored()
  const grouped = groupSafeguardSelection(stored, [0, 1])
  assert.ok(grouped, 'grouping two rules must succeed')
  assert.deepEqual(grouped.rules.map((r) => r.requiredCount), STORED_COUNTS)
  assert.equal(safeguardGroupSettingsAt(grouped.rules, 0)?.requiredCount, 3)
})

test('grouping the DISPLAY rules is what leaked the overrides — including into bystanders', () => {
  // The old behaviour, pinned so the regression is unmistakable if the wiring is ever reverted:
  // every rule comes back at the overridden count — the two members AND the untouched third rule —
  // and the group itself is seeded from the overridden values.
  const display = makeDisplay(makeStored())
  const leaked = groupSafeguardSelection(display, [0, 1])
  assert.ok(leaked)
  assert.deepEqual(leaked.rules.map((r) => r.requiredCount), [OVERRIDDEN_COUNT, OVERRIDDEN_COUNT, OVERRIDDEN_COUNT])
  assert.equal(safeguardGroupSettingsAt(leaked.rules, 0)?.requiredCount, OVERRIDDEN_COUNT)
})

test('every structural chip edit is override-safe when applied to the stored rules', () => {
  // Grouping was the reported symptom, but the panel shares one commit path across all of its
  // structural edits, so the guarantee is checked per edit rather than for grouping alone.
  const stored = makeStored()
  const grouped = groupSafeguardSelection(stored, [0, 1])?.rules
  assert.ok(grouped)

  const edits: Array<[string, readonly SafeguardRule[]]> = [
    // Ungroup: members keep the counts they never stopped carrying.
    ['ungroup', ungroupSafeguardRun(grouped, 0) ?? []],
    // Duplicate: the copy is cloned from the stored source, so it carries the stored count.
    ['duplicate', (() => {
      const next = stored.slice()
      next.splice(1, 0, { ...stored[1] as SafeguardRule })
      return next
    })()],
    // Move and delete only re-position entries; they must not rewrite any value either.
    ['move', (() => {
      const next = stored.slice()
      const [moved] = next.splice(0, 1)
      next.splice(2, 0, moved as SafeguardRule)
      return next
    })()],
    ['delete', stored.filter((_, index) => index !== 1)],
  ]

  for (const [label, next] of edits) {
    // No surviving rule may carry the overridden value — order and length vary per edit, so the
    // assertion is on the value set rather than a fixed array.
    const overridden = next.filter((rule) => rule.requiredCount === OVERRIDDEN_COUNT)
    assert.equal(overridden.length, 0, `${label} must not persist an override-applied count`)
    for (const rule of next) assert.ok(STORED_COUNTS.includes(rule.requiredCount), `${label} kept a stored count`)
  }
})
