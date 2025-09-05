/**
 * useSubstatColors
 *
 * Why: Encapsulate defaulting and persistence of the substat color map. This
 * keeps App.tsx lighter without changing behavior.
 */
import { useEffect, useState } from 'react'
import { COLORS_STORAGE_KEY_V5 } from '../lib/constants'
import { StatVariant, DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT, DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT } from '../lib/types'

type ColorMap = Record<number, { fg: string; bg: string }>

export function defaultSubstatColorMapV5(): ColorMap {
  const base: ColorMap = {}
  for (const vk of [
    StatVariant.HP, StatVariant.HP_FLAT,
    StatVariant.ATK, StatVariant.ATK_FLAT,
    StatVariant.DEF, StatVariant.DEF_FLAT,
    StatVariant.SPD, StatVariant.RES, StatVariant.ACC, StatVariant.CR, StatVariant.CDMG,
  ]) {
    base[vk] = {
      fg: DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[vk] ?? '#90CAF9',
      bg: DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT[vk] ?? '#E3F2FD',
    }
  }
  return base
}

export function useSubstatColors(): [ColorMap, React.Dispatch<React.SetStateAction<ColorMap>>] {
  const [substatColors, setSubstatColors] = useState<ColorMap>(() => {
    try {
      const raw = localStorage.getItem(COLORS_STORAGE_KEY_V5)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') return { ...defaultSubstatColorMapV5(), ...parsed }
      }
      return defaultSubstatColorMapV5()
    } catch {
      return defaultSubstatColorMapV5()
    }
  })
  useEffect(() => {
    try { localStorage.setItem(COLORS_STORAGE_KEY_V5, JSON.stringify(substatColors)) } catch {}
  }, [substatColors])
  return [substatColors, setSubstatColors]
}
