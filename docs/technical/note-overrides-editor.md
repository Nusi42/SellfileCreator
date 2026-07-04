# Visual Override-Block Editor

The note dialog's edit mode includes a visual editor that can **create and edit whole
`<!-- recipe-overrides … -->` / `<!-- safeguard-overrides … -->` blocks** without typing
DSL — every construct the parser accepts round-trips through it (prompt/label/detail
strings with `[[cc]]` locale variants, `rb`/`cb`/`slider` options, `*` defaults, `id=`,
constraint tokens, slider params incl. marks/toggle/unit, and `{ @selector { ops } }`
effect bodies with `else` and cross-domain blocks). The acceptance fixture is
`presets/lategame.sfc`: all of its 22 blocks map to the fully structured editor model.

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
  edits do, because question/option ids hash the English base text);
- exhaustive emit↔parse tables cover every operation/selector kind lategame doesn't use.

## UI (`src/components/noteOverridesEditor/`)

- `NoteOverridesBlockEditorDialog.tsx` — modal shell (`maxWidth="md"`, keyed remount per
  open via a request `nonce`), prompt + columns, options list (add/remove/reorder/
  duplicate; radio-default exclusivity), live validation (Apply disabled while
  `validateOverridesBlockDraft` reports problems), dirty-close confirm, and an info
  Alert when English base text changed (answers reset to defaults).
- `OptionEditorCard.tsx` — one accordion per option: kind select, default, `id=`,
  localized label/detail, constraint chip lists (`+ − excl needs ^`, `needs=on|off`,
  `setval` rows), slider params (min/max/step/default, unit, toggle, marks).
- `EffectBodyBuilder.tsx` — structured body rows: per-block validated selector text
  (`@…`), operations as editable chips plus a field-dropdown/value-widget add row
  (enum fields render a Select), sections for cross-domain and `else` blocks, and a
  raw-DSL fallback toggle (structured→raw always works; raw→structured only when the
  text passes the fidelity gate).
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

## Tests

- Unit: `tests/unit/overrides-serializer-roundtrip.test.ts` (see contract above).
- E2E: `tests/playwright/note-overrides-editor.spec.ts` — create flow, pencil re-edit
  (guards the `closest('button')` fix), structured body building.
