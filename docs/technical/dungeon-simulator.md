# Dungeon Simulator

The Logic Hub now includes a **Dungeon Drops** tab that simulates dungeon farming outcomes using the current HSF rule set.

## Data Sources

- Set availability is derived from the dungeon/set mapping in `docs/TECHNICAL.md` (Ice Golem, Fire Knight, Dragon, Spider).
- Drop tables are sourced from the images under `docs/` (`Dungeons_LootTable_DropRates.jpg`, `Dungeons_LootTable_DropRates_Hard.jpg`, `SpiderDen_LootTable_DropRate.jpg`).
- Reference sources: Ayumilove loot table page (retrieved **2026-02-08**) and Tyrauku video (published **2024-08-22**).
- Event dungeon drop anchors are sourced from `docs/EventDungeonDropRate.jpg` (Stage 20/24/30).

## Simulation Defaults

- Runs per dungeon stage: **100000** (fixed, non-configurable).
- Worker fallback (no worker support) uses **500** runs per dungeon to keep the UI responsive.
- Simulation runs in a worker and streams updates every **250** runs (throttled to at most once per second).
- Levels evaluated: **+0 / +4 / +8 / +12 / +16**.
- Stage selection is per dungeon and persisted in localStorage.
- Standard dungeons allow Normal **1–25** / Hard **1–10** (default **Hard 10**).
- Event dungeon allows Normal **1–30** only (default **Normal 30**).
- Dungeon tables start collapsed; collapse state is persisted.
- Set drop rates are treated as equal across all sets for a dungeon (except Event spotlight/non-spotlight split).
- Ice Golem / Fire Knight / Dragon drop artifacts only.
- Spider drops accessories only with the **No Gear-Set** sentinel.
- Event drops artifacts **and** accessories with the **No Gear-Set** sentinel for accessories.
- Event spotlight set can be toggled between **Chronophage** and **Pinpoint** (same spotlight rate).
- Event non-spotlight artifacts are split evenly across **Critical Rate / Accuracy / Curing / Daze / Critical Damage**.
- Event spotlight toggles reuse cached results: both spotlights are simulated in the same run so switching is instant.

## Stage Weights

- Normal-mode rank/rarity weights come from `Dungeons_LootTable_DropRates.jpg`.
- Hard-mode rank/rarity weights come from `Dungeons_LootTable_DropRates_Hard.jpg`.
- Event spotlight/accessory/5★/6★ rates are linearly interpolated between Stage **20 → 24 → 30** anchors.
- Event spotlight/accessory anchors clamp to the nearest known stage outside **20–30**.
- Event rarity uses normal tables through Stage **25**, then blends hard-mode tables for Stage **26–30**.

## Stat Generation

- Slot-specific main stat and substat pools use the shared catalogs in `src/lib/types.ts`.
- Substat roll timing follows the rarity schedule documented in `docs/TECHNICAL.md` (Common → Mythical).
- Substat values use the current **Substat Targets** minima for the item’s star rank.
- Mythical items apply the documented pre-roll at level 0.

## Keep Evaluation

- Each simulated item is evaluated against the merged HSF rules (including Final Sell + Keep Uniques).
- A cell’s keep percentage reflects **kept items / total simulated drops** for that dungeon stage.
- Collapsed tables show the **kept at any level** share (kept at least once across +0/+4/+8/+12/+16).
- The popover breakdown lists slot + main stat combinations as a share of all drops for that cell.
