import type { CycleButtonOption } from '../components/CycleButton'
import type { SafeguardRankMode } from './constants'

/**
 * Canonical ordered options for the safeguard-rank overlay CycleButton.
 * Why: the option list + the outlined/contained variant logic are shared by the
 * grid menu; centralising here keeps the cycle order and labels in one place
 * (mirrors makeColorBlindCycleOptions).
 */
export function makeSafeguardRankCycleOptions(t: (key: string) => string): ReadonlyArray<CycleButtonOption> {
  return [
    // Order defines the click-through cycle: Off → Rank → Group rank → Rank + group → Off.
    { value: 'off',       label: t('gearInspectorGridSafeguardRankModeOff')       },
    { value: 'rank',      label: t('gearInspectorGridSafeguardRankModeRank')      },
    { value: 'groupRank', label: t('gearInspectorGridSafeguardRankModeGroupRank') },
    { value: 'both',      label: t('gearInspectorGridSafeguardRankModeBoth')      },
  ]
}

/** Outlined when the overlay is off; contained once a rank mode is active (matches color-blind cycle). */
export function safeguardRankCycleVariant(mode: SafeguardRankMode | undefined | null): 'outlined' | 'contained' {
  return mode == null || mode === 'off' ? 'outlined' : 'contained'
}
