/**
 * keepOverrideScope.ts
 *
 * Shared helpers for keep-override scope chips (Safeguards).
 * Why: both features share the same count-mode semantics and must stay in lockstep.
 */
import { sanitizeSafeguardCountMode, type SafeguardRuleCountMode } from './safeguards'
import { GLYPH_PER_FACTION, GLYPH_PER_MAIN_STAT, GLYPH_PER_SET, GLYPH_PER_SLOT } from './constants'

// Scope chip identifiers align with SafeguardRuleCountMode keys. The array is the display order
// used wherever the chips are rendered as one row (the group strip beside the required count
// shows all four together) — the type is derived from it so the two cannot drift.
export const KEEP_OVERRIDE_SCOPE_KEYS = ['perSlot', 'perSet', 'perFaction', 'perMainStat'] as const

export type KeepOverrideScopeKey = typeof KEEP_OVERRIDE_SCOPE_KEYS[number]

// One glyph per scope — the SSOT the group strip toggles, the candidate flyout's cutoff label and
// the group-view chip all draw from, so a bucket dimension looks the same everywhere it is named
// compactly. Full labels stay in the `safeguardsCountModePer*` catalog keys.
export const KEEP_OVERRIDE_SCOPE_GLYPHS: Readonly<Record<KeepOverrideScopeKey, string>> = {
  perSlot: GLYPH_PER_SLOT,
  perSet: GLYPH_PER_SET,
  perFaction: GLYPH_PER_FACTION,
  perMainStat: GLYPH_PER_MAIN_STAT,
}

/**
 * The active scope glyphs of a count mode in display order, joined with spaces (empty when no
 * chip is on). Optional `omit` drops a dimension the caller has already ruled out (e.g. faction
 * when no accessory slot is in play).
 */
export const describeKeepOverrideScopeGlyphs = (
  mode: SafeguardRuleCountMode,
  omit: readonly KeepOverrideScopeKey[] = [],
): string => {
  const active = resolveKeepOverrideScopeActive(mode)
  return KEEP_OVERRIDE_SCOPE_KEYS
    .filter((scope) => active[scope] && !omit.includes(scope))
    .map((scope) => KEEP_OVERRIDE_SCOPE_GLYPHS[scope])
    .join(' ')
}

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
