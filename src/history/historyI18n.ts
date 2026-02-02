/**
 * historyI18n.ts
 *
 * Shared i18n typings for history helpers and descriptors.
 */

// TranslateFn mirrors useI18n's signature for history-specific helpers.
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string
