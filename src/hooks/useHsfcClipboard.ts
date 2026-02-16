import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { APP_VERSION } from '../version'
import {
  buildHsfcPayload,
  buildReadableRecipe,
  parseRecipesFromText,
  parseHsfcText,
} from '../lib/hsfcIO'
import type { BuilderRecipe, SubstatTargetTable } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { makeMetasetId } from '../lib/metasets'
import { DEFAULT_METASET_ICON_ID } from '../lib/metasetIcons'
import { generateMetasetNameWithFlag } from '../lib/namegen'
import type { FinalSellRemainderConfig } from '../lib/logicHub'
import { artifactSetName, type ArtifactSetId } from '../lib/types'
import { readTextSafe, writeTextSafe } from '../lib/clipboard'
import { createRecipesInsertedDescriptor } from '../history/recipeCollectionDescriptors'
import type { TranslateFn } from '../history/historyI18n'
import { buildInsertionLocation, snapshotRecipeLabel } from '../history/historyLabelUtils'
import type { HistoryEntryDescriptor, DescribeNextChangeFn } from '../hooks/useHsfcHistory'
import { appendDescriptorDetails } from '../history/substatTargetDescriptors'
import type { FinalSellDescriptorMode } from '../history/finalSellDescriptors'
import { normalizeNoteValue, type NoteDescriptorMode } from '../history/noteDescriptors'
import { makeClipboardSourceDescriptor } from '../history/bulkLoadDescriptors'
import type { SafeguardRule } from '../lib/safeguards'

export type PendingImport = {
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  finalSellRemainder: FinalSellRemainderConfig
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
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
  recipesMapped: BuilderRecipe[]
}

type FinalizeImportResult = {
  nextMetas: Metaset[]
  remapForConflicts: Map<string, string>
}

type ApplySubstatTargetsChangeFn = (
  value: SetStateAction<SubstatTargetTable>,
  options?: { mode?: 'edit' | 'reset' | 'import'; publish?: boolean },
) => HistoryEntryDescriptor | null

type ApplyFinalSellChangeFn = (
  value: SetStateAction<FinalSellRemainderConfig>,
  options?: { mode?: FinalSellDescriptorMode; publish?: boolean },
) => HistoryEntryDescriptor | null

type ApplyNoteChangeFn = (
  value: SetStateAction<string | null>,
  options?: { mode?: NoteDescriptorMode; publish?: boolean },
) => HistoryEntryDescriptor | null

type UseHsfcClipboardParams = {
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  customRecipes: BuilderRecipe[]
  hsfcNote: string | null
  finalSellRemainder: FinalSellRemainderConfig
  safeguardRules: SafeguardRule[]
  safeguardsEnabled: boolean
  selectedRecipeIdx: number | null
  selectedRecipeIndices: number[]
  describeNextChange: DescribeNextChangeFn
  t: TranslateFn
  setCustomRecipes: (value: SetStateAction<BuilderRecipe[]>) => void
  setMetasets: (value: SetStateAction<Metaset[]>) => void
  applySubstatTargetsChange: ApplySubstatTargetsChangeFn
  applyFinalSellChange: ApplyFinalSellChangeFn
  setSafeguardRules: (value: SetStateAction<SafeguardRule[]>) => void
  setSafeguardsEnabled: (value: SetStateAction<boolean>) => void
  applyNoteChange: ApplyNoteChangeFn
  setSelectedRecipeIdx: (value: SetStateAction<number | null>) => void
  setSelectedRecipeIndices: (value: number[]) => void
  setSelectionAnchor: (idx: number | null) => void
  setBuilder: (value: SetStateAction<BuilderRecipe>) => void
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
  insertIndexAfter: (list: BuilderRecipe[], idx: number) => number
  handlePasteText: (text: string) => boolean
  pasteAfterIndex: (idx: number) => Promise<void>
  handleRecipePasteAfter: (idx: number) => void
  handleCopyAllRecipes: () => Promise<void>
  handleCopyRecipe: (idx: number) => Promise<void>
  handlePasteAtEnd: () => Promise<void>
  prepareHsfcImport: (current: Metaset[], incoming: Metaset[], cfgsIn: BuilderRecipe[]) => PreparedHsfcImport
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

const ensureReferencedMetasets = (base: Metaset[], recipes: BuilderRecipe[]): Metaset[] => {
  const referenced = new Set<string>()
  for (const cfg of recipes) {
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
 * - Missing metaset IDs referenced by imported recipes receive generated placeholder entries so
 *   downstream lookups stay consistent even when the source HSFC references hidden metasets.
 */
export function useHsfcClipboard({
  metasets,
  substatTargets,
  customRecipes,
  hsfcNote,
  finalSellRemainder,
  safeguardRules,
  safeguardsEnabled,
  selectedRecipeIdx,
  selectedRecipeIndices,
  describeNextChange,
  t,
  setCustomRecipes,
  setMetasets,
  applyFinalSellChange,
  applyNoteChange,
  setSafeguardRules,
  setSafeguardsEnabled,
  setSelectedRecipeIdx,
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
  applySubstatTargetsChange,
  setSelectedRecipeIndices: _setSelectedRecipeIndices,
  setSelectionAnchor: _setSelectionAnchor,
  setPasteSelectOnEmpty: _setPasteSelectOnEmpty,
}: UseHsfcClipboardParams): UseHsfcClipboardResult {
  void _setSelectedRecipeIndices
  void _setSelectionAnchor
  void _setPasteSelectOnEmpty

  const publishClipboardDescriptor = useCallback((descriptor: HistoryEntryDescriptor | null) => {
    if (!descriptor) {
      describeNextChange(null)
      return
    }
    const withSource = appendDescriptorDetails(descriptor, makeClipboardSourceDescriptor(t))
    describeNextChange(withSource)
  }, [describeNextChange, t])

  const insertIndexAfter = useCallback((list: BuilderRecipe[], idx: number): number => (
    Math.min(list.length, idx + 1)
  ), [])

  const makeInsertedLabels = useCallback((list: BuilderRecipe[], insertIdx: number, count: number) => {
    const labels = []
    for (let offset = 0; offset < count; offset += 1) {
      const idx = insertIdx + offset
      const cfg = list[idx]
      if (!cfg) continue
      labels.push(snapshotRecipeLabel(idx, cfg))
    }
    return labels
  }, [])

  const prepareHsfcImport = useCallback((current: Metaset[], incoming: Metaset[], cfgsIn: BuilderRecipe[]): PreparedHsfcImport => {
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

    const recipesMapped = cfgsIn.map(cfg => {
      const ids = (cfg.artifactMetaSets ?? []).slice()
      const mapped = ids.map(id => idMap.get(id) ?? id)
      return { ...cfg, artifactMetaSets: mapped }
    })

    return {
      idMap,
      toAdd,
      conflicts: Array.from(new Set(conflicts)),
      conflictPairs: curVsIncById,
      recipesMapped,
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
      const parsed = parseHsfcText(text, { metasets, substatTargets })
      const {
        recipes,
        metasets: nextMetas,
        substatTargets: nextSubstatTargets,
        selectedIndex,
        note,
        finalSellRemainder: fsr,
        safeguardRules: importedKeepRules,
        safeguardsEnabled: importedKeepEnabled,
      } = parsed
      if (recipes.length === 0) {
        setPasteErr('No valid recipe found in pasted text')
        return false
      }
      const prep = prepareHsfcImport(metasets, nextMetas, recipes)
      if (prep.conflicts.length) {
        setPendingImport({
          recipes: prep.recipesMapped,
          metasets: nextMetas,
          substatTargets: nextSubstatTargets,
          finalSellRemainder: fsr,
          safeguardRules: importedKeepRules,
          safeguardsEnabled: importedKeepEnabled,
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
      const ensured = ensureReferencedMetasets(metasDone, prep.recipesMapped)
      setMetasets(ensured)
      const substatTargetsDescriptor = applySubstatTargetsChange(nextSubstatTargets, { mode: 'import', publish: false })
      const finalSellDescriptor = applyFinalSellChange(fsr, { mode: 'import', publish: false })
      const incomingNote = typeof note === 'string' ? note : null
      const shouldApplyNote = !normalizeNoteValue(hsfcNote) && Boolean(normalizeNoteValue(incomingNote))
      const noteDescriptor = shouldApplyNote
        ? applyNoteChange(incomingNote, { mode: 'import', publish: false })
        : null
      setCustomRecipes(prev => {
        const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < prev.length)
          ? selectedRecipeIdx + 1
          : prev.length
        const count = prep.recipesMapped.length
        if (count === 0) {
          const combined = appendDescriptorDetails(
            appendDescriptorDetails(substatTargetsDescriptor, finalSellDescriptor),
            noteDescriptor,
          )
          publishClipboardDescriptor(combined)
          return prev
        }
        const next = [
          ...prev.slice(0, insertIdx),
          ...prep.recipesMapped,
          ...prev.slice(insertIdx),
        ]
        const labels = makeInsertedLabels(next, insertIdx, count)
        const descriptorBase = createRecipesInsertedDescriptor({
          mode: 'import',
          labels,
          location: buildInsertionLocation(insertIdx, prev),
        })
        const descriptorWithSubstatTargets = appendDescriptorDetails(descriptorBase, substatTargetsDescriptor)
        const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
        const descriptor = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
        publishClipboardDescriptor(descriptor)
        return next
      })
      setSafeguardRules(importedKeepRules)
      setSafeguardsEnabled(importedKeepEnabled)
      setPasteErr(null)
      return true
    } catch {
      const recipes = parseRecipesFromText(text, metasets)
      if (recipes.length === 0) {
        setPasteErr('No valid recipe found in pasted text')
        return false
      }
      setCustomRecipes(prev => {
        const insertIdx = (selectedRecipeIdx !== null && selectedRecipeIdx >= 0 && selectedRecipeIdx < prev.length)
          ? selectedRecipeIdx + 1
          : prev.length
        const count = recipes.length
        if (count === 0) {
          publishClipboardDescriptor(null)
          return prev
        }
        const next = [
          ...prev.slice(0, insertIdx),
          ...recipes,
          ...prev.slice(insertIdx),
        ]
        const labels = makeInsertedLabels(next, insertIdx, count)
        const descriptor = createRecipesInsertedDescriptor({
          mode: 'paste',
          labels,
          location: buildInsertionLocation(insertIdx, prev),
        })
        publishClipboardDescriptor(descriptor)
        return next
      })
      setPasteErr(null)
      return true
    }
  }, [
    applySubstatTargetsChange,
    publishClipboardDescriptor,
    finalizeImport,
    hsfcNote,
    makeInsertedLabels,
    metasets,
    substatTargets,
    prepareHsfcImport,
    selectedRecipeIdx,
    setConflictIds,
    setCustomRecipes,
    applyFinalSellChange,
    applyNoteChange,
    setImportIdMap,
    setMetasetConflictOpen,
    setMetasets,
    setPasteDlgOpen,
    setPasteErr,
    setPendingImport,
    setSafeguardRules,
    setSafeguardsEnabled,
  ])

  const pasteAfterIndex = useCallback(async (idx: number) => {
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const parsed = parseHsfcText(text, { metasets, substatTargets })
        const {
          recipes,
          metasets: nextMetas,
          substatTargets: nextSubstatTargets,
          selectedIndex,
          note,
          finalSellRemainder: fsr,
          safeguardRules: importedKeepRules,
          safeguardsEnabled: importedKeepEnabled,
        } = parsed
        if (recipes.length > 0) {
          const prep = prepareHsfcImport(metasets, nextMetas, recipes)
          if (prep.conflicts.length) {
            setPendingImport({
              recipes: prep.recipesMapped,
              metasets: nextMetas,
              substatTargets: nextSubstatTargets,
              finalSellRemainder: fsr,
              safeguardRules: importedKeepRules,
              safeguardsEnabled: importedKeepEnabled,
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
          const ensured = ensureReferencedMetasets(metasDone, prep.recipesMapped)
          setMetasets(ensured)
          const substatTargetsDescriptor = applySubstatTargetsChange(nextSubstatTargets, { mode: 'import', publish: false })
          const finalSellDescriptor = applyFinalSellChange(fsr, { mode: 'import', publish: false })
          const incomingNote = typeof note === 'string' ? note : null
          const shouldApplyNote = !normalizeNoteValue(hsfcNote) && Boolean(normalizeNoteValue(incomingNote))
          const noteDescriptor = shouldApplyNote
            ? applyNoteChange(incomingNote, { mode: 'import', publish: false })
            : null
          setCustomRecipes(prev => {
            const insertIdx = Math.min(prev.length, idx + 1)
            const count = prep.recipesMapped.length
            if (count === 0) {
              const combined = appendDescriptorDetails(
                appendDescriptorDetails(substatTargetsDescriptor, finalSellDescriptor),
                noteDescriptor,
              )
              publishClipboardDescriptor(combined)
              return prev
            }
            const next = [
              ...prev.slice(0, insertIdx),
              ...prep.recipesMapped,
              ...prev.slice(insertIdx),
            ]
            const labels = makeInsertedLabels(next, insertIdx, count)
            const descriptorBase = createRecipesInsertedDescriptor({
              mode: 'import',
              labels,
              location: buildInsertionLocation(insertIdx, prev),
            })
            const descriptorWithSubstatTargets = appendDescriptorDetails(descriptorBase, substatTargetsDescriptor)
            const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
            const descriptor = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
            publishClipboardDescriptor(descriptor)
            return next
          })
          setSafeguardRules(importedKeepRules)
          setSafeguardsEnabled(importedKeepEnabled)
          try {
            setSelectedRecipeIdx(idx + recipes.length)
            setBuilder(recipes[recipes.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const recipes = parseRecipesFromText(text, metasets)
      if (recipes.length > 0) {
        setCustomRecipes(prev => {
          const insertIdx = Math.min(prev.length, idx + 1)
          const count = recipes.length
          if (count === 0) {
            publishClipboardDescriptor(null)
            return prev
          }
          const next = [
            ...prev.slice(0, insertIdx),
            ...recipes,
            ...prev.slice(insertIdx),
          ]
          const labels = makeInsertedLabels(next, insertIdx, count)
          const descriptor = createRecipesInsertedDescriptor({
            mode: 'paste',
            labels,
            location: buildInsertionLocation(insertIdx, prev),
          })
          publishClipboardDescriptor(descriptor)
          return next
        })
        try {
          setSelectedRecipeIdx(idx + recipes.length)
          setBuilder(recipes[recipes.length - 1]!)
        } catch {}
        return
      }
    }
    setSelectedRecipeIdx(idx)
    setPasteAfterIdx(idx)
    setPasteText('')
    setPasteErr(null)
    setPasteDlgOpen(true)
  }, [
    applySubstatTargetsChange,
    publishClipboardDescriptor,
    finalizeImport,
    hsfcNote,
    makeInsertedLabels,
    metasets,
    substatTargets,
    prepareHsfcImport,
    setBuilder,
    setConflictIds,
    setCustomRecipes,
    applyFinalSellChange,
    applyNoteChange,
    setImportIdMap,
    setMetasetConflictOpen,
    setMetasets,
    setPasteDlgOpen,
    setPasteErr,
    setPasteAfterIdx,
    setPasteText,
    setPendingImport,
    setSelectedRecipeIdx,
    setSafeguardRules,
    setSafeguardsEnabled,
  ])

  const handleRecipePasteAfter = useCallback((idx: number) => {
    const target = selectedRecipeIndices.length > 1
      ? Math.max(...selectedRecipeIndices)
      : idx
    void pasteAfterIndex(target)
  }, [selectedRecipeIndices, pasteAfterIndex])

  const handleCopyAllRecipes = useCallback(async () => {
    const payload = buildHsfcPayload({
      version: APP_VERSION,
      metasets,
      substatTargets,
      recipes: customRecipes,
      finalSellRemainder,
      selectedRecipeIndex: selectedRecipeIdx,
      ...(hsfcNote && hsfcNote.trim() ? { note: hsfcNote } : {}),
      safeguardRules,
      safeguardsEnabled,
    })
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) {
      setCopyText(text)
      setCopyDlgOpen(true)
    }
  }, [
    customRecipes,
    finalSellRemainder,
    hsfcNote,
    metasets,
    substatTargets,
    selectedRecipeIdx,
    safeguardRules,
    safeguardsEnabled,
    setCopyDlgOpen,
    setCopyText,
  ])

  const handleCopyRecipe = useCallback(async (idx: number) => {
    const multi = selectedRecipeIndices.length > 1 && selectedRecipeIndices.includes(idx)
    if (multi) {
      const sel = selectedRecipeIndices.slice().sort((a, b) => a - b)
      const recipes = sel.map(i => customRecipes[i]!).filter(Boolean)
      const readable = recipes.map((cfg) => buildReadableRecipe(cfg, metasets))
      const usedMetaIds = new Set<string>()
      for (const cfg of recipes) for (const id of (cfg.artifactMetaSets ?? [])) usedMetaIds.add(String(id))
      const metasOut = metasets
        .filter(m => usedMetaIds.has(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          setNames: m.sets.slice().sort((a, b) => a - b)
            .map(idNum => artifactSetName(Number(idNum) as ArtifactSetId))
            .filter((x): x is string => Boolean(x && x.trim())),
          show: m.show !== false,
        }))
      const payload = { Version: APP_VERSION, Metasets: metasOut, Recipes: readable }
      const text = JSON.stringify(payload, null, 2)
      const ok = await writeTextSafe(text)
      if (!ok) {
        setCopyText(text)
        setCopyDlgOpen(true)
      }
    } else {
      const cfg = customRecipes[idx]
      if (!cfg) return
      const readable = buildReadableRecipe(cfg, metasets)
      const usedMetaIds = cfg.artifactMetaSets ?? []
      const metasOut = metasets
        .filter(m => usedMetaIds.includes(m.id))
        .map(m => ({
          id: m.id,
          name: m.name,
          setNames: m.sets.slice().sort((a, b) => a - b)
            .map(idNum => artifactSetName(Number(idNum) as ArtifactSetId))
            .filter((x): x is string => Boolean(x && x.trim())),
          show: m.show !== false,
        }))
      const payload = { Version: APP_VERSION, Metasets: metasOut, Recipes: [readable] }
      const text = JSON.stringify(payload, null, 2)
      const ok = await writeTextSafe(text)
      if (!ok) {
        setCopyText(text)
        setCopyDlgOpen(true)
      }
    }
  }, [
    customRecipes,
    metasets,
    selectedRecipeIndices,
    setCopyDlgOpen,
    setCopyText,
  ])

  const handlePasteAtEnd = useCallback(async () => {
    const text = await readTextSafe()
    if (text && text.trim()) {
      try {
        const parsed = parseHsfcText(text, { metasets, substatTargets })
        const {
          recipes,
          metasets: nextMetas,
          substatTargets: nextSubstatTargets,
          selectedIndex,
          note,
          finalSellRemainder: fsr,
          safeguardRules: importedKeepRules,
          safeguardsEnabled: importedKeepEnabled,
        } = parsed
        if (recipes.length > 0) {
          const prep = prepareHsfcImport(metasets, nextMetas, recipes)
          if (prep.conflicts.length) {
            setPendingImport({
              recipes: prep.recipesMapped,
              metasets: nextMetas,
              substatTargets: nextSubstatTargets,
              finalSellRemainder: fsr,
              safeguardRules: importedKeepRules,
              safeguardsEnabled: importedKeepEnabled,
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
          const ensured = ensureReferencedMetasets(metasDone, prep.recipesMapped)
          setMetasets(ensured)
          const preLen = customRecipes.length
          const substatTargetsDescriptor = applySubstatTargetsChange(nextSubstatTargets, { mode: 'import', publish: false })
          const finalSellDescriptor = applyFinalSellChange(fsr, { mode: 'import', publish: false })
          const incomingNote = typeof note === 'string' ? note : null
          const shouldApplyNote = !normalizeNoteValue(hsfcNote) && Boolean(normalizeNoteValue(incomingNote))
          const noteDescriptor = shouldApplyNote
            ? applyNoteChange(incomingNote, { mode: 'import', publish: false })
            : null
          setCustomRecipes(prev => {
            const count = prep.recipesMapped.length
            if (count === 0) {
              const combined = appendDescriptorDetails(
                appendDescriptorDetails(substatTargetsDescriptor, finalSellDescriptor),
                noteDescriptor,
              )
              publishClipboardDescriptor(combined)
              return prev
            }
            const insertIdx = prev.length
            const next = [...prev, ...prep.recipesMapped]
            const labels = makeInsertedLabels(next, insertIdx, count)
            const descriptorBase = createRecipesInsertedDescriptor({
              mode: 'import',
              labels,
              location: buildInsertionLocation(insertIdx, prev),
            })
            const descriptorWithSubstatTargets = appendDescriptorDetails(descriptorBase, substatTargetsDescriptor)
            const descriptorWithFinal = appendDescriptorDetails(descriptorWithSubstatTargets, finalSellDescriptor)
            const descriptor = appendDescriptorDetails(descriptorWithFinal, noteDescriptor)
            publishClipboardDescriptor(descriptor)
            return next
          })
          setSafeguardRules(importedKeepRules)
          setSafeguardsEnabled(importedKeepEnabled)
          try {
            const sel = preLen + recipes.length - 1
            setSelectedRecipeIdx(sel)
            setBuilder(recipes[recipes.length - 1]!)
          } catch {}
          return
        }
      } catch {}
      const recipes = parseRecipesFromText(text, metasets)
      if (recipes.length > 0) {
        setCustomRecipes(prev => {
          const count = recipes.length
          if (count === 0) {
            publishClipboardDescriptor(null)
            return prev
          }
          const insertIdx = prev.length
          const next = [...prev, ...recipes]
          const labels = makeInsertedLabels(next, insertIdx, count)
          const descriptor = createRecipesInsertedDescriptor({
            mode: 'paste',
            labels,
            location: buildInsertionLocation(insertIdx, prev),
          })
          publishClipboardDescriptor(descriptor)
          return next
        })
        try {
          const sel = customRecipes.length + recipes.length - 1
          setSelectedRecipeIdx(sel)
          setBuilder(recipes[recipes.length - 1]!)
        } catch {}
        return
      }
    }
    setPasteDlgOpen(true)
    setPasteText('')
    setPasteErr(null)
    setPasteAfterIdx(customRecipes.length - 1)
  }, [
    customRecipes,
    applySubstatTargetsChange,
    finalizeImport,
    hsfcNote,
    makeInsertedLabels,
    metasets,
    substatTargets,
    prepareHsfcImport,
    setBuilder,
    setConflictIds,
    setCustomRecipes,
    applyFinalSellChange,
    applyNoteChange,
    setImportIdMap,
    setMetasetConflictOpen,
    setMetasets,
    setPasteAfterIdx,
    setPasteDlgOpen,
    setPasteErr,
    setPasteText,
    setPendingImport,
    setSelectedRecipeIdx,
    publishClipboardDescriptor,
    setSafeguardRules,
    setSafeguardsEnabled,
  ])

  return {
    insertIndexAfter,
    handlePasteText,
    pasteAfterIndex,
    handleRecipePasteAfter,
    handleCopyAllRecipes,
    handleCopyRecipe,
    handlePasteAtEnd,
    prepareHsfcImport,
    finalizeImport,
  }
}
