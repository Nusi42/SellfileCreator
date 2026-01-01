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

// Group metadata for a single question.
export type NoteQuestionGroup = {
  id: string
  type: NoteQuestionGroupType
  options: NoteQuestionOption[]
}

// Parsed question metadata plus resolved answer.
export type NoteQuestionDefinition = {
  id: string
  index: number
  prompt: string
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
    if ('{}[](),*@=<>!:'.includes(ch)) {
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

const parseSelectorBlocks = (cursor: TokenCursor): ConfigOptionsSelectorBlock[] => {
  const blocks: ConfigOptionsSelectorBlock[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === '}') {
      cursor.next()
      break
    }
    if (!cursor.consumeSymbol('@')) {
      cursor.next()
      continue
    }
    const selectorTokens: Token[] = []
    while (true) {
      const next = cursor.peek()
      if (!next) return blocks
      if (next.kind === 'symbol' && next.value === '{') break
      selectorTokens.push(next)
      cursor.next()
    }
    if (!cursor.consumeSymbol('{')) {
      // Guard: malformed selector blocks should never trap the cursor.
      cursor.next()
      continue
    }
    const selector = parseSelectorTokens(selectorTokens)
    const operations = parseOperations(cursor, '}')
    if (!selector || operations.length === 0) continue
    blocks.push({ selector, operations })
  }
  return blocks
}

type ParsedQuestionOption = {
  id: string
  label: string
  blocks: ConfigOptionsSelectorBlock[]
  isDefault: boolean
  explicitToken: string | null
  excludedTokens: string[]
  onlyTokens: string[]
  groupType: NoteQuestionGroupType
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
      // "only" limits selection to the listed tokens.
      readTokenList(cursor, onlyTokens)
      continue
    }
    // Skip any other header tokens to avoid infinite loops.
    cursor.next()
  }
  const blocks = parseSelectorBlocks(cursor)
  const baseLabel = normalizeQuestionText(label).toLowerCase()
  const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
  return {
    id,
    label,
    blocks,
    isDefault,
    explicitToken,
    excludedTokens,
    onlyTokens,
    groupType,
  }
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

const parseQuestionMarker = (inner: string): Omit<NoteQuestionDefinition, 'index' | 'answer'> | null => {
  const tokens = tokenizeConfigOptions(inner)
  const cursor = new TokenCursor(tokens)
  if (!cursor.consumeWord('config-options')) return null
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
  const tokenToId = new Map<string, string>()
  parsedOptions.forEach((option, idx) => {
    const implicitToken = normalizeQuestionToken(String(idx + 1))
    const token = option.explicitToken ?? implicitToken ?? ''
    if (!token) return
    if (!tokenToId.has(token)) tokenToId.set(token, option.id)
  })
  const options: NoteQuestionOption[] = []
  const groupMap = new Map<NoteQuestionGroupType, NoteQuestionGroup>()
  const groupOrder: NoteQuestionGroup[] = []
  parsedOptions.forEach((option, idx) => {
    const implicitToken = normalizeQuestionToken(String(idx + 1))
    const token = option.explicitToken ?? implicitToken ?? ''
    const onlyTokens = option.onlyTokens
    const excludedTokens = option.excludedTokens.slice()
    if (onlyTokens.length > 0) {
      parsedOptions.forEach((candidate, candidateIdx) => {
        const candidateToken = candidate.explicitToken ?? normalizeQuestionToken(String(candidateIdx + 1)) ?? ''
        if (!candidateToken) return
        if (onlyTokens.includes(candidateToken)) return
        excludedTokens.push(candidateToken)
      })
    }
    const excludedOptionIds = excludedTokens
      .map((tokenValue) => tokenToId.get(tokenValue))
      .filter((id): id is string => Boolean(id))
    const resolved: NoteQuestionOption = {
      id: option.id,
      label: option.label,
      blocks: option.blocks,
      isDefault: option.isDefault,
      token,
      excludedOptionIds,
      groupType: option.groupType,
    }
    options.push(resolved)
    let group = groupMap.get(option.groupType)
    if (!group) {
      group = { id: option.groupType, type: option.groupType, options: [] }
      groupMap.set(option.groupType, group)
      groupOrder.push(group)
    }
    group.options.push(resolved)
  })
  const defaultAnswer: string[] = []
  groupOrder.forEach((group) => {
    if (group.type === 'single') {
      const firstDefault = group.options.find((opt) => opt.isDefault)
      if (firstDefault) defaultAnswer.push(firstDefault.id)
      return
    }
    group.options.forEach((opt) => {
      if (opt.isDefault) defaultAnswer.push(opt.id)
    })
  })
  const id = buildQuestionId(prompt, options)
  return {
    id,
    prompt,
    groups: groupOrder,
    options,
    fallback: fallbackBlocks ? { blocks: fallbackBlocks } : null,
    defaultAnswer,
  }
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
  const exclusions = new Map<string, Set<string>>()
  options.forEach((option) => {
    exclusions.set(option.id, new Set(option.excludedOptionIds))
  })
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
  // Enforce any exclusion rules before returning.
  return applyQuestionExclusions(next, question.options)
}

// Build a stable ID per question from its prompt and option labels.
const buildQuestionId = (prompt: string, options: NoteQuestionOption[]): string => {
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

// Parse config options markers from note text.
export const parseNoteConfigOptions = (
  note: string,
  answers?: NoteConfigOptionsAnswers | null,
): NoteQuestionDefinition[] => {
  // Short-circuit when no note is present.
  if (!note) return []
  // Collect question definitions in order.
  const result: NoteQuestionDefinition[] = []
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
    // Apply stored answers when available.
    const storedAnswer = answers ? answers[parsed.id] : undefined
    const answer = resolveQuestionAnswer(parsed, storedAnswer)
    result.push({
      ...parsed,
      index: markerIndex,
      answer,
    })
    markerIndex += 1
  }
  // Preserve marker order as parsed.
  return result
}

// Build a stable signature for the config options section of a note.
export const buildNoteConfigOptionsSignature = (note: string): string => {
  // Parse the questions using the same parser as the UI.
  const questions = parseNoteConfigOptions(note)
  // Preserve marker order so reordering questions counts as a change.
  const ids = questions.map((question) => question.id)
  // Serialize the ids so comparisons are cheap and stable.
  return JSON.stringify(ids)
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
): ConfigOptionsResolution => {
  const questions = parseNoteConfigOptions(note, answers)
  const instructions: ConfigOptionsInstructions = []
  for (const question of questions) {
    const selected = new Set(question.answer)
    if (selected.size === 0 && question.fallback) {
      question.fallback.blocks.forEach((block) => instructions.push(block))
      continue
    }
    question.options.forEach((option) => {
      if (!selected.has(option.id)) return
      option.blocks.forEach((block) => instructions.push(block))
    })
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
