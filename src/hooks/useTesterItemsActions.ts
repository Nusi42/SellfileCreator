/**
 * useTesterItemsActions
 *
 * This hook centralizes the helper callbacks that mutate imported gear entries.
 * App.tsx stays leaner, and the shared logic is now easier to exercise.
 * Every block is documented heavily per the orchestration guidelines.
 */
import { useCallback } from 'react'
import { diffRuleTesterItems, type RuleTesterItem } from '../lib/ruleTesterSession'
import type { TestItem } from '../lib/ruleEval'

/**
 * Arguments required to build the tester-item helpers.
 * All state setters + refs live in App.tsx and are forwarded here.
 */
type UseTesterItemsActionsOptions = {
  allocTesterItemId: () => number
  setTesterItems: React.Dispatch<React.SetStateAction<RuleTesterItem[]>>
  testerItemsRef: React.MutableRefObject<RuleTesterItem[]>
  pendingTesterItemsRef: React.MutableRefObject<TestItem[]>
  setPendingTesterItems: React.Dispatch<React.SetStateAction<TestItem[]>>
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
type TesterItemsActions = {
  appendTesterRuleItems: (items: TestItem[]) => void
  applyGearDbDiff: (desiredTesterItems: TestItem[], mode: 'manual' | 'command') => GearDbDiffSummary
}

/**
 * Expose the shared tester-item helpers so App.tsx only wires state.
 * Each callback is heavily commented and keeps the Rule Tester math isolated.
 */
export function useTesterItemsActions(options: UseTesterItemsActionsOptions): TesterItemsActions {
  // Destructure once so the callbacks always read the same values.
  const {
    allocTesterItemId,
    setTesterItems,
    testerItemsRef,
    pendingTesterItemsRef,
    setPendingTesterItems,
  } = options

  /**
   * Append incoming gear entries (from commands or manual adds).
   * Every artifact gets a stable `itemId` so matcher diffs stay deterministic.
   */
  const appendTesterRuleItems = useCallback((items: TestItem[]) => {
    // Ignore empty payloads so we do not churn the tester-item array.
    if (!items || items.length === 0) return
    setTesterItems((prev) => {
      // Re-read inside the setter to avoid stale closures on `items`.
      if (items.length === 0) return prev
      const next = prev.slice()
      // Assign ids sequentially so replaying imports yields the same keys.
      for (const addition of items) {
        const assignedItemId = allocTesterItemId()
        // Clone the addition to avoid mutating external references.
        next.push({ ...(addition as RuleTesterItem), itemId: assignedItemId })
      }
      return next
    })
  }, [allocTesterItemId, setTesterItems])

  /**
   * Diff the gear queue after a Gear DB import or an automation command.
   * Returns a summary so the caller can toast how many artifacts changed.
   */
  const applyGearDbDiff = useCallback((desiredTesterItems: TestItem[], mode: 'manual' | 'command'): GearDbDiffSummary => {
    // Manual imports ignore the pending queue so users see instant changes.
    const pendingQueueInput = mode === 'manual' ? [] : pendingTesterItemsRef.current
    // Compute which tester rows should leave or join the preview grid.
    const { removalItemIds, nextPendingQueue, additions } = diffRuleTesterItems(
      testerItemsRef.current,
      desiredTesterItems,
      pendingQueueInput,
      { retainManualItems: true },
    )
    const removedCount = removalItemIds.length
    // When items disappeared from the import payload, drop them immediately.
    if (removalItemIds.length > 0) {
      const removalSet = new Set(removalItemIds)
      setTesterItems((prev) => prev.filter((item) => !removalSet.has(item.itemId)))
    }
    if (mode === 'manual') {
      // Manual drops flush pending entries because we import the entire queue.
      setPendingTesterItems([])
      appendTesterRuleItems(additions)
      return { removedCount, addedCount: additions.length }
    }
    // Command imports reuse the pending queue so the async diff stays stable.
    if (nextPendingQueue !== pendingTesterItemsRef.current) {
      setPendingTesterItems(nextPendingQueue)
    }
    return { removedCount, addedCount: additions.length }
  }, [appendTesterRuleItems, pendingTesterItemsRef, setPendingTesterItems, setTesterItems, testerItemsRef])

  // Return both helpers so callers can hook into whichever entry point they need.
  return { appendTesterRuleItems, applyGearDbDiff }
}
