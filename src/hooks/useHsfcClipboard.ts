import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { APP_VERSION } from '../version'
import {
  buildHsfcPayload,
  buildReadableConfig,
  parseConfigsFromText,
  parseHsfcText,
} from '../lib/hsfcIO'
import type { BuilderConfig, MinimaTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { makeMetasetId } from '../lib/metasets'
import { DEFAULT_METASET_ICON_ID } from '../lib/metasetIcons'
import { generateMetasetNameWithFlag } from '../lib/namegen'
import type { FinalSellRemainderConfig } from '../lib/finalSell'
import { artifactSetNames } from '../lib/types'
import { readTextSafe, writeTextSafe } from '../lib/clipboard'
import { describeConfigsInserted } from '../history/configCollectionDescriptors'
import { buildConfigLabel, type TranslateFn } from '../history/builderUpdateDescriptor'
import type { HistoryEntryDescriptor } from '../hooks/useHsfcHistory'

export type PendingImport = {
  cfgs: BuilderConfig[]
  metasets: Metaset[]
  minima: MinimaTable
  finalSellRemainder: FinalSellRemainderConfig
  selectedIndex: number | null
  note?: string
  mode: 'append' | 'after'
  afterIdx?: number
}

type PreparedHsfcImport = {
  idMap: Map<string, string>
  toAdd: Metaset[]
  conflicts: string[]
  conflictPairs: Map<string, { cur: Metaset; inc: Metaset }>
  cfgsMapped: BuilderConfig[]
}

type FinalizeImportResult = {
  nextMetas: Metaset[]
  remapForConflicts: Map<string, string>
}

type UseHsfcClipboardParams = {
  metasets: Metaset[]
  minima: MinimaTable
  customCfgs: BuilderConfig[]
  hsfcNote: string | null
  finalSellRemainder: FinalSellRemainderConfig
  selectedCfgIdx: number | null
  selectedCfgIndices: number[]
  describeNextChange: (descriptor: HistoryEntryDescriptor | null) => void
  t: TranslateFn
  setCustomCfgs: (value: SetStateAction<BuilderConfig[]>) => void
  setMetasets: (value: SetStateAction<Metaset[]>) => void
  setMinima: (value: SetStateAction<MinimaTable>) => void
  setFinalSellRemainder: (value: SetStateAction<FinalSellRemainderConfig>) => void
  setHsfcNote: (value: SetStateAction<string | null>) => void
  setSelectedCfgIdx: (value: SetStateAction<number | null>) => void
  setSelectedCfgIndices: Dispatch<SetStateAction<number[]>>
  setSelectionAnchor: (idx: number | null) => void
  setBuilder: (value: SetStateAction<BuilderConfig>) => void
  setMetasetConflictOpen: (open: boolean) => void
  setPendingImport: Dispatch<SetStateAction<PendingImport | null>>
  setConflictIds: Dispatch<SetStateAction<string[]>>
  setImportIdMap: Dispatch<SetStateAction<Map<string, string>>>
  setPasteDlgOpen: Dispatch<SetStateAction<boolean>>
  setPasteErr: Dispatch<SetStateAction<string | null>>
  setPasteText: Dispatch<SetStateAction<string>>
  setPasteSelectOnEmpty: Dispatch<SetStateAction<boolean>>
  setPasteAfterIdx: Dispatch<SetStateAction<number | null>>
  setCopyDlgOpen: Dispatch<SetStateAction<boolean>>
  setCopyText: Dispatch<SetStateAction<string>>
}

export type UseHsfcClipboardResult = {
  insertIndexAfter: (list: BuilderConfig[], idx: number) => number
  handlePasteText: (text: string) => boolean
  pasteAfterIndex: (idx: number) => Promise<void>
  handleConfigPasteAfter: (idx: number) => void
  handleCopyAllConfigs: () => Promise<void>
  handleCopyConfig: (idx: number) => Promise<void>
  handlePasteAtEnd: () => Promise<void>
  prepareHsfcImport: (current: Metaset[], incoming: Metaset[], cfgsIn: BuilderConfig[]) => PreparedHsfcImport
  finalizeImport: (
    baseCurrent: Metaset[],
    prep: PreparedHsfcImport,
    strategy: 'keepCurrent' | 'useIncoming' | 'keepBoth'
  ) => FinalizeImportResult
}

const valueKey = (sets: number[]): string => {
  const arr = (sets ?? []).map(Number).slice().sort((a, b) => a - b)
  return arr.join(',')
}

const ensureReferencedMetasets = (base: Metaset[], cfgs: BuilderConfig[]): Metaset[] => {
  const referenced = new Set<string>()
  for (const cfg of cfgs) {
    const ids = cfg.artifactMetaSets ?? []
    for (const id of ids) referenced.add(String(id))
  }
  if (!referenced.size) return base

  const have = new Set(base.map((m) => m.id))
  const names = new Set(base.map((m) => m.name))
  const next = base.slice()
  for (const id of referenced) {
    if (have.has(id)) continue
    let genName = generateMetasetNameWithFlag(Array.from(names)).name
    while (names.has(genName)) {
      genName = generateMetasetNameWithFlag(Array.from(names)).name
    }
    names.add(genName)
    have.add(id)
    next.push({ id, name: genName, sets: [], show: false, iconId: DEFAULT_METASET_ICON_ID })
  }
  return next
}

/**
 * Centralizes HSFC clipboard orchestration so App.tsx wires handlers instead of duplicating logic.
 * - Note merging only replaces the current note when it is blank, matching the legacy behavior.
 * - Missing metaset IDs referenced by imported configs receive generated placeholder entries so
 *   downstream lookups stay consistent even when the source HSFC references hidden metasets.
 */
export function useHsfcClipboard({
  metasets,
  minima,
  customCfgs,
  hsfcNote,
  finalSellRemainder,
  selectedCfgIdx,
  selectedCfgIndices,
  describeNextChange,
  t,
  setCustomCfgs,
  setMetasets,
  setFinalSellRemainder,
  setHsfcNote,
  setSelectedCfgIdx,
  setBuilder,
  setMetasetConflictOpen,
  setPendingImport,
  setConflictIds,
  setImportIdMap,
  setPasteDlgOpen,
  setPasteErr,
  setPasteText,
  setPasteAfterIdx,
  setCopyDlgOpen,
  setCopyText,
  setMinima: _setMinima,
  setSelectedCfgIndices: _setSelectedCfgIndices,
  setSelectionAnchor: _setSelectionAnchor,
  setPasteSelectOnEmpty: _setPasteSelectOnEmpty,
}: UseHsfcClipboardParams): UseHsfcClipboardResult {
  void _setMinima
  void _setSelectedCfgIndices
  void _setSelectionAnchor
  void _setPasteSelectOnEmpty
  const insertIndexAfter = useCallback((list: BuilderConfig[], idx: number): number => (
    Math.min(list.length, idx + 1)
  ), [])

  const makeInsertedLabels = (list: BuilderConfig[], insertIdx: number, count: number): string[] => {
    const labels: string[] = []
    for (let offset = 0; offset < count; offset += 1) {
      const idx = insertIdx + offset
      const cfg = list[idx]
      if (!cfg) continue
      labels.push(buildConfigLabel(idx, cfg, t))
    }
    return labels
  }

  const prepareHsfcImport = useCallback((current: Metaset[], incoming: Metaset[], cfgsIn: BuilderConfig[]): PreparedHsfcImport => {
    const byIdCur = new Map(current.map(m => [m.id, m]))
    const byValCur = new Map<string, Metaset>()
    for (const m of current) byValCur.set(valueKey(m.sets), m)
    const idMap = new Map<string, string>()

    const conflicts: string[] = []
    const curVsIncById = new Map<string, { cur: Metaset; inc: Metaset }>()
    for (const inc of incoming) {
      const cur = byIdCur.get(inc.id)
      if (cur && valueKey(cur.sets) !== valueKey(inc.sets)) {
        conflicts.push(inc.id)
        curVsIncById.set(inc.id, { cur, inc })
      }
    }

    const canonicalIncoming = new Map<string, string>() // valueKey -> canonical incoming ID
    for (const inc of incoming) {
      const vkey = valueKey(inc.sets)
      if (curVsIncById.has(inc.id)) continue
      const curMatch = byValCur.get(vkey)
      if (curMatch) {
        idMap.set(inc.id, curMatch.id)
        continue
      }
      const existing = canonicalIncoming.get(vkey)
      if (existing) {
        idMap.set(inc.id, existing)
      } else {
        canonicalIncoming.set(vkey, inc.id)
      }
    }

    const toAdd: Metaset[] = []
    const seenAdd = new Set<string>()
    for (const inc of incoming) {
      if (curVsIncById.has(inc.id)) continue
      const target = idMap.get(inc.id) ?? inc.id
      if (byIdCur.has(target)) continue
      const vkey = valueKey(inc.sets)
      const canon = canonicalIncoming.get(vkey)
      if (canon && canon !== inc.id) continue
      if (seenAdd.has(target)) continue
      seenAdd.add(target)
      toAdd.push({ ...inc, id: target })
    }

    const cfgsMapped = cfgsIn.map(cfg => {
      const ids = (cfg.artifactMetaSets ?? []).slice()
      const mapped = ids.map(id => idMap.get(id) ?? id)
      return { ...cfg, artifactMetaSets: mapped }
    })

    return {
      idMap,
      toAdd,
      conflicts: Array.from(new Set(conflicts)),
      conflictPairs: curVsIncById,
      cfgsMapped,
    }
  }, [])

  const finalizeImport = useCallback((
    baseCurrent: Metaset[],
    prep: PreparedHsfcImport,
    strategy: 'keepCurrent' | 'useIncoming' | 'keepBoth',
  ): FinalizeImportResult => {
    const { toAdd, conflicts: ids, conflictPairs } = prep
    let nextMetas = baseCurrent.slice()
    const remapForConflicts = new Map<string, string>()

    if (ids.length) {
      if (strategy === 'useIncoming') {
        const map = new Map(nextMetas.map(m => [m.id, m]))
        for (const id of ids) {
          const pair = conflictPairs.get(id)
          if (!pair) continue
          map.set(id, { ...pair.inc })
        }
        nextMetas = Array.from(map.values())
      } else if (strategy === 'keepBoth') {
        for (const id of ids) {
          const pair = conflictPairs.get(id)
          if (!pair) continue
          let newId = makeMetasetId()
          while (nextMetas.some(m => m.id === newId) || id === newId) {
            newId = makeMetasetId()
          }
          nextMetas.push({ ...pair.inc, id: newId })
          remapForConflicts.set(id, newId)
        }
      }
      // keepCurrent leaves existing entries untouched.
    }

    for (const meta of toAdd) nextMetas.push(meta)
    return { nextMetas, remapForConflicts }
  }, [])

  const handlePasteText = useCallback((text: string): boolean => {
    try {
      const parsed = parseHsfcText(text, { metasets, minima })
      const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      const prep = prepareHsfcImport(metasets, nextMetas, cfgs)
      if (prep.conflicts.length) {
        setPendingImport({
          cfgs: prep.cfgsMapped,
          metasets: nextMetas,
          minima: nextMinima,
          finalSellRemainder: fsr,
          selectedIndex,
          ...(note ? { note } : {}),
          mode: 'after',
        })
        setConflictIds(prep.conflicts)
        setImportIdMap(prep.idMap)
        setMetasetConflictOpen(true)
        setPasteDlgOpen(false)
        setPasteErr(null)
        return true
      }
      const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
      const ensured = ensureReferencedMetasets(metasDone, prep.cfgsMapped)
      setMetasets(ensured)
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        const count = prep.cfgsMapped.length
        if (count === 0) {
          describeNextChange(null)
          return prev
        }
        const next = [
          ...prev.slice(0, insertIdx),
          ...prep.cfgsMapped,
          ...prev.slice(insertIdx),
        ]
        const labels = makeInsertedLabels(next, insertIdx, count)
        const descriptor = describeConfigsInserted({
          mode: 'import',
          insertIndex: insertIdx,
          labels,
          previous: prev,
          t,
        })
        describeNextChange(descriptor)
        return next
      })
      setFinalSellRemainder(fsr)
      if ((!hsfcNote || !hsfcNote.trim()) && typeof note === 'string' && note.trim()) {
        setHsfcNote(note)
      }
      setPasteErr(null)
      return true
    } catch {
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length === 0) {
        setPasteErr('No valid config found in pasted text')
        return false
      }
      setCustomCfgs(prev => {
        const insertIdx = (selectedCfgIdx !== null && selectedCfgIdx >= 0 && selectedCfgIdx < prev.length)
          ? selectedCfgIdx + 1
          : prev.length
        const count = cfgs.length
        if (count === 0) {
          describeNextChange(null)
          return prev
        }
        const next = [
          ...prev.slice(0, insertIdx),
          ...cfgs,
          ...prev.slice(insertIdx),
        ]
        const labels = makeInsertedLabels(next, insertIdx, count)
        const descriptor = describeConfigsInserted({
          mode: 'paste',
          insertIndex: insertIdx,
          labels,
          previous: prev,
          t,
        })
        describeNextChange(descriptor)
        return next
      })
      setPasteErr(null)
      return true
    }
  }, [
    describeNextChange,
    finalizeImport,
    hsfcNote,
    makeInsertedLabels,
    metasets,
    minima,
    prepareHsfcImport,
    selectedCfgIdx,
    setConflictIds,
    setCustomCfgs,
    setFinalSellRemainder,
    setHsfcNote,
    setImportIdMap,
    setMetasetConflictOpen,
    setMetasets,
    setPasteDlgOpen,
    setPasteErr,
    setPendingImport,
    t,
  ])

  const pasteAfterIndex = useCallback(async (idx: number) => {
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const parsed = parseHsfcText(text, { metasets, minima })
        const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
        if (cfgs.length > 0) {
          const prep = prepareHsfcImport(metasets, nextMetas, cfgs)
          if (prep.conflicts.length) {
            setPendingImport({
              cfgs: prep.cfgsMapped,
              metasets: nextMetas,
              minima: nextMinima,
              finalSellRemainder: fsr,
              selectedIndex,
              ...(note ? { note } : {}),
              mode: 'after',
              afterIdx: idx,
            })
            setConflictIds(prep.conflicts)
            setImportIdMap(prep.idMap)
            setMetasetConflictOpen(true)
            return
          }
          const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
          const ensured = ensureReferencedMetasets(metasDone, prep.cfgsMapped)
          setMetasets(ensured)
          setCustomCfgs(prev => {
            const insertIdx = Math.min(prev.length, idx + 1)
            const count = prep.cfgsMapped.length
            if (count === 0) {
              describeNextChange(null)
              return prev
            }
            const next = [
              ...prev.slice(0, insertIdx),
              ...prep.cfgsMapped,
              ...prev.slice(insertIdx),
            ]
            const labels = makeInsertedLabels(next, insertIdx, count)
            const descriptor = describeConfigsInserted({
              mode: 'import',
              insertIndex: insertIdx,
              labels,
              previous: prev,
              t,
            })
            describeNextChange(descriptor)
            return next
          })
          setFinalSellRemainder(fsr)
          if ((!hsfcNote || !hsfcNote.trim()) && typeof note === 'string' && note.trim()) {
            setHsfcNote(note)
          }
          try {
            setSelectedCfgIdx(idx + cfgs.length)
            setBuilder(cfgs[cfgs.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length > 0) {
        setCustomCfgs(prev => {
          const insertIdx = Math.min(prev.length, idx + 1)
          const count = cfgs.length
          if (count === 0) {
            describeNextChange(null)
            return prev
          }
          const next = [
            ...prev.slice(0, insertIdx),
            ...cfgs,
            ...prev.slice(insertIdx),
          ]
          const labels = makeInsertedLabels(next, insertIdx, count)
          const descriptor = describeConfigsInserted({
            mode: 'paste',
            insertIndex: insertIdx,
            labels,
            previous: prev,
            t,
          })
          describeNextChange(descriptor)
          return next
        })
        try {
          setSelectedCfgIdx(idx + cfgs.length)
          setBuilder(cfgs[cfgs.length - 1]!)
        } catch {}
        return
      }
    }
    setSelectedCfgIdx(idx)
    setPasteAfterIdx(idx)
    setPasteText('')
    setPasteErr(null)
    setPasteDlgOpen(true)
  }, [
    describeNextChange,
    finalizeImport,
    hsfcNote,
    makeInsertedLabels,
    metasets,
    minima,
    prepareHsfcImport,
    setBuilder,
    setConflictIds,
    setCustomCfgs,
    setFinalSellRemainder,
    setHsfcNote,
    setImportIdMap,
    setMetasetConflictOpen,
    setMetasets,
    setPasteDlgOpen,
    setPasteErr,
    setPasteAfterIdx,
    setPasteText,
    setPendingImport,
    setSelectedCfgIdx,
    t,
  ])

  const handleConfigPasteAfter = useCallback((idx: number) => {
    const target = selectedCfgIndices.length > 1
      ? Math.max(...selectedCfgIndices)
      : idx
    void pasteAfterIndex(target)
  }, [selectedCfgIndices, pasteAfterIndex])

  const handleCopyAllConfigs = useCallback(async () => {
    const payload = buildHsfcPayload({
      version: APP_VERSION,
      metasets,
      minima,
      configs: customCfgs,
      finalSellRemainder,
      selectedConfigIndex: selectedCfgIdx,
      ...(hsfcNote && hsfcNote.trim() ? { note: hsfcNote } : {}),
    })
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) {
      setCopyText(text)
      setCopyDlgOpen(true)
    }
  }, [
    customCfgs,
    finalSellRemainder,
    hsfcNote,
    metasets,
    minima,
    selectedCfgIdx,
    setCopyDlgOpen,
    setCopyText,
  ])

  const handleCopyConfig = useCallback(async (idx: number) => {
    const multi = selectedCfgIndices.length > 1 && selectedCfgIndices.includes(idx)
    if (multi) {
      const sel = selectedCfgIndices.slice().sort((a, b) => a - b)
      const cfgs = sel.map(i => customCfgs[i]!).filter(Boolean)
      const readable = cfgs.map((cfg, index) => ({
        __cfgIdx_ignoredWhenRead: sel[index]! + 1,
        ...buildReadableConfig(cfg, metasets),
      }))
      const usedMetaIds = new Set<string>()
      for (const cfg of cfgs) for (const id of (cfg.artifactMetaSets ?? [])) usedMetaIds.add(String(id))
      const metasOut = metasets
        .filter(m => usedMetaIds.has(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          setNames: m.sets.slice().sort((a, b) => a - b).map(idNum => artifactSetNames[Number(idNum)]).filter((x): x is string => Boolean(x)),
          show: m.show !== false,
        }))
      const payload = { Version: APP_VERSION, Metasets: metasOut, Configs: readable }
      const text = JSON.stringify(payload, null, 2)
      const ok = await writeTextSafe(text)
      if (!ok) {
        setCopyText(text)
        setCopyDlgOpen(true)
      }
    } else {
      const cfg = customCfgs[idx]
      if (!cfg) return
      const readable = { __cfgIdx_ignoredWhenRead: idx + 1, ...buildReadableConfig(cfg, metasets) }
      const usedMetaIds = cfg.artifactMetaSets ?? []
      const metasOut = metasets
        .filter(m => usedMetaIds.includes(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          setNames: m.sets.slice().sort((a, b) => a - b).map(idNum => artifactSetNames[Number(idNum)]).filter((x): x is string => Boolean(x)),
          show: m.show !== false,
        }))
      const payload = { Version: APP_VERSION, Metasets: metasOut, Configs: [readable] }
      const text = JSON.stringify(payload, null, 2)
      const ok = await writeTextSafe(text)
      if (!ok) {
        setCopyText(text)
        setCopyDlgOpen(true)
      }
    }
  }, [
    customCfgs,
    metasets,
    selectedCfgIndices,
    setCopyDlgOpen,
    setCopyText,
  ])

  const handlePasteAtEnd = useCallback(async () => {
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const parsed = parseHsfcText(text, { metasets, minima })
        const { cfgs, metasets: nextMetas, minima: nextMinima, selectedIndex, note, finalSellRemainder: fsr } = parsed
        if (cfgs.length > 0) {
          const prep = prepareHsfcImport(metasets, nextMetas, cfgs)
          if (prep.conflicts.length) {
            setPendingImport({
              cfgs: prep.cfgsMapped,
              metasets: nextMetas,
              minima: nextMinima,
              finalSellRemainder: fsr,
              selectedIndex,
              ...(note ? { note } : {}),
              mode: 'append',
            })
            setConflictIds(prep.conflicts)
            setImportIdMap(prep.idMap)
            setMetasetConflictOpen(true)
            return
          }
          const { nextMetas: metasDone } = finalizeImport(metasets, prep, 'keepCurrent')
          const ensured = ensureReferencedMetasets(metasDone, prep.cfgsMapped)
          setMetasets(ensured)
          const preLen = customCfgs.length
          setCustomCfgs(prev => {
            const count = prep.cfgsMapped.length
            if (count === 0) {
              describeNextChange(null)
              return prev
            }
            const insertIdx = prev.length
            const next = [...prev, ...prep.cfgsMapped]
            const labels = makeInsertedLabels(next, insertIdx, count)
            const descriptor = describeConfigsInserted({
              mode: 'import',
              insertIndex: insertIdx,
              labels,
              previous: prev,
              t,
            })
            describeNextChange(descriptor)
            return next
          })
          setFinalSellRemainder(fsr)
          if ((!hsfcNote || !hsfcNote.trim()) && typeof note === 'string' && note.trim()) {
            setHsfcNote(note)
          }
          try {
            const sel = preLen + cfgs.length - 1
            setSelectedCfgIdx(sel)
            setBuilder(cfgs[cfgs.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const cfgs = parseConfigsFromText(text, metasets)
      if (cfgs.length > 0) {
        setCustomCfgs(prev => {
          const count = cfgs.length
          if (count === 0) {
            describeNextChange(null)
            return prev
          }
          const insertIdx = prev.length
          const next = [...prev, ...cfgs]
          const labels = makeInsertedLabels(next, insertIdx, count)
          const descriptor = describeConfigsInserted({
            mode: 'paste',
            insertIndex: insertIdx,
            labels,
            previous: prev,
            t,
          })
          describeNextChange(descriptor)
          return next
        })
        try {
          const sel = customCfgs.length + cfgs.length - 1
          setSelectedCfgIdx(sel)
          setBuilder(cfgs[cfgs.length - 1]!)
        } catch {}
        return
      }
    }
    setPasteDlgOpen(true)
    setPasteText('')
    setPasteErr(null)
    setPasteAfterIdx(customCfgs.length - 1)
  }, [
    customCfgs,
    describeNextChange,
    finalizeImport,
    hsfcNote,
    makeInsertedLabels,
    metasets,
    minima,
    prepareHsfcImport,
    setBuilder,
    setConflictIds,
    setCustomCfgs,
    setFinalSellRemainder,
    setHsfcNote,
    setImportIdMap,
    setMetasetConflictOpen,
    setMetasets,
    setPasteAfterIdx,
    setPasteDlgOpen,
    setPasteErr,
    setPasteText,
    setPendingImport,
    setSelectedCfgIdx,
    t,
  ])

  return {
    insertIndexAfter,
    handlePasteText,
    pasteAfterIndex,
    handleConfigPasteAfter,
    handleCopyAllConfigs,
    handleCopyConfig,
    handlePasteAtEnd,
    prepareHsfcImport,
    finalizeImport,
  }
}
