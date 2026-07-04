import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR,
  ACCOUNT_BASE_KEY_AUTOSAVE_SFC,
  ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH,
  __resetAccountsForTests,
  bindHelperAccount,
  createAccount,
  getActiveAccount,
  resolveAccountScopedKeyFor,
} from '../../src/lib/accounts.js'
import { __resetRuntimeConfigForTests } from '../../src/lib/runtimeConfig.js'
import { saveAutosave, loadAutosave } from '../../src/lib/autosave.js'
import {
  createBackgroundAccountPushService,
  type BackgroundAccountPushOutcome,
} from '../../src/lib/backgroundAccountPush.js'
import { buildDocumentOverridesView, resolveOverridesNoteText, type DocumentOverridesInput } from '../../src/lib/documentOverrides.js'
import { readAccountListSummary, writeAccountStatsSnapshot } from '../../src/lib/accountSummaries.js'
import { getPersistEndpointGearForAccount, setPersistEndpointGearForAccount } from '../../src/state/gearDbPreferences.js'
import {
  getSellfileAutoPushForAccount,
  getSellfileLastPushAtForAccount,
  getSellfileLastPushErrorAtForAccount,
  hasExplicitSellfileAutoPushForAccount,
  markSellfileLastPushErrorForAccount,
  markSellfileLastPushForAccount,
  setSellfileAutoPushForAccount,
} from '../../src/state/exportPreferences.js'
import { defaultSubstatTargets } from '../../src/lib/hsfBuilder.js'
import { warmupWasmRuleEngine } from '../../src/lib/wasm/wasmRuleEngine.js'
import type { ExternalCommand } from '../../src/lib/externalCommands.js'
import type { HeadlessPipelineParams } from '../../src/lib/headlessRuleCachePipeline.js'

// ---------------------------------------------------------------------------
// Browser-global stubs (same pattern as accounts.test.ts): Map-backed storage
// plus the location/history members the account bootstrap touches.
// ---------------------------------------------------------------------------

type StorageStub = {
  data: Map<string, string>
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

const makeStorage = (): StorageStub => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size },
  }
}

const freshWindow = (): StorageStub => {
  const storage = makeStorage()
  ;(globalThis as Record<string, unknown>).window = {
    localStorage: storage,
    location: { href: 'https://app.example/index.html' },
    history: { state: null, replaceState: () => {} },
  }
  // lib/autosave.ts uses the BARE `localStorage` global (Node 24 ships its own webstorage
  // otherwise) — point it at the same stub so autosave reads/writes land where the
  // account-scoped readers (window.localStorage via safeStorage) look.
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true })
  __resetRuntimeConfigForTests()
  __resetAccountsForTests()
  return storage
}

// The override chain resolves safeguard metasets through WASM — warm it once at module
// load, BEFORE the window stub exists, so the loader takes its plain-Node path.
await warmupWasmRuleEngine()

beforeEach(() => { freshWindow() })

// Bind a second, NON-active account to a helper id and return it.
const seedBoundInactiveAccount = (helperId: string) => {
  const inactive = createAccount('Alt account')
  bindHelperAccount(inactive.id, helperId)
  // The active account stays the migration default; sanity-check the setup.
  assert.notEqual(getActiveAccount().id, inactive.id)
  return inactive
}

// Minimal but valid SFC autosave document for the inactive account.
const seedInactiveDocument = (accountId: string): void => {
  saveAutosave(resolveAccountScopedKeyFor(accountId, ACCOUNT_BASE_KEY_AUTOSAVE_SFC), {
    Version: '1.0.0',
    Metasets: [],
    Recipes: [],
    // Answers/disabled fields absent — the flow must treat that as "no overrides".
  })
}

// An artifacts command carrying the (empty) collection with the given stamp — enough
// to exercise the orchestration; row-level normalization has its own importer tests.
const artifactsCommand = (playerId: string): ExternalCommand => (
  { kind: 'gearDbArtifacts', artifacts: [], playerId }
)

type Harness = {
  outcomes: BackgroundAccountPushOutcome[]
  uploads: Array<{ method: string; payload: Record<string, unknown> }>
  pipelineParams: HeadlessPipelineParams[]
  service: ReturnType<typeof createBackgroundAccountPushService>
  waitForOutcome: () => Promise<BackgroundAccountPushOutcome>
}

const makeHarness = (claimAutoPushOwnership: (accountId: string) => boolean = () => true): Harness => {
  const outcomes: BackgroundAccountPushOutcome[] = []
  const uploads: Harness['uploads'] = []
  const pipelineParams: HeadlessPipelineParams[] = []
  let notify: (() => void) | null = null
  const service = createBackgroundAccountPushService({
    sendRequest: (method, payload) => {
      uploads.push({ method, payload: payload as Record<string, unknown> })
      return Promise.resolve({ ok: true })
    },
    runPipeline: (params) => {
      pipelineParams.push(params)
      return Promise.resolve({ mergedRules: [], mergedRulesHash: 'TESTCRC' })
    },
    onOutcome: (outcome) => {
      outcomes.push(outcome)
      notify?.()
    },
    // This tab always owns auto-push in these tests unless a scenario overrides it; the
    // ownership mechanics themselves live in auto-push-ownership.test.ts.
    claimAutoPushOwnership,
    // Keep the burst quiet-period tiny so tests settle fast.
    coalesceMs: 5,
  })
  const waitForOutcome = () => new Promise<BackgroundAccountPushOutcome>((resolve) => {
    if (outcomes.length > 0) { resolve(outcomes[outcomes.length - 1]!); return }
    notify = () => resolve(outcomes[outcomes.length - 1]!)
  })
  return { outcomes, uploads, pipelineParams, service, waitForOutcome }
}

// ---------------------------------------------------------------------------
// Orchestration behaviors
// ---------------------------------------------------------------------------

test('unknown or unstamped commands are not serviced', () => {
  const harness = makeHarness()
  // Stamp for a helper id no account is bound to → caller keeps its drop+toast.
  assert.equal(harness.service.noteInboundGearCommand(artifactsCommand('um-unknown')), false)
  // Commands without a stamp are the active account's business, not this service's.
  assert.equal(harness.service.noteInboundGearCommand({ kind: 'gearDbArtifacts', artifacts: [] }), false)
  // Non-gear kinds pass through untouched.
  assert.equal(harness.service.noteInboundGearCommand({ kind: 'selectRule', rowNumber: 1 }), false)
})

test('a non-owner tab stands down silently: returns true but queues no push', async () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  seedInactiveDocument(inactive.id)
  // Another tab owns this account's auto-push → our claim is denied.
  const harness = makeHarness(() => false)
  // Returns TRUE (the caller stays silent — no drop toast — because the owning tab handles
  // the same broadcast packet), but nothing is uploaded and no outcome is reported.
  assert.equal(harness.service.noteInboundGearCommand(artifactsCommand('um2')), true)
  // Give any (erroneously) scheduled burst time to flush — there must be none.
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(harness.uploads.length, 0)
  assert.equal(harness.outcomes.length, 0)
})

test('known inactive account with auto-push disabled reports autoPushOff and sends nothing', async () => {
  seedBoundInactiveAccount('um2')
  const harness = makeHarness()
  assert.equal(harness.service.noteInboundGearCommand(artifactsCommand('um2')), true)
  const outcome = await harness.waitForOutcome()
  assert.equal(outcome.kind, 'autoPushOff')
  assert.equal(harness.uploads.length, 0)
})

test('auto-push on but no saved document reports noDocument', async () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  const harness = makeHarness()
  assert.equal(harness.service.noteInboundGearCommand(artifactsCommand('um2')), true)
  const outcome = await harness.waitForOutcome()
  assert.equal(outcome.kind, 'noDocument')
  assert.equal(harness.uploads.length, 0)
})

test('full background build: pipeline runs on the account document and the upload is stamped', async () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  seedInactiveDocument(inactive.id)
  const harness = makeHarness()
  // A burst of two per-type packets coalesces into ONE build.
  assert.equal(harness.service.noteInboundGearCommand(artifactsCommand('um2')), true)
  assert.equal(harness.service.noteInboundGearCommand({ kind: 'gearDbLastUsed', lastUsed: [], playerId: 'um2' }), true)
  const outcome = await harness.waitForOutcome()
  assert.equal(outcome.kind, 'pushed')
  // Exactly one pipeline run for the coalesced burst, with the empty doc's inputs.
  assert.equal(harness.pipelineParams.length, 1)
  const params = harness.pipelineParams[0]!
  assert.deepEqual(params.recipes, [])
  assert.equal(params.hsf, null)
  assert.equal(params.computeImprovementChance, false)
  // The upload rides uploadSellfile with the INACTIVE account's identity.
  assert.equal(harness.uploads.length, 1)
  const upload = harness.uploads[0]!
  assert.equal(upload.method, 'uploadSellfile')
  assert.equal(upload.payload.playerId, 'um2')
  assert.equal(upload.payload.playerName, 'Alt account')
  assert.ok(upload.payload.data)
  // The fresh gear burst landed in the INACTIVE account's gearInspector autosave.
  const gearEntry = loadAutosave(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR))
  assert.ok(gearEntry)
  // The success stamped the account's last-push marker (a parseable ISO timestamp).
  const lastPush = getSellfileLastPushAtForAccount(inactive.id)
  assert.ok(lastPush !== null && Number.isFinite(Date.parse(lastPush)))
})

test('explicit forAccount services UNSTAMPED commands for the flagged default account', async () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  seedInactiveDocument(inactive.id)
  const harness = makeHarness()
  // No stamp on the command — the caller resolved the flagged default and passes it in.
  assert.equal(
    harness.service.noteInboundGearCommand({ kind: 'gearDbArtifacts', artifacts: [] }, inactive),
    true,
  )
  const outcome = await harness.waitForOutcome()
  assert.equal(outcome.kind, 'pushed')
  assert.equal(harness.uploads[0]?.payload.playerId, 'um2')
})

test('name-only stamps resolve the target account via its display name', async () => {
  const storage = freshWindow()
  // No Player ID binding at all — the display name is the manual-workflow identity.
  const inactive = createAccount('AltHero')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  seedInactiveDocument(inactive.id)
  const harness = makeHarness()
  assert.equal(
    harness.service.noteInboundGearCommand({ kind: 'gearDbArtifacts', artifacts: [], playerName: 'AltHero' }),
    true,
  )
  const outcome = await harness.waitForOutcome()
  assert.equal(outcome.kind, 'pushed')
  // Upload carries the name identity; no Player ID exists to stamp.
  assert.equal(harness.uploads[0]?.payload.playerId, undefined)
  assert.equal(harness.uploads[0]?.payload.playerName, 'AltHero')
})

test('per-account auto-push helpers write the target namespace and round-trip', () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  // Off by default, and "off" is indistinguishable from "never configured" until a write.
  assert.equal(getSellfileAutoPushForAccount(inactive.id), false)
  assert.equal(hasExplicitSellfileAutoPushForAccount(inactive.id), false)
  setSellfileAutoPushForAccount(inactive.id, true)
  assert.equal(storage.getItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)), '1')
  assert.equal(getSellfileAutoPushForAccount(inactive.id), true)
  // Disabling WRITES '0' (store serialize parity): an explicit off must remain an explicit
  // choice — express simple mode only defaults auto-push ON for never-configured accounts.
  setSellfileAutoPushForAccount(inactive.id, false)
  assert.equal(storage.getItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)), '0')
  assert.equal(getSellfileAutoPushForAccount(inactive.id), false)
  assert.equal(hasExplicitSellfileAutoPushForAccount(inactive.id), true)
})

test('per-account endpoint-gear persistence gates the background gear autosave write', async () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  seedInactiveDocument(inactive.id)
  // Default ON (absent key); flip the TARGET account's own flag off.
  assert.equal(getPersistEndpointGearForAccount(inactive.id), true)
  setPersistEndpointGearForAccount(inactive.id, false)
  assert.equal(getPersistEndpointGearForAccount(inactive.id), false)
  const harness = makeHarness()
  assert.equal(harness.service.noteInboundGearCommand(artifactsCommand('um2')), true)
  const outcome = await harness.waitForOutcome()
  // The push itself still happens — only the gear autosave write is skipped.
  assert.equal(outcome.kind, 'pushed')
  assert.equal(harness.uploads.length, 1)
  assert.equal(loadAutosave(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_AUTOSAVE_GEAR_INSPECTOR)), null)
})

test('account stats snapshot + list summary round-trip', () => {
  freshWindow()
  const account = createAccount('AltHero')
  // SFC doc: recipe/safeguard counts come straight from the CRC-guarded parse.
  saveAutosave(resolveAccountScopedKeyFor(account.id, ACCOUNT_BASE_KEY_AUTOSAVE_SFC), {
    AutosaveSavedAt: '2026-07-04T10:00:00.000Z',
    Recipes: [{}, {}],
    Safeguards: [{}],
  })
  // Pipeline results (rule count + gear outcome) flow through the stats snapshot.
  writeAccountStatsSnapshot(account.id, { rules: 42, gear: { total: 10, sold: 4, kept: 6, keptBySafeguards: 2 } })
  const summary = readAccountListSummary(account.id)
  assert.equal(summary.savedAt, '2026-07-04T10:00:00.000Z')
  assert.equal(summary.recipeCount, 2)
  assert.equal(summary.safeguardCount, 1)
  assert.equal(summary.rulesCount, 42)
  assert.deepEqual(summary.gearOutcome, { total: 10, sold: 4, kept: 6, keptBySafeguards: 2 })
  // No push has happened for this account.
  assert.equal(summary.lastPushAt, null)
})

test('upload rejection surfaces as a failed outcome', async () => {
  const storage = freshWindow()
  const inactive = seedBoundInactiveAccount('um2')
  storage.setItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH), '1')
  seedInactiveDocument(inactive.id)
  const outcomes: BackgroundAccountPushOutcome[] = []
  let notify: (() => void) | null = null
  const service = createBackgroundAccountPushService({
    sendRequest: () => Promise.resolve({ ok: false, error: 'nope' }),
    runPipeline: () => Promise.resolve({ mergedRules: [], mergedRulesHash: 'TESTCRC' }),
    onOutcome: (outcome) => { outcomes.push(outcome); notify?.() },
    claimAutoPushOwnership: () => true,
    coalesceMs: 5,
  })
  service.noteInboundGearCommand(artifactsCommand('um2'))
  await new Promise<void>((resolve) => { notify = resolve })
  assert.equal(outcomes[0]?.kind, 'failed')
  // A rejected upload must NOT stamp the last-push marker.
  assert.equal(getSellfileLastPushAtForAccount(inactive.id), null)
})

test('push error marker round-trip: set on failure, cleared by the next success', () => {
  freshWindow()
  const account = createAccount('AltHero')
  assert.equal(getSellfileLastPushErrorAtForAccount(account.id), null)
  // Failure (written by App's background outcome handler) → parseable ISO marker.
  markSellfileLastPushErrorForAccount(account.id)
  const errorAt = getSellfileLastPushErrorAtForAccount(account.id)
  assert.ok(errorAt !== null && Number.isFinite(Date.parse(errorAt)))
  // Any later successful push supersedes the failure and clears the marker.
  markSellfileLastPushForAccount(account.id)
  assert.equal(getSellfileLastPushErrorAtForAccount(account.id), null)
  assert.ok(getSellfileLastPushAtForAccount(account.id) !== null)
})

// ---------------------------------------------------------------------------
// documentOverrides — chain composition smoke tests
// ---------------------------------------------------------------------------

test('resolveOverridesNoteText gates on disabled flag and non-string notes', () => {
  assert.equal(resolveOverridesNoteText('note body', false), 'note body')
  assert.equal(resolveOverridesNoteText('note body', true), '')
  assert.equal(resolveOverridesNoteText(null, false), '')
  assert.equal(resolveOverridesNoteText(undefined, false), '')
})

test('buildDocumentOverridesView: empty document yields empty views and honors recipesEnabled', () => {
  const base: DocumentOverridesInput = {
    note: null,
    noteOverridesDisabled: false,
    recipeOverridesAnswers: {},
    safeguardOverridesAnswers: {},
    recipes: [],
    substatTargets: defaultSubstatTargets(),
    safeguardRules: [],
    metasets: [],
    recipesEnabled: true,
  }
  const view = buildDocumentOverridesView(base)
  // No note → no instructions in either domain.
  assert.equal(view.effectiveRecipeInstructions.length, 0)
  assert.equal(view.effectiveSafeguardInstructions.length, 0)
  assert.deepEqual(view.ruleRecipes, [])
  // Master toggle gates the pipeline list right here in the SSOT.
  assert.deepEqual(view.pipelineRecipes, view.ruleRecipes)
  const disabledView = buildDocumentOverridesView({ ...base, recipesEnabled: false })
  assert.deepEqual(disabledView.pipelineRecipes, [])
})

export const __backgroundAccountPushTestMarker = true
