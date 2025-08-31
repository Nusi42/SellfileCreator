// HSF file schema types

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
