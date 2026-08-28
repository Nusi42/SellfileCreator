# Accounts (multi-account support)

Sellfile Creator supports multiple game accounts on one machine. The ownership model is
**one human, one machine, N game accounts**: different real people are expected to use
different OS users (separate browser/WebView profiles → separate localStorage), so
user-level state stays global and only game-account-level state partitions.

SSOT: `src/lib/accounts.ts` (registry + key scoping), `src/state/useAccounts.ts` (React
subscription), `src/components/AccountSwitcher.tsx` (UI, mounted in the app header and in
the simple-mode Note dialog action bar).

## Account model — two ids, deliberately decoupled

```ts
type SfcAccount = {
  id: string                 // internal SFC id — immutable, generated; storage namespace hangs off it
  displayName: string        // THE account name = the player's name in the game (see below); OPTIONAL — '' is valid
  nameEllipsis?: 'left'|'right' // which side long names truncate on in the switcher button; absent = 'left' (end of name visible)
  helperAccountId?: string   // the game's Player ID (e.g. "um12345678") — permanent, unique
  helperBound?: boolean      // set on first identity adoption; guards re-claiming
  accentColor?: string       // per-account accent for at-a-glance identification
  unstampedDefault?: boolean // at most ONE account: receives endpoint data without a playerId stamp
  origin: 'legacy' | 'helper' | 'manual'
  createdAt: string
  lastActiveAt: string
}
```

Names are optional: UI labels resolve through `accountDisplayLabel` (name → Player ID →
'' with a localized "Unnamed" fallback at the call sites), an empty name is never sent as
a `playerName` identity nor matched by `findAccountByPlayerName`. An account must still
keep SOME identity (name or Player ID): the create dialog gates its confirm button on
one being present, and manage-mode edits that would empty both revert the fields to
their dialog-open values.

The registry (`{ activeAccountId, accounts[] }`) lives in the **global** key
`sellfileCreator.accounts.v1`. Because the namespace hangs off the internal `id`,
binding/rebinding/unbinding a helper id never moves storage, and accounts created without
any endpoint connection are first-class (they simply have no binding yet).

## Startup resolution (lazy, import-order-independent)

`ensureAccountsInitialized()` runs on the first key resolution — typically at
`constants.ts` module init — in this order:

1. **Legacy migration** (registry absent): create a single `Default` account
   (`origin: 'legacy'`, fixed id `default`) and MOVE every account-scoped key (plus the
   old `autosave.sfr.v1`) into its namespace. Registry existence is the migration marker.
   The first account's id is deliberately deterministic: the Playwright runner imports
   `constants.ts` in Node (in-memory registry) while the browser migrates its own fresh
   registry — the fixed id makes both resolve the same scoped keys, so specs can seed
   account-scoped storage. Subsequently created accounts get random ids.
2. **Registry load** with defensive sanitization (corrupt entries dropped, dangling
   active id clamped to the most recently used account).
3. **URL resolution** of `?playerid=` / `?playerName=` (parsed in `runtimeConfig.ts`).
   Either param alone is a full identity — RSL Helper may consistently use the Player
   ID, the name, or both:
   - Player ID matches a bound account → activate it;
   - else the name matches an account name (displayName IS the in-game player name)
     → activate it;
   - else exactly ONE never-claimed account exists (`helperBound` unset) → claim it
     (this folds a legacy user's data into their helper account on first launch);
   - otherwise → create a fresh `origin: 'helper'` account and activate it.
   The identities the launch carried are then recorded (`adoptHelperIdentity`): the id
   binds permanently, and the name ALWAYS refreshes `displayName` — the game owns the
   name, so in-game renames propagate whenever the Player ID identifies the account.
   (Name-only usage cannot recognize renames — the old name is unknown — so the docs
   recommend RSL Helper sends the Player ID.)
   The params are then stripped from the address bar (same pattern as `?endpoint=`),
   together with `?simple` — the latter only after its sessionStorage marker
   (`SIMPLE_MODE_SESSION_KEY`) verifiably persisted, because F5 and the account-switch
   reload must stay in simple mode; storage-less environments keep the param instead.

Switching accounts pins the tab's session marker (see below), writes the registry
`activeAccountId`, and performs a full `location.reload()` — one document per session; an
in-place swap would bleed state across dozens of stores, the autosave debouncers, and the
WASM pipeline. The reload re-runs boot, which re-resolves the tab's account and re-freezes
the scoped key constants against it.

### Per-tab active account (multi-tab safety)

`localStorage` is shared across every tab of the same origin, so the registry's
`activeAccountId` alone cannot answer "which account does THIS tab edit" — two tabs would
collide on one global value, and a refresh could silently re-point a tab and overwrite the
wrong account's autosave. So the tab's active account lives in **`sessionStorage`**
(`ACTIVE_ACCOUNT_SESSION_KEY`, `lib/activeAccountSession.ts`) — per-tab, surviving a
same-tab reload (F5, the account-switch reload) but not a new tab.

Boot (`ensureAccountsInitialized`) resolves the tab's account by precedence:
1. a `?playerid=`/`?playerName=` launch param — RSL Helper opens the app FOR an account, so
   it wins and re-points the tab (and updates the registry default);
2. else the tab's stored `sessionStorage` id, if it still names a live account — a plain
   reload keeps the tab on its account;
3. else the registry's `activeAccountId` — a fresh tab boots to the last-used default.

The winner is frozen into `activeAccountIdForSession` (session-long, like the scoped key
constants that depend on it) and written back to `sessionStorage`. `resolveAccountScopedKey`
and `getActiveAccount` resolve against it, so two tabs edit their OWN accounts without ever
sharing an autosave key. The registry `activeAccountId` is demoted to "which account a FRESH
tab boots into" (last-used default). `switchAccount`/`deleteAccount` update both the
in-session id and the session marker so the caller's reload lands on the right account.

### Registry lost-update merge

Each tab holds its own in-memory `registryCache` and never observes another tab's writes
(the `storage` event is deliberately unused, see `state/localStorageStore.ts`). A blind
whole-object write would lose-update: tab A creates account X, tab B (never saw X)
renames an account and overwrites, erasing X. So `persistRegistry` **re-reads and merges**
at its single choke point: accounts present only in storage (created by another tab) are
re-added, this tab's own edits win for its accounts, and ids passed via `deletedIds` (from
`deleteAccount`) are removed even if a racing tab re-persisted them. The account list is a
LIST, so the merge is union-by-id, not last-writer-wins.

Because `activeAccountId` persists in the registry, the next FRESH tab WITHOUT a
`?playerid=` param resumes the last-used account; the URL param only overrides that
per-launch, and an existing tab's `sessionStorage` marker overrides it per-tab.

## Account manager

Each row in the switcher menu carries a gear icon that opens the manager for THAT
account — no switch required (essential for editing a non-active account's auto-push).
The manager edits: name (optional — see label fallback above), accent color, the
**name-ellipsis side** (which end of a long name the switcher button truncates;
default left, i.e. the end of the name stays visible), the **Player ID binding** (free-text field,
opaque string, shown with the game's own "Player ID" terminology; empty unbinds — this
is how users pre-bind accounts before RSL Helper passes ids itself), the **per-account auto-push** flag
(`get/setSellfileAutoPushForAccount` in `state/exportPreferences.ts` — the active
account routes through the live store so React subscribers stay in sync; other accounts
write their namespaced key directly with store-parity serialization), the
**unstamped-data default** flag (below), the **per-account endpoint-gear persistence**
toggle (below), and deletion behind a regular confirmation dialog (manage mode only).
The create dialog carries the SAME fields (staged until "Create & switch") so both flows
share one look and feel — only deletion is manage-exclusive.

Each switcher row shows a summary block (`lib/accountSummaries.ts`, computed lazily on
menu open), one fact per line: "Saved <date>", "Pushed <date>" + a send-glyph showing the
account's auto-push state (green = on, dimmed = off; localized state in the tooltip),
"N recipes · M safeguards · K rules", and the shared `GearInspectorOutcomeSummaryChip`
(total / sold / kept / safeguarded). Saved (local
autosave) and pushed (what RSL Helper has) are different facts, so the push line is
always present — "Not pushed yet" when no upload has succeeded — to keep the saved line
from being misread as push state. Recipe/safeguard counts come from the account's SFC
autosave parse; the generated-rule count and the gear outcome come from the
`accountStats.v1` snapshot the live session writes whenever its pipeline results change
(guarded on gear rows existing so app boot cannot clobber a real snapshot with zeros) —
for non-active accounts they show the last known state from that account's most recent
live session. Rows mark the ACTIVE account with a leading right arrow; the accent renders
as a trailing square swatch. The simple dialog additionally labels its auto-push button
with the ACTIVE account's "Pushed <date>" (same key; recomputed off the push-signal
counters since the raw key has no reactive store).

## Unstamped-data default (`unstampedDefault`)

Radio-semantics flag (`setUnstampedDefaultAccount` clears it from all others): endpoint
data arriving WITHOUT a `playerId` stamp belongs to the flagged account. The legacy
migration flags the created `Default` account, so pre-stamping RSL Helper data keeps
belonging to the user's original data set even after they create more accounts. Routing in
`handleExternalCommand`: no flag, or flag on the active account → attribute to the
active session (legacy behavior); flag on a NON-active account → the packet is handed to
the background push service for that account (never merged into the active view). A
binary-DB push cannot be background-serviced and drops with the mismatch toast instead.

## Endpoint-gear persistence toggle (per account)

`gearDb.persistEndpointGear.v1` (account-scoped; `state/gearDbPreferences.ts`, default
ON). When OFF, the account's real gear data (endpoint or file import) is kept out of
localStorage for perf/sanity: the live gearInspector autosave payload filters to manual
items (`isManualGearInspectorItem`), and the background account-push honors the TARGET
account's flag before writing its gear autosave. The live store covers the ACTIVE
account's resolved key; `get/setPersistEndpointGearForAccount` are the raw per-account
accessors (same pattern as auto-push). Historical note: the flag was global at first —
that orphaned global key is simply ignored now (no migration, by decision).

## Storage partitioning

Guiding rule: **documents and game-account data are per-account; app look/behavior is
global.** Ambiguous keys default to global (splitting a global key per-account later is
lossless; merging divergent per-account values back is not).

Account-scoped base keys (the `ACCOUNT_SCOPED_BASE_KEYS` set in `lib/accounts.ts` is the
enforcement point; scoped keys become `sellfileCreator.acc.<id>.<rest>`):

| Base key | Why per-account |
|---|---|
| `autosave.sfc.v1` | the sellfile document (recipes, safeguards, note incl. override answers, metasets) |
| `autosave.gearInspector.v1` | the gear queue is one account's inventory |
| `autosave.restoreSelection.v1` | refers to the account's own autosaves |
| `builder.userDefaults.v1`, `safeguardBuilder.userDefaults.v1` | encode the account's gear strategy |
| `simple.variant.v1` | beginner/lategame/custom tracks account progression (consulted only when no autosave entry exists — the entry's `PresetOrigin` marker otherwise decides the startup source) |
| `simple.customSnapshot.v1` | the account's own (non-preset) simple-mode document plus its unsaved stamp, kept while the user tries a preset so a reload cannot lose it |
| `sellfile.autoPush.v1` | auto-push is a per-account contract with RSL Helper; tri-state raw value — '1' / '0' / absent — where "absent" means never configured: express simple mode defaults auto-push ON only then (`hasExplicitSellfileAutoPushForAccount`), so an explicit off survives simple starts and account switches |
| `sellfile.dedupDefault.v1`, `sellfile.omitDisabled.v1` | per-account export transforms — the background push applies the TARGET account's dedup/omit (read via `getSellfileDedupForAccount`/`getSellfileOmitDisabledForAccount`), so they must partition per account like auto-push |
| `sellfile.lastPush.v1` | ISO timestamp of the account's last SUCCESSFUL upload (written by both the foreground and background push; shown in the switcher's row summary) |
| `sellfile.lastPushError.v1` | ISO timestamp of the last FAILED background push (toast-free feedback: rendered as the switcher row's error line; cleared by the next successful push) |
| `accountStats.v1` | tiny snapshot of live pipeline RESULTS (generated-rule count + gear total/sold/kept/safeguarded) — written by the live session for its own account, since these are not derivable from autosaves at menu-open cost |
| `gearDb.persistEndpointGear.v1` | whether the account's REAL endpoint gear persists into its gearInspector autosave (perf/sanity, default ON) — each account decides its own storage footprint |

Everything else stays global — the theming system (also required: MUI reads its theme keys
synchronously before account resolution could run), colour maps, display/UI toggles, preset
libraries (filter/sort/dynamic-overrides), `runtimeGearSets` (game-level catalog; also the
largest key), connection settings (`rslHelper.port/connectEnabled`), seen-markers, and
`simple.expertMode`. Note the rules **filter** (`rulesFilter.state/sync`) is global, NOT
per-account: it is view state governed by the "Remember last view" toggle, not the account.

> **Whether a global key persists across reloads** (always, toggle-governed, or per-tab) is a
> separate axis from account-scoping and lives in
> [Settings & Persistence](settings-and-persistence.md) — that doc is the SSOT for the
> persistence taxonomy (always-persisted / rememberable-view / per-tab) and the full
> localStorage-key inventory. This section stays the SSOT for *which account owns a key*.
> Cross-tab note: the store layer deliberately does NOT broadcast
> (`state/localStorageStore.ts`), so a global key edited in one tab is simply what the next tab
> reads. The only account state that is per-tab (`sessionStorage`) is `activeAccount.session.v1`
> and `tabId.session.v1` (see "Per-tab active account").

Key resolution flows through two exports only:
- `resolveAccountScopedKey(baseKey)` — resolves for the ACTIVE account; safe at module
  scope because the active account is fixed per session.
- `resolveAccountScopedKeyFor(accountId, baseKey)` — resolves for an explicit account;
  the public SSOT of the namespace formula for background flows that service a
  non-active account. Never hand-roll `sellfileCreator.acc.<id>.…`.

Deleting an account sweeps every `sellfileCreator.acc.<id>.*` key; the last remaining
account cannot be deleted.

## Per-account accent

Each account carries an optional `accentColor` (auto-assigned from
`ACCOUNT_ACCENT_PALETTE`, editable in the account dialog, clearable via the struck-through
"none" swatch — `setAccountAccent(id, undefined)` deletes the field). The ACTIVE account's
accent FILLS the switcher button; the label is the runtime scheme's `text.primary` pushed
through `ensureContrastOnBg` against that fill (colour-SSOT rule for theme text on a user
colour), and hover blends scheme text over the fill at an `ALPHA` ladder step (the
variant's own hover background would wipe the fill otherwise). Without an accent the
button keeps the default theme colour. Menu rows keep raw accent dots (background
swatches need no adaptation) — an at-a-glance "which account am I on" marker without
forking the global theme.

## Shift-switch merge

Shift+clicking a target account in the switcher offers to merge the CURRENT document into
it, reusing the existing selective-import machinery instead of forking merge logic:

1. On confirm, the current document is serialized with the regular `.sfc` writer
   (`buildSfcPayload` → `JSON.stringify(…, null, 2)`, identical to "Save .sfc") and staged
   in the one-shot global key `sellfileCreator.accountMergeCarry.v1`; then the switch +
   reload happens.
2. The target session takes the carry at mount (read-and-clear — crash-safe, a failed
   import never replays), waits for the startup restore flow to settle (`restoreDlgOpen`
   gate), parses it with `parseSfcText` (the file-import parser), and opens the existing
   `SfcImportOptionsDialog` (section selection, replace/merge modes, metaset-conflict
   resolution).
3. The source account is never modified. Merge covers the SFC document only — **never
   gear**: gear data is the game account's inventory and merging it across accounts would
   be factually wrong.

## RSL Helper integration phases

| Phase | RSL Helper implements | SFC behavior |
|---|---|---|
| 0 | nothing (today) | No `?playerid` → last-active account; behavior identical to pre-account versions. Outbound requests already stamped (ignored). |
| 1 | `?playerid=` / `?playerName=` launch params | Per-launch account routing with auto-bind/auto-create. Inbound data attributed to the active account. Mid-session game-account switches require re-navigation. |
| 2 | `playerId` stamped on notifications + consumed on requests | Inbound ownership verification (adopt / match / drop-with-toast, see `classifyInboundAccountId`), per-account sellfile saves on the Helper side. |

All three phases' handling is implemented in SFC now; phases 1–2 activate purely by what
arrives. The wire contract lives in [websocket-jsonrpc.md](../../userDocs/websocket-jsonrpc.md) (user-facing, under `userDocs/`).

## Background auto-push for non-active accounts

When RSL Helper pushes STAMPED gear data for a known-but-INACTIVE bound account X, and X
has auto-push enabled (`sellfile.autoPush.v1` in X's namespace), SFC rebuilds X's
sellfile — from X's own SFC document **including its dynamic-override answers** — against
the fresh gear data and `uploadSellfile`s it with X's `accountId`, without disturbing the
active session. Dormant until RSL Helper ships packet stamping (phase 2); an unknown
stamped account still drops with a toast. Correctness constraint honored: the background
build runs the FULL pipeline including safeguard detection/injection — pushing without it
could sell protected gear.

Implementation (`lib/backgroundAccountPush.ts`, wired in App's `handleExternalCommand`
mismatch branch; every step is a shared SSOT, never re-derived inline):

1. **Burst coalescing** — the four per-type packets accumulate per account (champions
   merged across RSL Helper's double-send via `mergeChampionRows`; cID patched from the
   champion slot map via `patchArtifactRowsCID` — both shared with the live accumulator).
   A quiet period (1.5 s) flushes the burst; builds for different accounts serialize.
2. **Document load** — X's autosave via `resolveAccountScopedKeyFor` → `loadAutosave`
   (CRC-verified) → `parseSfcObject` + `normalizeNote*OverridesAnswers` off the raw
   payload (same parse the restore path uses).
3. **Override chain** — `lib/documentOverrides.buildDocumentOverridesView`, the single
   definition of the note-override derivation (App's memos consume the same builder).
   It also owns the master `recipesEnabled` gate (`pipelineRecipes`).
4. **Gear normalization** — `createDatasetFromSnapshot` (fresh, no previous dataset) →
   itemIds assigned from a fresh allocator cursor → the shared
   `buildPreviewArtifactsFromGearInspectorItems` projection (identical safeguard keying
   to the live path). The items are also persisted into X's `autosave.gearInspector.v1`
   so X's next session starts from this data.
5. **Pipeline** — `lib/headlessRuleCachePipeline.runHeadlessRuleCachePipeline`: a
   dedicated, one-shot `ruleCacheWorker` instance (same module as live) with the shared
   `postRuleCacheWasmInit` handshake; the live worker is unsuitable because its scheduler
   is latest-only and its skip-caches are keyed to the active document. The temporary
   second WASM heap is reclaimed by terminating the worker in `finally`; a 120 s timeout
   guards against leaks. Export transforms (dedupe/omit-disabled) read the GLOBAL
   preference snapshots.
6. **Upload** — `buildHsfFileFromMerged(mergedRules, { recipeNames })` (the shared
   writer, names from the same override-applied list the worker fingerprints) →
   `uploadSellfile` on the live socket with X's `playerId`/`playerName`.

Outcomes are TOAST-FREE: every attempt (pushed / no-saved-document / failed, any account)
replays the account switcher button's pulse (the shared `autoPushBlink` in
`lib/pushFeedbackKeyframes.ts`, same animation as the simple-mode send button), and
failures — including no-saved-document, where auto-push was expected but could not run —
persist `sellfile.lastPushError.v1` for the account, which the switcher list renders as a
dated "Push failed" error line until a later push succeeds (`markSellfileLastPushForAccount`
clears it). `autoPushOff` outcomes stay silent (nothing was attempted). Only the four
streamed per-type packets are serviced; the binary-DB transport stays drop+toast.
Unit coverage: `tests/unit/background-account-push.test.ts` (orchestration with injected
pipeline/transport) — the pipeline runner is injected (`deps.runPipeline`) precisely so
tests never load the `?worker&inline` module.

### Cross-tab single-owner auto-push (`lib/autoPushOwnership.ts`)

Every tab opens its OWN RSL Helper WebSocket and reacts to the same broadcast gear packets,
so without a guard two open tabs would each auto-push the same account on every inbound
event (each tab's foreground push, plus the other tab's background push for a non-active
account). Receiving data in every tab is fine; a MANUAL push in any tab is fine; only the
AUTOMATIC push must be single-owner so a given change uploads once.

Ownership is **per account**, keyed by a localStorage token
`sellfileCreator.autoPush.owner.<accountId>.v1` = `{ tabId, ts }`. The tab that has account
X active owns X's foreground auto-push; the tab that background-services non-active account
Y owns Y's — so two tabs editing two different accounts each auto-push their own, and the
gate only stops a SECOND tab from pushing the SAME account. Deliberately **no
BroadcastChannel / cross-tab messaging** (consistent with the app's per-window isolation,
`state/localStorageStore.ts`): the token IS the coordination.

Checks are **lazy** — a tab claims/refreshes ownership only at the moment auto-push for that
account would fire (`claimAutoPushOwnership(accountId)`, gating the foreground effect and,
via `deps.claimAutoPushOwnership`, the background service's `noteInboundGearCommand`), plus a
focus/visibility refresh of the active account's claim. That claim doubles as the owner's
heartbeat, so there is no steady timer to fight Chrome/FF background-tab freezing. If the
token is absent, ours, or STALE (owner closed/frozen past the 30 s TTL) the acting tab claims
it and proceeds; otherwise it stands down. A non-owner tab's `noteInboundGearCommand` returns
`true` (not a drop — the owner tab, receiving the same packet, handles it), so no misleading
drop toast fires. Last-writer-wins on the token is acceptable: a rare double-claim races two
near-identical pushes, strictly better than the guaranteed duplicate on every packet that an ungated setup produces.
Unit coverage: `tests/unit/auto-push-ownership.test.ts` (claim/deny/reclaim/per-account
independence) and the stand-down case in `background-account-push.test.ts`. Tab identity is a
per-tab `sessionStorage` id (`sellfileCreator.tabId.session.v1`), volatile fallback when
storage is blocked.
