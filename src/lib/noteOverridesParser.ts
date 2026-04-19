/**
 * noteOverridesParser.ts
 *
 * Shared infrastructure for the recipe-overrides and safeguard-overrides DSL parsers.
 * Provides: tokenizer, TokenCursor, tag selector, keyword constants, and the generic
 * question/group/option parsing machinery that both parsers build on top of.
 *
 * Recipe-specific and safeguard-specific concerns (operation types, field parsing)
 * stay in their own modules; only truly shared logic lives here.
 */
import { TAG_TOKEN_REGEX, normalizeTagValue } from './tagHelpers'

// ── Token types ───────────────────────────────────────────────────────────────

export type TokenKind = 'word' | 'string' | 'symbol'

export type Token = {
  kind: TokenKind
  value: string
  index: number
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

/** Tokenize a recipe-overrides or safeguard-overrides block body. */
export const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  let idx = 0
  while (idx < input.length) {
    const ch = input.charAt(idx)
    // Skip whitespace.
    if (/\s/.test(ch)) { idx += 1; continue }
    // Skip single-line comments (// … end-of-line).
    if (ch === '/' && input.charAt(idx + 1) === '/') {
      const eol = input.indexOf('\n', idx)
      idx = eol >= 0 ? eol + 1 : input.length
      continue
    }
    // Skip block comments (/* … */); treat as whitespace.
    if (ch === '/' && input.charAt(idx + 1) === '*') {
      const close = input.indexOf('*/', idx + 2)
      idx = close >= 0 ? close + 2 : input.length
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
        // Escape sequences: \n \t \r \\ \" \<other> → literal.
        if (next === '\\') {
          const esc = input.charAt(cursor + 1)
          if (esc === 'n') value += '\n'
          else if (esc === 't') value += '\t'
          else if (esc === 'r') value += '\r'
          else if (esc === '\\') value += '\\'
          else if (esc) value += esc
          cursor += 2
          continue
        }
        value += next
        cursor += 1
      }
      // Guard against unterminated strings: emit and consume remainder.
      if (!closed) { tokens.push({ kind: 'string', value, index: idx }); idx = input.length }
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
    if ('{}[](),*+@=<>!:^/'.includes(ch)) {
      tokens.push({ kind: 'symbol', value: ch, index: idx })
      idx += 1
      continue
    }
    // Parse word tokens up to the next separator.
    let end = idx + 1
    while (end < input.length) {
      const next = input.charAt(end)
      if (/\s/.test(next)) break
      if ('{}[](),*+@=<>!:^/'.includes(next)) break
      if (next === '&' || next === '|') break
      end += 1
    }
    tokens.push({ kind: 'word', value: input.slice(idx, end), index: idx })
    idx = end
  }
  return tokens
}

// ── TokenCursor ───────────────────────────────────────────────────────────────

/** Stateful cursor for walking a Token array. Shared by all override parsers. */
export class TokenCursor {
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

// ── Group types ───────────────────────────────────────────────────────────────

/** All valid group types in the overrides DSL. */
export type NoteQuestionGroupType = 'single' | 'multi' | 'slider'

/** Numeric range for a slider group. */
export type SliderParams = {
  min: number
  max: number
  step: number
  default: number
}

// ── Keyword constants (single source of truth shared with syntax highlighter) ──

/** Keywords that open an interactive question block. */
export const NOTE_OVERRIDES_QUESTION_KEYWORDS = ['q', 'question'] as const

/** Keywords that open a fallback / default-answer block. */
export const NOTE_OVERRIDES_FALLBACK_KEYWORDS = ['fallback', 'else'] as const

/**
 * Canonical map from every group-type surface keyword to its logical type.
 * Includes the shared single/multi/slider keywords; recipe-specific additions
 * (none at present) may be merged by callers.
 */
export const NOTE_OVERRIDES_GROUP_TYPE_MAP: Record<string, NoteQuestionGroupType> = {
  single: 'single', s: 'single', radiobutton: 'single', radio: 'single', rb: 'single',
  multi:  'multi',  m: 'multi',  checkbox:    'multi',  check: 'multi',  cb: 'multi',
  slider: 'slider', range: 'slider',
}

/** Word-form constraint keywords (symbolic forms ! + - ^ are handled separately). */
export const NOTE_OVERRIDES_CONSTRAINT_KEYWORDS = ['set', 'unset', 'only', 'excl'] as const

/** Boolean logic connectors for compound selector expressions. */
export const NOTE_OVERRIDES_LOGIC_KEYWORDS = ['and', 'or'] as const

/** Marker option key for the card-width multiplier. */
export const NOTE_OVERRIDES_MARKER_COLUMNS_KEY = 'columns' as const

/** Default columns value: 0 means vertical layout at standard card width. */
export const NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT = 0

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Extract the inner text from an HTML comment. */
export const stripCommentWrapper = (raw: string): string => (
  raw.trim().replace(/^<!--\s*/, '').replace(/\s*-->$/, '')
)

/** Collapse whitespace to keep IDs stable across formatting tweaks. */
export const normalizeQuestionText = (value: string): string => (
  value.trim().replace(/\s+/g, ' ')
)

/** Normalize tag-style tokens for id/exclusion usage. */
export const normalizeQuestionToken = (raw: string): string | null => {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Accept numeric tokens for implicit indices regardless of tag grammar.
  if (/^\d+$/.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10)
    return Number.isFinite(value) ? String(value) : null
  }
  if (!QUESTION_TOKEN_REGEX.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/** DJB2 hash for stable short IDs. */
export const hashString = (value: string): string => {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

// Token grammar for question tokens — mirrors TAG_TOKEN_REGEX from tagHelpers.
const QUESTION_TOKEN_REGEX = TAG_TOKEN_REGEX

export const isQuestionKeyword = (token: Token | null): boolean => (
  Boolean(token && token.kind === 'word'
    && (NOTE_OVERRIDES_QUESTION_KEYWORDS as readonly string[]).includes(token.value.toLowerCase()))
)

export const isFallbackKeyword = (token: Token | null): boolean => (
  Boolean(token && token.kind === 'word'
    && (NOTE_OVERRIDES_FALLBACK_KEYWORDS as readonly string[]).includes(token.value.toLowerCase()))
)

/** Derive group type from the shared keyword map. Returns null for unknown keywords. */
export const parseGroupType = (raw: string): NoteQuestionGroupType | null => (
  NOTE_OVERRIDES_GROUP_TYPE_MAP[raw.toLowerCase()] ?? null
)

// ── Marker options parser ─────────────────────────────────────────────────────

/** Parse the optional [key=value, …] marker options block that follows the marker keyword. */
export const parseQuestionMarkerOptions = (cursor: TokenCursor): { columns: number } => {
  const token = cursor.peek()
  if (!token || token.kind !== 'symbol' || token.value !== '[') {
    return { columns: NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT }
  }
  cursor.next()
  let columns = NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT
  while (true) {
    const next = cursor.peek()
    if (!next) break
    if (next.kind === 'symbol' && next.value === ']') { cursor.next(); break }
    if (isQuestionKeyword(next)) break
    if (next.kind === 'symbol' && next.value === ',') { cursor.next(); continue }
    if (next.kind === 'word') {
      const word = next.value
      if (word.toLowerCase() === NOTE_OVERRIDES_MARKER_COLUMNS_KEY) {
        cursor.next()
        if (!cursor.consumeSymbol('=')) continue
        const valueToken = cursor.peek()
        if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
        cursor.next()
        const parsed = Number.parseInt(valueToken.value, 10)
        if (Number.isFinite(parsed) && parsed >= 0) columns = parsed
        continue
      }
      cursor.next()
      continue
    }
    cursor.next()
  }
  return { columns }
}

// ── Tag selector ──────────────────────────────────────────────────────────────

/** Tag-based selector subset shared by both recipe and safeguard overrides. */
export type NoteTagSelector =
  | { kind: 'all' }
  | { kind: 'tagged' }
  | { kind: 'untagged' }
  | { kind: 'tag'; mode: 'eq' | 'in' | 'any' | 'none'; values?: string[] }
  | { kind: 'not'; inner: NoteTagSelector }
  | { kind: 'and'; left: NoteTagSelector; right: NoteTagSelector }
  | { kind: 'or'; left: NoteTagSelector; right: NoteTagSelector }

/**
 * Parse a tag-based selector expression. Handles: all, tagged, untagged,
 * tag=…, tag in […], tag any, tag none, not/!, and/&&, or/||.
 * Recipe-specific terms (rank, rarity, minrolls, flex) are NOT included here.
 */
export const parseTagSelector = (tokens: Token[]): NoteTagSelector | null => {
  const cursor = new TokenCursor(tokens)

  const parseTerm = (): NoteTagSelector | null => {
    const token = cursor.peek()
    if (!token || token.kind !== 'word') return null
    const keyword = token.value.toLowerCase()
    if (keyword === 'all') { cursor.next(); return { kind: 'all' } }
    if (keyword === 'tagged') { cursor.next(); return { kind: 'tagged' } }
    if (keyword === 'untagged') { cursor.next(); return { kind: 'untagged' } }
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
            if (entry.kind === 'symbol' && entry.value === ']') { cursor.next(); break }
            if (entry.kind === 'symbol' && entry.value === ',') { cursor.next(); continue }
            if (entry.kind !== 'word' && entry.kind !== 'string') return null
            const normalized = normalizeTagValue(entry.value)
            cursor.next()
            if (normalized) values.push(normalized)
          }
          return { kind: 'tag', mode: 'in', values }
        }
      }
      // tag = token  or  tag : token
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
    return null
  }

  const parseNot = (): NoteTagSelector | null => {
    const token = cursor.peek()
    if (!token) return null
    const isNotKeyword = token.kind === 'word' && token.value.toLowerCase() === 'not'
    const isNotSymbol = token.kind === 'symbol' && token.value === '!'
    if (isNotKeyword || isNotSymbol) {
      cursor.next()
      const inner = parseNot()
      if (!inner) return null
      return { kind: 'not', inner }
    }
    return parseTerm()
  }

  const parseAnd = (): NoteTagSelector | null => {
    let left = parseNot()
    if (!left) return null
    while (true) {
      const token = cursor.peek()
      if (!token) break
      const word = token.kind === 'word' ? token.value.toLowerCase() : token.value
      if (word !== 'and' && word !== '&&') break
      cursor.next()
      const right = parseNot()
      if (!right) return null
      left = { kind: 'and', left, right }
    }
    return left
  }

  const parseOr = (): NoteTagSelector | null => {
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

// ── Generic question-parsing types ────────────────────────────────────────────

/** A selector + operation pair, parameterized over the domain-specific types. */
export type OverridesSelectorBlock<S, O> = {
  selector: S
  operations: O[]
}

/** A parsed option within a group, parameterized over selector and operation types. */
export type ParsedOverridesOption<S, O> = {
  id: string
  legacyId: string
  label: string
  // Optional second string rendered as the value column in two-column layouts.
  detail: string | null
  blocks: OverridesSelectorBlock<S, O>[]
  fallbackBlocks: OverridesSelectorBlock<S, O>[]
  isDefault: boolean
  explicitToken: string | null
  implicitToken: string | null
  setTokens: string[]
  unsetTokens: string[]
  excludedTokens: string[]
  onlyTokens: string[]
  groupType: NoteQuestionGroupType
  // Only populated when groupType === 'slider'.
  sliderParams?: SliderParams
}

/** A parsed question body, parameterized over selector and operation types. */
export type ParsedOverridesQuestion<S, O> = {
  prompt: string
  // columns ≥ 1 enables horizontal (grid) option layout; 0 = vertical.
  layoutColumns: number
  questionId: string
  options: ParsedOverridesOption<S, O>[]
  fallback: { blocks: OverridesSelectorBlock<S, O>[] } | null
}

// ── Generic question-parsing machinery ────────────────────────────────────────

/**
 * Collect selector tokens that precede the opening `{` of a selector block.
 * Returns the token array on success, or null if no opening brace is found.
 * Advances the cursor past the `{`.
 */
export const collectSelectorTokensAndOpenBlock = (cursor: TokenCursor): Token[] | null => {
  const selectorTokens: Token[] = []
  while (true) {
    const next = cursor.peek()
    if (!next) return null
    if (next.kind === 'symbol' && next.value === '{') break
    selectorTokens.push(next)
    cursor.next()
  }
  if (!cursor.consumeSymbol('{')) {
    if (cursor.peek()) cursor.next()
    return null
  }
  return selectorTokens
}

/** Read comma/space-separated token IDs into a sink array until a structural keyword is hit. */
export function readTokenList(cursor: TokenCursor, sink: string[]): void {
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === ',') { cursor.next(); continue }
    if (token.kind === 'word' && (isQuestionKeyword(token) || isFallbackKeyword(token))) break
    if (token.kind === 'word' && parseGroupType(token.value)) break
    if (token.kind === 'symbol' && token.value === '{') break
    if (token.kind !== 'word' && token.kind !== 'string') break
    cursor.next()
    const normalized = normalizeQuestionToken(token.value)
    if (normalized) sink.push(normalized)
  }
}

/** Parse slider params (min/max/step/default = number) before the opening brace. */
export const parseSliderParams = (cursor: TokenCursor): SliderParams => {
  // Defaults: slider from 0 to 10 in steps of 1 with default 1.
  let min = 0; let max = 10; let step = 1; let def = 1
  while (true) {
    const token = cursor.peek()
    if (!token || token.kind !== 'word') break
    const keyword = token.value.toLowerCase()
    if (keyword !== 'min' && keyword !== 'max' && keyword !== 'step' && keyword !== 'default') break
    cursor.next()
    if (!cursor.consumeSymbol('=')) continue
    const valueToken = cursor.peek()
    if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
    cursor.next()
    const parsed = Number.parseFloat(valueToken.value)
    if (!Number.isFinite(parsed)) continue
    if (keyword === 'min') min = parsed
    else if (keyword === 'max') max = parsed
    else if (keyword === 'step') step = Math.max(0.001, parsed)
    else def = parsed
  }
  // Clamp defaults so the initial slider position stays within range.
  const safeDefault = Math.min(max, Math.max(min, def))
  return { min, max, step, default: safeDefault }
}

/**
 * Parse selector blocks + optional group-level fallback from an already-opened `{` context.
 * Stops on the matching `}`.
 */
export function parseGroupBlocks<S, O>(
  cursor: TokenCursor,
  parseSelectorBlock: (cursor: TokenCursor) => OverridesSelectorBlock<S, O> | null,
): {
  blocks: OverridesSelectorBlock<S, O>[]
  fallbackBlocks: OverridesSelectorBlock<S, O>[]
} {
  const blocks: OverridesSelectorBlock<S, O>[] = []
  const fallbackBlocks: OverridesSelectorBlock<S, O>[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === '}') { cursor.next(); break }
    if (isFallbackKeyword(token)) {
      cursor.next()
      if (!cursor.consumeSymbol('{')) continue
      const parsed = parseSelectorBlockList(cursor, parseSelectorBlock)
      if (parsed.length > 0) fallbackBlocks.push(...parsed)
      continue
    }
    if (token.kind === 'symbol' && token.value === '@') {
      cursor.next()
      const block = parseSelectorBlock(cursor)
      if (block) blocks.push(block)
      continue
    }
    cursor.next()
  }
  return { blocks, fallbackBlocks }
}

/** Parse a list of `@selector { ... }` blocks until a closing `}`. */
export function parseSelectorBlockList<S, O>(
  cursor: TokenCursor,
  parseSelectorBlock: (cursor: TokenCursor) => OverridesSelectorBlock<S, O> | null,
): OverridesSelectorBlock<S, O>[] {
  const blocks: OverridesSelectorBlock<S, O>[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === '}') { cursor.next(); break }
    if (!cursor.consumeSymbol('@')) { cursor.next(); continue }
    const block = parseSelectorBlock(cursor)
    if (block) blocks.push(block)
  }
  return blocks
}

/**
 * Parse a single option block (single/multi) or slider group following the group-type keyword.
 * `parseSelectorBlock` is the caller-supplied function for the operation-specific block content.
 */
export function parseOverridesOptionBlock<S, O>(
  cursor: TokenCursor,
  optionIndex: number,
  groupType: NoteQuestionGroupType,
  parseSelectorBlock: (cursor: TokenCursor) => OverridesSelectorBlock<S, O> | null,
): ParsedOverridesOption<S, O> | null {
  const labelToken = cursor.consumeString()
  if (!labelToken) return null
  const label = labelToken.value
  // Optional second string for label/value two-column layouts.
  const detailToken = cursor.peek()
  const detail = detailToken && detailToken.kind === 'string' ? detailToken.value : null
  if (detail !== null) cursor.next()

  let isDefault = false
  let explicitToken: string | null = null
  const setTokens: string[] = []
  const unsetTokens: string[] = []
  const excludedTokens: string[] = []
  const onlyTokens: string[] = []
  let sliderParams: SliderParams | undefined
  // Track header parsing order so constraints stay before the selector block.
  let headerPhase: 'id' | 'default' | 'constraints' = 'id'

  if (groupType === 'slider') {
    // Slider groups: parse optional id/default markers, then slider params, then block.
    // Slider groups have no constraint phase; id/default markers are always accepted.
    while (true) {
      const token = cursor.peek()
      if (!token) return null
      if (token.kind === 'symbol' && token.value === '{') { cursor.next(); break }
      if (token.kind === 'symbol' && token.value === '*') {
        isDefault = true; headerPhase = 'default'; cursor.next(); continue
      }
      if (token.kind === 'word' && token.value.toLowerCase() === 'default'
          && cursor.peek(1)?.kind !== 'symbol') {
        // 'default' as a marker (no '=' follows) — not a slider param.
        isDefault = true; headerPhase = 'default'; cursor.next(); continue
      }
      if (token.kind === 'word' && token.value.toLowerCase() === 'id') {
        cursor.next()
        if (!cursor.consumeSymbol('=')) continue
        const valueToken = cursor.peek()
        if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
        cursor.next()
        const candidate = normalizeQuestionToken(valueToken.value)
        if (candidate) explicitToken = candidate
        continue
      }
      // Parse slider params (min/max/step/default=<number>).
      if (token.kind === 'word') {
        const kw = token.value.toLowerCase()
        if ((kw === 'min' || kw === 'max' || kw === 'step')
            || (kw === 'default' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=')) {
          sliderParams = parseSliderParams(cursor)
          continue
        }
      }
      cursor.next()
    }
    // If no params were parsed, apply defaults.
    if (!sliderParams) sliderParams = { min: 0, max: 10, step: 1, default: 1 }
    const { blocks, fallbackBlocks } = parseGroupBlocks(cursor, parseSelectorBlock)
    const baseLabel = normalizeQuestionText(label).toLowerCase()
    const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
    return {
      id, legacyId: id, label, detail, blocks, fallbackBlocks,
      isDefault, explicitToken, implicitToken: null,
      setTokens, unsetTokens, excludedTokens, onlyTokens,
      groupType, sliderParams,
    }
  }

  // single / multi groups: parse id, default marker, constraints, then block.
  while (true) {
    const token = cursor.peek()
    if (!token) return null
    if (token.kind === 'symbol' && token.value === '{') { cursor.next(); break }
    if (headerPhase !== 'constraints') {
      if (token.kind === 'symbol' && token.value === '*') {
        isDefault = true; headerPhase = 'default'; cursor.next(); continue
      }
      if (token.kind === 'word' && token.value.toLowerCase() === 'default') {
        isDefault = true; headerPhase = 'default'; cursor.next(); continue
      }
    }
    if (headerPhase !== 'constraints' && token.kind === 'word' && token.value.toLowerCase() === 'id') {
      cursor.next()
      if (!cursor.consumeSymbol('=')) continue
      const valueToken = cursor.peek()
      if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
      cursor.next()
      const candidate = normalizeQuestionToken(valueToken.value)
      if (candidate) explicitToken = candidate
      continue
    }
    if (token.kind === 'symbol' && token.value === '!') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, excludedTokens); continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === 'set') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, setTokens); continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === 'unset') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, unsetTokens); continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === 'excl') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, excludedTokens); continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === 'only') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, onlyTokens); continue
    }
    if (token.kind === 'symbol' && token.value === '+') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, setTokens); continue
    }
    if (token.kind === 'word' && token.value.startsWith('-')) {
      headerPhase = 'constraints'
      const compact = normalizeQuestionToken(token.value.slice(1))
      cursor.next()
      if (compact) unsetTokens.push(compact)
      readTokenList(cursor, unsetTokens); continue
    }
    if (token.kind === 'symbol' && token.value === '^') {
      headerPhase = 'constraints'; cursor.next()
      readTokenList(cursor, onlyTokens); continue
    }
    cursor.next()
  }
  const { blocks, fallbackBlocks } = parseGroupBlocks(cursor, parseSelectorBlock)
  const baseLabel = normalizeQuestionText(label).toLowerCase()
  const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
  const implicitToken = normalizeQuestionToken(String(optionIndex + 1))
  return {
    id, legacyId: id, label, detail, blocks, fallbackBlocks,
    isDefault, explicitToken, implicitToken,
    setTokens, unsetTokens, excludedTokens, onlyTokens,
    groupType,
  }
}

/** Build a stable question id from prompt + option labels/group types. */
export const buildQuestionKey = (
  prompt: string,
  options: Array<{ label: string; groupType: NoteQuestionGroupType }>,
): string => {
  const key = {
    prompt: normalizeQuestionText(prompt),
    options: options.map((opt) => ({
      label: normalizeQuestionText(opt.label),
      group: opt.groupType,
    })),
  }
  return `q_${hashString(JSON.stringify(key))}`
}

/**
 * Parse the body of a single overrides marker (everything inside the comment).
 * Caller provides the marker keyword(s) and the domain-specific selector-block parser.
 *
 * @param inner - Comment body text (already stripped of `<!-- ... -->`).
 * @param markerKeywords - Accepted marker opening keyword(s) (e.g. ['recipe-overrides']).
 * @param parseSelectorBlock - Domain-specific function that parses one `@selector { ... }` block.
 * @returns A parsed question, or null if the marker is malformed.
 */
export function parseOverridesMarkerBody<S, O>(
  inner: string,
  markerKeywords: readonly string[],
  parseSelectorBlock: (cursor: TokenCursor) => OverridesSelectorBlock<S, O> | null,
): ParsedOverridesQuestion<S, O> | null {
  const tokens = tokenize(inner)
  const cursor = new TokenCursor(tokens)
  if (!cursor.consumeWord(...markerKeywords)) return null
  const markerOptions = parseQuestionMarkerOptions(cursor)
  const questionToken = cursor.consumeWord('q', 'question')
  if (!questionToken) return null
  const promptToken = cursor.consumeString()
  if (!promptToken) return null
  const prompt = promptToken.value
  const parsedOptions: ParsedOverridesOption<S, O>[] = []
  let fallbackBlocks: OverridesSelectorBlock<S, O>[] | null = null
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind !== 'word') { cursor.next(); continue }
    if (isQuestionKeyword(token)) break
    if (isFallbackKeyword(token)) {
      cursor.next()
      if (!cursor.consumeSymbol('{')) continue
      const blocks = parseSelectorBlockList(cursor, parseSelectorBlock)
      fallbackBlocks = blocks.length > 0 ? blocks : null
      continue
    }
    const groupType = parseGroupType(token.value)
    if (!groupType) { cursor.next(); continue }
    cursor.next()
    const parsed = parseOverridesOptionBlock(cursor, parsedOptions.length, groupType, parseSelectorBlock)
    if (!parsed) { if (cursor.peek()) cursor.next(); continue }
    parsedOptions.push(parsed)
  }
  if (parsedOptions.length === 0) return null
  const questionId = buildQuestionKey(
    prompt,
    parsedOptions.map((opt) => ({ label: opt.label, groupType: opt.groupType })),
  )
  // Scope option ids to the question so cross-question exclusions stay unique.
  parsedOptions.forEach((option, index) => {
    const baseLabel = normalizeQuestionText(option.label).toLowerCase()
    option.id = baseLabel ? `${questionId}:${baseLabel}#${index}` : `${questionId}:option-${index}`
  })
  return {
    prompt,
    layoutColumns: markerOptions.columns,
    questionId,
    options: parsedOptions,
    fallback: fallbackBlocks ? { blocks: fallbackBlocks } : null,
  }
}

// ── Global token resolution helpers ──────────────────────────────────────────

/** Build a global map of explicit tokens to option IDs (first mention wins). */
export function buildGlobalExplicitTokenMap<S, O>(
  entries: Array<{ index: number; question: ParsedOverridesQuestion<S, O> }>,
): Map<string, string> {
  const tokenToId = new Map<string, string>()
  entries.forEach((entry) => {
    entry.question.options.forEach((option) => {
      const token = option.explicitToken
      if (!token) return
      if (!tokenToId.has(token)) tokenToId.set(token, option.id)
    })
  })
  return tokenToId
}

/** Build a question-scoped map of implicit numeric tokens to option IDs. */
export function buildQuestionImplicitTokenMap<S, O>(
  options: ParsedOverridesOption<S, O>[],
): Map<string, string> {
  const tokenToId = new Map<string, string>()
  options.forEach((option) => {
    const token = option.implicitToken
    if (!token) return
    if (!tokenToId.has(token)) tokenToId.set(token, option.id)
  })
  return tokenToId
}
