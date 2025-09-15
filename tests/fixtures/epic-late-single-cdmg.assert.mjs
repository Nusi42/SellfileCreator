export function validate(rules) {
  const byLevel = new Map()
  for (const r of rules) byLevel.set(Number(r.LVLForCheck), Number(r.Substats?.[0]?.Value ?? 0))
  const base = 5
  const need1 = 10
  // Epic (Late): +4/+8 presence; +12/+16 need 1
  if (byLevel.get(4) !== base) throw new Error('Epic +4 should be presence (base)')
  if (byLevel.get(8) !== base) throw new Error('Epic +8 should be presence (base)')
  if (byLevel.get(12) !== need1) throw new Error('Epic +12 should be need-1')
  if (byLevel.get(16) !== need1) throw new Error('Epic +16 should be need-1')
}

