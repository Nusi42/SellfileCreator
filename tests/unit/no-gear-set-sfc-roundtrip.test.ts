import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseSfcText, buildReadableRecipe } from '../../src/lib/sfcIO.js'
import { ACCESSORY_NO_SET_ID } from '../../src/lib/constants.js'
import type { SubstatTargetTable } from '../../src/lib/hsfBuilder/types.js'

const fixtureText = readFileSync(
  join(process.cwd(), 'tests', 'data', 'no-gear-set-recipes.sfc'),
  'utf-8',
)

const EMPTY_SUBSTAT_TARGETS: SubstatTargetTable = {
  one: {}, two: {}, three: {}, four: {}, five: {}, six: {},
  anyRankDefaultsTo: 6,
}
const EMPTY_PREV = { metasets: [], substatTargets: EMPTY_SUBSTAT_TARGETS }

// Loading: "No Gear-Set" written as {"name": "No Gear-Set"} in the SFC must
// resolve to ACCESSORY_NO_SET_ID (-99) rather than being silently dropped.
test('parseSfcText resolves "No Gear-Set" name to ACCESSORY_NO_SET_ID (-99)', () => {
  const { recipes } = parseSfcText(fixtureText, EMPTY_PREV)
  assert.equal(recipes.length, 3, 'all three recipes should load')
  for (const recipe of recipes) {
    const sets = recipe.artifactSets ?? []
    assert.equal(sets.length, 1, `recipe "${recipe.appearance?.name}" should have exactly one set entry`)
    assert.equal(
      Number(sets[0]!.id),
      ACCESSORY_NO_SET_ID,
      `recipe "${recipe.appearance?.name}" set id should be -99`,
    )
  }
})

// Saving: a recipe with -99 in artifactSets must serialize back to the canonical
// "No Gear-Set" name so the SFC stays human-readable and reloadable.
test('buildReadableRecipe serializes ACCESSORY_NO_SET_ID (-99) as "No Gear-Set"', () => {
  const { recipes } = parseSfcText(fixtureText, EMPTY_PREV)
  for (const recipe of recipes) {
    const readable = buildReadableRecipe(recipe, [])
    const setNames = readable.artifactSetNames ?? []
    assert.equal(setNames.length, 1, `serialized recipe should have one artifactSetNames entry`)
    assert.equal(
      (setNames[0] as { name?: string } | undefined)?.name,
      'No Gear-Set',
      `serialized set name should be "No Gear-Set", not the raw id`,
    )
  }
})

// Round-trip: parse → serialize → re-parse must produce the same -99 set selection.
test('no-gear-set SFC fixture survives a full parse → serialize → re-parse round-trip', () => {
  const { recipes: firstLoad } = parseSfcText(fixtureText, EMPTY_PREV)
  // Rebuild the SFC text from the first parse.
  const reserializedText = JSON.stringify({
    Version: '0.9.23-dev',
    Metasets: [],
    Recipes: firstLoad.map((r) => buildReadableRecipe(r, [])),
  })
  const { recipes: secondLoad } = parseSfcText(reserializedText, EMPTY_PREV)
  assert.equal(secondLoad.length, firstLoad.length, 're-parsed recipe count must match')
  for (let i = 0; i < secondLoad.length; i++) {
    const sets = secondLoad[i]!.artifactSets ?? []
    assert.equal(sets.length, 1, `round-trip recipe ${i} should retain one set entry`)
    assert.equal(
      Number(sets[0]!.id),
      ACCESSORY_NO_SET_ID,
      `round-trip recipe ${i} set id should still be -99`,
    )
  }
})
