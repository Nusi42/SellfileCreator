import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveNoteSafeguardOverridesTags,
  collectSafeguardOverridesDiagnostics,
} from '../../src/lib/noteSafeguardOverrides.js'

// Helper: build a safeguard-overrides block wrapping a single slider line.
const sgBlock = (sliderLine: string): string =>
  ['<!-- safeguard-overrides', '  q "Prompt"', `  ${sliderLine}`, '-->'].join('\n')

// Helper: collect diagnostics for a block (offset 0).
const diagsFor = (block: string): { from: number; to: number; message: string }[] => {
  const diags: { from: number; to: number; message: string }[] = []
  collectSafeguardOverridesDiagnostics(block, 0, diags)
  return diags
}

// Helper: find the first resolved slider option in a block.
const sliderOption = (block: string) => {
  const { questions } = resolveNoteSafeguardOverridesTags(block, {})
  for (const q of questions) {
    const slider = q.options.find((o) => o.groupType === 'slider')
    if (slider) return slider
  }
  throw new Error('no slider option resolved')
}

test('slider unit= is parsed and surfaced as sliderUnit on the resolved option', () => {
  // A `unit="%"` param attaches a display-only suffix to the slider value.
  const slider = sliderOption(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 unit="%" { @tagged { improvchance=$value } }'))
  assert.equal(slider.sliderUnit, '%')
})

test('slider without unit= leaves sliderUnit undefined', () => {
  // No suffix is the default; the field stays absent so callers render the bare number.
  const slider = sliderOption(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 { @tagged { improvchance=$value } }'))
  assert.equal(slider.sliderUnit, undefined)
})

test('unit= does not disturb other slider params (marks/toggle/range)', () => {
  // unit sits alongside the existing params; everything else must still resolve.
  const slider = sliderOption(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 unit="%" toggle="Yes" toggleside=left marks=10:"Soft",50:"Strict" { @tagged { improvchance=$value } else { @tagged { improvchance=disabled } } }'))
  assert.equal(slider.sliderUnit, '%')
  assert.equal(slider.sliderMin, 0)
  assert.equal(slider.sliderMax, 90)
  assert.equal(slider.sliderToggle?.side, 'left')
  assert.equal(slider.sliderMarks?.length, 2)
})

test('a well-formed marks= list produces no diagnostics', () => {
  // Control case: the marks list closes cleanly, so nothing is flagged.
  const diags = diagsFor(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 marks=10:"Soft",50:"Strict" { @tagged { improvchance=$value } }'))
  assert.equal(diags.length, 0)
})

test('a stray quote in marks= is flagged instead of silently dropped', () => {
  // The extra `"` turns `,50:"` into a string and stops marks parsing, leaving garbage
  // (`,50:` then `Strict"`) before the slider body. Each leftover token must be flagged.
  const diags = diagsFor(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 marks=10:"Soft",40:"Balanced",",50:"Strict" { @tagged { improvchance=$value } }'))
  assert.ok(diags.length > 0, 'malformed marks should be flagged')
  // The message points the author at the slider params / stray quote.
  assert.match(diags[0]!.message, /unexpected .* in slider header/)
})

test('an invalid toggleside= value is flagged instead of silently defaulting', () => {
  // `ab` is neither `left` nor `above`; without a diagnostic it would silently become
  // `above`, hiding the typo. The error must point at the bad value with the valid set.
  const diags = diagsFor(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 toggle="Yes" toggleside=ab { @tagged { improvchance=$value } else { @tagged { improvchance=disabled } } }'))
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /'ab' is not a valid toggleside value/)
  assert.match(diags[0]!.message, /'left' or 'above'/)
})

test('valid toggleside= values (left / above) produce no diagnostics', () => {
  // Control case: both accepted sides parse cleanly.
  for (const side of ['left', 'above']) {
    const diags = diagsFor(sgBlock(`slider "" id=impr min=0 max=90 step=1 default=25 toggle="Yes" toggleside=${side} { @tagged { improvchance=$value } else { @tagged { improvchance=disabled } } }`))
    assert.equal(diags.length, 0, `toggleside=${side} should not be flagged`)
  }
})

test('an invalid toggledefault= value is flagged instead of silently defaulting', () => {
  // `maybe` is neither `on` nor `off`; it would silently become `on`. Flag it.
  const diags = diagsFor(sgBlock('slider "" id=impr min=0 max=90 step=1 default=25 toggle="Yes" toggledefault=maybe { @tagged { improvchance=$value } else { @tagged { improvchance=disabled } } }'))
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /'maybe' is not a valid toggledefault value/)
  assert.match(diags[0]!.message, /'on' or 'off'/)
})

// Helper: wrap a single assignment-block option line in a safeguard-overrides block.
const sgOptionBlock = (optionLine: string): string =>
  ['<!-- safeguard-overrides', '  q "Prompt"', `  ${optionLine}`, '-->'].join('\n')

test('an invalid activation= value is flagged instead of silently no-op', () => {
  // `of` is not a known activation keyword; without a diagnostic the assignment would be
  // silently dropped (the safeguard simply does nothing), hiding the typo.
  const diags = diagsFor(sgOptionBlock('rb "Y" "" id=a { @tagged { activation=of } }'))
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /'of' is not a valid activation value/)
})

test('a valid activation= value produces no diagnostics', () => {
  // Control: each accepted activation keyword parses cleanly.
  for (const val of ['off', 'protect_existing', 'anticipate_gaps', 'anticipate_improvements']) {
    const diags = diagsFor(sgOptionBlock(`rb "Y" "" id=a { @tagged { activation=${val} } }`))
    assert.equal(diags.length, 0, `activation=${val} should not be flagged`)
  }
})

test('an invalid substatmatch= value is flagged instead of silently no-op', () => {
  // `5` is outside the accepted 1-4 / persubstat set; flag it rather than silently dropping it.
  const diags = diagsFor(sgOptionBlock('rb "Y" "" id=a { @tagged { substatmatch=5 } }'))
  assert.equal(diags.length, 1)
  assert.match(diags[0]!.message, /'5' is not a valid substatmatch value/)
})
