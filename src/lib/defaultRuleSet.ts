import type { SellRuleSet } from './types'

export const defaultRuleSet: SellRuleSet = {
  version: 1,
  strategy: 'blacklist',
  rules: [
    {
      name: 'Sell low-rank commons/uncommons',
      description: 'Trash low quality low rank pieces at level 0–4',
      filter: {
        rarities: ['common', 'uncommon'],
        ranks: [1, 2, 3] as const,
        maxLevel: 4,
        onlyUnequipped: true,
      },
      action: 'sell',
    },
    {
      name: 'Keep speed boots rank 6+',
      filter: {
        slots: ['boots'],
        ranks: [6, 7] as const,
        anySubstats: ['spd'],
      },
      action: 'keep',
    },
  ],
}

