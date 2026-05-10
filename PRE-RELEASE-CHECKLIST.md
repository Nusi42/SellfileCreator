# Pre-Release Checklist

## v1.0.9 — 2026-05-11

- Verify React Compiler lint fixes (refs-to-useLayoutEffect, refs-to-state conversions, useCallback deps) do not introduce regressions — test interaction flows in App.tsx, MetasetsDialog, SafeguardBuilderPanel, and TutorialCoach (a79212e9, 80c47b65)
- Verify Dialog unmountOnExit theme default (f5a17a69, 688bbb2a) does not break any dialog lifecycle or state management — test opening/closing all dialogs (help, import options, copy/paste, metaset conflict, gear analytics, dungeon simulator) and verify content is properly torn down and recreated on reopen
- Test dungeon simulator thoroughly — verify it auto-starts reliably on tab open, stops cleanly on close, and prevInputs/worker state reset correctly with the new key-bumping logic (f5a17a69)
- Review release-notes generation refactor for correctness — map-reduce chunking and checklist separation is a significant architecture change; ensure future releases produce correct output (deecab47)
- Verify filter state persistence backward-compatibility: existing saved filter states should load correctly even though improvChance collapsible section is new (e9e62515)
- Verify improvement-chance scoping refactor (a9f72737): new per-rule keying and WASM changes significantly alter safeguard filtering logic. Review improvement-chance-per-rule.test.ts (258 new lines) and test safeguard rules with multi-level improvement thresholds to confirm threshold gates evaluate per-rule chance correctly (a9f72737)
- Verify react-colorful dependency (7434d01f) for no version conflicts or accessibility issues; test gradient+hue picker across all color-setting contexts (label colors, content colors) (7434d01f)
- Verify recentColorsPreference backward-compatibility: upgrading users without prior recent-colors state should initialize gracefully (7434d01f)
- Verify builtin preset hidden flag round-trips through sanitize/serialize: builtin stubs must persist and restore the hidden field correctly (7434d01f)
- Verify cID fingerprint hash collision resistance (663a1293): coprime-prime heuristic (1000003, 7919) should not alias duplicate champion packets in practice; spot-check large gear databases if possible (663a1293)


## v1.0.9 — 2026-05-10

- Large ref and React Compiler lint refactoring (a79212e9, 80c47b65): verify no regressions in ref-heavy components (App.tsx, GearAnalyticsTabContent, MetasetsDialog, TutorialCoach, SafeguardBuilderPanel, HsfRulesTable). Refs converted to state where readable during render; render-time mutations moved to useLayoutEffect; deps completed on useCallback hooks.
- Dialog unmountOnExit behavior moved to theme.ts default (688bbb2a); verify all 16 dialogs unmount correctly on close instead of lingering in DOM.
- Release notes tooling refactored to map-reduce pipeline with size-based chunking (deecab47); PRE-RELEASE-CHECKLIST.md now auto-populated by awk from per-version checklist sections. Verify docs/technical/build-and-tooling.md reflects new workflow.
- SafeguardBuilderPanel: popover refs pre-created to satisfy React Compiler (339d335a); verify improvementChance and weights popovers open/close correctly.
- Gear inspector lock icon is wired through the pipeline but currently dormant (RSL Helper emits readOnly:false unconditionally); verify endpoint fix is scheduled upstream before release (8cc41752).
- New npm dependency: react-colorful@5.7.0 (MIT license); verify license compatibility and bundled size impact (7434d01f).
- Builtin presets hidden flag added to SFC serialization; verify backward compatibility when loading pre-1.0.9 .sfc files with builtin presets (7434d01f).
- SafeguardRuleSignature now includes sorted tags field; verify no regressions in change detection and undo/redo flow for tag-only edits (56877cbe).


## v1.0.9 — 2026-05-10

- Verify 0-star ascension filter now includes 0-star items as expected after bug fix (e9e6251502)
- Verify improvement chance range filter sorting treats +16/100% degenerate case consistently (e9e6251502)
- Verify dungeon simulator CPU usage is reduced when closing dialog (f5a17a69)
- Verify all i18n translations for new keys across 10 locales are accurate (improvement chance filter, Scoped Sell presets, result filter tooltip) (da7976d1, 9b0d99be, 73c6aec1)
- Check that docs/TECHNICAL.md entry for release-notes workflow points to correct files after restructure (deecab47)
- Verify dialog unmount behavior properly releases memory (dialogs in ConfirmDialogs, Copy, Header, Help, Metasets, Note, Paste, SafeguardChips, file-format-error, gear-inspector-tab, logic-hub, manage-colors, metaset-conflict, restore-autosave, sfc-import-options) (f5a17a69, 688bbb2a)
- Verify hidden state on builtin filter and sort presets persists across reload; confirm toggle-show-hidden reveals them dimmed (7434d01f)
- Verify recentColorsPreference defaults (6 colors) display immediately on first use and deduplication is case-insensitive (7434d01f)
- Verify ColorField's onChangeCommitted callback in ManageColorsDialog fires once on popover close and not on every drag; confirm no excessive re-renders in preview (7434d01f)


## v1.0.9 — 2026-05-10

- Verify `Basic.sfc` bundled preset content before shipping — it is baked into the JS bundle via `?raw` import (`src/components/HeaderActions.tsx` lines 17–18) but its content should be reviewed to confirm it represents a genuinely beginner-friendly starting configuration.
- Confirm rapid open/close of the Logic Hub dialog does not accumulate stale Dungeon Simulator worker instances — the fix bumps a React key on `DungeonSimulatorTab` each time the dungeon panel becomes active, plus `isActive=false` immediately terminates the worker; smoke-test with 5–10 rapid toggles.


Maintainer-facing review items collected during release-notes runs. Newest first.
Delete entries once handled.

Items are written by `scripts/release/run-release-notes-catchup.sh` (which calls
Claude in worker mode for large releases). Each release adds a `## v<version> — <date>`
section at the top.
