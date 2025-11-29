# Localization terminology reference

This document captures the current vocabulary for the Rule Tester / Keep Uniques surface so translators know which phrases should stay in sync between the English copy, the localized README guidance, and the `src/lib/i18n/catalogs` keys. For each locale we list the terminology that already appears in `README.<lang>.md`, the relevant catalog values, how glyph/roll terminology is phrased, and any outstanding conflicts that need catalog or README updates.

## en-US (`README.md`, `src/lib/i18n/catalogs/en-US.ts`)
- **README wording**: The Sellfile preview keeps the `Rules`/`Rule Tester` toggle in the header (`README.md` lines 9‑138) and the Rule Tester preview section spells out how imported gear and the `Gear...` dialog fill the Rule Tester table. Keep Uniques is not yet mentioned in this README, so there is no localized text to cross-check.
- **Catalog values**:
  * `testerPreviewHeading` / `previewModeTester`: “Rule Tester”.
  * `tabKeepUniques` / `keepUniquesTabLabel`: “Keep Uniques” (tab, hint, intro, toggle, counts, etc.).
  * `filterGlyphs` group (`filterGlyphs`, `filterGlyphsAny`, `On`, `Off`, `Selected`, tooltip) and `filterRollsWildcardTitle`: all English.
  * `tutSectionRuleTesterLabel`: “Rule Tester” alongside the other tutorial section labels (Basics, Advanced, Metasets, Config Chips, Final Sell, Save & Export, Auto + Late).
- **Glyph wording**: README describes tester rows as “Substats (with glyphs and rolls)” and the filter tooltip references glyph states.
- **Wildcard wording**: The “Wildcards with Min Required” examples and the “Wildcard requirement” helper text are written in English, matching the catalog key.
- **Notes**: No conflicts yet; catalogs already match README for Rule Tester wording. Keep Uniques needs README coverage once the feature copy is written so the term can be referenced consistently. UI labels now follow a strict title-case style (menus, buttons, toggle labels, status chips) while tooltips and paragraph copy stay in sentence case—mirror this split when editing English strings or seeding new locales so button text doesn’t drift into sentence case over time.

## de-DE (`README.de.md`, `src/lib/i18n/catalogs/de-DE.ts`)
- **README wording**: The preview copy uses “Regeltester/Regeltester-Vorschau” (`README.de.md` lines 9‑132) and the Rule Tester section describes glyphs (“Glyphen”) and the wildcard examples still say “Wildcard”. Keep Uniques is not described yet.
- **Catalog values**:
  * `testerPreviewHeading`: “Regel-Tester”.
  * `tabKeepUniques` + helpers: “Unikate behalten”.
  * `filterGlyphs` entries are localized (`Glyphen`, `Beliebig`, `An`, `Aus`, `Ausgewählt`, with a German tooltip), but `filterRolls` entries (helper, wildcard title, roll chips, validation text) remain in English.
  * `tutSectionRuleTesterLabel`: still “Rule Tester”, which disagrees with the README’s “Regeltester”.
- **Glyph wording**: README explicitly calls out “Glyphen und Rollen”.
- **Wildcard wording**: The examples keep using “Wildcard”, so future copy should confirm whether the English term is acceptable or should be replaced.
- **Notes**: Localize `tutSectionRuleTesterLabel` to “Regeltester” (or equivalent) and translate the `filterRolls*` keys while keeping the README terminology. Keep Uniques copy still needs to propagate into the README once the feature text is ready.

## es-ES (`README.es.md`, `src/lib/i18n/catalogs/es-ES.ts`)
- **README wording**: “Probador” is used for the Rule Tester preview and dialog (see the Sellfile preview sections around lines 90‑140). Glyph references use “glifos” and the wildcard examples use “comodín”. Keep Uniques is not yet described.
- **Catalog values**:
  * `testerPreviewHeading`: “Probador”.
  * `keepUniques*` keys: “Conservar únicos”.
  * `keepUniquesGridFilterLabel`: now reads “Filtro: {mode}” with the modes “Todos”/“Selección” and an explanation of the behavior in Spanish.
  * `filterGlyphs` entries now use Spanish labels (`Glifos`, `Cualquiera`, `Con glifos`, `Sin glifos`, `Seleccionados`) with a matching tooltip about glyph states.
  * `filterRolls` strings are translated (e.g., `Tiradas`, `Exige ciertos recuentos de tiradas…`, `Requisito de comodín`, `Recuento de tiradas`, `Filtros de tiradas: {summary}`, and the summary lines).
  * `tutSectionRuleTesterLabel`: “Probador”.
- **Glyph wording**: README says “Substats (con glifos y recuentos de tiradas)”.
- **Wildcard wording**: README examples use “comodín”.
- **Notes**: Keep Uniques copy still missing in the README; once that prose lands, keep the Probador vocabulary in sync between catalog and docs.

## fr-FR (`README.fr.md`, `src/lib/i18n/catalogs/fr-FR.ts`)
- **README wording**: The preview headers, menu, and dedicated section refer to “Testeur de règles” (lines 9‑132). Glyphs are “glyphes” and the wildcard examples use “joker”. There is no Keep Uniques mention yet.
- **Catalog values**:
  * `testerPreviewHeading`: “Testeur de règles”.
  * `keepUniques*` keys: “Conserver les uniques”.
  * `filterGlyphs` entries are still English (Glyphs/Any/On/Off/Selected + tooltip template).
  * `filterRolls` strings remain English.
  * `tutSectionRuleTesterLabel`: still “Rule Tester” instead of French; this key should be brought in line with “Testeur de règles”.
- **Glyph wording**: README uses “glyphes”.
- **Wildcard wording**: README writes “joker”.
- **Notes**: Localize the tooltip/labels under `filterGlyphs` and `filterRolls` and translate `tutSectionRuleTesterLabel`. Keep Uniques needs README coverage as soon as the feature documentation is written.

## it-IT (`README.it.md`, `src/lib/i18n/catalogs/it-IT.ts`)
- **README wording**: The preview keeps the `Rules`/`Verificatore regole` toggle in the header, references `glifi e roll` plus `jolly` in the filter descriptions, and now includes a `### Mantieni unici` section that explains the second tab in the Vendita finale dialog, the combination scanning, the `Ne mancano / Coperta altrove / Soddisfatta` chips, and the `Filtro: Tutti / Selezione` switch.
- **Catalog values**:
  * `testerPreviewHeading`: “Tester regole”.
  * `keepUniques*`: “Mantieni unici”.
  * `keepUniquesGridFilterLabel`/`keepUniquesGridFilterMode*`/`keepUniquesGridFilterTooltip`: “Filtro: {mode}”, “Tutti”, “Selezione”, and the Italian tooltip that mirrors the README copy.
  * `filterGlyphs` entries: “Glifi”, “Qualsiasi”, “Con glifi”, “Senza glifi”, “Selezionati” with the Italian tooltip.
  * `filterRolls` entries: “Roll”, the Italian helper text, `Richiesta jolly`, the roll-count terminology, and Italian summaries that repeat `roll`.
  * `tutSectionRuleTesterLabel`: “Verificatore regole”.
- **Glyph wording**: README calls them “glifi”.
- **Wildcard wording**: README calls them “jolly”.
- **Notes**: Keep the Italian `Mantieni unici` prose, filter labels, and tutorial section label aligned between README and the catalog. Future tweaks should maintain the same `glifi`/`roll` vocabulary so the UI copy stays consistent with the documented guidance.

## pt-PT (`README.pt.md`, `src/lib/i18n/catalogs/pt-PT.ts`)
- **README wording**: “Teste de Regras” is used throughout the preview, dialog, and filters (lines 10‑140). Glyph text says “glifos e rolagens”, and wildcard examples use “curinga”. Keep Uniques still lacks documentation in this README.
- **Catalog values**:
  * `testerPreviewHeading`: “Teste de Regras”.
  * `keepUniques*`: “Manter únicos”.
  * `filterGlyphs` + `filterRolls` keys remain English.
  * `tutSectionRuleTesterLabel`: “Teste de Regras” (already aligned).
- **Glyph wording**: README uses “glifos”.
- **Wildcard wording**: README uses “curinga”.
- **Notes**: Provide Portuguese translations for `filterGlyphs`/`filterRolls` entries when localizing those helpers (they are still English). Keep Uniques text is still pending in the README.

## pt-BR (`README.pt-BR.md`, `src/lib/i18n/catalogs/pt-BR.ts`)
- **README wording**: Very similar to pt-PT: “Teste de Regras” is everywhere, glyphs are “glifos e rolagens”, and wildcard sections use “curinga”.
- **Catalog values**:
  * `testerPreviewHeading`: “Teste de Regras”.
  * `keepUniques*`: “Manter únicos”.
  * Filter-related keys (`filterGlyphs`, `filterRolls`) remain English.
  * `tutSectionRuleTesterLabel`: “Teste de Regras”.
- **Glyph wording**: README uses “glifos”.
- **Wildcard wording**: README uses “curinga”.
- **Notes**: Same as pt-PT—localize the filter strings when possible and document Keep Uniques after the feature copy is ready.

## ru-RU (`README.ru.md`, `src/lib/i18n/catalogs/ru-RU.ts`)
- **README wording**: The preview and tester sections use “Тестер” for the Rule Tester (lines 9‑132), “глифами” for glyphs, and the wildcard examples borrow “джокер”. The new `### Сохранение уникальных` section now documents the Keep Uniques tab, the filter states (`Не хватает {count}`, `Покрыто в другом месте`, `Требование выполнено`), and the `Фильтр: Все / Выбор` toggle.
- **Catalog values**:
  * `testerPreviewHeading`: “Тестер”.
  * `keepUniques*`: now read `tabKeepUniques = “Уникальные комбинации”`, `keepUniquesTabLabel = “Сохранение уникальных комбинаций”`, `keepUniquesRuleDeficit = “Не хватает {count}”`, `keepUniquesRuleCovered = “Покрыто в другом месте”`, `keepUniquesRuleSatisfied = “Требование выполнено”`, and `keepUniquesGridFilterLabel`/`keepUniquesGridFilterMode*` produce `Фильтр: {mode}` with `Все`/`Выбор`.
  * `filterGlyphs`: values such as `Глифы`, `Любые`, `С глифами`, `Без глифов`, `Выбранные` plus the existing tooltip now match the README language.
  * `filterRolls`: values like `Роллы`, `Требовать определённые количества роллов…`, `Требование джокера`, `Количество роллов`, `Требования по стату`, `Добавить требование`, `Фильтры роллов: {summary}`, and the Russian summaries/backers.
  * `tutSectionRuleTesterLabel`: “Тестер”.
- **Glyph wording**: README uses “глифами”.
- **Wildcard wording**: README uses “джокер”.
- **Notes**: Catalog and documentation now share the same Keep Uniques vocabulary and filter labels; keep them synchronized if either the UI or README copy changes.

## tr-TR (`README.tr.md`, `src/lib/i18n/catalogs/tr-TR.ts`)
- **README wording**: “Kural testi” describes the Rule Tester preview/dialog and the guidance already talks about `glifler` and `Joker`; the new `### Benzersizleri Koru` section explains how the dialog’s `Benzersizleri Koru` sekmesi, `Eksik {count}` / `Başka yerde korunuyor` / `Gereksinim karşılandı` statüleri ve `Filtre: Hepsi / Seçim` anahtarı çalışır.
- **Catalog values**:
  * `testerPreviewHeading`: “Kural Testi”.
  * `keepUniques*`: tab and labels now read “Benzersizleri Koru”/“Benzersizleri Koru’yu etkinleştir”, the statuses are `Eksik {count}` / `Başka yerde korunuyor` / `Gereksinim karşılandı`, the tooltip now references how many öğeler Benzersizleri Koru dışa aktarıyor, and the filter modes show `Filtre: Hepsi / Seçim`.
  * `filterGlyphs`: localized to `Glifler`, `Hepsi`, `Glifli`, `Glifsiz`, `Seçili` (the tooltip already explained the states in Turkish).
  * `filterRolls`: localized to `Rulolar`, a Turkish helper about tester verileri, `Joker gereksinimi`, `Rulo sayıları`, `Stat başına gereksinimler`, `Aktif rulo filtresi yok`, and summaries such as `Roller {counts} olan herhangi bir stat`.
  * `tutSectionRuleTesterLabel`: “Kural testi”.
- **Glyph wording**: README uses “glifler”.
- **Wildcard wording**: README uses “Joker”.
- **Notes**: Keep the `Benzersizleri Koru` vocabulary (tab name, statuses, filter labels) aligned between the UI and README; the new Turkish descriptions mirror the `Filtre: Hepsi / Seçim` toggle and the status chips so future translators can reuse the same terms.

## uk-UA (`README.uk.md`, `src/lib/i18n/catalogs/uk-UA.ts`)
- **README wording**: The preview copy keeps calling the tester “Тестер”, references glyphs as “гліфами”, and uses “джокером” for wildcards; a new `### Збереження унікальних комбінацій` section now mirrors the catalog vocabulary and points translators toward the two-column layout in the Final Sell dialog.
- **Catalog values**:
  * `testerPreviewHeading`: “Тестер”.
  * `keepUniques*`: Tab/labels describe “Збереження унікальних комбінацій”, rule status badges reference “Не вистачає”, “Покрито в іншому місці”, “Вимога виконана”, and the grid filter reads “Фільтр: {mode}` with `Усі`/`Вибір`.
  * `filterGlyphs*`: The glyph filter now uses “Гліфи”, “Усі”, “Увімкнено”, “Вимкнено”, “Обрані” and a tooltip that mirrors the README description.
  * `filterRolls*`: All roll labels are Ukrainian (`Ролі`, `Кількість ролів`, `Вимога джокера`, `Вимоги до кожного стату`, etc.), and the summary lines describe active roll constraints in Ukrainian.
  * `tutSectionRuleTesterLabel`: “Тестер”.
- **Glyph wording**: README uses “гліфами”.
- **Wildcard wording**: README uses “джокером”.
- **Notes**: No outstanding catalog gaps remain in uk-UA — the README and catalog now share the same vocabulary for Keep Uniques, glyph filters, and roll filters.

## Common catalog gaps
- The `filterGlyphs` (`Glyphs`, `Any`, `On`, `Off`, `Selected`, tooltip) and `filterRolls` strings are still English in many catalogs; translators should replace these entries with localized text that mirrors the glyph/wildcard language used in their README (e.g., `glifos`, `glyphes`, `glifi`, `glifler`, `гліфами`).
- Several locales may still ship `keepUniques*` keys in English; add localized variants before exposing the feature.
- Tutorial section labels expose the same trouble spot: ensure `tutSectionRuleTesterLabel` matches the localized name that appears in each README so the terminology stays consistent.
