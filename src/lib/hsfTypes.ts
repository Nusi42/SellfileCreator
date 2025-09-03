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
// or when formatting for readability. Do not use them in HSFR parsing.
import type { StatVariantLike } from './types'
import { StatVariant } from './types'

/** Convert a variant into HSF main stat tuple (id,f). */
export function variantToMain(v: StatVariantLike): { id: number; f?: number } {
  const n = Number(v) as StatVariant
  switch (n) {
    case StatVariant.HP: return { id: 1, f: 0 }
    case StatVariant.HP_FLAT: return { id: 1, f: 1 }
    case StatVariant.ATK: return { id: 2, f: 0 }
    case StatVariant.ATK_FLAT: return { id: 2, f: 1 }
    case StatVariant.DEF: return { id: 3, f: 0 }
    case StatVariant.DEF_FLAT: return { id: 3, f: 1 }
    case StatVariant.SPD: return { id: 4, f: 1 }
    case StatVariant.RES: return { id: 5, f: 1 }
    case StatVariant.ACC: return { id: 6, f: 1 }
    case StatVariant.CR: return { id: 7, f: 0 }
    case StatVariant.CDMG: return { id: 8, f: 0 }
    case StatVariant.Any:
    default: return { id: -1, f: 1 }
  }
}

/** Convert a variant into HSF substat tuple (id,isFlat). */
export function variantToSub(v: StatVariantLike): { id: number; isFlat?: boolean } {
  const n = Number(v) as StatVariant
  switch (n) {
    case StatVariant.HP: return { id: 1, isFlat: false }
    case StatVariant.HP_FLAT: return { id: 1, isFlat: true }
    case StatVariant.ATK: return { id: 2, isFlat: false }
    case StatVariant.ATK_FLAT: return { id: 2, isFlat: true }
    case StatVariant.DEF: return { id: 3, isFlat: false }
    case StatVariant.DEF_FLAT: return { id: 3, isFlat: true }
    case StatVariant.SPD: return { id: 4, isFlat: true }
    case StatVariant.RES: return { id: 5, isFlat: true }
    case StatVariant.ACC: return { id: 6, isFlat: true }
    case StatVariant.CR: return { id: 7, isFlat: false }
    case StatVariant.CDMG: return { id: 8, isFlat: false }
    case StatVariant.Any:
    default: return { id: -1, isFlat: true }
  }
}
