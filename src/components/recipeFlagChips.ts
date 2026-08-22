/**
 * recipeFlagChips.ts
 *
 * Presentation registry for the two behaviour-carrying recipe flags.
 *
 * The domain side of the flags lives in `lib/recipeFlags` (wire tokens, the Ore mapping,
 * the legacy transcode). What this module owns is the *display* triple every surface needs:
 * which glyph stands for a flag state, which i18n term names it, and how to read that state
 * off a recipe. Kept here rather than in `lib/recipeFlags` because it references `I18nKey`,
 * and the domain module must stay free of UI imports.
 *
 * Single definition, consumed by the recipe builder's Flags chip row AND by RecipeChip's
 * Keep/Sell badge — so a flag can never show one glyph in the panel and another on the chip.
 */
import type { BuilderRecipe } from '../lib/hsfBuilder'
import type { I18nKey } from '../lib/i18n'
import { isIgnoredBySafeguards, type RecipeFlagKey, type RecipeFlagValue } from '../lib/recipeFlags'
import {
  GLYPH_IGNORED_BY_SAFEGUARDS,
  GLYPH_REWORK_NOT_REWORKED,
  GLYPH_REWORK_REWORKED,
} from '../lib/constants'
import { REWORK_GATE_NOT_REWORKED, REWORK_GATE_REWORKED } from '../lib/generated/domainConstants'

/** One toggleable flag state, as the UI presents it. */
export interface RecipeFlagChipSpec {
  /** Stable id, used for React keys and for routing a toggle back to its writer. */
  id: 'ignoredBySafeguards' | 'reworked' | 'notReworked'
  /**
   * The recipe field this chip reads and writes. Both rework chips name `reworkGate`, which
   * is what makes them mutually exclusive. Carried here so no surface has to re-derive the
   * id→field mapping with its own ternary.
   */
  fieldKey: RecipeFlagKey
  /**
   * The value to WRITE when this chip is switched on; clearing always writes the absent-key
   * default, so a toggle needs nothing beyond this and `fieldKey`.
   */
  onValue: RecipeFlagValue<RecipeFlagKey>
  /** The single character shown on the chip and appended to the Keep/Sell badge. */
  glyph: string
  /** Term naming this state; also the tooltip title on the builder chip. */
  labelKey: I18nKey
  /** Explanatory body shown under the label in the builder chip's tooltip. */
  hintKey: I18nKey
  /** True when this recipe is currently in this state. */
  isOn: (recipe: BuilderRecipe) => boolean
}

/**
 * The three chip states, in the order both surfaces render them.
 *
 * `reworked` and `notReworked` read the same tri-state `reworkGate` field, so they are
 * mutually exclusive by construction — no exclusivity rule is needed anywhere.
 */
export const RECIPE_FLAG_CHIPS: readonly RecipeFlagChipSpec[] = [
  {
    id: 'ignoredBySafeguards',
    fieldKey: 'ignoredBySafeguards',
    onValue: true,
    glyph: GLYPH_IGNORED_BY_SAFEGUARDS,
    labelKey: 'builderIgnoredBySafeguards',
    hintKey: 'builderIgnoredBySafeguardsHint',
    // Read through the flag SSOT, so "absent means false" is decided in exactly one place.
    isOn: isIgnoredBySafeguards,
  },
  {
    id: 'reworked',
    fieldKey: 'reworkGate',
    onValue: REWORK_GATE_REWORKED,
    glyph: GLYPH_REWORK_REWORKED,
    labelKey: 'builderReworkReworked',
    hintKey: 'builderReworkReworkedHint',
    isOn: (recipe) => recipe.reworkGate === REWORK_GATE_REWORKED,
  },
  {
    id: 'notReworked',
    fieldKey: 'reworkGate',
    onValue: REWORK_GATE_NOT_REWORKED,
    glyph: GLYPH_REWORK_NOT_REWORKED,
    labelKey: 'builderReworkNotReworked',
    hintKey: 'builderReworkNotReworkedHint',
    isOn: (recipe) => recipe.reworkGate === REWORK_GATE_NOT_REWORKED,
  },
]

/** The chips a recipe currently has set, in registry order. Empty for most recipes. */
export const activeRecipeFlagChips = (recipe: BuilderRecipe): RecipeFlagChipSpec[] => (
  RECIPE_FLAG_CHIPS.filter((spec) => spec.isOn(recipe))
)
