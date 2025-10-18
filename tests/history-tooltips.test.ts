/* eslint-disable import/no-unused-modules -- node:test suites execute on import and do not export symbols */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeBuilderConfigUpdate, type TranslateFn } from '../src/history/builderUpdateDescriptor.js'
import { formatHistoryTooltipText } from '../src/history/historyTooltip.js'
import type { BuilderConfig } from '../src/lib/hsfBuilder.js'
import type { Metaset } from '../src/lib/metasets.js'

function makeConfig(overrides: Partial<BuilderConfig> = {}): BuilderConfig {
  return {
    name: '',
    keep: true,
    visibility: 'enabled',
    rankCode: 0,
    rarityCode: 0,
    rarityMode: 'auto',
    autoRaritySupplementsThreshold: 'rare',
    factionCode: 0,
    mainStatsV: [],
    minLevel: 0,
    maxLevel: 16,
    earlyKeepMode: 'early',
    rollBaseline: 'afterStart',
    rollMode: 'auto',
    substatsV: [],
    fixedSubstatsV: [],
    minCount: 0,
    autoMinCount: true,
    autoSubstatFlex: false,
    minRequiredRolls: 0,
    autoMinRequiredRolls: true,
    ...overrides,
  }
}

const metasets: Metaset[] = []

const stubT: TranslateFn = (key, params) => {
  const read = (value: string | number | undefined) => (value === undefined ? '' : String(value))
  switch (key) {
    case 'historyBuilderSavedTitle':
      return `Saved ${read(params?.label)}`
    case 'historyConfigLabel':
      return `Config #${read(params?.n)}`
    case 'builderConfigName':
      return 'Name'
    case 'builderAction':
      return 'Action'
    case 'historyDiffLine':
      return `${read(params?.label)}: ${read(params?.previous)} → ${read(params?.next)}`
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
    metasets,
  })
  assert.ok(descriptor, 'Expected descriptor output')
  assert.equal(descriptor?.title, 'Saved Config #2 - "Speed Farm"')
  assert.deepEqual(descriptor?.detailLines, [
    'Name: ∅ → "Speed Farm"',
    'Action: Keep → Sell',
  ])
})

test('formatHistoryTooltipText returns fallback when no descriptor is available', () => {
  const text = formatHistoryTooltipText({
    descriptor: null,
    fallbackText: 'Undo (Ctrl+Z)',
    shortcutHintText: 'Shortcut: Ctrl+Z',
  })
  assert.equal(text, 'Undo (Ctrl+Z)')
})

test('formatHistoryTooltipText includes descriptor lines and shortcut hint', () => {
  const text = formatHistoryTooltipText({
    descriptor: {
      title: 'Saved Config #2 - "Speed Farm"',
      detailLines: ['Name: ∅ → "Speed Farm"', '   ', '\tAction: Keep → Sell'],
    },
    fallbackText: 'Undo (Ctrl+Z)',
    shortcutHintText: 'Shortcut: Ctrl+Z',
  })
  assert.equal(
    text,
    ['Saved Config #2 - "Speed Farm"', '• Name: ∅ → "Speed Farm"', '• Action: Keep → Sell', 'Shortcut: Ctrl+Z'].join('\n'),
  )
})
