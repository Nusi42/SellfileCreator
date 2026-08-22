# Visual Override-Block Editor

The note dialog's edit mode includes a visual editor that can **create and edit whole
`<!-- recipe-overrides … -->` / `<!-- safeguard-overrides … -->` blocks** without typing
DSL — every construct the parser accepts round-trips through it (prompt/label/detail
strings with `[[cc]]` locale variants, an optional pinned question `id=`, `rb`/`cb`/`slider`
options, `*` defaults, option `id=`,
constraint tokens, slider params incl. marks/toggle/unit, and `{ @selector { ops } }`
effect bodies with `else` and cross-domain blocks). The acceptance fixture is
`presets/lategame.sfc`: all of its 26 blocks (14 recipe + 12 safeguard) map to the fully
structured editor model.

## Data layer (`src/lib/`)

| Module | Role |
| --- | --- |
| `overridesDraftTypes.ts` | Editable draft model (`OverridesBlockDraft`, `DraftOption`, `DraftLocalizedText`, `DraftOptionBody`). Reuses the parser's **leaf** types (selectors, operations, count ASTs) verbatim — no token spelling is re-declared. |
| `overridesSerializer.ts` | The only DSL **writer** in the codebase. Emits canonical lategame-style text: marker + `[columns=N]` on line 1, one locale per continuation line (5-space indent), header tokens + single-line body on the last string line, `-->` closer. Exact emitters for every selector/operation/count-AST kind; ASCII operators only (never the display formatters' unicode `≥`). Throws `SerializeError` for grammar-inexpressible drafts (e.g. `or` under `and` in the paren-less recipe selector grammar — unreachable from a parse). |
| `overridesDraft.ts` | `listOverrideBlocks` (spans + per-domain marker indices), `parseOverridesBlockDraft` (one raw block → draft), templates, `validateRawBody` / `validateOverridesBlockDraft`, `snapInsertionOffset`. |
| `overridesEditorModel.ts` | UI bridge: parses/serializes single DSL fragments (one selector, one `field=value`) through the real grammar via synthetic blocks; field metadata (enum value sets, placeholders) derived from the grammar SSOT lists. |

**Fidelity gate.** Each parsed option body is serialized and re-parsed; only a
structural match keeps the structured form — otherwise the body degrades to verbatim
**raw text** (extracted via the option's `bodyFrom`…`sourceTo` span; `bodyFrom` was
added to `ParsedOverridesOption` for exactly this). The editor can therefore never
silently corrupt a body it cannot faithfully express. Raw bodies are validated by
wrapping them in a synthetic block, running `collectOverridesDiagnostics`, and checking
that a trailing sentinel option survives (catches unbalanced braces that would swallow
following options — the lenient parser cannot flag that itself).

**Round-trip contract** (pinned by `tests/unit/overrides-serializer-roundtrip.test.ts`):

- every lategame block: parse → draft (all-structured, no diagnostics) → serialize →
  re-parse is deep-equal;
- canonical form is a `serialize∘parse` fixed point;
- whole-note re-serialization preserves `buildNote*OverridesSignature` and default
  answers — **pure re-serialization never invalidates stored answers** (only real base-text
  edits do, because question/option ids hash the English base text — *unless* the question
  carries an explicit `id=` pin, in which case its id is fixed and base-text edits no longer
  reset its answers; the pin itself round-trips verbatim);
- exhaustive emit↔parse tables cover every operation/selector kind lategame doesn't use.

## UI (`src/components/noteOverridesEditor/`)

- `NoteOverridesBlockEditorDialog.tsx` — modal shell (`maxWidth="md"`, keyed remount per
  open via a request `nonce`), prompt + columns + an optional pinned **question `id=`**
  (empty → id derived from prompt+options; a value pins the identity so saved answers
  survive later prompt/option edits — the base-identity signature becomes pin-only, so the
  answers-reset Alert stays hidden for text edits under a pin), options list (add/remove/
  reorder/duplicate; radio-default exclusivity), live validation (Apply disabled while
  `validateOverridesBlockDraft` reports problems), dirty-close confirm, and an info
  Alert when English base text changed (answers reset to defaults).
- `OptionEditorCard.tsx` — one accordion per option: kind select, default, `id=`,
  localized label/detail, constraint chip lists (`+ − excl needs ^`, `needs=on|off`,
  `setval` rows), slider params (min/max/step/default, unit, toggle, marks).
- `EffectBodyBuilder.tsx` — structured body rows: per-block validated selector text
  (`@…`), operations as editable chips plus a field-dropdown/value-widget add row
  (enum fields render a Select), sections for cross-domain and `else` blocks, and a
  raw-DSL fallback toggle (structured→raw always works; raw→structured only when the
  text passes the fidelity gate). The `tag=` / `tag in […]` value widgets are freeSolo
  `Autocomplete`s whose suggestions come from `collectOverridesTagSuggestions(note,
  safeguardRuleTags)` — the **union** of tags already used in the note's selectors and
  tags defined on the live safeguard rules. Sourcing rule tags (threaded in via the
  dialog's `safeguardRuleTags` prop, mapped from `SafeguardRule.tags` in `NoteDialog`)
  means a freshly-tagged safeguard is offered *before* any selector references it;
  freeSolo still lets authors type an unlisted tag. `collectKnownSelectorTags` (note
  only) and `collectSafeguardRuleTags` (rule tags only, normalized through the shared
  tag grammar) are the two SSOT halves the union composes.
- `LocalizedStringField.tsx` — base + one row per `[[cc]]` variant; add-translation menu
  offers the app locales' short codes; unknown codes from the source are preserved.
- `NoteOverridesEditButton.tsx` — the card pencil (a real `<button>`, see below).

## NoteDialog integration contract

- Context: optional `onEditOverridesBlock(domain, markerIndex)` on
  `NoteRenderContextValue`, set only by `NoteEditorContent`; the question cards render
  the pencil when it is present (edit-mode preview only).
- Entry points: card pencil (edit) and the `insert-overrides-editor` toolbar command
  (create; captures the caret, snapped by `snapInsertionOffset` — nothing is inserted
  until Apply).
- Apply: whole-block text replacement of the captured marker span (the modal freezes
  the draft, so spans cannot go stale), then the existing `revealOptionSource` pulses
  the new span after a double-RAF (MDEditor must commit the new value first).
- **Delegated-listener guard:** the edit-preview's native `mousedown`/`click` reveal
  listeners early-return on `closest('button')`. React `stopPropagation` cannot stop
  these native handlers; the pencil must be a real `<button>` for this to hold. Do not
  remove either side of this contract (regression: pencil clicks triggered whole-marker
  reveal and preview jumps).
- The custom toolbar renderer forwards `data-testid` from command `buttonProps` (it
  replaces MDEditor's own button, which would have spread them itself).

## Lenient parse, strict editor — the diagnostics contract

The grammar is deliberately **lenient**: `parseOperations` skips any field it has no branch for
and moves on, so a note authored in a newer app version still applies its *other* overrides in an
older one instead of losing the whole block. The **editor** is strict: the same parse threads an
optional `DiagnosticSpan[]` collector, and every skip reports the span it skipped so the note
editor can draw a red wave under it. One parse, one grammar — the presence of the collector is
the only difference between the two behaviours (`collectOverridesDiagnostics` passes one; the
resolve path does not).

Two shared helpers in `noteOverridesParser.ts` keep this uniform:

- `reportUnknownField` — the SSOT "not a recognized field here" diagnostic, anchored on the
  **field token** so the underline lands on the typo. Used by the end-of-loop fallthrough (any
  field with no branch) and by the dotted families for a bad suffix (`weight.spdd`,
  `group.perslots`).
- `skipAssignmentValue` — consumes the skipped field's value so its tail is not re-read as more
  fields. It stops only at the next `field =` pair or the block's `}`; commas are consumed, since
  an unknown field may legitimately hold a list (`notafield=a,b,c`).

A field that exists but got a bad **value** must report against the value instead, via
`reportInvalidEnumValue` — otherwise the editor blames the wrong token. This is why the boolean
fields resolve through the `BOOLEAN_FIELD_OP_KIND` table rather than a chain of `if (field === …)`
that would fall through to the unknown-field diagnostic on `perslot=yess`.

Pinned by `tests/unit/overrides-unknown-field-diagnostics.test.ts`.

## Adding a new DSL field / param — the SSOT contract

The DSL vocabulary has exactly one home: the grammar SSOT constants in
`noteOverridesParser.ts` / `noteRecipeOverrides.ts` / `noteSafeguardOverrides.ts`
(`NOTE_*_ASSIGNMENT_FIELDS`, `NOTE_*_SELECTOR_FIELDS`, `*_VALS` enum sets,
`SLIDER_PARAM_KEYWORDS`, `NOTE_OVERRIDES_CONSTRAINT_KEYWORDS`,
`NOTE_OVERRIDES_CROSS_KEYWORDS`, marker keywords). Every other surface **derives**
from them or is **compile-/CI-enforced** against them — adding a parameter must
never require hunting through dozens of files.

To add a new assignment field, you touch only:

1. **Grammar list** — add the token to `NOTE_*_ASSIGNMENT_FIELDS`.
   → Prism highlighting, the DSL-block regexes, the EBNF reference token lists, and
   the editor dropdown pick it up **automatically** (all interpolate these arrays);
   the exhaustive editor-metadata Record now **fails to compile** until step 4.
2. **Operation union + parse branch** — add the op kind to `*OverridesOperation`
   and its `parseOperations` branch.
   → `*_OVERRIDES_OP_FIELD`, `formatXOpValue`, and `serializeXOperation` are
   exhaustive over the union and **fail to compile** until handled.
   A **dotted family** (`weight.<statKey>`, `group.<setting>`) registers only its BASE
   token in the grammar list and in `*_OVERRIDES_OP_FIELD` — the completeness suite reads
   that map as "which grammar field does this op belong to". The full dotted token is
   composed separately for emission (`safeguardOverridesOpFieldToken`); a family whose ops
   map straight to the base token would serialize as `group=4` and fail the round-trip
   suite. Intercept the family in `parseOperations` **before** the generic value-reading
   path if any member needs a custom value grammar (as `group.count` does — it reuses the
   count expression parser), and report an unrecognized suffix through `reportUnknownField`.
3. **Apply semantics** — the actual effect in the resolver/applier (inherently new
   code).
4. **Editor widgets + label** — one entry in `RECIPE_OPERATION_TERM_META` /
   `SAFEGUARD_OPERATION_TERM_META` (and `RECIPE_SELECTOR_TERM_META` for selector
   fields) in `overridesEditorModel.ts`; compile-forced by step 1. Each entry's
   `labelKey` is a **required `I18nKey`** — the dropdowns use the same catalog
   terms as the rest of the UI (Recipe Builder / Safeguards panel), and a new
   field cannot compile without choosing its localized label. Localized enum
   value maps carry `satisfies Record<(typeof *_VALS)[number], I18nKey>`, so a
   new enum value also fails to compile until labeled.

   Two more per-entry contracts:

   - **`valueLabelKeys`** localizes closed-vocabulary VALUES with the same catalog
     terms as the rest of the UI (star ranks via `starRankValueI18nKey`, rarities
     via `rarityRankValueI18nKey`, slots via `artifactTypeI18nKey`, on/off via
     `commonOn`/`commonOff`); the DSL keeps its tokens. Concept-localized
     vocabularies (rank, rarity, minima.any, slots, autolate, booleans…) must be
     **fully** covered — pinned by the completeness suite. `minima.any` is the
     poster child: its literal means "the N★ minima column applies to Rank=Any
     rules", so the editor offers a star-rank chooser (with `labelDetailKey:
     'anyRank'` qualifying the dropdown label), never a free number.
   - **`range`** mirrors the field's apply-side clamp for 'number' widgets, always
     via the clamp's own exported constant — `SUBSTAT_TARGET_MAX_ROLLS` (minrolls /
     lockedminrolls / substatmin), `NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX`,
     `NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN/MAX`, `GEAR_INSPECTOR_SORT_WEIGHT_*`. The
     number widget clamps typing and stepping, so the editor can never hold a value
     the resolver would discard. Fields whose resolvers clamp MUST declare a range
     (pinned by the completeness suite).
   - **`control`** routes closed vocabularies to the app's shared domain selects
     (`src/components/gear/*`): the 3×3 slot grid (`GearSlotSelect`), factions,
     colored substats/main stats (`GearSubstatSelect`/`GearMainStatSelect`, gated by
     the stat color scope), sets and metasets (`GearSetsSelect`; `showSets={false}`
     yields the metasets-only picker), star ranks (`GearRankSelect`) and rarities
     (`GearRaritySelect` / tinted `RarityLabel` words where the grammar adds `auto`).
     The DSL value stays a token string: the exported converter pairs
     (`slotTokenToId`/`slotIdToToken`, `factionNameToId`/…, `statKeyToVariant`/…,
     `gearsetNameToId`/…, `rarityNameToRank`/…) map tokens ⇄ domain ids and are
     built from the SAME name tables the parser resolves against; the completeness
     suite round-trips every vocabulary token through them. Values the selects
     cannot represent (mutate-prefixed lists other than gearsets, unknown metaset
     names) keep the validated text/chip fallback — never silently dropped.
     Star/stat pickers for the dotted families (`minima.★.STAT`, `substatmin.STAT`,
     `weight.STAT`) use the same rank/substat selects.
   - **`gearsets` is prefix-aware** (`GearsetsListValueControl` in
     `EffectBodyBuilder.tsx`): a Replace/Modify mode toggle (`=` / `±`), the shared
     `GearSetsSelect` for membership (right-click a set toggles the `+-`
     excluded-add — promoting a Replace list to Modify first, since the replace
     grammar has no exclusions), and one monospace chip per entry that cycles its
     prefix on click in Modify mode (`+` → `+-` → `-`). Switching back to Replace
     strips prefixes and drops `-` removals. Parsing/composition are model SSOTs
     (`parsePrefixedTokenListValues` / `prefixedTokenListText` in
     `overridesEditorModel.ts`, built on the parser's own `parsePrefixedToken`);
     mixed bare+prefixed or unknown-name lists still fall back to the text field.

Everything else is pinned by `tests/unit/overrides-ssot-completeness.test.ts`
(map spellings are real grammar tokens, no dead fields, EBNF mentions every token,
editor enum values parse) and `tests/unit/overrides-serializer-roundtrip.test.ts`
(emit↔parse identity). Never hand-write a token list in a derived surface — the
EBNF module (`src/lib/overridesEbnf.ts`) exists precisely because the previous
hand-written reference had silently drifted (`action` was missing).

### Adding a bare SELECTOR keyword

A value-less selector head (`tagged`, `grouped`, …) follows the same derive-don't-repeat rule,
but its surfaces are a different set — add the token to `NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS`,
then a `NoteTagSelector` kind, a `parseTagSelector` branch and a `formatNoteTagSelector` case
(exhaustive → compile-forced). Prism, the EBNF `selector` row, the editor's `TAG_TERM_OPTIONS`
and `NOTE_RECIPE_OVERRIDES_SELECTOR_BUILTINS` all derive from that one array. What is **not**
compile-forced, and has caused test failures when missed:

- the matcher (`matchesTagSelectorForRule`) and the serializer's `emitTagSel`;
- the editor's bare-kind sites — `BareSelectorKind`, `selectorLeafToView`, `selectorTermText`,
  `selectorViewOptionId`, `defaultViewForOption`;
- **domain asymmetry**: `TAG_TERM_OPTIONS` is shared, but the recipe grammar accepts only the
  tag heads. A safeguard-only keyword must be listed in `SAFEGUARD_ONLY_SELECTOR_IDS` or the
  recipe dropdown seeds a row its own parser rejects.

## Safeguard groups in the DSL

A **group** ([app-behavior.md](app-behavior.md#groups-safeguards-sharing-one-required-count)) is
not an entry of its own — its members are ordinary rules carrying `tags` like any other — so the
tag selectors and every per-rule field reach a member with no group-specific syntax. On a member,
`count` retunes its own required count, which inside a group is the size of the gear it **feeds**
the group.

The group's **own** count and bucket chips live on `SafeguardRule.group`, which no per-rule field
touches. Two additions cover them:

**`group.*` assignment family** (`NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES`) — a dotted
family like `weight.<statKey>`, with `group` as its base grammar token:

```
@tag=boots {
  count = 3          // this member FEEDS the group 3
  group.count = 5    // the group KEEPS 5 per merged bucket
  group.perslot = on // the bucket-defining chips (per faction/mainstat/slot/set/rule)
}
```

`group.count` shares the `count` grammar — one parse helper (`pushCountOperation`) serves both
fields, so their accepted syntax cannot diverge. It therefore takes `$count`/`$value` and
arithmetic inside a slider, gets the **same visual calc widget** as a rule's own count
(`operationSupportsSliderValue`), and resolves through the same slider branch. The `group.per*`
chips are booleans and deliberately get no calc widget. Every `group.*` op **no-ops on an
ungrouped rule** — there is no group to retune.

**`grouped` / `ungrouped` selector heads** — bare heads in the shared tag grammar
(`NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS`), matching on group membership the way `tagged`/
`untagged` match on tags, and composable: `@tagged and ungrouped { … }`. Membership is read from
the rule's own inline settings, so it does not depend on neighbours. Only safeguards can be
grouped: the recipe grammar has no such head, and `selectorTermOptionsFor('recipe')` filters
both out of the shared dropdown (`SAFEGUARD_ONLY_SELECTOR_IDS`) so the editor never seeds a row
the recipe parser would reject.

**Head-wins fan-out.** A run's members must all carry identical group settings (the normalizer
enforces it; the engine reads the head). So `applySafeguardOverrides` does not write group ops
inline — matched members record their group's new settings into a pending map **keyed by the
run's start index**, and a final pass writes each entry across that whole run. Consequences:

- matching *any* member retunes the whole group, including its head;
- two stretches sharing an id but separated by another entry are two runs, and only the matched
  one is written (membership is "adjacent AND same id" — run resolution comes from
  `safeguardGroupRunRange`, never a local re-derivation);
- a write that changes nothing clones nothing, so untouched rules stay reference-equal.

Pinned by `tests/unit/safeguard-overrides-groups.test.ts`.

**In the shipped preset.** Every count-writing factor block in every safeguard slider mirrors
its member write with the group's own count, inline and at the same scale
([lategame-preset-design.md](lategame-preset-design.md#tag-conventions-drive-the-notes-dynamic-overrides)):

```
@tag=debuffer and tag=div8 { count=$value/8 group.count=$value/8 }
```

The preset ships groups for its utility damage fan-outs, so those `group.count` writes are live;
on any still-ungrouped family the mirror stays a deliberate no-op (`group.*` does nothing on an
ungrouped rule) and acts as forward-compat wiring — a group formed later out of any family is
driven by its slider the moment it exists, without anyone remembering to add the write. It is the
SAME expression as `count`, not a
bare `$value`, because a group seeds from the MIN of its members' counts: `div8` members promise
`$value/8` and their group must promise the same. Inline (one block, two ops) rather than a second
`@grouped …` block so the expression exists once and cannot drift. Pinned across every slider by
the preset test in `tests/unit/safeguard-overrides-groups.test.ts` and the golden digest.

## Tests

- Unit: `tests/unit/overrides-serializer-roundtrip.test.ts` (see contract above)
  and `tests/unit/overrides-ssot-completeness.test.ts` (vocabulary SSOT pinning),
  `tests/unit/safeguard-overrides-groups.test.ts` (the `group.*` family, the
  `grouped`/`ungrouped` heads, and the head-wins fan-out across a run),
  `tests/unit/overrides-unknown-field-diagnostics.test.ts` (lenient parse vs. editor waves).
- E2E: `tests/playwright/note-overrides-editor.spec.ts` — create flow, pencil re-edit
  (guards the `closest('button')` fix), structured body building.
