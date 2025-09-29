import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import en from '../src/lib/i18n/catalogs/en-US'
import de from '../src/lib/i18n/catalogs/de-DE'
import fr from '../src/lib/i18n/catalogs/fr-FR'
import es from '../src/lib/i18n/catalogs/es-ES'
import it from '../src/lib/i18n/catalogs/it-IT'
import pt from '../src/lib/i18n/catalogs/pt-PT'
import ru from '../src/lib/i18n/catalogs/ru-RU'
import tr from '../src/lib/i18n/catalogs/tr-TR'
import uk from '../src/lib/i18n/catalogs/uk-UA'

const langs = [
  ['en-US', en],
  ['de-DE', { ...en, ...de }],
  ['fr-FR', { ...en, ...fr }],
  ['es-ES', { ...en, ...es }],
  ['it-IT', { ...en, ...it }],
  ['pt-PT', { ...en, ...pt }],
  ['ru-RU', { ...en, ...ru }],
  ['uk-UA', { ...en, ...uk }],
  ['tr-TR', { ...en, ...tr }],
]

const outDir = join(process.cwd(), 'dist', 'l10n')
mkdirSync(outDir, { recursive: true })

for (const [code, cat] of langs) {
  const payload = { lang: code, catalog: cat }
  const path = join(outDir, `${code}.l10n.json`)
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
}

console.log(`Exported ${langs.length} catalogs to ${outDir}`)
