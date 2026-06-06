# Gear Database Import

This note tracks the reverse-engineering work required to ingest RSL Helper’s gear database (SQLite) into the Gear Inspector.

## Goals

- Understand every table/column the helper exports so we can map the raw rows into the Sellfile Creator domain models (`src/lib/types.ts`, `src/lib/hsfTypes.ts`).
- Document enumerations (slots, sets, rarities, stats, factions) and reconcile them with the constants we already ship.
- Produce a deterministic importer that can translate the full dataset (~5000 items) into the Gear Inspector without guessing at schema details.

## Inspection Workflow

1. **Clone the database** – work from a copy to avoid mutating the original artifact.
2. **Run the inspection script**:

   ```bash
   python scripts/introspect_gear_db.py /path/to/gear.db --sample 15
   ```

   The script relies on Python’s built-in `sqlite3` module (no extra dependencies). It generates `tmp/gear-db-inspection/<db-name>.schema.json` with:
   - Table schemas (`PRAGMA table_info`)
   - Index metadata (`PRAGMA index_list`/`index_info`)
   - Foreign-key wiring
   - Up to `--sample` rows per table for quick per-column reconnaissance
3. **Review the output** – annotate column purposes, flag unknown enums, and capture value ranges. Store the findings alongside this doc so future runs can diff for schema changes.

## Schema Snapshot (tests/data/sample.db)

| Table | Rows | Notes |
| ----- | ---- | ----- |
| `Artifacts` | 6 900 | Equipped + inventory items; core source for Gear Inspector import. |
| `InboxArtifacts` | 358 | Pending drops in the inbox; same schema as `Artifacts` but `sum*` aggregates are zeroed until equipped. |
| `Champs` | 1 688 | Champion roster, including equipped artifact IDs and faction codes. |
| `LastUsedArtifacts` | varies | Stores `{ id, lastUse }` entries so we can show when a piece was last equipped (local timestamps). |
| `AccRecords` | 218 | Arena/Clan Boss snapshot metadata. Older dumps embedded a `ChampOverviewImage` BLOB here (85 MB of hero renders); RSL Helper's current export omits it, and our fixtures strip it — see [Slimmed export format](#slimmed-export-format). The importer never reads this table. |
| `CBLoot` | 146 | Clan Boss chest history. |
| `ArtifactsBackup`, `LockedArtifacts`, `accessories`, `artifact_ids`, `accessory_ids`, `presets` | 0 | Present but empty in this dump. |

Inspection output lives under `tmp/gear-db-inspection/` and is not committed. The raw fixture we ship for tests lives at `tests/data/sample.db` (renamed from `examples/um109288203_RSLHelper.1.db` so it sits beside the importer specs).

## Slimmed export format

RSL Helper used to embed a `ChampOverviewImage` BLOB column in `AccRecords` — champion-overview screenshots that accounted for ~95 % of every database file (85 MB in the largest dump). The current export drops that column entirely; the four tables the importer reads (`Artifacts`, `InboxArtifacts`, `Champs`, `LastUsedArtifacts`) are unchanged, so the format is loss-free for us.

To keep committed fixtures small we mirror that format: `scripts/test/strip-gear-db-blobs.mjs` drops `AccRecords.ChampOverviewImage` and `VACUUM`s each fixture (idempotent; run with no args to process the default set, or pass explicit paths). This took the repo's `.db` fixtures from ~300 MB to ~9 MB. The `examples/um109288203_RSLHelper.db` fixture is a genuine capture already in the slim format.

## Key Findings

### Slot Mapping

`Artifacts.type` enumerates gear slots with a numbering that differs from our `ArtifactType` enum. Join traces against `Champs` columns yielded:

| DB `type` | Slot | `ArtifactType` constant |
| --------- | ---- | ----------------------- |
| 1 | Helmet | `ArtifactType.Helmet` |
| 2 | Chestplate | `ArtifactType.Chest` |
| 3 | Gauntlets | `ArtifactType.Gloves` |
| 4 | Boots | `ArtifactType.Boots` |
| 5 | Weapon | `ArtifactType.Weapon` |
| 6 | Shield | `ArtifactType.Shield` |
| 7 | Ring | `ArtifactType.Ring` |
| 8 | Amulet | `ArtifactType.Amulet` |
| 9 | Banner | `ArtifactType.Banner` |

Importer code must translate these values before normalizing Gear Inspector entries.

### Stat Identifiers & Scaling

- Stat IDs span `1..8` and align with the major artifact stats:

  | ID | Stat | Percent flag (`*fl` = 0) |
  | -- | ---- | ----------------------- |
  | 1 | HP | `mfl/s?fl = 0` when `%`, `1` when flat |
  | 2 | ATK | ditto |
  | 3 | DEF | ditto |
  | 4 | SPD | always recorded with `*fl = 1` (treated as “flat”) |
  | 5 | RES | `*fl = 1` |
  | 6 | ACC | `*fl = 1` |
  | 7 | CR% | `*fl = 0` |
  | 8 | CDMG% | `*fl = 0` |

- Value columns (`mlvlid`, `s?lvlid`, `sum*`, `ASCLVLID`, etc.) are scaled by `2^32`. Convert via `raw / 4294967296`. For percent stats, multiply the result by 100 to obtain the in-game percentage.
- Glyph bonuses live in the corresponding `*gv` columns; decode them separately from the base values in `*lvlid`. The importer keeps glyph deltas isolated so the UI and rule logic can decide when (or if) to add them.
- Mythical pre-roll bonuses live in the `s?mlvlid` columns; decode them just like the base values, add them to the displayed totals, and retain the deltas (`mythValue`) so the UI can flag which substat received the Mythical boost.
- Roll counts appear in `s?lvl` (recorded as 0–3), while `REROLLCOUNT` tracks forging rerolls (0/1 in this dataset).

### Ascension Metadata

- `ASCLEVEL` stores the ascension tier (0–6 observed).
- `ASCID` matches the stat identifier that received the ascension bonus; `ASCLVLID` is the scaled base value, and `ASCGV` carries the glyph-equivalent delta.

### Faction Codes

Accessories carry a `accset` code that does **not** match our `Faction` enum directly. Mapping confirmed via champion names:

| DB `accset` | Faction | Gear Inspector ID |
| ----------- | ------- | -------------- |
| 0 | Any | `0` |
| 1 | Banner Lords | `Faction.BannerLords` |
| 2 | High Elves | `Faction.HighElves` |
| 3 | Sacred Order | `Faction.SacredOrder` |
| 5 | Ogryn Tribes | `Faction.OgrynTribes` |
| 6 | Lizardmen | `Faction.Lizardmen` |
| 7 | Skinwalkers | `Faction.Skinwalkers` |
| 8 | Orcs | `Faction.Orcs` |
| 9 | Demonspawn | `Faction.Demonspawn` |
| 10 | Undead Hordes | `Faction.UndeadHordes` |
| 11 | Dark Elves | `Faction.DarkElves` |
| 12 | Knight Revenant | `Faction.KnightRevenant` |
| 13 | Barbarians | `Faction.Barbarians` |
| 14 | Sylvan Watchers | `Faction.SylvanWatchers` |
| 15 | Shadowkin | `Faction.Shadowkin` |
| 16 | Dwarves | `Faction.Dwarves` |
| 17 | Argonites | `Faction.Argonites` |

No entries used the canonical `4` (Barbarians) code; importer logic should remap as shown and clamp unknown values to `0`.
Argonites currently assume a new `accset = 17` mapping until a sample database confirms the official code.

### Champion Metadata

The importer captures the following champion-intrinsic fields from `Champs` and the WebSocket `champions` payload, exposing them via `NormalizedGearArtifact` (and `previewExtras` for Gear Inspector cards):

| Field on artifact | SQL column | WebSocket field | Range | Used for |
|---|---|---|---|---|
| `equippedChampionRarity` | `Rarity` | `Rarity` | 1–6 | Icon border colour; primary sort key |
| `equippedChampionAscensionLevel` | derived `HeroID − BaseHeroID` | derived | 0–6 | Slot unlocks (≥5 amulet, =6 banner); roster sort |
| `equippedChampionEmpowermentLevel` | `EmpLvl` | `empower` | 0–4 | Roster sort |
| `equippedChampionAffinity` | `Affinity` | (planned) | 1=Magic, 2=Force, 3=Spirit, 4=Void | Roster sort (`AFFINITY_ROSTER_PRIORITY`: Void > Force > Magic > Spirit) |
| `equippedChampionBlessingGrade` | `BGrade` | `doubleAscend.grade` (nested) | 0–6 | Roster sort. The `B` is "Blessing" / "Double-Ascension" (RSL UI: "Awakening"), **not** "Base" |
| `equippedChampionStarGrade` | `Rang` | `grade` (top level — NOT `doubleAscend.grade`) | 1–6 | Roster sort tail. Current yellow-star count |
| `equippedChampionExperienceLevel` | `Lvl` | `level` | 1–60 | Roster sort tail |
| `equippedChampionBaseId` | `BaseHeroID` | derived from `typeId` as `Math.floor(typeId / 10) * 10` | — | Icon lookup, empirical roster-sort tail (RSL hero-release order) |

None of these affect rule evaluation; they exist for UI display and the Gear Analytics roster sort.

**WebSocket quirks.** `parseChampionRow` (`externalCommands.ts`) iterates `CHAMPION_COLUMN_KEYS` with case-insensitive resolution + a small alias table for fields the helper sends under a different name (e.g. `EmpLvl` ← `empower`). `BGrade` is at the nested path `doubleAscend.grade` — extracted by an explicit fallback at the end of `parseChampionRow`. `Affinity` is **not yet** in the payload; planned to ship under the canonical name `Affinity` with the SQL encoding (1=Magic, 2=Force, 3=Spirit, 4=Void). RSL Helper sends `champions` twice per sync — the second message omits `Name` and `Rarity` — and `upsertChampionRow` (`gearDbLookups.ts`) merges field-by-field so any undefined value preserves the previously-known one (critical so a follow-up message doesn't null out `Affinity` once it's known). See `docs/technical/websocket-jsonrpc.md` § champions for the wire-format details.

### Normalization Helper

- `src/lib/importers/gearDbNormalizer.ts` converts raw rows into a `NormalizedGearArtifact` structure plus a ready-to-use `TestItem`. The helper centralises:
  - Slot translation (`Artifacts.type` → `ArtifactType`) and accessory “no set” handling (`aset = 0` → `ACCESSORY_NO_SET_ID`).
  - Fixed-point decoding with `STAT_SCALE = 2^32`, emitting rounded user-facing numbers (integers for flat stats, 2 decimals for percentages).
  - Mythical pre-roll bonuses from `s?mlvlid` land in `mythValue`; totals shown to users include the pre-roll, and the UI highlights the affected substat so Mythical gear stays legible.
  - Ascension bonuses captured separately (`source = 'ascension'`) so the UI can display them, while rule comparisons ignore them (Gear Inspector `subValues` aggregate only the pre-glyph substat amounts; glyph deltas ride along in `previewExtras.substats[].glyphValue`).
  - Level metadata: `level` keeps the nearest milestone (0/4/8/12/16) used during rule matching, and `exactLevel` stores the clamped raw upgrade level from the database (0–16). When `exactLevel` is present the UI displays that precise value; custom gear entries omit this field and fall back to the milestone label.
  - Accessory faction remapping via the table above, with non-accessory slots forced to `0`.
- Guardrails live in `tests/unit/gearDbNormalizer.test.ts`, using real rows from `tests/data/sample.db` to assert slot, set, faction, and stat decoding (including ascension glyphs).
- Drag-and-drop integration (and the Sellfile Preview “Load RSL Helper Sellfile” button): both accept `.db` files. `src/lib/importers/gearDbImporter.ts` streams the file via `sql.js`, normalizes every row, and queues the resulting gear without forcing the Tools dialog’s Gear tab open.

  Regardless of whether the payload arrived via manual drop or an external `gearDbFile` command, the app diffs the incoming payload against whatever is already rendered. We fingerprint the full gear entry (slot, stats, preview extras, equipped metadata) to decide which rows already exist, remove entries whose fingerprints disappear, retain any pending chunks that are still needed, and only enqueue the delta. Diff application mutates the in-memory Gear Inspector snapshot synchronously before scheduling React state so rapid endpoint bursts cannot compute follow-up diffs from stale rows. Because the UI sorting is deterministic (with artifact id as the final tie-breaker), new items fall into place without thrashing the virtualization chunk size.

  Empty imports leave the current queue untouched and surface `toastGearDbImportEmpty`. Invalid databases fall back to the shared “file format” error dialog so users know we could not detect a supported payload.

  External pushes continue to light up the indicator badge on the history button (left of Load) and emit a compact toast in the top-right corner that auto-dismisses after roughly 3 seconds so the notification never hides the preview controls. The history button’s context menu can hide that success toast while keeping the badge and history entries intact.

  Endpoint push commands are processed strictly in arrival order. The app now waits for the worker pipeline to finish, the HSF preview to commit, and the Gear Inspector grid commit to settle before consuming the next push, preventing overlapping endpoint bursts from racing each other.

  The endpoint toast includes a before/after diff preview (up to 18 items) rendered with scaled Gear Inspector grid cards; any overflow is summarized with a `+X more` footer. Session history entries store the same preview depth (up to 18 items); hover still shows a quick preview, and left-click opens a persistent scrollable popout with an explicit close button for long diffs.

  Timestamp-only `LastUsed` updates are ignored, while source or champion metadata changes still produce a preview card. Endpoint pushes also populate a session-only history menu (icon left of the Load button) that replays the diff preview and offers a Clear History action. The menu keeps up to 2,880 endpoint updates per session (8 hours at 10-second pushes), storing each entry’s capped diff preview in compact JSON and decoding it on demand for display.

## Raw JSON WebSocket events

- Endpoints can skip uploading SQLite blobs entirely by sending `gearDbRawSnapshot` and `gearDbRawDelta` notifications over the WebSocket protocol. See `docs/technical/websocket-jsonrpc.md` for the exact message shapes expected by the UI.
- The snapshot payload ships every row from `Artifacts`, `InboxArtifacts`, `Champs`, and `LastUsedArtifacts`. The UI normalizes those rows through `createDatasetFromSnapshot` (`src/lib/importers/gearDbRawDataset.ts`) and pushes the resulting Gear Inspector queue through the same diff logic as `.db` imports, so users still get the added/removed counts plus the command toast.
- Delta payloads mirror Helper’s SQL mutations (`upsert` or `remove` for each table). The dataset helper applies the operations incrementally, rehydrates champion metadata, and emits a fresh Gear Inspector payload so matcher diffs stay exact even when RSL Helper only changes one row.
- Both commands honor `snapshotId`: when it regresses or is omitted after a prior snapshot, the browser drops the delta and requests a fresh snapshot so endpoints never have to guess which dataset is active.

### Table Relationships

- `Artifacts.cID` points to `Champs.ID` for equipped pieces (3 714 matches in this dump). `0` denotes inventory items.
- `Champs` exposes nine slot columns (`Weapon`, `Helmet`, …, `Banner`) that reference artifact IDs; useful for cross-checking type translations and for optional “currently equipped” flags in the Gear Inspector.
- `InboxArtifacts` mirrors the item schema, enabling us to treat inbox gear as additional candidates once the importer supports it.

## Mapping Checklist

- **Slots & Types** – translate DB `type` values to `ArtifactType` before formatting Gear Inspector entries.
- **Sets** – `aset` already aligns with our `ArtifactSet` catalog (0 denotes “no set”). Handle accessory-only sets (1000–1004) and propagate faction data from `accset`.
- **Stats** – convert `mid`/`s?id` to `StatId` and respect the percent flag when scaling `*lvlid`/`*gv` values.
- **Rarity & Rank** – `rarity` (3–6 observed) and `rank` (5–6) are numeric; map them to the readable labels we expose in SFC/HSF.
- **Factions** – apply the `accset` remapping table above; non-accessories should emit `0` (“Any”).
- **Lifecycle Flags** – capture enhancement levels, roll counts, lock status, and ownership metadata if present; document any fields we ignore so behavior stays intentional.

Write down open questions as you go—especially when sample rows expose partially populated columns or nullable fields our importer has to tolerate.

## Next Steps

1. Expand the sample extraction to cover edge cases (e.g., glyph-enhanced gear, locked items, ascended Mythical pieces).
2. Define a normalization layer (likely a TypeScript helper under `scripts/` or `src/lib/importers/`) that converts the raw rows into our `RuleTesterItem` shape.
3. Add integration tests that load a small fixture DB (redacted/synthetic) and assert the importer emits the same structures as our `.hsf` samples.
4. Wire the normalizer into a DB reader (Python or Node bridge) so the Gear Inspector can ingest whole inventories without manual exports.
5. Update this document—and `docs/TECHNICAL.md`’s index—whenever we uncover new fields or evolve the importer.
### Last-Used Tracking

- RSL Helper now emits a `LastUsedArtifacts` table with two columns:
  - `id` — matches the artifact ID in both `Artifacts` and `InboxArtifacts`.
  - `lastUse` — declared as `REAL` in the shipped schema. SQL.js will surface either trimmed text (older dumps) or floats (Julian day numbers) depending on how the DB was saved.
- The importer now normalizes both shapes: strings are trimmed in-place, while REAL payloads are converted into `YYYY-MM-DD HH:MM:SS.sss` strings using the runtime’s local timezone so the Gear Inspector consumes the same format regardless of source DB quirks. Those strings feed `NormalizedGearArtifact.lastUseLocalTimestamp` plus the Gear Inspector preview extras. The Gear Inspector grid renders the value in a tooltip on the gear icon using the user’s locale.
- REAL conversions only accept values inside the safe Julian range we’ve observed in helper dumps (`[1.7M, 3M]`). Anything else is dropped so bogus payloads cannot poison Gear Inspector filters.
- When the table is missing (older DBs), we simply omit the tooltip—no fallback data is guessed.
- Gear Inspector filters consume this metadata: the `Last used` presets (`Never used`, `≤7d`, `≤30d`, `≤90d`, `>90d`) and the custom day-range popover both evaluate against `lastUseLocalTimestamp`, so any DB without the table automatically treats those rows as “unknown.”
- Helper dumps also ship a sentinel artifact row (ID `-1`, nonsense slot/type) that carries metadata for RSL Helper itself. SQL.js surfaced that as an “artifact,” so the importer now drops any row whose ID ≤ 0 or whose slot mapping is unknown before normalization. Real gear is unaffected, and malformed rows no longer trigger the “File Not Supported” dialog.
