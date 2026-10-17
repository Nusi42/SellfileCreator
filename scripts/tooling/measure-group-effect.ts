#!/usr/bin/env node
/**
 * measure-group-effect.ts
 *
 * Answers "what does this group actually keep, and does grouping change anything?" by driving
 * the REAL pipeline against a preset + DB and reporting, per rule, how many pieces each entry
 * protects — once with the run under measurement grouped, once with every group stripped.
 *
 * Written to settle a concrete question: should the lategame preset group its four SPD-main
 * damage feeders (entries 37-40, `Protect: Damage - Across Sets`)? Their filters overlap
 * heavily, so the claim that grouping tightens what they keep needed measuring rather than
 * reasoning from filter shapes — and it measured inert, so the preset ships them UNGROUPED (see
 * lategame-preset-design.md). Point MGE_GROUP at any run to reuse it: when the stored rules
 * already carry the group its settings are used, otherwise the tool FORMS the group (head's own
 * count and chips unless MGE_GROUP_COUNT says otherwise) so the question stays answerable
 * against a preset that ships ungrouped.
 *
 * Usage:
 *   npx tsc -p tsconfig.scripts.json --noEmit false && node scripts/tooling/patch-esm-specifiers.cjs \
 *     && node --experimental-wasm-modules \
 *        tmp/tsc/scripts/scripts/tooling/measure-group-effect.js
 */
import { resolve as resolvePath } from 'node:path'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import {
  resolveSafeguardRulesWithMetasets,
  collectAndComputeSafeguardProtection,
  storeArtifactRows,
  toWasmArtifactStoreRow,
  type SafeguardRule,
  type SafeguardDetectionEntry,
} from '../../src/lib/safeguards.js'
import { computeMergedRules } from '../../src/lib/merge.js'
import { configureWasmRuleEngineWithLoadedWasm } from '../../src/lib/wasm/wasmRuleEngine.js'
import {
  resolveRecipeOverridesTags,
  recipeAnswersSelectingToken,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import {
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides.js'
import type { GearInspectorPreviewRow } from '../../src/types/gearInspectorPreview.js'
import { GEAR_DB_FIXTURES, ensureGearDb } from '../../scripts/test/gear-db-fixtures.mjs'
import { loadGear, loadSfc, prepareHeadlessRuleEngine } from './lib/headless-pipeline.js'

// ── Scenario knobs (env vars) — defaults reproduce the shipped-preset question ──
// MGE_SFC           SFC to measure                       (presets/lategame.sfc)
// MGE_DB            RSL Helper DB                        (account-d gear-db fixture)
// MGE_GROUP         comma-separated Safeguards indices    (37,38,39,40)
// MGE_MODE          account-mode option token for overrides, or "none" to skip the note
//                   entirely, i.e. "dynamic overrides disabled" in the app   (lategame)
// MGE_DROP_BEFORE   1 = drop every entry before the run, so nothing earlier can pre-protect
// MGE_MEMBER_COUNT  override each member's own requiredCount (its FEED size)
// MGE_GROUP_COUNT   override the group's requiredCount (what it KEEPS); when the stored rules
//                   carry no group, this is the count the formed group gets (default: the
//                   head member's own count)
// MGE_WEIGHT_SCALE  multiply every member weight EXCEPT the ones every member shares by this
//                   factor — amplifies whatever already distinguishes the members, so "do the
//                   members' yardsticks disagree at the cutoff?" can be tested directly
const env = (key: string): string | undefined => {
  const value = process.env[key]
  return value !== undefined && value !== '' ? value : undefined
}
// A numeric knob. Anything that is not a finite number is a typo, and a typo must not turn into
// `NaN` indices or a `NaN` required count that silently measures nothing.
const envNumber = (key: string): number | null => {
  const raw = env(key)
  if (raw === undefined) return null
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${key}=${raw} is not a number`)
  return value
}
const SFC_PATH = env('MGE_SFC') ?? 'presets/lategame.sfc'
const DB_PATH = env('MGE_DB') ?? ensureGearDb(GEAR_DB_FIXTURES.accountD)
const GROUP_INDICES = (env('MGE_GROUP') ?? '37,38,39,40').split(',').map((raw) => {
  const index = Number(raw.trim())
  if (!Number.isInteger(index) || index < 0) throw new Error(`MGE_GROUP index '${raw}' is not a rule index`)
  return index
})
// "Dynamic overrides disabled" sentinel for MGE_MODE.
const MODE_NONE = 'none'
const ACCOUNT_MODE = env('MGE_MODE') ?? 'lategame'
const DROP_BEFORE = env('MGE_DROP_BEFORE') === '1'
const MEMBER_COUNT = envNumber('MGE_MEMBER_COUNT')
const GROUP_COUNT = envNumber('MGE_GROUP_COUNT')
const WEIGHT_SCALE = envNumber('MGE_WEIGHT_SCALE')
// Group id stamped on the run when the tool forms the group itself.
const FORMED_GROUP_ID = 'mge'

// ── Report layout ─────────────────────────────────────────────────────────────
// Per-rule lines read `[NN] <name> keeps <n>`; total lines pad their label past the index prefix
// so every count sits in the same column. One place for the widths, so a change cannot misalign
// one line and not another.
const NAME_COLUMN = 32
const INDEX_PREFIX = '[NN] '.length
const COUNT_COLUMN = 4
// Item keys are printed inline only for sets small enough to eyeball.
const INLINE_KEYS_MAX = 12
// How many rows past a member's own required count the funnel prints, so the cutoff is visible.
const TOP_N_CONTEXT_ROWS = 2

const sortedKeys = (keys: Iterable<number>): number[] => [...keys].sort((a, b) => a - b)
const inlineKeys = (keys: number[]): string => (keys.length <= INLINE_KEYS_MAX ? `[${keys.join(',')}]` : '')
const keepLine = (index: number, name: string | undefined, keys: number[]): string =>
  `  [${index}] ${(name ?? '?').padEnd(NAME_COLUMN)} keeps ${String(keys.length).padStart(COUNT_COLUMN)}  ${inlineKeys(sortedKeys(keys))}`
const totalLine = (label: string, count: number, unit: string): string =>
  `  ${label.padEnd(NAME_COLUMN + INDEX_PREFIX)} ${String(count).padStart(COUNT_COLUMN)} ${unit}`

// Every distinct item key protected across a set of entries.
const distinctKept = (entries: readonly (SafeguardDetectionEntry | undefined)[]): Set<number> => {
  const keys = new Set<number>()
  for (const entry of entries) entry?.itemKeys.forEach((key) => keys.add(key))
  return keys
}

const run = async (): Promise<void> => {
  await prepareHeadlessRuleEngine()
  const sfcPath = resolvePath(process.cwd(), SFC_PATH)
  const dbPath = resolvePath(process.cwd(), DB_PATH)
  const sfc = await loadSfc(sfcPath)
  const rawRules = sfc.safeguardRules ?? []
  // The note exactly as the app would use it (canonicalized + migrated by the SFC parser).
  const note = sfc.note ?? ''
  // The preset's keep-recipes. Without them NOTHING is a sell candidate, so safeguards have
  // nothing to rescue and every measurement reads as "all kept" — the run must be scored against
  // the same recipes the user actually exports with.
  const recipes = sfc.recipes
  const substatTargets = sfc.substatTargets ?? defaultSubstatTargets()

  const metasetResolved = resolveSafeguardRulesWithMetasets(rawRules, sfc.metasets)
  let resolvedRules: SafeguardRule[]
  if (ACCOUNT_MODE === MODE_NONE) {
    // "Dynamic overrides disabled": the rules exactly as stored, no note applied.
    resolvedRules = [...metasetResolved]
  } else {
    // Resolve the note's dynamic overrides exactly as the app does for the chosen account mode.
    const recipeAnswers = recipeAnswersSelectingToken(resolveRecipeOverridesTags(note, {}).questions, ACCOUNT_MODE)
    const safeguardAnswers = seedSafeguardAnswersFromRecipeDefaults(note, recipeAnswers, {})
    const sgResolution = resolveNoteSafeguardOverridesTags(note, safeguardAnswers)
    resolvedRules = [...applySafeguardOverrides(metasetResolved, sgResolution.instructions)]
  }

  // Scenario edits, applied to the run under measurement only. Indices are re-based when the
  // entries before the run are dropped, so GROUP_INDICES keeps meaning "the run".
  const runStart = Math.min(...GROUP_INDICES)
  let groupIndices = GROUP_INDICES
  if (DROP_BEFORE) {
    resolvedRules = resolvedRules.slice(runStart)
    groupIndices = GROUP_INDICES.map((index) => index - runStart)
  }
  const missing = groupIndices.filter((index) => resolvedRules[index] === undefined)
  if (missing.length) throw new Error(`MGE_GROUP indices out of range: ${missing.join(',')} (rules: ${resolvedRules.length})`)
  // The weight keys every member carries with an identical value are the members' COMMON
  // yardstick; everything else is what tells them apart. Scaling only the latter answers "would
  // the members disagree if their differences mattered more?" without inventing new stats.
  // Weight tables are keyed by numeric StatVariant at runtime; read them as plain records here.
  const memberWeightTables: Record<string, number | undefined>[] = groupIndices
    .map((index) => ({ ...(resolvedRules[index]?.substatWeights ?? {}) }) as Record<string, number | undefined>)
  const firstTable = memberWeightTables[0] ?? {}
  const sharedWeightKeys = new Set(
    Object.keys(firstTable).filter((key) =>
      memberWeightTables.every((table) => table[key] !== undefined && table[key] === firstTable[key])),
  )
  // The group the run is measured under: the stored one when the head already carries it,
  // otherwise formed here from the head's own count and chips so the A/B is never vacuous.
  const head = resolvedRules[groupIndices[0]!]!
  const storedGroup = head.group
  const groupSettings: NonNullable<SafeguardRule['group']> = {
    id: storedGroup?.id ?? FORMED_GROUP_ID,
    requiredCount: GROUP_COUNT ?? storedGroup?.requiredCount ?? head.requiredCount,
    countMode: storedGroup?.countMode ?? head.countMode,
  }
  const grouped: SafeguardRule[] = resolvedRules.map((rule, index) => {
    if (!groupIndices.includes(index)) return rule
    const next: SafeguardRule = { ...rule, group: groupSettings }
    if (MEMBER_COUNT !== null) next.requiredCount = MEMBER_COUNT
    if (WEIGHT_SCALE !== null && next.substatWeights) {
      const scaled: Record<string, number> = {}
      for (const [key, weight] of Object.entries(next.substatWeights as Record<string, number | undefined>)) {
        if (weight === undefined) continue
        scaled[key] = sharedWeightKeys.has(key) ? weight : weight * WEIGHT_SCALE
      }
      next.substatWeights = scaled as SafeguardRule['substatWeights']
    }
    return next
  })
  if (WEIGHT_SCALE !== null) {
    console.log(`weight scale ${WEIGHT_SCALE}x applied to member weights other than the shared `
      + `[${[...sharedWeightKeys].join(',')}]`)
  }

  const gear = await loadGear(dbPath)
  console.log(`SFC=${SFC_PATH} mode=${ACCOUNT_MODE} dropBefore=${DROP_BEFORE} `
    + `memberCount=${MEMBER_COUNT ?? 'as-is'} `
    + `group=${storedGroup ? 'as stored' : 'FORMED'} groupCount=${groupSettings.requiredCount}`)
  console.log(`Loaded ${gear.length} artifacts; ${grouped.length} rules; run=[${groupIndices.join(',')}]`)

  // Build the preset's real keep-recipes: they decide which pieces are SELL candidates, and a
  // safeguard can only ever rescue a candidate. With no recipes every piece counts as kept and
  // the whole measurement is vacuous.
  const baseRules = computeMergedRules({
    hsf: null,
    customRecipes: recipes,
    metasets: sfc.metasets,
    substatTargets,
    // Omitted rather than passed as null: the param is optional, not nullable.
    ...(sfc.finalSellRemainder ? { finalSellRemainder: sfc.finalSellRemainder } : {}),
  })
  configureWasmRuleEngineWithLoadedWasm({ rules: baseRules, recipeModes: [] })
  storeArtifactRows(gear.map(toWasmArtifactStoreRow))
  console.log(`Keep-recipes: ${recipes.length} builder recipes -> ${baseRules.length} merged rules`)

  const rows = gear.map((artifact) => ({
    artifact, match: null, baseMatch: null,
    matchingRecipeIndices: [], matchingRecipeDecisions: [],
  })) as unknown as GearInspectorPreviewRow[]

  // Same rules with every group membership stripped — the A/B the question turns on.
  const ungrouped: SafeguardRule[] = grouped.map((rule) => {
    if (rule.group === undefined) return rule
    const { group: _dropped, ...rest } = rule
    return rest as SafeguardRule
  })

  const scan = (rules: SafeguardRule[]) => collectAndComputeSafeguardProtection({
    rows, baseRules, recipeModes: [], rules, enabled: true, now: Date.now(),
  }).detection

  // One full detection per scenario; the funnel breakdown and the report share it.
  const groupedDetection = scan(grouped)

  const report = (label: string, rules: SafeguardRule[], detection: ReturnType<typeof scan>) => {
    console.log(`\n=== ${label} ===`)
    for (const index of groupIndices) {
      console.log(keepLine(index, rules[index]?.appearance?.name, detection.entries[index]?.itemKeys ?? []))
    }
    const runTotal = distinctKept(groupIndices.map((index) => detection.entries[index])).size
    console.log(totalLine('union of the run', runTotal, 'distinct pieces'))
    // Whole-file total, so a change inside the run that merely displaces protection elsewhere
    // cannot read as a real tightening.
    const fileTotal = distinctKept(detection.entries).size
    console.log(totalLine('whole preset', fileTotal, 'distinct pieces'))
    return { runTotal, fileTotal }
  }

  // ── Why is the pool the size it is? Break the funnel down for the run. ───────
  // A group can only arbitrate over gear its members FED it, and a member only feeds what it
  // selected, and it only selects SELL candidates whose bucket quota is not already met. Any of
  // those three can be the floor, so print all of them rather than guessing which bit.
  for (const index of groupIndices) {
    const entry = groupedDetection.entries[index]
    if (!entry) continue
    // Each member's own top-N BEFORE the group cap: sorted by the member's own score, the
    // first `perBucketRequiredCount` per bucket is what it feeds. Printing the top few shows
    // whether the members really rank the shared gear differently.
    const scored = [...(entry.candidates ?? [])]
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    const top = scored.slice(0, Math.max(entry.perBucketRequiredCount, 1) + TOP_N_CONTEXT_ROWS)
      .map((c) => `${c.itemKey}@${(c.score ?? 0).toFixed(3)}`)
    console.log(`  [${index}] required=${entry.requiredCount} current=${entry.currentCount} `
      + `projected=${entry.projectedCount} deficit=${entry.deficit} `
      + `buckets=${entry.bucketsTracked} perBucket=${entry.perBucketRequiredCount} `
      + `coveredByExisting=${entry.coveredByExisting} kept=${entry.itemKeys.length} `
      + `scored=${scored.length}`)
    console.log(`        own top-N by own score: ${top.join('  ')}`)
  }

  // Every member selecting fully ALONE — a rule list holding only that member, ungrouped. The
  // purest view of what each yardstick picks, with no interaction between members at all. If
  // these coincide, the members' weightings do not change the selection and no group can tell
  // them apart — the pool is the same set of pieces however many members feed it.
  // (Not `ignorePreviousSafeguards`: that flag also EXCLUDES already-protected pieces from the
  // ranking pool — "pick the next top-N" — so it is not an independent view.)
  console.log(`\n=== EACH MEMBER ALONE (only that rule in the list) ===`)
  const aloneSets: number[][] = []
  for (const index of groupIndices) {
    const only = ungrouped[index]
    if (!only) continue
    const keys = sortedKeys(scan([only]).entries[0]?.itemKeys ?? [])
    aloneSets.push(keys)
    console.log(keepLine(index, only.appearance?.name, keys))
  }
  const aloneUnion = new Set(aloneSets.flat())
  const aloneCommon = aloneSets.length
    ? aloneSets.reduce((acc, keys) => acc.filter((k) => keys.includes(k)), aloneSets[0]!)
    : []
  console.log(totalLine('union', aloneUnion.size, 'distinct pieces'))
  console.log(totalLine('picked by EVERY member', aloneCommon.length, 'pieces'))

  const withGroup = report(storedGroup ? 'GROUPED (as stored)' : 'GROUPED (formed by this tool)', grouped, groupedDetection)
  const without = report('GROUPS STRIPPED', ungrouped, scan(ungrouped))
  console.log(`\nDelta from grouping: run ${without.runTotal} -> ${withGroup.runTotal} `
    + `(${withGroup.runTotal - without.runTotal}), `
    + `whole file ${without.fileTotal} -> ${withGroup.fileTotal} `
    + `(${withGroup.fileTotal - without.fileTotal})`)
}

run().catch((error) => { console.error(error); process.exit(1) })
