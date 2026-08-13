# Lategame Preset — Safeguard Design

Design rules for the safeguard weighting, naming, tagging, and override wiring in
[`presets/lategame.sfc`](../../presets/lategame.sfc). Read together with
[Application Behavior → Safeguards State](app-behavior.md#safeguards-state) (scoring
formula) and the SFC Global Note override DSL docs in the same file.

## Weight invariants (the design SSOT)

Safeguard substat weights are *derived*, not hand-tuned. Three rank-order invariants,
checked per rule (rank-for-rank; the main-stat rank bonus sits on top):

1. **SPD with 2 rolls outranks any SPD-less piece.**
2. **SPD with 1 roll is beatable, but only by a genuinely good core piece** (good
   CR%/CDMG% rolls in damage rules; good HP%/DEF%/RES rolls in survivability rules).
3. **Everything else is a tie-breaker** — must not overturn a core-stat difference.

Per-substat score = `weight × (entry + rolls + glyph-potential)`, normalized to the 6★
per-roll max (`substatNormalizedContribution`). Average effective units:

| Substat | Presence | Per roll |
|---|---|---|
| SPD | ≈ 1.8 | 0.92 |
| ACC / RES | ≈ 1.8 | 0.88 |
| HP% / ATK% / DEF% | ≈ 1.6 | 0.86 |
| **CR% / CDMG%** (no glyph term) | **≈ 0.86** | 0.86 |

Consequences: invariant 1 forces `w_SPD ≈ 2× the heaviest non-SPD weight`; crit weights
*look* higher than they act on presence — compress the glyphable tie-breakers rather
than inflating crit. **SPD is anchored at 2.0** in every rule where it is weighted: that
keeps each family's core weights in the 0.7–1.3 band the `mainStatRankWeightFactor` of
4.5 is tuned against (6★-over-5★ gap ≈ 0.5–0.85 points). Family ladders (weight 1.0 is
stored implicitly — the loader strips defaults):

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
tie-breaker on the CDMG gloves); the slow-debuffer rules are ACC-first; the
`Bomber - No Speed` pair exists twice on purpose (substat-priority vs main-stat-priority
protection); each %-main banner has a "stat-stick" twin with the inverse ranking
(own-% 2, SPD 0.6); the RES/ACC-main `Speed Banner` pair requires only **1** matching
substat.

## Naming convention (mirrors the recipe names)

Grammar: `<prefix> <Role>[ - <Scope>][ (<Variant>)]`. RSL Helper shows the FIRST
matching rule's name on gear, and the gear card already displays slot, set, main stat,
and substats — names only add role + tier.

- Prefix: `Protect: ` for keep rules, `Unique: ` for coverage floors.
- Dash suffix = tier/scope: `- No Speed` and `- Across Sets`. The latter covers two
  shapes: artifact fallbacks keep their sibling's set/metaset filter and only pool the
  per-set quota, while accessory tiers (and the truly-any-set artifact copies) have an
  empty set+metaset filter. Every non-Mercurial accessory rule with an empty filter
  carries the suffix, including fixed-count ones. (`- Across Sets` is deliberately NOT
  the recipes' `- Any Set`, which means an empty set filter.)
- `- No Speed` only on artifact rules: banners rank SPD like any banner, and amulets
  cannot roll SPD, so the suffix would mark nothing on accessories.
- Parens = a short set/stat variant only: `(Mercurial)`, `(Merciless)`, `(RES)`,
  `(HP%/ATK%/DEF%)` — never scope words, never doubled, and only where the stat deviates
  from the slot's norm (%-main GAUNTLETS deviate from the CDMG% norm; chest/boots cannot
  roll CDMG% mains, so their siblings stay plain).
- **No artifact slot/row words** and **no ranking words** (`Best`): the piece shows its
  slot, and every safeguard keeps the best N by definition. Same-role variants share one
  name (e.g. `Protect: Damage` ×6) — first-match display makes that the right caption.
- Accessory rules DO keep `Ring`/`Amulet`/`Banner` (recipes use the accessory slot as
  the role word).

## Tag conventions (drive the Note's dynamic overrides)

- Every rule carries one **family tag** (`spd`, `speed_set`, `debuffer`, `slowdebuffer`,
  `bomber`, `damage`, `crit_shield`, `survivability`, `utility`, `mercurial`,
  `catchrest`, `accessory`, `fw_coverage`); accessory members of an artifact-named
  family add the **`accessory` axis tag** (`spd`+`accessory` = SPD banners,
  `mercurial`+`accessory` = Mercurial accessories). There are deliberately NO sub-family
  tags — selectors combine tags: `q_bk3r8j` targets `speed_set or tag=spd and not
  tag=accessory`, `q_ta25kl` `spd and tag=accessory`, `q_muougk` `mercurial and not
  tag=accessory`, `q_mercacc` `mercurial and tag=accessory`. Selector chains are flat
  and LEFT-ASSOCIATIVE (`a or b and not c` ≡ `(a OR b) AND NOT c`). **The trap: every
  new block targeting `spd` or `mercurial` MUST qualify the accessory axis**, or it
  silently reaches into the other domain.
- **Count scaling is a generic factor-tag scheme**: a rule scales against its family's
  slider iff it carries a factor tag — `divN` (`count=$value/N`, `div1` = full value) or
  the additive `plusN` (`count=$value+N`, for ladders that aren't proportional, e.g. the
  Mercurial accessories' 3/4/5 on `min_mercacc_pieces` default 3). Slider blocks select
  `@tag=<family> and tag=<factor>`, one block per factor present. A rule opts OUT of its
  family slider simply by not carrying a factor tag — e.g. the any-set Bomber Amulet is
  fixed count 1, untouched by `min_acc_pieces`. Don't "fix" such a missing tag.
- Factor-tag collision: SPD-banner fallback and Mercurial accessories share
  `accessory`+`div1` with the plain accessory floors, so the accessory question's slider
  selects `@tag=accessory and not tag=spd and not tag=mercurial and tag=div1` — without
  the exclusions, `min_acc_pieces` would clobber their counts via last-block-wins.
- **Artifact vs accessory is a hard boundary**: every rule is slot-pure (artifact slots
  or Ring/Amulet/Banner, never both), and the `keep_safeguards` `else` block clamps
  every artifact family to 6★ (incl. `spd and not tag=accessory` and `mercurial and not
  tag=accessory`). Accessory rules are deliberately exempt: 5★ accessories stay reserved
  even at Endgame.
- Never introduce an `acc*` tag (too close to "accuracy") — use `accessory*`. Option ids
  like `acc_rolls_22` are ids, not tags, and keep their spelling for answer
  compatibility.
- **The preset does not use bundles (yet).** Its 18 separators fake a two-level outline —
  top-level sections (`Speed`, `Accessories`, `Mercurial`, …) plus `#`-prefixed sub-sections
  (`# Rings`, `# Amulets`, `# Banners`) — and the `Protect: % Ring` / `Protect: % Ring - Across
  Sets` pair fakes a shared quota by duplicating filters across two rules. Both are exactly what
  [bundles](app-behavior.md#bundles-the-safeguards-outline) replace, but converting the preset
  changes what it protects, so it is a deliberate editorial decision rather than a migration.
  The loader will never infer it: `#` prefixes stay a divider line-style hint and are never read
  as outline depth.

## Override wiring notes

- The FW-Hard question carries **no option-write coupling** — safeguard
  activation/count/rank stay under the user's sole control via their own cards. It
  carries a data-only gear-set effect: `Yes` (fwh_yes16) and `Yes!` (fwh_yes) each add
  `safeguard @tag=utility { gearsets=+-Daze }` (a Daze-EXCLUDED entry) to the utility
  rules — once FW Hard is done, Daze utility pieces no longer need protecting. The
  baseline carries NO Daze entry, so the default `No` keeps Daze protected. A preset
  intent test pins this shape. Question/option ids are pinned via explicit `id=` for
  saved-answer compatibility — never re-derive them.
- Rule order: gear displays the FIRST matching rule's name, so first match should imply
  best match; catch-alls last. Order is otherwise behavior-neutral
  (`ignorePreviousSafeguards` off everywhere). Accessories keep a strict rings →
  amulets → banners order in both the Accessories section and the Mercurial tail; the
  slow-debuffer accessory rules live in the Accessories section, not next to their
  artifact siblings.
- Separator entries (`{ appearance, Separator: true }`) divide both chip lists, with
  `#`-style sub-separators inside slot-grouped sections. Separators are inert, and
  nothing references safeguards by index — selectors are tag-based — so inserting
  dividers or rules shifts indices without changing behavior.
- The note renders the metaset table via the `<!-- metasets -->` marker; the prose
  defers set membership to that live table instead of enumerating inline.
- DSL authoring traps: an option with no `{ … }` block makes the header parser swallow
  the NEXT option — a no-op option must be written `{ }`. Multi-line prompts embed a
  literal `\n` escape inside the quoted string, not a real newline.
