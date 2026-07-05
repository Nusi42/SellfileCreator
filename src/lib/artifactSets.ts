/**
 * artifactSets.ts
 *
 * Single source of truth for numeric Artifact Set IDs used throughout the app.
 *
 * The id↔name catalog is generated from shared/domain-constants.json (like every other
 * shared TS↔Rust domain constant — faction/rank/rarity/statId), so the set ids have
 * exactly one authored definition. This module re-exports the generated map under the
 * `ArtifactSet` name the app uses everywhere.
 *
 * It stays free of runtime imports (only the pure generated-constants module, which has
 * none) so id-catalog consumers like icon maps avoid circular initialization issues.
 */

import { ARTIFACT_SET_IDS } from './generated/domainConstants'

// Readable artifact set IDs (values match HSF/SFC catalog) — generated SSOT.
export const ArtifactSet = ARTIFACT_SET_IDS

// eslint-disable-next-line no-redeclare -- keep value and type aliases aligned for imports
export type ArtifactSet = number
export type ArtifactSetId = ArtifactSet | number

