# Settings & Persistence

> **What this is.** The SSOT for the app's **persistence taxonomy** — when/whether a setting
> survives a reload — plus a full inventory of persisted localStorage keys. It is orthogonal to
> [Accounts](accounts.md#storage-partitioning), which owns *which account* a key belongs to.
> Two axes: **scope** (global vs per-account — see accounts.md) and **persistence** (this doc).
> Keep this file current when settings are added, moved, or reclassified.

## The persistence categories

Every persisted value falls into exactly one bucket. The bucket determines cross-reload and
cross-tab behavior.

| Category | Mechanism | Reload | Two tabs (same account) | Governed by |
|---|---|---|---|---|
| **Always-persisted** | `createLocalStorageStore` (default) | resumes | last-writer-wins, mirrors on next read | — (sticky like theme) |
| **Rememberable-view** | `createLocalStorageStore({ rememberableView: true })` | resumes **only if** "Remember last view" is ON, else resets to default | not mirrored while ephemeral; last-writer-wins while persisting | the **Remember last view** toggle (`state/rememberableViewPreference.ts`) |
| **Per-tab** | `sessionStorage` | resumes (same tab) | isolated per tab | — |
| **Document (in `.sfc`)** | inside the autosave payload | via restore dialog | n/a (per document) | restore dialog selection |

**How rememberable-view works.** Stores marked `rememberableView: true` consult a live predicate
(`shouldPersistRememberableView()`) on every read/write. The "Remember last view" toggle
(theme popout → `REMEMBER_LAST_VIEW_KEY`, default **ON**) flips the predicate. Flipping ON→OFF
clears every rememberable-view key and resets each store to its default live (via the reset
registry in `state/localStorageStore.ts`). The predicate is injected at boot by a side-effect
import in `main.tsx` (must precede `import App`, so the stores seed with the predicate wired).
Verified live: ON persists a builder-mode switch across reload; OFF does not persist and resets
to default on reload.

> **Naming note.** The option is `rememberableView`, not `sessionOnly`/`sessionView` — "session"
> would wrongly imply per-tab/`sessionStorage`, the opposite of "persists when the toggle is ON".
> The name is grep-symmetric with the user-facing "Remember last view" toggle.

---

## Rememberable-view settings (governed by "Remember last view")

"Where was I / how was I looking at the document" — resumed on reload when the toggle is ON,
reset to defaults when OFF. **All global** (the filter was made global — a filter is a view, not
account data).

> **Dynamic-overrides answers are NOT in this table** — they are **document** state, stored in
> the `.sfc` payload right after `Note` (see
> [Application Behavior](app-behavior.md#sfc-global-note)). One writer/reader serves the file,
> the autosave snapshot, and the background push. The separate *named* override presets
> (`sellfileCreator.dynamicOverridesPresets.v1`) stay a preset library, listed further down.

| Setting | Key | File |
|---|---|---|
| Rules filter — applied values | `sellfileCreator.rulesFilter.state.v3` | `state/rulesFilterPersistence.ts` |
| Rules filter — sync across modes | `sellfileCreator.rulesFilter.sync.v1` | `state/rulesFilterPersistence.ts` |
| Rules filter — panel open | `sellfileCreator.rulesFilter.open.v2` | `state/rulesFilterPersistence.ts` |
| Rules filter — section collapse | `sellfileCreator.rulesFilter.collapse.v3` | `state/rulesFilterPersistence.ts` |
| Gear Inspector — applied substat sort | `sellfileCreator.gearInspector.sort.substats.v1` | `state/gearInspectorSubstatSortPreferences.ts` |
| Builder — recipe section collapse | `sellfileCreator.builder.recipeCollapsed.v1` | `state/builderPreferences.ts` |
| Builder — safeguard section collapse | `sellfileCreator.builder.safeguardCollapsed.v1` | `state/builderPreferences.ts` |

> **Non-uniform collapse defaults.** Builder sections default to *expanded* except those listed
> in `DEFAULT_COLLAPSED_BUILDER_SECTION_IDS` (`state/builderPreferences.ts`) — currently just
> `substatsAnomalous`, the anomalous-substat sub-group. Filter-panel sections all default to
> *collapsed*, so `subAnomalous` needed no special case there. Add to that ID list rather than
> hand-writing a default map, or `parseBuilderPanelCollapsed` and the reset paths will disagree.
| Preview mode (Sellfile / Gear Inspector) | `sellfileCreator.previewMode.v1` | `state/previewBuilderModePreferences.ts` |
| Builder mode (Recipe / Safeguard) | `sellfileCreator.builderMode.v1` | `state/previewBuilderModePreferences.ts` |
| Gear Analytics — section collapse | `sellfileCreator.gearAnalytics.collapsed.v1` | `state/gearAnalyticsPreferences.ts` |
| Gear Analytics — sort mode | `sellfileCreator.gearAnalytics.sortMode.v1` | `state/gearAnalyticsPreferences.ts` |
| Gear Analytics — simulate sold | `sellfileCreator.gearAnalytics.simulateSold.v1` | `state/gearAnalyticsPreferences.ts` |
| Gear Analytics — show fully equipped | `sellfileCreator.gearAnalytics.showFullyEquipped.v1` | `state/gearAnalyticsPreferences.ts` |
| Gear Analytics — champ location scope | `sellfileCreator.gearAnalytics.champLocation.v1` | `state/gearAnalyticsPreferences.ts` |
| Gear Analytics — champ fully equipped | `sellfileCreator.gearAnalytics.champFullyEquipped.v1` | `state/gearAnalyticsPreferences.ts` |
| Gear Analytics — champ include glyphs | `sellfileCreator.gearAnalytics.champIncludeGlyphs.v1` | `state/gearAnalyticsPreferences.ts` |
| **Remember last view** (the master toggle) | `sellfileCreator.rememberLastView.v1` | `state/rememberableViewPreference.ts` — *always-persisted itself* |

---

## Always-persisted settings (sticky, unaffected by the toggle)

### Theme / appearance
Set explicitly, like a preference; SSOT for the details is [Theming System](theming-system.md).
Keys: `themeMode.v1`, `rslhEnabled.v1`, `colorScheme.v1`, `themeCustom.v1`,
`colorScope.{stat,rarity,slot}.v1`, `colorBlindMode.v1`, `recentColors.v1`,
`rulesTable.{slot,faction,set}Icons.*`, `autoSideBySideZoom.{enabled,minZoom}.v1`.

### Grid / table display preferences (how things are DRAWN — sticky like theme)
| Setting | Key | File |
|---|---|---|
| Rules table columns (order/visibility/width) | `sellfileCreator.rulesTableCols.v5` | `state/rulesTableColumnsPreference.ts` |
| Rules table wrap rows | `sellfileCreator.rulesTableWrapRows.v1` | (App.tsx raw) |
| Gear Inspector grid toggles (columns, first-match, match line/index, other matches, champ icons, rule templates, keep-sell highlight, safeguard rank mode, improvement chance) | `sellfileCreator.gearInspector.grid.*` | `state/gearInspectorGridPreferences.ts` |
| Gear Inspector single-select mode | `sellfileCreator.gearInspector.singleSelectMode.v1` | (GearInspectorItemsGrid raw) |
| Sets display order | `sellfileCreator.setsOrder.v1` | `state/setsOrderPreference.ts` |
| Layout splitter ratio | `sellfileCreator.layout.splitterRatio.v1` | `state/splitterPreference.ts` |
| Builder column split ratio (per builder mode) | `sellfileCreator.layout.builderSplitterRatio.v1` | `state/builderSplitterPreference.ts` |
| Note panel size/state | `sellfileCreator.notePanel.v1` | (App.tsx raw) |

### Preset / customization libraries (reusable — must stay shared)
| Setting | Key | File |
|---|---|---|
| Sort presets | `sellfileCreator.sortPresets.v1` | `state/sortPresetsPreference.ts` |
| Filter presets | `sellfileCreator.filterPresets.v1` | `state/filterPresetsPreference.ts` |
| Dynamic-overrides presets | `sellfileCreator.dynamicOverridesPresets.v1` | `state/dynamicOverridesPresetsPreference.ts` |
| **Normalized-overlay presets** (weights/variants library) | `sellfileCreator.gearInspector.grid.normalizedOverlay.presets.v1` | `state/gearInspectorGridNormalizedOverlayPreferences.ts` |

> **Normalized overlay: two keys.** The **presets** library above and the **applied selection**
> (`normalizedOverlay.applied.v1` — `useSortWeights`/`enabledPresetIds`/`lastEnabledPresetIds`),
> both always-persisted. Backward-compat: a one-time migration splits the legacy combined
> `normalizedOverlay.v1` blob, so that key must stay tolerated.

### Export / behavior contracts
| Setting | Key | Scope | File |
|---|---|---|---|
| Auto-push on change | `sellfileCreator.sellfile.autoPush.v1` | **account** | `state/exportPreferences.ts` |
| Deduplicate rules (export) | `sellfileCreator.sellfile.dedupDefault.v1` | **account** | `state/exportPreferences.ts` |
| Omit disabled rules (export) | `sellfileCreator.sellfile.omitDisabled.v1` | **account** | `state/exportPreferences.ts` |
| Persist endpoint gear to autosave | `sellfileCreator.gearDb.persistEndpointGear.v1` | **account** | `state/gearDbPreferences.ts` |
| Hide gear-DB update toast | `sellfileCreator.gearDb.hideUpdateToast.v1` | global | `state/gearDbPreferences.ts` |

> **dedup/omit are per-account** (like auto-push): the background push builds for a specific
> non-active account and reads THAT account's transform via `getSellfileDedupForAccount` /
> `getSellfileOmitDisabledForAccount` — never the active account's. See
> [Accounts](accounts.md#storage-partitioning) for the scoping table.

### Connection / language / first-run / data
| Setting | Key | File |
|---|---|---|
| Language | `sellfileCreator.lang.v1` | `lib/i18n.tsx` |
| RSL Helper port / connect / enabled | `sellfileCreator.rslHelper.*`, `sellfileCreator.rslhEnabled.v1` | `lib/externalWsProtocol.ts` |
| Simple-mode expert flag | `sellfileCreator.simple.expertMode.v1` | `lib/externalWsProtocol.ts` |
| Dungeon simulator selections | `sellfileCreator.dungeonDrops.v1` | `state/dungeonSimulatorPreferences.ts` |
| **Runtime gear-set catalog** | `sellfileCreator.runtimeGearSets.v1` | `lib/gearSets/runtimeStore.ts` |
| Seen markers (readme/tutorial/update/nudge/context hints) | `sellfileCreator.*.seen.*` | various |
| Easter-egg high scores | `sellfileCreator.easterEgg.*.scores.v1` | (constants) |
| **Unsaved-since stamps (staleness ramp)** | `sellfileCreator.stalenessSince.v1` (account-scoped) | `hooks/useStalenessTracking.ts` |

> **`stalenessSince` exists so unsaved age survives a restart.** It holds one record —
> `{ sfc, hsf }`, epoch-ms each, either `null` when that document is saved — written whenever
> either document crosses the clean⇄dirty edge and removed entirely once both are saved. The
> dirty-badge dot ramps from neutral toward the theme's error colour as the stamp ages (see
> [Staleness ramp](app-behavior.md#staleness-ramp-the-aging-dirty-dot)); without persistence the
> stamps would live only in React state and reset on every reload, which is precisely how a user
> lost an hour of edits with the dot still looking calm. Account-scoped because the unsaved work
> it describes is that account's autosave. Malformed or future-dated stamps degrade to "clean"
> rather than to a wrong age, so the worst failure mode is the old flat dot.

> **`runtimeGearSets` is a live feature, not dead** (it looks unused because hydration is lazy).
> It holds **custom/community gear-set catalogs**: drag-and-drop a `.gearsets.json` / `.gearsets`
> file (`hooks/useFileDragDrop.ts` → `useRuntimeGearSetLoader.ts` → `registerRuntimeGearSetsPayload`)
> and the sets appear in set selectors, tooltips (`SetTooltip.tsx`), and recipe/metaset expansion
> (`lib/types.ts`). The restore dialog's "gear sets" unit hydrates it from storage. Global — it's
> a game-level catalog shared across accounts.

### Account infrastructure & per-tab
| Setting | Key | Mechanism | File |
|---|---|---|---|
| Account registry | `sellfileCreator.accounts.v1` | localStorage (merge-on-write) | `lib/accounts.ts` |
| Per-account document data | `sellfileCreator.acc.<id>.*` | localStorage (account-namespaced) | `lib/accounts.ts` |
| Tab's active account | `sellfileCreator.activeAccount.session.v1` | **sessionStorage (per-tab)** | `lib/activeAccountSession.ts` |
| Tab id (auto-push owner gate) | `sellfileCreator.tabId.session.v1` | **sessionStorage (per-tab)** | `lib/autoPushOwnership.ts` |
| Auto-push owner (per account) | `sellfileCreator.autoPush.owner.<id>.v1` | localStorage (single-owner lock) | `lib/autoPushOwnership.ts` |
| Simple-mode session marker | `sellfileCreator.simple.session.v1` | **sessionStorage (per-tab)** | `lib/runtimeConfig.ts` |

See [Accounts](accounts.md) for how account-scoped keys resolve (`resolveAccountScopedKey` /
`resolveAccountScopedKeyFor`, `ACCOUNT_SCOPED_BASE_KEYS`) and the per-tab account model.

---

## Adding a new view-only setting (the SSOT payoff)

To make a new "where was I" setting behave like the rest of the rememberable-view category, just
create its store with `rememberableView: true`:

```ts
const myViewStore = createLocalStorageStore<T>({
  key: MY_VIEW_KEY,          // add to constants.ts
  fallback: /* default */,
  parse, serialize,
  rememberableView: true,    // ← joins the "Remember last view" category automatically
})
```

It automatically: persists only when the toggle is ON, resets on ON→OFF, and stays in-memory
while ephemeral. No other wiring needed — the factory handles the predicate + reset registration.
**Display preferences** (always-sticky) omit `rememberableView`. **Document state** goes in the
`.sfc` payload instead (see [Rules & Data](rules-and-data.md) for the autosave document).

A worked example of the last case: a safeguard's group membership (`group`) is **document**
state, not a rememberable view. It lives on the entry inside the `.sfc` rather than in
localStorage, because it belongs to the document's structure — it survives reorder/undo/autosave
and travels with a shared file, where a per-machine view preference would not. The candidate
flyout's *Group* toggle, by contrast, is plain component state: it describes how one person is
looking at the list right now and is dropped the moment the selection changes.
