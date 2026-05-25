import type { CycleButtonOption } from '../components/CycleButton'
import type { ColorBlindMode } from './constants'

/**
 * Canonical ordered options for the color-blind mode CycleButton.
 * Why: GearInspectorItemsGrid, HsfRulesTable, and HelpDialog all need the same
 * three-entry list; centralising here prevents independent drift.
 */
export function makeColorBlindCycleOptions(t: (key: string) => string): ReadonlyArray<CycleButtonOption> {
  return [
    { value: 'normal',   label: t('colorBlindNormal')   },
    { value: 'okabeIto', label: t('colorBlindOkabeIto') },
    { value: 'tritan',   label: t('colorBlindTritan')   },
  ]
}

/** Matches the outlined/contained variant logic used across all color-blind CycleButtons. */
export function colorBlindCycleVariant(mode: ColorBlindMode | undefined | null): 'outlined' | 'contained' {
  return mode == null || mode === 'normal' ? 'outlined' : 'contained'
}
