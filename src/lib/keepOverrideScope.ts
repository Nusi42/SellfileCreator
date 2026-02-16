/**
 * keepOverrideScope.ts
 *
 * Shared helpers for keep-override scope chips (Safeguards).
 * Why: both features share the same count-mode semantics and must stay in lockstep.
 */
import { sanitizeSafeguardCountMode, type SafeguardRuleCountMode } from './safeguards'

// Scope chip identifiers align with SafeguardRuleCountMode keys.
export type KeepOverrideScopeKey = 'perSlot' | 'perSet' | 'perFaction' | 'perMainStat'

export type KeepOverrideScopeActive = {
  perSlot: boolean
  perSet: boolean
  perFaction: boolean
  perMainStat: boolean
}

// Normalize and expose which scope chips should appear active.
export const resolveKeepOverrideScopeActive = (mode: SafeguardRuleCountMode): KeepOverrideScopeActive => {
  const normalized = sanitizeSafeguardCountMode(mode)
  return {
    perSlot: !normalized.perRule && normalized.perSlot,
    perSet: !normalized.perRule && normalized.perSet,
    perFaction: !normalized.perRule && normalized.perFaction,
    perMainStat: !normalized.perRule && normalized.perMainStat,
  }
}

/**
 * Toggle a scope chip and return the next normalized count mode.
 * Ensures at least one scope is active by falling back to per-rule.
 */
export const toggleKeepOverrideCountMode = (
  mode: SafeguardRuleCountMode,
  scope: KeepOverrideScopeKey,
): SafeguardRuleCountMode => {
  const normalized = sanitizeSafeguardCountMode(mode)
  const nextValue = !normalized[scope]
  const nextMode: SafeguardRuleCountMode = {
    perRule: false,
    perSlot: scope === 'perSlot' ? nextValue : normalized.perSlot,
    perSet: scope === 'perSet' ? nextValue : normalized.perSet,
    perFaction: scope === 'perFaction' ? nextValue : normalized.perFaction,
    perMainStat: scope === 'perMainStat' ? nextValue : normalized.perMainStat,
  }
  // If all chips are off, revert to per-rule so quotas still apply.
  if (!nextMode.perSlot && !nextMode.perSet && !nextMode.perFaction && !nextMode.perMainStat) {
    return {
      perRule: true,
      perSlot: false,
      perSet: false,
      perFaction: false,
      perMainStat: false,
    }
  }
  return nextMode
}
