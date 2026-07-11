/**
 * BuilderPanel constants and helpers
 *
 * Centralizes the statically defined layout numbers and shared helpers so the
 * main BuilderPanel stays focused on state management.
 */
import {
  CLEAR_ICON_BUTTON_SIZE_PX,
  FONT_SIZE_SECONDARY_PX,
  MENU_CONTROL_HEIGHT_PX,
  MENU_LABEL_WIDTH_PX,
  ROLL_BADGE_HOVER_GUTTER_PX,
  ROLL_BADGE_SCALE,
  ROLL_BADGE_SIZE_PX,
  SUBSTAT_TARGET_MAX_ROLLS,
} from '../../lib/constants'
import {
  rollLevelsForRarityCode,
  rarityIncludesMythical,
  resolveAutoRarityCode,
  type BuilderRecipe,
} from '../../lib/hsfBuilder'
import { deriveRollBaselineMode } from '../../lib/recipeNormalization'
import { LEVEL_MILESTONES, type LevelMilestone } from '../../lib/types'
import type { Theme } from '@mui/material/styles'
import { resolveDisabledOpacity } from '../disabledOpacity'

export const LOCK_TOGGLE_HIT_SIZE_PX = ROLL_BADGE_SIZE_PX + (ROLL_BADGE_HOVER_GUTTER_PX * 2)

// Overlay for builder control sections while the draft is a SEPARATOR: controls stay
// mounted at factory defaults so the panel layout never jumps when switching chips,
// but they are non-interactive and dimmed like disabled MUI controls. Shared by the
// recipe AND safeguard builders (one separator UX).
export const separatorDisabledSectionSx = (theme: Theme) => ({
  pointerEvents: 'none' as const,
  opacity: resolveDisabledOpacity(theme),
})

// Sentinels mirror the original BuilderPanel state to avoid diverging resets.
export const MULTI_VALUE_SENTINEL = '__multi__mixed__'
export const MIN_REQUIRED_ROLL_OPTIONS = [0, 1, 2, 3, 4, 5] as const
export const REQUIRED_SUBSTAT_MIN_OPTIONS = [1, 2, 3, 4] as const
export const EMPTY_SELECTION: readonly number[] = []

// Normalize rank milestones while guarding against malformed persisted values.
export const normalizeLevelMilestone = (value: number | null | undefined): LevelMilestone => {
  if (value != null && LEVEL_MILESTONES.includes(value as LevelMilestone)) {
    return value as LevelMilestone
  }
  return LEVEL_MILESTONES[0]!
}

// Shared roll-budget helper so substat target fallbacks stay consistent.
export const computeRollBudgetForRecipe = (recipe: BuilderRecipe): number => {
  const rarityCode = (recipe.rarityMode === 'auto') ? resolveAutoRarityCode(recipe) : recipe.rarityCode
  const rollLevels = Array.from(rollLevelsForRarityCode(rarityCode)).sort((a, b) => a - b)
  const baselineMode = deriveRollBaselineMode(recipe)
  const minLevel = normalizeLevelMilestone(recipe.minLevel)
  const maxLevel = normalizeLevelMilestone(recipe.maxLevel)
  const windowMin = Math.min(minLevel, maxLevel)
  const windowMax = Math.max(minLevel, maxLevel)
  const preRolls = rarityIncludesMythical(rarityCode) ? 1 : 0
  const countUpTo = (limit: number) => {
    let total = 0
    for (const lvl of rollLevels) {
      if (lvl <= limit) total += 1
    }
    return total
  }
  let maxRolls: number
  if (baselineMode === 'upToLevel') {
    maxRolls = countUpTo(windowMax) + preRolls
  } else {
    maxRolls = Math.max(0, countUpTo(windowMax) - countUpTo(windowMin))
    if (windowMin <= 0) {
      maxRolls += preRolls
    }
  }
  const hardCap = rarityIncludesMythical(rarityCode) ? 5 : 4
  return Math.max(0, Math.min(maxRolls, hardCap))
}

// Layout numbers for the substat menu live here to keep BuilderPanel lean.
export const SUBSTAT_MENU_ROLL_COLUMNS = 7 as const
export const SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX = Math.round(ROLL_BADGE_SIZE_PX * ROLL_BADGE_SCALE)
export const SUBSTAT_MENU_ROLL_GAP_PX = 12 as const
export const SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX = (SUBSTAT_MENU_ROLL_COLUMNS * SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX)
  + ((SUBSTAT_MENU_ROLL_COLUMNS - 1) * SUBSTAT_MENU_ROLL_GAP_PX)
export const SUBSTAT_MENU_VALUE_COLUMN_WIDTH_PX = 176 as const
export const SUBSTAT_MENU_COLUMN_GAP_PX = 16 as const
export const SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX = 72 as const
export const SUBSTAT_MENU_EXPECTATION_INPUT_HEIGHT_PX = 32 as const
export const SUBSTAT_MENU_TARGET_INPUT_COUNT = SUBSTAT_TARGET_MAX_ROLLS + 1
export const SUBSTAT_MENU_EXPECTATION_COLUMN_GAP_PX = 8 as const
export const SUBSTAT_MENU_EXPECTATION_SECTION_MIN_WIDTH_PX = (SUBSTAT_MENU_TARGET_INPUT_COUNT * SUBSTAT_MENU_EXPECTATION_INPUT_WIDTH_PX)
  + (SUBSTAT_MENU_EXPECTATION_COLUMN_GAP_PX * SUBSTAT_MENU_TARGET_INPUT_COUNT)
  + CLEAR_ICON_BUTTON_SIZE_PX
  + SUBSTAT_MENU_EXPECTATION_COLUMN_GAP_PX
export const SUBSTAT_MENU_ROW_HORIZONTAL_PADDING_PX = 16 as const
export const SUBSTAT_MENU_SECTION_GAP_PX = 12 as const
export const SUBSTAT_MENU_WIDTH_PX = MENU_LABEL_WIDTH_PX
  + Math.max(
    SUBSTAT_MENU_EXPECTATION_SECTION_MIN_WIDTH_PX,
    SUBSTAT_MENU_ROLL_GROUP_WIDTH_PX + SUBSTAT_MENU_VALUE_COLUMN_WIDTH_PX,
  )
  + SUBSTAT_MENU_SECTION_GAP_PX
  + (SUBSTAT_MENU_ROW_HORIZONTAL_PADDING_PX * 2)
export const SUBSTAT_MENU_ROLL_FONT_SIZE_PX = Math.round(FONT_SIZE_SECONDARY_PX * ROLL_BADGE_SCALE)
export const SUBSTAT_MENU_VALUE_PILL_MIN_HEIGHT_PX = 28 as const
export const LOCK_MENU_BUTTON_WIDTH_PX = MENU_CONTROL_HEIGHT_PX + 4
export const LOCK_MENU_GAP_PX = (SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX + SUBSTAT_MENU_ROLL_GAP_PX) - LOCK_MENU_BUTTON_WIDTH_PX
export const LOCK_MENU_OFFSET_PX = (SUBSTAT_MENU_ROLL_BUTTON_WIDTH_PX - LOCK_MENU_BUTTON_WIDTH_PX) / 2
export const LOCK_MENU_BORDER_RADIUS_PX = 3
export const ROLL_ANY_STAR = '★' as const

export const MAX_RECIPE_INDEX_FOR_BUTTON_WIDTH = 999_999 as const
