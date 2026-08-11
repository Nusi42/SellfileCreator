/**
 * overridesEditorModel.ts
 *
 * Thin bridge between the visual override-block editor's row widgets and the real
 * DSL parser/serializer pair. Rows edit small DSL fragments (one selector expression,
 * one `field=value` assignment); this module validates and converts them by parsing a
 * synthetic single-option block through the SAME grammar entry points the note uses —
 * the parser stays the single source of truth for what is valid, and the serializer
 * for how fragments render back to text. No token spelling is re-declared here.
 */
import {
  type NoteTagSelector,
  type ListTokenPrefix,
  NOTE_OVERRIDES_BOOLEAN_KEYWORDS,
  NOTE_OVERRIDES_CROSS_KEYWORDS,
  NOTE_OVERRIDES_LOGIC_KEYWORDS,
  NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS,
  parsePrefixedToken,
} from './noteOverridesParser'
import {
  ArtifactType,
  RANK_VALUES,
  artifactSetNames,
  artifactTypeI18nKey,
  dslMainStatKeys,
  dslSubstatKeys,
  factionNames,
  rarityCodeFromRankValue,
  rarityCodeToName,
  rarityRankValueI18nKey,
  starRankValueI18nKey,
  type RankValue,
} from './types'
// Type-only: catalog key union, so every labelKey below is COMPILE-checked to exist.
import type { I18nKey } from './i18n'
// Numeric widget bounds mirror the apply-side clamp SSOTs — never re-spelled here.
import { SUBSTAT_TARGET_MAX_ROLLS } from './constants'
// Tag merge/normalize SSOT — the tag autocomplete unions selector tags with rule tags.
import { mergeTagList, normalizeTagList } from './tagHelpers'
import { GEAR_INSPECTOR_SORT_WEIGHT_MAX, GEAR_INSPECTOR_SORT_WEIGHT_MIN, GEAR_INSPECTOR_SORT_WEIGHT_STEP } from './gearInspectorSort'
import {
  type RecipeOverridesOperation,
  type RecipeOverridesSelector,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_ACTION_VALS,
  NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS,
  NOTE_RECIPE_OVERRIDES_EXPORT_VALS,
  NOTE_RECIPE_OVERRIDES_KEEP_VALS,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD,
  NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX,
  NOTE_RECIPE_OVERRIDES_RARITY_NAMES,
  NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS,
  NOTE_RECIPE_OVERRIDES_SLOT_NAMES,
} from './noteRecipeOverrides'
import {
  type SafeguardOverridesOperation,
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_SAFEGUARD_OVERRIDES_COUNT_MAX,
  NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS,
} from './noteSafeguardOverrides'
import { type DraftSelectorBlock, type DraftStructuredBody, type OverridesDomain } from './overridesDraftTypes'
import { listOverrideBlocks, parseOverridesBlockDraft } from './overridesDraft'
import {
  SerializeError,
  describeRankCodeDsl,
  describeRarityCodeDsl,
  serializeOptionBody,
  serializeRecipeOperation,
  serializeRecipeSelector,
  serializeSafeguardOperation,
  serializeSafeguardSelector,
} from './overridesSerializer'

// ── Fragment ↔ text conversion ────────────────────────────────────────────────

/** Serialize a block's selector for its row text field. */
export const selectorToText = (block: DraftSelectorBlock): string => (
  block.domain === 'recipe' ? serializeRecipeSelector(block.selector) : serializeSafeguardSelector(block.selector)
)

/** Serialize one operation for its row chip / edit field. */
export const operationToText = (block: DraftSelectorBlock, index: number): string => (
  block.domain === 'recipe'
    ? serializeRecipeOperation(block.operations[index] as RecipeOverridesOperation)
    : serializeSafeguardOperation(block.operations[index] as SafeguardOverridesOperation)
)

// Build a synthetic one-option block whose single body block carries the fragment.
// hostDomain picks the marker grammar; blockDomain decides whether the fragment sits
// in a main block or a cross-domain (`safeguard @…` / `recipe @…`) block — the latter
// is what enables $value expressions in recipe ops hosted by safeguard markers.
const buildFragmentBlock = (
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  selectorText: string,
  operationsText: string,
): string => {
  // Marker + cross keywords come from the grammar SSOT constants, never literals.
  const keyword = hostDomain === 'recipe' ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD : NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD
  const cross = hostDomain !== blockDomain ? `${NOTE_OVERRIDES_CROSS_KEYWORDS[hostDomain]} ` : ''
  return `<!-- ${keyword}\n  q "q"\n  rb "opt" { ${cross}@${selectorText} { ${operationsText} } }\n-->`
}

// Parse the synthetic block and pull the single body block back out (main or cross).
const parseFragment = (
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  selectorText: string,
  operationsText: string,
): DraftSelectorBlock | null => {
  const raw = buildFragmentBlock(hostDomain, blockDomain, selectorText, operationsText)
  const { draft, diagnostics } = parseOverridesBlockDraft(raw)
  // Any diagnostic means the fragment is not clean DSL — reject it outright.
  if (diagnostics.length > 0 || !draft || draft.kind !== 'question') return null
  const option = draft.options[0]
  if (!option || option.body.kind !== 'structured') return null
  const isCross = hostDomain !== blockDomain
  const blocks = isCross ? option.body.crossBlocks : option.body.blocks
  const other = isCross ? option.body.blocks : option.body.crossBlocks
  // Exactly one block must come back, in the expected family, with nothing leaking
  // into else sections (a stray `}` in the fragment would shift content around).
  if (blocks.length !== 1 || other.length !== 0 || option.body.elseBlocks.length !== 0 || option.body.crossElseBlocks.length !== 0) return null
  return blocks[0] ?? null
}

// Benign no-op-ish operation per domain, used when only the selector is being validated.
const PROBE_OPERATION: Record<OverridesDomain, string> = { recipe: 'export=active', safeguard: 'count=1' }

/**
 * Parse a selector row's text (without the `@`). Returns the typed selector or null
 * when the text is not a clean, complete selector expression for that grammar.
 */
export function parseSelectorText(
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  text: string,
): RecipeOverridesSelector | NoteTagSelector | null {
  const trimmed = text.trim()
  // Braces would break out of the synthetic structure; they are never part of a selector.
  if (!trimmed || trimmed.includes('{') || trimmed.includes('}')) return null
  const block = parseFragment(hostDomain, blockDomain, trimmed, PROBE_OPERATION[blockDomain])
  return block?.selector ?? null
}

/**
 * Parse ONE operation row's text (`field=value`, `rank>=3`, `count=$value/8`, …).
 * Returns the typed operation or null when it is not exactly one clean assignment.
 */
export function parseOperationText(
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  text: string,
): RecipeOverridesOperation | SafeguardOverridesOperation | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('{') || trimmed.includes('}')) return null
  const block = parseFragment(hostDomain, blockDomain, 'all', trimmed)
  if (!block || block.operations.length !== 1) return null
  return block.operations[0] ?? null
}

/**
 * Convert a raw `{ … }` body into the structured model, or null when it is not
 * clean, fully-representable DSL. Runs the same parse + fidelity gate the block
 * mapper uses (via a synthetic single-option block), so "convertible" here means
 * exactly "the structured builder can hold it without semantic loss".
 */
export function rawBodyToStructured(hostDomain: OverridesDomain, rawText: string): DraftStructuredBody | null {
  const keyword = hostDomain === 'recipe' ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD : NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD
  const raw = `<!-- ${keyword}\n  q "q"\n  rb "opt" ${rawText}\n-->`
  const { draft, diagnostics } = parseOverridesBlockDraft(raw)
  if (diagnostics.length > 0 || !draft || draft.kind !== 'question') return null
  const body = draft.options[0]?.body
  return body && body.kind === 'structured' ? body : null
}

/** Serialize a structured body to raw text (for the structured → raw toggle).
 *  Returns null only for grammar-inexpressible drafts (UI-bug territory). */
export function structuredBodyToRaw(hostDomain: OverridesDomain, body: DraftStructuredBody): string | null {
  try {
    return serializeOptionBody(hostDomain, body)
  } catch (error) {
    if (error instanceof SerializeError) return null
    throw error
  }
}

// ── Operation term metadata (the assignment dropdown + value widgets) ─────────

/**
 * One entry of the assignment dropdown, with its op/value widget shape. Dotted
 * field families (substatmin.STAT, minima.★.STAT, weight.STAT, rolltarget.STAT)
 * are first-class entries with stat/star pickers — authors never type `.SPD=`.
 */
export type OperationTermOption = {
  id: string
  // Base DSL field token (dotted families append their stat/star pieces).
  field: string
  // Comparison ops offered ('=' only for most; recipe rank/rarity add >=/<=).
  ops: ReadonlyArray<'=' | '>=' | '<='>
  // Value widget: single choice | number | level range | token chip list | free text.
  widget: 'enum' | 'number' | 'level' | 'list' | 'text'
  // Closed vocabulary for 'enum' (single) and 'list' (multi) widgets.
  choices: readonly string[] | null
  // Extra pickers for the dotted stat/star families.
  stat: boolean
  star: boolean
  // Placeholder example for the free-text widget.
  example: string
  // Catalog key for the dropdown label — the SAME term the rest of the UI uses for
  // this concept (Recipe Builder / Safeguards panel). REQUIRED: adding a grammar
  // field cannot compile without deciding its localized label.
  labelKey: I18nKey
  // Optional qualifier rendered after the label (`base · qualifier`) when one concept
  // has several dotted variants (Global minima vs its Any-rank fallback entry).
  labelDetailKey?: I18nKey
  // Optional catalog keys for enum/list VALUES (export modes, star ranks, rarities…).
  valueLabelKeys?: Readonly<Partial<Record<string, I18nKey>>>
  // Bounds for the 'number' widget, mirrored from the apply-side clamp SSOTs — the
  // editor refuses values the resolver would clamp away anyway.
  range?: NumberValueRange
  // Rich value control: reuse the app's domain selects (Gear*Select family) instead
  // of a generic dropdown/chip list. The DSL value stays a token string; the UI maps
  // tokens ⇄ domain ids through the converter SSOT below.
  control?: ValueControlKind
}

/** Numeric widget bounds (max/step optional: minima targets are only floored at 0). */
export type NumberValueRange = { min: number; max?: number; step?: number }

/** Which shared app select renders the value. Single-value kinds pair with 'enum'
 *  choices; list kinds pair with 'list' (metasets: 'text' + runtime vocabulary). */
export type ValueControlKind =
  | 'rankValue' | 'starValue' | 'rarityValue'                       // single value
  | 'slots' | 'factions' | 'substats' | 'mainstats' | 'gearsets'    // token lists
  | 'rankList' | 'rarityList' | 'metasets'

// Boolean-flag surface: on/off (the parser also accepts true/false; on/off is canonical).
const BOOL_VALS = [NOTE_OVERRIDES_BOOLEAN_KEYWORDS[0], NOTE_OVERRIDES_BOOLEAN_KEYWORDS[1]] as const

const EQ_ONLY = ['='] as const
const ALL_OPS = ['=', '>=', '<='] as const

// Compact builders for the common widget shapes.
const enumOp = (
  field: string,
  choices: readonly string[],
  labelKey: I18nKey,
  extra?: { ops?: ReadonlyArray<'=' | '>=' | '<='>; valueLabelKeys?: Readonly<Partial<Record<string, I18nKey>>>; control?: ValueControlKind },
): OperationTermOption => ({
  id: field, field, ops: extra?.ops ?? EQ_ONLY, widget: 'enum', choices, stat: false, star: false, example: choices[0] ?? '', labelKey,
  // exactOptionalPropertyTypes: only materialize the props when they are provided.
  ...(extra?.valueLabelKeys ? { valueLabelKeys: extra.valueLabelKeys } : {}),
  ...(extra?.control ? { control: extra.control } : {}),
})
const numberOp = (field: string, labelKey: I18nKey, range?: NumberValueRange): OperationTermOption => (
  { id: field, field, ops: EQ_ONLY, widget: 'number', choices: null, stat: false, star: false, example: '1', labelKey, ...(range ? { range } : {}) }
)
const listOp = (field: string, choices: readonly string[], labelKey: I18nKey, valueLabelKeys?: Readonly<Partial<Record<string, I18nKey>>>, control?: ValueControlKind): OperationTermOption => (
  { id: field, field, ops: EQ_ONLY, widget: 'list', choices, stat: false, star: false, example: choices.slice(0, 2).join(','), labelKey, ...(valueLabelKeys ? { valueLabelKeys } : {}), ...(control ? { control } : {}) }
)
// Boolean on/off enum field (shared value labels).
const boolOp = (field: string, labelKey: I18nKey): OperationTermOption => (
  enumOp(field, BOOL_VALS, labelKey, { valueLabelKeys: BOOL_VALUE_LABEL_KEYS })
)

// Closed vocabularies derived from the domain SSOTs (never re-spelled here).
// Exported for the star pickers, which pair these values with STAR_VALUE_LABEL_KEYS.
export const RANK_NUM_CHOICES = ['1', '2', '3', '4', '5', '6'] as const
// Rank values accepted by parseRankOverride ('any' only with '=').
const RANK_VALUE_CHOICES = ['any', ...RANK_NUM_CHOICES] as const
/** Level milestones the `lvl=` field accepts — mirrors the LevelMilestone union;
 *  the SSOT completeness test parses every entry through the real grammar. */
export const LEVEL_MILESTONE_CHOICES = ['0', '4', '8', '12', '16'] as const
const SG_RARITY_NAME_CHOICES = NOTE_RECIPE_OVERRIDES_RARITY_NAMES.filter((name) => name !== 'any' && name !== 'auto')
const GEARSET_NAME_CHOICES = Object.values(artifactSetNames)
const FACTION_NAME_CHOICES = Object.values(factionNames).filter((name) => name && name.trim())

// ── Localized VALUE labels (same catalog terms as the rest of the UI) ─────────
// Closed-vocabulary values render through these maps so dropdown/chip labels are
// localized while the DSL keeps its tokens. Where the vocabulary is a tuple, the
// `satisfies` clause makes the map COMPILE-exhaustive: adding a value to the grammar
// fails to compile until its label is chosen.

/** Star ranks '1'..'6' → the shared star-rank key SSOT (`star1`…`star6`). */
export const STAR_VALUE_LABEL_KEYS: Readonly<Record<(typeof RANK_NUM_CHOICES)[number], I18nKey>> = {
  '1': starRankValueI18nKey(1), '2': starRankValueI18nKey(2), '3': starRankValueI18nKey(3),
  '4': starRankValueI18nKey(4), '5': starRankValueI18nKey(5), '6': starRankValueI18nKey(6),
}
// rank= values: 'any' + the star ranks.
const RANK_VALUE_LABEL_KEYS = {
  any: 'any', ...STAR_VALUE_LABEL_KEYS,
} satisfies Record<(typeof RANK_VALUE_CHOICES)[number], I18nKey>
// rarity= values: the name↔rank association is pinned at runtime against the parser's
// own name table by the SSOT completeness test; the keys are compile-pinned here.
const RARITY_VALUE_LABEL_KEYS = {
  any: 'any', auto: 'headerMenuAuto',
  common: rarityRankValueI18nKey(1), uncommon: rarityRankValueI18nKey(2), rare: rarityRankValueI18nKey(3),
  epic: rarityRankValueI18nKey(4), legendary: rarityRankValueI18nKey(5), mythical: rarityRankValueI18nKey(6),
} satisfies Record<(typeof NOTE_RECIPE_OVERRIDES_RARITY_NAMES)[number], I18nKey>
// Subset of a shared value-label map keyed by an actual choice list, so narrower
// vocabularies (autolate thresholds, the safeguard rarity list) reuse ONE mapping
// without advertising labels for values their grammar does not accept.
const pickValueLabelKeys = (
  map: Readonly<Partial<Record<string, I18nKey>>>,
  choices: readonly string[],
): Readonly<Partial<Record<string, I18nKey>>> => (
  Object.fromEntries(choices.flatMap((choice) => (map[choice] ? [[choice, map[choice]]] : [])))
)
// autolate= values are rarity thresholds — reuse the rarity labels (single mapping).
const AUTOLATE_VALUE_LABEL_KEYS = pickValueLabelKeys(RARITY_VALUE_LABEL_KEYS, NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS)
// on/off boolean values.
const BOOL_VALUE_LABEL_KEYS = {
  on: 'commonOn', off: 'commonOff',
} satisfies Record<(typeof BOOL_VALS)[number], I18nKey>
// substatmatch: numeric thresholds display as numbers; only the keyword gets a term.
const SUBSTAT_MATCH_VALUE_LABEL_KEYS: Readonly<Partial<Record<(typeof NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS)[number], I18nKey>>> = {
  persubstat: 'safeguardsSubstatRequirementPer',
}
// slots= values: slot name → the shared slot label key SSOT (artifactTypeI18nKey).
const SLOT_VALUE_LABEL_KEYS: Readonly<Partial<Record<string, I18nKey>>> = Object.fromEntries(
  NOTE_RECIPE_OVERRIDES_SLOT_NAMES.map((name) => [name, artifactTypeI18nKey(ArtifactType[name as keyof typeof ArtifactType])]),
)

// ── Token ⇄ domain-id converters (for the shared Gear*Select value controls) ──
// Built from the SAME name tables the parser resolves against (ArtifactType,
// factionNames, artifactSetNames, the rarity/rank helpers), so a token that passed
// validation always maps to an id and back to the identical spelling.

const SLOT_ID_BY_TOKEN = new Map<string, number>(Object.entries(ArtifactType).map(([name, id]) => [name, Number(id)]))
const SLOT_TOKEN_BY_ID = new Map<number, string>(Object.entries(ArtifactType).map(([name, id]) => [Number(id), name]))
export const slotTokenToId = (token: string): number | null => SLOT_ID_BY_TOKEN.get(token) ?? null
export const slotIdToToken = (id: number): string | null => SLOT_TOKEN_BY_ID.get(Number(id)) ?? null

const FACTION_ID_BY_NAME = new Map<string, number>(
  Object.entries(factionNames).filter(([, name]) => name && name.trim()).map(([id, name]) => [name, Number(id)]),
)
export const factionNameToId = (name: string): number | null => FACTION_ID_BY_NAME.get(name) ?? null
export const factionIdToName = (id: number): string | null => factionNames[Number(id)] ?? null

const GEARSET_ID_BY_NAME = new Map<string, number>(
  Object.entries(artifactSetNames).filter(([, name]) => name && name.trim()).map(([id, name]) => [name, Number(id)]),
)
export const gearsetNameToId = (name: string): number | null => GEARSET_ID_BY_NAME.get(name) ?? null
export const gearsetIdToName = (id: number): string | null => artifactSetNames[Number(id)] ?? null

/** DSL stat key ⇄ StatVariant — re-exported from the stat-domain SSOT (types.ts),
 *  which owns the asymmetry between how a stat DISPLAYS and how it is SPELLED.
 *  Imported (not `export … from`) because selectorLeafToView below calls the
 *  speller: a bare re-export forwards the name without binding it locally. */
import { statKeyToVariant, statVariantToKey } from './types'
export { statKeyToVariant, statVariantToKey }

// Rarity rank value (1–6) ⇄ lowercase DSL rarity name (the serializer's spelling).
const RARITY_NAME_BY_RANK = new Map<number, string>(
  RANK_VALUES.map((rv) => [rv, rarityCodeToName(rarityCodeFromRankValue(rv)).toLowerCase()]),
)
const RARITY_RANK_BY_NAME = new Map<string, RankValue>(
  RANK_VALUES.map((rv) => [RARITY_NAME_BY_RANK.get(rv)!, rv]),
)
export const rarityNameToRank = (name: string): RankValue | null => RARITY_RANK_BY_NAME.get(name) ?? null
export const rarityRankToName = (rank: number): string | null => RARITY_NAME_BY_RANK.get(Number(rank)) ?? null

// ── Numeric widget bounds (apply-side clamp SSOTs) ────────────────────────────
// minrolls / lockedminrolls / substatmin resolve through clampAggregateRollValue.
const ROLL_COUNT_RANGE: NumberValueRange = { min: 0, max: SUBSTAT_TARGET_MAX_ROLLS }
// minsubstats resolves through clampMinSubstats (an artifact holds ≤ 4 substats).
const MIN_SUBSTATS_RANGE: NumberValueRange = { min: 0, max: NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX }
// Minima targets are only floored (clampMinimaValue) — flat-stat minima can be large.
const MINIMA_TARGET_RANGE: NumberValueRange = { min: 0 }
// Safeguard count resolves through the count clamp.
const COUNT_RANGE: NumberValueRange = { min: NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN, max: NOTE_SAFEGUARD_OVERRIDES_COUNT_MAX }
// Substat weights share the Gear-Inspector sort-weight bounds/step.
const WEIGHT_RANGE: NumberValueRange = { min: GEAR_INSPECTOR_SORT_WEIGHT_MIN, max: GEAR_INSPECTOR_SORT_WEIGHT_MAX, step: GEAR_INSPECTOR_SORT_WEIGHT_STEP }

type RecipeAssignmentField = (typeof NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS)[number]
type SafeguardAssignmentField = (typeof NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS)[number]

// gearsets/metasets exist in BOTH grammars with identical syntax and widgets —
// one definition each, referenced from the two domain Records below (SSOT).
const GEARSETS_TERM_META: OperationTermOption[] = [listOp('gearsets', GEARSET_NAME_CHOICES, 'colSets', undefined, 'gearsets')]
// metasets keeps the open 'text' widget as its fallback; the 'metasets' control
// swaps in the sets select whenever every listed name matches a known metaset.
const METASETS_TERM_META: OperationTermOption[] = [{ id: 'metasets', field: 'metasets', ops: EQ_ONLY, widget: 'text', choices: null, stat: false, star: false, example: 'name1,name2', labelKey: 'menuMetasetsSection', control: 'metasets' }]

// Recipe assignment metadata, exhaustive over the grammar field SSOT: ADDING A FIELD
// TO THE GRAMMAR LIST FAILS TO COMPILE until its dropdown entry (or entries, for
// dotted families) is registered here — the widgets can never lag the parser.
const RECIPE_OPERATION_TERM_META: Record<RecipeAssignmentField, OperationTermOption[]> = {
  export: [enumOp('export', NOTE_RECIPE_OVERRIDES_EXPORT_VALS, 'export', {
    valueLabelKeys: {
      active: 'builderExportModeActive', disabled: 'builderExportModeDisabled', toggle: 'noteOverridesEditorValueToggle',
    } satisfies Record<(typeof NOTE_RECIPE_OVERRIDES_EXPORT_VALS)[number], I18nKey>,
  })],
  rank: [enumOp('rank', RANK_VALUE_CHOICES, 'builderRank', { ops: ALL_OPS, valueLabelKeys: RANK_VALUE_LABEL_KEYS, control: 'rankValue' })],
  rarity: [enumOp('rarity', NOTE_RECIPE_OVERRIDES_RARITY_NAMES, 'gearAnalyticsChartRarity', { ops: ALL_OPS, valueLabelKeys: RARITY_VALUE_LABEL_KEYS, control: 'rarityValue' })],
  minrolls: [numberOp('minrolls', 'tutAdvMinRollsTitle', ROLL_COUNT_RANGE)],
  lockedminrolls: [numberOp('lockedminrolls', 'tutLockedMinRollsTitle', ROLL_COUNT_RANGE)],
  minsubstats: [numberOp('minsubstats', 'builderRequiredSubstats', MIN_SUBSTATS_RANGE)],
  flex: [boolOp('flex', 'tutSectionFlexLabel')],
  substatmin: [
    numberOp('substatmin', 'builderSubstatMenuMinRolls', ROLL_COUNT_RANGE),
    { id: 'substatmin.stat', field: 'substatmin', ops: EQ_ONLY, widget: 'number', choices: null, stat: true, star: false, example: '2', labelKey: 'builderSubstatMenuMinRolls', range: ROLL_COUNT_RANGE },
  ],
  minima: [
    // minima.any sets which ★ column applies to Rank=Any rules — a star-rank CHOICE,
    // not a free number (the literal '5' means "the 5★ minima table").
    { id: 'minima.any', field: 'minima.any', ops: EQ_ONLY, widget: 'enum', choices: RANK_NUM_CHOICES, stat: false, star: false, example: '5', labelKey: 'noteOverridesEditorFieldMinima', labelDetailKey: 'anyRank', valueLabelKeys: STAR_VALUE_LABEL_KEYS, control: 'starValue' },
    { id: 'minima.star.stat', field: 'minima', ops: EQ_ONLY, widget: 'number', choices: null, stat: true, star: true, example: '12', labelKey: 'noteOverridesEditorFieldMinima', range: MINIMA_TARGET_RANGE },
  ],
  lvl: [{ id: 'lvl', field: 'lvl', ops: EQ_ONLY, widget: 'level', choices: null, stat: false, star: false, example: '0-16', labelKey: 'builderLevelWindow' }],
  keep: [enumOp('keep', NOTE_RECIPE_OVERRIDES_KEEP_VALS, 'builderMilestoneThresholds', {
    valueLabelKeys: {
      early: 'builderEarlyLabel', late: 'builderLateLabel',
    } satisfies Record<(typeof NOTE_RECIPE_OVERRIDES_KEEP_VALS)[number], I18nKey>,
  })],
  action: [enumOp('action', NOTE_RECIPE_OVERRIDES_ACTION_VALS, 'colKeep', {
    valueLabelKeys: {
      keep: 'keepValueKeep', sell: 'keepValueSell', toggle: 'noteOverridesEditorValueToggle',
    } satisfies Record<(typeof NOTE_RECIPE_OVERRIDES_ACTION_VALS)[number], I18nKey>,
  })],
  autolate: [enumOp('autolate', NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS, 'builderAutoPlusLate', { valueLabelKeys: AUTOLATE_VALUE_LABEL_KEYS })],
  rolltarget: [{ id: 'rolltarget.stat', field: 'rolltarget', ops: EQ_ONLY, widget: 'text', choices: null, stat: true, star: false, example: '300,600,900', labelKey: 'builderSubstatMenuRollTargets' }],
  slots: [listOp('slots', NOTE_RECIPE_OVERRIDES_SLOT_NAMES, 'builderSlots', SLOT_VALUE_LABEL_KEYS, 'slots')],
  substats: [listOp('substats', dslSubstatKeys(), 'builderSubstats', undefined, 'substats')],
  // Mainstats deliberately exclude anomalous substats — they can never be a main stat.
  mainstats: [listOp('mainstats', dslMainStatKeys(), 'builderMain', undefined, 'mainstats')],
  gearsets: GEARSETS_TERM_META,
  metasets: METASETS_TERM_META,
}

// Safeguard assignment metadata (same compile gate as the recipe Record above).
const SAFEGUARD_OPERATION_TERM_META: Record<SafeguardAssignmentField, OperationTermOption[]> = {
  activation: [enumOp('activation', NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS, 'safeguardsRuleModeLabel', {
    valueLabelKeys: {
      off: 'safeguardsRuleModeOff',
      protect_existing: 'safeguardsRuleModeProtect',
      anticipate_gaps: 'safeguardsRuleModeAnticipate',
      anticipate_improvements: 'safeguardsRuleModeAnticipateImprovements',
    } satisfies Record<(typeof NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS)[number], I18nKey>,
  })],
  count: [numberOp('count', 'safeguardsRequiredCount', COUNT_RANGE)],
  ignprev: [boolOp('ignprev', 'safeguardsIgnorePreviousSafeguards')],
  igncoll: [boolOp('igncoll', 'safeguardsIgnoreEquippedInCollection')],
  ignvault: [boolOp('ignvault', 'safeguardsIgnoreEquippedInVault')],
  perfaction: [boolOp('perfaction', 'safeguardsCountModePerFaction')],
  permainstat: [boolOp('permainstat', 'safeguardsCountModePerMain')],
  perslot: [boolOp('perslot', 'safeguardsCountModePerSlot')],
  perset: [boolOp('perset', 'safeguardsCountModePerSet')],
  perrule: [boolOp('perrule', 'safeguardsCountModePerRule')],
  substats: [listOp('substats', dslSubstatKeys(), 'safeguardsSubstatLabel', undefined, 'substats')],
  substatmatch: [enumOp('substatmatch', NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS, 'noteOverridesEditorFieldSubstatMatch', { valueLabelKeys: SUBSTAT_MATCH_VALUE_LABEL_KEYS })],
  weight: [{ id: 'weight.stat', field: 'weight', ops: EQ_ONLY, widget: 'number', choices: null, stat: true, star: false, example: '1.5', labelKey: 'safeguardsSubstatWeightsLabel', range: WEIGHT_RANGE }],
  improvchance: [{ id: 'improvchance', field: 'improvchance', ops: EQ_ONLY, widget: 'text', choices: null, stat: false, star: false, example: '25  |  25,35,50,65  |  disabled', labelKey: 'safeguardsImprovementChanceShort' }],
  rank: [listOp('rank', RANK_NUM_CHOICES, 'noteSafeguardRanksLabel', STAR_VALUE_LABEL_KEYS, 'rankList')],
  rarity: [listOp('rarity', SG_RARITY_NAME_CHOICES, 'noteSafeguardRaritiesLabel', pickValueLabelKeys(RARITY_VALUE_LABEL_KEYS, SG_RARITY_NAME_CHOICES), 'rarityList')],
  faction: [listOp('faction', FACTION_NAME_CHOICES, 'noteSafeguardFactionsLabel', undefined, 'factions')],
  gearsets: GEARSETS_TERM_META,
  metasets: METASETS_TERM_META,
}

/** Assignment dropdown entries for a block of the given domain. The order follows
 *  the grammar SSOT field lists; the exhaustive Records above guarantee (at compile
 *  time) every field has its widgets defined. */
export function operationTermOptionsFor(blockDomain: OverridesDomain): OperationTermOption[] {
  return blockDomain === 'recipe'
    ? NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS.flatMap((field) => RECIPE_OPERATION_TERM_META[field])
    : NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS.flatMap((field) => SAFEGUARD_OPERATION_TERM_META[field])
}

/** Compose the dotted DSL field text for a term option + its picker values. */
export function operationFieldText(option: OperationTermOption, star: string, stat: string): string {
  if (option.star) return `${option.field}.${star}.${stat}`
  if (option.stat) return `${option.field}.${stat}`
  return option.field
}

/**
 * Split an operation's DSL text into the widget pieces (option + star/stat/op/value),
 * for loading an existing op chip into the editor row. Null when no dropdown entry
 * matches (should not happen for parser-produced ops).
 */
export function matchOperationTerm(
  blockDomain: OverridesDomain,
  text: string,
): { option: OperationTermOption; star: string; stat: string; op: '=' | '>=' | '<='; value: string } | null {
  const match = /^([^=<>\s]+?)\s*(>=|<=|=)\s*([\s\S]*)$/.exec(text.trim())
  if (!match) return null
  const fieldFull = match[1]!
  const op = match[2] as '=' | '>=' | '<='
  const value = match[3]!
  const parts = fieldFull.split('.')
  const options = operationTermOptionsFor(blockDomain)
  // Exact plain/dotted-literal ids first (export, minima.any …), preferring the
  // entry whose op set allows the written operator.
  const exact = options.filter((entry) => !entry.stat && !entry.star && entry.field === fieldFull)
  const exactMatch = exact.find((entry) => entry.ops.includes(op)) ?? exact[0]
  if (exactMatch) return { option: exactMatch, star: '5', stat: '', op, value }
  // Dotted families: base token + stat (+ star for minima.N.STAT).
  const base = parts[0]!
  if (parts.length === 3) {
    const starOption = options.find((entry) => entry.star && entry.field === base)
    if (starOption) return { option: starOption, star: parts[1]!, stat: parts[2]!, op, value }
  }
  if (parts.length === 2) {
    const statOption = options.find((entry) => entry.stat && !entry.star && entry.field === base)
    if (statOption) return { option: statOption, star: '5', stat: parts[1]!, op, value }
  }
  return null
}

// Quote a list token when it cannot survive as a bare DSL word (spaces etc.).
const quoteListToken = (value: string): string => (/^[\w%$.-]+$/.test(value) ? value : `"${value}"`)

/** Compose a chip-list widget's tokens back into the DSL comma list. */
export function tokenListText(values: readonly string[]): string {
  return values.map(quoteListToken).join(',')
}

/** Parse a list value text into canonical chip tokens; null when any entry is not a
 *  clean member of the vocabulary (mutate prefixes, unknown names → text fallback). */
export function parseTokenListValues(text: string, choices: readonly string[]): string[] | null {
  const trimmed = text.trim()
  if (!trimmed) return []
  const byLower = new Map(choices.map((choice) => [choice.toLowerCase(), choice]))
  const values: string[] = []
  for (const rawToken of trimmed.split(',')) {
    // Serializer-quoted multi-word names ("Crit Damage") unwrap to their vocabulary spelling.
    const token = rawToken.trim().replace(/^"|"$/g, '')
    const canonical = byLower.get(token.toLowerCase())
    if (!canonical) return null
    values.push(canonical)
  }
  return values
}

// ── Prefix-aware list values (gearsets: `+Name`, `+-Name`, `-Name`) ──────────

/** One prefix-aware list entry — the editor model of a `[+|+-|-]Name` token. */
export type PrefixedListEntry = { prefix: ListTokenPrefix; name: string }

/** DSL prefix text per prefix category (the parser's own spellings). */
export const LIST_TOKEN_PREFIX_TEXT: Record<ListTokenPrefix, string> = {
  none: '',
  add: '+',
  addExcluded: '+-',
  remove: '-',
}

/** Parse a gearsets list value into prefix-aware entries. Canonicalizes names against
 *  the vocabulary and enforces the grammar's mode consistency (all bare = replace,
 *  all prefixed = mutate); a mixed list or an unknown name parses to null — the same
 *  raw-text fallback contract as parseTokenListValues. */
export function parsePrefixedTokenListValues(
  text: string,
  choices: readonly string[],
): PrefixedListEntry[] | null {
  const trimmed = text.trim()
  if (!trimmed) return []
  const byLower = new Map(choices.map((choice) => [choice.toLowerCase(), choice]))
  const entries: PrefixedListEntry[] = []
  for (const rawToken of trimmed.split(',')) {
    // Serializer-quoted names carry the prefix INSIDE the quotes ("+-Crit Damage").
    const token = rawToken.trim().replace(/^"|"$/g, '')
    const { prefix, value } = parsePrefixedToken(token)
    const canonical = byLower.get(value.toLowerCase())
    if (!canonical) return null
    entries.push({ prefix, name: canonical })
  }
  const hasBare = entries.some((entry) => entry.prefix === 'none')
  const hasPrefixed = entries.some((entry) => entry.prefix !== 'none')
  if (hasBare && hasPrefixed) return null
  return entries
}

/** Compose prefix-aware entries back into the DSL comma list. Multi-word names quote
 *  with the prefix inside the quotes — mirroring the serializer's emitListValue, so
 *  the composed text always re-parses to the same entries. */
export function prefixedTokenListText(entries: readonly PrefixedListEntry[]): string {
  return entries
    .map((entry) => {
      const composed = `${LIST_TOKEN_PREFIX_TEXT[entry.prefix]}${entry.name}`
      // Bare only when the name is one clean word without prefix-ambiguous characters.
      return /^[\w%$.]+$/.test(entry.name) ? composed : `"${composed}"`
    })
    .join(',')
}

/** Parse a `lvl=` value into its from/to milestones; null unless both are valid. */
export function parseLevelRangeValue(text: string): { from: string; to: string } | null {
  const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(text)
  if (!match) return null
  const from = match[1]!
  const to = match[2] ?? from
  const valid = (value: string): boolean => (LEVEL_MILESTONE_CHOICES as readonly string[]).includes(value)
  return valid(from) && valid(to) ? { from, to } : null
}

/** Compose the `lvl=` value text (single milestone when from === to). */
export function levelRangeText(range: { from: string; to: string }): string {
  return range.from === range.to ? range.from : `${range.from}-${range.to}`
}

/** Selector-field hint list for the selector row helper text. Both lists come from
 *  the grammar SSOT: the recipe grammar's field comparisons, or the shared tag-only
 *  subset the safeguard grammar accepts. */
export function selectorFieldsFor(blockDomain: OverridesDomain): readonly string[] {
  return blockDomain === 'recipe'
    ? NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS
    : NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS
}

/**
 * Compose an operation row's DSL text from the dropdown field + typed value. Values
 * beginning with a comparison operator (`>=5`) or a dotted family suffix (`.SPD=2`)
 * attach directly; everything else gets the standard `=`.
 */
export function composeOperationText(field: string, value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('>=') || trimmed.startsWith('<=') || trimmed.startsWith('.')) return `${field}${trimmed}`
  return `${field}=${trimmed}`
}

// ── Structured selector term model (visual condition rows) ────────────────────
// The visual editor renders a selector as a flat list of condition rows joined by
// ONE connective, with `not` allowed only per-row. That covers every selector the
// shipped presets use; anything deeper (mixed and/or nesting) stays in the raw DSL
// field. Rows hold parsed leaf ASTs; edits compose a term's DSL text and re-parse
// it through the real grammar, so the parser stays the validity SSOT.

/** Selector union across both grammars (the tag grammar is a structural subset). */
export type AnyOverridesSelector = RecipeOverridesSelector | NoteTagSelector

export type SelectorConnective = (typeof NOTE_OVERRIDES_LOGIC_KEYWORDS)[number]
export type FlatSelectorTerm = { negated: boolean; leaf: AnyOverridesSelector }
/** Row sequence with one connective per GAP (`a and b or c`), mirroring the source
 *  token order. Mixed connectives are allowed; precedence (`and` before `or`) is the
 *  grammar's own, so the rows read exactly like the DSL they produce. */
export type FlatSelector = { terms: FlatSelectorTerm[]; connectives: SelectorConnective[] }

// Combinator kinds shared by both selector grammars.
const isSelectorCombinator = (kind: string): boolean => kind === 'and' || kind === 'or' || kind === 'not'

/**
 * Rebuild a selector tree from the row sequence using the grammar's own precedence:
 * consecutive `and` gaps fold into left-associative runs, which the `or` gaps then
 * join left-associatively — exactly how the parser reads the same token sequence.
 * Null when the sequence is empty.
 */
export function buildSelectorFromFlat(flat: FlatSelector): AnyOverridesSelector | null {
  // The not-wrapper shape is shared by both grammars; the casts just re-unify it.
  const nodes = flat.terms.map((term) => (
    term.negated ? ({ kind: 'not', inner: term.leaf } as AnyOverridesSelector) : term.leaf
  ))
  if (nodes.length === 0) return null
  // Fold `and` runs first (higher precedence), collecting the resulting or-operands.
  const orOperands: AnyOverridesSelector[] = []
  let run = nodes[0]!
  for (let gap = 0; gap < flat.connectives.length; gap += 1) {
    const next = nodes[gap + 1]!
    if (flat.connectives[gap] === 'and') {
      run = { kind: 'and', left: run, right: next } as AnyOverridesSelector
    } else {
      orOperands.push(run)
      run = next
    }
  }
  orOperands.push(run)
  // Join the and-runs with left-associative `or`.
  return orOperands.reduce((left, right) => ({ kind: 'or', left, right } as AnyOverridesSelector))
}

/**
 * Flatten a selector tree into the row sequence (in-order leaves + gap connectives),
 * or null when the tree cannot be represented without parentheses — verified by
 * rebuilding the sequence through the same precedence fold and comparing trees, so
 * "representable" is exactly "re-parses to the identical AST". Paren-requiring tag
 * selectors (`(a or b) and c`) and negated composites fall back to the raw DSL field.
 */
export function flattenSelector(selector: AnyOverridesSelector): FlatSelector | null {
  const terms: FlatSelectorTerm[] = []
  const connectives: SelectorConnective[] = []
  const visit = (node: AnyOverridesSelector): boolean => {
    if (node.kind === 'and' || node.kind === 'or') {
      // In-order traversal: gaps land between the leaves in source order.
      if (!visit(node.left)) return false
      connectives.push(node.kind)
      return visit(node.right)
    }
    if (node.kind === 'not') {
      const inner: AnyOverridesSelector = node.inner
      if (isSelectorCombinator(inner.kind)) return false
      terms.push({ negated: true, leaf: inner })
      return true
    }
    terms.push({ negated: false, leaf: node })
    return true
  }
  if (!visit(selector)) return null
  const flat: FlatSelector = { terms, connectives }
  // Precedence check: the sequence must rebuild to the exact original tree.
  return JSON.stringify(buildSelectorFromFlat(flat)) === JSON.stringify(selector) ? flat : null
}

// ── Term view (leaf AST ⇄ widget state) ───────────────────────────────────────

/** Widget-facing shape of one condition row. `compare` keeps field/op/value as the
 *  DSL surface strings so composing the term text is trivial and lossless. */
export type SelectorTermView =
  | { kind: 'all' | 'tagged' | 'untagged' }
  | { kind: 'tag'; value: string }
  | { kind: 'tagIn'; values: string[] }
  | { kind: 'flex'; value: 'on' | 'off' }
  | { kind: 'compare'; field: string; op: '=' | '>=' | '<='; value: string }

// Parsed comparison op → DSL surface symbol.
const OP_VIEW: Record<'eq' | 'gte' | 'lte', '=' | '>=' | '<='> = { eq: '=', gte: '>=', lte: '<=' }

/** Map a leaf AST to its widget view; null for kinds the rows cannot show (future
 *  grammar additions) — the block then falls back to the raw DSL field. */
export function selectorLeafToView(leaf: AnyOverridesSelector): SelectorTermView | null {
  switch (leaf.kind) {
    case 'all': case 'tagged': case 'untagged': return { kind: leaf.kind }
    case 'tag': {
      if (leaf.mode === 'eq') return { kind: 'tag', value: leaf.values?.[0] ?? '' }
      if (leaf.mode === 'in') return { kind: 'tagIn', values: [...(leaf.values ?? [])] }
      // `tag any` / `tag none` are semantic twins of tagged/untagged — display as such.
      return { kind: leaf.mode === 'any' ? 'tagged' : 'untagged' }
    }
    case 'rank': return { kind: 'compare', field: 'rank', op: OP_VIEW[leaf.op], value: describeRankCodeDsl(leaf.value).text }
    case 'rarity': return { kind: 'compare', field: 'rarity', op: OP_VIEW[leaf.op], value: leaf.mode === 'auto' ? 'auto' : describeRarityCodeDsl(leaf.code ?? 0) }
    case 'minRolls': return { kind: 'compare', field: 'minrolls', op: OP_VIEW[leaf.op], value: String(leaf.value) }
    case 'lockedMinRolls': return { kind: 'compare', field: 'lockedminrolls', op: OP_VIEW[leaf.op], value: String(leaf.value) }
    case 'minSubstats': return { kind: 'compare', field: 'minsubstats', op: OP_VIEW[leaf.op], value: String(leaf.value) }
    case 'substatMin': return { kind: 'compare', field: 'substatmin', op: OP_VIEW[leaf.op], value: String(leaf.value) }
    // Dotted stat fields spell through statVariantToKey, never labelOfVariant: `field`
    // is not display text — selectorTermText concatenates it back into DSL that
    // parseSelectorLeafText re-parses, and an anomalous label ("PvE DMG +") tokenizes
    // apart on its space and `+`. Same spelling defaultViewForOption seeds rows with.
    case 'substatMinField': return { kind: 'compare', field: `substatmin.${statVariantToKey(leaf.variant)}`, op: OP_VIEW[leaf.op], value: String(leaf.value) }
    case 'minimaAny': return { kind: 'compare', field: 'minima.any', op: OP_VIEW[leaf.op], value: String(leaf.value) }
    case 'minimaField': return { kind: 'compare', field: `minima.${leaf.star}.${statVariantToKey(leaf.variant)}`, op: OP_VIEW[leaf.op], value: String(leaf.value) }
    case 'flex': return { kind: 'flex', value: leaf.value ? 'on' : 'off' }
    default: return null
  }
}

/** Compose one condition row's DSL term text (the inverse of selectorLeafToView). */
export function selectorTermText(view: SelectorTermView): string {
  switch (view.kind) {
    case 'all': case 'tagged': case 'untagged': return view.kind
    case 'tag': return `tag=${view.value}`
    case 'tagIn': return `tag in [${view.values.join(',')}]`
    case 'flex': return `flex=${view.value}`
    case 'compare': return `${view.field}${view.op}${view.value}`
  }
}

/** Parse one term's DSL text into a leaf AST; null unless it is a clean single
 *  (non-negated, non-combinator) condition of the block's grammar. */
export function parseSelectorLeafText(
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  text: string,
): AnyOverridesSelector | null {
  const parsed = parseSelectorText(hostDomain, blockDomain, text)
  if (!parsed || isSelectorCombinator(parsed.kind)) return null
  return parsed
}

// ── Term kind metadata (the condition dropdown) ───────────────────────────────

/** One entry of the condition-kind dropdown, with its op/value widget shape. */
export type SelectorTermOption = {
  id: string
  // Catalog key for the dropdown label (same term as the rest of the UI). REQUIRED —
  // see OperationTermOption.labelKey.
  labelKey: I18nKey
  // Optional qualifier rendered after the label (see OperationTermOption.labelDetailKey).
  labelDetailKey?: I18nKey
  // DSL surface token — shown when the UI has no friendly label for the id.
  token: string
  // Comparison ops offered; empty = no op picker.
  ops: ReadonlyArray<'=' | '>=' | '<='>
  // Value widget: none | single tag | tag chip list | number | closed choice list.
  value: 'none' | 'tag' | 'tags' | 'number' | 'choice'
  choices: readonly string[] | null
  // Localized labels for 'choice' values (see OperationTermOption.valueLabelKeys).
  valueLabelKeys?: Readonly<Partial<Record<string, I18nKey>>>
  // Bounds for the 'number' widget (see OperationTermOption.range).
  range?: NumberValueRange
  // Rich value control (see OperationTermOption.control) — single-value kinds only.
  control?: ValueControlKind
  // Extra pickers for the dotted stat/star field families.
  stat: boolean
  star: boolean
}

const ALL_COMPARE_OPS = ['=', '>=', '<='] as const

// Compact builder for plain numeric comparison fields.
const numericTermOption = (field: string, labelKey: I18nKey, range?: NumberValueRange): SelectorTermOption => (
  { id: field, token: field, labelKey, ops: ALL_COMPARE_OPS, value: 'number', choices: null, stat: false, star: false, ...(range ? { range } : {}) }
)

// Bare heads (all/tagged/untagged) derived from the tag-grammar SSOT keywords, plus
// the two tag-match shapes. This is the whole safeguard selector surface.
// Exhaustive over the tag-grammar keyword SSOT (minus 'tag', which expands to the
// two tag-match kinds below): a new bare selector keyword fails to compile here.
const TAG_SELECTOR_LABEL_KEYS: Record<Exclude<(typeof NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS)[number], 'tag'>, I18nKey> = {
  all: 'noteOverridesEditorSelKindAll',
  tagged: 'noteOverridesEditorSelKindTagged',
  untagged: 'noteOverridesEditorSelKindUntagged',
}
const TAG_TERM_OPTIONS: SelectorTermOption[] = [
  ...NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS.filter((keyword): keyword is Exclude<(typeof NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS)[number], 'tag'> => keyword !== 'tag').map((keyword) => (
    { id: keyword, token: keyword, labelKey: TAG_SELECTOR_LABEL_KEYS[keyword], ops: [], value: 'none', choices: null, stat: false, star: false } as SelectorTermOption
  )),
  { id: 'tag', token: 'tag', labelKey: 'noteOverridesEditorSelKindTag', ops: [], value: 'tag', choices: null, stat: false, star: false },
  { id: 'tagIn', token: 'tag in', labelKey: 'noteOverridesEditorSelKindTagIn', ops: [], value: 'tags', choices: null, stat: false, star: false },
]

type RecipeSelectorField = (typeof NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS)[number]

// Recipe comparison-term metadata, exhaustive over the selector-field SSOT list:
// ADDING A SELECTOR FIELD TO THE GRAMMAR FAILS TO COMPILE until its dropdown
// entry (or entries, for dotted families) is registered here.
const RECIPE_SELECTOR_TERM_META: Record<RecipeSelectorField, SelectorTermOption[]> = {
  tag: [],  // covered by the shared TAG_TERM_OPTIONS above
  rank: [{ id: 'rank', token: 'rank', labelKey: 'builderRank', ops: ALL_COMPARE_OPS, value: 'choice', choices: RANK_VALUE_CHOICES, valueLabelKeys: RANK_VALUE_LABEL_KEYS, control: 'rankValue', stat: false, star: false }],
  rarity: [{ id: 'rarity', token: 'rarity', labelKey: 'gearAnalyticsChartRarity', ops: ALL_COMPARE_OPS, value: 'choice', choices: NOTE_RECIPE_OVERRIDES_RARITY_NAMES, valueLabelKeys: RARITY_VALUE_LABEL_KEYS, control: 'rarityValue', stat: false, star: false }],
  minrolls: [numericTermOption('minrolls', 'tutAdvMinRollsTitle', ROLL_COUNT_RANGE)],
  lockedminrolls: [numericTermOption('lockedminrolls', 'tutLockedMinRollsTitle', ROLL_COUNT_RANGE)],
  minsubstats: [numericTermOption('minsubstats', 'builderRequiredSubstats', MIN_SUBSTATS_RANGE)],
  flex: [{ id: 'flex', token: 'flex', labelKey: 'tutSectionFlexLabel', ops: [], value: 'choice', choices: BOOL_VALS, valueLabelKeys: BOOL_VALUE_LABEL_KEYS, stat: false, star: false }],
  substatmin: [
    numericTermOption('substatmin', 'builderSubstatMenuMinRolls', ROLL_COUNT_RANGE),
    { id: 'substatmin.stat', token: 'substatmin.', labelKey: 'builderSubstatMenuMinRolls', ops: ALL_COMPARE_OPS, value: 'number', choices: null, stat: true, star: false, range: ROLL_COUNT_RANGE },
  ],
  minima: [
    // Star-rank CHOICE — compares the Any-rank fallback ★ column (see the op meta twin).
    { id: 'minima.any', token: 'minima.any', labelKey: 'noteOverridesEditorFieldMinima', labelDetailKey: 'anyRank', ops: ALL_COMPARE_OPS, value: 'choice', choices: RANK_NUM_CHOICES, valueLabelKeys: STAR_VALUE_LABEL_KEYS, control: 'starValue', stat: false, star: false },
    { id: 'minima.star.stat', token: 'minima.', labelKey: 'noteOverridesEditorFieldMinima', ops: ALL_COMPARE_OPS, value: 'number', choices: null, stat: true, star: true, range: MINIMA_TARGET_RANGE },
  ],
}

/** Condition-kind dropdown entries for a block of the given domain. */
export function selectorTermOptionsFor(blockDomain: OverridesDomain): SelectorTermOption[] {
  if (blockDomain === 'safeguard') return TAG_TERM_OPTIONS
  return [...TAG_TERM_OPTIONS, ...NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS.flatMap((field) => RECIPE_SELECTOR_TERM_META[field])]
}

/** Dropdown option id for a term view (dotted families collapse onto one entry). */
export function selectorViewOptionId(view: SelectorTermView): string {
  switch (view.kind) {
    case 'all': case 'tagged': case 'untagged': return view.kind
    case 'tag': return 'tag'
    case 'tagIn': return 'tagIn'
    case 'flex': return 'flex'
    case 'compare': {
      if (view.field === 'minima.any') return 'minima.any'
      if (view.field.startsWith('minima.')) return 'minima.star.stat'
      if (view.field.startsWith('substatmin.')) return 'substatmin.stat'
      return view.field
    }
  }
}

/** Stat-key lists the DSL accepts, re-exported from the stat-domain SSOT (types.ts)
 *  so the term rows, the list ops, and the EBNF text all read one definition.
 *  Substat and mainstat vocabularies are separate — see dslSubstatKeys' note. */
export { dslSubstatKeys, dslMainStatKeys }

/** Fresh parse-valid view when the user switches a row to this kind (tag kinds start
 *  empty and stay uncommitted until a value is entered). */
export function defaultViewForOption(option: SelectorTermOption): SelectorTermView {
  if (option.value === 'none') return { kind: option.id as 'all' | 'tagged' | 'untagged' }
  if (option.value === 'tag') return { kind: 'tag', value: '' }
  if (option.value === 'tags') return { kind: 'tagIn', values: [] }
  if (option.id === 'flex') return { kind: 'flex', value: 'on' }
  // Dotted stat fields (substatmin., minima.STAR.) are substat positions.
  const statKey = dslSubstatKeys()[0] ?? 'SPD'
  const field = option.id === 'substatmin.stat' ? `substatmin.${statKey}`
    : option.id === 'minima.star.stat' ? `minima.5.${statKey}`
    : option.token
  return { kind: 'compare', field, op: '=', value: option.choices?.[0] ?? '1' }
}

// Numeric recipe fields that accept $value/$count expressions when the recipe block
// is CROSS-domain (hosted by a safeguard marker's slider) — mirrors the parser's
// crossDomain branch; the SSOT completeness test parses `field=$value` through the
// real grammar for every entry here, so the spellings cannot drift.
const CROSS_RECIPE_SLIDER_VALUE_FIELDS = ['rank', 'minrolls', 'lockedminrolls', 'minsubstats'] as const

/**
 * True when an assignment field accepts the enclosing slider's `$value` (optionally
 * inside an arithmetic expression) — drives the visual calc widget in the op row.
 */
export function operationSupportsSliderValue(
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  field: string,
): boolean {
  if (blockDomain === 'safeguard') return field === 'count' || field === 'improvchance'
  // Recipe blocks: only the cross-domain numeric quartet resolves $value.
  return hostDomain === 'safeguard' && (CROSS_RECIPE_SLIDER_VALUE_FIELDS as readonly string[]).includes(field)
}

/** Widget state of the simple calc expressions the visual editor builds
 *  (`$value`, `$value/8`, `$value*2`, plain numbers). Richer ASTs stay text. */
export type SliderValueCalc = { source: 'slider' | 'number'; base: number; op: '/' | '*' | '+' | '-' | null; operand: number }

/** Compose the DSL value text for a calc widget state. */
export function sliderValueCalcText(calc: SliderValueCalc): string {
  if (calc.source === 'number') return String(calc.base)
  if (!calc.op) return '$value'
  // Binary '-' must be space-separated ('-' is a word token in the DSL grammar).
  return calc.op === '-' ? `$value - ${calc.operand}` : `$value${calc.op}${calc.operand}`
}

/** Parse a value text back into the calc widget state; null when the expression is
 *  richer than the widget (parens, cross-slider refs) — the row shows text instead. */
export function parseSliderValueCalc(text: string): SliderValueCalc | null {
  const trimmed = text.trim()
  if (trimmed === '') return { source: 'slider', base: 0, op: null, operand: 1 }
  const numeric = Number.parseFloat(trimmed)
  if (Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) return { source: 'number', base: numeric, op: null, operand: 1 }
  const match = /^\$(?:value|count)(?:\s*([*/+-])\s*(\d+(?:\.\d+)?))?$/.exec(trimmed)
  if (!match) return null
  if (!match[1]) return { source: 'slider', base: 0, op: null, operand: 1 }
  return { source: 'slider', base: 0, op: match[1] as '/' | '*' | '+' | '-', operand: Number.parseFloat(match[2]!) }
}

/** All tag values referenced by selectors anywhere in the note — suggestions for the
 *  tag autocomplete, so authors pick existing tags instead of retyping them. */
export function collectKnownSelectorTags(note: string): string[] {
  const tags = new Set<string>()
  const visitSelector = (selector: AnyOverridesSelector): void => {
    if (selector.kind === 'and' || selector.kind === 'or') { visitSelector(selector.left); visitSelector(selector.right); return }
    if (selector.kind === 'not') { visitSelector(selector.inner); return }
    if (selector.kind === 'tag') for (const value of selector.values ?? []) tags.add(value)
  }
  const visitBlocks = (blocks: DraftSelectorBlock[]): void => blocks.forEach((block) => visitSelector(block.selector))
  for (const ref of listOverrideBlocks(note)) {
    const draft = parseOverridesBlockDraft(ref.raw).draft
    if (draft?.kind !== 'question') continue
    for (const option of draft.options) {
      if (option.body.kind !== 'structured') continue
      visitBlocks(option.body.blocks)
      visitBlocks(option.body.crossBlocks)
      visitBlocks(option.body.elseBlocks)
      visitBlocks(option.body.crossElseBlocks)
    }
    if (draft.fallback) {
      visitBlocks(draft.fallback.blocks)
      visitBlocks(draft.fallback.crossBlocks)
    }
  }
  return Array.from(tags).sort()
}

/** All tags defined on the safeguard rules — the OTHER source of tag suggestions.
 *  Rule tags exist as soon as an author tags a safeguard, before any selector uses
 *  them, so a freshly-created tag can be offered without first being typed into DSL.
 *  Input is just the per-rule tag arrays (kept decoupled from the SafeguardRule type)
 *  and is normalized through the shared tag grammar so casing/aliases match selectors. */
export function collectSafeguardRuleTags(
  ruleTagLists: readonly (readonly string[] | null | undefined)[],
): string[] {
  const tags = new Set<string>()
  for (const list of ruleTagLists) {
    // normalizeTagList canonicalizes case + legacy aliases exactly like selector tags.
    for (const tag of normalizeTagList(list) ?? []) tags.add(tag)
  }
  return Array.from(tags).sort()
}

/** Union of tags already used in the note's selectors and tags defined on safeguard
 *  rules — the full suggestion set for the tag autocomplete. Selector tags come first
 *  (author's own usage), rule tags fill in the rest via the shared merge helper. */
export function collectOverridesTagSuggestions(
  note: string,
  ruleTagLists: readonly (readonly string[] | null | undefined)[],
): string[] {
  return mergeTagList(collectKnownSelectorTags(note), collectSafeguardRuleTags(ruleTagLists)).sort()
}
