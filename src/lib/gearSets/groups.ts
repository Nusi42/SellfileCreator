/**
 * Artifact set piece-group taxonomy.
 *
 * Why: multiple modules (builder filters, Safeguard defaults, runtime gear-set
 * patches) need to know whether a set behaves like accessories, fixed-size artifact,
 * or the flexible 1–9 piece families. Centralizing the enum avoids divergent
 * literals and keeps runtime validation in sync with the canonical union.
 */
export const ArtifactSetPieceGroup = {
  Accessories: 'accessories',
  ArtifactFixed: 'artifactFixed',
  ArtifactVariable: 'artifactVariable',
} as const

// eslint-disable-next-line no-redeclare -- share value/type identifier
export type ArtifactSetPieceGroup = (typeof ArtifactSetPieceGroup)[keyof typeof ArtifactSetPieceGroup]

// Legacy `pieceGroup` values from before the armor→artifact rename. Imported
// `custom.gearsets.json` files may still carry these, so map them on the way in
// rather than silently rejecting a valid file.
const LEGACY_PIECE_GROUP_ALIASES: Record<string, ArtifactSetPieceGroup> = {
  armorFixed: ArtifactSetPieceGroup.ArtifactFixed,
  armorVariable: ArtifactSetPieceGroup.ArtifactVariable,
}

/** Coerce a raw `pieceGroup` string to a canonical enum value, or null if unrecognized. */
export const normalizePieceGroupValue = (raw: string): ArtifactSetPieceGroup | null => {
  if ((Object.values(ArtifactSetPieceGroup) as string[]).includes(raw)) return raw as ArtifactSetPieceGroup
  return LEGACY_PIECE_GROUP_ALIASES[raw] ?? null
}
