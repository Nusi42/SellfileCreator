export function validate(rules) {
  const byLevel = new Map()
  for (const r of rules) byLevel.set(Number(r.LVLForCheck), Number(r.Substats?.[0]?.Value ?? 0))
  const base = 5
  const need1 = 10
  // Legendary (Late): +4/+8/+12 presence; +16 need 1
  if (byLevel.get(4) !== base) throw new Error('Legendary +4 should be presence (base)')
  if (byLevel.get(8) !== base) throw new Error('Legendary +8 should be presence (base)')
  if (byLevel.get(12) !== base) throw new Error('Legendary +12 should be presence (base)')
  if (byLevel.get(16) !== need1) throw new Error('Legendary +16 should be need-1')
}

