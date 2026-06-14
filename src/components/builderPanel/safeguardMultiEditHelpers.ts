/**
 * safeguardMultiEditHelpers.ts
 *
 * UI-layer helpers for safeguard multi-edit: tri-state derivation, array-patch
 * toggle computation, and patch preview projection. Complements the draft
 * machinery in safeguardMultiEditDraft.ts.
 *
 * The generic helpers (computeNumberPatchToggle, computeStringPatchToggle,
 * applyNumberPatchPreview, applyStringPatchPreview, computeArtifactSetPatchToggle,
 * applyArtifactSetPatchPreview) from recipeMultiEditHelpers are re-exported here so
 * safeguard UI components import from one place.
 */
import type { MultiEditArrayPatch } from '../../lib/recipeMultiEditDraft'
import {
  deriveBaseTriState,
  toTriStateBase,
  applyArrayPatchCount,
  computeNumberPatchToggle,
  computeStringPatchToggle,
  applyStringArrayPatchCount,
  computeArtifactSetPatchToggle,
  computeArtifactSetExclusionToggle,
  resolveExclusionPresence,
  resolveInclusionPresence,
  resolveSetTriState,
  resolveSetExclusionTriState,
  resolveMetasetTriState,
  resolveExcludedSetUnion,
  applyNumberPatchPreview,
  applyStringPatchPreview,
  applyArtifactSetPatchPreview,
  type TriStateBase,
  type SetTriState,
} from './recipeMultiEditHelpers'
import type { SafeguardMultiEditFieldState } from '../../lib/safeguardMultiEditDraft'
import type { ArtifactTypeId, FactionId, RankValue, StatVariant } from '../../lib/types'
import type { ArtifactSetSelectionEntry } from '../../lib/gearSets/selection'

// Re-export generic helpers so safeguard panels only need one import path.
export {
  deriveBaseTriState,
  toTriStateBase,
  applyArrayPatchCount,
  computeNumberPatchToggle,
  computeStringPatchToggle,
  applyStringArrayPatchCount,
  computeArtifactSetPatchToggle,
  computeArtifactSetExclusionToggle,
  resolveExclusionPresence,
  resolveInclusionPresence,
  resolveSetTriState,
  resolveSetExclusionTriState,
  resolveMetasetTriState,
  resolveExcludedSetUnion,
  applyNumberPatchPreview,
  applyStringPatchPreview,
  applyArtifactSetPatchPreview,
  type TriStateBase,
  type SetTriState,
}

// ── field-value extraction helpers ───────────────────────────────────────────

/**
 * resolveNumberArrayField
 *
 * Returns the effective number-array value from a safeguard multi-edit field.
 * Falls back to a default when the field is absent (e.g. not in multi-edit mode).
 */
export const resolveNumberArrayField = (
  field: SafeguardMultiEditFieldState | undefined,
  fallback: readonly number[],
): readonly number[] => {
  if (!field) return fallback
  return Array.isArray(field.value) ? (field.value as number[]) : fallback
}

export const resolveStringArrayField = (
  field: SafeguardMultiEditFieldState | undefined,
  fallback: readonly string[],
): readonly string[] => {
  if (!field) return fallback
  return Array.isArray(field.value) ? (field.value as string[]) : fallback
}

export const resolveSetSelectionField = (
  field: SafeguardMultiEditFieldState | undefined,
  fallback: readonly ArtifactSetSelectionEntry[],
): readonly ArtifactSetSelectionEntry[] => {
  if (!field) return fallback
  return Array.isArray(field.value) ? (field.value as ArtifactSetSelectionEntry[]) : fallback
}

// ── typed patch toggle wrappers ───────────────────────────────────────────────
// These narrow the generic computeNumberPatchToggle to the specific element
// types used by safeguard combination fields, avoiding casts at call sites.

export const computeSlotPatchToggle = (
  patch: MultiEditArrayPatch<ArtifactTypeId> | null | undefined,
  slot: ArtifactTypeId,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<ArtifactTypeId> | null =>
  computeNumberPatchToggle(
    patch as MultiEditArrayPatch<number> | null | undefined,
    slot as number,
    baseState,
    target,
  ) as MultiEditArrayPatch<ArtifactTypeId> | null

export const computeRankPatchToggle = (
  patch: MultiEditArrayPatch<RankValue> | null | undefined,
  rank: RankValue,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<RankValue> | null =>
  computeNumberPatchToggle(
    patch as MultiEditArrayPatch<number> | null | undefined,
    rank as number,
    baseState,
    target,
  ) as MultiEditArrayPatch<RankValue> | null

export const computeRarityPatchToggle = (
  patch: MultiEditArrayPatch<RankValue> | null | undefined,
  rarity: RankValue,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<RankValue> | null =>
  computeNumberPatchToggle(
    patch as MultiEditArrayPatch<number> | null | undefined,
    rarity as number,
    baseState,
    target,
  ) as MultiEditArrayPatch<RankValue> | null

export const computeMainStatPatchToggle = (
  patch: MultiEditArrayPatch<StatVariant> | null | undefined,
  variant: StatVariant,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<StatVariant> | null =>
  computeNumberPatchToggle(
    patch as MultiEditArrayPatch<number> | null | undefined,
    variant as number,
    baseState,
    target,
  ) as MultiEditArrayPatch<StatVariant> | null

export const computeFactionPatchToggle = (
  patch: MultiEditArrayPatch<FactionId> | null | undefined,
  faction: FactionId,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<FactionId> | null =>
  computeNumberPatchToggle(
    patch as MultiEditArrayPatch<number> | null | undefined,
    faction as number,
    baseState,
    target,
  ) as MultiEditArrayPatch<FactionId> | null

export const computeSubstatPatchToggle = (
  patch: MultiEditArrayPatch<StatVariant> | null | undefined,
  variant: StatVariant,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<StatVariant> | null =>
  computeNumberPatchToggle(
    patch as MultiEditArrayPatch<number> | null | undefined,
    variant as number,
    baseState,
    target,
  ) as MultiEditArrayPatch<StatVariant> | null

export const computeMetaSetIdPatchToggle = (
  patch: MultiEditArrayPatch<string> | null | undefined,
  metaId: string,
  baseState: TriStateBase,
  target: 'all' | 'none',
): MultiEditArrayPatch<string> | null =>
  computeStringPatchToggle(patch, metaId, baseState, target)
