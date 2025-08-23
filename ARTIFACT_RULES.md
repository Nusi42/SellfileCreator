# RSL Helper Artifact Rules

There are 6 slots for artifacts:
'Weapon', 'Helmet', 'Shield',
'Gauntlets', 'Chestplate', 'Boots'

There are 3 slots for accesories:
'Ring', 'Amulet', 'Banner'

Gear is artifacts and accesories.
Gear is also called type or slot because of theit type or slot.

Gear exists in 6 rarities:
Common (gray), Uncommon (green), Rare (blue), Epic (purple), Legendary (Orange), Mythical (Red)

Gear exists in 6 ranks:
1 Star, 2 Star, 3 Star, 4 Star, 5 Star, 6 Star

Gear has a main stat which can be one of these:
HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD

Gear has up to 4 substats which can be one of these:
HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD

Gear can have levels 0 to 16.

The count of substats on gear depends on its level as well as its rarity.
With level 0, the count of substats is this:
Common: 0 substats
Uncommon: 1 substat
Rare: 2 substats
Epic: 3 substats
Legendary: 4 substats
Mythical: 4 substats

When leveling gear, a the value of the main stat is increased. The amount of the increment is a fixed value and depends on the main stat and its rank.
Every 4 levels, that means at level 4, 8, 12, and 16, either a new substat is added, or an existing substat gets a bonus. The amount of the bonus it can get depends on the substat and its rarity. When an existing substat gets a bonus, it is also called "rolled". E.g. "SPD" rolled once means it got a "SPD" bonus at any of the special levels.
Whether a new substat is added, or an existing one gets a bonus depends on its rarity:
Common: It will be created with 0 substats. A new substat will be added at lvl 4, 8, 12, 16.
Uncommon: It will be created with 1 substats. A new substat will be added at lvl 8, 12, 16.
Rare: It will be created with 2 substats. A new substat will be added at lvl 12, 16.
Epic: It will be created with 3 substats. A new substat will be added at lvl 16.
Legendary: It will be created with 4 substats. No substat will be added.
Mythical: It will be created with 4 substats. No substat will be added. Uppon creation one random substat has already a bonus.

No substat occurs more than once on gear.
Gear will never have the same mainstat as substat.

The possible main stat is restricted based on its slot:
Weapon: ATK
Helmet: HP
Shield: DEF
Gauntlets: HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%
Chestplate: HP, HP%, ATK, ATK%, DEF, DEF%, ACC, RES
Boots: HP, HP%, ATK, ATK%, DEF, DEF%, SPD
Ring: ATK, HP, DEF
Amulet: ATK, HP, DEF, CDMG%
Banner: ATK, HP, DEF, ACC, RES

The possible sub stats are restricted based on the slot:
Weapon: HP, HP%, ATK, ATK%, CR%, CDMG%, ACC, RES, SPD
Helmet: HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD
Shield: HP, HP%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD
Gauntlets: HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD
Chestplate: HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD
Boots: HP, HP%, ATK, ATK%, DEF, DEF%, CR%, CDMG%, ACC, RES, SPD
Ring: HP, HP%, ATK, ATK%, DEF, DEF%
Amulet: ATK, HP, DEF, CDMG%, ACC, RES
Banner: HP, HP%, ATK, ATK%, DEF, DEF%, SPD

Minimum substat values for 5 star gear:
HP:    160
HP%:     4%
ATK:    12
ATK%:    4%
DEF:    12
DEF%:    4%
CR%:     4%
CDMG%:   4%
ACC:     7
RES:     7
SPD:     4

Minimum substat values for 6 star gear:
HP:    200
HP%:     5%
ATK:    15
ATK%:    5%
DEF:    15
DEF%:    5%
CR%:     5%
CDMG%:   5%
ACC:     9
RES:     9
SPD:     5

Any time gear hits the level 4, 8, 12, or 16, either a new substat is added, or an existing substat gets a bonus.
The bonus it can get is the same as the minimum value in above table. The maximum values are not specified yet.
If instead of getting a bonus, a new substat is added, its minimum value is like in above table.

Base substat values for 1-4 star gear (temporary for implementation):
Use the 5 star minima minus 1.
HP:    159
HP%:     3%
ATK:    11
ATK%:    3%
DEF:    11
DEF%:    3%
CR%:     3%
CDMG%:   3%
ACC:     6
RES:     6
SPD:     3
