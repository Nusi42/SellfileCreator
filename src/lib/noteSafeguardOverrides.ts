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
import type { StatVariant, RankValue, FactionId } from './types'
import type { RecipeOverridesSelectorBlock, RecipeOverridesInstructions, RecipeOverridesOperation } from './noteRecipeOverrides'
// Runtime imports for cross-domain parsing — safe for circular use since only called inside function bodies.
// parseRecipeSelectorBlockCross enables $count/$value in numeric recipe ops inside slider questions.
// clampRankCode is the SSOT for [1,6] integer rank clamping used at AST resolve time.
import { parseRecipeSelectorBlockCross, clampRankCode } from './noteRecipeOverrides'
import { variantFromLabel } from './types'
import type { SafeguardRule, SafeguardImprovementChanceLevelThresholds } from './safeguards'
import {
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  cloneSafeguardRule,
  normalizeSafeguardSubstatDependents,
  pruneSafeguardsSubstatWeights,
  factionIdByName,
  rarityCodeByName,
} from './safeguards'
import { isAccessorySlot, ACCESSORY_SLOT_IDS } from './gearInspectorDomain'
import {
  SAFEGUARD_WEIGHT_MIN,
  SAFEGUARD_WEIGHT_MAX,
  SAFEGUARD_WEIGHT_STEP,
  SAFEGUARD_WEIGHT_DEFAULT,
} from './generated/domainConstants'
import {
  type DiagnosticSpan,
  type NoteQuestionGroupType,
  type NoteTagSelector,
  type NoteCountAstNode,
  type ParsedOverridesOption,
  type ParsedOverridesQuestion,
  TokenCursor,
  stripCommentWrapper,
  parseTagSelector,
  parseCountExpression,
  evalCountAst,
  collectSelectorTokensAndOpenBlock,
  parseOverridesMarkerBody,
  parseOverridesMarkerSpacerColumns,
  buildGlobalExplicitTokenMap,
  buildQuestionImplicitTokenMap,
} from './noteOverridesParser'

// Backward-compatible alias for external callers.
export type SafeguardCountAstNode = NoteCountAstNode

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
  // combination filters: rank/rarity accept integer lists 1–6; faction accepts names.
  'rank', 'rarity', 'faction',
] as const

// ── Operation types ───────────────────────────────────────────────────────────

/** A single override operation targeting one SafeguardRule field. */
export type SafeguardOverridesOperation =
  | { kind: 'activation'; value: SafeguardRuleActivation }
  // count: null means "use the enclosing slider's current value ($count / $value).
  // ast: if present, a full arithmetic expression to evaluate at resolve time.
  | { kind: 'count'; value: number | null; ast?: NoteCountAstNode }
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
  // Combination filter overrides — replace or mutate the rule's rank/rarity/faction arrays.
  | { kind: 'ranks';    mode: 'replace'; values: RankValue[] }
  | { kind: 'ranks';    mode: 'mutate';  add: RankValue[];  remove: RankValue[] }
  | { kind: 'rarities'; mode: 'replace'; values: RankValue[] }
  | { kind: 'rarities'; mode: 'mutate';  add: RankValue[];  remove: RankValue[] }
  | { kind: 'factions'; mode: 'replace'; values: FactionId[] }
  | { kind: 'factions'; mode: 'mutate';  add: FactionId[];  remove: FactionId[] }

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

// Deduplicate and sort a numeric array — shared by ranks, rarities, and factions applier.
const sortDedupNumeric = <T extends number>(arr: T[]): T[] =>
  Array.from(new Set(arr)).sort((a, b) => a - b) as T[]

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

// ── Operations parser ─────────────────────────────────────────────────────────

/** Parse safeguard-overrides operation assignments inside a `{ … }` block. */
const parseOperations = (
  cursor: TokenCursor,
  absoluteOffset = 0,
  diags?: DiagnosticSpan[],
): SafeguardOverridesOperation[] => {
  const operations: SafeguardOverridesOperation[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    // Close the block.
    if (token.kind === 'symbol' && token.value === '}') { cursor.next(); break }
    // Skip optional commas between assignments.
    if (token.kind === 'symbol' && token.value === ',') { cursor.next(); continue }
    if (token.kind !== 'word') {
      if (diags && token.kind === 'symbol' && token.value === '@') {
        const from = absoluteOffset + token.index
        diags.push({ from, to: from + 1, message: `'@' inside an assignment block — write the field name directly (e.g. 'activation=off', not '@activation=off')` })
      }
      cursor.next(); continue
    }
    const field = token.value.toLowerCase()
    cursor.next()
    // Require `=` after the field name.
    if (!cursor.consumeSymbol('=')) {
      if (diags) {
        diags.push({
          from: absoluteOffset + token.index,
          to: absoluteOffset + token.index + token.value.length,
          message: `'${token.value}' — expected '=' after field name`,
        })
      }
      if (cursor.peek()) cursor.next(); continue
    }

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

    // ── rank = [+|-]N, … | rarity = [+|-](N|name), … | faction = [+|-]name, … ──
    // All three fields use the same prefix-list mode (replace / mutate) as substats.
    if (field === 'rank' || field === 'rarity' || field === 'faction') {
      const rawTokens = [valueRaw, ...consumeStatListRemainder(cursor)]
      const parsed = rawTokens.map(parseStatPrefixedToken)
      const listMode = classifyStatListMode(parsed)
      if (listMode === 'ignore') continue
      if (field === 'rank' || field === 'rarity') {
        // Resolve each token: numeric 1–6 for rank; numeric or named (epic, legendary, …) for rarity.
        const resolve = (name: string): RankValue | null => {
          if (field === 'rarity') {
            const named = rarityCodeByName.get(name.trim().toLowerCase())
            if (named != null) return named
          }
          const n = Number.parseInt(name, 10)
          if (!Number.isFinite(n) || n < 1 || n > 6) return null
          return n as RankValue
        }
        const kind = field === 'rank' ? 'ranks' : 'rarities'
        if (listMode === 'replace') {
          const values = parsed.map((t) => resolve(t.value)).filter((v): v is RankValue => v != null)
          if (values.length > 0) operations.push({ kind, mode: 'replace', values })
        } else {
          const add: RankValue[] = [], remove: RankValue[] = []
          for (const t of parsed) {
            const v = resolve(t.value)
            if (v == null) continue
            if (t.prefix === 'remove') remove.push(v); else add.push(v)
          }
          if (add.length > 0 || remove.length > 0) operations.push({ kind, mode: 'mutate', add, remove })
        }
      } else {
        // faction: resolve each token by name (case-insensitive) or numeric ID.
        const resolve = (name: string): FactionId | null => {
          const byName = factionIdByName.get(name.trim().toLowerCase())
          if (byName != null) return byName
          const n = Number.parseInt(name, 10)
          if (!Number.isFinite(n) || n < 1) return null
          return n as FactionId
        }
        if (listMode === 'replace') {
          const values = parsed.map((t) => resolve(t.value)).filter((v): v is FactionId => v != null)
          if (values.length > 0) operations.push({ kind: 'factions', mode: 'replace', values })
        } else {
          const add: FactionId[] = [], remove: FactionId[] = []
          for (const t of parsed) {
            const v = resolve(t.value)
            if (v == null) continue
            if (t.prefix === 'remove') remove.push(v); else add.push(v)
          }
          if (add.length > 0 || remove.length > 0) operations.push({ kind: 'factions', mode: 'mutate', add, remove })
        }
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

    // ── improvchance = off | disabled | <N> ["," <N4> ["," <N8> ["," <N12>]]] ──
    // Supported values:
    //   off / false / disabled  → disable the feature (null)
    //   1–4 comma-separated numbers → thresholds for upgrade stages 0, 4, 8, 12.
    //                                 Omitted stages inherit the previous stage's value (null).
    //   Legacy: space-separated numbers are also accepted for backward compatibility.
    if (field === 'improvchance') {
      if (valueLc === 'off' || valueLc === 'false' || valueLc === 'disabled') {
        operations.push({ kind: 'improvementChance', value: null })
      } else {
        const pct0 = Number.parseFloat(valueLc)
        if (Number.isFinite(pct0)) {
          const clampPct = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10
          // Consume a comma-separated number token for level-4/8/12.
          // Comma is canonical; a bare word token is accepted as legacy (space-separated) fallback.
          // Stop at any token that looks like a new field assignment (word followed by `=`).
          const tryConsumePercent = (): number | null => {
            // Canonical: leading comma.
            if (cursor.peek()?.kind === 'symbol' && cursor.peek()?.value === ',') {
              cursor.next()
              const t = cursor.peek()
              if (!t || t.kind !== 'word') return null
              const n = Number.parseFloat(t.value)
              if (!Number.isFinite(n)) return null
              cursor.next()
              return n
            }
            // Legacy fallback: bare space-separated word (no comma).
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

/**
 * Parse a single safeguard `@selector { … }` block.
 * Exported for use as a cross-domain block parser inside recipe-overrides markers.
 */
export function parseSafeguardSelectorBlock(
  cursor: TokenCursor,
  diags?: DiagnosticSpan[],
  absoluteOffset = 0,
): SafeguardOverridesSelectorBlock | null {
  const selectorTokens = collectSelectorTokensAndOpenBlock(cursor)
  if (!selectorTokens) return null
  const selector = parseTagSelector(selectorTokens, absoluteOffset, diags)
  const operations = parseOperations(cursor, absoluteOffset, diags)
  if (!selector || operations.length === 0) return null
  return { selector, operations }
}

/** Module-internal alias for the selector block parser (passed to shared infrastructure). */
const parseSelectorBlock = parseSafeguardSelectorBlock

/**
 * Parses `rawBlock` (a full `<!-- safeguard-overrides … -->` comment) for
 * structural errors and appends diagnostics to `diags`.  Mirrors the recipe
 * equivalent in noteRecipeOverrides.ts.
 */
export function collectSafeguardOverridesDiagnostics(
  rawBlock: string,
  blockStart: number,
  diags: DiagnosticSpan[],
): void {
  const stripped = stripCommentWrapper(rawBlock)
  const strippedPos = rawBlock.indexOf(stripped)
  const absoluteOffset = blockStart + (strippedPos >= 0 ? strippedPos : 0)

  const diagSelectorBlock = (c: TokenCursor): SafeguardOverridesSelectorBlock | null =>
    parseSafeguardSelectorBlock(c, diags, absoluteOffset)

  // Cross-domain blocks (`recipe @selector { … }`) inside safeguard markers.
  const diagCrossBlock = (c: TokenCursor) => parseRecipeSelectorBlockCross(c)

  parseOverridesMarkerBody<NoteTagSelector, SafeguardOverridesOperation>(
    stripped,
    [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD],
    diagSelectorBlock,
    diagCrossBlock,
    diags,
    absoluteOffset,
  )
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
  // `else` blocks: applied when THIS option is NOT selected (per-option, e.g. an unchecked box).
  fallbackBlocks: SafeguardOverridesSelectorBlock[]
  recipeFallbackBlocks: RecipeOverridesSelectorBlock[]
  // Cross-domain blocks that target recipes when this option is active.
  recipeBlocks: RecipeOverridesSelectorBlock[]
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
  fallback: { blocks: SafeguardOverridesSelectorBlock[]; recipeBlocks: RecipeOverridesSelectorBlock[] } | null
}

/** Fully resolved question definition used by the NoteDialog UI. */
export type SafeguardNoteQuestionDefinition = {
  id: string
  index: number
  prompt: string
  layoutColumns: number
  groups: SafeguardNoteQuestionGroup[]
  options: SafeguardNoteQuestionOption[]
  fallback: { blocks: SafeguardOverridesSelectorBlock[]; recipeBlocks: RecipeOverridesSelectorBlock[] } | null
  defaultAnswer: string[]
  answer: string[]
  // True for body-less spacer markers; card is invisible, width only.
  isSpacer?: true
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
    // Per-option `else` blocks ride on the option (resolved.fallbackBlocks) and apply
    // when that option is unselected — see the resolver. Group-empty defaults use the
    // question-level `fallback` block.
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
      recipeFallbackBlocks: option.crossFallbackBlocks as RecipeOverridesSelectorBlock[],
      recipeBlocks: option.crossBlocks as RecipeOverridesSelectorBlock[],
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
  const fallback = question.fallback
    ? { blocks: question.fallback.blocks, recipeBlocks: question.fallback.crossBlocks as RecipeOverridesSelectorBlock[] }
    : null
  return { id, index, prompt: question.prompt, layoutColumns: question.layoutColumns, groups, options, fallback, defaultAnswer, answer }
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
  // Body-less spacer markers are resolved directly (no question pipeline needed).
  const spacerQuestions: SafeguardNoteQuestionDefinition[] = []
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
      // Cross-domain: `recipe @selector { … }` blocks inside safeguard-overrides markers.
      // parseRecipeSelectorBlockCross circular import is safe — called inside a function body only.
      // Uses the cross-domain variant so $count/$value expressions work inside slider questions.
      (cursor) => parseRecipeSelectorBlockCross(cursor),
    )
    if (!parsed) {
      // No question body — check for a spacer marker (bare marker with optional [columns=N]).
      const spacerColumns = parseOverridesMarkerSpacerColumns(inner, [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD])
      if (spacerColumns !== null) {
        spacerQuestions.push({
          id: `spacer-safeguard-${markerIndex}`,
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
    parsedEntries.push({ index: markerIndex, question: parsed })
    markerIndex += 1
  }
  const globalExplicitTokenMap = buildGlobalExplicitTokenMap(parsedEntries)
  const resolved = parsedEntries.map((entry) => buildResolvedQuestion(entry, answers, globalExplicitTokenMap))
  // Merge spacers into the resolved list in note order.
  return [...resolved, ...spacerQuestions].sort((a, b) => a.index - b.index)
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
  // Cross-domain: recipe instructions emitted by safeguard-overrides questions.
  recipeInstructions: RecipeOverridesInstructions
}

// ── Resolution function ───────────────────────────────────────────────────────

/**
 * Resolve $count / $value AST expressions in numeric recipe cross-domain ops.
 * Placeholder until Step 8 adds `ast?` / nullable `value` fields to recipe ops;
 * for now all recipe ops carry concrete values and pass through unchanged.
 */
// Resolve $count / $value ASTs in numeric recipe cross-block ops using the enclosing
// slider's current value. Ops without a null value (i.e. already concrete) pass through.
const resolveRecipeOpAst = (
  op: RecipeOverridesOperation,
  sliderValue: number,
  tokenMap: ReadonlyMap<string, number>,
): RecipeOverridesOperation => {
  if (op.kind === 'rank' && op.value === null) {
    const raw = op.ast ? evalCountAst(op.ast, sliderValue, tokenMap) : sliderValue
    // Clamp to [1,6] and round to the nearest integer rank code.
    return { kind: 'rank', value: clampRankCode(raw) }
  }
  if (op.kind === 'minRequiredRolls' && op.value === null) {
    const raw = op.ast ? evalCountAst(op.ast, sliderValue, tokenMap) : sliderValue
    return { kind: 'minRequiredRolls', value: Math.max(0, Math.round(raw)) }
  }
  if (op.kind === 'lockedMinRequiredRolls' && op.value === null) {
    const raw = op.ast ? evalCountAst(op.ast, sliderValue, tokenMap) : sliderValue
    return { kind: 'lockedMinRequiredRolls', value: Math.max(0, Math.round(raw)) }
  }
  if (op.kind === 'minSubstats' && op.value === null) {
    const raw = op.ast ? evalCountAst(op.ast, sliderValue, tokenMap) : sliderValue
    return { kind: 'minSubstats', value: Math.max(0, Math.round(raw)) }
  }
  return op
}

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
  const recipeInstructions: RecipeOverridesSelectorBlock[] = []
  for (const question of questions) {
    const selected = new Set(question.answer)
    // Emit blocks from selected options; slider options are always active (their answer is numeric).
    for (const option of question.options) {
      // Unselected non-slider option: emit its per-option `else` blocks instead.
      if (option.groupType !== 'slider' && !selected.has(option.id)) {
        for (const block of option.fallbackBlocks) instructions.push(block)
        for (const block of option.recipeFallbackBlocks) recipeInstructions.push(block)
        continue
      }
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
        // Resolve $count / $value in numeric recipe cross-blocks using the same slider value.
        for (const block of option.recipeBlocks) {
          const resolvedOps = block.operations.map((op) => resolveRecipeOpAst(op, resolvedValue, sliderValueByToken))
          if (resolvedOps.length > 0) recipeInstructions.push({ selector: block.selector, operations: resolvedOps })
        }
        continue
      }
      for (const block of option.blocks) instructions.push(block)
      for (const block of option.recipeBlocks) recipeInstructions.push(block)
    }
    // Apply question-level fallback when no options anywhere are selected.
    if (selected.size === 0 && question.fallback) {
      question.fallback.blocks.forEach((block) => instructions.push(block))
      question.fallback.recipeBlocks.forEach((block) => recipeInstructions.push(block))
    }
  }
  return { questions, instructions, recipeInstructions }
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
          case 'ranks':
            if (op.mode === 'replace') {
              clone.combination.ranks = sortDedupNumeric(op.values)
            } else {
              const s = new Set(clone.combination.ranks)
              op.remove.forEach((v) => s.delete(v)); op.add.forEach((v) => s.add(v))
              clone.combination.ranks = sortDedupNumeric([...s])
            }
            break
          case 'rarities':
            if (op.mode === 'replace') {
              clone.combination.rarities = sortDedupNumeric(op.values)
            } else {
              const s = new Set(clone.combination.rarities)
              op.remove.forEach((v) => s.delete(v)); op.add.forEach((v) => s.add(v))
              clone.combination.rarities = sortDedupNumeric([...s])
            }
            break
          case 'factions': {
            // Apply faction list change, then enforce the slot constraint: a non-empty
            // factions array restricts the rule to accessory slots only.
            if (op.mode === 'replace') {
              clone.combination.factions = sortDedupNumeric(op.values)
            } else {
              const s = new Set(clone.combination.factions)
              op.remove.forEach((v) => s.delete(v)); op.add.forEach((v) => s.add(v))
              clone.combination.factions = sortDedupNumeric([...s])
            }
            if (clone.combination.factions.length > 0) {
              const accessory = clone.combination.slots.filter((s) => isAccessorySlot(s))
              clone.combination.slots = accessory.length > 0
                ? accessory
                : [...ACCESSORY_SLOT_IDS] as typeof clone.combination.slots
            }
            break
          }
        }
      }
    })
  }
  if (cloned.size === 0) return rules
  // Post-override normalization: substat-dependent fields (improvementChanceThreshold,
  // substatMatch, substatWeights) must remain consistent regardless of which ops fired
  // and in what order. Running this once after all instructions are processed is strictly
  // more correct than inline normalization per-op, since it sees the final combined state.
  for (const [index, clone] of cloned) {
    const normalized = normalizeSafeguardSubstatDependents(clone)
    if (normalized !== clone) cloned.set(index, normalized)
  }
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
