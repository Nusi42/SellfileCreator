/* eslint import/no-unused-modules: off */

/**
 * The push-dirty trigger tracks the PUSHED document, overrides included.
 *
 * Auto-push fires on the rising edge of `pushDirty`, which under SfcFileAsSellfile
 * compares `sfcPayloadFingerprint(buildPushedSfcPayload())` against the fingerprint
 * captured at the last push. Answering a dynamic-overrides question rewrites the
 * rules a push would send while leaving the RAW document byte-identical, so the
 * fingerprint has to be taken over the override-APPLIED slices — otherwise the edge
 * never fires and the receiver keeps judging gear against the previous answers.
 *
 * These tests pin that at the seam App.tsx uses, so a refactor that fingerprints the
 * raw document fails here instead of silently going quiet.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { loadLategameSfc } from '../setup/presetFixtures.js'
import { parseSfcObject, sfcPayloadFingerprint } from '../../src/lib/sfcIO.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import { findRecipeOptionByToken, resolveRecipeOverridesTags } from '../../src/lib/noteRecipeOverrides.js'
import {
  buildDocumentOverridesView,
  buildOverrideAppliedDocumentSlices,
  buildRawDocumentSlices,
} from '../../src/lib/documentOverrides.js'

// Parse the real shipped preset exactly as a load does, so the slices below are the
// live shapes the resolvers expect rather than the persisted spelling.
const parsed = parseSfcObject(loadLategameSfc(), {
  metasets: [],
  substatTargets: defaultSubstatTargets(),
})
const note = parsed.note ?? ''

// The account-tier question, addressed through an option token (ids are content hashes).
const acctQ = findRecipeOptionByToken(resolveRecipeOverridesTags(note).questions, 'endgame')!.question
const answersFor = (token: string): Record<string, string[]> => ({
  [acctQ.id]: [acctQ.options.find((o) => o.token === token)!.id],
})

/** One set of answers, resolved the way App.tsx resolves it. */
const viewFor = (answers: Record<string, string[]>) => buildDocumentOverridesView({
  note,
  noteOverridesDisabled: false,
  recipeOverridesAnswers: answers,
  safeguardOverridesAnswers: {},
  recipes: parsed.recipes,
  substatTargets: parsed.substatTargets,
  safeguardRules: parsed.safeguardRules ?? [],
  metasets: parsed.metasets,
  recipesEnabled: parsed.recipesEnabled ?? true,
})

// Two tiers that resolve to different rules (lategame-preset-overrides pins the
// behavioural difference; here they only need to differ at all).
const MIDGAME = answersFor('midgame')
const ENDGAME = answersFor('endgame')

test('a changed override answer moves the PUSHED fingerprint', () => {
  const pushed = (answers: Record<string, string[]>) =>
    sfcPayloadFingerprint(buildOverrideAppliedDocumentSlices(viewFor(answers)))

  assert.notEqual(
    pushed(MIDGAME),
    pushed(ENDGAME),
    'a changed override answer must move the pushed fingerprint, or auto-push never fires',
  )
})

test('the RAW slices are answer-independent — why the applied ones are fingerprinted', () => {
  const raw = (answers: Record<string, string[]>) =>
    sfcPayloadFingerprint(buildRawDocumentSlices(viewFor(answers)))

  // The trap this guards: fingerprinting the raw document calls every override change
  // clean, so the push edge never fires and the receiver keeps the stale rules.
  assert.equal(
    raw(MIDGAME),
    raw(ENDGAME),
    'the raw slices are the document as authored; answers must not rewrite them',
  )
})
