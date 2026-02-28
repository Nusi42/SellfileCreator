/**
 * useGearInspectorItemsActions
 *
 * This hook centralizes the helper callbacks that mutate imported gear entries.
 * App.tsx stays leaner, and the shared logic is now easier to exercise.
 * Every block is documented heavily per the orchestration guidelines.
 */
import { useCallback } from 'react'
import { diffGearInspectorItems, isManualGearInspectorItem, type GearInspectorItem } from '../lib/gearInspectorSession'
import type { TestItem } from '../lib/ruleEval'

/**
 * Arguments required to build the gear-inspector-item helpers.
 * All state setters + refs live in App.tsx and are forwarded here.
 */
type UseGearInspectorItemsActionsOptions = {
  allocGearInspectorItemId: () => number
  setGearInspectorItems: React.Dispatch<React.SetStateAction<GearInspectorItem[]>>
  gearInspectorItemsRef: React.MutableRefObject<GearInspectorItem[]>
}

/**
 * Summary emitted by applyGearDbDiff so callers can show toasts.
 * The counts match what the UI surface already expects.
 */
type GearDbDiffSummary = {
  removedCount: number
  addedCount: number
}

/**
 * Small helper so the return signature stays self-documenting.
 * The tuple mirrors the hook return signature in App.tsx.
 */
type GearInspectorItemsActions = {
  appendGearInspectorRuleItems: (items: TestItem[]) => void
  applyGearDbDiff: (desiredGearInspectorItems: TestItem[]) => GearDbDiffSummary
}

/**
 * Expose the shared gear-inspector-item helpers so App.tsx only wires state.
 * Each callback is heavily commented and keeps the Gear Inspector math isolated.
 */
export function useGearInspectorItemsActions(options: UseGearInspectorItemsActionsOptions): GearInspectorItemsActions {
  // Destructure once so the callbacks always read the same values.
  const {
    allocGearInspectorItemId,
    setGearInspectorItems,
    gearInspectorItemsRef,
  } = options

  /**
   * Build appended gear inspector rows with assigned runtime ids.
   * Keeping this logic centralized ensures every writer path allocates ids
   * with the same sequence and payload cloning behavior.
   */
  const appendToSnapshot = useCallback((base: GearInspectorItem[], items: TestItem[]): GearInspectorItem[] => {
    if (!items || items.length === 0) return base
    const next = base.slice()
    for (const addition of items) {
      const assignedItemId = allocGearInspectorItemId()
      next.push({ ...(addition as GearInspectorItem), itemId: assignedItemId })
    }
    return next
  }, [allocGearInspectorItemId])

  /**
   * Append incoming gear entries (from commands or manual adds).
   * Every artifact gets a stable `itemId` so matcher diffs stay deterministic.
   */
  const appendGearInspectorRuleItems = useCallback((items: TestItem[]) => {
    // Ignore empty payloads so we do not churn the gear-inspector-item array.
    if (!items || items.length === 0) return
    // Apply against the shared ref first so back-to-back endpoint pushes do not
    // diff against stale React state while updates are still batched.
    const next = appendToSnapshot(gearInspectorItemsRef.current, items)
    gearInspectorItemsRef.current = next
    // Publish the same snapshot to React state for rendering.
    setGearInspectorItems(next)
  }, [appendToSnapshot, setGearInspectorItems, gearInspectorItemsRef])

  /**
   * Diff the gear queue after a Gear DB import or an automation command.
   * Returns a summary so the caller can toast how many artifacts changed.
   */
  const applyGearDbDiff = useCallback((desiredGearInspectorItems: TestItem[]): GearDbDiffSummary => {
    // Read from the shared ref so each command applies to the latest snapshot,
    // even when React has not committed previous queue updates yet.
    const currentSnapshot = gearInspectorItemsRef.current
    // Compute which gear entries should leave or join the preview grid.
    const { removalItemIds, additions } = diffGearInspectorItems(
      currentSnapshot,
      desiredGearInspectorItems,
      [],
      { retainManualItems: true },
    )
    const removedCount = removalItemIds.length
    const removalSet = removalItemIds.length > 0 ? new Set(removalItemIds) : null
    // Keep manual rows regardless of endpoint churn so user-crafted samples persist.
    const afterRemoval = removalSet
      ? currentSnapshot.filter((item) => isManualGearInspectorItem(item) || !removalSet.has(item.itemId))
      : currentSnapshot
    // Append desired additions after removals so queue order mirrors imports.
    const next = appendToSnapshot(afterRemoval, additions)
    // Sync ref before state so rapid endpoint bursts stay deterministic.
    gearInspectorItemsRef.current = next
    setGearInspectorItems(next)
    return { removedCount, addedCount: additions.length }
  }, [appendToSnapshot, setGearInspectorItems, gearInspectorItemsRef])

  // Return both helpers so callers can hook into whichever entry point they need.
  return { appendGearInspectorRuleItems, applyGearDbDiff }
}
