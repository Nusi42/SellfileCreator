/**
 * finalSell.ts
 *
 * Shared types and constants for the Final Sell remainder configuration.
 * Centralizing ensures UI, state, IO, and merge logic stay in sync.
 */
import type { LevelMilestone } from './types'

export type FinalSellLevel = LevelMilestone
export type FinalSellSetsMode = 'any' | 'explicit'

export const FINAL_SELL_SETS_MODE_ANY: FinalSellSetsMode = 'any'
export const FINAL_SELL_SETS_MODE_EXPLICIT: FinalSellSetsMode = 'explicit'

export const FINAL_SELL_DEFAULT_SETS_MODE: FinalSellSetsMode = FINAL_SELL_SETS_MODE_ANY

// Dialog tabs stay canonical so autosave/history handlers can share the same tokens.
export type FinalSellDialogTab = 'finalSell' | 'keepUniques'
export const FINAL_SELL_DIALOG_TAB_FINAL_SELL: FinalSellDialogTab = 'finalSell'
export const FINAL_SELL_DIALOG_TAB_KEEP_UNIQUES: FinalSellDialogTab = 'keepUniques'
// Stable ordering helps consumers clamp restored values to a supported tab id.
export const FINAL_SELL_DIALOG_TABS: readonly FinalSellDialogTab[] = [
  FINAL_SELL_DIALOG_TAB_FINAL_SELL,
  FINAL_SELL_DIALOG_TAB_KEEP_UNIQUES,
] as const

export const FINAL_SELL_LEVEL_CHOICES: ReadonlyArray<{ key: FinalSellLevel; label: string }> = [
  { key: 0, label: '0–3' },
  { key: 4, label: '4–7' },
  { key: 8, label: '8–11' },
  { key: 12, label: '12–15' },
  { key: 16, label: '16' },
] as const

export function finalSellCoversFullLevelRange(levels: FinalSellLevel[]): boolean {
  // Empty selections never cover 0–16, so Keep Uniques can lean on this to nudge users.
  if (!levels.length) return false
  const levelSet = new Set(levels)
  for (const choice of FINAL_SELL_LEVEL_CHOICES) {
    // Require every milestone so Final Sell spans the full 0–16 ladder without gaps.
    if (!levelSet.has(choice.key)) return false
  }
  return true
}

export type FinalSellRemainderConfig = {
  artifacts: boolean
  accessories: boolean
  levels: FinalSellLevel[]
  setsMode: FinalSellSetsMode
}
