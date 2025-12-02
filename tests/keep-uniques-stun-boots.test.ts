/* eslint import/no-unused-modules: off */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultMetasets } from '../src/lib/metasets.js'
import { defaultSubstatTargets } from '../src/lib/hsfBuilder.js'
import { parseHsfcText } from '../src/lib/hsfcIO.js'
import { importGearDatabaseFromArrayBuffer } from '../src/lib/importers/gearDbImporter.js'
import {
  computeKeepUniqueProtection,
  collectKeepUniqueCandidates,
  resolveKeepUniqueRulesWithMetasets,
} from '../src/lib/keepUniques.js'
import { computeMergedRules, RULE_SOURCE_KEEP_UNIQUES } from '../src/lib/merge.js'
import { evaluateMatchesByConfig } from '../src/lib/ruleEval.js'
import { ArtifactSet, ArtifactType, StatVariant } from '../src/lib/types.js'

// Use cwd so compiled tests resolve fixtures consistently.
const hsfcPath = join(process.cwd(), 'examples', 'ForKeeptest.hsfc')
const dbPath = join(process.cwd(), 'examples', '251129_181328.db')

// Keep unique rules must stay consistent between detection and tester matches.
const bufferToArrayBuffer = (buffer: Buffer): ArrayBuffer => Uint8Array.from(buffer).buffer

test('keep-unique detection aligns with tester matches for ATK% Stun boots', async () => {
  // HSFC parsing needs a stable baseline so metasets/substat minima match the UI defaults.
  const baseMetasets = defaultMetasets()
  const baseSubstatTargets = defaultSubstatTargets()
  const hsfcText = readFileSync(hsfcPath, 'utf8')
  const parsed = parseHsfcText(hsfcText, { metasets: baseMetasets, substatTargets: baseSubstatTargets })
  // Resolve metasets up front so detection + merge paths see identical rule shapes.
  const resolvedKeepUniqueRules = resolveKeepUniqueRulesWithMetasets(parsed.keepUniqueRules, parsed.metasets)
  const keepUniquesEnabled = parsed.keepUniquesEnabled && resolvedKeepUniqueRules.length > 0
  const keepUniqueInput = { enabled: keepUniquesEnabled, rules: resolvedKeepUniqueRules, detection: null }
  const configModes = parsed.cfgs.map((cfg) => cfg.exportMode ?? 'active')

  // Combine inventory and inbox artifacts to mirror the tester dataset.
  const dbBuffer = readFileSync(dbPath)
  const { artifacts, inboxArtifacts } = await importGearDatabaseFromArrayBuffer(bufferToArrayBuffer(dbBuffer))
  const gear = [...artifacts, ...inboxArtifacts]

  // Baseline merge excludes Keep Unique injections so detection can see sold items.
  const mergedBaseline = computeMergedRules({
    hsf: null,
    customCfgs: parsed.cfgs,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    finalSellRemainder: parsed.finalSellRemainder,
    keepUniques: keepUniqueInput,
  })
  const toPreviewMatch = (result: ReturnType<typeof evaluateMatchesByConfig>['firstMatch']) => {
    if (!result) return null
    const rule = mergedBaseline[result.ruleIndex]
    const cfgIdx = result.cfgIdx ?? null
    return {
      ruleIndex: result.ruleIndex,
      keep: result.keep,
      cfgIdx,
      cfgName: null,
      ruleLabel: null,
      ruleSource: rule?.__source ?? null,
    }
  }
  const baselineRows = gear.map((artifact) => {
    const baseEval = evaluateMatchesByConfig(
      mergedBaseline,
      artifact.testerItem,
      { configModes, excludeSources: [RULE_SOURCE_KEEP_UNIQUES] },
    )
    return {
      artifact,
      match: null,
      baseMatch: toPreviewMatch(baseEval.firstNonExcludedMatch ?? baseEval.firstMatch ?? null),
      matchingCfgIndices: baseEval.matchingConfigIndices,
      matchingConfigDecisions: baseEval.matchingConfigDecisions,
    }
  })

  // Detection snapshot drives keep-rule generation and the Keep Uniques UI.
  const keepUniqueCandidates = collectKeepUniqueCandidates({
    rows: baselineRows,
    baseRules: mergedBaseline,
    configModes,
  })
  const detection = computeKeepUniqueProtection({
    candidates: keepUniqueCandidates.candidates,
    rules: resolvedKeepUniqueRules,
    enabled: keepUniquesEnabled,
  })

  // Final merge includes Keep Unique injections so rule evaluation mirrors the tester grid.
  const mergedFinal = computeMergedRules({
    hsf: null,
    customCfgs: parsed.cfgs,
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    finalSellRemainder: parsed.finalSellRemainder,
    keepUniques: { ...keepUniqueInput, detection },
  })

  const targetBoots = gear.filter((artifact) => (
    artifact.slot === ArtifactType.Boots
    && artifact.set === ArtifactSet.Stun
    && artifact.mainStat?.variant === StatVariant.ATK
  ))
  assert.ok(targetBoots.length >= 2, 'expected at least two ATK% Stun boots in fixture DB')

  // Detection drives itemKey filtering; merge results need to honor the same items.
  const keepUniqueItemIds = new Set<number>()
  for (const entry of detection.entries) {
    for (const artifact of entry.artifacts) keepUniqueItemIds.add(artifact.itemKey)
  }

  // Map each target to the merged-rule source to verify Keep Unique rows actually apply.
  const mismatched = targetBoots.map((artifact, idx) => {
    const itemId = Number((artifact.testerItem as { itemId?: number } | undefined)?.itemId ?? artifact.id ?? idx)
    const fullEval = evaluateMatchesByConfig(mergedFinal, artifact.testerItem, { configModes })
    const source = fullEval.firstMatch ? mergedFinal[fullEval.firstMatch.ruleIndex]?.__source ?? null : null
    return { itemId, matchSource: source, markedForKeepUnique: keepUniqueItemIds.has(itemId) }
  }).filter((entry) => entry.matchSource !== RULE_SOURCE_KEEP_UNIQUES || !entry.markedForKeepUnique)

  if (mismatched.length > 0) {
    throw new Error(`keep-unique detection should match tester keep sources for Stun boots: ${JSON.stringify(mismatched)}`)
  }
})
