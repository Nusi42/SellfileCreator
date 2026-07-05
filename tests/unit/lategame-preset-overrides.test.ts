import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveRecipeOverridesTags, collectRecipeOverridesDiagnostics, seedSafeguardAnswersFromRecipeDefaults } from '../../src/lib/noteRecipeOverrides.js'
import { resolveNoteSafeguardOverridesTags } from '../../src/lib/noteSafeguardOverrides.js'

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

test('each account mode forces the same set of keep-piece + improvement-chance sliders', () => {
  // The mode radios live in the account-tier question (acctQ); read each option's setval.
  const setvalTokens = (token: string): string[] => {
    const opt = acctQ.options.find((o) => o.token === token)!
    return opt.setValueDirectives.map((d) => d.token).sort()
  }
  // Structural contract (not the exact authored numbers, which are content): every tier forces
  // the full slider set so switching modes / loading a preset always seeds all of them.
  const expectedTokens = ['impr_acc', 'impr_art', 'min_debuffer_pieces', 'min_dmgsurv_pieces', 'min_spd_pieces', 'min_spdbanner_pieces'].sort()
  for (const tier of ['midgame', 'lategame', 'endgame', 'endgameplus']) {
    assert.deepEqual(setvalTokens(tier), expectedTokens, `${tier} forces every keep-piece/improv slider`)
  }
  // Spot-check the default Lategame values (the seeding-relevant mode) are concrete + finite.
  const lategame = Object.fromEntries(
    acctQ.options.find((o) => o.token === 'lategame')!.setValueDirectives.map((d) => [d.token, d.value]),
  )
  for (const [token, value] of Object.entries(lategame)) {
    assert.ok(Number.isFinite(value) && value > 0, `lategame ${token} is a positive number (${value})`)
  }
})

test('loading the preset seeds every slider from the default Lategame mode (not slider defaults)', () => {
  // Fresh load (empty answers) → the `*` default Lategame is selected; its setval forces must seed
  // the safeguard sliders to the FORCED values, NOT leave them at each slider's own `default=`.
  // Expected values are read from the resolved Lategame option so the test tracks the authored
  // preset rather than hardcoding numbers the author keeps tuning.
  const lategameForces = new Map(
    acctQ.options.find((o) => o.token === 'lategame')!.setValueDirectives.map((d) => [d.token, d.value]),
  )
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  const sg = resolveNoteSafeguardOverridesTags(note, seeded)
  const seededValue = (token: string): string | undefined => {
    const q = sg.questions.find((x) => x.options.some((o) => o.token === token))!
    return seeded[q.id]?.[0]
  }
  // Every forced token must be seeded to exactly its forced value, and must DIFFER from the
  // slider's own default for at least one token (else the test couldn't catch the original bug).
  let differsFromDefault = false
  for (const [token, value] of lategameForces) {
    assert.equal(seededValue(token), String(value), `${token} seeded to Lategame force ${value}`)
    const slider = sg.questions.flatMap((q) => q.options).find((o) => o.token === token)!
    if (value !== (slider.sliderDefault ?? slider.sliderMin)) differsFromDefault = true
  }
  assert.ok(differsFromDefault, 'at least one forced value differs from the slider default (guards the original bug)')
})

test('"Reset Options to Defaults" re-applies the default-mode forces over a dirtied state', () => {
  // Reproduce the reset handler: it clears recipe answers and computes safeguard answers via
  // seedSafeguardAnswersFromRecipeDefaults(note) with NO `existing` map — so prior user edits
  // (e.g. a dragged-away slider) are discarded and every default-mode force is re-applied.
  const spdQ = resolveNoteSafeguardOverridesTags(note).questions
    .find((x) => x.options.some((o) => o.token === 'min_spd_pieces'))!
  // Simulate a user who dragged the speed-set slider to a non-default, non-forced value.
  const dirtied = { [spdQ.id]: ['64'] }
  // The reset call (matches NoteDialog.handleResetRecipeOverridesAnswers) ignores `dirtied`.
  const afterReset = seedSafeguardAnswersFromRecipeDefaults(note)
  assert.notEqual(afterReset[spdQ.id]?.[0], dirtied[spdQ.id]?.[0], 'reset discards the dragged value')
  // It lands on the authored Lategame force, not the slider default.
  const lategameForce = acctQ.options.find((o) => o.token === 'lategame')!
    .setValueDirectives.find((d) => d.token === 'min_spd_pieces')!.value
  assert.equal(afterReset[spdQ.id]?.[0], String(lategameForce), 'reset applies the Lategame speed-set force')
})

test('the 5 safeguard count cards keep their v1.0.34-compatible pinned ids (regression: saved-set rescue)', () => {
  // The safeguard count cards gained an activation-mode radio group after v1.0.34, which
  // re-hashed their derived ids and orphaned sets saved with the older (slider-only) ids.
  // Pinning each question's `id=` back to the v1.0.34 hash keeps those saved answers valid.
  // These literals ARE the ids v1.0.34 produced — do not "fix" them to the new hashes, or
  // every set saved before the radios were added stops loading.
  const expected: Record<string, string> = {
    min_spdbanner_pieces: 'q_ta25kl',
    min_spd_pieces: 'q_bk3r8j',
    min_debuffer_pieces: 'q_416mju',
    min_dmgsurv_pieces: 'q_tk0vqr',
  }
  const { questions } = resolveNoteSafeguardOverridesTags(note)
  for (const [sliderToken, wantId] of Object.entries(expected)) {
    const q = questions.find((x) => x.options.some((o) => o.token === sliderToken))
    assert.ok(q, `safeguard card with slider ${sliderToken} should exist`)
    assert.equal(q!.id, wantId, `${sliderToken}'s card must keep pinned id ${wantId}`)
  }
  // The Mercurial card's slider has no id= token, so match it by prompt instead.
  const mercurial = questions.find((x) => x.prompt.includes('Mercurial'))
  assert.ok(mercurial, 'the Mercurial safeguard card should exist')
  assert.equal(mercurial!.id, 'q_muougk', 'the Mercurial card must keep pinned id q_muougk')
})
