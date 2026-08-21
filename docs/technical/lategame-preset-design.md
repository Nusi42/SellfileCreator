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
- **Every factor block mirrors its count write with `group.count` at the same scale**:
  `{ count=$value/8 group.count=$value/8 }`. The preset ships no groups, so this is a strict
  no-op today (`group.*` does nothing on an ungrouped rule) — it is forward-compat wiring so a
  group formed later out of ANY family is driven by its slider the moment it exists. Same
  expression, not `$value`: a group seeds from the MIN of its members' counts, so `div8` members
  promise `$value/8` and their group must too (`$value` would silently 8× it). Blocks apply in
  **note order across every question** (questions → options → blocks, as `applySafeguardOverrides`
  walks the resolved instruction list) and a group takes the LAST matching write, so a group
  mixing factor tags is driven by whichever factor's block sits later in the note — not by which
  slider was moved last — another reason not to group across factors. When adding
  a factor block, add the mirror; pinned across every slider by
  `tests/unit/safeguard-overrides-groups.test.ts` and the golden digest.
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
- **The preset ships no groups (measured, not assumed — see below).** Its 18 separators fake a
  two-level structure — top-level sections (`Speed`, `Accessories`, `Mercurial`, …) plus
  `#`-prefixed sub-sections (`# Rings`, `# Amulets`, `# Banners`). The loader will never infer
  membership from those: `#` prefixes stay a divider line-style hint. Every slider factor block
  does carry the `group.count` mirror described under "Tag conventions" above, so a group formed
  later in any family is slider-driven from day one.
- **Why the `X` / `X - Across Sets` pairs stay ungrouped.** A pair like `Protect: % Ring`
  (`perSet` on, count 1) next to `Protect: % Ring - Across Sets` (`perSet` off, count 3) looks
  like a faked shared quota, but it is not: it deliberately keeps **one ring of each set AND the
  3 best overall**. A [group](app-behavior.md#groups-safeguards-sharing-one-required-count) has
  a single `countMode`, so it cannot express both scopes at once — grouping such a pair would
  silently drop the per-set floor. All 14 accessory pairs and all 7 artifact pairs are kept
  ungrouped for this reason. **Do not "migrate" them.**
- **Why the multi-yardstick fan-outs stay ungrouped too** (e.g. entries 37–40, `Protect: Damage -
  Across Sets`: identical filters, one swapped substat weight each). They look like the textbook
  group — four weight tables over one pool — and grouping them was tried and **measured inert**
  against a real account with `scripts/tooling/measure-group-effect.ts`. Two reasons, both
  general enough to check before grouping any similar run:
  1. On the ranking path (any count mode but per-rule) every member already keeps its own top-N
     per bucket, so N ungrouped members keep the **union** of their top-N sets — "the best by
     whichever yardstick values it" needs no group. A group can only **cap** that union at its
     own count per bucket, and it differs from ungrouped only when a bucket holds more distinct
     nominees than the cap. With per-set buckets and recipes already keeping most of each
     bucket's top-N, the still-sold nominees per bucket number 0–2, so a cap of 3 never bites
     (Δ = 0 across every weight scale tried; even member 6 / group 2 trimmed 4 of 33).
  2. The four weight tables differ by 0.2–0.4 on one %-stat against a shared SPD 2.0 / CDMG% 0.9,
     so their top-N sets are nested (members 2–4 pick a subset of member 1's) and there is no
     disagreement to arbitrate; the run behaves as one rule. Shared nominees are credited to the
     FIRST feeder in the pool, which is why later members then *display* nothing.
  Also note the filter of 37–40 lists `Chestplate|Boots` with `mainStats=[SPD]`, and Chestplate
  cannot roll an SPD main — the effective scope is SPD-main Boots only. Where a group would earn
  its place is the opposite shape: members whose nominees are mostly still-sold gear over buckets
  coarse enough to hold several, or a deliberate "consider top-N per yardstick, keep best G < N".
- The remaining lone `- Across Sets` rules (entries 11, 22, 25, 28, 33, 56, 59) are genuine
  family catch-alls — each is the only rule for its slot/main region, so there is no pool to
  share and `div1` (the full slider value) is correct.

## Gear-set scope (Optional 5)

"Optional 5 — Gear-set scope" is the one section that edits set/metaset *filters* rather than
counts, ranks, or activation. Three cards, in this order: the 5★ Chaos Ore set card, the 6★ one,
then the catch-all safeguards.

- **Catch-all scope** (`q_catchsets`, safeguard domain). The four `catchrest` rules ship with a
  curated eight-metaset filter — a union of 41 of the 64 artifact-capable sets, leaving out the
  whole `Utility` metaset and the `Useless` five. Three radios: `catchsets_useful` (default, writes
  nothing), `catchsets_all` (`metasets=any` — the clear keyword, so the filter empties to "any gear
  set"), `catchsets_limited` (replaces with the three `- Limited Sets` metasets).
  **Cost note:** catchrest is `perSet + perSlot + perMainStat` on `anticipate_gaps`, so widening
  41 → 64 sets grows its placeholder buckets by roughly 56% — the most expensive family in the
  file. That is why the option's help text calls it slower, and why it is wired to Midgame (small
  collections) rather than to the late tiers.

- **Chaos Ore set cards** (`q_ore5sets` / `q_ore6sets`, recipe domain). One card per rank, each
  exactly eight gear-set checkboxes. A card drives only its rank's three rarity rules
  (`ore<N>epic` / `ore<N>legendary` / `ore<N>mythical`).
  - **The metaset pool is stated once, in the Optional 2 (Chaos Ore) section prose**, not on each
    card: the two pools differ by a single metaset, so a per-card list was noise. That prose names
    *Damage - Limited Sets*, *Support - Limited Sets*, *Accessory Specific* and *Debuffer - Limited
    Sets*, folds in the scarce-set examples that used to sit on the two rarity questions, and points at the live `<!-- metasets -->` table for membership.
    The cards themselves only frame their eight checkboxes as the **debatable** sets — the pool is
    much larger and is not individually addressable there.
  - The **catch-all** card states its own pool inline, because the safety net covers a different,
    wider metaset list (*Damage*, *Debuffer*, *Extra Turn*, *Survivability* … ) than the ore rules.
  - **Ticked adds, unticked excludes.** Each box writes `gearsets=+<Set>` when ticked and
    `gearsets=+-<Set>` (an EXCLUDED entry) through a per-option `else` when not. Both halves are
    load-bearing: a set the stored metaset pool lacks (Speed on the 5★ card) needs the include to
    join, while a set the pool supplies (Cruel) can only leave via an exclusion — a bare `-Name`
    cannot reach an entry a metaset contributed. The exclusion is **not** undone by the metaset:
    `mergeRecipeArtifactSets` (`ruleCache.ts`) runs `resolveArtifactSetSelections` — which expands
    metasets first and subtracts exclusions last — into one flat list before any rule is generated,
    so an unticked set is genuinely absent from the exported HSF rules.
  - **The stored metaset pool survives.** Ticks compose *on top of* the recipe's shipped metasets
    rather than replacing them, so the ~29 (6★) and ~25 (5★) set pools stay intact and the eight
    boxes are the individually-addressable subset.
  - **Defaults reproduce the pre-card recipes exactly** — 6★ all eight ticked, 5★ without
    Speed/Savage/Perception/Divine Speed, which is precisely the old `Need 4 Speed` + `Savage`
    difference between the two ranks. `lategame-gearset-scope.test.ts` pins this on the RESOLVED
    set list (metasets expanded, exclusions applied), because that is the only comparison that
    proves users keep and sell the same gear as before.
  - **There is no all-sets escape.** Unticking every box does NOT open the rule up; each unticked
    box only excludes its own set, so the rule falls back to its stored metaset pool minus those
    eight. An earlier revision shipped an `Any set` option writing `metasets=any gearsets=any`;
    it was removed because "keep everything" is not a state this card should offer.
  - **`ore6legendary_allsets` is deliberately NOT in the 6★ card's selector.** That rule is the
    separate "6★ from any gear set" keep with its own question; writing set includes onto an
    intentionally unfiltered rule would narrow it to the eight listed sets.

- **Three traps this section depends on**, all worth re-checking before authoring a similar block:
  1. **`+-"Two Words"` does not parse.** The tokenizer does not classify `-` as a symbol, so
     `gearsets=+-"Divine Speed"` lexes as the word `-"Divine` plus `Speed"`: the opening quote never
     starts a string and the stray quote swallows the NEXT option, which silently disappears. Quote
     with the prefix INSIDE — `gearsets="+-Divine Speed"` — which is what `overridesSerializer`
     emits and what `parsePrefixedToken` expects.
  2. **`else` belongs INSIDE the option's outer braces.** `{ … } else { … }` parses as a stray group
     that never attaches, leaving `elseBlocks` empty and the untick silently inert; the working form
     is `{ @sel { … } else { @sel { … } } }`.
  3. **Two options writing `gearsets=` on one recipe only compose** because recipe list ops fold in
     note order (see [Application Behavior → SFC Global Note](app-behavior.md#sfc-global-note)).
     This used to be last-writer-wins, which dropped all but the final checkbox.

- **Account-level wiring** (the tier buttons pre-answer every card): Midgame and Lategame ship the
  parity defaults; Endgame additionally unticks 6★ Speed/Savage; Endgame+ keeps only the scarce
  four on 6★ and Pinpoint/Chronophage on 5★. Picking a box by hand releases the tier button, as
  with every other tier-forced answer.

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
