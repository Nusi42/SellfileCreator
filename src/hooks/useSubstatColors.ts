/**
 * useSubstatColors
 *
 * Why: Encapsulate defaulting and persistence of the substat color map. This
 * keeps App.tsx lighter without changing behavior.
 */
import { useCallback, useState } from 'react'
import { COLORS_STORAGE_KEY_V6 } from '../lib/constants'
import {
  ANOMALOUS_SUBSTAT_VARIANTS,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  DEFAULT_SUBSTAT_COLORS_BG_BY_VARIANT,
  STAT_VARIANTS_PRIORITY,
} from '../lib/types'

type ColorMap = Record<number, { fg: string; bg: string }>

const DEFAULT_ALPHA_HEX = Math.round(0.25 * 255).toString(16).padStart(2, '0').toUpperCase()

export function defaultSubstatColorMapV6(): ColorMap {
  const base: ColorMap = {}
  // Classic substats plus the PROVISIONAL(anomalous) accessory-only ones — every
  // colorable variant gets a default entry so chips never render uncolored.
  for (const vk of [...STAT_VARIANTS_PRIORITY, ...ANOMALOUS_SUBSTAT_VARIANTS]) {
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

function persistColorMap(next: ColorMap): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(COLORS_STORAGE_KEY_V6, JSON.stringify(next))
  } catch {
    // ignore — persistence is best-effort
  }
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
  const setAndPersistSubstatColors = useCallback<React.Dispatch<React.SetStateAction<ColorMap>>>((value) => {
    setSubstatColors((prev) => {
      const next = typeof value === 'function' ? (value as (previous: ColorMap) => ColorMap)(prev) : value
      if (next === prev) return prev
      persistColorMap(next)
      return next
    })
  }, [])
  return [substatColors, setAndPersistSubstatColors]
}
