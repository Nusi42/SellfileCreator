export function validate(rules) {
  const level0 = rules.filter((rule) => Number(rule.LVLForCheck) === 0)
  if (level0.length === 0) throw new Error('auto-flex-off-limited-sets-min1: expected level 0 rows')
  if (!level0.some((rule) => Number(rule.Rarity) === 8)) {
    throw new Error('auto-flex-off-limited-sets-min1: level 0 must include ≥Rare rows (locked pair)')
  }
  if (level0.some((rule) => Number(rule.Rarity) < 8)) {
    throw new Error('auto-flex-off-limited-sets-min1: level 0 should not emit rarities below ≥Rare')
  }
}
