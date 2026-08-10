# Artifact Rules

Static game-domain reference for Raid Shadow Legends gear: slot catalogs, faction
membership, rarity/rank expectations, stat restrictions, leveling/roll behavior,
main/substat tables, and gear sources. This is the *reference data*; how the
builder interprets rank/rarity codes, roll schedules, and minima defaults lives in
[Rules and Data → HSF Semantics](rules-and-data.md#hsf-semantics-as-used-here).

## Gear Slots

- Artifacts: `Weapon`, `Helmet`, `Shield`, `Gauntlets`, `Chestplate`, `Boots`.
- Accessories: `Ring`, `Amulet`, `Banner`.
- The term *gear* covers artifacts and accessories; UI copy uses *type* and *slot* interchangeably.

## Faction Coverage

- Only accessories are faction-locked; artifact pieces ignore faction.
- Faction groups and their member factions:
  - **Telerian League** — Banner Lords, High Elves, Sacred Order, Barbarians.
  - **Gaellen Pact** — Ogryn Tribes, Lizardmen, Skinwalkers, Orcs.
  - **The Corrupted** — Demonspawn, Undead Hordes, Dark Elves, Knight Revenant.
  - **Nyresan Union** — Dwarves, Shadowkin, Sylvan Watchers, Argonites.

## Rarity and Rank

- Rarities: Common (gray), Uncommon (green), Rare (blue), Epic (purple), Legendary (orange), Mythical (red).
- Ranks: 1★ through 6★.
- Any rank can pair with any rarity.

## Stats

- Main stat options: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`.
- Substat options draw from the same list.
- Gear never repeats a substat and never repeats the main stat as a substat.

## Leveling and Rolls

- Gear levels range from 0 to 16.
- Main stat values increase with every level; the increment is fixed per stat + rank.
- At levels 4, 8, 12, and 16 either a new substat is added or an existing substat rolls (gains a bonus):
  - **Common** — starts with 0 substats; adds one at 4/8/12/16.
  - **Uncommon** — starts with 1 substat; adds at 8/12/16.
  - **Rare** — starts with 2 substats; adds at 12/16.
  - **Epic** — starts with 3 substats; adds at 16.
  - **Legendary** — starts with 4 substats; rolls only.
  - **Mythical** — starts with 4 substats and has one pre-rolled bonus at level 0; rolls only afterward.
- When a substat rolls, the game applies a bonus from a stat- and rank-specific range (e.g., 6★ SPD gains +5 or +6). Builder heuristics anchor on the documented minimum values but higher rolls are possible.

## Main Stat by Slot

- `Weapon`: `ATK`
- `Helmet`: `HP`
- `Shield`: `DEF`
- `Gauntlets`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`
- `Chestplate`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `ACC`, `RES`
- `Boots`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `SPD`
- `Ring`: `ATK`, `HP`, `DEF`
- `Amulet`: `ATK`, `HP`, `DEF`, `CDMG%`
- `Banner`: `ATK`, `HP`, `DEF`, `ACC`, `RES`

## Substat by Slot

- `Weapon`: `HP`, `HP%`, `ATK%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD` (no flat `ATK` — that is the fixed main)
- `Helmet`: `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD` (no flat `HP` — that is the fixed main)
- `Shield`: `HP`, `HP%`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD` (no flat `DEF` — that is the fixed main)
- `Gauntlets`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Chestplate`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Boots`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `CR%`, `CDMG%`, `ACC`, `RES`, `SPD`
- `Ring`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`
- `Amulet`: `ATK`, `HP`, `DEF`, `CDMG%`, `ACC`, `RES`
- `Banner`: `HP`, `HP%`, `ATK`, `ATK%`, `DEF`, `DEF%`, `SPD`

## Substat Minimum Values

| Rank | HP | HP% | ATK | ATK% | DEF | DEF% | CR% | CDMG% | ACC | RES | SPD |
| ---- | -- | --- | --- | ---- | --- | ---- | --- | ----- | --- | --- | --- |
| 6★   | 200 | 5% | 15 | 5% | 15 | 5% | 5% | 5% | 9 | 9 | 5 |
| 5★   | 135 | 4% | 12 | 4% | 12 | 4% | 4% | 4% | 8 | 8 | 4 |
| 4★   | 97  | 3% | 7  | 3% | 7  | 3% | 3% | 3% | 6 | 6 | 3 |
| 3★   | 79  | 2% | 5  | 2% | 5  | 2% | 2% | 2% | 5 | 5 | 2 |
| 2★   | 50  | 1% | 4  | 1% | 4  | 1% | 2% | 2% | 4 | 4 | 1 |
| 1★   | 43  | 1% | 4  | 1% | 4  | 1% | 1% | 1% | 3 | 3 | 1 |

- These are the **minimum** (single-roll) values per rank — the `.min` of each per-roll range. Actual in-game rolls fall anywhere in the `[min, max]` band and can exceed them; a substat added at a level milestone enters at least at its minimum.
- **Validated against the example DB fixtures** (`examples/**/*.db`, ~75k artifacts): grouping every unrolled substat (`rolls == 0`, base value excluding glyphs) by rank confirms the 6★ row exactly (HP≥200, SPD 5–6, ACC/RES 9–12, all others as listed). The 5★ HP floor is the DB-observed **135** (the constants were set to 135 to match). Low-star floors are thin in the data and drift by a unit (e.g. 2★ SPD floors at 2, not 1; 1★ RES at 2), so treat 1–4★ as estimates.
- This table is a human-readable snapshot. The live SSOT is `SUBSTAT_ROLL_RANGES_BY_STAR` in `src/lib/generated/domainConstants.ts` (generated from `shared/domain-constants.json`), whose `.min` values feed `defaultSubstatTargets()` (`src/lib/hsfBuilder.ts`). See [Rules and Data → HSF Semantics](rules-and-data.md#hsf-semantics-as-used-here). If the generated constants change, treat them — not this table — as authoritative.

## Main Stat Values (fully leveled, +16)

The main stat's fully-leveled value depends **only on rank and slot** — rarity does not affect it (it scales linearly from level 0 to the +16 value below). **Verified per slot** against every level-16 artifact in the example DBs (`examples/**/*.db`): each rank×slot×stat value is single-valued (zero spread) across the whole sample, e.g. 6★ Boots SPD = 45 across 1857 pieces, and HP-flat = 4080 on every 6★ artifact slot that rolls it. Rows for 4–6★ equal the `MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT` code SSOT exactly; 1–3★ (not in code) are DB-observed and blank where the fixtures have no example.

The flat HP/ATK/DEF cap and the percent caps are **uniform across artifact slots** for a given rank — only **Banner** (accessory) has higher flat caps. So the values factor into two tables.

**Flat HP / ATK / DEF main (all slots except Banner), and Banner separately:**

| Rank | HP (Helmet/Ring/Amulet/…) | ATK (Weapon/Ring/…) | DEF (Shield/Ring/…) | Banner HP | Banner ATK | Banner DEF |
| ---- | --- | --- | --- | --- | --- | --- |
| 6★ | 4080 | 265 | 265 | 6120 | 398 | 398 |
| 5★ | 3480 | 225 | 225 | 5220 | 338 | 338 |
| 4★ | 2840 | 190 | 190 | 4260 | 285 | 285 |
| 3★ | 2300 | 155 | 155 | — | — | 233 |
| 2★ | 1820 | 120 | 120 | — | — | — |
| 1★ | 1340 | 90 | 90 | — | — | — |

**Percent & special mains** (each appears only on the slots noted; caps are the same wherever the stat is a valid main):

| Rank | HP% / ATK% / DEF% | CR% (Gauntlets) | CDMG% (Gauntlets) | CDMG% (Amulet) | ACC / RES (Chest/Banner) | SPD (Boots) |
| ---- | --- | --- | --- | --- | --- | --- |
| 6★ | 60% | 60% | 80% | 40% | 96 | 45 |
| 5★ | 50% | 50% | 65% | 33% | 78 | 40 |
| 4★ | 40% | 40% | 49% | 25% | 64 | 35 |
| 3★ | 30% | 30% | 40% | 20% | 49 | 30 |

- Which stat is a valid main on which slot is in [Main Stat by Slot](#main-stat-by-slot): `CR%` only Gauntlets; `CDMG%` Gauntlets (80% at 6★) and Amulet (40% at 6★); `SPD` only Boots; `ACC`/`RES` only Chestplate and Banner.
- SSOT: `MAIN_STAT_MAX16_BY_RANK_SLOT_VARIANT` (`src/lib/generated/domainConstants.ts`, keyed rank → slot → stat variant; ranks 4–6 only). The 1–3★ rows here are reference-only (DB-observed), not code-backed.

## Glyph Enchantment (6★)

Glyphs add a bonus to an existing substat (never `CR%`/`CDMG%` — those are non-glyphable). The per-glyph-level range for 6★ gear, from `GLYPH_RANGES_BY_RANK[6]` (`src/lib/generated/domainConstants.ts`):

| Stat | HP | HP% | ATK | ATK% | DEF | DEF% | CR% | CDMG% | ACC | RES | SPD |
| ---- | -- | --- | --- | ---- | --- | ---- | --- | ----- | --- | --- | --- |
| 6★ glyph | 250–750 | 3–8% | 30–40 | 3–8% | 30–40 | 3–8% | — | — | 6–16 | 6–16 | 3–8 |

- `CR%`/`CDMG%` carry no glyph bonus (absent from the table) — the code excludes them, matching in-game legality (see [Rules and Data → HSF Semantics](rules-and-data.md#hsf-semantics-as-used-here)).
- Lower ranks have their own `GLYPH_RANGES_BY_RANK` entries (1–5); only 6★ is reproduced here since it is the relevant tier for sell decisions. The generated constant is the SSOT.
- The app scores glyph potential rank-capped in the safeguard/normalized-sort math; the mechanics live in [Application Behavior → Safeguards State](app-behavior.md#safeguards-state).

## Anomalous Accessories (Update 11.70 — provisional)

- A new accessory type from the Champion Proving Grounds whose substats can be
  mode-scoped damage boons (PvE/PvP/Boss/Dungeon, damage dealt or taken)
  instead of the classic flat stats, while keeping the parent set bonus.
- Announced set scope: Stone Skin, Protection, Supersonic, Merciless,
  Bloodshield, Reaction, Revenge, Refresh, Cleansing.
- The stat tables in this document do **not** cover these substats yet — real
  ids, ranges, and serialization are unknown. The placeholder data layer and
  the full known/unknown ledger live in
  [Anomalous Accessories](anomalous-accessories.md) (grep marker:
  `PROVISIONAL(anomalous)`).

## Gear and its sources

**"# for Set"** is how many pieces the set bonus needs: `2` and `4` are fixed set sizes; `1–9` marks the variable per-piece sets whose bonus grows one step at a time from 1 up to 9 pieces (Hydra / seasonal / event sets); `1` marks the single-piece accessory sets (Refresh, Cleansing, Bloodshield, Reaction, Revenge — accessory slots only). The SSOT for every set's piece count is `setDescriptions.ts` (`pieces`); the numeric set IDs live in `src/lib/artifactSets.ts`.

| Artifact | \# for Set | Location |
| --- | --- | --- |
| LIFE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Kaerok Castle  <br>MARKET |
| DEFENSE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Catacombs of Narbuk  <br>MARKET |
| RESISTANCE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Tilshire  <br>MARKET |
| OFFENSE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Sewers of Arnoc  <br>MARKET |
| CRITICAL RATE | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Durham Forest  <br>MARKET  <br>EVENT DUNGEON |
| RETALIATION | 2   | DUNGEON - Ice Golem’s Peak  <br>CAMPAIGN - Godfrey's Crossing  <br>MARKET |
| REFLEX | 4   | DUNGEON - Ice Golem’s Peak |
| CURSED | 4   | DUNGEON - Ice Golem’s Peak |
| PROVOKE | 4   | DUNGEON - Ice Golem’s Peak |
| FROST | 4   | DUNGEON - Dragon's Lair |
| TOXIC | 4   | DUNGEON - Dragon's Lair |
| DAZE | 4   | DUNGEON - Dragon's Lair  <br>MARKET  <br>EVENT DUNGEON |
| AVENGING | 4   | DUNGEON - Dragon's Lair |
| STALWART | 4   | DUNGEON - Dragon's Lair |
| ACCURACY | 2   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Felwin's Gate  <br>MARKET  <br>EVENT DUNGEON |
| SPEED | 2   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Palace of Aravia  <br>MARKET |
| LIFESTEAL | 4   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Valdemar Strait  <br>MARKET |
| DESTROY | 4   | DUNGEON - Dragon's Lair  <br>CAMPAIGN - Deadlands |
| FRENZY | 4   | DUNGEON - Fire Knight's Castle |
| STUN | 4   | DUNGEON - Fire Knight's Castle |
| IMMUNITY | 4   | DUNGEON - Fire Knight's Castle |
| SAVAGE | 4   | DUNGEON - Fire Knight's Castle |
| REGENERATION | 4   | DUNGEON - Fire Knight's Castle |
| FURY | 4   | DUNGEON - Fire Knight's Castle  <br>CAMPAIGN - Hallowed Halls |
| CURING | 4   | DUNGEON - Fire Knight's Castle  <br>CAMPAIGN - Brimstone Path  <br>MARKET  <br>EVENT DUNGEON |
| CRIT DAMAGE | 2   | DUNGEON - Fire Knight's Castle  <br>EVENT DUNGEON |
| SHIELD | 4   | DUNGEON - Fire Knight's Castle  <br>MARKET |
| CRUEL | 2   | DEMON LORD - Demon Lord Chests |
| IMMORTAL | 2   | DEMON LORD - Demon Lord Chests |
| DIVINE LIFE | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| DIVINE CRITICAL RATE | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| DIVINE OFFENSE | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| DIVINE SPEED | 2   | CLASSIC ARENA - Bronze, Silver, and Gold Tier Weekly Chests  <br>GREAT HALL - Gold Medal Chests |
| SWIFT PARRY | 1–9 | CLASSIC ARENA - Platinum Tier Weekly Chests  <br>FORGE - Materials from Faction Wars, Classic Arena, and Events/Tournaments |
| DEFLECTION | 1–9 | CLASSIC ARENA - Platinum Tier Weekly Chests  <br>FORGE - Materials from Faction Wars, Classic Arena, and Events/Tournaments |
| RESILIENCE | 2   | FORGE - Materials from Faction Wars and Classic Arena |
| PERCEPTION | 2   | FORGE - Materials from Faction Wars and Classic Arena |
| FATAL | 2   | FORGE - Materials from Classic Arena and the Magma Dragon |
| AFFINITYBREAKER | 4   | FORGE - Materials from Classic Arena and the Nether Spider |
| UNTOUCHABLE | 4   | FORGE - Materials from Classic Arena and the Scarab King |
| FROSTBITE | 2   | FORGE - Materials from Classic Arena and the Frost Spider |
| BLOODTHIRST | 4   | FORGE - Materials from Classic Arena and the Eternal Dragon |
| GUARDIAN | 4   | FORGE - Materials from Classic Arena and the Celestial Griffin |
| RELENTLESS | 4   | TOURNAMENTS - Tournament Rewards |
| FORTITUDE | 2   | FORGE - Materials from Classic Arena and Bommal the Dreadhorn |
| LETHAL | 4   | FORGE - Materials from Classic Arena and the Dark Fae |
| STONESKIN | 1–9 | HYDRA - Hydra Chests & Hydra Clash Chests |
| PROTECTION | 1–9 | HYDRA - Hydra Chests & Hydra Clash Chests |
| KILLSTROKE | 2   | CLAN SHOP - Artifact Chests |
| INSTINCT | 4   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| BOLSTER | 4   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| DEFIANT | 2   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| IMPULSE | 2   | LIVE ARENA - Live Arena Chests |
| ZEAL | 2   | LIVE ARENA - Live Arena Chests |
| RIGHTEOUS | 2   | RAID: CALL OF THE ARBITER - Reward for episode views  <br>FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| SUPERSONIC | 1–9 | CURSED CITY - Cursed Chests |
| MERCILESS | 1–9 | CURSED CITY - Cursed Chests |
| SLAYER | 1–9 | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| FERAL | 1–9 | SIEGE - Milestone Rewards |
| PINPOINT | 1–9 | EVENT DUNGEON |
| STONECLEAVER | 1–9 | LIVE ARENA - Seasonal Milestone Rewards and Seasonal Chests |
| REBIRTH | 1–9 | LIVE ARENA - Seasonal Milestone Rewards and Seasonal Chests |
| CHRONOPHAGE | 1–9 | EVENT DUNGEON |
| MERCURIAL | 1–9 | GRIM FOREST |
| REFRESH | 1   | _Accessory set (Amulet/Ring/Banner only)_  <br>BAZAAR - 3v3 Classic Arena Bazaar |
| CLEANSING | 1   | _Accessory set (Amulet/Ring/Banner only)_  <br>BAZAAR - 3v3 Classic Arena Bazaar |
| BLOODSHIELD | 1   | _Accessory set (Amulet/Ring/Banner only)_  <br>CLAN VS CLAN - Tournament Rewards |
| REACTION | 1   | _Accessory set (Amulet/Ring/Banner only)_  <br>CLAN VS CLAN - Tournament Rewards |
| REVENGE | 1   | _Accessory set (Amulet/Ring/Banner only)_  <br>CLAN SHOP - Accessory Chests |
