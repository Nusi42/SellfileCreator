export function validate(rules) {
  // At +16, ensure both SPD(4) and ACC(6) present in substats and values are non-zero
  const at16 = rules.filter(r=>Number(r.LVLForCheck)===16)
  if (!at16.length) throw new Error('expected +16 rows present')
  for (const r of at16) {
    const ids = new Set((r.Substats||[]).map(s=>Number(s?.ID)))
    if (!(ids.has(4) && ids.has(6))) throw new Error('expected SPD and ACC present among locked substats at +16')
  }
}

