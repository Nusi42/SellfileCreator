/* eslint-disable no-irregular-whitespace */
/**
 * Minimal i18n layer (strictly typed)
 *
 * Why: Keep multi-language support small and dependency-free. We centralize
 * UI strings in typed catalogs and expose a React context with a `t` helper.
 * We persist the selected language in localStorage to keep behavior stable.
 */
import React from 'react'
import { LANG_KEY } from './constants'
import type { Language } from './i18n/types'
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

// Dev-only empty catalog: same keys, all values empty.
const EMPTY_CATALOG: StrictCatalog = Object.fromEntries(Object.keys(en).map((k) => [k, ''])) as unknown as StrictCatalog

const CATALOGS: Record<Language, StrictCatalog> = {
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
  // Dev-only: show blank strings so any hardcoded/untagged text pops visually
  'empty': EMPTY_CATALOG,
}

function safeGetLanguage(): Language {
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  try {
    const raw = localStorage.getItem(LANG_KEY)
    if (raw === 'en-US' || raw === 'de-DE' || raw === 'fr-FR' || raw === 'es-ES' || raw === 'it-IT' || raw === 'pt-BR' || raw === 'pt-PT' || raw === 'ru-RU' || raw === 'uk-UA' || raw === 'tr-TR' || (isDev && raw === 'empty')) return raw as Language
    // No explicit preference stored: in dev, auto-detect; in prod, default to English
    return isDev ? detectPreferredLanguage() : 'en-US'
  } catch {
    return 'en-US'
  }
}

type I18nContextValue = {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: I18nKey, params?: Record<string, string | number>) => string
  // Register a runtime catalog for quick testing (e.g., via dropped file)
  registerRuntimeCatalog: (langCode: string, catalog: Partial<StrictCatalog>) => void
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

function detectPreferredLanguage(): Language {
  try {
    const supported: Language[] = ['en-US', 'de-DE', 'fr-FR', 'es-ES', 'it-IT', 'pt-BR', 'pt-PT', 'ru-RU', 'uk-UA', 'tr-TR']
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map((l) => String(l || '').toLowerCase())
    for (const entry of langs) {
      const base = entry.split('-')[0]
      const mapped = entry === 'pt-br' ? 'pt-BR' :
        entry === 'pt-pt' ? 'pt-PT' :
        base === 'en' ? 'en-US' :
        base === 'de' ? 'de-DE' :
        base === 'fr' ? 'fr-FR' :
        base === 'es' ? 'es-ES' :
        base === 'it' ? 'it-IT' :
        base === 'pt' ? 'pt-PT' :
        base === 'ru' ? 'ru-RU' :
        base === 'uk' ? 'uk-UA' :
        base === 'tr' ? 'tr-TR' : ''
      if (mapped && (supported as string[]).includes(mapped)) return mapped as Language
    }
    return 'en-US'
  } catch { return 'en-US' }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const isDev: boolean = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)
  const [lang, setLangState] = React.useState<Language>(safeGetLanguage)
  const [runtimeCatalogs, setRuntimeCatalogs] = React.useState<Record<string, StrictCatalog>>({})

  const setLang = React.useCallback((l: Language) => {
    setLangState(l)
    try {
      const auto = isDev ? detectPreferredLanguage() : 'en-US'
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
    setLangState((langCode as Language) || 'en-US')
  }, [])

  const t = React.useCallback((key: I18nKey, params?: Record<string, string | number>) => {
    const cat = runtimeCatalogs[lang] || CATALOGS[lang] || en
    let val = (cat[key] ?? en[key]) as string
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return val
  }, [lang, runtimeCatalogs])

  const value = React.useMemo<I18nContextValue>(() => ({ lang, setLang, t, registerRuntimeCatalog }), [lang, setLang, t, registerRuntimeCatalog])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}

export function formatRulesCount(t: I18nContextValue['t'], count: number): string {
  // Shared helper so Builder and Preview chips stay localized consistently.
  return count === 1 ? t('rulesCountOne') : t('rulesCountMany', { n: count })
}
