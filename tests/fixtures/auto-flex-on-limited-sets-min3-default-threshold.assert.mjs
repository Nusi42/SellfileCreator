export function validate(rules) {
  const level0 = rules.filter((rule) => Number(rule.LVLForCheck) === 0)
  if (level0.length === 0) throw new Error('auto-flex-on-limited-sets-min3-default-threshold: expected level 0 rows')
  if (!level0.some((rule) => Number(rule.Rarity) === 9)) {
    throw new Error('auto-flex-on-limited-sets-min3-default-threshold: level 0 must include ≥Epic rows even with flex')
  }
  if (level0.some((rule) => Number(rule.Rarity) < 9)) {
    throw new Error('auto-flex-on-limited-sets-min3-default-threshold: level 0 should not emit rarities below ≥Epic when flex is on')
  }
}
