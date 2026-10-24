/**
 * Type surface of gear-db-fixtures.mjs for TS consumers (specs, unit tests and tooling
 * import the .mjs directly; this declaration keeps them typed without compiling the
 * script itself). Keep in sync with the runtime exports.
 */
export declare const GEAR_DB_SQL_DIR: string
export declare const GEAR_DB_BUILD_DIR: string
/** Tables a fixture keeps — exactly the ones the gear importer reads. */
export declare const GEAR_DB_KEPT_TABLES: readonly string[]
/** Committed fixture names (`sample*` for unit/integration, `account-a…d` ascending in size). */
export declare const GEAR_DB_FIXTURES: {
  readonly sample: 'sample'
  readonly sample2: 'sample2'
  readonly sampleSmall: 'sample-small'
  readonly accountA: 'account-a'
  readonly accountB: 'account-b'
  readonly accountC: 'account-c'
  readonly accountD: 'account-d'
}
/** Committed SQL dump path for a fixture name. */
export declare const gearDbSqlPathFor: (name: string) => string
/** Built database path for a fixture name (call `ensureGearDb` before reading it). */
export declare const gearDbPathFor: (name: string) => string
/** Render the kept tables of an RSL Helper `.db` as a deterministic SQL script. */
export declare function renderGearDbSql(sourcePath: string): string
/** Ensure the built database for `name` is present and fresh; returns its path. */
export declare function ensureGearDb(name: string): string
/** Ensure every committed fixture is built; returns their paths. */
export declare const ensureAllGearDbs: () => string[]
/** Write, rebuild and verify the dump of `sourcePath` as fixture `name` (champions anonymized). */
export declare function dumpGearDb(sourcePath: string, name: string): void
