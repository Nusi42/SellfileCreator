import type { SystemStyleObject } from '@mui/system'
import type { Theme } from '@mui/material/styles'
import {
  buildHighlightEffectSx,
  HIGHLIGHT_EFFECT_DURATION_MS,
  HIGHLIGHT_EFFECT_VARIANTS,
  pickHighlightEffect,
} from '../lib/attentionCatalog'

// Shared highlight effects used to gently draw attention to important controls.
// Why: this wrapper binds the catalog animations to button label/text selectors
// used within the components layer (Help dialog, Preview actions, etc.).
const TEXT_SELECTOR = '& .start-tutorial-text, & .highlight-target'
const LABEL_SELECTOR = '& .MuiButton-label, & .MuiButton-startIcon, & .MuiButton-endIcon'

export { HIGHLIGHT_EFFECT_DURATION_MS, HIGHLIGHT_EFFECT_VARIANTS, pickHighlightEffect }

export function getHighlightEffectSx(effectIdx: number | null): SystemStyleObject<Theme> {
  return (buildHighlightEffectSx(effectIdx, {
    textSelector: TEXT_SELECTOR,
    labelSelector: LABEL_SELECTOR,
  }) ?? {}) as SystemStyleObject<Theme>
}
