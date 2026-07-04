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
import { getSellfileAutoPushForAccount, setSellfileAutoPushForAccount } from '../../src/state/exportPreferences.js'
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

const makeHarness = (): Harness => {
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
  // Off by default; enabling writes the '1' the store's parse accepts.
  assert.equal(getSellfileAutoPushForAccount(inactive.id), false)
  setSellfileAutoPushForAccount(inactive.id, true)
  assert.equal(storage.getItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)), '1')
  assert.equal(getSellfileAutoPushForAccount(inactive.id), true)
  // Disabling removes the key (delete-on-default parity with the live store).
  setSellfileAutoPushForAccount(inactive.id, false)
  assert.equal(storage.getItem(resolveAccountScopedKeyFor(inactive.id, ACCOUNT_BASE_KEY_SELLFILE_AUTO_PUSH)), null)
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
    coalesceMs: 5,
  })
  service.noteInboundGearCommand(artifactsCommand('um2'))
  await new Promise<void>((resolve) => { notify = resolve })
  assert.equal(outcomes[0]?.kind, 'failed')
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
