/**
 * Type surface of roster-anonymizer.mjs for TS consumers (the unit test imports the .mjs
 * directly). Keep in sync with the runtime exports.
 */
/** Fake identity of a champion instance, derived from its id alone. */
export type FakeChampion = {
  baseId: number
  heroId: number
  name: string
  rarity: number
  affinity: number
  faction: number
  grade: number
  level: number
  empower: number
  blessingGrade: number
  blessingId: number
  role: number
  stats: Record<'HP' | 'ATK' | 'DEF' | 'CritRate' | 'CritDamage' | 'ACC' | 'RES' | 'SPD', number>
  power: number
  battleTicks: number
  rand: () => number
}
/** The fake identity of champion instance `id`; stable across files and runs. */
export declare function fakeChampion(id: number): FakeChampion
/** Anonymize the `Champs` table of the gear DB at `dbPath` in place; returns the row count. */
export declare function anonymizeGearDbChampions(dbPath: string): number
/** Anonymize one champion object of a `champions` frame; fields it lacks stay absent. */
export declare function anonymizeWsChampion<T extends { id: number }>(champion: T): T
/** Anonymize one capture file's text (champions frames and the console log; others unchanged). */
export declare function anonymizeCaptureText(fileName: string, text: string): string
