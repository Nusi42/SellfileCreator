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
  // +4: expect two rows — Uncommon need-1 and Rare presence; no Epic/Legendary presence duplicates
  {
    const rows = byLevel.get(4) || []
    if (!find(rows, { rarity: 7, value: need1 })) throw new Error('Auto+Late +4: missing ≥Uncommon need-1')
    if (!find(rows, { rarity: 8, value: base })) throw new Error('Auto+Late +4: missing ≥Rare presence')
    // Ensure dedupe: no Epic/Legendary presence at +4
    if (find(rows, { rarity: 9, value: base })) throw new Error('Auto+Late +4: unexpected ≥Epic duplicate presence')
    if (find(rows, { rarity: 16, value: base })) throw new Error('Auto+Late +4: unexpected ≥Legendary duplicate presence')
  }
  // +8: expect Uncommon need-1 and Epic presence (Rare must already meet need-1 here)
  {
    const rows = byLevel.get(8) || []
    if (!find(rows, { rarity: 7, value: need1 })) throw new Error('Auto+Late +8: missing ≥Uncommon need-1')
    if (!find(rows, { rarity: 9, value: base })) throw new Error('Auto+Late +8: missing ≥Epic presence')
    if (find(rows, { rarity: 8, value: base })) throw new Error('Auto+Late +8: unexpected ≥Rare presence (should be need-1 by +8)')
    if (find(rows, { rarity: 16, value: base })) throw new Error('Auto+Late +8: unexpected ≥Legendary duplicate presence')
  }
  // +12: expect Uncommon need-1 and Legendary presence
  {
    const rows = byLevel.get(12) || []
    if (!find(rows, { rarity: 7, value: need1 })) throw new Error('Auto+Late +12: missing ≥Uncommon need-1')
    if (!find(rows, { rarity: 16, value: base })) throw new Error('Auto+Late +12: missing ≥Legendary presence')
    if (find(rows, { rarity: 8, value: base })) throw new Error('Auto+Late +12: unexpected ≥Rare presence (should be need-1 by +12)')
    if (find(rows, { rarity: 9, value: base })) throw new Error('Auto+Late +12: unexpected ≥Epic presence (deduped by ≥Legendary)')
  }
}

