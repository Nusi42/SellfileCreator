/**
 * Minimal i18n layer (strictly typed)
 *
 * Why: Keep multi-language support small and dependency-free. We centralize
 * UI strings in typed catalogs and expose a React context with a `t` helper.
 * We persist the selected language in localStorage to keep behavior stable.
 */
import React from 'react'
import { LANG_KEY, RULE_COUNT_LIMIT } from './constants'
import { expandClientToken, subscribeClientName } from './runtimeConfig'
import {
  DEFAULT_LANGUAGE,
  DEV_LANGUAGE_SET,
  DEV_LANGUAGES,
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

export type I18nKey = keyof typeof en
type StrictCatalog = { [K in I18nKey]: string }
// The catalog-aware translate function, exported so helpers outside the React tree
// (e.g. exportLabelTiers) can accept `t` with full key typing instead of `string`.
export type TranslateFn = (key: I18nKey, params?: Record<string, string | number>) => string

const STAT_TOKEN_PATTERN = /\[\[\s*stat\s*:\s*([A-Za-z0-9_]+)(?:\|([A-Za-z0-9_-]+))?\s*\]\]/g

// Replace [[stat:...]] placeholders with the localized stat label so builder/tooltips
// render consistent text/color regardless of catalog overrides.
function expandStatTokens(value: string, catalog: StrictCatalog): string {
  if (!value || value.indexOf('[[stat:') === -1) return value
  const dict = catalog as unknown as Record<string, string>
  const fallback = en as unknown as Record<string, string>
  return value.replace(STAT_TOKEN_PATTERN, (_, rawKey: string, modifierRaw?: string) => {
    const key = rawKey.trim()
    const modifier = modifierRaw?.trim().toLowerCase()
    const raw = dict[key] ?? fallback[key] ?? ''
    return applyStatTokenModifier(raw, modifier)
  })
}

function applyStatTokenModifier(label: string, modifier?: string | null): string {
  if (!modifier) return label
  if (modifier === 'bare') {
    return label.replace(/\s*%$/, '')
  }
  return label
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
  t: TranslateFn
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
  const [lang, setLang] = React.useState<Language>(safeGetLanguage)
  const [runtimeCatalogs, setRuntimeCatalogs] = React.useState<Record<string, StrictCatalog>>({})

  const updateLang = React.useCallback((l: Language) => {
    setLang(l)
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
    setLang((langCode as Language) || DEFAULT_LANGUAGE)
  }, [])

  // Bump on every client rename so `t` (and with it every memoized subtree holding a
  // `{client}` string) is rebuilt. The name can arrive mid-session over the socket, long
  // after these strings were first rendered.
  const [clientNameSeq, setClientNameSeq] = React.useState(0)
  React.useEffect(() => subscribeClientName(() => setClientNameSeq((s) => s + 1)), [])

  const t = React.useCallback((key: I18nKey, params?: Record<string, string | number>) => {
    // Read here so the linter sees the dependency: the value is unused, but the client name
    // is pulled from module state inside expandClientToken, which the rule cannot see. The
    // counter is what tells React this memo is stale after a mid-session rename.
    void clientNameSeq
    const cat = runtimeCatalogs[lang] || CATALOGS[lang] || en
    let val = (cat[key] ?? en[key]) as string
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return expandStatTokens(expandClientToken(val), cat)
  }, [lang, runtimeCatalogs, clientNameSeq])

  const value = React.useMemo<I18nContextValue>(() => ({ lang, setLang: updateLang, t, registerRuntimeCatalog }), [lang, updateLang, t, registerRuntimeCatalog])
  return <I18nContext value={value}>{children}</I18nContext>
}

export function useI18n(): I18nContextValue {
  const ctx = React.use(I18nContext)
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

export function formatRecipesCount(
  t: I18nContextValue['t'],
  total: number,
  selected?: number | null,
  visible?: number | null,
): string {
  const effectiveTotal = Math.max(0, total)
  const effectiveVisible = Math.max(0, visible ?? effectiveTotal)
  const selectedClamped = typeof selected === 'number' ? Math.max(0, Math.min(selected, effectiveTotal)) : null
  const hiddenCount = Math.max(0, effectiveTotal - effectiveVisible)
  const totalWord = effectiveTotal === 1 ? t('recipeOne') : t('recipeMany')
  const visibleWord = effectiveVisible === 1 ? t('recipeOne') : t('recipeMany')
  const hiddenSuffix = hiddenCount > 0 ? t('recipesHiddenSuffix', { hidden: hiddenCount }) : ''
  if (selectedClamped && selectedClamped > 1 && selectedClamped < effectiveTotal) {
    const useVisibleDenominator = hiddenCount > 0 && selectedClamped <= effectiveVisible && effectiveVisible > 0
    const denom = useVisibleDenominator ? effectiveVisible : effectiveTotal
    const denomWord = useVisibleDenominator ? visibleWord : totalWord
    return `${t('recipesSelectedCount', { selected: selectedClamped, total: denom, word: denomWord })}${hiddenSuffix}`
  }
  return `${t('recipesTotalCount', { count: effectiveVisible, word: visibleWord })}${hiddenSuffix}`
}

// Single definition of language display labels used by any language-selector component.
// Includes dev-only languages in Vite dev builds.
const PRODUCTION_LANGUAGE_LABELS: Record<ProductionLanguage, string> = {
  'en-US': 'English (EN)',
  'de-DE': 'Deutsch (DE)',
  'fr-FR': 'Français (FR)',
  'es-ES': 'Español (ES)',
  'it-IT': 'Italiano (IT)',
  'pt-BR': 'Português (BR)',
  'pt-PT': 'Português (PT)',
  'ru-RU': 'Русский (RU)',
  'uk-UA': 'Українська (UK)',
  'tr-TR': 'Türkçe (TR)',
}
const DEV_LANGUAGE_LABELS: Record<DevLanguage, string> = { empty: 'Empty (dev)' }
const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

export function useLanguageOptions(): ReadonlyArray<{ code: Language; label: string }> {
  // Stable between renders; isDev is a build-time constant, so the memo never re-runs.
  return React.useMemo(() => {
    const production = PRODUCTION_LANGUAGES.map((code) => ({ code, label: PRODUCTION_LANGUAGE_LABELS[code] }))
    if (!isDev) return production
    return [...DEV_LANGUAGES.map((code) => ({ code, label: DEV_LANGUAGE_LABELS[code] })), ...production]
  }, [])
}
