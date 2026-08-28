/**
 * The file router's override-set branch.
 *
 * Drag/drop and the manual picker both route on filename alone, so these tests pin
 * the one property that makes that possible: an override-set backup is recognizable
 * from its name, and nothing else is mistaken for one.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { routeFileByExtension, type FileRouteHandlers } from '../../src/hooks/useFileDragDrop.js'
import { dynamicOverridesPresetFilename } from '../../src/lib/dynamicOverridesPresetFile.js'

// The router only ever reads `name`, so a bare object stands in for a real File.
const fileNamed = (name: string): File => ({ name }) as unknown as File

// Records which branch fired, so a misroute names the handler that wrongly won.
function routeAndRecord(name: string): Promise<string> {
  let hit = 'none'
  const mark = (key: string) => () => { hit = key }
  const handlers: FileRouteHandlers = {
    onSfc: mark('sfc'),
    onHsf: mark('hsf'),
    onL10n: mark('l10n'),
    onGearDb: mark('gearDb'),
    onGearSets: mark('gearSets'),
    onDynamicOverrides: mark('dynamicOverrides'),
    onUnknownFile: mark('unknown'),
  }
  return routeFileByExtension(fileNamed(name), handlers).then(() => hit)
}

test('an exported override-set backup routes to the overrides handler', async () => {
  assert.equal(await routeAndRecord(dynamicOverridesPresetFilename(new Date(2026, 7, 28))), 'dynamicOverrides')
  // The bare variant, for a download that lost its `.json` tail.
  assert.equal(await routeAndRecord('backup.overrides'), 'dynamicOverrides')
  // Mixed case must route the same — the router lowercases first.
  assert.equal(await routeAndRecord('Backup.Overrides.JSON'), 'dynamicOverrides')
})

test('sibling formats keep their own routes', async () => {
  // A plain .json is still unknown: that is what kept the old bare extension
  // unroutable, and is why the export uses a compound suffix.
  assert.equal(await routeAndRecord('anything.json'), 'unknown')
  assert.equal(await routeAndRecord('patch.gearsets.json'), 'gearSets')
  assert.equal(await routeAndRecord('patch.l10n.json'), 'l10n')
  assert.equal(await routeAndRecord('recipes.sfc'), 'sfc')
  assert.equal(await routeAndRecord('sellfile.hsf'), 'hsf')
})

test('without an overrides handler the file falls through to unknown', async () => {
  // Callers that do not opt in must not crash — the branch is guarded on the handler.
  let hit = 'none'
  await routeFileByExtension(fileNamed('backup.overrides.json'), {
    onSfc: () => { hit = 'sfc' },
    onHsf: () => { hit = 'hsf' },
    onUnknownFile: () => { hit = 'unknown' },
  })
  assert.equal(hit, 'unknown')
})
