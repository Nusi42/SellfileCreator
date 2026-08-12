/**
 * presetFixtures.ts
 *
 * Shared loaders for the shipped preset files used as test fixtures.
 *
 * Six unit-test files were each repeating
 * `JSON.parse(readFileSync(resolve(process.cwd(), 'presets/lategame.sfc'), 'utf-8'))`
 * and most then repeated `(sfc.Note as string[]).join('\n')` on top. One definition means a
 * preset rename or a Note shape change lands in a single place.
 *
 * Not a `.test.ts` file on purpose — the runner only collects `*.test.ts`, so this is picked
 * up as a plain import rather than executed as a suite.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** The readable-SFC shape these fixtures are read for; other keys pass through untyped. */
type PresetSfcFile = Record<string, unknown> & { Note?: string[] | string }

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
