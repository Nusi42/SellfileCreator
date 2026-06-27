import { test } from 'node:test'
import assert from 'node:assert/strict'

// en-US is the structural source of truth for every translated catalog. Each
// `<lang>.ts` must define exactly the en-US key set, in the same order, with the
// same comment lines (verbatim English), so nothing silently drifts:
//   - a MISSING key falls back to English at runtime (the `{ ...en, ...locale }` spread);
//   - an EXTRA key is dead (nothing consumes it);
//   - KEY-ORDER drift and COMMENT drift are invisible at runtime but accumulate
//     until the catalogs are no longer diffable against en-US (which is how the
//     86→113 comment gap and the index-49 order swap crept in historically).
// The audit logic lives in scripts/tooling/catalogAudit.ts (the same module the
// `sync-catalog-comments` CLI uses) so this gate and that tool never disagree.
import { PRODUCTION_LANGUAGES, DEFAULT_LANGUAGE } from '../../src/lib/i18n/types.js'
import { auditStructure, extractKeys, extractCommentTexts, readCatalogText } from '../../scripts/tooling/catalogAudit.js'

// English baseline, parsed once from source text.
const englishContent = readCatalogText(DEFAULT_LANGUAGE)
const englishKeys = extractKeys(englishContent)
const englishComments = extractCommentTexts(englishContent)

// Every non-English production locale is held to exact structural parity.
for (const code of PRODUCTION_LANGUAGES) {
  if (code === DEFAULT_LANGUAGE) continue

  test(`${code} catalog is structurally identical to en-US (keys, order, comments)`, () => {
    const drift = auditStructure(code, englishKeys, englishComments)

    // Key set: no missing (English fallback) and no extra (dead) keys.
    assert.deepEqual(
      { missing: drift.missingKeys, extra: drift.extraKeys },
      { missing: [], extra: [] },
      `${code} key set drifted from en-US`,
    )

    // Key order: same sequence as en-US.
    assert.equal(
      drift.orderMismatch,
      null,
      drift.orderMismatch
        ? `${code} key order diverges at index ${drift.orderMismatch.index}: expected "${drift.orderMismatch.expected}" but found "${drift.orderMismatch.actual}". Run \`npm run i18n:sync-comments\` / re-align key order.`
        : '',
    )

    // Comments: verbatim English, same order and count.
    assert.equal(
      drift.commentMismatch,
      null,
      drift.commentMismatch
        ? `${code} comment line ${drift.commentMismatch.index} diverges: expected ${JSON.stringify(drift.commentMismatch.expected)} but found ${JSON.stringify(drift.commentMismatch.actual)}. Comments must be verbatim en-US; run \`npm run i18n:sync-comments\`.`
        : '',
    )
  })
}
