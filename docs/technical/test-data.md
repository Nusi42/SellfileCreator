# Test Data and Privacy

Every committed fixture is either made up or reduced to game data that names no
account. RSL Helper exports and endpoint captures come from real players, so they never
enter the repository raw. This page is the home for how they are reduced, where the
results live, and how tests get at them.

Artifact and champion instance ids are kept as exported: they are per-account counters that
identify nobody without the player id, and keeping them keeps every expected test output
byte-identical.

## Gear-DB fixtures

| Committed dump | Built database | Contents |
| -------------- | -------------- | -------- |
| `tests/fixtures/gear-db/<name>.sql` | `tmp/fixtures/gear-db/<name>.db` (gitignored) | `Artifacts`, `InboxArtifacts`, `Champs`, `LastUsedArtifacts`, verbatim |

- **Fixtures** (`GEAR_DB_FIXTURES` in `scripts/test/gear-db-fixtures.mjs`):
  `sample` (unit tests), `sample2` (unit tests and the sample2 matcher bundle),
  `sample-small` (10 artifacts, fast Playwright coverage), and `account-a…d`, four
  real-world rosters in ascending size (~4.2k → ~8.4k artifacts) that the WASM
  memory-fragmentation specs cycle through. `account-d` is the large-roster fixture behind
  `LARGE_ACCOUNT_DB_PATH`, the benchmarks, and the repro/tooling defaults.
- **Dropped tables**: everything else in an export, including `CBLoot` (carries the player
  id as `UMID`), `AccRecords`, `TeamNameChampionPresets` (hand-typed team names),
  `BattleLogs`, `FusionPlans`, and the optimizer tables. `GEAR_DB_KEPT_TABLES` is the
  list; extend it only together with the importer.
- **Dump format**: the original `CREATE TABLE` statement (whitespace-normalized) plus one
  `INSERT` per row in `rowid` order, every value rendered by SQLite's `quote()`. That keeps
  each cell's storage class (RSL Helper writes some `lastUse` values as TEXT into a REAL
  column) and round-trips REALs exactly, so re-dumping the same source never churns.
- **Adding or refreshing a fixture**:
  `npm run fixtures:gear-db:dump -- <export.db> <name>` writes the dump, builds it, and
  fails unless every kept table matches the source row for row (`EXCEPT` both ways plus
  row counts). Add new names to `GEAR_DB_FIXTURES` (and its `.d.mts`).
- **Building**: `ensureGearDb(name)` builds when the `.db` is missing or older than its
  `.sql` (a checkout or re-dump touches the `.sql`), into a temp file then renamed.
  Consumers:
  - Unit/integration tests and the bench/repro/tooling scripts call `ensureGearDb`
    themselves.
  - Playwright builds everything once in `tests/playwright/global-setup.ts`, because
    parallel workers renaming over a `.db` that a sibling still reads fail on Windows.
    Specs use the paths from `tests/playwright/fixture-paths.ts`.
  - Manual runs: `npm run fixtures:gear-db:build`.

Compiled TS consumers (under `tmp/tsc/`) import the `.mjs` directly:
`scripts/tooling/patch-esm-specifiers.cjs` re-aims relative `.mjs` specifiers at the
source file, since tsc does not emit hand-written `.mjs` helpers.

## Capture sessions and the sample log

Captures are packed as `tests/fixtures/captures/<session>.tar.zst` and unpacked on demand
into the gitignored `docs/orig/sampleLog/captures/<session>/`; see
[Packet Capture](packet-capture.md#promoting-a-recording--committed-compressed-fixtures).

- **Anonymization on pack**: RSL Helper frames name the player in `playerId` and
  `playerName`, and those values also appear in derived strings such as `savedAs`
  (`SFC_<playerId>.hsf`). `pack` collects every value of those two keys across the session
  and replaces each occurrence anywhere in the frames: ids become `um12345678`,
  `um12345679`, …; names become `[TAG]Player`, `[TAG]Player2`, …. The live capture
  directory is never modified; the anonymized copy is staged and archived.
- **Sample log**: the 2026-05-10 RSL Helper sample log (one push of every endpoint type) is
  the session `SAMPLE_LOG_SESSION` (`session_260510_183951.731`). Its packets carry no
  player identity. Packed, it shrinks from 79 MB to 0.3 MB, because its repeated
  full-inventory packets compress against each other. The replay keeps every packet,
  duplicates included, since a re-sent identical packet is part of what the endpoint
  tests exercise.

## Checklist for new test data

- Prefer made-up data. When real data is needed, reduce it to what the code under test
  reads.
- Gear DBs go through `fixtures:gear-db:dump`; captures through `fixtures:captures:pack`.
  Never commit a raw export or an unpacked capture.
- Name fixtures after what they are (`account-e`, `sample3`), never after a player or a
  player id.
