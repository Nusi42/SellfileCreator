/**
 * Minimal i18n layer (strictly typed)
 *
 * Why: Keep multi-language support small and dependency-free. We centralize
 * UI strings in typed catalogs and expose a React context with a `t` helper.
 * We persist the selected language in localStorage to keep behavior stable.
 */
import React from 'react'
import { LANG_KEY, RULE_COUNT_LIMIT } from './constants'
import {
  DEFAULT_LANGUAGE,
  DEV_LANGUAGE_SET,
  PRODUCTION_LANGUAGE_SET,
  PRODUCTION_LANGUAGES,
  type DevLanguage,
  type Language,
  type ProductionLanguage,
} from './i18n/types'
import enUS from './i18n/catalogs/en-US'
import deDE from './i18n/catalogs/de-DE'
import frFR from './i18n/catalogs/fr-FR'
import esES from './i18n/catalogs/es-ES'
import itIT from './i18n/catalogs/it-IT'
import ptBR from './i18n/catalogs/pt-BR'
import ptPT from './i18n/catalogs/pt-PT'
import ruRU from './i18n/catalogs/ru-RU'
import ukUA from './i18n/catalogs/uk-UA'
import trTR from './i18n/catalogs/tr-TR'

// Base (English) catalog is the source of truth for keys
const en = enUS

type I18nKey = keyof typeof en
type StrictCatalog = { [K in I18nKey]: string }

const STAT_TOKEN_PATTERN = /\[\[\s*stat\s*:\s*([A-Za-z0-9_]+)\s*\]\]/g

// Replace [[stat:...]] placeholders with the localized stat label so builder/tooltips
// render consistent text/color regardless of catalog overrides.
function expandStatTokens(value: string, catalog: StrictCatalog): string {
  if (!value || value.indexOf('[[stat:') === -1) return value
  const dict = catalog as unknown as Record<string, string>
  const fallback = en as unknown as Record<string, string>
  return value.replace(STAT_TOKEN_PATTERN, (_, rawKey: string) => {
    const key = rawKey.trim()
    return dict[key] ?? fallback[key] ?? ''
  })
}

// Dev-only empty catalog: same keys, all values empty.
const EMPTY_CATALOG: StrictCatalog = Object.fromEntries(Object.keys(en).map((k) => [k, ''])) as unknown as StrictCatalog

const PRODUCTION_CATALOGS: Record<ProductionLanguage, StrictCatalog> = {
  'en-US': en as StrictCatalog,
  'de-DE': ({ ...en, ...deDE } as unknown) as StrictCatalog,
  'fr-FR': ({ ...en, ...frFR } as unknown) as StrictCatalog,
  'es-ES': ({ ...en, ...esES } as unknown) as StrictCatalog,
  'it-IT': ({ ...en, ...itIT } as unknown) as StrictCatalog,
  'pt-BR': ({ ...en, ...ptBR } as unknown) as StrictCatalog,
  'pt-PT': ({ ...en, ...ptPT } as unknown) as StrictCatalog,
  'ru-RU': ({ ...en, ...ruRU } as unknown) as StrictCatalog,
  'uk-UA': ({ ...en, ...ukUA } as unknown) as StrictCatalog,
  'tr-TR': ({ ...en, ...trTR } as unknown) as StrictCatalog,
}

const CATALOGS: Record<Language, StrictCatalog> = {
  ...PRODUCTION_CATALOGS,
  // Dev-only: show blank strings so any hardcoded/untagged text pops visually
  empty: EMPTY_CATALOG,
}

const LOWERCASE_PRODUCTION_LOOKUP: Record<string, ProductionLanguage> = Object.fromEntries(
  PRODUCTION_LANGUAGES.map((code) => [code.toLowerCase(), code]),
) as Record<string, ProductionLanguage>

const BASE_LANGUAGE_FALLBACK: Record<string, ProductionLanguage> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  ru: 'ru-RU',
  uk: 'uk-UA',
  tr: 'tr-TR',
} as const

const REGIONAL_OVERRIDES: Record<string, ProductionLanguage> = {
  'pt-br': 'pt-BR',
  'pt-pt': 'pt-PT',
} as const

const isRecognizedLanguage = (code: string | null | undefined, includeDev: boolean): code is Language => {
  if (typeof code !== 'string') return false
  if (PRODUCTION_LANGUAGE_SET.has(code as ProductionLanguage)) return true
  return includeDev && DEV_LANGUAGE_SET.has(code as DevLanguage)
}

function safeGetLanguage(): Language {
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  try {
    const raw = localStorage.getItem(LANG_KEY)
    if (isRecognizedLanguage(raw, isDev)) return raw
    // No explicit preference stored: in dev, auto-detect; in prod, default to English
    return isDev ? detectPreferredLanguage() : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export type I18nContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: I18nKey, params?: Record<string, string | number>) => string
  // Register a runtime catalog for quick testing (e.g., via dropped file)
  registerRuntimeCatalog: (langCode: string, catalog: Partial<StrictCatalog>) => void
}
const I18nContext = React.createContext<I18nContextValue | null>(null)

function detectPreferredLanguage(): Language {
  try {
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map((l) => String(l || '').toLowerCase())
    for (const entry of langs) {
      const direct = LOWERCASE_PRODUCTION_LOOKUP[entry]
      if (direct) return direct
      const override = REGIONAL_OVERRIDES[entry]
      if (override) return override
      const [base] = entry.split('-')
      if (base) {
        const fallback = BASE_LANGUAGE_FALLBACK[base]
        if (fallback) return fallback
      }
    }
    return DEFAULT_LANGUAGE
  } catch { return DEFAULT_LANGUAGE }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const [lang, setLangState] = React.useState<Language>(safeGetLanguage)
  const [runtimeCatalogs, setRuntimeCatalogs] = React.useState<Record<string, StrictCatalog>>({})

  const setLang = React.useCallback((l: Language) => {
    setLangState(l)
    try {
      const auto = isDev ? detectPreferredLanguage() : DEFAULT_LANGUAGE
      if (l === auto) {
        // Do not persist if it matches auto-detected, so next launch re-autodetects.
        localStorage.removeItem(LANG_KEY)
      } else {
        localStorage.setItem(LANG_KEY, l)
      }
    } catch {}
  }, [isDev])

  const registerRuntimeCatalog = React.useCallback((langCode: string, patch: Partial<StrictCatalog>) => {
    const base = en as StrictCatalog
    const merged: StrictCatalog = { ...base, ...(CATALOGS[langCode as Language] || {}), ...(patch as StrictCatalog) }
    setRuntimeCatalogs((prev) => ({ ...prev, [langCode]: merged }))
    // Switch to the runtime language without persisting selection
    setLangState((langCode as Language) || DEFAULT_LANGUAGE)
  }, [])

  const t = React.useCallback((key: I18nKey, params?: Record<string, string | number>) => {
    const cat = runtimeCatalogs[lang] || CATALOGS[lang] || en
    let val = (cat[key] ?? en[key]) as string
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return expandStatTokens(val, cat)
  }, [lang, runtimeCatalogs])

  const value = React.useMemo<I18nContextValue>(() => ({ lang, setLang, t, registerRuntimeCatalog }), [lang, setLang, t, registerRuntimeCatalog])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export function formatRulesCount(
  t: I18nContextValue['t'],
  count: number,
  options?: { limit?: number },
): string {
  // Shared helper so Builder and Preview chips stay localized consistently.
  const limitCandidate = options?.limit ?? RULE_COUNT_LIMIT
  const limitForInfinity = Number.isFinite(limitCandidate) && limitCandidate > 0
    ? Math.max(1, Math.floor(limitCandidate))
    : RULE_COUNT_LIMIT
  const formatter = new Intl.NumberFormat(undefined)
  if (!Number.isFinite(count)) {
    const formattedLimit = formatter.format(limitForInfinity)
    return t('rulesCountMany', { n: `≥ ${formattedLimit}` })
  }
  const rounded = Math.max(0, Math.floor(count))
  if (rounded === 1) return t('rulesCountOne')
  const formatted = formatter.format(rounded)
  return t('rulesCountMany', { n: formatted })
}

export function formatConfigsCount(
  t: I18nContextValue['t'],
  total: number,
  selected?: number | null,
  visible?: number | null,
): string {
  const effectiveTotal = Math.max(0, total)
  const effectiveVisible = Math.max(0, visible ?? effectiveTotal)
  const selectedClamped = typeof selected === 'number' ? Math.max(0, Math.min(selected, effectiveTotal)) : null
  const hiddenCount = Math.max(0, effectiveTotal - effectiveVisible)
  const totalWord = effectiveTotal === 1 ? t('configOne') : t('configMany')
  const visibleWord = effectiveVisible === 1 ? t('configOne') : t('configMany')
  const hiddenSuffix = hiddenCount > 0 ? t('configsHiddenSuffix', { hidden: hiddenCount }) : ''
  if (selectedClamped && selectedClamped > 1 && selectedClamped < effectiveTotal) {
    const useVisibleDenominator = hiddenCount > 0 && selectedClamped <= effectiveVisible && effectiveVisible > 0
    const denom = useVisibleDenominator ? effectiveVisible : effectiveTotal
    const denomWord = useVisibleDenominator ? visibleWord : totalWord
    return `${t('configsSelectedCount', { selected: selectedClamped, total: denom, word: denomWord })}${hiddenSuffix}`
  }
  return `${t('configsTotalCount', { count: effectiveVisible, word: visibleWord })}${hiddenSuffix}`
}
