import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import en from '../../src/lib/i18n/catalogs/en-US'
import de from '../../src/lib/i18n/catalogs/de-DE'
import fr from '../../src/lib/i18n/catalogs/fr-FR'
import es from '../../src/lib/i18n/catalogs/es-ES'
import it from '../../src/lib/i18n/catalogs/it-IT'
import ptBR from '../../src/lib/i18n/catalogs/pt-BR'
import ptPT from '../../src/lib/i18n/catalogs/pt-PT'
import ru from '../../src/lib/i18n/catalogs/ru-RU'
import tr from '../../src/lib/i18n/catalogs/tr-TR'
import uk from '../../src/lib/i18n/catalogs/uk-UA'
import { DEFAULT_LANGUAGE, PRODUCTION_LANGUAGES, type Catalog, type ProductionLanguage } from '../../src/lib/i18n/types'

const CATALOG_OVERRIDES: Record<ProductionLanguage, Catalog> = {
  'en-US': en,
  'de-DE': de,
  'fr-FR': fr,
  'es-ES': es,
  'it-IT': it,
  'pt-BR': ptBR,
  'pt-PT': ptPT,
  'ru-RU': ru,
  'uk-UA': uk,
  'tr-TR': tr,
}

const langs = PRODUCTION_LANGUAGES.map((code) => {
  const overrides = CATALOG_OVERRIDES[code]
  const catalog = code === DEFAULT_LANGUAGE ? overrides : { ...en, ...overrides }
  return [code, catalog] as const
})

const outDir = join(process.cwd(), 'dist', 'l10n')
mkdirSync(outDir, { recursive: true })

for (const [code, cat] of langs) {
  const payload = { lang: code, catalog: cat }
  const path = join(outDir, `${code}.l10n.json`)
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
}

console.log(`Exported ${langs.length} catalogs to ${outDir}`)
