/**
 * ruleSources.ts
 *
 * Single source of truth for rule source constants shared across merge/eval layers.
 */

export const RULE_SOURCE_HSF = 'hsf' as const
export const RULE_SOURCE_HSFC = 'hsfc' as const
export const RULE_SOURCE_FINAL_SELL = 'finalSell' as const
export const RULE_SOURCE_SAFEGUARDS = 'safeguards' as const

// Keep override sources must be treated as lower-priority keeps during match evaluation.
export const KEEP_OVERRIDE_RULE_SOURCES = [
  RULE_SOURCE_SAFEGUARDS,
] as const

export type RuleSource =
  | typeof RULE_SOURCE_HSF
  | typeof RULE_SOURCE_HSFC
  | typeof RULE_SOURCE_FINAL_SELL
  | typeof RULE_SOURCE_SAFEGUARDS

export const isKeepOverrideRuleSource = (source: string | null | undefined): source is (typeof KEEP_OVERRIDE_RULE_SOURCES)[number] => (
  typeof source === 'string' && KEEP_OVERRIDE_RULE_SOURCES.includes(source as (typeof KEEP_OVERRIDE_RULE_SOURCES)[number])
)
