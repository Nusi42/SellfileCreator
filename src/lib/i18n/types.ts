export type Catalog = { [key: string]: string }
export type Language =
  | 'en-US'
  | 'de-DE'
  | 'fr-FR'
  | 'es-ES'
  | 'pt-BR'
  | 'pt-PT'
  | 'ru-RU'
  | 'uk-UA'
  | 'tr-TR'
  // Dev-only language for i18n audits: renders all strings as empty
  | 'empty'
