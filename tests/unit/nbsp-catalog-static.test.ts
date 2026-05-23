/* eslint import/no-unused-modules: off */

// Static-file unit test guarding the NBSP (U+00A0) in the safeguard chip label.
// History: commit 73303b55 had to restore this NBSP after the ESLint v5 migration's
// `no-irregular-whitespace` global replace silently stripped it. This test prevents
// the same regression from re-occurring on the next lint sweep.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const APP_TSX_PATH = path.resolve(REPO_ROOT, 'src', 'App.tsx')

test('App.tsx safeguard chip label retains the \\u00a0 NBSP escape', () => {
  const source = fs.readFileSync(APP_TSX_PATH, 'utf-8')
  // The fix wrote the literal backslash-u escape (six chars: \, u, 0, 0, a, 0). Keep that exact spelling
  // — a future lint sweep could replace a literal U+00A0 byte with a regular space, but it cannot rewrite
  // the escape sequence without parsing the source. The escape is the durable contract.
  assert.ok(
    source.includes('${n}\\u00a0${word}'),
    'src/App.tsx must contain `${n}\\u00a0${word}` to keep the safeguard chip NBSP in place',
  )
})
