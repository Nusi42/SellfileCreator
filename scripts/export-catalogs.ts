import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import en from '../src/lib/i18n/catalogs/en-US'
import de from '../src/lib/i18n/catalogs/de-DE'
import fr from '../src/lib/i18n/catalogs/fr-FR'
import es from '../src/lib/i18n/catalogs/es-ES'
import pt from '../src/lib/i18n/catalogs/pt-PT'

const langs = [
  ['en-US', en],
  ['de-DE', { ...en, ...de }],
  ['fr-FR', { ...en, ...fr }],
  ['es-ES', { ...en, ...es }],
  ['pt-PT', { ...en, ...pt }],
  ['ru-RU', en],
  ['uk-UA', en],
  ['tr-TR', en],
]

const outDir = join(process.cwd(), 'dist', 'l10n')
mkdirSync(outDir, { recursive: true })

for (const [code, cat] of langs) {
  const payload = { lang: code, catalog: cat }
  const path = join(outDir, `${code}.l10n.json`)
  writeFileSync(path, JSON.stringify(payload, null, 2), 'utf8')
}

console.log(`Exported ${langs.length} catalogs to ${outDir}`)
