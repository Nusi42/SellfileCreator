import type { BuilderRecipe } from './hsfBuilder'

// Encapsulates all builder behaviors for Global Min Required Rolls (GMRR) and
// Locked Min Required Rolls (LMRR) so the UI, multi-edit draft, and HSFC
// normalization share a single source of truth.

export type AggregateRollValue = 0 | 1 | 2 | 3 | 4 | 5

export interface AggregateRollState {
  auto: boolean
  manual: AggregateRollValue
  locked: AggregateRollValue
}

export type AggregateRollAction =
  | { type: 'set-auto' }
  | { type: 'toggle-manual'; value: AggregateRollValue }
  | { type: 'toggle-lock'; value: AggregateRollValue }

export const clampAggregateRollValue = (value: unknown): AggregateRollValue => {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return 0
  const rounded = Math.round(num)
  const clamped = Math.max(0, Math.min(5, rounded)) as AggregateRollValue
  return clamped
}

export const aggregateRollStateFromRecipe = (
  recipe: Pick<BuilderRecipe, 'autoMinRequiredRolls' | 'minRequiredRolls' | 'lockedMinRequiredRolls'>,
): AggregateRollState => {
  return normalizeAggregateRollState({
    auto: recipe.autoMinRequiredRolls !== false,
    manual: clampAggregateRollValue(recipe.minRequiredRolls ?? 0),
    locked: clampAggregateRollValue(recipe.lockedMinRequiredRolls ?? 0),
  })
}

export const aggregateRollStateToRecipe = (
  state: AggregateRollState,
): Pick<BuilderRecipe, 'autoMinRequiredRolls' | 'minRequiredRolls' | 'lockedMinRequiredRolls'> => {
  if (state.auto) {
    return {
      autoMinRequiredRolls: true,
      minRequiredRolls: 0,
      lockedMinRequiredRolls: 0,
    }
  }
  return {
    autoMinRequiredRolls: false,
    minRequiredRolls: state.manual,
    lockedMinRequiredRolls: state.locked,
  }
}

export const normalizeAggregateRollState = (state: AggregateRollState): AggregateRollState => {
  if (state.auto) {
    return { auto: true, manual: 0, locked: 0 }
  }
  const manual = clampAggregateRollValue(state.manual)
  const locked = clampAggregateRollValue(state.locked)
  if (locked === 0) {
    return { auto: false, manual, locked: 0 }
  }
  if (manual > 0 && manual <= locked) {
    return { auto: false, manual: 0, locked }
  }
  return { auto: false, manual, locked }
}

export const applyAggregateRollAction = (state: AggregateRollState, action: AggregateRollAction): AggregateRollState => {
  switch (action.type) {
    case 'set-auto':
      return { auto: true, manual: 0, locked: 0 }
    case 'toggle-manual': {
      if (!state.auto && state.manual === action.value) {
        if (state.locked > 0) {
          return { auto: false, manual: 0, locked: state.locked }
        }
        return { auto: true, manual: 0, locked: 0 }
      }
      const nextLocked = (state.locked > 0 && action.value <= state.locked) ? 0 : state.locked
      return normalizeAggregateRollState({ auto: false, manual: action.value, locked: nextLocked })
    }
    case 'toggle-lock': {
      if (state.locked === action.value) {
        const nextManual = (!state.auto && state.manual === 0) ? action.value : state.manual
        return normalizeAggregateRollState({ auto: state.auto, manual: nextManual, locked: 0 })
      }
      const manualExceedsLock = state.manual > 0 && state.manual <= action.value
      return normalizeAggregateRollState({
        auto: false,
        manual: manualExceedsLock ? 0 : state.manual,
        locked: action.value,
      })
    }
    default:
      return normalizeAggregateRollState(state)
  }
}
