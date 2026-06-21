/**
 * RarityLabel / RarityLabelList
 *
 * Single source of truth for rendering a rarity word (Common…Mythical) on screen with its
 * rarity-colour tint. The localized text comes from the existing `rarityRankValueI18nKey`; the
 * colour is the contrast-adapted, flag-gated rarity colour from `useRarityTextColor` — `undefined`
 * when the master colour flag is off, so the word inherits the surrounding theme colour (today's look).
 *
 * Use `<RarityLabel>` for a single word and `<RarityLabelList>` for the comma-separated summaries
 * that selects/chips render (each word keeps its own colour).
 */
import { Box } from '@mui/material'
import { useI18n } from '../lib/i18n'
import { rarityRankValueI18nKey, rarityCodeParts, type RarityCode } from '../lib/types'
import { NBSP } from '../lib/constants'
import { useRarityTextColor } from '../lib/rarityColorContext'

/** One tinted rarity word. `component` lets callers render it inline (default) or as a block span. */
export function RarityLabel({ rarity }: { rarity: number }) {
  const { t } = useI18n()
  const color = useRarityTextColor(rarity)
  // color undefined ⇒ omit the sx colour entirely so the word inherits the theme text colour.
  return (
    <Box component="span" sx={color ? { color } : undefined}>
      {t(rarityRankValueI18nKey(rarity))}
    </Box>
  )
}

/**
 * A comma-separated run of tinted rarity words. Mirrors the existing `join(', ')` summaries but keeps
 * each word coloured. Renders nothing extra when the list is empty (caller handles the empty case).
 */
export function RarityLabelList({ values, separator = ', ' }: { values: readonly number[]; separator?: string }) {
  // Stable keys without bare indices: suffix each rarity with its running occurrence count so
  // duplicate rarities still get unique, position-independent keys.
  const seen = new Map<number, number>()
  return (
    <>
      {values.map((rarity, i) => {
        const occ = seen.get(rarity) ?? 0
        seen.set(rarity, occ + 1)
        return (
          <Box component="span" key={`rarity-${rarity}-${occ}`}>
            {i > 0 ? separator : null}
            <RarityLabel rarity={rarity} />
          </Box>
        )
      })}
    </>
  )
}

/**
 * A full rarity-code label (e.g. "≥ Rare", "Common"), with the rarity WORD tinted and the comparator
 * glyph left in the surrounding colour. Any/empty codes render nothing. SSOT for the comparator forms
 * the builder/safeguard rarity selectors show.
 */
export function RarityCodeLabel({ code }: { code: RarityCode | undefined }) {
  const { comparator, rank } = rarityCodeParts(code)
  if (rank == null) return null
  return (
    <>
      {comparator ? `${comparator}${NBSP}` : null}
      <RarityLabel rarity={rank} />
    </>
  )
}
