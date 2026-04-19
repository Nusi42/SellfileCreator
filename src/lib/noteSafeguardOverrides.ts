/**
 * noteSafeguardOverrides.ts
 *
 * Parses `<!-- safeguard-overrides ... -->` note markers and resolves tag-based
 * selectors to produce interactive safeguard rule property overrides.
 *
 * Mirrors the structure of noteRecipeOverrides.ts but targets SafeguardRule
 * fields (activation, count, countMode flags, boolean guards, substats,
 * improvementChance, etc.).
 *
 * Public surface:
 *   parseNoteSafeguardOverrides     — marker → question definitions
 *   resolveNoteSafeguardOverridesTags — questions + answers → instructions
 *   applySafeguardOverrides          — instructions + rules → effective rules
 *   buildNoteSafeguardOverridesSignature — change-detection hash
 *   pruneNoteSafeguardOverridesAnswers  — remove stale answer keys
 *   normalizeNoteSafeguardOverridesAnswers — decode persisted payload
 */
import type { StatVariant } from './types'
import { variantFromLabel } from './types'
import type { SafeguardRule, SafeguardImprovementChanceLevelThresholds } from './safeguards'
import {
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  cloneSafeguardRule,
  normalizeSafeguardSubstatDependents,
  pruneSafeguardsSubstatWeights,
} from './safeguards'
import {
  SAFEGUARD_WEIGHT_MIN,
  SAFEGUARD_WEIGHT_MAX,
  SAFEGUARD_WEIGHT_STEP,
  SAFEGUARD_WEIGHT_DEFAULT,
} from './generated/domainConstants'
import {
  type NoteQuestionGroupType,
  type NoteTagSelector,
  type ParsedOverridesOption,
  type ParsedOverridesQuestion,
  TokenCursor,
  stripCommentWrapper,
  parseTagSelector,
  collectSelectorTokensAndOpenBlock,
  parseOverridesMarkerBody,
  buildGlobalExplicitTokenMap,
  buildQuestionImplicitTokenMap,
} from './noteOverridesParser'

// ── Exported constants (single source of truth for Prism + EBNF) ─────────────

/** HTML comment keyword that triggers safeguard overrides marker parsing. */
export const NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD = 'safeguard-overrides'

/** Valid `activation =` values in the DSL (lowercase surface form). */
export const NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS = [
  'off', 'protect_existing', 'anticipate_gaps',
] as const

/** Valid `substatmatch =` values in the DSL. */
export const NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS = [
  '1', '2', '3', '4', 'persubstat',
] as const

/**
 * Non-numeric `improvchance =` keywords in the DSL (lowercase surface form).
 * Excludes `on`/`off`/`true`/`false` which are handled by the shared boolean-val token.
 * Only `disabled` is listed here; preset names are not accepted by the DSL.
 */
export const NOTE_SAFEGUARD_OVERRIDES_IMPROVEMENT_CHANCE_KW_VALS = [
  'disabled',
] as const

/** Field names valid on the left-hand side of `@selector { … }` blocks. */
export const NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS = [
  'activation', 'count',
  'ignprev', 'igncoll', 'ignvault',
  'perfaction', 'permainstat', 'perslot', 'perset', 'perrule',
  'substats', 'substatmatch',
  // weight.<statKey> = number — prefix only; full keyword set is dynamic.
  'weight',
  // improvchance = off | disabled | <number> [<number> [<number> [<number>]]]
  'improvchance',
] as const

// ── $count / $value expression AST ───────────────────────────────────────────

/**
 * AST node for arithmetic expressions in `count = <expr>` assignments.
 *
 * Supported grammar (standard PEMDAS/BODMAS precedence):
 *   expr       → addExpr
 *   addExpr    → mulExpr  (('+' | '-') mulExpr)*
 *   mulExpr    → unaryExpr (('*' | '/') unaryExpr)*
 *   unaryExpr  → '-' unaryExpr | primary
 *   primary    → '(' expr ')' | $count('.'TOKEN)? | $value | NUMBER
 *
 * Both `$count` and `$value` are equal aliases for the enclosing slider value.
 * `$count.TOKEN` / `$value.TOKEN` references another slider by its id=TOKEN.
 * The final numeric result is rounded and clamped to [1, 9999].
 */
export type SafeguardCountAstNode =
  | { kind: 'literal'; value: number }
  | { kind: 'ref'; sliderId: string | null }        // null = self, string = cross-slider
  | { kind: 'binop'; op: '+' | '-' | '*' | '/';
      left: SafeguardCountAstNode; right: SafeguardCountAstNode }
  | { kind: 'unary'; op: '-'; operand: SafeguardCountAstNode }

// ── Operation types ───────────────────────────────────────────────────────────

/** A single override operation targeting one SafeguardRule field. */
export type SafeguardOverridesOperation =
  | { kind: 'activation'; value: SafeguardRuleActivation }
  // count: null means "use the enclosing slider's current value ($count / $value).
  // ast: if present, a full arithmetic expression to evaluate at resolve time.
  | { kind: 'count'; value: number | null; ast?: SafeguardCountAstNode }
  | { kind: 'ignPrev'; value: boolean }
  | { kind: 'ignEquippedCollection'; value: boolean }
  | { kind: 'ignEquippedVault'; value: boolean }
  | { kind: 'perFaction'; value: boolean }
  | { kind: 'perMainStat'; value: boolean }
  | { kind: 'perSlot'; value: boolean }
  | { kind: 'perSet'; value: boolean }
  | { kind: 'perRule'; value: boolean }
  | { kind: 'substats'; mode: 'replace'; stats: StatVariant[] }
  | { kind: 'substats'; mode: 'mutate'; add: StatVariant[]; remove: StatVariant[] }
  | { kind: 'substatMatch'; value: SafeguardSubstatMatch }
  | { kind: 'substatWeight'; stat: StatVariant; value: number }
  // null = disable the feature; non-null = enable with specific per-level thresholds.
  | { kind: 'improvementChance'; value: SafeguardImprovementChanceLevelThresholds | null }

/** A resolved selector + operations pair, ready for application. */
export type SafeguardOverridesSelectorBlock = {
  selector: NoteTagSelector
  operations: SafeguardOverridesOperation[]
}

// ── DSL keyword → enum value maps ─────────────────────────────────────────────

/** Map from DSL surface keyword to SafeguardRuleActivation enum value. */
const ACTIVATION_KEYWORD_MAP: Record<string, SafeguardRuleActivation> = {
  off:               SafeguardRuleActivation.Off,
  protect_existing:  SafeguardRuleActivation.ProtectExisting,
  protectexisting:   SafeguardRuleActivation.ProtectExisting,
  anticipate_gaps:   SafeguardRuleActivation.AnticipateGaps,
  anticipategaps:    SafeguardRuleActivation.AnticipateGaps,
}

/** Map from DSL surface keyword to SafeguardSubstatMatch enum value. */
const SUBSTAT_MATCH_KEYWORD_MAP: Record<string, SafeguardSubstatMatch> = {
  '1':          SafeguardSubstatMatch.Min1,
  '2':          SafeguardSubstatMatch.Min2,
  '3':          SafeguardSubstatMatch.Min3,
  '4':          SafeguardSubstatMatch.Min4,
  persubstat:   SafeguardSubstatMatch.PerSubstat,
}

// ── Selector matching ─────────────────────────────────────────────────────────

/** Whether a rule matches a tag-based selector against its `tags` array. */
const matchesTagSelectorForRule = (
  selector: NoteTagSelector,
  tags: readonly string[],
): boolean => {
  switch (selector.kind) {
    case 'all':     return true
    case 'tagged':  return tags.length > 0
    case 'untagged': return tags.length === 0
    case 'tag': {
      if (selector.mode === 'any')  return tags.length > 0
      if (selector.mode === 'none') return tags.length === 0
      if (selector.mode === 'in') {
        const set = new Set(selector.values ?? [])
        return tags.some((tag) => set.has(tag))
      }
      // 'eq': matches when the rule has the specified tag.
      return tags.some((tag) => (selector.values ?? []).includes(tag))
    }
    case 'not': return !matchesTagSelectorForRule(selector.inner, tags)
    case 'and': return (
      matchesTagSelectorForRule(selector.left, tags)
      && matchesTagSelectorForRule(selector.right, tags)
    )
    case 'or': return (
      matchesTagSelectorForRule(selector.left, tags)
      || matchesTagSelectorForRule(selector.right, tags)
    )
  }
}

// ── Boolean value parser (shared with flag fields) ────────────────────────────

const parseBooleanValue = (value: string): boolean | null => {
  const cleaned = value.trim().toLowerCase()
  if (cleaned === 'true' || cleaned === 'on') return true
  if (cleaned === 'false' || cleaned === 'off') return false
  return null
}

// ── Prefix token parsing for stat lists ──────────────────────────────────────

type StatListPrefix = 'add' | 'remove' | 'none'
type PrefixedStatToken = { prefix: StatListPrefix; value: string }

const parseStatPrefixedToken = (raw: string): PrefixedStatToken => {
  const t = raw.trim()
  if (t.startsWith('+')) return { prefix: 'add',    value: t.slice(1).trim() }
  if (t.startsWith('-')) return { prefix: 'remove', value: t.slice(1).trim() }
  return { prefix: 'none', value: t }
}

const classifyStatListMode = (tokens: PrefixedStatToken[]): 'replace' | 'mutate' | 'ignore' => {
  const hasNone     = tokens.some((t) => t.prefix === 'none')
  const hasPrefixed = tokens.some((t) => t.prefix !== 'none')
  if (hasNone && hasPrefixed) return 'ignore'
  return hasNone ? 'replace' : 'mutate'
}

// Collect comma-separated stat tokens after the first token was consumed.
const consumeStatListRemainder = (cursor: TokenCursor): string[] => {
  const extras: string[] = []
  while (cursor.consumeSymbol(',')) {
    let prefix = ''
    let next = cursor.peek()
    // `+` is tokenized as a symbol; peek past it when followed by a word.
    if (next?.kind === 'symbol' && next.value === '+') {
      const wordTok = cursor.peek(1)
      if (wordTok?.kind === 'word' || wordTok?.kind === 'string') {
        cursor.next(); prefix = '+'; next = wordTok
      }
    }
    if (!next || (next.kind !== 'word' && next.kind !== 'string')) break
    cursor.next()
    extras.push(prefix + next.value)
  }
  return extras
}

// ── $count / $value expression parser ────────────────────────────────────────

// True when the cursor is at a hard stop that terminates an expression:
//   `}` closes the current selector block; `,` is an operation separator;
//   a word followed by `=` opens a new field assignment.
const isCountExprStop = (cursor: TokenCursor): boolean => {
  const t = cursor.peek()
  if (!t) return true
  if (t.kind === 'symbol' && (t.value === '}' || t.value === ',')) return true
  // Word directly followed by `=` means a new assignment is starting.
  if (t.kind === 'word' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=') return true
  return false
}

// addExpr → mulExpr (('+' | '-') mulExpr)*
// '+' is a symbol; '-' arrives as a word token when space-separated.
const parseCountAddExpr = (cursor: TokenCursor): SafeguardCountAstNode | null => {
  let left = parseCountMulExpr(cursor)
  if (!left) return null
  while (!isCountExprStop(cursor)) {
    const t = cursor.peek()
    if (!t) break
    const isPlus  = t.kind === 'symbol' && t.value === '+'
    const isMinus = t.kind === 'word'   && t.value === '-'
    if (!isPlus && !isMinus) break
    cursor.next()
    const right = parseCountMulExpr(cursor)
    if (!right) break
    left = { kind: 'binop', op: isPlus ? '+' : '-', left, right }
  }
  return left
}

// mulExpr → unaryExpr (('*' | '/') unaryExpr)*
// Both '*' and '/' are symbol tokens (with or without surrounding spaces).
const parseCountMulExpr = (cursor: TokenCursor): SafeguardCountAstNode | null => {
  let left = parseCountUnary(cursor)
  if (!left) return null
  while (!isCountExprStop(cursor)) {
    const t = cursor.peek()
    if (!t) break
    const isMul = t.kind === 'symbol' && t.value === '*'
    const isDiv = t.kind === 'symbol' && t.value === '/'
    if (!isMul && !isDiv) break
    cursor.next()
    const right = parseCountUnary(cursor)
    if (!right) break
    left = { kind: 'binop', op: isMul ? '*' : '/', left, right }
  }
  return left
}

// unaryExpr → '-' unaryExpr | primary
// Unary minus appears as a standalone word token (space-separated), e.g. `- $count`.
// Combined forms like `-2` are handled as negative literals in parsePrimary.
const parseCountUnary = (cursor: TokenCursor): SafeguardCountAstNode | null => {
  if (isCountExprStop(cursor)) return null
  const t = cursor.peek()
  if (!t) return null
  if (t.kind === 'word' && t.value === '-') {
    cursor.next()
    const operand = parseCountUnary(cursor)
    if (!operand) return null
    return { kind: 'unary', op: '-', operand }
  }
  return parseCountPrimary(cursor)
}

// primary → '(' expr ')' | $count('.' TOKEN)? | $value('.' TOKEN)? | NUMBER
const parseCountPrimary = (cursor: TokenCursor): SafeguardCountAstNode | null => {
  if (isCountExprStop(cursor)) return null
  const t = cursor.peek()
  if (!t) return null
  // Parenthesized sub-expression.
  if (t.kind === 'symbol' && t.value === '(') {
    cursor.next()
    const inner = parseCountAddExpr(cursor)
    cursor.consumeSymbol(')')   // tolerate missing close paren
    return inner
  }
  // Only word tokens are valid primaries beyond parens.
  if (t.kind !== 'word') return null
  const lc = t.value.toLowerCase()
  // $count / $value self-reference (no dot suffix).
  if (lc === '$count' || lc === '$value') {
    cursor.next()
    return { kind: 'ref', sliderId: null }
  }
  // $count.TOKEN / $value.TOKEN cross-slider reference.
  if (lc.startsWith('$count.') || lc.startsWith('$value.')) {
    cursor.next()
    const sliderId = t.value.slice(t.value.indexOf('.') + 1) || null
    return { kind: 'ref', sliderId }
  }
  // Numeric literal (may be negative like '-2' as a single word token without spaces).
  const n = Number(t.value)
  if (Number.isFinite(n)) {
    cursor.next()
    return { kind: 'literal', value: n }
  }
  // Unknown token — stop without consuming (let outer loop handle it).
  return null
}

/**
 * Parse a full `count` expression from the cursor (cursor is positioned at the first
 * value token, before it has been consumed). Handles literals, slider refs, arithmetic,
 * and parentheses. Returns the AST node, or null if parsing fails.
 */
const parseCountExpression = (cursor: TokenCursor): SafeguardCountAstNode | null => {
  if (isCountExprStop(cursor)) return null
  return parseCountAddExpr(cursor)
}

// ── $count / $value expression evaluator ─────────────────────────────────────

/**
 * Evaluate a SafeguardCountAstNode to a number.
 * @param selfValue  The enclosing slider's current numeric value (for bare $count/$value refs).
 * @param tokenMap   Map from slider explicit-token → slider current value (for cross-slider refs).
 */
const evalCountAst = (
  node: SafeguardCountAstNode,
  selfValue: number,
  tokenMap: ReadonlyMap<string, number>,
): number => {
  switch (node.kind) {
    case 'literal': return node.value
    case 'ref':     return node.sliderId === null
      ? selfValue
      : (tokenMap.get(node.sliderId) ?? 1)
    case 'unary':   return -evalCountAst(node.operand, selfValue, tokenMap)
    case 'binop': {
      const l = evalCountAst(node.left,  selfValue, tokenMap)
      const r = evalCountAst(node.right, selfValue, tokenMap)
      if (node.op === '+') return l + r
      if (node.op === '-') return l - r
      if (node.op === '*') return l * r
      // Division: guard zero denominator by returning the left operand unchanged.
      return r !== 0 ? l / r : l
    }
  }
}

// ── Operations parser ─────────────────────────────────────────────────────────

/** Parse safeguard-overrides operation assignments inside a `{ … }` block. */
const parseOperations = (cursor: TokenCursor): SafeguardOverridesOperation[] => {
  const operations: SafeguardOverridesOperation[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    // Close the block.
    if (token.kind === 'symbol' && token.value === '}') { cursor.next(); break }
    // Skip optional commas between assignments.
    if (token.kind === 'symbol' && token.value === ',') { cursor.next(); continue }
    if (token.kind !== 'word') { cursor.next(); continue }
    const field = token.value.toLowerCase()
    cursor.next()
    // Require `=` after the field name.
    if (!cursor.consumeSymbol('=')) { if (cursor.peek()) cursor.next(); continue }

    // ── count = <expr> (full expression parser, no pre-consumed value token) ───
    // Intercept before the generic value-reading path so the expression parser
    // sees the full token stream (including opening `(` and cross-slider refs).
    if (field === 'count') {
      const ast = parseCountExpression(cursor)
      if (ast !== null) {
        if (ast.kind === 'literal') {
          // Plain numeric literal: apply rounding at parse time, clamp to ≥1.
          const n = Math.max(1, Math.round(ast.value))
          operations.push({ kind: 'count', value: n })
        } else if (ast.kind === 'ref' && ast.sliderId === null) {
          // Bare $count / $value self-reference: use legacy null form for compat.
          operations.push({ kind: 'count', value: null })
        } else {
          // Complex expression or cross-slider ref: store AST for resolve-time eval.
          operations.push({ kind: 'count', value: null, ast })
        }
      }
      continue
    }

    // `+` may prefix a value token (e.g. `substats = +ATK%`).
    let valueToken = cursor.peek()
    let valuePrefix = ''
    if (valueToken?.kind === 'symbol' && valueToken.value === '+') {
      const wordTok = cursor.peek(1)
      if (wordTok?.kind === 'word' || wordTok?.kind === 'string') {
        cursor.next(); valuePrefix = '+'; valueToken = wordTok
      }
    }
    // `$value` starts with `$` which is a word character — accept it directly.
    if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) {
      if (valueToken) cursor.next(); continue
    }
    cursor.next()
    const valueRaw = valuePrefix + valueToken.value
    const valueLc  = valueRaw.trim().toLowerCase()

    // ── activation = off | protect_existing | anticipate_gaps ────────────────
    if (field === 'activation') {
      const act = ACTIVATION_KEYWORD_MAP[valueLc]
      if (act) operations.push({ kind: 'activation', value: act })
      continue
    }

    // ── boolean flag fields ───────────────────────────────────────────────────
    const boolValue = parseBooleanValue(valueLc)
    if (boolValue !== null) {
      if (field === 'ignprev')     { operations.push({ kind: 'ignPrev',               value: boolValue }); continue }
      if (field === 'igncoll')     { operations.push({ kind: 'ignEquippedCollection', value: boolValue }); continue }
      if (field === 'ignvault')    { operations.push({ kind: 'ignEquippedVault',       value: boolValue }); continue }
      if (field === 'perfaction')  { operations.push({ kind: 'perFaction',   value: boolValue }); continue }
      if (field === 'permainstat') { operations.push({ kind: 'perMainStat',  value: boolValue }); continue }
      if (field === 'perslot')     { operations.push({ kind: 'perSlot',      value: boolValue }); continue }
      if (field === 'perset')      { operations.push({ kind: 'perSet',       value: boolValue }); continue }
      if (field === 'perrule')     { operations.push({ kind: 'perRule',      value: boolValue }); continue }
    }

    // ── substats = [+|-]stat, … ───────────────────────────────────────────────
    if (field === 'substats') {
      const rawTokens = [valueRaw, ...consumeStatListRemainder(cursor)]
      const parsed = rawTokens.map(parseStatPrefixedToken)
      const listMode = classifyStatListMode(parsed)
      if (listMode === 'ignore') continue
      const resolve = (name: string): StatVariant | undefined => variantFromLabel(name) ?? undefined
      if (listMode === 'replace') {
        const stats = parsed.map((t) => resolve(t.value)).filter((v): v is StatVariant => v != null)
        if (stats.length > 0) operations.push({ kind: 'substats', mode: 'replace', stats })
      } else {
        const add: StatVariant[] = []
        const remove: StatVariant[] = []
        for (const t of parsed) {
          const v = resolve(t.value)
          if (v == null) continue
          if (t.prefix === 'remove') remove.push(v); else add.push(v)
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'substats', mode: 'mutate', add, remove })
      }
      continue
    }

    // ── substatmatch = 1|2|3|4|persubstat ────────────────────────────────────
    if (field === 'substatmatch') {
      const matchVal = SUBSTAT_MATCH_KEYWORD_MAP[valueLc]
      if (matchVal) operations.push({ kind: 'substatMatch', value: matchVal })
      continue
    }

    // ── weight.<statKey> = number ─────────────────────────────────────────────
    if (field.startsWith('weight.')) {
      const statKey = field.slice('weight.'.length).trim()
      if (!statKey) continue
      const variant = variantFromLabel(statKey)
      if (variant == null) continue
      const numeric = Number.parseFloat(valueLc)
      if (!Number.isFinite(numeric)) continue
      // Clamp to the allowed weight range (step precision is a UI concern).
      const clamped = Math.max(
        SAFEGUARD_WEIGHT_MIN,
        Math.min(SAFEGUARD_WEIGHT_MAX, Math.round(numeric / SAFEGUARD_WEIGHT_STEP) * SAFEGUARD_WEIGHT_STEP),
      )
      operations.push({ kind: 'substatWeight', stat: variant, value: clamped })
      continue
    }

    // ── improvchance = off | disabled | <N> [<N4> [<N8> [<N12>]]] ──────────────
    // Supported values:
    //   off / false / disabled  → disable the feature (null)
    //   1–4 space-separated numbers → thresholds for upgrade stages 0, 4, 8, 12.
    //                                 Omitted stages inherit the previous stage's value (null).
    if (field === 'improvchance') {
      if (valueLc === 'off' || valueLc === 'false' || valueLc === 'disabled') {
        operations.push({ kind: 'improvementChance', value: null })
      } else {
        const pct0 = Number.parseFloat(valueLc)
        if (Number.isFinite(pct0)) {
          const clampPct = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10
          // Consume additional space-separated number tokens for level-4, 8, 12.
          // Stop at any token that looks like a new field assignment (word followed by `=`).
          const tryConsumePercent = (): number | null => {
            const t = cursor.peek()
            if (!t || t.kind !== 'word') return null
            if (cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=') return null
            const n = Number.parseFloat(t.value)
            if (!Number.isFinite(n)) return null
            cursor.next()
            return n
          }
          const raw4 = tryConsumePercent()
          const raw8 = raw4 !== null ? tryConsumePercent() : null
          const raw12 = raw8 !== null ? tryConsumePercent() : null
          operations.push({ kind: 'improvementChance', value: {
            atLevel0:  clampPct(pct0),
            atLevel4:  raw4  !== null ? clampPct(raw4)  : null,
            atLevel8:  raw8  !== null ? clampPct(raw8)  : null,
            atLevel12: raw12 !== null ? clampPct(raw12) : null,
          } })
        }
      }
      continue
    }
  }
  return operations
}

// ── Selector block parser ─────────────────────────────────────────────────────

/** Parse a single `@selector { … }` block using the tag-only selector parser. */
function parseSelectorBlock(cursor: TokenCursor): SafeguardOverridesSelectorBlock | null {
  // Collect tokens up to the opening `{` and advance past it.
  const selectorTokens = collectSelectorTokensAndOpenBlock(cursor)
  if (!selectorTokens) return null
  const selector = parseTagSelector(selectorTokens)
  const operations = parseOperations(cursor)
  if (!selector || operations.length === 0) return null
  return { selector, operations }
}

// ── Internal parsed types (parameterized shared types) ───────────────────────

type ParsedSgOption = ParsedOverridesOption<NoteTagSelector, SafeguardOverridesOperation>
type ParsedSgQuestion = ParsedOverridesQuestion<NoteTagSelector, SafeguardOverridesOperation>
type ParsedSgEntry = { index: number; question: ParsedSgQuestion }

// ── Answer type ───────────────────────────────────────────────────────────────

/** Stored answers keyed by question ID. Slider answers are `['<number>']`. */
export type NoteSafeguardOverridesAnswers = Record<string, string[]>

// ── Autosave key ──────────────────────────────────────────────────────────────

export const NOTE_SAFEGUARD_OVERRIDES_ANSWERS_KEY = 'NoteSafeguardOverridesAnswers'

// ── Public question definition types ─────────────────────────────────────────

/** A single rendered option shown in the NoteDialog UI. */
export type SafeguardNoteQuestionOption = {
  id: string
  label: string
  detail: string | null
  blocks: SafeguardOverridesSelectorBlock[]
  fallbackBlocks: SafeguardOverridesSelectorBlock[]
  isDefault: boolean
  token: string
  groupType: NoteQuestionGroupType
  /** Only populated for slider groups. */
  sliderMin?: number
  sliderMax?: number
  sliderStep?: number
  sliderDefault?: number
}

/** A group within a rendered question (single / multi / slider). */
export type SafeguardNoteQuestionGroup = {
  id: string
  type: NoteQuestionGroupType
  options: SafeguardNoteQuestionOption[]
  fallback: { blocks: SafeguardOverridesSelectorBlock[] } | null
}

/** Fully resolved question definition used by the NoteDialog UI. */
export type SafeguardNoteQuestionDefinition = {
  id: string
  index: number
  prompt: string
  layoutColumns: number
  groups: SafeguardNoteQuestionGroup[]
  options: SafeguardNoteQuestionOption[]
  fallback: { blocks: SafeguardOverridesSelectorBlock[] } | null
  defaultAnswer: string[]
  answer: string[]
}

// ── Constraint helpers ────────────────────────────────────────────────────────

const resolveOptionIdsFromTokens = (
  tokens: string[],
  globalExplicitTokenMap: Map<string, string>,
  implicitTokenMap: Map<string, string>,
): string[] => {
  const seen = new Set<string>()
  const resolved: string[] = []
  tokens.forEach((token) => {
    const id = globalExplicitTokenMap.get(token) ?? implicitTokenMap.get(token)
    if (!id || seen.has(id)) return
    seen.add(id)
    resolved.push(id)
  })
  return resolved
}

const mergeOptionIdLists = (...lists: string[][]): string[] => {
  const seen = new Set<string>()
  const merged: string[] = []
  lists.forEach((list) => list.forEach((id) => {
    if (seen.has(id)) return
    seen.add(id)
    merged.push(id)
  }))
  return merged
}

// ── Group builder ─────────────────────────────────────────────────────────────

const buildQuestionGroups = (
  parsedOptions: ParsedSgOption[],
  resolvedById: Map<string, SafeguardNoteQuestionOption>,
): SafeguardNoteQuestionGroup[] => {
  const groupMap = new Map<NoteQuestionGroupType, SafeguardNoteQuestionGroup>()
  const groupOrder: SafeguardNoteQuestionGroup[] = []
  parsedOptions.forEach((parsed) => {
    const resolved = resolvedById.get(parsed.id)
    if (!resolved) return
    let group = groupMap.get(resolved.groupType)
    if (!group) {
      group = { id: resolved.groupType, type: resolved.groupType, options: [], fallback: null }
      groupMap.set(resolved.groupType, group)
      groupOrder.push(group)
    }
    if (parsed.fallbackBlocks.length > 0) {
      const fallback = group.fallback ?? { blocks: [] }
      fallback.blocks.push(...parsed.fallbackBlocks)
      group.fallback = fallback.blocks.length > 0 ? fallback : null
    }
    group.options.push(resolved)
  })
  return groupOrder
}

// ── Question resolution ───────────────────────────────────────────────────────

const buildResolvedQuestion = (
  entry: ParsedSgEntry,
  answers: NoteSafeguardOverridesAnswers | null | undefined,
  globalExplicitTokenMap: Map<string, string>,
): SafeguardNoteQuestionDefinition => {
  const { question, index } = entry
  const implicitTokenMap = buildQuestionImplicitTokenMap(question.options)
  // Resolve options to the public option type.
  const options: SafeguardNoteQuestionOption[] = question.options.map((option) => {
    const token = option.explicitToken ?? option.implicitToken ?? ''
    // Resolve constraint tokens to option IDs for set/unset/excl.
    const resolveTokens = (tokens: string[]) => resolveOptionIdsFromTokens(tokens, globalExplicitTokenMap, implicitTokenMap)
    // Constraint tokens are parsed but not applied in rendering;
    // they're kept so the NoteDialog can handle set/unset animations if needed.
    const _ = mergeOptionIdLists(resolveTokens(option.setTokens), resolveTokens(option.unsetTokens), resolveTokens(option.excludedTokens))
    void _  // consumed only to satisfy linter (unused)
    const result: SafeguardNoteQuestionOption = {
      id: option.id,
      label: option.label,
      detail: option.detail,
      blocks: option.blocks,
      fallbackBlocks: option.fallbackBlocks,
      isDefault: option.isDefault,
      token,
      groupType: option.groupType,
    }
    // Propagate slider params for slider group options.
    if (option.groupType === 'slider' && option.sliderParams) {
      result.sliderMin     = option.sliderParams.min
      result.sliderMax     = option.sliderParams.max
      result.sliderStep    = option.sliderParams.step
      result.sliderDefault = option.sliderParams.default
    }
    return result
  })
  const resolvedById = new Map(options.map((o) => [o.id, o]))
  const groups = buildQuestionGroups(question.options, resolvedById)
  // Compute default answers from per-group defaults.
  const defaultAnswer: string[] = []
  groups.forEach((group) => {
    if (group.type === 'single') {
      const first = group.options.find((opt) => opt.isDefault)
      if (first) defaultAnswer.push(first.id)
      return
    }
    if (group.type === 'multi') {
      group.options.forEach((opt) => { if (opt.isDefault) defaultAnswer.push(opt.id) })
      return
    }
    // Slider: default answer is the numeric default value as a string, not the option id.
    const sliderOpt = group.options[0]
    if (sliderOpt) defaultAnswer.push(String(sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1))
  })
  const id = question.questionId
  const storedAnswer = answers ? answers[id] : undefined
  // Migrate legacy IDs (legacy IDs = current IDs for now; kept for future proofing).
  const migratedAnswer = Array.isArray(storedAnswer) ? storedAnswer : undefined
  // Apply the stored answer or fall back to defaults.
  const answer = resolveAnswer({ groups, options, defaultAnswer }, migratedAnswer)
  return { id, index, prompt: question.prompt, layoutColumns: question.layoutColumns, groups, options, fallback: question.fallback, defaultAnswer, answer }
}

// Resolve stored or default answers against the current option set.
const resolveAnswer = (
  question: Pick<SafeguardNoteQuestionDefinition, 'groups' | 'options' | 'defaultAnswer'>,
  stored: string[] | undefined,
): string[] => {
  const allowed = new Set(question.options.map((o) => o.id))
  const hasStored = Array.isArray(stored)
  const filtered = hasStored ? stored.filter((id) => allowed.has(id)) : []
  const next: string[] = []
  question.groups.forEach((group) => {
    const storedForGroup = filtered.filter((id) => group.options.some((o) => o.id === id))
    if (group.type === 'single') {
      if (storedForGroup.length > 0) { next.push(storedForGroup[0]!); return }
      const defaultId = question.defaultAnswer.find((id) => group.options.some((o) => o.id === id))
      if (defaultId) next.push(defaultId)
      return
    }
    if (group.type === 'slider') {
      // Slider answer is a raw numeric string, not an option id — bypass id validation.
      const sliderOpt = group.options[0]
      if (!sliderOpt) return
      const defaultNum = sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1
      const rawNum = hasStored ? stored.find((v) => Number.isFinite(Number.parseFloat(v))) : undefined
      next.push(rawNum !== undefined ? rawNum : String(defaultNum))
      return
    }
    // multi group
    if (storedForGroup.length > 0) { next.push(...storedForGroup); return }
    if (hasStored) return
    question.defaultAnswer
      .filter((id) => group.options.some((o) => o.id === id))
      .forEach((id) => next.push(id))
  })
  return next
}

// ── Marker regex ──────────────────────────────────────────────────────────────

const SAFEGUARD_QUESTION_MARKER_REGEX = new RegExp(
  `<!--\\s*${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}\\b[\\s\\S]*?-->`,
  'gi',
)

// ── Public parse function ─────────────────────────────────────────────────────

/** Parse all `<!-- safeguard-overrides … -->` markers in the note text. */
export const parseNoteSafeguardOverrides = (
  note: string,
  answers?: NoteSafeguardOverridesAnswers | null,
): SafeguardNoteQuestionDefinition[] => {
  if (!note) return []
  const parsedEntries: ParsedSgEntry[] = []
  SAFEGUARD_QUESTION_MARKER_REGEX.lastIndex = 0
  let markerIndex = 0
  for (const match of note.matchAll(SAFEGUARD_QUESTION_MARKER_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) { markerIndex += 1; continue }
    const inner = stripCommentWrapper(raw)
    const parsed = parseOverridesMarkerBody<NoteTagSelector, SafeguardOverridesOperation>(
      inner,
      [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD],
      parseSelectorBlock,
    )
    if (!parsed) { markerIndex += 1; continue }
    parsedEntries.push({ index: markerIndex, question: parsed })
    markerIndex += 1
  }
  const globalExplicitTokenMap = buildGlobalExplicitTokenMap(parsedEntries)
  return parsedEntries.map((entry) => buildResolvedQuestion(entry, answers, globalExplicitTokenMap))
}

// ── Resolution types ──────────────────────────────────────────────────────────

/** A single resolved instruction ready for applySafeguardOverrides. */
export type SafeguardOverridesInstruction = {
  selector: NoteTagSelector
  operations: SafeguardOverridesOperation[]
}

/** Output of resolveNoteSafeguardOverridesTags. */
export type SafeguardOverridesResolution = {
  questions: SafeguardNoteQuestionDefinition[]
  instructions: SafeguardOverridesInstruction[]
}

// ── Resolution function ───────────────────────────────────────────────────────

/**
 * Resolve active selector blocks from the current note + answers, producing
 * an ordered list of instructions to pass to applySafeguardOverrides.
 */
export const resolveNoteSafeguardOverridesTags = (
  note: string,
  answers?: NoteSafeguardOverridesAnswers | null,
): SafeguardOverridesResolution => {
  const questions = parseNoteSafeguardOverrides(note, answers)
  // Build a token → current slider value map used by cross-slider $count.TOKEN references.
  // Only sliders with an explicit id=TOKEN marker contribute to this map.
  const sliderValueByToken = new Map<string, number>()
  for (const question of questions) {
    for (const option of question.options) {
      if (option.groupType !== 'slider' || !option.token) continue
      const raw = answers?.[question.id]?.[0] ?? ''
      const val = Number.parseFloat(raw)
      const def = option.sliderDefault ?? option.sliderMin ?? 1
      sliderValueByToken.set(option.token, Number.isFinite(val) ? val : def)
    }
  }
  const instructions: SafeguardOverridesInstruction[] = []
  for (const question of questions) {
    const selected = new Set(question.answer)
    const groupFallbackApplied = new Set<string>()
    question.groups.forEach((group) => {
      // Slider groups are always "selected"; only radio/checkbox groups need id matching.
      const hasSelection = group.type === 'slider' || group.options.some((opt) => selected.has(opt.id))
      if (!hasSelection && group.fallback && !groupFallbackApplied.has(group.id)) {
        groupFallbackApplied.add(group.id)
        group.fallback.blocks.forEach((block) => instructions.push(block))
      }
    })
    // Emit blocks from selected options; slider options are always active (their answer is numeric).
    for (const option of question.options) {
      if (option.groupType !== 'slider' && !selected.has(option.id)) continue
      // For slider groups: resolve $count / $value (and arithmetic ASTs) to numeric counts.
      if (option.groupType === 'slider') {
        const numericStr = answers?.[question.id]?.[0] ?? ''
        const sliderValue = Number.parseFloat(numericStr)
        const defaultValue = option.sliderDefault ?? 1
        const resolvedValue = Number.isFinite(sliderValue) ? sliderValue : defaultValue
        for (const block of option.blocks) {
          const resolvedOps = block.operations.map((op) => {
            // Resolve null-valued count ops: evaluate the AST if present, otherwise use
            // the raw slider position (legacy $count / $value bare reference).
            if (op.kind === 'count' && op.value === null) {
              const rawResult = op.ast
                ? evalCountAst(op.ast, resolvedValue, sliderValueByToken)
                : resolvedValue
              // Emit a resolved count op with no ast — the expression has been evaluated to a literal.
              return { kind: 'count' as const, value: Math.max(1, Math.min(9999, Math.round(rawResult))) }
            }
            return op
          })
          if (resolvedOps.length > 0) instructions.push({ selector: block.selector, operations: resolvedOps })
        }
        continue
      }
      for (const block of option.blocks) instructions.push(block)
    }
    // Apply question-level fallback when no options anywhere are selected.
    if (selected.size === 0 && question.fallback) {
      question.fallback.blocks.forEach((block) => instructions.push(block))
    }
  }
  return { questions, instructions }
}

// ── Apply overrides ───────────────────────────────────────────────────────────

/**
 * Apply a list of resolved instructions to a set of safeguard rules.
 * Returns a new array; only rules affected by at least one matching instruction
 * are cloned — unaffected rules are returned by reference.
 */
export const applySafeguardOverrides = (
  rules: readonly SafeguardRule[],
  instructions: readonly SafeguardOverridesInstruction[],
): readonly SafeguardRule[] => {
  if (instructions.length === 0) return rules
  // Track which rules have been cloned to avoid double-cloning.
  const cloned = new Map<number, SafeguardRule>()
  const getClone = (index: number): SafeguardRule => {
    const existing = cloned.get(index)
    if (existing) return existing
    const clone = cloneSafeguardRule(rules[index]!)
    cloned.set(index, clone)
    return clone
  }
  for (const instruction of instructions) {
    const { selector, operations } = instruction
    // Match selector against each rule's tags.
    rules.forEach((rule, index) => {
      const tags = rule.tags ?? []
      if (!matchesTagSelectorForRule(selector, tags)) return
      const clone = getClone(index)
      for (const op of operations) {
        switch (op.kind) {
          case 'activation':
            clone.activation = op.value
            break
          case 'count':
            // null values are resolved before reaching here (in resolveNoteSafeguardOverridesTags).
            if (op.value !== null) clone.requiredCount = Math.max(1, op.value)
            break
          case 'ignPrev':
            clone.ignorePreviousSafeguards = op.value
            break
          case 'ignEquippedCollection':
            clone.ignoreEquippedInCollection = op.value
            break
          case 'ignEquippedVault':
            clone.ignoreEquippedInVault = op.value
            break
          case 'perFaction':
            clone.countMode = { ...clone.countMode, perFaction: op.value }
            break
          case 'perMainStat':
            clone.countMode = { ...clone.countMode, perMainStat: op.value }
            break
          case 'perSlot':
            clone.countMode = { ...clone.countMode, perSlot: op.value }
            break
          case 'perSet':
            clone.countMode = { ...clone.countMode, perSet: op.value }
            break
          case 'perRule':
            clone.countMode = { ...clone.countMode, perRule: op.value }
            break
          case 'substats':
            if (op.mode === 'replace') {
              clone.substats = [...op.stats]
            } else {
              const current = new Set(clone.substats)
              op.remove.forEach((s) => current.delete(s))
              op.add.forEach((s) => current.add(s))
              clone.substats = [...current]
            }
            // Re-normalize substat-dependent fields after any substats change.
            cloned.set(index, normalizeSafeguardSubstatDependents(clone))
            break
          case 'substatMatch':
            clone.substatMatch = op.value
            break
          case 'substatWeight': {
            const weights = { ...clone.substatWeights }
            if (op.value === SAFEGUARD_WEIGHT_DEFAULT) {
              delete weights[op.stat]
            } else {
              weights[op.stat] = op.value
            }
            // Prune weights for stats not in the current substat selection.
            clone.substatWeights = pruneSafeguardsSubstatWeights(weights, clone.substats)
            break
          }
          case 'improvementChance':
            clone.improvementChanceThreshold = op.value
            break
        }
      }
    })
  }
  if (cloned.size === 0) return rules
  // Build the output array, substituting clones where needed.
  return rules.map((rule, index) => cloned.get(index) ?? rule)
}

// ── Single-rule effective resolution (for builder UI diff) ───────────────────

/**
 * Resolve a single SafeguardRule against override instructions to produce the
 * "effective" rule as it will behave at detection time. Used by SafeguardBuilderPanel
 * to compare stored vs effective field values and show override warning badges.
 */
export const resolveEffectiveSafeguardRule = (
  rule: SafeguardRule,
  instructions: readonly SafeguardOverridesInstruction[],
): SafeguardRule => applySafeguardOverrides([rule], instructions)[0]!

// ── Signature ─────────────────────────────────────────────────────────────────

/** Build a stable hash of the safeguard-overrides section for change detection. */
export const buildNoteSafeguardOverridesSignature = (note: string): string => {
  const questions = parseNoteSafeguardOverrides(note)
  const sig = questions.map((q) => [q.id, q.layoutColumns])
  return JSON.stringify(sig)
}

// ── Answer management ─────────────────────────────────────────────────────────

/** Remove answers that no longer map to valid question IDs in the current note. */
export const pruneNoteSafeguardOverridesAnswers = (
  note: string,
  answers: NoteSafeguardOverridesAnswers,
): NoteSafeguardOverridesAnswers => {
  const questions = parseNoteSafeguardOverrides(note)
  const validIds = new Set(questions.map((q) => q.id))
  const next: NoteSafeguardOverridesAnswers = {}
  for (const [key, value] of Object.entries(answers)) {
    if (!validIds.has(key)) continue
    next[key] = Array.isArray(value) ? value : []
  }
  return next
}

/** Normalize a raw autosave payload into a valid answers map. */
export const normalizeNoteSafeguardOverridesAnswers = (
  raw: unknown,
): NoteSafeguardOverridesAnswers | null => {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const next: NoteSafeguardOverridesAnswers = {}
  for (const [key, value] of Object.entries(rec)) {
    const list = Array.isArray(value)
      ? value.map(String).filter((s) => s.trim().length > 0)
      : (typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [])
    const keepEmpty = Array.isArray(value) && value.length === 0
    if (list.length === 0 && !keepEmpty) continue
    next[key] = list
  }
  return Object.keys(next).length > 0 ? next : null
}
