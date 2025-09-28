export function validate(rules) {
  const level0 = rules.filter((rule) => Number(rule.LVLForCheck) === 0)
  if (level0.length === 0) throw new Error('auto-flex-on-limited-sets: expected level 0 rows')
  if (!level0.some((rule) => Number(rule.Rarity) === 9)) {
    throw new Error('auto-flex-on-limited-sets: level 0 must include ≥Epic rows when flex is on')
  }
  if (level0.some((rule) => Number(rule.Rarity) < 9)) {
    throw new Error('auto-flex-on-limited-sets: level 0 should not emit rarities below ≥Epic even with flex on')
  }
}
