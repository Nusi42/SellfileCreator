# Gear Lens

The **Gear Lens** tab in the Logic Hub dialog provides an interactive analytics dashboard for the loaded gear inventory. It is a read-only view — it never modifies gear data — and exposes cross-filter exploration, KPI health cards, stat frequency charts, a slot × main stat heatmap, and per-champion gear summaries.

## Architecture overview

All aggregation logic lives in `src/lib/gearLens.ts` (pure functions, no React). UI is split across:

| File | Responsibility |
|---|---|
| `src/lib/gearLens.ts` | Types, filter logic, counters, KPI computation, label helpers |
| `src/components/dialogs/GearLensTabContent.tsx` | Orchestrator: state, derived data, layout |
| `src/components/gear-lens/GearLensDonut.tsx` | Reusable donut chart with cross-filter toggle |
| `src/components/gear-lens/GearLensKpiCards.tsx` | Row of 8 KPI percentage cards |
| `src/components/gear-lens/GearLensCrossFilterChips.tsx` | Active filter chip bar with per-chip delete |
| `src/components/gear-lens/GearLensBar.tsx` | Horizontal bar chart (stat frequency, substat frequency) |
| `src/components/gear-lens/GearLensHeatmap.tsx` | Slot × main stat count heatmap |
| `src/components/gear-lens/GearLensChampStats.tsx` | Per-champion gear summary table |

## Cross-filter pattern

The dashboard follows the BI-style **Crossfilter** (linked selection) pattern: selecting a slice in any donut narrows every *other* chart to that subset, while the chart that owns the clicked dimension still shows its full distribution.

### `GearLensDim`

All dimension selections live in a single `GearLensDim` object:

```ts
type GearLensDim = {
  slots:    ReadonlySet<number>           // ArtifactTypeId
  ranks:    ReadonlySet<number>           // star grade 1–6
  rarities: ReadonlySet<number>           // RankValue 1–6
  sets:     ReadonlySet<number>           // ArtifactSetId, or -1 for "others" bucket
  outcomes: ReadonlySet<GearLensOutcome>  // sell | keep | safe | none
  sources:  ReadonlySet<GearInspectorSourceFilter>
  levels:   ReadonlySet<number>           // gear level milestone 0/4/8/12/16
}
```

`EMPTY_GEAR_LENS_DIM` is the canonical all-zeroes sentinel; compare against it to test whether any filter is active.

### `applyGearLensFilter(rows, dim, exclude?)`

The core filter function. Each dimension narrows the result **AND**-wise; values within a dimension are **OR**'d. The optional `exclude` key tells the function to skip one dimension — used by each chart to receive data filtered only by the *other* active dimensions (so its own distribution always covers its full range).

Short-circuit path: if all active dimensions (after exclusion) are empty-sets, the original array is returned as-is with no allocation.

### "Others" bucket expansion

`countBySet` caps the Sets donut at `SET_DONUT_TOP_N = 15` named slices and aggregates the remainder into a synthetic entry with `id = -1`. `applyGearLensFilter` does not understand `-1`, so `GearLensTabContent` computes `otherSetIds` once from the full row set via `getOtherSetIds`, then constructs `effectiveDim`: when `dim.sets` contains `-1`, that value is replaced with the full set of real IDs that fell into the "others" bucket before passing to the filter.

## Donuts

Seven donut charts are rendered in a 7-column grid. Each owns one `GearLensDim` key and calls its toggle callback on click:

| Chart | Dimension key | Counter | Special behavior |
|---|---|---|---|
| Slot | `slots` | `countBySlot` | SVG slot icons on arcs; double-click selects whole armor/accessory group |
| Rank | `ranks` | `countByRank` | Text arc labels (`1★`–`6★`) via `ArcTextLabel` |
| Rarity | `rarities` | `countByRarity` | Per-slice color from `RARITY_ACCENT_COLORS` |
| Sets | `sets` | `countBySet` | Bitmap set icons (16 px); `ACCESSORY_NO_SET_ID` (-99) uses Spider webp; "others" bucket uses id -1 |
| Result | `outcomes` | `countByOutcome` | String IDs (`sell`/`keep`/`safe`/`none`) |
| Source | `sources` | `countBySource` | SVG icons from `sourceIconSvgAsset` (no icon for inventory); `manual` = pencil |
| Level | `levels` | `countByLevel` | Text arc labels (`+0`–`+16`) |

### `GearLensDonut` props

- `slotIconById`: optional function `(id) => SlotIconAsset | null`. SVG path icons (`{viewBox, path}`) use `getContrastText(arcColor)` fill and no background circle. Bitmap icons (`{url}`) get a semi-transparent `<circle>` chip background.
- `colorBySliceId`: optional function for per-slice color overrides (e.g. rarity colors).
- `arcLabel`: text label function for arcs when no icon map is given. Uses the `ArcTextLabel` slot which also picks `getContrastText` fill color.
- `arcLabelMinAngleDeg` (default 15°): minimum arc angle to render a text label. Icon-mode arcs use a chord-width check instead (`MIN_ICON_CHORD_PX = 22 px`).
- `iconSize` (default 14): icon size in px, passed via `SlotIconContext`. Set icons use 16 px.
- `onDoubleClickItem`: optional double-click handler. A 300 ms timer distinguishes single from double clicks; if a second click arrives within the window, `onDoubleClickItem` fires and the pending single-click is cancelled.

### Slot group double-click

`slotGroupIds(id)` in `gearLens.ts` returns `SLOT_ARMOR_GROUP` (Weapon/Helmet/Shield/Gauntlets/Chestplate/Boots) or `SLOT_ACCESSORY_GROUP` (Ring/Amulet/Banner), derived at module load from `PREFERRED_ARTIFACT_TYPE_ORDER` + `isAccessorySlot`. The Slot donut passes `onDoubleClickItem={selectSlotGroup}` so double-clicking any armor slot selects all armor slots, and any accessory slot selects all accessory slots.

## KPI cards

Eight percentage cards rendered by `GearLensKpiCards` from `computeGearLensKpis`. All values are 0–1 ratios; `null` means the row set is empty (avoids 0/0 confusion).

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

Cards with `polarity = 'negative'` (Vault-locked, Chaos'd) turn amber/red when the value is *high*, because those states warrant attention rather than celebration.

## Main stat / substat drill-down

The Main Stats bar chart (`countMainStatFrequency`) tracks selected stat variants in a separate `selectedMainStats: ReadonlySet<number | string>` — not part of `GearLensDim`. Clicking a main stat bar toggles it; the Substat Frequency chart then filters to rows that have one of the selected main stats (for multi-main heatmap use cases).

`selectedMainStats` selections appear as chips in `GearLensCrossFilterChips` and are cleared by the "Clear" button / `resetKey` increment. `onDeleteMainStat` removes individual chips.

## Cross-filter chip bar

`GearLensCrossFilterChips` renders a flex-wrap chip row with a "Clear filters" button (always visible, disabled when no filter is active). It iterates over every non-empty dimension in `dim` plus `selectedMainStats` to produce labeled chips. Each chip has a per-item delete button that calls the appropriate toggle/delete callback.

## Snapshot export

The "Copy Snapshot" button in the toolbar uses `html-to-image` (`toPng`) to capture the full scrollable tab content. Before capture, it temporarily removes overflow clipping and expands the container to `scrollHeight` so off-screen content is included. After capture, all style mutations are restored. The PNG is written to the clipboard via the Clipboard API (`navigator.clipboard.write`).

## Apply to Gear Inspector

When `onApplyToGearInspector` is provided (by the Logic Hub dialog), the "Apply to Gear Inspector" button calls it with the current `dim`. The parent translates the dim selections into Gear Inspector filter state. The button is wrapped in a `<Tooltip><span>` so the tooltip remains visible even when the button is disabled (disabled MUI buttons don't fire mouse events without a wrapper `<span>`).

## i18n

All user-facing strings use the i18n catalog. Keys live under the `gearLens*` namespace. KPI tooltip strings are catalog-keyed (`gearLensKpi*Tip`). Source category labels (`gearLensSourceInventory` etc.) and outcome labels (`gearLensOutcome*`) are also catalog-driven via lookup maps in `GearLensTabContent.tsx`.

## Reset behavior

`resetKey` (incremented externally by the Logic Hub "Reset to defaults" action) triggers a `useEffect` that restores `dim` to `EMPTY_GEAR_LENS_DIM` and clears `selectedMainStats`. The same clear logic runs when the user clicks the "Clear" button in the cross-filter chip bar.
