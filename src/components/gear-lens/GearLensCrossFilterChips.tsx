/**
 * GearLensCrossFilterChips.tsx
 *
 * Active cross-filter selections shown as chips with per-item delete buttons.
 * Always rendered below the donuts — the "Clear" button is disabled when no filter is active.
 * Fixed height prevents layout shifts when chips appear. Scrolls horizontally without a scrollbar.
 */
import { Box, Button, Chip } from '@mui/material'
import {
  type GearLensDim,
  type GearLensOutcome,
  type GearLensSource,
  rankLabel,
  levelLabel,
  artifactTypeI18nKey,
  rarityRankValueI18nKey,
  statVariantI18nKey,
} from '../../lib/gearLens'
import { type ArtifactSetId, getLocalizedGearSetName } from '../../lib/types'
import { useI18n } from '../../lib/i18n'

type Props = {
  dim: GearLensDim
  /** Partial dim setter: replaces only the provided keys. */
  onUpdate: (patch: Partial<GearLensDim>) => void
  /** Active main-stat selections (substat drill-down filter). */
  selectedMainStats: ReadonlySet<number | string>
  /** Remove one main-stat selection by id. */
  onDeleteMainStat: (id: number | string) => void
  /** Clear all active filters at once. */
  onClear: () => void
}

/** Toggle a value out of a ReadonlySet, returning a new Set. */
function without<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set)
  next.delete(value)
  return next
}

/** Catalog keys for outcome chip labels — mirrors OUTCOME_I18N_KEY in GearLensTabContent. */
const OUTCOME_I18N_KEY: Record<GearLensOutcome, string> = {
  sell: 'gearLensOutcomeSell',
  keep: 'gearLensOutcomeKeep',
  safe: 'gearLensOutcomeSafe',
  none: 'gearLensOutcomeNone',
}

/** Catalog keys for source chip labels — mirrors SOURCE_I18N_KEY in GearLensTabContent. */
const SOURCE_I18N_KEY: Record<GearLensSource, string> = {
  inventory: 'gearLensSourceInventory',
  collection: 'gearLensSourceCollection',
  vault: 'gearLensSourceVault',
  inbox: 'gearLensSourceInbox',
  manual: 'gearLensSourceManual',
}

export function GearLensCrossFilterChips({ dim, onUpdate, selectedMainStats, onDeleteMainStat, onClear }: Props) {
  const { t, lang } = useI18n()
  // Collect all active selection chips across every dimension.
  const chips: Array<{ key: string; label: string; onDelete: () => void }> = []

  for (const slot of dim.slots) {
    chips.push({
      key: `slot-${slot}`,
      label: t(artifactTypeI18nKey(slot)),
      onDelete: () => onUpdate({ slots: without(dim.slots, slot) }),
    })
  }
  for (const rank of dim.ranks) {
    chips.push({
      key: `rank-${rank}`,
      label: rankLabel(rank),
      onDelete: () => onUpdate({ ranks: without(dim.ranks, rank) }),
    })
  }
  for (const rarity of dim.rarities) {
    chips.push({
      key: `rarity-${rarity}`,
      label: t(rarityRankValueI18nKey(rarity)),
      onDelete: () => onUpdate({ rarities: without(dim.rarities, rarity) }),
    })
  }
  for (const set of dim.sets) {
    // -1 is the synthetic "others" bucket; -99 (ACCESSORY_NO_SET_ID) is no-set accessories.
    const label = set === -1 ? t('gearLensOtherSetsChip')
      : getLocalizedGearSetName(set as ArtifactSetId, t, lang)
    chips.push({
      key: `set-${set}`,
      label,
      onDelete: () => onUpdate({ sets: without(dim.sets, set) }),
    })
  }
  for (const outcome of dim.outcomes) {
    chips.push({
      key: `outcome-${outcome}`,
      label: t(OUTCOME_I18N_KEY[outcome]),
      onDelete: () => onUpdate({ outcomes: without(dim.outcomes, outcome) }),
    })
  }
  for (const src of dim.sources) {
    chips.push({
      key: `source-${src}`,
      label: t(SOURCE_I18N_KEY[src]),
      onDelete: () => onUpdate({ sources: without(dim.sources, src) }),
    })
  }
  for (const lvl of dim.levels) {
    chips.push({
      key: `level-${lvl}`,
      label: levelLabel(lvl),
      onDelete: () => onUpdate({ levels: without(dim.levels, lvl) }),
    })
  }
  for (const id of selectedMainStats) {
    chips.push({
      key: `mainstat-${id}`,
      label: t(statVariantI18nKey(Number(id))),
      onDelete: () => onDeleteMainStat(id),
    })
  }

  const hasFilters = chips.length > 0

  return (
    // Wrapping flex row: chips flow onto new lines when the row is full.
    // minHeight locks in the button row so the panel doesn't collapse when empty.
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0.75,
        alignItems: 'center',
        minHeight: 32,
        mb: 1,
      }}
    >
      {/* Clear-all button — always visible, disabled when nothing is active. */}
      <Button
        size="small"
        onClick={onClear}
        disabled={!hasFilters}
        data-snapshot-hide
        sx={{ py: 0, minWidth: 'auto', fontSize: '0.75rem' }}
      >
        {t('gearLensClearFilters')}
      </Button>
      {chips.map((chip) => (
        <Chip
          key={chip.key}
          label={chip.label}
          size="small"
          onDelete={chip.onDelete}
          color="primary"
          variant="outlined"
        />
      ))}
    </Box>
  )
}
