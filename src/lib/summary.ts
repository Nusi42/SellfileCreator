/**
 * summary.ts
 *
 * Produces a compact, human-readable summary string for a BuilderRecipe to
 * display in chips and lists.
 */
import type { BuilderRecipe } from './hsfBuilder'
import { formatRank, rarityCodeToName, factionCodeToName, labelOfVariant, artifactSetName } from './types'
import { RARITY_AUTO_LABEL } from './constants'
import type { Metaset } from './metasets'
import { splitArtifactSetSelections } from './gearSets/selection'

export function summaryOf(recipe: BuilderRecipe, metasets: Metaset[]): string {
  const parts: string[] = []
  const ellipsize = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const push = (label: string, value: string) => parts.push(`${label}:${ellipsize(value)}`)

  push('Act', recipe.keep ? 'Keep' : 'Sell')
  {
    const r = formatRank(recipe.rankCode)
    if (r) push('Rank', r)
  }
  {
    const rar = (recipe.rarityMode === 'auto') ? RARITY_AUTO_LABEL : rarityCodeToName(recipe.rarityCode)
    if (rar) push('Rar', rar)
  }
  if (recipe.factionCode && recipe.factionCode !== 0) push('Fac', factionCodeToName(recipe.factionCode))

  // Mainstats (variants)
  {
    const v = (recipe as (BuilderRecipe & { mainStatsV?: number[] })).mainStatsV ?? []
    if (v.length > 0) {
      const names = v.map(labelOfVariant).filter(Boolean as unknown as (x: string) => x is string)
      push('Main', names.join(','))
    } else {
      push('Main', 'Any')
    }
  }

  // Substats with fixed indicator (variants)
  {
    const sv = (recipe as (BuilderRecipe & { substatsV?: number[] })).substatsV ?? []
    const fv = (recipe as (BuilderRecipe & { fixedSubstatsV?: number[] })).fixedSubstatsV ?? []
    if (sv.length > 0) {
      const fixedSet = new Set<number>(fv as number[])
      const names = sv.map((v) => `${labelOfVariant(v)}${fixedSet.has(v as number) ? '🔒' : ''}`)
      push('Subs', names.join(','))
    } else {
      push('Subs', 'Any')
    }
  }

  // Per-substat roll bounds summary (variant-keyed)
  if (recipe.substatRollBoundsV && Object.keys(recipe.substatRollBoundsV).length > 0) {
    const tags: string[] = []
    for (const [vk, v] of Object.entries(recipe.substatRollBoundsV)) {
      const n = labelOfVariant(Number(vk))
      const min = typeof v.min === 'number' ? Math.max(0, Math.min(5, Math.floor(v.min))) : undefined
      const max = typeof v.max === 'number' ? Math.max(0, Math.min(4, Math.floor(v.max))) : undefined
      let t = ''
      if (min !== undefined && max !== undefined && min === max) t = `${n}=${min}r`
      else if (max === 0 && (min === undefined || min === 0)) t = `${n}=0r`
      else if (min !== undefined) t = `${n}≥${min}r`
      else if (max !== undefined) t = `${n}≤${max}r`
      if (t) tags.push(t)
    }
    if (tags.length) push('Rolls', tags.join(','))
  }

  // Sets and Metasets
  // Render includes normally and exclusions with a simple "not" prefix.
  const setSelection = splitArtifactSetSelections(recipe.artifactSets)
  // Explicit includes map to readable names.
  const setNames = setSelection.included.map(artifactSetName)
  // Explicit excludes are prefixed so intent is obvious.
  const excludedNames = setSelection.excluded.map((id) => `not ${artifactSetName(id)}`)
  // Metaset labels are resolved against the active metaset list.
  const metaNames = (recipe.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id)
  // Build a single comma-separated list for compact chips.
  const setsJoined = [...metaNames, ...setNames, ...excludedNames].join(',')
  if (setsJoined) push('Sets', setsJoined)

  return parts.join(' | ')
}
