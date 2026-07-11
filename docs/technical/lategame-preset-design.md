# Lategame Preset — Safeguard Design

Design record for the safeguard weighting, tagging, and override wiring shipped in
[`presets/lategame.sfc`](../../presets/lategame.sfc) (2026-07 rework). Read together with
[Application Behavior → Safeguards State](app-behavior.md#safeguards-state) (scoring
formula) and the SFC Global Note override DSL docs in the same file.

## Weight invariants (the design SSOT)

Safeguard substat weights are *derived*, not hand-tuned. Three rank-order invariants,
checked per rule (rank-for-rank; the main-stat rank bonus sits on top):

1. **SPD with 2 rolls outranks any SPD-less piece** — no combination of other
   substats/rolls may overtake it.
2. **SPD with 1 roll is beatable, but only by a genuinely good core piece** (good
   CR%/CDMG% rolls in damage rules; good HP%/DEF%/RES rolls in survivability rules).
3. **Everything else is a tie-breaker** — decides between pieces whose core stats are
   equal; must not overturn a core-stat difference.

### The math behind them

Per-substat score = `weight × (entry + rolls + glyph-potential)`, normalized to the 6★
per-roll max (`substatNormalizedContribution`). Average effective units — presence
(entry + glyph potential) and per-roll:

| Substat | Presence | Per roll |
|---|---|---|
| SPD | ≈ 1.8 | 0.92 |
| ACC / RES | ≈ 1.8 | 0.88 |
| HP% / ATK% / DEF% | ≈ 1.6 | 0.86 |
| **CR% / CDMG%** (no glyph term) | **≈ 0.86** | 0.86 |

Consequences: invariant 1 forces `w_SPD ≈ 2× the heaviest non-SPD weight`; the glyph
asymmetry means crit weights *look* higher than they act on presence — compress the
glyphable tie-breakers rather than inflating crit (a single weight controls presence and
per-roll value together).

### The SPD = 2.0 anchor

Ratios inside a rule are what the invariants fix; the absolute scale only matters against
the additive main-stat rank bonus (`1 × mainStatRankWeightFactor × rankRatio`; the preset
uses factor 4.5 ⇒ 6★-over-5★ gap ≈ 0.5–0.85 points). Anchoring **SPD = 2.0** in every
rule where SPD is a weighted substat puts each family's core weights back into the
0.7–1.3 band the 4.5 factor was originally tuned against, so the factor is unchanged
everywhere. Family ladders (weight 1.0 is stored implicitly — the loader strips
defaults):

| Family | Ladder |
|---|---|
| Damage | SPD 2, CR 1.0, CDMG 0.9, HP%/ATK%/DEF% 0.4, ACC 0.2, RES 0.1 |
| Survivability / Utility-RES | SPD 2, HP% 0.8, DEF% 0.7, RES 0.7 |
| Utility (crit rows) | SPD 2, CR/CDMG 0.9, ACC + fillers 0.4 |
| Crit Shield | SPD 2, CR 1.0, ACC/RES 0.2, HP%/DEF% 0.4 |
| Debuffer | SPD 2, ACC 1.1 |
| Banner %-main | SPD 2, own-% 0.6 |
| Catch-all | SPD 2, CR/CDMG 0.6, fillers 0.25, ACC/RES 0.1 |

Deliberate exceptions: the No-Speed damage rules invert (filler > 1, CR% 0.1 as a pure
tie-breaker on the CDMG gloves); the slow-debuffer rules are ACC-first by design; the
Bomber (Slow) rule pair intentionally exists twice (substat-priority vs main-stat-priority
protection); each %-main banner has a second "stat-stick" variant with the inverse
ranking (own-% 2, SPD 0.6) so the best pure-% banners are protected alongside the best
SPD-carrying ones; and `Best SPD Banner (RES/ACC)` intentionally requires only **1**
matching substat (`substatMatch` min-1) — looser than the pre-rework preset's 2.

## Tag conventions (drive the Note's dynamic overrides)

- No domain uses an `acc*` tag anymore (too close to "accuracy"): the safeguard rename to
  `accessory`/`accessory_fallback` was followed by the RECIPE-domain tags — `accessory`,
  `accessory5`, `accessory6`, `accessory_flat` (option ids like `acc_rolls_22` are ids,
  not tags, and keep their spelling for answer compatibility).
- Family umbrella tags (`damage`, `survivability`, `utility`, `catchrest`, `accessory`, …):
  activation radios and the `keep_safeguards` rank-bump select these, so **every** rule of
  a family toggles even when its count stays fixed.
- **Artifact vs accessory is a hard tag boundary**: every safeguard rule is slot-pure
  (artifact slots or Ring/Amulet/Banner, never both — the mixed slow-debuffer rules were
  split), and the `keep_safeguards` checkbox's `else` block clamps **every artifact
  family** to 6★ (`debuffer`, `slowdebuffer`, `bomber`, `damage`, `crit_shield`,
  `survivability`, `utility`, `speed_set`, `mercurial4/8`, `catchrest`, and
  `spd and not tag=accessory` — the SPD banners share the `spd` tag for count scaling but
  are accessories). Accessory rules are deliberately exempt: 5★ accessories stay reserved
  even at Endgame.
- `*_primary` / `*_fallback`: count sliders scale only these; plain-tagged specialized
  rules keep fixed counts. A rule opts OUT of its family slider simply by not carrying the
  scaling tag — e.g. the any-set Bomber Amulet is `accessory`-only (fixed count 1, toggled by the
  accessory question, untouched by `min_acc_pieces`). Don't "fix" such a missing tag.
- Split-scaling sub-tags (rules duplicated into substat variants have their quotas halved
  so total protection matches the pre-split preset): `speed_set_boots` (`$value/4`),
  `debuffer_crit` (`$value/32`), plus `survivability_primary` at `$value/32` and
  `catchrest_primary` at `$value/2`. A rule with umbrella + sub-tag gets the sub-tag's
  count via last-block-wins.
- `accessory_fallback`: the any-set req=3 accessory tier, scaled by `min_acc_pieces`;
  Accessory-Specific per-set floors (req=1), Mercurial/Merciless accessory rules, and
  `fw_coverage` rules stay fixed.

## Override wiring notes

- The FW-Hard question is **pure recipe handling** — no safeguard coupling in either
  direction. It once forced the utility card (`set util_off`/`set util_gaps`) and `Yes`
  carried a hidden `safeguard @tag=utility { rank=6 rarity=legendary,mythical }` block;
  all of it was removed deliberately: safeguards are dealt with explicitly by their own
  cards, and `Yes!`'s "No extra protection — treat like any other gear" is honest on the
  recipe side alone. Consequences: no account tier touches the utility card anymore
  (Endgame+ included), and finishing FW Hard no longer narrows utility safeguards to
  6★ legendary/mythical. A preset intent test pins the decoupling. The cross-domain
  option-write bridges (forward and reverse) remain app capabilities, just unused here;
  the utility card's option ids (`util_off`/`util_own`/`util_gaps`/`util_upg`) stay
  pinned for saved-answer compatibility.
- Rule order matches the pre-rework preset, new rules adjacent to their siblings, with
  the catch-alls last — gear displays the FIRST matching rule's name, so first match
  should imply the best match. Order is otherwise behavior-neutral
  (`ignorePreviousSafeguards` off everywhere).
- DSL authoring trap: an option with no `{ … }` block makes the header parser swallow the
  NEXT option (it consumes tokens until a `{`). A no-op option must be written `{ }`.
