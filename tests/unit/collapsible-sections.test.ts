/* eslint import/no-unused-modules: off */

/**
 * The two collapsible-section headers — BuilderSectionHeader and the rules filter's
 * FilterSectionHeader — are kept parallel by hand. Their shared RULES now live in
 * lib/collapsibleSections.ts; these tests pin that behaviour so a change cannot silently
 * alter one panel's semantics, which is exactly what the hand-sync could not prevent.
 */

import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

import {
  createSectionToggler,
  defaultSectionToggleAriaLabel,
  isCollapsedWithContent,
  type CollapsedSectionMap,
} from '../../src/lib/collapsibleSections.js'
import { BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS } from '../../src/state/builderPreferences.js'
import { RULES_FILTER_COLLAPSIBLE_SECTION_IDS } from '../../src/state/rulesFilterPersistence.js'

// A tiny id set keeps the toggle assertions readable; the real id lists are exercised further down.
const IDS = ['alpha', 'beta', 'gamma'] as const
type TestId = typeof IDS[number]
const mapOf = (value: boolean): CollapsedSectionMap<TestId> =>
  Object.fromEntries(IDS.map((id) => [id, value])) as CollapsedSectionMap<TestId>

const toggleOnce = (
  collapsed: CollapsedSectionMap<TestId>,
  target: TestId,
  applyToAll: boolean,
): CollapsedSectionMap<TestId> => {
  let next = collapsed
  createSectionToggler(IDS, collapsed, (value) => { next = value })(target, applyToAll)
  return next
}

test('a plain toggle flips only the target section', () => {
  const next = toggleOnce(mapOf(false), 'beta', false)
  assert.deepEqual(next, { alpha: false, beta: true, gamma: false })
})

test('toggle-all drives every section from the TARGET\'s next value', () => {
  // The subtlety worth pinning: bulk apply does not invert each section independently — it
  // copies the target's next state, so one gesture yields a uniform panel either way.
  const mixed: CollapsedSectionMap<TestId> = { alpha: true, beta: false, gamma: true }
  // beta is expanded → its next value is collapsed → everything collapses.
  assert.deepEqual(toggleOnce(mixed, 'beta', true), { alpha: true, beta: true, gamma: true })
  // alpha is collapsed → its next value is expanded → everything expands.
  assert.deepEqual(toggleOnce(mixed, 'alpha', true), { alpha: false, beta: false, gamma: false })
})

test('the toggler never mutates the map it was given', () => {
  // Both panels hold this state in a store; an in-place edit would defeat change detection.
  const original = mapOf(false)
  const snapshot = { ...original }
  toggleOnce(original, 'gamma', true)
  assert.deepEqual(original, snapshot)
})

test('the highlight fires only when collapsed AND dirty', () => {
  assert.equal(isCollapsedWithContent(true, true), true)
  assert.equal(isCollapsedWithContent(true, false), false)
  assert.equal(isCollapsedWithContent(false, true), false)
  // Both flags are optional at the call sites; undefined must read as "no".
  assert.equal(isCollapsedWithContent(undefined, true), false)
  assert.equal(isCollapsedWithContent(true, undefined), false)
})

test('the default chevron aria-label describes the ACTION, not the state', () => {
  // A collapsed section's button expands it — naming it "Collapse" would invert the meaning.
  // The strings are injected (callers pass t(...)), so this asserts the CHOICE, not English.
  assert.equal(defaultSectionToggleAriaLabel(true, 'expand-label', 'collapse-label'), 'expand-label')
  assert.equal(defaultSectionToggleAriaLabel(false, 'expand-label', 'collapse-label'), 'collapse-label')
})

test('every catalog defines both chevron aria-label keys, distinctly', () => {
  // The labels are localized now; a catalog missing either key would render the key name as an
  // accessible label, and identical values would make the two chevrons indistinguishable.
  const catalogDir = resolve(process.cwd(), 'src/lib/i18n/catalogs')
  const files = readdirSync(catalogDir).filter((name) => name.endsWith('.ts'))
  assert.ok(files.length >= 10, 'all shipped locales are covered')
  for (const file of files) {
    const source = readFileSync(resolve(catalogDir, file), 'utf-8')
    const expand = source.match(/^\s*sectionToggleExpandAria: "(.*)",$/m)?.[1]
    const collapse = source.match(/^\s*sectionToggleCollapseAria: "(.*)",$/m)?.[1]
    assert.ok(expand, `${file} defines sectionToggleExpandAria`)
    assert.ok(collapse, `${file} defines sectionToggleCollapseAria`)
    assert.notEqual(expand, collapse, `${file} distinguishes expand from collapse`)
  }
})

test('both panels\' real id lists work with the shared toggler', () => {
  // Guards the generic: each panel keeps its own id union, and toggle-all must cover every
  // id in that panel's list — including the paired anomalous sub-groups added alongside them.
  for (const ids of [BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS, RULES_FILTER_COLLAPSIBLE_SECTION_IDS]) {
    const collapsed = Object.fromEntries(ids.map((id) => [id, false])) as Record<string, boolean>
    let next: Record<string, boolean> = collapsed
    createSectionToggler(ids as readonly string[], collapsed, (value) => { next = value })(ids[0]!, true)
    assert.equal(Object.keys(next).length, ids.length)
    assert.ok(ids.every((id) => next[id] === true), 'every section collapsed in one gesture')
  }
  // The sub-group ids are part of those lists, so they participate in toggle-all too.
  assert.ok(BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS.includes('substatsAnomalous'))
  assert.ok((RULES_FILTER_COLLAPSIBLE_SECTION_IDS as readonly string[]).includes('subAnomalous'))
})
