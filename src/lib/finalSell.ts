/**
 * finalSell.ts
 *
 * Shared types and constants for the Final Sell remainder configuration.
 * Centralizing ensures UI, state, IO, and merge logic stay in sync.
 */

export type FinalSellLevel = LevelMilestone
export type FinalSellSetsMode = 'any' | 'explicit'

export const FINAL_SELL_SETS_MODE_ANY: FinalSellSetsMode = 'any'
export const FINAL_SELL_SETS_MODE_EXPLICIT: FinalSellSetsMode = 'explicit'

export const FINAL_SELL_DEFAULT_SETS_MODE: FinalSellSetsMode = FINAL_SELL_SETS_MODE_ANY

export const FINAL_SELL_LEVEL_CHOICES: ReadonlyArray<{ key: FinalSellLevel; label: string }> = [
  { key: 0, label: '0–3' },
  { key: 4, label: '4–7' },
  { key: 8, label: '8–11' },
  { key: 12, label: '12–15' },
  { key: 16, label: '16' },
] as const

export type FinalSellRemainderConfig = {
  artifacts: boolean
  accessories: boolean
  levels: FinalSellLevel[]
  setsMode: FinalSellSetsMode
}
import type { LevelMilestone } from './types'
