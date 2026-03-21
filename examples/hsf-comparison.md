# HSF Comparison: `-260220` vs `-new`

Comparison of the bundled sample sell files generated on 22 February 2026 (`-260220`)
against those generated from the current `example.sfr` recipe (`-new`).

---

## Lategame

### Rule count

| File | Rules |
| --- | ---: |
| `Lategame-260220.hsf` | 18 573 |
| `Lategame-new.hsf`    | 32 353 |
| Δ | +13 780 (+74 %) |

### Structural changes

| Area | `-260220` | `-new` |
| --- | --- | --- |
| **Rank gate** | Mixed 5★/6★ — 5★ artifacts kept broadly | `rank_strict`: 6★ artifacts only; 5★ sold unless rolling SPD |
| **Speed recipes** | "Speed – Primary" — only artifacts with Rank ≥ 6 | "Speed – Any Set" — Rank ≥ 0; applies to any rank |
| **Marius Sets** | `Use: true` (default on) | `Use: false` (default off, opt-in via recipe override) |
| **Preset structure** | Three-option model: Lategame / Endgame / Endgame+ | Four-option model with new Midgame tier; Lategame adds `rank_strict` + `rolls_33` |

**Speed – Any Set** is the largest driver of the rule count increase. Removing the
`Rank ≥ 6` constraint means every eligible slot × rarity combination now generates
a dedicated rule entry for lower-rank gear, roughly doubling the rule set.
The expanded rank window accounts for most of the +74 % growth.

**Marius Sets** flipping to `Use: false` by default means those rules are inert unless
the user opts in via the recipe override question. It does not change keep-rate for
players who do not own Impulse/Zeal sets but reduces false positives for endgame players.

**Rank gate** (`rank_strict`) means fewer 5★ artifacts survive from raw drops; the keep
window now narrows to 6★ Epic and higher. This raises the bar for protection and is
the secondary reason for the higher absolute rule count (more 6★ rarity variants are
now fully enumerated).

---

## Endgame

### Rule count

| File | Rules |
| --- | ---: |
| `Endgame-260220.hsf` | 10 729 |
| `Endgame-new.hsf`    | 22 170 |
| Δ | +11 441 (+107 %) |

### Structural changes

| Area | `-260220` | `-new` |
| --- | --- | --- |
| **Speed recipes** | "Speed – Primary" — Rank ≥ 6 | "Speed – Any Set" — Rank ≥ 0 |
| **Marius Sets** | `Use: false` (unchanged) | `Use: false` (unchanged) |
| **Preset structure** | Shared Endgame/Endgame+ entry point | Dedicated Endgame preset with `rank_strict` + `rolls_strict` + `eg_early` |
| **Chaos Ore thresholds** | `ore5EpicLegendary_LvlCap` / `ore6EpicLegendary_LvlCap` | Same defaults; level-cap constraints tightened on 5★ Ore rules |

The same **Speed – Any Set** broadening applies here and is solely responsible for the
~107 % rule count growth. The endgame preset is stricter on substats (`rolls_strict`)
so pieces that are now evaluated at lower ranks are almost always sold immediately —
they inflate the file size but have minimal impact on practical keep rates.

---

## Dungeon drop simulation

Keep-rate percentages are simulated with 10 000 runs per stage/boost configuration.
**Level-up mode** — a simulated drop stops advancing once the sell file would auto-sell
it, mirroring actual in-game rolling behavior.

Columns without a set name show the **aggregate Σ keep-rate** across all sets that drop
in that dungeon. Boost columns (3×) show only the keep-rate for the boosted set itself
(denominator = total dungeon runs, not set-specific drops).

Regenerate these tables at any time with:
```
node --experimental-wasm-modules scripts/tooling/gen-dungeon-stats.mjs <hsf-path>
```

---

### Lategame-260220.hsf

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

### Lategame-new.hsf

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

#### Lategame keep-rate delta (new − 260220)

Positive values mean the new file keeps **more** drops at that gear level.

| Gear level | FK N20 | FK N25 | FK H10 | Dragon N20 | Dragon N25 | Dragon H10 | IG N20 | IG N25 | IG H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | +0.5 | +0.8 | +1.2 | 0.0 | 0.0 | +0.7 | 0.0 | +0.1 | +0.5 |
| +4 | +1.0 | +1.7 | +2.0 | +0.7 | +1.2 | +1.5 | +0.7 | +0.8 | +1.0 |
| +8 | +1.1 | +1.8 | +2.1 | +1.0 | +1.6 | +2.2 | +0.8 | +1.2 | +1.5 |
| +12 | 0.0 | −0.2 | −0.2 | +0.1 | +0.1 | +0.1 | 0.0 | +0.1 | −0.1 |
| +16 | 0.0 | 0.0 | −0.1 | +0.2 | +0.1 | +0.2 | +0.1 | +0.1 | +0.2 |

The +4 / +8 rows show the clearest signal: the new lategame file **protects
substantially more drops in early-level windows**. This is the direct effect of
"Speed – Any Set" — lower-rank gear now passes the initial keep check and continues
to be evaluated at +4 and +8, where many then fall off as substats don't pan out.
Keep rates at +12 and +16 are nearly unchanged, confirming that final-quality
thresholds were not relaxed.

---

### Endgame-260220.hsf

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

### Endgame-new.hsf

#### Fire Knight

| Gear level | Normal 20 | Normal 25 | Hard 10 | 3× Savage N20 | 3× Savage N25 | 3× Savage H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | 2.8% | 5.0% | 7.1% | 1.1% | 1.8% | 2.7% |
| +4 | 2.5% | 4.5% | 5.8% | 0.9% | 1.6% | 2.3% |
| +8 | 2.2% | 4.0% | 5.2% | 0.7% | 1.2% | 1.6% |
| +12 | 0.7% | 1.4% | 1.8% | 0.4% | 0.5% | 0.8% |
| +16 | 0.6% | 1.3% | 1.5% | 0.4% | 0.5% | 0.7% |

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
| +0 | 1.6% | 2.7% | 4.6% |
| +4 | 1.4% | 2.4% | 3.6% |
| +8 | 1.3% | 2.2% | 3.2% |
| +12 | 0.2% | 0.4% | 0.8% |
| +16 | 0.2% | 0.4% | 0.7% |

#### Endgame keep-rate delta (new − 260220)

| Gear level | FK N20 | FK N25 | FK H10 | Dragon N20 | Dragon N25 | Dragon H10 | IG N20 | IG N25 | IG H10 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| +0 | +0.1 | 0.0 | +0.6 | 0.0 | 0.0 | +0.6 | −0.1 | −0.1 | +0.4 |
| +4 | +1.0 | +1.7 | +2.0 | +0.9 | +1.5 | +1.9 | +0.7 | +0.9 | +1.3 |
| +8 | +1.4 | +2.3 | +2.9 | +1.3 | +2.3 | +2.8 | +0.9 | +1.5 | +1.9 |
| +12 | +0.2 | +0.2 | +0.3 | 0.0 | 0.0 | −0.2 | 0.0 | 0.0 | −0.1 |
| +16 | +0.1 | +0.3 | +0.3 | −0.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |

The pattern mirrors Lategame: large +4/+8 gains from "Speed – Any Set" bringing more
drops into the initial keep window, while +12/+16 final-quality rates hold steady.
The endgame +8 delta is even larger than lategame (+1.3–+2.9 pp vs +0.8–+2.2 pp)
because the strict substat thresholds (`rolls_strict`) discard most of those newly
admitted pieces between +8 and +12, so the spike is more concentrated.

---

## Notes on regenerating

The statistics above were generated with `scripts/tooling/gen-dungeon-stats.mjs`
at 10 000 runs per configuration (Monte Carlo; results vary by ±0.1–0.3 pp across runs).

To regenerate all four tables and paste them back into this file:

```sh
node --experimental-wasm-modules scripts/tooling/gen-dungeon-stats.mjs examples/Lategame-260220.hsf
node --experimental-wasm-modules scripts/tooling/gen-dungeon-stats.mjs examples/Lategame-new.hsf
node --experimental-wasm-modules scripts/tooling/gen-dungeon-stats.mjs examples/Endgame-260220.hsf
node --experimental-wasm-modules scripts/tooling/gen-dungeon-stats.mjs examples/Endgame-new.hsf
```
