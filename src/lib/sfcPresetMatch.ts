/**
 * Preset-equivalence check for the "load a preset" nudge.
 *
 * The bouncing-arrows nudge on the Load SFC button only makes sense when the
 * user's current setup differs from the bundled presets. Once their note,
 * recipes, safeguards, metasets, etc. already match the Beginner or the
 * Midgame→Endgame preset, the nudge is noise and we suppress it.
 *
 * Comparison is done on the *canonical SFC payload* (the same readable schema we
 * serialize on save) so it tracks the real persisted shape rather than ad-hoc
 * field equality. Dynamic-override DSL blocks inside the note are stripped before
 * comparison — they are user tuning layered on top of a preset, not part of the
 * preset's identity, so a setup that only differs by overrides still counts as a
 * match.
 */
import beginnerSfcRaw from '../../presets/beginner.sfc?raw'
import lategameSfcRaw from '../../presets/lategame.sfc?raw'
import { defaultSubstatTargets } from './hsfBuilder'
import { DSL_BLOCK_RE_SOURCE } from './overridesDiagnostics'
import { buildSfcPayload, parseSfcText } from './sfcIO'
import type { BuilderRecipe, SubstatTargetTable } from './hsfBuilder/types'
import type { FinalSellRemainderConfig } from './logicHub'
import type { Metaset } from './metasets'
import type { SafeguardRule } from './safeguards'

// The version is irrelevant to "is this the same setup?", so we canonicalize it
// to a fixed token on both sides before comparing.
const VERSION_FOR_COMPARE = '0'

// Strips every dynamic-override DSL block from a note so two setups that differ
// only by override tuning compare equal. Uses the shared block matcher (SSOT).
const stripOverrideBlocks = (note: string | undefined): string | undefined => {
  if (!note) return note
  const re = new RegExp(DSL_BLOCK_RE_SOURCE, 'g')
  // Collapse whitespace left behind by removed blocks so formatting noise
  // (blank lines where a block used to be) never causes a false mismatch.
  return note.replace(re, '').replace(/\s+/g, ' ').trim()
}

/** The mutable slices that define a setup, as held by the app at runtime. */
export type SfcSetupFields = {
  metasets: Metaset[]
  substatTargets: SubstatTargetTable
  recipes: BuilderRecipe[]
  finalSellRemainder?: FinalSellRemainderConfig
  note?: string
  safeguardRules?: SafeguardRule[]
  safeguardsEnabled?: boolean
  recipesEnabled?: boolean
}

// Reduce a setup to a stable comparison string: canonical payload, version
// neutralized, override blocks stripped from the note.
const canonicalize = (fields: SfcSetupFields): string => {
  const payload = buildSfcPayload({
    version: VERSION_FOR_COMPARE,
    metasets: fields.metasets,
    substatTargets: fields.substatTargets,
    recipes: fields.recipes,
    ...(fields.finalSellRemainder ? { finalSellRemainder: fields.finalSellRemainder } : {}),
    ...(fields.note ? { note: fields.note } : {}),
    safeguardRules: fields.safeguardRules ?? [],
    safeguardsEnabled: fields.safeguardsEnabled ?? false,
    recipesEnabled: fields.recipesEnabled ?? true,
  }) as Record<string, unknown> & { Note?: string[] }
  // Re-derive the note from the stripped form so overrides never affect equality.
  const strippedNote = stripOverrideBlocks(fields.note)
  if (strippedNote) payload.Note = [strippedNote]
  else delete payload.Note
  return JSON.stringify(payload)
}

/** Identifies a bundled built-in preset. SSOT for the two preset variant tokens. */
export type PresetVariant = 'beginner' | 'lategame'

// The bundled raw SFC text for each preset variant, keyed by token. Single place
// the raw imports are consumed so callers never re-import them ad-hoc.
const PRESET_RAW: Record<PresetVariant, string> = {
  beginner: beginnerSfcRaw,
  lategame: lategameSfcRaw,
}

// The .sfc filename for each preset variant. Used when wrapping the raw in a File
// for the full SFC load path (simple-mode preset buttons / startup).
const PRESET_FILENAME: Record<PresetVariant, string> = {
  beginner: 'beginner.sfc',
  lategame: 'lategame.sfc',
}

/** The bundled raw SFC text for a preset variant (SSOT for the raw imports). */
export function presetRaw(variant: PresetVariant): string {
  return PRESET_RAW[variant]
}

/** The canonical .sfc filename for a preset variant. */
export function presetFilename(variant: PresetVariant): string {
  return PRESET_FILENAME[variant]
}

// Parse a bundled preset raw string into normalized setup fields. The presets never
// change at runtime, so each variant is parsed at most once and cached. This is the
// single parse path for preset bodies — both the equivalence check (canonicalize)
// and the restore-draft swap (presetDraftFields) read from it.
const presetSetupCache = new Map<PresetVariant, SfcSetupFields>()
const presetSetup = (variant: PresetVariant): SfcSetupFields => {
  const cached = presetSetupCache.get(variant)
  if (cached) return cached
  // Parse the raw against empty defaults — a preset is a full replace, not a merge.
  const parsed = parseSfcText(PRESET_RAW[variant], {
    metasets: [],
    substatTargets: defaultSubstatTargets(),
  })
  const fields: SfcSetupFields = {
    metasets: parsed.metasets,
    substatTargets: parsed.substatTargets,
    recipes: parsed.recipes,
    ...(parsed.finalSellRemainder ? { finalSellRemainder: parsed.finalSellRemainder } : {}),
    ...(parsed.note ? { note: parsed.note } : {}),
    safeguardRules: parsed.safeguardRules ?? [],
    safeguardsEnabled: parsed.safeguardsEnabled ?? false,
    recipesEnabled: parsed.recipesEnabled,
  }
  presetSetupCache.set(variant, fields)
  return fields
}

/**
 * The preset-derived setup fields for a bundled built-in, ready to seed a restore
 * draft. Returns a SHALLOW copy so callers can spread session/override state on top
 * without mutating the cached parse. This is the SSOT both the full-app restore
 * dialog and the simple-mode startup use to load the CURRENT bundled preset body in
 * place of a stale saved one (so users ride preset updates across app versions).
 */
export function presetDraftFields(variant: PresetVariant): SfcSetupFields {
  return { ...presetSetup(variant) }
}

let presetCanonicalsCache: string[] | null = null
const presetCanonicals = (): string[] => {
  if (presetCanonicalsCache) return presetCanonicalsCache
  // Canonicalize from the same single parse path used for restore-draft swaps.
  presetCanonicalsCache = [
    canonicalize(presetSetup('beginner')),
    canonicalize(presetSetup('lategame')),
  ]
  return presetCanonicalsCache
}

/**
 * Reports *which* bundled preset the current setup matches, ignoring dynamic
 * overrides — `'beginner'`, `'lategame'`, or `null` when it matches neither.
 * Single canonicalization path so equality stays SSOT with the boolean check.
 */
export function matchedPreset(fields: SfcSetupFields): PresetVariant | null {
  // Canonicalize once, then compare against the cached preset canonicals.
  const current = canonicalize(fields)
  // presetCanonicals() is ordered [beginner, lategame] (see presetCanonicals()).
  const [beginner, lategame] = presetCanonicals()
  if (current === beginner) return 'beginner'
  if (current === lategame) return 'lategame'
  return null
}

/**
 * True when the current setup matches one of the bundled presets, ignoring
 * dynamic overrides. Used to suppress the "load a preset" nudge when it would
 * be redundant. Expressed via matchedPreset so the match logic lives once.
 */
export function currentSfcMatchesAnyPreset(fields: SfcSetupFields): boolean {
  return matchedPreset(fields) !== null
}
