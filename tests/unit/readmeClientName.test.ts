/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { adaptReadmeClientReferences } from '../../src/lib/readmeClientName.js'
import { DEFAULT_CLIENT_NAME } from '../../src/lib/runtimeConfig.js'

// User-facing docs (the shipped READMEs among them) live in this folder under the repo root.
const USER_DOCS_DIR = 'userDocs'

// The runner compiles specs into tmp/tsc/… before executing them, so the repo root is NOT a
// fixed number of levels above this file. Walk up until package.json is found instead — a
// hardcoded '../..' silently resolves into the temp tree and makes every check below pass
// vacuously (which is what the "README files exist" guard catches).
const findRepoRoot = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, USER_DOCS_DIR, 'README.md'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('repo root not found from ' + fileURLToPath(import.meta.url))
}

const REPO_ROOT = findRepoRoot()
// Absolute path of the user-docs folder — every README read below resolves against it.
const USER_DOCS_ROOT = join(REPO_ROOT, USER_DOCS_DIR)
const README_FILES = readdirSync(USER_DOCS_ROOT).filter((f) => /^README(\..+)?\.md$/.test(f)).sort()
// A name that appears nowhere in the READMEs, so a match can only come from substitution
// (the author's name would collide with the credits lines).
const CLIENT = 'ZzClientZz'

const readReadme = (file: string): string => readFileSync(join(USER_DOCS_ROOT, file), 'utf8')

test('README files exist and mention the default client', () => {
  // Guards the guard: if the glob stops matching, every check below would vacuously pass.
  assert.ok(README_FILES.length >= 10, `expected the shipped READMEs, found ${README_FILES.length}`)
  for (const file of README_FILES) {
    assert.ok(readReadme(file).includes(DEFAULT_CLIENT_NAME), `${file} names no client`)
  }
})

test('the shipped README files are never modified — substitution is render-only', () => {
  // The READMEs are distributed as-is (as text files in the release zip), so they must keep
  // saying "RSL Helper" on disk. This asserts the source text itself still does.
  for (const file of README_FILES) {
    assert.ok(
      readReadme(file).includes(DEFAULT_CLIENT_NAME),
      `${file} must keep the literal client name on disk (the swap happens at render)`,
    )
  }
})

test('the default client renders the README byte-for-byte unchanged', () => {
  // The overwhelmingly common launch: no client named anything, so nothing may shift.
  for (const file of README_FILES) {
    const raw = readReadme(file)
    assert.equal(adaptReadmeClientReferences(raw, DEFAULT_CLIENT_NAME), raw, `${file} changed`)
  }
})

test('client references are rewritten while the format name is preserved', () => {
  const input = [
    '- Connect to RSL Helper for live sync.',
    '- Export it as an RSL Helper Sellfile (`.hsf`).',
    '- HSF (`.hsf`): the RSL Helper Sellfile. Export from this app, then load it in RSL Helper.',
  ].join('\n')
  const out = adaptReadmeClientReferences(input, CLIENT)
  // Bare references become the connected client...
  assert.ok(out.includes(`Connect to ${CLIENT} for live sync`), out)
  assert.ok(out.includes(`then load it in ${CLIENT}`), out)
  // ...but the .hsf FORMAT keeps its name: the format is RSL Helper's whoever pushes it.
  assert.ok(out.includes('an RSL Helper Sellfile'), out)
  assert.ok(out.includes('the RSL Helper Sellfile'), out)
})

test('attribution, legal text, and literal identifiers are never rewritten', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    // Trademark disclaimer — names real entities.
    ['> Not affiliated with Plarium, Raid: Shadow Legends, or RSL Helper.', 'RSL Helper'],
    ['> Es besteht keine Verbindung zu Plarium, Raid: Shadow Legends oder RSL Helper.', 'RSL Helper'],
    // Author credit — rewriting it would misattribute authorship.
    ['and of course thanks to **Farbstoff** for RSL Helper!', 'RSL Helper'],
    // Literal identifiers: filenames and paths must survive verbatim.
    ['- `Stream-Helper-DB-to-Creator.bat` streams the RSL Helper database.', 'Stream-Helper-DB-to-Creator.bat'],
    ['See [the RSL Helper docs](https://example.com/RSL%20Helper).', 'https://example.com/RSL%20Helper'],
  ]
  for (const [input, mustSurvive] of cases) {
    const out = adaptReadmeClientReferences(input, CLIENT)
    assert.ok(out.includes(mustSurvive), `"${mustSurvive}" was rewritten in: ${out}`)
  }
})

test('the H1 title is left intact for the Help dialog to strip', () => {
  // HelpDialog matches this heading by exact text to drop it; rewriting it would leave a
  // duplicate title rendered above the markdown.
  const input = '﻿# Sellfile Creator for RSL Helper\n\nBody text.'
  assert.ok(adaptReadmeClientReferences(input, CLIENT).includes('# Sellfile Creator for RSL Helper'))
})

test('a client name containing $ is inserted literally', () => {
  // A string replacement would read '$&' as "the whole match" and re-insert "RSL Helper".
  const name = 'A$' + '&B'
  assert.equal(adaptReadmeClientReferences('Connect to RSL Helper.', name), `Connect to ${name}.`)
})

test('language-specific word orders and suffixes are handled', () => {
  // Russian inverts the format name; Turkish glues case suffixes onto the product name.
  const ru = adaptReadmeClientReferences('экспортируйте её как Sellfile RSL Helper (`.hsf`)', CLIENT)
  assert.ok(ru.includes('Sellfile RSL Helper'), ru)
  const trFormat = adaptReadmeClientReferences("RSL Helper Sellfile'ı olarak dışa aktarın.", CLIENT)
  assert.ok(trFormat.includes("RSL Helper Sellfile'ı"), trFormat)
  // A bare suffixed reference IS the client, so it adapts (the suffix goes with the name —
  // we cannot inflect an arbitrary client name for Turkish).
  const trClient = adaptReadmeClientReferences("gerçek zamanlı senkronizasyon için RSL Helper'a bağlanın", CLIENT)
  assert.ok(trClient.includes(CLIENT), trClient)
  assert.ok(!trClient.includes('RSL Helper'), trClient)
})

/**
 * Change detector for the shipped READMEs.
 *
 * Every "RSL Helper" mention across all READMEs is classified as either ADAPTED (a reference
 * to the connected client) or PRESERVED (format name, attribution, legal text, identifier).
 * The counts below are the accepted state. Editing a README so a mention is added, removed,
 * or reclassified fails this test ON PURPOSE — that is the prompt to decide which category
 * the new sentence belongs to and update the expectation deliberately, rather than letting
 * the regexes silently pick for you.
 *
 * To update: run the suite, read the reported actual counts, confirm each changed file's new
 * mentions are classified the way you intend, then edit the table.
 */
const EXPECTED_CLASSIFICATION: Readonly<Record<string, { adapted: number; preserved: number }>> = {
  'README.md': { adapted: 13, preserved: 11 },
  'README.de.md': { adapted: 12, preserved: 9 },
  'README.es.md': { adapted: 14, preserved: 10 },
  'README.fr.md': { adapted: 14, preserved: 10 },
  'README.it.md': { adapted: 14, preserved: 10 },
  'README.pt-BR.md': { adapted: 14, preserved: 10 },
  'README.pt.md': { adapted: 14, preserved: 10 },
  'README.ru.md': { adapted: 14, preserved: 10 },
  'README.tr.md': { adapted: 14, preserved: 9 },
  'README.uk.md': { adapted: 14, preserved: 10 },
}

// Count mentions before and after substitution: what disappears was ADAPTED, what remains
// was PRESERVED. Counting the rendered output means the classification is measured through
// the real transform rather than by re-implementing its rules here.
const classify = (raw: string): { adapted: number; preserved: number } => {
  const pattern = /RSL\s+Helper/gi
  const total = (raw.match(pattern) ?? []).length
  const preserved = (adaptReadmeClientReferences(raw, CLIENT).match(pattern) ?? []).length
  return { adapted: total - preserved, preserved }
}

test('every README mention of the client is classified deliberately', () => {
  const actual: Record<string, { adapted: number; preserved: number }> = {}
  for (const file of README_FILES) actual[file] = classify(readReadme(file))

  // Report the whole table on failure: a diff of one number is far easier to act on than a
  // per-file assertion that stops at the first mismatch.
  assert.deepEqual(
    actual,
    EXPECTED_CLASSIFICATION,
    'A README\'s "RSL Helper" mentions changed. Decide for each new/changed mention whether it '
      + 'names the CONNECTED CLIENT (should adapt) or is a format name / attribution / legal '
      + 'text / identifier (must stay literal — add a rule to PROTECTED_PATTERNS in '
      + 'src/lib/readmeClientName.ts), then update EXPECTED_CLASSIFICATION here.',
  )
})
