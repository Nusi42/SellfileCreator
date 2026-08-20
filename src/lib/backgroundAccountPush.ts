/**
 * backgroundAccountPush.ts
 *
 * Background sellfile builds for NON-active accounts (docs/technical/accounts.md).
 *
 * When RSL Helper streams stamped gear data for a bound account that is NOT the active
 * one, this service coalesces the per-type burst, loads that account's own SFC document
 * from its namespaced autosave (including its dynamic-override answers), runs the FULL
 * pipeline (safeguard injection included — pushing without it could sell protected
 * gear) on a dedicated one-shot worker, and uploads the resulting sellfile stamped with
 * that account's id — all without touching the active session's state.
 *
 * SSOT dependencies (never re-derive these inline here):
 *  - override chain            → lib/documentOverrides.buildDocumentOverridesView
 *  - gear normalization        → lib/importers (createDatasetFromSnapshot, patchArtifactRowsCID,
 *                                mergeChampionRows) + gearInspectorPreviewArtifacts projection
 *  - pipeline + export crc     → lib/headlessRuleCachePipeline (same worker module as live)
 *  - HSF serialization         → lib/hsfIO.buildHsfFileFromMerged
 *  - key scoping               → lib/accounts.resolveAccountScopedKeyFor
 */
import { isGearDbPartCommand } from './externalCommands'
import type { ExternalCommand, GearDbRawSnapshotCommand } from './externalCommands'
import {
  EXTERNAL_WS_METHOD_UPLOAD_SELLFILE,
  type ExternalWsRequestMethod,
  type ExternalWsResponse,
} from './externalWsProtocol'
import {
  ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR,
  ACCOUNT_BASE_KEY_AUTOSAVE_SFC,
  findAccountByPlayerName,
  getAccounts,
  getActiveAccount,
  resolveAccountScopedKeyFor,
  type SfcAccount,
} from './accounts'
import { loadAutosave, saveAutosave } from './autosave'
import { parseSfcObject } from './sfcIO'
import { defaultSubstatTargets } from './hsfBuilder'
import { defaultMetasets } from './metasets'
import { getPersistedRuntimeGearSetNameMap } from './gearSets/runtimeStore'
import { buildDocumentOverridesView } from './documentOverrides'
import {
  applyGearDbPartToSlots,
  createDatasetFromSnapshot,
  patchArtifactRowsCID,
  type GearDbRawParts,
} from './importers/gearDbRawDataset'
import { buildPreviewArtifactsFromGearInspectorItems } from './gearInspectorPreviewArtifacts'
import { buildGearInspectorAutosavePayload, type GearInspectorItem } from './gearInspectorSession'
import { GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED, nextGearInspectorCustomItemId } from './itemIdentity'
// Type-only: the runner itself is injected (deps.runPipeline) so unit tests never load
// the `?worker&inline` module — App passes runHeadlessRuleCachePipeline.
import type { HeadlessPipelineOutcome, HeadlessPipelineParams } from './headlessRuleCachePipeline'
import { buildHsfFileFromMerged } from './hsfIO'
import { sellfileFilename } from './filenames'
import {
  getSellfileAutoPushForAccount,
  getSellfileDedupForAccount,
  getSellfileOmitDisabledForAccount,
  markSellfileLastPushForAccount,
} from '../state/exportPreferences'
import { getPersistEndpointGearForAccount } from '../state/gearDbPreferences'

// Per-type packets of one burst arrive within moments of each other; flush once the
// stream has been quiet this long. Mirrors the live path's coalescing intent without
// its settle machinery (background builds have no UI to keep responsive).
const BACKGROUND_PUSH_COALESCE_MS = 1500

// What happened to a coalesced burst — the app surfaces these as toasts.
export type BackgroundAccountPushOutcome =
  | { kind: 'pushed'; account: SfcAccount; itemCount: number }
  | { kind: 'autoPushOff'; account: SfcAccount }
  | { kind: 'noDocument'; account: SfcAccount }
  | { kind: 'failed'; account: SfcAccount; message: string }

export type BackgroundAccountPushDeps = {
  // The LIVE session's WebSocket sender (useExternalCommands.sendRequest) — background
  // pushes ride the same connection RSL Helper is streaming on.
  sendRequest: (method: ExternalWsRequestMethod, payload: unknown) => Promise<ExternalWsResponse>
  // The one-shot pipeline runner (runHeadlessRuleCachePipeline in the app; a stub in tests).
  runPipeline: (params: HeadlessPipelineParams) => Promise<HeadlessPipelineOutcome>
  onOutcome: (outcome: BackgroundAccountPushOutcome) => void
  // Cross-tab single-owner gate: claim/refresh THIS tab's ownership of the given account's
  // auto-push. Returns false when another live tab owns it — then this tab stands down so
  // the same non-active account is not background-pushed by two tabs at once. Injected
  // (claimAutoPushOwnership in the app; a stub in tests) so the service stays decoupled.
  claimAutoPushOwnership: (accountId: string) => boolean
  // Test hook: shrink the burst quiet-period so specs don't wait real seconds.
  coalesceMs?: number
}

export type BackgroundAccountPushService = {
  /**
   * Offer an inbound gear command that must NOT merge into the active session:
   * either its playerId stamp names another account, or it is UNSTAMPED and the
   * user flagged a non-active account as the unstamped-data receiver — then the
   * caller passes that account explicitly via `forAccount` (the stamp lookup is
   * skipped). Returns true when a known account will be serviced OR when this tab
   * stood down for cross-tab ownership (another tab owns that account's auto-push and
   * handles the same broadcast packet) — the caller stays silent in both cases; false
   * only when genuinely unhandled (unknown account, disposed) and the caller keeps its
   * drop+toast.
   */
  noteInboundGearCommand: (cmd: ExternalCommand, forAccount?: SfcAccount) => boolean
  // Cancel pending timers (App unmount); in-flight builds finish but stop reporting.
  dispose: () => void
}

// Accumulated per-type parts for one account's burst. The slots are exactly the live
// accumulator's (GearDbRawParts) so both paths share applyGearDbPartToSlots and cannot
// drift on merge-vs-replace semantics; only the routing fields are added here.
type PendingBurst = GearDbRawParts & {
  account: SfcAccount
  timer: ReturnType<typeof setTimeout> | null
}

export const createBackgroundAccountPushService = (
  deps: BackgroundAccountPushDeps,
): BackgroundAccountPushService => {
  const pending = new Map<string, PendingBurst>()
  // Builds serialize through this chain: one headless WASM heap at a time.
  let buildQueue: Promise<void> = Promise.resolve()
  let disposed = false

  // Assemble the synthetic snapshot exactly like the live raw-part synthesis: cID
  // patched from the champion slot map, champions already double-send-merged.
  const buildSnapshot = (burst: PendingBurst): GearDbRawSnapshotCommand => ({
    kind: 'gearDbRawSnapshot',
    snapshotId: null,
    payloadVersion: null,
    artifacts: patchArtifactRowsCID(burst.artifacts ?? [], burst.equippedByArtifact),
    inboxArtifacts: patchArtifactRowsCID(burst.inboxArtifacts ?? [], burst.equippedByArtifact),
    champions: burst.champions ?? [],
    lastUsed: burst.lastUsed ?? [],
  })

  // The actual build+push for one settled burst. Never throws — failures become outcomes.
  const flush = async (burst: PendingBurst): Promise<void> => {
    const account = burst.account
    try {
      // 1. The TARGET account's own auto-push contract decides (account-scoped key).
      if (!getSellfileAutoPushForAccount(account.id)) {
        deps.onOutcome({ kind: 'autoPushOff', account })
        return
      }
      // 2. Load the account's document from its namespaced autosave (CRC-verified).
      const entry = loadAutosave<Record<string, unknown>>(
        resolveAccountScopedKeyFor(account.id, ACCOUNT_BASE_KEY_AUTOSAVE_SFC),
      )
      if (!entry) {
        deps.onOutcome({ kind: 'noDocument', account })
        return
      }
      // Same parse the restore path uses, with the same runtime-set name resolution.
      const doc = parseSfcObject(
        entry.payload,
        { metasets: defaultMetasets(), substatTargets: defaultSubstatTargets() },
        { runtimeSetNameMap: getPersistedRuntimeGearSetNameMap() },
      )
      // Dynamic-override answers + disabled flag come straight off the parsed document now —
      // parseSfcObject reads them for autosave payloads and .sfc files alike, so this no
      // longer digs through the raw record. `null` (absent) means "no answers".
      const view = buildDocumentOverridesView({
        note: doc.note ?? null,
        noteOverridesDisabled: doc.noteOverridesDisabled,
        recipeOverridesAnswers: doc.noteRecipeOverridesAnswers ?? {},
        safeguardOverridesAnswers: doc.noteSafeguardOverridesAnswers ?? {},
        recipes: doc.recipes,
        substatTargets: doc.substatTargets,
        safeguardRules: doc.safeguardRules ?? [],
        metasets: doc.metasets,
        recipesEnabled: doc.recipesEnabled,
      })
      // 3. Normalize the burst into Gear Inspector items with fresh session itemIds
      // (same allocator sequence a fresh session would assign after ingesting this data).
      const { gearInspectorItems } = createDatasetFromSnapshot(buildSnapshot(burst))
      let idCursor = GEAR_INSPECTOR_CUSTOM_ID_ALLOC_SEED
      const items: GearInspectorItem[] = gearInspectorItems.map((item) => {
        const id = nextGearInspectorCustomItemId(idCursor) ?? idCursor - 1
        idCursor = id
        return { ...(item as GearInspectorItem), itemId: id }
      })
      const artifacts = buildPreviewArtifactsFromGearInspectorItems(items)
      // 4. Full pipeline on a dedicated worker — safeguard detection + injection included.
      const safeguardsEnabled = (doc.safeguardsEnabled ?? false) && view.effectiveSafeguardRules.length > 0
      const result = await deps.runPipeline({
        recipes: view.pipelineRecipes,
        metasets: doc.metasets,
        substatTargets: view.effectiveSubstatTargets,
        // Autosaved documents carry no base .hsf file (that is transient session state).
        hsf: null,
        ...(doc.finalSellRemainder ? { finalSellRemainder: doc.finalSellRemainder } : {}),
        safeguards: { enabled: safeguardsEnabled, rules: [...view.effectiveSafeguardRules], detection: null },
        // The export transforms are per-account — read the TARGET account's dedup/omit so a
        // background build for account X uses X's chosen transforms, not the active account's.
        omitDisabledBeforeSafeguards: getSellfileOmitDisabledForAccount(account.id),
        dedupeBeforeSafeguards: getSellfileDedupForAccount(account.id),
        recipeModes: view.recipeModes,
        artifacts,
        computeImprovementChance: false,
      })
      // 5. Serialize with the shared writer and upload stamped with X's identity.
      const payload = buildHsfFileFromMerged(result.mergedRules, {
        recipeNames: view.exportRecipeNames,
      })
      const response = await deps.sendRequest(EXTERNAL_WS_METHOD_UPLOAD_SELLFILE, {
        ...(account.helperAccountId ? { playerId: account.helperAccountId } : {}),
        // displayName IS the in-game player name (kept fresh from helper-sent names);
        // optional — an empty name is no identity and is omitted like the id.
        ...(account.displayName ? { playerName: account.displayName } : {}),
        fileName: sellfileFilename(),
        contentType: 'application/json',
        data: payload,
      })
      if (!response.ok) throw new Error(response.error ?? 'upload rejected')
      // Record the success for the account menu's "Pushed <date>" summary line.
      markSellfileLastPushForAccount(account.id)
      // 6. Persist the fresh gear into X's own gearInspector autosave so its next
      // session starts from this data instead of a stale queue — unless X disabled
      // persisting endpoint gear to localStorage (per-account perf/sanity toggle).
      if (getPersistEndpointGearForAccount(account.id)) {
        saveAutosave(
          resolveAccountScopedKeyFor(account.id, ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR),
          buildGearInspectorAutosavePayload(items),
        )
      }
      deps.onOutcome({ kind: 'pushed', account, itemCount: items.length })
    } catch (error) {
      deps.onOutcome({ kind: 'failed', account, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const scheduleFlush = (burst: PendingBurst): void => {
    // Restart the quiet-period timer on every packet of the burst.
    if (burst.timer !== null) clearTimeout(burst.timer)
    burst.timer = setTimeout(() => {
      burst.timer = null
      pending.delete(burst.account.id)
      if (disposed) return
      // Serialize builds so two accounts' bursts never run two headless heaps at once.
      buildQueue = buildQueue.then(() => (disposed ? undefined : flush(burst)))
    }, deps.coalesceMs ?? BACKGROUND_PUSH_COALESCE_MS)
  }

  const noteInboundGearCommand = (cmd: ExternalCommand, forAccount?: SfcAccount): boolean => {
    if (disposed) return false
    // Only the streamed per-type packets are serviced; the binary-DB transport is
    // a secondary path RSL Helper does not use for pushes and stays drop+toast.
    if (!isGearDbPartCommand(cmd)) return false
    // Explicit target (unstamped-default routing) wins; otherwise resolve the stamp —
    // the Player ID decides when present, else the player name (displayName IS the
    // in-game name — same lookup the launch resolution uses, via the shared finder).
    let account = forAccount ?? null
    if (!account) {
      const incomingId = cmd.playerId
      const incomingName = cmd.playerName
      if (incomingId) {
        account = getAccounts().find((a) => a.helperAccountId === incomingId) ?? null
      } else if (incomingName) {
        account = findAccountByPlayerName(incomingName)
      } else {
        return false
      }
    }
    // Never the active account — the caller only routes non-active data here, but keep
    // the guard so a race cannot double-apply into the live session.
    if (!account || account.id === getActiveAccount().id) return false
    // Cross-tab single-owner gate: only ONE tab background-pushes a given non-active
    // account. If another live tab owns this account's auto-push, stand down — but return
    // true so the caller stays silent (the owner tab receives the same broadcast packet and
    // services it; this is not a drop). A stale/absent owner is claimed here and proceeds.
    if (!deps.claimAutoPushOwnership(account.id)) return true
    const burst: PendingBurst = pending.get(account.id) ?? {
      account,
      artifacts: null,
      inboxArtifacts: null,
      champions: null,
      lastUsed: null,
      equippedByArtifact: null,
      timer: null,
    }
    pending.set(account.id, burst)
    // Latest packet per type wins; champions merge across RSL Helper's sparse rosters.
    // Shared SSOT with the live accumulator (see applyGearDbPartToSlots).
    applyGearDbPartToSlots(burst, cmd)
    scheduleFlush(burst)
    return true
  }

  const dispose = (): void => {
    disposed = true
    for (const burst of pending.values()) {
      if (burst.timer !== null) clearTimeout(burst.timer)
    }
    pending.clear()
  }

  return { noteInboundGearCommand, dispose }
}
