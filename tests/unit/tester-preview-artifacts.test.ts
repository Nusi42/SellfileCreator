/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import { ArtifactSet, ArtifactType, type LevelMilestone, type RankValue } from '../../src/lib/types.js'
import { buildPreviewArtifactFromTesterItem } from '../../src/lib/testerPreviewArtifacts.js'
import type { TestItem } from '../../src/lib/ruleEval.js'

test('buildPreviewArtifactFromTesterItem carries exactLevel from preview extras', () => {
  const item: TestItem = {
    slot: ArtifactType.Helmet,
    set: ArtifactSet.Speed,
    rank: 6 as RankValue,
    rarity: 5 as RankValue,
    level: 12 as LevelMilestone,
    previewExtras: {
      exactLevel: 13,
    },
  }

  const artifact = buildPreviewArtifactFromTesterItem(item)
  assert.equal(artifact.level, 12)
  assert.equal(artifact.exactLevel, 13)
})

export {}
