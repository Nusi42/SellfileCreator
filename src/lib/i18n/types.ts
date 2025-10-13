/**
 * Shared language metadata so UI code, tooling, and docs rely on the same canonical codes.
 * Why: Avoid magic strings and keep supported locales synchronized across the app.
 */
export const PRODUCTION_LANGUAGES = [
  'en-US',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'pt-BR',
  'pt-PT',
  'ru-RU',
  'uk-UA',
  'tr-TR',
] as const

export const DEV_LANGUAGES = [
  // Dev-only language for i18n audits: renders all strings as empty
  'empty',
] as const

export const SUPPORTED_LANGUAGES = [...PRODUCTION_LANGUAGES, ...DEV_LANGUAGES] as const

export type ProductionLanguage = (typeof PRODUCTION_LANGUAGES)[number]
export type DevLanguage = (typeof DEV_LANGUAGES)[number]
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: ProductionLanguage = 'en-US'

export const PRODUCTION_LANGUAGE_SET = new Set<ProductionLanguage>(PRODUCTION_LANGUAGES)
export const DEV_LANGUAGE_SET = new Set<DevLanguage>(DEV_LANGUAGES)

export type Catalog = { [key: string]: string }
