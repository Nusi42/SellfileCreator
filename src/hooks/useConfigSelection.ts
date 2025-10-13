import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import { arraysEqual } from '../lib/array'
import type { BuilderConfig } from '../lib/hsfBuilder'
import {
  createMultiEditDraft,
  syncMultiEditDraft,
  cloneBuilderFieldValue,
  cloneFieldPatch,
  normalizeFieldPatch,
  areFieldPatchesEqual,
  areBuilderFieldValuesEqual,
  BUILDER_FIELD_KEYS,
  applyMultiEditFieldsToConfig,
  getDirtyBuilderFieldKeys,
  type MultiEditDraftState,
  type BuilderFieldKey,
  type MultiEditFieldCommit,
  type MultiEditDraftHandle,
  type MultiEditFields,
  type MultiEditFieldPatch,
} from '../lib/multiEditDraft'

type UseConfigSelectionParams = {
  customCfgs: BuilderConfig[]
  setCustomCfgs: Dispatch<SetStateAction<BuilderConfig[]>>
  selectedCfgIdx: number | null
  setSelectedCfgIdx: Dispatch<SetStateAction<number | null>>
  setBuilder: Dispatch<SetStateAction<BuilderConfig>>
  requestDeleteSingle: (idx: number) => void
  requestDeleteMulti: (count: number) => void
}

export type UseConfigSelectionResult = {
  selectedCfgIndices: number[]
  setSelectedCfgIndices: Dispatch<SetStateAction<number[]>>
  multiselectActive: boolean
  hoveredCfgIdx: number | null
  setHoveredCfgIdx: Dispatch<SetStateAction<number | null>>
  handleConfigHoverIdx: (idx: number | null) => void
  multiSelectedConfigs: BuilderConfig[]
  multiEditHandle: MultiEditDraftHandle | null
  applyMultiEditDraft: () => void
  handleConfigSelect: (event: MouseEvent, idx: number) => void
  handleConfigDelete: (idx: number) => void
  handleConfigDuplicate: (idx: number) => void
  handleConfigMoveUp: (idx: number) => void
  handleConfigMoveDown: (idx: number) => void
  handleConfigMoveTop: (idx: number) => void
  handleConfigMoveBottom: (idx: number) => void
  handleSelectAllConfigs: () => void
  handleClearSelection: () => void
  setSelectionAnchor: (idx: number | null) => void
}

/**
 * Centralizes config selection and multi-edit draft state so App.tsx only wires the orchestration.
 * The hook keeps selection + anchor indices in sync with the global selected config index and
 * exposes handlers used by the chips list and builder toolbar.
 */
export function useConfigSelection({
  customCfgs,
  setCustomCfgs,
  selectedCfgIdx,
  setSelectedCfgIdx,
  setBuilder,
  requestDeleteSingle,
  requestDeleteMulti,
}: UseConfigSelectionParams): UseConfigSelectionResult {
  const [selectedCfgIndices, setSelectedCfgIndicesState] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [hoveredCfgIdx, setHoveredCfgIdx] = useState<number | null>(null)
  const multiselectActive = selectedCfgIndices.length > 1

  const multiSelectedIndices = useMemo(() => {
    if (selectedCfgIndices.length <= 1) return []
    const next: number[] = []
    for (const idx of selectedCfgIndices) {
      if (idx < 0) continue
      if (idx >= customCfgs.length) continue
      if (!customCfgs[idx]) continue
      next.push(idx)
    }
    return next
  }, [customCfgs, selectedCfgIndices])

  const multiSelectedConfigs = useMemo(() => {
    if (multiSelectedIndices.length === 0) return []
    const result: BuilderConfig[] = []
    for (const idx of multiSelectedIndices) {
      const cfg = customCfgs[idx]
      if (cfg) result.push(cfg)
    }
    return result
  }, [customCfgs, multiSelectedIndices])

  const [multiEditDraftState, setMultiEditDraftState] = useState<MultiEditDraftState | null>(null)

  useEffect(() => {
    if (multiSelectedConfigs.length < 2) {
      setMultiEditDraftState(prev => (prev === null ? prev : null))
      return
    }
    const base = createMultiEditDraft(multiSelectedConfigs, multiSelectedIndices)
    setMultiEditDraftState(prev => syncMultiEditDraft(prev, base))
  }, [multiSelectedConfigs, multiSelectedIndices])

  const setSelectionAnchor = useCallback((idx: number | null) => {
    selectionAnchorRef.current = idx ?? null
  }, [])

  const updateMultiEditField = useCallback(<K extends BuilderFieldKey>(
    key: K,
    commit: MultiEditFieldCommit<BuilderConfig[K], K>,
  ) => {
    setMultiEditDraftState(prev => {
      if (!prev) return prev
      const currentField = prev.fields[key]
      if (!currentField) return prev
      const nextStatus = commit.status ?? 'common'
      const nextValue = cloneBuilderFieldValue(key, commit.value)
      const nextPatch = normalizeFieldPatch(
        key,
        cloneFieldPatch(key, commit.patch),
      )
      const cloneMixed = (values: unknown[] | null | undefined): unknown[] | null => {
        if (!values || values.length === 0) return null
        return values.map((entry) => cloneBuilderFieldValue(key, entry))
      }
      const mixedEqual = (left: unknown[] | null, right: unknown[] | null): boolean => {
        if (!left && !right) return true
        if (!left || !right) return false
        if (left.length !== right.length) return false
        for (let i = 0; i < left.length; i += 1) {
          if (!areBuilderFieldValuesEqual(key, left[i], right[i])) return false
        }
        return true
      }
      const matchesInitial = nextStatus === currentField.initialStatus
        && areBuilderFieldValuesEqual(key, nextValue, currentField.initialValue)
        && nextPatch === null
      const resolvedMixedValues = nextStatus === 'mixed'
        ? (() => {
            if (Array.isArray(commit.mixedValues) && commit.mixedValues.length > 0) {
              return cloneMixed(commit.mixedValues as unknown[])
            }
            return cloneMixed([commit.value] as unknown[])
          })()
        : null
      const nextField = matchesInitial
        ? {
            ...currentField,
            status: currentField.initialStatus,
            value: cloneBuilderFieldValue(key, currentField.initialValue),
            mixedValues: cloneMixed(currentField.initialMixedValues),
            patch: null,
            dirty: false,
          }
        : {
            ...currentField,
            status: nextStatus,
            value: nextValue,
            mixedValues: resolvedMixedValues,
            patch: nextPatch,
            dirty: true,
          }
      if (currentField.status === nextField.status
        && areBuilderFieldValuesEqual(key, currentField.value, nextField.value)
        && mixedEqual(currentField.mixedValues, nextField.mixedValues)
        && areFieldPatchesEqual(
          key,
          currentField.patch as MultiEditFieldPatch<typeof key> | null,
          nextField.patch as MultiEditFieldPatch<typeof key> | null,
        )
        && currentField.dirty === nextField.dirty
      ) {
        return prev
      }
      const nextFields: MultiEditFields = { ...prev.fields }
      nextFields[key] = nextField
      return {
        ...prev,
        fields: nextFields,
      }
    })
  }, [])

  const resetMultiEditField = useCallback((key: BuilderFieldKey) => {
    setMultiEditDraftState(prev => {
      if (!prev) return prev
      const currentField = prev.fields[key]
      if (!currentField) return prev
      const cloneMixed = (values: unknown[] | null): unknown[] | null => {
        if (!values || values.length === 0) return null
        return values.map((entry) => cloneBuilderFieldValue(key, entry))
      }
      const alreadyInitial = !currentField.dirty
        && currentField.status === currentField.initialStatus
        && areBuilderFieldValuesEqual(key, currentField.value, currentField.initialValue)
        && (currentField.patch == null)
        && (() => {
          const left = currentField.mixedValues
          const right = currentField.initialMixedValues
          if (!left && !right) return true
          if (!left || !right) return false
          if (left.length !== right.length) return false
          for (let i = 0; i < left.length; i += 1) {
            if (!areBuilderFieldValuesEqual(key, left[i], right[i])) return false
          }
          return true
        })()
      if (alreadyInitial) return prev
      const resetField = {
        ...currentField,
        status: currentField.initialStatus,
        value: cloneBuilderFieldValue(key, currentField.initialValue),
        mixedValues: cloneMixed(currentField.initialMixedValues),
        patch: null,
        dirty: false,
      }
      const nextFields: MultiEditFields = { ...prev.fields }
      nextFields[key] = resetField
      return {
        ...prev,
        fields: nextFields,
      }
    })
  }, [])

  const resetAllMultiEditFields = useCallback(() => {
    setMultiEditDraftState(prev => {
      if (!prev) return prev
      let changed = false
      const nextFields: MultiEditFields = { ...prev.fields }
      for (const key of BUILDER_FIELD_KEYS) {
        const currentField = prev.fields[key]
        if (!currentField) continue
        const cloneMixed = (values: unknown[] | null): unknown[] | null => {
          if (!values || values.length === 0) return null
          return values.map((entry) => cloneBuilderFieldValue(key, entry))
        }
        const mixedEqual = (left: unknown[] | null, right: unknown[] | null): boolean => {
          if (!left && !right) return true
          if (!left || !right) return false
          if (left.length !== right.length) return false
          for (let i = 0; i < left.length; i += 1) {
            if (!areBuilderFieldValuesEqual(key, left[i], right[i])) return false
          }
          return true
        }
        const needsReset = currentField.dirty
          || currentField.status !== currentField.initialStatus
          || !areBuilderFieldValuesEqual(key, currentField.value, currentField.initialValue)
          || (currentField.patch != null)
          || !mixedEqual(currentField.mixedValues, currentField.initialMixedValues)
        if (!needsReset) {
          nextFields[key] = currentField
          continue
        }
        changed = true
        const resetField = {
          ...currentField,
          status: currentField.initialStatus,
          value: cloneBuilderFieldValue(key, currentField.initialValue),
          mixedValues: cloneMixed(currentField.initialMixedValues),
          patch: null,
          dirty: false,
        }
        nextFields[key] = resetField
      }
      if (!changed) return prev
      return {
        ...prev,
        fields: nextFields,
      }
    })
  }, [])

  const applyMultiEditDraft = useCallback(() => {
    if (!multiEditDraftState) return
    if (multiEditDraftState.selection.length < 2) return
    const dirtyKeys = getDirtyBuilderFieldKeys(multiEditDraftState.fields)
    if (dirtyKeys.length === 0) return
    const selectionSet = new Set(multiEditDraftState.selection)
    const fields = multiEditDraftState.fields
    setCustomCfgs(prev => {
      let changed = false
      const next = prev.map((cfg, idx) => {
        if (!selectionSet.has(idx)) return cfg
        const updated = applyMultiEditFieldsToConfig(cfg, fields, dirtyKeys)
        if (updated !== cfg) changed = true
        return updated
      })
      return changed ? next : prev
    })
    resetAllMultiEditFields()
  }, [multiEditDraftState, resetAllMultiEditFields, setCustomCfgs])

  const multiEditHandle = useMemo<MultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField,
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  useEffect(() => {
    const selected = typeof selectedCfgIdx === 'number' ? [selectedCfgIdx] : []
    setSelectionAnchor(selectedCfgIdx ?? null)
    setSelectedCfgIndicesState(prev => (multiselectActive || arraysEqual(prev, selected) ? prev : selected))
  }, [selectedCfgIdx, multiselectActive, setSelectionAnchor])

  useEffect(() => {
    const empty = customCfgs.length === 0
    if (empty) {
      setSelectionAnchor(null)
      setSelectedCfgIndicesState(prev => (prev.length > 0 ? [] : prev))
    }
  }, [customCfgs.length, setSelectionAnchor])

  const handleConfigHoverIdx = useCallback((idx: number | null) => {
    setHoveredCfgIdx(idx)
  }, [])

  const handleConfigSelect = useCallback((event: MouseEvent, idx: number) => {
    const cfg = customCfgs[idx]
    if (!cfg) return
    if (event.shiftKey && selectionAnchorRef.current !== null) {
      // Shift-click expands the last anchor-to-current range.
      const anchor = selectionAnchorRef.current
      const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
      const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
      setSelectedCfgIndicesState(range)
      setSelectionAnchor(idx)
      setSelectedCfgIdx(idx)
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd toggles individual membership without affecting other selections.
      setSelectedCfgIndicesState(prev => {
        const set = new Set(prev)
        if (set.has(idx)) {
          set.delete(idx)
        } else {
          set.add(idx)
        }
        const next = Array.from(set).sort((a, b) => a - b)
        setSelectedCfgIdx(next.length ? idx : null)
        setSelectionAnchor(next.length ? idx : null)
        if (next.length === 1) {
          const only = customCfgs[next[0]!]!
          if (only) setBuilder(only)
        }
        return next
      })
    } else {
      // Plain click selects a single config and syncs the builder state.
      setSelectedCfgIndicesState([idx])
      setSelectionAnchor(idx)
      setSelectedCfgIdx(idx)
      setBuilder(cfg)
    }
  }, [customCfgs, setBuilder, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigDelete = useCallback((idx: number) => {
    if (selectedCfgIndices.length > 1 && selectedCfgIndices.includes(idx)) {
      requestDeleteMulti(selectedCfgIndices.length)
    } else {
      requestDeleteSingle(idx)
    }
  }, [requestDeleteMulti, requestDeleteSingle, selectedCfgIndices])

  const handleConfigDuplicate = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      const copies = selected.map(i => ({ ...prev[i]! }))
      const insertAfter = Math.max(...selected)
      const insertIdx = Math.min(prev.length, insertAfter + 1)
      const next = [...prev.slice(0, insertIdx), ...copies, ...prev.slice(insertIdx)]
      const newIdxStart = insertIdx
      const newIdxs = copies.map((_, i) => newIdxStart + i)
      setSelectedCfgIndicesState(newIdxs)
      setSelectedCfgIdx(newIdxs[newIdxs.length - 1] ?? null)
      setSelectionAnchor(newIdxs[newIdxs.length - 1] ?? null)
      return next
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigMoveUp = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      const arr = [...prev]
      for (const i of selected) {
        if (i <= 0) continue
        const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
      }
      const selItems = selected.map(i => prev[i]!)
      const selSet = new Set(selItems)
      const newSel: number[] = []
      arr.forEach((item, i) => { if (selSet.has(item)) newSel.push(i) })
      setSelectedCfgIndicesState(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      setSelectionAnchor(newSel[newSel.length - 1] ?? null)
      return arr
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigMoveDown = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      const arr = [...prev]
      for (let k = selected.length - 1; k >= 0; k -= 1) {
        const i = selected[k]!
        if (i >= arr.length - 1) continue
        const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
      }
      const selItems = selected.map(i => prev[i]!)
      const selSet = new Set(selItems)
      const newSel: number[] = []
      arr.forEach((item, i) => { if (selSet.has(item)) newSel.push(i) })
      setSelectedCfgIndicesState(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      setSelectionAnchor(newSel[newSel.length - 1] ?? null)
      return arr
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigMoveTop = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      if (selected[0] === 0) return prev
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...block, ...remaining]
      const newSel = selected.map((_, i) => i)
      setSelectedCfgIndicesState(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      setSelectionAnchor(newSel[newSel.length - 1] ?? null)
      return next
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigMoveBottom = useCallback((idx: number) => {
    const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
      ? selectedCfgIndices.slice().sort((a, b) => a - b)
      : [idx]
    setCustomCfgs(prev => {
      if (selected[selected.length - 1] === prev.length - 1) return prev
      const remaining = prev.filter((_, i) => !selected.includes(i))
      const block = selected.map(i => prev[i]!)
      const next = [...remaining, ...block]
      const base = next.length - block.length
      const newSel = block.map((_, i) => base + i)
      setSelectedCfgIndicesState(newSel)
      setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
      setSelectionAnchor(newSel[newSel.length - 1] ?? null)
      return next
    })
  }, [selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor])

  const handleSelectAllConfigs = useCallback(() => {
    const all = customCfgs.map((_, i) => i)
    const prevSelected = selectedCfgIdx
    const nextSelected = typeof prevSelected === 'number' && prevSelected >= 0 && prevSelected < all.length
      ? prevSelected
      : (all.length > 0 ? all[0]! : null)
    setSelectedCfgIndicesState(all)
    setSelectedCfgIdx((current) => {
      if (current === nextSelected) return current
      return nextSelected
    })
    setSelectionAnchor(nextSelected)
  }, [customCfgs, selectedCfgIdx, setSelectedCfgIdx, setSelectionAnchor])

  const handleClearSelection = useCallback(() => {
    setSelectedCfgIndicesState([])
    setSelectedCfgIdx(null)
    setSelectionAnchor(null)
  }, [setSelectedCfgIdx, setSelectionAnchor])

  return {
    selectedCfgIndices,
    setSelectedCfgIndices: setSelectedCfgIndicesState,
    multiselectActive,
    hoveredCfgIdx,
    setHoveredCfgIdx,
    handleConfigHoverIdx,
    multiSelectedConfigs,
    multiEditHandle,
    applyMultiEditDraft,
    handleConfigSelect,
    handleConfigDelete,
    handleConfigDuplicate,
    handleConfigMoveUp,
    handleConfigMoveDown,
    handleConfigMoveTop,
    handleConfigMoveBottom,
    handleSelectAllConfigs,
    handleClearSelection,
    setSelectionAnchor,
  }
}
