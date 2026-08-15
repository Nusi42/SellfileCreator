/* eslint import/no-unused-modules: off */
/**
 * repro-capture-replay — replay a recorded endpoint capture session through the
 * PRODUCTION ingest + override + detection + merge pipeline, and report the
 * generated-rule count (and a lost/gained breakdown) at each "export point".
 *
 * This mirrors what the running app's worker does for an HSF export, so it can
 * reproduce and explain HSF-diff anomalies seen between consecutive in-app
 * exports (e.g. deleting one item made the rule count jump by +416).
 *
 * Usage:
 *   REPRO_SESSION=<capture-dir> \
 *   REPRO_ANSWERS=tests/repro/fixtures/lategame-override-answers.json \
 *   npm run repro:capture-replay
 *
 * Env:
 *   REPRO_SESSION  — capture dir name under docs/orig/sampleLog/captures/ (required)
 *   REPRO_SFC      — preset .sfc path (default presets/lategame.sfc)
 *   REPRO_ANSWERS  — JSON file: { recipe: {...NoteRecipeOverridesAnswers}, safeguard: {...} }
 *                    = the in-app dynamic-override answers. For the lategame preset, the
 *                    committed fixture tests/repro/fixtures/lategame-override-answers.json
 *                    matches the `lategame` defaults. When omitted, the note's `*` defaults
 *                    apply (null answers).
 *   REPRO_EXPORTS  — OPTIONAL JSON file pinning explicit export points;
 *                    each is { label, packets: [file, ...], pushFile? } applied in order.
 *                    Normally OMIT it: the harness auto-groups. If the session captured outbound
 *                    uploadSellfile pushes, it closes an export point at every push and compares
 *                    the app's pushed rule count vs the computed one (MATCH/MISMATCH); otherwise
 *                    it falls back to grouping by send-time gaps.
 *   SIMULATE_NOFIX — '1' drops nested inbox-item envelopes pre-parse (old-app behaviour).
 *   REPRO_DUMP_DIFF — '1' prints a per-recipe lost/gained breakdown between consecutive
 *                     export points.
 *
 * The reusable building blocks (loadPacket / PartsAccumulator / buildRulesFor /
 * diffRules) are exported so other repro scripts and tests can drive bespoke
 * sequences without re-implementing the App.tsx wiring.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import { normalizeExternalEvent } from '../../src/lib/externalCommands.js'
import type { ExternalCommand, GearDbRawSnapshotCommand } from '../../src/lib/externalCommands.js'
import type { GearDbArtifactRow, GearDbChampionRow, GearDbLastUsedRow, NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer.js'
import type { NoteRecipeOverridesAnswers } from '../../src/lib/noteRecipeOverrides.js'
import type { NoteSafeguardOverridesAnswers } from '../../src/lib/noteSafeguardOverrides.js'
import { createDatasetFromSnapshot } from '../../src/lib/importers/gearDbRawDataset.js'
import type { GearDbRawDataset } from '../../src/lib/importers/gearDbRawDataset.js'
import {
  configureWasmRuleEngineWithLoadedWasm,
  storeArtifactRowsWithLoadedWasm,
  clearStoredRowsWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  finalizeGeneratedRulesWithLoadedWasm,
  preWarmHeapWithLoadedWasm,
  getWasmLinearMemoryBytes,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import { updateRecipeRulesCache, type RecipeRulesCacheEntry } from '../../src/lib/ruleCache.js'
import {
  buildMergedRulesComponents,
  computeMergedRulesFromComponents,
  type HsfRuleWithRecipe,
} from '../../src/lib/merge.js'
import {
  resolveSafeguardRulesWithMetasets,
  toWasmArtifactStoreRow,
  evaluateAndCollectSafeguardProtection,
  buildIgnoreSafeguardRecipeIndices,
  type SafeguardRule,
  type SafeguardsMergeInput,
} from '../../src/lib/safeguards.js'
import {
  resolveRecipeOverridesTags,
  applyRecipeOverrides,
  applyRecipeOverridesSubstatTargetsOverrides,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags, applySafeguardOverrides } from '../../src/lib/noteSafeguardOverrides.js'
import { recipesForRuleBuild } from '../../src/lib/ruleCacheHelpers.js'
// Same keep-override sources the worker passes as baselineExcludeSources during detection.
import { KEEP_OVERRIDE_RULE_SOURCES } from '../../src/lib/ruleSources.js'
import '../setup/wasm-warmup.js'

const ROOT = process.cwd()
const SESSION = process.env.REPRO_SESSION
if (!SESSION) {
  console.error('[repro:capture-replay] REPRO_SESSION is required (capture dir under docs/orig/sampleLog/captures/)')
  process.exit(2)
}
const CAP = resolve(ROOT, 'docs/orig/sampleLog/captures', SESSION)
const SFC_PATH = resolve(ROOT, process.env.REPRO_SFC ?? 'presets/lategame.sfc')
const SIMULATE_NOFIX = process.env.SIMULATE_NOFIX === '1'
const DUMP_DIFF = process.env.REPRO_DUMP_DIFF === '1'
// `now` drives time-based safeguard windows (lastUse). Default to the capture's send
// time (derived from the session dir name) so windows match what the app saw live.
function sessionEpochMs(name: string): number {
  const m = name.match(/_(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (!m) return 1_782_035_334_000
  const n = (i: number): number => Number(m[i])
  return Date.UTC(2000 + n(1), n(2) - 1, n(3), n(4), n(5), n(6))
}
const REPRO_NOW = process.env.REPRO_NOW ? Number(process.env.REPRO_NOW) : sessionEpochMs(SESSION)

// ── preset + override resolution (mirrors App.tsx 623-665) ──────────────────────
const sfcRaw = JSON.parse(readFileSync(SFC_PATH, 'utf8'))
const parsed = parseSfcObject(sfcRaw, { metasets: [], substatTargets: defaultSubstatTargets() })
const noteText: string = Array.isArray(sfcRaw.Note) ? sfcRaw.Note.join('\n') : (typeof sfcRaw.Note === 'string' ? sfcRaw.Note : '')

// Optional explicit override answers (exported from the running app's session state).
type Answers = { recipe?: NoteRecipeOverridesAnswers; safeguard?: NoteSafeguardOverridesAnswers }
const answers: Answers = process.env.REPRO_ANSWERS
  ? JSON.parse(readFileSync(resolve(ROOT, process.env.REPRO_ANSWERS), 'utf8')) as Answers
  : {}

const recipeRes = resolveRecipeOverridesTags(noteText, answers.recipe ?? null)
const safeguardRes = resolveNoteSafeguardOverridesTags(noteText, answers.safeguard ?? null)
const effRecipeInstr = [...recipeRes.instructions, ...safeguardRes.recipeInstructions]
const effSafeguardInstr = [...safeguardRes.instructions, ...recipeRes.safeguardInstructions]

const overrideRecipes = applyRecipeOverrides(parsed.recipes, effRecipeInstr)
const baseRecipes = recipesForRuleBuild(overrideRecipes)
const substatTargetsRes = applyRecipeOverridesSubstatTargetsOverrides(parsed.substatTargets, parsed.recipes, effRecipeInstr)
const effectiveSubstatTargets = substatTargetsRes.substatTargets
const resolvedSg = resolveSafeguardRulesWithMetasets(parsed.safeguardRules ?? [], parsed.metasets)
const safeguardRules: SafeguardRule[] = applySafeguardOverrides(resolvedSg, effSafeguardInstr) as SafeguardRule[]
const recipeModes = baseRecipes.map((c) => c.exportMode)
const hasThreshold = safeguardRules.some((r) => r.improvementChanceThreshold != null)

console.log(`[setup] session=${SESSION} | nofix=${SIMULATE_NOFIX} | recipes=${baseRecipes.length}`
  + ` | safeguardRules=${safeguardRules.length} | recipeInstr=${effRecipeInstr.length} | safeguardInstr=${effSafeguardInstr.length}`)

// ── packet loading (one production parse path, both inbox shapes) ────────────────
type RpcEnvelope = {
  method?: string
  // direction: "send" marks an OUTBOUND request captured by captureOutboundRequest.
  direction?: string
  params?: { inboxArtifacts?: unknown[]; data?: { Rules?: unknown[] } } & Record<string, unknown>
}
// True when a capture file is an outbound request (a push), not an inbound frame.
function isOutboundFile(file: string): boolean {
  if (file.includes('_send_')) return true
  try { return (JSON.parse(readFileSync(resolve(CAP, file), 'utf8')) as RpcEnvelope).direction === 'send' }
  catch { return false }
}
// Extract the pushed-HSF rule count from a send_uploadSellfile capture (the exact rules the
// app pushed at that point), so the harness can diff it against its own computed build.
export function pushedHsfRuleCount(file: string): number | null {
  const raw = JSON.parse(readFileSync(resolve(CAP, file), 'utf8')) as RpcEnvelope
  if (raw.direction !== 'send' || raw.method !== 'uploadSellfile') return null
  const rules = raw.params?.data?.Rules
  return Array.isArray(rules) ? rules.length : null
}
export function loadPacketFile(file: string): ExternalCommand | null {
  const raw = JSON.parse(readFileSync(resolve(CAP, file), 'utf8')) as RpcEnvelope
  // Outbound captures are not inbound commands — never feed them to the ingest path.
  if (raw.direction === 'send') return null
  if (SIMULATE_NOFIX && raw.method === 'inboxArtifacts' && Array.isArray(raw.params?.inboxArtifacts)) {
    // Reproduce the pre-fix bug: the unfixed parser rejected nested inbox-item
    // envelopes (artifacts[] with no top-level kindId), silently dropping them.
    const flat = raw.params.inboxArtifacts.filter((e) => {
      const o = e as Record<string, unknown> | null
      return !(o && Array.isArray(o.artifacts) && o.kindId == null)
    })
    return normalizeExternalEvent(raw.method, { inboxArtifacts: flat })
  }
  return normalizeExternalEvent(raw.method ?? '', raw.params)
}

// ── parts accumulator (mirrors App.tsx gearDbRawPartsRef + synthetic snapshot) ──
// IMPORTANT: this must apply the artifact→champion EQUIP association the way App.tsx does
// (patchCID using equippedByArtifact from the champions packet). RSL Helper artifact rows
// always carry cID=0; the equip link lives ONLY in the champion `artifacts` slot map, which
// the champions command inverts into equippedByArtifact. Omitting this leaves every artifact
// unequipped (equipped=0), which changes the ignore-equipped safeguard at-risk set and thus
// the protected count — the exact axis under investigation. equippedByArtifact is PRESERVED
// across pushes so an artifacts-only / inbox-only burst (no champion packet) still patches.
export class PartsAccumulator {
  private parts = {
    artifacts: [] as GearDbArtifactRow[],
    inboxArtifacts: [] as GearDbArtifactRow[],
    champions: [] as GearDbChampionRow[],
    lastUsed: [] as GearDbLastUsedRow[],
    equippedByArtifact: null as Map<number, number> | null,
  }
  private prev: GearDbRawDataset | undefined
  apply(cmd: ExternalCommand): GearDbRawDataset {
    if (cmd.kind === 'gearDbArtifacts') this.parts.artifacts = cmd.artifacts
    else if (cmd.kind === 'gearDbInboxArtifacts') this.parts.inboxArtifacts = cmd.inboxArtifacts
    else if (cmd.kind === 'gearDbChampions') {
      this.parts.champions = cmd.champions
      this.parts.equippedByArtifact = cmd.equippedByArtifact
    } else if (cmd.kind === 'gearDbLastUsed') this.parts.lastUsed = cmd.lastUsed
    // patchCID: stamp championId onto each artifact row's cID from the preserved equip map.
    // REPRO_NO_EQUIP=1 SKIPS this — simulating a live origin=user pipeline build that fires AFTER
    // restore but BEFORE the champions packet's equip associations have merged into the gear set.
    // Hypothesis: that leaves equipped accessories flagged unequipped → ignore-equipped safeguards
    // see them as at-risk → over-protection (+285). If this run reproduces 1555, that's the bug.
    const equippedBy = process.env.REPRO_NO_EQUIP === '1' ? null : this.parts.equippedByArtifact
    const patchCID = (rows: GearDbArtifactRow[]): GearDbArtifactRow[] => {
      if (!equippedBy || equippedBy.size === 0) return rows
      return rows.map((row) => {
        const championId = equippedBy.get(row.ID)
        return championId ? { ...row, cID: championId } : row
      })
    }
    const snapshot: GearDbRawSnapshotCommand = {
      kind: 'gearDbRawSnapshot', snapshotId: null, payloadVersion: null,
      artifacts: patchCID(this.parts.artifacts), inboxArtifacts: patchCID(this.parts.inboxArtifacts),
      champions: this.parts.champions, lastUsed: this.parts.lastUsed,
    }
    const { dataset } = createDatasetFromSnapshot(snapshot, this.prev)
    this.prev = dataset
    return dataset
  }
}

// ── full rule build for one dataset (mirrors the worker's two-pass merge) ────────
export type ExportResult = {
  label: string
  artifacts: number
  protectedArtifacts: number
  placeholders: number
  finalRules: number
  rules: HsfRuleWithRecipe[]
}
// Persistent per-recipe rule cache — the worker keeps ONE of these across all pushes
// (ruleCacheWorker.ts persistentRuleCache). Re-using it across export points is part of
// matching the app: the cache also carries the totalLimit truncation state.
const persistentRuleCache = new Map<string, RecipeRulesCacheEntry>()
const finalizeForWorker = (params: Parameters<typeof finalizeGeneratedRulesWithLoadedWasm>[0]) => {
  const finalized = finalizeGeneratedRulesWithLoadedWasm(params)
  if (!finalized) throw new Error('WASM rule finalizer unavailable after warmup')
  return finalized
}

// REPRO_STATEFUL=1 replicates the worker's CROSS-PUSH engine state: configure is gated
// on a stable key (rules+recipeModes) and artifact-row store is gated on a content
// fingerprint, so detection runs against whatever was last configured/stored rather than
// a fresh build per export. This is the suspected source of the in-app vs replay
// divergence (the worker preserves BucketedRules + stored_rows across pushes).
const STATEFUL = process.env.REPRO_STATEFUL === '1'
let lastConfiguredKey: string | null = null
let lastStoreFingerprint: number | null = null
// REPRO_STALE_IMPROV: holds the PREVIOUS export's freshly-computed improvement chances so the
// next export can be fed stale chances (testing the threshold-expansion-on-stale-chance leak).
let staleImprovCache: readonly import('../../src/lib/wasm/wasmRuleEngine.js').ImprovementChanceWasmEntry[] | null = null

// Port of ruleCacheWorker.computeArtifactStoreFingerprint (not exported there). Hashes
// the mutable store-row fields that change which artifacts detection sees.
function storeFingerprint(arts: readonly NormalizedGearArtifact[]): number {
  let h = arts.length * 0x9e3779b9 | 0
  for (const a of arts) {
    h ^= a.id
    h = Math.imul(h, 0x9e3779b9) | 0
    h ^= (a.level + (a.rank ?? 0) * 97) | 0
    h = Math.imul(h, 0x517cc1b7) | 0
    const loc = a.equippedChampion?.location
    const locCode = loc == null ? 0 : /vault/i.test(loc) ? 1 : 2
    h ^= locCode * 31
    h = Math.imul(h, 0xbf58476d) | 0
    let subHash = a.substats?.length ?? 0
    for (const s of a.substats ?? []) subHash += Math.round((s.totalValue ?? 0) * 10)
    h ^= subHash
    h = Math.imul(h, 0x9e3779b9) | 0
  }
  return h
}

export function buildRulesFor(label: string, dataset: GearDbRawDataset): ExportResult {
  const arts = [...Array.from(dataset.artifacts.values()), ...Array.from(dataset.inboxArtifacts.values())]
  // Mirror the worker's buildPipelineState: build per-recipe custom rules through the
  // cache (WITH the default totalLimit truncation) and feed them in as prebuiltCustomRules.
  const cacheResult = updateRecipeRulesCache({
    recipes: baseRecipes,
    metasets: parsed.metasets,
    substatTargets: effectiveSubstatTargets,
    baseRuleCount: 0,
    finalizeGeneratedRules: finalizeForWorker,
    rulesCache: persistentRuleCache,
  })
  const shared = buildMergedRulesComponents({
    hsf: null, customRecipes: baseRecipes, metasets: parsed.metasets, substatTargets: effectiveSubstatTargets,
    prebuiltCustomRules: cacheResult.rulesByRecipe,
  })
  const baseSg: SafeguardsMergeInput = { enabled: parsed.safeguardsEnabled ?? false, rules: safeguardRules, detection: null }
  const baseline: HsfRuleWithRecipe[] = computeMergedRulesFromComponents(shared, {
    ...(parsed.finalSellRemainder != null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    safeguards: baseSg, omitDisabledBeforeSafeguards: false, dedupeBeforeSafeguards: false, rulesCacheKey: 'repro-fixed',
  })
  // REPRO_BASELINE_FP=1 — same order-independent baseline content fingerprint the worker logs in
  // [detect-io] baselineFp=. The live reConfig=1555 proved the worker's baseline configure yields
  // the WRONG protected set; this lets us compare the worker's baselineFp against the faithful one
  // to see whether the worker's baseline RULESET differs (stale prebuiltCustomRules) from this one.
  if (process.env.REPRO_BASELINE_FP === '1') {
    let fp = baseline.length * 0x9e3779b9 | 0
    for (const r of baseline as unknown as ReadonlyArray<Record<string, unknown>>) {
      const sig = `${r.Keep ? 1 : 0}|${r.Use ? 1 : 0}|${JSON.stringify(r.ArtifactType ?? [])}` +
        `|${JSON.stringify(r.ArtifactSet ?? [])}|${r.Faction ?? 0}|${r.MainStatID ?? 0}` +
        `|${r.Rank ?? 0}|${r.Rarity ?? 0}|${r.LVLForCheck ?? 0}|${(r.__source as string) ?? ''}`
      let h = 0
      for (let i = 0; i < sig.length; i += 1) h = (Math.imul(h, 31) + sig.charCodeAt(i)) | 0
      fp = (fp ^ h) | 0
    }
     
    console.log(`[baseline-fp] ${label} rules=${baseline.length} fp=${(fp >>> 0).toString(36)}`)
  }
  // Worker gates configure on `${rulesCacheKey}|${recipeModes}`. In this single-preset
  // replay rulesCacheKey is constant, so STATEFUL configures once (start) and reuses the
  // engine's BucketedRules thereafter — exactly like the worker on artifact-only pushes.
  const configureKey = `repro|${recipeModes.join(',')}`
  if (!STATEFUL || configureKey !== lastConfiguredKey) {
    configureWasmRuleEngineWithLoadedWasm({ rules: baseline, recipeModes: Array.from(recipeModes) })
    lastConfiguredKey = configureKey
  }
  // Worker gates the row store on a content fingerprint; unchanged gear → no re-store.
  const fp = storeFingerprint(arts)
  if (!STATEFUL || fp !== lastStoreFingerprint) {
    storeArtifactRowsWithLoadedWasm({ rows: arts.map((a) => toWasmArtifactStoreRow(a)) })
    lastStoreFingerprint = fp
  }
  // REPRO_ROWDUMP=1 — compact gear dump for diffing one replay's gear against another's.
  // gear can be diffed against this faithful replay to find the exact differing rows/fields.
  if (process.env.REPRO_ROWDUMP === '1') {
    const dumpRows = arts.map((a) => {
      const subs = (a.substats ?? [])
        .map((s) => `${s.statId}${s.isFlat ? 'f' : 'p'}=${Math.round((s.totalValue ?? 0) * 100)}`)
        .sort().join(',')
      const main = a.mainStat ? `${a.mainStat.statId}${a.mainStat.isFlat ? 'f' : 'p'}` : '-'
      return `${a.id}:s${a.slot}:S${a.set}:k${a.rank}:r${a.rarity}:l${a.level}` +
        `:x${a.exactLevel ?? '-'}:f${a.faction}:m${main}:[${subs}]`
    }).sort()

    console.log(`[rowdump-begin] ${label} rows=${dumpRows.length}`)
    for (let i = 0; i < dumpRows.length; i += 200) {

      console.log(`[rowdump] ${label} ${i} ${dumpRows.slice(i, i + 200).join(' ')}`)
    }
  }
  const improvementChancesFresh = hasThreshold
    ? (computeImprovementChanceWithLoadedWasm({ rules: safeguardRules, enabled: parsed.safeguardsEnabled ?? false })?.entries ?? [])
    : []
  // REPRO_STALE_IMPROV=1 — test the "stale improvement-chance" leak hypothesis. The worker
  // computes improvement chances from stored_rows (the CURRENT gear) right before detection
  // (ruleCacheWorker ~605) and feeds them as precomputedImprovementChances into the threshold-
  // expansion path (mod.rs ~3209). The phantom rules are entirely `Protect: Best % Ring/Banner`
  // — rules WITH an improvementChanceThreshold — so if a build ran detection against the
  // CURRENT gear but with improvement chances computed for a DIFFERENT (e.g. previous) gear,
  // items would cross the 50% threshold incorrectly and inflate protection. Here we feed the
  // PREVIOUS export's chances into the current detection to see if that reproduces the +N.
  const improvementChances = process.env.REPRO_STALE_IMPROV === '1' && staleImprovCache !== null
    ? staleImprovCache
    : improvementChancesFresh
  staleImprovCache = improvementChancesFresh
  // REPRO_PROBE_IMPROV=1 — histogram of per-rule improvement chances around the 50% threshold.
  // The phantom rules (Best % Ring/Banner) expand the keep-list when a chance ≥ threshold (50).
  // If many chances cluster just below 50, a tiny perturbation (e.g. stale-gear chances) flips a
  // large batch at once → the +N over-protection. chances_by_rule_ordinal is the per-rule field.
  if (process.env.REPRO_PROBE_IMPROV === '1') {
    type IcEntry = { artifactId?: number; chancesByRuleOrdinal?: { ruleOrdinal: number; chancePercent: number }[] }
    const buckets = { '0': 0, '<40': 0, '40-49': 0, '49-50': 0, '50-51': 0, '51-60': 0, '>60': 0 }
    let nonzeroPerRule = 0
    for (const e of improvementChancesFresh as readonly IcEntry[]) {
      for (const c of e.chancesByRuleOrdinal ?? []) {
        const v = c.chancePercent
        if (v <= 0) { buckets['0']++; continue }
        nonzeroPerRule++
        if (v < 40) buckets['<40']++
        else if (v < 49) buckets['40-49']++
        else if (v < 50) buckets['49-50']++
        else if (v < 51) buckets['50-51']++
        else if (v < 60) buckets['51-60']++
        else buckets['>60']++
      }
    }
     
    console.log(`[improv-probe] ${label} nonzeroPerRule=${nonzeroPerRule} ` + JSON.stringify(buckets))
  }
  // IMPORTANT: use the high-level safeguards.ts entry point (same as the worker), not the
  // raw WASM wrapper. It injects buildSafeguardExpectedBucketDomain() — the expected universe
  // of slots/sets/factions that drives anticipateGaps placeholder deficits. Calling the raw
  // wrapper without it under-counts placeholders ~3.4x.
  const det = evaluateAndCollectSafeguardProtection({
    // The WORKER passes baselineExcludeSources=KEEP_OVERRIDE_RULE_SOURCES on every detection
    // (ruleCacheWorker ~678). The harness had OMITTED it — a real input divergence. Pass it here
    // (gated so we can A/B) to test whether it reproduces the live 1555 over-protection offline.
    ...(process.env.REPRO_BASELINE_EXCLUDE === '1'
      ? { options: { baselineExcludeSources: KEEP_OVERRIDE_RULE_SOURCES } }
      : {}),
    // REPRO_IGNORE_SG=1 — pass ignoreSafeguardRecipeIndices like the WORKER does (ruleCacheWorker
    // ~740). The harness had OMITTED it. This is the recipe-index set tagged "ignore safeguard";
    // omitting it changes which recipes count as safeguard candidates → could explain 1270 vs 1555.
    ...(process.env.REPRO_IGNORE_SG === '1'
      ? { ignoreSafeguardRecipeIndices: buildIgnoreSafeguardRecipeIndices(baseRecipes) }
      : {}),
    rules: safeguardRules,
    enabled: parsed.safeguardsEnabled ?? false,
    now: REPRO_NOW,
    precomputedImprovementChances: improvementChances,
  })
  // Worker clears stored rows after detection AND nulls its fingerprint so the next run
  // re-stores. Replicate both so STATEFUL re-stores each run (matching the worker), while
  // still exercising the configure-gating that is the actual cross-push state.
  clearStoredRowsWithLoadedWasm()
  if (STATEFUL) lastStoreFingerprint = null
  const withDet: SafeguardsMergeInput = { ...baseSg, detection: det.detection }
  const final: HsfRuleWithRecipe[] = computeMergedRulesFromComponents(shared, {
    ...(parsed.finalSellRemainder != null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    safeguards: withDet, omitDisabledBeforeSafeguards: false, dedupeBeforeSafeguards: false, rulesCacheKey: 'repro-fixed',
  })
  // Detection snapshot entries carry per-safeguard `artifacts` + `itemKeys` arrays and a
  // placeholderCount (the placeholder OBJECTS stay wasm-resident — see
  // docs/technical/pipeline-memory.md); read them through a narrow shape. `itemKeys` is
  // the worker's "protected" count in the [detect-io] log — the real artifacts a
  // safeguard keeps; it is what tracks the wrong-build rule inflation.
  type DetEntry = { ruleOrdinal?: number | null; artifacts?: unknown[]; itemKeys?: number[]; placeholderCount?: number }
  const entries = (det.detection?.entries ?? []) as readonly DetEntry[]
  // REPRO_PLACEHOLDER_BREAKDOWN=1 — per-rule placeholder counts (the objects themselves
  // are wasm-resident, so JS-side classification by missing/corners is no longer
  // possible; the emission gate in rule_engine_core safeguards/mod.rs owns that split).
  if (process.env.REPRO_PLACEHOLDER_BREAKDOWN === '1') {
    const perRule = [...entries]
      .map((e) => [`o${e.ruleOrdinal ?? '?'}`, e.placeholderCount ?? 0] as const)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, c]) => `${k}=${c}`)
      .join(' ')
    console.log(`[ph-breakdown] ${label} top placeholder rules: ${perRule}`)
  }
  const protectedArtifacts = entries.reduce((s, e) => s + (e.itemKeys?.length ?? e.artifacts?.length ?? 0), 0)
  const placeholders = entries.reduce((s, e) => s + (e.placeholderCount ?? 0), 0)

  // REPRO_PERRULE=1 — mirror the worker's [detect-perrule] diagnostic so a captured live
  // wrong-build line can be diffed against the faithful correct baseline to pinpoint which
  // safeguard rule ordinal over-protects. Same commutative key fingerprint as the worker.
  if (process.env.REPRO_PERRULE === '1') {
    const perRule: string[] = []
    for (const e of entries) {
      const keys = e.itemKeys ?? []
      if (keys.length === 0) continue
      let h = keys.length * 0x9e3779b9 | 0
      for (const key of keys) h = (h ^ Math.imul(key | 0, 0x85ebca6b)) | 0
      perRule.push(`o${e.ruleOrdinal ?? '?'}=${keys.length}/${(h >>> 0).toString(36)}`)
    }
     
    console.log(`[detect-perrule] ${label} ${perRule.join(' ')}`)
  }

  // REPRO_STALE_FINAL=1 — reproduce the worker's cross-build "stale FINAL config" hazard.
  // The worker's matcher pass (buildPipelineMatches, ruleCacheWorker.ts ~366) configures the
  // engine with the FINAL ~45k ruleset (incl. injected safeguard keep-rules) AFTER detection,
  // but never updates lastConfiguredKey. So a subsequent reconfigured=false build runs
  // evaluate_and_collect base_match against this leftover FINAL config instead of baseline.
  // Here we replicate that: configure FINAL, re-store rows, re-detect WITH the worker's
  // baselineExcludeSources, and report the second protected count. If it lands at ~1491/1555
  // we have reproduced the phantom over-protection offline and confirmed the root cause.
  if (process.env.REPRO_STALE_FINAL === '1') {
    configureWasmRuleEngineWithLoadedWasm({ rules: final, recipeModes: Array.from(recipeModes) })
    storeArtifactRowsWithLoadedWasm({ rows: arts.map((a) => toWasmArtifactStoreRow(a)) })
    const detStale = evaluateAndCollectSafeguardProtection({
      // Mirror the worker's detection options: exclude the injected keep-override sources from
      // base_match so the at-risk/sold set is computed the same way the live worker does.
      options: { baselineExcludeSources: KEEP_OVERRIDE_RULE_SOURCES },
      rules: safeguardRules,
      enabled: parsed.safeguardsEnabled ?? false,
      now: REPRO_NOW,
      precomputedImprovementChances: improvementChances,
    })
    clearStoredRowsWithLoadedWasm()
    const staleEntries = (detStale.detection?.entries ?? []) as readonly DetEntry[]
    const staleProtected = staleEntries.reduce((s, e) => s + (e.itemKeys?.length ?? 0), 0)
    const stalePlace = staleEntries.reduce((s, e) => s + (e.placeholderCount ?? 0), 0)
     
    console.log(
      `[stale-final] ${label}: baselineProtected=${protectedArtifacts} ` +
        `staleFinalProtected=${staleProtected} (Δ${staleProtected - protectedArtifacts}) ` +
        `staleFinalPlaceholders=${stalePlace}`,
    )
  }
  // REPRO_STRESS_FLIP=N — try to reproduce the LIVE phantom over-protection offline. The live
  // worker's baseline configure of a CORRECT ruleset (baselineFp=1byrwi5) deterministically
  // detects 1270 in a FRESH instance but 1555 in the long-lived worker (talc heap ~559MB, many
  // prior configure/merge/evaluate calls). [detect-rebuild] proved it's the CONFIGURED ruleset
  // (reConfig→1555) — not stored_rows, not the detect call. So talc must corrupt the bucketed
  // rules on configure once the heap is dirty/fragmented. This loop replays the worker's exact
  // per-build interleave N times — configure BASELINE → store → detect (expect 1270) → configure
  // FINAL (matcher pass) → clear — with optional heap prewarm to force fragmentation, and flags
  // the FIRST iteration whose protected count diverges from the first. REPRO_STRESS_PREWARM_MB
  // (default 0) prewarms that many MiB before each baseline configure to stress talc.
  const stressN = Number(process.env.REPRO_STRESS_FLIP ?? 0)
  if (stressN > 0) {
    const prewarmMb = Number(process.env.REPRO_STRESS_PREWARM_MB ?? 0)
    const countProt = (snap: ReturnType<typeof evaluateAndCollectSafeguardProtection>['detection']): number => {
      const s = new Set<number>()
      for (const e of (snap?.entries ?? []) as readonly DetEntry[]) for (const k of e.itemKeys ?? []) s.add(k)
      return s.size
    }
    let firstCount = -1
    let flipped = false
    for (let i = 0; i < stressN; i += 1) {
      if (prewarmMb > 0) preWarmHeapWithLoadedWasm(prewarmMb * 1024 * 1024)
      // Replay the worker interleave: fresh BASELINE configure (the suspect op) → store → detect.
      configureWasmRuleEngineWithLoadedWasm({ rules: baseline, recipeModes: Array.from(recipeModes) })
      storeArtifactRowsWithLoadedWasm({ rows: arts.map((a) => toWasmArtifactStoreRow(a)) })
      const ic = hasThreshold
        ? (computeImprovementChanceWithLoadedWasm({ rules: safeguardRules, enabled: parsed.safeguardsEnabled ?? false })?.entries ?? [])
        : []
      const det2 = evaluateAndCollectSafeguardProtection({
        options: { baselineExcludeSources: KEEP_OVERRIDE_RULE_SOURCES },
        rules: safeguardRules, enabled: parsed.safeguardsEnabled ?? false, now: REPRO_NOW,
        precomputedImprovementChances: ic,
      })
      const c = countProt(det2.detection)
      clearStoredRowsWithLoadedWasm()
      // Configure FINAL (the matcher pass) to mirror the worker's heap churn between builds.
      configureWasmRuleEngineWithLoadedWasm({ rules: final, recipeModes: Array.from(recipeModes) })
      if (firstCount < 0) firstCount = c
      if (c !== firstCount && !flipped) {
        flipped = true

        console.log(`[stress-flip] ${label} iter=${i} FLIPPED ${firstCount}→${c} heapMB=${Math.round(getWasmLinearMemoryBytes() / 1048576)}`)
      }
    }

    console.log(`[stress-flip] ${label} done iters=${stressN} first=${firstCount} flipped=${flipped} prewarmMb=${prewarmMb} heapMB=${Math.round(getWasmLinearMemoryBytes() / 1048576)}`)
  }
  return { label, artifacts: arts.length, protectedArtifacts, placeholders, finalRules: final.length, rules: final }
}

// ── lost/gained breakdown between two rule sets (by recipe name) ────────────────
// Rules are read through a structural shape (recipeName/RecipeName both occur across
// the serialised and in-memory forms) without depending on the full HsfRule type.
type RuleLike = Record<string, unknown> & { recipeName?: string; RecipeName?: string }
function ruleKey(r: RuleLike): string {
  const o: Record<string, unknown> = {}
  for (const k of Object.keys(r)) { if (k !== 'rowIdx' && k !== 'RowIdx') o[k] = r[k] }
  return JSON.stringify(o, Object.keys(o).sort())
}
function nameOf(r: RuleLike): string { return r.recipeName ?? r.RecipeName ?? '?' }
export function diffRules(aRules: HsfRuleWithRecipe[], bRules: HsfRuleWithRecipe[]): void {
  const a = aRules as unknown as RuleLike[]
  const b = bRules as unknown as RuleLike[]
  const ac = new Map<string, number>(); const an = new Map<string, RuleLike>()
  const bc = new Map<string, number>(); const bn = new Map<string, RuleLike>()
  for (const r of a) { const k = ruleKey(r); ac.set(k, (ac.get(k) ?? 0) + 1); an.set(k, r) }
  for (const r of b) { const k = ruleKey(r); bc.set(k, (bc.get(k) ?? 0) + 1); bn.set(k, r) }
  const lost = new Map<string, number>(); const gained = new Map<string, number>()
  for (const [k, c] of ac) { const d = c - (bc.get(k) ?? 0); const r = an.get(k); if (d > 0 && r) { const n = nameOf(r); lost.set(n, (lost.get(n) ?? 0) + d) } }
  for (const [k, c] of bc) { const d = c - (ac.get(k) ?? 0); const r = bn.get(k); if (d > 0 && r) { const n = nameOf(r); gained.set(n, (gained.get(n) ?? 0) + d) } }
  const tl = [...lost.values()].reduce((x, y) => x + y, 0)
  const tg = [...gained.values()].reduce((x, y) => x + y, 0)
  console.log(`   churn: lost=${tl} gained=${tg} net=${tg - tl}`)
  const top = (m: Map<string, number>, s: string) =>
    [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).forEach(([n, c]) => console.log(`     ${s}${c}  ${n}`))
  if (tl) { console.log('   -- top lost --'); top(lost, '-') }
  if (tg) { console.log('   -- top gained --'); top(gained, '+') }
}

// ── export-point grouping ───────────────────────────────────────────────────────
// Default: auto-group packets into export points by a time gap between consecutive
// sends (a fresh burst after a pause = a new in-app state the user likely exported).
type ExportPoint = { label: string; packets: string[] }
// Numeric index sort — the capture writer zero-pads the index to 2 digits only, so a
// >99-packet session (e.g. the 110-packet farm-run OOM capture) misorders lexically
// (packet_100 sorts between packet_10 and packet_11), scrambling export-point grouping.
const allPackets = readdirSync(CAP).filter((f) => f.startsWith('packet_') && f.endsWith('.json'))
  .sort((a, b) => Number(a.match(/^packet_(\d+)_/)?.[1] ?? 0) - Number(b.match(/^packet_(\d+)_/)?.[1] ?? 0))
function timeOf(file: string): number {
  // packet_<NN>_<method>_<YYMMDD>_<HHMMSS.mmm>.json
  const m = file.match(/_(\d{6})_(\d{6})\.(\d{3})\.json$/)
  if (!m) return 0
  const [, , hms, ms] = m
  return Number(hms) * 1000 + Number(ms)
}
// An export point optionally carries the file of the outbound HSF push that closed it,
// so the harness can compare its computed rule count against what the app actually pushed.
type ExportPointWithPush = ExportPoint & { pushFile?: string }
// Prefer push-driven grouping: when the session captured outbound uploadSellfile frames
// (see captureOutboundRequest), each push marks exactly where the app exported, so we close
// an export point at every push and tag it with that push file. Falls back to time-gap
// grouping when no push frames were captured (older sessions / inbound-only captures).
function autoGroup(files: string[], gapMs = 20_000): ExportPointWithPush[] {
  const inbound = files.filter((f) => !f.includes('_response_'))
  const hasPush = inbound.some((f) => isOutboundFile(f) && pushedHsfRuleCount(f) !== null)
  const points: ExportPointWithPush[] = []
  let cur: string[] = []
  if (hasPush) {
    for (const f of inbound) {
      if (isOutboundFile(f)) {
        // A uploadSellfile push closes the current export point (and is its pushFile);
        // other outbound frames (selectArtifacts/requestSfcSync) are ignored for grouping.
        if (pushedHsfRuleCount(f) !== null) {
          points.push({ label: `export${points.length + 1}`, packets: cur.slice(), pushFile: f })
          cur = []
        }
        continue
      }
      cur.push(f)
    }
    // Trailing inbound frames after the last push (no export captured) — still build them.
    if (cur.length) points.push({ label: `export${points.length + 1}`, packets: cur })
    return points
  }
  let lastT = -1
  for (const f of inbound) {
    const t = timeOf(f)
    if (lastT >= 0 && t - lastT > gapMs && cur.length) { points.push({ label: `export${points.length + 1}`, packets: cur }); cur = [] }
    cur.push(f); lastT = t
  }
  if (cur.length) points.push({ label: `export${points.length + 1}`, packets: cur })
  return points
}
const exportPoints: ExportPointWithPush[] = process.env.REPRO_EXPORTS
  ? JSON.parse(readFileSync(resolve(ROOT, process.env.REPRO_EXPORTS), 'utf8'))
  : autoGroup(allPackets)

// ── run ─────────────────────────────────────────────────────────────────────────
const acc = new PartsAccumulator()
const results: ExportResult[] = []
let lastDataset: GearDbRawDataset | undefined
for (const pt of exportPoints) {
  console.log(`\n=== ${pt.label}: ${pt.packets.join(', ')} ===`)
  for (const file of pt.packets) {
    const cmd = loadPacketFile(file)
    if (!cmd) { console.log(`   (skipped ${file}: not a gear command)`); continue }
    lastDataset = acc.apply(cmd)
  }
  if (!lastDataset) continue
  const res = buildRulesFor(pt.label, lastDataset)
  console.log(`[${res.label}] artifacts=${res.artifacts} | protectedArtifacts=${res.protectedArtifacts}`
    + ` | placeholders=${res.placeholders} | finalRules=${res.finalRules}`)
  // When this export point was closed by a captured outbound push, compare the rule count
  // the APP actually pushed against what the harness COMPUTES for the same gear state. A
  // mismatch is the bug made visible: the app pushed a different HSF than a correct pipeline
  // produces (e.g. the phantom over-protection). No manual HSF export needed.
  if (pt.pushFile) {
    const pushed = pushedHsfRuleCount(pt.pushFile)
    if (pushed !== null) {
      const verdict = pushed === res.finalRules ? 'MATCH' : `MISMATCH (app pushed ${pushed - res.finalRules >= 0 ? '+' : ''}${pushed - res.finalRules})`
      console.log(`   pushed=${pushed} computed=${res.finalRules} → ${verdict}`)
    }
  }
  if (DUMP_DIFF && results.length) diffRules(results[results.length - 1]!.rules, res.rules)
  // REPRO_DUMP_RULES=<dir> writes each export's final rules as <dir>/<label>.json so the
  // replay output can be diffed byte-for-byte against the user's actual exported HSF.
  if (process.env.REPRO_DUMP_RULES) {
    writeFileSync(resolve(process.env.REPRO_DUMP_RULES, `${res.label}.json`), JSON.stringify({ Rules: res.rules }))
  }
  results.push(res)
}

console.log('\n=== SUMMARY ===')
let prev = -1
for (const r of results) {
  const delta = prev < 0 ? '' : `  (${r.finalRules - prev >= 0 ? '+' : ''}${r.finalRules - prev})`
  console.log(`${r.label.padEnd(10)} artifacts=${r.artifacts} rules=${r.finalRules}${delta}`)
  prev = r.finalRules
}
process.exit(0)
