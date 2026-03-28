# Gear Analytics

The **Gear Analytics** tab in the Logic Hub dialog provides an interactive analytics dashboard for the loaded gear inventory. It is a read-only view — it never modifies gear data — and exposes cross-filter exploration, KPI health cards, stat frequency charts, a slot × main stat heatmap, and per-champion gear summaries.

## Architecture overview

All aggregation logic lives in `src/lib/gearAnalytics.ts` (pure functions, no React). UI is split across:

| File | Responsibility |
|---|---|
| `src/lib/gearAnalytics.ts` | Types, filter logic, counters, KPI computation, label helpers, i18n key re-exports |
| `src/components/dialogs/GearAnalyticsTabContent.tsx` | Orchestrator: state, derived data, layout |
| `src/components/gear-analytics/GearAnalyticsDonut.tsx` | Reusable donut chart with cross-filter toggle |
| `src/components/gear-analytics/GearAnalyticsRadar.tsx` | Radar chart for substat frequency + co-occurrence pivot |
| `src/components/gear-analytics/GearAnalyticsKpiCards.tsx` | Row of 8 KPI percentage cards |
| `src/components/gear-analytics/GearAnalyticsCrossFilterChips.tsx` | Active filter chip bar with per-chip delete |
| `src/components/gear-analytics/GearAnalyticsBar.tsx` | Horizontal bar chart (main stat frequency) |
| `src/components/gear-analytics/GearAnalyticsHeatmap.tsx` | Slot × main stat count heatmap |
| `src/components/gear-analytics/GearAnalyticsTreemap.tsx` | Squarified treemap for set cross-filter |
| `src/components/gear-analytics/GearAnalyticsChampStats.tsx` | Per-champion gear summary table |

## Cross-filter pattern

The dashboard follows the BI-style **Crossfilter** (linked selection) pattern: selecting a slice in any donut narrows every *other* chart to that subset, while the chart that owns the clicked dimension still shows its full distribution.

### `GearAnalyticsDim`

All dimension selections live in a single `GearAnalyticsDim` object:

```ts
type GearAnalyticsDim = {
  slots:    ReadonlySet<number>           // ArtifactTypeId
  ranks:    ReadonlySet<number>           // star grade 1–6
  rarities: ReadonlySet<number>           // RankValue 1–6
  sets:     ReadonlySet<number>           // ArtifactSetId, or -1 for "others" bucket
  outcomes: ReadonlySet<GearAnalyticsOutcome>  // sell | keep | safe | none
  sources:  ReadonlySet<GearInspectorSourceFilter>
  levels:   ReadonlySet<number>           // gear level milestone 0/4/8/12/16
}
```

`EMPTY_GEAR_ANALYTICS_DIM` is the canonical all-zeroes sentinel; compare against it to test whether any filter is active.

### `applyGearAnalyticsFilter(rows, dim, exclude?)`

The core filter function. Each dimension narrows the result **AND**-wise; values within a dimension are **OR**'d. The optional `exclude` key tells the function to skip one dimension — used by each chart to receive data filtered only by the *other* active dimensions (so its own distribution always covers its full range).

Short-circuit path: if all active dimensions (after exclusion) are empty-sets, the original array is returned as-is with no allocation.

## Sets treemap

Sets are displayed as a squarified treemap (`GearAnalyticsTreemap`) below the donut row. Tile area is proportional to item count per set — larger tiles mean more gear in that set. Each tile's background is split left-to-right into outcome color bands (sell / safeguarded / keep / no-match) proportional to item counts in those buckets.

`countSetsByOutcome` (in `gearAnalytics.ts`) tallies all set IDs without a top-N cap and returns them sorted by total count descending. It accepts a `setNameFn` option for localized labels — the tab passes `(id) => getLocalizedGearSetName(id as ArtifactSetId, t, lang)` so set names respect the active language. Because every entry carries a real set ID, `applyGearAnalyticsFilter` can use `dim.sets` directly — no synthetic `-1` expansion or `effectiveDim` indirection is needed.

### Treemap layout

The squarified algorithm (Bruls, Huizing, van Wijk 2000) produces near-square tiles by minimizing aspect ratio. Container width is measured reactively via `ResizeObserver` so the layout adapts when the dialog is resized. Height is fixed at 180 px (`TREEMAP_H`).

Tile content adapts to available space:

| Content | Minimum tile size |
|---|---|
| Icon | 26 × 26 px (`ICON_THRESHOLD_PX`) |
| Set name label | 54 × 38 px (`LABEL_MIN_W` / `LABEL_MIN_H`) |
| Outcome counts chip | 46 × 12 px (`NUMBERS_MIN_W` / `NUMBERS_MIN_H`) |

When `showIcons` is true, icons take priority; labels appear alongside the icon when there is also room. When `showIcons` is false, the label takes priority; the icon appears only as a fallback when the tile is too small for a label but large enough for an icon.

## Donuts

Six donut charts are rendered in a 6-column grid. Each owns one `GearAnalyticsDim` key and calls its toggle callback on click:

| Chart | Dimension key | Counter | Special behavior |
|---|---|---|---|
| Slot | `slots` | `countBySlot` | SVG slot icons on arcs; double-click selects whole armor/accessory group |
| Rank | `ranks` | `countByRank` | Text arc labels (`1★`–`6★`) via `ArcTextLabel` |
| Rarity | `rarities` | `countByRarity` | Per-slice color from `RARITY_ACCENT_COLORS` |
| Result | `outcomes` | `countByOutcome` | String IDs (`sell`/`keep`/`safe`/`none`) |
| Source | `sources` | `countBySource` | SVG icons from `sourceIconSvgAsset` (no icon for inventory); `manual` = pencil |
| Level | `levels` | `countByLevel` | Text arc labels (`+0`–`+16`) |

### `GearAnalyticsDonut` props

- `slotIconById`: optional function `(id) => SlotIconAsset | null`. SVG path icons (`{viewBox, path}`) use `getContrastText(arcColor)` fill and no background circle. Bitmap icons (`{url}`) get a semi-transparent `<circle>` chip background.
- `colorBySliceId`: optional function for per-slice color overrides (e.g. rarity colors).
- `arcLabel`: text label function for arcs when no icon map is given. Uses the `ArcTextLabel` slot which also picks `getContrastText` fill color.
- `arcLabelMinAngleDeg` (default 15°): minimum arc angle to render a text label. Icon-mode arcs use a chord-width check instead (`MIN_ICON_CHORD_PX = 22 px`).
- `iconSize` (default 14): icon size in px, passed via `SlotIconContext`. Set icons use 16 px.
- `onDoubleClickItem`: optional double-click handler. A 300 ms timer distinguishes single from double clicks; if a second click arrives within the window, `onDoubleClickItem` fires and the pending single-click is cancelled.

### Slot group double-click

`slotGroupIds(id)` in `gearAnalytics.ts` returns `SLOT_ARMOR_GROUP` (Weapon/Helmet/Shield/Gauntlets/Chestplate/Boots) or `SLOT_ACCESSORY_GROUP` (Ring/Amulet/Banner), derived at module load from `PREFERRED_ARTIFACT_TYPE_ORDER` + `isAccessorySlot`. The Slot donut passes `onDoubleClickItem={selectSlotGroup}` so double-clicking any armor slot selects all armor slots, and any accessory slot selects all accessory slots.

## KPI cards

Eight percentage cards rendered by `GearAnalyticsKpiCards` from `computeGearAnalyticsKpis`. All values are 0–1 ratios; `null` means the row set is empty (avoids 0/0 confusion).

| KPI | Definition |
|---|---|
| 6★ | Items at max star rank |
| Legendary+ | Items at rarity ≥ 5 (Legendary or Mythical) |
| Maxed | Items at level 16 |
| Equipped | Items equipped to any champion (including vault-benched) |
| Vault-locked | Items on a vault-benched champion (`source = vault`) |
| Chaos'd | Items rerolled ≥ 1 time with a chaos orb |
| Glyphed | Items with at least one substat having `glyphValue > 0` |
| Ascended | Items with at least one ascension level (`ascension !== null`) |

All cards use a neutral text color — no green/amber/red thresholds.

## Substat frequency radar

Substat frequency is shown as a radar chart (`GearAnalyticsRadar`, MUI X v8 `RadarChart`). The axes follow the fixed `HEATMAP_VARIANTS` order so the polygon shape is always comparable across filter states. `fillArea: true` fills the polygon for at-a-glance comparison.

### Co-occurrence pivot

Clicking a radar axis mark toggles that stat variant as a **co-occurrence pivot**. Up to 4 pivots can be selected simultaneously (`selectedSubstat: ReadonlySet<number>`); a 5th click while 4 are active is ignored. When any pivots are active, `rowsForSubstatRadar` filters to rows that contain **all** selected variants (AND intersection), so the radar polygon shows how other substats distribute across that overlap.

A chip row rendered **below** the chart shows the active pivots with per-chip delete buttons and a disabled-when-empty "Clear" button. The row is always rendered at `minHeight: 24` to prevent layout shifts when chips appear or disappear.

### Metric key / label separation

Internally, metrics are passed to `RadarChart` as `{ name: String(v) }[]` (the numeric `StatVariant` id as a string), so each axis has a unique key regardless of whether the translation is empty. The `labelFormatter` callback translates the name key back to the stat label via `t(statVariantI18nKey(Number(name)))`; an empty translation yields a blank axis label without crashing.

The `MutationObserver` that applies per-stat colors matches SVG `<text>` nodes by their rendered text content against `labelColorMap` (keyed by the same translated string), so color assignment is consistent with the displayed label.

### Animation — JS interpolation + sqrt display scale

MUI X RadarChart recreates its internal SVG path elements on data updates, so CSS `transition` on the `d` attribute does not fire reliably. Instead, `GearAnalyticsRadar` drives its own animation loop:

- `animPosRef` holds the **raw** count values of the polygon's current position (updated every frame).
- `animMaxRef` holds the **raw** current max scale value.
- On each `requestAnimationFrame` tick, raw counts and max are interpolated linearly from their previous position toward the new `targetCounts`. Both are snapshotted at effect start so a new animation that interrupts an in-flight one always starts from the correct mid-animation position rather than a stale closure.
- The effect dependency is `[targetCounts]` (a stable `useMemo` reference). This fires on any genuine data change — cross-filter dim changes, main-stat selection, or co-occurrence pivot changes — all of which update `targetCounts` through the derived-data chain.

**sqrt display scale.** Raw counts are transformed before being passed to `RadarChart`:

```
displayCount[i] = sqrt(rawCount[i])
displayMax      = sqrt(rawMax)
```

This is a visual-only transformation. The ratio `sqrt(count) / sqrt(max) = sqrt(count / max)` keeps the highest-count arm at exactly 100% of the radius while spreading lower values outward. For example, a substat with 10% co-occurrence frequency renders at `sqrt(0.10) ≈ 32%` of the radius instead of 10%, making the distribution legible without any arm exceeding the boundary. The `valueFormatter` on the series inverts the transform (`v² ≈ rawCount`) so the RadarChart tooltip still shows the correct raw frequency count.

`setDisplayCounts` and `setDisplayMax` are both called from the same `step` callback and are therefore batched by React 18 into a single re-render per frame, keeping the scale and the polygon data permanently in sync.

## Main stat / substat drill-down

The Main Stats bar chart (`countMainStatFrequency`) tracks selected stat variants in a separate `selectedMainStats: ReadonlySet<number | string>` — not part of `GearAnalyticsDim`. Clicking a main stat bar toggles it; the Substat Frequency radar then filters to rows that have one of the selected main stats (this narrows the population before the co-occurrence pivot is applied).

`selectedMainStats` selections appear as chips in `GearAnalyticsCrossFilterChips` and are cleared by the "Clear" button / `resetKey` increment. `onDeleteMainStat` removes individual chips.

## Cross-filter chip bar

`GearAnalyticsCrossFilterChips` renders a flex-wrap chip row with a "Clear filters" button (always visible, disabled when no filter is active). It iterates over every non-empty dimension in `dim` plus `selectedMainStats` to produce labeled chips. Each chip has a per-item delete button that calls the appropriate toggle/delete callback.

All chip labels are localized via `t()`:
- Slot chips: `t(artifactTypeI18nKey(slot))`
- Rank chips: `rankLabel(rank)` (e.g. `1★`)
- Rarity chips: `t(rarityRankValueI18nKey(rarity))`
- Set chips: `getLocalizedGearSetName(id, t, lang)` (handles the `-1` "others" bucket via `t('gearAnalyticsOtherSetsChip')`)
- Outcome chips: `t(OUTCOME_I18N_KEY[outcome])`
- Source chips: `t(SOURCE_I18N_KEY[source])`
- Level chips: `levelLabel(lvl)` (e.g. `+16`)
- Main stat chips: `t(statVariantI18nKey(Number(id)))`

## Snapshot export

The "Copy Snapshot" button in the toolbar uses `html-to-image` (`toPng`) to capture the full scrollable tab content. Before capture, it temporarily removes overflow clipping and expands the container to `scrollHeight` so off-screen content is included. After capture, all style mutations are restored. The PNG is written to the clipboard via the Clipboard API (`navigator.clipboard.write`).

## Apply to Gear Inspector

When `onApplyToGearInspector` is provided (by the Logic Hub dialog), the "Apply to Gear Inspector" button calls it with the current `dim`. The parent translates the dim selections into Gear Inspector filter state. The button is wrapped in a `<Tooltip><span>` so the tooltip remains visible even when the button is disabled (disabled MUI buttons don't fire mouse events without a wrapper `<span>`).

## i18n

All user-facing strings pass through the i18n catalog. Keys live under the `gearAnalytics*` namespace, with related helpers re-exported from `gearAnalytics.ts` so Gear Analytics components have a single import source:

| Helper | Source | Usage |
|---|---|---|
| `artifactTypeI18nKey(slot)` | `types.ts`, re-exported via `gearAnalytics.ts` | Slot names in donut labels, heatmap headers, chips |
| `rarityRankValueI18nKey(rankValue)` | `types.ts`, re-exported via `gearAnalytics.ts` | Rarity names in donut tooltips, chips |
| `statVariantI18nKey(variant)` | `types.ts`, re-exported via `gearAnalytics.ts` | Stat names in bar, radar, heatmap, chips |
| `getLocalizedGearSetName(id, t, lang)` | `types.ts`, re-exported via `gearAnalytics.ts` | Set names in treemap tiles/tooltips, chips |

`getLocalizedGearSetName` calls `t(artifactSetI18nKey(id))` and returns the result directly; it does **not** apply a secondary fallback to the static English name table. This means an empty catalog yields empty set name strings as intended. The `t()` function already falls back to `en-US` when a key is entirely absent from the active catalog.

KPI tooltip strings are catalog-keyed (`gearAnalyticsKpi*Tip`). Source category labels (`gearAnalyticsSource*`) and outcome labels (`gearAnalyticsOutcome*`) are mapped through `SOURCE_I18N_KEY` / `OUTCOME_I18N_KEY` lookup objects in `GearAnalyticsCrossFilterChips.tsx`.

## Reset behavior

`resetKey` (incremented externally by the Logic Hub "Reset to defaults" action) triggers a `useEffect` that restores `dim` to `EMPTY_GEAR_ANALYTICS_DIM` and clears both `selectedMainStats` and `selectedSubstat`. The same clear logic runs when the user clicks the "Clear" button in the cross-filter chip bar.
