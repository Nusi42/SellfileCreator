/**
 * finalSell.ts
 *
 * Shared types and constants for the Final Sell remainder configuration.
 * Centralizing ensures UI, state, IO, and merge logic stay in sync.
 */

export type FinalSellSetsMode = 'any' | 'explicit'

export const FINAL_SELL_SETS_MODE_ANY: FinalSellSetsMode = 'any'
export const FINAL_SELL_SETS_MODE_EXPLICIT: FinalSellSetsMode = 'explicit'

export const FINAL_SELL_DEFAULT_SETS_MODE: FinalSellSetsMode = FINAL_SELL_SETS_MODE_EXPLICIT

export type FinalSellRemainderConfig = {
  artifacts: boolean
  accessories: boolean
  levels: Array<0 | 4 | 8 | 12 | 16>
  setsMode: FinalSellSetsMode
}

