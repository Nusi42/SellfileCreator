/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  CLIENT_NAME_MAX_LENGTH,
  CLIENT_NAME_STORAGE_KEY,
  DEFAULT_CLIENT_NAME,
  adoptClientName,
  expandClientToken,
  getClientName,
  normalizeClientName,
  persistClientName,
  subscribeClientName,
  __resetClientNameForTests,
  __resetRuntimeConfigForTests,
} from '../../src/lib/runtimeConfig.js'
import {
  CAPABILITY_SFC_FILE_AS_SELLFILE,
  CLIENT_CAPABILITIES,
  DEFAULT_CLIENT_CAPABILITIES,
  adoptClientCapabilities,
  applyClientCapabilitiesPacket,
  getClientCapabilities,
  hasClientCapability,
  isClientCapability,
  resetClientCapabilities,
} from '../../src/lib/clientCapabilities.js'
import {
  EXTERNAL_WS_METHOD_UPLOAD_SELLFILE,
  EXTERNAL_WS_METHOD_UPLOAD_SFC_FILE,
  resolveSellfileUploadTarget,
} from '../../src/lib/externalWsProtocol.js'
import { normalizeExternalEvent } from '../../src/lib/externalCommands.js'
import { localizeNoteProse, localizeNoteProseWithSourceMap } from '../../src/lib/noteOverridesParser.js'
import { withLocalStorageStub } from './helpers/localStorageStub.js'

// Storage + window stubs (shared helper) plus the module-state resets the name readers need:
// they touch window.location.href and the storage helpers, nothing else. Installed per case
// so state never leaks between tests.
const withEnvironment = (href: string, body: () => void): void => {
  withLocalStorageStub(() => {
    __resetRuntimeConfigForTests()
    __resetClientNameForTests()
    resetClientCapabilities()
    try {
      body()
    } finally {
      __resetRuntimeConfigForTests()
      __resetClientNameForTests()
      resetClientCapabilities()
    }
  }, { location: { href } })
}

const BASE = 'file:///C:/app/SellfileCreator.html'

test('normalizeClientName clamps, collapses whitespace, and rejects non-names', () => {
  assert.equal(normalizeClientName('Gear Butler'), 'Gear Butler')
  // Inner whitespace runs (a pasted multi-line value) collapse to single spaces.
  assert.equal(normalizeClientName('Gear\n\n Butler'), 'Gear Butler')
  assert.equal(normalizeClientName(`  ${'x'.repeat(80)}  `)?.length, CLIENT_NAME_MAX_LENGTH)
  // Anything that is not a usable name yields null, so callers fall back to the default.
  assert.equal(normalizeClientName('   '), null)
  assert.equal(normalizeClientName(''), null)
  assert.equal(normalizeClientName(undefined), null)
  assert.equal(normalizeClientName(42), null)
})

test('clientName defaults to RSL Helper and is adopted from the launch URL', () => {
  withEnvironment(BASE, () => {
    assert.equal(getClientName(), DEFAULT_CLIENT_NAME)
  })
  withEnvironment(`${BASE}?clientName=Gear%20Butler`, () => {
    assert.equal(getClientName(), 'Gear Butler')
  })
  withEnvironment(`${BASE}?clientName=%20%20`, () => {
    assert.equal(getClientName(), DEFAULT_CLIENT_NAME)
  })
})

test('a launch-supplied clientName is persisted for the next launch', () => {
  withEnvironment(`${BASE}?clientName=Gear%20Butler`, () => {
    // Reading the config is what triggers the persist.
    assert.equal(getClientName(), 'Gear Butler')
    assert.equal(globalThis.localStorage.getItem(CLIENT_NAME_STORAGE_KEY), 'Gear Butler')
  })
})

test('a stored clientName survives a launch with no param, but loses to an explicit one', () => {
  withEnvironment(BASE, () => {
    // Simulate a previous session having learned the name.
    persistClientName('Gear Butler')
    __resetRuntimeConfigForTests()
    assert.equal(getClientName(), 'Gear Butler')
  })
  withEnvironment(`${BASE}?clientName=Other%20Tool`, () => {
    persistClientName('Gear Butler')
    __resetRuntimeConfigForTests()
    // The URL is authoritative over a remembered name.
    assert.equal(getClientName(), 'Other Tool')
  })
})

test('persistClientName clears the key for the default so no stale name lingers', () => {
  withEnvironment(BASE, () => {
    persistClientName('Gear Butler')
    assert.equal(globalThis.localStorage.getItem(CLIENT_NAME_STORAGE_KEY), 'Gear Butler')
    persistClientName(DEFAULT_CLIENT_NAME)
    assert.equal(globalThis.localStorage.getItem(CLIENT_NAME_STORAGE_KEY), null)
  })
})

test('adoptClientName renames the session, persists, and notifies exactly once', () => {
  withEnvironment(BASE, () => {
    let notifications = 0
    const unsubscribe = subscribeClientName(() => { notifications += 1 })
    assert.equal(adoptClientName('Gear Butler'), true)
    assert.equal(getClientName(), 'Gear Butler')
    assert.equal(globalThis.localStorage.getItem(CLIENT_NAME_STORAGE_KEY), 'Gear Butler')
    assert.equal(notifications, 1)
    // Re-announcing the same name changes nothing — no redundant re-render.
    assert.equal(adoptClientName('Gear Butler'), false)
    assert.equal(notifications, 1)
    // A blank/absent name is not a rename; the current name stands.
    assert.equal(adoptClientName(null), false)
    assert.equal(getClientName(), 'Gear Butler')
    assert.equal(notifications, 1)
    unsubscribe()
  })
})

test('isClientCapability accepts only known tokens', () => {
  assert.equal(isClientCapability(CAPABILITY_SFC_FILE_AS_SELLFILE), true)
  assert.equal(isClientCapability('NotARealCapability'), false)
  // Case-sensitive: a near-miss spelling must not silently enable a feature.
  assert.equal(isClientCapability('sfcfileassellfile'), false)
  // Inherited Object members must never read as supported capabilities.
  assert.equal(isClientCapability('toString'), false)
  assert.equal(isClientCapability('constructor'), false)
})

test('without a capabilities packet the session runs on the RSL Helper baseline', () => {
  withEnvironment(BASE, () => {
    assert.deepEqual([...getClientCapabilities()], [...DEFAULT_CLIENT_CAPABILITIES])
    // RSL Helper has no uploadSfcFile handler, so the baseline must NOT include it —
    // otherwise every silent client would be pushed a method it cannot answer.
    assert.equal(hasClientCapability(CAPABILITY_SFC_FILE_AS_SELLFILE), false)
  })
})

test('adoptClientCapabilities keeps known tokens, drops unknown ones, and de-dupes', () => {
  withEnvironment(BASE, () => {
    adoptClientCapabilities(['Unknown', CAPABILITY_SFC_FILE_AS_SELLFILE, 'AlsoUnknown'])
    assert.deepEqual([...getClientCapabilities()], [CAPABILITY_SFC_FILE_AS_SELLFILE])
  })
  withEnvironment(BASE, () => {
    adoptClientCapabilities([CAPABILITY_SFC_FILE_AS_SELLFILE, CAPABILITY_SFC_FILE_AS_SELLFILE])
    assert.deepEqual([...getClientCapabilities()], [CAPABILITY_SFC_FILE_AS_SELLFILE])
  })
  // An announced-but-empty list is a real answer: the client supports none of our features.
  withEnvironment(BASE, () => {
    adoptClientCapabilities([])
    assert.deepEqual([...getClientCapabilities()], [])
  })
})

test('adoptClientCapabilities reports whether the effective set actually changed', () => {
  withEnvironment(BASE, () => {
    // First packet announcing exactly the default set is not a change.
    assert.equal(adoptClientCapabilities([...DEFAULT_CLIENT_CAPABILITIES]), false)
    assert.equal(adoptClientCapabilities([CAPABILITY_SFC_FILE_AS_SELLFILE]), true)
    // Repeating the same announcement is a no-op.
    assert.equal(adoptClientCapabilities([CAPABILITY_SFC_FILE_AS_SELLFILE]), false)
  })
})

test('resetClientCapabilities restores the default so a reconnect cannot inherit features', () => {
  withEnvironment(BASE, () => {
    adoptClientCapabilities([CAPABILITY_SFC_FILE_AS_SELLFILE])
    assert.equal(hasClientCapability(CAPABILITY_SFC_FILE_AS_SELLFILE), true)
    resetClientCapabilities()
    assert.deepEqual([...getClientCapabilities()], [...DEFAULT_CLIENT_CAPABILITIES])
  })
})

test('the upload target follows the announced SfcFileAsSellfile capability', () => {
  // Default: the compiled sellfile, exactly as before this handshake existed.
  withEnvironment(BASE, () => {
    assert.deepEqual(resolveSellfileUploadTarget(), {
      method: EXTERNAL_WS_METHOD_UPLOAD_SELLFILE,
      sfcDocument: false,
    })
  })
  // Announced: the recipe document under its own method, so a client that never asks for
  // it can never receive uploadSfcFile.
  withEnvironment(BASE, () => {
    adoptClientCapabilities([CAPABILITY_SFC_FILE_AS_SELLFILE])
    assert.deepEqual(resolveSellfileUploadTarget(), {
      method: EXTERNAL_WS_METHOD_UPLOAD_SFC_FILE,
      sfcDocument: true,
    })
  })
})

test('applyClientCapabilitiesPacket adopts features and the optional name together', () => {
  withEnvironment(BASE, () => {
    const changed = applyClientCapabilitiesPacket({
      capabilities: [CAPABILITY_SFC_FILE_AS_SELLFILE],
      clientName: 'Gear Butler',
    })
    assert.equal(changed, true)
    assert.equal(hasClientCapability(CAPABILITY_SFC_FILE_AS_SELLFILE), true)
    assert.equal(getClientName(), 'Gear Butler')
  })
  // A packet with no name leaves the current name alone.
  withEnvironment(`${BASE}?clientName=Launch%20Name`, () => {
    applyClientCapabilitiesPacket({ capabilities: [CAPABILITY_SFC_FILE_AS_SELLFILE] })
    assert.equal(getClientName(), 'Launch Name')
  })
})

test('the capabilities notification parses into a clientCapabilities command', () => {
  const command = normalizeExternalEvent('capabilities', {
    capabilities: [CAPABILITY_SFC_FILE_AS_SELLFILE, 'Unknown'],
    clientName: 'Gear Butler',
  })
  // Tokens pass through RAW — validation belongs to clientCapabilities, not the parser.
  assert.deepEqual(command, {
    kind: 'clientCapabilities',
    capabilities: [CAPABILITY_SFC_FILE_AS_SELLFILE, 'Unknown'],
    clientName: 'Gear Butler',
  })
})

test('the capabilities notification tolerates the shapes a client might send', () => {
  // A bare array as the payload, mirroring how the gear feeds accept one.
  assert.deepEqual(normalizeExternalEvent('capabilities', [CAPABILITY_SFC_FILE_AS_SELLFILE]), {
    kind: 'clientCapabilities',
    capabilities: [CAPABILITY_SFC_FILE_AS_SELLFILE],
    clientName: null,
  })
  // Announcing nothing is still a valid handshake, distinct from never sending one.
  assert.deepEqual(normalizeExternalEvent('capabilities', { capabilities: [] }), {
    kind: 'clientCapabilities',
    capabilities: [],
    clientName: null,
  })
  // Case-insensitive param lookup, like every other packet field.
  assert.deepEqual(normalizeExternalEvent('capabilities', { capabilities: [], ClientName: 'Butler' }), {
    kind: 'clientCapabilities',
    capabilities: [],
    clientName: 'Butler',
  })
  // Non-string entries are dropped rather than coerced into junk tokens.
  const mixed = normalizeExternalEvent('capabilities', { capabilities: [null, {}, CAPABILITY_SFC_FILE_AS_SELLFILE] })
  assert.deepEqual(mixed, {
    kind: 'clientCapabilities',
    capabilities: [CAPABILITY_SFC_FILE_AS_SELLFILE],
    clientName: null,
  })
})

test('a storage-denied simple-mode launch never throws out of the client-name path', async () => {
  // Regression guard for the incognito file:// launch RSL Helper uses (`?simple`): there the
  // origin is opaque and the localStorage GETTER ITSELF throws, not just its methods. Any
  // escape here runs on the first render and takes the whole app to a black screen, so every
  // call below must degrade instead of throwing.
  const g = globalThis as Record<string, unknown>
  const previousWindow = g.window
  const previousStorage = g.localStorage
  const hostileWindow = (href: string) => new Proxy(
    { location: { href } } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop === 'localStorage' || prop === 'sessionStorage') {
          throw new Error('SecurityError: storage access is denied for this origin')
        }
        return target[prop as string]
      },
    },
  )
  g.window = hostileWindow('file:///C:/app/index.html?simple&clientName=Alice')
  delete g.localStorage
  const rc = await import('../../src/lib/runtimeConfig.js')
  try {
    rc.__resetRuntimeConfigForTests()
    rc.__resetClientNameForTests()
    // The launch param still resolves even though persisting it cannot work.
    assert.equal(rc.getClientName(), 'Alice')
    assert.equal(rc.getSimpleMode(), true)
    // Writes are best-effort no-ops rather than throws.
    rc.persistClientName('Alice')
    assert.equal(rc.adoptClientName('Other'), true)
    assert.equal(rc.getClientName(), 'Other')
    // The simple-mode marker reports honest failure so the caller keeps ?simple in the URL.
    assert.equal(rc.stashSimpleModeForSession(), false)
    // With no param and unreadable storage, the default still resolves.
    rc.__resetRuntimeConfigForTests()
    rc.__resetClientNameForTests()
    g.window = hostileWindow('file:///C:/app/index.html?simple')
    assert.equal(rc.getClientName(), DEFAULT_CLIENT_NAME)
  } finally {
    if (previousWindow === undefined) delete g.window
    else g.window = previousWindow
    if (previousStorage === undefined) delete g.localStorage
    else g.localStorage = previousStorage
    rc.__resetRuntimeConfigForTests()
    rc.__resetClientNameForTests()
  }
})

test('note prose expands {client} for display but never in the source map', () => {
  // Authored note text (the shipped presets) names the connected client via the placeholder,
  // so a document on disk stays client-neutral and adapts at render time.
  const note = 'Connect to {client} first.'
  assert.equal(localizeNoteProse(note, 'en-US'), `Connect to ${DEFAULT_CLIENT_NAME} first.`)
  // The source-map form must stay VERBATIM: its offsets index the raw draft the editor
  // textarea holds, and substituting a different-length name would shift every offset after
  // the token, breaking click-to-source sync. This split is the reason only the string form
  // expands — a regression here corrupts editing, not just display.
  assert.equal(localizeNoteProseWithSourceMap(note, 'en-US').text, note)
})

test('expandClientToken leaves untokenized text alone and inserts names literally', () => {
  assert.equal(expandClientToken('no token here'), 'no token here')
  assert.equal(expandClientToken(''), '')
  // Every occurrence is replaced, not just the first.
  assert.equal(expandClientToken('{client} and {client}'), `${DEFAULT_CLIENT_NAME} and ${DEFAULT_CLIENT_NAME}`)
})

test('a client name containing $ is inserted literally, not as a replacement pattern', () => {
  withEnvironment(BASE, () => {
    // A string replacement would read the dollar sequences below as replacement patterns:
    // '$&' means "the whole match", so the name would re-insert '{client}' instead of the
    // literal text. The expander uses a function replacement precisely to avoid that.
    const ampersandName = 'A$' + '&B'
    adoptClientName(ampersandName)
    assert.equal(expandClientToken('for {client}'), `for ${ampersandName}`)
    // '$1' would expand to a capture group (empty here), silently dropping characters.
    const groupName = 'C$' + '1D'
    adoptClientName(groupName)
    assert.equal(expandClientToken('for {client}'), `for ${groupName}`)
  })
})

test('every capability token is unique and non-empty', () => {
  // Guards the enum itself: a duplicated or blank token would make the set membership
  // check silently wrong for a whole feature.
  assert.equal(new Set(CLIENT_CAPABILITIES).size, CLIENT_CAPABILITIES.length)
  for (const token of CLIENT_CAPABILITIES) assert.ok(token.trim().length > 0)
})
