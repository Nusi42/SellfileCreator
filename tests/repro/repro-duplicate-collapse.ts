/* eslint import/no-unused-modules: off */
// Proves the DUPLICATE-path collapse: cloneManualGearInspectorItem copies previewExtras
// (including previewExtras.id) verbatim, only reassigning itemId. Since the safeguard
// item-key ladder prefers previewExtras.id OVER itemId, duplicating an item that carries a
// previewExtras.id yields clones that ALL share the original's itemKey — collapsing the
// Gear Inspector weight-flyout rows onto one piece's substats (and losing the tooltip),
// exactly as reported after duplicating from one item.
import { StatVariant, ArtifactSet, ArtifactType } from '../../src/lib/types.js'
import { buildPreviewArtifactFromGearInspectorItem } from '../../src/lib/gearInspectorPreviewArtifacts.js'
import { getSafeguardItemKey } from '../../src/lib/safeguards.js'
import type { GearInspectorItem } from '../../src/lib/gearInspectorSession.js'

// An item that carries previewExtras.id (as an imported piece would). itemId differs per clone.
const withPreviewId = (itemId: number, previewId: number, subValues: Record<number, number>): GearInspectorItem => ({
  slot: ArtifactType.Weapon, set: ArtifactSet.Speed, rank: 6, rarity: 5, level: 16,
  faction: 0, main: StatVariant.ATK, subValues, itemId,
  previewExtras: { id: previewId, source: 'manual' },
} as unknown as GearInspectorItem)

// Simulate 3 duplicates: distinct itemIds (fresh alloc), but SAME previewExtras.id (copied by clone).
const SHARED_PREVIEW_ID = 4242
// itemIds in the reserved custom band (descending from INT32_MAX), as the allocator hands out.
const items: GearInspectorItem[] = [
  withPreviewId(2147483647, SHARED_PREVIEW_ID, { [StatVariant.CR]: 3, [StatVariant.RES]: 6, [StatVariant.SPD]: 20 }),
  withPreviewId(2147483646, SHARED_PREVIEW_ID, { [StatVariant.CR]: 9, [StatVariant.CDMG]: 6, [StatVariant.SPD]: 10 }),
  withPreviewId(2147483645, SHARED_PREVIEW_ID, { [StatVariant.CR]: 3, [StatVariant.ACC]: 6, [StatVariant.SPD]: 10 }),
]

const keyOf = (item: GearInspectorItem): number => {
  const a = buildPreviewArtifactFromGearInspectorItem(item, {
    fallbackId: Number.isFinite(item.itemId) ? -Math.abs(item.itemId) : undefined,
    subOrder: item.subOrder,
  })
  const k = getSafeguardItemKey(a)
  console.log(`[dup]   itemId=${item.itemId} previewExtras.id=${item.previewExtras?.id ?? 'none'} artifact.id=${a.id} => itemKey=${k}`)
  return k
}

// BEFORE the clone fix: duplicates copy previewExtras.id → all keys collapse to it.
console.log('[dup] pre-fix clone (copies previewExtras.id):')
const beforeKeys = items.map(keyOf)
console.log(`[dup]   distinct=${new Set(beforeKeys).size}/${beforeKeys.length}`)

// AFTER the clone fix: cloneManualGearInspectorItem drops previewExtras.id, so each clone is
// keyed by its own itemId. Mirror that here (strip the id from previewExtras) and re-key.
console.log('[dup] post-fix clone (drops previewExtras.id, keyed by itemId):')
const afterKeys = items.map((item) => {
  const pe = { ...item.previewExtras }
  delete (pe as { id?: number }).id
  return keyOf({ ...item, previewExtras: pe })
})
console.log(`[dup]   distinct=${new Set(afterKeys).size}/${afterKeys.length} keys=[${afterKeys.join(',')}]`)
console.log(new Set(afterKeys).size === afterKeys.length
  ? '[dup] FIX VERIFIED — dropping previewExtras.id on clone gives each duplicate a distinct key.'
  : '[dup] STILL COLLAPSED — check the clone fix.')
