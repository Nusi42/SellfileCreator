/**
 * logicHub.ts
 *
 * Shared types and constants for the Logic Hub dialog (Final Sell + tabs).
 * Centralizing ensures UI, state, IO, and merge logic stay in sync.
 */
import type { LevelMilestone } from './types'

export type FinalSellLevel = LevelMilestone
export type FinalSellSetsMode = 'any' | 'explicit'

export const FINAL_SELL_SETS_MODE_ANY: FinalSellSetsMode = 'any'
export const FINAL_SELL_SETS_MODE_EXPLICIT: FinalSellSetsMode = 'explicit'

export const FINAL_SELL_DEFAULT_SETS_MODE: FinalSellSetsMode = FINAL_SELL_SETS_MODE_ANY

// Logic Hub dialog tabs stay canonical so autosave/history handlers can share the same tokens.
// Logic Hub tabs are centrally defined so autosave + history use the same ids.
export type LogicHubDialogTab = 'finalSell' | 'substatTargets' | 'gear' | 'dungeonDrops' | 'gearStats'
export const LOGIC_HUB_DIALOG_TAB_FINAL_SELL: LogicHubDialogTab = 'finalSell'
export const LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS: LogicHubDialogTab = 'substatTargets'
// Gear tab id lives here ahead of embedding the gear editor content.
export const LOGIC_HUB_DIALOG_TAB_GEAR: LogicHubDialogTab = 'gear'
export const LOGIC_HUB_DIALOG_TAB_DUNGEON: LogicHubDialogTab = 'dungeonDrops'
// Gear Analytics: inventory analytics dashboard with cross-filtering charts.
export const LOGIC_HUB_DIALOG_TAB_GEAR_STATS: LogicHubDialogTab = 'gearStats'
// Stable ordering helps consumers clamp restored values to a supported tab id.
export const LOGIC_HUB_DIALOG_TABS: readonly LogicHubDialogTab[] = [
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS,
  LOGIC_HUB_DIALOG_TAB_GEAR,
  LOGIC_HUB_DIALOG_TAB_DUNGEON,
  LOGIC_HUB_DIALOG_TAB_GEAR_STATS,
] as const

export const FINAL_SELL_LEVEL_CHOICES: ReadonlyArray<{ key: FinalSellLevel; label: string }> = [
  { key: 0, label: '0–3' },
  { key: 4, label: '4–7' },
  { key: 8, label: '8–11' },
  { key: 12, label: '12–15' },
  { key: 16, label: '16' },
] as const

export function finalSellCoversFullLevelRange(levels: FinalSellLevel[]): boolean {
  // Empty selections never cover 0–16, so Safeguards can lean on this to nudge users.
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
