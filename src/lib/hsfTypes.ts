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
import type { StatVariantLike } from './types'
import { StatId, StatVariant } from './types'

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
