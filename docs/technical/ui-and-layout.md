# UI and Layout

This document outlines contributors' responsibilities for UI behavior, layout, and related shared helpers.

## Localization (Contributors)

- Source of truth:
  - `src/lib/i18n/catalogs/en-US.ts` defines the complete, typed key set. Add new keys here only.
- Catalog files (non-English):
  - Each catalog lives in `src/lib/i18n/catalogs/<lang>.ts` and exports `const overrides: Catalog = { ... }; export default overrides` (overrides only; no English duplication).
  - `src/lib/i18n.tsx` merges every override over the English source catalog at runtime so any missing key falls back to English automatically.
- README translations live in `userDocs/` as `README.<lang>.md` (e.g., `userDocs/README.de.md`), next to the English `README.md`. The Help dialog pulls them via a Vite glob import when present — adding a file there is all it takes to ship a new translation.
- Shipped languages:
  - Localized: `de-DE`, `fr-FR`, `es-ES`, `it-IT`, `pt-BR`, `pt-PT`, `ru-RU`, `uk-UA`, `tr-TR` — provide partial/complete overrides layered over English.
- Vocabulary must stay consistent with the game and the existing UI. Reuse the terminology already present (e.g., “Recipe”) rather than inventing new phrases, and keep wording simple so non-expert users can follow along. Raid Shadow Legends terminology is allowed whenever it helps clarity. Apply this rule to every surface: catalogs, README translations, tutorials, cheat sheets, tooltips, and any other strings.
- Capitalization rules: treat buttons, tabs, chips, dialog titles, and other UI labels as Title Case (capitalize every principal word; keep short prepositions/articles such as “to”, “and”, “a” lowercase). Descriptive copy (tooltips, helper paragraphs, warnings, error messages) stays in sentence case with terminal punctuation. When a string mixes both (`X per slot × per set`), keep the label portion Title Case and the explanatory fragment sentence-case. Apply this consistently when adding keys to `en-US.ts`.
- Inline stat names must use the canonical tokens. Wrap every stat mention with `[[stat:statSPD]]`, `[[stat:statCR]]`, etc. so the shared `stat*` translations remain the single source of truth and colored text always matches the configured stat palettes. When you append your own units (e.g., `+12%`), add the `|bare` modifier (`[[stat:statCR|bare]] +12%`) to strip the built-in `%` suffix before applying your own.
- **Never write a client's name literally in a catalog string.** The connecting application
  names itself — via the `?clientName=` launch param or the `capabilities` handshake packet,
  and RSL Helper when neither says — so every mention uses the
  `{client}` placeholder — `"Connect to {client}"`, not `"Connect to RSL Helper"`. `i18n.tsx`
  expands it for *all* keys automatically, so no call site passes it and no `t()` signature
  changes. Two consequences when authoring: phrase around it so any name fits (avoid "an
  {client} database" — an article cannot agree with an unknown name), and translate the
  surrounding words only, leaving the token itself untouched in every catalog. The literal
  "RSL Helper" is still correct in *comments*, in the app's own product name ("RSL Helper
  Sellfile Creator"), in the trademark disclaimer, and in README content the Help dialog
  parses by heading text.
  - The **README files are the exception**: they ship as standalone documents (distributed
    to users as text files in the release zip) *and* render as the in-app Help screen, so they keep saying
    "RSL Helper" on disk and are adapted at render time by `adaptReadmeForDisplay`
    (`lib/readmeClientName.ts`). That module protects four categories from rewriting — the
    `.hsf` format name ("RSL Helper Sellfile", in every language's word order), the trademark
    disclaimer, the Farbstoff credit, and literal identifiers (backticked filenames, link
    targets, the H1 the Help dialog matches on) — because renaming those would be wrong, not
    merely inconsistent. **A change-detector test pins the adapted/preserved count for every
    README**: adding or editing an "RSL Helper" mention fails `readmeClientName.test.ts` on
    purpose, so someone must classify the new sentence rather than let the regexes pick.
  - The same `{client}` token also works in **authored note prose** (the shipped
    `presets/*.sfc`), expanded by `localizeNoteProse`. Documents on disk keep the placeholder
    — nothing rewrites saved user content — so a preset reads correctly under any client.
    Note the deliberate split: only the *string* form expands. `localizeNoteProseWithSourceMap`
    returns text verbatim, because its offsets index the raw draft behind the note editor and
    substituting a different-length name would break click-to-source sync.
- Runtime behavior:
  - Selected catalog overlays English. Precedence: runtime catalog (via `registerRuntimeCatalog`) → built-in `<lang>.ts` → English.
  - Dev-only audit language: `empty` renders all keys with empty strings to surface hardcoded text.
- Users can drag-and-drop `.l10n.json` files to test a localization for the current session.
  - Preferred schema: `{ "lang": "xx-XX", "catalog": { ... } }`.
  - Alternative: a plain key→string map; name the file `xx-XX.l10n.json` (case-insensitive hyphen/underscore variants are accepted) and the loader infers the language code from the filename.
- Type safety:
  - Keys are typed off `en-US.ts` (`StrictCatalog`). Using an unknown key in code fails typecheck; missing translations fall back to English safely.
- Release templates:
  - The release ZIP includes `dist/l10n/*.l10n.json` templates (generated by `npm run export:l10n`) so users can review/fix translations.
- Catalog audits:
  - Run **`npm run i18n:sync-comments`** to print the English comment index, rewrite non-English comment blocks to match those headings, and verify every catalog has the exact same key order/count as `en-US.ts`. (Equivalent to compiling the scripts bundle — `npx tsc -p tsconfig.scripts.json && node scripts/tooling/patch-esm-specifiers.cjs` — then `node tmp/tsc/scripts/scripts/tooling/sync-catalog-comments.js`.)
  - The script exits non-zero when keys or comments drift; fix the reported locales (add/remove/reorder keys plus translations) before re-running so the audit passes. Structural parity is also gated automatically by `tests/unit/catalog-structure-parity.test.ts` in `test:unit`, so a drift will fail the suite even if you forget to run the audit manually.
- **Catalog string quoting — double quotes**: All catalog values use TypeScript **double-quoted** string literals (`"..."`). This eliminates the former Unicode apostrophe trap — U+2019 (`'`) in languages like Ukrainian is harmless inside double quotes. When adding new entries, use double quotes for values. If a value contains a literal `"`, escape it as `\"`.
- Contribution workflow:
  - Keep keys identical to `en-US.ts`; do not rename/remove without scope discussion.
  - Submit updates by editing `src/lib/i18n/catalogs/<lang>.ts` (overrides only) or attach `.l10n.json` files.
  - Before handoff: quick in-app test (language switch), then `npm run typecheck && npm run lint && npm run build`.

### Localization alignment workflow

- README translations (`README.<lang>.md`) and their catalogs (`src/lib/i18n/catalogs/<lang>.ts`) form a single source of truth for terminology. When a feature’s copy changes (Gear Inspector preview, Safeguards defaults/helper rules, quota scopes, clipboard workflows, glyph/roll filters, recipe management tips), update the English README first, then mirror the structure and wording in every translated README while updating the matching catalog keys in the same commit.
- Use heading outlines to compare structures instead of noisy line-by-line diffs: `rg ‘^##’ userDocs/README.md` / `rg ‘^##’ userDocs/README.<lang>.md` (and `^###` for subsections) keeps the focus on missing sections, tables, and grids. Open both files side by side while applying the English layout to the localized version so tables, scenario grids, and recipe-management paragraphs stay parallel.
- `userDocs/README.md` and all README translations (`userDocs/README.<lang>.md`) are end-user facing documentation. Keep the wording simple, avoid technical terms, never mention internals (closed source), explain straight up on point and dont try to sell a feature. Using terminology from the game Raid Shadow Legends is fine though.
- All `Recipe`-building, `Filter`, `Gear-Sets`, and `Safeguards` terminology must stay synchronized between README copy, catalog strings, and UI labels. That includes the tab/section title, default/helper rule descriptions, badge labels, scope chips, and any other user facting button not explicitly mentioned here. If a locale intentionally keeps a loanword (e.g., “Rolls” in de-DE), mention the reasoning as a comment in their catalogs (`src/lib/i18n/catalogs/<lang>.ts`) so future translators do not “fix” it.
- Locale-specific notes should live as a comment in their catalogs (`src/lib/i18n/catalogs/<lang>.ts`).
- **Whenever you do translation/terminology work, update this doc in the same change.** A pass that resolves new terms, settles a loanword, or localizes preset prose for a language must leave its findings behind — extend the glossary below (adding a per-language table when none exists) and the catalog loanword comment — so the next pass starts from the decisions, not from scratch.

### Canonical terminology — the catalog is the source of truth

- **Always resolve a term against the catalog before translating it, never from intuition.** Every gear/RSL keyword already has a fixed rendering in `src/lib/i18n/catalogs/<lang>.ts`; reusing it is mandatory, not a preference. When in doubt, grep the catalog (`rg '\bstatSPD\s*:' src/lib/i18n/catalogs/de-DE.ts`) and copy what it uses.
- **One English word can map to several catalog terms — disambiguate by meaning, not spelling.** The recurring trap is `Speed`: as a **substat** it is `statSPD` → `SPD` (de-DE keeps `SPD`, not "Geschwindigkeit"); as the **gear set** it is `setSpeed` → `Geschwindigkeit`; as the plain word it is the everyday translation. Pick the variant by context, then use that key's value. The same applies to `Shield` (the *Shield* slot `slotShield` → "Schild" vs. the *Crit Shield* mechanic, which stays English).
- **Per-language scope — extend this section as you go.** All ten production locales now have a glossary below (de-DE, en-US is the source, plus es-ES, fr-FR, it-IT, pt-BR, pt-PT, ru-RU, tr-TR, uk-UA). When you do further terminology work in a locale, **extend its existing table — do not contradict it**. If a new concept appears, resolve it from that locale's catalog, add a row, and decide/record any new loanword here (not in a `<lang>.ts` comment). Keep glossaries terse; the catalog remains the runtime source of truth.
- **de-DE reference glossary (derived from the catalog; extend, do not contradict):**

  | English | de-DE (catalog key) | Notes |
  | --- | --- | --- |
  | piece / pieces | Teil / Teile | not "Stück" |
  | gear | Ausrüstung | translated, **not** the loanword "Gear". Feminine (die Ausrüstung) → "deine Ausrüstung", adjective agreement "frische/höherrangige Ausrüstung". Compounds: Ausrüstungsset, Ausrüstungstyp(en), Ausrüstungsinventar, Ausrüstungsdatenbank, Ausrüstungsinspektor. The *Gear Inspector* UI is "Ausrüstungsinspektor". (Catalog + README + presets all unified to this; the only surviving "Gear" is the proper-noun video-series title "Gear-Cleanse-Videos".) |
  | gear set / set | Set | loanword |
  | stat (bare) | Wert / Werte | translated, not the loanword "Stat". Whole family shares "-wert": **Wert / Unterwert / Hauptwert**. Dative plural takes -n ("auf gesperrten Werten"). |
  | substat(s) | Unterwert / Unterwerte | not "Substat"/"Nebenwert" — translated (the TS key `statSubstat` etc. stay English) |
  | main stat | Hauptwert | not "Mainstat"/"Hauptstat"/"Main-Stat". Masculine (der Hauptwert) → "jeder Hauptwert", genitive "des Hauptwerts" |
  | SPD (the stat) | SPD (`statSPD`) | also the gloss "SPD (Geschwindigkeit)" once on first mention |
  | Speed (the set) | Geschwindigkeit (`setSpeed`) | only when the literal *Speed* set is meant |
  | rank | Rang | keep "Sternstufe" distinct — that is the **star rank**, not the upgrade level |
  | rarity | Seltenheit | |
  | level (gear upgrade 0–16) | Level | **always "Level", never "Stufe"** — including control labels; das Level (neuter) → "auf **jedem** Level". Do not confuse with "Sternstufe" (star rank). |
  | faction | Fraktion | |
  | slot (the concept/word) | Slot | loanword (README uses "pro Slot") |
  | slot **names** | Waffe / Helm / Schild / Handschuhe / Brustplatte / Stiefel / Ring(e) / Amulett(e) / Banner | from `slot*` keys |
  | artifacts | Artefakte | the 6 upper slots; never "Rüstung"/"armor" |
  | accessories | Schmuckstücke | rings/amulets/banners |
  | keep / sell / protect | behalten / verkaufen / schützen | |
  | safeguards | Schutzregeln (`safeguardsTabLabel`) | English keeps "Safeguards"; de-DE translates |
  | (dynamic) overrides | Überbrückungen (`noteDynamicOverrides*`) | English keeps "overrides"; de-DE translates |
  | Chaos Ore | Chaos-Erz (`filterChaosOre`) | |
  | sell file (the file) | Sellfile | one word, no space — never "Sell File"/"Sell-Datei" |
  | rolls / drops | Rolls / Drops | **intentional loanwords** |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Aus / Schützen / Vorbeugen / Verbessern (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Gruppe (`safeguardsGroup*`) | |
  | bucket (the per-slot/set/faction/main-stat slice a safeguard counts separately) | Topf (`*Bucket*` keys, "Topf-Rang") | Renamed from "Gruppe" so the word is free for safeguard groups. |

  de-DE **intentional loanwords** (do NOT "correct" to German): Set, SPD, Banner, Slot, Rolls, Drops. **"Gear" is NOT a loanword in de-DE** — it is translated to "Ausrüstung" everywhere (catalog, README, preset prose); the lone exception is the proper-noun series title "Gear-Cleanse-Videos". The whole **stat** family is also translated: stat→Wert, substat→Unterwert, main stat→Hauptwert (`statSPD` / `gear*` etc. TS **keys** stay English; `[[stat:…]]` tokens are untouched).

- **it-IT reference glossary (derived from the catalog; extend, do not contradict):**

  | English | it-IT (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | pezzo / pezzi | |
  | gear | equipaggiamento | translated, **not** the loanword "Gear". The *Gear Inspector* mode is **"Ispettore Equipaggiamento"** (both words capitalized, proper noun) — used everywhere. |
  | gear set / set | set | loanword (lowercase in prose, Title Case as a label/chip) |
  | stat (bare) | stat | loanword, feminine ("la stat", "le stat"); also "valore/valori" generically |
  | substat(s) | sotto-stat | translated, **feminine** ("una sotto-stat", "le sotto-stat", "tutte le sotto-stat"). TS keys (`statSubstat`, `safeguardsSubstat*`, `tabSubstatTargets`…) stay English. |
  | main stat | stat principale | not "statistica principale". Plural label "Stat principali". |
  | SPD (the stat) | SPD (`statSPD`) | loanword |
  | Speed (the set) | Speed (`setSpeed`) | set names stay English |
  | rank | rango / Rango | not "grado". Keep distinct from star count. |
  | rarity | rarità | |
  | level | livello | |
  | faction | fazione | |
  | slot | slot | loanword; slot **names** are translated (Arma / Elmo / Scudo / Guanti / Corazza / Stivali / Anello / Amuleto / Vessillo) |
  | artifacts / accessories | artefatti / accessori | |
  | keep / sell / protect | mantieni (tieni) / vendi / proteggi | |
  | safeguards | Salvaguardie (`safeguardsTabLabel`) | English keeps "Safeguards"; it-IT translates ("Salvaguardie" / "Attiva Salvaguardie"). |
  | (dynamic) overrides | sostituzioni (dinamiche) | |
  | Chaos Ore | Chaos Ore | loanword (kept English); reroll states → "Rerollato" / "Mai rerollato" (matching `gearInspectorRerollLabel`) |
  | Vault | Deposito | not "Vault"/"Forziere" (RSL's Italian game term is "Deposito"). |
  | Inbox | Posta | `gearAnalyticsSourceInbox` matches `gearInspectorSourceInbox`. |
  | Custom (source) | Personalizzato | `gearInspectorSourceManual`. |
  | sell file | Sellfile | one word |
  | rolls / drops | roll / drop | loanwords (used singular+plural invariant) |
  | rules (HSF) | regole | engine rules; the `Rules`/`Gear Inspector` preview toggle reads `Regole`/`Ispettore Equipaggiamento`. |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Disattiva / Proteggi / Anticipa / Migliora (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Gruppo (`safeguardsGroup*`) | |

  it-IT **intentional loanwords** (do NOT "correct" to Italian): Set, SPD, Slot, Roll(s), Drop(s), Chaos Ore, Sellfile, Metaset, Flex. **"Gear" is translated** to "equipaggiamento" (the *Gear Inspector* mode → "Ispettore Equipaggiamento"). The **substat** family is translated to **feminine "sotto-stat"**; "main stat" → "stat principale"; "stat" stays the loanword "stat". it-IT addresses the user informally (**tu**, not voi).

- **pt-BR reference glossary (derived from the catalog; extend, do not contradict):**

  | English | pt-BR (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | peça / peças | |
  | gear | equipamento | translated, **not** the loanword "gear"; mass/singular ("seu equipamento"). "gear DB" → "banco de dados de equipamento". The TS `gear*` keys and `[[stat:…]]` tokens stay English. |
  | gear set / set | conjunto | canonical full word; **"set" / "Sets"** is an accepted loanword for compact labels (analytics chart `gearAnalyticsChartSet`, the set/meta-set selector domain, `meta-set`). Keep the scope token (`safeguardsCountModeScopeSet`) and its chip (`Por conjunto`) on the SAME word — both "conjunto". |
  | stat / substat / main stat | stat / substat / stat principal | whole family uses the **loanword "stat"** (masculine — "um stat", "esse substat"). **substat** → "substat/substats" (never "subatributo"/"sub-atributo"/"subestatística"). **main stat** → "stat principal" everywhere — catalog *and* README quota tables/chips (never "atributo principal"/"status principal"/"mainstat"/"estatística principal"). Plural chart/section labels use "Stats principais". |
  | SPD (the stat) | SPD (`statSPD`) | |
  | Speed (the set) | Velocidade (`setSpeed`) | |
  | rank | rank | loanword; never "Grau". |
  | rarity | Raridade | |
  | level | Nível | "Nv {level}" only as the compact badge (en "Lv"). Never "Level". |
  | faction | Facção | |
  | slot | slot / Slots | loanword (kept everywhere). |
  | slot names | Arma / Elmo / Escudo / Manoplas / Peitoral / Botas / Anel / Amuleto / Estandarte | from `slot*` keys. |
  | artifacts / accessories | Artefatos / Acessórios | |
  | keep / sell / protect | manter / vender / proteger | |
  | safeguards | Salvaguardas (`safeguardsTabLabel`) | README heading + toggle use "Salvaguardas" / "Ativar Salvaguardas" (never "Manter únicos"). |
  | (dynamic) overrides | substituições (dinâmicas) | |
  | Chaos Ore | Chaos Ore (`filterChaosOre`) | loanword kept; the verb is "rerrolado" / "Sem rerrolagem" (filter values translated from "Rerolled"/"Not rerolled"; `gearInspectorRerollLabel` → "Rerrolado"). |
  | sell file | Sellfile | one word; the preview mode label is "Prévia Sellfile". |
  | Gear Inspector | Inspetor de Equipamento | ONE rendering (never the "Gear Inspector" loanword or "Teste de Regras"). Title Case, singular. |
  | rolls / drops | rolagem(ns) / drop(s) | **rolls is TRANSLATED** to "rolagem/rolagens" (never the "roll/rolls"/"quad-rolls" loanwords). **drop(s)** stays the loanword. |
  | vault / inbox / custom | Cofre / Entrada / Personalizado | Gear-Analytics source labels match the Gear-Inspector source set; `gearInspectorSourceManual` → "Personalizado" to match en "Custom". |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Desativar / Proteger / Antecipar / Melhorar (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Grupo (`safeguardsGroup*`) | |

  pt-BR **intentional loanwords** (do NOT "correct" to Portuguese): set/Sets (alongside "conjunto"), SPD, Slot, stat/substat, Chaos Ore, Sellfile, Drops, Flex, RSL Helper. **"Gear" is translated** to "equipamento"; the *Gear Inspector* mode is "Inspetor de Equipamento". **"rolls" is translated** to "rolagem/rolagens" (unlike de-DE which keeps "Rolls"). pt-BR is a SEPARATE locale from pt-PT — keep them distinct.

- **es-ES reference glossary (derived from the catalog; extend, do not contradict):**

  | English | es-ES (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | pieza / piezas | |
  | gear | equipo | translated, **not** the loanword "gear". The *Gear Inspector* mode → "Inspector de Equipo"; *Gear Lens* → "Análisis de Equipo". |
  | gear set / set | set / Sets | **loanword**, canonical for the game concept (not "conjunto/Conjuntos"). Generic "a set/pool of X" (override set, candidate pool, reference set) stays "conjunto". |
  | stat / substat / main stat | stat / substat / stat principal | **loanwords** "stat"/"substat" (not "estadística"/"subestadísticas"); "main stat" → "stat principal" (masculine; not "estadística principal"/"mainstat"). |
  | slot | ranura | translated, canonical (not "slot"/"casilla"). Names: Arma / Yelmo / Escudo / Guantes / Peto / Botas / Anillo / Amuleto / Estandarte. |
  | rank / rarity / level / faction | rango / rareza / nivel / facción | |
  | artifacts / accessories | artefactos / accesorios | |
  | keep / sell / protect | conservar / vender / proteger | not "retener"/"retención". |
  | safeguards | Salvaguardas (`safeguardsTabLabel`) | translated. |
  | (dynamic) overrides | anulaciones (dinámicas) | not "sustituciones dinámicas"/"ajustes dinámicos". |
  | Chaos Ore | Mena de Caos / Chaos | per `filterChaosOre`. |
  | sell file | Sellfile | one word, masculine ("el Sellfile"). |
  | rolls / drops | rolls / drops / tiradas | "tiradas" for the count; "rolls"/"drops" loanwords where idiomatic. |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Apagada / Proteger / Anticipar / Mejorar (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Grupo (`safeguardsGroup*`) | |

  es-ES **intentional loanwords:** set, metaset, stat, substat, SPD/CR%/CDMG%/ACC/RES (stat codes), rolls, drops, Sellfile, Normalized, Diff, KPI. **"gear" is translated** to "equipo"; **slot → "ranura"**. Disambiguation: the gear-set game concept = "set"; generic set/pool = "conjunto".

- **fr-FR reference glossary (derived from the catalog; extend, do not contradict):**

  | English | fr-FR (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | pièce / pièces | |
  | gear | équipement | translated (mass noun). Compounds: « Inspecteur d'équipement », « base de données d'équipement », « set d'équipement ». |
  | gear set / set | set | loanword (masculine, « le set »); not « ensemble ». |
  | stat / substat / main stat | stat / sous-stat / stat principale | **feminine** throughout (abbreviates *statistique*); do not use English « substat » in prose. |
  | slot | emplacement | translated, canonical (not the loanword « slot »); « Empl. » as column abbr. Names: Arme / Casque / Bouclier / Gantelets / Plastron / Bottes / Bague / Amulette / Bannière. |
  | rank / rarity / level / faction | rang / rareté / niveau / faction | |
  | artifacts / accessories | artefacts / accessoires | |
  | keep / sell / protect | garder (conserver) / vendre / protéger | |
  | safeguards | garde-fous | translated. |
  | (dynamic) overrides | surcharges | « ensemble de surcharges » = override-set (kept, not a gear set). |
  | Chaos Ore | Chaos Ore | kept English; filter values translated (Tout / Non relancé / Relancé). |
  | sell file | Sellfile | one word. |
  | rolls / drops | rolls (jets / lancers) / drops | loanwords in prose; « jets »/« lancers » also native. |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Désactivé / Protéger / Prévoir / Améliorer (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Groupe (`safeguardsGroup*`) | |

  fr-FR **intentional loanwords:** Set, SPD, Rolls, Drops, Glyphed/Chaos'd (KPI badges), Vault, Inbox. **"Gear" is translated** to « équipement »; **slot → « emplacement »**.

- **pt-PT reference glossary (derived from the catalog; extend, do not contradict):**

  | English | pt-PT (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | peça / peças | |
  | gear | equipamento | translated, **not** "gear". |
  | gear set / set | set / Sets | loanword (not "Conjunto"); generic *override answer set* stays "conjunto de substituições". |
  | stat / substat / main stat | stat / substat(s) / stat principal | "substat" loanword (not "subatributo"); main stat = "stat principal"; substat masculine ("o substat"). |
  | level | nível / Nível (Nv) | not "Level" except the fixed KPI badge "Level +16". |
  | rank | Rank | loanword; not "Grau". |
  | rarity / faction | raridade / facção | European spelling ("facção", not "fação"). |
  | safeguards | Salvaguardas | translated; README uses "Salvaguardas", not "Manter únicos". |
  | (dynamic) overrides | substituições (dinâmicas) | |
  | accessories / artifacts | acessórios / artefactos | |
  | Chaos Ore | Chaos Ore | label English; states translated (Qualquer / Não relançado / Relançado). |
  | metaset | metaset | loanword, **no hyphen**. |
  | Vault / Inbox | Cofre / Entrada | unified across analytics + inspector. |
  | sell file | Sellfile | one word. |
  | rolls / drops | rolagens / drops | "rolagens" translated (not loanword); "drops" kept. |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Desligar / Proteger / Antecipar / Melhorar (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Grupo (`safeguardsGroup*`) | |

  pt-PT **intentional loanwords:** Set, SPD (+stat tokens), Slot, Rank, drops, Flex, metaset, Sellfile, Chaos Ore (label), Normalized. **"gear" → "equipamento"**, **"rolls" → "rolagens"**, **"substat" kept as loanword**. **European Portuguese** spelling throughout (ficheiro, ecrã, predefinição, facção). pt-PT is a SEPARATE locale from pt-BR.

- **ru-RU reference glossary (derived from the catalog; extend, do not contradict):**

  | English | ru-RU (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | предмет / предметы | |
  | gear | снаряжение | **canonical**; do not use экипировка / шмот / вещь as gear synonyms (verb "экипирован" = *equipped* kept). |
  | gear set / set | сет | **canonical over "набор"** for the gear-set concept; "набор" kept only for non-set meanings (набор настроек, наборы переопределений). |
  | stat / substat / main stat | стат / подстат / основной стат | substat = **подстат** (not субстат/сабстат/подхарактеристика). |
  | rank / rarity / level / faction | ранг / редкость / уровень / фракция | |
  | slot | слот | names Оружие/Шлем/Щит/Перчатки/Нагрудник/Сапоги/Кольцо/Амулет/Знамя. |
  | artifacts / accessories | артефакты / аксессуары | |
  | keep / sell / protect | оставить / продать / защитить | |
  | safeguards | Защиты | **canonical**; not "Правило сохранения"/"Сохранение уникальных комбинаций" (feminine agreement: Защита добавлена/обновлена/удалена). |
  | Gear Inspector | Инспектор снаряжения | **canonical**; not "Тестер"/"Тестер правил". |
  | (dynamic) overrides | переопределения | |
  | Chaos Ore | Chaos Ore | loanword; reroll → Переброшено. Chip values keep English originals. |
  | sell file | Sellfile | one word. |
  | rolls / drops | ролл / дропы | **rolls canonicalized to "ролл"** (not "роль"-style forms or "прок"). |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Выкл. / Хранить / Упреждать / Улучшать (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Группа (`safeguardsGroup*`) | |

  ru-RU **intentional loanwords:** сет, Sellfile, ролл, дроп, SPD/ATK/DEF/HP/ACC/RES/CR/CDMG, Flex. **"Gear" → снаряжение**, **"substat" → подстат** (translated, not loanwords).

- **tr-TR reference glossary (derived from the catalog; extend, do not contradict):**

  | English | tr-TR (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | parça / parçalar | not "öğe" for physical gear pieces. |
  | gear | ekipman | translated everywhere — **not** "gear". |
  | gear set / set | set | loanword. |
  | stat / substat / main stat | stat / alt stat / ana stat | compound forms; bare loanword "stat" kept (idiomatic). |
  | level / rank / rarity | seviye / rütbe / nadirlik | star rank = "yıldız rütbesi". |
  | faction | Fraksiyon | **canonical** (not "Faksiyon"). |
  | slot | Yuva / Yuvalar | **canonical** (not "Slot"; scope chip "Yuva başına"). Names: Silah, Miğfer, Kalkan, Eldivenler, Zırh, Botlar, Yüzük, Tılsım, Sancak. |
  | recipe | Reçete / Reçeteler | **canonical** (not "Tarif"); "kural" reserved for HSF rules. |
  | safeguards | Korumalar | catalog canonical; README uses "Korumalar", not "Benzersizleri Koru". |
  | (dynamic) overrides | geçersiz kılmalar | |
  | accessories / artifacts | aksesuarlar / eserler | |
  | Vault | Kasa | **canonical** (also for analytics). |
  | Chaos Ore | Kaos Cevheri | translated `filterChaosOre*` + tooltip; reroll → "yeniden atma". (KPI "Chaos'd"/"Chaos Orb" kept.) |
  | sell file | Sellfile | one word. |
  | rolls / drops | rulo / düşüş | translated. |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Kapalı / Koru / Öngör / İyileştir (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Grup (`safeguardsGroup*`) | |

  tr-TR **intentional loanwords:** SPD/ATK/DEF/HP/RES/ACC/CR/CDMG, Set, Flex, Sellfile, Glyph/glif, RSL Helper, Chaos'd/Chaos Orb. **"gear" → ekipman**, **slot → Yuva**, **recipe → Reçete**, **Vault → Kasa**, **faction → Fraksiyon**.

- **uk-UA reference glossary (derived from the catalog; extend, do not contradict):**

  | English | uk-UA (catalog) | Notes |
  | --- | --- | --- |
  | piece / pieces | предмет / предмети | |
  | gear | спорядження | translated, **not** loanword (neuter). Not *екіпіровка/екіпірування*; verb *екіпіровано* ("equipped") kept distinct. |
  | gear set / set | сет / сети | **canonical** (not *набір/набор/комплект* for the gear-set sense). "набір перевизначень" (batch of overrides) / "стандартний набір колонок" stay *набір*. |
  | stat / substat / main stat | стат / підстат / основний стат | **substat = підстат** (not сабстат/субстат/підхарактеристики, and not *статус*=status); main stat masculine *основний стат*. |
  | rank / rarity / level / faction | ранг / рідкість / рівень / фракція | |
  | slot | слот | names Зброя/Шолом/Щит/Рукавиці/Нагрудник/Черевики/Кільце/Амулет/Прапор. |
  | artifacts / accessories | артефакти / аксесуари | |
  | keep / sell / protect | зберегти / продати / захистити | **Keep = зберегти** (not the outcome rendering *залишити*); *залишок* = "remainder" (final sell) kept distinct. |
  | safeguards | захисти | translated. |
  | (dynamic) overrides | перевизначення | |
  | Chaos Ore | Chaos Ore | kept English (KPI "Chaos'd"/"Glyphed" also English). |
  | Vault | Сховище | canonical (not *Vault*/*У Vault*). |
  | sell file | Sellfile | one word. |
  | rolls / drops | роли / дропи | loanwords (not *рулон*/*проки*). |
  | safeguard mode buttons (Off / Protect / Anticipate / Improve) | Вимкнути / Захистити / Передбачити / Покращення (`safeguardsRuleMode*Short`) | long forms in `safeguardsRuleMode*`; README quotes the short button labels |
  | group (safeguards sharing one required count) | Група (`safeguardsGroup*`) | |

  uk-UA **intentional loanwords:** Sellfile, SPD/ATK/DEF/HP/CR/CDMG/ACC/RES, роли (rolls), дропи (drops), сет (gear set), Chaos Ore, Chaos'd, Glyphed, Flex. **"gear" → спорядження**, **"substat" → підстат** (translated). Catalog strings use DOUBLE quotes (U+2019 apostrophe trap).

- **Reserve "rules"/"Regeln" for HSF rules.** User-facing keep/sell logic is *recipes* (`recipeMany` → "Rezepte"); calling those "rules"/"Regeln" confuses them with the engine's HSF rules. The same applies inside preset prose.
- **Keep terminology notes here, not in the catalogs.** Catalog files must stay structurally identical across locales (same key order, count, indentation, and comment blocks), so do **not** add a glossary/loanword comment to `<lang>.ts`. Record per-language decisions in this doc instead.
- **Catalog structure is identical across all production locales — test-enforced.** Every `<lang>.ts` defines exactly the en-US **key set**, in the same **key order**, with the same **comment lines** (verbatim English), and the same blank-line layout. `tests/unit/catalog-structure-parity.test.ts` locks all of this in `test:unit`:
  - **keys** — no missing keys (which silently fall back to English at runtime via the `{ ...en, ...locale }` spread) and no extra/dead keys (which nothing consumes). Catches a value-side rename accidentally applied to a key identifier (e.g. `main stat`→`Mainstat` turning `gearAnalyticsChartMainStat` into a dead key).
  - **key order** — same sequence as en-US (catches the kind of positional drift that once put `safeguardsToggleLabel` ahead of the `finalSell*` keys).
  - **comments** — every `//` line is byte-for-byte the en-US comment for that position; comment text is **not** localized. Keeps catalogs diffable against en-US.
- The gate logic lives once in `scripts/tooling/catalogAudit.ts`; both the unit test and the `scripts/tooling/sync-catalog-comments.ts` CLI import it, so they never disagree. When the test fails, run **`npm run i18n:sync-comments`** to re-sync comment text (it also reports any key-order/coverage drift), then add/reorder keys to match en-US. When you add a key to en-US, add it to all 9 translated catalogs in the same position.

### Preset Note localization (`presets/*.sfc`)

The bundled preset Notes (e.g. `presets/lategame.sfc`) are localized **inside the `.sfc`**, not via the catalog, because the Note is portable user data that must travel with the file. Two primitives, both resolved before markdown render, both routing their language pick through one SSOT (`pickLocaleFromMap` in `src/lib/noteOverridesParser.ts`, precedence exact code → bare language prefix → English base). See `docs/technical/app-behavior.md` ("Note localization") for the runtime wiring; the **authoring + translation rules** live here:

- **Inline DSL segments `[[xx]]`** — inside any quoted override-DSL string (`q`/`cb`/`rb`/`single` labels, details, slider `unit`/`toggle`/`marks`). Text **before** the first `[[xx]]` is the English base and the identity source; each `[[xx]]` runs to the next `[[` or the string's closing quote.
- **Block prose groups `<!-- lang -->…<!-- lang:de -->…<!-- /lang -->`** — for whole markdown regions (paragraphs, headings, colored/`data-blink` spans). Base (English) first, then one `<!-- lang:xx -->` variant per language; the whole group falls back to its base together.
- **Highlighting convention (keep consistent across the whole Note):**
  - **Exact** recipe/safeguard names (as they appear in the builder) → backtick chips, verbatim, **not** localized.
  - **Group / rule-family** names (conceptual; they span several recipes — e.g. *Any Set recipes*) → *italic*, and localizable. Verify against the recipe data whether a phrase is an exact recipe or a group: groups map to `SellfileVisibility: "Separator"` header rows, exact recipes to `"Active"` rows.
  - **Gear-set names** and other in-game terms → **bold**. Set names stay English even in translated prose (Stoneskin, Savage …), but the surrounding words localize.
- **Translation-pass pitfalls:**
  - **Never let a German edit touch English text.** Operate per-region: only inside `<!-- lang:de -->…<!-- /lang -->` or a precisely-bounded `[[de]]` segment. A naive `[[de]]…`-to-next-`[[` capture **overruns** into the following field's English base or the trailing DSL `{ … }` block — re-check English bases after any scripted replace, and revert leaks.
  - **DSL code is not prose.** `slots=Weapon,Helmet,…`, `keep=early`, `rank=6`, `@tag=…` are engine tokens — leave them English regardless of language.
  - **Mind German gender/agreement when swapping a noun.** `Level` (neuter) → `Stufe` (feminine) breaks `jedem Stufe` → must become `jeder Stufe`. Re-scan article agreement after a term swap.
  - **Verify, don't assume, factual claims.** Read the actual recipe defaults and the override that changes them before describing behavior. Match the tone of the other override-aware paragraphs.
  - **Markup parity:** EN and DE variants must carry the same count of `**bold**`, backtick chips, and `<span>` open/close tags. After edits, assert `(**count) % 2 === 0` and that override markers (`recipe-overrides`, `safeguard-overrides`, `dungeon-simulator`, `if-no-endpoint`) survive resolution unchanged in every language.

## Tooltips and Context Hints

- Tooltips must add information beyond what the user can already see. The only exception is overflow expansion: when text is truncated with an ellipsis, expose the full text via a native OS tooltip (`title`).
- Two components cover every tooltip surface:
  - `MarkdownTooltip` (`src/components/MarkdownTooltip.tsx`) wraps MUI Tooltip with standardized, intent-aware delays (500 ms for informational text, 1,000 ms for click targets), width caps, and a markdown renderer (paragraphs, bullet lists, `**bold**`, `_italic_`, inline code). Every explanatory tooltip uses this path. Pass `markdown="..."` for localized strings or `render={...}` when you need JSX (e.g., `BuilderTooltipContent`, colored chips). The component auto-detects left-click handlers anywhere in its child tree; set `hoverIntent="interactive"|"informational"` only when the handler lives outside the subtree you’re rendering (rare).
- `EllipsisTooltip` (`src/components/EllipsisTooltip.tsx`) is the only allowed overflow helper. Wrap the element that can clip text, add `data-ellipsis-target` to the truncating node, and it dynamically applies a native `title` *only* when the content is visually ellipsized. Do not use it for “help” copy.
- `MarkdownTooltip` now accepts `ellipsisTitle` (and optional `ellipsisSelector`). When you pass a label, it automatically sets a transient native `title` on the ellipsized trigger so the OS tooltip exposes the full text without stacking a second popper. Tag the truncating element with `data-ellipsis-target` (or pass a selector) so the helper knows which node to probe.
- All implementations (builder, rules filter, preview tables, dialog buttons, Gear Inspector grids) import those helpers. Do **not** import `@mui/material/Tooltip` elsewhere; the shared wrapper already exposes `slotProps`, `placement`, etc.
- When converting legacy JSX tooltips, keep the content declarative: reuse `BuilderTooltipContent`, avoid inline HTML entities, and keep translation strings in `en-US.ts`. Multi-line copy should be separated with blank lines or `- bullet` formatting to match the markdown renderer’s expectations.
- Overflow-only surfaces (buttons with shrinking labels, select render-value spans, table cells that switch to icons) should:
  1. Wrap the surface in `<EllipsisTooltip title={label}>`.
  2. Ensure the truncated element has `data-ellipsis-target`.
  3. Avoid additional hover listeners—EllipsisTooltip manages the transient native `title` for you.
- Informational tooltips should:
  1. Wrap the control directly in `<MarkdownTooltip markdown={t('key')}>` or `<MarkdownTooltip render={<BuilderTooltipContent .../>}>`.
  2. Skip explicit `enterDelay`/`leaveDelay`; the wrapper centralizes timing and automatically picks the short vs. long delay.
  3. Prefer `placement="top"`/`"right"` only when alignment truly matters (e.g., builder export mode toggles). Otherwise let the default `top-start` stand.
- Set descriptions (`WithSetTooltip`) and other shared helpers must also compose `MarkdownTooltip` so there is **one** place to adjust behavior (timing, width, disableInteractive). If you need a variant, extend `MarkdownTooltip` rather than wrapping MUI Tooltip again.
- **Exception — content that can exceed the viewport must use a scrollable hover layer, not a tooltip.** Tooltips cannot scroll, so a tall body gets clipped off-screen. The saved dynamic-override sets (`DynamicOverridesPresetRow` in `src/components/NoteDynamicOverridesPresets.tsx`) hover-open a MUI **`Popper`** (must be a `Popper`, not a `Popover`/Modal — a Modal's backdrop swallows the host menu's outside-click-to-dismiss, leaving Escape as the only close) with open/close grace delays so the pointer can travel into it. Its body is a self-identifying header (set name + saved date, bolder divider) over `<ClippedScrollBody overflowY="auto">` wrapping `DynamicOverridesPresetSummaryTable` — a two-column title|answers grid rendered in a single body font (titles non-bold by default; `parseInlineMarkdown(text, { plainCode: true })` keeps bold/italic but renders backtick tokens as plain text, not mono chips). `ClippedScrollBody` (`src/components/ClippedScrollBody.tsx`) has two modes: clip-only (`overflowY="hidden"`, default — a bottom fade + "…" cue, used by `GearDiffPreview`'s clip mode behind the gear-diff toast + history hover tooltip) and scroll (`overflowY="auto"` — an inner scroll box wrapped by a non-scrolling container carrying top+bottom "scroll shadow" fades that toggle on scroll position, plus a thin always-visible scrollbar).
- Context-menu hints use `ContextMenuHintOverlay` + `useContextMenuHint`. Hook every eligible surface into the overlay map (see `docs/technical/app-behavior.md` for IDs) and reuse the localized hint strings (`contextMenuHint`, `contextMenuHintRulesTableHeader`, etc.). Existing surfaces include the builder history menu, rules-table headers/context menus, preview export/header menus, Gear Inspector grid menu + scroll hint, dialog filter sections, and the Gear Inspector intro copy-path button; mirror their patterns when adding new popovers. Do not hand-roll ad-hoc overlays—the shared helper already manages dismissal persistence. Two behaviors to know: **(a) revision-gated, not version-gated** — a hint shows once per surface *revision* (`CONTEXT_HINT_REVISIONS` in `contextMenuHintIds.ts`, marker `r<N>` in localStorage) and does NOT reset on app updates; bump a surface's revision only when its menu gains genuinely new capabilities (legacy `APP_VERSION` markers count as "seen revision 1"). **(b) hover-dwell** — the overlay only renders after the cursor lingers `HINT_DWELL_MS` (1s) on the trigger, so purposeful mouse travel never flashes it.
- Any menu/popover that uses `ContextMenuPaper` must go through `useContextMenuPaperGuard` and pass the returned `contextMenuGuard` into `buildContextMenuPaperSlotProps`. This enforces the outside-click cleanup and prevents stuck backdrops (the “resize to recover” freeze).
- When adding new tooltip copy:
  - Keep it intent-focused (“Explains what toggling does”) rather than narrating mechanics.
  - Mention right-click affordances in tooltip text when relevant, but keep longer walkthroughs in the Help dialog.
  - Update `docs/TECHNICAL.md` and this section whenever the behavior changes so translators and QA have a single reference.
  - Run `npm run lint` after touching tooltips to catch accidental reintroductions of `title=`.

### Tooltip component map

| Surface | Component(s) | Notes |
| --- | --- | --- |
| Builder form labels (action/rank/rarity/faction/level/main/substats/slots/etc.) | `MarkdownTooltip` + `BuilderTooltipContent` | Helper text that lived in inline `<Tooltip>` nodes now routes through the markdown wrapper so bullet lists share the global delay/width. |
| Builder action buttons (add/save, undo/redo, export modes, help) | `MarkdownTooltip` | Buttons that expose multi-line guidance (hidden recipes reminder, undo history, help links) all share the markdown wrapper with capped width. |
| Builder flex/min/threshold chips + lock toggles | `MarkdownTooltip` (`render`) | Contextual icons still render via JSX, but that JSX flows through the markdown wrapper so colored badges share timing. |
| Builder ellipsis-only surfaces (note/save buttons, metaset button, select renderers) | `EllipsisTooltip` | Wrap the button/select and tag the text node with `data-ellipsis-target` so the native `title` appears only when the label overflows. |
| Rules filter chips/toggles | `MarkdownTooltip` for guidance, `EllipsisTooltip` for summaries | Glyph legend helpers return markdown strings (e.g., `≥ 0 = show any`). Icon/button labels use EllipsisTooltip so the tooltip only appears when text overflows. |
| Preview/tester tables | `EllipsisTooltip` for overflow cells, `MarkdownTooltip` everywhere else | Slot/faction/set icons and column headers use MarkdownTooltip. Substat summaries wrap their chips with EllipsisTooltip whenever scroll containers clip the content. |
| Context menus (builder history, rules table rows, recipe chips) | `MarkdownTooltip` | Inline helper text (builder context actions, chip menus, copy buttons) renders through the shared wrapper so keyboard users get consistent poppers. |
| Set descriptions (`WithSetTooltip`) | `MarkdownTooltip` (`render`) | Structured descriptions still emit JSX (piece counts, colored buffs) but they flow through MarkdownTooltip so the timing knob lives in one place. |
| Glyph/legend helpers (`renderGlyphTooltip`) | `MarkdownTooltip` (`markdown`) | Helper returns a markdown string so chips/buttons can simply call `<MarkdownTooltip markdown={renderGlyphTooltip(...)}/>` without bespoke JSX. |
| Native titles | Targeted surfaces only | Native `title` is reserved for overflow expansion. Use `EllipsisTooltip`, or if a surface already owns a MarkdownTooltip popper, pass `ellipsisTitle` so MarkdownTooltip can manage the transient `title` without nesting. |

### Ellipsis inventory

Representative overflow-only surfaces:

- Iconic buttons whose labels can collapse (builder note/save buttons, preview header actions, dialog primary actions).
- Select `renderValue` spans (gear sets, factions, champions, builder set/faction pickers, rules filter chips).
- Table cells that toggle between icons and text (HSF slot/faction columns, metaset menus, builder set menus).
- Recipe/Gear Inspector chips plus the Gear Inspector grid’s matching-recipe badges.

When the same surface needs a rich Markdown tooltip *and* an overflow-expansion title, pass `ellipsisTitle` to `MarkdownTooltip` so it handles the overflow probe and native `title` for you instead of nesting tooltip systems.

### Markdown inventory

Anything that is not overflow-triggered runs through `MarkdownTooltip`. Representative groupings:

- Builder form labels, action buttons, flex/min controls, lock toggles, roll target warnings, history entries, and metaset dialogs.
- Rules filter chips/toggles (sets, chaos ore, glyph filters, roll summary), tester recipe buttons, preview header menus, and filter sections.
- Headers, icons, and buttons inside the HSF preview table and Gear Inspector grid (match rows, champion badges, Safeguards chips, context-menu affordances).
- Dialog controls (Note dialog toolbar, Safeguards tabs, Substat Targets star chips, Gear Inspector action buttons, copy-to-clipboard helpers).
- Export/load/save buttons, load-sellfile helpers, final-sell toggles, context shorthand hints, etc.
- Note dialog markers: HTML/Markdown comments `<!-- recipes:1,0 -->` render Recipe chips; `<!-- recipes-re:”speed” -->` filters recipes by name or tags; `<!-- safeguards:1,2 -->` renders Safeguard summary cards; `<!-- safeguards-re:”ring” -->` filters cards by Safeguard rule name. Markers are 1-based, support `0` for “next after previous marker”, and resolve against the current in-memory recipe/safeguard ordering.

If tooltips need rich formatting (colored badges, inline icons), pass JSX via `render={<BuilderTooltipContent .../>}`. Everything else should use `markdown=` strings so translations stay readable and formatting stays consistent.

### Note Dialog Sizing

- The standard centered Note dialog uses a fixed height (`84vh`) and MUI `lg` (1200px) width so sparse content does not shrink the shell.
- **Zoom compensation**: the MUI Dialog paper is portaled outside `#root`, so it can't inherit the page `zoom`; the theme instead applies `zoom: var(--app-zoom)` to `.MuiDialog-paper`. A raw `84vh`/`lg` length is computed against the unzoomed viewport and *then* multiplied by that zoom, so it would render too small when the app is zoomed down. The standard paper therefore wraps its height and max-width in `appZoomCompensatedLength()` (`lib/sideBySideZoom.ts`): `calc(<len> / var(--app-zoom, 1))`, so `(len / z) × z = len` — the visual size is the intended `84vh`/`lg` at any zoom (no-op when `--app-zoom` is unset). Same idiom the floating panel uses for `maxWidth`.
- **Floating panel edge gap**: the snap-to-side floating panel (`useFloatingPanel`, side-by-side + non-simple) is `position: fixed` **inside** the CSS-zoomed `#root`, so it is positioned against the viewport (fixed ignores `#root`'s padding) and does NOT inherit the app edge gap automatically. It reserves the gap explicitly (`APP_EDGE_GAP_PX`, `lib/constants.ts`, in the panel's own CSS-px space so it scales with the `#root` zoom): the **right** snap sits `innerWidth/zoom − width − APP_EDGE_GAP_PX`, the **bottom** is `APP_EDGE_GAP_PX` (not `0`), `maxWidth` is `calc(100vw / var(--app-zoom,1) − 2·APP_EDGE_GAP_PX)`, and the free-edge resize clamps stop at the gap. The **left** snap inherits the gap for free — it docks to `drawerLeftPx` (the builder column's already-inset left edge), so it sits ~26px in (16px `#root` padding + the column's own offset) rather than a bare 16px, which is intentional: it docks flush to the builder, not to an arbitrary gap line.
- **Simple Mode** sizes the paper differently — see *Simple Mode* below (`NOTE_DIALOG_SIMPLE_PAPER_SX`). The app edge gap does **not** apply in simple mode: the dialog is portaled outside `#root` and uses its own symmetric `SIMPLE_NOTE_VIEWPORT_INSET_PX` (12px) inset via `100vw/100vh − 24px`, and the backdrop covers the `#root` gap behind it, so there is no double-inset or gutter artifact.
- View and edit modes share the same width and height constraints for a consistent toggle experience.

### Simple Mode

Activated when RSL Helper appends `&simple` to the deep-link URL it opens:

```
http://localhost:XXXX/?endpoint=ws://localhost:8080/&simple
```

**Layout**: The header, builder column, and preview panel are hidden (`display: none`). The Note dialog opens automatically and is the sole visible surface. It cannot be dismissed — close button, Escape key, and backdrop click are all disabled.

**Fill-viewport sizing + zoom suppression**: In simple mode the dialog is the only surface, so instead of scaling the page it fills the viewport directly via its own CSS — `NOTE_DIALOG_SIMPLE_PAPER_SX` pins the paper to `calc(100vw/vh − 2×SIMPLE_NOTE_VIEWPORT_INSET_PX)` (12px inset each side), floored at `SIMPLE_NOTE_DIALOG_MIN_WIDTH` (the shared `lg` width, clamped with `min(…, fill width)` so it never overflows tiny windows), with `maxWidth:none` and `margin:0` to override MUI's `lg` cap and default margin. Page zoom is simultaneously **suppressed**: while `isSimpleView && noteOpen`, `useAutoSideBySideZoom` clears the `#root` zoom (and `--app-zoom`) and reports stacked — there are no panels behind the dialog to scale, and keeping zoom off leaves the express content at native size. App drives the suppression through `sideBySideZoomSuppressedRef` + the hook's `reevaluate()`. Because `--app-zoom` is cleared here, the simple-mode `vw/vh` lengths resolve 1:1 and need no `appZoomCompensatedLength` wrapping (unlike the standard dialog).

**Sell-rules toggle**: A Beginner / Midgame+ toggle bar ("Gear Sell Rules") appears between the dialog title and the note content. Switching immediately loads the full corresponding preset SFC (recipes + note). Defaults to Midgame+. The selected button is derived from the LIVE document's preset match (`sfcPresetMatch.matchedPreset`, which ignores dynamic-override answers and DSL blocks — answering questions never makes a preset "custom"); a click holds the pressed button until the async load commits a match. A third button, **Custom**, restores the user's own (non-preset) document and exists only when such a document exists (`customAvailable` in `App.tsx`):
- **Non-empty live document that matches no preset** → the latch effect snapshots it (same writer as Save .sfc) and offers Custom for the rest of the session, even after the user tries a preset. Cleared on Go Expert.
- **Empty live document** → the latch NEVER fires. Emptiness cannot tell "the startup / Go Simple load is still on its way" from "the user's saved setup is empty", and only the persisted document can: the startup seed (`resolveSimpleStartupSource` on the entry captured before any write — a marker-less entry is the user's own body) and `handleGoSimple` (an existing saved entry while the live doc is empty) decide it. Guessing from "any autosave entry exists" showed Custom after every reload of a plain preset session and even on a first launch (the app's own first empty write created the entry). Regression cover: `tests/playwright/simple-mode-custom-tab.spec.ts`.
- Clicking Custom with no in-session snapshot (a custom setup seeded at startup whose latch never fired, e.g. an empty one) restores the persisted body through the startup path rather than doing nothing.
- **The Custom snapshot is durable** (`SIMPLE_CUSTOM_SNAPSHOT_KEY`, account-scoped: the .sfc text plus its unsaved stamp). The toggle reads as three rule sets — two bundled and the user's own — and the bundled two survive anything; the custom one used to live only in memory once the user tried a preset (autosave then holds the preset), so a reload silently discarded it, bypassing the Go Expert confirmation that guards exactly that loss. The latch writes it whenever it takes a snapshot; boot (`persistedCustomSnapshot`, read before any write) and `handleGoSimple` re-offer Custom from it when the live document is a preset, dot included; the Go Expert confirmation's *proceed* (`onDiscardSimpleCustom` → `handleDiscardSimpleCustom`) is the ONE place it is forgotten. Selecting Custom then loads it with its recorded provenance, so an unsaved setup comes back unsaved.
- **Custom wears the dirty dot while the custom setup is unsaved** (`DirtyBadge` around the toggle button, fed by `customSnapshotDirtySince`). The simple view hides the header and with it the Save button's dot, so this is its only unsaved-work warning. The stamp is recorded WITH the snapshot, not read from the live document: once the user tries a preset the live document is that (clean) preset, but the custom setup then exists only in the in-session snapshot and is lost on Go Expert or a reload unless it was saved. Go Expert asks first in exactly that state (`goExpertNeedsConfirm` = Custom available AND a preset selected); a reload does not, which is what the dot is for.
- **The express custom restore lands with the provenance the entry recorded** (`loadProvenanceFromAutosave` → the load context's `provenance`, consumed by `applySfcLoadResult`): an entry written while dirty comes back dirty and resumes its age, an anchored one comes back clean. It used to be an unconditional anchored load, so every reload presented an unsaved custom setup as a freshly opened file and the dot could never survive a reload. Regression cover for the warning and the dot: `tests/playwright/simple-mode-custom-tab.spec.ts`.

**Action bar** (bottom of dialog):
- Left — *Reset to Defaults* (red): resets all dynamic override answers.
- Centre — *RSL Helper connection indicator* + *Auto-Push* toggle.
- Right — *Go Expert*: switches to the full UI.

**Auto-Push** defaults to on; the button pulses briefly after each successful silent push.

**Autosave**: The SFC restore prompt is dismissed silently on startup and the startup source is resolved from the autosave entry instead (`resolveSimpleStartupSource`): a `PresetOrigin` marker reloads the CURRENT bundled preset with the saved override answers re-applied on top; a marker-less entry restores the user's own body. See *Application Behavior* for the boot sequencing. Previously loaded Gear Inspector items are silently restored so the Gear Inspector stays populated.

**Go Expert / Simple Mode toggle**:
- *Go Expert* reveals the full UI and persists the choice in `localStorage` (`sellfileCreator.simple.expertMode.v1`).
- On the next `?simple` launch, if Expert was the last state, the full UI loads directly and the Note button pulses twice to signal where the note lives.
- *Simple Mode* in the dialog title bar returns to the streamlined view and clears the persisted preference.

**Go-expert demo slide** (`lib/goExpertDemo.ts` — one keyframe/timing SSOT): entering expert turns the note into the floating panel, which overlays the just-revealed builder column. Finding from real use: users did not realise the panel was movable/closable and took the builders for missing. So the first time per session a user clicks *Go Expert* (from the button or the discard-confirm *Proceed*), the freshly-mounted floating panel plays a one-time teaching gesture: it resets to its **default width** (the splitter's builder-column width) and **persists that default** — a dedicated mount effect calls `savePanelSnap` with the default width, overwriting the stored snap so the panel *stays* default from now on rather than snapping back to the user's old saved width on the next open (going expert is a deliberate fresh start, so the previous session's width is intentionally dropped; the panel's snap *side* is preserved). Then, once the mount slide-in has settled (`MOUNT_SLIDE_SETTLE_MS`, just past the 300ms slide window), it sweeps once to the opposite viewport edge and back, dragging a very dim Knight-Rider streak (`TINT.primaryDemoTrail`, `primary-main` @ `ALPHA.a15`) off its trailing edge. Mechanics that keep it non-destructive:
  - **Frequency** is *once per session*: two module-level flags (`goExpertDemoArmed`, `goExpertDemoPlayedThisSession`) survive the simple-Dialog→floating-Panel remount and reset on reload — not once-ever (no persisted flag) and not every toggle. `armed` is set at the click, consumed by the panel mount; `played` latches after it runs.
  - The slide **animation** is WAAPI on `transform`/`box-shadow` **only** — never `left`/`width`, which are the panel's persisted/draggable position (snap side + width in `localStorage`). `transform` is orthogonal, so the *slide* leaves the real position untouched; the one deliberate write to persisted width is the default-width reset above (a separate mount effect), not the animation.
  - It sets `panel.dataset['gesture'] = 'demo'` for the duration so the snap-position layout effect (which early-returns on that flag, same guard the drag/resize handlers use) can't overwrite the transform mid-play; the guard is released when the animation's `finished` settles (or on unmount cancel).
  - Travel distance is computed to land flush against the opposite edge in the panel's own CSS-px space (visual gap ÷ `--app-zoom`, the same convention as the snap effect).

**Attention pulses** (shared `playAttentionPulse` in `lib/attentionPulse.ts` — one keyframe/timing SSOT for every "look here" blink):
- The in-dialog *Simple Mode* toggle (`data-attention-id="note.goSimple"`) pulses for ~3s whenever it newly becomes visible — i.e. on the false→true edge of *simple+expert AND dialog open*. This covers both switching simple → expert from inside the dialog and (re)opening the dialog while already in expert mode. The pulse waits out the Fade-in first.
- In simple+expert mode, closing the dialog pulses the header's Note toggle (`data-tour-id="note.toggle"`) for ~3s — it is the way back into the dialog.
- Both fire only on the relevant transition edge (tracked via prev-value refs), not on every render.

**Transitions**: Switching between Simple and Expert mode is animated — the SFC toggle collapses (height), the action bar crossfades with a directional translateY, and the *Simple Mode* / *Go Expert* buttons fade in sync. Closing the dialog in Expert mode animates it shrinking toward the Note button. The `SIMPLE_MODE_TRANSITION_MS` constant (in `lib/constants.ts`) is the single source for these fade/collapse timings and for the delay before the post-switch attention pulse.

### Verification checklist

- `rg '<Tooltip' src` should match only the definition in `MarkdownTooltip.tsx`.
- Native title mutations should be centralized: `rg \"setAttribute\\('title'\" src` should match only `MarkdownTooltip.tsx` and `EllipsisTooltip.tsx`.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` must pass after tooltip changes so regressions are caught before release.

## Metaset Management

- Delete dialog behaviors:
  - Unused and empty: deletes immediately without confirmation.
  - Unused with sets: shows a simple confirmation (no replace options).
  - Used in recipes: shows a single-choice confirmation with radio options and a single confirm button (fixed width):
    - Delete and remove references (red).
    - Replace with explicit sets (warning): merges the metaset’s sets into `artifactSets` and removes the metaset reference.
    - Replace with another metaset (warning): selector sits to the right of its radio; enabled only when selected.
  - Default selection mirrors Delete: if any referenced metaset contains sets, defaults to “Replace with explicit sets”, otherwise to “Delete and remove references”.
  - Builder integration: when deleting or replacing a metaset, the live builder selection is updated using the same mapping as recipes.
  - Sets Select fallback: when a selection can’t be resolved (e.g., deleted ID), it renders “Any” instead of an empty label.
  - Clear buttons: “Clear” in Metasets editor is disabled for empty metasets; “Clear” in the builder’s Sets row is disabled when selection is Empty/Any.
  - Icon picker: A compact dropdown to the right of the Sets selector assigns curated emoji/text glyph icons (plus “None”/“Empty”). The grid renders six columns for quick scanning, defaults to “None” for built-ins, picks a random emoji for generated names, and persists via SFC `iconId` (missing IDs normalize to `none`).

- Reset metasets to defaults:
  - Presents the same three choices as Delete (remove references, explicit sets, or replace with metaset), applied across all recipes and the builder.
  - Defaults like Delete (prefer “Replace with explicit sets” when any used metaset has sets).
  - After applying the chosen mapping, replaces the metaset list with `defaultMetasets()`.

- Name generation for new metasets:
  - Source: `src/lib/namegen.ts`. Generates short, readable names from curated descriptor/place/group lists; dedupes against existing names.
  - Runtime blacklist: filters out tokens used elsewhere in the UI (`artifactSetNames`, `factionNames`, `artifactTypeNames`) to avoid collisions.
  - Playful mode (~20%): occasionally produces light, kid-friendly combinations (e.g., “Snack Squad”) while keeping content PG.
  - Implementation: dependency-free LCG for randomness; compact lists; no user toggle.
  - Visual feedback: A playful name triggers a brief golden glow + sparkles on the TextField. The effect is clipped to the input and respects the floating label.
- Scrollbar stability: The metasets list uses `scrollbar-gutter: stable both-edges` to prevent dialog width shifts when the vertical scrollbar appears, and `reserveScrollbarGutterSpace()` injects Firefox-only padding so Chromium browsers keep their native gutter while Firefox still looks aligned.
  - Deletion performance: Deleting an unused metaset skips remapping `customRecipes` and updates only the builder if needed.
  - IDs and IO:
    - Built-ins: stable slugs (e.g., `meta_nuker`).
    - New metasets: base-36 IDs via `makeMetasetId()` (e.g., `m_ab12cd3`).
    - SFC recipes reference metasets by ID via `artifactMetaSetIds`; the `Metasets` section stays readable with names + `setNames`.
- Tooltip copy style: avoid HTML entities. Use backticks for titles and string expressions for labels containing quotes to satisfy ESLint.

## Preview Table Selection

- Row click: Selecting a rule row highlights the related recipe and selects the corresponding recipe chip, but never auto-scrolls the table.
- Chip click: Selecting a recipe chip triggers an explicit scroll request and jumps the table to the first matching rule row. Single-line mode uses smooth scrolling when nearby and falls back to an instant jump for long distances; wrap mode always jumps.
- `selectRule` commands also trigger preview scrolling (to the requested rule row) while still syncing the related recipe selection.
- Auto-scroll is gated to explicit selection intents (chip clicks or `selectRule`) so background rule updates never re-scroll the table.
- Mode switch retention: Sellfile Preview and Gear Inspector now cache independent scroll offsets; toggling between modes restores the prior viewport and relies on native scroll clamping when filtered/removed rows shrink the content height.

### Obsolete Rules Handling

- Obsolete detection groups rules by coarse selectors (action, rank/rarity/level, sets/types, main stat, faction) and normalized substats. A rule is “obsolete” if another in the same group dominates it (componentwise looser-or-equal thresholds, with tie-breaking to earlier indices for exact duplicates).
- Preview pruning only removes an obsolete rule when both rules originate from the same custom recipe (RecipeID). Duplicate recipes, overlaps versus base recipes, and cross-recipe overlaps remain visible for auditability.

## UI Notes (developer-facing)

- Builder layout: Row 1 Action; Row 2 Rank/Rarity/Faction/Level window; Row 3 Mainstat/Substats; Row 4 Min selected substats controls; Row 5 Slots/Sets.
  - Tags live on Row 1, directly beside Export Mode, to emphasize that recipe overrides tags can override export mode when answers match.
  - When tags are present (single or multi-edit), a compact clear (x) button appears next to the Tags button to reset the tag list quickly.
  - The Tags button has a right-click context menu with a `Show Tags` toggle (persisted). When off, the inline tag chips next to the button stay hidden.
  - Inline tag chips render via the shared `BuilderTagChipStrip` (`BuilderTagChips.tsx`), which is width-aware: it measures how many chips fit the remaining row width across at most `maxRows` chip rows (recipe builder 1, safeguard builder 2) and collapses the rest into a `+N` badge whose hover title lists the hidden tags. Chips are never clipped by the panel border; callers give the strip a bounded width (`flex: 1` + `minWidth: 0`).
  - Faction stays near Rarity. Only accessories care about faction; other gear ignores `Faction`.
- Mainstat is multi-select with two rows of toggle buttons (HP/HP%/ATK/ATK%/DEF/DEF% and SPD/RES/ACC/CR%/CDMG%). Empty selection maps to Any; SFC export converts selections to readable labels.
- Substats reuse the two-row toggle grid. Empty selection represents Any. Toggle buttons manage selection while a separate lock badge handles fixed state (supports `aria-pressed="mixed"`).
  - Lock badge only appears when the stat is selected, locked, or mixed.
  - Context menu (right-click/Menu key) exposes lock/unlock, min rolls, and roll upper limit controls. Min/max grids reuse compact toggle layouts with mixed indicators.
  - Roll badge interaction remains consistent across the builder, multi-edit, and preview: left increases, right decreases, states cycle between numeric mins, numeric caps, and wildcard.
- Required substats shows a warning when `minCount > substats.length`. A fixed spacer holds the layout steady while toggling states.
- `autoMinCount` toggle mirrors manual counts (`Auto`, 1–4). Auto syncs `minCount` to `min(4, substatsV.length)`; clearing substats resets to 0.
- Wildcard flex (star icon) only appears when Required uses a numeric count and at least one optional wildcard is selected. When enabled, the count becomes a floor and wildcards permute across totals ≥ `minCount` while mandatory stats remain fixed.
- Flex eligibility is computed once (shared across normalization and builder). It unlocks when manual `minCount` is active, there are more selectable stats than the requirement, at least one optional wildcard lacks numeric bounds, and either an optional stat has a per-stat minimum or the aggregate minimum exceeds the requirement. Otherwise `autoSubstatFlex` is cleared during normalization/export.
- Flex permutations wait until at least two milestone rolls exist so early milestones stay minimal.
- Existing recipes keep their saved flex state; the scratch builder alone auto-enables flex when a fresh combo first becomes eligible.
- Builder permutations stay minimal even with flex: combos that never roll optional stats are skipped so the smaller locked/core combo remains the keeper. Optional stats demanding rolls still generate their own rows.
- Canonicalization happens once through `canonicalizeRuleSelectors()` so pruning and dedupe logic never drift.
- `Min Required Rolls` now has two distinct concepts:
  - **Global Min Required Rolls (GMRR):** the numeric buttons (0‑5). Selecting one sets the aggregate floor and turns Auto off. Only one number is ever highlighted and it never carries a lock icon.
  - **Locked Min Required Rolls (LMRR):** the lock icon perched over the numeric buttons. Only one lock can exist; locking a number greater than or equal to the current GMRR clears the GMRR (while keeping Auto off) so “locked” and “total” never contradict each other. Unlocking restores the button highlight when GMRR had been cleared purely because of the lock.
  - **Auto GMRR:** the Auto button. Clicking it always clears both GMRR and LMR. Clicking an already-selected numeric button also returns to Auto (and clears any lock) so the control never gets stuck in a quasi-manual state.
- Additional rules enforced in the UI and normalization:
  - Locking a new value first replaces any existing lock, then clears the numeric selection only if the lock would otherwise exceed or match it.
  - Selecting a numeric value lower than the current lock clears the lock (the button stays highlighted).
  - Clicking the active lock again clears it and re-highlights that number as the new GMRR when none was selected.
  - GMRR = 0 is treated as a real manual value (the `0` button lights up) but the lock icon is hidden for that button. A lock never makes the `0` button appear highlighted.
  - Auto + lock cannot coexist: triggering Auto always resets both knobs.
  - SFC imports/clipboard pastes run through the same invariants so recipes never load with “lock ≥ total” or multiple locks.
  - Distributions still fail Fast/Strict filtering when the aggregate cannot be reached by +16; Potential/Early keeps partial rows only when the aggregate is still attainable.
- Defaults: `keep=true`, `rankCode=0`, `rarityCode=0`, `mainStatsV=[]`, `minLevel=0`, `maxLevel=16`, `minCount=0`, `autoMinCount=true`, `substatsV=[]`, `artifactTypes=[]`, `artifactSets=[]`.
- Reset defaults restore the above and clear type/set/faction selections.
- Recipe chips occupy a scrollable container (≈6 chips). Adding a new recipe selects it and scrolls it into view without moving the page.
- Recipe chips render as a single column in the builder list: each chip spans the full row so recipes never pack side-by-side.
- Chips support drag-and-drop reordering: the dragged chips are dimmed but keep their spot (layout stays frozen), a blue guide line shows the drop slot between rows, auto-scroll kicks in near the container edges, tooltips/context hints are suppressed during the drag, and the actual reorder only happens on drop so previews do not churn mid-drag. Press `Esc` to cancel an in-flight drag without changing the list. Hold `Ctrl` (Cmd on macOS) while dragging to duplicate the selected chips into the highlighted slot instead of moving them; the new copies become the active selection after drop.
- Preview auto-scroll stays confined to the table container:
  - Selecting a recipe chip jumps the preview table to the first rule row for that recipe (no smooth scrolling).

### Persistence & Autosave

- Autosave payload key: `sellfileCreator.autosave.sfc.v1`; value `[crc32, payload]`, where `payload = buildSfcPayload(...)`.
  - CRC detects corruption; invalid entries are cleared automatically.
  - On load, a valid entry prompts Restore vs Dismiss. Dismiss keeps the previous snapshot until the user edits state.
- Substat color preferences: `sellfileCreator.substatColors.v6` (variant-keyed `{ fg, bg }`, default alpha 25%).
- Slot glyph tints: `sellfileCreator.slotTints.v1` (`{ artifact, accessory }` hex; artifact = light yellow, accessory = light blue). Gated by `slotColorScope` and contrast-adapted to the runtime scheme.
- Rarity palette: `sellfileCreator.rarityColors.v1` (rarity 1–6 hex). One palette feeds raw accents (borders/charts, verbatim) and contrast-adapted rarity-label text (gated by `rarityColorScope`).
- Table settings:
  - Column layout key `rulesTableCols.v6` (`RULES_TABLE_COLUMNS_STORAGE_KEY`; array of column descriptors, persisted widths/order/visibility with optional `mode`). A stored width of `RULES_TABLE_COL_WIDTH_AUTO` (`-1`) is the auto-width sentinel — see the auto-width note below.
  - Wrap toggle key `rulesTableWrapRows.v1` (boolean).
  - Icon toggles: `RULES_TABLE_SHOW_SLOT_ICONS_KEY`, `RULES_TABLE_SHOW_SET_ICONS_KEY`, `RULES_TABLE_SHOW_FACTION_ICONS_KEY` control preview icon preferences.
- LocalStorage caveat: running via `file://` may yield non-persistent storage. Prefer dev/preview servers.

### Preview Table (performance & UX)

- Sticky header keeps the table caption visible while the container scrolls. Layout uses `tableLayout: fixed` to stabilize widths.
- Virtualization:
  - Implementation: `@tanstack/react-virtual` (same dependency as the Gear Inspector grid), while still rendering a real `<Table>` by inserting top/bottom spacer rows.
  - Single-line mode: fixed-height rows (~30px); avoids per-row measurement during scroll.
  - Wrap mode: variable-height rows measured via the virtualizer; row heights re-measure when layout changes so scroll and range hints stay accurate.
  - Group separators: the table virtualizes a render-only **display model** (`displayItems`) that interleaves the rule rows with one unselectable separator row per group (each distinct recipe, safeguard ordinal, the Final Sell block, and the imported-base block). `rules[]`, the worker, merge, span maps, and all selection math stay in *rule-index* space; `displayIndexForRule` / `ruleIndexForDisplay` translate at the few scroll/range-report call sites. Separators carry `data-row-type="separator"` and no `data-row-index`/`data-recipe-idx`/`data-safeguard-ordinal`, so they never participate in selection, hover, the fixed-row-height CSS, or the scroll-range overlay (which keeps counting data rows). Each separator shows a leading glyph (tag = recipe, star = safeguard, sell-tag = Final Sell, inventory box = imported base), the 1-based recipe index / safeguard ordinal, the group name (recipe fg colour, contrast-adapted), and a trailing localized rule count (`previewGroupSeparator*` catalog keys). The name-fallback is source-specific: the `previewGroupSeparatorBaseLabel` ("Imported Base Rules") text applies **only** to the genuine imported-base block (a row with no recipe identity, `resolveDisplayRecipeIdx === null`); an *unnamed recipe* keeps an **empty** label and renders just its index badge ("«n».") — mirroring how a nameless recipe chip shows no name. (Using the base label for an unnamed recipe was a bug: it mislabeled real recipes as "Imported Base Rules", most visibly in the tutorial where the demo recipes carry no name until later steps.) `RULES_TABLE_SEPARATOR_ROW_HEIGHT_PX` sets their slimmer estimate.
- Header menu (context): reset columns, toggle wrap mode, toggle icon modes, adjust stat-border coloring, and manage per-column visibility (the merged `Special` column supports `auto|show|hide`). Drag headers to reorder; resize via drag handles (min width 40px); widths persist.
- **`Special` column (merged faction + chaos-ore gates).** Both gates are sparse — a rule rarely sets either, and when it does the cell holds a single icon or glyph — so two columns of header and padding bought nothing. They are one `Special` column (`colSpecial`; short in every locale: Spezial / Especial / Spécial / Speciale / Особое / Özel / Особливе). It auto-shows on the **union** of the old predicates (`anyWithFaction || anyWithOre`), so a sellfile using only one gate still reveals it. Faction renders as its icon (or its name when faction icons are off) and rework as the builder's own glyph, each carrying its own tooltip so the two stay individually identifiable while sharing a cell. Because a rule can narrow *both* at once, the auto-width measurer records a combined icon+text footprint (`extendWithIconTextPair`) rather than the wider of the two terms. Dropping two keys and adding one changed the default column set, so the storage key was bumped `v5` → `v6` per the convention above.
- **No inline scrollbar gutter on the preview scroller.** Unlike the app's vertical-only scrollers, `TableContainer` here must NOT use `reserveScrollbarGutterSpace()`. A reserved gutter is inline padding *inside* the scroll port, so the table (`width: 100%` of the padded content box) stays narrower than the port while the horizontal scroll range is measured against the full width — the rightmost column then cannot be scrolled fully into view (≈10px clipped in Chromium, ≈32px in Firefox where the gutter is faked with real padding). Guarded by `tests/playwright/preview-hscroll-reach.spec.ts`.
- **Auto width (`width: -1`)**: a column whose stored width is `RULES_TABLE_COL_WIDTH_AUTO` sizes itself to its widest content across **every** rule, not just the virtualized window. **Double-clicking a column's resize handle** sets this. Mechanics (`components/rulesTableAutoWidth.ts`):
  - The preview renders every column except `SubstatsSummary` in `FONT_FAMILY_MONO`, so a string's width is `length × advance` — no per-row DOM measurement, which is what makes a 100k-rule table affordable. `monospaceAdvancePx()` measures the advance once via canvas and **throws in DEV** if the face is not actually monospace, so switching the preview to a proportional font fails loudly instead of silently clipping columns.
  - **Headers are exempt.** The heading row deliberately keeps the proportional UI font (only the body is monospace), so a header's width is *not* a character count. `measureHeaderPx()` measures the label against a live `th`'s computed font — read off the DOM rather than hardcoded, since the UI font is themeable — and `extendWithPx` folds it in as pixels beside the character-count terms.
  - Costly columns (`SubstatsSummary`, `ArtifactSetNames`) never format per row. Their rendered length is monotonic in a cheap count (substat entries / set ids), so the walk compares integers and formats only the rows tied at the top count (`RULES_TABLE_AUTO_WIDTH_TIE_SAMPLES`).
  - Icon columns size by max icon count × the same step the renderer packs with; `Idx`/`RecipeIdx` size from `rules.length` in constant time.
  - The pass runs in `requestIdleCallback` (deadline `RULES_TABLE_AUTO_WIDTH_IDLE_TIMEOUT_MS`) keyed on the rules identity, so first paint uses the previous/default width and then snaps once. Results are clamped to `RULES_TABLE_AUTO_WIDTH_MIN_PX`/`MAX_PX`. Only `storedColConfigs` sees the sentinel; `cols` is the resolved-to-pixels array everything else uses.
  - The table carries `minWidth: totalVisibleWidth` whenever `needHScroll`. Without it, `width: 100%` under `table-layout: fixed` pins the table to the port and demotes the per-column widths to proportions: columns get squeezed, header and body cells disagree on the boundaries, and the table reports no overflow to scroll. This matters most for auto widths, which can push the total well past the port.
- Column labels now separate compact headers from menu labels: the table shows `#` and `Recipe`, while the header menu lists those same toggles as `HSF Row` and `Recipe Index`. A `Name` column (default hidden, ordered between `Recipe` and `Keep`) exposes recipe names and safeguard rule names.
- Hovering a numeric `Recipe` cell now shows the recipe name (when present); safeguard star rows keep showing the safeguard rule label tooltip.
- Row interactions:
  - Hover highlights only while pointer stays inside the preview.
  - Clicking a row selects the recipe but suppresses auto-scroll (prevents loops).
  - Safeguard rows suppress the "right-click for actions" hint because they intentionally expose no row context menu actions.
  - Clicking a safeguard star now branches by data: concrete safeguard matches switch to `Gear Inspector`, while anticipate-only placeholders open `Tools → Safeguards`, select the matching rule, and expand its card.

### Gear Inspector Grid Virtualization

- `src/components/GearInspectorItemsGrid.tsx` now feeds TanStack a *flattened* list of headers, spacers, and card rows instead of mounting whole accordions. Each flattened item carries its own deterministic height so the virtualizer never needs to sample DOM nodes.
- Group expansion simply rebuilds the flattened list; the TanStack instance keeps scroll position stable by reusing keys (`header:<key>`, `row:<key>:<index>`, etc.).
- Nested faction → set trees no longer mount en masse: child accordions emit spacer entries plus their own header/cell rows, and anything outside the viewport collapses down to a single placeholder block.
- Terminology: we call a top-level accessory node a *faction header*, any child set node (artifact or accessory) a *set header*, and when a faction header has no children it behaves like a leaf (set) header. All three flow through the same `groupHeader` flattened item so the DOM stays consistent.
- Card rows still hydrate lazily. Skeletons appear whenever a flattened row is rendered before its reveal task finishes, but scrolling back up no longer forces an entire faction/set subtree to remount; only the specific flattened rows in view re-enter the DOM.
- Scroll-hint sampling keeps using `[data-gear-inspector-grid-card="true"]` so the existing flyout logic works unchanged. Because virtual rows now mirror the actual viewport, the hint updates immediately even when the user drags the scrollbar thumb.
- **Sticky group-header overlay**: ancestor headers pin to the top while their cards scroll, rendered as clones in a single `aria-hidden` overlay sibling (real nodes are hidden via `visibility: hidden`). The model is unified — one `stickyStack` memo computes each pinned header's on-screen `pinnedY`:
  - *Pin*: a header at depth `d` rests at `Y = d × headerHeight`. It becomes sticky the instant its natural top would rise above that slot, i.e. the moment it would otherwise scroll off the top **or** slip behind a shallower sticky header. So while any card of a group is visible, that group's header and every ancestor stay on screen, stacked in nesting order.
  - *Exit (sequential tuck)*: each header is pushed only by its *displacer* — the next header at depth ≤ its own (`headerDisplacerOffsetByKey`): a sibling/uncle subgroup, or the next root group. As the displacer approaches, the header slides up. The parent is painted **on top** (`zIndex` descends with depth), so an ending subgroup tucks *under* its parent and disappears; the parent lingers as the stable anchor until the next top-level group pushes it off. No flicker, child never crosses over parent.
  - *Width alignment*: the overlay is a sibling spanning the scroll container's full border box, but the container reserves the scrollbar gutter internally (`scrollbar-gutter`). The overlay is sized to the container's live `clientWidth`, measured by `attachContainer` — a **callback ref** that re-measures (and re-attaches its ResizeObserver) on every container (re)mount. It must be a callback ref, not a mount-once effect, so it catches late container remounts on app start (otherwise the overlay stays at its fallback full width and the pinned first group header overdraws the scrollbar until the first scroll); `handleScroll` still re-captures the width as a safety net. Each clone insets its right edge by `containerPaddingEndPx` (`right: Npx`, **not** `width: 100%`, which would ignore the overlay's own padding). This keeps pinned headers in the exact horizontal band of the real headers and clear of the gutter. Covered by `tests/playwright/gear-inspector-sticky-headers.spec.ts`.
- When adjusting Gear Inspector grid behavior:
  - Update the flattened builder (`buildFlattenedGridItems`) so the virtualizer stays authoritative.
  - Keep the chunked row helper (`chunkGroupRows`) in sync with the card grid layout; card height math still depends on the column count and match-row toggles.
  - Remember to update this section plus the inline comments in `GearInspectorItemsGrid.tsx` whenever you tweak virtualization heuristics, skeleton batching (`useGearInspectorGridCardContentReady`), or the scroll-hint sampling strategy.
  - Selecting a chip auto-scrolls to its first rule row (smooth in single-line mode; jump in wrap mode).
- Row context menu matches chip actions (Duplicate, Move, Copy, Paste after, Delete). Base rows show Clear instead of Delete. Safeguard rows do not show a row context menu.
- Cells:
  - Index column colors Keep/Sell status; disabled rules render dimmed text.
  - Indices stay aligned with merged order; filters never renumber.
- Implementation notes:
  - Component: `src/components/HsfRulesTable.tsx`.
  - `EllipsisTooltip` only renders when text overflows.
  - Derived labels (slots, sets, stat summaries) cache in WeakMaps per rule to avoid recomputation during virtualization.
  - Hover propagation syncs builder highlights via throttled `requestAnimationFrame` coordination.
- Runtime-only metadata (e.g., `__lineIdx`) never enters exported HSF files.

## Safeguard Builder Mode

Safeguards are edited in a dedicated builder mode accessed via the builder-column mode toggle (Recipe / Safeguard). This is **not** a tab inside the Tools dialog; it lives entirely in the builder column alongside `RecipeBuilderPanel`.

### `SafeguardBuilderPanel` (inline rule editor)

- Layout mirrors `RecipeBuilderPanel` — a 4-row CSS grid with identical column widths and control heights:
  - **Row 1**: Mode toggle (`KeepOverrideScopeChip` — per-slot / per-set / per-main-stat / total) + Required count spinner.
  - **Row 2**: Rank / Rarity / Faction selects (nested 3-column sub-grid) + the compact ignore-toggle group (`ignorePreviousSafeguards`, `ignoreEquippedInCollection`, `ignoreEquippedInVault`): a small `Ignore:` caption (`safeguardsIgnoreGroupLabel`) above one row of three glyph-only chips (`»` / `♛` / `⌂` — the same glyphs the rule-chip mode badge uses); each chip's tooltip carries the full label + hint (shared renderer `renderIgnoreGlyphChip`).
  - **Row 3**: Main-stat toggle grid + per-main-stat chip | Substat toggle grid + match chips (`≥1`–`≥4` min-count / `Per Substat`) + sort weight controls (`GearInspectorSortWeightControls`).
  - **Row 4**: Slot icon grid + per-slot chip | Sets selector + per-set chip.
- **Collapsible sections**: three sections are collapsible independently via `useBuilderSafeguardCollapsedPreference` (shared preference key, same sections as `RecipeBuilderPanel`).
- **Undo / Redo**: full history with context menu, mirrors `RecipeBuilderPanel` via `useBuilderHistoryMenu`.
- **Action buttons**: Insert, Apply, rules chip, then Scaffold + Reset right-aligned — mirrors the recipe builder's row. Auto-apply and auto-reset preferences are shared with the recipe builder (mutually exclusive toggles).
- **Rules chip** (`data-testid="safeguard-rule-count-chip"`): shows the emitted HSF rule count for the selected safeguard (keep rows + anticipate placeholders) or the multiselect total. The value is computed in `App.tsx` (`safeguardRuleCounts` from `mergedRules` rows with `__source === RULE_SOURCE_SAFEGUARDS`, grouped by `__safeguardRuleOrdinal`) and reflects the applied state — unsaved draft edits count only after Apply/Insert.
- **Scaffold from recipe**: a popover lists existing recipes; selecting one pre-fills the safeguard combination from that recipe's slot/set/faction/mainstat selectors, giving a quick starting point.
- **Metasets**: the Sets picker uses the same filtered set pool as `RecipeBuilderPanel` via `useKeepOverrideCombinationTools`; the Manage Metasets entry point is forwarded from `App.tsx`.
- **Auto-enable**: the first inserted safeguard rule automatically enables the Safeguards feature.
- **Improvement chance threshold** (`improvementChanceThreshold: SafeguardImprovementChanceLevelThresholds | null`): optional per-upgrade-stage quality gate. When set, the detection pass only protects pieces whose precomputed improvement chance meets or exceeds the stage-specific threshold. The threshold type carries four fields — `atLevel0`, `atLevel4`, `atLevel8`, `atLevel12` — each targeting items currently at those upgrade breakpoints. Fields `atLevel4/8/12` may be `null` to inherit the resolved value of the previous stage (cascade-from-left semantics); `atLevel0` is always set when the feature is enabled. Legacy SFC files that stored a bare number are transparently upgraded to the object form by `normalizeLegacyImprovementChanceThreshold` in `sfcIO.ts` at import time. `resolveImprovementChanceThresholds` then converts the object to a concrete `[f64; 4]` array before the WASM call.
  - **Presets**: four named presets are defined in `IMPROVEMENT_CHANCE_PRESETS` (`safeguards.ts`): *Lenient* (≥25% at all stages), *Harsh* (≥65%), *Graduated* (25 / 35 / 50 / 65), and *Soft* (3 / 12.5 / 25 / 50 — passes almost anything early, tightens at higher upgrades).
  - **Popover UI**: rendered as a `ContextMenuPaper`-backed popover (proper close button). Layout: preset chips row (Lenient / Standard / Graduated / Soft / Last used) above a 4-row input grid where the "Improvement chance" label sits to the left and the four level inputs sit to the right. Empty inputs show the inherited resolved value as a grey placeholder; `atLevel0` is never empty. Anchor position is frozen at click time via `getBoundingClientRect()` so the popover does not drift when the chip label resizes as values change.
  - **"Last used"** chip: always visible and enabled. On popover close the current thresholds are persisted to `IMPROVEMENT_CHANCE_LAST_USED_KEY` in localStorage. On next open the chip restores that value; if localStorage is empty it defaults to `SAFEGUARD_IMPROVEMENT_CHANCE_DEFAULT_THRESHOLD` (25%).
  - **Chip label**: shows `≥N%` when all four resolved thresholds are equal; shows the preset name when the thresholds exactly match a preset; shows `N–M%` (min–max) for any other mixed configuration.
  - **Improvement chance computation**: a dedicated pre-pass (`buildSafeguardImprovementChanceByArtifactId` in `safeguardImprovementChance.ts`) runs before detection. Results (`HashMap<artifactId, f64>`) are passed to the WASM call as `improvementChances`. `chancePercent` is stored and returned as `f64` (one decimal precision, e.g. `47.3`) — the tooltip in Gear Inspector displays `47.3%`; the gear-piece chip rounds to integer. The simulation models **roll variance** via two-value branching (Q1/Q3 outcomes per roll, each 50 % probability) using per-star roll ranges from `SUBSTAT_ROLL_RANGES_BY_STAR`, and adds **glyph potential** (average enchantment value for the gear's rank from `GLYPH_RANGES_BY_RANK`) to each present glyphable substat's score. To limit branching complexity, only milestones +12 and +16 use two-value branching; earlier milestones (+4, +8) use the average of Q1/Q3 as a single gain value (`TWO_VALUE_BRANCHING_MIN_MILESTONE = 12`). Both data tables are generated from `shared/domain-constants.json`. Setting `improvementChanceThreshold` to `null` disables gating entirely (top-N selection remains active).
- **Empty state**: when no rule is selected the form renders disabled so the panel height remains stable.
- **Candidate rank list** (`SafeguardCandidateRankList`): the sort-weight popover in Row 3 includes a scrollable candidate list powered by detection data. It renders scored candidates windowed around the quota cutoff — the last few kept items appear before the divider and the first few sold items after it, so users can immediately identify borderline pieces. When no detection data is available yet, the list shows a placeholder. When substats are configured but detection hasn't run, per-roll weight hints are shown instead. Hovering a row previews the gear card (same `GEAR_DB_DIFF_TOAST_CARD_SCALE = 0.7` scale as the DB-update toast). Clicking a row resolves the safeguard item key to an artifact id and navigates to that item in the Gear Inspector (`handleSafeguardCandidateSelect`). When Gear Inspector filters are active, candidates are dimmed: rows whose first match is *this* safeguard rule dim to `0.75` (still clearly readable); all other filtered rows dim to `0.4`. Unfiltered rows are always `1.0` — above/below the cutoff line is the only quota distinction shown.
  - **Tooltips on section labels**: the "Weights" label and the "Candidates" label are each wrapped in a `MarkdownTooltip`. The candidates tooltip clarifies that items below the cutoff fall outside *this* rule's quota but may still be kept by another safeguard or recipe match.
  - **Column widths — canvas measurement**: `measureStatCellWidths(t, theme)` (exported from `SafeguardCandidateRankList`) runs one canvas `measureText` pass over every `STAT_VARIANTS_PRIORITY` label plus `ANOMALOUS_SUBSTAT_VARIANTS`. It returns `{ mainstatCellWidthPx, substatCellWidthPx, rankCellWidthPx, rarityCellWidthPx }` where `substatCellWidthPx` includes the circled-4 roll glyph, and the rank/rarity widths cover the widest star-rank and rarity labels across values 1–6. Both the list and `SafeguardBuilderPanel` call this inside `useMemo([t, theme])` so the measurement is stable per language/theme and never repeated unnecessarily.
  - **Match-source column width — measured, not guessed**: `measureMatchSourceCellWidth` runs a second canvas pass at `FONT_SIZE_MATCH_SOURCE_REM` over the *distinct names the rows will actually render*, resolved by `matchSourceNameFor` (the SSOT the row itself renders from, so the column can never be sized from a different string than it shows). The rendered set is bounded per document — recipe names, safeguard rule labels, the fixed final-sell string — so the widest is the exact width needed. It returns `0` when no row has a name, and the cell is then omitted entirely rather than padding every row with an empty fixed box. The result is clamped to `substatCellWidthPx × MATCH_SOURCE_MAX_SUBSTAT_CELLS` (4) so one pathological name ellipsizes instead of dwarfing the stat columns; that cap is the width the column formerly took *unconditionally*, keyed to unrelated stat-label metrics. A width that is fixed per render still prevents the column from resizing mid-scroll.
  - **Uniform columns**: mainstat cell uses `width: mainstatCellWidthPx`; each substat cell uses `width: substatCellWidthPx`. Absent-substat slots are filled with invisible placeholder `Box` elements (count = `min(substats.length, SUBSTAT_SLOT_COUNT) − presentCells`) so the score/badge/match columns are naturally aligned across all rows.
  - **EllipsisTooltip on substat cells**: each substat cell is wrapped in `EllipsisTooltip` — if the measured cell width is still too narrow for a particular translation, the browser shows an OS tooltip with the full label text.
  - **Score column**: fixed `width: 48, textAlign: right`; always rendered (empty string when unranked) so the badge column never shifts. The improvement-chance column immediately left of it is fixed `width: 40, textAlign: right` and blank when no chance is known for the item under the current rule.
  - **Match source rendering**: `parseRecipeNameDirectives` is applied so `[rrggbb]` color tags in recipe/rule names render in their directive color (white fallback). Match source text is always `fontWeight: 400`; the row-level opacity (see above) is sufficient to distinguish which rule owns the item.
  - **Badge icon logic**: `previewRow.match` is used as ground truth when available — Stars if kept by a safeguard, CheckCircle if kept by a recipe, Sell if sold. Falls back to `candidate.isWithinQuota → Stars` when no preview data exists.
  - **Popover width**: the popover has no explicit width — every row column is fixed-width and `flexShrink: 0`, so the row's natural width becomes the flyout's, and the Weights column sits beside it. Keeping the row narrow is therefore the only way to keep the flyout narrow.
  - **Stable width across the Group toggle**: flipping the *Group* view swaps the candidate set, which would otherwise resize three columns under the user's cursor. All three are instead sized for **both** views up front whenever the toggle is on offer (`groupViewOffered` in `SafeguardBuilderPanel` — the single condition gating the toggle chip and the reservations alike, so space is held exactly when the toggle that fills it exists):
    - *Feeder ordinal* (`·n`, which member fed a pooled row): `reserveFeederOrdinalSpace` renders the cell empty at `FEEDER_ORDINAL_CELL_WIDTH_PX` while the view is off. That constant is the SSOT for the rendered cell and its reserved form, so the two cannot drift.
    - *Substat columns*: `substatColumnsFor(candidates, artifacts, selection)` computes the count for one view; `substatColumnCount` takes the `max` over both, each measured with its own artifact map and substat selection (group view uses the members' union, `groupSubstatSelection`).
    - *Match source*: `alternateViewCandidates` feeds the other view's candidates into the name measurement, so a longer member name in the pool cannot widen the column on toggle.
    The tradeoff is deliberate: whichever view needs less leaves that reserved space empty. It is bounded and applies only to group members.

### Gear Inspector Card Overlay Chip System

Cards in `GearInspectorItemsGrid` support up to three stacked overlay chips rendered on top of the artifact icon. All sizing and positioning is driven by `overlaySlotCount` (1 | 2 | 3) — a global setting computed once per render pass and passed uniformly to every card so all chips sit at the same Y position regardless of per-card data availability.

**Slot assignment (fixed order):**

| Prop | Signal | Notes |
| --- | --- | --- |
| `topOverlay` | Safeguard improvement chance % | Color-coded by normalized chance (red→green). |
| `centerOverlay` | Safeguard rank #N | Green = kept (within quota), red = sold. Omitted when `showSafeguardRank` toggle is off. |
| `bottomOverlay` | Normalized substat rating score | Same color scale as sort presets. |

**Y positions by slot count:**

| `overlaySlotCount` | Top | Center | Bottom |
| --- | --- | --- | --- |
| 1 | 50% | 50% | — |
| 2 | 23% | 53% | — |
| 3 | 20% | 50% | 80% |

**Font sizes (at `size = 88 px`):**

| Slot count | Formula | Result |
| --- | --- | --- |
| 1 | `min(16, max(13, round(size × 0.34)))` | 16 px |
| 2 | `min(13, max(10, round(size × 0.25)))` | 13 px |
| 3 | `min(12, max(10, round(size × 0.21)))` | 12 px |

**Computing `overlaySlotCount`** in `GearInspectorItemsGrid`:
```ts
const overlaySlotCount = Math.max(1, Math.min(3,
  (normalizedOverlayEnabled ? 1 : 0) +
  (showSafeguardImprovementChance ? 1 : 0) +
  (showSafeguardRank && safeguardRankByArtifactId != null ? 1 : 0),
)) as 1 | 2 | 3
```

**Implementation files:** `GridIconBox.tsx` (chip rendering), `GearInspectorGridCard.tsx` (prop forwarding), `GearInspectorItemsGrid.tsx` (overlay computation + `overlaySlotCount` wiring).

### Per-Chip Isolated Tooltips

Each overlay chip carries its own tooltip content via `tooltipMarkdown` and `tooltipRender` fields on `OverlayChip`. When either field is set, `GridIconBox` wraps that chip in a `MarkdownTooltip` so its hover content is fully isolated from the card icon's tooltip — no content merging needed.

**Card icon tooltip scope** — `GearInspectorGridCard` now limits the gear icon tooltip to last-use info and dev artifact id only:
- Merge logic: `[lastUseTooltip, devArtifactIdTooltip].filter(Boolean).join('\n\n---\n\n')`.
- Improvement-chance breakdown and safeguard rank table are surfaced on the chips themselves, not the card icon.

**Chip tooltip fields (on `OverlayChip`):**
- `tooltipMarkdown?: string` — plain markdown shown on chip hover; rendered by `MarkdownTooltip`.
- `tooltipRender?: ReactNode` — JSX tooltip content; takes priority over `tooltipMarkdown` when both are set.

**Rank chip tooltip** — rendered as JSX (`tooltipRender`): a localized `safeguardRankTooltipTitle` header followed by a vertical list of rank rows. The primary rule is bold (`#N Rule Name`); up to 3 additional rules where the item is also a candidate follow in plain weight.

**Improvement-chance chip tooltip** — markdown string derived from localized keys (`gearInspectorGridSafeguardChanceTooltipHeader`, `gearInspectorGridSafeguardChanceTooltipProjection`, `gearInspectorGridSafeguardChanceTooltipDataset`).

### Safeguard Candidate List Display Flag Wiring

`SafeguardCandidateRankList` respects the same global display preferences as the HSF table:
- `showSlotIcons: boolean` — when `true`, a 16×16 slot type icon is shown; text slot label is suppressed.
- `showSetIcons: boolean` — when `true`, a `SetIcon` (14 px) replaces the text set name.
- `showFactionIcons: boolean` — when `true`, a `FactionIcon` (14 px) replaces the text faction label (accessory slots only).

All three flags are sourced from `useDisplayPreferences()` in `SafeguardBuilderPanel` and passed directly to the list. This ensures slot/set/faction rendering in the candidate popover is always consistent with the main grid.

**Hover card tooltip:** hovering a candidate row shows a scaled `GearInspectorGridCard` when `previewRowByItemKey` contains an entry for that item. The card uses the same CSS-scale pattern as `GearDbDiffToast` (`GEAR_DB_DIFF_TOAST_CARD_SCALE = 0.7`, column count `= CHAMPION_ICON_LARGE_THRESHOLD`). The preview map is computed in `App.tsx` as `safeguardPreviewRowByItemKey` (keyed by safeguard item key) and passed through `SafeguardBuilderPanel`.

### `SafeguardChipsPanel` (rule chip list)

Rendered in the builder column's **bottom paper** — the same paper `RecipeChipsPanel` occupies in recipe mode, with only the active mode's list mounted visible (see *Builder column splitter*).

- Add / delete / duplicate / reorder rules. Drag-and-drop reordering via `useChipListDnd`.
- Context menu (right-click): Duplicate, Move Up/Down, Copy, Paste After, Delete.
- Copy / paste via the shared clipboard helpers; paste opens `PasteDialog` for validation.
- Compact chip labels use `safeguardSummaryParts` to summarise slot / set / substat selections.
- `visibleRuleIds` prop: when provided (e.g., from a Gear Inspector highlight), only matching chips are shown — mirrors `RecipeChipsPanel`'s `visibleIndices` filter.
- `focusRuleRequest` prop: incremented token causes the panel to scroll the specified rule chip into view; used when Gear Inspector jumps to a safeguard rule.
- **Side-by-side mode**: `isSideBySide` prop switches the chips container to `minHeight: 0; maxHeight: '100%'` (flex-fill) so the chip list fills the Paper correctly — see *Top-down paper height constraint* in Layout Notes.

### Builder chip-list selection (shared by both builders)

Both chip lists route every click through ONE handler: `useItemListManager.handleItemSelect` (`src/hooks/useItemListManager.ts`), wrapped by `useRecipeSelection` / `useSafeguardSelection`.

- **Plain left click** selects the chip — or UNSELECTS it when it is already the sole selection (mirrors the gear inspector's left-click deselect toggle). Ctrl/Cmd toggles within a multi-selection; Shift extends a range from the anchor.
- **Active/scroll target**: after any click the clicked chip (not the range maximum) becomes the active index, the shift anchor, and the scroll-into-view target while it remains selected. (Shift ranges are stored ascending, so using the array tail historically scrolled the list DOWN when shift-clicking upward.) Only when the click removed the chip (plain/ctrl toggle off) does the target fall back to the last remaining index.
- **Tag chips** (`BuilderTagChips.tsx`): both the inline strip (chips capped at 120 px) and the tags-popover list wrap each chip in `EllipsisTooltip`, so an ellipsed tag reveals its full text via the native OS tooltip — the app-wide pattern for truncated text.

### Separators (list dividers) in the builders

Recipe separators (`exportMode='separator'`) and safeguard separators (`SafeguardRule.separator`) share one UX:

- **Chip render**: `SeparatorDividerRow` (shared component) draws the divider line + centered label; decoration (leading `#` marks = dashed/dotted style + alpha, `appearance.fgColor` = line color) comes from `deriveSeparatorDividerDecoration` in `src/lib/separators.ts` (also home of `parseSeparatorLabel`). Safeguard separator chips hide the index/mode badge, tag chips, and inline action buttons (like recipe separator chips); double-click starts the inline rename.
- **Builder toggle**: the shared `SeparatorToggleButton` (`━`, single on/off ToggleButton) sits right of the name field in BOTH builders (single-edit only). Turning it ON resets the draft's other fields to factory defaults — exactly what a separator persists as — keeping appearance; turning it OFF returns to a normal rule/recipe (recipes resume `exportMode='active'`). Undo restores the pre-toggle state.
- **Disabled sections**: while the draft is a separator, every non-name control section stays MOUNTED (stable layout when switching chips) but is dimmed + non-interactive via `separatorDisabledSectionSx` (`builderPanel/constants.ts`, opacity from `resolveDisabledOpacity`).
- **Load selection**: fresh loads land on the first non-separator chip (see `rules-and-data.md`).

### Groups in the safeguard chip list

Semantics live in [app-behavior.md](app-behavior.md#groups-safeguards-sharing-one-required-count);
this is the UI contract.

- **Entry kinds**: branch on `safeguardEntryKind(rule)` → `'rule' | 'separator'`; membership is `isSafeguardGrouped(rule)` / `safeguardGroupIdOf(rule)`. Never test `rule.separator` or compare neighbours' `group.id` inline — the discriminator and `lib/safeguardGroups.ts` are the SSOT.
- **Structural facts** (run range, run members, the run head's settings) come from `lib/safeguardGroups.ts`, a memoizing facade over the Rust authority. It memoizes on the rules-array identity, so it costs one wasm call per mutation, not per consumer per render.
- **Group colour**: `resolveLabelColor(group.id, surface)` (`lib/labelColors.ts`) — the same hash-hue + `ensureContrastOnBg` helper that colours tags (`useTagChipSx` in `BuilderTagChips.tsx`, used by both chip lists, the builder tag strip and the tags popover). Nothing is stored; the id decides.
- **Member chip**: a coloured left edge `SAFEGUARD_GROUP_EDGE_PX` wide in the group's colour (squared where it meets the neighbouring member so a run reads as one bracket; `data-safeguard-chip-group` carries the id for tests and tooling), the usual name / activation badge / `≥ N` / ignore glyphs / summary / tags, plus `SafeguardGroupBadge` (`⊚ ≥ M`, tooltip naming the group's chips) right after the rule's own count. No indentation, no chevron.
- **No positioned wrapper around a chip.** The drag layer measures each chip's `offsetTop`, which is relative to its nearest *positioned* ancestor, so wrapping chips in a `position: relative` element (e.g. to host an absolutely-positioned bracket rail) silently zeroes every measurement and misplaces the drop guide. Group cues must live inside the chip's own box.
- **Moves and drops**: the four directional moves route through `useItemListManager.resolveDirectionalMove` (`resolveSafeguardDirectionalMove`); drag-and-drop decides membership from the pointer's horizontal position via `useChipListDnd.resolveDropDepth` (level 1 = join, 0 = outside; guide inset = `SAFEGUARD_GROUP_JOIN_OFFSET_PX`; the guide takes the group's colour when it will join) and applies it through `useItemListManager.resolveDropMove` for moves AND Ctrl-copies. All params are additive — `RecipeChipsPanel` omits them and behaves exactly as before. Delete / duplicate / copy act on the selection only.
- **Context menu** (`RecipeContextMenu` group section, safeguards only): *Create Group*, *Ungroup*, *Remove from Group*, *Join Group Above / Below* — enablement mirrors the helper that performs the action, so a disabled item and a no-op call always agree.
- **Builder form**: an ordinary rule form. The **group strip** is always mounted directly beside Required Count (dimmed + inert via `separatorDisabledSectionSx` when the draft is not a member, so switching chips never shifts the row) and renders as one visual pill in the group's colour: the Required Count field and a `Group`-labelled count field butted together as ONE segmented control (shared divider-coloured border, neutral theme colours — the group colour is the list's job), followed by a *Buckets:* row of four glyph chips (`KEEP_OVERRIDE_SCOPE_GLYPHS`, rendered by the same `renderGlyphToggleChip` the *Ignore:* chips use, full label + hint in the tooltip). Editing writes to the draft's `group`; the funnel's normalizer fans it out to the run. Multi-edit stages `groupRequiredCount` / `groupCountMode` (see `safeguardMultiEditDraft.ts`) with the usual mixed hatch. `data-tour-id="safeguards.builder.group-strip"`.
- **Candidate flyout**: `groupTrimColor` marks rows the group sold although this rule fed them (suppressed when another rule owns the outcome); the *Group* toggle chip (`safeguards.builder.candidates.group-view`) swaps in the pooled list from `lib/safeguardGroupPool.ts`, with `feederByItemKey` carrying each row's feeding member — its ordinal (`·n`) and its own appearance, which together drive the row's match-source name, colour, match triangle and opacity so a pooled row is never labelled with the edited rule's identity.
- **Note**: `SafeguardChipsPanel` mirrors `buildChipContextMenuActions` rather than calling it. Routing through that helper trips `react-hooks/refs` (several chip handlers transitively read a ref, and the rule forbids *calling* such a function during render). The helper currently has no callers.

## Hooks and Shared Components

- `src/hooks/useAutosaveRestore.ts`: Encapsulates autosave restore prompt, dismiss baseline, and enablement.
- `src/hooks/useManageColorsDialog.ts`: Manages Manage Colors dialog state plus persisted substat colors.
- Substat Targets is a tab inside the Tools dialog (`LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS`), not a standalone dialog. It is rendered as `SubstatTargetsTabContent` within `LogicHubDialog`.
- `src/hooks/useMetasetsDialog.ts`: Governs the Manage Metasets dialog lifecycle.
- `src/components/FilePickerButton.tsx`: Shared file-picker button (label + hidden input) with `accept` and `onSelect` props.
- `src/components/builderPanel/useBuilderHistoryMenu.ts`: Centralizes undo/redo tooltip formatting, builder history context-menu positioning, and context-menu hint lifecycles so the top row stays declarative.
- `src/components/builderPanel/useRuleCountBadge.ts`: Handles deferred fingerprinting, worker coordination, and status-chip sizing for builder rule counts; always import this hook instead of duplicating the async pipeline.
- `src/components/builderPanel/constants.ts`: Single source for BuilderPanel layout measurements, roll budget helpers, sentinel arrays, and other constants shared between the component and its dialogs.
- `src/components/builderPanel/useMultiEditSummary.ts`: Memoizes per-stat/set/meta counts for the active multi-edit selection so toggles and roll indicators can stay pure render logic.
- `src/components/builderPanel/useBuilderPanelActionMenus.ts`: Owns the insert/apply/reset context-menu anchors plus hint overlays, ensuring BuilderPanel proper only renders buttons and consumes the structured state.

## Effect Usage Guidelines

- Treat `useEffect` as an escape hatch for external systems (DOM APIs, third-party widgets, network state). Prefer pure render logic when deriving values from props/state.
- Avoid redundant state; compute values directly or memoize with `useMemo`.
- Reset state via keyed renders; guarded render-time `setState` is last resort.
- Store stable identifiers and derive objects during render instead of clearing state in Effects when upstream data changes.
- Keep user interaction flows inside event handlers; Effects should not replay intent just because a component rendered.
- Batch related state updates in the triggering handler; extract helpers when multiple buttons share behavior.
- Fetch data in dedicated hooks; guard Effects against race conditions by aborting stale requests.
- Prefer `useSyncExternalStore` for external stores to centralize subscribe/unsubscribe logic.
- Initialization that should run once per load belongs at module scope (optionally guarded) to avoid reruns during HMR.
- Top-down data flow: fetch in parents or hooks and pass to children; avoid Effects that push data up after fetching.
- Dialog focus/visibility logic lives alongside the dialog component.
- Audited categories:
  - Global event bridges: `useFileDragDrop`, `useTooltipScrollGuard`, `useContextMenuCloseOnOutsideRightClick` mount/unmount window listeners cleanly.
  - Autosave & external IO: `useAutosave`, `useAutosaveRestore`, `useExternalCommands`, and the copy/push listeners in `App` manage persistence and long-polling with abort-aware cleanups.
  - Layout/virtualization observers: `useBuilderPreviewLayout`, `HsfRulesTable`, `GearInspectorTabContent`, `MetasetsDialog` coordinate ResizeObservers and scroll alignment.
  - Attention/timer loops: `HelpDialog`, `PreviewHeaderActions`, `RecipeChipsPanel`, `attentionEffects` throttle requestAnimationFrame/timeouts behind explicit open/visibility checks.
  - Tutorial/history refs: `useTutorialCoachState`, `useSfcHistoryController`, and `App` maintain refs for undo/history flows when render-only derivation is insufficient.
  - Dialog focus management: `NoteDialog`, `ManageColorsDialog`, and `RulesFilterPanel` keep focus traps, autosave overlays, or preference synchronization confined to dialog scope.

### Internal vs IO Representation

- UI/builder state uses `StatVariant`-based fields: `mainStatsV`, `substatsV`, `fixedSubstatsV`, `substatRollBoundsV`.
- Per-substat roll overrides live in `substatRollTargetsV` (variant-keyed `{ base?: number; increments?: number[] }`). Context menus expose Base/+1…+5 entries and a “Use global targets” reset.
- SFC write paths (Save, Copy All, Copy single recipe) emit compact metaset references `artifactMetaSetIds`. Read paths still accept `artifactMetaSetNames` and map them to IDs by name.
- Copy single recipe writes `{ Version, Metasets: [subset], Configs: [recipe] }`.
  <!-- NOTE: `Configs` above is the literal JSON key preserved for file-format backward compatibility. -->
- Paste-only flows create hidden placeholder metasets with generated names when encountering unknown IDs so chips never show raw IDs.
- HSF read/write behavior is unchanged; IO boundaries continue to enforce the legacy stat conversions.

### Display Helpers

- Use `labelOfVariant(variant)` for stat labels.
- Avoid redundant `variantToSub(...)` followed by `statNameFromId(...)` in UI code; reserve those conversions for IO helpers.
- Slot icons: render via `src/components/artifactTypeIcons.tsx` to keep visuals consistent across surfaces. Base slot glyphs live under `ico/slots/*.svg`, set icons under `ico/sets/*.webp`, and the per-set slot art is staged under `ico/sets/slots/` (with raw PNGs in `docs/orig/ico-sets/ico-slots/`) using `<setId>_<Slot>` for numbered artifact sets and `SetName_Slot` for accessories/faction pieces, so future previews can look up the correct art without another translation layer.
- Set icons: `SetIcon` preserves the source aspect ratio with `object-fit: contain`, so updated rectangular assets stay undistorted within the square layout footprint.
- Set tooltips: `src/lib/setDescriptions.ts` + `WithSetTooltip`/`getSetTooltipContent` render localized descriptions with color-coded `{buff:}`/`{debuff:}` tags.
  - Variable-sized sets (`byPieces`) render numbered lines `1: …` through `9: …`.
  - Description strings may include explicit `\n` line breaks.

### Ordering (UI + Export)

- Slot order: Weapon, Helmet, Shield, Gauntlets, Chestplate, Boots, Ring, Amulet, Banner (`compareArtifactTypes`).
- Sets (UI): modes for Game order, A–Z, and Icons. Choice persists via `sellfileCreator.setsOrder.v1`; search is transient.
- Sets (export): numeric ID ascending (`compareArtifactSets`).
- Formatting helpers (`formatArtifactTypes`, `formatArtifactSets`) sort before rendering; Recipe chips mirror the order.
- SFC export sorts `artifactTypeNames`, `artifactSetNames` (array of `{ name, excluded? }` entries), `mainStats`, merged `substats` entries (by stat label), and metaset `setNames` for stability.
- Per-substat overrides emit under `substatRollTargets` (label-keyed). Normalization rehydrates variant-keyed `substatRollTargetsV`.
- HSF export sorts `ArtifactType`/`ArtifactSet` arrays and applies `[minLevel..maxLevel]` filtering with feasibility gating and pre-16 combo sizing.
- Builder canonicalization uses `compareVariants` so generated rule order is deterministic regardless of click order. Merge sorting preserves `(level milestone → branch index → branch sequence)` so preview chips, flex branches, and exports share the same ordering.
- Roll timeline caps: multi-stat permutations clamp credited rolls to those obtainable after the stat appears; late optionals no longer inherit early thresholds.
- Intro assignment: builder enumerates how selected stats occupy base vs later rarity slots. Fixed picks fill earliest slots; optional stats inherit remaining introductions, keeping thresholds aligned with availability.
- `IsRuleTypeAND` always exports `false`; current RSL Helper compatibility does not require AND rules for our output.
- Generated rules always carry `RecipeID` (1-based) ahead of `Keep`/`IsRuleTypeAND`; the export step injects the current trimmed `RecipeName` so downstream tooling can map Sellfile rows back to their recipes without forcing the preview table to rebuild when names change.

## Layout Notes (responsive + headers)

- Fixed widths ensure both panels share `PANEL_WIDTH_PX` in stacked and side-by-side layouts. Stacked mode centers each Paper and caps width.
- Side-by-side is the default at all but the narrowest widths: the layout draws a fixed `SIDE_BY_SIDE_TARGET_WIDTH_PX` canvas (= `SIDE_BY_SIDE_BREAKPOINT_PX`) and shrinks it with dynamic CSS zoom so it fits the real viewport (see *Auto zoom* below). At viewport ≥ `SIDE_BY_SIDE_BREAKPOINT_PX` the zoom reaches 1 and the canvas reads at native 1:1 scale. Below the `AUTO_SIDE_BY_SIDE_MIN_ZOOM` cutoff — where fitting the canvas would require shrinking it past that floor — side-by-side turns off and the layout reverts to the stacked single column at zoom 1.
- Chips height guard: `chipsMaxHeight` starts at `BUILDER_RECIPE_CHIPS_DEFAULT_MAX_HEIGHT_PX`, then grows to the measured safe height; the empty state clamps its floor to `BUILDER_RECIPE_CHIPS_EMPTY_MIN_HEIGHT_PX` without exceeding the measured cap. Resize observers keep the value fresh across layout changes. This drives chip sizing in stacked mode only; in side-by-side mode the Paper's `maxHeight = M` is the real constraint and chips flex-fill (see *Top-down paper height constraint* below).
- Auto zoom: `useAutoSideBySideZoom` decides force-vs-stacked and the zoom together via `resolveSideBySideZoom` (the SSOT in `lib/sideBySideZoom.ts`). It fits the canvas to BOTH dimensions: `raw = min(clientWidth / SIDE_BY_SIDE_TARGET_WIDTH_PX, clientHeight / SIDE_BY_SIDE_TARGET_HEIGHT_PX)` (client sizes exclude scrollbar gutters), so whichever dimension runs out of room first drives the zoom. Three bands:
  - **`raw ≥ 1`** — the viewport already fits the canvas at native scale → NOT forced (`{ forceSideBySide:false, zoom:1 }`). The **native fluid layout** takes over: panels go 100vw and grow with the window. This is the *upper handoff* — fluid above the target, zoom below it.
  - **`minZoom ≤ raw < 1`** — force the fixed canvas, scaled down by `raw`.
  - **`raw < minZoom`** — too small to render legibly → NOT forced; native breakpoint-gated layout.
  The hook re-evaluates on resize, applies the zoom to `#root` (or clears it), and publishes the live value to `--app-zoom`. Every visual↔CSS-px consumer (splitter drag math, chips/paper height, `NoteDialog` floating panel) reads that one value via `getCurrentSideBySideZoom(forced)` (`computeSideBySideZoom` is the thin `.zoom` accessor).
- **App edge gap + `#root`-owned scroll** (App.tsx `<GlobalStyles>`): the app is inset by a fixed decorative gap on every edge (`APP_EDGE_GAP_PX` = 16, `lib/constants.ts`). The gap is `#root`'s padding, and **`#root` is the app's single vertical scroll container** (`overflow-y: auto`), not the document — `html`/`body` are pinned `overflow-y: hidden` so the app scrollbar can never land on the true viewport edge. `#root` carries `scrollbar-gutter: stable both-edges`, reserving symmetric space on both sides so the (virtually never shown) app scrollbar renders *inside* the gap and never reflows content or breaks left/right symmetry. Reserving the gutter on `#root` is safe where reserving it on `html` was NOT: the forced-SBS zoom math and the `100vw`/canvas full-bleed spans size against `documentElement` (`html`) `clientWidth`, not `#root`'s, so shrinking `#root`'s content box does not clip them. The gap scales with the `#root` CSS zoom in forced mode, staying proportional to the shrunken canvas. Because the gap eats into `#root`'s content box, every viewport-height-driven fit calc must subtract it or content overflows the box and spawns the unwanted scrollbar: `useAutoSideBySideZoom` fits into `clientWidth/Height − 2·APP_EDGE_GAP_PX`, and `useBuilderPreviewLayout`'s paper-height math subtracts the vertical gap (see *Top-down paper height constraint*). Native (non-forced) side-by-side spans `#root`'s content box via `width:100%` (NOT `100vw`), so the panels stop at the gap instead of reaching the true viewport edge.
- **Root scrollbar-flash hardening** (App.tsx `<GlobalStyles>` + theme `MuiTooltip`): transient viewport scrollbars used to flash on mouse move via compounding paths — a body-portaled tooltip momentarily past the viewport edge (Popper positions before its `--app-zoom` scaling settles) grew the document's scrollable overflow, and the full-bleed `100vw`/canvas header elements (which include the scrollbar gutter) then overflowed horizontally whenever a vertical scrollbar appeared, re-driving the auto-zoom evaluation via the changed `documentElement.clientWidth`. Rules that break the loop: `html { overflow-x: clip }` (unlike `hidden`, `clip` forbids horizontal scrolling without creating a scroll container; mirrored on `#root`), `html`/`body` `overflow-y: hidden` (vertical scroll lives on `#root`, so the document never grows a scrollbar), and the theme-level tooltip Popper `strategy: 'fixed'` (fixed-position poppers never extend document scrollable overflow, so tooltips can no longer conjure a scrollbar at all). **The stable gutter lives on `#root`, never on `html`** — see the app-edge-gap bullet above for why. The `.scrolling`/`.chips-dragging` tooltip-hiding classes (`useTooltipScrollGuard`) remain as the scroll-time guard; its scroll listener is capture-phase so it still fires for the `#root` scroller.
- **Canvas width is dynamic (fills the viewport after zoom).** `resolveSideBySideZoom` also returns `canvasWidthPx = max(target, round(viewportWidth / zoom))`. The forced canvas, header span, and splitter fallback render at *that* width (threaded from the hook as `sideBySideCanvasWidthPx`), not a fixed constant. When **width** is the binding constraint it equals `SIDE_BY_SIDE_TARGET_WIDTH_PX`; when **height** drove the zoom (e.g. a wide-but-short viewport where `H/targetH < W/targetW`) the canvas widens (`viewportWidth / zoom > target`) so that `canvasWidthPx × zoom = viewportWidth` exactly — the scaled canvas fills the viewport with no side bars, and the panels absorb the spare width. `SIDE_BY_SIDE_BREAKPOINT_PX` is *defined as* the target width, so below it the canvas zooms and at/above it the native fluid path turns on. The native `@media` gate (`SIDE_BY_SIDE_NATIVE_MEDIA_QUERY`) requires width **AND** height ≥ target — the same `raw ≥ 1` condition — so a wide-but-short window stays in the zoom path instead of wrongly going 100vw; the flash-guard `@media` blocks and the `useBuilderPreviewLayout` matchMedia all use that one query so CSS and JS agree.
- Targets (`SIDE_BY_SIDE_TARGET_WIDTH_PX` / `SIDE_BY_SIDE_TARGET_HEIGHT_PX`): the width is both the canvas width the papers render at native scale and the zoom divisor; the height is the companion vertical fit target. The width is *derived* — `SIDE_BY_SIDE_PANEL_WIDTH_PX * 2 + GRID_COLUMN_GAP_PX` (two panels plus the splitter gap) — so tuning the single-panel comfortable width (currently 1116 → 2248 canvas) keeps the canvas in sync. Lowering it makes the papers narrower at 1:1 but delays when zoom starts.
- Preview table height: `HsfRulesTable` fills the paper's fixed height in side-by-side and caps its scroller at `960px` when stacked. This switch is driven by the `isSideBySide` prop (native fluid OR forced-zoom), **not** a viewport-width media query — a hardcoded `@media (min-width:2320px)` would stop matching once the forced canvas width is decoupled from the breakpoint, leaving the table wrongly capped at 960px in side-by-side.
- User settings (theme flyout): `resolveSideBySideZoom` takes `{ enabled, minZoom }`. **Enable auto zoom** (`autoSideBySideZoomEnabled`, default on) is the master switch — when off the decision is always `{ forceSideBySide:false, zoom:1 }` and only the native fluid path (`SIDE_BY_SIDE_NATIVE_MEDIA_QUERY`) can show side-by-side. **Min zoom** (`autoSideBySideMinZoom`, default `AUTO_SIDE_BY_SIDE_MIN_ZOOM` = 0.3, slider range 30%–100%) is the force/stack cutoff. Both are persisted display preferences (`preferencesState.tsx`) and threaded into the hook through `sideBySideZoomSettingsRef`; changing either re-evaluates immediately via `reevaluate()`.
- Preview height cap: right Paper height matches the left Paper during side-by-side; the preview table scrolls inside an overflow-hidden flex column.
- Header layout: Builder caption uses a three-column grid; Preview caption shares its row with filters/tester controls and wraps as needed.

### Top-down paper height constraint (side-by-side mode)

Side-by-side is always active, so the builder Paper is given a fixed height so its internal content never causes a document-level scrollbar:

- **`M` (available height in CSS px)**: computed by `useBuilderPreviewLayout` as
  `M = floor((viewportHeight − APP_EDGE_GAP_PX − paperRect.top) / zoom − BUILDER_RECIPE_CHIPS_SIDE_BY_SIDE_BOTTOM_INSET_PX)`,
  where `zoom = getCurrentSideBySideZoom(forceSideBySide)` (the live dynamic zoom, or `1` when not forced).
  `getBoundingClientRect()` returns visual (zoomed) coordinates; dividing by `zoom` converts back to CSS pixels, keeping the arithmetic consistent with `window.innerHeight`.
  The `− APP_EDGE_GAP_PX` reserves the **bottom** app edge gap — `#root` owns the scroll and its content box ends one gap above the true viewport bottom (the top gap is already reflected in `paperRect.top`). Without it the papers fill to the raw viewport bottom, overshoot `#root`'s scroll box by the gap, and spawn the unwanted app scrollbar.
- **Column constraint**: `BuilderColumn` applies `minHeight = maxHeight = M` + `overflow: hidden` to the column **wrapper** (the flex column holding both papers) in both the `forceSideBySide` code path and the `@media (min-width: SIDE_BY_SIDE_BREAKPOINT_PX)` path. Both paths use `maxHeight` (not just `minHeight`) so that `chipsMaxHeight` updates on mode switch cannot nudge the column height up or down. `M` is therefore also the height budget the builder splitter divides between the two papers (see *Builder column splitter*).
- **M initialization**: `sideBySideMinPaperHeight` is seeded at `useState` init time with `floor((window.innerHeight − 2·APP_EDGE_GAP_PX) / getCurrentSideBySideZoom(forceSideBySide) − INSET)` when `forceSideBySide` is detected (both vertical gaps subtracted since the seed has no `paperRect.top`). This upper-bound estimate is live from the very first render, preventing a scrollbar flash before the rAF measurement produces the refined value.
- **M decoupled from chips visibility**: `runChipsMeasurement` computes and applies M from the paper position alone, before checking whether the chips container is visible. This ensures the paper height is always constrained on reload even when the app starts in safeguard builder mode (where the recipe chips container is hidden).
- **Internal flex layout**: Inside the fixed-height column sit two papers separated by `BuilderSplitter`. Undragged, the form paper is `flex: 0 0 auto` (natural content height) and the chips paper is `flex: 1; minHeight: 0`, so the chips fill all remaining space without the column ever exceeding M. Once dragged, both papers switch to explicit `height` values read from the splitter's CSS variables (see *Builder column splitter*).

### Builder column splitter

The builder column is **two stacked papers** — the rule form on top, the chip list below — separated by a draggable horizontal handle (`components/AppLayout/BuilderSplitter.tsx`). Both papers are full work surfaces: each wears the gold corner ornaments and the standard `p: 2` paper padding.

- **Shared gesture.** The drag mechanics are the SSOT hook `hooks/useSplitterDrag.ts`, shared with the column splitter (`SideBySideSplitter`). It snapshots the start coordinate, ratio, and usable extent on mousedown; writes absolute px to two CSS custom properties on every mousemove (zero React re-renders for the whole gesture); and commits the final clamped ratio once on mouseup. Callers supply only the axis, the variable names, the clamps, and the extent. The two handles differ in axis (`'vertical'` here, `'horizontal'` for the columns) and in their double-click reset, which stays with each component.
- **Extent override.** Unlike the column splitter, this handle passes `usableExtentPx` explicitly: its budget is `M` (the measured column height from `useBuilderPreviewLayout`), not the container element's own box — which is precisely the box the drag is resizing.
- **CSS variables.** `--builder-splitter-top-height` / `--builder-splitter-bottom-height`, written to the column wrapper. The committed ratio renders as each variable's fallback, so the post-mouseup re-render and the live drag agree without a second code path. Both splitters name their variables as exported constants (`BUILDER_SPLITTER_TOP_VAR`/`BOTTOM_VAR`, `SPLITTER_LEFT_VAR`/`RIGHT_VAR`) rather than spelling the strings at each read/write site, so a rename cannot desynchronise a reader from the writer.
- **Ratio → px is one function.** `splitExtentByRatio()` in `useSplitterDrag` owns the conversion (subtract the handle gap, split, apply both px floors). The drag uses it, and so must any component rendering a committed ratio as a fallback size — `BuilderColumn`'s top-paper fallback does. Deriving the fallback independently makes the height rendered on reload (before any variable is set) differ from the height the gesture actually produced, by `gapPx × ratio`.
- **A lost mouseup still ends the gesture.** Releasing the button outside the browser window delivers no `mouseup` to the document. A `window` `blur` handler therefore runs the same teardown — detach the listeners, clear `splitterDragActive`, commit what the user last saw. Without it the module-level flag would stay `true` for the rest of the session and silently disable *every* layout ResizeObserver in `useBuilderPreviewLayout`.
- **Both papers read the variables whenever the handle is live — unconditionally.** This is load-bearing, not incidental. Sizing the papers by `flex` while `splitRatio` is null and only switching to `height: var(…)` after the first commit leaves the variables *unread* during that first gesture: the drag writes them, nothing consumes them, and the layout does not move until mouseup pushes a ratio through React. Because the double-click reset restores exactly that null state, the symptom recurs after every reset. The fix is to keep `height: var(--…, fallback)` on both papers at all times and let the **fallback** carry the default — `auto` when undragged (natural content height, identical to the pre-split layout), the committed px once dragged. `useSplitterDrag` additionally seeds both variables from the start ratio on mousedown, so the very first mousemove already has values to work against, and the reset removes the inline properties so the `auto` fallback can win again.
- **A gesture that never moved commits nothing.** `useSplitterDrag` tracks whether the pointer actually left the press point and skips both the variable seed and the `onResize` commit otherwise. Without this, the mousedown/mouseup pair inside *each half* of a double-click commits a ratio — and the second one lands **after** the `dblclick` handler has cleared the state, silently undoing the reset. The visible symptom was a reset that alternated between two heights on repeated double-clicks (and re-populated the stored ratio); the seed is therefore deferred to the first real mousemove rather than run on mousedown.
- **Measurement is suppressed mid-gesture** (`isSplitterDragActive()`, exported from `useSplitterDrag`). The drag resizes elements that `useBuilderPreviewLayout`'s ResizeObservers watch — the column, the form paper, and both chips containers — so without a guard every mousemove triggers a measurement → `setState` → re-render, which is precisely the stutter the CSS-variable design exists to avoid; the readings are wasted anyway, being mid-drag intermediates the commit supersedes. Measured cost of an 80-move gesture: **~61ms/move unguarded vs ~17ms/move guarded** (one 60fps frame). The flag is module-level rather than React state so observer callbacks can read it without re-registering and flipping it never itself renders; it clears *before* the commit so the observers reacting to the commit see final sizes.
- **Clamps.** `BUILDER_SPLITTER_MIN_TOP_PX` (120) keeps the form's controls from clipping; `BUILDER_SPLITTER_MIN_BOTTOM_PX` aliases `BUILDER_SAFEGUARD_CHIPS_MIN_HEIGHT_PX` so a dragged split can never leave less chip room than the automatic measurement already guarantees.
- **Side-by-side only.** The handle is interactive only when side-by-side is active — that is the only layout with a fixed height budget to divide. Stacked single-column mode lets both papers grow with their content, so the handle renders as a passive `GRID_COLUMN_GAP_PX` spacer with no cursor or hover affordance.
- **Natural-height default.** The stored ratio is **nullable and defaults to null**, meaning "never dragged": the form paper sits at its exact content height and the chip list takes the remainder — the layout the column had before it was split. Dragging is therefore purely opt-in, and double-clicking the handle restores it by writing `null` back. Because a drag needs a concrete start value, `BuilderSplitter` also takes `fallbackRatio` — the natural split measured from the DOM (`builderSplitNaturalRatio` = form paper height / (`M` − `GRID_COLUMN_GAP_PX`) — the denominator is the extent the drag actually divides, handle excluded, or the first grab would jump the form upward) — so grabbing the handle continues from where the papers actually sit instead of jumping.
- **Per builder mode.** `state/builderSplitterPreference.ts` persists a `{ recipe?, safeguard? }` map under `sellfileCreator.layout.builderSplitterRatio.v1`. The two forms have very different natural heights, so a split that suits one reads as badly proportioned in the other; each mode remembers its own, and an absent entry is the natural-height default. An empty map removes the key rather than storing `{}`.
- **Chip-list inset.** Both chip panels dropped the top margin they used to carry (`mt: 2` in `RecipeChipsPanel`, `mt: 1` in `SafeguardChipsPanel`) — a gap that made sense when the list sat directly beneath the form inside one shared paper, but which double-padded the top once the list became the first child of its own paper (and made the two builder modes disagree with each other). The paper's own `p: 2` is now the whole inset, matching the form and preview papers. The `pr`/`paddingInlineEnd` scrollbar gutter (`reserveScrollbarGutterSpace`) is deliberate and stays.
- **Refs.** `paperRef` (`leftPaperRef`) stays on the column **wrapper** — the preview column mirrors its height and the chips measurement derives its budget from its top edge. `formPaperRef` (`builderFormPaperRef`) measures the top paper alone, feeding only the natural-ratio calculation.
- Committing a drag calls `scheduleMeasurement()`, since the chip list's height budget just changed and the chips panel sizes itself from that measurement.

### `chipsAvailableHeight` signal

`useBuilderPreviewLayout` returns `chipsAvailableHeight: number | null`:
- `null` — not in side-by-side mode (stacked layout). `RecipeChipsPanel` uses the legacy `minHeight = maxHeight = chipsMaxHeight` sizing for stability.
- non-null (including `0`) — side-by-side mode is active. `RecipeChipsPanel` switches to `minHeight: 0` (flex-fill); the Paper's `maxHeight` is the real constraint.

When the mode transitions away from side-by-side, `chipsAvailableHeight` is reset to `null` (not `0`) so the legacy sizing resumes. When the chips container is hidden (e.g., safeguard mode with recipe chips offscreen), the measurement sets `chipsAvailableHeight = 0` to signal "side-by-side, but no chips data yet" without blocking M from being applied.

### `isSideBySide` prop on `SafeguardChipsPanel`

`SafeguardChipsPanel` accepts `isSideBySide?: boolean` (passed from `App.tsx` via the `isSideBySide` value from `useBuilderPreviewLayout`). When `true`, the chips container uses `minHeight: 0; maxHeight: '100%'` (flex-fill) instead of `minHeight = maxHeight = maxHeightPx` (fixed size). This matches the flex-fill behaviour of `RecipeChipsPanel` in side-by-side mode, giving both chip lists a consistent bottom edge.

## Legal

This is an independent, fan-made utility. It is not affiliated with, endorsed by, or sponsored by Plarium Global Ltd., Raid: Shadow Legends, or the authors of RSL Helper. “Raid: Shadow Legends” and related names are trademarks of their respective owners. Any references are for descriptive purposes only.
