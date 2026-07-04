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
  displayName: string        // THE account name = the player's name in the game (see below)
  helperAccountId?: string   // the game's Player ID (e.g. "um12345678") — permanent, unique
  helperBound?: boolean      // set on first identity adoption; guards re-claiming
  accentColor?: string       // per-account accent for at-a-glance identification
  unstampedDefault?: boolean // at most ONE account: receives endpoint data without a playerId stamp
  origin: 'legacy' | 'helper' | 'manual'
  createdAt: string
  lastActiveAt: string
}
```

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

Switching accounts writes `activeAccountId` and performs a full `location.reload()` —
one document per session; an in-place swap would bleed state across dozens of stores,
the autosave debouncers, and the WASM pipeline. Because `activeAccountId` persists in the
registry, the next launch WITHOUT a `?playerid=` param resumes the last-used account; the
URL param only overrides that per-launch.

## Account manager

Each row in the switcher menu carries a gear icon that opens the manager for THAT
account — no switch required (essential for editing a non-active account's auto-push).
The manager edits: name, accent color, the **Player ID binding** (free-text field,
opaque string, shown with the game's own "Player ID" terminology; empty unbinds — this
is how users pre-bind accounts before RSL Helper passes ids itself), the **per-account auto-push** flag
(`get/setSellfileAutoPushForAccount` in `state/exportPreferences.ts` — the active
account routes through the live store so React subscribers stay in sync; other accounts
write their namespaced key directly with store-parity serialization), the
**unstamped-data default** flag (below), the **global endpoint-gear persistence** toggle
(below), and deletion behind a regular confirmation dialog.

Each switcher row shows a summary block (`lib/accountSummaries.ts`, computed lazily on
menu open), one fact per line: "Saved <date>", "Pushed <date> · Auto-push on/off" (from
`sellfile.lastPush.v1` + the account's auto-push flag), "N recipes · M safeguards ·
K rules", and the shared `GearInspectorOutcomeSummaryChip` (total / sold / kept /
safeguarded). Saved (local
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

## Endpoint-gear persistence toggle (global)

`sellfileCreator.gearDb.persistEndpointGear.v1` (`state/gearDbPreferences.ts`, default
ON). When OFF, real gear data (endpoint or file import) is kept out of localStorage for
perf/sanity: the live gearInspector autosave payload filters to manual items
(`isManualGearInspectorItem`), and the background account-push skips its gear autosave
write. Deliberately GLOBAL — it is a machine/storage concern, not an account trait.

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
| `simple.variant.v1` | beginner/lategame tracks account progression |
| `rulesFilter.state.v3`, `rulesFilter.sync.v1` | filter VALUES applied to the account's document |
| `sellfile.autoPush.v1` | auto-push is a per-account contract with RSL Helper; tri-state raw value — '1' / '0' / absent — where "absent" means never configured: express simple mode defaults auto-push ON only then (`hasExplicitSellfileAutoPushForAccount`), so an explicit off survives simple starts and account switches |
| `sellfile.lastPush.v1` | ISO timestamp of the account's last SUCCESSFUL upload (written by both the foreground and background push; shown in the switcher's row summary) |
| `sellfile.lastPushError.v1` | ISO timestamp of the last FAILED background push (toast-free feedback: rendered as the switcher row's error line; cleared by the next successful push) |
| `accountStats.v1` | tiny snapshot of live pipeline RESULTS (generated-rule count + gear total/sold/kept/safeguarded) — written by the live session for its own account, since these are not derivable from autosaves at menu-open cost |

Everything else stays global — notably the whole theming system (also required: MUI reads
its theme keys synchronously before account resolution could run), colour maps, UI
toggles, preset stores (filter/sort/dynamic-overrides — generic reusable tools),
`runtimeGearSets` (game-level catalog; also the largest key), connection settings
(`rslHelper.port/connectEnabled`), seen-markers, and `simple.expertMode` (a property of
the user, not the account).

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
arrives. The wire contract lives in [websocket-jsonrpc.md](websocket-jsonrpc.md).

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
