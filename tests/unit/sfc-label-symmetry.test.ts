/* eslint-disable import/no-unused-modules */
/* Symmetric label-parser tests — consumed by both this Jest/node:test suite and the
 * Rust `label_tests` module in rule_engine_core/src/sfc_reader.rs.
 *
 * Vectors live in shared/sfc-label-test-vectors.json so both sides stay in sync.
 * Any change to a label mapping must update the JSON, which will make one or both
 * sides fail until both are fixed — that is by design.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { variantFromLabel } from '../../src/lib/types.js'
import { normalizeRecipe } from '../../src/lib/sfcIO.js'

// ─── load test vectors ────────────────────────────────────────────────────────

const vectorsPath = resolve(process.cwd(), 'shared/sfc-label-test-vectors.json')
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf-8')) as {
  statVariantFromLabel: Array<{ input: string; expected: number }>
  rankCodeFromLabel:    Array<{ input: string; expected: number }>
  rarityCodeFromLabel:  Array<{ input: string; expected: number; isAuto: boolean }>
  factionCodeFromLabel: Array<{ input: string; expected: number }>
}

// ─── statVariantFromLabel ─────────────────────────────────────────────────────

test('sfc-label-symmetry: statVariantFromLabel matches shared vectors', () => {
  for (const { input, expected } of vectors.statVariantFromLabel) {
    const got = variantFromLabel(input)
    assert.strictEqual(
      got,
      expected,
      `variantFromLabel(${JSON.stringify(input)}) → ${got} (expected ${expected})`,
    )
  }
})

// ─── rankCodeFromLabel ────────────────────────────────────────────────────────

test('sfc-label-symmetry: rankCodeFromLabel matches shared vectors', () => {
  for (const { input, expected } of vectors.rankCodeFromLabel) {
    // normalizeRecipe parses the human-readable "Rank" field and assigns rankCode.
    const recipe = normalizeRecipe({ Rank: input })
    assert.strictEqual(
      recipe.rankCode,
      expected,
      `rankCode for Rank=${JSON.stringify(input)} → ${recipe.rankCode} (expected ${expected})`,
    )
  }
})

// ─── rarityCodeFromLabel ──────────────────────────────────────────────────────

test('sfc-label-symmetry: rarityCodeFromLabel matches shared vectors', () => {
  for (const { input, expected, isAuto } of vectors.rarityCodeFromLabel) {
    const recipe = normalizeRecipe({ Rarity: input })
    if (isAuto) {
      // Auto mode: rarityCode is irrelevant; only rarityMode matters.
      assert.strictEqual(
        recipe.rarityMode,
        'auto',
        `rarityMode for Rarity=${JSON.stringify(input)} → ${recipe.rarityMode} (expected 'auto')`,
      )
    } else {
      assert.strictEqual(
        recipe.rarityCode,
        expected,
        `rarityCode for Rarity=${JSON.stringify(input)} → ${recipe.rarityCode} (expected ${expected})`,
      )
    }
  }
})

// ─── factionCodeFromLabel ─────────────────────────────────────────────────────

test('sfc-label-symmetry: factionCodeFromLabel matches shared vectors', () => {
  for (const { input, expected } of vectors.factionCodeFromLabel) {
    const recipe = normalizeRecipe({ Faction: input })
    assert.strictEqual(
      recipe.factionCode,
      expected,
      `factionCode for Faction=${JSON.stringify(input)} → ${recipe.factionCode} (expected ${expected})`,
    )
  }
})
