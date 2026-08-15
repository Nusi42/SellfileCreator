/* eslint import/no-unused-modules: off */
/**
 * gearInspectorProbe — reusable utility that loads an RSL Helper .db + a Sellfile
 * Creator preset (.sfc), applies the in-app dynamic overrides, runs the PRODUCTION
 * safeguard detection + improvement-chance pipeline, and reports — for a single
 * queried artifact — exactly what the Gear Inspector chips would show:
 *
 *   • PROTECTION   — which safeguard reserves the item (first-match rule with quota).
 *   • IMPROV CHANCE — the displayed % and which safeguard it comes from
 *                     (resolve_most_likely_scenario_idx: highest chance, then most
 *                     matched substats, then earliest rule order).
 *   • GROUP RANK    — the rank/#group shown and which safeguard wins it
 *                     (best candidateRank across active rules; selection-aware).
 *   • FIRST-MATCH CHIP — the jump target on click (= the improvement-chance rule)
 *                     and the substat-weights focus-bucket key it seeds.
 *
 * This is the single source of truth used both by ad-hoc gear-inspector questions
 * (run as a script) and by unit tests (import resolveGearInspectorChips). It re-uses
 * the same lib entry points the App/worker use — no chip logic is re-implemented here;
 * the resolution rules are read straight from the WASM detection output and the same
 * selection helpers the UI consumes (safeguardFocusBucketKeyFor, etc.).
 *
 * Script usage:
 *   PROBE_DB=examples/um109288203_RSLHelper.db \
 *   PROBE_SFC=presets/lategame.sfc \
 *   PROBE_OVERRIDE=endgame \
 *   PROBE_QUERY='set=speed slot=weapon CDMG%=25 ACC=11 SPD=5 CR%=18' \
 *   npm run probe:gear-inspector
 *
 * Env:
 *   PROBE_DB        — RSL Helper SQLite db (required).
 *   PROBE_SFC       — preset .sfc (default presets/lategame.sfc).
 *   PROBE_OVERRIDE  — comma-separated dynamic-override checkbox id(s) to enable
 *                     (e.g. `endgame`). Mutually-exclusive radio anchors resolve via
 *                     the note DSL exactly as the app's override controls do.
 *   PROBE_QUERY     — item selector (see parseQuery): set / slot / artifact id / substats.
 *   PROBE_ID        — artifact id to query directly (skips PROBE_QUERY substat match).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSfcObject } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import { importGearDatabaseFromArrayBuffer } from '../../src/lib/importers/gearDbImporter.js'
import type { NormalizedGearArtifact } from '../../src/lib/importers/gearDbNormalizer.js'
import { ARTIFACT_TYPE_DISPLAY_NAMES } from '../../src/lib/generated/domainConstants.js'
import { artifactSetName, findArtifactSetIdByName, StatId } from '../../src/lib/types.js'
import type { NoteRecipeOverridesAnswers } from '../../src/lib/noteRecipeOverrides.js'
import type { NoteSafeguardOverridesAnswers } from '../../src/lib/noteSafeguardOverrides.js'
import {
  configureWasmRuleEngineWithLoadedWasm,
  storeArtifactRowsWithLoadedWasm,
  clearStoredRowsWithLoadedWasm,
  computeImprovementChanceWithLoadedWasm,
  finalizeGeneratedRulesWithLoadedWasm,
} from '../../src/lib/wasm/wasmRuleEngine.js'
import { updateRecipeRulesCache, type RecipeRulesCacheEntry } from '../../src/lib/ruleCache.js'
import { buildMergedRulesComponents, computeMergedRulesFromComponents, type HsfRuleWithRecipe } from '../../src/lib/merge.js'
import { evaluateMatchesByRecipe } from '../../src/lib/ruleEval.js'
import { RULE_SOURCE_SAFEGUARDS } from '../../src/lib/ruleSources.js'
import {
  resolveSafeguardRulesWithMetasets,
  toWasmArtifactStoreRow,
  evaluateAndCollectSafeguardProtection,
  getSafeguardItemKey,
  safeguardEffectiveCountModeForDisplay,
  safeguardFocusBucketKeyFor,
  type SafeguardRule,
  type SafeguardsMergeInput,
  type SafeguardDetectionEntry,
} from '../../src/lib/safeguards.js'
import {
  resolveRecipeOverridesTags,
  applyRecipeOverrides,
  applyRecipeOverridesSubstatTargetsOverrides,
  parseNoteRecipeOverrides,
  applyRecipeOverridesAnswerChange,
  seedSafeguardAnswersFromRecipeDefaults,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags, applySafeguardOverrides } from '../../src/lib/noteSafeguardOverrides.js'
import { recipesForRuleBuild } from '../../src/lib/ruleCacheHelpers.js'

// ── stat-name parsing (PROBE_QUERY substats) ────────────────────────────────────
// Map the human substat tokens used in the query to their numeric StatId. CR/CDMG are
// always percent; the % suffix is accepted but optional. Mirrors domainConstants ids.
const STAT_TOKEN_TO_ID: Record<string, StatId> = {
  HP: StatId.HP, ATK: StatId.ATK, DEF: StatId.DEF, SPD: StatId.SPD,
  RES: StatId.RES, ACC: StatId.ACC, CR: StatId.CR, CRATE: StatId.CR,
  CD: StatId.CDMG, CDMG: StatId.CDMG,
}
function statIdFromToken(token: string): StatId | null {
  const key = token.replace(/%$/, '').replace(/[^A-Za-z]/g, '').toUpperCase()
  return STAT_TOKEN_TO_ID[key] ?? null
}

// ── query model ─────────────────────────────────────────────────────────────────
export type GearQuery = {
  id?: number
  set?: string
  slot?: string
  // substat constraints: statId → expected display value (rounded to integer for match).
  substats: Array<{ statId: StatId; value: number }>
}
// Parse a `set=speed slot=weapon CDMG%=25 ACC=11 ...` query string. Bare `key=value`
// tokens with a recognised stat name become substat constraints; set/slot are reserved.
export function parseQuery(text: string): GearQuery {
  const q: GearQuery = { substats: [] }
  for (const tok of text.trim().split(/\s+/).filter(Boolean)) {
    const eq = tok.indexOf('=')
    if (eq < 0) continue
    const rawKey = tok.slice(0, eq)
    const rawVal = tok.slice(eq + 1)
    const lower = rawKey.toLowerCase()
    if (lower === 'set') { q.set = rawVal; continue }
    if (lower === 'slot') { q.slot = rawVal; continue }
    if (lower === 'id') { q.id = Number(rawVal); continue }
    const statId = statIdFromToken(rawKey)
    if (statId != null) q.substats.push({ statId, value: Number(rawVal) })
  }
  return q
}

// True when `art` satisfies every constraint in `q` (set, slot, all substats present at
// the queried integer value). Substat order is irrelevant; values compared rounded.
function artifactMatchesQuery(art: NormalizedGearArtifact, q: GearQuery): boolean {
  if (q.id != null) return Number(art.id) === q.id
  if (q.set != null) {
    const wantSet = findArtifactSetIdByName(q.set)
    if (wantSet != null && art.set !== wantSet) return false
  }
  if (q.slot != null) {
    const wantSlot = q.slot.toLowerCase()
    const haveSlot = (ARTIFACT_TYPE_DISPLAY_NAMES[art.slot] ?? '').toLowerCase()
    if (haveSlot !== wantSlot) return false
  }
  // Every queried substat must be present at the (rounded) display value.
  for (const want of q.substats) {
    const found = art.substats.find((s) => s.statId === want.statId)
    if (!found) return false
    if (Math.round(found.totalValue) !== Math.round(want.value)) return false
  }
  return true
}

// ── chip resolution result ──────────────────────────────────────────────────────
export type ChipResolution = {
  artifactId: number
  itemKey: number
  // PROTECTION: first-match rule (lowest ordinal) whose itemKeys include this item.
  protection: { ruleOrdinal: number; ruleName: string } | null
  // IMPROVEMENT CHANCE: % shown and the rule it was attributed to by the WASM resolver.
  improvementChance: { percent: number; ruleOrdinal: number; ruleName: string } | null
  // GROUP RANK: the best-rank candidacy across active rules (selection-agnostic here —
  // no rule is selected, so the global lowest rank wins, matching the App's default).
  bucketRank: { rank: number; bucketRank: number; ruleOrdinal: number; ruleName: string } | null
  // IMPROV-CHANCE CHIP click: the rule the improvement-chance overlay jumps to and the
  // substat-weights focus-bucket key it seeds for that rule.
  improvChanceChipJump: { jumpRuleOrdinal: number; ruleName: string; substatWeightsFocusBucketKey: string | null } | null
  // MATCH ROW "first match" chip: the lowest-index rule in the FINAL ruleset the item matches.
  // This is the GearInspectorRuleReferenceChip — a recipe match OR an injected safeguard
  // keep-rule. For safeguard-source rules it shows that safeguard's name (even when the
  // injected rule was emitted with the item's OWN slot, so the name can look slot-mismatched).
  matchRowFirstMatch: {
    ruleIndex: number
    keep: boolean
    isSafeguard: boolean
    label: string
    safeguardRuleOrdinal: number | null
    otherMatchCount: number
  } | null
}

const ruleNameOf = (rules: readonly SafeguardRule[], ordinal: number): string =>
  (rules[ordinal - 1]?.appearance?.name ?? '').trim() || `#${ordinal}`

// ── full pipeline build (mirrors the worker / capture-replay wiring) ─────────────
export type PipelineContext = {
  artifacts: NormalizedGearArtifact[]
  safeguardRules: SafeguardRule[]
  detection: { entries: SafeguardDetectionEntry[] } | null
  improvementEntries: readonly import('../../src/lib/wasm/wasmRuleEngine.js').ImprovementChanceWasmEntry[]
  // Recipe display names indexed by recipe index (for labeling recipe-match chips).
  recipeNames: string[]
  // The FINAL merged ruleset (recipes + injected safeguard keep-rules, in matcher order).
  // The "first match" card chip = the lowest-index rule here that the item matches.
  finalRules: HsfRuleWithRecipe[]
  // The BASELINE merged ruleset (NO injected safeguard rules — detection omitted). The worker
  // matches non-candidate items against this, so its indices are baseline-relative and must be
  // remapped (+ injected count) before indexing finalRules. Exposed so the index-consistency
  // regression check can reproduce the worker's candidate-optimization path.
  baselineRules: HsfRuleWithRecipe[]
}

// Build the full detection + improvement-chance context for a db + preset + overrides.
// `now` drives time-windowed safeguards (lastUse); defaults to a fixed epoch for repeatability.
export async function buildPipelineContext(opts: {
  dbPath: string
  sfcPath: string
  enabledOverrideIds: string[]
  // Optional saved-preset answers to start from (e.g. the committed lategame fixture),
  // before applying enabledOverrideIds. Mirrors loading a preset then changing one toggle.
  baselineAnswers?: { recipe?: NoteRecipeOverridesAnswers; safeguard?: NoteSafeguardOverridesAnswers }
  now?: number
}): Promise<PipelineContext> {
  // ── load + parse preset ──
  const sfcRaw = JSON.parse(readFileSync(opts.sfcPath, 'utf8'))
  const parsed = parseSfcObject(sfcRaw, { metasets: [], substatTargets: defaultSubstatTargets() })
  const noteText: string = Array.isArray(sfcRaw.Note)
    ? sfcRaw.Note.join('\n')
    : (typeof sfcRaw.Note === 'string' ? sfcRaw.Note : '')

  // ── override answers ──
  // Answers are Record<questionId, optionId[]> (NOT id→boolean). An override like
  // `endgame` is one OPTION inside a radio question; selecting it = setting that
  // question's answer to the matching option id. We resolve friendly names (the cb's
  // DSL `id=` token, e.g. `endgame`) to their full option id by parsing the note.
  //
  // Baseline: start from `opts.baselineAnswers` (e.g. the committed lategame fixture)
  // so the probe reflects a real saved preset state, then swap in the requested
  // override option(s). With no baseline, only the requested options are set and the
  // note's `*` defaults apply to every other question.
  const recipeAnswers: NoteRecipeOverridesAnswers = { ...(opts.baselineAnswers?.recipe ?? {}) }
  const safeguardAnswers: NoteSafeguardOverridesAnswers = { ...(opts.baselineAnswers?.safeguard ?? {}) }

  // Map each requested friendly id to (questionId, optionId) by scanning parsed options.
  // An option id has the shape `q_xxx:`label`#n`; the cb's `id=` token is not in the id
  // itself, so we match on the radio-group question whose option labels contain the name.
  if (opts.enabledOverrideIds.length > 0) {
    for (const friendly of opts.enabledOverrideIds) {
      // Re-parse against the CURRENT answers each iteration so prior selections are reflected.
      const parsedQs = parseNoteRecipeOverrides(noteText, recipeAnswers)
      const needle = friendly.toLowerCase()
      let hitQ: ReturnType<typeof parseNoteRecipeOverrides>[number] | null = null
      let hitOptionId: string | null = null
      for (const q of parsedQs) {
        for (const o of q.options) {
          // Option ids embed the human label (e.g. ...:`endgame`#3); match case-insensitively
          // on a back-ticked token so `endgame` does not also catch `endgameplus`.
          if (new RegExp(`\`${needle}\``, 'i').test(o.id)) { hitQ = q; hitOptionId = o.id; break }
        }
        if (hitQ) break
      }
      if (!hitQ || !hitOptionId) throw new Error(`override option "${friendly}" not found in note DSL`)
      // Apply the selection exactly as the NoteDialog radio click does: pass the option as
      // `preferredId` so applyRecipeOverridesAnswerChange runs the release logic — it un-forces
      // checkboxes the OLD difficulty had forced (e.g. lategame `+keep_safeguards`) so the NEW
      // difficulty's `-keep_safeguards` takes effect (firing the rank=6 `else` restriction).
      // Single-select group → next selection is just the chosen option id.
      const updated = applyRecipeOverridesAnswerChange(noteText, recipeAnswers, hitQ, [hitOptionId], hitOptionId)
      // Replace recipeAnswers in place (callers below read the same binding).
      for (const k of Object.keys(recipeAnswers)) delete (recipeAnswers as Record<string, unknown>)[k]
      Object.assign(recipeAnswers, updated)
    }
    // The difficulty radio forces safeguard sliders (per-group quotas, improvement thresholds)
    // via cross-domain `setval`/+/- directives. In the app these only fire on a selection CHANGE,
    // re-seeded through seedSafeguardAnswersFromRecipeDefaults. A baseline fixture saved at a
    // DIFFERENT difficulty carries that difficulty's slider answers, which would otherwise stick
    // (seed never clobbers existing). So we drop the cross-domain-governed slider answers and
    // re-seed from the NEW recipe selection — exactly what clicking the difficulty radio does.
    const forcedSliders = seedSafeguardAnswersFromRecipeDefaults(noteText, recipeAnswers, {})
    for (const qId of Object.keys(forcedSliders)) delete (safeguardAnswers as Record<string, unknown>)[qId]
    const seeded = seedSafeguardAnswersFromRecipeDefaults(noteText, recipeAnswers, safeguardAnswers)
    for (const qId of Object.keys(seeded)) (safeguardAnswers as Record<string, string[]>)[qId] = seeded[qId]!
  }
  const recipeRes = resolveRecipeOverridesTags(noteText, recipeAnswers)
  const safeguardRes = resolveNoteSafeguardOverridesTags(noteText, safeguardAnswers)
  const effRecipeInstr = [...recipeRes.instructions, ...safeguardRes.recipeInstructions]
  const effSafeguardInstr = [...safeguardRes.instructions, ...recipeRes.safeguardInstructions]

  // ── apply overrides to recipes + safeguards ──
  const overrideRecipes = applyRecipeOverrides(parsed.recipes, effRecipeInstr)
  const baseRecipes = recipesForRuleBuild(overrideRecipes)
  const substatTargetsRes = applyRecipeOverridesSubstatTargetsOverrides(parsed.substatTargets, parsed.recipes, effRecipeInstr)
  const effectiveSubstatTargets = substatTargetsRes.substatTargets
  const resolvedSg = resolveSafeguardRulesWithMetasets(parsed.safeguardRules ?? [], parsed.metasets)
  const safeguardRules = applySafeguardOverrides(resolvedSg, effSafeguardInstr) as SafeguardRule[]
  const recipeModes = baseRecipes.map((c) => c.exportMode)
  const hasThreshold = safeguardRules.some((r) => r.improvementChanceThreshold != null)

  // ── load gear from db (production importer path) ──
  const dbBytes = readFileSync(opts.dbPath)
  const imported = await importGearDatabaseFromArrayBuffer(dbBytes.buffer.slice(dbBytes.byteOffset, dbBytes.byteOffset + dbBytes.byteLength))
  const artifacts = [...imported.artifacts, ...imported.inboxArtifacts]

  // ── build merged baseline rules + configure WASM (mirrors worker buildPipelineState) ──
  const persistentRuleCache = new Map<string, RecipeRulesCacheEntry>()
  const finalizeForWorker = (params: Parameters<typeof finalizeGeneratedRulesWithLoadedWasm>[0]) => {
    const finalized = finalizeGeneratedRulesWithLoadedWasm(params)
    if (!finalized) throw new Error('WASM rule finalizer unavailable after warmup')
    return finalized
  }
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
  const baseline = computeMergedRulesFromComponents(shared, {
    ...(parsed.finalSellRemainder != null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    safeguards: baseSg, omitDisabledBeforeSafeguards: false, dedupeBeforeSafeguards: false, rulesCacheKey: 'probe',
  })
  configureWasmRuleEngineWithLoadedWasm({ rules: baseline, recipeModes: Array.from(recipeModes) })
  storeArtifactRowsWithLoadedWasm({ rows: artifacts.map((a) => toWasmArtifactStoreRow(a)) })

  // ── improvement chances (current gear) ──
  const improvementEntries = hasThreshold
    ? (computeImprovementChanceWithLoadedWasm({ rules: safeguardRules, enabled: parsed.safeguardsEnabled ?? false })?.entries ?? [])
    : []

  // ── detection (high-level entry point — injects expectedBucketDomain) ──
  const det = evaluateAndCollectSafeguardProtection({
    rules: safeguardRules,
    enabled: parsed.safeguardsEnabled ?? false,
    now: opts.now ?? 1_782_035_334_000,
    precomputedImprovementChances: improvementEntries,
  })
  clearStoredRowsWithLoadedWasm()

  // ── FINAL ruleset: re-merge WITH the detection injected (the safeguard keep-rules). This is
  // the ruleset the matcher runs against to produce the card's recipe/safeguard match chips. ──
  const withDet: SafeguardsMergeInput = { ...baseSg, detection: det.detection }
  const finalRules = computeMergedRulesFromComponents(shared, {
    ...(parsed.finalSellRemainder != null ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    safeguards: withDet, omitDisabledBeforeSafeguards: false, dedupeBeforeSafeguards: false, rulesCacheKey: 'probe-final',
  })

  // Recipe display names (appearance.name) indexed by recipe index, for chip labels.
  const recipeNames = baseRecipes.map((r) => (r.appearance?.name ?? '').trim())

  return { artifacts, safeguardRules, detection: det.detection, improvementEntries, finalRules, recipeNames, baselineRules: baseline }
}

// Rank-chip display mode (matches SafeguardRankMode minus 'off'). Governs which rule wins
// the GROUP RANK chip when an item is scored by several: 'bucketRank'/'both' sort by the
// per-group bucket rank (rules without a group fall back to global), 'rank' by global rank.
// Mirrors GearInspectorItemsGrid rowSortKey (line ~893).
export type RankChipMode = 'rank' | 'bucketRank' | 'both'

// Resolve the four Gear Inspector chips for one artifact within a built context.
// All four use the SAME selection logic the UI uses — read here, never re-derived.
// `rankMode` defaults to 'bucketRank' (the mode that shows a bucket rank; this probe's question
// is about the bucket-rank chip). It only affects the GROUP RANK winner's tie-break.
export function resolveGearInspectorChips(
  ctx: PipelineContext,
  artifactId: number,
  rankMode: RankChipMode = 'bucketRank',
): ChipResolution {
  const art = ctx.artifacts.find((a) => Number(a.id) === artifactId)
  if (!art) throw new Error(`artifact ${artifactId} not in dataset`)
  const itemKey = getSafeguardItemKey(art)
  const entries = ctx.detection?.entries ?? []

  // PROTECTION — first-match rule (lowest ordinal) whose itemKeys reserve this item.
  let protection: ChipResolution['protection'] = null
  for (const e of entries) {
    if (e.ruleOrdinal == null) continue
    if (!e.itemKeys.includes(itemKey)) continue
    if (protection == null || e.ruleOrdinal < protection.ruleOrdinal) {
      protection = { ruleOrdinal: e.ruleOrdinal, ruleName: ruleNameOf(ctx.safeguardRules, e.ruleOrdinal) }
    }
  }

  // IMPROVEMENT CHANCE — the WASM resolver already chose the winning rule (entry.ruleOrdinal);
  // we just read the displayed % and attributed ordinal for this artifact.
  let improvementChance: ChipResolution['improvementChance'] = null
  const ic = ctx.improvementEntries.find((e) => e.artifactId === artifactId)
  if (ic && ic.hasMatchingSafeguard && ic.ruleOrdinal != null) {
    improvementChance = {
      percent: ic.chancePercent,
      ruleOrdinal: ic.ruleOrdinal,
      ruleName: ruleNameOf(ctx.safeguardRules, ic.ruleOrdinal),
    }
  }

  // GROUP RANK — the rule whose candidacy sorts FIRST for this item, using the grid's
  // rowSortKey: in bucketRank/both mode sort by bucket rank ([0, bucketRank]) with grouped
  // rules ahead of ungrouped ([1, globalRank]); in rank mode sort by global rank ([0, rank]).
  // No rule is selected in this headless probe, so selection-tier preference is inert.
  const groupRankShown = rankMode === 'bucketRank' || rankMode === 'both'
  const sortKeyFor = (rank: number, bucket: number): [number, number] =>
    (groupRankShown && rankMode === 'bucketRank'
      ? (bucket > 0 ? [0, bucket] : [1, rank])
      : [0, rank])
  let bucketRank: ChipResolution['bucketRank'] = null
  let bestSort: [number, number] | null = null
  for (const e of entries) {
    if (e.ruleOrdinal == null || !e.candidates) continue
    const cand = e.candidates.find((c) => c.itemKey === itemKey && c.candidateRank > 0)
    if (!cand) continue
    const sk = sortKeyFor(cand.candidateRank, cand.bucketRank)
    // Lexicographic compare on [tier, key]; lower sorts first (more protected).
    const wins = bestSort == null || sk[0] < bestSort[0] || (sk[0] === bestSort[0] && sk[1] < bestSort[1])
    if (wins) {
      bestSort = sk
      bucketRank = {
        rank: cand.candidateRank,
        bucketRank: cand.bucketRank,
        ruleOrdinal: e.ruleOrdinal,
        ruleName: ruleNameOf(ctx.safeguardRules, e.ruleOrdinal),
      }
    }
  }

  // IMPROV-CHANCE CHIP click — clicking the improvement-chance overlay jumps to its rule and
  // seeds the substat-weights flyout focus to this item's bucket.
  let improvChanceChipJump: ChipResolution['improvChanceChipJump'] = null
  if (improvementChance != null) {
    const rule = ctx.safeguardRules[improvementChance.ruleOrdinal - 1]
    let focusKey: string | null = null
    if (rule) {
      // Same effective (redundancy-suppressed) count mode the weights flyout uses (App 6013).
      const effectiveMode = safeguardEffectiveCountModeForDisplay(rule.combination, rule.countMode)
      // Locate this item's detection artifact to read its slot/set/faction/main for the key.
      const entry = entries.find((e) => e.ruleOrdinal === improvementChance!.ruleOrdinal) ?? null
      const detArt = entry?.artifacts.find((a) => a.itemKey === itemKey) ?? null
      if (detArt) focusKey = safeguardFocusBucketKeyFor(detArt, effectiveMode)
    }
    improvChanceChipJump = {
      jumpRuleOrdinal: improvementChance.ruleOrdinal,
      ruleName: improvementChance.ruleName,
      substatWeightsFocusBucketKey: focusKey,
    }
  }

  // MATCH ROW "first match" chip — run the production matcher over the FINAL ruleset for this
  // item and read its firstMatch (lowest-index matching rule) + how many recipes match anywhere.
  // This is the chip labelled the item's "first match" in the app (GearInspectorRuleReferenceChip).
  let matchRowFirstMatch: ChipResolution['matchRowFirstMatch'] = null
  const matchRes = evaluateMatchesByRecipe(ctx.finalRules, art.gearInspectorItem)
  const fm = matchRes.firstMatch
  if (fm) {
    const rule = ctx.finalRules[fm.ruleIndex]
    const isSafeguard = rule?.__source === RULE_SOURCE_SAFEGUARDS
    const sgOrdinal = isSafeguard ? (rule?.__safeguardRuleOrdinal ?? null) : null
    // Safeguard match → show the safeguard's appearance name; recipe match → its recipe name
    // (resolved from recipeIdx via the parsed recipe appearance names, like the app does).
    const recipeName = (fm.recipeIdx != null && fm.recipeIdx >= 0 && fm.recipeIdx < ctx.recipeNames.length)
      ? ctx.recipeNames[fm.recipeIdx]
      : undefined
    const label = isSafeguard && sgOrdinal != null
      ? ruleNameOf(ctx.safeguardRules, sgOrdinal)
      : (recipeName || rule?.RecipeName || `rule#${fm.ruleIndex}`)
    matchRowFirstMatch = {
      ruleIndex: fm.ruleIndex,
      keep: fm.keep,
      isSafeguard,
      label,
      safeguardRuleOrdinal: sgOrdinal,
      // Card shows the first match + the rest as "+N"; count distinct matching recipes minus the one shown.
      otherMatchCount: Math.max(0, matchRes.matchingRecipeIndices.length - 1),
    }
  }

  return { artifactId, itemKey, protection, improvementChance, bucketRank, improvChanceChipJump, matchRowFirstMatch }
}

// ── candidate-optimization index-consistency check ───────────────────────────────
// Regression guard for the Banner-on-Weapon bug: the worker matches non-candidate items
// against the BASELINE ruleset and reuses that result, but the main thread looks the rule up in
// the FINAL ruleset. The baseline `ruleIndex` must be shifted by the injected-safeguard count
// (finalRules.len − baselineRules.len) or it lands on the wrong (often slot-mismatched safeguard)
// rule. This reproduces both paths for one item and asserts they reference the SAME rule.
export type IndexConsistencyResult = {
  artifactId: number
  // Full final-scan first match (ground truth the chip should show).
  finalRuleIndex: number | null
  finalRuleName: string | null
  // Baseline first match + the worker's remap (+offset) into final space.
  baselineRuleIndex: number | null
  offset: number
  remappedRuleIndex: number | null
  remappedRuleName: string | null
  // True when the remapped baseline index resolves to the same rule as the full final scan.
  consistent: boolean
}
const ruleDisplayName = (rule: HsfRuleWithRecipe | undefined): string | null => {
  if (!rule) return null
  // The injected/merged HSF row carries its display name as RecipeName (safeguard rules inherit
  // the originating recipe's name; recipe rules carry their own).
  return (rule as HsfRuleWithRecipe & { RecipeName?: string }).RecipeName ?? null
}
export function checkFirstMatchIndexConsistency(ctx: PipelineContext, artifactId: number): IndexConsistencyResult {
  const art = ctx.artifacts.find((a) => Number(a.id) === artifactId)
  if (!art) throw new Error(`artifact ${artifactId} not in dataset`)
  // Ground truth: full scan against the FINAL ruleset (what the chip should reflect).
  const finalRes = evaluateMatchesByRecipe(ctx.finalRules, art.gearInspectorItem)
  const finalIdx = finalRes.firstMatch?.ruleIndex ?? null
  // Worker's reuse path: match against the BASELINE ruleset, then shift by the injected count.
  const baseRes = evaluateMatchesByRecipe(ctx.baselineRules, art.gearInspectorItem)
  const baseIdx = baseRes.firstMatch?.ruleIndex ?? null
  const offset = ctx.finalRules.length - ctx.baselineRules.length
  const remappedIdx = baseIdx != null ? baseIdx + offset : null
  // Consistent when the remapped baseline rule IS the same rule object the full scan found.
  const consistent = finalIdx != null && remappedIdx != null
    ? ctx.finalRules[finalIdx] === ctx.finalRules[remappedIdx]
    : finalIdx === remappedIdx
  return {
    artifactId,
    finalRuleIndex: finalIdx,
    finalRuleName: finalIdx != null ? ruleDisplayName(ctx.finalRules[finalIdx]) : null,
    baselineRuleIndex: baseIdx,
    offset,
    remappedRuleIndex: remappedIdx,
    remappedRuleName: remappedIdx != null ? ruleDisplayName(ctx.finalRules[remappedIdx]) : null,
    consistent,
  }
}

// ── script entry point (only runs when invoked directly, not when imported) ──────
async function main(): Promise<void> {
  const ROOT = process.cwd()
  const dbPath = resolve(ROOT, process.env.PROBE_DB ?? '')
  if (!process.env.PROBE_DB) { console.error('[probe] PROBE_DB is required'); process.exit(2) }
  const sfcPath = resolve(ROOT, process.env.PROBE_SFC ?? 'presets/lategame.sfc')
  const overrideIds = (process.env.PROBE_OVERRIDE ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const now = process.env.PROBE_NOW ? Number(process.env.PROBE_NOW) : undefined
  // PROBE_BASELINE_ANSWERS — JSON file of saved-preset answers to start from (e.g. the
  // committed lategame fixture). Without it, the note's `*` defaults apply to every
  // question except the requested override option(s).
  const baselineAnswers = process.env.PROBE_BASELINE_ANSWERS
    ? JSON.parse(readFileSync(resolve(ROOT, process.env.PROBE_BASELINE_ANSWERS), 'utf8'))
    : undefined

  const ctx = await buildPipelineContext({
    dbPath, sfcPath, enabledOverrideIds: overrideIds,
    ...(baselineAnswers ? { baselineAnswers } : {}),
    ...(now != null ? { now } : {}),
  })

  // Resolve the target artifact: explicit id, else substat/set/slot query.
  let targetId: number | null = process.env.PROBE_ID ? Number(process.env.PROBE_ID) : null
  let matched: NormalizedGearArtifact[] = []
  if (targetId == null && process.env.PROBE_QUERY) {
    const q = parseQuery(process.env.PROBE_QUERY)
    matched = ctx.artifacts.filter((a) => artifactMatchesQuery(a, q))
    if (matched.length === 1) targetId = Number(matched[0]!.id)
  }

  console.log(`[probe] db=${process.env.PROBE_DB} sfc=${process.env.PROBE_SFC ?? 'presets/lategame.sfc'}`
    + ` override=[${overrideIds.join(',')}] artifacts=${ctx.artifacts.length} safeguards=${ctx.safeguardRules.length}`)

  if (targetId == null) {
    console.error(`[probe] query did not resolve to a single artifact (matched ${matched.length}). `
      + `Set PROBE_ID, or refine PROBE_QUERY.`)
    for (const a of matched.slice(0, 10)) {
      const subs = a.substats.map((s) => `${s.statId}=${Math.round(s.totalValue)}`).join(',')
      console.error(`   candidate id=${a.id} set=${artifactSetName(a.set)} slot=${ARTIFACT_TYPE_DISPLAY_NAMES[a.slot]} [${subs}]`)
    }
    process.exit(1)
  }

  const target = ctx.artifacts.find((a) => Number(a.id) === targetId)!
  const subs = target.substats.map((s) => `${s.statId}=${Math.round(s.totalValue)}`).join(',')
  console.log(`[probe] target id=${targetId} set=${artifactSetName(target.set)} slot=${ARTIFACT_TYPE_DISPLAY_NAMES[target.slot]} [${subs}]`)

  const chips = resolveGearInspectorChips(ctx, targetId)
  console.log(`\n=== GEAR INSPECTOR CHIPS (id=${chips.artifactId}, itemKey=${chips.itemKey}) ===`)
  console.log(`PROTECTION:       ${chips.protection ? `safeguard #${chips.protection.ruleOrdinal} "${chips.protection.ruleName}"` : '(none)'}`)
  console.log(`IMPROV CHANCE:    ${chips.improvementChance ? `${chips.improvementChance.percent}% from safeguard #${chips.improvementChance.ruleOrdinal} "${chips.improvementChance.ruleName}"` : '(none)'}`)
  console.log(`GROUP RANK:       ${chips.bucketRank ? `rank #${chips.bucketRank.rank} (group #${chips.bucketRank.bucketRank}) from safeguard #${chips.bucketRank.ruleOrdinal} "${chips.bucketRank.ruleName}"` : '(none)'}`)
  // The MATCH-ROW "first match" chip — what the app shows as the item's first matched rule.
  console.log(`FIRST MATCH CHIP: ${chips.matchRowFirstMatch
    ? `"${chips.matchRowFirstMatch.label}" (${chips.matchRowFirstMatch.isSafeguard ? `safeguard #${chips.matchRowFirstMatch.safeguardRuleOrdinal}` : 'recipe'}, ${chips.matchRowFirstMatch.keep ? 'KEEP' : 'SELL'}, ruleIndex=${chips.matchRowFirstMatch.ruleIndex})`
      + (chips.matchRowFirstMatch.otherMatchCount > 0 ? ` +${chips.matchRowFirstMatch.otherMatchCount}` : '')
    : '(no match)'}`)
  console.log(`  improv-chance chip jump → ${chips.improvChanceChipJump ? `safeguard #${chips.improvChanceChipJump.jumpRuleOrdinal} "${chips.improvChanceChipJump.ruleName}", weights focus bucket ${chips.improvChanceChipJump.substatWeightsFocusBucketKey ?? '(none)'}` : '(none)'}`)

  // Candidate-optimization index-consistency check (the Banner-on-Weapon regression guard).
  const ic = checkFirstMatchIndexConsistency(ctx, targetId)
  console.log(`\n=== INDEX CONSISTENCY (worker candidate-optimization path) ===`)
  console.log(`  full-final-scan:   ruleIndex=${ic.finalRuleIndex} name=${JSON.stringify(ic.finalRuleName)}`)
  console.log(`  baseline+remap:    baselineIndex=${ic.baselineRuleIndex} +offset(${ic.offset}) → ${ic.remappedRuleIndex} name=${JSON.stringify(ic.remappedRuleName)}`)
  console.log(`  ${ic.consistent ? 'CONSISTENT ✓ (chip shows the same rule both ways)' : 'INCONSISTENT ✗ (BUG: baseline reuse would show a different rule)'}`)

  // PROBE_DIAG=1 — dump every safeguard that touches this item: itemKeys membership
  // (protection), per-rule candidate rank, and the per-rule improvement chance. This is
  // the ground-truth view behind the four chips, useful when a chip result is surprising.
  if (process.env.PROBE_DIAG === '1') {
    console.log(`\n=== PROBE_DIAG: all safeguards touching itemKey=${chips.itemKey} ===`)
    const entries = ctx.detection?.entries ?? []
    const ic = ctx.improvementEntries.find((e) => e.artifactId === targetId)
    const chanceByOrdinal = new Map<number, number>()
    for (const r of ic?.chancesByRuleOrdinal ?? []) chanceByOrdinal.set(r.ruleOrdinal, r.chancePercent)
    for (const e of entries) {
      if (e.ruleOrdinal == null) continue
      const inItemKeys = e.itemKeys.includes(chips.itemKey)
      const cand = e.candidates?.find((c) => c.itemKey === chips.itemKey) ?? null
      const chance = chanceByOrdinal.get(e.ruleOrdinal)
      // Only show rules that touch this item in some way (protect, score, or chance).
      if (!inItemKeys && !cand && chance == null) continue
      const name = ctx.safeguardRules[e.ruleOrdinal - 1]?.appearance?.name ?? `#${e.ruleOrdinal}`
      const parts: string[] = []
      if (inItemKeys) parts.push('PROTECTS (in itemKeys)')
      if (cand) parts.push(`rank #${cand.candidateRank} group #${cand.bucketRank} withinQuota=${cand.isWithinQuota}`)
      if (chance != null) parts.push(`improvChance=${chance}%`)
      console.log(`  #${e.ruleOrdinal} "${name}": ${parts.join(' | ')}`)
    }
    if (ic) {
      console.log(`  [improv summary] hasMatchingSafeguard=${ic.hasMatchingSafeguard} resolvedRuleOrdinal=${ic.ruleOrdinal} chancePercent=${ic.chancePercent}`)
    } else {
      console.log(`  [improv summary] no improvement-chance entry for this artifact`)
    }

    // Reproduce the App's safeguardRankByArtifactId tooltip EXACTLY (App.tsx ~5764-5806):
    // primary = lowest GLOBAL candidateRank; otherRules = up to 3 more rules sorted by global
    // rank, deduped by ordinal; the tooltip then displays bucketRank (bucketRank) per row. This is
    // the authoritative "Bucket Rank" tooltip list — compare it against the in-app tooltip.
    type Rec = { rank: number; bucketRank: number; ruleOrdinal: number; withinQuota: boolean }
    let primary: Rec | null = null
    const others: Rec[] = []
    for (const e of entries) {
      if (e.ruleOrdinal == null || !e.candidates) continue
      const c = e.candidates.find((x) => x.itemKey === chips.itemKey && x.candidateRank > 0)
      if (!c) continue
      const rec: Rec = { rank: c.candidateRank, bucketRank: c.bucketRank, ruleOrdinal: e.ruleOrdinal, withinQuota: c.isWithinQuota }
      // No rule selected → primary preference is purely lowest global rank.
      if (primary == null || rec.rank < primary.rank) { if (primary) others.push(primary); primary = rec }
      else others.push(rec)
    }
    if (primary) {
      const seen = new Set<number>([primary.ruleOrdinal])
      const top3: Rec[] = []
      for (const o of others.sort((a, b) => a.rank - b.rank)) {
        if (seen.has(o.ruleOrdinal)) continue
        seen.add(o.ruleOrdinal); top3.push(o)
        if (top3.length === 3) break
      }
      console.log(`  [bucket-rank tooltip] (primary by global rank, others top-3 by global rank; shows bucketRank)`)
      for (const r of [primary, ...top3]) {
        const nm = ctx.safeguardRules[r.ruleOrdinal - 1]?.appearance?.name ?? `#${r.ruleOrdinal}`
        console.log(`    #${r.bucketRank} (global #${r.rank}) ord=${r.ruleOrdinal} "${nm}"`)
      }
    }
  }
  process.exit(0)
}

// Only run main() when executed as a script (import.meta.url === entry).
const isEntry = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`
if (isEntry) { void main() }
