/**
 * useSubstatColors
 *
 * Why: Encapsulate defaulting and persistence of the substat color map. This
 * keeps App.tsx lighter without changing behavior.
 */
import { useEffect, useState } from 'react'
import { COLORS_STORAGE_KEY_V6 } from '../lib/constants'
import { StatVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT } from '../lib/types'

type ColorMap = Record<number, { fg: string; bg: string }>

const DEFAULT_ALPHA_HEX = Math.round(0.25 * 255).toString(16).padStart(2, '0').toUpperCase()

export function defaultSubstatColorMapV6(): ColorMap {
  const base: ColorMap = {}
  for (const vk of [
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.SPD, StatVariant.RES, StatVariant.ACC, StatVariant.CR, StatVariant.CDMG,
  ]) {
    base[vk] = {
      fg: DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9',
      bg: (() => {
        const raw = DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD'
        const upper = raw.toUpperCase()
        if (/^#[0-9A-F]{6}$/.test(upper)) return `${upper}${DEFAULT_ALPHA_HEX}`
        if (/^#[0-9A-F]{8}$/.test(upper)) return upper
        return `#E3F2FD${DEFAULT_ALPHA_HEX}`
      })(),
    }
  }
  return base
}

export function useSubstatColors(): [ColorMap, React.Dispatch<React.SetStateAction<ColorMap>>] {
  const [substatColors, setSubstatColors] = useState<ColorMap>(() => {
    try {
      const raw = localStorage.getItem(COLORS_STORAGE_KEY_V6)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return { ...defaultSubstatColorMapV6(), ...parsed }
      }
      return defaultSubstatColorMapV6()
    } catch {
      return defaultSubstatColorMapV6()
    }
  })
  useEffect(() => {
    try { localStorage.setItem(COLORS_STORAGE_KEY_V6, JSON.stringify(substatColors)) } catch {}
  }, [substatColors])
  return [substatColors, setSubstatColors]
}
