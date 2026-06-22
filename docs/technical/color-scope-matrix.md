# Colour Scope Matrix — `controls` vs `text`

Each colour group (stat / rarity / slot) has an independent 4-state scope that cycles
**off → controls → text → everything → off** (default `everything`):

- **off** — nothing.
- **controls** — interactive CONTROLS only: toggle buttons, selects / dropdowns / menus, and the
  closed-select display of the current value.
- **text** — non-control DISPLAY only: chips, preview, table cells, tooltips, summaries, history
  timeline, and the rarity accents (borders / chart fills / gear-card frames).
- **everything** — controls AND text.

`controls` and `text` are disjoint; `everything` is the union.

Each render site is tagged **C** (control) or **T** (text):
- **C** colours at `controls` and `everything` — `scopeColorsControls()`.
- **T** colours at `text` and `everything` — `scopeColorsText()`.

Mechanisms:
- `<StatLabel inControl?>` / `<RarityLabel inControl?>` / `<RarityCodeLabel inControl?>` — `inControl` ⇒ C, else T.
- Stat maps: `useStatControlColorMap()` (C) vs `useStatTextColorMap()` (T).
- Slot glyphs: wrapped in `SlotTintControlScope` ⇒ C; unwrapped ⇒ T.
- Rarity accents: `useRarityAccentColor` ⇒ T (accents are display).
- Chip/cell/summary booleans: `scopeColorsText(statColorScope)` (T); select `showBorderColors`: control bool (C).

---

## 1. Stat names (`statColorScope`)

| Site | file:line | Tag |
|------|-----------|-----|
| Recipe builder main-stat toggles | RecipeBuilderPanel.tsx (`inControl`) | **C** |
| Recipe builder substat toggles | RecipeBuilderPanel.tsx:3258 (`useStatControlColorMap`) | **C** |
| Safeguard builder main+sub stat toggles | SafeguardBuilderPanel.tsx (`inControl`) | **C** |
| Rules-filter main / substat / ascension toggles | RulesFilterPanel.tsx (`inControl` + `useStatControlColorMap`) | **C** |
| Gear-inspector main-stat select | GearInspectorTabContent.tsx:1203 (`showBorderColors={colorStatControls}`) | **C** |
| Gear-inspector substat preset select + menu | GearInspectorTabContent.tsx:1563, 1568 (`colorStatControls`) | **C** |
| Gear-substat / main-stat selects | GearSubstatSelect / GearMainStatSelect (`showBorderColors`) | **C** |
| Substat chips (preview/table) | RuleSubstatChips (`colorize` = text bool) | **T** |
| Recipe chip / safeguard chip stat text | RecipeChip, safeguardSummaryParts | **T** |
| Rules-table main-stat cell | HsfRulesTable.tsx (`colorStatTextsOn`) | **T** |
| History timeline stat words | BuilderTooltipContent.tsx (`renderColoredStatText`) | **T** |
| Substat targets help text + **row labels** | SubstatTargetsTabContent.tsx:231, 333 (`<StatLabel>` / token) | **T** |
| Gear-inspector summary main/sub stat | GearInspectorTabContent.tsx:769, 1112 (`colorStatTexts`) | **T** |
| Safeguard builder weight-row stat name | SafeguardBuilderPanel.tsx:3489 (`<StatLabel>`) | **T** |
| Gear card main/sub stat | GearInspectorGridCard.tsx | **T** |
| Analytics heatmap / radar / champ-stats labels | GearAnalytics{Heatmap,Radar,ChampStats}.tsx | **T** |
| Gear-inspector grid substat tooltip | GearInspectorItemsGrid.tsx | **T** |

---

## 2. Rarity (`rarityColorScope`)

| Site | file:line | Tag |
|------|-----------|-----|
| Rules-filter rarity toggles | RulesFilterPanel.tsx:3587 (`inControl`) | **C** |
| Gear rarity select — closed + multi + menu | GearRaritySelect.tsx:89, 104, 129 (`inControl`) | **C** |
| Recipe builder rarity select — closed + menu | RecipeBuilderPanel.tsx:6503, 6546, 6563, 6580 (`inControl`) | **C** |
| Gear-inspector summary rarity | GearInspectorTabContent.tsx:1052 (`<RarityLabel>`) | **T** |
| NoteDialog safeguard rarity list | NoteDialog.tsx:3901 | **T** |
| Rules-table Rank·Rarity cell | HsfRulesTable.tsx (`rarityLabelColors`) | **T** |
| Recipe / safeguard chip rarity word | RecipeChip, safeguardSummaryParts (`rarityLabelColors`) | **T** |
| History timeline rarity words | BuilderTooltipContent.tsx (`rarityLabelColors`) | **T** |
| Safeguard candidate slot-icon rarity tint | SafeguardCandidateRankList.tsx:685 | **T** |
| Gear card champion frame / glyph | GearInspectorGridCard.tsx:958, 963 (accent + text) | **T** |
| Gear icon rarity border | GridIconBox.tsx:171 (`useRarityAccentColor`) | **T** |
| Gear-grid / analytics rarity chart fill | GearInspectorItemsGrid, GearAnalyticsTabContent | **T** |
| Analytics champ-card / filter champion border | ChampStats, NotEquipped, RulesFilterPanel (accent) | **T** |

All rarity **accents** (borders / charts / frames) are **T** (display).

---

## 3. Slots (`slotColorScope`)

Slot glyphs tint via `makeSlotIcon` → `useSlotTintColor`: control tint inside `SlotTintControlScope`,
else text tint.

| Site | file:line | Tag |
|------|-----------|-----|
| Recipe builder slot toggle grid | RecipeBuilderPanel.tsx:6871 (`SlotTintControlScope`) | **C** |
| Safeguard builder slot toggle grid | SafeguardBuilderPanel.tsx:2926 (`SlotTintControlScope`) | **C** |
| Rules-filter slot filter toggles | RulesFilterPanel.tsx:3427 (`SlotTintControlScope`) | **C** |
| Gear slot select (closed + menu) | GearSlotSelect.tsx (`SlotTintControlScope`) | **C** |
| Gear-inspector grid headers | GearInspectorItemsGrid.tsx | **T** |
| Recipe chip / safeguard summary slot icons | RecipeChip, safeguardSummaryParts | **T** |
| Rules-table slot column icons | HsfRulesTable.tsx | **T** |
| Safeguard candidate slot icon | SafeguardCandidateRankList.tsx | **T** |
| Gear card fallback slot glyph | GridIconBox.tsx | **T** |
| Builder tooltip slot preview grid | BuilderTooltipContent.tsx | **T** |
| Dungeon simulator slot icons | DungeonSimulatorTab.tsx | **T** |

---

## Master toggle
Theme-menu / table-header / grid menu toggle: `checked` = any group scope ≠ off; toggling sets all
three groups to `everything` (on) or `off` (off). Manage Colors button always enabled.
