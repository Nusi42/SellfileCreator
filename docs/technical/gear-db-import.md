# Gear Database Import

This note tracks the reverse-engineering work required to ingest RSL Helper’s gear database (SQLite) into the Rule Tester.

## Goals

- Understand every table/column the helper exports so we can map the raw rows into the Sellfile Creator domain models (`src/lib/types.ts`, `src/lib/hsfTypes.ts`).
- Document enumerations (slots, sets, rarities, stats, factions) and reconcile them with the constants we already ship.
- Produce a deterministic importer that can translate the full dataset (~5000 items) into the Rule Tester without guessing at schema details.

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

## Schema Snapshot (tests/sample.db)

| Table | Rows | Notes |
| ----- | ---- | ----- |
| `Artifacts` | 6 900 | Equipped + inventory items; core source for Rule Tester import. |
| `InboxArtifacts` | 358 | Pending drops in the inbox; same schema as `Artifacts` but `sum*` aggregates are zeroed until equipped. |
| `Champs` | 1 688 | Champion roster, including equipped artifact IDs and faction codes. |
| `AccRecords` | 218 | Arena/Clan Boss snapshot metadata with binary hero renders. |
| `CBLoot` | 146 | Clan Boss chest history. |
| `ArtifactsBackup`, `LockedArtifacts`, `accessories`, `artifact_ids`, `accessory_ids`, `presets` | 0 | Present but empty in this dump. |

The inspection output is stored at `tmp/gear-db-inspection/um109288203_RSLHelper.schema.json`. The raw fixture we ship for tests lives at `tests/sample.db` (renamed from `examples/um109288203_RSLHelper.1.db` so it sits beside the importer specs), and a deliberately corrupted copy sits at `tests/broken.db` for negative test coverage.

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

Importer code must translate these values before normalizing Rule Tester entries.

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
- Glyph bonuses live in the corresponding `*gv` columns; add them (after scaling) to the base values from `*lvlid` when reconstructing totals.
- Roll counts appear in `s?lvl` (recorded as 0–3), while `REROLLCOUNT` tracks forging rerolls (0/1 in this dataset).

### Ascension Metadata

- `ASCLEVEL` stores the ascension tier (0–6 observed).
- `ASCID` matches the stat identifier that received the ascension bonus; `ASCLVLID` is the scaled base value, and `ASCGV` carries the glyph-equivalent delta.

### Faction Codes

Accessories carry a `accset` code that does **not** match our `Faction` enum directly. Mapping confirmed via champion names:

| DB `accset` | Faction | Rule Tester ID |
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

No entries used the canonical `4` (Barbarians) code; importer logic should remap as shown and clamp unknown values to `0`.

### Normalization Helper

- `src/lib/importers/gearDbNormalizer.ts` converts raw rows into a `NormalizedGearArtifact` structure plus a ready-to-use `TestItem`. The helper centralises:
  - Slot translation (`Artifacts.type` → `ArtifactType`) and accessory “no set” handling (`aset = 0` → `ACCESSORY_NO_SET_ID`).
  - Fixed-point decoding with `STAT_SCALE = 2^32`, emitting rounded user-facing numbers (integers for flat stats, 2 decimals for percentages).
  - Ascension bonuses captured separately (`source = 'ascension'`) so the UI can display them, while rule comparisons ignore them (tester `subValues` only aggregate substats/glyphs).
  - Level metadata: `level` keeps the nearest milestone (0/4/8/12/16) used during rule matching, and `exactLevel` stores the clamped raw upgrade level from the database (0–16). When `exactLevel` is present the UI displays that precise value; manual tester rows omit this field and fall back to the milestone label.
  - Accessory faction remapping via the table above, with non-accessory slots forced to `0`.
- Guardrails live in `tests/gearDbNormalizer.test.ts`, using real rows from `tests/sample.db` to assert slot, set, faction, and stat decoding (including ascension glyphs).
- Drag-and-drop integration (and the Sellfile Preview “Load RSL Helper Sellfile” button): both accept `.db` files. `src/lib/importers/gearDbImporter.ts` streams the file via `sql.js`, normalizes every row, and queues the resulting tester items without forcing the Rule Tester dialog open. Regardless of whether the payload arrived via manual drop or an external `gearDbFile` command, the app now diffs the incoming tester payload against whatever is already rendered: we fingerprint the full tester row (slot, stats, preview extras, equipped metadata) to decide which rows already exist, remove rows whose fingerprints disappear, retain any pending chunks that are still needed, and only enqueue the delta. Because the UI sorting is deterministic the new items fall into place without thrashing the virtualization chunk size. Empty imports leave the current queue untouched and surface `toastGearDbImportEmpty`. Invalid databases fall back to the shared “file format” error dialog so users know we could not detect a supported payload.

### Table Relationships

- `Artifacts.cID` points to `Champs.ID` for equipped pieces (3 714 matches in this dump). `0` denotes inventory items.
- `Champs` exposes nine slot columns (`Weapon`, `Helmet`, …, `Banner`) that reference artifact IDs; useful for cross-checking type translations and for optional “currently equipped” flags in the Rule Tester.
- `InboxArtifacts` mirrors the item schema, enabling us to treat inbox gear as additional candidates once the importer supports it.

## Mapping Checklist

- **Slots & Types** – translate DB `type` values to `ArtifactType` before formatting Rule Tester entries.
- **Sets** – `aset` already aligns with our `ArtifactSet` catalog (0 denotes “no set”). Handle accessory-only sets (1000–1004) and propagate faction data from `accset`.
- **Stats** – convert `mid`/`s?id` to `StatId` and respect the percent flag when scaling `*lvlid`/`*gv` values.
- **Rarity & Rank** – `rarity` (3–6 observed) and `rank` (5–6) are numeric; map them to the readable labels we expose in HSFC/HSF.
- **Factions** – apply the `accset` remapping table above; non-accessories should emit `0` (“Any”).
- **Lifecycle Flags** – capture enhancement levels, roll counts, lock status, and ownership metadata if present; document any fields we ignore so behavior stays intentional.

Write down open questions as you go—especially when sample rows expose partially populated columns or nullable fields our importer has to tolerate.

## Next Steps

1. Expand the sample extraction to cover edge cases (e.g., glyph-enhanced gear, locked items, ascended Mythical pieces).
2. Define a normalization layer (likely a TypeScript helper under `scripts/` or `src/lib/importers/`) that converts the raw rows into our `RuleTesterItem` shape.
3. Add integration tests that load a small fixture DB (redacted/synthetic) and assert the importer emits the same structures as our `.hsf` samples.
4. Wire the normalizer into a DB reader (Python or Node bridge) so the Rule Tester can ingest whole inventories without manual exports.
5. Update this document—and `docs/TECHNICAL.md`’s index—whenever we uncover new fields or evolve the importer.
