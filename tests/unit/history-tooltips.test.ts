import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createHistoryBuilderBaseline,
  createBuilderConfigUpdateDescriptor,
  describeBuilderConfigUpdate,
  type TranslateFn,
} from '../../src/history/builderUpdateDescriptor.js'
import {
  createConfigAddedDescriptor,
  describeConfigAdded,
  describeConfigsDeleted,
} from '../../src/history/configCollectionDescriptors.js'
import { formatHistoryTooltipText } from '../../src/history/historyTooltip.js'
import { buildInsertionLocation, snapshotConfigLabel } from '../../src/history/historyLabelUtils.js'
import type { BuilderConfig } from '../../src/lib/hsfBuilder.js'
import type { Metaset } from '../../src/lib/metasets.js'
import { StatVariant } from '../../src/lib/types.js'

// Exported so ESLint treats this test file as a module when executed via node:test.
export function makeConfig(overrides: Partial<BuilderConfig> = {}): BuilderConfig {
  return createHistoryBuilderBaseline(overrides)
}

const metasets: Metaset[] = []

const stubT: TranslateFn = (key, params) => {
  const read = (value: string | number | undefined) => (value === undefined ? '' : String(value))
  switch (key) {
    case 'historyBuilderSavedTitle':
      return `Saved ${read(params?.label)}`
    case 'historyConfigLabel':
      return `#${read(params?.n)}`
    case 'builderConfigName':
      return 'Name'
    case 'builderAction':
      return 'Action'
    case 'historyDiffLine':
      return `${read(params?.label)}:\n  ${read(params?.previous)}\n  → ${read(params?.next)}`
    case 'historyValueEmpty':
      return '∅'
    case 'keepValueKeep':
      return 'Keep'
    case 'keepValueSell':
      return 'Sell'
    default:
      return key
  }
}

test('describeBuilderConfigUpdate summarizes changed fields', () => {
  const previous = makeConfig({ name: '', keep: true })
  const next = makeConfig({ name: 'Speed Farm', keep: false })
  const descriptor = describeBuilderConfigUpdate({
    previous,
    next,
    index: 1,
    t: stubT,
    lang: 'en-US',
    metasets,
  })
  assert.ok(descriptor, 'Expected descriptor output')
  assert.equal(descriptor?.title, 'Saved #2 - "Speed Farm"')
  assert.deepEqual(descriptor?.detailLines, [
    'Name:\n  ∅\n  → "Speed Farm"',
    'Action: Keep\u00A0→\u00A0Sell',
  ])
})

test('describeConfigAdded appends snapshot detail lines', () => {
  const cfg = makeConfig({
    mainStatsV: [StatVariant.SPD],
    substatsV: [StatVariant.RES, StatVariant.ACC],
  })
  const descriptor = describeConfigAdded({
    index: 0,
    cfg,
    location: null,
    t: stubT,
    lang: 'en-US',
    metasets,
  })
  assert.ok(descriptor.detailLines, 'expected detail lines')
  assert.ok(
    descriptor.detailLines!.some((line) => line.includes('"kind":"mainStatsSnapshot"')),
    'expected structured snapshot line',
  )
})

test('describeConfigsDeleted includes snapshot lines for single deletions', () => {
  const cfg = makeConfig({
    // Snapshot now expects set entries so exclusions can be encoded.
    artifactSets: [{ id: 1 }, { id: 2 }],
    mainStatsV: [StatVariant.HP],
  })
  const descriptor = describeConfigsDeleted({
    removed: [{ index: 0, cfg, label: snapshotConfigLabel(0, cfg) }],
    t: stubT,
    lang: 'en-US',
    metasets,
  })
  assert.ok(descriptor, 'expected descriptor output')
  assert.ok(
    descriptor!.detailLines && descriptor!.detailLines.some((line) => line.includes('"kind":"setListSnapshot"')),
    'expected set snapshot line',
  )
})

test('formatHistoryTooltipText returns fallback when no descriptor is available', () => {
  const text = formatHistoryTooltipText({
    descriptor: null,
    fallbackText: 'Undo (Ctrl+Z)',
    shortcutHintText: 'Shortcut: Ctrl+Z',
    t: stubT,
    lang: 'en-US',
  })
  assert.equal(text, 'Undo (Ctrl+Z)')
})

test('formatHistoryTooltipText includes descriptor lines without shortcut hint', () => {
  const previous = makeConfig({ name: '', keep: true })
  const next = makeConfig({ name: 'Speed Farm', keep: false })
  const descriptor = createBuilderConfigUpdateDescriptor({
    previous,
    next,
    index: 1,
    metasets,
  })
  assert.ok(descriptor, 'expected data descriptor')
  const text = formatHistoryTooltipText({
    descriptor,
    fallbackText: 'Undo (Ctrl+Z)',
    shortcutHintText: 'Shortcut: Ctrl+Z',
    t: stubT,
    lang: 'en-US',
  })
  assert.equal(
    text,
    [
      'Saved #2 - "Speed Farm"',
      '• Name:',
      '  ∅',
      '  → "Speed Farm"',
      '• Action: Keep\u00A0→\u00A0Sell',
    ].join('\n'),
  )
})

test('formatHistoryTooltipText keeps structured payloads bullet-free so icons can render', () => {
  // BuilderTooltipContent parses single-line JSON blobs; preserving the raw text allows icon fallbacks to appear.
  const cfg = makeConfig({
    artifactSets: [{ id: 9001 }],
    mainStatsV: [StatVariant.HP],
  })
  const location = buildInsertionLocation(0, [])
  const resolved = describeConfigAdded({
    index: 0,
    cfg,
    location,
    t: stubT,
    lang: 'en-US',
    metasets,
  })
  const structuredLine = resolved.detailLines?.find((line) => line.trim().startsWith('{') && line.trim().endsWith('}'))
  assert.ok(structuredLine, 'expected structured snapshot line')
  const descriptor = createConfigAddedDescriptor({
    index: 0,
    cfg,
    previous: [],
    metasets,
  })
  const text = formatHistoryTooltipText({
    descriptor,
    fallbackText: 'Undo (Ctrl+Z)',
    t: stubT,
    lang: 'en-US',
  })
  assert.ok(text.startsWith(resolved.title), 'expected title prefix')
  assert.ok(text.includes(structuredLine!), 'expected structured line to appear')
  assert.ok(!text.includes(`• ${structuredLine}`), 'expected structured line to remain bullet-free')
})

export {}
