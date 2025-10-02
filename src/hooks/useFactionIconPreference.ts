import { useEffect, useState } from 'react'

import { RULES_TABLE_FACTION_ICONS_EVENT, RULES_TABLE_SHOW_FACTION_ICONS_KEY } from '../lib/constants'

const DEFAULT_FACTION_ICONS_PREF = true

function readFactionIconsPref(): boolean {
  if (typeof window === 'undefined') return DEFAULT_FACTION_ICONS_PREF
  try {
    return localStorage.getItem(RULES_TABLE_SHOW_FACTION_ICONS_KEY) !== 'false'
  } catch {
    return DEFAULT_FACTION_ICONS_PREF
  }
}

/**
 * Shared hook that exposes the current "Factions as icons" preference.
 *
 * - Seeds from localStorage so initial renders match the preview toggle.
 * - Listens for both the custom preview event and storage updates so the value stays in sync.
 */
export function useFactionIconPreference(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => readFactionIconsPref())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleCustom = (event: Event) => {
      if (event instanceof CustomEvent) {
        const detail = event.detail as { value?: unknown } | undefined
        if (detail && typeof detail.value === 'boolean') {
          setEnabled(detail.value)
          return
        }
      }
      setEnabled(readFactionIconsPref())
    }

    const handleStorage = () => {
      setEnabled(readFactionIconsPref())
    }

    window.addEventListener(RULES_TABLE_FACTION_ICONS_EVENT, handleCustom as EventListener)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener(RULES_TABLE_FACTION_ICONS_EVENT, handleCustom as EventListener)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  return enabled
}
