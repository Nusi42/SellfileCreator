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
| 5★   | 136 | 4% | 12 | 4% | 12 | 4% | 4% | 4% | 8 | 8 | 4 |
| 4★   | 97  | 3% | 7  | 3% | 7  | 3% | 3% | 3% | 6 | 6 | 3 |
| 3★   | 79  | 2% | 5  | 2% | 5  | 2% | 2% | 2% | 5 | 5 | 2 |
| 2★   | 50  | 1% | 4  | 1% | 4  | 1% | 2% | 2% | 4 | 4 | 1 |
| 1★   | 43  | 1% | 4  | 1% | 4  | 1% | 1% | 1% | 3 | 3 | 1 |

- These are the **minimum** (single-roll) values per rank — the `.min` of each per-roll range. Actual in-game rolls fall anywhere in the `[min, max]` band and can exceed them; a substat added at a level milestone enters at least at its minimum.
- The 6★ row is high-confidence; lower-star rows are community-sourced estimates.
- This table is a human-readable snapshot. The live SSOT is `SUBSTAT_ROLL_RANGES_BY_STAR` in `src/lib/generated/domainConstants.ts` (generated from `shared/domain-constants.json`), whose `.min` values feed `defaultSubstatTargets()` (`src/lib/hsfBuilder.ts`). See [Rules and Data → HSF Semantics](rules-and-data.md#hsf-semantics-as-used-here). If the generated constants change, treat them — not this table — as authoritative.

## Gear and its sources

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
| SWIFT PARRY | 4   | CLASSIC ARENA - Platinum Tier Weekly Chests  <br>FORGE - Materials from Faction Wars, Classic Arena, and Events/Tournaments |
| DEFLECTION | 4   | CLASSIC ARENA - Platinum Tier Weekly Chests  <br>FORGE - Materials from Faction Wars, Classic Arena, and Events/Tournaments |
| RESILIENCE | 2   | FORGE - Materials from Faction Wars and Classic Arena |
| PERCEPTION | 2   | FORGE - Materials from Faction Wars and Classic Arena |
| FATAL | 2   | FORGE - Materials from Classic Arena and the Magma Dragon |
| AFFINITYBREAKER | 4   | FORGE - Materials from Classic Arena and the Nether Spider |
| UNTOUCHABLE | 4   | FORGE - Materials from Classic Arena and the Scarab King |
| FROSTBITE | 4   | FORGE - Materials from Classic Arena and the Frost Spider |
| BLOODTHIRST | 4   | FORGE - Materials from Classic Arena and the Eternal Dragon |
| GUARDIAN | 4   | FORGE - Materials from Classic Arena and the Celestial Griffin |
| RELENTLESS | 4   | TOURNAMENTS - Tournament Rewards |
| FORTITUDE | 2   | FORGE - Materials from Classic Arena and Bommal the Dreadhorn |
| LETHAL | 4   | FORGE - Materials from Classic Arena and the Dark Fae |
| STONE SKIN | 9   | HYDRA - Hydra Chests & Hydra Clash Chests |
| PROTECTION | 9   | HYDRA - Hydra Chests & Hydra Clash Chests |
| KILLSTROKE | 2   | CLAN SHOP - Artifact Chests |
| INSTINCT | 4   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| BOLSTER | 4   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| DEFIANT | 2   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| IMPULSE | 2   | LIVE ARENA - Live Arena Chests |
| ZEAL | 2   | LIVE ARENA - Live Arena Chests |
| RIGHTEOUS | 2   | RAID: CALL OF THE ARBITER - Reward for episode views  <br>FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| SUPERSONIC | 9   | CURSED CITY - Cursed Chests |
| MERCILESS | 9   | CURSED CITY - Cursed Chests |
| SLAYER | 9   | FORGE PASS - Final Reward from Gold Pass  <br>FORGE - Materials from the Forge Pass |
| FERAL | 9   | SIEGE - Milestone Rewards |
| PINPOINT | 9   | EVENT DUNGEON |
| STONECLEAVER | 9   | LIVE ARENA - Seasonal Milestone Rewards and Seasonal Chests |
| REBIRTH | 9   | LIVE ARENA - Seasonal Milestone Rewards and Seasonal Chests |
| CHRONOPHAGE | 9   | EVENT DUNGEON |
| MERCURIAL | 9   | GRIM FOREST |
