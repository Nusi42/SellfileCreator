// Single source of truth for the export/push button's progressively-shortened
// labels. The split button can't always fit the full "Export RSL Helper Sellfile"
// string, so useFittingLabel picks the widest tier that fits — full → short → min,
// then icon-only (null) below min. Each tier is its own translated catalog key so
// word order and grammar stay correct per locale; we never slice a localized string.
import type { TranslateFn, I18nKey } from './i18n'

// The four label variants the button can show, keyed by the two state flags that
// pick between them: push-active vs export, and merged (base rules present) vs not.
// Mirrors the existing exportLabel selection in PreviewHeaderActions so there is one
// place that knows the variant→key mapping.
type ExportVariant = 'export' | 'exportMerged' | 'push' | 'pushMerged'

// Maps a variant to its three catalog keys, ordered widest-first. Keeping the base
// key names here (the "…Short"/"…Min" suffixes are appended) ties each tier set to
// its full-label key so a renamed key surfaces as one edit, not three.
const VARIANT_BASE_KEY: Record<ExportVariant, I18nKey> = {
  export: 'exportSellfile',
  exportMerged: 'exportMergedSellfile',
  push: 'pushSellfile',
  pushMerged: 'pushMergedSellfile',
}

// Resolve the active variant from the same flags the button already computes.
function pickVariant(pushActive: boolean, hasBaseRules: boolean): ExportVariant {
  if (pushActive) return hasBaseRules ? 'pushMerged' : 'push'
  return hasBaseRules ? 'exportMerged' : 'export'
}

// Returns [full, short, min] for the active variant. useFittingLabel consumes this
// array in order; the array's order IS the shortening priority (widest → narrowest).
export function exportLabelTiers(
  t: TranslateFn,
  pushActive: boolean,
  hasBaseRules: boolean,
): [string, string, string] {
  const base = VARIANT_BASE_KEY[pickVariant(pushActive, hasBaseRules)]
  // The suffixed keys are guaranteed present in every catalog (added alongside the
  // base key); the cast keeps the template-literal key assignable to I18nKey.
  const shortKey = `${base}Short` as I18nKey
  const minKey = `${base}Min` as I18nKey
  return [t(base), t(shortKey), t(minKey)]
}
