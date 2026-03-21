# Sell File Comparison: February 2026 vs March 2026

Compares the sell files from 22 February 2026 (`-260220`) with the updated versions
from 22 March 2026 (`-260322`).

---

## What changed

### Lategame

| What | Old (Feb 2026) | New (Mar 2026) |
| --- | --- | --- |
| **5★ gear** | Both 5★ and 6★ gear were evaluated for keeps | Only 6★ gear is fully evaluated; most 5★ is sold unless it has a Speed substat |
| **Speed-substat gear** | Only 6★ pieces were checked for Speed substat potential | All star levels are checked — more drops are held in early upgrade levels |
| **Impulse / Zeal sets** | Protected | Sold |

The biggest practical difference is **Speed-substat gear**: the new sell file holds on to
more drops at +0 / +4 / +8 to give them a chance to show their Speed substat. Pieces
that do not develop good substats by +12 are sold just as before — final keep-rates at
+12 and +16 are nearly unchanged (see the delta table below).

**Impulse and Zeal sets** are no longer protected. If you are still working through the
Marius missions and want those sets kept, use the Lategame recipe in RSL Helper Sellfile
Creator to generate a customised sell file with that option turned on.

### Endgame

| What | Old (Feb 2026) | New (Mar 2026) |
| --- | --- | --- |
| **Speed-substat gear** | Only 6★ pieces were checked for Speed substat potential | All star levels are checked |
| **Utility sets** (Stun, Toxic, Provoke…) | Kept from any upgrade level | Only level 16 pieces are kept |
| **Zeal / Impulse / Feral sets** | Sold | Level 16 pieces are kept |
| **Substat requirements** | Moderate | Stricter — more pieces are sold between +8 and +12 |

The Speed-substat change pushes keep-rates up noticeably at +4 / +8. At the same time,
utility and PvP-adjacent sets (Stun, Toxic, Zeal, Impulse, etc.) are no longer held from
the start — only pieces that survive to level 16 with good stats are protected. The net
result is slightly lower keep-rates at +0 and at +12 / +16 compared to February, with a
larger bulge in the +4 / +8 window.

---

## Dungeon drop simulation

Each percentage shows how many drops out of 100 this sell file would **protect** at
that upgrade level. Simulation uses 10 000 runs per configuration, level-up mode
(a drop stops advancing once the sell file would auto-sell it, mirroring in-game
rolling behavior). (Monte Carlo; results vary by ±0.1–0.3 pp across runs.)

Plain columns show the **average across all sets** that drop in that dungeon.
Boost columns (3×) show the keep-rate for **that one boosted set only**
(out of all dungeon runs, not just runs where that set dropped).

---

### Lategame — old (Feb 2026)

#### Fire Knight

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Savage N20 | 3× Savage N25 | 3× Savage H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 2.9% | 5.2% | 6.7% | 1.3% | 2.0% | 2.6% |
| +4 | 1.9% | 3.4% | 4.4% | 1.2% | 1.8% | 2.3% |
| +8 | 1.2% | 2.5% | 3.3% | 1.0% | 1.4% | 1.9% |
| +12 | 0.9% | 2.0% | 2.5% | 0.7% | 1.0% | 1.5% |
| +16 | 0.9% | 1.7% | 2.2% | 0.5% | 0.9% | 1.2% |

#### Dragon

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Speed N20 | 3× Speed N25 | 3× Speed H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 3.1% | 5.4% | 7.1% | 2.5% | 3.9% | 4.8% |
| +4 | 1.9% | 3.3% | 4.6% | 2.0% | 3.2% | 3.9% |
| +8 | 1.1% | 2.1% | 3.0% | 1.0% | 1.5% | 2.0% |
| +12 | 0.9% | 1.6% | 2.1% | 0.7% | 0.9% | 1.3% |
| +16 | 0.8% | 1.5% | 1.9% | 0.6% | 0.9% | 1.1% |

#### Ice Golem (no boost)

| Gear level | Normal 20 | Normal 25 | Hard 10 |
| --- | :---: | :---: | :---: |
| +0 | 1.7% | 2.8% | 4.2% |
| +4 | 0.8% | 1.7% | 2.6% |
| +8 | 0.6% | 1.1% | 1.8% |
| +12 | 0.5% | 0.9% | 1.5% |
| +16 | 0.4% | 0.8% | 1.2% |

---

### Lategame — new (Mar 2026)

#### Fire Knight

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Savage N20 | 3× Savage N25 | 3× Savage H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 3.4% | 6.0% | 7.9% | 2.4% | 3.8% | 4.7% |
| +4 | 2.9% | 5.1% | 6.4% | 1.8% | 3.0% | 3.7% |
| +8 | 2.3% | 4.3% | 5.4% | 1.0% | 1.7% | 2.1% |
| +12 | 0.9% | 1.8% | 2.3% | 0.6% | 0.8% | 1.0% |
| +16 | 0.9% | 1.7% | 2.1% | 0.5% | 0.8% | 0.9% |

#### Dragon

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Speed N20 | 3× Speed N25 | 3× Speed H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 3.1% | 5.4% | 7.8% | 2.5% | 3.9% | 4.8% |
| +4 | 2.6% | 4.5% | 6.1% | 2.0% | 3.2% | 3.9% |
| +8 | 2.1% | 3.7% | 5.2% | 1.1% | 1.7% | 2.1% |
| +12 | 1.0% | 1.7% | 2.2% | 0.7% | 1.0% | 1.3% |
| +16 | 1.0% | 1.6% | 2.1% | 0.6% | 0.9% | 1.1% |

#### Ice Golem (no boost)

| Gear level | Normal 20 | Normal 25 | Hard 10 |
| --- | :---: | :---: | :---: |
| +0 | 1.7% | 2.9% | 4.7% |
| +4 | 1.5% | 2.5% | 3.6% |
| +8 | 1.4% | 2.3% | 3.3% |
| +12 | 0.5% | 1.0% | 1.4% |
| +16 | 0.5% | 0.9% | 1.4% |

#### Lategame keep-rate change (new − old, percentage points)

Positive values mean the new sell file **protects more** drops at that upgrade level.

| Gear level | FK N20 | FK N25 | FK H10 | Dragon N20 | Dragon N25 | Dragon H10 | IG N20 | IG N25 | IG H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | +0.5 | +0.8 | +1.2 | 0.0 | 0.0 | +0.7 | 0.0 | +0.1 | +0.5 |
| +4 | +1.0 | +1.7 | +2.0 | +0.7 | +1.2 | +1.5 | +0.7 | +0.8 | +1.0 |
| +8 | +1.1 | +1.8 | +2.1 | +1.0 | +1.6 | +2.2 | +0.8 | +1.2 | +1.5 |
| +12 | 0.0 | −0.2 | −0.2 | +0.1 | +0.1 | +0.1 | 0.0 | +0.1 | −0.1 |
| +16 | 0.0 | 0.0 | −0.1 | +0.2 | +0.1 | +0.2 | +0.1 | +0.1 | +0.2 |

The +4 / +8 rows show the biggest difference: more drops are held in the early
upgrade window. Most of those extra pieces are eventually sold between +8 and +12
once their substats are fully revealed. Keep-rates at +12 and +16 are almost identical.

---

### Endgame — old (Feb 2026)

#### Fire Knight

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Savage N20 | 3× Savage N25 | 3× Savage H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 2.7% | 5.0% | 6.5% | 1.3% | 2.0% | 2.6% |
| +4 | 1.5% | 2.8% | 3.8% | 1.2% | 1.7% | 2.3% |
| +8 | 0.8% | 1.7% | 2.3% | 0.9% | 1.4% | 1.9% |
| +12 | 0.5% | 1.2% | 1.5% | 0.6% | 0.9% | 1.3% |
| +16 | 0.5% | 1.0% | 1.2% | 0.5% | 0.7% | 1.1% |

#### Dragon

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Speed N20 | 3× Speed N25 | 3× Speed H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 2.6% | 4.4% | 6.4% | 1.2% | 1.9% | 2.9% |
| +4 | 1.3% | 2.3% | 3.6% | 0.8% | 1.3% | 2.2% |
| +8 | 0.7% | 1.2% | 2.1% | 0.4% | 0.5% | 1.1% |
| +12 | 0.4% | 0.7% | 1.3% | 0.2% | 0.2% | 0.6% |
| +16 | 0.4% | 0.6% | 1.1% | 0.2% | 0.2% | 0.5% |

#### Ice Golem (no boost)

| Gear level | Normal 20 | Normal 25 | Hard 10 |
| --- | :---: | :---: | :---: |
| +0 | 1.7% | 2.8% | 4.2% |
| +4 | 0.7% | 1.5% | 2.3% |
| +8 | 0.4% | 0.7% | 1.3% |
| +12 | 0.2% | 0.4% | 0.9% |
| +16 | 0.2% | 0.4% | 0.7% |

---

### Endgame — new (Mar 2026)

#### Fire Knight

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Savage N20 | 3× Savage N25 | 3× Savage H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 2.8% | 5.1% | 7.2% | 1.1% | 1.9% | 2.8% |
| +4 | 2.5% | 4.5% | 5.9% | 0.9% | 1.6% | 2.4% |
| +8 | 2.2% | 4.0% | 5.2% | 0.7% | 1.2% | 1.7% |
| +12 | 0.7% | 1.4% | 1.8% | 0.4% | 0.5% | 0.8% |
| +16 | 0.6% | 1.3% | 1.6% | 0.3% | 0.5% | 0.7% |

#### Dragon

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Speed N20 | 3× Speed N25 | 3× Speed H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 2.6% | 4.4% | 7.0% | 1.3% | 2.0% | 3.0% |
| +4 | 2.2% | 3.8% | 5.5% | 1.1% | 1.6% | 2.4% |
| +8 | 2.0% | 3.5% | 4.9% | 0.9% | 1.1% | 1.6% |
| +12 | 0.4% | 0.7% | 1.1% | 0.5% | 0.7% | 1.0% |
| +16 | 0.3% | 0.6% | 1.1% | 0.5% | 0.7% | 0.8% |

#### Ice Golem (no boost)

| Gear level | Normal 20 | Normal 25 | Hard 10 |
| --- | :---: | :---: | :---: |
| +0 | 1.4% | 2.3% | 3.9% |
| +4 | 1.2% | 1.9% | 3.0% |
| +8 | 1.1% | 1.8% | 2.7% |
| +12 | 0.2% | 0.3% | 0.5% |
| +16 | 0.2% | 0.3% | 0.4% |

#### Endgame keep-rate change (new − old, percentage points)

Positive values mean the new sell file **protects more** drops at that upgrade level.

| Gear level | FK N20 | FK N25 | FK H10 | Dragon N20 | Dragon N25 | Dragon H10 | IG N20 | IG N25 | IG H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | +0.1 | +0.1 | +0.7 | 0.0 | 0.0 | +0.6 | −0.3 | −0.5 | −0.3 |
| +4 | +1.0 | +1.7 | +2.1 | +0.9 | +1.5 | +1.9 | +0.5 | +0.4 | +0.7 |
| +8 | +1.4 | +2.3 | +2.9 | +1.3 | +2.3 | +2.8 | +0.7 | +1.1 | +1.4 |
| +12 | +0.2 | +0.2 | +0.3 | 0.0 | 0.0 | −0.2 | 0.0 | −0.1 | −0.4 |
| +16 | +0.1 | +0.3 | +0.4 | −0.1 | 0.0 | 0.0 | 0.0 | −0.1 | −0.3 |

At +4 / +8, more drops are held across all dungeons — the Speed-substat scanning change
is the main driver, same as in Lategame. The picture at +0 and +12 / +16 is more mixed:
Ice Golem sees fewer holds early (utility sets like Stun and Toxic are no longer kept from
the start — only level 16 pieces qualify), and the stricter Endgame substat requirements
cut more pieces before +12 than before.
