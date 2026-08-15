/**
 * noteRecipeOverrides.ts
 *
 * Parses in-note recipe overrides markers and resolves selector-based overrides
 * that drive recipe export-mode overrides.
 */
import type { BuilderRecipe, SellfileExportMode, Star, SubstatRollTargetEntry, SubstatTargetTable } from './hsfBuilder'
import type { SafeguardOverridesSelectorBlock, SafeguardOverridesInstruction } from './noteSafeguardOverrides'
// Runtime import for cross-domain parsing — safe for circular use since only called inside function bodies.
import {
  parseSafeguardSelectorBlock,
  SLIDER_TOGGLE_OFF,
  resolveNoteSafeguardOverridesTags,
  buildSafeguardSliderTokenMap,
  buildSafeguardOptionTokenMap,
  applySafeguardOptionWrites,
  type NoteSafeguardOverridesAnswers,
  type SafeguardNoteQuestionDefinition,
} from './noteSafeguardOverrides'
import { arraysEqual } from './array'
import { clampAggregateRollValue } from './aggregateRollState'
import { RARITY_AUTO_LABEL, SUBSTAT_TARGET_MAX_ROLLS } from './constants'
import { normalizeTagValue } from './tagHelpers'
import {
  type Token,
  type DiagnosticSpan,
  type NoteCountAstNode,
  type NoteQuestionGroupType,
  type ParsedOverridesOption,
  type OverridesSetValueDirective,
  type ParsedOverridesQuestion,
  TokenCursor,
  NOTE_OVERRIDES_QUESTION_KEYWORDS,
  NOTE_OVERRIDES_FALLBACK_KEYWORDS,
  NOTE_OVERRIDES_GROUP_TYPE_MAP,
  NOTE_OVERRIDES_CONSTRAINT_KEYWORDS,
  NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS,
  NOTE_OVERRIDES_LOGIC_KEYWORDS,
  NOTE_OVERRIDES_MARKER_COLUMNS_KEY,
  NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT,
  NOTE_OVERRIDES_OPTION_COLUMNS_DEFAULT,
  stripCommentWrapper,
  collectSelectorTokensAndOpenBlock,
  parseOverridesMarkerBody,
  parseOverridesMarkerSpacerColumns,
  buildGlobalExplicitTokenMap,
  buildQuestionImplicitTokenMap,
  parseCountExpression,
  parseOverridesBooleanValue,
  reportInvalidEnumValue,
  NOTE_OVERRIDES_BOOLEAN_KEYWORDS,
  localizeDslDisplay,
  parsePrefixedToken,
  classifyListMode,
  consumeCommaSeparatedRemainder,
  // Option-info display helpers — the shared contract both domains render through.
  overridesStatKey,
  formatOverridesMutateList,
  formatOverridesStatKeyList,
  formatOverridesStatKeyMutateList,
} from './noteOverridesParser'
// Case-insensitive set display name → ArtifactSetId (SSOT defined next to the tuple parser).
import { artifactSetIdByName } from './safeguards'
import { normalizeRollTargetEntry, quantizeTargetValueForVariant } from './hsfBuilder/targets'
import { cloneBuilderRecipe } from './recipeMultiEditDraft'
import { countPositiveSubstats } from './recipeNormalization'
import { cloneSubstatTargets } from './substatTargets'
import {
  ArtifactType,
  type ArtifactSetId,
  type ArtifactTypeId,
  type LevelMilestone,
  type RankCode,
  RankCode as RankCodeEnum,
  type RarityCode,
  RarityCode as RarityCodeEnum,
  type StatVariant,
  artifactSetNames,
  artifactTypeNames,
  isLevelMilestone,
  rarityCodeToName,
  // Stat-key resolvers, one per DSL position: substat fields/lists accept the full
  // substat vocabulary, `mainstats=` only what a slot can actually carry as a main.
  statKeyToVariant,
  mainStatKeyToVariant,
} from './types'
import { retainAllowedMainStats, retainAllowedSubstats } from './statCompatibility'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import {
  normalizeAggregateRollTargets,
  normalizeAutoRaritySupplements,
  normalizeAutoSubstatFlex,
  normalizeKeepMode,
  normalizeLevelWindow,
  normalizeSlotsOverrideFaction,
  pruneSubstatDependents,
  type AutoRaritySupplementsThreshold,
} from './recipeNormalization'
import { pickAutoRaritySupplementsThreshold } from './raritySupplements'

// ── Backward-compatible NOTE_RECIPE_OVERRIDES_* aliases ──────────────────────
// These names are preserved for the syntax highlighter (prismDynamicOverrides.ts)
// and any other callers. The canonical definitions now live in noteOverridesParser.ts.

/** @see NOTE_OVERRIDES_MARKER_COLUMNS_KEY */
export const NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY = NOTE_OVERRIDES_MARKER_COLUMNS_KEY
/** @see NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT */
export const NOTE_RECIPE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT = NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT
/** @see NOTE_OVERRIDES_QUESTION_KEYWORDS */
export const NOTE_RECIPE_OVERRIDES_QUESTION_KEYWORDS = NOTE_OVERRIDES_QUESTION_KEYWORDS
/** @see NOTE_OVERRIDES_FALLBACK_KEYWORDS */
export const NOTE_RECIPE_OVERRIDES_FALLBACK_KEYWORDS = NOTE_OVERRIDES_FALLBACK_KEYWORDS
/**
 * Shared group-type map (now includes slider/range keywords from the shared module).
 * @see NOTE_OVERRIDES_GROUP_TYPE_MAP
 */
export const NOTE_RECIPE_OVERRIDES_GROUP_TYPE_MAP = NOTE_OVERRIDES_GROUP_TYPE_MAP
/** All surface keywords that denote a group type (derived from the shared map). */
export const NOTE_RECIPE_OVERRIDES_GROUP_TYPE_KEYWORDS = (
  Object.keys(NOTE_OVERRIDES_GROUP_TYPE_MAP) as readonly string[]
)
/** Rarity tier names accepted by the DSL (includes `any` and `auto`). */
export const NOTE_RECIPE_OVERRIDES_RARITY_NAMES = [
  'any', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythical', 'auto',
] as const
/** Accepted `export=` values (per-field SSOT for parse + diagnostics). */
export const NOTE_RECIPE_OVERRIDES_EXPORT_VALS = ['active', 'disabled', 'toggle'] as const
/** Accepted `keep=` values (per-field SSOT for parse + diagnostics). */
export const NOTE_RECIPE_OVERRIDES_KEEP_VALS = ['early', 'late'] as const
/** Accepted `action=` values — flips the recipe's Keep/Sell flag (mirrors `export=`'s toggle shape). */
export const NOTE_RECIPE_OVERRIDES_ACTION_VALS = ['keep', 'sell', 'toggle'] as const
/** Accepted `autolate=` rarity-threshold values (per-field SSOT for parse + diagnostics). */
export const NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS = ['uncommon', 'rare', 'epic'] as const
/** Enumerated string values for non-numeric fields (export=, keep=, flex=), composed from
 *  the per-field SSOT sets above + the shared boolean keywords. Drives Prism `boolean-val`. */
export const NOTE_RECIPE_OVERRIDES_ENUM_VALS = [
  ...NOTE_RECIPE_OVERRIDES_EXPORT_VALS,  // export=
  ...NOTE_RECIPE_OVERRIDES_KEEP_VALS,    // keep=
  ...NOTE_RECIPE_OVERRIDES_ACTION_VALS,  // action=  (keep/sell/toggle; 'keep'/'toggle' shared with above)
  ...NOTE_OVERRIDES_BOOLEAN_KEYWORDS,    // flex=
] as const
/** Artifact slot names accepted by the DSL `slots=` assignment field (SSOT from ArtifactType). */
export const NOTE_RECIPE_OVERRIDES_SLOT_NAMES = Object.keys(ArtifactType) as readonly string[]
/** Max required substats (`minsubstats=`): an artifact holds at most 4 substats. SSOT for the
 *  apply-side clamps below and the visual editor's number-widget cap. */
export const NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX = 4
/** Built-in selector and tag-match keywords: the shared tag-grammar heads (minus `tag`, which
 *  the highlighter colours through its own `tag-comparison` token) plus the two `tag any`/
 *  `tag none` match words. DERIVED from the tag-selector SSOT — a new bare selector keyword
 *  must never need a second spelling here to get highlighted. */
export const NOTE_RECIPE_OVERRIDES_SELECTOR_BUILTINS = [
  ...NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS.filter((keyword) => keyword !== 'tag'),
  'any', 'none',
] as const
/** @see NOTE_OVERRIDES_CONSTRAINT_KEYWORDS */
export const NOTE_RECIPE_OVERRIDES_CONSTRAINT_KEYWORDS = NOTE_OVERRIDES_CONSTRAINT_KEYWORDS
/** @see NOTE_OVERRIDES_LOGIC_KEYWORDS */
export const NOTE_RECIPE_OVERRIDES_LOGIC_KEYWORDS = NOTE_OVERRIDES_LOGIC_KEYWORDS
// Fields valid in BOTH selector terms and assignment blocks.
// Add a new field here to make it available in both @term conditions and rule assignments.
const TERM_AND_ASSIGNMENT_FIELDS = [
  'rank', 'rarity', 'minrolls', 'lockedminrolls', 'minsubstats', 'flex', 'substatmin', 'minima',
] as const
/** Field names valid on the left-hand side of assignment blocks. */
export const NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS = [
  'export',
  ...TERM_AND_ASSIGNMENT_FIELDS,
  'lvl', 'keep', 'action', 'autolate', 'rolltarget',
  // List-valued fields for slot, substat, main-stat, and artifact-set/metaset filtering (comma-separated).
  'slots', 'substats', 'mainstats', 'gearsets', 'metasets',
] as const
/** Field names valid in selector term comparisons. */
export const NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS = [
  'tag',
  ...TERM_AND_ASSIGNMENT_FIELDS,
] as const

export type RecipeOverridesSelector =
  | { kind: 'all' }
  | { kind: 'tagged' }
  | { kind: 'untagged' }
  | { kind: 'tag'; mode: 'eq' | 'in' | 'any' | 'none'; values?: string[] }
  | { kind: 'rank'; op: TagOverrideOp; value: RankCode }
  | { kind: 'rarity'; op: TagOverrideOp; mode: 'auto' | 'code'; code?: RarityCode }
  | { kind: 'minRolls'; op: TagOverrideOp; value: number }
  | { kind: 'lockedMinRolls'; op: TagOverrideOp; value: number }
  | { kind: 'minSubstats'; op: TagOverrideOp; value: number }
  | { kind: 'flex'; value: boolean }
  // substatmin conditions — match per-recipe substat roll-minimum bounds.
  | { kind: 'substatMin'; op: TagOverrideOp; value: number }
  | { kind: 'substatMinField'; op: TagOverrideOp; variant: StatVariant; value: number }
  // minima conditions — match against the shared SubstatTargetTable (requires targets to be threaded in).
  | { kind: 'minimaAny'; op: TagOverrideOp; value: number }
  | { kind: 'minimaField'; op: TagOverrideOp; star: Star; variant: StatVariant; value: number }
  | { kind: 'not'; inner: RecipeOverridesSelector }
  | { kind: 'and'; left: RecipeOverridesSelector; right: RecipeOverridesSelector }
  | { kind: 'or'; left: RecipeOverridesSelector; right: RecipeOverridesSelector }

export type RecipeOverridesOperation =
  | { kind: 'exportMode'; action: 'active' | 'disabled' | 'toggle' }
  // Cross-domain slider blocks may produce value: null with an ast for resolve-time eval.
  | { kind: 'rank'; value: RankCode | null; ast?: NoteCountAstNode }
  | { kind: 'rarity'; mode: 'auto' | 'code'; code?: RarityCode }
  | { kind: 'level'; min: LevelMilestone; max: LevelMilestone }
  | { kind: 'keep'; mode: 'early' | 'late' }
  // Flips the recipe's Keep/Sell flag (recipe.keep). 'toggle' inverts the current value.
  | { kind: 'keepAction'; action: 'keep' | 'sell' | 'toggle' }
  | { kind: 'autoLate'; threshold: AutoRaritySupplementsThreshold }
  | { kind: 'minRequiredRolls'; value: number | null; ast?: NoteCountAstNode }
  | { kind: 'lockedMinRequiredRolls'; value: number | null; ast?: NoteCountAstNode }
  | { kind: 'minSubstats'; value: number | null; ast?: NoteCountAstNode }
  | { kind: 'flex'; value: boolean }
  | { kind: 'substatMinAll'; value: number }
  | { kind: 'substatMinVariant'; variant: StatVariant; value: number }
  | { kind: 'minimaAnyRank'; value: Star }
  | { kind: 'minimaTarget'; star: Star; variant: StatVariant; value: number }
  // Per-substat roll target override: absolute threshold at Base (rollIndex 0)
  // and each subsequent roll (+1…+SUBSTAT_TARGET_MAX_ROLLS). Omitted trailing
  // positions clamp at max(factory, lastSpecified) at build time.
  | { kind: 'rollTarget'; variant: StatVariant; base: number; increments: Array<number | null> }
  // List operations — replace or mutate the corresponding recipe list.
  // replace: overwrite the field entirely; mutate: add/remove individual entries.
  | { kind: 'artifactTypes'; mode: 'replace'; values: ArtifactTypeId[] }
  | { kind: 'artifactTypes'; mode: 'mutate'; add: ArtifactTypeId[]; remove: ArtifactTypeId[] }
  | { kind: 'substats'; mode: 'replace'; variants: StatVariant[] }
  | { kind: 'substats'; mode: 'mutate'; add: StatVariant[]; remove: StatVariant[] }
  | { kind: 'mainStats'; mode: 'replace'; variants: StatVariant[] }
  | { kind: 'mainStats'; mode: 'mutate'; add: StatVariant[]; remove: StatVariant[] }
  | { kind: 'artifactSets'; mode: 'replace'; ids: ArtifactSetId[] }
  | { kind: 'artifactSets'; mode: 'mutate'; add: ArtifactSetSelectionEntry[]; remove: ArtifactSetId[] }
  | { kind: 'artifactMetaSets'; mode: 'replace'; names: string[] }
  | { kind: 'artifactMetaSets'; mode: 'mutate'; add: string[]; remove: string[] }

/**
 * Operation kind → DSL assignment-field token (the left-hand side that produced it).
 * SSOT for any consumer that needs to render an operation back as DSL (e.g. the
 * note-editor option-info tooltip). Typed as an exhaustive Record over the operation
 * union, so adding a new `RecipeOverridesOperation` kind fails to compile until its
 * field token is registered here — keeping this in lock-step with the parser branches
 * and the `NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS` grammar list.
 */
export const RECIPE_OVERRIDES_OP_FIELD: Record<RecipeOverridesOperation['kind'], string> = {
  exportMode: 'export',
  rank: 'rank',
  rarity: 'rarity',
  level: 'lvl',
  keep: 'keep',
  keepAction: 'action',
  autoLate: 'autolate',
  minRequiredRolls: 'minrolls',
  lockedMinRequiredRolls: 'lockedminrolls',
  minSubstats: 'minsubstats',
  flex: 'flex',
  substatMinAll: 'substatmin',
  substatMinVariant: 'substatmin',
  minimaAnyRank: 'minima',
  minimaTarget: 'minima',
  rollTarget: 'rolltarget',
  artifactTypes: 'slots',
  substats: 'substats',
  mainStats: 'mainstats',
  artifactSets: 'gearsets',
  artifactMetaSets: 'metasets',
}

/**
 * Selector kind → DSL selector token, for the same DSL-reconstruction consumers.
 * Exhaustive over the selector union so new selector kinds must be registered here.
 * Logical combinators (not/and/or) map to their keyword; callers that need the full
 * nested expression should recurse, but the bare keyword suffices for summaries.
 */
export const RECIPE_OVERRIDES_SELECTOR_TOKEN: Record<RecipeOverridesSelector['kind'], string> = {
  all: 'all',
  tagged: 'tagged',
  untagged: 'untagged',
  tag: 'tag',
  rank: 'rank',
  rarity: 'rarity',
  minRolls: 'minrolls',
  lockedMinRolls: 'lockedminrolls',
  minSubstats: 'minsubstats',
  flex: 'flex',
  substatMin: 'substatmin',
  substatMinField: 'substatmin',
  minimaAny: 'minima',
  minimaField: 'minima',
  not: 'not',
  and: 'and',
  or: 'or',
}

// Rank-code → compact display value (`3`, `≥3`, `≤4`, `any`). No existing helper covers
// the note GTE/LTE rank codes, so this inverts the parser's parseRankOverride mapping.
const RECIPE_RANK_CODE_DISPLAY: Record<number, string> = {
  [RankCodeEnum.Any]: 'any',
  [RankCodeEnum.One]: '1', [RankCodeEnum.Two]: '2', [RankCodeEnum.Three]: '3',
  [RankCodeEnum.Four]: '4', [RankCodeEnum.Five]: '5', [RankCodeEnum.Six]: '6',
  [RankCodeEnum.GTE_One]: '≥1', [RankCodeEnum.GTE_Two]: '≥2', [RankCodeEnum.GTE_Three]: '≥3',
  [RankCodeEnum.GTE_Four]: '≥4', [RankCodeEnum.GTE_Five]: '≥5',
  [RankCodeEnum.LTE_Two]: '≤2', [RankCodeEnum.LTE_Three]: '≤3', [RankCodeEnum.LTE_Four]: '≤4',
  [RankCodeEnum.LTE_Five]: '≤5', [RankCodeEnum.LTE_Six]: '≤6',
}

/**
 * Format a recipe-overrides operation's VALUE as compact display text (the right-hand
 * side of its `field=…` assignment) for the note-editor option-info tooltip. Exhaustive
 * `switch` over the operation union — a new op kind fails to compile until handled here.
 * The field token comes from RECIPE_OVERRIDES_OP_FIELD.
 *
 * Values are readable, not byte-identical DSL (`≥3`, `5★`, `+[600,900]`) while stat
 * IDENTIFIERS spell through the DSL vocabulary — see the option-info display contract
 * in noteOverridesParser.ts, which this and its safeguard twin both answer to.
 *
 * Returns null when the op has no meaningful scalar value (slider-AST blocks).
 */
export function formatRecipeOverridesOpValue(op: RecipeOverridesOperation): string | null {
  switch (op.kind) {
    case 'exportMode': return op.action
    case 'rank': return op.value != null ? (RECIPE_RANK_CODE_DISPLAY[op.value] ?? String(op.value)) : '$count'
    case 'rarity': return op.mode === 'auto' ? 'auto' : rarityCodeToName(op.code).replace(/\s/g, '') || 'any'
    case 'level': return `${op.min}..${op.max}`
    case 'keep': return op.mode
    case 'keepAction': return op.action
    case 'autoLate': return op.threshold
    case 'minRequiredRolls':
    case 'lockedMinRequiredRolls':
    case 'minSubstats': return op.value != null ? String(op.value) : '$count'
    case 'flex': return String(op.value)
    case 'substatMinAll': return String(op.value)
    case 'substatMinVariant': return `${overridesStatKey(op.variant)}=${op.value}`
    case 'minimaAnyRank': return String(op.value)
    case 'minimaTarget': return `${op.star}★ ${overridesStatKey(op.variant)}=${op.value}`
    case 'rollTarget': {
      const incs = op.increments.map((n) => (n == null ? '·' : String(n))).join(',')
      return `${overridesStatKey(op.variant)} ${op.base}${incs ? ` +[${incs}]` : ''}`
    }
    case 'artifactTypes': return op.mode === 'replace'
      ? op.values.map((id) => artifactTypeNames[id] ?? String(id)).join(',')
      : formatOverridesMutateList(op.add.map((id) => artifactTypeNames[id] ?? String(id)), op.remove.map((id) => artifactTypeNames[id] ?? String(id)))
    case 'substats':
    case 'mainStats': return op.mode === 'replace'
      ? formatOverridesStatKeyList(op.variants)
      : formatOverridesStatKeyMutateList(op.add, op.remove)
    case 'artifactSets': return op.mode === 'replace'
      ? op.ids.map((id) => artifactSetNames[id] ?? String(id)).join(',')
      : formatOverridesMutateList(op.add.map((e) => artifactSetNames[e.id] ?? String(e.id)), op.remove.map((id) => artifactSetNames[id] ?? String(id)))
    case 'artifactMetaSets': return op.mode === 'replace'
      ? op.names.join(',')
      : formatOverridesMutateList(op.add, op.remove)
  }
}

// Comparison-op → DSL symbol for selector conditions (rank>=3, minrolls=4, …).
const SELECTOR_OP_SYMBOL: Record<'eq' | 'gte' | 'lte', string> = { eq: '=', gte: '≥', lte: '≤' }

/**
 * Format a recipe-overrides SELECTOR as its condition text (e.g. `lockedminrolls=4`,
 * `rank≥3`, `rarity=epic`, `all`) for the note-editor option-info tooltip. Exhaustive
 * `switch` over the selector union — a new selector kind fails to compile until handled
 * here. Logical combinators recurse. Same display contract as the op formatter above:
 * sugared values (`≥`, `★`), DSL-vocabulary identifiers (the dotted stat keys).
 */
export function formatRecipeOverridesSelector(sel: RecipeOverridesSelector): string {
  switch (sel.kind) {
    case 'all':       return 'all'
    case 'tagged':    return 'tagged'
    case 'untagged':  return 'untagged'
    case 'tag': {
      const values = sel.values ?? []
      if (sel.mode === 'any')  return 'tag any'
      if (sel.mode === 'none') return 'tag none'
      if (sel.mode === 'in')   return `tag in ${values.join(',')}`
      return values.length ? `tag=${values.join(',')}` : 'tag'
    }
    case 'rank':            return `rank${SELECTOR_OP_SYMBOL[sel.op]}${RECIPE_RANK_CODE_DISPLAY[sel.value] ?? sel.value}`
    case 'rarity':          return `rarity${SELECTOR_OP_SYMBOL[sel.op]}${sel.mode === 'auto' ? 'auto' : (rarityCodeToName(sel.code).replace(/\s/g, '') || 'any')}`
    case 'minRolls':        return `minrolls${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'lockedMinRolls':  return `lockedminrolls${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'minSubstats':     return `minsubstats${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'flex':            return `flex=${sel.value}`
    case 'substatMin':      return `substatmin${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'substatMinField': return `substatmin.${overridesStatKey(sel.variant)}${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'minimaAny':       return `minima${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'minimaField':     return `minima.${sel.star}★.${overridesStatKey(sel.variant)}${SELECTOR_OP_SYMBOL[sel.op]}${sel.value}`
    case 'not':             return `not ${formatRecipeOverridesSelector(sel.inner)}`
    case 'and':             return `${formatRecipeOverridesSelector(sel.left)} and ${formatRecipeOverridesSelector(sel.right)}`
    case 'or':              return `${formatRecipeOverridesSelector(sel.left)} or ${formatRecipeOverridesSelector(sel.right)}`
  }
}

export type RecipeOverridesSelectorBlock = {
  selector: RecipeOverridesSelector
  operations: RecipeOverridesOperation[]
}

// A single answer option for a question.
export type NoteQuestionOption = {
  id: string
  label: string
  // Optional second string rendered as the value column in two-column layouts.
  detail: string | null
  blocks: RecipeOverridesSelectorBlock[]
  // Cross-domain blocks that target safeguard rules when this option is active.
  safeguardBlocks: SafeguardOverridesSelectorBlock[]
  // `else` blocks: applied when THIS option is NOT selected (per-option, e.g. an unchecked box).
  elseBlocks: RecipeOverridesSelectorBlock[]
  safeguardElseBlocks: SafeguardOverridesSelectorBlock[]
  isDefault: boolean
  token: string
  setOptionIds: string[]
  unsetOptionIds: string[]
  excludedOptionIds: string[]
  // Cross-domain forcing (computed, never persisted). While this option is selected:
  //  • setValueDirectives — force each named slider (by its id=token) to a value, toggled on.
  //  • setTokens / unsetTokens / excludedTokens — raw header tokens; a token matching a
  //    safeguard slider's id forces that slider's toggle on (set) or off (unset), and one
  //    matching a safeguard OPTION's id selects (set) or deselects (unset/excl) that option.
  //    In-domain resolution of these tokens lives in set/unset/excludedOptionIds; the raw
  //    forms are retained for the cross-domain bridge.
  setValueDirectives: OverridesSetValueDirective[]
  setTokens: string[]
  unsetTokens: string[]
  excludedTokens: string[]
  // `needs` ids: the UI renders this option disabled until at least one of these
  // is selected. Empty = always enabled. Purely a UI gate (selection unaffected).
  requiresOptionIds: string[]
  // Optional `needs=on|off`: displayed checkbox state while the gate is unmet
  // (display only; stored value untouched). null = keep the current state.
  requiresDisabledState: 'on' | 'off' | null
  groupType: NoteQuestionGroupType
  // 1-based positional index within the question (the implicit DSL reference token
  // usable when no explicit `id=` is set). Always present so the UI can show a stable
  // way to reference the option.
  positionalIndex: number
  // Absolute source span of the whole option block in the note text (for click-to-select
  // in the editor preview). Absent when the parser could not determine it.
  sourceFrom?: number
  sourceTo?: number
}

// Selector blocks that apply when no options are selected.
export type NoteQuestionFallback = {
  blocks: RecipeOverridesSelectorBlock[]
  safeguardBlocks: SafeguardOverridesSelectorBlock[]
}

// Selector blocks that apply when a group has no selections.
export type NoteQuestionGroupFallback = {
  blocks: RecipeOverridesSelectorBlock[]
  safeguardBlocks: SafeguardOverridesSelectorBlock[]
}

// Group metadata for a single question.
export type NoteQuestionGroup = {
  id: string
  type: NoteQuestionGroupType
  options: NoteQuestionOption[]
  fallback: NoteQuestionGroupFallback | null
}

// Parsed question metadata plus resolved answer.
export type NoteQuestionDefinition = {
  id: string
  index: number
  prompt: string
  // columns ≥ 1 enables horizontal (grid) option layout at N× card width; 0 = vertical.
  layoutColumns: number
  // Explicit option-grid column count (`optcols=N`); 0 = auto-fit. See NoteDialog layout.
  optionColumns: number
  groups: NoteQuestionGroup[]
  options: NoteQuestionOption[]
  fallback: NoteQuestionFallback | null
  defaultAnswer: string[]
  answer: string[]
  // True for body-less spacer markers; card is invisible, width only.
  isSpacer?: true
}

// Persisted SFC key for recipe overrides answers. Written after `Note` by buildSfcPayload and
// read back by parseSfcObject, so it serves the .sfc file, the autosave snapshot and the
// background account push alike. Part of the on-disk format — never rename it.
export const NOTE_RECIPE_OVERRIDES_ANSWERS_KEY = 'NoteRecipeOverridesAnswers'
// Persisted SFC key for the dynamic-overrides (recipe + safeguard) kill switch. The name keeps
// its legacy "Recipe" spelling for backward-compatible restore even though it gates both domains.
export const NOTE_DYNAMIC_OVERRIDES_DISABLED_KEY = 'NoteRecipeOverridesDisabled'
// Marker keyword for recipe overrides in note comments.
export const NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD = 'recipe-overrides'
// Keep parsing the legacy marker silently for backward compatibility.
const NOTE_RECIPE_OVERRIDES_LEGACY_MARKER_KEYWORD = 'config-options'
// Accept both marker keywords without surfacing legacy wording in the UI.
export const NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS = [
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD,
  NOTE_RECIPE_OVERRIDES_LEGACY_MARKER_KEYWORD,
] as const
// Share a single regex fragment so parser and UI marker detection stay in sync.
export const NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN = NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS.join('|')

// Match legacy marker openings so imports can normalize them once at IO boundaries.
const NOTE_RECIPE_OVERRIDES_LEGACY_MARKER_OPEN_REGEX = new RegExp(
  `<!--(\\s*)${NOTE_RECIPE_OVERRIDES_LEGACY_MARKER_KEYWORD}\\b`,
  'gi',
)

// Canonicalize legacy note markers so new exports always use recipe-overrides wording.
export const canonicalizeNoteRecipeOverridesMarkers = (note: string): string => (
  note.replace(
    NOTE_RECIPE_OVERRIDES_LEGACY_MARKER_OPEN_REGEX,
    `<!--$1${NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD}`,
  )
)

// Stored answers keyed by question ID.
export type NoteRecipeOverridesAnswers = Record<string, string[]>

// Split a question prompt into its title (first line) and optional subtext (remainder).
// SSOT for the card header AND the saved-set tooltip so both show the same title-only text.
export type QuestionPromptParts = { title: string; subtext: string | null }
export const splitQuestionPrompt = (prompt: string): QuestionPromptParts => {
  // Locate the first newline to split title/subtext.
  const splitIndex = prompt.indexOf('\n')
  // Treat single-line prompts as title-only.
  if (splitIndex < 0) return { title: prompt, subtext: null }
  // Preserve the leading line as the title.
  const title = prompt.slice(0, splitIndex).trimEnd()
  // Capture the remainder as optional subtext.
  const remainder = prompt.slice(splitIndex + 1).trim()
  // Drop empty subtext so layout stays compact.
  return { title, subtext: remainder ? remainder : null }
}

// Collapse an option label to a single line (newlines → spaces) for inline display.
export const normalizeOptionLabelText = (value: string): string => (
  value.replace(/\r?\n|\r/g, ' ')
)

// Selector blocks applied in source order.
export type RecipeOverridesInstructions = RecipeOverridesSelectorBlock[]

export type RecipeOverridesResolution = {
  questions: NoteQuestionDefinition[]
  instructions: RecipeOverridesInstructions
  // Cross-domain: safeguard instructions emitted by recipe-overrides questions.
  safeguardInstructions: SafeguardOverridesInstruction[]
}

// ── Cross-domain slider WRITES (setval / +TOKEN / -TOKEN → safeguard slider) ──────
//
// A single safeguard slider, addressed by the recipe option's directive token (= the
// slider's `id=TOKEN`). The caller builds this map once from the safeguard resolution.
export type CrossDomainSliderTarget = { questionId: string; defaultNum: number }
// One resolved write: store `value` into the safeguard question's answer (a raw string,
// exactly as if the user dragged the slider there — persist-on-select, not an overlay).
export type CrossDomainSliderWrite = { questionId: string; value: string }

/**
 * SSOT for resolving a recipe option's cross-domain slider directives into concrete
 * safeguard-answer writes. Used by BOTH the interactive change handler (newly-selected
 * options only) and the load-time seeding path (every initially-selected option).
 *
 * For each selected option `shouldApply` accepts, in resolution order (last wins):
 *   • `setval TOKEN=N`        → write N into the slider whose id=TOKEN.
 *   • `+TOKEN` (setTokens)    → toggle that slider ON at its default value.
 *   • `-TOKEN` (unsetTokens)  → toggle that slider OFF (SLIDER_TOGGLE_OFF sentinel).
 * Tokens that do not name a known slider id are ignored.
 */
export const collectCrossDomainSliderWrites = (
  recipeQuestions: readonly NoteQuestionDefinition[],
  sliderByToken: ReadonlyMap<string, CrossDomainSliderTarget>,
  // Gate deciding which selected options contribute writes. Default: every selected
  // option (load-time seeding). The change handler passes a "newly selected" predicate.
  shouldApply: (optionId: string) => boolean = () => true,
): CrossDomainSliderWrite[] => {
  // Accumulate writes across all questions/options; later entries win on the App side.
  const writes: CrossDomainSliderWrite[] = []
  for (const question of recipeQuestions) {
    for (const option of question.options) {
      // Skip unselected options and any the caller wants excluded (e.g. already-selected).
      if (!question.answer.includes(option.id) || !shouldApply(option.id)) continue
      // Explicit value forces: `setval TOKEN=N`.
      for (const { token, value } of option.setValueDirectives) {
        const target = sliderByToken.get(token)
        if (target) writes.push({ questionId: target.questionId, value: String(value) })
      }
      // `+TOKEN` → toggle the slider ON at its default value.
      for (const token of option.setTokens) {
        const target = sliderByToken.get(token)
        if (target) writes.push({ questionId: target.questionId, value: String(target.defaultNum) })
      }
      // `-TOKEN` → toggle the slider OFF (sentinel value).
      for (const token of option.unsetTokens) {
        const target = sliderByToken.get(token)
        if (target) writes.push({ questionId: target.questionId, value: SLIDER_TOGGLE_OFF })
      }
    }
  }
  return writes
}

/**
 * SSOT for "which safeguard sliders does a set of recipe OPTIONS own?" — the union of every
 * slider questionId any option in the passed questions targets via `setval`/`+`/`-` (regardless
 * of whether that option is currently selected). Callers pass the account-tier question's options.
 *
 * Why this exists: cross-domain slider writes only fire for a newly-selected option, with no undo. If
 * a tier option omits a force for a slider another tier sets, switching to it would leave the prior
 * tier's slider answer stuck. The change handler uses this owned-set to clear every tier-owned slider
 * the newly-selected option does not itself write, so those sliders fall back to their `default=`.
 * Reads the same directive fields as {@link collectCrossDomainSliderWrites}.
 */
export const collectTierOwnedSliderQuestionIds = (
  tierQuestions: readonly NoteQuestionDefinition[],
  sliderByToken: ReadonlyMap<string, CrossDomainSliderTarget>,
): Set<string> => {
  // Accumulate every slider questionId any option's directives address.
  const owned = new Set<string>()
  for (const question of tierQuestions) {
    for (const option of question.options) {
      // Every directive kind that collectCrossDomainSliderWrites reads: setval + set/unset toggles.
      const tokens = [
        ...option.setValueDirectives.map((d) => d.token),
        ...option.setTokens,
        ...option.unsetTokens,
      ]
      // Map each token to its slider question; skip tokens that name no known slider id.
      for (const token of tokens) {
        const target = sliderByToken.get(token)
        if (target) owned.add(target.questionId)
      }
    }
  }
  return owned
}

// ── Cross-domain option WRITES (set / unset / excl → safeguard radio/checkbox) ────
//
// Mirrors the slider bridge above: a recipe option's constraint tokens may also name a
// SAFEGUARD option's explicit `id=TOKEN`. When such a recipe option becomes selected,
// `set`/`+` selects the safeguard option and `unset`/`-`/`excl`/`!` deselects it —
// persist-on-select, exactly like the slider writes (a real stored answer, no overlay).
// One safeguard option, addressed by its explicit token (= the option's `id=TOKEN`).
export type CrossDomainOptionTarget = { questionId: string; optionId: string }
// One resolved write: (de)select the option inside the safeguard question's stored answer.
export type CrossDomainOptionWrite = CrossDomainOptionTarget & { action: 'select' | 'deselect' }

/**
 * SSOT for resolving a recipe option's cross-domain OPTION directives into concrete
 * safeguard-answer writes. Used by BOTH the interactive change handler (newly-selected
 * options only) and the load-time seeding path (every initially-selected option) —
 * the same two call sites as {@link collectCrossDomainSliderWrites}.
 *
 * Slider ids keep precedence: a token that names a safeguard slider stays a slider
 * toggle (back-compat with the documented `+TOKEN`/`-TOKEN` slider semantics), so the
 * option bridge only claims tokens the slider map does not know.
 */
export const collectCrossDomainOptionWrites = (
  recipeQuestions: readonly NoteQuestionDefinition[],
  optionByToken: ReadonlyMap<string, CrossDomainOptionTarget>,
  sliderByToken: ReadonlyMap<string, CrossDomainSliderTarget>,
  // Gate deciding which selected options contribute writes (same contract as the slider collector).
  shouldApply: (optionId: string) => boolean = () => true,
): CrossDomainOptionWrite[] => {
  const writes: CrossDomainOptionWrite[] = []
  for (const question of recipeQuestions) {
    for (const option of question.options) {
      // Skip unselected options and any the caller wants excluded (e.g. already-selected).
      if (!question.answer.includes(option.id) || !shouldApply(option.id)) continue
      // `set`/`+TOKEN` → select the named safeguard option.
      for (const token of option.setTokens) {
        if (sliderByToken.has(token)) continue
        const target = optionByToken.get(token)
        if (target) writes.push({ ...target, action: 'select' })
      }
      // `unset`/`-TOKEN` and `excl`/`!TOKEN` → deselect it (single-select groups then
      // fall back per the shared rule pass, exactly like an in-domain removal).
      for (const token of [...option.unsetTokens, ...option.excludedTokens]) {
        if (sliderByToken.has(token)) continue
        const target = optionByToken.get(token)
        if (target) writes.push({ ...target, action: 'deselect' })
      }
    }
  }
  return writes
}

/**
 * Compute the safeguard-overrides answers a note's INITIAL recipe selection forces, for
 * seeding at SFC/preset LOAD time. The cross-domain WRITE otherwise only fires on a recipe
 * selection CHANGE, so a preset shipping a default-selected account mode (e.g. `* Lategame`)
 * never applied its forced slider values — they fell back to each slider's own `default=`.
 *
 * Resolves the recipe with the freshly-loaded answers (empty on load → the `*` default) and
 * translates every selected option's `setval`/+/- directives into stored slider answers,
 * exactly as a click would (persist-on-select, not an overlay). Pass any restored recipe
 * answers as `recipeAnswers`; `existing` safeguard answers are never overwritten so an
 * autosave restore or a user edit is preserved. Returns the merged safeguard answers.
 */
export const seedSafeguardAnswersFromRecipeDefaults = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers = {},
  existing: NoteSafeguardOverridesAnswers = {},
): NoteSafeguardOverridesAnswers => {
  // Resolve both domains from the note so we can map directive tokens → safeguard questions.
  // The safeguard side resolves with the caller's answers so option-write candidates are
  // computed against the same state the never-overwrite rule below protects.
  const recipeQuestions = resolveRecipeOverridesTags(note, recipeAnswers).questions
  const safeguardQuestions = resolveNoteSafeguardOverridesTags(note, existing).questions
  const sliderByToken = buildSafeguardSliderTokenMap(safeguardQuestions)
  // Translate every selected option's directives into concrete slider writes.
  const writes = collectCrossDomainSliderWrites(recipeQuestions, sliderByToken)
  // Apply writes without clobbering any answer the caller already has (restore / user edit).
  let next: NoteSafeguardOverridesAnswers = existing
  if (writes.length > 0) {
    const merged: NoteSafeguardOverridesAnswers = { ...existing }
    let changed = false
    for (const write of writes) {
      if (merged[write.questionId] !== undefined) continue
      merged[write.questionId] = [write.value]
      changed = true
    }
    if (changed) next = merged
  }
  // Option writes ride the same seeding contract: a question whose answer the caller
  // already has is left alone (skip predicate checks the ORIGINAL answers, so a slider
  // write from this same seed pass never blocks its question's option write).
  const optionWrites = collectCrossDomainOptionWrites(
    recipeQuestions,
    buildSafeguardOptionTokenMap(safeguardQuestions),
    sliderByToken,
  )
  if (optionWrites.length > 0) {
    next = applySafeguardOptionWrites(
      safeguardQuestions,
      next,
      optionWrites,
      (questionId) => existing[questionId] !== undefined,
    )
  }
  return next
}

/**
 * Drop safeguard answers that merely restate the document's own defaults, so a saved file
 * records deviations rather than the full resolved state.
 *
 * The subtlety this exists for: a safeguard answer is "default" only relative to the
 * *effective* defaults, which are NOT each slider's `default=`. A recipe option selected by
 * default (the `*` tier) can force sliders via cross-domain `setval`, and those forced values
 * are the real baseline. `seedSafeguardAnswersFromRecipeDefaults(note, recipeAnswers)` computes
 * exactly that baseline — it is idempotent and a fixed point — so it is the only correct
 * definition of "full true defaults" to compare against. Comparing against `default=` instead
 * would wrongly keep every forced value (the visible symptom: an untouched preset saving a
 * complete answer map).
 *
 * Safe because the load path re-derives the baseline: App's import seeds from the note after
 * pruning stored answers, so an omitted default is reconstructed identically, while a genuine
 * deviation is preserved and its default-valued siblings still come back.
 *
 * Pass the SAME `recipeAnswers` the document stores — the baseline depends on which recipe
 * options are selected, so a non-default tier compares against ITS forces, not Lategame's.
 */
export const dropDefaultSafeguardOverridesAnswers = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers,
  answers: NoteSafeguardOverridesAnswers,
): NoteSafeguardOverridesAnswers => {
  // No note ⇒ no questions ⇒ nothing is derivable; keep the answers untouched.
  if (!note) return answers
  const baseline = seedSafeguardAnswersFromRecipeDefaults(note, recipeAnswers)
  const next: NoteSafeguardOverridesAnswers = {}
  let dropped = false
  for (const [questionId, value] of Object.entries(answers)) {
    const base = baseline[questionId]
    // Array compare: answers are option-id lists (sliders carry a single stringified number).
    if (base && arraysEqual(base, value)) {
      dropped = true
      continue
    }
    next[questionId] = value
  }
  // Preserve reference identity when nothing was dropped so memoized consumers don't churn.
  return dropped ? next : answers
}

// ── REVERSE cross-domain option writes (safeguard option → recipe radio/checkbox) ──
//
// Mirror of the forward bridge with one deliberate asymmetry: a source option that both
// deselects X and selects Y is a CONDITIONAL REPLACE — it fires only while X is actually
// selected. This is the "downgrade" shape (e.g. re-enabling utility safeguards turns the
// FW-Hard answer `Yes!` into `Yes`), and the condition is what keeps the write from
// stomping answers it has no business with (a player who picked `No` stays on `No`).
// Reverse writes are interactive-only (no load-time seeding): stored answers are state,
// not intent, so a repair only makes sense in response to an actual user change.

/** One reverse write emitted per (source safeguard option × target recipe question). */
export type CrossDomainRecipeOptionWrite = {
  questionId: string
  /** Recipe option to select (`set`); null for a bare deselect. */
  selectId: string | null
  /** Recipe option to deselect (`unset`/`excl`); when paired with selectId this GATES the write. */
  deselectId: string | null
}

/**
 * Build the `id=TOKEN → { questionId, optionId }` map for RECIPE options — the reverse
 * counterpart of {@link buildSafeguardOptionTokenMap}, with identical rules: explicit
 * non-numeric tokens only (implicit 1-based indices are question-local), sliders never
 * participate, first occurrence wins.
 */
export const buildRecipeOptionTokenMap = (
  questions: readonly NoteQuestionDefinition[],
): Map<string, CrossDomainOptionTarget> => {
  const map = new Map<string, CrossDomainOptionTarget>()
  for (const question of questions) {
    for (const option of question.options) {
      if (option.groupType === 'slider') continue
      const token = option.token
      // A bare 1-based index is the implicit (question-local) token — never cross-domain.
      if (!token || /^\d+$/.test(token)) continue
      if (!map.has(token)) map.set(token, { questionId: question.id, optionId: option.id })
    }
  }
  return map
}

/**
 * Resolve selected safeguard options' `set`/`unset`/`excl` tokens into recipe-option
 * writes. Tokens that name no recipe option are ignored (they are in-domain constraints
 * or forward-bridge targets). `shouldApply` gates which selected options contribute —
 * the change handler passes a "newly selected" predicate so writes fire on transitions,
 * never on standing state.
 */
export const collectCrossDomainRecipeOptionWrites = (
  safeguardQuestions: readonly SafeguardNoteQuestionDefinition[],
  optionByToken: ReadonlyMap<string, CrossDomainOptionTarget>,
  shouldApply: (optionId: string) => boolean = () => true,
): CrossDomainRecipeOptionWrite[] => {
  const writes: CrossDomainRecipeOptionWrite[] = []
  for (const question of safeguardQuestions) {
    for (const option of question.options) {
      // Skip unselected options and any the caller wants excluded (already-selected).
      if (!question.answer.includes(option.id) || !shouldApply(option.id)) continue
      // Merge this option's tokens per target question so a set+excl pair becomes ONE
      // replace-shaped write (the pairing is what encodes the conditionality).
      const byQuestion = new Map<string, CrossDomainRecipeOptionWrite>()
      const upsert = (target: CrossDomainOptionTarget, kind: 'select' | 'deselect') => {
        const entry = byQuestion.get(target.questionId)
          ?? { questionId: target.questionId, selectId: null, deselectId: null }
        if (kind === 'select') entry.selectId = target.optionId
        else entry.deselectId = target.optionId
        byQuestion.set(target.questionId, entry)
      }
      for (const token of option.setTokens) {
        const target = optionByToken.get(token)
        if (target) upsert(target, 'select')
      }
      for (const token of [...option.unsetTokens, ...option.excludedTokens]) {
        const target = optionByToken.get(token)
        if (target) upsert(target, 'deselect')
      }
      writes.push(...byQuestion.values())
    }
  }
  return writes
}

/**
 * Apply reverse writes to stored RECIPE answers — persist-on-select via the same storage
 * SSOT a real click takes ({@link applyRecipeOverridesAnswerChange}), so cross-question
 * cascade, default-omission, and answer normalization behave identically. Firing rules:
 *   • replace (selectId + deselectId): only while deselectId is selected; applied as a
 *     radio switch to selectId (preferred), so no group fallback is consulted.
 *   • select-only: hard select, skipped when already selected.
 *   • deselect-only: skipped when not selected; otherwise an uncheck (removedId), with
 *     single-select groups falling back per the usual default/first-option rule.
 * The caller must NOT re-run forward writes off the result — a programmatic downgrade
 * keeps the safeguard answer the user just picked (only a real click re-forces it).
 */
export const applyRecipeOptionWrites = (
  note: string,
  answers: NoteRecipeOverridesAnswers,
  writes: readonly CrossDomainRecipeOptionWrite[],
): NoteRecipeOverridesAnswers => {
  let next = answers
  for (const write of writes) {
    // Re-resolve against the freshest answers so chained writes see each other's effect.
    const question = resolveRecipeOverridesTags(note, next).questions
      .find((q) => q.id === write.questionId)
    if (!question) continue
    const current = new Set(question.answer)
    // Gate: a deselect target that is not selected makes the whole write a no-op
    // (this is the conditionality of the replace shape, and a no-op bare deselect).
    if (write.deselectId && !current.has(write.deselectId)) continue
    // A select target that is already selected has nothing to do.
    if (!write.deselectId && write.selectId && current.has(write.selectId)) continue
    if (write.deselectId) current.delete(write.deselectId)
    if (write.selectId) {
      // Mirror the dialog's radio path: reset the target's single-select group first.
      const group = question.groups.find((g) => g.options.some((o) => o.id === write.selectId))
      if (group?.type === 'single') group.options.forEach((o) => current.delete(o.id))
      current.add(write.selectId)
    }
    // Same rule pass + storage call a real interaction takes (preferred for selects,
    // removed for bare deselects — matching the radio/checkbox handler contracts).
    const preferredId = write.selectId ?? undefined
    const removedId = write.selectId ? undefined : write.deselectId ?? undefined
    const ruled = applyQuestionSelectionRules(Array.from(current), question, preferredId, removedId)
    next = applyRecipeOverridesAnswerChange(note, next, question, ruled, preferredId, removedId)
  }
  return next
}

// Recipe impact summary for Apply Tags flow.
export type RecipeOverridesExportModeResolution = {
  instructions: RecipeOverridesInstructions
  modes: SellfileExportMode[]
  overriddenIndices: number[]
}

// Match recipe-overrides markers and legacy config-options markers in note comments.
const QUESTION_MARKER_REGEX = new RegExp(
  `<!--\\s*(?:${NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN})\\b[\\s\\S]*?-->`,
  'gi',
)

// Normalize an override operator into a shared token.
const normalizeOverrideOp = (raw: string): TagOverrideOp | null => {
  // Trim spacing so we only compare the operator itself.
  const trimmed = raw.trim()
  // Accept ASCII operators.
  if (trimmed === '>=') return 'gte'
  if (trimmed === '<=') return 'lte'
  if (trimmed === '=') return 'eq'
  // Accept unicode comparison glyphs.
  if (trimmed === '≥') return 'gte'
  if (trimmed === '≤') return 'lte'
  // Reject unknown operators.
  return null
}

type TagOverrideOp = 'eq' | 'gte' | 'lte'

// Clamp an arbitrary number to a valid integer RankCode in [1, 6].
// Exported so noteSafeguardOverrides can reuse this at AST-resolve time.
export const clampRankCode = (n: number): RankCode => Math.max(1, Math.min(6, Math.round(n))) as RankCode

// Parse a rank override value into a RankCode.
const parseRankOverride = (value: string, op: TagOverrideOp): RankCode | null => {
  // Normalize casing and strip star glyphs.
  const cleaned = value.trim().toLowerCase().replace(/[★*]/g, '')
  // Handle the "any" token only for exact matches.
  if (cleaned === 'any') {
    return op === 'eq' ? RankCodeEnum.Any : null
  }
  // Parse the rank number from the token.
  const parsed = Number.parseInt(cleaned, 10)
  if (!Number.isFinite(parsed)) return null
  if (parsed < 1 || parsed > 6) return null
  // Resolve comparison operators to the correct HSF rank code.
  if (op === 'eq') return parsed as RankCode
  if (op === 'gte') {
    if (parsed === 1) return RankCodeEnum.GTE_One
    if (parsed === 2) return RankCodeEnum.GTE_Two
    if (parsed === 3) return RankCodeEnum.GTE_Three
    if (parsed === 4) return RankCodeEnum.GTE_Four
    if (parsed === 5) return RankCodeEnum.GTE_Five
    return RankCodeEnum.Six
  }
  if (parsed === 1) return RankCodeEnum.One
  if (parsed === 2) return RankCodeEnum.LTE_Two
  if (parsed === 3) return RankCodeEnum.LTE_Three
  if (parsed === 4) return RankCodeEnum.LTE_Four
  if (parsed === 5) return RankCodeEnum.LTE_Five
  return RankCodeEnum.LTE_Six
}

// Lookup table for rarity names to HSF rarity codes.
const RARITY_NAME_CODES = new Map<string, RarityCode>([
  ['any', RarityCodeEnum.Any],
  ['common', RarityCodeEnum.Common],
  ['uncommon', RarityCodeEnum.Uncommon],
  ['rare', RarityCodeEnum.Rare],
  ['epic', RarityCodeEnum.Epic],
  ['legendary', RarityCodeEnum.Legendary],
  ['mythical', RarityCodeEnum.Mythical],
])

// Parse a rarity override value into a rarity mode + code.
const parseRarityOverride = (
  value: string,
  op: TagOverrideOp,
): { mode: 'auto' | 'code'; code?: RarityCode } | null => {
  // Normalize and collapse spacing.
  const cleaned = value.trim().toLowerCase()
  // Allow the Auto token as an explicit mode switch.
  if (cleaned === RARITY_AUTO_LABEL.toLowerCase()) {
    return op === 'eq' ? { mode: 'auto' } : null
  }
  // Map the rarity name to a base code.
  const base = RARITY_NAME_CODES.get(cleaned)
  if (base == null) return null
  // Exact match uses the base code verbatim.
  if (op === 'eq') return { mode: 'code', code: base }
  // Any with a comparator is not meaningful.
  if (base === RarityCodeEnum.Any) return null
  // Convert comparison operators into the nearest HSF rarity code.
  if (op === 'gte') {
    switch (base) {
      case RarityCodeEnum.Common: return { mode: 'code', code: RarityCodeEnum.GTE_Common }
      case RarityCodeEnum.Uncommon: return { mode: 'code', code: RarityCodeEnum.GTE_Uncommon }
      case RarityCodeEnum.Rare: return { mode: 'code', code: RarityCodeEnum.GTE_Rare }
      case RarityCodeEnum.Epic: return { mode: 'code', code: RarityCodeEnum.GTE_Epic }
      case RarityCodeEnum.Legendary: return { mode: 'code', code: RarityCodeEnum.GTE_Legendary }
      default: return { mode: 'code', code: RarityCodeEnum.Mythical }
    }
  }
  switch (base) {
    case RarityCodeEnum.Common: return { mode: 'code', code: RarityCodeEnum.Common }
    case RarityCodeEnum.Uncommon: return { mode: 'code', code: RarityCodeEnum.LTE_Uncommon }
    case RarityCodeEnum.Rare: return { mode: 'code', code: RarityCodeEnum.LTE_Rare }
    case RarityCodeEnum.Epic: return { mode: 'code', code: RarityCodeEnum.LTE_Epic }
    case RarityCodeEnum.Legendary: return { mode: 'code', code: RarityCodeEnum.LTE_Legendary }
    default: return { mode: 'code', code: RarityCodeEnum.LTE_Mythical }
  }
}

// Parse a level range in the format "min-max" (or a single value).
const parseLevelRange = (value: string): { min: LevelMilestone; max: LevelMilestone } | null => {
  // Split on the range separator.
  const parts = value.split('-').map((entry) => entry.trim()).filter((entry) => entry.length > 0)
  if (parts.length === 1) {
    // Single milestones map to a min=max range.
    const only = Number(parts[0])
    if (!Number.isFinite(only)) return null
    if (!isLevelMilestone(only)) return null
    return { min: only, max: only }
  }
  if (parts.length !== 2) return null
  // Convert both endpoints to numbers.
  const minRaw = Number(parts[0])
  const maxRaw = Number(parts[1])
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null
  // Enforce allowed milestone values.
  if (!isLevelMilestone(minRaw) || !isLevelMilestone(maxRaw)) return null
  // Reject reversed windows so outputs stay deterministic.
  if (minRaw > maxRaw) return null
  return { min: minRaw, max: maxRaw }
}

const parseIntegerValue = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

// Stat TARGET values (minima cells, roll targets) accept decimals — anomalous
// mode-damage substats live on a 1.25 grid, so truncating here would silently
// degrade a written 3.75 to 3. Everything else the DSL parses is a genuine count
// (roll counts, substat counts, the any-rank star selector) and keeps
// parseIntegerValue. Values are quantized per variant when applied, so an
// off-grid literal still lands on the stat's grid rather than persisting raw.
const parseTargetValue = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

const clampMinSubstats = (value: number): 0 | 1 | 2 | 3 | 4 => {
  if (value <= 0) return 0
  if (value >= NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX) return NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX
  return value as 0 | 1 | 2 | 3 | 4
}

const clampSubstatMin = (value: number): 0 | 1 | 2 | 3 | 4 | 5 => (
  clampAggregateRollValue(value)
)

// DSL-authored minima quantize on the stat's own grid, exactly like SFC ingress
// and the Substat Targets tab — every write into a target table goes through the
// one quantizer regardless of authoring route.
const clampMinimaValue = (variant: number, value: number): number => {
  if (!Number.isFinite(value)) return 0
  return quantizeTargetValueForVariant(variant, value)
}

const resolveSelectedSubstatCount = (recipe: Pick<BuilderRecipe, 'substatsV'>): number => (
  Array.isArray(recipe.substatsV) ? recipe.substatsV.length : 0
)

const resolveLockedSubstatCount = (recipe: Pick<BuilderRecipe, 'fixedSubstatsV'>): number => (
  Array.isArray(recipe.fixedSubstatsV) ? recipe.fixedSubstatsV.length : 0
)

const resolveEffectiveMinCount = (recipe: Pick<BuilderRecipe, 'autoMinCount' | 'minCount' | 'substatsV' | 'fixedSubstatsV' | 'substatRollBoundsV'>): number => {
  const locked = resolveLockedSubstatCount(recipe)
  if (recipe.autoMinCount) {
    // "Not" substats never count toward the positive minimum — exclude them.
    const positiveCount = countPositiveSubstats(recipe.substatsV, recipe.substatRollBoundsV as Record<number, { not?: boolean }>)
    return Math.min(NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX, Math.max(0, positiveCount))
  }
  const clamped = clampMinSubstats(Number(recipe.minCount ?? 0))
  return Math.min(NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX, Math.max(clamped, locked))
}

const resolveMinCountOverride = (
  recipe: Pick<BuilderRecipe, 'substatsV' | 'fixedSubstatsV'>,
  value: number,
): 0 | 1 | 2 | 3 | 4 => {
  const selected = resolveSelectedSubstatCount(recipe)
  const locked = resolveLockedSubstatCount(recipe)
  const clamped = clampMinSubstats(value)
  if (selected <= 0) return 0
  const withLocked = Math.max(clamped, locked)
  const capped = Math.min(withLocked, Math.min(NOTE_RECIPE_OVERRIDES_MIN_SUBSTATS_MAX, selected))
  return clampMinSubstats(capped)
}

type MinimaFieldParse = { kind: 'any' } | { kind: 'stat'; star: Star; statKey: string }

const MINIMA_STAR_LOOKUP: Record<string, Star> = {
  '1': 1,
  one: 1,
  '2': 2,
  two: 2,
  '3': 3,
  three: 3,
  '4': 4,
  four: 4,
  '5': 5,
  five: 5,
  '6': 6,
  six: 6,
}

const parseMinimaField = (field: string): MinimaFieldParse | null => {
  if (!field.startsWith('minima.')) return null
  const parts = field.split('.').filter(Boolean)
  if (parts.length < 2) return null
  const tag = parts[1] ?? ''
  if (tag === 'any' && parts.length === 2) return { kind: 'any' }
  const star = MINIMA_STAR_LOOKUP[tag]
  if (!star) return null
  const statKey = parts.slice(2).join('.')
  if (!statKey) return null
  return { kind: 'stat', star, statKey }
}

// Case-insensitive lookup: artifact slot name → numeric ArtifactTypeId.
// Derived from the canonical ArtifactType map so additions in types.ts are picked up automatically.
const ARTIFACT_TYPE_NAME_MAP = new Map<string, ArtifactTypeId>(
  Object.entries(ArtifactType).map(([name, id]) => [name.toLowerCase(), id as ArtifactTypeId]),
)

const parseSelectorTokens = (
  tokens: Token[],
  absoluteOffset = 0,
  diags?: DiagnosticSpan[],
): RecipeOverridesSelector | null => {
  const cursor = new TokenCursor(tokens)
  const parseTerm = (): RecipeOverridesSelector | null => {
    const token = cursor.peek()
    if (!token || token.kind !== 'word') return null
    const keyword = token.value.toLowerCase()
    if (keyword === 'all') {
      cursor.next()
      return { kind: 'all' }
    }
    if (keyword === 'tagged') {
      cursor.next()
      return { kind: 'tagged' }
    }
    if (keyword === 'untagged') {
      cursor.next()
      return { kind: 'untagged' }
    }
    if (keyword === 'tag') {
      cursor.next()
      const next = cursor.peek()
      if (!next) return null
      if (next.kind === 'word') {
        const value = next.value.toLowerCase()
        if (value === 'any' || value === 'none') {
          cursor.next()
          return { kind: 'tag', mode: value as 'any' | 'none' }
        }
        if (value === 'in') {
          cursor.next()
          if (!cursor.consumeSymbol('[')) return null
          const values: string[] = []
          while (true) {
            const entry = cursor.peek()
            if (!entry) return null
            if (entry.kind === 'symbol' && entry.value === ']') {
              cursor.next()
              break
            }
            if (entry.kind === 'symbol' && entry.value === ',') {
              cursor.next()
              continue
            }
            if (entry.kind !== 'word' && entry.kind !== 'string') return null
            const normalized = normalizeTagValue(entry.value)
            cursor.next()
            if (normalized) values.push(normalized)
          }
          return { kind: 'tag', mode: 'in', values }
        }
      }
      const opToken = cursor.peek()
      if (!opToken || opToken.kind !== 'symbol' || (opToken.value !== '=' && opToken.value !== ':')) return null
      cursor.next()
      const valueToken = cursor.peek()
      if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) return null
      cursor.next()
      const normalized = normalizeTagValue(valueToken.value)
      if (!normalized) return null
      return { kind: 'tag', mode: 'eq', values: [normalized] }
    }
    if (keyword === 'rank' || keyword === 'rarity' || keyword === 'minrolls' || keyword === 'lockedminrolls' || keyword === 'minsubstats') {
      cursor.next()
      const opToken = cursor.peek()
      if (!opToken || opToken.kind !== 'symbol') return null
      const op = normalizeOverrideOp(opToken.value)
      if (!op) return null
      cursor.next()
      const valueToken = cursor.peek()
      if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) return null
      cursor.next()
      if (keyword === 'rank') {
        const rankValue = parseRankOverride(valueToken.value, op)
        if (rankValue == null) return null
        return { kind: 'rank', op, value: rankValue }
      }
      if (keyword === 'rarity') {
        const rarity = parseRarityOverride(valueToken.value, op)
        if (!rarity) return null
        return rarity.code != null
          ? { kind: 'rarity', op, mode: rarity.mode, code: rarity.code }
          : { kind: 'rarity', op, mode: rarity.mode }
      }
      if (keyword === 'minrolls') {
        const numeric = parseIntegerValue(valueToken.value)
        if (numeric == null) return null
        return { kind: 'minRolls', op, value: numeric }
      }
      if (keyword === 'lockedminrolls') {
        const numeric = parseIntegerValue(valueToken.value)
        if (numeric == null) return null
        return { kind: 'lockedMinRolls', op, value: numeric }
      }
      if (keyword === 'minsubstats') {
        const numeric = parseIntegerValue(valueToken.value)
        if (numeric == null) return null
        return { kind: 'minSubstats', op, value: numeric }
      }
    }
    if (keyword === 'flex') {
      cursor.next()
      const opToken = cursor.peek()
      if (!opToken || opToken.kind !== 'symbol' || (opToken.value !== '=' && opToken.value !== ':')) return null
      cursor.next()
      const valueToken = cursor.peek()
      if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) return null
      cursor.next()
      const parsed = parseOverridesBooleanValue(valueToken.value)
      if (parsed == null) return null
      return { kind: 'flex', value: parsed }
    }
    // Note: the tokenizer treats '.' as part of word tokens, so 'substatmin.SPD' and
    // 'minima.5.SPD' arrive as single word tokens.  Plain 'substatmin' is matched by
    // the exact-equality check first; dotted variants are caught by startsWith below.
    if (keyword === 'substatmin') {
      // Plain form: substatmin op N — matches when ALL active substats satisfy the condition.
      cursor.next()
      const opToken = cursor.peek()
      if (!opToken || opToken.kind !== 'symbol') return null
      const op = normalizeOverrideOp(opToken.value)
      if (!op) return null
      cursor.next()
      const valToken = cursor.peek()
      if (!valToken || (valToken.kind !== 'word' && valToken.kind !== 'string')) return null
      cursor.next()
      const numeric = parseIntegerValue(valToken.value)
      if (numeric == null) return null
      return { kind: 'substatMin', op, value: numeric }
    }
    if (keyword.startsWith('substatmin.')) {
      // Dotted form: substatmin.STAT op N — whole keyword is one token, e.g. "substatmin.spd".
      const variant = statKeyToVariant(keyword.slice('substatmin.'.length))
      if (variant == null) return null
      cursor.next()
      const opToken = cursor.peek()
      if (!opToken || opToken.kind !== 'symbol') return null
      const op = normalizeOverrideOp(opToken.value)
      if (!op) return null
      cursor.next()
      const valToken = cursor.peek()
      if (!valToken || (valToken.kind !== 'word' && valToken.kind !== 'string')) return null
      cursor.next()
      const numeric = parseIntegerValue(valToken.value)
      if (numeric == null) return null
      return { kind: 'substatMinField', op, variant, value: numeric }
    }
    if (keyword.startsWith('minima.')) {
      // Both 'minima.any' and 'minima.STAR.STAT' arrive as single word tokens.
      // Reuse parseMinimaField which already handles both shapes.
      const parsed = parseMinimaField(keyword)
      if (!parsed) return null
      cursor.next()
      const opToken = cursor.peek()
      if (!opToken || opToken.kind !== 'symbol') return null
      const op = normalizeOverrideOp(opToken.value)
      if (!op) return null
      cursor.next()
      const valToken = cursor.peek()
      if (!valToken || (valToken.kind !== 'word' && valToken.kind !== 'string')) return null
      cursor.next()
      // 'minima.any' selects a star (integer); 'minima.STAR.STAT' compares a
      // target value, which may sit on a fractional grid.
      if (parsed.kind === 'any') {
        const star = parseIntegerValue(valToken.value)
        if (star == null) return null
        return { kind: 'minimaAny', op, value: star }
      }
      const numeric = parseTargetValue(valToken.value)
      if (numeric == null) return null
      const variant = statKeyToVariant(parsed.statKey)
      if (variant == null) return null
      return { kind: 'minimaField', op, star: parsed.star, variant, value: numeric }
    }
    return null
  }

  // Unary `not` / `!` — higher precedence than `and` / `or`.
  const parseNot = (): RecipeOverridesSelector | null => {
    const token = cursor.peek()
    if (!token) return null
    const isNotKeyword = token.kind === 'word' && token.value.toLowerCase() === 'not'
    const isNotSymbol = token.kind === 'symbol' && token.value === '!'
    if (isNotKeyword || isNotSymbol) {
      cursor.next()
      // Recurse so `not not tag = foo` works, though it's redundant in practice.
      const inner = parseNot()
      if (!inner) return null
      return { kind: 'not', inner }
    }
    return parseTerm()
  }

  // Shared helper: push a diagnostic for a dangling connector (no valid right-hand term).
  // connTok is the connector token ('and'/'&&'/'or'/'||') — used when the cursor is exhausted
  // or when the fail token is a symbol that isn't a field name (e.g. '{').
  const emitConnectorRhsError = (connTok: { index: number; value: string }, word: string): void => {
    if (!diags) return
    const failTok = cursor.peek()
    if (failTok) {
      const from = absoluteOffset + failTok.index
      if (failTok.kind === 'symbol' && failTok.value === '@') {
        diags.push({ from, to: from + 1, message: `'@' after '${word}' — write the field name directly, e.g. '${word} minrolls=3'` })
      } else if (failTok.kind === 'word') {
        diags.push({ from, to: from + failTok.value.length, message: `'${failTok.value}' is not a valid selector condition` })
      } else {
        // e.g. '{' — the connector has no right-hand operand; point at the connector itself.
        const connFrom = absoluteOffset + connTok.index
        diags.push({ from: connFrom, to: connFrom + connTok.value.length, message: `'${word}' has no right-hand side — a selector condition is expected after it` })
      }
    } else {
      // End of input after the connector.
      const connFrom = absoluteOffset + connTok.index
      diags.push({ from: connFrom, to: connFrom + connTok.value.length, message: `'${word}' at end of selector — selector condition expected after it` })
    }
  }

  const parseAnd = (): RecipeOverridesSelector | null => {
    let left = parseNot()
    if (!left) return null
    while (true) {
      const token = cursor.peek()
      if (!token) break
      const word = token.kind === 'word' ? token.value.toLowerCase() : token.value
      if (word !== 'and' && word !== '&&') break
      cursor.next()
      const right = parseNot()
      if (!right) {
        emitConnectorRhsError(token, word)
        return null
      }
      left = { kind: 'and', left, right }
    }
    return left
  }

  const parseOr = (): RecipeOverridesSelector | null => {
    let left = parseAnd()
    if (!left) return null
    while (true) {
      const token = cursor.peek()
      if (!token) break
      const word = token.kind === 'word' ? token.value.toLowerCase() : token.value
      if (word !== 'or' && word !== '||') break
      cursor.next()
      const right = parseAnd()
      if (!right) {
        emitConnectorRhsError(token, word)
        return null
      }
      left = { kind: 'or', left, right }
    }
    return left
  }

  const parsed = parseOr()
  // Any tokens remaining after a successful parse were silently dropped — the
  // selector expression had trailing content with no connector before it.
  // Flag the first leftover token so the user sees the problem.
  if (parsed && diags) {
    const leftover = cursor.peek()
    if (leftover) {
      const from = absoluteOffset + leftover.index
      if (leftover.kind === 'symbol' && leftover.value === '@') {
        diags.push({ from, to: from + 1, message: `unexpected '@' in selector — did you mean to add 'and' or 'or' before it?` })
      } else if (leftover.kind === 'word') {
        diags.push({ from, to: from + leftover.value.length, message: `unexpected '${leftover.value}' in selector — missing 'and'/'or' connector?` })
      }
    }
  }
  if (!parsed) return null
  return parsed
}

// crossDomain=true enables $count/$value expression parsing for numeric fields (rank,
// minrolls, lockedminrolls, minsubstats) — used when the block came from the other domain.
const parseOperations = (
  cursor: TokenCursor,
  endSymbol: string,
  crossDomain = false,
  absoluteOffset = 0,
  diags?: DiagnosticSpan[],
): RecipeOverridesOperation[] => {
  const operations: RecipeOverridesOperation[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    // Stop when the selector block closes.
    if (token.kind === 'symbol' && token.value === endSymbol) {
      cursor.next()
      break
    }
    // Accept commas as optional separators between assignments.
    if (token.kind === 'symbol' && token.value === ',') {
      cursor.next()
      continue
    }
    if (token.kind !== 'word') {
      // Skip unknown tokens to keep the parser from stalling.
      // Diagnose '@' specifically — it always means the user wrote @field=value
      // inside an assignment block instead of just field=value.
      if (diags && token.kind === 'symbol' && token.value === '@') {
        const from = absoluteOffset + token.index
        diags.push({
          from,
          to: from + 1,
          message: `'@' inside an assignment block — write the field name directly (e.g. 'lockedminrolls=3', not '@lockedminrolls=3')`,
        })
      }
      cursor.next()
      continue
    }
    // Fields lead assignments in the stable syntax.
    const field = token.value.toLowerCase()
    cursor.next()
    const opToken = cursor.peek()
    // Require a comparison operator after the field name.
    if (!opToken || opToken.kind !== 'symbol') {
      // Flag the field as malformed only when something follows it (opToken !== null)
      // so truncated blocks at end-of-input don't produce spurious diagnostics.
      if (diags && opToken !== null) {
        diags.push({
          from: absoluteOffset + token.index,
          to: absoluteOffset + token.index + token.value.length,
          message: `'${token.value}' — expected '=', '>=', or '<=' after field name`,
        })
      }
      // Do NOT consume opToken — if it is a valid field name the next iteration
      // should parse it correctly (e.g. `xxx1 lockedminrolls=2` → skip xxx1, then
      // parse lockedminrolls=2 cleanly).
      continue
    }
    // Normalize supported operator glyphs into override modes.
    const op = normalizeOverrideOp(opToken.value)
    if (!op) {
      // Skip invalid operators so later assignments still parse.
      cursor.next()
      continue
    }
    cursor.next()
    // Cross-domain numeric fields: parse a full $count / $value expression from
    // the cursor before the generic value-token path can consume the leading token.
    if (crossDomain && op === 'eq' && (field === 'rank' || field === 'minrolls' || field === 'lockedminrolls' || field === 'minsubstats')) {
      const ast = parseCountExpression(cursor)
      if (ast !== null) {
        if (ast.kind === 'literal') {
          // Concrete literal — resolve immediately like the non-cross-domain path.
          const n = Math.round(ast.value)
          if (field === 'rank') {
            operations.push({ kind: 'rank', value: clampRankCode(n) })
          } else if (field === 'minrolls') {
            operations.push({ kind: 'minRequiredRolls', value: Math.max(0, n) })
          } else if (field === 'lockedminrolls') {
            operations.push({ kind: 'lockedMinRequiredRolls', value: Math.max(0, n) })
          } else {
            operations.push({ kind: 'minSubstats', value: Math.max(0, n) })
          }
        } else if (ast.kind === 'ref' && ast.sliderId === null) {
          // Bare $count / $value — null value is filled in at resolve time.
          if (field === 'rank') operations.push({ kind: 'rank', value: null })
          else if (field === 'minrolls') operations.push({ kind: 'minRequiredRolls', value: null })
          else if (field === 'lockedminrolls') operations.push({ kind: 'lockedMinRequiredRolls', value: null })
          else operations.push({ kind: 'minSubstats', value: null })
        } else {
          // Complex expression or cross-slider ref — store the AST for resolve-time evaluation.
          if (field === 'rank') operations.push({ kind: 'rank', value: null, ast })
          else if (field === 'minrolls') operations.push({ kind: 'minRequiredRolls', value: null, ast })
          else if (field === 'lockedminrolls') operations.push({ kind: 'lockedMinRequiredRolls', value: null, ast })
          else operations.push({ kind: 'minSubstats', value: null, ast })
        }
      }
      continue
    }
    // `+` is tokenized as a symbol; peek past it when followed by a word so
    // that `+Speed` and `+-Daze` parse correctly as prefixed list values.
    let valueToken = cursor.peek()
    let valuePrefix = ''
    if (valueToken?.kind === 'symbol' && valueToken.value === '+') {
      const wordTok = cursor.peek(1)
      if (wordTok?.kind === 'word' || wordTok?.kind === 'string') {
        cursor.next()   // consume `+`
        valuePrefix = '+'
        valueToken = wordTok
      }
    }
    // Values must be a word or quoted string.
    if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) {
      if (valueToken) cursor.next()
      continue
    }
    cursor.next()
    // Level windows may include a range tokenized as "12", "-", "16".
    let valueRaw = valuePrefix + valueToken.value
    if (field === 'lvl' && op === 'eq') {
      const dashToken = cursor.peek()
      const tailToken = cursor.peek(1)
      const hasRangeTail = Boolean(
        dashToken
        && tailToken
        && dashToken.kind === 'symbol'
        && dashToken.value === '-'
        && (tailToken.kind === 'word' || tailToken.kind === 'string'),
      )
      if (hasRangeTail) {
        cursor.next()
        cursor.next()
        valueRaw = `${valueRaw}-${tailToken!.value}`
      }
    }
    if (field === 'export') {
      if (op !== 'eq') continue
      const mode = valueRaw.trim().toLowerCase()
      if ((NOTE_RECIPE_OVERRIDES_EXPORT_VALS as readonly string[]).includes(mode)) {
        operations.push({ kind: 'exportMode', action: mode as 'active' | 'disabled' | 'toggle' })
      } else {
        // Unknown value (e.g. `export=activ`) would silently no-op; flag the typo.
        reportInvalidEnumValue('export', valueToken, NOTE_RECIPE_OVERRIDES_EXPORT_VALS, diags, absoluteOffset)
      }
      continue
    }
    if (field === 'rank') {
      const value = parseRankOverride(valueRaw, op)
      if (value != null) operations.push({ kind: 'rank', value })
      continue
    }
    if (field === 'rarity') {
      const parsed = parseRarityOverride(valueRaw, op)
      if (parsed) {
        const operation: RecipeOverridesOperation = parsed.code != null
          ? { kind: 'rarity', mode: parsed.mode, code: parsed.code }
          : { kind: 'rarity', mode: parsed.mode }
        operations.push(operation)
      }
      continue
    }
    if (field === 'lvl') {
      if (op !== 'eq') continue
      const range = parseLevelRange(valueRaw)
      if (!range) continue
      operations.push({ kind: 'level', min: range.min, max: range.max })
      continue
    }
    if (field === 'keep') {
      if (op !== 'eq') continue
      const mode = valueRaw.trim().toLowerCase()
      if (!(NOTE_RECIPE_OVERRIDES_KEEP_VALS as readonly string[]).includes(mode)) {
        reportInvalidEnumValue('keep', valueToken, NOTE_RECIPE_OVERRIDES_KEEP_VALS, diags, absoluteOffset); continue
      }
      operations.push({ kind: 'keep', mode: mode as 'early' | 'late' })
      continue
    }
    if (field === 'action') {
      if (op !== 'eq') continue
      // action=keep|sell|toggle flips the recipe's Keep/Sell flag (recipe.keep).
      const action = valueRaw.trim().toLowerCase()
      if (!(NOTE_RECIPE_OVERRIDES_ACTION_VALS as readonly string[]).includes(action)) {
        reportInvalidEnumValue('action', valueToken, NOTE_RECIPE_OVERRIDES_ACTION_VALS, diags, absoluteOffset); continue
      }
      operations.push({ kind: 'keepAction', action: action as 'keep' | 'sell' | 'toggle' })
      continue
    }
    if (field === 'autolate') {
      if (op !== 'eq') continue
      const raw = valueRaw.trim().toLowerCase()
      if (!(NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS as readonly string[]).includes(raw)) {
        reportInvalidEnumValue('autolate', valueToken, NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS, diags, absoluteOffset); continue
      }
      operations.push({ kind: 'autoLate', threshold: raw as AutoRaritySupplementsThreshold })
      continue
    }
    if (field === 'minrolls') {
      if (op !== 'eq') continue
      const numeric = parseIntegerValue(valueRaw)
      if (numeric == null) continue
      operations.push({ kind: 'minRequiredRolls', value: numeric })
      continue
    }
    if (field === 'lockedminrolls') {
      if (op !== 'eq') continue
      const numeric = parseIntegerValue(valueRaw)
      if (numeric == null) continue
      operations.push({ kind: 'lockedMinRequiredRolls', value: numeric })
      continue
    }
    if (field === 'minsubstats') {
      if (op !== 'eq') continue
      const numeric = parseIntegerValue(valueRaw)
      if (numeric == null) continue
      operations.push({ kind: 'minSubstats', value: numeric })
      continue
    }
    if (field === 'flex') {
      if (op !== 'eq') continue
      const parsed = parseOverridesBooleanValue(valueRaw)
      if (parsed == null) {
        reportInvalidEnumValue('flex', valueToken, NOTE_OVERRIDES_BOOLEAN_KEYWORDS, diags, absoluteOffset); continue
      }
      operations.push({ kind: 'flex', value: parsed })
      continue
    }
    const minimaField = parseMinimaField(field)
    if (minimaField) {
      if (op !== 'eq') continue
      // 'minima.any' names a star (integer); a minima cell holds a target value,
      // which may sit on a fractional grid (quantized per variant when applied).
      if (minimaField.kind === 'any') {
        const numeric = parseIntegerValue(valueRaw)
        if (numeric == null) continue
        const star = MINIMA_STAR_LOOKUP[String(numeric)]
        if (!star) continue
        operations.push({ kind: 'minimaAnyRank', value: star })
      } else {
        const numeric = parseTargetValue(valueRaw)
        if (numeric == null) continue
        const variant = statKeyToVariant(minimaField.statKey)
        if (variant == null) continue
        operations.push({
          kind: 'minimaTarget',
          star: minimaField.star,
          variant,
          value: numeric,
        })
      }
      continue
    }
    if (field.startsWith('substatmin.')) {
      if (op !== 'eq') continue
      const statKey = field.slice('substatmin.'.length).trim()
      if (!statKey) continue
      const variant = statKeyToVariant(statKey)
      if (variant == null) continue
      const numeric = parseIntegerValue(valueRaw)
      if (numeric == null) continue
      operations.push({ kind: 'substatMinVariant', variant, value: numeric })
      continue
    }
    if (field === 'substatmin') {
      if (op !== 'eq') continue
      const numeric = parseIntegerValue(valueRaw)
      if (numeric == null) continue
      operations.push({ kind: 'substatMinAll', value: numeric })
      continue
    }
    if (field.startsWith('rolltarget.')) {
      if (op !== 'eq') continue
      const rtStatKey = field.slice('rolltarget.'.length).trim()
      if (!rtStatKey) continue
      const variant = statKeyToVariant(rtStatKey)
      if (variant == null) continue
      // First value is the Base (0-roll) threshold — a target value, so decimals
      // are accepted (quantized to the stat's grid when applied).
      const base = parseTargetValue(valueRaw)
      if (base == null) continue
      // Subsequent comma-separated values are +1…+SUBSTAT_TARGET_MAX_ROLLS thresholds.
      // Empty slots (consecutive commas, e.g. "300, , 900") become null and fall back
      // to max(factory, lastSpecified) at build time.
      const increments: Array<number | null> = []
      for (let i = 0; i < SUBSTAT_TARGET_MAX_ROLLS; i += 1) {
        if (!cursor.consumeSymbol(',')) break
        const next = cursor.peek()
        if (next?.kind === 'word') {
          cursor.next()
          increments.push(parseTargetValue(next.value))
        } else {
          increments.push(null)  // empty slot between commas
        }
      }
      operations.push({ kind: 'rollTarget', variant, base, increments })
      continue
    }
    if (field === 'slots') {
      // Collect comma-separated slot names with optional +/- prefix for mutate mode.
      if (op !== 'eq') continue
      const raw = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = raw.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      // Resolve each name to an ArtifactTypeId, skipping unknowns.
      const resolve = (name: string): ArtifactTypeId | undefined =>
        ARTIFACT_TYPE_NAME_MAP.get(name.toLowerCase())
      // Diagnose unrecognized slot names; valueToken.index locates the value region.
      if (diags) {
        for (const t of parsed) {
          if (resolve(t.value) == null) {
            const from = absoluteOffset + valueToken.index
            diags.push({ from, to: from + t.value.length, message: `'${t.value}' is not a recognized slot name — valid values: ${NOTE_RECIPE_OVERRIDES_SLOT_NAMES.join(', ')}` })
          }
        }
      }
      if (listMode === 'replace') {
        const values = parsed.map((t) => resolve(t.value)).filter((v): v is ArtifactTypeId => v != null)
        if (values.length > 0) operations.push({ kind: 'artifactTypes', mode: 'replace', values })
      } else {
        const add: ArtifactTypeId[] = []
        const remove: ArtifactTypeId[] = []
        for (const t of parsed) {
          const id = resolve(t.value)
          if (id == null) continue
          // `+-` has no excluded-entry meaning for slots; treat as plain add.
          if (t.prefix === 'remove') remove.push(id)
          else add.push(id)
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'artifactTypes', mode: 'mutate', add, remove })
      }
      continue
    }
    if (field === 'substats') {
      // Collect comma-separated stat labels with optional +/- prefix for mutate mode.
      if (op !== 'eq') continue
      const raw = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = raw.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      // Substat position: the full substat vocabulary (dslSubstatKeys), anomalous included.
      const resolve = (name: string): StatVariant | undefined => statKeyToVariant(name) ?? undefined
      if (listMode === 'replace') {
        const variants = parsed.map((t) => resolve(t.value)).filter((v): v is StatVariant => v != null)
        if (variants.length > 0) operations.push({ kind: 'substats', mode: 'replace', variants })
      } else {
        const add: StatVariant[] = []
        const remove: StatVariant[] = []
        for (const t of parsed) {
          const v = resolve(t.value)
          if (v == null) continue
          if (t.prefix === 'remove') remove.push(v)
          else add.push(v)
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'substats', mode: 'mutate', add, remove })
      }
      continue
    }
    if (field === 'mainstats') {
      // Collect comma-separated main-stat labels with optional +/- prefix for mutate mode.
      if (op !== 'eq') continue
      const raw = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = raw.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      // Main-stat position: the narrower vocabulary (dslMainStatKeys). Spelling stays
      // permissive (labels + aliases), but a stat no slot can carry as a main — the
      // substats — resolves to nothing instead of an unusable op.
      const resolve = (name: string): StatVariant | undefined => mainStatKeyToVariant(name) ?? undefined
      if (listMode === 'replace') {
        const variants = parsed.map((t) => resolve(t.value)).filter((v): v is StatVariant => v != null)
        if (variants.length > 0) operations.push({ kind: 'mainStats', mode: 'replace', variants })
      } else {
        const add: StatVariant[] = []
        const remove: StatVariant[] = []
        for (const t of parsed) {
          const v = resolve(t.value)
          if (v == null) continue
          if (t.prefix === 'remove') remove.push(v)
          else add.push(v)
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'mainStats', mode: 'mutate', add, remove })
      }
      continue
    }
    if (field === 'gearsets') {
      // Comma-separated set names with optional +/+-/- prefix for include/exclude/remove.
      // Examples: gearsets=Speed,"Crit Damage"   gearsets=+Speed,+-Defense   gearsets=-Defense
      if (op !== 'eq') continue
      const raw = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = raw.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      const resolveId = (name: string): ArtifactSetId | undefined =>
        artifactSetIdByName.get(name.trim().toLowerCase())
      if (listMode === 'replace') {
        // No-prefix tokens → plain includes only (no excluded flag in replace mode).
        const ids = parsed.map((t) => resolveId(t.value)).filter((v): v is ArtifactSetId => v != null)
        if (ids.length > 0) operations.push({ kind: 'artifactSets', mode: 'replace', ids })
      } else {
        const add: ArtifactSetSelectionEntry[] = []
        const remove: ArtifactSetId[] = []
        for (const t of parsed) {
          const id = resolveId(t.value)
          if (id == null) continue
          if (t.prefix === 'remove')           remove.push(id)
          else if (t.prefix === 'addExcluded') add.push({ id, excluded: true })
          else                                 add.push({ id })  // 'add'
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'artifactSets', mode: 'mutate', add, remove })
      }
      continue
    }
    if (field === 'metasets') {
      // Comma-separated metaset display names with optional +/- prefix for mutate mode.
      if (op !== 'eq') continue
      const raw = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = raw.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      if (listMode === 'replace') {
        const names = parsed.map((t) => t.value).filter((n) => n.length > 0)
        if (names.length > 0) operations.push({ kind: 'artifactMetaSets', mode: 'replace', names })
      } else {
        const add: string[] = []
        const remove: string[] = []
        for (const t of parsed) {
          if (!t.value) continue
          // `+-` has no excluded-entry meaning for metasets; treat as plain add.
          if (t.prefix === 'remove') remove.push(t.value)
          else add.push(t.value)
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'artifactMetaSets', mode: 'mutate', add, remove })
      }
      continue
    }
  }
  return operations
}

// Recipe-specific parsed types — parameterized aliases of the shared generic types.
type ParsedQuestionOption = ParsedOverridesOption<RecipeOverridesSelector, RecipeOverridesOperation>
type ParsedQuestionDefinition = ParsedOverridesQuestion<RecipeOverridesSelector, RecipeOverridesOperation>
// Parsed marker + index pairing so global IDs can resolve consistently.
type ParsedQuestionEntry = { index: number; question: ParsedQuestionDefinition }

/**
 * Parse a single recipe `@selector { … }` block.
 * Exported for use as a cross-domain block parser inside safeguard-overrides markers.
 */
export function parseRecipeSelectorBlock(
  cursor: TokenCursor,
  diags?: DiagnosticSpan[],
  absoluteOffset = 0,
): RecipeOverridesSelectorBlock | null {
  const selectorTokens = collectSelectorTokensAndOpenBlock(cursor)
  if (!selectorTokens) return null
  const selector = parseSelectorTokens(selectorTokens, absoluteOffset, diags)
  const operations = parseOperations(cursor, '}', false, absoluteOffset, diags)
  if (!selector || operations.length === 0) return null
  return { selector, operations }
}

/**
 * Cross-domain variant of parseRecipeSelectorBlock that enables $count/$value expression
 * parsing for numeric fields (rank, minrolls, lockedminrolls, minsubstats).
 * Used by noteSafeguardOverrides when parsing `recipe @selector { … }` blocks inside
 * safeguard-overrides slider questions.
 */
export function parseRecipeSelectorBlockCross(
  cursor: TokenCursor,
  diags?: DiagnosticSpan[],
  absoluteOffset = 0,
): RecipeOverridesSelectorBlock | null {
  const selectorTokens = collectSelectorTokensAndOpenBlock(cursor)
  if (!selectorTokens) return null
  const selector = parseSelectorTokens(selectorTokens, absoluteOffset, diags)
  const operations = parseOperations(cursor, '}', true, absoluteOffset, diags)
  if (!selector || operations.length === 0) return null
  return { selector, operations }
}

/** Module-internal alias for the selector block parser (passed to shared infrastructure). */
const parseSelectorBlock = parseRecipeSelectorBlock

/**
 * Parses `rawBlock` (a full `<!-- recipe-overrides … -->` comment) for structural
 * errors and appends diagnostics to `diags`.  Unlike `resolveRecipeOverridesTags`,
 * this call is purely for linting — the returned instructions are discarded.
 *
 * The function uses a closure to thread `diags` and `absoluteOffset` into the
 * existing `parseRecipeSelectorBlock` without changing the generic callback
 * signatures in the shared `parseOverridesMarkerBody` infrastructure.
 */
export function collectRecipeOverridesDiagnostics(
  rawBlock: string,
  blockStart: number,
  diags: DiagnosticSpan[],
): void {
  const stripped = stripCommentWrapper(rawBlock)
  // Compute how far into rawBlock the stripped content starts so token.index
  // values (which are relative to stripped) produce correct absolute positions.
  const strippedPos = rawBlock.indexOf(stripped)
  const absoluteOffset = blockStart + (strippedPos >= 0 ? strippedPos : 0)

  // Wrap the selector block parser in a closure that captures diags/offset.
  // The generic infrastructure (parseGroupBlocks, parseSelectorBlockList, etc.)
  // stays unchanged — it just calls this closure as its `parseSelectorBlock` callback.
  const diagSelectorBlock = (c: TokenCursor): RecipeOverridesSelectorBlock | null =>
    parseRecipeSelectorBlock(c, diags, absoluteOffset)

  // Cross-domain blocks mirror the normal marker, no diagnostic extension yet.
  const diagCrossBlock = (c: TokenCursor) => parseSafeguardSelectorBlock(c)

  parseOverridesMarkerBody<RecipeOverridesSelector, RecipeOverridesOperation>(
    stripped,
    NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS,
    diagSelectorBlock,
    diagCrossBlock,
    diags,
    absoluteOffset,
  )
}

// Parse a question marker body using the shared infrastructure with the recipe selector block parser.
// parseSafeguardSelectorBlock is from a circular import; safe because it's only called inside this
// function body, never at module initialization time.
const parseQuestionMarker = (inner: string, markerOffset = 0): ParsedQuestionDefinition | null => (
  parseOverridesMarkerBody<RecipeOverridesSelector, RecipeOverridesOperation>(
    inner,
    NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS,
    parseSelectorBlock,
    (cursor) => parseSafeguardSelectorBlock(cursor),
    // No diagnostics collected on the UI path; pass the absolute marker offset so
    // each option's sourceFrom/sourceTo are absolute positions in the full note.
    undefined,
    markerOffset,
  )
)

// Resolve a constraint token using global explicit IDs first, then local numeric tokens.
const resolveConstraintToken = (
  token: string,
  globalExplicitTokenMap: Map<string, string>,
  implicitTokenMap: Map<string, string>,
): string | null => (
  globalExplicitTokenMap.get(token) ?? implicitTokenMap.get(token) ?? null
)

// Convert constraint tokens to option IDs with stable ordering and de-duping.
const resolveOptionIdsFromTokens = (
  tokens: string[],
  globalExplicitTokenMap: Map<string, string>,
  implicitTokenMap: Map<string, string>,
): string[] => {
  // Track seen IDs so the output list stays unique.
  const seen = new Set<string>()
  // Accumulate resolved IDs in token order for deterministic exclusions.
  const resolved: string[] = []
  tokens.forEach((token) => {
    const resolvedId = resolveConstraintToken(token, globalExplicitTokenMap, implicitTokenMap)
    // Skip tokens that do not resolve to any option.
    if (!resolvedId) return
    // Avoid inserting duplicate IDs to keep exclusion order stable.
    if (seen.has(resolvedId)) return
    // Capture the resolved ID and remember it.
    seen.add(resolvedId)
    resolved.push(resolvedId)
  })
  return resolved
}

// Merge multiple option-id lists while preserving the earliest ordering.
const mergeOptionIdLists = (...lists: string[][]): string[] => {
  // Track seen ids so duplicates stay out of the merged list.
  const seen = new Set<string>()
  // Preserve order by streaming each list in sequence.
  const merged: string[] = []
  lists.forEach((list) => {
    list.forEach((id) => {
      // Skip ids we already captured.
      if (seen.has(id)) return
      // Remember the id so later lists cannot re-add it.
      seen.add(id)
      merged.push(id)
    })
  })
  return merged
}

// Build exclusion lists for "only" constraints using global token context.
const buildOnlyExclusionMap = (
  entries: ParsedQuestionEntry[],
  globalExplicitTokenMap: Map<string, string>,
): Map<string, string[]> => {
  // Map every option id to its owning question so we can scope allow-lists.
  const optionQuestionMap = new Map<string, string>()
  // Capture question option ids so we can exclude within a question boundary.
  const questionOptionIds = new Map<string, string[]>()
  entries.forEach(({ question }) => {
    // Snapshot the option ids so we can reuse them across constraints.
    const optionIds = question.options.map((option) => option.id)
    // Remember the question's option list for later exclusion checks.
    questionOptionIds.set(question.questionId, optionIds)
    // Record each option's question so we can bucket allow-lists.
    optionIds.forEach((optionId) => optionQuestionMap.set(optionId, question.questionId))
  })
  // Accumulate per-option exclusions keyed by option id.
  const onlyExclusions = new Map<string, string[]>()
  // Append a unique exclusion entry while preserving insertion order.
  const appendExclusion = (optionId: string, excludedId: string): void => {
    const existing = onlyExclusions.get(optionId)
    if (!existing) {
      onlyExclusions.set(optionId, [excludedId])
      return
    }
    if (!existing.includes(excludedId)) existing.push(excludedId)
  }
  entries.forEach(({ question }) => {
    // Build a numeric token map for question-scoped references.
    const implicitTokenMap = buildQuestionImplicitTokenMap(question.options)
    question.options.forEach((option) => {
      // Skip options without any "only" constraints.
      if (option.onlyTokens.length === 0) return
      // Resolve the allow-list ids from explicit/global + numeric/local tokens.
      const allowlistIds = resolveOptionIdsFromTokens(
        option.onlyTokens,
        globalExplicitTokenMap,
        implicitTokenMap,
      )
      // Bucket the allow-list by question so we only exclude inside those questions.
      const allowlistByQuestion = new Map<string, string[]>()
      allowlistIds.forEach((allowId) => {
        // Find the question that owns the allow-list option.
        const questionId = optionQuestionMap.get(allowId)
        // Ignore allow-list ids we cannot map to a question.
        if (!questionId) return
        // Append the id while preserving order and uniqueness.
        const existing = allowlistByQuestion.get(questionId)
        if (!existing) {
          allowlistByQuestion.set(questionId, [allowId])
          return
        }
        if (!existing.includes(allowId)) existing.push(allowId)
      })
      // If nothing resolved, skip adding exclusions entirely.
      if (allowlistByQuestion.size === 0) return
      // Cache the owning question so we can keep the option itself allowed.
      const optionQuestionId = optionQuestionMap.get(option.id)
      allowlistByQuestion.forEach((allowedIds, questionId) => {
        // Pull the candidate ids for this question to exclude within its scope.
        const candidateIds = questionOptionIds.get(questionId)
        // Skip invalid questions to avoid undefined lookups.
        if (!candidateIds) return
        // Always allow the option itself when it belongs to this question.
        const allowed = new Set<string>(allowedIds)
        if (optionQuestionId === questionId) allowed.add(option.id)
        // Collect every candidate id that is not in the allow-list.
        const excluded = candidateIds.filter((candidateId) => !allowed.has(candidateId))
        // Skip storing empty lists to keep lookups compact.
        if (excluded.length === 0) return
        // Store direct exclusions for the "only" option.
        excluded.forEach((candidateId) => appendExclusion(option.id, candidateId))
        // Apply reciprocal exclusions so the allow-list stays mutually exclusive.
        excluded.forEach((candidateId) => appendExclusion(candidateId, option.id))
      })
    })
  })
  return onlyExclusions
}

// Build group metadata using resolved options plus parsed fallback blocks.
const buildQuestionGroups = (
  parsedOptions: ParsedQuestionOption[],
  resolvedOptionsById: Map<string, NoteQuestionOption>,
): NoteQuestionGroup[] => {
  // Track groups by type so order stays consistent with the source.
  const groupMap = new Map<NoteQuestionGroupType, NoteQuestionGroup>()
  // Preserve first-seen order so rendering stays stable.
  const groupOrder: NoteQuestionGroup[] = []
  parsedOptions.forEach((parsedOption) => {
    // Lookup the resolved option to attach to the group.
    const resolved = resolvedOptionsById.get(parsedOption.id)
    if (!resolved) return
    // Lazily initialize the group entry when first encountered.
    let group = groupMap.get(resolved.groupType)
    if (!group) {
      // Seed the group with a stable id and empty fallback.
      group = { id: resolved.groupType, type: resolved.groupType, options: [], fallback: null }
      groupMap.set(resolved.groupType, group)
      groupOrder.push(group)
    }
    // Per-option `else` blocks are now carried on the option itself (resolved.elseBlocks)
    // and applied when that option is unselected — see resolveRecipeOverridesTags.
    // Group-empty defaults are expressed by the question-level `fallback` block.
    group.options.push(resolved)
  })
  return groupOrder
}

// Resolve a parsed question into a fully-typed question definition.
const buildResolvedQuestion = (
  entry: ParsedQuestionEntry,
  answers: NoteRecipeOverridesAnswers | null | undefined,
  globalExplicitTokenMap: Map<string, string>,
  onlyExclusionsById: Map<string, string[]>,
  // Display language for the localized prompt/label/detail text.
  lang: string,
): NoteQuestionDefinition => {
  const { question, index } = entry
  // Build the implicit numeric token map for this question.
  const implicitTokenMap = buildQuestionImplicitTokenMap(question.options)
  // Resolve the options with globally-scoped exclusions.
  const options = question.options.map((option, optionIndex) => {
    // Prefer explicit tokens for display, else fall back to the implicit index.
    const token = option.explicitToken ?? option.implicitToken ?? ''
    // Resolve set tokens using global explicit IDs.
    const setOptionIds = resolveOptionIdsFromTokens(
      option.setTokens,
      globalExplicitTokenMap,
      implicitTokenMap,
    )
    // Resolve unset tokens using global explicit IDs.
    const unsetOptionIds = resolveOptionIdsFromTokens(
      option.unsetTokens,
      globalExplicitTokenMap,
      implicitTokenMap,
    )
    // Resolve exclusion tokens using global explicit IDs.
    const explicitExclusions = resolveOptionIdsFromTokens(
      option.excludedTokens,
      globalExplicitTokenMap,
      implicitTokenMap,
    )
    // Merge explicit exclusions with the "only" allow-list exclusions.
    const excludedOptionIds = mergeOptionIdLists(
      explicitExclusions,
      onlyExclusionsById.get(option.id) ?? [],
    )
    // Resolve `needs` tokens (UI enable-gate) using the same global/local id maps.
    const requiresOptionIds = resolveOptionIdsFromTokens(
      option.needsTokens,
      globalExplicitTokenMap,
      implicitTokenMap,
    )
    return {
      id: option.id,
      // Localize the human-facing text; the id above stays language-invariant.
      label: localizeDslDisplay(option.label, lang),
      detail: option.detail == null ? null : localizeDslDisplay(option.detail, lang),
      blocks: option.blocks,
      safeguardBlocks: option.crossBlocks as SafeguardOverridesSelectorBlock[],
      elseBlocks: option.fallbackBlocks,
      safeguardElseBlocks: option.crossFallbackBlocks as SafeguardOverridesSelectorBlock[],
      isDefault: option.isDefault,
      token,
      setOptionIds,
      unsetOptionIds,
      excludedOptionIds,
      // Retain raw header tokens + setval pairs for the cross-domain forcing bridge.
      setValueDirectives: option.setValueTokens,
      setTokens: option.setTokens,
      unsetTokens: option.unsetTokens,
      excludedTokens: option.excludedTokens,
      requiresOptionIds,
      requiresDisabledState: option.needsDisabledState,
      groupType: option.groupType,
      // 1-based positional index for the implicit DSL reference.
      positionalIndex: optionIndex + 1,
      // Spread the source span only when present (exactOptionalPropertyTypes).
      ...(option.sourceFrom != null ? { sourceFrom: option.sourceFrom } : {}),
      ...(option.sourceTo != null ? { sourceTo: option.sourceTo } : {}),
    }
  })
  // Index options by id for group assembly.
  const resolvedOptionsById = new Map(options.map((option) => [option.id, option]))
  // Build group ordering and fallback metadata.
  const groups = buildQuestionGroups(question.options, resolvedOptionsById)
  // Gather default selections for each group.
  const defaultAnswer: string[] = []
  groups.forEach((group) => {
    if (group.type === 'single') {
      const firstDefault = group.options.find((opt) => opt.isDefault)
      if (firstDefault) defaultAnswer.push(firstDefault.id)
      return
    }
    group.options.forEach((opt) => {
      if (opt.isDefault) defaultAnswer.push(opt.id)
    })
  })
  // Build a stable ID per question from prompt + options.
  const id = question.questionId
  // Apply stored answers when available.
  const storedAnswer = answers ? answers[id] : undefined
  // Map legacy option ids to scoped ids so old answers survive.
  const legacyMap = new Map<string, string>()
  question.options.forEach((option) => {
    // Skip options without a legacy id.
    if (!option.legacyId) return
    // Preserve the first mapping to keep migration deterministic.
    if (!legacyMap.has(option.legacyId)) legacyMap.set(option.legacyId, option.id)
  })
  // Translate legacy ids before resolving the final selection.
  const migratedAnswer = Array.isArray(storedAnswer)
    ? storedAnswer.map((entry) => legacyMap.get(entry) ?? entry)
    : storedAnswer
  const answer = resolveQuestionAnswer({ groups, options, defaultAnswer }, migratedAnswer)
  const fallback = question.fallback
    ? { blocks: question.fallback.blocks, safeguardBlocks: question.fallback.crossBlocks as SafeguardOverridesSelectorBlock[] }
    : null
  return {
    id,
    index,
    prompt: localizeDslDisplay(question.prompt, lang),
    layoutColumns: question.layoutColumns,
    optionColumns: question.optionColumns,
    groups,
    options,
    fallback,
    defaultAnswer,
    answer,
  }
}

// Build a lookup of option exclusions for quick compatibility checks.
const buildOptionExclusionLookup = (
  options: NoteQuestionOption[],
): Map<string, Set<string>> => {
  // Track exclusions by option id for stable resolution.
  const exclusions = new Map<string, Set<string>>()
  options.forEach((option) => {
    // Copy the exclusion ids so callers cannot mutate source arrays.
    exclusions.set(option.id, new Set(option.excludedOptionIds))
  })
  return exclusions
}

// Determine whether a candidate can join the current selection safely.
const isOptionCompatibleWithSelection = (
  candidateId: string,
  selection: Set<string>,
  exclusions: Map<string, Set<string>>,
): boolean => {
  // Read the candidate's exclusions once to avoid repeated lookups.
  const candidateExclusions = exclusions.get(candidateId) ?? new Set()
  for (const selectedId of selection) {
    // Respect exclusions declared on existing selections.
    const selectedExclusions = exclusions.get(selectedId) ?? new Set()
    if (selectedExclusions.has(candidateId)) return false
    // Respect exclusions declared on the candidate itself.
    if (candidateExclusions.has(selectedId)) return false
  }
  return true
}

// Pick a fallback option for a single-select group when it is empty.
const pickSingleGroupFallback = (
  group: NoteQuestionGroup,
  selection: Set<string>,
  exclusions: Map<string, Set<string>>,
): string | null => {
  // Prefer the default option when it stays compatible.
  const preferred = group.options.find((option) => option.isDefault) ?? null
  const ordered = preferred
    ? [preferred, ...group.options.filter((option) => option.id !== preferred.id)]
    : group.options
  for (const option of ordered) {
    // Skip candidates that would violate exclusion constraints.
    if (!isOptionCompatibleWithSelection(option.id, selection, exclusions)) continue
    return option.id
  }
  return null
}

// Fill missing single-select answers without recursion or cascading removals.
const applySingleGroupFallbackSelections = (
  selection: string[],
  groups: NoteQuestionGroup[],
  options: NoteQuestionOption[],
  preferredId?: string,
): string[] => {
  // Reuse the shared exclusion lookup for compatibility checks.
  const exclusions = buildOptionExclusionLookup(options)
  // Use a working set so inserts are cheap.
  const next = new Set(selection)
  groups.forEach((group) => {
    if (group.type !== 'single') return
    // Keep single-select groups to a single answer.
    const selectedInGroup = group.options.filter((option) => next.has(option.id))
    if (selectedInGroup.length > 0) {
      const preferred = preferredId
        ? selectedInGroup.find((option) => option.id === preferredId) ?? null
        : null
      const keep = preferred ?? selectedInGroup[0]!
      selectedInGroup.forEach((option) => {
        if (option.id === keep.id) return
        next.delete(option.id)
      })
      return
    }
    // Choose the first compatible fallback candidate.
    const fallbackId = pickSingleGroupFallback(group, next, exclusions)
    if (!fallbackId) return
    next.add(fallbackId)
  })
  // Preserve the original option ordering in the output list.
  return options.filter((option) => next.has(option.id)).map((option) => option.id)
}

// Normalize a selection to the source option ordering.
const normalizeSelectionOrder = (
  selection: string[],
  options: NoteQuestionOption[],
): string[] => {
  const selectedSet = new Set(selection)
  return options.filter((option) => selectedSet.has(option.id)).map((option) => option.id)
}

// Compare ordered selections without allocating set wrappers.
const isSameOrderedSelection = (
  left: string[],
  right: string[],
): boolean => (
  left.length === right.length
  && left.every((value, index) => value === right[index])
)

// Question-scoped option IDs are prefixed with "{questionId}:...".
const getOptionQuestionScopeId = (optionId: string): string => {
  const separatorIndex = optionId.indexOf(':')
  return separatorIndex >= 0 ? optionId.slice(0, separatorIndex) : optionId
}

// Apply exclusions so mutually exclusive options cannot co-exist.
export const applyQuestionExclusions = (
  selection: string[],
  options: NoteQuestionOption[],
  preferredId?: string,
): string[] => {
  // Use a working set so deletes are cheap.
  const next = new Set(selection)
  // Build a quick lookup for exclusion lists.
  const exclusions = buildOptionExclusionLookup(options)
  // Ensure the preferred option wins over exclusions.
  if (preferredId && next.has(preferredId)) {
    const blocked = exclusions.get(preferredId) ?? new Set()
    blocked.forEach((id) => next.delete(id))
  }
  // Apply exclusions in option order for stable conflict resolution.
  options.forEach((option) => {
    if (!next.has(option.id)) return
    const blocked = exclusions.get(option.id)
    if (!blocked) return
    blocked.forEach((id) => {
      if (id === preferredId) return
      next.delete(id)
    })
  })
  // Preserve the original option ordering.
  return options.filter((option) => next.has(option.id)).map((option) => option.id)
}

// Apply set/unset directives emitted by selected options.
export const applyQuestionDirectives = (
  selection: string[],
  options: NoteQuestionOption[],
  preferredId?: string,
  // Option the user explicitly turned OFF this interaction (e.g. a checkbox uncheck).
  removedId?: string,
  // Option IDs that were explicitly stored by the user (not just derived from defaults or
  // directives). A foreign `unset` directive may not evict a stored option unless the
  // directive source is the currently-preferred selection — this lets the user override a
  // `-token` directive without it silently re-applying on every render.
  storedOptionIds: Set<string> = new Set(),
): string[] => {
  const next = new Set(selection)
  const optionById = new Map(options.map((option) => [option.id, option]))
  // When the user explicitly turns an option off, release every selected source
  // that force-sets it on. This mirrors the single-select release below (where
  // picking a different radio drops a diverging preset) so that an explicit
  // uncheck cannot be re-stamped: the forcing preset is deselected instead.
  if (removedId) {
    // Drop the option itself so a forcing source cannot immediately re-add it.
    next.delete(removedId)
    // Deselect any selected directive source whose set-list re-adds the removed id.
    options.forEach((option) => {
      if (!next.has(option.id)) return
      if (!option.setOptionIds.includes(removedId)) return
      next.delete(option.id)
    })
  }
  options.forEach((option) => {
    if (!next.has(option.id)) return
    // Apply "set" first so explicit unsets can still win.
    option.setOptionIds.forEach((id) => {
      next.add(id)
      // Setting a single-select option should replace peers in that question.
      const target = optionById.get(id)
      if (!target || target.groupType !== 'single') return
      const targetScope = getOptionQuestionScopeId(id)
      options.forEach((candidate) => {
        if (candidate.id === id) return
        if (candidate.groupType !== 'single') return
        if (getOptionQuestionScopeId(candidate.id) !== targetScope) return
        next.delete(candidate.id)
      })
    })
    option.unsetOptionIds.forEach((id) => {
      if (id === preferredId) return
      // Do not evict a multi-select option the user explicitly stored unless the
      // directive source is the very option the user is actively selecting right now
      // (i.e. option.id === preferredId). This allows a `-token` directive to fire
      // when the user picks that preset, but not to silently win on subsequent renders
      // against an answer the user has already pinned.
      if (storedOptionIds.has(id) && option.id !== preferredId) return
      next.delete(id)
    })
  })
  // Keep explicit user intent when a preferred id is supplied.
  if (preferredId) {
    next.add(preferredId)
    const preferred = optionById.get(preferredId)
    if (preferred?.groupType === 'single') {
      const preferredScope = getOptionQuestionScopeId(preferredId)
      options.forEach((candidate) => {
        if (candidate.id === preferredId) return
        if (candidate.groupType !== 'single') return
        if (getOptionQuestionScopeId(candidate.id) !== preferredScope) return
        next.delete(candidate.id)
      })
      // Drop selected directive sources that force a different single answer
      // in the user's preferred single-select group.
      options.forEach((candidate) => {
        // Skip options that are already unselected or are the preferred choice.
        if (!next.has(candidate.id) || candidate.id === preferredId) return
        // Keep options that do not set anything outside their own scope.
        const forcesDifferentPreferredPeer = candidate.setOptionIds.some((targetId) => {
          // Setting the preferred option itself stays compatible.
          if (targetId === preferredId) return false
          // Only single-select targets can conflict with preferred radio intent.
          const target = optionById.get(targetId)
          if (!target || target.groupType !== 'single') return false
          // Conflicts are limited to the preferred option's single-select scope.
          return getOptionQuestionScopeId(targetId) === preferredScope
        })
        if (!forcesDifferentPreferredPeer) return
        // Unset the conflicting source so presets release manual overrides.
        next.delete(candidate.id)
      })
    }
  }
  // Keep an explicitly-removed option out even if an indirect source re-added it.
  if (removedId) next.delete(removedId)
  return options.filter((option) => next.has(option.id)).map((option) => option.id)
}

// Resolve directives, exclusions, and fallbacks until the selection stabilizes.
const resolveSelectionWithOptionRules = (
  selection: string[],
  groups: NoteQuestionGroup[],
  options: NoteQuestionOption[],
  preferredId?: string,
  removedId?: string,
  storedOptionIds: Set<string> = new Set(),
): string[] => {
  let current = normalizeSelectionOrder(selection, options)
  // Cap iterations so malformed cycles cannot stall parsing.
  const maxPasses = Math.max(8, options.length + groups.length + 2)
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const withDirectives = applyQuestionDirectives(current, options, preferredId, removedId, storedOptionIds)
    const withExclusions = applyQuestionExclusions(withDirectives, options, preferredId)
    const withFallbacks = applySingleGroupFallbackSelections(withExclusions, groups, options, preferredId)
    const next = normalizeSelectionOrder(withFallbacks, options)
    if (isSameOrderedSelection(next, current)) return next
    current = next
  }
  return current
}

// Apply constraints across all questions so cross-question ids resolve consistently.
const applyGlobalOptionExclusions = (
  questions: NoteQuestionDefinition[],
  preferredId?: string,
  removedId?: string,
  // Raw persisted answers used to build the stored-option shield — see applyQuestionDirectives.
  answers?: NoteRecipeOverridesAnswers | null,
): NoteQuestionDefinition[] => {
  // Flatten option/group ordering so conflicts resolve deterministically.
  const allOptions = questions.flatMap((question) => question.options)
  const allGroups = questions.flatMap((question) => question.groups)
  // Collect the currently selected option IDs.
  const selected = questions.flatMap((question) => question.answer)
  // Build the set of option IDs the user explicitly stored. Cross-question `unset`
  // directives may not evict these unless the directive source is actively preferred.
  const storedOptionIds = new Set<string>()
  if (answers) {
    questions.forEach((question) => {
      const stored = answers[question.id]
      if (Array.isArray(stored)) stored.forEach((id) => storedOptionIds.add(id))
    })
  }
  // Resolve directives/exclusions/fallbacks using global option ordering.
  const resolved = resolveSelectionWithOptionRules(selected, allGroups, allOptions, preferredId, removedId, storedOptionIds)
  // Cache the resolved selection for cheap lookups.
  const resolvedSet = new Set(resolved)
  // Update each question with the globally-resolved selection.
  return questions.map((question) => ({
    ...question,
    answer: question.options
      .filter((option) => resolvedSet.has(option.id))
      .map((option) => option.id),
  }))
}

// Public helper used by UI handlers when a single question changes.
export const applyQuestionSelectionRules = (
  selection: string[],
  question: Pick<NoteQuestionDefinition, 'groups' | 'options'>,
  preferredId?: string,
  removedId?: string,
): string[] => (
  resolveSelectionWithOptionRules(selection, question.groups, question.options, preferredId, removedId)
)

// Resolve which option IDs are selected for a question.
const resolveQuestionAnswer = (
  question: Pick<NoteQuestionDefinition, 'groups' | 'options' | 'defaultAnswer'>,
  stored: string[] | undefined,
): string[] => {
  // Only allow answers that still exist in the question definition.
  const allowed = new Set(question.options.map((opt) => opt.id))
  // Track whether the caller stored an explicit answer payload.
  const hasStored = Array.isArray(stored)
  // Filter to valid option IDs while preserving stored order.
  const filtered = hasStored
    ? stored.filter((id) => allowed.has(id))
    : []
  // Build the answer group-by-group to honor defaults.
  const next: string[] = []
  question.groups.forEach((group) => {
    // Collect stored answers for this group.
    const storedForGroup = filtered.filter((id) => group.options.some((opt) => opt.id === id))
    if (group.type === 'single') {
      // Single-select always collapses to one answer or default.
      if (storedForGroup.length > 0) {
        next.push(storedForGroup[0]!)
        return
      }
      const defaultId = question.defaultAnswer.find((id) => group.options.some((opt) => opt.id === id))
      if (defaultId) next.push(defaultId)
      return
    }
    // Multi-select keeps explicit empty selections when answers were stored.
    if (storedForGroup.length > 0) {
      next.push(...storedForGroup)
      return
    }
    // An explicit stored array suppresses defaults for this group.
    if (hasStored) return
    // Fall back to defaults when no stored answers exist.
    question.defaultAnswer
      .filter((id) => group.options.some((opt) => opt.id === id))
      .forEach((id) => next.push(id))
  })
  // Enforce directives/exclusions and repair single-select gaps.
  return applyQuestionSelectionRules(next, question)
}

// Parse recipe overrides markers from note text.
export const parseNoteRecipeOverrides = (
  note: string,
  answers?: NoteRecipeOverridesAnswers | null,
  preferredId?: string,
  removedId?: string,
  // Display language for prompt/label/detail text. Identity (ids) stays language-invariant;
  // only the human-facing strings are localized. Defaults to English so non-UI callers
  // (signatures, pruning) are unaffected.
  lang = 'en-US',
): NoteQuestionDefinition[] => {
  // Short-circuit when no note is present.
  if (!note) return []
  // Collect parsed questions in note order for global resolution.
  const parsedEntries: ParsedQuestionEntry[] = []
  // Body-less spacer markers are resolved directly (no question pipeline needed).
  const spacerQuestions: NoteQuestionDefinition[] = []
  // Reset regex state to avoid cross-call leakage.
  QUESTION_MARKER_REGEX.lastIndex = 0
  // Track the marker index for stable mapping.
  let markerIndex = 0
  for (const match of note.matchAll(QUESTION_MARKER_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    // Strip the HTML comment wrapper to parse the payload.
    const inner = stripCommentWrapper(raw)
    // Absolute offset of `inner` within the full note, so option source spans are absolute.
    const innerOffset = (match.index ?? 0) + raw.indexOf(inner)
    const parsed = parseQuestionMarker(inner, innerOffset)
    if (!parsed) {
      // No question body — check for a spacer marker (bare marker with optional [columns=N]).
      const spacerColumns = parseOverridesMarkerSpacerColumns(inner, NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS)
      if (spacerColumns !== null) {
        spacerQuestions.push({
          id: `spacer-recipe-${markerIndex}`,
          index: markerIndex,
          prompt: '',
          layoutColumns: spacerColumns,
          // Spacers have no options, so no option-grid column count.
          optionColumns: NOTE_OVERRIDES_OPTION_COLUMNS_DEFAULT,
          groups: [],
          options: [],
          fallback: null,
          defaultAnswer: [],
          answer: [],
          isSpacer: true,
        })
      }
      markerIndex += 1
      continue
    }
    // Preserve the parsed question alongside its marker index.
    parsedEntries.push({ index: markerIndex, question: parsed })
    markerIndex += 1
  }
  // Build the global explicit-token map before resolving options.
  const globalExplicitTokenMap = buildGlobalExplicitTokenMap(parsedEntries)
  // Resolve the "only" constraints now that global tokens are available.
  const onlyExclusionsById = buildOnlyExclusionMap(parsedEntries, globalExplicitTokenMap)
  // Resolve each parsed question into a fully-typed definition.
  const resolved = parsedEntries.map((entry) => (
    buildResolvedQuestion(entry, answers, globalExplicitTokenMap, onlyExclusionsById, lang)
  ))
  // Merge spacers into the resolved list in note order and apply global exclusions.
  return applyGlobalOptionExclusions(
    [...resolved, ...spacerQuestions].sort((a, b) => a.index - b.index),
    preferredId,
    removedId,
    answers,
  )
}

// Build a stable signature for the recipe overrides section of a note.
export const buildNoteRecipeOverridesSignature = (note: string): string => {
  // Parse the questions using the same parser as the UI.
  const questions = parseNoteRecipeOverrides(note)
  // Preserve marker order plus layout metadata so formatting changes still register.
  const signature = questions.map((question) => [question.id, question.layoutColumns, question.optionColumns])
  // Serialize the signature so comparisons are cheap and stable.
  return JSON.stringify(signature)
}

// Remove answers that no longer match the current note content.
export const pruneNoteRecipeOverridesAnswers = (
  note: string,
  answers: NoteRecipeOverridesAnswers,
): NoteRecipeOverridesAnswers => {
  // Build a pruned output map.
  const next: NoteRecipeOverridesAnswers = {}
  // Parse the current questions as the source of truth.
  const questions = parseNoteRecipeOverrides(note)
  // Precompute allowed option IDs per question.
  const lookup = new Map<string, { hasMulti: boolean; options: Set<string>; groups: NoteQuestionGroup[] }>()
  questions.forEach((question) => {
    lookup.set(question.id, {
      hasMulti: question.groups.some((group) => group.type === 'multi'),
      options: new Set(question.options.map((opt) => opt.id)),
      groups: question.groups,
    })
  })
  // Filter out answers that are no longer valid.
  for (const [questionId, selected] of Object.entries(answers)) {
    const entry = lookup.get(questionId)
    if (!entry) continue
    // Normalize stored answers to an array to avoid nulls.
    const rawSelected = Array.isArray(selected) ? selected : []
    // Drop answers that no longer map to valid options.
    const filtered = rawSelected.filter((id) => entry.options.has(id))
    if (filtered.length === 0) {
      // Preserve explicit empty selections for questions with multi groups only.
      if (entry.hasMulti && rawSelected.length === 0) {
        next[questionId] = []
      }
      continue
    }
    // Resolve single-group defaults by trimming to one per single group.
    const nextSelection: string[] = []
    entry.groups.forEach((group) => {
      const allowed = new Set(group.options.map((opt) => opt.id))
      const selected = filtered.filter((id) => allowed.has(id))
      if (group.type === 'single') {
        if (selected.length > 0) nextSelection.push(selected[0]!)
        return
      }
      nextSelection.push(...selected)
    })
    next[questionId] = nextSelection
  }
  // Return the filtered answer map.
  return next
}

// Normalize an autosave payload into a valid answers map.
export const normalizeNoteRecipeOverridesAnswers = (
  raw: unknown,
): NoteRecipeOverridesAnswers | null => {
  // Reject null or non-object payloads.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const next: NoteRecipeOverridesAnswers = {}
  for (const [key, value] of Object.entries(rec)) {
    // Accept a string or string[] and drop empties.
    const isArrayValue = Array.isArray(value)
    // Filter empty entries but keep order for valid selections.
    const list = isArrayValue
      ? value.map(String).filter((entry) => entry.trim().length > 0)
      : (typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [])
    // Preserve empty arrays so explicit "no answers" survives restore.
    const keepEmptyArray = isArrayValue && value.length === 0
    if (list.length === 0 && !keepEmptyArray) continue
    // Preserve the raw question ID key.
    next[key] = list
  }
  // Return null if no valid answers remain.
  return Object.keys(next).length > 0 ? next : null
}

// Resolve selector blocks based on the current recipe overrides answers.
export const resolveRecipeOverridesTags = (
  note: string,
  answers?: NoteRecipeOverridesAnswers | null,
  preferredId?: string,
  removedId?: string,
  // Display language threaded to the resolved questions (labels/prompts/details).
  lang = 'en-US',
): RecipeOverridesResolution => {
  const questions = parseNoteRecipeOverrides(note, answers, preferredId, removedId, lang)
  const instructions: RecipeOverridesInstructions = []
  const safeguardInstructions: SafeguardOverridesInstruction[] = []
  for (const question of questions) {
    const selected = new Set(question.answer)
    // Emit each option's blocks when selected, or its `else` blocks when not.
    // `else` is per-option (e.g. a single unchecked box), in source order.
    question.options.forEach((option) => {
      if (selected.has(option.id)) {
        option.blocks.forEach((block) => instructions.push(block))
        option.safeguardBlocks.forEach((block) => safeguardInstructions.push(block))
      } else {
        option.elseBlocks.forEach((block) => instructions.push(block))
        option.safeguardElseBlocks.forEach((block) => safeguardInstructions.push(block))
      }
    })
    // Apply question-level fallback when no options are selected anywhere.
    if (selected.size === 0 && question.fallback) {
      // Append the question-level fallback at the end.
      question.fallback.blocks.forEach((block) => instructions.push(block))
      question.fallback.safeguardBlocks.forEach((block) => safeguardInstructions.push(block))
    }
  }
  return { questions, instructions, safeguardInstructions }
}

/**
 * Merge a single answer change into the stored recipe-overrides answers, mirroring the
 * dialog's persist + normalize flow (store only non-default answers).
 *
 * Fix for the "uncheck cascades unrelated boxes off" bug: on a removal (uncheck), an
 * option that an account-tier preset force-set via `+`/`set` triggers the resolver's
 * release-the-forcing-preset path (so the box stays off instead of snapping back). But
 * releasing the tier also un-forces every OTHER option it set, and those (living in other
 * questions and not yet stored) would fall back to off. To prevent that, on a removal we
 * first seed the resolve with the current full resolved selection of every question, so
 * the released preset's other options are already explicit and survive. Checks
 * (preferredId, no removal) never release a preset, so they keep the lean prev as-is.
 */
export const applyRecipeOverridesAnswerChange = (
  note: string,
  prev: NoteRecipeOverridesAnswers,
  question: NoteQuestionDefinition,
  nextSelection: readonly string[],
  preferredId?: string,
  removedId?: string,
): NoteRecipeOverridesAnswers => {
  // Compare the changed question's new selection against its default.
  const defaultSet = new Set(question.defaultAnswer)
  const nextSet = new Set(nextSelection)
  const matchesDefault = defaultSet.size === nextSet.size
    && Array.from(defaultSet).every((id) => nextSet.has(id))
  // Keep the stored answer ordered by option definition.
  const orderedSelection = question.options
    .filter((option) => nextSet.has(option.id))
    .map((option) => option.id)
  const next: NoteRecipeOverridesAnswers = { ...prev }
  // Uncheck path only: snapshot the current full state so releasing a forcing preset
  // does not drop unrelated options it set (radios used `preferred`, never `removed`).
  if (removedId) {
    const current = resolveRecipeOverridesTags(note, prev)
    current.questions.forEach((resolved) => { next[resolved.id] = resolved.answer.slice() })
  }
  // Default selections are omitted from storage; non-default (incl. empty) are persisted.
  if (matchesDefault) delete next[question.id]
  else next[question.id] = orderedSelection
  // Re-resolve to enforce cross-question directives/exclusions with preferred/removed.
  const { questions } = resolveRecipeOverridesTags(note, next, preferredId, removedId)
  // Persist the FULL resolved selection (every question, defaults included). The cascade
  // release logic above runs entirely during resolution (driven by preferredId/removedId),
  // so the resolved answers already reflect any released forcing-preset — we just record
  // them verbatim. Storing defaults explicitly makes the saved state self-contained and
  // identical in shape to a saved preset (one persistence format; no follow-the-note drift).
  const normalized: NoteRecipeOverridesAnswers = {}
  questions.forEach((resolved) => {
    const resolvedSet = new Set(resolved.answer)
    // Keep answers ordered by option definition for stable, diff-friendly storage.
    normalized[resolved.id] = resolved.options
      .filter((option) => resolvedSet.has(option.id))
      .map((option) => option.id)
  })
  return normalized
}

const matchesRankSelector = (recipe: BuilderRecipe, selector: RecipeOverridesSelector & { kind: 'rank' }): boolean => {
  const { op, value } = selector
  const rank = recipe.rankCode
  const range = rankCodeToRange(rank)
  if (op === 'eq') return range.min === range.max && range.min === value
  if (op === 'gte') return range.min >= rankRangeValue(value).min
  return range.max <= rankRangeValue(value).max
}

const matchesRaritySelector = (recipe: BuilderRecipe, selector: RecipeOverridesSelector & { kind: 'rarity' }): boolean => {
  const { op, mode, code } = selector
  const recipeMode: 'auto' | 'code' = (recipe.rarityMode ?? 'code')
  if (mode === 'auto') {
    return op === 'eq' && recipeMode === 'auto'
  }
  if (recipeMode !== 'code') return false
  const range = rarityCodeToRange(recipe.rarityCode)
  if (op === 'eq') return range.min === range.max && range.min === rarityRangeValue(code ?? RarityCodeEnum.Any).min
  if (op === 'gte') return range.min >= rarityRangeValue(code ?? RarityCodeEnum.Any).min
  return range.max <= rarityRangeValue(code ?? RarityCodeEnum.Any).max
}

const matchesSelector = (
  selector: RecipeOverridesSelector,
  recipe: BuilderRecipe,
  targets?: SubstatTargetTable,
): boolean => {
  switch (selector.kind) {
    case 'all':
      return true
    case 'tagged':
      return Array.isArray(recipe.tags) && recipe.tags.length > 0
    case 'untagged':
      return !Array.isArray(recipe.tags) || recipe.tags.length === 0
    case 'tag': {
      const tags = Array.isArray(recipe.tags) ? recipe.tags : []
      if (selector.mode === 'any') return tags.length > 0
      if (selector.mode === 'none') return tags.length === 0
      const normalized = tags.map((tag) => normalizeTagValue(String(tag))).filter((tag): tag is string => Boolean(tag))
      if (selector.mode === 'eq') {
        return normalized.some((tag) => tag === selector.values?.[0])
      }
      return normalized.some((tag) => selector.values?.includes(tag))
    }
    case 'rank':
      return matchesRankSelector(recipe, selector)
    case 'rarity':
      return matchesRaritySelector(recipe, selector)
    case 'minRolls': {
      const manual = (recipe.autoMinRequiredRolls === false) ? (recipe.minRequiredRolls ?? 0) : 0
      return compareNumeric(manual, selector.op, selector.value)
    }
    case 'lockedMinRolls':
      // Match against the locked-only floor (lockedMinRequiredRolls), treating absent as 0.
      return compareNumeric(recipe.lockedMinRequiredRolls ?? 0, selector.op, selector.value)
    case 'minSubstats':
      return compareNumeric(resolveEffectiveMinCount(recipe), selector.op, selector.value)
    case 'flex':
      return Boolean(recipe.autoSubstatFlex) === selector.value
    case 'substatMin': {
      // Match if ANY active substat satisfies the min-bound condition (absent entry → 0).
      const active = new Set<number>()
      ;(recipe.substatsV ?? []).forEach((v) => active.add(Number(v)))
      ;(recipe.fixedSubstatsV ?? []).forEach((v) => active.add(Number(v)))
      const bounds = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number }>
      if (active.size === 0) return compareNumeric(0, selector.op, selector.value)
      return [...active].some((v) => compareNumeric(bounds[v]?.min ?? 0, selector.op, selector.value))
    }
    case 'substatMinField': {
      // Match against one specific substat variant's stored min (absent → 0).
      const bounds = (recipe.substatRollBoundsV ?? {}) as Record<number, { min?: number }>
      return compareNumeric(bounds[selector.variant]?.min ?? 0, selector.op, selector.value)
    }
    case 'minimaAny':
      // Requires SubstatTargetTable; returns false if unavailable.
      if (!targets) return false
      return compareNumeric(targets.anyRankDefaultsTo, selector.op, selector.value)
    case 'minimaField': {
      // Requires SubstatTargetTable; returns false if unavailable.
      if (!targets) return false
      const starKey = starKeyForSubstatTargets(selector.star)
      return compareNumeric(targets[starKey]?.[selector.variant] ?? 0, selector.op, selector.value)
    }
    case 'not':
      return !matchesSelector(selector.inner, recipe, targets)
    case 'and':
      return matchesSelector(selector.left, recipe, targets) && matchesSelector(selector.right, recipe, targets)
    case 'or':
      return matchesSelector(selector.left, recipe, targets) || matchesSelector(selector.right, recipe, targets)
    default:
      return false
  }
}

const compareNumeric = (value: number, op: TagOverrideOp, target: number): boolean => {
  if (op === 'eq') return value === target
  if (op === 'gte') return value >= target
  return value <= target
}

const rankRangeValue = (value: RankCode): { min: number; max: number } => (
  rankCodeToRange(value)
)

const rankCodeToRange = (rank: RankCode): { min: number; max: number } => {
  if (rank === RankCodeEnum.Any) return { min: 1, max: 6 }
  if (rank >= RankCodeEnum.One && rank <= RankCodeEnum.Six) {
    const val = rank as number
    return { min: val, max: val }
  }
  if (rank >= RankCodeEnum.GTE_One && rank <= RankCodeEnum.GTE_Five) {
    const offset = rank - RankCodeEnum.GTE_One + 1
    return { min: offset, max: 6 }
  }
  if (rank === RankCodeEnum.GTE_Five) return { min: 5, max: 6 }
  if (rank === RankCodeEnum.Six) return { min: 6, max: 6 }
  if (rank >= RankCodeEnum.LTE_Two && rank <= RankCodeEnum.LTE_Six) {
    const offset = rank - RankCodeEnum.LTE_Two + 2
    return { min: 1, max: offset }
  }
  return { min: 1, max: 6 }
}

const rarityRangeValue = (value: RarityCode): { min: number; max: number } => (
  rarityCodeToRange(value)
)

const rarityCodeToRange = (rarity: RarityCode): { min: number; max: number } => {
  if (rarity === RarityCodeEnum.Any) return { min: 1, max: 6 }
  if (rarity >= RarityCodeEnum.Common && rarity <= RarityCodeEnum.Mythical) {
    const val = rarity as number
    return { min: val, max: val }
  }
  if (rarity >= RarityCodeEnum.GTE_Common && rarity <= RarityCodeEnum.GTE_Legendary) {
    const offset = rarity - RarityCodeEnum.GTE_Common + 1
    return { min: offset, max: 6 }
  }
  if (rarity >= RarityCodeEnum.LTE_Uncommon && rarity <= RarityCodeEnum.LTE_Mythical) {
    const offset = rarity - RarityCodeEnum.LTE_Uncommon + 2
    return { min: 1, max: offset }
  }
  return { min: 1, max: 6 }
}

// Resolve a recipe's export mode based on recipe overrides selector blocks.
const resolveRecipeOverridesExportModeWithInstructions = (
  recipe: BuilderRecipe,
  instructions: RecipeOverridesInstructions,
  targets?: SubstatTargetTable,
): SellfileExportMode => {
  // Separators should never be overridden by options.
  if (recipe.exportMode === 'separator') return 'separator'
  // Start from the stored export mode before applying selector blocks.
  let nextMode: SellfileExportMode = recipe.exportMode
  let hasInstruction = false
  for (const instruction of instructions) {
    if (!matchesSelector(instruction.selector, recipe, targets)) continue
    hasInstruction = true
    instruction.operations.forEach((op) => {
      if (op.kind !== 'exportMode') return
      if (op.action === 'toggle') {
        nextMode = nextMode === 'active' ? 'disabled' : 'active'
        return
      }
      nextMode = op.action
    })
  }
  return hasInstruction ? nextMode : recipe.exportMode
}

// Resolve a recipe's export mode with selector blocks.
export const resolveRecipeOverridesExportMode = (
  recipe: BuilderRecipe,
  instructions: RecipeOverridesInstructions,
  targets?: SubstatTargetTable,
): SellfileExportMode => {
  return resolveRecipeOverridesExportModeWithInstructions(recipe, instructions, targets)
}

const applySubstatMinOverrides = (
  recipe: BuilderRecipe,
  substatMinAll: number | null,
  substatMinByVariant: Map<number, number>,
): BuilderRecipe => {
  if (substatMinAll == null && substatMinByVariant.size === 0) return recipe
  const selection = new Set<number>()
  ;(recipe.substatsV ?? []).forEach((variant) => selection.add(Number(variant)))
  ;(recipe.fixedSubstatsV ?? []).forEach((variant) => selection.add(Number(variant)))
  if (selection.size === 0) return recipe
  const bounds = { ...(recipe.substatRollBoundsV ?? {}) }
  selection.forEach((variant) => {
    const nextMin = substatMinByVariant.get(variant) ?? substatMinAll
    if (nextMin == null) return
    const existing = bounds[variant] ?? {}
    // substatmin is intended to adjust existing minimum requirements, not to
    // add them to substats configured as wildcard (any: true / no existing min).
    // Applying min to an any-substat would produce invalid state (min + any).
    if (existing.min == null) return
    bounds[variant] = { ...existing, min: clampSubstatMin(nextMin) }
  })
  return { ...recipe, substatRollBoundsV: bounds }
}

// Resolve a recipe with all recipe overrides applied.
const resolveRecipeOverridesEffectiveRecipeWithInstructions = (
  recipe: BuilderRecipe,
  instructions: RecipeOverridesInstructions,
  targets?: SubstatTargetTable,
): BuilderRecipe => {
  // Separators stay isolated from recipe overrides logic.
  if (recipe.exportMode === 'separator') return recipe
  let nextMode: SellfileExportMode = recipe.exportMode
  let nextRank: RankCode = recipe.rankCode
  let nextRarityMode: 'auto' | 'code' = (recipe.rarityMode ?? 'code')
  let nextRarityCode: RarityCode = recipe.rarityCode
  let nextMinLevel: LevelMilestone | undefined = recipe.minLevel
  let nextMaxLevel: LevelMilestone | undefined = recipe.maxLevel
  let nextKeepMode: 'early' | 'late' = (recipe.earlyKeepMode ?? 'early')
  // Keep/Sell flag (recipe.keep): tracked separately from the early/late keep-timing above.
  let nextKeep: boolean = recipe.keep ?? true
  let nextAutoLate: AutoRaritySupplementsThreshold | undefined = recipe.autoRaritySupplementsThreshold
  let nextMinRequiredRolls: number | undefined = recipe.minRequiredRolls
  let nextLockedMinRequiredRolls: number | undefined = recipe.lockedMinRequiredRolls
  let nextMinCount = recipe.minCount
  let nextFlex = recipe.autoSubstatFlex
  const substatMinByVariant = new Map<number, number>()
  let substatMinAll: number | null = null
  let appliedMode = false
  let appliedRank = false
  let appliedRarity = false
  let appliedLevel = false
  let appliedKeep = false
  let appliedKeepAction = false
  let appliedAutoLate = false
  let appliedMinRequired = false
  let appliedLockedMin = false
  let appliedMinCount = false
  let appliedFlex = false
  let appliedSubstatMin = false
  const rollTargetsByVariant = new Map<StatVariant, SubstatRollTargetEntry>()
  let appliedRollTargets = false
  // List-op fields: undefined = not overridden; set to the parsed operation when matched.
  let nextArtifactTypesOp:    Extract<RecipeOverridesOperation, { kind: 'artifactTypes' }>    | undefined
  let nextSubstatsOp:         Extract<RecipeOverridesOperation, { kind: 'substats' }>         | undefined
  let nextMainStatsOp:        Extract<RecipeOverridesOperation, { kind: 'mainStats' }>         | undefined
  let nextArtifactSetsOp:     Extract<RecipeOverridesOperation, { kind: 'artifactSets' }>     | undefined
  let nextArtifactMetaSetsOp: Extract<RecipeOverridesOperation, { kind: 'artifactMetaSets' }> | undefined
  let hasInstruction = false
  for (const instruction of instructions) {
    if (!matchesSelector(instruction.selector, recipe, targets)) continue
    hasInstruction = true
    instruction.operations.forEach((op) => {
      if (op.kind === 'exportMode') {
        appliedMode = true
        if (op.action === 'toggle') {
          nextMode = nextMode === 'active' ? 'disabled' : 'active'
        } else {
          nextMode = op.action
        }
        return
      }
      if (op.kind === 'rank') {
        // value is null when an unresolved cross-domain AST slips through; skip it.
        if (op.value == null) return
        nextRank = op.value
        appliedRank = true
        return
      }
      if (op.kind === 'rarity') {
        nextRarityMode = op.mode
        if (op.mode === 'code' && op.code != null) {
          nextRarityCode = op.code
        }
        appliedRarity = true
        return
      }
      if (op.kind === 'level') {
        nextMinLevel = op.min
        nextMaxLevel = op.max
        appliedLevel = true
        return
      }
      if (op.kind === 'keep') {
        nextKeepMode = op.mode
        appliedKeep = true
        return
      }
      if (op.kind === 'keepAction') {
        // Mirror the export-mode toggle shape: 'toggle' inverts, else set explicitly.
        nextKeep = op.action === 'toggle' ? !nextKeep : op.action === 'keep'
        appliedKeepAction = true
        return
      }
      if (op.kind === 'autoLate') {
        nextAutoLate = op.threshold
        appliedAutoLate = true
        return
      }
      if (op.kind === 'minRequiredRolls') {
        if (op.value == null) return
        nextMinRequiredRolls = clampAggregateRollValue(op.value)
        appliedMinRequired = true
        return
      }
      if (op.kind === 'lockedMinRequiredRolls') {
        if (op.value == null) return
        nextLockedMinRequiredRolls = clampAggregateRollValue(op.value)
        appliedLockedMin = true
        return
      }
      if (op.kind === 'minSubstats') {
        if (op.value == null) return
        nextMinCount = resolveMinCountOverride(recipe, op.value)
        appliedMinCount = true
        return
      }
      if (op.kind === 'flex') {
        nextFlex = op.value
        appliedFlex = true
        return
      }
      if (op.kind === 'substatMinAll') {
        substatMinAll = op.value
        appliedSubstatMin = true
        return
      }
      if (op.kind === 'substatMinVariant') {
        substatMinByVariant.set(op.variant, op.value)
        appliedSubstatMin = true
        return
      }
      if (op.kind === 'rollTarget') {
        rollTargetsByVariant.set(op.variant, { base: op.base, increments: op.increments })
        appliedRollTargets = true
        return
      }
      // List operations: last writer wins within the instruction set.
      if (op.kind === 'artifactTypes')    { nextArtifactTypesOp    = op; return }
      if (op.kind === 'substats')         { nextSubstatsOp         = op; return }
      if (op.kind === 'mainStats')        { nextMainStatsOp        = op; return }
      if (op.kind === 'artifactSets')     { nextArtifactSetsOp     = op; return }
      if (op.kind === 'artifactMetaSets') { nextArtifactMetaSetsOp = op; return }
    })
  }
  if (!hasInstruction) return recipe
  const storedRarityMode: 'auto' | 'code' = (recipe.rarityMode ?? 'code')
  const exportModeChanged = appliedMode && nextMode !== recipe.exportMode
  const rankChanged = appliedRank && nextRank !== recipe.rankCode
  const rarityModeChanged = appliedRarity && nextRarityMode !== storedRarityMode
  const rarityCodeChanged = appliedRarity && nextRarityMode === 'code' && nextRarityCode !== recipe.rarityCode
  const rarityChanged = rarityModeChanged || rarityCodeChanged
  const levelChanged = appliedLevel && (nextMinLevel !== recipe.minLevel || nextMaxLevel !== recipe.maxLevel)
  const keepChanged = appliedKeep && nextKeepMode !== (recipe.earlyKeepMode ?? 'early')
  // Keep/Sell flag flip — independent of keep-timing normalizers, which key on earlyKeepMode only.
  const keepActionChanged = appliedKeepAction && nextKeep !== (recipe.keep ?? true)
  const autoLateChanged = appliedAutoLate && nextAutoLate !== recipe.autoRaritySupplementsThreshold
  const minRequiredChanged = appliedMinRequired && nextMinRequiredRolls !== recipe.minRequiredRolls
  const lockedMinChanged = appliedLockedMin && nextLockedMinRequiredRolls !== recipe.lockedMinRequiredRolls
  const minCountChanged = appliedMinCount && nextMinCount !== recipe.minCount
  const flexChanged = appliedFlex && nextFlex !== recipe.autoSubstatFlex
  // Detect whether any list operation was applied.
  const artifactTypesChanged    = nextArtifactTypesOp    !== undefined
  const substatsChanged         = nextSubstatsOp         !== undefined
  const mainStatsChanged        = nextMainStatsOp        !== undefined
  const artifactSetsChanged     = nextArtifactSetsOp     !== undefined
  const artifactMetaSetsChanged = nextArtifactMetaSetsOp !== undefined
  if (!exportModeChanged
    && !rankChanged
    && !rarityChanged
    && !levelChanged
    && !keepChanged
    && !keepActionChanged
    && !autoLateChanged
    && !minRequiredChanged
    && !lockedMinChanged
    && !minCountChanged
    && !flexChanged
    && !appliedSubstatMin
    && !appliedRollTargets
    && !artifactTypesChanged
    && !substatsChanged
    && !mainStatsChanged
    && !artifactSetsChanged
    && !artifactMetaSetsChanged) {
    return recipe
  }
  let next = cloneBuilderRecipe(recipe)
  if (exportModeChanged) next.exportMode = nextMode
  if (appliedRank) next.rankCode = nextRank
  if (appliedRarity) {
    next.rarityMode = nextRarityMode
    if (nextRarityMode === 'code') {
      next.rarityCode = nextRarityCode
    }
  }
  if (appliedLevel) {
    next.minLevel = nextMinLevel!
    next.maxLevel = nextMaxLevel!
    next = normalizeLevelWindow(next)
  }
  if (appliedKeep) next.earlyKeepMode = nextKeepMode
  // Apply the Keep/Sell flip. No keep-timing normalizer depends on this boolean.
  if (appliedKeepAction) next.keep = nextKeep
  if (appliedAutoLate) next.autoRaritySupplementsThreshold = nextAutoLate!
  if (appliedMinRequired) {
    next.minRequiredRolls = clampAggregateRollValue(nextMinRequiredRolls ?? 0)
    next.autoMinRequiredRolls = false
  }
  if (appliedLockedMin) {
    next.lockedMinRequiredRolls = clampAggregateRollValue(nextLockedMinRequiredRolls ?? 0)
  }
  if (appliedMinCount) {
    next.minCount = nextMinCount
    next.autoMinCount = false
  }
  if (appliedFlex) next.autoSubstatFlex = nextFlex
  if (appliedSubstatMin) {
    next = applySubstatMinOverrides(next, substatMinAll, substatMinByVariant)
  }
  if (appliedRollTargets) {
    const nextTargets = { ...(next.substatRollTargetsV ?? {}) }
    for (const [variant, entry] of rollTargetsByVariant) {
      // Variant-aware ingress quantization — DSL-authored targets store the same
      // grid values as flyout/SFC-authored ones for the same variant.
      const norm = normalizeRollTargetEntry(entry, Number(variant))
      if (norm) nextTargets[variant as number] = norm
      else delete nextTargets[variant as number]
    }
    next.substatRollTargetsV = nextTargets
  }
  if (appliedRarity || appliedKeep || appliedAutoLate || appliedSubstatMin) {
    const fallback = pickAutoRaritySupplementsThreshold(next)
    next = normalizeKeepMode(next)
    next = normalizeAggregateRollTargets(next)
    next = normalizeAutoRaritySupplements(next, { defaultThreshold: fallback })
    next = normalizeAutoSubstatFlex(next)
  }
  if (appliedMinRequired || appliedLockedMin) {
    next = normalizeAggregateRollTargets(next)
  }
  if (appliedMinCount || appliedFlex) {
    next = normalizeAutoSubstatFlex(next)
  }
  // Apply list operations last so they do not interact with normalizers above.
  if (artifactTypesChanged) {
    const op = nextArtifactTypesOp!
    if (op.mode === 'replace') {
      next.artifactTypes = op.values
    } else {
      // Remove first, then append new entries that are not already present.
      const removeSet = new Set(op.remove)
      const base = (next.artifactTypes ?? []).filter((id) => !removeSet.has(id))
      const existing = new Set(base)
      next.artifactTypes = [...base, ...op.add.filter((id) => !existing.has(id))]
    }
    // Mirror the builder's cascade when slots change:
    // 1. Clear faction when the new slot set includes artifact (artifact + faction is invalid).
    next = normalizeSlotsOverrideFaction(next)
    // 2. Prune mainstats invalid for the new slot set.
    const newSlots = next.artifactTypes ?? []
    if (newSlots.length > 0 && (next.mainStatsV ?? []).length > 0) {
      next.mainStatsV = retainAllowedMainStats(next.mainStatsV ?? [], newSlots)
    }
    // 3. Prune substats conflicting with the updated slot+mainstat scope, then
    //    cascade-prune fixedSubstatsV, substatRollBoundsV, and minCount.
    if (newSlots.length > 0 && (next.substatsV ?? []).length > 0) {
      const prunedSubstats = retainAllowedSubstats(next.substatsV ?? [], (v) => v, {
        slots: newSlots,
        mainStats: next.mainStatsV,
      })
      if (prunedSubstats.length !== (next.substatsV ?? []).length) {
        Object.assign(next, { substatsV: prunedSubstats, ...pruneSubstatDependents(next, prunedSubstats) })
      }
    }
  }
  if (substatsChanged) {
    const op = nextSubstatsOp!
    if (op.mode === 'replace') {
      next.substatsV = op.variants
    } else {
      const removeSet = new Set(op.remove)
      const base = (next.substatsV ?? []).filter((v) => !removeSet.has(v))
      const existing = new Set(base)
      next.substatsV = [...base, ...op.add.filter((v) => !existing.has(v))]
    }
    // Cascade: fixedSubstatsV, substatRollBoundsV, and minCount depend on substatsV.
    Object.assign(next, pruneSubstatDependents(next, next.substatsV ?? []))
  }
  if (mainStatsChanged) {
    const op = nextMainStatsOp!
    if (op.mode === 'replace') {
      next.mainStatsV = op.variants
    } else {
      const removeSet = new Set(op.remove)
      const base = (next.mainStatsV ?? []).filter((v) => !removeSet.has(v))
      const existing = new Set(base)
      next.mainStatsV = [...base, ...op.add.filter((v) => !existing.has(v))]
    }
  }
  if (artifactSetsChanged) {
    const op = nextArtifactSetsOp!
    if (op.mode === 'replace') {
      // No-prefix tokens → plain includes only (no excluded flag in replace mode).
      next.artifactSets = op.ids.map((id) => ({ id }))
    } else {
      // Build a map keyed by set ID so add entries can overwrite excluded flags.
      const removeSet = new Set(op.remove)
      const entryMap = new Map((next.artifactSets ?? [])
        .filter((e) => !removeSet.has(e.id as ArtifactSetId))
        .map((e) => [e.id as ArtifactSetId, e] as [ArtifactSetId, ArtifactSetSelectionEntry]))
      for (const entry of op.add) entryMap.set(entry.id as ArtifactSetId, entry)
      next.artifactSets = [...entryMap.values()]
    }
  }
  if (artifactMetaSetsChanged) {
    const op = nextArtifactMetaSetsOp!
    if (op.mode === 'replace') {
      next.artifactMetaSets = op.names
    } else {
      const removeSet = new Set(op.remove)
      const base = (next.artifactMetaSets ?? []).filter((n) => !removeSet.has(n))
      const existing = new Set(base)
      next.artifactMetaSets = [...base, ...op.add.filter((n) => !existing.has(n))]
    }
  }
  return next
}

// Resolve a recipe with recipe overrides applied (exported for UI).
export const resolveRecipeOverridesEffectiveRecipe = (
  recipe: BuilderRecipe,
  instructions: RecipeOverridesInstructions,
): BuilderRecipe => (
  resolveRecipeOverridesEffectiveRecipeWithInstructions(recipe, instructions)
)

// Build a per-recipe export-mode snapshot for recipe overrides.
export const buildRecipeOverridesExportModeResolution = (
  recipes: readonly BuilderRecipe[],
  instructions: RecipeOverridesInstructions,
  targets?: SubstatTargetTable,
): RecipeOverridesExportModeResolution => {
  const modes: SellfileExportMode[] = []
  const overriddenIndices: number[] = []
  recipes.forEach((recipe, idx) => {
    const nextMode = resolveRecipeOverridesExportModeWithInstructions(recipe, instructions, targets)
    modes.push(nextMode)
    if (nextMode !== recipe.exportMode) {
      overriddenIndices.push(idx)
    }
  })
  return { instructions, modes, overriddenIndices }
}

// Apply recipe overrides by cloning only the recipes that change mode.
export const applyRecipeOverridesExportModeOverrides = (
  recipes: readonly BuilderRecipe[],
  modes: readonly SellfileExportMode[],
): BuilderRecipe[] => {
  let mutated = false
  const next = recipes.map((recipe, idx) => {
    const nextMode = modes[idx] ?? recipe.exportMode
    if (nextMode === recipe.exportMode) return recipe
    const clone = cloneBuilderRecipe(recipe)
    clone.exportMode = nextMode
    mutated = true
    return clone
  })
  return mutated ? next : recipes.slice()
}

// Apply recipe overrides across a recipe list.
export const applyRecipeOverrides = (
  recipes: readonly BuilderRecipe[],
  instructions: RecipeOverridesInstructions,
  targets?: SubstatTargetTable,
): BuilderRecipe[] => {
  let mutated = false
  const next = recipes.map((recipe) => {
    const resolved = resolveRecipeOverridesEffectiveRecipeWithInstructions(recipe, instructions, targets)
    if (resolved !== recipe) mutated = true
    return resolved
  })
  return mutated ? next : recipes.slice()
}

type RecipeOverridesSubstatTargetsResolution = {
  substatTargets: SubstatTargetTable
  overridesActive: boolean
}

type SubstatTargetStarKey = Exclude<keyof SubstatTargetTable, 'anyRankDefaultsTo'>

const starKeyForSubstatTargets = (star: Star): SubstatTargetStarKey => {
  switch (star) {
    case 1: return 'one'
    case 2: return 'two'
    case 3: return 'three'
    case 4: return 'four'
    case 5: return 'five'
    case 6: return 'six'
    default: return 'six'
  }
}

const instructionAppliesToAnyRecipe = (
  instruction: RecipeOverridesSelectorBlock,
  recipes: readonly BuilderRecipe[],
  targets?: SubstatTargetTable,
): boolean => {
  if (recipes.length === 0) return instruction.selector.kind === 'all'
  return recipes.some((recipe) => matchesSelector(instruction.selector, recipe, targets))
}

// Combined entry point: applies recipe overrides to both recipes and substat
// targets in one call.  Prefer this over calling applyRecipeOverrides +
// applyRecipeOverridesSubstatTargetsOverrides separately — the split API exists
// only for React memoization; non-React callers should use this to avoid
// accidentally forgetting the substat-targets half.
export const applyAllRecipeOverrides = (
  recipes: readonly BuilderRecipe[],
  substatTargets: SubstatTargetTable,
  instructions: RecipeOverridesInstructions,
): { recipes: BuilderRecipe[]; substatTargets: SubstatTargetTable; substatTargetsOverridesActive: boolean } => {
  const modifiedRecipes = applyRecipeOverrides(recipes, instructions, substatTargets)
  const { substatTargets: effectiveSubstatTargets, overridesActive } =
    applyRecipeOverridesSubstatTargetsOverrides(substatTargets, modifiedRecipes, instructions)
  return { recipes: modifiedRecipes, substatTargets: effectiveSubstatTargets, substatTargetsOverridesActive: overridesActive }
}

export const applyRecipeOverridesSubstatTargetsOverrides = (
  substatTargets: SubstatTargetTable,
  recipes: readonly BuilderRecipe[],
  instructions: RecipeOverridesInstructions,
): RecipeOverridesSubstatTargetsResolution => {
  let next = substatTargets
  let overridesActive = false
  for (const instruction of instructions) {
    if (!instructionAppliesToAnyRecipe(instruction, recipes, substatTargets)) continue
    for (const op of instruction.operations) {
      if (op.kind !== 'minimaAnyRank' && op.kind !== 'minimaTarget') continue
      overridesActive = true
      if (op.kind === 'minimaAnyRank') {
        if (next.anyRankDefaultsTo !== op.value) {
          if (next === substatTargets) next = cloneSubstatTargets(substatTargets)
          next.anyRankDefaultsTo = op.value
        }
        continue
      }
      const starKey = starKeyForSubstatTargets(op.star)
      const nextValue = clampMinimaValue(op.variant, op.value)
      const currentSlice = next[starKey] ?? {}
      const currentValue = currentSlice[op.variant]
      if (currentValue === nextValue) continue
      if (next === substatTargets) next = cloneSubstatTargets(substatTargets)
      next[starKey] = { ...(next[starKey] ?? {}), [op.variant]: nextValue }
    }
  }
  return { substatTargets: next, overridesActive }
}
