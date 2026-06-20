import type { CycleButtonOption } from '../components/CycleButton'
import type { SafeguardRankMode } from './constants'

/**
 * Canonical ordered options for the safeguard-rank overlay CycleButton.
 * Why: the option list + the outlined/contained variant logic are shared by the
 * grid menu; centralising here keeps the cycle order and labels in one place
 * (mirrors makeColorBlindCycleOptions).
 *
 * Button labels are intentionally short (the button itself already reads "Rank",
 * so the options say "Group" / "Safeguard" / "Both"). The tooltip title needs the
 * fuller wording, so it lives in SAFEGUARD_RANK_TITLE_KEY_BY_MODE below — one map,
 * imported by the tooltip, so the title and the cycle order never drift.
 */
export function makeSafeguardRankCycleOptions(t: (key: string) => string): ReadonlyArray<CycleButtonOption> {
  return [
    // Order defines the click-through cycle: Off → Group → Safeguard → Both → Off.
    { value: 'off',       label: t('gearInspectorGridSafeguardRankModeOff')       },
    { value: 'groupRank', label: t('gearInspectorGridSafeguardRankModeGroupRank') },
    { value: 'rank',      label: t('gearInspectorGridSafeguardRankModeRank')      },
    { value: 'both',      label: t('gearInspectorGridSafeguardRankModeBoth')      },
  ]
}

/**
 * SSOT mapping from active rank mode to the tooltip-title i18n key. The tooltip
 * title states what the rows actually list (group rank, safeguard rank, or both),
 * distinct from the short button labels above. 'off' has no overlay/tooltip.
 */
export const SAFEGUARD_RANK_TITLE_KEY_BY_MODE: Readonly<Record<Exclude<SafeguardRankMode, 'off'>, string>> = {
  groupRank: 'safeguardRankTooltipTitleGroup',
  rank: 'safeguardRankTooltipTitleSafeguard',
  both: 'safeguardRankTooltipTitleBoth',
}

/** Outlined when the overlay is off; contained once a rank mode is active (matches color-blind cycle). */
export function safeguardRankCycleVariant(mode: SafeguardRankMode | undefined | null): 'outlined' | 'contained' {
  return mode == null || mode === 'off' ? 'outlined' : 'contained'
}
