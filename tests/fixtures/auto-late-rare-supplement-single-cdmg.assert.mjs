export function validate(rules) {
  // Partition by level
  const byLevel = new Map()
  for (const r of rules) {
    const lvl = Number(r.LVLForCheck)
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl).push(r)
  }
  const find = (arr, { rarity, value }) => arr.find(r => Number(r.Rarity) === rarity && Number(r.Substats?.[0]?.Value ?? 0) === value)
  // Constants (6★ base minima defaults)
  const base = 5
  const need1 = 10
  // +4: expect Rare presence only; no ≥Uncommon rows remain once Auto ≥ Rare is set.
  {
    const rows = byLevel.get(4) || []
    if (!find(rows, { rarity: 8, value: base })) throw new Error('Auto+Late +4: missing ≥Rare presence')
    if (find(rows, { rarity: 7, value: need1 })) throw new Error('Auto+Late +4: unexpected ≥Uncommon row')
    if (find(rows, { rarity: 9, value: base })) throw new Error('Auto+Late +4: unexpected ≥Epic duplicate presence')
    if (find(rows, { rarity: 16, value: base })) throw new Error('Auto+Late +4: unexpected ≥Legendary duplicate presence')
  }
  // +8: expect ≥Rare need-1 and ≥Epic presence.
  {
    const rows = byLevel.get(8) || []
    if (!find(rows, { rarity: 8, value: need1 })) throw new Error('Auto+Late +8: missing ≥Rare need-1')
    if (!find(rows, { rarity: 9, value: base })) throw new Error('Auto+Late +8: missing ≥Epic presence')
    if (find(rows, { rarity: 7, value: need1 })) throw new Error('Auto+Late +8: unexpected ≥Uncommon row')
    if (find(rows, { rarity: 16, value: base })) throw new Error('Auto+Late +8: unexpected ≥Legendary duplicate presence')
  }
  // +12: expect ≥Rare need-1 and ≥Legendary presence.
  {
    const rows = byLevel.get(12) || []
    if (!find(rows, { rarity: 8, value: need1 })) throw new Error('Auto+Late +12: missing ≥Rare need-1')
    if (!find(rows, { rarity: 16, value: base })) throw new Error('Auto+Late +12: missing ≥Legendary presence')
    if (find(rows, { rarity: 7, value: need1 })) throw new Error('Auto+Late +12: unexpected ≥Uncommon row')
    if (find(rows, { rarity: 9, value: base })) throw new Error('Auto+Late +12: unexpected ≥Epic presence (deduped by ≥Legendary)')
  }
}
