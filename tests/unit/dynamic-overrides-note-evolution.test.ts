import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveRecipeOverridesTags,
  applyRecipeOverridesAnswerChange,
} from '../../src/lib/noteRecipeOverrides.js'
import { resolveDynamicOverridesPresetApply } from '../../src/lib/dynamicOverridesPresetSummary.js'

/**
 * These guard the "restore saved answers against an UPDATED note" path. Whether the
 * answers come from autosave or an explicit preset, resolving them against a note that
 * added questions / constraints / exclusions must: never loop or overflow; leave new
 * questions at their default; drop stale option ids; and let new constraints override
 * stored answers rather than producing an invalid combination.
 *
 * Since the change to FULL storage, saved maps carry explicit answers for every question
 * (defaults included), which maximizes the number of stored answers the resolver must
 * reconcile — exactly the case most likely to expose a bad interaction.
 */

// Helper: find an option id by its DSL token within a resolved note.
const optId = (note: string, token: string): string => {
  const r = resolveRecipeOverridesTags(note)
  for (const q of r.questions) {
    const o = q.options.find((opt) => opt.token === token)
    if (o) return o.id
  }
  throw new Error(`token ${token} not found`)
}
const qId = (note: string, token: string): string => {
  const r = resolveRecipeOverridesTags(note)
  const q = r.questions.find((x) => x.options.some((o) => o.token === token))
  if (!q) throw new Error(`question for ${token} not found`)
  return q.id
}

test('a question added in the updated note resolves to its default', () => {
  // v1 had only the tier question; the user saved a full map for it.
  const v1 = ['<!-- recipe-overrides', 'q "Tier"', 'cb "A" * id=a {}', 'cb "B" id=b {}', '-->'].join('\n')
  const saved = applyRecipeOverridesAnswerChange(v1, {}, resolveRecipeOverridesTags(v1).questions[0]!, [optId(v1, 'b')], 'sentinel')
  // v2 adds a brand-new question with its own default-marked option.
  const v2 = [
    '<!-- recipe-overrides', 'q "Tier"', 'cb "A" * id=a {}', 'cb "B" id=b {}', '-->',
    '<!-- recipe-overrides', 'q "New"', 'rb "N1" * id=n1 {}', 'rb "N2" id=n2 {}', '-->',
  ].join('\n')
  const resolved = resolveRecipeOverridesTags(v2, saved)
  const newQ = resolved.questions.find((q) => q.options.some((o) => o.token === 'n1'))!
  // The new question was never answered → it sits at its default (n1, the *-marked option).
  assert.deepEqual(newQ.answer, [optId(v2, 'n1')], 'unanswered new question falls back to its default')
})

test('a new exclusion in the updated note overrides a stored conflicting answer (valid combo)', () => {
  // v1: two independent checkboxes the user turned both on.
  const v1 = [
    '<!-- recipe-overrides', 'q "Q"', 'cb "X" id=x {}', 'cb "Y" id=y {}', '-->',
  ].join('\n')
  const r1 = resolveRecipeOverridesTags(v1)
  let saved = applyRecipeOverridesAnswerChange(v1, {}, r1.questions[0]!, [optId(v1, 'x')], 'x')
  saved = applyRecipeOverridesAnswerChange(v1, saved, resolveRecipeOverridesTags(v1, saved).questions[0]!, [optId(v1, 'x'), optId(v1, 'y')], 'y')
  // v2: X now excludes Y (DSL keyword `excl`). The stored "both on" must NOT survive.
  const v2 = [
    '<!-- recipe-overrides', 'q "Q"', 'cb "X" id=x excl y {}', 'cb "Y" id=y {}', '-->',
  ].join('\n')
  const resolved = resolveRecipeOverridesTags(v2, saved)
  const q = resolved.questions[0]!
  const both = q.answer.includes(optId(v2, 'x')) && q.answer.includes(optId(v2, 'y'))
  assert.equal(both, false, 'mutually-excluding options cannot both remain selected after restore')
})

test('stored option ids that no longer exist are dropped', () => {
  const v1 = ['<!-- recipe-overrides', 'q "Q"', 'cb "X" id=x {}', 'cb "Y" id=y {}', '-->'].join('\n')
  const saved = applyRecipeOverridesAnswerChange(v1, {}, resolveRecipeOverridesTags(v1).questions[0]!, [optId(v1, 'x'), optId(v1, 'y')], 'y')
  // v2 removed option Y entirely.
  const v2 = ['<!-- recipe-overrides', 'q "Q"', 'cb "X" id=x {}', '-->'].join('\n')
  const resolved = resolveRecipeOverridesTags(v2, saved)
  const ids = new Set(resolved.questions[0]!.options.map((o) => o.id))
  for (const ans of resolved.questions[0]!.answer) {
    assert.ok(ids.has(ans), 'every resolved answer must reference an option that still exists')
  }
})

test('chained set/unset directives across questions terminate (no overflow) and resolve', () => {
  // A pathological note where options force each other across questions; the bounded
  // cascade must terminate and yield a stable, valid selection rather than loop.
  const v2 = [
    '<!-- recipe-overrides', 'q "Q1"', 'cb "A" * id=a set b {}', 'cb "C" id=c {}', '-->',
    '<!-- recipe-overrides', 'q "Q2"', 'cb "B" id=b set d {}', '-->',
    '<!-- recipe-overrides', 'q "Q3"', 'cb "D" id=d unset b {}', '-->',
  ].join('\n')
  // Feed a full saved map that selects everything — maximal conflict for the cascade.
  const saved = {
    [qId(v2, 'a')]: [optId(v2, 'a'), optId(v2, 'c')],
    [qId(v2, 'b')]: [optId(v2, 'b')],
    [qId(v2, 'd')]: [optId(v2, 'd')],
  }
  // Must not throw / hang; resolves within the bounded pass count.
  const resolved = resolveRecipeOverridesTags(v2, saved)
  assert.equal(resolved.questions.length, 3, 'all questions resolve')
  // Every answer references a real option (no garbage / invalid ids).
  for (const q of resolved.questions) {
    const ids = new Set(q.options.map((o) => o.id))
    for (const ans of q.answer) assert.ok(ids.has(ans), 'answers stay valid after cascade')
  }
})

test('a mutual set/unset cycle resolves to a bounded, valid result (no hang/overflow)', () => {
  // A↔B force each other in opposite directions (A sets B, B unsets A): a cycle the
  // bounded cascade must break deterministically rather than spin forever.
  const v2 = [
    '<!-- recipe-overrides', 'q "Q1"', 'cb "A" * id=a set b {}', '-->',
    '<!-- recipe-overrides', 'q "Q2"', 'cb "B" id=b unset a {}', '-->',
  ].join('\n')
  const saved = { [qId(v2, 'a')]: [optId(v2, 'a')], [qId(v2, 'b')]: [optId(v2, 'b')] }
  // The assertion is simply that this returns (the bounded pass loop guarantees it).
  const resolved = resolveRecipeOverridesTags(v2, saved)
  assert.equal(resolved.questions.length, 2)
  for (const q of resolved.questions) {
    const ids = new Set(q.options.map((o) => o.id))
    for (const ans of q.answer) assert.ok(ids.has(ans), 'cycle resolution yields only valid ids')
  }
})

test('an explicit question id= pins the identity so prompt/option edits do NOT orphan saved answers', () => {
  // v1: a plain single-choice question with a pinned id. The user saves an answer.
  const v1 = ['<!-- recipe-overrides', 'q "Old prompt" id=pinned_q', 'rb "A" * id=a {}', 'rb "B" id=b {}', '-->'].join('\n')
  const r1 = resolveRecipeOverridesTags(v1)
  assert.equal(r1.questions[0]!.id, 'pinned_q', 'explicit id= is used verbatim as the question id')
  const saved = applyRecipeOverridesAnswerChange(v1, {}, r1.questions[0]!, [optId(v1, 'b')], 'sentinel')
  // v2: the prompt is reworded AND a new option is added — a content change that WOULD
  // re-hash a derived id, but the pinned id keeps the question stable.
  const v2 = [
    '<!-- recipe-overrides', 'q "Reworded prompt with more words" id=pinned_q',
    'rb "A" * id=a {}', 'rb "B" id=b {}', 'rb "C (new)" id=c {}', '-->',
  ].join('\n')
  const r2 = resolveRecipeOverridesTags(v2, saved)
  assert.equal(r2.questions[0]!.id, 'pinned_q', 'the id survives a prompt + option-set change')
  // The saved "B" selection still applies rather than falling back to the "A" default.
  assert.deepEqual(r2.questions[0]!.answer, [optId(v2, 'b')], 'the pinned id lets the saved answer survive the edit')
})

test('preset apply against an updated note keeps only still-valid selections', () => {
  const v1 = ['<!-- recipe-overrides', 'q "Q"', 'cb "X" id=x {}', 'cb "Y" id=y {}', '-->'].join('\n')
  const savedFull = applyRecipeOverridesAnswerChange(v1, {}, resolveRecipeOverridesTags(v1).questions[0]!, [optId(v1, 'x'), optId(v1, 'y')], 'y')
  // v2 dropped Y; applying the old preset must not carry a dead id forward.
  const v2 = ['<!-- recipe-overrides', 'q "Q"', 'cb "X" id=x {}', '-->'].join('\n')
  const applied = resolveDynamicOverridesPresetApply(v2, savedFull, {})
  const ids = new Set(resolveRecipeOverridesTags(v2).questions[0]!.options.map((o) => o.id))
  for (const ans of applied.recipeAnswers[qId(v2, 'x')] ?? []) {
    assert.ok(ids.has(ans), 'apply drops option ids absent from the updated note')
  }
})
