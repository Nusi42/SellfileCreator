/**
 * presetFixtures.ts
 *
 * Shared loaders for the shipped preset files used as test fixtures.
 *
 * Unit-test files were each repeating
 * `JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))`
 * and most then repeated `(sfc.Note as string[]).join('\n')` on top. One definition means a
 * preset rename or a Note shape change lands in a single place.
 *
 * Not a `.test.ts` file on purpose — the runner only collects `*.test.ts`, so this is picked
 * up as a plain import rather than executed as a suite.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type SafeguardRule } from '../../src/lib/safeguards.js'
import { normalizeSafeguardGroups } from '../../src/lib/safeguardGroups.js'
import { parseReadableSafeguardEntries } from '../../src/lib/sfcIO.js'

/** The readable-SFC shape these fixtures are read for; other keys pass through untyped. */
type PresetSfcFile = Record<string, unknown> & { Note?: string[] | string; Safeguards?: unknown[] }

/** Parse a preset from the repo root. Path is resolved off cwd, which the runner sets there. */
export const loadPresetSfc = (fileName: string): PresetSfcFile =>
  JSON.parse(readFileSync(resolve(process.cwd(), 'presets', fileName), 'utf-8')) as PresetSfcFile

/** The shipped lategame preset — the fixture behind the override/DSL suites. */
export const loadLategameSfc = (): PresetSfcFile => loadPresetSfc('lategame.sfc')

/**
 * The lategame preset's Note as one string.
 *
 * Tolerates both persisted shapes: the current array-of-lines (diff-friendly) and the legacy
 * plain string, matching what parseSfcObject accepts — so a fixture written either way works.
 */
export const loadLategameNote = (): string => {
  const note = loadLategameSfc().Note
  return Array.isArray(note) ? note.join('\n') : note ?? ''
}

/** The persisted recipe fields the override suites read; the rest passes through untyped. */
export type PresetRecipeEntry = {
  Tags?: string[]
  appearance?: { name?: string }
  minLevel?: number
  maxLevel?: number
  artifactSetNames?: Array<{ name?: string } | string>
  artifactMetaSetNames?: string[]
}

/** The lategame preset's recipes in their persisted shape (tags + set/metaset filters). */
export const loadLategameRecipes = (): PresetRecipeEntry[] => {
  const recipes = (loadLategameSfc() as { Recipes?: unknown }).Recipes
  assert.ok(Array.isArray(recipes), 'presets/lategame.sfc must carry a Recipes array')
  return recipes as PresetRecipeEntry[]
}

/** The lategame preset's metasets in their persisted shape (display name + member set names). */
export const loadLategameMetasets = (): Array<{ name: string; setNames: string[]; show?: boolean }> => {
  const metasets = (loadLategameSfc() as { Metasets?: unknown }).Metasets
  assert.ok(Array.isArray(metasets), 'presets/lategame.sfc must carry a Metasets array')
  return metasets as Array<{ name: string; setNames: string[]; show?: boolean }>
}

/**
 * The lategame preset's safeguard entries, normalized exactly as a load does: the shared reader
 * `parseReadableSafeguardEntries` (which unnests group entries and drops anything unreadable),
 * then the group pass — the same two steps `parseSfcObject` runs. Going through the reader rather
 * than mapping `normalizeSafeguardRule` per entry is what keeps this in step: a nested group entry
 * carries no `tuple`, so the per-entry form would silently drop every member of a grouped preset.
 * Every suite that asserts something about the shipped rules starts from this list.
 */
export const loadLategameSafeguardRules = (): SafeguardRule[] => {
  const entries = loadLategameSfc().Safeguards
  assert.ok(Array.isArray(entries), 'presets/lategame.sfc must carry a Safeguards array')
  return normalizeSafeguardGroups(parseReadableSafeguardEntries(entries))
}
