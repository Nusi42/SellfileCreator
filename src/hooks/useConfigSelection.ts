import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type MouseEvent, type MutableRefObject, type SetStateAction } from 'react'
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
import type { DescribeNextChangeFn } from '../hooks/useHsfcHistory'
import { describeConfigsDuplicated, describeConfigsMoved, describeMultiEditApplied } from '../history/configCollectionDescriptors'
import { buildConfigLabel, type TranslateFn } from '../history/builderUpdateDescriptor'
import { setConfigHoverIndex } from '../lib/configHoverBridge'

type UseConfigSelectionParams = {
  customCfgs: BuilderConfig[]
  setCustomCfgs: Dispatch<SetStateAction<BuilderConfig[]>>
  selectedCfgIdx: number | null
  setSelectedCfgIdx: Dispatch<SetStateAction<number | null>>
  setBuilder: Dispatch<SetStateAction<BuilderConfig>>
  onWillChangeSelection?: ((previous: number[], next: number[]) => void) | undefined
  requestDeleteSingle: (idx: number) => void
  requestDeleteMulti: (targets: number[]) => void
  describeNextChange: DescribeNextChangeFn
  t: TranslateFn
  suppressSelectionDraft: <T>(fn: () => T) => T
  visibleConfigIndicesRef: MutableRefObject<ReadonlySet<number> | null>
}

export type UseConfigSelectionResult = {
  selectedCfgIndices: number[]
  setSelectedCfgIndices: (next: number[]) => void
  multiselectActive: boolean
  selectionAnchor: number | null
  prepareDragSelection: (idx: number) => number[]
  setHoveredCfgIdx: (idx: number | null) => void
  handleConfigHoverIdx: (idx: number | null) => void
  multiSelectedConfigs: BuilderConfig[]
  multiEditDraftState: MultiEditDraftState | null
  setMultiEditDraftState: Dispatch<SetStateAction<MultiEditDraftState | null>>
  multiEditHandle: MultiEditDraftHandle | null
  applyMultiEditDraft: () => void
  handleConfigSelect: (event: MouseEvent, idx: number) => void
  handleConfigDelete: (idx: number) => void
  handleConfigDuplicate: (idx: number) => void
  handleConfigMoveUp: (idx: number) => void
  handleConfigMoveDown: (idx: number) => void
  handleConfigMoveTop: (idx: number) => void
  handleConfigMoveBottom: (idx: number) => void
  handleConfigReorder: (movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void
  handleSelectAllConfigs: () => void
  handleClearSelection: () => void
  setSelectionAnchor: Dispatch<SetStateAction<number | null>>
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
  onWillChangeSelection,
  requestDeleteSingle,
  requestDeleteMulti,
  describeNextChange,
  t,
  suppressSelectionDraft,
  visibleConfigIndicesRef,
}: UseConfigSelectionParams): UseConfigSelectionResult {
  const [selectedCfgIndices, setSelectedCfgIndicesState] = useState<number[]>([])
  const selectionAnchorRef = useRef<number | null>(null)
  const [selectionAnchor, setSelectionAnchorState] = useState<number | null>(null)
  const selectedIndicesRef = useRef<number[]>([])
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
    selectedIndicesRef.current = selectedCfgIndices
  }, [selectedCfgIndices])

  const applySelection = useCallback((nextSelection: number[]) => {
    const normalized = nextSelection.slice()
    const prevSelection = selectedIndicesRef.current
    if (arraysEqual(prevSelection, normalized)) return
    if (onWillChangeSelection) {
      onWillChangeSelection(prevSelection.slice(), normalized.slice())
    }
    selectedIndicesRef.current = normalized
    setSelectedCfgIndicesState(normalized)
  }, [onWillChangeSelection])

  useEffect(() => {
    if (multiSelectedConfigs.length < 2) {
      setMultiEditDraftState(prev => (prev === null ? prev : null))
      return
    }
    const base = createMultiEditDraft(multiSelectedConfigs, multiSelectedIndices)
    setMultiEditDraftState(prev => syncMultiEditDraft(prev, base))
  }, [multiSelectedConfigs, multiSelectedIndices])

  const setSelectionAnchor = useCallback<Dispatch<SetStateAction<number | null>>>((value) => {
    const next = typeof value === 'function'
      ? (value as (prev: number | null) => number | null)(selectionAnchorRef.current)
      : (value ?? null)
    if (selectionAnchorRef.current === next) return
    selectionAnchorRef.current = next
    setSelectionAnchorState(next)
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
      const entries: Array<{ index: number; previous: BuilderConfig; next: BuilderConfig }> = []
      const next = prev.map((cfg, idx) => {
        if (!selectionSet.has(idx)) return cfg
        const updated = applyMultiEditFieldsToConfig(cfg, fields, dirtyKeys)
        if (updated !== cfg) {
          changed = true
          entries.push({ index: idx, previous: cfg, next: updated })
          return updated
        }
        return cfg
      })
      if (!changed) {
        describeNextChange(null)
        return prev
      }
      const descriptor = describeMultiEditApplied({
        entries,
        dirtyKeys,
        t,
      })
      describeNextChange(descriptor)
      return next
    })
    resetAllMultiEditFields()
  }, [describeNextChange, multiEditDraftState, resetAllMultiEditFields, setCustomCfgs, t])

  const multiEditHandle = useMemo<MultiEditDraftHandle | null>(() => {
    if (!multiEditDraftState) return null
    return {
      state: multiEditDraftState,
      updateField: updateMultiEditField,
      resetField: resetMultiEditField,
      resetAll: resetAllMultiEditFields,
    }
  }, [multiEditDraftState, resetAllMultiEditFields, resetMultiEditField, updateMultiEditField])

  const setHoveredCfgIdx = useCallback((idx: number | null) => {
    setConfigHoverIndex(idx)
  }, [])

  const handleConfigHoverIdx = useCallback((idx: number | null) => {
    setConfigHoverIndex(idx)
  }, [])

  const prepareDragSelection = useCallback((idx: number): number[] => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= customCfgs.length) return []
    const alreadySelected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 0
    if (alreadySelected) {
      return selectedCfgIndices.slice().sort((a, b) => a - b)
    }
    const cfg = customCfgs[idx]
    applySelection([idx])
    setSelectedCfgIdx(idx)
    setSelectionAnchor(idx)
    if (cfg) {
      setBuilder(cfg)
    }
    return [idx]
  }, [applySelection, customCfgs, selectedCfgIndices, setBuilder, setSelectedCfgIdx, setSelectionAnchor])

  const handleConfigSelect = useCallback((event: MouseEvent, idx: number) => {
    const cfg = customCfgs[idx]
    if (!cfg) return

    const computeNext = (prev: number[]): number[] => {
      if (event.shiftKey && selectionAnchorRef.current !== null) {
        const anchor = selectionAnchorRef.current
        const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
        const visibleSet = visibleConfigIndicesRef?.current ?? null
        if (!visibleSet || visibleSet.size === 0) {
          return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
        }
        const span: number[] = []
        for (let i = lo; i <= hi; i += 1) {
          if (visibleSet.has(i)) span.push(i)
        }
        if (span.length === 0) {
          return visibleSet.has(idx) ? [idx] : []
        }
        return span
      }
      if (event.ctrlKey || event.metaKey) {
        const set = new Set(prev)
        if (set.has(idx)) {
          set.delete(idx)
        } else {
          set.add(idx)
        }
        return Array.from(set).sort((a, b) => a - b)
      }
      return [idx]
    }

    const previousSelection = selectedCfgIndices
    const computedSelection = computeNext(previousSelection)
    if (!arraysEqual(previousSelection, computedSelection)) {
      applySelection(computedSelection)
    }
    const finalSelection = arraysEqual(previousSelection, computedSelection) ? previousSelection : computedSelection
    const last = finalSelection.length ? finalSelection[finalSelection.length - 1] : null

    if (selectionAnchorRef.current !== (last ?? null)) {
      setSelectionAnchor(last ?? null)
    }
    if (selectedCfgIdx !== (last ?? null)) {
      setSelectedCfgIdx(last ?? null)
    }

    if (finalSelection.length === 1) {
      const only = customCfgs[finalSelection[0]!]
      if (only) setBuilder(only)
    }
  }, [applySelection, customCfgs, selectedCfgIdx, selectedCfgIndices, setBuilder, setSelectedCfgIdx, setSelectionAnchor, visibleConfigIndicesRef])

  const handleConfigDelete = useCallback((idx: number) => {
    if (selectedCfgIndices.length > 1 && selectedCfgIndices.includes(idx)) {
      const targets = selectedCfgIndices.slice().sort((a, b) => a - b)
      requestDeleteMulti(targets)
    } else {
      requestDeleteSingle(idx)
    }
  }, [requestDeleteMulti, requestDeleteSingle, selectedCfgIndices])

  // Config mutations emit their own history descriptors; guard selection changes so they do not add extra draft entries.
  const handleConfigDuplicate = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      setCustomCfgs(prev => {
        const copies = selected
          .map(i => (i >= 0 && i < prev.length ? prev[i] : undefined))
          .filter((cfg): cfg is BuilderConfig => Boolean(cfg))
          .map(cfg => ({ ...cfg }))
        if (copies.length === 0) {
          describeNextChange(null)
          return prev
        }
        const insertAfter = Math.max(...selected)
        const insertIdx = Math.min(prev.length, insertAfter + 1)
        const next = [...prev.slice(0, insertIdx), ...copies, ...prev.slice(insertIdx)]
        const labels: string[] = []
        for (let i = 0; i < copies.length; i += 1) {
          const newIdx = insertIdx + i
          const cfg = next[newIdx]
          if (!cfg) continue
          labels.push(buildConfigLabel(newIdx, cfg, t))
        }
        const descriptor = describeConfigsDuplicated({
          insertIndex: insertIdx,
          labels,
          previous: prev,
          t,
        })
        describeNextChange(descriptor)
        const newIdxStart = insertIdx
        const newIdxs = copies.map((_, i) => newIdxStart + i)
        applySelection(newIdxs)
        setSelectedCfgIdx(newIdxs[newIdxs.length - 1] ?? null)
        setSelectionAnchor(newIdxs[newIdxs.length - 1] ?? null)
        return next
      })
    })
  }, [applySelection, describeNextChange, selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleConfigMoveUp = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      setCustomCfgs(prev => {
        const arr = [...prev]
        let changed = false
        for (const i of selected) {
          if (i <= 0) continue
          if (!arr[i] || !arr[i - 1]) continue
          changed = true
          const tmp = arr[i - 1]!; arr[i - 1] = arr[i]!; arr[i] = tmp
        }
        if (!changed) {
          describeNextChange(null)
          return prev
        }
        const descriptor = describeConfigsMoved({
          prev,
          next: arr,
          selection: selected,
          direction: 'up',
          t,
        })
        describeNextChange(descriptor)
        const selItems = selected
          .map(i => prev[i])
          .filter((cfg): cfg is BuilderConfig => Boolean(cfg))
        const selSet = new Set(selItems)
        const newSel: number[] = []
        arr.forEach((item, i) => { if (selSet.has(item)) newSel.push(i) })
        applySelection(newSel)
        setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
        setSelectionAnchor(newSel[newSel.length - 1] ?? null)
        return arr
      })
    })
  }, [applySelection, describeNextChange, selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleConfigMoveDown = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      setCustomCfgs(prev => {
        const arr = [...prev]
        let changed = false
        for (let k = selected.length - 1; k >= 0; k -= 1) {
          const i = selected[k]!
          if (i >= arr.length - 1) continue
          if (!arr[i] || !arr[i + 1]) continue
          changed = true
          const tmp = arr[i + 1]!; arr[i + 1] = arr[i]!; arr[i] = tmp
        }
        if (!changed) {
          describeNextChange(null)
          return prev
        }
        const descriptor = describeConfigsMoved({
          prev,
          next: arr,
          selection: selected,
          direction: 'down',
          t,
        })
        describeNextChange(descriptor)
        const selItems = selected
          .map(i => prev[i])
          .filter((cfg): cfg is BuilderConfig => Boolean(cfg))
        const selSet = new Set(selItems)
        const newSel: number[] = []
        arr.forEach((item, i) => { if (selSet.has(item)) newSel.push(i) })
        applySelection(newSel)
        setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
        setSelectionAnchor(newSel[newSel.length - 1] ?? null)
        return arr
      })
    })
  }, [applySelection, describeNextChange, selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleConfigMoveTop = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      setCustomCfgs(prev => {
        if (selected[0] === 0) {
          describeNextChange(null)
          return prev
        }
        const remaining = prev.filter((_, i) => !selected.includes(i))
        const block = selected.map(i => prev[i]!)
        const next = [...block, ...remaining]
        const descriptor = describeConfigsMoved({
          prev,
          next,
          selection: selected,
          direction: 'top',
          t,
        })
        describeNextChange(descriptor)
        const newSel = selected.map((_, i) => i)
        applySelection(newSel)
        setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
        setSelectionAnchor(newSel[newSel.length - 1] ?? null)
        return next
      })
    })
  }, [applySelection, describeNextChange, selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleConfigMoveBottom = useCallback((idx: number) => {
    suppressSelectionDraft(() => {
      const selected = selectedCfgIndices.includes(idx) && selectedCfgIndices.length > 1
        ? selectedCfgIndices.slice().sort((a, b) => a - b)
        : [idx]
      setCustomCfgs(prev => {
        if (selected[selected.length - 1] === prev.length - 1) {
          describeNextChange(null)
          return prev
        }
        const remaining = prev.filter((_, i) => !selected.includes(i))
        const block = selected.map(i => prev[i]!)
        const next = [...remaining, ...block]
        const descriptor = describeConfigsMoved({
          prev,
          next,
          selection: selected,
          direction: 'bottom',
          t,
        })
        describeNextChange(descriptor)
        const base = next.length - block.length
        const newSel = block.map((_, i) => base + i)
        applySelection(newSel)
        setSelectedCfgIdx(newSel[newSel.length - 1] ?? null)
        setSelectionAnchor(newSel[newSel.length - 1] ?? null)
        return next
      })
    })
  }, [applySelection, describeNextChange, selectedCfgIndices, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleConfigReorder = useCallback((movingIndices: number[], rawTargetIndex: number, options?: { mode?: 'move' | 'copy' }) => {
    if (!Array.isArray(movingIndices) || movingIndices.length === 0) return
    suppressSelectionDraft(() => {
      setCustomCfgs(prev => {
        const mode = options?.mode === 'copy' ? 'copy' : 'move'
        if (mode === 'move' && prev.length <= 1) {
          describeNextChange(null)
          return prev
        }
        const sanitized = Array.from(new Set(
          movingIndices
            .map((idx) => (Number.isInteger(idx) ? Number(idx) : -1))
            .filter((idx) => idx >= 0 && idx < prev.length),
        )).sort((a, b) => a - b)
        if (sanitized.length === 0) {
          describeNextChange(null)
          return prev
        }
        const movingItems = sanitized
          .map((idx) => prev[idx])
          .filter((cfg): cfg is BuilderConfig => Boolean(cfg))
        if (movingItems.length === 0) {
          describeNextChange(null)
          return prev
        }
        const clampedTarget = Math.max(0, Math.min(prev.length, rawTargetIndex))
        if (mode === 'copy') {
          const copies = movingItems.map(cfg => ({ ...cfg }))
          if (copies.length === 0) {
            describeNextChange(null)
            return prev
          }
          const next = [
            ...prev.slice(0, clampedTarget),
            ...copies,
            ...prev.slice(clampedTarget),
          ]
          const labels: string[] = []
          for (let i = 0; i < copies.length; i += 1) {
            const newIdx = clampedTarget + i
            const cfg = next[newIdx]
            if (!cfg) continue
            labels.push(buildConfigLabel(newIdx, cfg, t))
          }
          const descriptor = describeConfigsDuplicated({
            insertIndex: clampedTarget,
            labels,
            previous: prev,
            t,
          })
          describeNextChange(descriptor)
          const newSelection = copies.map((_, offset) => clampedTarget + offset)
          applySelection(newSelection)
          const last = newSelection[newSelection.length - 1] ?? null
          setSelectedCfgIdx(last)
          setSelectionAnchor(last)
          return next
        }
        const minSel = sanitized[0]!
        const maxSel = sanitized[sanitized.length - 1]!
        if (clampedTarget >= minSel && clampedTarget <= maxSel + 1) {
          describeNextChange(null)
          return prev
        }
        const selectionSet = new Set(sanitized)
        const remaining = prev.filter((_, idx) => !selectionSet.has(idx))
        let insertIdx = clampedTarget
        for (const idx of sanitized) {
          if (idx < clampedTarget) insertIdx -= 1
        }
        insertIdx = Math.max(0, Math.min(remaining.length, insertIdx))
        const next = [
          ...remaining.slice(0, insertIdx),
          ...movingItems,
          ...remaining.slice(insertIdx),
        ]
        const newSelection = movingItems.map((_, offset) => insertIdx + offset)
        const newMin = newSelection[0] ?? insertIdx
        const atTop = insertIdx === 0
        const atBottom = insertIdx === remaining.length
        let direction: 'up' | 'down' | 'top' | 'bottom' = 'down'
        if (atTop) {
          direction = 'top'
        } else if (atBottom) {
          direction = 'bottom'
        } else if (newMin < minSel) {
          direction = 'up'
        } else {
          direction = 'down'
        }
        const descriptor = describeConfigsMoved({
          prev,
          next,
          selection: sanitized,
          direction,
          t,
        })
        describeNextChange(descriptor)
        applySelection(newSelection)
        const last = newSelection[newSelection.length - 1] ?? null
        setSelectedCfgIdx(last)
        setSelectionAnchor(last)
        return next
      })
    })
  }, [applySelection, describeNextChange, setCustomCfgs, setSelectedCfgIdx, setSelectionAnchor, suppressSelectionDraft, t])

  const handleSelectAllConfigs = useCallback(() => {
    const visibleSet = visibleConfigIndicesRef?.current ?? null
    const all = visibleSet
      ? Array.from(visibleSet)
        .filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < customCfgs.length)
        .sort((a, b) => a - b)
      : customCfgs.map((_, i) => i)
    applySelection(all)
    const nextSelected = (() => {
      if (!all.length) return null
      if (typeof selectedCfgIdx === 'number' && selectedCfgIdx >= 0 && selectedCfgIdx < customCfgs.length && (!visibleSet || visibleSet.has(selectedCfgIdx))) {
        return selectedCfgIdx
      }
      return all[0]!
    })()
    setSelectedCfgIdx(nextSelected)
    setSelectionAnchor(nextSelected)
  }, [applySelection, customCfgs, selectedCfgIdx, setSelectedCfgIdx, setSelectionAnchor, visibleConfigIndicesRef])

  const handleClearSelection = useCallback(() => {
    applySelection([])
    setSelectedCfgIdx(null)
    setSelectionAnchor(null)
  }, [applySelection, setSelectedCfgIdx, setSelectionAnchor])

  return {
    selectedCfgIndices,
    setSelectedCfgIndices: applySelection,
    multiselectActive,
    selectionAnchor,
    prepareDragSelection,
    setHoveredCfgIdx,
    handleConfigHoverIdx,
    multiSelectedConfigs,
    multiEditDraftState,
    setMultiEditDraftState,
    multiEditHandle,
    applyMultiEditDraft,
    handleConfigSelect,
    handleConfigDelete,
    handleConfigDuplicate,
    handleConfigMoveUp,
    handleConfigMoveDown,
    handleConfigMoveTop,
    handleConfigMoveBottom,
    handleConfigReorder,
    handleSelectAllConfigs,
    handleClearSelection,
    setSelectionAnchor,
  }
}
