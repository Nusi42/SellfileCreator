/**
 * useBuilderPanelPrefs.ts
 *
 * Shared preference management for builder panels (recipe and safeguard).
 *
 * Encapsulates auto-apply / auto-reset mutual exclusivity so neither panel
 * needs to duplicate the "turning on X turns off Y" coupling logic.
 */
import { useCallback, useEffect } from 'react'
import { useAutoApplyBuilderPreference, useAutoResetAfterInsertPreference } from '../../state/builderPreferences'

export type UseBuilderPanelPrefsResult = {
  /** True when auto-apply-on-selection is enabled. */
  autoApply: boolean
  /** True when auto-reset-after-insert is enabled. */
  autoReset: boolean
  /**
   * Toggle auto-apply, turning off auto-reset when enabling it.
   * Optional onDisabled callback runs when auto-apply is turned off (e.g. to
   * cancel a pending debounced apply in RecipeBuilderPanel).
   */
  setAutoApplyExclusive: (next: boolean) => void
  /**
   * Toggle auto-reset, turning off auto-apply when enabling it.
   */
  setAutoResetExclusive: (next: boolean) => void
}

type UseBuilderPanelPrefsOptions = {
  /**
   * Called when auto-apply is turned off (either by setAutoApplyExclusive(false)
   * or by setAutoResetExclusive(true) implicitly disabling auto-apply).
   * Use this to cancel any pending debounced-apply timeouts.
   */
  onAutoApplyDisabled?: () => void
}

/**
 * useBuilderPanelPrefs
 *
 * Reads and writes the shared auto-apply and auto-reset preferences, enforcing
 * mutual exclusivity (only one can be active at a time).
 */
export function useBuilderPanelPrefs({
  onAutoApplyDisabled,
}: UseBuilderPanelPrefsOptions = {}): UseBuilderPanelPrefsResult {
  const [autoApply, setAutoApply] = useAutoApplyBuilderPreference()
  const [autoReset, setAutoReset] = useAutoResetAfterInsertPreference()

  // Enforce mutual exclusivity: if both are somehow on (e.g. after migration from
  // a stored state where only one flag existed), turn off auto-reset.
  useEffect(() => {
    if (autoApply && autoReset) {
      setAutoReset(false)
    }
  }, [autoApply, autoReset, setAutoReset])

  const setAutoApplyExclusive = useCallback((next: boolean) => {
    setAutoApply(next)
    // Enabling auto-apply disables auto-reset to keep them mutually exclusive.
    if (next && autoReset) setAutoReset(false)
    // Notify caller when auto-apply is disabled so it can cancel pending debounced applies.
    if (!next) onAutoApplyDisabled?.()
  }, [autoReset, onAutoApplyDisabled, setAutoApply, setAutoReset])

  const setAutoResetExclusive = useCallback((next: boolean) => {
    setAutoReset(next)
    // Enabling auto-reset disables auto-apply to keep them mutually exclusive.
    if (next && autoApply) {
      setAutoApply(false)
      onAutoApplyDisabled?.()
    }
  }, [autoApply, onAutoApplyDisabled, setAutoApply, setAutoReset])

  return {
    autoApply,
    autoReset,
    setAutoApplyExclusive,
    setAutoResetExclusive,
  }
}
