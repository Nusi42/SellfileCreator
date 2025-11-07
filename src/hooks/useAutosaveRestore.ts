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
import { parseHsfcObject } from '../lib/hsfcIO'
import { normalizeMetasetIconId } from '../lib/metasetIcons'
import type { SubstatTargetTable, BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import type { RulesFilterState } from '../lib/rulesFilter'

export type RestoreDraft = {
  Version?: string
  Metasets?: Metaset[]
  substatTargets?: SubstatTargetTable
  Configs?: BuilderConfig[]
  FinalSellRemainder?: FinalSellRemainderConfig
  SelectedConfigIndex?: number
  Note?: string
  AutosaveSavedAt?: string
  Filters?: AutosaveFiltersState
}

export type AutosaveFiltersState = {
  open: boolean
  state: RulesFilterState
  collapsed: Record<string, boolean>
}

type InitialAutosaveState = {
  restoreDlgOpen: boolean
  restoreDraft: RestoreDraft | null
  enabled: boolean
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

export const metasetsSignature = (mets?: Metaset[] | null): string => {
  if (!mets || mets.length === 0) return '[]'
  const copy = mets.map((m) => ({
    name: m.name,
    sets: [...(m.sets ?? [])].sort((a, b) => a - b),
    iconId: normalizeMetasetIconId(m.iconId),
  }))
  copy.sort((a, b) => {
    const n = a.name.localeCompare(b.name)
    if (n !== 0) return n
    const as = JSON.stringify(a.sets)
    const bs = JSON.stringify(b.sets)
    return as.localeCompare(bs)
  })
  return JSON.stringify(copy)
}

export const substatTargetsSignature = (targets?: SubstatTargetTable | null): string => {
  if (!targets) return ''
  return JSON.stringify(canonicalize(targets))
}

export const filtersSignature = (filters: AutosaveFiltersState | null | undefined): string => {
  if (!filters) return ''
  return JSON.stringify({
    open: Boolean(filters.open),
    state: canonicalize(filters.state),
    collapsed: canonicalize(filters.collapsed),
  })
}

export const finalSellSignature = (fsr?: FinalSellRemainderConfig | null): string => {
  if (!fsr) return ''
  return JSON.stringify(canonicalize(fsr))
}

function computeInitialAutosaveState(args: {
  key: string
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  configs: BuilderConfig[]
  finalSellRemainder: FinalSellRemainderConfig
  note: string | null
  filters: AutosaveFiltersState
}): InitialAutosaveState {
  try {
    const entry = loadAutosave<unknown>(args.key)
    if (entry && args.configs.length === 0) {
      const parsed = parseHsfcObject(entry.payload as unknown, { metasets: args.metasets, substatTargets: args.substatTargets })
      const cfgs = parsed.cfgs
      const savedMetasets = parsed.metasets
      const savedSubstatTargets = parsed.substatTargets
      const savedFinalSell = parsed.finalSellRemainder
      const metasetsMatchDefaults = metasetsSignature(savedMetasets as Metaset[]) === metasetsSignature(args.metasets)
      // Compare canonicalized copies so reordering the variant keys (common when
      // editing via the dialog) does not trick autosave into thinking the
      // session diverged.
      const substatTargetsMatchDefaults = substatTargetsSignature(savedSubstatTargets) === substatTargetsSignature(args.substatTargets)
      const finalSellMatches = finalSellSignature(savedFinalSell) === finalSellSignature(args.finalSellRemainder)
      const savedFiltersRaw = (entry.payload && typeof entry.payload === 'object') ? (entry.payload as Record<string, unknown>)['Filters'] : null
      const savedFilters: AutosaveFiltersState | null = (() => {
        if (!savedFiltersRaw || typeof savedFiltersRaw !== 'object') return null
        const rec = savedFiltersRaw as Record<string, unknown>
        const collapsed = ((): Record<string, boolean> => {
          const raw = rec['collapsed']
          if (!raw || typeof raw !== 'object') return {}
          const out: Record<string, boolean> = {}
          for (const [key, value] of Object.entries(raw)) {
            out[String(key)] = Boolean(value)
          }
          return out
        })()
        const state = ((): RulesFilterState | null => {
          const rawState = rec['state']
          if (!rawState || typeof rawState !== 'object') return null
          return rawState as RulesFilterState
        })()
        if (!state) return null
        return {
          open: rec['open'] === true,
          state,
          collapsed,
        }
      })()
      const filtersMatchDefaults = filtersSignature(savedFilters) === filtersSignature(args.filters)
      const notePresent = typeof parsed.note === 'string' && parsed.note.trim().length > 0
      const essentiallyDefault = cfgs.length === 0
        && metasetsMatchDefaults
        && substatTargetsMatchDefaults
        && finalSellMatches
        && !notePresent
        && filtersMatchDefaults
      if (!essentiallyDefault) {
        const payload = entry.payload as Record<string, unknown>
        const savedAtRaw = typeof payload['AutosaveSavedAt'] === 'string' ? payload['AutosaveSavedAt'] : null
        return {
          restoreDlgOpen: true,
          restoreDraft: {
            Version: String(payload['Version'] ?? ''),
            Metasets: savedMetasets,
            substatTargets: savedSubstatTargets,
            Configs: cfgs,
            ...(savedFinalSell ? { FinalSellRemainder: savedFinalSell } : {}),
            ...(parsed.selectedIndex != null ? { SelectedConfigIndex: parsed.selectedIndex } : {}),
            ...(parsed.note ? { Note: parsed.note } : {}),
            ...(savedAtRaw ? { AutosaveSavedAt: savedAtRaw } : {}),
            ...(savedFilters ? { Filters: savedFilters } : {}),
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
  substatTargets: SubstatTargetTable
  configs: BuilderConfig[]
  finalSellRemainder: FinalSellRemainderConfig
  selectedConfigIndex: number | null
  note: string | null
  filters: AutosaveFiltersState
}) {
  const { key, version, metasets, substatTargets, configs, finalSellRemainder, selectedConfigIndex: _selectedConfigIndex, note, filters } = opts

  const initialAutosaveStateRef = useRef<InitialAutosaveState | null>(null)
  if (initialAutosaveStateRef.current === null) {
    initialAutosaveStateRef.current = computeInitialAutosaveState({ key, metasets, substatTargets, configs, finalSellRemainder, note, filters })
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
      substatTargets,
      Configs: configs,
      FinalSellRemainder: finalSellRemainder,
      ...(note && note.trim() ? { Note: note } : {}),
      ...(filters ? { Filters: filters } : {}),
    }
    return JSON.stringify(base)
  }, [version, metasets, substatTargets, configs, finalSellRemainder, note, filters])

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
