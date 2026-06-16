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
