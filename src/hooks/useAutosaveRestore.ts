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
  IncludeAllExplicitMeta?: boolean
  SelectedConfigIndex?: number
  Note?: string
}

export function useAutosaveRestore(opts: {
  key: string
  version: string
  metasets: Metaset[]
  minima: MinimaTable
  configs: BuilderConfig[]
  includeAllExplicitMeta: boolean
  selectedConfigIndex: number | null
  note: string | null
}) {
  const { key, version, metasets, minima, configs, includeAllExplicitMeta, selectedConfigIndex, note } = opts

  const [restoreDlgOpen, setRestoreDlgOpen] = useState(false)
  const [restoreDraft, setRestoreDraft] = useState<RestoreDraft | null>(null)
  const [enabled, setEnabled] = useState(false)
  const dismissBaselineRef = useRef<string | null>(null)

  // Snapshot of current state used for divergence detection
  const snapshot = useMemo(() => {
    const base = {
      Version: version,
      Metasets: metasets,
      Minima: minima,
      Configs: configs,
      IncludeAllExplicitMeta: includeAllExplicitMeta,
      ...(selectedConfigIndex != null ? { SelectedConfigIndex: selectedConfigIndex } : {}),
      ...(note && note.trim() ? { Note: note } : {}),
    }
    return JSON.stringify(base)
  }, [version, metasets, minima, configs, includeAllExplicitMeta, selectedConfigIndex, note])

  // On mount: try loading autosave and decide whether to prompt
  useEffect(() => {
    try {
      const entry = loadAutosave<unknown>(key)
      if (entry && configs.length === 0) {
        const parsed = parseHsfrObject(entry.payload as unknown, { metasets, minima, includeAllExplicitMeta })
        const cfgs = parsed.cfgs
        const savedMetasets = parsed.metasets
        const savedMinima = parsed.minima
        const savedIncludeAll = parsed.includeAllExplicitMeta
        const normMetas = (mets?: unknown[]) => {
          if (!mets) return '[]'
          const setIdByName = new Map<string, number>(Object.entries(artifactSetNames).map(([k, v]) => [v, Number(k)]))
          const copy = mets.map((m: unknown) => {
            const mRec = m as Record<string, unknown>
            const names: unknown[] = Array.isArray(mRec['setNames']) ? (mRec['setNames'] as unknown[]) : []
            const sets: number[] = Array.isArray(mRec['sets']) ? (mRec['sets'] as number[]) : names.map(n => setIdByName.get(String(n))).filter((x): x is number => typeof x === 'number')
            return ({ id: String(mRec['id']), name: String(mRec['name']), sets: [...sets].sort((a,b)=>a-b) })
          })
          copy.sort((a,b) => String(a.id).localeCompare(String(b.id)))
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
        const metasetsMatchDefaults = normMetas(savedMetasets) === normMetas(metasets)
        const minimaMatchDefaults = JSON.stringify(canonicalize(savedMinima)) === JSON.stringify(canonicalize(minima))
        const includeAllMatchesDefault = savedIncludeAll === includeAllExplicitMeta
        const notePresent = typeof parsed.note === 'string' && parsed.note.trim().length > 0
        const essentiallyDefault = cfgs.length === 0 && metasetsMatchDefaults && minimaMatchDefaults && includeAllMatchesDefault && !notePresent
        if (!essentiallyDefault) {
          setRestoreDraft({
            Version: String((entry.payload as Record<string, unknown>)['Version'] ?? ''),
            Metasets: savedMetasets,
            Minima: savedMinima,
            Configs: cfgs,
            IncludeAllExplicitMeta: savedIncludeAll,
            ...(parsed.selectedIndex != null ? { SelectedConfigIndex: parsed.selectedIndex } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
          })
          setRestoreDlgOpen(true)
          return
        }
      }
    } catch {}
    // No entry or not prompting: enable autosave immediately
    setEnabled(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After dismissing, enable autosave only after divergence from baseline
  useEffect(() => {
    if (enabled) return
    if (restoreDlgOpen) return
    if (!dismissBaselineRef.current) return
    try {
      if (snapshot !== dismissBaselineRef.current) setEnabled(true)
    } catch {}
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

