import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import enUS from '../../src/lib/i18n/catalogs/en-US'
import deDE from '../../src/lib/i18n/catalogs/de-DE'
import esES from '../../src/lib/i18n/catalogs/es-ES'
import frFR from '../../src/lib/i18n/catalogs/fr-FR'
import itIT from '../../src/lib/i18n/catalogs/it-IT'
import ptBR from '../../src/lib/i18n/catalogs/pt-BR'
import ptPT from '../../src/lib/i18n/catalogs/pt-PT'
import ruRU from '../../src/lib/i18n/catalogs/ru-RU'
import trTR from '../../src/lib/i18n/catalogs/tr-TR'
import ukUA from '../../src/lib/i18n/catalogs/uk-UA'
import { DEFAULT_LANGUAGE, PRODUCTION_LANGUAGES, type Catalog, type ProductionLanguage } from '../../src/lib/i18n/types'

// Describe a single comment line for later comparisons.
type CommentEntry = {
  line: number
  text: string
}

// Bundle file metadata with parsed comments for easier syncing.
type CommentAudit = {
  code: ProductionLanguage
  filePath: string
  comments: CommentEntry[]
}

// Track whether a locale required edits so the CLI output stays readable.
type CommentSyncResult = {
  code: ProductionLanguage
  filePath: string
  changed: boolean
  success: boolean
  details: string
}

// Capture key drift so we can point translators directly at gaps.
type CatalogAuditResult = {
  code: ProductionLanguage
  missingKeys: string[]
  extraKeys: string[]
  orderMismatches: Array<{ index: number; expected: string; actual: string }>
}

// Resolve the repo root from cwd so compiled scripts still hit source files.
const repoRoot = process.cwd()
const catalogRoot = join(repoRoot, 'src', 'lib', 'i18n', 'catalogs')

// Map production codes to their overrides so we can reason in one place.
const CATALOG_SOURCES: Record<ProductionLanguage, Catalog> = {
  'en-US': enUS,
  'de-DE': deDE,
  'fr-FR': frFR,
  'es-ES': esES,
  'it-IT': itIT,
  'pt-BR': ptBR,
  'pt-PT': ptPT,
  'ru-RU': ruRU,
  'uk-UA': ukUA,
  'tr-TR': trTR,
}

// Path to the master English file we mirror everywhere else.
const englishFilePath = join(catalogRoot, `${DEFAULT_LANGUAGE}.ts`)

// Stable heading keeps the CLI dump scannable when scripts rerun.
const ENGLISH_COMMENTS_HEADING = 'English catalog comment index:'

// Lightweight helper around fs.readFileSync to keep intent explicit.
const readCatalogFile = (filePath: string): string => readFileSync(filePath, 'utf8')

// Pull out every comment line so we know what should appear in other locales.
const extractComments = (content: string): CommentEntry[] => {
  const lines = content.split(/\r?\n/)
  const comments: CommentEntry[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? ''
    const trimmed = rawLine.trimStart()
    if (!trimmed.startsWith('//')) {
      continue
    }
    const text = trimmed.slice(2).trimStart()
    comments.push({ line: index + 1, text })
  }

  return comments
}

// Emit the English comment table so humans can confirm section headers quickly.
const logEnglishComments = (comments: CommentEntry[]): void => {
  console.log(ENGLISH_COMMENTS_HEADING)
  for (const entry of comments) {
    const line = entry.line.toString().padStart(4, ' ')
    console.log(`${line}: ${entry.text}`)
  }
  console.log('')
}

// Rewrite foreign catalog comments so they match English headings verbatim.
const syncLocaleComments = (audit: CommentAudit, englishComments: CommentEntry[]): CommentSyncResult => {
  const { code, filePath, comments } = audit
  const lines = readCatalogFile(filePath).split(/\r?\n/)

  if (comments.length !== englishComments.length) {
    return {
      code,
      filePath,
      changed: false,
      success: false,
      details: `Expected ${englishComments.length} comment blocks but found ${comments.length}.`,
    }
  }

  let changed = false
  let cursor = 0
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? ''
    const trimmed = rawLine.trimStart()
    if (!trimmed.startsWith('//')) {
      continue
    }

    const indent = rawLine.slice(0, rawLine.length - trimmed.length)
    const englishComment = englishComments[cursor]
    if (!englishComment) {
      return {
        code,
        filePath,
        changed,
        success: false,
        details: `Found more comment lines than English baseline.`,
      }
    }
    const nextLine = `${indent}// ${englishComment.text}`
    if (nextLine !== rawLine) {
      lines[index] = nextLine
      changed = true
    }
    cursor += 1
  }

  if (changed) {
    writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8')
  }

  return {
    code,
    filePath,
    changed,
    success: true,
    details: changed ? 'Synchronized comment text.' : 'Comments already match English text.',
  }
}

// Collect the raw comment metadata for a locale before comparing.
const auditLocaleComments = (code: ProductionLanguage): CommentAudit => {
  const filePath = join(catalogRoot, `${code}.ts`)
  const content = readCatalogFile(filePath)
  const comments = extractComments(content)
  return { code, filePath, comments }
}

// Compare a locale’s key list to English so order/coverage drift cannot slip in.
const auditCatalogKeys = (code: ProductionLanguage, englishKeys: string[]): CatalogAuditResult => {
  const catalog = CATALOG_SOURCES[code]
  const keys = Object.keys(catalog)
  const missingKeys = englishKeys.filter((key) => !(key in catalog))
  const extraKeys = keys.filter((key) => !(key in CATALOG_SOURCES[DEFAULT_LANGUAGE]))
  const orderMismatches: Array<{ index: number; expected: string; actual: string }> = []

  const limit = Math.min(keys.length, englishKeys.length)
  for (let index = 0; index < limit; index += 1) {
    const expected = englishKeys[index]
    const actual = keys[index]
    if (expected === undefined || actual === undefined) {
      continue
    }
    if (expected !== actual) {
      orderMismatches.push({ index, expected, actual })
    }
  }

  return { code, missingKeys, extraKeys, orderMismatches }
}

// Orchestrate the extraction, syncing, and audits as a single CLI.
const run = (): void => {
  const englishContent = readCatalogFile(englishFilePath)
  const englishComments = extractComments(englishContent)
  logEnglishComments(englishComments)

  const englishKeys = Object.keys(CATALOG_SOURCES[DEFAULT_LANGUAGE])
  let hasFailures = false

  for (const code of PRODUCTION_LANGUAGES) {
    if (code === DEFAULT_LANGUAGE) {
      continue
    }

    const commentAudit = auditLocaleComments(code)
    const syncResult = syncLocaleComments(commentAudit, englishComments)
    console.log(`[${code}] Comments: ${syncResult.details}`)
    if (!syncResult.success) {
      hasFailures = true
    }

    const keyAudit = auditCatalogKeys(code, englishKeys)
    if (keyAudit.missingKeys.length > 0) {
      hasFailures = true
      console.error(`[${code}] Missing keys: ${keyAudit.missingKeys.join(', ')}`)
    }
    if (keyAudit.extraKeys.length > 0) {
      hasFailures = true
      console.error(`[${code}] Extra keys: ${keyAudit.extraKeys.join(', ')}`)
    }
    if (keyAudit.orderMismatches.length > 0) {
      hasFailures = true
      const first = keyAudit.orderMismatches[0]
      if (first) {
        console.error(`[${code}] Key order diverges at index ${first.index}: expected ${first.expected} but found ${first.actual}.`)
      }
    }

    if (
      keyAudit.missingKeys.length === 0 &&
      keyAudit.extraKeys.length === 0 &&
      keyAudit.orderMismatches.length === 0
    ) {
      console.log(`[${code}] Keys: aligned with English catalog.`)
    }
  }

  if (hasFailures) {
    process.exitCode = 1
  }
}

run()
