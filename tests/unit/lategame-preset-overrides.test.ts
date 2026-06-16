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

test('each account mode forces the keep-piece + improvement-chance sliders', () => {
  // The mode radios live in the account-tier question (acctQ); read each option's setval.
  const setvalOf = (token: string): Record<string, number> => {
    const opt = acctQ.options.find((o) => o.token === token)!
    return Object.fromEntries(opt.setValueDirectives.map((d) => [d.token, d.value]))
  }
  // Per-mode authored forces — keep-piece thresholds plus improvement-chance percentages.
  assert.deepEqual(setvalOf('midgame'),
    { min_spd_pieces: 8, min_debuffer_pieces: 16, min_dmgsurv_pieces: 16, impr_art: 25, impr_acc: 25 })
  assert.deepEqual(setvalOf('lategame'),
    { min_spd_pieces: 12, min_debuffer_pieces: 24, min_dmgsurv_pieces: 24, impr_art: 33, impr_acc: 33 })
  assert.deepEqual(setvalOf('endgame'),
    { min_spd_pieces: 16, min_debuffer_pieces: 32, min_dmgsurv_pieces: 32, impr_art: 33, impr_acc: 50 })
  assert.deepEqual(setvalOf('endgameplus'),
    { min_spd_pieces: 16, min_debuffer_pieces: 32, min_dmgsurv_pieces: 32, impr_art: 60, impr_acc: 60 })
})

test('loading the preset seeds the keep-piece sliders from the default Lategame mode', () => {
  // Fresh load (empty answers) → the `*` default Lategame is selected; its setval forces must
  // seed the safeguard sliders, NOT leave them at each slider's own default (16/32/32/25/25).
  const seeded = seedSafeguardAnswersFromRecipeDefaults(note)
  const sg = resolveNoteSafeguardOverridesTags(note, seeded)
  const seededValue = (token: string): string | undefined => {
    const q = sg.questions.find((x) => x.options.some((o) => o.token === token))!
    return seeded[q.id]?.[0]
  }
  assert.equal(seededValue('min_spd_pieces'), '12', 'speed-set slider seeded to Lategame 12')
  assert.equal(seededValue('min_debuffer_pieces'), '24', 'debuffer slider seeded to Lategame 24')
  assert.equal(seededValue('min_dmgsurv_pieces'), '24', 'damage/surv slider seeded to Lategame 24')
  assert.equal(seededValue('impr_art'), '33', 'artifact improv-chance seeded to Lategame 33')
  assert.equal(seededValue('impr_acc'), '33', 'accessory improv-chance seeded to Lategame 33')
})
