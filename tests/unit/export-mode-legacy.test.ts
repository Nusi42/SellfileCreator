/* eslint import/no-unused-modules: "off" */
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveExportModeField, normalizeExportModeFields, type SellfileExportMode } from '../../src/lib/hsfBuilder.js'

test('resolveExportModeField accepts legacy SellfileVisibility string', () => {
  const mode = resolveExportModeField({ SellfileVisibility: 'Draft' })
  assert.equal(mode, 'separator')
})

test('resolveExportModeField accepts legacy sellfileMode and enabled flag', () => {
  const mode = resolveExportModeField({ sellfileMode: 'Hidden' as unknown as SellfileExportMode, enabled: false })
  assert.equal(mode, 'disabled')
})

test('normalizeExportModeFields strips legacy fields after normalization', () => {
  const normalized = normalizeExportModeFields({
    name: 'Legacy sample',
    SellfileVisibility: 'Enabled',
    sellfileMode: 'Draft' as unknown as SellfileExportMode,
    enabled: false,
  })
  assert.equal(normalized.exportMode, 'active')
  assert.ok(!('SellfileVisibility' in normalized))
  assert.ok(!('sellfileMode' in normalized))
  assert.ok(!('enabled' in normalized))
})

test('normalizeExportModeFields honors sellfileMode when visibility is absent', () => {
  const normalized = normalizeExportModeFields({
    name: 'Legacy separator',
    sellfileMode: 'Draft' as unknown as SellfileExportMode,
  })
  assert.equal(normalized.exportMode, 'separator')
})

// Keep the module boundary explicit so lint rules that check for exports do not warn.
export {}
