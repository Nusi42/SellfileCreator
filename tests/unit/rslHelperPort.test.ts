/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  parseRslHelperPort,
  extractRslHelperPortFromEndpoint,
  getRslHelperPort,
  setRslHelperPort,
  subscribeRslHelperPort,
  RSL_HELPER_DEFAULT_PORT,
  RSL_HELPER_PORT_MIN,
  RSL_HELPER_PORT_MAX,
} from '../../src/lib/externalWsProtocol.js'
import { isWebSocketProtocol } from '../../src/lib/runtimeConfig.js'

test('parseRslHelperPort accepts the valid TCP range and rejects everything else', () => {
  // Boundaries are inclusive on both ends.
  assert.equal(parseRslHelperPort(RSL_HELPER_PORT_MIN), 1)
  assert.equal(parseRslHelperPort(RSL_HELPER_PORT_MAX), 65535)
  assert.equal(parseRslHelperPort('8080'), 8080)
  // Out of range, non-numeric, and non-integer inputs all collapse to null.
  assert.equal(parseRslHelperPort(0), null)
  assert.equal(parseRslHelperPort(65536), null)
  assert.equal(parseRslHelperPort(-1), null)
  assert.equal(parseRslHelperPort(8080.5), null)
  assert.equal(parseRslHelperPort('abc'), null)
  assert.equal(parseRslHelperPort(''), null)
  assert.equal(parseRslHelperPort(null), null)
  assert.equal(parseRslHelperPort(undefined), null)
})

test('extractRslHelperPortFromEndpoint recovers the launch port', () => {
  // The regression this guards: a non-default port in ?endpoint= must survive the migration.
  assert.equal(extractRslHelperPortFromEndpoint('ws://localhost:9099/'), 9099)
  assert.equal(extractRslHelperPortFromEndpoint('ws://localhost:8080/'), 8080)
  assert.equal(extractRslHelperPortFromEndpoint('wss://127.0.0.1:9443/'), 9443)
})

test('extractRslHelperPortFromEndpoint ignores a portless endpoint', () => {
  // A portless ws:// URL implies 80 per URL semantics, but 80 is never where RSL Helper
  // listens — adopting it would overwrite a working persisted port with a dead one. null
  // means "no port information", which makes the caller keep what it already has.
  assert.equal(extractRslHelperPortFromEndpoint('ws://localhost/'), null)
  assert.equal(extractRslHelperPortFromEndpoint('wss://localhost/'), null)
  // URL normalizes an explicitly-spelled scheme default away to '', so it reads the same way.
  assert.equal(extractRslHelperPortFromEndpoint('ws://localhost:80/'), null)
  assert.equal(extractRslHelperPortFromEndpoint('wss://localhost:443/'), null)
})

test('isWebSocketProtocol gates exactly the supported transports', () => {
  // Same predicate the launch-param sanitizer uses, so the two cannot drift.
  assert.equal(isWebSocketProtocol('ws:'), true)
  assert.equal(isWebSocketProtocol('wss:'), true)
  assert.equal(isWebSocketProtocol('http:'), false)
  assert.equal(isWebSocketProtocol('https:'), false)
  // Inherited Object members must not read as supported schemes.
  assert.equal(isWebSocketProtocol('toString'), false)
  assert.equal(isWebSocketProtocol('constructor'), false)
})

test('extractRslHelperPortFromEndpoint returns null for unusable endpoints', () => {
  // Callers keep their persisted port when this returns null.
  assert.equal(extractRslHelperPortFromEndpoint('not a url'), null)
  assert.equal(extractRslHelperPortFromEndpoint(''), null)
  assert.equal(extractRslHelperPortFromEndpoint('http://localhost:8080/'), null)
})

test('setRslHelperPort notifies subscribers only on a committed change', () => {
  // Minimal window.localStorage stub (same per-case install pattern as
  // clientCapabilities.test.ts) — the port helpers reach storage via safeStorage.
  const globals = globalThis as { window?: unknown }
  const previousWindow = globals.window
  const store = new Map<string, string>()
  globals.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    },
  }
  try {
    let notifications = 0
    const unsubscribe = subscribeRslHelperPort(() => { notifications += 1 })
    // A real change (default → new) persists and notifies exactly once.
    setRslHelperPort(9099)
    assert.equal(getRslHelperPort(), 9099)
    assert.equal(notifications, 1)
    // Committing the SAME port is a no-op: App must not tear down a healthy connection.
    setRslHelperPort(9099)
    assert.equal(notifications, 1)
    // Invalid values are ignored by the writer, so they never notify either.
    setRslHelperPort(0)
    assert.equal(getRslHelperPort(), 9099)
    assert.equal(notifications, 1)
    // Returning to the default clears the key but is still a change → notifies.
    setRslHelperPort(RSL_HELPER_DEFAULT_PORT)
    assert.equal(getRslHelperPort(), RSL_HELPER_DEFAULT_PORT)
    assert.equal(notifications, 2)
    // After unsubscribe, further changes are silent.
    unsubscribe()
    setRslHelperPort(9100)
    assert.equal(notifications, 2)
  } finally {
    if (previousWindow === undefined) delete globals.window
    else globals.window = previousWindow
  }
})
