#!/usr/bin/env node
// Strips the `ChampOverviewImage` BLOB column from the `AccRecords` table of an
// RSL Helper SQLite `.db` fixture, matching the slimmed-down raw input format
// RSL Helper now exports (champion-overview screenshots are no longer embedded).
//
// The importer (src/lib/importers/gearDbImporter.ts) reads only Artifacts,
// InboxArtifacts, Champs and LastUsedArtifacts — `AccRecords` is never touched,
// so dropping its 85 MB-per-file image blobs is lossless for our pipeline while
// shrinking each committed fixture by ~95 %.
//
// Idempotent: a fixture that already lacks the column is skipped. Usage:
//   node scripts/test/strip-gear-db-blobs.mjs [file.db ...]
// With no arguments it processes the default fixture set below.

import { DatabaseSync } from 'node:sqlite'
import { statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Resolve the repo root two levels up from scripts/test/ so default paths are stable.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

// The blob column we strip and the table that carries it — single source of truth here.
const BLOB_COLUMN = 'ChampOverviewImage'
const BLOB_TABLE = 'AccRecords'

// Default fixtures to slim when invoked without explicit arguments. broken.db is
// intentionally absent (it was removed) and sample-small.db has no AccRecords table.
const DEFAULT_FIXTURES = [
  'tests/data/sample.db',
  'tests/data/sample2.db',
  'examples/um27993749_RslHelper.db',
  'examples/um53210834_RSLHelper.db',
  'examples/um85268209_RSLHelper.db',
]

// Pretty-print a byte count as MB for the progress log.
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1)

// Returns true when `table` exists in the database.
function tableExists(db, table) {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(table)
  return row !== undefined
}

// Returns true when `column` is present on `table`.
function columnExists(db, table, column) {
  // PRAGMA table_info enumerates every column; match by name.
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  return cols.some((c) => c.name === column)
}

// Strips BLOB_COLUMN from BLOB_TABLE in the file at `path`, then VACUUMs to reclaim pages.
function stripFixture(path) {
  const before = statSync(path).size
  const db = new DatabaseSync(path)
  try {
    // No AccRecords table at all (e.g. minimal fixtures) — nothing to do.
    if (!tableExists(db, BLOB_TABLE)) {
      console.log(`  skip ${path} — no ${BLOB_TABLE} table`)
      return
    }
    // Already stripped — keep the run idempotent so re-running is safe.
    if (!columnExists(db, BLOB_TABLE, BLOB_COLUMN)) {
      console.log(`  skip ${path} — ${BLOB_COLUMN} already absent (${mb(before)} MB)`)
      return
    }
    // SQLite 3.35+ DROP COLUMN rewrites the table without the blob; VACUUM frees the pages.
    db.exec(`ALTER TABLE ${BLOB_TABLE} DROP COLUMN ${BLOB_COLUMN}`)
    db.exec('VACUUM')
  } finally {
    db.close()
  }
  const after = statSync(path).size
  console.log(`  done ${path} — ${mb(before)} MB -> ${mb(after)} MB`)
}

// Resolve CLI args (or defaults) to absolute paths and process each in turn.
const inputs = process.argv.slice(2)
const targets = (inputs.length > 0 ? inputs : DEFAULT_FIXTURES).map((p) => resolve(repoRoot, p))
console.log(`Stripping ${BLOB_TABLE}.${BLOB_COLUMN} from ${targets.length} fixture(s):`)
for (const target of targets) stripFixture(target)
