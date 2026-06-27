import { test } from 'node:test'
import assert from 'node:assert/strict'

// en-US is the source of truth for catalog keys; every other production locale
// must define exactly the same key set — no more, no less. The runtime spreads
// English under each locale (`{ ...en, ...deDE }`), so a *missing* key silently
// falls back to English and an *extra* key is silently dead. Both hide real
// regressions (e.g. a value-side rename like main stat→Hauptwert accidentally
// applied to the key identifier `gearAnalyticsChartMainStat`), so we lock the
// key sets to exact equality here rather than relying on runtime fallback.
import { PRODUCTION_LANGUAGES } from '../../src/lib/i18n/types.js'
import enUS from '../../src/lib/i18n/catalogs/en-US.js'
import deDE from '../../src/lib/i18n/catalogs/de-DE.js'
import frFR from '../../src/lib/i18n/catalogs/fr-FR.js'
import esES from '../../src/lib/i18n/catalogs/es-ES.js'
import itIT from '../../src/lib/i18n/catalogs/it-IT.js'
import ptBR from '../../src/lib/i18n/catalogs/pt-BR.js'
import ptPT from '../../src/lib/i18n/catalogs/pt-PT.js'
import ruRU from '../../src/lib/i18n/catalogs/ru-RU.js'
import ukUA from '../../src/lib/i18n/catalogs/uk-UA.js'
import trTR from '../../src/lib/i18n/catalogs/tr-TR.js'
import type { Catalog } from '../../src/lib/i18n/types.js'

// Map every production locale code to its loaded catalog. Keep this in lockstep
// with `PRODUCTION_LANGUAGES` — the guard below asserts the mapping is complete,
// so adding a locale without registering its catalog here fails the test.
const CATALOGS: Record<string, Catalog> = {
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

// The English key set is the contract every other catalog must match exactly.
const baseKeys = new Set(Object.keys(enUS))

test('every production language has a registered catalog', () => {
  // A locale listed in PRODUCTION_LANGUAGES but absent here would never be
  // key-checked, so guard the mapping itself before checking parity.
  for (const lang of PRODUCTION_LANGUAGES) {
    assert.ok(CATALOGS[lang], `no catalog registered for production language "${lang}"`)
  }
})

// Each non-English catalog must define exactly the English key set.
for (const lang of PRODUCTION_LANGUAGES) {
  if (lang === 'en-US') continue
  test(`${lang} catalog keys are identical to en-US (no missing, no extra)`, () => {
    const catalog = CATALOGS[lang]
    assert.ok(catalog, `no catalog registered for "${lang}"`)
    const keys = new Set(Object.keys(catalog))
    // Keys present in en-US but absent here → silent English fallback.
    const missing = [...baseKeys].filter((k) => !keys.has(k)).sort()
    // Keys present here but absent in en-US → dead keys nothing consumes.
    const extra = [...keys].filter((k) => !baseKeys.has(k)).sort()
    assert.deepEqual(
      { missing, extra },
      { missing: [], extra: [] },
      `${lang} key set drifted from en-US`,
    )
  })
}
