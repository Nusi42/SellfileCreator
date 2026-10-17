/* eslint import/no-unused-modules: off */
// Lookup of the asset pack (scripts/vite/gameAssetsDir.ts): environment / .env.local
// first, then the user-level file that every clone shares.
import { strict as assert } from 'node:assert'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resolveGameAssetsDir } from '../../scripts/vite/gameAssetsDir.js'

// A throwaway config file with the given content.
const configWith = (content: string): string => {
  const file = join(mkdtempSync(join(tmpdir(), 'sfc-assets-')), 'game-assets-dir.txt')
  writeFileSync(file, content)
  return file
}

test('the environment wins over the shared file', () => {
  const file = configWith('C:/packs/shared\n')
  assert.equal(resolveGameAssetsDir({ SFC_GAME_ASSETS_DIR: 'C:/packs/own' }, file), 'C:/packs/own')
})

test('an explicitly empty setting forces a placeholder build', () => {
  const file = configWith('C:/packs/shared\n')
  assert.equal(resolveGameAssetsDir({ SFC_GAME_ASSETS_DIR: '' }, file), undefined)
})

test('without a setting every clone falls back to the shared file', () => {
  const file = configWith('# asset pack\n\n  "C:/packs/shared"  \r\n')
  assert.equal(resolveGameAssetsDir({}, file), 'C:/packs/shared')
})

test('no setting and no file means placeholders', () => {
  assert.equal(resolveGameAssetsDir({}, join(tmpdir(), 'does-not-exist', 'game-assets-dir.txt')), undefined)
})
