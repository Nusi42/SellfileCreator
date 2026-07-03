# Preset Patches

This directory holds the shipped sellfile presets (`beginner.sfc`,
`lategame.sfc`) and optional **patch** files that the release pipeline
applies on top of a preset before bundling it into a build.

A patch is a small JSON document that declaratively edits the base preset:
drop a metaset, disable a safeguard, swap a label in the embedded Note, etc.
The original `.sfc` file in this directory stays untouched — patches affect
only the build artifact.

> The applier lives at [`src/lib/presetPatch.ts`](../src/lib/presetPatch.ts);
> the CLI used by the release script is
> [`scripts/tooling/apply-preset-patch.mjs`](../scripts/tooling/apply-preset-patch.mjs).
> Behavior is locked in by
> [`tests/unit/preset-patch.test.ts`](../tests/unit/preset-patch.test.ts) —
> every example below is reproduced as a test in that file.

## Naming convention

| File                         | Role                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| `beginner.sfc`               | Minimal starter recipe set, intentionally permissive.                |
| `lategame.sfc`               | Comprehensive recipe + safeguard set with embedded recipe-overrides. |
| `lategame.patch.json`        | Optional release-time edits applied to `lategame.sfc`.               |

If a `<preset>.patch.json` file is present beside a preset, the release
script automatically applies it; if it is absent, the preset ships as-is.

## Targeting entries

Every edit/remove operation takes a `target` field that identifies which
entry in `Metasets[]`, `Recipes[]`, or `Safeguards[]` to act on. Two forms
are supported:

- **String** — match by `appearance.name` (modern shape) or top-level `name`
  (legacy shape). Must match **exactly one** entry; ambiguous names throw
  with a list of the conflicting 1-based indices.
- **Number** — **1-based** array index. Use this when names repeat (the
  `lategame.sfc` recipe list contains many duplicates by design) or when an
  entry is unnamed (most `lategame.sfc` safeguards have no name).

Indices in a patch always refer to positions in the **base preset**, never
the in-progress patched output. The applier resolves every target to an
object reference *before* any mutations, so `remove: [1, 3]` correctly drops
both entries even though removing index 1 would otherwise shift index 3.

## Soft-disable

Both recipes and safeguards already have schema fields for the "keep but
don't apply" state — patches use these fields rather than introducing new
ones:

- Recipe: `SellfileVisibility = "Disabled"` (set by `{ "disable": true }`)
- Safeguard: `activation = "off"` (set by `{ "disable": true }`)

This means a patched preset round-trips through the app unchanged: open the
patched build artifact, see the same flags you'd see if you'd toggled them
manually.

## Top-level shape

```json
{
  "metasets":         { "remove": [...], "edit": [...], "add": [...] },
  "recipes":          { "remove": [...], "edit": [...], "add": [...] },
  "safeguards":       { "remove": [...], "edit": [...], "add": [...] },
  "note":             { "replace": [...], "append": "...", "prepend": "..." },
  "safeguardsEnabled": false,
  "recipesEnabled":    false
}
```

All fields are optional. Omitting a field leaves the corresponding section
of the base preset untouched.

---

## Metasets

### Drop a metaset

```json
{ "metasets": { "remove": ["Useless"] } }
```

Removes the metaset whose name is exactly `"Useless"`. Equivalent
index form for the same fixture:

```json
{ "metasets": { "remove": [2] } }
```

### Drop a single set from a metaset

The common "ship without the scarce-set entries" tweak:

```json
{
  "metasets": {
    "edit": [
      { "target": "Nuker", "removeSetNames": ["Mercurial"] }
    ]
  }
}
```

### Add sets to a metaset

```json
{
  "metasets": {
    "edit": [
      { "target": "Nuker", "addSetNames": ["Lethal", "Savage"] }
    ]
  }
}
```

Duplicates are silently skipped, so re-running the patch is idempotent.

### Replace a metaset's setNames entirely

```json
{
  "metasets": {
    "edit": [
      { "target": "Nuker", "setNames": ["Foo", "Bar"] }
    ]
  }
}
```

`setNames` (replace) cannot be combined with `addSetNames` /
`removeSetNames` — pick one mode per edit.

### Rename and toggle visibility

```json
{
  "metasets": {
    "edit": [
      { "target": "Useless", "rename": "Hidden Trash", "show": false }
    ]
  }
}
```

### Add a brand-new metaset

```json
{
  "metasets": {
    "add": [
      { "name": "Brand New", "setNames": ["Speed"], "show": true }
    ]
  }
}
```

The object inside `add` is appended verbatim — it should match the SFC
metaset schema (see the existing entries in `lategame.sfc` for shape).

---

## Recipes

### Soft-disable a recipe

```json
{
  "recipes": {
    "edit": [
      { "target": "Speed", "disable": true }
    ]
  }
}
```

Sets `SellfileVisibility` to `"Disabled"`. Pass `"disable": false` to
re-enable a recipe that was previously disabled (only takes effect on
recipes that are currently disabled — does not promote a Separator entry).

### Explicit visibility state

```json
{
  "recipes": {
    "edit": [
      { "target": "Speed", "visibility": "Separator" }
    ]
  }
}
```

When both `visibility` and `disable` are supplied, `visibility` wins.

### Disambiguating duplicate names

`lategame.sfc` reuses names like `"Damage - Any Set"` (12×) across slots.
A bare name target throws and lists the conflict positions:

```
[preset-patch recipes.remove[0]] recipes name 'Damage - Any Set' is
ambiguous — 12 entries at indices 14, 16, 17, 19, 22, 25, 27, 28, 31, 34,
36, 37; use a numeric index to disambiguate
```

Pick whichever entry you actually meant:

```json
{ "recipes": { "remove": [14] } }
```

### Append a new recipe

```json
{
  "recipes": {
    "add": [
      {
        "appearance": { "name": "Fresh" },
        "SellfileVisibility": "Active"
      }
    ]
  }
}
```

The object is added verbatim. Schema validation happens later when the SFC
loads, so a malformed recipe will surface there — not here.

---

## Safeguards

### Soft-disable by name

```json
{
  "safeguards": {
    "edit": [
      { "target": "SPD boots", "disable": true }
    ]
  }
}
```

Sets `activation` to `"off"`. The safeguard remains in the file but
contributes nothing to the gear queue, so the original logic
stays inspectable in the app.

### Soft-disable an unnamed safeguard by index

`lategame.sfc` ships with 100+ safeguards that have no `appearance.name`.
Index targeting is the only way to reach them:

```json
{
  "safeguards": {
    "edit": [
      { "target": 42, "disable": true }
    ]
  }
}
```

### Tweak requiredCount and activation explicitly

`activation` accepts `"off"`, `"protectExisting"`, `"anticipateGaps"`, or
`"anticipateImprovements"` (keeps anticipate placeholders active even after
the quota is met so fresh drops stay protected).

```json
{
  "safeguards": {
    "edit": [
      { "target": "Accessories", "requiredCount": 8, "activation": "anticipateGaps" }
    ]
  }
}
```

### Hard-remove a safeguard

```json
{ "safeguards": { "remove": ["SPD boots", 12] } }
```

Removed safeguards are gone from the shipped artifact entirely. Prefer
`disable` over `remove` unless you have a reason to make the build artifact
diverge from the source preset.

---

## Note

The `Note` field is the markdown blurb that appears at the top of the
preset (and that carries the embedded `<!-- recipe-overrides -->` DSL).
Patch operations on it are intentionally low-level: regex find/replace plus
bulk append/prepend.

### Simple substitution

```json
{
  "note": {
    "replace": [
      { "pattern": "TOKEN", "replacement": "REPLACED" }
    ]
  }
}
```

`flags` defaults to `"g"` (global). Add `"m"` for `^` / `$` line anchors or
`"s"` to let `.` match newlines.

### Multi-line collapse with dotall

```json
{
  "note": {
    "replace": [
      { "pattern": "Line 2.*Line 3", "flags": "gs", "replacement": "COLLAPSED" }
    ]
  }
}
```

The applier joins array-shaped Notes with `\n` before running the regex
and splits back afterwards, so multi-line patterns work without special
escaping.

### Multiple sequential replacements

```json
{
  "note": {
    "replace": [
      { "pattern": "Line 1", "replacement": "First" },
      { "pattern": "Line 3", "replacement": "Third" }
    ]
  }
}
```

Replacements run in declared order.

### Append / prepend lines

```json
{
  "note": {
    "append":  ["", "<!-- patched for public release -->"],
    "prepend": "## Release Build"
  }
}
```

Strings are split on `\n`, arrays are concatenated verbatim. Operations
run prepend → append → replace, so a replace can match content that was
just appended or prepended.

### Invalid regex

Bad patterns throw at apply time, listing the operation index and the
underlying regex engine error — the release script halts so you can fix
the patch before it ships.

---

## Global flags

Toggle the global enable flags independently of per-entry edits:

```json
{
  "safeguardsEnabled": false,
  "recipesEnabled":    true
}
```

Omitting a flag leaves the original value intact.

---

## End-to-end example

A combined patch matching the "drop the scarce-set metaset, disable the
SPD boots safeguard, mark the artifact as a patched release build" scenario:

```json
{
  "metasets": {
    "remove": ["Useless"],
    "edit":   [{ "target": "Nuker", "removeSetNames": ["Mercurial"] }]
  },
  "safeguards": {
    "edit": [{ "target": "SPD boots", "disable": true }]
  },
  "note": {
    "append": "<!-- patched for public release -->"
  }
}
```

Run it manually against any preset:

```sh
node scripts/tooling/apply-preset-patch.mjs \
  presets/lategame.sfc \
  presets/lategame.patch.json \
  out/lategame.patched.sfc
```

The CLI compiles the patch module on demand (same TypeScript pipeline as
the test suite and gen-release-hsf), applies the patch, and writes a
fresh `.sfc` file ready for the rest of the release pipeline.

## Future extensions

These are out of scope for the current patch system; flag the need when
they come up:

- **Multi-variant patches**: today one `<preset>.patch.json` is detected
  automatically. Multi-variant authoring (e.g. `lategame.patch.public.json`,
  `lategame.patch.internal.json` with the output filename passed as a
  build parameter) is a planned extension.
- **Patching `Minima` and `FinalSellRemainder`**: not currently supported.
- **Soft-disable flag for safeguards/recipes via a dedicated `enabled` field**:
  not exposed — patches reuse the existing `SellfileVisibility="Disabled"`
  and `activation="off"` schema slots so patched files round-trip cleanly.
