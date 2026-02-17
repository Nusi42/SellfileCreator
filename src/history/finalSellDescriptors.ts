// finalSellDescriptors keeps final-sell history data-only until render.
import type { HistoryEntryDescriptor, ResolvedHistoryEntryDescriptor } from './historyDescriptorTypes'
import {
  FINAL_SELL_LEVEL_CHOICES,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  type FinalSellLevel,
  type FinalSellRemainderConfig,
  type FinalSellSetsMode,
} from '../lib/logicHub'
import type { TranslateFn } from './builderUpdateDescriptor'
import type { FinalSellDescriptorMode } from './historyDescriptorTypes'
import { snapshotFinalSellRemainder } from './historySnapshotUtils'

export type { FinalSellDescriptorMode }

const LEVEL_ORDER: FinalSellLevel[] = FINAL_SELL_LEVEL_CHOICES.map(({ key }) => key)
const LEVEL_LABELS = FINAL_SELL_LEVEL_CHOICES.reduce<Record<FinalSellLevel, string>>((acc, { key, label }) => {
  acc[key] = label
  return acc
}, {} as Record<FinalSellLevel, string>)

// createFinalSellChangeDescriptor snapshots final-sell edits for history.
export const createFinalSellChangeDescriptor = (params: {
  previous: FinalSellRemainderConfig
  next: FinalSellRemainderConfig
  mode?: FinalSellDescriptorMode
}): HistoryEntryDescriptor | null => {
  const { previous, next, mode } = params
  const changed = !areFinalSellSettingsEqual(previous, next)
  if (!changed && mode !== 'quickToggle') return null
  if (!changed && mode === 'quickToggle') {
    const prevActive = isFinalSellActive(previous)
    const nextActive = isFinalSellActive(next)
    if (prevActive === nextActive) return null
  }
  return {
    kind: 'finalSellChange',
    previous: snapshotFinalSellRemainder(previous),
    next: snapshotFinalSellRemainder(next),
    ...(mode ? { mode } : {}),
  }
}

export function isFinalSellActive(recipe: FinalSellRemainderConfig): boolean {
  const hasTypes = Boolean(recipe.artifacts || recipe.accessories)
  const levels = normalizeLevels(recipe.levels)
  return hasTypes && levels.length > 0
}

export function areFinalSellSettingsEqual(
  a: FinalSellRemainderConfig,
  b: FinalSellRemainderConfig,
): boolean {
  if (a.artifacts !== b.artifacts) return false
  if (a.accessories !== b.accessories) return false
  if (a.setsMode !== b.setsMode) return false
  const normA = normalizeLevels(a.levels)
  const normB = normalizeLevels(b.levels)
  if (normA.length !== normB.length) return false
  for (let i = 0; i < normA.length; i += 1) {
    if (normA[i] !== normB[i]) return false
  }
  return true
}

// describeFinalSellChange localizes a final-sell change at render time.
export function describeFinalSellChange(params: {
  previous: FinalSellRemainderConfig
  next: FinalSellRemainderConfig
  mode?: FinalSellDescriptorMode
  t: TranslateFn
}): ResolvedHistoryEntryDescriptor | null {
  const { previous, next, mode: maybeMode, t } = params
  const mode: FinalSellDescriptorMode = maybeMode ?? 'edit'
  const typesChanged = previous.artifacts !== next.artifacts || previous.accessories !== next.accessories
  const levelsChanged = !levelsEqual(previous.levels, next.levels)
  const setsModeChanged = sanitizeSetsMode(previous.setsMode) !== sanitizeSetsMode(next.setsMode)
  if (!typesChanged && !levelsChanged && !setsModeChanged) {
    if (mode === 'quickToggle') {
      const prevActive = isFinalSellActive(previous)
      const nextActive = isFinalSellActive(next)
      if (prevActive !== nextActive) {
        const titleKey = nextActive ? 'historyFinalSellQuickEnabledTitle' : 'historyFinalSellQuickDisabledTitle'
        return { title: t(titleKey) }
      }
    }
    return null
  }

  const prevActive = isFinalSellActive(previous)
  const nextActive = isFinalSellActive(next)

  let titleKey: string
  if (mode === 'reset') {
    titleKey = 'historyFinalSellResetTitle'
  } else if (mode === 'import') {
    titleKey = 'historyFinalSellImportedTitle'
  } else if (mode === 'quickToggle') {
    if (!prevActive && nextActive) titleKey = 'historyFinalSellQuickEnabledTitle'
    else if (prevActive && !nextActive) titleKey = 'historyFinalSellQuickDisabledTitle'
    else titleKey = 'historyFinalSellUpdatedTitle'
  } else {
    titleKey = 'historyFinalSellUpdatedTitle'
  }

  const detailLines: string[] = []
  if (mode === 'reset') {
    detailLines.push(t('historyFinalSellResetLine'))
  }
  if (typesChanged || mode === 'reset' || mode === 'import') {
    detailLines.push(t('historyDiffLine', {
      label: t('historyFinalSellTypesLabel'),
      previous: formatTypes(previous, t),
      next: formatTypes(next, t),
    }))
  }
  if (levelsChanged || mode === 'reset' || mode === 'import') {
    detailLines.push(t('historyDiffLine', {
      label: t('historyFinalSellLevelsLabel'),
      previous: formatLevels(previous.levels, t),
      next: formatLevels(next.levels, t),
    }))
  }
  if (setsModeChanged || mode === 'reset' || mode === 'import') {
    detailLines.push(t('historyDiffLine', {
      label: t('historyFinalSellSetsModeLabel'),
      previous: formatSetsMode(previous.setsMode, t, prevActive),
      next: formatSetsMode(next.setsMode, t, nextActive),
    }))
  }

  if (detailLines.length === 0) {
    return { title: t(titleKey) }
  }
  return { title: t(titleKey), detailLines }
}

function sanitizeSetsMode(mode: FinalSellSetsMode | undefined): FinalSellSetsMode {
  if (mode === FINAL_SELL_SETS_MODE_EXPLICIT) return FINAL_SELL_SETS_MODE_EXPLICIT
  return FINAL_SELL_SETS_MODE_ANY
}

function normalizeLevels(levels: readonly FinalSellLevel[] | undefined): FinalSellLevel[] {
  if (!Array.isArray(levels)) return []
  const seen = new Set<FinalSellLevel>()
  for (const lvl of levels) {
    if (LEVEL_ORDER.includes(lvl as FinalSellLevel)) {
      seen.add(lvl as FinalSellLevel)
    }
  }
  return LEVEL_ORDER.filter((lvl) => seen.has(lvl))
}

function levelsEqual(
  a: readonly FinalSellLevel[] | undefined,
  b: readonly FinalSellLevel[] | undefined,
): boolean {
  const normA = normalizeLevels(a)
  const normB = normalizeLevels(b)
  if (normA.length !== normB.length) return false
  for (let i = 0; i < normA.length; i += 1) {
    if (normA[i] !== normB[i]) return false
  }
  return true
}

function formatTypes(recipe: FinalSellRemainderConfig, t: TranslateFn): string {
  const parts: string[] = []
  if (recipe.artifacts) parts.push(t('artifacts'))
  if (recipe.accessories) parts.push(t('accessories'))
  if (parts.length === 0) return t('historyValueEmpty')
  return parts.join(', ')
}

function formatLevels(levels: readonly FinalSellLevel[] | undefined, t: TranslateFn): string {
  const normalized = normalizeLevels(levels)
  if (normalized.length === 0) return t('historyValueEmpty')
  return normalized.map((lvl) => LEVEL_LABELS[lvl] ?? String(lvl)).join(', ')
}

function formatSetsMode(
  mode: FinalSellSetsMode | undefined,
  t: TranslateFn,
  active: boolean,
): string {
  if (!active) return t('historyFinalSellSetsModeOff')
  const sanitized = sanitizeSetsMode(mode)
  if (sanitized === FINAL_SELL_SETS_MODE_EXPLICIT) return t('finalSellSetsModeExplicit')
  return t('finalSellSetsModeAny')
}
