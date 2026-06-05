/**
 * noteRecipeOverrides.ts
 *
 * Parses in-note recipe overrides markers and resolves selector-based overrides
 * that drive recipe export-mode overrides.
 */
import type { BuilderRecipe, SellfileExportMode, Star, SubstatRollTargetEntry, SubstatTargetTable } from './hsfBuilder'
import type { SafeguardOverridesSelectorBlock, SafeguardOverridesInstruction } from './noteSafeguardOverrides'
// Runtime import for cross-domain parsing — safe for circular use since only called inside function bodies.
import { parseSafeguardSelectorBlock } from './noteSafeguardOverrides'
import { clampAggregateRollValue } from './aggregateRollState'
import { RARITY_AUTO_LABEL, SUBSTAT_TARGET_MAX_ROLLS } from './constants'
import { normalizeTagValue } from './tagHelpers'
import {
  type Token,
  type DiagnosticSpan,
  type NoteCountAstNode,
  type NoteQuestionGroupType,
  type ParsedOverridesOption,
  type ParsedOverridesQuestion,
  TokenCursor,
  NOTE_OVERRIDES_QUESTION_KEYWORDS,
  NOTE_OVERRIDES_FALLBACK_KEYWORDS,
  NOTE_OVERRIDES_GROUP_TYPE_MAP,
  NOTE_OVERRIDES_CONSTRAINT_KEYWORDS,
  NOTE_OVERRIDES_LOGIC_KEYWORDS,
  NOTE_OVERRIDES_MARKER_COLUMNS_KEY,
  NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT,
  stripCommentWrapper,
  collectSelectorTokensAndOpenBlock,
  parseOverridesMarkerBody,
  parseOverridesMarkerSpacerColumns,
  buildGlobalExplicitTokenMap,
  buildQuestionImplicitTokenMap,
  parseCountExpression,
} from './noteOverridesParser'
import { normalizeRollTargetEntry } from './hsfBuilder/targets'
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
  isLevelMilestone,
  variantFromLabel,
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
/** Enumerated string values for non-numeric fields (export=, keep=, flex=). */
export const NOTE_RECIPE_OVERRIDES_ENUM_VALS = [
  'active', 'disabled', 'toggle',  // export=
  'early', 'late',                  // keep=
  'true', 'false', 'on', 'off',     // flex=
] as const
/** Artifact slot names accepted by the DSL `slots=` assignment field (SSOT from ArtifactType). */
export const NOTE_RECIPE_OVERRIDES_SLOT_NAMES = Object.keys(ArtifactType) as readonly string[]
/** Built-in selector and tag-match keywords. */
export const NOTE_RECIPE_OVERRIDES_SELECTOR_BUILTINS = [
  'all', 'tagged', 'untagged', 'any', 'none',
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
  'lvl', 'keep', 'autolate', 'rolltarget',
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
  groupType: NoteQuestionGroupType
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
  // columns ≥ 1 enables horizontal (grid) option layout; 0 = vertical.
  layoutColumns: number
  groups: NoteQuestionGroup[]
  options: NoteQuestionOption[]
  fallback: NoteQuestionFallback | null
  defaultAnswer: string[]
  answer: string[]
  // True for body-less spacer markers; card is invisible, width only.
  isSpacer?: true
}

// Autosave key for storing recipe overrides answers (session-only).
export const NOTE_RECIPE_OVERRIDES_ANSWERS_KEY = 'NoteRecipeOverridesAnswers'
// Autosave key for disabling dynamic overrides (recipe + safeguard) parsing (session-only).
// Value kept as-is for backward-compatible autosave restore.
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

// Selector blocks applied in source order.
export type RecipeOverridesInstructions = RecipeOverridesSelectorBlock[]

export type RecipeOverridesResolution = {
  questions: NoteQuestionDefinition[]
  instructions: RecipeOverridesInstructions
  // Cross-domain: safeguard instructions emitted by recipe-overrides questions.
  safeguardInstructions: SafeguardOverridesInstruction[]
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

const parseBooleanValue = (value: string): boolean | null => {
  const cleaned = value.trim().toLowerCase()
  if (cleaned === 'true' || cleaned === 'on') return true
  if (cleaned === 'false' || cleaned === 'off') return false
  return null
}

const parseIntegerValue = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const clampMinSubstats = (value: number): 0 | 1 | 2 | 3 | 4 => {
  if (value <= 0) return 0
  if (value >= 4) return 4
  return value as 0 | 1 | 2 | 3 | 4
}

const clampSubstatMin = (value: number): 0 | 1 | 2 | 3 | 4 | 5 => (
  clampAggregateRollValue(value)
)

const clampMinimaValue = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.round(value))
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
    return Math.min(4, Math.max(0, positiveCount))
  }
  const clamped = clampMinSubstats(Number(recipe.minCount ?? 0))
  return Math.min(4, Math.max(clamped, locked))
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
  const capped = Math.min(withLocked, Math.min(4, selected))
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

// Case-insensitive lookup: artifact set display name → numeric ArtifactSetId.
// Derived from artifactSetNames so additions in types.ts are reflected automatically.
const ARTIFACT_SET_NAME_MAP = new Map<string, number>(
  Object.entries(artifactSetNames).map(([id, name]) => [name.toLowerCase(), Number(id)]),
)

// Prefix categories for list-mutation fields.
type ListTokenPrefix = 'none' | 'add' | 'remove' | 'addExcluded'
type PrefixedToken = { prefix: ListTokenPrefix; value: string }

// Parse a raw token string into a prefix category and the bare name.
// `+-` is only meaningful for gearsets (add as excluded entry); for other
// fields it is treated the same as `+` (caller decides).
function parsePrefixedToken(raw: string): PrefixedToken {
  const t = raw.trim()
  if (t.startsWith('+-')) return { prefix: 'addExcluded', value: t.slice(2).trim() }
  if (t.startsWith('+'))  return { prefix: 'add',         value: t.slice(1).trim() }
  if (t.startsWith('-'))  return { prefix: 'remove',      value: t.slice(1).trim() }
  return { prefix: 'none', value: t }
}

// Returns 'replace' if all tokens have no prefix, 'mutate' if all are prefixed,
// or 'ignore' if the prefixes are mixed (no-prefix alongside prefixed).
function classifyListMode(tokens: PrefixedToken[]): 'replace' | 'mutate' | 'ignore' {
  const hasNone     = tokens.some((t) => t.prefix === 'none')
  const hasPrefixed = tokens.some((t) => t.prefix !== 'none')
  if (hasNone && hasPrefixed) return 'ignore'
  return hasNone ? 'replace' : 'mutate'
}

// After the first value token of a list field has been consumed, collect any
// remaining comma-separated word/string tokens that continue the list.
// Handles the `+` symbol prefix so that `+Speed` and `+-Daze` are accepted
// as comma-separated entries (e.g. `gearsets=-Lifesteal,+-Daze,+Speed`).
const consumeCommaSeparatedRemainder = (cursor: TokenCursor): string[] => {
  const extras: string[] = []
  while (cursor.consumeSymbol(',')) {
    // `+` is tokenized as a symbol; peek past it when followed by a word.
    let prefix = ''
    let next = cursor.peek()
    if (next?.kind === 'symbol' && next.value === '+') {
      const wordTok = cursor.peek(1)
      if (wordTok?.kind === 'word' || wordTok?.kind === 'string') {
        cursor.next()   // consume `+`
        prefix = '+'
        next = wordTok
      }
    }
    if (!next || (next.kind !== 'word' && next.kind !== 'string')) break
    cursor.next()
    extras.push(prefix + next.value)
  }
  return extras
}

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
      const parsed = parseBooleanValue(valueToken.value)
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
      const variant = variantFromLabel(keyword.slice('substatmin.'.length))
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
      const numeric = parseIntegerValue(valToken.value)
      if (numeric == null) return null
      if (parsed.kind === 'any') return { kind: 'minimaAny', op, value: numeric }
      const variant = variantFromLabel(parsed.statKey)
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
      if (mode === 'active' || mode === 'disabled' || mode === 'toggle') {
        operations.push({ kind: 'exportMode', action: mode as 'active' | 'disabled' | 'toggle' })
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
      if (mode !== 'early' && mode !== 'late') continue
      operations.push({ kind: 'keep', mode: mode as 'early' | 'late' })
      continue
    }
    if (field === 'autolate') {
      if (op !== 'eq') continue
      const raw = valueRaw.trim().toLowerCase()
      if (raw !== 'uncommon' && raw !== 'rare' && raw !== 'epic') continue
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
      const parsed = parseBooleanValue(valueRaw)
      if (parsed == null) continue
      operations.push({ kind: 'flex', value: parsed })
      continue
    }
    const minimaField = parseMinimaField(field)
    if (minimaField) {
      if (op !== 'eq') continue
      const numeric = parseIntegerValue(valueRaw)
      if (numeric == null) continue
      if (minimaField.kind === 'any') {
        const star = MINIMA_STAR_LOOKUP[String(numeric)]
        if (!star) continue
        operations.push({ kind: 'minimaAnyRank', value: star })
      } else {
        const variant = variantFromLabel(minimaField.statKey)
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
      const variant = variantFromLabel(statKey)
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
      const variant = variantFromLabel(rtStatKey)
      if (variant == null) continue
      // First value is the Base (0-roll) threshold.
      const base = parseIntegerValue(valueRaw)
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
          increments.push(parseIntegerValue(next.value))
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
      const resolve = (name: string): StatVariant | undefined => variantFromLabel(name) ?? undefined
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
      const resolve = (name: string): StatVariant | undefined => variantFromLabel(name) ?? undefined
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
        ARTIFACT_SET_NAME_MAP.get(name.toLowerCase()) as ArtifactSetId | undefined
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
const parseQuestionMarker = (inner: string): ParsedQuestionDefinition | null => (
  parseOverridesMarkerBody<RecipeOverridesSelector, RecipeOverridesOperation>(
    inner,
    NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS,
    parseSelectorBlock,
    (cursor) => parseSafeguardSelectorBlock(cursor),
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
): NoteQuestionDefinition => {
  const { question, index } = entry
  // Build the implicit numeric token map for this question.
  const implicitTokenMap = buildQuestionImplicitTokenMap(question.options)
  // Resolve the options with globally-scoped exclusions.
  const options = question.options.map((option) => {
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
    return {
      id: option.id,
      label: option.label,
      detail: option.detail,
      blocks: option.blocks,
      safeguardBlocks: option.crossBlocks as SafeguardOverridesSelectorBlock[],
      elseBlocks: option.fallbackBlocks,
      safeguardElseBlocks: option.crossFallbackBlocks as SafeguardOverridesSelectorBlock[],
      isDefault: option.isDefault,
      token,
      setOptionIds,
      unsetOptionIds,
      excludedOptionIds,
      groupType: option.groupType,
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
    prompt: question.prompt,
    layoutColumns: question.layoutColumns,
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
): string[] => {
  let current = normalizeSelectionOrder(selection, options)
  // Cap iterations so malformed cycles cannot stall parsing.
  const maxPasses = Math.max(8, options.length + groups.length + 2)
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const withDirectives = applyQuestionDirectives(current, options, preferredId, removedId)
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
): NoteQuestionDefinition[] => {
  // Flatten option/group ordering so conflicts resolve deterministically.
  const allOptions = questions.flatMap((question) => question.options)
  const allGroups = questions.flatMap((question) => question.groups)
  // Collect the currently selected option IDs.
  const selected = questions.flatMap((question) => question.answer)
  // Resolve directives/exclusions/fallbacks using global option ordering.
  const resolved = resolveSelectionWithOptionRules(selected, allGroups, allOptions, preferredId, removedId)
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
    const parsed = parseQuestionMarker(inner)
    if (!parsed) {
      // No question body — check for a spacer marker (bare marker with optional [columns=N]).
      const spacerColumns = parseOverridesMarkerSpacerColumns(inner, NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS)
      if (spacerColumns !== null) {
        spacerQuestions.push({
          id: `spacer-recipe-${markerIndex}`,
          index: markerIndex,
          prompt: '',
          layoutColumns: spacerColumns,
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
    buildResolvedQuestion(entry, answers, globalExplicitTokenMap, onlyExclusionsById)
  ))
  // Merge spacers into the resolved list in note order and apply global exclusions.
  return applyGlobalOptionExclusions(
    [...resolved, ...spacerQuestions].sort((a, b) => a.index - b.index),
    preferredId,
    removedId,
  )
}

// Build a stable signature for the recipe overrides section of a note.
export const buildNoteRecipeOverridesSignature = (note: string): string => {
  // Parse the questions using the same parser as the UI.
  const questions = parseNoteRecipeOverrides(note)
  // Preserve marker order plus layout metadata so formatting changes still register.
  const signature = questions.map((question) => [question.id, question.layoutColumns])
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
): RecipeOverridesResolution => {
  const questions = parseNoteRecipeOverrides(note, answers, preferredId, removedId)
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
      const norm = normalizeRollTargetEntry(entry)
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
    // 1. Clear faction when the new slot set includes armor (armor + faction is invalid).
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
      const nextValue = clampMinimaValue(op.value)
      const currentSlice = next[starKey] ?? {}
      const currentValue = currentSlice[op.variant]
      if (currentValue === nextValue) continue
      if (next === substatTargets) next = cloneSubstatTargets(substatTargets)
      next[starKey] = { ...(next[starKey] ?? {}), [op.variant]: nextValue }
    }
  }
  return { substatTargets: next, overridesActive }
}
