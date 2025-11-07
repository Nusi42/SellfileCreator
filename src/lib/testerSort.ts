import { isAccessorySlot } from './testerDomain'
import { compareArtifactSets, compareArtifactTypes, type ArtifactTypeId } from './types'
import type { TesterPreviewRow } from '../types/testerPreview'

const generalSlotBucket = (slot: ArtifactTypeId): number => (isAccessorySlot(slot) ? 1 : 0)

const compareDescendingNumbers = (left: unknown, right: unknown): number => {
  const a = Number(left)
  const b = Number(right)
  const safeA = Number.isFinite(a) ? a : 0
  const safeB = Number.isFinite(b) ? b : 0
  return safeB - safeA
}

const ascensionLevel = (row: TesterPreviewRow): number => {
  const rolls = row.artifact.ascension?.rolls
  return Number.isFinite(rolls) ? Number(rolls) : 0
}

/** Comparator for tester preview rows following the default UI priority. */
export function compareTesterPreviewRows(a: TesterPreviewRow, b: TesterPreviewRow): number {
  return (
    generalSlotBucket(a.artifact.slot) - generalSlotBucket(b.artifact.slot)
    || compareArtifactSets(a.artifact.set, b.artifact.set)
    || compareArtifactTypes(a.artifact.slot, b.artifact.slot)
    || compareDescendingNumbers(a.artifact.rank, b.artifact.rank)
    || compareDescendingNumbers(a.artifact.rarity, b.artifact.rarity)
    || compareDescendingNumbers(ascensionLevel(a), ascensionLevel(b))
  )
}

/** Stable sort helper so table rows adhere to the requested ordering. */
export function sortTesterRows(rows: readonly TesterPreviewRow[]): TesterPreviewRow[] {
  if (rows.length <= 1) {
    return rows.slice()
  }
  const annotated = rows.map((row, index) => ({ row, index }))
  annotated.sort((left, right) => compareTesterPreviewRows(left.row, right.row) || (left.index - right.index))
  return annotated.map((entry) => entry.row)
}
