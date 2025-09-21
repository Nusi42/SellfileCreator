/**
 * useAutosaveRestore
 *
 * Encapsulates autosave restore prompt and enablement logic. Keeps the
 * previous autosave intact until the user either restores it or makes a
 * change after dismissing. Exposes dialog state and whether autosave is
 * currently enabled.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadAutosave } from '../lib/autosave'
import { parseHsfrObject } from '../lib/hsfrIO'
import { artifactSetNames } from '../lib/types'
import type { MinimaTable, BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'

export type RestoreDraft = {
  Version?: string
  Metasets?: Metaset[]
  Minima?: MinimaTable
  Configs?: BuilderConfig[]
  FinalSellRemainder?: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
  SelectedConfigIndex?: number
  Note?: string
}

type InitialAutosaveState = {
  restoreDlgOpen: boolean
  restoreDraft: RestoreDraft | null
  enabled: boolean
}

function computeInitialAutosaveState(args: {
  key: string
  metasets: Metaset[]
  minima: MinimaTable
  configs: BuilderConfig[]
  finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
  note: string | null
}): InitialAutosaveState {
  try {
    const entry = loadAutosave<unknown>(args.key)
    if (entry && args.configs.length === 0) {
      const parsed = parseHsfrObject(entry.payload as unknown, { metasets: args.metasets, minima: args.minima })
      const cfgs = parsed.cfgs
      const savedMetasets = parsed.metasets
      const savedMinima = parsed.minima
      const savedFinalSell = parsed.finalSellRemainder
      const normMetas = (mets?: unknown[]): string => {
        if (!mets) return '[]'
        const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))
        const copy = mets.map((m: unknown) => {
          const mRec = m as Record<string, unknown>
          const name = String(mRec['name'])
          const names: unknown[] = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
          const sets: number[] = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names
            .map(n => setIdByName.get(String(n)))
            .filter((x): x is number => typeof x === 'number')
          return ({ name, sets: [...sets].sort((a, b) => a - b) })
        })
        copy.sort((a, b) => {
          const n = String(a.name).localeCompare(String(b.name))
          if (n !== 0) return n
          const as = JSON.stringify(a.sets)
          const bs = JSON.stringify(b.sets)
          return as.localeCompare(bs)
        })
        return JSON.stringify(copy)
      }
      const canonicalize = (x: unknown): unknown => {
        if (Array.isArray(x)) return x.map(canonicalize)
        if (x && typeof x === 'object') {
          const keys = Object.keys(x).sort()
          const out: Record<string, unknown> = {}
          for (const k of keys) out[k] = canonicalize((x as Record<string, unknown>)[k])
          return out
        }
        return x
      }
      const metasetsMatchDefaults = normMetas(savedMetasets) === normMetas(args.metasets)
      const minimaMatchDefaults = JSON.stringify(canonicalize(savedMinima)) === JSON.stringify(canonicalize(args.minima))
      const finalSellMatches = JSON.stringify(savedFinalSell ?? {}) === JSON.stringify(args.finalSellRemainder ?? {})
      const notePresent = typeof parsed.note === 'string' && parsed.note.trim().length > 0
      const essentiallyDefault = cfgs.length === 0 && metasetsMatchDefaults && minimaMatchDefaults && finalSellMatches && !notePresent
      if (!essentiallyDefault) {
        const payload = entry.payload as Record<string, unknown>
        return {
          restoreDlgOpen: true,
          restoreDraft: {
            Version: String(payload['Version'] ?? ''),
            Metasets: savedMetasets,
            Minima: savedMinima,
            Configs: cfgs,
            ...(savedFinalSell ? { FinalSellRemainder: savedFinalSell } : {}),
            ...(parsed.selectedIndex != null ? { SelectedConfigIndex: parsed.selectedIndex } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
          },
          enabled: false,
        }
      }
    }
  } catch {}
  return { restoreDlgOpen: false, restoreDraft: null, enabled: true }
}

export function useAutosaveRestore(opts: {
  key: string
  version: string
  metasets: Metaset[]
  minima: MinimaTable
  configs: BuilderConfig[]
  finalSellRemainder: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
  selectedConfigIndex: number | null
  note: string | null
}) {
  const { key, version, metasets, minima, configs, finalSellRemainder, selectedConfigIndex: _selectedConfigIndex, note } = opts

  const initialAutosaveStateRef = useRef<InitialAutosaveState | null>(null)
  if (initialAutosaveStateRef.current === null) {
    initialAutosaveStateRef.current = computeInitialAutosaveState({ key, metasets, minima, configs, finalSellRemainder, note })
  }
  const { restoreDlgOpen: initialRestoreDlgOpen, restoreDraft: initialRestoreDraft, enabled: initialEnabled } = initialAutosaveStateRef.current
  const [restoreDlgOpen, setRestoreDlgOpen] = useState(initialRestoreDlgOpen)
  const [restoreDraft, setRestoreDraft] = useState<RestoreDraft | null>(initialRestoreDraft)
  const [enabled, setEnabled] = useState(initialEnabled)
  const dismissBaselineRef = useRef<string | null>(null)

  // Snapshot of current state used for divergence detection
  const snapshot = useMemo(() => {
    // Selection changes should not enable autosave by themselves.
    // Exclude SelectedConfigIndex from the divergence snapshot.
    const base = {
      Version: version,
      Metasets: metasets,
      Minima: minima,
      Configs: configs,
      FinalSellRemainder: finalSellRemainder,
      ...(note && note.trim() ? { Note: note } : {}),
    }
    return JSON.stringify(base)
  }, [version, metasets, minima, configs, finalSellRemainder, note])

  // After dismissing, enable autosave only after divergence from baseline
  useEffect(() => {
    const baseline = dismissBaselineRef.current
    const canEnable = !enabled && !restoreDlgOpen && baseline !== null
    canEnable && (() => {
      try { snapshot !== baseline && setEnabled(true) } catch {}
    })()
  }, [enabled, restoreDlgOpen, snapshot])

  const dismiss = () => {
    setRestoreDlgOpen(false)
    try { dismissBaselineRef.current = snapshot } catch { dismissBaselineRef.current = null }
    // Keep previous autosave intact by not enabling here
  }

  const accept = () => {
    setRestoreDlgOpen(false)
    setEnabled(true)
    setRestoreDraft(null)
  }

  return { restoreDlgOpen, restoreDraft, dismissRestore: dismiss, acceptRestore: accept, autosaveEnabled: enabled }
}
