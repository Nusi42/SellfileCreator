/**
 * Artifact set piece-group taxonomy.
 *
 * Why: multiple modules (builder filters, Safeguard defaults, runtime gear-set
 * patches) need to know whether a set behaves like accessories, fixed-size armor,
 * or the flexible 1–9 piece families. Centralizing the enum avoids divergent
 * literals and keeps runtime validation in sync with the canonical union.
 */
export const ArtifactSetPieceGroup = {
  Accessories: 'accessories',
  ArmorFixed: 'armorFixed',
  ArmorVariable: 'armorVariable',
} as const

// eslint-disable-next-line no-redeclare -- share value/type identifier
export type ArtifactSetPieceGroup = (typeof ArtifactSetPieceGroup)[keyof typeof ArtifactSetPieceGroup]
