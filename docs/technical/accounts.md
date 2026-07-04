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
  id: string                // internal SFC id — immutable, generated; storage namespace hangs off it
  displayName: string       // user-editable label
  helperAccountId?: string  // RSL Helper's stable id (e.g. "account-d") — a mutable BINDING
  accentColor?: string      // per-account accent for at-a-glance identification
  nameCustomized?: boolean  // manual rename blocks ?accountName= refreshes
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
3. **URL resolution** of `?account=` / `?accountName=` (parsed in `runtimeConfig.ts`):
   - id matches a bound account → activate it;
   - id unknown + exactly ONE unbound account exists → bind that account (this folds a
     legacy user's data into their helper account on the first stamped launch);
   - otherwise → create a fresh `origin: 'helper'` account and activate it.
   The params are then stripped from the address bar (same pattern as `?endpoint=`).

Switching accounts writes `activeAccountId` and performs a full `location.reload()` —
one document per session; an in-place swap would bleed state across dozens of stores,
the autosave debouncers, and the WASM pipeline.

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
| `sellfile.autoPush.v1` | auto-push is a per-account contract with RSL Helper |

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
`ACCOUNT_ACCENT_PALETTE`, editable in the manage dialog). It renders as a dot on the
switcher button and swatches in the menu — an at-a-glance "which account am I on" marker
without forking the global theme.

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
| 0 | nothing (today) | No `?account` → last-active account; behavior identical to pre-account versions. Outbound requests already stamped (ignored). |
| 1 | `?account=` / `?accountName=` launch params | Per-launch account routing with auto-bind/auto-create. Inbound data attributed to the active account. Mid-session game-account switches require re-navigation. |
| 2 | `accountId` stamped on notifications + consumed on requests | Inbound ownership verification (adopt / match / drop-with-toast, see `classifyInboundAccountId`), per-account sellfile saves on the Helper side. |

All three phases' handling is implemented in SFC now; phases 1–2 activate purely by what
arrives. The wire contract lives in [websocket-jsonrpc.md](websocket-jsonrpc.md).

## Background auto-push for non-active accounts (designed, not yet implemented)

Requirement: when RSL Helper pushes stamped data for a known-but-INACTIVE account X, and
X has auto-push enabled (`sellfile.autoPush.v1` in X's namespace), SFC should rebuild X's
sellfile — from X's own SFC document **including its dynamic-override answers** — against
the fresh gear data and `uploadSellfile` it with X's `accountId`, without disturbing the
active session.

This is dormant until RSL Helper ships packet stamping (phase 2). Correctness constraint:
a background-built sellfile MUST run the full safeguard pipeline — pushing without
safeguard injection could sell protected gear. Design:

1. Read X's autosave via `resolveAccountScopedKeyFor(x.id, 'sellfileCreator.autosave.sfc.v1')`
   → `loadAutosave` → `parseSfcObject` + `normalizeNote*OverridesAnswers`.
2. Apply the note-override chain (recipe + cross-domain safeguard instructions →
   `applyRecipeOverrides` / safeguard equivalents → `recipesForRuleBuild`).
   **Prerequisite refactor (SSOT hard gate):** this chain currently lives as `useMemo`s
   in `App.tsx` (~lines 671–717, 946). It must be EXTRACTED into one shared pure builder
   (e.g. `lib/documentOverrides.ts`: document + answers → `{ ruleRecipes,
   effectiveSubstatTargets, effectiveSafeguardRules, exportRecipeNames }`), and **App's
   memos must be rewired to call that builder** so it becomes the only implementation.
   Re-writing the chain a second time for the headless path — even faithfully — is a One
   Definition Rule violation and is not an acceptable shortcut.
3. Normalize the inbound gear rows through the same exported projection the live pipeline
   uses (`NormalizedGearArtifact` parity — same SSOT treatment: extract, don't re-derive),
   and also persist them into X's `autosave.gearInspector.v1` so X's next session starts
   fresh.
4. Run ONE pipeline pass on a **dedicated, properly `init-wasm`'d second worker instance**
   (the live worker's scheduler is latest-only and its in-worker skip-caches/sentinels are
   keyed to the active document — interleaving would pollute them). Cost: a temporary
   second WASM heap (~256–460 MB); terminate the worker after the run.
5. `buildHsfFileFromMerged(result.state.mergedRules, { recipeNames })` →
   `uploadSellfile` with X's helper id.

The two prerequisites (override-chain extraction, one-shot worker runner) are the actual
work; everything else is existing pure functions.
