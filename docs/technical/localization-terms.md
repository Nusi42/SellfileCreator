# Localization terminology reference

This document captures the current vocabulary for the Rule Tester / Keep Uniques surface so translators know which phrases should stay in sync between the English copy, the localized README guidance, and the `src/lib/i18n/catalogs` keys. For each locale we list the terminology that already appears in `README.<lang>.md`, the relevant catalog values, how glyph/roll terminology is phrased, and any outstanding conflicts that need catalog or README updates.

## en-US (`README.md`, `src/lib/i18n/catalogs/en-US.ts`)
- **README wording**: The Sellfile preview keeps the `Rules`/`Rule Tester` toggle in the header (`README.md` lines 9‑138) and the Rule Tester preview section spells out how imported gear and the `Gear...` dialog fill the Rule Tester table. The `### Keep Uniques` section now mirrors the Final Sell tab behavior (default/helper rules, badges, `Keep Uniques` enable switch, `Have / Keep` counter, quota scopes table, scenario grid, clipboard workflows).
- **Catalog values**:
  * `testerPreviewHeading` / `previewModeTester`: “Rule Tester”.
  * `tabKeepUniques` / `keepUniquesTabLabel`: “Keep Uniques” (tab, hint, intro, toggle, counts, etc.).
  * `filterGlyphs` group (`filterGlyphs`, `filterGlyphsAny`, `On`, `Off`, `Selected`, tooltip) and `filterRollsWildcardTitle`: all English.
  * `tutSectionRuleTesterLabel`: “Rule Tester” alongside the other tutorial section labels (Basics, Advanced, Metasets, Config Chips, Final Sell, Save & Export, Auto + Late).
- **Glyph wording**: README describes the gear entries as “Substats (with glyphs and rolls)” and the filter tooltip references glyph states.
- **Wildcard wording**: The “Wildcards with Min Required” examples and the “Wildcard requirement” helper text are written in English, matching the catalog key.
- **Notes**: README + catalog now cover Keep Uniques with matching wording. UI labels follow a strict title-case style (menus, buttons, toggle labels, status chips) while tooltips and paragraph copy stay in sentence case—mirror this split when editing English strings or seeding new locales so button text doesn’t drift into sentence case over time.

## de-DE (`README.de.md`, `src/lib/i18n/catalogs/de-DE.ts`)
- **README wording**: The Sellfile preview, dialog references, and filters all use “Regel Tester”/“Regel Tester-Vorschau” and keep the “Glyphen” + “Wildcard” vocabulary. The new `### Unikate behalten` section documents the Finaler Verkauf tab, the default + helper rules, the `Vorhanden / Behalten` counter, the “Fehlen {count}”/“Anderswo abgedeckt” cues, and the `Filter: Alle / Auswahl` switch so the prose matches the UI.
- **Catalog values**:
  * `testerPreviewHeading`: “Regel Tester”.
  * `tabKeepUniques` + helpers: “Unikate behalten” plus `keepUniquesRuleCounts = "Vorhanden {have} / Behalten {keep}"` and `keepUniquesGridFilterLabel = "Filter: {mode}"` with `keepUniquesGridFilterModeAll = "Alle"` / `keepUniquesGridFilterModeSelection = "Auswahl"`.
  * `filterGlyphs` entries are localized (`Glyphen`, `Beliebig`, `An`, `Aus`, `Ausgewählt`, German tooltip). `filterRolls` keeps “Rolls” as a deliberate loanword while the helper text, wildcard title, and summaries stay German to match the README phrasing.
  * `tutSectionRuleTesterLabel`: “Regel Tester”.
- **Glyph wording**: README explicitly calls out “Glyphen und Rollen”.
- **Wildcard wording**: The examples keep using “Wildcard”, so future copy should confirm whether the English term is acceptable or should be replaced.
- **Notes**: Keep Uniques copy now matches the catalog (“Unikate behalten”, `Vorhanden / Behalten`, `Filter: Alle / Auswahl`). “Rolls” remains a shared loanword between README + catalog, so no catalog changes are pending for this locale.

## es-ES (`README.es.md`, `src/lib/i18n/catalogs/es-ES.ts`)
- **README wording**: “Probador” cubre la vista previa, el diálogo y las referencias al Rule Tester; “glifos” y “comodín” describen los filtros de glyph/roll igual que en la UI. La sección `### Conservar únicos` ahora replica toda la estructura inglesa: explica la pestaña, la regla predeterminada de accesorios, la regla de ayuda para arma/armadura, los chips `Por ranura`/`Por conjunto`/`Por facción`/`Por stat principal`, el contador `Hay / Conservar`, el `Filtro: Todos / Selección` y las tablas de ámbitos y escenarios reales.
- **Catalog values**:
  * `testerPreviewHeading` y `tutSectionRuleTesterLabel`: “Probador”.
  * `keepUniques*`: “Conservar únicos” en el tab, `Hay {have} / Conservar {keep}` en los contadores, chips `Por ranura`/`Por conjunto`/`Por facción`/`Por stat principal`, y las etiquetas del filtro `Filtro: {mode}` con `Todos`/`Selección`.
  * `filterGlyphs`: `Glifos`, `Cualquiera`, `Con glifos`, `Sin glifos`, `Seleccionados`, tooltip en español.
  * `filterRolls`: `Tiradas`, `Requisito de comodín`, `Recuento de tiradas`, sumarios y ayudas en español.
- **Glyph wording**: README dice “Substats (con glifos y recuentos de tiradas)” y la IU usa la misma terminología.
- **Wildcard wording**: README e IU usan “comodín”.
- **Notes**: README, catálogo y glosario comparten “Conservar únicos” + `Hay / Conservar` + `Filtro: Todos / Selección`; no hay pendientes para este locale salvo mantener esta sincronización.

## fr-FR (`README.fr.md`, `src/lib/i18n/catalogs/fr-FR.ts`)
- **README wording**: La copie parle de « Testeur de règles » (aperçu, dialogue et section dédiée) et décrit les glyphes comme « glyphes » tandis que les jokers restent « joker ». La section `### Conserver les uniques` documente désormais les règles par défaut + d’aide, le compteur « Existants / Conserver », les puces `Par règle/slot/ensemble/faction/stat principale`, la table des portées et le toggle `Filtrer : Tous / Sélection`.
- **Catalog values**:
  * `testerPreviewHeading` et `tutSectionRuleTesterLabel`: « Testeur de règles ».
  * `keepUniques*`: tout emploie « Conserver les uniques », `keepUniquesRuleCounts = "{have} existants / Conserver {keep}"`, les puces de portée `Par règle/slot/ensemble/faction/stat principale`, et `keepUniquesGridFilterLabel = "Filtrer : {mode}"` avec `Tous` / `Sélection`.
  * `filterGlyphs`: `Glyphes`, `Toutes`, `Avec glyphes`, `Sans glyphes`, `Glyphes sélectionnés` + l’infobulle française qui reprend la logique du README.
  * `filterRolls`: `Lancers`, `Condition de joker`, `Nombre de lancers`, puces et résumés français.
- **Glyph wording**: README/catalogue disent « glyphes ».
- **Wildcard wording**: README/catalogue restent sur « joker ».
- **Notes**: La terminologie `Conserver les uniques` + « Existants / Conserver » + « Filtrer : Tous / Sélection » doit rester synchronisée entre README, catalogue et UI ; aucun blocage ouvert.

## it-IT (`README.it.md`, `src/lib/i18n/catalogs/it-IT.ts`)
- **README wording**: The preview keeps the `Rules`/`Tester regole` toggle in the header, references `glifi e roll` plus `jolly` in the filter descriptions, and now includes a `### Mantieni unici` section that walks through the default 5★/6★ accessory rule, the helper rule for rare armor sets, the scope chips (`Per regola`/`Per slot`/`Per set`/`Per fazione`/`Per statistica principale`), the `Presenti / Conservare` counter, the `Filtro: Tutti / Selezione` toggle, and the `Ne mancano / Coperta altrove / Soddisfatta` states with matching tables.
- **Catalog values**:
  * `testerPreviewHeading`: “Tester regole”.
  * `keepUniques*`: “Mantieni unici” for the tab/intro strings, `keepUniquesRuleCounts = "Presenti {have} / Conservare {keep}"`, and the scope chips (`Per regola`/`Per slot`/`Per set`/`Per fazione`/`Per statistica principale`).
  * `keepUniquesGridFilterLabel`/`keepUniquesGridFilterMode*`/`keepUniquesGridFilterTooltip`: “Filtro: {mode}”, “Tutti”, “Selezione”, and the tooltip that matches the README wording.
  * `filterGlyphs` entries: “Glifi”, “Qualsiasi”, “Con glifi”, “Senza glifi”, “Selezionati” with the Italian tooltip.
  * `filterRolls` entries: “Roll”, the Italian helper text, `Richiesta jolly`, the roll-count terminology, and Italian summaries that repeat `roll`.
  * `tutSectionRuleTesterLabel`: “Tester regole”.
- **Glyph wording**: README calls them “glifi”.
- **Wildcard wording**: README calls them “jolly”.
- **Notes**: Keep the Italian `Mantieni unici`, `Presenti / Conservare`, scope chips, and `Filtro: Tutti / Selezione` phrasing aligned between README, catalog, and UI. Maintain the same `glifi`/`roll` vocabulary so the UI copy stays consistent with the documented guidance.

## pt-PT (`README.pt.md`, `src/lib/i18n/catalogs/pt-PT.ts`)
- **README wording**: “Teste de Regras” cobre a prévia, o diálogo e o painel de filtros; o texto descreve “glifos e rolagens” e os exemplos de wildcard continuam a usar “curinga”. A secção `### Manter únicos` agora replica toda a estrutura em inglês (regra predefinida para acessórios, regra auxiliar para armas/armaduras, quotas `Por slot`/`Por conjunto`/`Por facção`/`Por atributo principal`, contador `Existem / Manter`, tabela de âmbitos e grelha de cenários) e referencia o toggle `Filtro: Todos / Seleção`.
- **Catalog values**:
  * `testerPreviewHeading` e `tutSectionRuleTesterLabel`: “Teste de Regras”.
  * `keepUniques*`: “Manter únicos” em todas as cópias, `keepUniquesRuleCounts = "Existem {have} / Manter {keep}"`, chips `Por slot`/`Por conjunto`/`Por facção`/`Por atributo principal`, e `keepUniquesGridFilterLabel = "Filtro: {mode}"` com `Todos` / `Seleção`.
  * `filterGlyphs`: `Glifos`, `Qualquer`, `Com glifos`, `Sem glifos`, `Selecionados`, tooltip localizado; `filterRolls`: `Rolagens`, `Requisito de curinga`, `Contagem de rolagens`, resumo e ajuda em PT.
- **Glyph wording**: README e UI dizem “glifos”.
- **Wildcard wording**: README e UI dizem “curinga”.
- **Notes**: README, catálogo e glossário agora partilham “Manter únicos” + `Existem / Manter` + `Filtro: Todos / Seleção`; manter tudo sincronizado quando novas strings chegarem.

## pt-BR (`README.pt-BR.md`, `src/lib/i18n/catalogs/pt-BR.ts`)
- **README wording**: “Teste de Regras” ancora a prévia/diálogo, os filtros falam em “glifos e rolagens” e os curingas permanecem “curinga”. A secção `### Manter únicos` agora copia toda a estrutura inglesa: descreve a regra padrão para acessórios, a regra auxiliar desativada para armas/armaduras, explica os chips `Por regra`/`Por slot`/`Por conjunto`/`Por facção`/`Por atributo principal`, detalha o contador `Existem / Manter`, chama o seletor `Filtro: Todos / Seleção`, inclui a tabela de escopos e a grelha de cenários reais.
- **Catalog values**:
  * `testerPreviewHeading` e `tutSectionRuleTesterLabel`: “Teste de Regras”.
  * `keepUniques*`: “Manter únicos” em todas as chaves, `keepUniquesRuleCounts = "Existem {have} / Manter {keep}"`, chips `Por slot`/`Por conjunto`/`Por facção`/`Por atributo principal`, e `keepUniquesGridFilterLabel = "Filtro: {mode}"` com `Todos` / `Seleção`.
  * `filterGlyphs` ainda usa strings em inglês (apenas o tooltip está em pt-BR), enquanto toda a família `filterRolls` já está localizada (rolagens, requisito curinga, resumos).
- **Glyph wording**: README usa “glifos”.
- **Wildcard wording**: README usa “curinga”.
- **Notes**: README, catálogo e glossário agora compartilham “Manter únicos” + `Existem / Manter` + `Filtro: Todos / Seleção`. A única lacuna aberta é localizar `filterGlyphs` (os rótulos ainda estão em inglês).

## ru-RU (`README.ru.md`, `src/lib/i18n/catalogs/ru-RU.ts`)
- **README wording**: The preview and tester sections stick with “Тестер” plus “глифами”/“джокер” for glyphs and wildcards. The `### Сохранение уникальных комбинаций` section mirrors the English layout (seeded/helper rules, scope chips `По правилу/слоту/набору/фракции/осн. стату`, counter `Есть / Сохранить`, quota table, real-world grid, and the `Фильтр: Все / Выбор` toggle) using the exact catalog phrasing.
- **Catalog values**:
  * `testerPreviewHeading` / `tutSectionRuleTesterLabel`: “Тестер”.
  * `keepUniques*`: both `tabKeepUniques` and `keepUniquesTabLabel` read “Сохранение уникальных комбинаций”; the statuses stay `Не хватает {count}` / `Покрыто в другом месте` / `Требование выполнено`, `keepUniquesRuleCounts = "Есть {have} / Сохранить {keep}"`, the scope chips (`По правилу/слоту/набору/фракции/осн. стату`) and grid filter (`Фильтр: {mode}` with `Все`/`Выбор`) match the README copy.
  * `filterGlyphs`: `Глифы`, `Любые`, `С глифами`, `Без глифов`, `Выбранные`, plus the localized tooltip.
  * `filterRolls`: `Роллы`, `Требование джокера`, `Количество роллов`, `Требования по стату`, `Добавить требование`, and the localized summaries/backers.
- **Glyph wording**: README uses “глифами”.
- **Wildcard wording**: README uses “джокер”.
- **Notes**: ru-RU now locks onto “Сохранение уникальных комбинаций” + `Есть / Сохранить` everywhere (README, catalog, tutorial copy); keep these synced if new strings land.

## tr-TR (`README.tr.md`, `src/lib/i18n/catalogs/tr-TR.ts`)
- **README wording**: “Kural testi” describes the Rule Tester preview/dialog and the guidance already talks about `glifler` and `Joker`; the new `### Benzersizleri Koru` section walks through the tab layout, the `Var {have} / Koru {keep}` sayaç, the `Eksik {count}` / `Başka yerde korunuyor` / `Gereksinim karşılandı` status chips, and the `Filtre: Hepsi / Seçim` toggle.
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
- **README wording**: `README.uk.md` зберігає “Тестер” для попереднього перегляду, описує гліфи як “гліфами” й wildcards як “джокером”, а розділ `### Збереження унікальних комбінацій` відповідає макету англійської версії: розписує типове й допоміжне правила, чипи `На правило/слот/сет/фракцію/основну стату`, лічильник `Є / Зберегти`, `Фільтр: Усі / Вибір`, таблицю діапазонів і приклади зі сценаріями.
- **Catalog values**:
  * `testerPreviewHeading` і `tutSectionRuleTesterLabel`: “Тестер”.
  * `keepUniques*`: Весь текст використовує «Збереження унікальних комбінацій», `keepUniquesRuleCounts = "Є {have} / Зберегти {keep}"`, статуси `Не вистачає` / `Покрито в іншому місці` / `Вимога виконана`, чипи діапазону `На правило/слот/сет/фракцію/осн. стат`, і `keepUniquesGridFilterLabel = "Фільтр: {mode}"` з `Усі`/`Вибір`.
  * `filterGlyphs*`: «Гліфи», «Усі», «Увімкнено», «Вимкнено», «Обрані» плюс тултіп, що повторює README.
  * `filterRolls*`: «Ролі», «Кількість ролів», «Вимога джокера», пер-статні вимоги та резюме українською.
- **Glyph wording**: README використовує «гліфами».
- **Wildcard wording**: README використовує «джокером».
- **Notes**: README, каталог і цей глосарій тепер синхронізовані на «Збереження унікальних комбінацій» + `Є / Зберегти` + `Фільтр: Усі / Вибір`; відкритих блокерів немає.

## Common catalog gaps
- pt-BR still ships English `filterGlyphs` labels (only the tooltip is localized). Translate `filterGlyphs`, `filterGlyphsAny`, `filterGlyphsOn`, `filterGlyphsOff`, and `filterGlyphsSelected` to match the README wording (`glifos`, etc.) so the UI no longer mixes languages.
- Keep an eye on new locales or features: whenever additional `keepUniques*`, `filterGlyphs*`, `filterRolls*`, or `tutSectionRuleTesterLabel` keys land, update this doc plus the corresponding README at the same time so the single-source-of-truth contract stays intact.
