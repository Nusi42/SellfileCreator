import { ensureAllGearDbs } from '../../scripts/test/gear-db-fixtures.mjs'
import { SAMPLE_LOG_SESSION, ensureCaptureSession } from '../../scripts/test/capture-fixtures.mjs'

// Materialize committed fixtures once, before any worker starts. Building inside the
// workers would race: parallel workers renaming a fresh .db over one another reads fail
// on Windows while a sibling still has the file open.
export default async function globalSetup(): Promise<void> {
  // Gear DBs: built from tests/fixtures/gear-db/*.sql, a no-op when already fresh.
  ensureAllGearDbs()
  // Sample log replayed by the endpoint specs; unpack is idempotent.
  await ensureCaptureSession(SAMPLE_LOG_SESSION)
}
