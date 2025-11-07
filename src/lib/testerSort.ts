import { ACCESSORY_NO_SET_ID } from './constants'
import { isAccessorySlot } from './testerDomain'
import { compareArtifactSets, compareArtifactTypes, type ArtifactSetId, type ArtifactTypeId } from './types'
import type { TesterPreviewRow } from '../types/testerPreview'

const generalSlotBucket = (slot: ArtifactTypeId): number => (isAccessorySlot(slot) ? 1 : 0)

const factionSortKey = (row: TesterPreviewRow): number => {
  const value = Number(row.artifact.faction)
  return Number.isFinite(value) ? value : 0
}

const isNoSetArtifact = (row: TesterPreviewRow): boolean => {
  const slot = Number(row.artifact.slot)
  const setId = Number(row.artifact.set)
  if (!Number.isFinite(setId)) return true
  if (isAccessorySlot(slot)) {
    return setId === ACCESSORY_NO_SET_ID
  }
  return setId === 0
}

const compareTesterArtifactSets = (a: TesterPreviewRow, b: TesterPreviewRow): number => {
  const aNoSet = isNoSetArtifact(a)
  const bNoSet = isNoSetArtifact(b)
  if (aNoSet !== bNoSet) {
    return aNoSet ? -1 : 1
  }
  const aSet = Number(a.artifact.set) as ArtifactSetId
  const bSet = Number(b.artifact.set) as ArtifactSetId
  return compareArtifactSets(aSet, bSet)
}

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
    || (factionSortKey(a) - factionSortKey(b))
    || compareTesterArtifactSets(a, b)
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
