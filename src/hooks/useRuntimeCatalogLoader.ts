import { useCallback } from 'react'
import type { useI18n } from '../lib/i18n'

type RegisterRuntimeCatalog = ReturnType<typeof useI18n>['registerRuntimeCatalog']
type Translator = ReturnType<typeof useI18n>['t']

export interface UseRuntimeCatalogLoaderParams {
  registerRuntimeCatalog: RegisterRuntimeCatalog
  setToastOpen: (open: boolean) => void
  setToastMsg: (msg: string) => void
  t: Translator
}

export interface UseRuntimeCatalogLoaderResult {
  handleRuntimeCatalog: (file: File) => Promise<void>
}

const canonicalizeLangCode = (raw: string): string => {
  // Normalize language tags so dropped catalogs can use any separator/casing variant.
  const parts = raw.split(/[-_]/).map((segment) => segment.trim()).filter(Boolean)
  if (parts.length === 0) return ''
  const [language, ...rest] = parts as [string, ...string[]]
  const normalized: string[] = [
    language.toLowerCase(),
    ...rest.map((segment) => (segment.length <= 3 ? segment.toUpperCase() : segment)),
  ]
  return normalized.join('-')
}

const inferLangFromFileName = (fileName: string): string => {
  // Accept filenames like "de-DE.l10n.json" or "pt_br.i18n".
  const withoutJson = fileName.replace(/\.json$/i, '')
  const match = /([^./\\]+)\.(?:l10n|i18n)$/i.exec(withoutJson)
  if (!match) return ''
  return canonicalizeLangCode(match[1] ?? '')
}

const asStringMap = (maybe: Record<string, unknown>): Record<string, string> | null => {
  // Guard runtime patches so every catalog entry stays a plain string.
  const entries = Object.entries(maybe)
  if (!entries.every(([, value]) => typeof value === 'string')) return null
  return entries.reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value as string
    return acc
  }, {})
}

/**
 * Handles runtime localization catalog uploads.
 *
 * Why: Dropped `.l10n/.i18n` files should hot-load language patches without
 * leaking helper logic from `App.tsx`. The handler normalizes language tags,
 * validates catalog payloads, and surfaces status via the shared toast.
 */
export function useRuntimeCatalogLoader({
  registerRuntimeCatalog,
  setToastOpen,
  setToastMsg,
  t,
}: UseRuntimeCatalogLoaderParams): UseRuntimeCatalogLoaderResult {
  const handleRuntimeCatalog = useCallback(
    async (file: File) => {
      try {
        const text = await file.text()
        const data = JSON.parse(text) as unknown

        let langCode = ''
        let catalog: Record<string, string> | null = null
        if (data && typeof data === 'object') {
          const obj = data as Record<string, unknown>
          if (typeof obj.lang === 'string' && obj.catalog && typeof obj.catalog === 'object') {
            langCode = canonicalizeLangCode(obj.lang)
            catalog = asStringMap(obj.catalog as Record<string, unknown>)
          } else {
            langCode = inferLangFromFileName(file.name)
            catalog = asStringMap(obj)
          }
        }

        if (!langCode || !catalog) throw new Error('Invalid l10n file')

        registerRuntimeCatalog(langCode, catalog)
        setToastMsg(t('toastL10nLoaded', { lang: langCode }))
        setToastOpen(true)
      } catch {
        setToastMsg(t('toastL10nLoadFailed'))
        setToastOpen(true)
      }
    },
    [registerRuntimeCatalog, setToastMsg, setToastOpen, t],
  )

  return { handleRuntimeCatalog }
}
