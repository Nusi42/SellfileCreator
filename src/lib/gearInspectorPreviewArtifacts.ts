import { variantToMain, variantToSub } from './hsfTypes'
import type { NormalizedGearArtifact, NormalizedStat } from './importers/gearDbNormalizer'
import type { TestItem } from './ruleEval'
import { isGearInspectorCustomItemId } from './itemIdentity'
import { StatVariant } from './types'

type BuildOptions = {
  fallbackId?: number | undefined
  subOrder?: number[] | undefined
}

const cloneStat = (stat: NormalizedStat | null | undefined): NormalizedStat | null => (
  stat ? { ...stat, mythValue: stat.mythValue ?? 0 } : null
)

const cloneStats = (stats: NormalizedStat[] | undefined): NormalizedStat[] => (
  // Filter out null/undefined entries defensively — the type guarantees they are
  // non-null, but malformed deserialized payloads can violate that at runtime.
  (stats ?? []).filter((stat): stat is NormalizedStat => stat != null).map((stat) => ({ ...stat, mythValue: stat.mythValue ?? 0 }))
)

const buildManualMainStat = (variantValue: number | undefined): NormalizedStat | null => {
  if (variantValue == null) return null
  const variant = Number(variantValue)
  if (!Number.isFinite(variant) || variant < 0 || variant === StatVariant.Any) return null
  const mainTuple = variantToMain(variant)
  return {
    source: 'main',
    statId: mainTuple.id,
    isFlat: (mainTuple.f ?? 0) === 1,
    variant: variant as StatVariant,
    baseValue: 0,
    glyphValue: 0,
    mythValue: 0,
    totalValue: Number.NaN,
  }
}

const buildManualSubstats = (
  item: TestItem,
  subOrder?: number[],
): NormalizedStat[] => {
  const subValues = item.subValues ?? {}
  const entries = Object.entries(subValues)
    .map(([variantKey, rawValue]) => {
      const variant = Number(variantKey)
      const value = Number(rawValue)
      if (!Number.isFinite(variant) || !Number.isFinite(value)) return null
      const subTuple = variantToSub(variant)
      const stat: NormalizedStat = {
        source: 'substat',
        statId: subTuple.id,
        isFlat: Boolean(subTuple.isFlat),
        variant: variant as StatVariant,
        baseValue: value,
        glyphValue: 0,
        mythValue: 0,
        totalValue: value,
      }
      return stat
    })
    .filter((stat): stat is NormalizedStat => Boolean(stat))

  if (!entries.length) return []
  if (subOrder && subOrder.length > 0) {
    const order = new Map<number, number>()
    subOrder.forEach((variant, idx) => { order.set(Number(variant), idx) })
    entries.sort((a, b) => {
      const ao = order.has(a.variant) ? order.get(a.variant)! : Number.MAX_SAFE_INTEGER
      const bo = order.has(b.variant) ? order.get(b.variant)! : Number.MAX_SAFE_INTEGER
      if (ao === bo) return a.variant - b.variant
      return ao - bo
    })
  } else {
    entries.sort((a, b) => a.variant - b.variant)
  }
  return entries
}

// Structural item shape for the list projection: a TestItem that may additionally carry
// the Gear Inspector session fields (itemId assigned at ingestion, user substat order).
type ProjectableGearInspectorItem = TestItem & { itemId?: number; subOrder?: number[] }

/**
 * Project a whole Gear Inspector item list to the pipeline's artifact shape.
 * SSOT shared by App's preview memo and the background account-push flow — the
 * fallback-id rule and the failure handling must stay identical in both, or the
 * two paths would key safeguard detection differently for the same items.
 */
export function buildPreviewArtifactsFromGearInspectorItems(
  items: readonly ProjectableGearInspectorItem[],
): NormalizedGearArtifact[] {
  const next: NormalizedGearArtifact[] = []
  items.forEach((item, idx) => {
    try {
      const artifact = buildPreviewArtifactFromGearInspectorItem(item, {
        // Custom items now surface their positive high itemId as the artifact id inside
        // the builder; this negative fallback only applies to legacy/out-of-band ids that
        // escaped migration (then the item-key ladder falls back to gearInspectorItem.itemId).
        fallbackId: typeof item.itemId === 'number' && Number.isFinite(item.itemId) ? -Math.abs(item.itemId) : undefined,
        subOrder: item.subOrder,
      })
      next.push(artifact)
    } catch (err) {
      // Surface conversion failures so they can be diagnosed — silently skipped items
      // will not appear in the pipeline and will show in the Gear Inspector without a
      // match result.  Log enough context to reproduce the issue.
      if (import.meta.env.DEV) {
        console.warn(
          `[sfc-gear] buildPreviewArtifactFromGearInspectorItem failed for item idx=${idx}`,
          `slot=${item.slot} set=${item.set} rank=${item.rank} rarity=${item.rarity} level=${item.level}`,
          `itemId=${item.itemId} hasExtras=${item.previewExtras != null}`,
          err,
        )
      }
    }
  })
  return next
}

export function buildPreviewArtifactFromGearInspectorItem(
  item: TestItem,
  options?: BuildOptions,
): NormalizedGearArtifact {
  const extras = item.previewExtras
  // Manual items carry no extras.id (that field is the real DB id for imported gear).
  // Surface their synthetic custom itemId as a POSITIVE artifact id so the safeguard
  // item-key ladder (artifact.id when >0) returns it directly, keeping custom pieces
  // uniquely keyed and isolated from real DB ids. TestItem does not declare itemId, but
  // GearInspectorItem attaches one at runtime; read it defensively.
  const customItemId = (item as TestItem & { itemId?: number }).itemId
  const customPositiveId = (typeof customItemId === 'number'
    && Number.isFinite(customItemId)
    && isGearInspectorCustomItemId(customItemId))
    ? customItemId
    : undefined
  const id = extras?.id ?? customPositiveId ?? options?.fallbackId ?? 0
  const source = extras?.source ?? 'manual'
  const rerollCount = extras?.rerollCount ?? 0
  // Carry the full lookup-record reference forward unchanged when present; manual
  // entries leave it null. The id is accessible via `equippedChampion.id` when needed.
  const equippedChampion = extras?.equippedChampion ?? null
  const mainStat = extras?.mainStat ? cloneStat(extras.mainStat) : buildManualMainStat(item.main)
  const substats = extras?.substats ? cloneStats(extras.substats) : buildManualSubstats(item, options?.subOrder)
  const ascension = extras?.ascension ? cloneStat(extras.ascension) : null
  const exactLevel = (typeof extras?.exactLevel === 'number' && Number.isFinite(extras.exactLevel))
    ? Math.max(0, Math.min(16, Math.round(extras.exactLevel)))
    : null
  // Last-use metadata only exists for imported gear DB entries.
  const lastUseLocalTimestamp = typeof extras?.lastUseLocalTimestamp === 'string'
    ? extras.lastUseLocalTimestamp
    : null
  // Lock state is only set by the endpoint; manual items are never locked.
  const isLocked = extras?.isLocked === true

  return {
    id,
    slot: item.slot,
    set: item.set,
    rank: item.rank,
    rarity: item.rarity,
    level: item.level,
    exactLevel,
    faction: item.faction ?? 0,
    mainStat,
    substats,
    ascension,
    gearInspectorItem: item,
    rerollCount,
    equippedChampion,
    source,
    lastUseLocalTimestamp,
    isLocked,
  }
}
