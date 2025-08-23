export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythical'
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type SetName =
  | 'speed' | 'lifesteal' | 'immortal' | 'divineSpeed' | 'perception' | 'resilience'
  | 'swiftParry' | 'untouchable' | 'stoneSkin' | 'protection' | 'revenge' | 'stalwart' | 'unknown'

export type StatKey =
  | 'hp' | 'hp%' | 'atk' | 'atk%' | 'def' | 'def%' | 'spd' | 'critRate%' | 'critDmg%'
  | 'res' | 'acc' | 'flatSubstatsOk'

export interface GearItem {
  id: string
  slot: 'weapon' | 'helmet' | 'shield' | 'gauntlets' | 'chest' | 'boots' | 'ring' | 'amulet' | 'banner'
  rarity: Rarity
  rank: Rank
  level: number
  set: SetName
  mainStat: StatKey
  subStats: Partial<Record<StatKey, number>>
  equippedBy?: string | null
}

export interface Rule {
  name: string
  description?: string
  filter: {
    slots?: GearItem['slot'][]
    rarities?: Rarity[]
    ranks?: Rank[]
    sets?: SetName[]
    maxLevel?: number
    onlyUnequipped?: boolean
    anySubstats?: StatKey[]
    allSubstats?: StatKey[]
    noneSubstats?: StatKey[]
    minSpeed?: number
  }
  action: 'sell' | 'keep'
}

export interface SellRuleSet {
  version: number
  strategy: 'whitelist' | 'blacklist'
  rules: Rule[]
}

export interface SellFileItem {
  id: string
}

