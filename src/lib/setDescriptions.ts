// Descriptions for artifact sets used to provide tooltips in selects/menus.

export type ArtifactSetDescription = { pieces: number | string; text: string; byPieces?: Record<number, string> }

export const artifactSetDescriptions: Record<string, ArtifactSetDescription> = {
  "Accuracy": { pieces: 2, text: "+40 ACC" },
  "Affinitybreaker": { pieces: 4, text: "C.DMG +30%\n50% chance to convert weak hit to critical hit" },
  "Avenging": { pieces: 4, text: "45% chance to counterattack when a debuff is placed on the wearer" },
  "Bloodshield": { pieces: 1, text: "per piece: {buff:Shield} equal to 5% of damage dealt after attacking (AoE reduced by 75%); totals: 5/10/15% with 1/2/3 pieces" },
  "Bloodthirst": { pieces: 4, text: "C.RATE +12%\nheal by 30% of damage dealt" },
  "Bolster": { pieces: 4, text: "Protected {buff:Shield} for all allies equal to 30% of wearer MAX HP for 3 turns at start of round" },
  "Chronophage": { pieces: "1–9", text: "", byPieces: { 1: "+20 RES", 2: "+10% SPD", 3: "+20 RES", 4: "starts with 1 {buff:Immutable} stack", 5: "+10% SPD", 6: "starts with 2 {buff:Immutable} stacks", 7: "+20 RES", 8: "+12% SPD", 9: "starts with 3 {buff:Immutable} stacks" } },
  "Mercurial": { pieces: "1–9", text: "", byPieces: { 1: "+20 RES", 2: "+15% HP", 3: "+8% SPD", 4: "Grants the wearer 1 {buff:Total Guard} stack at the start of the Round. Each stack blocks all incoming damage and any associated effects.", 5: "+12% SPD", 6: "Grants the wearer 2 {buff:Total Guard} stacks at the start of the Round. Each stack blocks all incoming damage and any associated effects.", 7: "+20 RES", 8: "+12% SPD", 9: "Grants the wearer 3 {buff:Total Guard} stacks at the start of the Round. Each stack blocks all incoming damage and any associated effects.\nAlso places a {buff:Total Guard} stack at the start of this Champion’s turn, if they have no {buff:Total Guard} stacks." } },
  "Cleansing": { pieces: 1, text: "per piece: 8% chance to remove 1 random debuff at start of wearer's turn; totals: 8/16/24% with 1/2/3 pieces" },
  "Critical Rate": { pieces: 2, text: "+12% C.RATE" },
  "Cruel": { pieces: 2, text: "ATK +15%\nignore 5% DEF" },
  "Curing": { pieces: 4, text: "healing done +20%\nrestore destroyed HP equal to bonus healing" },
  "Cursed": { pieces: 4, text: "50% chance to place {debuff:Hex} for 2 turns when attacking" },
  "Daze": { pieces: 4, text: "25% chance to place {debuff:Sleep} for 1 turn when attacking" },
  "Defense": { pieces: 2, text: "+15% DEF" },
  "Defiant": { pieces: 2, text: "DEF +10%\n-15% damage taken from enemy AoE attacks" },
  "Deflection": { pieces: 4, text: "HP +20%\nDEF +20%\n25% chance to deflect 1 debuff onto attacker when a debuff is applied to wearer" },
  "Destroy": { pieces: 4, text: "decrease target MAX HP by 40% of damage dealt" },
  "Divine Critical Rate": { pieces: 2, text: "C.RATE +12%\n{buff:Shield} on self equal to 15% of MAX HP for 3 turns at start of round" },
  "Divine Life": { pieces: 2, text: "HP +15%\n{buff:Shield} on self equal to 15% of MAX HP for 3 turns at start of round" },
  "Divine Offense": { pieces: 2, text: "ATK +15%\n{buff:Shield} on self equal to 15% of MAX HP for 3 turns at start of round" },
  "Divine Speed": { pieces: 2, text: "SPD +12%\n{buff:Shield} on self equal to 15% of MAX HP for 3 turns at start of round" },
  "Fatal": { pieces: 2, text: "ATK +15%\nC.RATE +5%" },
  "Feral": { pieces: "1–9", text: "", byPieces: { 1: "+40 ACC", 2: "+5% SPD", 3: "+40 ACC", 4: "gain {buff:Block Debuffs} for 2 turns at start of round", 5: "+5% SPD", 6: "50% chance to block {debuff:Sheep} from Polymorph", 7: "+40 ACC", 8: "+5% SPD", 9: "allies deal +5% damage per debuff inflicted by wearer" } },
  "Fortitude": { pieces: 2, text: "DEF +10%\n+40 RES" },
  "Frenzy": { pieces: 4, text: "Turn Meter +5% per debuff received" },
  "Frost": { pieces: 4, text: "20% chance to place {debuff:Freeze} for 1 turn when hit" },
  "Frostbite": { pieces: 2, text: "15% chance to block {debuff:Freeze}\n10% chance to place {debuff:Freeze} on attacker when hit" },
  "Fury": { pieces: 4, text: "+10% damage at 76–100% HP; +25% damage at 51–75% HP; +50% damage under 51% HP" },
  "Guardian": { pieces: 4, text: "absorb 10% of ally damage\nheal +10% each turn" },
  "Immortal": { pieces: 2, text: "HP +15%\nheal +3% each turn" },
  "Immunity": { pieces: 4, text: "{buff:Block Debuffs} for 2 turns at start of round" },
  "Impulse": { pieces: 2, text: "SPD +12%\n12% chance to reduce a random skill cooldown by 1 turn" },
  "Instinct": { pieces: 4, text: "SPD +12%\nignore 20% DEF" },
  "Killstroke": { pieces: 2, text: "C.DMG +20%\nSPD +5%" },
  "Lethal": { pieces: 4, text: "ignore 25% DEF\nC.RATE +10%" },
  "Life": { pieces: 2, text: "+15% HP" },
  "Lifesteal": { pieces: 4, text: "heal 30% of damage dealt" },
  "Merciless": { pieces: "1–9", text: "", byPieces: { 1: "+10% ATK", 2: "+15% C.DMG", 3: "+5% SPD", 4: "30% chance to reduce a random skill cooldown", 5: "+15% ATK", 6: "ignore 35% DEF", 7: "+5% SPD", 8: "+15% C.DMG", 9: "15% chance to gain an Extra Turn on hit" } },
  "Offense": { pieces: 2, text: "+15% ATK" },
  "Perception": { pieces: 2, text: "+40 ACC\nSPD +5%" },
  "Pinpoint": { pieces: "1–9", text: "", byPieces: { 1: "+20 ACC", 2: "+10% SPD", 3: "+20 ACC", 4: "1 {buff:Intercept} stack at start of round", 5: "+10% SPD", 6: "2 {buff:Intercept} stacks at start of round", 7: "+20 ACC", 8: "+12% SPD", 9: "4 {buff:Intercept} stacks at start of round" } },
  "Protection": { pieces: "1–9", text: "", byPieces: { 1: "+20 RES", 2: "+15% HP", 3: "+12% SPD", 4: "25% chance to protect buffs placed by wearer", 5: "+12% SPD", 6: "50% chance to protect buffs placed by wearer", 7: "+20 RES", 8: "+8% SPD", 9: "75% chance to protect buffs placed by wearer\nallies deal +5% damage per buff placed by wearer" } },
  "Reaction": { pieces: 1, text: "per piece: 25% chance to change incoming Critical Hit to normal before wearer's first turn; totals: 25/50/75% with 1/2/3 pieces" },
  "Rebirth": { pieces: "1–9", text: "", byPieces: { 1: "+20 RES", 2: "+10% SPD", 3: "+20 RES", 4: "revived: +10% HP and +10% Turn Meter", 5: "+10% SPD", 6: "gain {buff:Block Damage} for 1 turn (on ally death, once/round)", 7: "+20 RES", 8: "+12% SPD", 9: "decreases revived allies’ skill cooldowns by 1 turn" } },
  "Reflex": { pieces: 4, text: "40% chance to reduce a random skill cooldown by 1 turn" },
  "Refresh": { pieces: 1, text: "per piece: 5% chance to prevent used skill going on cooldown; totals: 5/10/15% with 1/2/3 pieces" },
  "Regeneration": { pieces: 4, text: "heal 15% of MAX HP at start of turn" },
  "Relentless": { pieces: 4, text: "18% chance to gain an Extra Turn" },
  "Resilience": { pieces: 2, text: "HP +10%\nDEF +10%" },
  "Resistance": { pieces: 2, text: "+40 RES" },
  "Retaliation": { pieces: 2, text: "15% chance to counterattack when hit by an enemy" },
  "Revenge": { pieces: 1, text: "per piece: 5% chance to counterattack when hit; totals: 5/10/15% with 1/2/3 pieces" },
  "Righteous": { pieces: 2, text: "SPD +10%\n+40 RES" },
  "Savage": { pieces: 4, text: "attacks ignore 25% of target DEF" },
  "Shield": { pieces: 4, text: "{buff:Shield} for all allies equal to 30% of wearer MAX HP for 3 turns at start of round" },
  "Slayer": { pieces: "1–9", text: "", byPieces: { 1: "+5% C.RATE", 2: "+15% C.DMG", 3: "+5% SPD", 4: "Turn Meter +5% per enemy hit by AoE attacks", 5: "+10% C.RATE", 6: "AoE skills ignore 30% enemy DEF", 7: "+15% C.DMG", 8: "+5% SPD", 9: "30% chance to repeat AoE damage" } },
  "Speed": { pieces: 2, text: "+12% SPD" },
  "Stalwart": { pieces: 4, text: "-30% damage from incoming AoE attacks" },
  "Stonecleaver": { pieces: "1–9", text: "", byPieces: { 1: "+10% ATK", 2: "+15% C.DMG", 3: "+5% SPD", 4: "+30% damage to Stone Skin shields", 5: "+15% ATK", 6: "+20% ignore DEF", 7: "+5% SPD", 8: "+15% C.DMG", 9: "+70% damage to Stone Skin shields" } },
  "Stoneskin": { pieces: "1–9", text: "", byPieces: { 1: "+8% HP", 2: "+40 RES", 3: "+15% DEF", 4: "{buff:Stone Skin} for 1 turn at start of round (50% chance to block removals/steals)", 5: "+15% DEF", 6: "{buff:Stone Skin} for 2 turns at start of round (50% chance to block removals/steals)", 7: "+8% HP", 8: "+40 RES", 9: "Stone Skin shield value = 75% of HP" } },
  "Stun": { pieces: 4, text: "18% chance to place {debuff:Stun} for 1 turn when attacking" },
  "Supersonic": { pieces: "1–9", text: "", byPieces: { 1: "+20 RES", 2: "+15% HP", 3: "+10% SPD", 4: "Turn Meter +2% per buff placed by enemies", 5: "+10% SPD", 6: "-30% Turn Meter reduction effects", 7: "+20 RES", 8: "+12% SPD", 9: "+30% Turn Meter boost effects" } },
  "Swift Parry": { pieces: 4, text: "SPD +18%\nC.DMG +30%\n50% chance to gain {buff:Unkillable} for 1 turn when hit with a fatal hit" },
  "Toxic": { pieces: 4, text: "75% chance to place 2.5% {debuff:Poison} for 2 turns when attacking" },
  "Untouchable": { pieces: 4, text: "{buff:Block Debuffs} for 2 turns at start of round\n+40 RES" },
  "Zeal": { pieces: 2, text: "C.DMG +20%\ndamage +3% per 25% current HP" },
  "Crit Damage": { pieces: 2, text: "C.DMG +20%" },
  "Provoke": { pieces: 4, text: "30% chance to place {debuff:Provoke} for 1 turn when attacking" },
}

export function tooltipForSet(name: string): string | undefined {
  const d = artifactSetDescriptions[name]
  if (!d) return undefined
  const pfx = typeof d.pieces === 'number' ? `${d.pieces}-piece` : String(d.pieces)
  const main = `${pfx}: ${d.text}`
  if (d.byPieces) {
    const parts = Object.keys(d.byPieces).map(n => `${n}: ${d.byPieces![Number(n)]}`)
    return `${main} | ${parts.join("; ")}`
  }
  return main
}
