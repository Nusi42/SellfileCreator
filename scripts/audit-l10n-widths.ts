import type { Catalog, Language } from '../src/lib/i18n/types'
import en from '../src/lib/i18n/catalogs/en-US'
import de from '../src/lib/i18n/catalogs/de-DE'
import es from '../src/lib/i18n/catalogs/es-ES'
import fr from '../src/lib/i18n/catalogs/fr-FR'
import pt from '../src/lib/i18n/catalogs/pt-PT'
import ru from '../src/lib/i18n/catalogs/ru-RU'
import tr from '../src/lib/i18n/catalogs/tr-TR'
import uk from '../src/lib/i18n/catalogs/uk-UA'

const DEFAULT_THRESHOLD = 1.35
const DEFAULT_LIMIT = 10

// Characters that should not contribute to width measurements.
const zeroWidthCodepoints = new Set<number>([
  0x200b, // zero width space
  0x200c, // zero width non-joiner
  0x200d, // zero width joiner
  0x2060, // word joiner
  0xfe0e, // variation selector-15
  0xfe0f, // variation selector-16
])

// Minimal East Asian width ranges to approximate double-width glyphs.
const wideRanges: Array<[number, number]> = [
  [0x1100, 0x115f],
  [0x2329, 0x232a],
  [0x2e80, 0x303e],
  [0x3040, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
]

const isWideCodepoint = (code: number): boolean => {
  for (const [start, end] of wideRanges) {
    if (code >= start && code <= end) {
      return true
    }
  }
  return false
}

// Roughly estimate how many `ch` units the string would need in a single line.
const approximateWidth = (value: string): number => {
  let width = 0
  for (const char of value) {
    if (char === '\n' || char === '\r') {
      continue
    }
    const code = char.codePointAt(0)
    if (code === undefined) {
      continue
    }
    if (zeroWidthCodepoints.has(code)) {
      continue
    }
    width += isWideCodepoint(code) ? 2 : 1
  }
  return width
}

// Keep line count to highlight locales that wrap while English stays single-line.
const countLines = (value: string): number => {
  if (value.length === 0) {
    return 1
  }
  return value.split(/\r?\n/).length
}

type LocaleSource = {
  code: Language
  catalog: Catalog
  overrides: Catalog
}

type CliOptions = {
  threshold: number
  limit: number
}

const parseOptions = (): CliOptions => {
  let threshold = DEFAULT_THRESHOLD
  let limit = DEFAULT_LIMIT

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--threshold=')) {
      const value = Number.parseFloat(arg.slice('--threshold='.length))
      if (Number.isFinite(value) && value > 0) {
        threshold = value
      }
      continue
    }
    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length), 10)
      if (Number.isInteger(value) && value > 0) {
        limit = value
      }
    }
  }

  return { threshold, limit }
}

const buildLocales = (): LocaleSource[] => [
  { code: 'en-US', catalog: en, overrides: en },
  { code: 'de-DE', catalog: { ...en, ...de }, overrides: de },
  { code: 'fr-FR', catalog: { ...en, ...fr }, overrides: fr },
  { code: 'es-ES', catalog: { ...en, ...es }, overrides: es },
  { code: 'pt-PT', catalog: { ...en, ...pt }, overrides: pt },
  { code: 'ru-RU', catalog: { ...en, ...ru }, overrides: ru },
  { code: 'uk-UA', catalog: { ...en, ...uk }, overrides: uk },
  { code: 'tr-TR', catalog: { ...en, ...tr }, overrides: tr },
]

type LocaleFinding = {
  key: string
  ratio: number
  baseWidth: number
  localizedWidth: number
  baseLines: number
  localizedLines: number
  text: string
  baseText: string
  usesFallback: boolean
}

type KeyAggregate = {
  key: string
  baseWidth: number
  baseLines: number
  worstLocale: Language
  worstWidth: number
  worstRatio: number
  worstLines: number
  text: string
  baseText: string
}

const run = (): void => {
  const { threshold, limit } = parseOptions()
  const locales = buildLocales()
  const base = locales.find((entry) => entry.code === 'en-US')

  if (!base) {
    throw new Error('Missing English catalog.')
  }

  const keys = Object.keys(base.catalog).sort()
  const findingsByLocale = new Map<Language, LocaleFinding[]>()
  const missingByLocale = new Map<Language, string[]>()
  const aggregates: KeyAggregate[] = []

  for (const locale of locales) {
    findingsByLocale.set(locale.code, [])
    missingByLocale.set(locale.code, [])
  }

  for (const key of keys) {
    const baseText = base.catalog[key] ?? ''
    const baseWidth = approximateWidth(baseText)
    const baseLines = countLines(baseText)

    let worst: KeyAggregate | undefined

    for (const locale of locales) {
      const localized = locale.catalog[key] ?? ''
      const localizedWidth = approximateWidth(localized)
      const localizedLines = countLines(localized)
      const usesFallback = locale.overrides[key] === undefined
      const ratio = baseWidth === 0 ? (localizedWidth === 0 ? 1 : Number.POSITIVE_INFINITY) : localizedWidth / baseWidth

      if (locale.code !== base.code) {
        const localeFindings = findingsByLocale.get(locale.code)
        if (!localeFindings) {
          throw new Error(`Locale ${locale.code} missing findings bucket.`)
        }
        if (usesFallback) {
          missingByLocale.get(locale.code)?.push(key)
        }
        if (ratio >= threshold || localizedLines > baseLines) {
          localeFindings.push({
            key,
            ratio,
            baseWidth,
            localizedWidth,
            baseLines,
            localizedLines,
            text: localized,
            baseText,
            usesFallback,
          })
        }
      }

      if (!worst || localizedWidth > worst.worstWidth || (localizedWidth === worst.worstWidth && localizedLines > worst.worstLines)) {
        worst = {
          key,
          baseWidth,
          baseLines,
          worstLocale: locale.code,
          worstWidth: localizedWidth,
          worstRatio: ratio,
          worstLines: localizedLines,
          text: localized,
          baseText,
        }
      }
    }

    if (worst && (worst.worstLocale !== base.code || worst.worstLines > baseLines)) {
      aggregates.push(worst)
    }
  }

  for (const locale of locales) {
    const list = findingsByLocale.get(locale.code)
    if (!list) {
      continue
    }
    list.sort((a, b) => {
      if (b.ratio !== a.ratio) {
        return b.ratio - a.ratio
      }
      if (b.localizedWidth !== a.localizedWidth) {
        return b.localizedWidth - a.localizedWidth
      }
      return a.key.localeCompare(b.key)
    })
  }

  aggregates.sort((a, b) => {
    if (b.worstRatio !== a.worstRatio) {
      return b.worstRatio - a.worstRatio
    }
    if (b.worstWidth !== a.worstWidth) {
      return b.worstWidth - a.worstWidth
    }
    return a.key.localeCompare(b.key)
  })

  console.log(`Localization width audit (threshold x${threshold.toFixed(2)}, top ${limit} entries per locale)`)
  console.log('')

  for (const locale of locales) {
    if (locale.code === base.code) {
      continue
    }
    const findings = findingsByLocale.get(locale.code) ?? []
    const missing = missingByLocale.get(locale.code) ?? []

    console.log(locale.code)
    if (findings.length === 0) {
      console.log('  No strings exceeded the threshold or line count difference.')
    } else {
      const slice = findings.slice(0, limit)
      for (const item of slice) {
        const ratioDisplay = `x${item.ratio.toFixed(2)}`
        const widthDisplay = `${item.localizedWidth}ch vs ${item.baseWidth}ch`
        const linesDisplay = item.localizedLines > item.baseLines ? `lines ${item.localizedLines}/${item.baseLines}` : 'single-line'
        const fallbackDisplay = item.usesFallback ? ' (fallback)' : ''
        console.log(`  • ${item.key}: ${ratioDisplay}, ${widthDisplay}, ${linesDisplay}${fallbackDisplay}`)
        console.log(`      en: ${item.baseText}`)
        console.log(`      ${locale.code}: ${item.text}`)
      }
      if (findings.length > slice.length) {
        console.log(`  … ${findings.length - slice.length} more entries above threshold`)
      }
    }

    if (missing.length > 0) {
      const detail = missing.length > limit ? `${missing.slice(0, limit).join(', ')} … (+${missing.length - limit} more)` : missing.join(', ')
      console.log(`  Missing overrides (${missing.length}): ${detail}`)
    }

    console.log('')
  }

  console.log('Worst-case keys (any locale):')
  if (aggregates.length === 0) {
    console.log('  All locales match English widths/line counts.')
    return
  }

  const topAggregates = aggregates.slice(0, limit)
  for (const entry of topAggregates) {
    const ratioDisplay = entry.worstRatio === Number.POSITIVE_INFINITY ? '∞' : `x${entry.worstRatio.toFixed(2)}`
    const widthDisplay = `${entry.worstWidth}ch vs ${entry.baseWidth}ch`
    const linesDisplay = entry.worstLines > entry.baseLines ? `lines ${entry.worstLines}/${entry.baseLines}` : 'single-line'
    console.log(`  • ${entry.key}: ${ratioDisplay}, ${widthDisplay}, ${linesDisplay} (${entry.worstLocale})`)
    console.log(`      en: ${entry.baseText}`)
    console.log(`      ${entry.worstLocale}: ${entry.text}`)
  }

  if (aggregates.length > topAggregates.length) {
    console.log(`  … ${aggregates.length - topAggregates.length} additional keys expand beyond English`)
  }
}

run()
