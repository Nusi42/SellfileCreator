import type { HsfRuleWithCfg } from './merge'

type RuleWithConfigMetadata = { ConfigID?: number; ConfigName?: string }

const normalizeConfigId = (cfgIdx: number): number => Math.floor(cfgIdx) + 1
const sanitizeName = (name?: string | null): string | undefined => {
  if (typeof name !== 'string') return undefined
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** Normalize builder-provided labels into the trimmed strings we serialize. */
export function normalizeConfigName(name?: string | null): string | undefined {
  return sanitizeName(name)
}

export function getRuleConfigIndex(rule: RuleWithConfigMetadata | null | undefined): number | null {
  if (rule && typeof rule.ConfigID === 'number' && Number.isFinite(rule.ConfigID)) {
    const cfgId = Math.floor(rule.ConfigID)
    if (cfgId > 0) return cfgId - 1
  }
  return null
}

export function applyConfigIndexMutable(rule: RuleWithConfigMetadata, cfgIdx: number, cfgName?: string | null): void {
  if (!rule || !Number.isFinite(cfgIdx) || cfgIdx < 0) {
    if (rule) {
      delete (rule as { ConfigID?: number }).ConfigID
      delete (rule as { ConfigName?: string }).ConfigName
    }
    return
  }
  rule.ConfigID = normalizeConfigId(cfgIdx)
  const nextName = sanitizeName(cfgName ?? rule.ConfigName)
  if (nextName) {
    rule.ConfigName = nextName
  } else if ('ConfigName' in rule) {
    delete (rule as { ConfigName?: string }).ConfigName
  }
}

export function cloneRuleWithConfigIndex(rule: HsfRuleWithCfg, cfgIdx: number, cfgName?: string | null): HsfRuleWithCfg {
  if (!Number.isFinite(cfgIdx) || cfgIdx < 0) {
    const clone = { ...rule }
    delete (clone as { ConfigID?: number }).ConfigID
    if ('ConfigName' in clone) delete (clone as { ConfigName?: string }).ConfigName
    return clone
  }
  const nextName = sanitizeName(cfgName ?? rule.ConfigName)
  const clone: HsfRuleWithCfg = {
    ...rule,
    ConfigID: normalizeConfigId(cfgIdx),
    ...(nextName ? { ConfigName: nextName } : {}),
  }
  return clone
}

type ConfigNameList = readonly (string | null | undefined)[] | null | undefined

/**
 * Resolve the label to show for tester matches.
 * Keep-unique sentinel rules do not map to builder configs, so we fall back to the trimmed rule name.
 */
export function resolveMatchConfigName(
  cfgIdx: number | null | undefined,
  configNames: ConfigNameList,
  rule: RuleWithConfigMetadata | null | undefined,
): string | null {
  if (
    configNames
    && cfgIdx != null
    && cfgIdx >= 0
    && cfgIdx < configNames.length
  ) {
    const candidate = configNames[cfgIdx]
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed.length > 0) return trimmed
    }
  }
  const fallback = normalizeConfigName(rule?.ConfigName ?? null)
  return fallback ?? null
}
