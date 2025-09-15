export function validate(rules) {
  // Map level -> CDMG threshold value
  const byLevel = new Map()
  for (const r of rules) {
    byLevel.set(Number(r.LVLForCheck), Number(r.Substats?.[0]?.Value ?? 0))
  }
  const base = 5
  const need1 = 10
  // Rare (Late): +4 presence; +8/+12/+16 need 1
  if (byLevel.get(4) !== base) throw new Error('Rare +4 should be presence (base)')
  if (byLevel.get(8) !== need1) throw new Error('Rare +8 should be need-1')
  if (byLevel.get(12) !== need1) throw new Error('Rare +12 should be need-1')
  if (byLevel.get(16) !== need1) throw new Error('Rare +16 should be need-1')
}

