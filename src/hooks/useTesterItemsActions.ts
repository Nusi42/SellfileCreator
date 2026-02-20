/**
 * useTesterItemsActions
 *
 * This hook centralizes the helper callbacks that mutate imported gear entries.
 * App.tsx stays leaner, and the shared logic is now easier to exercise.
 * Every block is documented heavily per the orchestration guidelines.
 */
import { useCallback } from 'react'
import { diffRuleTesterItems, isManualTesterItem, type RuleTesterItem } from '../lib/ruleTesterSession'
import type { TestItem } from '../lib/ruleEval'

/**
 * Arguments required to build the tester-item helpers.
 * All state setters + refs live in App.tsx and are forwarded here.
 */
type UseTesterItemsActionsOptions = {
  allocTesterItemId: () => number
  setTesterItems: React.Dispatch<React.SetStateAction<RuleTesterItem[]>>
  testerItemsRef: React.MutableRefObject<RuleTesterItem[]>
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
  applyGearDbDiff: (desiredTesterItems: TestItem[]) => GearDbDiffSummary
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
  } = options

  /**
   * Build appended tester rows with assigned runtime ids.
   * Keeping this logic centralized ensures every writer path allocates ids
   * with the same sequence and payload cloning behavior.
   */
  const appendToSnapshot = useCallback((base: RuleTesterItem[], items: TestItem[]): RuleTesterItem[] => {
    if (!items || items.length === 0) return base
    const next = base.slice()
    for (const addition of items) {
      const assignedItemId = allocTesterItemId()
      next.push({ ...(addition as RuleTesterItem), itemId: assignedItemId })
    }
    return next
  }, [allocTesterItemId])

  /**
   * Append incoming gear entries (from commands or manual adds).
   * Every artifact gets a stable `itemId` so matcher diffs stay deterministic.
   */
  const appendTesterRuleItems = useCallback((items: TestItem[]) => {
    // Ignore empty payloads so we do not churn the tester-item array.
    if (!items || items.length === 0) return
    // Apply against the shared ref first so back-to-back endpoint pushes do not
    // diff against stale React state while updates are still batched.
    const next = appendToSnapshot(testerItemsRef.current, items)
    testerItemsRef.current = next
    // Publish the same snapshot to React state for rendering.
    setTesterItems(next)
  }, [appendToSnapshot, setTesterItems, testerItemsRef])

  /**
   * Diff the gear queue after a Gear DB import or an automation command.
   * Returns a summary so the caller can toast how many artifacts changed.
   */
  const applyGearDbDiff = useCallback((desiredTesterItems: TestItem[]): GearDbDiffSummary => {
    // Read from the shared ref so each command applies to the latest snapshot,
    // even when React has not committed previous queue updates yet.
    const currentSnapshot = testerItemsRef.current
    // Compute which gear entries should leave or join the preview grid.
    const { removalItemIds, additions } = diffRuleTesterItems(
      currentSnapshot,
      desiredTesterItems,
      [],
      { retainManualItems: true },
    )
    const removedCount = removalItemIds.length
    const removalSet = removalItemIds.length > 0 ? new Set(removalItemIds) : null
    // Keep manual rows regardless of endpoint churn so user-crafted samples persist.
    const afterRemoval = removalSet
      ? currentSnapshot.filter((item) => isManualTesterItem(item) || !removalSet.has(item.itemId))
      : currentSnapshot
    // Append desired additions after removals so queue order mirrors imports.
    const next = appendToSnapshot(afterRemoval, additions)
    // Sync ref before state so rapid endpoint bursts stay deterministic.
    testerItemsRef.current = next
    setTesterItems(next)
    return { removedCount, addedCount: additions.length }
  }, [appendToSnapshot, setTesterItems, testerItemsRef])

  // Return both helpers so callers can hook into whichever entry point they need.
  return { appendTesterRuleItems, applyGearDbDiff }
}
