import type { BuilderConfig } from './hsfBuilder'
import { formatRank, rarityCodeToName, factionCodeToName, labelOfVariant, mainToVariant, statNameFromId, variantToSub, artifactSetName, type StatVariant } from './types'
import type { Metaset } from './metasets'

type ExtCfg = BuilderConfig & {
  mainStatVariants?: StatVariant[]
  substatVariants?: StatVariant[]
  fixedSubstatVariants?: StatVariant[]
}

export function summaryOf(cfg: BuilderConfig, metasets: Metaset[]): string {
  const parts: string[] = []
  const ellipsize = (s: string, max = 20) => (s.length <= max ? s : s.slice(0, max - 1) + '…')
  const push = (label: string, value: string) => parts.push(`${label}:${ellipsize(value)}`)

  push('Act', cfg.keep ? 'Keep' : 'Sell')
  {
    const r = formatRank(cfg.rankCode)
    if (r) push('Rank', r)
  }
  {
    const rar = rarityCodeToName(cfg.rarityCode)
    if (rar) push('Rar', rar)
  }
  if (cfg.factionCode && cfg.factionCode !== 0) push('Fac', factionCodeToName(cfg.factionCode))

  // Mainstats (prefer variants if present)
  {
    const vars: StatVariant[] | undefined = (cfg as ExtCfg).mainStatVariants
    if (Array.isArray(vars) && vars.length > 0) {
      const names = vars.map(v => labelOfVariant(v)).filter(Boolean)
      push('Main', names.join(','))
    } else if ((cfg.mainStats?.length ?? 0) > 0) {
      const names = (cfg.mainStats ?? []).map(m => labelOfVariant(mainToVariant(m.id, m.f))).filter(Boolean)
      push('Main', names.join(','))
    } else {
      push('Main', 'Any')
    }
  }

  // Substats with fixed indicator (prefer variants if present)
  {
    const subVars: StatVariant[] | undefined = (cfg as ExtCfg).substatVariants
    const fixedVars: StatVariant[] | undefined = (cfg as ExtCfg).fixedSubstatVariants
    if (Array.isArray(subVars) && subVars.length > 0) {
      const fixedSet = new Set((fixedVars ?? []).map(v => { const o = variantToSub(v); return `${o.id}:${Boolean(o.isFlat)}` }))
      const names = subVars.map(v => {
        const o = variantToSub(v)
        const lock = fixedSet.has(`${o.id}:${Boolean(o.isFlat)}`) ? '🔒' : ''
        return `${statNameFromId(o.id, o.isFlat)}${lock}`
      })
      push('Subs', names.join(','))
    } else if ((cfg.substats?.length ?? 0) > 0) {
      const fixedSet = new Set((cfg.fixedSubstats ?? []).map(s => `${s.id}:${Boolean(s.isFlat)}`))
      const names = (cfg.substats ?? []).map(s => `${statNameFromId(s.id, s.isFlat)}${fixedSet.has(`${s.id}:${Boolean(s.isFlat)}`) ? '🔒' : ''}`)
      push('Subs', names.join(','))
    } else {
      push('Subs', 'Any')
    }
  }

  // Per-substat roll bounds summary
  if (cfg.substatRollBounds && Object.keys(cfg.substatRollBounds).length > 0) {
    const tags: string[] = []
    for (const [k, v] of Object.entries(cfg.substatRollBounds)) {
      const [idStr, flatStr] = k.split(':')
      const id = Number(idStr)
      const isFlat = flatStr === 'true'
      const n = statNameFromId(id, isFlat)
      const min = typeof v.min === 'number' ? Math.max(0, Math.min(5, Math.floor(v.min))) : undefined
      const max = typeof v.max === 'number' ? Math.max(0, Math.min(5, Math.floor(v.max))) : undefined
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
  const setNames = (cfg.artifactSets ?? []).map(artifactSetName)
  const metaNames = (cfg.artifactMetaSets ?? []).map(id => metasets.find(m => m.id === id)?.name || id)
  const setsJoined = [...metaNames, ...setNames].join(',')
  if (setsJoined) push('Sets', setsJoined)

  return parts.join(' | ')
}
