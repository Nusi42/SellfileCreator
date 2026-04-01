/**
 * gearDbSchema
 *
 * Centralizes the canonical column lists for the RSL Helper SQLite tables so
 * every importer (SQL blobs, JSON snapshots, delta feeds) reads the exact same
 * field set. Keeping this tiny file as the shared source of truth prevents the
 * column enumerations from drifting as we add new ingestion paths.
 */
import type { GearDbArtifactRow, GearDbChampionRow } from './gearDbNormalizer'

// Ordered column keys for artifacts/inbox rows; mirrors the DB schema verbatim.
// Keep every identifier in the same order Helper emits so JSON snapshots and
// SQLite dumps resolve to the same `GearDbArtifactRow` structure downstream.
export const ARTIFACT_COLUMN_KEYS: readonly (keyof GearDbArtifactRow)[] = [
  'ID',
  'price',
  'rank',
  'type',
  'lvl',
  'mid',
  'mlvl',
  'mfl',
  'mlvlid',
  'mgv',
  's1id',
  's1lvl',
  's1fl',
  's1lvlid',
  's1gv',
  's2id',
  's2lvl',
  's2fl',
  's2lvlid',
  's2gv',
  's3id',
  's3lvl',
  's3fl',
  's3lvlid',
  's3gv',
  's4id',
  's4lvl',
  's4fl',
  's4lvlid',
  's4gv',
  'rarity',
  'aset',
  'accset',
  'ss',
  'cID',
  's1mlvlid',
  's2mlvlid',
  's3mlvlid',
  's4mlvlid',
  'sumHP',
  'sumATK',
  'sumDEF',
  'sumSPD',
  'sumCQuote',
  'sumCDMG',
  'sumRES',
  'sumACC',
  'ASCID',
  'ASCLVL',
  'ASCFL',
  'ASCLVLID',
  'ASCGV',
  'ASCLEVEL',
  'REROLLCOUNT',
] as const

// Canonical columns for the Champs table; kept in sync with helper dumps.
// The importer depends on this array to coerce JSON champ rows back into the
// map the Gear Inspector references, so treat this as a shared schema contract.
export const CHAMPION_COLUMN_KEYS: readonly (keyof GearDbChampionRow)[] = [
  'ID',
  // HeroID − BaseHeroID = champion ascension level (0–6). Unlocks amulet at 5, banner at 6.
  'HeroID',
  'Name',
  'Vault',
  'RVault',
  'BaseHeroID',
  'Rarity',
] as const
