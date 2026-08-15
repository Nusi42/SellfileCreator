/**
 * overrides-unknown-field-diagnostics.test.ts
 *
 * The two halves of the overrides DSL's lenient-parse contract:
 *
 *   - the PARSER skips anything it cannot interpret, so a note written by a newer app version
 *     keeps working in an older one (its unknown fields no-op; its known ones still apply);
 *   - the EDITOR still underlines the skipped span, so a typo is visible rather than silent.
 *
 * Both run through the SAME parse — only the presence of a diagnostics collector separates
 * them, which is what this suite pins: identical input, applied leniently and reported fully.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectSafeguardOverridesDiagnostics,
  resolveNoteSafeguardOverridesTags,
  applySafeguardOverrides,
} from '../../src/lib/noteSafeguardOverrides'
import {
  createFactorySafeguardBuilderDefaults,
  type SafeguardRule,
} from '../../src/lib/safeguards'

// One always-selected option carrying `body` against every rule.
const sgNote = (body: string): string =>
  `<!-- safeguard-overrides\n  q "q" id=q_sg\n  rb "opt" id=opt * { @all { ${body} } }\n-->`

const diagsFor = (body: string): { from: number; to: number; message: string }[] => {
  const diags: { from: number; to: number; message: string }[] = []
  collectSafeguardOverridesDiagnostics(sgNote(body), 0, diags)
  return diags
}

const applyBody = (body: string): SafeguardRule => {
  const rule = createFactorySafeguardBuilderDefaults()
  rule.requiredCount = 4
  const { instructions } = resolveNoteSafeguardOverridesTags(sgNote(body))
  return applySafeguardOverrides([rule], instructions)[0]!
}

test('an unknown assignment field is reported once, at its own span', () => {
  const body = 'notafield=3'
  const diags = diagsFor(body)
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /notafield/)
  // The span must cover the field token itself so the editor underlines the typo, not the line.
  const note = sgNote(body)
  assert.equal(note.slice(diags[0]!.from, diags[0]!.to), 'notafield')
})

test('an unknown field does not swallow the assignments around it', () => {
  // The lenient half: the neighbours still take effect.
  const out = applyBody('notafield=3 count=7')
  assert.equal(out.requiredCount, 7)
})

test('an unknown field whose value is a list does not swallow the next assignment', () => {
  // The value skipper must stop at the next `field =` pair, not consume the rest of the block.
  const out = applyBody('notafield=a,b,c count=7')
  assert.equal(out.requiredCount, 7)
})

test('a mistyped group.* suffix is reported and skipped', () => {
  const body = 'group.perslots=on'
  const diags = diagsFor(body)
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /group\.perslots/)
  assert.equal(sgNote(body).slice(diags[0]!.from, diags[0]!.to), 'group.perslots')
})

test('a mistyped weight.<stat> suffix is reported and skipped', () => {
  const body = 'weight.spdd=2'
  const diags = diagsFor(body)
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /weight\.spdd/)
})

test('a bad BOOLEAN value is reported as a value error, not an unknown field', () => {
  // `perslot` is a real field — the diagnostic must point at the value and list the accepted
  // keywords, otherwise the editor would blame the wrong token.
  const body = 'perslot=yess'
  const diags = diagsFor(body)
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /not a valid perslot value/)
  assert.equal(sgNote(body).slice(diags[0]!.from, diags[0]!.to), 'yess')
})

test('a bad group.per* value is reported as a value error', () => {
  const diags = diagsFor('group.perslot=maybe')
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /not a valid group\.perslot value/)
})

test('valid blocks — including the group family — produce no diagnostics', () => {
  assert.deepEqual(diagsFor('count=3 perslot=on group.count=5 group.perset=off weight.SPD=1.5'), [])
  assert.deepEqual(diagsFor('activation=protect_existing substatmatch=persubstat'), [])
})
