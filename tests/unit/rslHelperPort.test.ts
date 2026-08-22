/* eslint import/no-unused-modules: off */
import { strict as assert } from 'node:assert'
import test from 'node:test'

import {
  parseRslHelperPort,
  extractRslHelperPortFromEndpoint,
  RSL_HELPER_PORT_MIN,
  RSL_HELPER_PORT_MAX,
} from '../../src/lib/externalWsProtocol.js'

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
  assert.equal(extractRslHelperPortFromEndpoint('wss://127.0.0.1:443/'), 443)
})

test('extractRslHelperPortFromEndpoint falls back to the scheme default port', () => {
  // URL.port is '' for a scheme's default port, so these must be filled in explicitly.
  assert.equal(extractRslHelperPortFromEndpoint('ws://localhost/'), 80)
  assert.equal(extractRslHelperPortFromEndpoint('wss://localhost/'), 443)
})

test('extractRslHelperPortFromEndpoint returns null for unusable endpoints', () => {
  // Callers keep their persisted port when this returns null.
  assert.equal(extractRslHelperPortFromEndpoint('not a url'), null)
  assert.equal(extractRslHelperPortFromEndpoint(''), null)
  assert.equal(extractRslHelperPortFromEndpoint('http://localhost:8080/'), null)
})
