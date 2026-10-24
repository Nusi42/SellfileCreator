# Pre-Release Checklist

## v1.0.49 — 2026-10-24

- Release builds only check that the game asset pack folder exists, not that every icon is in it. A set, faction, or champion missing from the pack ships as a lettered placeholder tile with no error. Before the release, confirm every set, faction, and champion shows its real icon in the release build, or add a per-icon check to the asset plugin: `scripts/vite/gameIconsPlugin.ts`, `src/lib/iconMaps/gameIcons.ts`. Found in ccd6c5a4.

- `docs/technical/tutorial.md` (line 9) and `docs/technical/ui-and-layout.md` (line 68) still describe the app as closed source, but the license change dropped that wording from the user-docs rules in CLAUDE.md. Reword both to match the public AGPL setup before the repository goes public. Found in f77b074a.

## v1.0.38 — 2026-07-16

- Investigate and optimize autosave restore memory usage in multi-account scenarios — restoring previous session state shows 1.75 GB heap spike right after restore, before any endpoint frame; flagged as a secondary contributor to the OOM issue and needs follow-up investigation (b50e50e1)


This file is generated and maintained by `scripts/release/run-release-notes-catchup.sh`
(or its PowerShell twin `run-release-notes-catchup.ps1` on Windows),
which runs Claude worker/reducer agents during a release-notes pass and mechanically
prepends a `## v<version> — <date>` section of maintainer review items (prompts:
`docs/CREATE-RELEASE-NOTES.md`, `docs/CREATE-RELEASE-NOTES-WORKER.md`). It is a working
document, not an archive — act on items and delete them once handled. Newest section on top.

## Open follow-ups (carried over)

Distilled from the v1.0.9–v1.0.14 sections (all shipped). Routine "verify shipped
feature" notes were reviewed and removed; only still-open, actionable items remain.
Each was re-confirmed against current code.

- **Affinity merge protection** — RSL Helper still doesn't send `Affinity` in the champions packet, so the dev-only `console.warn` ([src/lib/externalCommands.ts:459](src/lib/externalCommands.ts#L459)) and the upsert merge-protection ([src/lib/importers/gearDbLookups.ts:159](src/lib/importers/gearDbLookups.ts#L159)) are still needed. Remove/simplify once Helper includes Affinity. (60fb87ab)
- **DSIM WASM output migration** — `rule_engine_dsim_wasm` still returns output via `to_js_value` ([wasm/rule_engine_dsim_wasm/src/lib.rs:75](wasm/rule_engine_dsim_wasm/src/lib.rs#L75)) instead of the JSON-string wire format `rule_engine_wasm` uses. Migrate in the next WASM-boundary pass. (b77cc673)
- **ESLint import-x suppression** — `suppressMissingFileEnumeratorAPIWarning: true` is still set ([eslint.config.js:106](eslint.config.js#L106)) to silence the removed-FileEnumerator-API warning. Drop it once `eslint-plugin-import-x` ships an alternative. (28a8c5b8)
- **Gear Inspector lock icon dormant** — lock wiring is complete ([src/components/GearInspectorGridCard.tsx:1328](src/components/GearInspectorGridCard.tsx#L1328)) but inert because RSL Helper emits `readOnly:false` for every artifact. Re-test once the Helper endpoint is fixed upstream. (8cc41752)
- **WMDE table styling workaround** — markdown editors override `@uiw/react-md-editor`'s hardcoded table CSS with MUI vars ([src/components/NoteDialog.tsx:4139](src/components/NoteDialog.tsx#L4139), [src/components/HelpDialog.tsx:258](src/components/HelpDialog.tsx#L258)). Fragile if WMDE changes its table markup/classes; revisit for a sturdier approach. (2b5cd0a3)
