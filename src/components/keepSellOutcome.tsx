/**
 * keepSellOutcome.tsx
 *
 * The one definition of how a keep/sell outcome is presented.
 *
 * The Gear Inspector card grew this pair inline (a check for keep, MUI's Sell icon for sell)
 * and it was the only symbolic rendering of the outcome anywhere — every other surface spelled
 * the word. Promoting it here makes it the shared vocabulary: the sellfile preview's Keep
 * column and the inspector's card badge now read the same glyph for the same state.
 *
 * Lives beside the components rather than in `lib/constants` because the sell side is a React
 * node (an icon component), not a character, so the module has to import from MUI. The keep
 * glyph is still a plain character and is exported separately for callers that need text.
 */
import SellIcon from '@mui/icons-material/Sell'
import type { ReactNode } from 'react'
import type { I18nKey } from '../lib/i18n'

/**
 * The keep glyph, as a bare character.
 *
 * Deliberately its own constant rather than a reuse of `GLYPH_GLYPHS_SELECTED` (same check
 * character, different meaning): that one marks "this glyph filter is selected", and merging
 * the two would tie an outcome badge to a filter's appearance.
 */
export const GLYPH_KEEP = '✓'

/** How one outcome is drawn and named. */
export interface KeepSellOutcomePresentation {
  /** Shown in the cell/badge. A node, because the sell side is an icon rather than a character. */
  glyph: ReactNode
  /** Term naming the outcome; the tooltip on every surface that shows the glyph. */
  labelKey: I18nKey
  /** Which palette tone carries the outcome — success for keep, error for sell. */
  tone: 'success' | 'error'
}

/**
 * Resolve an outcome flag into its presentation.
 *
 * Takes the keep side as the truthy case so callers can pass a rule's `Keep`, a match's
 * `keep`, or a recipe's `keep` without each re-deriving the `=== false` convention the
 * inspector used. Anything nullish reads as sell, matching the inspector's original
 * `match.keep === false ? sell : keep` only where a value is genuinely present — callers
 * holding an optional match must branch on the match itself before calling this.
 */
export const keepSellOutcome = (keep: boolean): KeepSellOutcomePresentation => (
  keep
    // Keep: the check character, on the success tone.
    ? { glyph: GLYPH_KEEP, labelKey: 'keepValueKeep', tone: 'success' }
    // Sell: MUI's Sell icon, sized to the surrounding text so it drops into a dense table
    // cell and a card badge alike. Decorative — every caller supplies the label as a tooltip.
    : { glyph: <SellIcon fontSize="inherit" aria-hidden />, labelKey: 'keepValueSell', tone: 'error' }
)
