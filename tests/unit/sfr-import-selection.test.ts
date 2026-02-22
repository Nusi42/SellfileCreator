import test from 'node:test'
import assert from 'node:assert/strict'
import { getMetasetDependencyIssues } from '../../src/lib/sfrImportSelection.js'

// Recipes that reference incoming metasets must require metaset import/restore.
test('recipes cannot be imported without metasets when incoming metasets are referenced', () => {
  const issues = getMetasetDependencyIssues({
    selection: { recipes: true, safeguards: false, metasets: false },
    incomingMetasetIds: new Set(['meta_a']),
    recipeMetasetIds: new Set(['meta_a']),
    safeguardMetasetIds: new Set(),
  })
  assert.deepEqual(issues, ['recipesRequireMetasets'])
})

// Safeguards enforce the same dependency rule independently of recipes.
test('safeguards cannot be imported without metasets when incoming metasets are referenced', () => {
  const issues = getMetasetDependencyIssues({
    selection: { recipes: false, safeguards: true, metasets: false },
    incomingMetasetIds: new Set(['meta_keep']),
    recipeMetasetIds: new Set(),
    safeguardMetasetIds: new Set(['meta_keep']),
  })
  assert.deepEqual(issues, ['safeguardsRequireMetasets'])
})

// Importing metasets directly clears the dependency gate for all sections.
test('importing metasets satisfies recipe and safeguard dependency checks', () => {
  const issues = getMetasetDependencyIssues({
    selection: { recipes: true, safeguards: true, metasets: true },
    incomingMetasetIds: new Set(['meta_1']),
    recipeMetasetIds: new Set(['meta_1']),
    safeguardMetasetIds: new Set(['meta_1']),
  })
  assert.deepEqual(issues, [])
})

export const __sfrImportSelectionTestMarker = true
