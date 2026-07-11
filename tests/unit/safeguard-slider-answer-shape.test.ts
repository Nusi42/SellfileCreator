import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveNoteSafeguardOverridesTags, SLIDER_TOGGLE_OFF } from '../../src/lib/noteSafeguardOverrides.js'

// A count card mixing an activation radio with a count slider — the standard shape of the
// preset's safeguard questions. The dialog persists answers as [radioOptionId, sliderValue]
// (slider LAST), so the resolver must split the answer instead of reading index 0.
const NOTE = [
  '<!-- safeguard-overrides',
  'q "Protect pieces?" id=q_mixed',
  'rb "None" id=m_off { @tag=fam { activation=off } }',
  'rb "Gaps" id=m_gaps * { @tag=fam { activation=anticipate_gaps } }',
  'slider "" id=m_count min=1 max=64 default=16 { @tag=fam { count=$value/2 } }',
  '-->',
  // Second question referencing the first slider via $value.TOKEN (cross-slider map).
  '<!-- safeguard-overrides',
  'q "Derived?" id=q_derived',
  'slider "" min=1 max=64 default=4 { @tag=other { count=$value.m_count } }',
  '-->',
].join('\n')

const countFor = (instructions: ReturnType<typeof resolveNoteSafeguardOverridesTags>['instructions'], tag: string): number | null => {
  for (const ins of instructions) {
    const s = JSON.stringify(ins.selector)
    if (!s.includes('"' + tag + '"')) continue
    for (const op of ins.operations) if (op.kind === 'count') return op.value as number
  }
  return null
}

test('slider value applies when the stored answer leads with a radio option id', () => {
  const base = resolveNoteSafeguardOverridesTags(NOTE)
  const q = base.questions.find((x) => x.id === 'q_mixed')!
  const gaps = q.options.find((o) => o.token === 'm_gaps')!
  // Mixed shape, slider last — exactly what the dialog persists.
  const res = resolveNoteSafeguardOverridesTags(NOTE, { q_mixed: [gaps.id, '32'] })
  assert.equal(countFor(res.instructions, 'fam'), 16)  // 32/2, NOT the default 16/2=8
  // The cross-slider $value.TOKEN map must see the same value.
  assert.equal(countFor(res.instructions, 'other'), 32)
})

test('slider-only and unanswered shapes keep their existing semantics', () => {
  const sliderOnly = resolveNoteSafeguardOverridesTags(NOTE, { q_mixed: ['32'] })
  assert.equal(countFor(sliderOnly.instructions, 'fam'), 16)
  const unanswered = resolveNoteSafeguardOverridesTags(NOTE)
  assert.equal(countFor(unanswered.instructions, 'fam'), 8)  // default 16/2
  // Radio-only answers (no slider component) also fall back to the slider default.
  const base = resolveNoteSafeguardOverridesTags(NOTE)
  const off = base.questions.find((x) => x.id === 'q_mixed')!.options.find((o) => o.token === 'm_off')!
  const radioOnly = resolveNoteSafeguardOverridesTags(NOTE, { q_mixed: [off.id] })
  assert.equal(countFor(radioOnly.instructions, 'fam'), 8)
})

test('toggle-off sentinel still routes to the else path when mixed with a radio id', () => {
  const toggledNote = NOTE.replace(
    'slider "" id=m_count min=1 max=64 default=16 { @tag=fam { count=$value/2 } }',
    'slider "" id=m_count min=1 max=64 default=16 toggle="On" { @tag=fam { count=$value/2 } else { @tag=fam { activation=off } } }',
  )
  const base = resolveNoteSafeguardOverridesTags(toggledNote)
  const gaps = base.questions.find((x) => x.id === 'q_mixed')!.options.find((o) => o.token === 'm_gaps')!
  const res = resolveNoteSafeguardOverridesTags(toggledNote, { q_mixed: [gaps.id, SLIDER_TOGGLE_OFF] })
  // No count op; the else block's activation=off must be emitted instead.
  assert.equal(countFor(res.instructions, 'fam'), null)
  const hasOff = res.instructions.some((ins) => JSON.stringify(ins.selector).includes('"fam"')
    && ins.operations.some((op) => op.kind === 'activation' && op.value === 'off'))
  assert.equal(hasOff, true)
})
