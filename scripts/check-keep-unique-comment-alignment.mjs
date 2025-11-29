#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..')
const basePath = join(repoRoot, 'src/lib/i18n/catalogs/en-US.ts')

const readLines = (path) => readFileSync(path, 'utf8').split(/\r?\n/)
const extractComments = (lines) => {
  const results = new Map()
  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') && trimmed.toLowerCase().includes('keepuniques')) {
      results.set(idx + 1, trimmed)
    }
  })
  return results
}

const baseLines = readLines(basePath)
const baseComments = extractComments(baseLines)

const catalogFiles = [
  'de-DE.ts',
  'es-ES.ts',
  'fr-FR.ts',
  'it-IT.ts',
  'pt-BR.ts',
  'pt-PT.ts',
  'ru-RU.ts',
  'tr-TR.ts',
  'uk-UA.ts',
]

let mismatches = 0
for (const file of catalogFiles) {
  const targetPath = join(repoRoot, 'src/lib/i18n/catalogs', file)
  const targetLines = readLines(targetPath)
  for (const [lineNo, comment] of baseComments) {
    const targetComment = targetLines[lineNo - 1]?.trim()
    if (targetComment !== comment) {
      mismatches += 1
      console.error(`[${file}] comment mismatch at line ${lineNo}`)
      console.error(`  expected: ${comment}`)
      console.error(`  actual:   ${targetComment ?? '<missing>'}`)
    }
  }
}

if (mismatches > 0) {
  console.error(`\nFound ${mismatches} mismatched comment(s).`)
  process.exit(1)
}
console.log('All catalog comment lines match en-US.')
