/**
 * StatLabel
 *
 * Single source of truth for rendering a stat/substat NAME on screen with its substat-colour tint.
 * The localized text comes from `statVariantI18nKey`; the colour is the contrast-adapted, flag-gated
 * stat colour from `useStatTextColor` — `undefined` when the master colour flag is off, so the name
 * inherits the surrounding theme colour (today's look).
 *
 * Use this wherever a stat name is shown as a React node — toggle buttons, selects, labels — so stat
 * names tint consistently with the substat chips.
 */
import { Box } from '@mui/material'
import { useI18n } from '../lib/i18n'
import { statVariantI18nKey } from '../lib/types'
import { useStatTextColor } from '../lib/statColorContext'

// `inControl` reads the control-scoped colour (buttons/selects); else the text-scoped colour.
export function StatLabel({ variant, inControl = false }: { variant: number; inControl?: boolean }) {
  const { t } = useI18n()
  const color = useStatTextColor(variant, inControl)
  // color undefined ⇒ omit the sx colour so the name inherits the theme text colour.
  return (
    <Box component="span" sx={color ? { color } : undefined}>
      {t(statVariantI18nKey(variant))}
    </Box>
  )
}
