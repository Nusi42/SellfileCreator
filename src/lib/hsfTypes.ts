/**
 * hsfTypes.ts
 *
 * Types for the RSL Helper HSF rule and file schema used by this app.
 */

export interface HsfSubstat {
  ID: number
  Value: number
  IsFlat: boolean
  Condition: string
  NotAvailable?: boolean
}

export interface HsfRule {
  Keep?: boolean
  Use?: boolean
  IsRuleTypeAND?: boolean
  ArtifactSet?: number[]
  ArtifactType?: number[]
  Rank?: number
  Rarity?: number
  MainStatID?: number
  MainStatF?: number
  LVLForCheck?: number
  Faction?: number
  Substats: HsfSubstat[]
}

export interface HsfFile {
  Rules: HsfRule[]
}

// HSF wiring helpers: decode a StatVariant into HSF tuple shapes.
// These helpers are used only when mapping app state to/from HSF schema
// or when formatting for readability. Do not use them in HSFC parsing.
import type { RankValue, StatVariantLike } from './types'
import { RANK_VALUES, StatId, StatVariant } from './types'

/** Convert a variant into HSF main stat tuple (id,f). */
export function variantToMain(v: StatVariantLike): { id: number; f?: number } {
  const n = Number(v) as StatVariant
  switch (n) {
    case StatVariant.HP: return { id: StatId.HP, f: 0 }
    case StatVariant.HP_FLAT: return { id: StatId.HP, f: 1 }
    case StatVariant.ATK: return { id: StatId.ATK, f: 0 }
    case StatVariant.ATK_FLAT: return { id: StatId.ATK, f: 1 }
    case StatVariant.DEF: return { id: StatId.DEF, f: 0 }
    case StatVariant.DEF_FLAT: return { id: StatId.DEF, f: 1 }
    case StatVariant.SPD: return { id: StatId.SPD, f: 1 }
    case StatVariant.RES: return { id: StatId.RES, f: 1 }
    case StatVariant.ACC: return { id: StatId.ACC, f: 1 }
    case StatVariant.CR: return { id: StatId.CR, f: 0 }
    case StatVariant.CDMG: return { id: StatId.CDMG, f: 0 }
    case StatVariant.Any:
    default: return { id: StatId.Any, f: 1 }
  }
}

/** Convert a variant into HSF substat tuple (id,isFlat). */
export function variantToSub(v: StatVariantLike): { id: number; isFlat?: boolean } {
  const n = Number(v) as StatVariant
  switch (n) {
    case StatVariant.HP: return { id: StatId.HP, isFlat: false }
    case StatVariant.HP_FLAT: return { id: StatId.HP, isFlat: true }
    case StatVariant.ATK: return { id: StatId.ATK, isFlat: false }
    case StatVariant.ATK_FLAT: return { id: StatId.ATK, isFlat: true }
    case StatVariant.DEF: return { id: StatId.DEF, isFlat: false }
    case StatVariant.DEF_FLAT: return { id: StatId.DEF, isFlat: true }
    case StatVariant.SPD: return { id: StatId.SPD, isFlat: true }
    case StatVariant.RES: return { id: StatId.RES, isFlat: true }
    case StatVariant.ACC: return { id: StatId.ACC, isFlat: true }
    case StatVariant.CR: return { id: StatId.CR, isFlat: false }
    case StatVariant.CDMG: return { id: StatId.CDMG, isFlat: false }
    case StatVariant.RollCount: return { id: StatId.RollCount, isFlat: true }
    case StatVariant.Any:
    default: return { id: StatId.Any, isFlat: true }
  }
}

/** Map a rank code (0..16) to the set of star values 1..6. */
export function rankCoverage(code?: number): Set<RankValue> {
  if (code === undefined || code === null || code === 0) return new Set(RANK_VALUES)
  const n = Number(code)
  if (n >= 1 && n <= 6) return new Set([n as RankValue])
  if (n >= 7 && n <= 11) return new Set(RANK_VALUES.filter(v => v >= (n - 6)) as RankValue[])
  if (n >= 12 && n <= 16) return new Set(RANK_VALUES.filter(v => v <= (n - 10)) as RankValue[])
  return new Set(RANK_VALUES)
}

/** Map a rarity code (0..16) to the set of discrete rarity values 1..6 (Common..Mythical). */
export function rarityCoverage(code?: number): Set<RankValue> {
  if (code === undefined || code === null || code === 0) return new Set(RANK_VALUES)
  const n = Number(code)
  switch (n) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      return new Set([n as RankValue])
    case 15:
      return new Set([6 as RankValue])
    case 6:
      return new Set(RANK_VALUES)
    case 7:
      return new Set(RANK_VALUES.filter(v => v >= 2) as RankValue[])
    case 8:
      return new Set(RANK_VALUES.filter(v => v >= 3) as RankValue[])
    case 9:
      return new Set(RANK_VALUES.filter(v => v >= 4) as RankValue[])
    case 16:
      return new Set(RANK_VALUES.filter(v => v >= 5) as RankValue[])
    case 10:
      return new Set(RANK_VALUES.filter(v => v <= 2) as RankValue[])
    case 11:
      return new Set(RANK_VALUES.filter(v => v <= 3) as RankValue[])
    case 12:
      return new Set(RANK_VALUES.filter(v => v <= 4) as RankValue[])
    case 13:
      return new Set(RANK_VALUES.filter(v => v <= 5) as RankValue[])
    case 14:
      return new Set(RANK_VALUES)
    default:
      return new Set(RANK_VALUES)
  }
}
