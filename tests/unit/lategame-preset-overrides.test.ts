import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  resolveRecipeOverridesTags,
  collectRecipeOverridesDiagnostics,
  seedSafeguardAnswersFromRecipeDefaults,
  applyRecipeOverridesAnswerChange,
  collectCrossDomainSliderWrites,
  collectTierOwnedSliderQuestionIds,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags, buildSafeguardSliderTokenMap } from '../../src/lib/noteSafeguardOverrides.js'
import { listOverrideBlocks, parseOverridesBlockDraft } from '../../src/lib/overridesDraft.js'

// Load the real shipped preset note so we validate the actual authored markup.
const sfc = JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))
const note: string = (sfc.Note as string[]).join('\n')

const seed = resolveRecipeOverridesTags(note)
const rankQ = seed.questions.find((q) => q.options.some((o) => o.token === 'keep_general'))!
const acctQ = seed.questions.find((q) => q.options.some((o) => o.token === 'endgame'))!

// Tokens checked in the 5★ card after a tier (or raw answer set) is resolved.
const keepTokens = (r: ReturnType<typeof resolveRecipeOverridesTags>) => {
  const q = r.questions.find((x) => x.id === rankQ.id)!
  return q.answer.map((id) => q.options.find((o) => o.id === id)?.token).filter(Boolean)
}
const tier = (token: string) => {
  const oid = acctQ.options.find((o) => o.token === token)!.id
  return resolveRecipeOverridesTags(note, { [acctQ.id]: [oid] }, oid)
}
const hasRankSix = (r: ReturnType<typeof resolveRecipeOverridesTags>, tag: string) =>
  r.instructions.some((b) => b.selector.kind === 'tag' && (b.selector.values ?? []).includes(tag)
    && b.operations.some((o) => o.kind === 'rank' && o.value === 6))
const hasSafeguardClamp = (r: ReturnType<typeof resolveRecipeOverridesTags>, tag: string) =>
  r.safeguardInstructions.some((b) => b.selector.kind === 'tag' && (b.selector.values ?? []).includes(tag))

test('the 5★ card parses with no diagnostics', () => {
  let count = 0
  const re = /<!--\s*recipe-overrides[\s\S]*?-->/g
  let m: RegExpExecArray | null
  while ((m = re.exec(note))) { const ds: { from: number; to: number; message: string }[] = []; collectRecipeOverridesDiagnostics(m[0], m.index, ds); count += ds.length }
  assert.equal(count, 0, 'recipe-overrides markers must have no syntax diagnostics')
  for (const tok of ['keep_general', 'keep_limited', 'keep_acc', 'keep_spd', 'keep_safeguards', 'midgame', 'lategame', 'endgame']) {
    assert.ok([...rankQ.options, ...acctQ.options].some((o) => o.token === tok), `${tok} should parse`)
  }
})

test('tier defaults match the pre-change behavior', () => {
  // Midgame keeps everything (general + scarce + safeguards), nothing tightened.
  const mid = tier('midgame')
  assert.deepEqual(keepTokens(mid), ['keep_general', 'keep_limited', 'keep_acc', 'keep_spd', 'keep_safeguards'])
  assert.ok(!hasRankSix(mid, 'limited') && !hasSafeguardClamp(mid, 'debuffer'), 'Midgame sells nothing')

  // Lategame: keep scarce 5★ + full safeguards, no general 5★ (= original Lategame base).
  const late = resolveRecipeOverridesTags(note) // ships as Lategame
  assert.deepEqual(keepTokens(late), ['keep_limited', 'keep_acc', 'keep_spd', 'keep_safeguards'])
  assert.ok(!hasRankSix(late, 'limited') && !hasSafeguardClamp(late, 'debuffer'), 'Lategame keeps 5★ recipes + safeguards')

  // Endgame: keep 5★ recipes, but clamp safeguards (= original rank_stricter behavior).
  const end = tier('endgame')
  assert.deepEqual(keepTokens(end), ['keep_limited', 'keep_acc', 'keep_spd'])
  assert.ok(!hasRankSix(end, 'limited'), 'Endgame still keeps 5★ recipes by default')
  assert.ok(hasSafeguardClamp(end, 'debuffer'), 'Endgame clamps safeguards to 6★')
})

test('per-option else: unchecking a keep toggle tightens only that category', () => {
  const base = resolveRecipeOverridesTags(note)
  const full: Record<string, string[]> = {}
  for (const q of base.questions) full[q.id] = q.answer
  const keepLim = rankQ.options.find((o) => o.token === 'keep_limited')!.id
  const without = full[rankQ.id]!.filter((id) => id !== keepLim)
  const r = resolveRecipeOverridesTags(note, { ...full, [rankQ.id]: without }, undefined, keepLim)
  assert.ok(hasRankSix(r, 'limited'), 'unchecking keep_limited must sell 5★ limited (else fires)')
  assert.ok(!hasRankSix(r, 'acc5') && !hasRankSix(r, 'spd_any'), 'other categories stay kept')
})

test('keep_general forces the scarce toggles on (set directive)', () => {
  const keepGen = rankQ.options.find((o) => o.token === 'keep_general')!.id
  const r = resolveRecipeOverridesTags(note, { [rankQ.id]: [keepGen] }, keepGen)
  assert.deepEqual(keepTokens(r), ['keep_general', 'keep_limited', 'keep_acc', 'keep_spd', 'keep_safeguards'])
})

test('switching account tiers resets the 5★ toggles deterministically', () => {
  const full = (r: ReturnType<typeof resolveRecipeOverridesTags>) => {
    const map: Record<string, string[]> = {}; for (const q of r.questions) map[q.id] = q.answer; return map
  }
  const pick = (prev: ReturnType<typeof resolveRecipeOverridesTags>, t: string) => {
    const oid = acctQ.options.find((o) => o.token === t)!.id
    return resolveRecipeOverridesTags(note, { ...full(prev), [acctQ.id]: [oid] }, oid)
  }
  const load = resolveRecipeOverridesTags(note)
  assert.deepEqual(keepTokens(pick(pick(load, 'midgame'), 'lategame')), keepTokens(load), 'Midgame→Lategame == fresh load')
  assert.deepEqual(keepTokens(pick(pick(load, 'endgame'), 'lategame')), keepTokens(load), 'Endgame→Lategame == fresh load')
})

// ── Account modes set both improvement-chance sliders via setval (persist-on-select) ──
// The cross-domain WRITE is done in the NoteDialog handler; here we assert each mode carries the
// right setval directives, and that the target sliders exist with the ids those directives name.

test('the improvement-chance sliders carry the setval target ids', () => {
  const sg = resolveNoteSafeguardOverridesTags(note)
  const sliderTokens = sg.questions
    .flatMap((q) => q.options.filter((o) => o.groupType === 'slider').map((o) => o.token))
  assert.ok(sliderTokens.includes('impr_art'), 'artifact slider has id=impr_art')
  assert.ok(sliderTokens.includes('impr_acc'), 'accessory slider has id=impr_acc')
})

test('the default Lategame tier forces no sliders; every stricter tier forces the full set', () => {
  // The account-tier is the resting state: its stored recipes/safeguards already equal Lategame,
  // so Lategame carries NO cross-domain slider force — the slider values live in each slider's
  // re-baselined `default=`. Every OTHER tier still forces the full 6-slider set so it overrides
  // the Lategame base when selected.
  const setvalTokens = (token: string): string[] => {
    const opt = acctQ.options.find((o) => o.token === token)!
    return opt.setValueDirectives.map((d) => d.token).sort()
  }
  const fullSet = ['impr_acc', 'impr_art', 'min_debuffer_pieces', 'min_dmgsurv_pieces', 'min_spd_pieces', 'min_spdbanner_pieces'].sort()
  // Lategame (the `*` default) forces nothing — that is the whole point of the re-baseline.
  assert.deepEqual(setvalTokens('lategame'), [], 'default Lategame tier carries no slider forces')
  // The stricter/looser tiers still force every slider (they diff against the Lategame base).
  for (const tier of ['midgame', 'endgame', 'endgameplus']) {
    assert.deepEqual(setvalTokens(tier), fullSet, `${tier} forces every keep-piece/improv slider`)
    for (const d of acctQ.options.find((o) => o.token === tier)!.setValueDirectives) {
      assert.ok(Number.isFinite(d.value) && d.value > 0, `${tier} ${d.token} is a positive number (${d.value})`)
    }
  }
})

test('loading the preset leaves tier sliders empty; they resolve to the Lategame default=', () => {
  // Fresh load (empty answers) → the `*` default Lategame is selected. Because Lategame forces no
  // sliders, the seed writes NOTHING, so every tier-owned slider answer stays absent and resolves
  // via its own `default=`. Those defaults were re-baselined to the Lategame values, so a fresh
  // load == native Lategame with no override touching the stored rules. This is the new SSOT.
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  assert.deepEqual(seeded, {}, 'default Lategame seeds no slider answers (nothing forced)')
  const sg = resolveNoteSafeguardOverridesTags(note, seeded)
  // The improvement-chance sliders must resolve to the Lategame numbers via their default= (33/50).
  const sliderDefault = (token: string): number | undefined =>
    sg.questions.flatMap((q) => q.options).find((o) => o.token === token)?.sliderDefault
  assert.equal(sliderDefault('impr_art'), 33, 'impr_art default= re-baselined to the Lategame 33%')
  assert.equal(sliderDefault('impr_acc'), 50, 'impr_acc default= re-baselined to the Lategame 50%')
  assert.equal(sliderDefault('min_spd_pieces'), 12, 'min_spd_pieces default= re-baselined to Lategame 12')
})

test('"Reset Options to Defaults" clears a dirtied tier slider back to the Lategame default=', () => {
  // Reproduce the reset handler: it clears recipe answers and computes safeguard answers via
  // seedSafeguardAnswersFromRecipeDefaults(note) with NO `existing` map — so prior user edits
  // (e.g. a dragged-away slider) are discarded. Since Lategame forces nothing, the reset produces
  // an empty answer map and the slider falls back to its re-baselined `default=` (the Lategame value).
  const spdQ = resolveNoteSafeguardOverridesTags(note).questions
    .find((x) => x.options.some((o) => o.token === 'min_spd_pieces'))!
  // Simulate a user who dragged the speed-set slider to a non-default value.
  const dirtied = { [spdQ.id]: ['64'] }
  const afterReset = seedSafeguardAnswersFromRecipeDefaults(note)
  assert.equal(afterReset[spdQ.id], undefined, 'reset discards the dragged value (slider answer cleared)')
  assert.notEqual(afterReset[spdQ.id]?.[0], dirtied[spdQ.id]?.[0], 'reset discards the dragged value')
  // With no stored answer the slider resolves to its default=, re-baselined to the Lategame 12.
  const spdSlider = resolveNoteSafeguardOverridesTags(note, afterReset).questions
    .flatMap((q) => q.options).find((o) => o.token === 'min_spd_pieces')!
  assert.equal(spdSlider.sliderDefault, 12, 'reset lands the speed-set slider on the Lategame default 12')
})

// Every non-spacer question's id, frozen to its v1.0.34 hash. These literals ARE the ids
// v1.0.34 produced — never "fix" them to a freshly-derived hash, or every override set saved
// before the corresponding question was edited stops loading. Each question carries an explicit
// `id=` pin (see the "all questions are pinned" test below) so the id is stable regardless of
// later prompt/option edits. Order follows the note (recipe first, then safeguard).
const EXPECTED_QUESTION_IDS = [
  'q_2tq5i', 'q_kkcisb', 'q_evol16', 'q_y3oudu', 'q_ie2b4p', 'q_tfgi84', 'q_903a0o',
  'q_2ye83x', 'q_62mbb3', 'q_wmwi89', 'q_gs7912', 'q_6df61p', 'q_6aowi9',
  'q_ta25kl', 'q_bk3r8j', 'q_416mju', 'q_tk0vqr', 'q_muougk', 'q_uiw6og', 'q_nfb217',
] as const

test('every lategame question carries a v1.0.34-compatible pinned id= (regression: saved-set rescue)', () => {
  // The safeguard count cards gained an activation-mode radio group after v1.0.34, which
  // re-hashed their derived ids and orphaned sets saved with the older (slider-only) ids.
  // To prevent the whole class of breakage, EVERY question is pinned to its v1.0.34 hash via
  // an explicit `id=`. This test enforces two properties on the shipped preset:
  //   (1) each non-spacer question parses with a non-null explicitId (i.e. it IS pinned), and
  //   (2) the full set of resolved question ids equals the frozen v1.0.34 set.
  // A future author who adds an unpinned question, or whose edit drifts an id, trips this.

  // (1) Every non-spacer question block carries an explicit id= pin.
  const questionDrafts = listOverrideBlocks(note)
    .map((block) => parseOverridesBlockDraft(block.raw).draft)
    .filter((draft): draft is Extract<NonNullable<typeof draft>, { kind: 'question' }> =>
      draft != null && draft.kind === 'question')
  for (const draft of questionDrafts) {
    assert.notEqual(draft.explicitId, null,
      `question "${draft.prompt.base.slice(0, 48)}…" must carry an explicit id= pin`)
  }

  // (2) The resolved ids across both domains match the frozen v1.0.34 set exactly.
  const resolvedIds = [
    ...resolveRecipeOverridesTags(note).questions,
    ...resolveNoteSafeguardOverridesTags(note).questions,
  ].filter((q) => !q.id.startsWith('spacer')).map((q) => q.id)
  assert.deepEqual(resolvedIds, [...EXPECTED_QUESTION_IDS],
    'the shipped question ids must equal (and stay in the order of) the frozen v1.0.34 set')
})

// ── Tier switch-back clear-forces (the stuck-slider regression) ───────────────────────────────
// After the re-baseline, the default Lategame tier forces no sliders. Switching a stricter tier
// (Endgame) → Lategame therefore writes nothing, and — without the clear-forces logic — would leave
// Endgame's stored slider values stuck. `collectTierOwnedSliderQuestionIds` lets the NoteDialog
// handler release those owned sliders so they fall back to the (Lategame) `default=`. This replicates
// the core of NoteDialog.handleRecipeOverridesAnswerChange to guard that behavior at the unit level.

// Replicate the handler's cross-domain slider effect: apply a tier selection over prior answers.
const simTierSwitch = (
  recipeAnswers: Record<string, string[]>,
  sgAnswers: Record<string, string[]>,
  targetToken: string,
): { recipeAnswers: Record<string, string[]>; sgAnswers: Record<string, string[]> } => {
  const question = seed.questions.find((q) => q.id === acctQ.id)!
  const opt = acctQ.options.find((o) => o.token === targetToken)!
  const sliderByToken = buildSafeguardSliderTokenMap(resolveNoteSafeguardOverridesTags(note).questions)
  // Options selected BEFORE this change (only newly-selected options contribute writes).
  const before = new Set(resolveRecipeOverridesTags(note, recipeAnswers).questions.flatMap((q) => q.answer))
  const nextRecipe = applyRecipeOverridesAnswerChange(note, recipeAnswers, question, [opt.id], opt.id, undefined)
  const writes = collectCrossDomainSliderWrites(
    resolveRecipeOverridesTags(note, nextRecipe).questions, sliderByToken, (id) => !before.has(id),
  )
  // Clear-forces: drop every tier-owned slider the newly-selected tier does not itself write.
  const owned = collectTierOwnedSliderQuestionIds([question], sliderByToken)
  const written = new Set(writes.map((w) => w.questionId))
  const nextSg = { ...sgAnswers }
  for (const id of owned) if (!written.has(id)) delete nextSg[id]
  for (const w of writes) nextSg[w.questionId] = [w.value]
  return { recipeAnswers: nextRecipe, sgAnswers: nextSg }
}

const spdQuestionId = resolveNoteSafeguardOverridesTags(note).questions
  .find((x) => x.options.some((o) => o.token === 'min_spd_pieces'))!.id
const imprArtQuestionId = resolveNoteSafeguardOverridesTags(note).questions
  .find((x) => x.options.some((o) => o.token === 'impr_art'))!.id

test('the account-tier question owns exactly the six cross-domain sliders', () => {
  const sliderByToken = buildSafeguardSliderTokenMap(resolveNoteSafeguardOverridesTags(note).questions)
  const acctQuestion = seed.questions.find((q) => q.id === acctQ.id)!
  const owned = collectTierOwnedSliderQuestionIds([acctQuestion], sliderByToken)
  // Every one of the six tier sliders (by question id) must be owned.
  const sg = resolveNoteSafeguardOverridesTags(note)
  const idOf = (token: string) => sg.questions.find((q) => q.options.some((o) => o.token === token))!.id
  for (const token of ['min_spdbanner_pieces', 'min_spd_pieces', 'min_debuffer_pieces', 'min_dmgsurv_pieces', 'impr_art', 'impr_acc']) {
    assert.ok(owned.has(idOf(token)), `${token} is a tier-owned slider`)
  }
})

test('switching Endgame→Lategame clears the stuck Endgame slider values (fall back to Lategame default=)', () => {
  // Fresh Lategame load: no slider answers stored.
  let state = { recipeAnswers: {} as Record<string, string[]>, sgAnswers: {} as Record<string, string[]> }
  assert.equal(state.sgAnswers[spdQuestionId], undefined, 'fresh load has no speed-set slider answer')

  // Switch to Endgame — it forces every slider (min_spd_pieces=16, impr_art=50).
  state = simTierSwitch(state.recipeAnswers, state.sgAnswers, 'endgame')
  assert.equal(state.sgAnswers[spdQuestionId]?.[0], '16', 'Endgame writes the speed-set slider to 16')
  assert.equal(state.sgAnswers[imprArtQuestionId]?.[0], '50', 'Endgame writes the art improvement slider to 50')

  // Switch back to Lategame — it forces nothing, so the clear-forces logic must RELEASE those sliders.
  state = simTierSwitch(state.recipeAnswers, state.sgAnswers, 'lategame')
  assert.equal(state.sgAnswers[spdQuestionId], undefined, 'Lategame releases the stuck speed-set slider')
  assert.equal(state.sgAnswers[imprArtQuestionId], undefined, 'Lategame releases the stuck art-improvement slider')

  // The released sliders now resolve to their re-baselined Lategame default= (12 and 33).
  const sg = resolveNoteSafeguardOverridesTags(note, state.sgAnswers)
  const sliderDefault = (token: string) => sg.questions.flatMap((q) => q.options).find((o) => o.token === token)?.sliderDefault
  assert.equal(sliderDefault('min_spd_pieces'), 12, 'speed-set slider back to the Lategame default 12')
  assert.equal(sliderDefault('impr_art'), 33, 'art-improvement slider back to the Lategame default 33')
})
