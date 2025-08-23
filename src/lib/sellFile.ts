import type { GearItem, Rule, SellFileItem, SellRuleSet } from './types'

function matchesRule(item: GearItem, rule: Rule): boolean {
  const f = rule.filter
  if (f.slots && !f.slots.includes(item.slot)) return false
  if (f.rarities && !f.rarities.includes(item.rarity)) return false
  if (f.ranks && !f.ranks.includes(item.rank)) return false
  if (f.sets && !f.sets.includes(item.set)) return false
  if (typeof f.maxLevel === 'number' && item.level > f.maxLevel) return false
  if (f.onlyUnequipped && item.equippedBy) return false
  if (typeof f.minSpeed === 'number' && (item.subStats['spd'] ?? 0) < f.minSpeed) return false
  if (f.anySubstats && !f.anySubstats.some(k => item.subStats[k] !== undefined)) return false
  if (f.allSubstats && !f.allSubstats.every(k => item.subStats[k] !== undefined)) return false
  if (f.noneSubstats && f.noneSubstats.some(k => item.subStats[k] !== undefined)) return false
  return true
}

export function generateSellList(items: GearItem[], ruleset: SellRuleSet): SellFileItem[] {
  const result: SellFileItem[] = []

  for (const item of items) {
    let decision: 'sell' | 'keep' | null = null
    for (const rule of ruleset.rules) {
      if (matchesRule(item, rule)) {
        decision = rule.action
        break
      }
    }
    if (decision === null) {
      decision = ruleset.strategy === 'whitelist' ? 'sell' : 'keep'
    }
    if (decision === 'sell') {
      result.push({ id: item.id })
    }
  }

  return result
}

