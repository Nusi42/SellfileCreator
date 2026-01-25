/**
 * noteConfigOptions.ts
 *
 * Parses in-note config options markers and resolves selector-based overrides
 * that drive config export-mode overrides.
 */
import type { BuilderConfig, SellfileExportMode, Star, SubstatTargetTable } from './hsfBuilder'
import { clampAggregateRollValue } from './aggregateRollState'
import { RARITY_AUTO_LABEL } from './constants'
import { TAG_TOKEN_REGEX, normalizeTagValue } from './tagHelpers'
import { cloneBuilderConfig } from './multiEditDraft'
import {
  type LevelMilestone,
  type RankCode,
  RankCode as RankCodeEnum,
  type RarityCode,
  RarityCode as RarityCodeEnum,
  type StatVariant,
  isLevelMilestone,
  variantFromLabel,
} from './types'
import {
  normalizeAggregateRollTargets,
  normalizeAutoRaritySupplements,
  normalizeAutoSubstatFlex,
  normalizeKeepMode,
  normalizeLevelWindow,
  type AutoRaritySupplementsThreshold,
} from './configNormalization'
import { pickAutoRaritySupplementsThreshold } from './raritySupplements'

// Supported group types in the note markers.
export type NoteQuestionGroupType = 'single' | 'multi'

// Default layout for question cards when no marker option is supplied.
export const NOTE_CONFIG_OPTIONS_LAYOUT_DEFAULT = 'default' as const
// Marker option that expands a question card to span the full line.
export const NOTE_CONFIG_OPTIONS_LAYOUT_WHOLELINE = 'wholeline' as const
// Supported layout tokens parsed from config-options marker options.
export const NOTE_CONFIG_OPTIONS_MARKER_LAYOUT_OPTIONS = [NOTE_CONFIG_OPTIONS_LAYOUT_WHOLELINE] as const
// Marker option key used to override the answer grid column count.
export const NOTE_CONFIG_OPTIONS_MARKER_COLUMNS_KEY = 'columns' as const
// Default column count for wholeline option grids (0 = auto-fit).
export const NOTE_CONFIG_OPTIONS_LAYOUT_COLUMNS_DEFAULT = 0
// Layout choices exposed on parsed question definitions.
export type NoteQuestionLayout =
  | typeof NOTE_CONFIG_OPTIONS_LAYOUT_DEFAULT
  | (typeof NOTE_CONFIG_OPTIONS_MARKER_LAYOUT_OPTIONS)[number]

export type ConfigOptionsSelector =
  | { kind: 'all' }
  | { kind: 'tagged' }
  | { kind: 'untagged' }
  | { kind: 'tag'; mode: 'eq' | 'in' | 'any' | 'none'; values?: string[] }
  | { kind: 'rank'; op: TagOverrideOp; value: RankCode }
  | { kind: 'rarity'; op: TagOverrideOp; mode: 'auto' | 'code'; code?: RarityCode }
  | { kind: 'minRolls'; op: TagOverrideOp; value: number }
  | { kind: 'minSubstats'; op: TagOverrideOp; value: number }
  | { kind: 'flex'; value: boolean }
  | { kind: 'and'; left: ConfigOptionsSelector; right: ConfigOptionsSelector }
  | { kind: 'or'; left: ConfigOptionsSelector; right: ConfigOptionsSelector }

export type ConfigOptionsOperation =
  | { kind: 'exportMode'; action: 'active' | 'disabled' | 'toggle' }
  | { kind: 'rank'; value: RankCode }
  | { kind: 'rarity'; mode: 'auto' | 'code'; code?: RarityCode }
  | { kind: 'level'; min: LevelMilestone; max: LevelMilestone }
  | { kind: 'keep'; mode: 'early' | 'late' }
  | { kind: 'autoLate'; threshold: AutoRaritySupplementsThreshold }
  | { kind: 'minRequiredRolls'; value: number }
  | { kind: 'lockedMinRequiredRolls'; value: number }
  | { kind: 'minSubstats'; value: number }
  | { kind: 'flex'; value: boolean }
  | { kind: 'substatMinAll'; value: number }
  | { kind: 'substatMinVariant'; variant: StatVariant; value: number }
  | { kind: 'minimaAnyRank'; value: Star }
  | { kind: 'minimaTarget'; star: Star; variant: StatVariant; value: number }

export type ConfigOptionsSelectorBlock = {
  selector: ConfigOptionsSelector
  operations: ConfigOptionsOperation[]
}

// A single answer option for a question.
export type NoteQuestionOption = {
  id: string
  label: string
  blocks: ConfigOptionsSelectorBlock[]
  isDefault: boolean
  token: string
  excludedOptionIds: string[]
  groupType: NoteQuestionGroupType
}

// Selector blocks that apply when no options are selected.
export type NoteQuestionFallback = {
  blocks: ConfigOptionsSelectorBlock[]
}

// Selector blocks that apply when a group has no selections.
export type NoteQuestionGroupFallback = {
  blocks: ConfigOptionsSelectorBlock[]
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
  layout: NoteQuestionLayout
  // Column override for wholeline option grids (0 = auto-fit).
  layoutColumns: number
  groups: NoteQuestionGroup[]
  options: NoteQuestionOption[]
  fallback: NoteQuestionFallback | null
  defaultAnswer: string[]
  answer: string[]
}

// Autosave key for storing config options answers (session-only).
export const NOTE_CONFIG_OPTIONS_ANSWERS_KEY = 'NoteConfigOptionsAnswers'
// Autosave key for disabling config options parsing (session-only).
export const NOTE_CONFIG_OPTIONS_DISABLED_KEY = 'NoteConfigOptionsDisabled'
// Legacy autosave key used by older versions (kept for migrations).
export const LEGACY_NOTE_CONFIG_OPTIONS_ANSWERS_KEY = `Note${'Question'}${'naire'}Answers`

// Stored answers keyed by question ID.
export type NoteConfigOptionsAnswers = Record<string, string[]>

// Selector blocks applied in source order.
export type ConfigOptionsInstructions = ConfigOptionsSelectorBlock[]

export type ConfigOptionsResolution = {
  questions: NoteQuestionDefinition[]
  instructions: ConfigOptionsInstructions
}

// Config impact summary for Apply Tags flow.
export type ConfigOptionsExportModeResolution = {
  instructions: ConfigOptionsInstructions
  modes: SellfileExportMode[]
  overriddenIndices: number[]
}

// Match config-options markers in note comments.
const QUESTION_MARKER_REGEX = /<!--\s*config-options\b[\s\S]*?-->/gi

// Token grammar matches config tag tokens so ids/exclusions stay aligned.
const QUESTION_TOKEN_REGEX = TAG_TOKEN_REGEX
// Leading asterisk marks default answers.
const QUESTION_OPTION_DEFAULT_MARKER = '*'
// Known layout tokens extracted from marker options.
const QUESTION_LAYOUT_TOKEN_SET = new Set<string>(NOTE_CONFIG_OPTIONS_MARKER_LAYOUT_OPTIONS)

type TokenKind = 'word' | 'string' | 'symbol'

type Token = {
  kind: TokenKind
  value: string
  index: number
}

// Extract the inner text from an HTML comment.
const stripCommentWrapper = (raw: string): string => (
  raw.trim().replace(/^<!--\s*/, '').replace(/\s*-->$/, '')
)

// Collapse whitespace to keep IDs stable across formatting tweaks.
const normalizeQuestionText = (value: string): string => (
  value.trim().replace(/\s+/g, ' ')
)

// Lightweight hash to keep question IDs short but stable.
const hashString = (value: string): string => {
  // DJB2 hash to keep the output deterministic.
  let hash = 5381
  for (let idx = 0; idx < value.length; idx += 1) {
    // Mix the next character in the buffer.
    hash = ((hash << 5) + hash) + value.charCodeAt(idx)
    // Force 32-bit integer math for consistency.
    hash |= 0
  }
  // Return a base36 token to keep the ID readable.
  return Math.abs(hash).toString(36)
}

// Normalize tag-style tokens for id/exclusion usage.
const normalizeQuestionToken = (raw: string): string | null => {
  // Trim whitespace before validation.
  const trimmed = raw.trim()
  // Ignore empty tokens.
  if (!trimmed) return null
  // Accept numeric tokens for implicit indices regardless of tag grammar.
  if (/^\d+$/.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10)
    return Number.isFinite(value) ? String(value) : null
  }
  // Reject tokens containing disallowed characters.
  if (!QUESTION_TOKEN_REGEX.test(trimmed)) return null
  // Normalize case to keep matching stable.
  return trimmed.toLowerCase()
}

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

const resolveSelectedSubstatCount = (cfg: Pick<BuilderConfig, 'substatsV'>): number => (
  Array.isArray(cfg.substatsV) ? cfg.substatsV.length : 0
)

const resolveLockedSubstatCount = (cfg: Pick<BuilderConfig, 'fixedSubstatsV'>): number => (
  Array.isArray(cfg.fixedSubstatsV) ? cfg.fixedSubstatsV.length : 0
)

const resolveEffectiveMinCount = (cfg: Pick<BuilderConfig, 'autoMinCount' | 'minCount' | 'substatsV' | 'fixedSubstatsV'>): number => {
  const selected = resolveSelectedSubstatCount(cfg)
  const locked = resolveLockedSubstatCount(cfg)
  if (cfg.autoMinCount) {
    return Math.min(4, Math.max(0, selected))
  }
  const clamped = clampMinSubstats(Number(cfg.minCount ?? 0))
  return Math.min(4, Math.max(clamped, locked))
}

const resolveMinCountOverride = (
  cfg: Pick<BuilderConfig, 'substatsV' | 'fixedSubstatsV'>,
  value: number,
): 0 | 1 | 2 | 3 | 4 => {
  const selected = resolveSelectedSubstatCount(cfg)
  const locked = resolveLockedSubstatCount(cfg)
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

// Tokenize config options blocks for the parser.
const tokenizeConfigOptions = (input: string): Token[] => {
  const tokens: Token[] = []
  let idx = 0
  while (idx < input.length) {
    const ch = input.charAt(idx)
    // Skip whitespace.
    if (/\s/.test(ch)) {
      idx += 1
      continue
    }
    // Parse quoted strings.
    if (ch === '"') {
      let cursor = idx + 1
      let value = ''
      let closed = false
      while (cursor < input.length) {
        const next = input.charAt(cursor)
        if (next === '"') {
          closed = true
          tokens.push({ kind: 'string', value, index: idx })
          idx = cursor + 1
          value = ''
          break
        }
        // Support escaped newlines/tabs so prompt text stays readable.
        if (next === '\\\\') {
          const esc = input.charAt(cursor + 1)
          if (esc === 'n') value += '\n'
          else if (esc === 't') value += '\t'
          else if (esc === 'r') value += '\r'
          else if (esc) value += esc
          cursor += 2
          continue
        }
        // Accumulate raw characters until we hit the closing quote.
        value += next
        cursor += 1
      }
      // Guard against unterminated strings: consume the rest so we never loop forever.
      if (!closed) {
        tokens.push({ kind: 'string', value, index: idx })
        idx = input.length
      }
      continue
    }
    // Parse multi-character operators.
    const nextTwo = input.slice(idx, idx + 2)
    if (nextTwo === '>=' || nextTwo === '<=' || nextTwo === '&&' || nextTwo === '||') {
      tokens.push({ kind: 'symbol', value: nextTwo, index: idx })
      idx += 2
      continue
    }
    // Parse single-character symbols.
    if ('{}[](),*+@=<>!:'.includes(ch)) {
      tokens.push({ kind: 'symbol', value: ch, index: idx })
      idx += 1
      continue
    }
    // Parse word tokens up to the next separator.
    let end = idx + 1
    while (end < input.length) {
      const next = input.charAt(end)
      if (/\s/.test(next)) break
      if ('{}[](),*@=<>!:'.includes(next)) break
      if (next === '&' || next === '|') break
      end += 1
    }
    const value = input.slice(idx, end)
    tokens.push({ kind: 'word', value, index: idx })
    idx = end
  }
  return tokens
}

class TokenCursor {
  private index = 0
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token | null {
    return this.tokens[this.index + offset] ?? null
  }

  next(): Token | null {
    const token = this.tokens[this.index]
    this.index += 1
    return token ?? null
  }

  consumeSymbol(value: string): boolean {
    const token = this.peek()
    if (!token || token.kind !== 'symbol' || token.value !== value) return false
    this.index += 1
    return true
  }

  consumeWord(...values: string[]): Token | null {
    const token = this.peek()
    if (!token || token.kind !== 'word') return null
    const match = values.some((entry) => entry.toLowerCase() === token.value.toLowerCase())
    if (!match) return null
    this.index += 1
    return token
  }

  consumeString(): Token | null {
    const token = this.peek()
    if (!token || token.kind !== 'string') return null
    this.index += 1
    return token
  }

  consumeWordValue(): string | null {
    const token = this.peek()
    if (!token || token.kind !== 'word') return null
    this.index += 1
    return token.value
  }
}

const isQuestionKeyword = (token: Token | null): boolean => (
  Boolean(token && token.kind === 'word' && ['q', 'question'].includes(token.value.toLowerCase()))
)

const isFallbackKeyword = (token: Token | null): boolean => (
  Boolean(token && token.kind === 'word' && ['fallback', 'else'].includes(token.value.toLowerCase()))
)

const parseGroupType = (raw: string): NoteQuestionGroupType | null => {
  const value = raw.toLowerCase()
  if (['single', 's', 'rb', 'radiobutton', 'radio'].includes(value)) return 'single'
  if (['multi', 'm', 'cb', 'checkbox', 'check'].includes(value)) return 'multi'
  return null
}

const normalizeQuestionLayoutToken = (raw: string): NoteQuestionLayout | null => {
  // Normalize casing + spacing so marker options stay forgiving.
  const trimmed = raw.trim().toLowerCase()
  // Accept only the known marker layout tokens for now.
  if (!QUESTION_LAYOUT_TOKEN_SET.has(trimmed)) return null
  return trimmed as NoteQuestionLayout
}

const normalizeQuestionColumnsValue = (raw: string): number | null => {
  // Parse an integer so marker options accept numeric literals.
  const parsed = parseIntegerValue(raw)
  // Reject non-numeric values so defaults remain stable.
  if (parsed == null) return null
  // Columns must be zero or positive to be meaningful.
  if (parsed < 0) return null
  return parsed
}

const parseQuestionMarkerOptions = (
  cursor: TokenCursor,
): { layout: NoteQuestionLayout; columns: number } => {
  const token = cursor.peek()
  // Default to the standard layout unless a marker option list appears.
  if (!token || token.kind !== 'symbol' || token.value !== '[') {
    return {
      layout: NOTE_CONFIG_OPTIONS_LAYOUT_DEFAULT,
      columns: NOTE_CONFIG_OPTIONS_LAYOUT_COLUMNS_DEFAULT,
    }
  }
  // Consume the opening bracket before reading option tokens.
  cursor.next()
  let layout: NoteQuestionLayout = NOTE_CONFIG_OPTIONS_LAYOUT_DEFAULT
  let columns = NOTE_CONFIG_OPTIONS_LAYOUT_COLUMNS_DEFAULT
  while (true) {
    const next = cursor.peek()
    // Stop if we hit the end of the token stream.
    if (!next) break
    // Close the marker options when the bracket ends.
    if (next.kind === 'symbol' && next.value === ']') {
      cursor.next()
      break
    }
    // Abort option parsing when the question keyword appears early.
    if (isQuestionKeyword(next)) break
    // Skip commas between option tokens.
    if (next.kind === 'symbol' && next.value === ',') {
      cursor.next()
      continue
    }
    if (next.kind === 'word') {
      const word = next.value
      const normalizedLayout = normalizeQuestionLayoutToken(word)
      // Apply known layout tokens while ignoring unknowns.
      if (normalizedLayout) {
        layout = normalizedLayout
        cursor.next()
        continue
      }
      // Parse column overrides when the marker option key is present.
      if (word.toLowerCase() === NOTE_CONFIG_OPTIONS_MARKER_COLUMNS_KEY) {
        cursor.next()
        // Require an equals sign before the numeric value.
        if (!cursor.consumeSymbol('=')) continue
        const valueToken = cursor.peek()
        // Only parse word/string tokens so malformed values do not crash parsing.
        if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
        cursor.next()
        const parsedColumns = normalizeQuestionColumnsValue(valueToken.value)
        // Apply the override only when the value is valid.
        if (parsedColumns != null) columns = parsedColumns
        continue
      }
      // Skip unknown marker words so the parser keeps moving.
      cursor.next()
      continue
    }
    // Consume unknown tokens to avoid infinite loops.
    cursor.next()
  }
  return { layout, columns }
}

const parseSelectorTokens = (tokens: Token[]): ConfigOptionsSelector | null => {
  const cursor = new TokenCursor(tokens)
  const parseTerm = (): ConfigOptionsSelector | null => {
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
    if (keyword === 'rank' || keyword === 'rarity' || keyword === 'minrolls' || keyword === 'minsubstats') {
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
    return null
  }

  const parseAnd = (): ConfigOptionsSelector | null => {
    let left = parseTerm()
    if (!left) return null
    while (true) {
      const token = cursor.peek()
      if (!token) break
      const word = token.kind === 'word' ? token.value.toLowerCase() : token.value
      if (word !== 'and' && word !== '&&') break
      cursor.next()
      const right = parseTerm()
      if (!right) return null
      left = { kind: 'and', left, right }
    }
    return left
  }

  const parseOr = (): ConfigOptionsSelector | null => {
    let left = parseAnd()
    if (!left) return null
    while (true) {
      const token = cursor.peek()
      if (!token) break
      const word = token.kind === 'word' ? token.value.toLowerCase() : token.value
      if (word !== 'or' && word !== '||') break
      cursor.next()
      const right = parseAnd()
      if (!right) return null
      left = { kind: 'or', left, right }
    }
    return left
  }

  const parsed = parseOr()
  if (!parsed) return null
  return parsed
}

const parseOperations = (cursor: TokenCursor, endSymbol: string): ConfigOptionsOperation[] => {
  const operations: ConfigOptionsOperation[] = []
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
      cursor.next()
      continue
    }
    // Fields lead assignments in the stable syntax.
    const field = token.value.toLowerCase()
    cursor.next()
    const opToken = cursor.peek()
    // Require a comparison operator after the field.
    if (!opToken || opToken.kind !== 'symbol') {
      cursor.next()
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
    const valueToken = cursor.peek()
    // Values must be a token or quoted string.
    if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) {
      if (valueToken) cursor.next()
      continue
    }
    cursor.next()
    const valueRaw = valueToken.value
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
        const operation: ConfigOptionsOperation = parsed.code != null
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
    }
  }
  return operations
}

type ParsedQuestionOption = {
  id: string
  legacyId: string
  label: string
  blocks: ConfigOptionsSelectorBlock[]
  fallbackBlocks: ConfigOptionsSelectorBlock[]
  isDefault: boolean
  explicitToken: string | null
  implicitToken: string | null
  excludedTokens: string[]
  onlyTokens: string[]
  groupType: NoteQuestionGroupType
}

// Parsed question content before tokens/exclusions are resolved globally.
type ParsedQuestionDefinition = {
  prompt: string
  layout: NoteQuestionLayout
  // Parsed column override for wholeline option grids (0 = auto-fit).
  layoutColumns: number
  questionId: string
  options: ParsedQuestionOption[]
  fallback: NoteQuestionFallback | null
}

// Parse a single selector block after a leading "@".
function parseSelectorBlock(cursor: TokenCursor): ConfigOptionsSelectorBlock | null {
  // Collect selector tokens until the selector block opens.
  const selectorTokens: Token[] = []
  while (true) {
    const next = cursor.peek()
    // Bail out when the stream ends unexpectedly.
    if (!next) return null
    // Stop once the selector block opens.
    if (next.kind === 'symbol' && next.value === '{') break
    // Store selector tokens verbatim for later parsing.
    selectorTokens.push(next)
    // Consume the token to advance the cursor.
    cursor.next()
  }
  // Require the selector block to open before parsing operations.
  if (!cursor.consumeSymbol('{')) {
    // Guard: skip one token so we do not loop forever.
    if (cursor.peek()) cursor.next()
    return null
  }
  // Parse selector + operations for this block.
  const selector = parseSelectorTokens(selectorTokens)
  const operations = parseOperations(cursor, '}')
  // Require both selector and operations to be valid.
  if (!selector || operations.length === 0) return null
  // Emit the parsed selector block once validated.
  return { selector, operations }
}

type ParsedGroupBlocks = {
  blocks: ConfigOptionsSelectorBlock[]
  fallbackBlocks: ConfigOptionsSelectorBlock[]
}

// Parse a group's selector blocks plus optional group-level fallback blocks.
function parseGroupBlocks(cursor: TokenCursor): ParsedGroupBlocks {
  // Track selector blocks in source order.
  const blocks: ConfigOptionsSelectorBlock[] = []
  // Track group-level fallback blocks in source order.
  const fallbackBlocks: ConfigOptionsSelectorBlock[] = []
  while (true) {
    const token = cursor.peek()
    // Exit when the token stream ends unexpectedly.
    if (!token) break
    // Close the group when the brace ends.
    if (token.kind === 'symbol' && token.value === '}') {
      cursor.next()
      break
    }
    // Parse group-level fallback blocks when encountered.
    if (isFallbackKeyword(token)) {
      cursor.next()
      // Require an opening brace for fallback content.
      if (!cursor.consumeSymbol('{')) continue
      // Parse the selector blocks inside the fallback braces.
      const parsedBlocks = parseSelectorBlocks(cursor)
      // Append only non-empty fallback blocks.
      if (parsedBlocks.length > 0) fallbackBlocks.push(...parsedBlocks)
      continue
    }
    // Parse selector blocks that start with "@...".
    if (token.kind === 'symbol' && token.value === '@') {
      // Consume the "@", then parse the selector content.
      cursor.next()
      const block = parseSelectorBlock(cursor)
      // Keep only valid selector blocks.
      if (block) blocks.push(block)
      continue
    }
    // Skip unknown tokens to keep the cursor moving.
    cursor.next()
  }
  return { blocks, fallbackBlocks }
}

const parseSelectorBlocks = (cursor: TokenCursor): ConfigOptionsSelectorBlock[] => {
  const blocks: ConfigOptionsSelectorBlock[] = []
  while (true) {
    const token = cursor.peek()
    // Exit when the token stream ends unexpectedly.
    if (!token) break
    if (token.kind === 'symbol' && token.value === '}') {
      cursor.next()
      break
    }
    // Skip non-selector tokens so malformed blocks do not stall.
    if (!cursor.consumeSymbol('@')) {
      cursor.next()
      continue
    }
    // Parse a single selector block into a structured instruction.
    const block = parseSelectorBlock(cursor)
    // Keep only valid selector blocks with operations.
    if (block) blocks.push(block)
  }
  return blocks
}

// Parse a single option block into label + selector blocks.
const parseOptionBlock = (
  cursor: TokenCursor,
  optionIndex: number,
  groupType: NoteQuestionGroupType,
): ParsedQuestionOption | null => {
  const labelToken = cursor.consumeString()
  if (!labelToken) return null
  const label = labelToken.value
  let isDefault = false
  let explicitToken: string | null = null
  const excludedTokens: string[] = []
  const onlyTokens: string[] = []
  // Track header parsing order so constraints stay before the selector block.
  let headerPhase: 'id' | 'default' | 'constraints' = 'id'
  while (true) {
    const token = cursor.peek()
    if (!token) return null
    // A selector block always starts with the opening brace.
    if (token.kind === 'symbol' && token.value === '{') {
      cursor.next()
      break
    }
    // Default markers are only valid before constraints.
    if (headerPhase !== 'constraints') {
      // "*" toggles the default option for this group.
      if (token.kind === 'symbol' && token.value === QUESTION_OPTION_DEFAULT_MARKER) {
        isDefault = true
        headerPhase = 'default'
        cursor.next()
        continue
      }
      // "default" is a word alias for the same intent.
      if (token.kind === 'word' && token.value.toLowerCase() === 'default') {
        isDefault = true
        headerPhase = 'default'
        cursor.next()
        continue
      }
    }
    // IDs must appear before defaults/constraints.
    if (headerPhase === 'id' && token.kind === 'word' && token.value.toLowerCase() === 'id') {
      cursor.next()
      // Require an explicit token for stable option references.
      if (!cursor.consumeSymbol('=')) continue
      const valueToken = cursor.peek()
      if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
      cursor.next()
      const candidate = normalizeQuestionToken(valueToken.value)
      if (!candidate) continue
      explicitToken = candidate
      continue
    }
    // Constraints must live in the header, after default markers.
    if (token.kind === 'symbol' && token.value === '!') {
      headerPhase = 'constraints'
      cursor.next()
      // "!" excludes listed tokens from being selected together.
      readTokenList(cursor, excludedTokens)
      continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === 'excl') {
      headerPhase = 'constraints'
      cursor.next()
      // "excl" is an exclusion alias for option tokens.
      readTokenList(cursor, excludedTokens)
      continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === 'only') {
      headerPhase = 'constraints'
      cursor.next()
      // "only" defines an allow-list for mutual exclusions.
      readTokenList(cursor, onlyTokens)
      continue
    }
    if (token.kind === 'symbol' && token.value === '+') {
      headerPhase = 'constraints'
      cursor.next()
      // "+" is an alias for "only" in constraint headers.
      readTokenList(cursor, onlyTokens)
      continue
    }
    // Skip any other header tokens to avoid infinite loops.
    cursor.next()
  }
  // Parse the selector blocks and optional group fallback blocks.
  const { blocks, fallbackBlocks } = parseGroupBlocks(cursor)
  const baseLabel = normalizeQuestionText(label).toLowerCase()
  const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
  // Build the implicit token so numeric references stay stable.
  const implicitToken = normalizeQuestionToken(String(optionIndex + 1))
  return {
    id,
    legacyId: id,
    label,
    blocks,
    fallbackBlocks,
    isDefault,
    explicitToken,
    implicitToken,
    excludedTokens,
    onlyTokens,
    groupType,
  }
}

// Build a stable question id from prompt + option labels/group types.
const buildQuestionKey = (
  prompt: string,
  options: Array<{ label: string; groupType: NoteQuestionGroupType }>,
): string => {
  // Normalize text so spacing tweaks keep IDs stable.
  const key = {
    prompt: normalizeQuestionText(prompt),
    options: options.map((opt) => ({
      label: normalizeQuestionText(opt.label),
      group: opt.groupType,
    })),
  }
  // Hash the normalized payload to keep IDs compact.
  return `q_${hashString(JSON.stringify(key))}`
}

const readTokenList = (cursor: TokenCursor, sink: string[]): void => {
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === ',') {
      cursor.next()
      continue
    }
    if (token.kind === 'word' && (isQuestionKeyword(token) || isFallbackKeyword(token))) break
    if (token.kind === 'word' && parseGroupType(token.value)) break
    if (token.kind === 'symbol' && token.value === '{') break
    if (token.kind !== 'word' && token.kind !== 'string') break
    cursor.next()
    const normalized = normalizeQuestionToken(token.value)
    if (normalized) sink.push(normalized)
  }
}

const parseQuestionMarker = (inner: string): ParsedQuestionDefinition | null => {
  const tokens = tokenizeConfigOptions(inner)
  const cursor = new TokenCursor(tokens)
  if (!cursor.consumeWord('config-options')) return null
  // Capture marker-level layout hints before reading the question prompt.
  const markerOptions = parseQuestionMarkerOptions(cursor)
  const questionToken = cursor.consumeWord('q', 'question')
  if (!questionToken) return null
  const promptToken = cursor.consumeString()
  if (!promptToken) return null
  const prompt = promptToken.value
  const parsedOptions: ParsedQuestionOption[] = []
  let fallbackBlocks: ConfigOptionsSelectorBlock[] | null = null
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind !== 'word') {
      cursor.next()
      continue
    }
    if (isQuestionKeyword(token)) break
    if (isFallbackKeyword(token)) {
      cursor.next()
      if (!cursor.consumeSymbol('{')) continue
      const blocks = parseSelectorBlocks(cursor)
      fallbackBlocks = blocks.length > 0 ? blocks : null
      continue
    }
    const groupType = parseGroupType(token.value)
    if (!groupType) {
      cursor.next()
      continue
    }
    cursor.next()
    const parsed = parseOptionBlock(cursor, parsedOptions.length, groupType)
    if (!parsed) {
      // Guard: skip a token when the option block is malformed.
      if (cursor.peek()) cursor.next()
      continue
    }
    parsedOptions.push(parsed)
  }
  if (parsedOptions.length === 0) return null
  // Compute a stable question id before scoping option ids.
  const questionId = buildQuestionKey(
    prompt,
    parsedOptions.map((option) => ({ label: option.label, groupType: option.groupType })),
  )
  // Scope option ids to the question so cross-question exclusions stay unique.
  parsedOptions.forEach((option, index) => {
    // Normalize the label so ids remain predictable for answer restores.
    const baseLabel = normalizeQuestionText(option.label).toLowerCase()
    // Prefix the per-question token to prevent collisions across markers.
    option.id = baseLabel ? `${questionId}:${baseLabel}#${index}` : `${questionId}:option-${index}`
  })
  // Defer "only" handling until global token maps are available.
  // Return the parsed question for global token resolution later.
  return {
    prompt,
    layout: markerOptions.layout,
    layoutColumns: markerOptions.columns,
    questionId,
    options: parsedOptions,
    fallback: fallbackBlocks ? { blocks: fallbackBlocks } : null,
  }
}

// Parsed marker + index pairing so global IDs can resolve consistently.
type ParsedQuestionEntry = {
  index: number
  question: ParsedQuestionDefinition
}

// Build a global map of explicit tokens to option IDs (first mention wins).
const buildGlobalExplicitTokenMap = (entries: ParsedQuestionEntry[]): Map<string, string> => {
  // Preserve the first occurrence so duplicate IDs are deterministic.
  const tokenToId = new Map<string, string>()
  entries.forEach((entry) => {
    // Scan options in note order so resolution is stable.
    entry.question.options.forEach((option) => {
      const token = option.explicitToken
      // Ignore options without explicit IDs.
      if (!token) return
      // Keep the earliest option for each token.
      if (!tokenToId.has(token)) tokenToId.set(token, option.id)
    })
  })
  return tokenToId
}

// Build a question-scoped map of implicit numeric tokens to option IDs.
const buildQuestionImplicitTokenMap = (options: ParsedQuestionOption[]): Map<string, string> => {
  // Preserve the first occurrence so local indices stay stable.
  const tokenToId = new Map<string, string>()
  options.forEach((option) => {
    const token = option.implicitToken
    // Skip options that did not produce a numeric token.
    if (!token) return
    // Keep the earliest option for each token.
    if (!tokenToId.has(token)) tokenToId.set(token, option.id)
  })
  return tokenToId
}

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
    // Accumulate group-level fallback blocks in source order.
    if (parsedOption.fallbackBlocks.length > 0) {
      // Initialize fallback storage for this group if needed.
      const fallback = group.fallback ?? { blocks: [] }
      // Append the parsed group fallback blocks in source order.
      fallback.blocks.push(...parsedOption.fallbackBlocks)
      // Only keep the fallback when at least one block exists.
      group.fallback = fallback.blocks.length > 0 ? fallback : null
    }
    group.options.push(resolved)
  })
  return groupOrder
}

// Resolve a parsed question into a fully-typed question definition.
const buildResolvedQuestion = (
  entry: ParsedQuestionEntry,
  answers: NoteConfigOptionsAnswers | null | undefined,
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
      blocks: option.blocks,
      isDefault: option.isDefault,
      token,
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
  return {
    id,
    index,
    prompt: question.prompt,
    layout: question.layout,
    layoutColumns: question.layoutColumns,
    groups,
    options,
    fallback: question.fallback,
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
): string[] => {
  // Reuse the shared exclusion lookup for compatibility checks.
  const exclusions = buildOptionExclusionLookup(options)
  // Use a working set so inserts are cheap.
  const next = new Set(selection)
  groups.forEach((group) => {
    if (group.type !== 'single') return
    // Skip groups that already have a selection.
    const hasSelection = group.options.some((option) => next.has(option.id))
    if (hasSelection) return
    // Choose the first compatible fallback candidate.
    const fallbackId = pickSingleGroupFallback(group, next, exclusions)
    if (!fallbackId) return
    next.add(fallbackId)
  })
  // Preserve the original option ordering in the output list.
  return options.filter((option) => next.has(option.id)).map((option) => option.id)
}

// Apply exclusions across the full note to support global IDs.
const applyGlobalOptionExclusions = (
  questions: NoteQuestionDefinition[],
  preferredId?: string,
): NoteQuestionDefinition[] => {
  // Flatten option ordering so conflicts resolve deterministically.
  const allOptions = questions.flatMap((question) => question.options)
  // Collect the currently selected option IDs.
  const selected = questions.flatMap((question) => question.answer)
  // Resolve exclusions using the global option ordering.
  const resolved = applyQuestionExclusions(selected, allOptions, preferredId)
  // Fill single-select gaps without introducing new conflicts.
  const filled = questions.reduce((current, question) => (
    applySingleGroupFallbackSelections(current, question.groups, allOptions)
  ), resolved)
  // Cache the resolved selection for cheap lookups.
  const resolvedSet = new Set(filled)
  // Update each question with the globally-resolved selection.
  return questions.map((question) => ({
    ...question,
    answer: question.options
      .filter((option) => resolvedSet.has(option.id))
      .map((option) => option.id),
  }))
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
  // Enforce exclusion rules before repairing single-select gaps.
  const resolved = applyQuestionExclusions(next, question.options)
  // Ensure single-select groups stay populated when excluded.
  return applySingleGroupFallbackSelections(resolved, question.groups, question.options)
}

// Parse config options markers from note text.
export const parseNoteConfigOptions = (
  note: string,
  answers?: NoteConfigOptionsAnswers | null,
  preferredId?: string,
): NoteQuestionDefinition[] => {
  // Short-circuit when no note is present.
  if (!note) return []
  // Collect parsed questions in note order for global resolution.
  const parsedEntries: ParsedQuestionEntry[] = []
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
  // Apply global exclusions so cross-question constraints take effect.
  return applyGlobalOptionExclusions(resolved, preferredId)
}

// Build a stable signature for the config options section of a note.
export const buildNoteConfigOptionsSignature = (note: string): string => {
  // Parse the questions using the same parser as the UI.
  const questions = parseNoteConfigOptions(note)
  // Preserve marker order plus layout metadata so formatting changes still register.
  const signature = questions.map((question) => [question.id, question.layout, question.layoutColumns])
  // Serialize the signature so comparisons are cheap and stable.
  return JSON.stringify(signature)
}

// Remove answers that no longer match the current note content.
export const pruneNoteConfigOptionsAnswers = (
  note: string,
  answers: NoteConfigOptionsAnswers,
): NoteConfigOptionsAnswers => {
  // Build a pruned output map.
  const next: NoteConfigOptionsAnswers = {}
  // Parse the current questions as the source of truth.
  const questions = parseNoteConfigOptions(note)
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
export const normalizeNoteConfigOptionsAnswers = (
  raw: unknown,
): NoteConfigOptionsAnswers | null => {
  // Reject null or non-object payloads.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const next: NoteConfigOptionsAnswers = {}
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

// Resolve selector blocks based on the current config options answers.
export const resolveConfigOptionsTags = (
  note: string,
  answers?: NoteConfigOptionsAnswers | null,
  preferredId?: string,
): ConfigOptionsResolution => {
  const questions = parseNoteConfigOptions(note, answers, preferredId)
  const instructions: ConfigOptionsInstructions = []
  for (const question of questions) {
    const selected = new Set(question.answer)
    // Track whether each group has at least one selected option.
    const groupSelections = new Map<NoteQuestionGroupType, boolean>()
    question.groups.forEach((group) => {
      // Determine whether any option in the group is selected.
      const hasSelection = group.options.some((option) => selected.has(option.id))
      // Cache the result so we can reuse it per option.
      groupSelections.set(group.type, hasSelection)
    })
    // Apply group-level fallback blocks when a group has no selections.
    const appliedGroupFallback = new Set<NoteQuestionGroupType>()
    question.options.forEach((option) => {
      const groupType = option.groupType
      // Apply group-level fallback once, at the first option of the group.
      if (!appliedGroupFallback.has(groupType) && !groupSelections.get(groupType)) {
        appliedGroupFallback.add(groupType)
        // Find the group so we can append its fallback blocks in order.
        const group = question.groups.find((entry) => entry.type === groupType)
        // Append the group fallback blocks when present.
        group?.fallback?.blocks.forEach((block) => instructions.push(block))
      }
      // Skip unselected options once group fallback has been applied.
      if (!selected.has(option.id)) return
      // Append selected option blocks in source order.
      option.blocks.forEach((block) => instructions.push(block))
    })
    // Apply question-level fallback when no options are selected anywhere.
    if (selected.size === 0 && question.fallback) {
      // Append the question-level fallback at the end.
      question.fallback.blocks.forEach((block) => instructions.push(block))
    }
  }
  return { questions, instructions }
}

const matchesRankSelector = (cfg: BuilderConfig, selector: ConfigOptionsSelector & { kind: 'rank' }): boolean => {
  const { op, value } = selector
  const rank = cfg.rankCode
  const range = rankCodeToRange(rank)
  if (op === 'eq') return range.min === range.max && range.min === value
  if (op === 'gte') return range.min >= rankRangeValue(value).min
  return range.max <= rankRangeValue(value).max
}

const matchesRaritySelector = (cfg: BuilderConfig, selector: ConfigOptionsSelector & { kind: 'rarity' }): boolean => {
  const { op, mode, code } = selector
  const cfgMode: 'auto' | 'code' = (cfg.rarityMode ?? 'code')
  if (mode === 'auto') {
    return op === 'eq' && cfgMode === 'auto'
  }
  if (cfgMode !== 'code') return false
  const range = rarityCodeToRange(cfg.rarityCode)
  if (op === 'eq') return range.min === range.max && range.min === rarityRangeValue(code ?? RarityCodeEnum.Any).min
  if (op === 'gte') return range.min >= rarityRangeValue(code ?? RarityCodeEnum.Any).min
  return range.max <= rarityRangeValue(code ?? RarityCodeEnum.Any).max
}

const matchesSelector = (selector: ConfigOptionsSelector, cfg: BuilderConfig): boolean => {
  switch (selector.kind) {
    case 'all':
      return true
    case 'tagged':
      return Array.isArray(cfg.tags) && cfg.tags.length > 0
    case 'untagged':
      return !Array.isArray(cfg.tags) || cfg.tags.length === 0
    case 'tag': {
      const tags = Array.isArray(cfg.tags) ? cfg.tags : []
      if (selector.mode === 'any') return tags.length > 0
      if (selector.mode === 'none') return tags.length === 0
      const normalized = tags.map((tag) => normalizeTagValue(String(tag))).filter((tag): tag is string => Boolean(tag))
      if (selector.mode === 'eq') {
        return normalized.some((tag) => tag === selector.values?.[0])
      }
      return normalized.some((tag) => selector.values?.includes(tag))
    }
    case 'rank':
      return matchesRankSelector(cfg, selector)
    case 'rarity':
      return matchesRaritySelector(cfg, selector)
    case 'minRolls': {
      const manual = (cfg.autoMinRequiredRolls === false) ? (cfg.minRequiredRolls ?? 0) : 0
      return compareNumeric(manual, selector.op, selector.value)
    }
    case 'minSubstats':
      return compareNumeric(resolveEffectiveMinCount(cfg), selector.op, selector.value)
    case 'flex':
      return Boolean(cfg.autoSubstatFlex) === selector.value
    case 'and':
      return matchesSelector(selector.left, cfg) && matchesSelector(selector.right, cfg)
    case 'or':
      return matchesSelector(selector.left, cfg) || matchesSelector(selector.right, cfg)
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

// Resolve a config's export mode based on config options selector blocks.
const resolveConfigOptionsExportModeWithInstructions = (
  cfg: BuilderConfig,
  instructions: ConfigOptionsInstructions,
): SellfileExportMode => {
  // Separators should never be overridden by options.
  if (cfg.exportMode === 'separator') return 'separator'
  // Start from the stored export mode before applying selector blocks.
  let nextMode: SellfileExportMode = cfg.exportMode
  let hasInstruction = false
  for (const instruction of instructions) {
    if (!matchesSelector(instruction.selector, cfg)) continue
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
  return hasInstruction ? nextMode : cfg.exportMode
}

// Resolve a config's export mode with selector blocks.
export const resolveConfigOptionsExportMode = (
  cfg: BuilderConfig,
  instructions: ConfigOptionsInstructions,
): SellfileExportMode => {
  return resolveConfigOptionsExportModeWithInstructions(cfg, instructions)
}

const applySubstatMinOverrides = (
  cfg: BuilderConfig,
  substatMinAll: number | null,
  substatMinByVariant: Map<number, number>,
): BuilderConfig => {
  if (substatMinAll == null && substatMinByVariant.size === 0) return cfg
  const selection = new Set<number>()
  ;(cfg.substatsV ?? []).forEach((variant) => selection.add(Number(variant)))
  ;(cfg.fixedSubstatsV ?? []).forEach((variant) => selection.add(Number(variant)))
  if (selection.size === 0) return cfg
  const bounds = { ...(cfg.substatRollBoundsV ?? {}) }
  selection.forEach((variant) => {
    const nextMin = substatMinByVariant.get(variant) ?? substatMinAll
    if (nextMin == null) return
    const existing = bounds[variant] ?? {}
    bounds[variant] = { ...existing, min: clampSubstatMin(nextMin) }
  })
  return { ...cfg, substatRollBoundsV: bounds }
}

// Resolve a config with all config options overrides applied.
const resolveConfigOptionsEffectiveConfigWithInstructions = (
  cfg: BuilderConfig,
  instructions: ConfigOptionsInstructions,
): BuilderConfig => {
  // Separators stay isolated from config options logic.
  if (cfg.exportMode === 'separator') return cfg
  let nextMode: SellfileExportMode = cfg.exportMode
  let nextRank: RankCode = cfg.rankCode
  let nextRarityMode: 'auto' | 'code' = (cfg.rarityMode ?? 'code')
  let nextRarityCode: RarityCode = cfg.rarityCode
  let nextMinLevel: LevelMilestone | undefined = cfg.minLevel
  let nextMaxLevel: LevelMilestone | undefined = cfg.maxLevel
  let nextKeepMode: 'early' | 'late' = (cfg.earlyKeepMode ?? 'early')
  let nextAutoLate: AutoRaritySupplementsThreshold | undefined = cfg.autoRaritySupplementsThreshold
  let nextMinRequiredRolls: number | undefined = cfg.minRequiredRolls
  let nextLockedMinRequiredRolls: number | undefined = cfg.lockedMinRequiredRolls
  let nextMinCount = cfg.minCount
  let nextFlex = cfg.autoSubstatFlex
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
  let hasInstruction = false
  for (const instruction of instructions) {
    if (!matchesSelector(instruction.selector, cfg)) continue
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
        nextMinRequiredRolls = clampAggregateRollValue(op.value)
        appliedMinRequired = true
        return
      }
      if (op.kind === 'lockedMinRequiredRolls') {
        nextLockedMinRequiredRolls = clampAggregateRollValue(op.value)
        appliedLockedMin = true
        return
      }
      if (op.kind === 'minSubstats') {
        nextMinCount = resolveMinCountOverride(cfg, op.value)
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
      }
    })
  }
  if (!hasInstruction) return cfg
  const storedRarityMode: 'auto' | 'code' = (cfg.rarityMode ?? 'code')
  const exportModeChanged = appliedMode && nextMode !== cfg.exportMode
  const rankChanged = appliedRank && nextRank !== cfg.rankCode
  const rarityModeChanged = appliedRarity && nextRarityMode !== storedRarityMode
  const rarityCodeChanged = appliedRarity && nextRarityMode === 'code' && nextRarityCode !== cfg.rarityCode
  const rarityChanged = rarityModeChanged || rarityCodeChanged
  const levelChanged = appliedLevel && (nextMinLevel !== cfg.minLevel || nextMaxLevel !== cfg.maxLevel)
  const keepChanged = appliedKeep && nextKeepMode !== (cfg.earlyKeepMode ?? 'early')
  const autoLateChanged = appliedAutoLate && nextAutoLate !== cfg.autoRaritySupplementsThreshold
  const minRequiredChanged = appliedMinRequired && nextMinRequiredRolls !== cfg.minRequiredRolls
  const lockedMinChanged = appliedLockedMin && nextLockedMinRequiredRolls !== cfg.lockedMinRequiredRolls
  const minCountChanged = appliedMinCount && nextMinCount !== cfg.minCount
  const flexChanged = appliedFlex && nextFlex !== cfg.autoSubstatFlex
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
    && !appliedSubstatMin) {
    return cfg
  }
  let next = cloneBuilderConfig(cfg)
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
  return next
}

// Resolve a config with config options overrides applied (exported for UI).
export const resolveConfigOptionsEffectiveConfig = (
  cfg: BuilderConfig,
  instructions: ConfigOptionsInstructions,
): BuilderConfig => (
  resolveConfigOptionsEffectiveConfigWithInstructions(cfg, instructions)
)

// Build a per-config export-mode snapshot for config options overrides.
export const buildConfigOptionsExportModeResolution = (
  configs: readonly BuilderConfig[],
  instructions: ConfigOptionsInstructions,
): ConfigOptionsExportModeResolution => {
  const modes: SellfileExportMode[] = []
  const overriddenIndices: number[] = []
  configs.forEach((cfg, idx) => {
    const nextMode = resolveConfigOptionsExportModeWithInstructions(cfg, instructions)
    modes.push(nextMode)
    if (nextMode !== cfg.exportMode) {
      overriddenIndices.push(idx)
    }
  })
  return { instructions, modes, overriddenIndices }
}

// Apply config options overrides by cloning only the configs that change mode.
export const applyConfigOptionsExportModeOverrides = (
  configs: readonly BuilderConfig[],
  modes: readonly SellfileExportMode[],
): BuilderConfig[] => {
  let mutated = false
  const next = configs.map((cfg, idx) => {
    const nextMode = modes[idx] ?? cfg.exportMode
    if (nextMode === cfg.exportMode) return cfg
    const clone = cloneBuilderConfig(cfg)
    clone.exportMode = nextMode
    mutated = true
    return clone
  })
  return mutated ? next : configs.slice()
}

// Apply config options overrides across a config list.
export const applyConfigOptionsOverrides = (
  configs: readonly BuilderConfig[],
  instructions: ConfigOptionsInstructions,
): BuilderConfig[] => {
  let mutated = false
  const next = configs.map((cfg) => {
    const resolved = resolveConfigOptionsEffectiveConfigWithInstructions(cfg, instructions)
    if (resolved !== cfg) mutated = true
    return resolved
  })
  return mutated ? next : configs.slice()
}

type ConfigOptionsSubstatTargetsResolution = {
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

const cloneSubstatTargets = (targets: SubstatTargetTable): SubstatTargetTable => ({
  one: { ...(targets.one ?? {}) },
  two: { ...(targets.two ?? {}) },
  three: { ...(targets.three ?? {}) },
  four: { ...(targets.four ?? {}) },
  five: { ...(targets.five ?? {}) },
  six: { ...(targets.six ?? {}) },
  anyRankDefaultsTo: targets.anyRankDefaultsTo ?? 6,
})

const instructionAppliesToAnyConfig = (
  instruction: ConfigOptionsSelectorBlock,
  configs: readonly BuilderConfig[],
): boolean => {
  if (configs.length === 0) return instruction.selector.kind === 'all'
  return configs.some((cfg) => matchesSelector(instruction.selector, cfg))
}

export const applyConfigOptionsSubstatTargetsOverrides = (
  substatTargets: SubstatTargetTable,
  configs: readonly BuilderConfig[],
  instructions: ConfigOptionsInstructions,
): ConfigOptionsSubstatTargetsResolution => {
  let next = substatTargets
  let overridesActive = false
  for (const instruction of instructions) {
    if (!instructionAppliesToAnyConfig(instruction, configs)) continue
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
