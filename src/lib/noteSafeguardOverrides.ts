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
import type {
  RecipeOverridesSelectorBlock, RecipeOverridesInstructions, RecipeOverridesOperation,
  CrossDomainOptionTarget, CrossDomainOptionWrite,
} from './noteRecipeOverrides'
// Runtime imports for cross-domain parsing — safe for circular use since only called inside function bodies.
// parseRecipeSelectorBlockCross enables $count/$value in numeric recipe ops inside slider questions.
// clampRankCode is the SSOT for [1,6] integer rank clamping used at AST resolve time.
import { parseRecipeSelectorBlockCross, clampRankCode } from './noteRecipeOverrides'
import { variantFromLabel, labelOfVariant, rarityCodeFromRankValue, rarityCodeToName, factionCodeToName } from './types'
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
  SAFEGUARD_WEIGHT_DEFAULT,
} from './generated/domainConstants'
import { normalizeGearInspectorSortWeight } from './gearInspectorSort'
import {
  type DiagnosticSpan,
  type NoteQuestionGroupType,
  type NoteTagSelector,
  type NoteCountAstNode,
  type ParsedOverridesOption,
  type ParsedOverridesQuestion,
  type SliderMark,
  type SliderToggle,
  TokenCursor,
  stripCommentWrapper,
  parseTagSelector,
  parseCountExpression,
  evalCountAst,
  collectSelectorTokensAndOpenBlock,
  parseOverridesMarkerBody,
  parseOverridesMarkerSpacerColumns,
  NOTE_OVERRIDES_OPTION_COLUMNS_DEFAULT,
  buildGlobalExplicitTokenMap,
  buildQuestionImplicitTokenMap,
  parseOverridesBooleanValue,
  reportInvalidEnumValue,
  localizeDslDisplay,
} from './noteOverridesParser'

// Backward-compatible alias for external callers.
export type SafeguardCountAstNode = NoteCountAstNode

// Answer sentinel for a slider whose on/off toggle is unchecked. Stored as the slider
// group's answer in place of a numeric value; the resolver then applies the option's
// else block. Shared with the UI so both sides agree on the encoding.
export const SLIDER_TOGGLE_OFF = 'off'

// ── Exported constants (single source of truth for Prism + EBNF) ─────────────

/** HTML comment keyword that triggers safeguard overrides marker parsing. */
export const NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD = 'safeguard-overrides'

/** Valid `activation =` values in the DSL (lowercase surface form). */
export const NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS = [
  'off', 'protect_existing', 'anticipate_gaps', 'anticipate_improvements',
] as const

/** Valid `substatmatch =` values in the DSL. */
export const NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS = [
  '1', '2', '3', '4', 'persubstat',
] as const

/** Bounds applied to resolved `count =` values (apply-side clamp + editor cap SSOT). */
export const NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN = 1
export const NOTE_SAFEGUARD_OVERRIDES_COUNT_MAX = 9999

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
  // dynamic = true means "use the enclosing slider's current value ($value)" — resolved
  // to a flat { atLevel0: <slider>, … } at resolve time; `value` is ignored when dynamic.
  | { kind: 'improvementChance'; value: SafeguardImprovementChanceLevelThresholds | null; dynamic?: boolean }
  // Combination filter overrides — replace or mutate the rule's rank/rarity/faction arrays.
  | { kind: 'ranks';    mode: 'replace'; values: RankValue[] }
  | { kind: 'ranks';    mode: 'mutate';  add: RankValue[];  remove: RankValue[] }
  | { kind: 'rarities'; mode: 'replace'; values: RankValue[] }
  | { kind: 'rarities'; mode: 'mutate';  add: RankValue[];  remove: RankValue[] }
  | { kind: 'factions'; mode: 'replace'; values: FactionId[] }
  | { kind: 'factions'; mode: 'mutate';  add: FactionId[];  remove: FactionId[] }

/**
 * Operation kind → DSL assignment-field token. SSOT for DSL-reconstruction consumers
 * (note-editor option-info tooltip). Exhaustive over the operation union so a new
 * `SafeguardOverridesOperation` kind fails to compile until registered here — keeping
 * it in lock-step with the parser and `NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS`.
 */
export const SAFEGUARD_OVERRIDES_OP_FIELD: Record<SafeguardOverridesOperation['kind'], string> = {
  activation: 'activation',
  count: 'count',
  ignPrev: 'ignprev',
  // Use the real DSL surface tokens (the parser accepts igncoll/ignvault, rank/rarity/faction),
  // not the internal op-kind spellings — otherwise the tooltip reconstructs invalid DSL and the
  // highlighter (which derives from NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS) won't colour them.
  ignEquippedCollection: 'igncoll',
  ignEquippedVault: 'ignvault',
  perFaction: 'perfaction',
  perMainStat: 'permainstat',
  perSlot: 'perslot',
  perSet: 'perset',
  perRule: 'perrule',
  substats: 'substats',
  substatMatch: 'substatmatch',
  substatWeight: 'weight',
  improvementChance: 'improvchance',
  ranks: 'rank',
  rarities: 'rarity',
  factions: 'faction',
}

/** A resolved selector + operations pair, ready for application. */
// Render a mutate add/remove pair as `+a +b -c` note list-mutation syntax.
const formatSgMutateList = (add: string[], remove: string[]): string =>
  [...add.map((x) => `+${x}`), ...remove.map((x) => `-${x}`)].join(' ')

// RankValue (1-6) → rarity name for the `rarities` field display.
const rankValueRarityName = (rv: RankValue): string =>
  rarityCodeToName(rarityCodeFromRankValue(rv)).replace(/\s/g, '') || String(rv)

/**
 * Format a safeguard-overrides operation's VALUE as compact display text (the right-hand
 * side of its `field=…` assignment). SSOT for DSL-reconstruction consumers (note-editor
 * option-info tooltip). Exhaustive `switch` over the operation union — a new op kind fails
 * to compile until handled here. The field token comes from SAFEGUARD_OVERRIDES_OP_FIELD.
 * Returns null when the op carries no meaningful scalar (slider-AST count blocks).
 */
export function formatSafeguardOverridesOpValue(op: SafeguardOverridesOperation): string | null {
  switch (op.kind) {
    // Activation/substat-match enum values are already display strings (Off, 1-4, persubstat).
    case 'activation': return String(op.value)
    case 'count': return op.value != null ? String(op.value) : '$count'
    case 'ignPrev':
    case 'ignEquippedCollection':
    case 'ignEquippedVault':
    case 'perFaction':
    case 'perMainStat':
    case 'perSlot':
    case 'perSet':
    case 'perRule': return String(op.value)
    case 'substatMatch': return String(op.value)
    case 'substatWeight': return `${labelOfVariant(op.stat)}=${op.value}`
    case 'improvementChance': return op.dynamic ? 'on' : (op.value == null ? 'off' : 'on')
    case 'substats': return op.mode === 'replace'
      ? op.stats.map((v) => labelOfVariant(v)).filter(Boolean).join(',')
      : formatSgMutateList(op.add.map((v) => labelOfVariant(v)).filter(Boolean), op.remove.map((v) => labelOfVariant(v)).filter(Boolean))
    case 'ranks': return op.mode === 'replace'
      ? op.values.map(String).join(',')
      : formatSgMutateList(op.add.map(String), op.remove.map(String))
    case 'rarities': return op.mode === 'replace'
      ? op.values.map(rankValueRarityName).join(',')
      : formatSgMutateList(op.add.map(rankValueRarityName), op.remove.map(rankValueRarityName))
    case 'factions': return op.mode === 'replace'
      ? op.values.map((f) => factionCodeToName(f)).join(',')
      : formatSgMutateList(op.add.map((f) => factionCodeToName(f)), op.remove.map((f) => factionCodeToName(f)))
  }
}

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
  anticipate_improvements: SafeguardRuleActivation.AnticipateImprovements,
  // Lowercased enum value — accepted so serialized ops round-trip through the parser.
  anticipateimprovements:  SafeguardRuleActivation.AnticipateImprovements,
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
          // Plain numeric literal: apply rounding at parse time, clamp to the count minimum.
          const n = Math.max(NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN, Math.round(ast.value))
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

    // ── activation = off | protect_existing | anticipate_gaps | anticipate_improvements ──
    if (field === 'activation') {
      const act = ACTIVATION_KEYWORD_MAP[valueLc]
      // Unknown value (e.g. `activation=of`) would silently no-op; flag the typo.
      if (act) operations.push({ kind: 'activation', value: act })
      else reportInvalidEnumValue('activation', valueToken, NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS, diags, absoluteOffset)
      continue
    }

    // ── boolean flag fields ───────────────────────────────────────────────────
    const boolValue = parseOverridesBooleanValue(valueLc)
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
      // Use `in` (not truthiness) so an enum value of 0 is still recognized.
      if (valueLc in SUBSTAT_MATCH_KEYWORD_MAP) operations.push({ kind: 'substatMatch', value: SUBSTAT_MATCH_KEYWORD_MAP[valueLc]! })
      // Unknown value (e.g. `substatmatch=5`) would silently no-op; flag the typo.
      else reportInvalidEnumValue('substatmatch', valueToken, NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS, diags, absoluteOffset)
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
      // Clamp to the allowed weight range with the same two-tier step as the UI (SSOT: normalizeGearInspectorSortWeight).
      const clamped = normalizeGearInspectorSortWeight(numeric)
      operations.push({ kind: 'substatWeight', stat: variant, value: clamped })
      continue
    }

    // ── improvchance = off | disabled | $value | <N> ["," <N4> ["," <N8> ["," <N12>]]] ──
    // Supported values:
    //   off / false / disabled  → disable the feature (null)
    //   $value / $count          → use the enclosing slider's position (flat threshold)
    //   1–4 comma-separated numbers → thresholds for upgrade stages 0, 4, 8, 12.
    //                                 Omitted stages inherit the previous stage's value (null).
    //   Legacy: space-separated numbers are also accepted for backward compatibility.
    if (field === 'improvchance') {
      if (valueLc === 'off' || valueLc === 'false' || valueLc === 'disabled') {
        operations.push({ kind: 'improvementChance', value: null })
      } else if (valueLc === '$value' || valueLc === '$count') {
        // Dynamic: the enclosing slider's current value supplies a flat threshold at resolve time.
        operations.push({ kind: 'improvementChance', value: null, dynamic: true })
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

// ── Answer part classification (SSOT) ─────────────────────────────────────────

/**
 * A single safeguard question can mix an activation radio group with a count/improvement
 * slider, so its stored answer is a MIX of option ids and one slider value string. This is
 * the single source of truth for splitting an answer array into its two parts:
 *   • sliderValue — the toggle-off sentinel or a finite numeric string (the LAST such value
 *     wins if several are present; there is at most one slider group per question).
 *   • optionIds   — everything else (radio/checkbox option ids; `off#0`-style hashes never
 *     parse as finite numbers, so they never collide with a slider value).
 * Both the NoteDialog answer handler and any resolver-side normalization use this, so the
 * two never disagree about which token is the slider value.
 */
export const buildSafeguardAnswerParts = (
  answer: readonly string[],
): { optionIds: string[]; sliderValue: string | null } => {
  const isSliderValue = (v: string): boolean =>
    v === SLIDER_TOGGLE_OFF || Number.isFinite(Number.parseFloat(v))
  const optionIds: string[] = []
  let sliderValue: string | null = null
  for (const v of answer) {
    if (isSliderValue(v)) sliderValue = v
    else optionIds.push(v)
  }
  return { optionIds, sliderValue }
}

/**
 * True when a question's candidate answer equals its default in BOTH parts: the option-id set
 * matches the default option ids, and the slider value (if the question has a slider) equals the
 * slider default. Used to decide whether to omit the answer from storage (defaults are implicit).
 */
export const safeguardAnswerMatchesDefault = (
  question: Pick<SafeguardNoteQuestionDefinition, 'defaultAnswer' | 'groups'>,
  candidate: readonly string[],
): boolean => {
  const def = buildSafeguardAnswerParts(question.defaultAnswer)
  const cand = buildSafeguardAnswerParts(candidate)
  // Option-id sets must match exactly (order-independent).
  const defIds = new Set(def.optionIds)
  const candIds = new Set(cand.optionIds)
  if (defIds.size !== candIds.size) return false
  for (const id of defIds) if (!candIds.has(id)) return false
  // Slider value must match the default when the question carries a slider.
  const hasSlider = question.groups.some((g) => g.type === 'slider')
  if (hasSlider) {
    const sliderOpt = question.groups.find((g) => g.type === 'slider')?.options[0]
    const defVal = def.sliderValue
      ?? String(sliderOpt?.sliderDefault ?? sliderOpt?.sliderMin ?? 1)
    const candVal = cand.sliderValue ?? defVal
    if (candVal !== defVal) return false
  }
  return true
}

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
  /** Resolved option IDs to force-select when this option is active. */
  setOptionIds: string[]
  /** Resolved option IDs to force-deselect when this option is active. */
  unsetOptionIds: string[]
  /** Resolved option IDs that cannot coexist with this option. */
  excludedOptionIds: string[]
  // setTokens / unsetTokens / excludedTokens — raw header tokens; a token matching no
  // in-domain option may name a RECIPE option's explicit id (the reverse cross-domain
  // bridge, mirroring the recipe side's raw-token fields).
  setTokens: string[]
  unsetTokens: string[]
  excludedTokens: string[]
  /** Only populated for slider groups. */
  sliderMin?: number
  sliderMax?: number
  sliderStep?: number
  sliderDefault?: number
  /** Labeled guide marks on the slider track (visual only; no snapping). */
  sliderMarks?: SliderMark[]
  /** Optional on/off checkbox bound to the slider's else block. */
  sliderToggle?: SliderToggle
  /** Optional display-only suffix appended to the slider's shown value (e.g. "%"). */
  sliderUnit?: string
  /** 1-based positional index within the question (implicit DSL reference token). */
  positionalIndex: number
  /** Absolute source span of the whole option block (for editor-preview click-to-select). */
  sourceFrom?: number
  sourceTo?: number
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
  // Explicit option-grid column count (`optcols=N`); 0 = auto-fit. See NoteDialog layout.
  optionColumns: number
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

// ── Constraint resolution helpers ────────────────────────────────────────────
// Mirrors the recipe-overrides constraint engine, typed for SafeguardNoteQuestionOption.

// Minimal option shape the constraint helpers operate on.
type SgConstraintOption = Pick<SafeguardNoteQuestionOption, 'id' | 'groupType' | 'setOptionIds' | 'unsetOptionIds' | 'excludedOptionIds'>
type SgConstraintGroup = { type: NoteQuestionGroupType; options: SgConstraintOption[] }

// Convenience types used by applyGlobalSgOptionExclusions.
type SgConstraintQuestion = {
  options: SgConstraintOption[]
  groups: SgConstraintGroup[]
  answer: string[]
}

const buildSgExclusionLookup = (options: SgConstraintOption[]): Map<string, Set<string>> => {
  const lookup = new Map<string, Set<string>>()
  options.forEach((option) => {
    if (option.excludedOptionIds.length === 0) return
    lookup.set(option.id, new Set(option.excludedOptionIds))
    option.excludedOptionIds.forEach((excluded) => {
      const existing = lookup.get(excluded) ?? new Set<string>()
      existing.add(option.id)
      lookup.set(excluded, existing)
    })
  })
  return lookup
}

const getSgScopeId = (optionId: string): string => {
  const sep = optionId.indexOf(':')
  return sep >= 0 ? optionId.slice(0, sep) : optionId
}

const normalizeSgOrder = (selection: string[], options: SgConstraintOption[]): string[] => {
  const s = new Set(selection)
  return options.filter((o) => s.has(o.id)).map((o) => o.id)
}

const isSameSgOrder = (left: string[], right: string[]): boolean => (
  left.length === right.length && left.every((v, i) => v === right[i])
)

const pickSgSingleGroupFallback = (
  group: SgConstraintGroup,
  selected: Set<string>,
  exclusions: Map<string, Set<string>>,
): string | null => {
  for (const opt of group.options) {
    const blocked = exclusions.get(opt.id)
    const hasConflict = blocked ? [...selected].some((id) => blocked.has(id)) : false
    if (!hasConflict) return opt.id
  }
  return null
}

const applySgSingleGroupFallbacks = (
  selection: string[],
  groups: SgConstraintGroup[],
  options: SgConstraintOption[],
  preferredId?: string,
): string[] => {
  const exclusions = buildSgExclusionLookup(options)
  const next = new Set(selection)
  groups.forEach((group) => {
    if (group.type !== 'single') return
    const inGroup = group.options.filter((o) => next.has(o.id))
    if (inGroup.length > 0) {
      // Collapse multiple selections to preferred or first.
      const keep = (preferredId ? inGroup.find((o) => o.id === preferredId) : null) ?? inGroup[0]!
      inGroup.forEach((o) => { if (o.id !== keep.id) next.delete(o.id) })
      return
    }
    const fallback = pickSgSingleGroupFallback(group, next, exclusions)
    if (fallback) next.add(fallback)
  })
  return normalizeSgOrder(Array.from(next), options)
}

const applySgExclusions = (
  selection: string[],
  options: SgConstraintOption[],
  preferredId?: string,
): string[] => {
  const next = new Set(selection)
  const exclusions = buildSgExclusionLookup(options)
  if (preferredId && next.has(preferredId)) {
    ;(exclusions.get(preferredId) ?? new Set()).forEach((id) => next.delete(id))
  }
  options.forEach((option) => {
    if (!next.has(option.id)) return
    const blocked = exclusions.get(option.id)
    if (!blocked) return
    blocked.forEach((id) => { if (id !== preferredId) next.delete(id) })
  })
  return normalizeSgOrder(Array.from(next), options)
}

const applySgDirectives = (
  selection: string[],
  options: SgConstraintOption[],
  preferredId?: string,
  removedId?: string,
): string[] => {
  const next = new Set(selection)
  const optionById = new Map(options.map((o) => [o.id, o]))
  // Releasing: drop the removed option and any source that force-sets it.
  if (removedId) {
    next.delete(removedId)
    options.forEach((o) => {
      if (!next.has(o.id)) return
      if (!o.setOptionIds.includes(removedId)) return
      next.delete(o.id)
    })
  }
  options.forEach((option) => {
    if (!next.has(option.id)) return
    option.setOptionIds.forEach((id) => {
      next.add(id)
      // Setting a single-select option replaces its peers.
      const target = optionById.get(id)
      if (!target || target.groupType !== 'single') return
      const targetScope = getSgScopeId(id)
      options.forEach((candidate) => {
        if (candidate.id === id || candidate.groupType !== 'single') return
        if (getSgScopeId(candidate.id) !== targetScope) return
        next.delete(candidate.id)
      })
    })
    option.unsetOptionIds.forEach((id) => { if (id !== preferredId) next.delete(id) })
  })
  // Keep preferred explicit; deselect conflicting preset sources.
  if (preferredId) {
    next.add(preferredId)
    const preferred = optionById.get(preferredId)
    if (preferred?.groupType === 'single') {
      const preferredScope = getSgScopeId(preferredId)
      options.forEach((candidate) => {
        if (candidate.id === preferredId || candidate.groupType !== 'single') return
        if (getSgScopeId(candidate.id) !== preferredScope) return
        next.delete(candidate.id)
      })
      options.forEach((candidate) => {
        if (!next.has(candidate.id) || candidate.id === preferredId) return
        const forces = candidate.setOptionIds.some((targetId) => {
          if (targetId === preferredId) return false
          const target = optionById.get(targetId)
          if (!target || target.groupType !== 'single') return false
          return getSgScopeId(targetId) === preferredScope
        })
        if (forces) next.delete(candidate.id)
      })
    }
  }
  if (removedId) next.delete(removedId)
  return normalizeSgOrder(Array.from(next), options)
}

const resolveWithSgOptionRules = (
  selection: string[],
  groups: SgConstraintGroup[],
  options: SgConstraintOption[],
  preferredId?: string,
  removedId?: string,
): string[] => {
  let current = normalizeSgOrder(selection, options)
  const maxPasses = Math.max(8, options.length + groups.length + 2)
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const withDirectives = applySgDirectives(current, options, preferredId, removedId)
    const withExclusions = applySgExclusions(withDirectives, options, preferredId)
    const withFallbacks = applySgSingleGroupFallbacks(withExclusions, groups, options, preferredId)
    const next = normalizeSgOrder(withFallbacks, options)
    if (isSameSgOrder(next, current)) return next
    current = next
  }
  return current
}

// Public helper for the NoteDialog UI toggle handler (single-question update).
export const applyQuestionSgSelectionRules = (
  selection: string[],
  question: Pick<SafeguardNoteQuestionDefinition, 'groups' | 'options'>,
  preferredId?: string,
  removedId?: string,
): string[] => resolveWithSgOptionRules(selection, question.groups, question.options, preferredId, removedId)

// Re-apply constraints across all questions using the global option ordering (cross-question cascade).
const applyGlobalSgOptionExclusions = <Q extends SgConstraintQuestion>(
  questions: Q[],
  preferredId?: string,
  removedId?: string,
): Q[] => {
  const allOptions = questions.flatMap((q) => q.options)
  const allGroups = questions.flatMap((q) => q.groups)
  const allowedIds = new Set(allOptions.map((o) => o.id))
  // Exclude slider numeric strings — they are not option IDs and normalizeSgOrder would drop them,
  // wiping slider positions from every question's answer on every cascade call.
  const selected = questions.flatMap((q) => q.answer.filter((v) => allowedIds.has(v)))
  const resolved = resolveWithSgOptionRules(selected, allGroups, allOptions, preferredId, removedId)
  const resolvedSet = new Set(resolved)
  return questions.map((q) => {
    // Preserve each question's slider answers (non-option-id numeric strings) verbatim.
    const sliderAnswers = q.answer.filter((v) => !allowedIds.has(v))
    return {
      ...q,
      answer: [
        ...q.options.filter((o) => resolvedSet.has(o.id)).map((o) => o.id),
        ...sliderAnswers,
      ],
    }
  })
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
  // Display language for the localized prompt/label/detail text (ids stay invariant).
  lang: string,
): SafeguardNoteQuestionDefinition => {
  const { question, index } = entry
  const implicitTokenMap = buildQuestionImplicitTokenMap(question.options)
  // Resolve options to the public option type.
  const options: SafeguardNoteQuestionOption[] = question.options.map((option, optionIndex) => {
    const token = option.explicitToken ?? option.implicitToken ?? ''
    // Resolve constraint tokens to option IDs so the cascade engine can enforce them.
    const resolveTokens = (tokens: string[]) => resolveOptionIdsFromTokens(tokens, globalExplicitTokenMap, implicitTokenMap)
    const setOptionIds = resolveTokens(option.setTokens)
    const unsetOptionIds = resolveTokens(option.unsetTokens)
    const excludedOptionIds = resolveTokens(option.excludedTokens)
    const result: SafeguardNoteQuestionOption = {
      id: option.id,
      // Localize human-facing text; id stays language-invariant.
      label: localizeDslDisplay(option.label, lang),
      detail: option.detail == null ? null : localizeDslDisplay(option.detail, lang),
      blocks: option.blocks,
      fallbackBlocks: option.fallbackBlocks,
      recipeFallbackBlocks: option.crossFallbackBlocks as RecipeOverridesSelectorBlock[],
      recipeBlocks: option.crossBlocks as RecipeOverridesSelectorBlock[],
      isDefault: option.isDefault,
      token,
      groupType: option.groupType,
      setOptionIds,
      unsetOptionIds,
      excludedOptionIds,
      // Raw tokens for the reverse cross-domain bridge (safeguard option → recipe option).
      setTokens: option.setTokens,
      unsetTokens: option.unsetTokens,
      excludedTokens: option.excludedTokens,
      // 1-based positional index for the implicit DSL reference.
      positionalIndex: optionIndex + 1,
    }
    // Spread the source span only when present (exactOptionalPropertyTypes).
    if (option.sourceFrom != null) result.sourceFrom = option.sourceFrom
    if (option.sourceTo != null) result.sourceTo = option.sourceTo
    // Propagate slider params for slider group options.
    if (option.groupType === 'slider' && option.sliderParams) {
      result.sliderMin     = option.sliderParams.min
      result.sliderMax     = option.sliderParams.max
      result.sliderStep    = option.sliderParams.step
      result.sliderDefault = option.sliderParams.default
      // Localize the human-facing slider text (mark labels, toggle label, unit suffix).
      if (option.sliderParams.marks) {
        result.sliderMarks = option.sliderParams.marks.map((mark) => ({
          ...mark,
          label: localizeDslDisplay(mark.label, lang),
          ...(mark.subtext != null ? { subtext: localizeDslDisplay(mark.subtext, lang) } : {}),
        }))
      }
      if (option.sliderParams.toggle) {
        result.sliderToggle = { ...option.sliderParams.toggle, label: localizeDslDisplay(option.sliderParams.toggle.label, lang) }
      }
      if (option.sliderParams.unit) result.sliderUnit = localizeDslDisplay(option.sliderParams.unit, lang)
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
    // A toggle defaulting to off seeds the off sentinel instead (the else block applies).
    const sliderOpt = group.options[0]
    if (sliderOpt) {
      defaultAnswer.push(sliderOpt.sliderToggle?.default === 'off'
        ? SLIDER_TOGGLE_OFF
        : String(sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1))
    }
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
  return { id, index, prompt: localizeDslDisplay(question.prompt, lang), layoutColumns: question.layoutColumns, optionColumns: question.optionColumns, groups, options, fallback, defaultAnswer, answer }
}

// Resolve stored or default answers against the current option set.
// Slider answers (raw numeric strings) are preserved separately from option-id answers
// so the constraint engine can safely operate on the id-based portion only.
const resolveAnswer = (
  question: Pick<SafeguardNoteQuestionDefinition, 'groups' | 'options' | 'defaultAnswer'>,
  stored: string[] | undefined,
): string[] => {
  const allowed = new Set(question.options.map((o) => o.id))
  const hasStored = Array.isArray(stored)
  const filtered = hasStored ? stored.filter((id) => allowed.has(id)) : []
  const optionIds: string[] = []
  const sliderAnswers: string[] = []
  question.groups.forEach((group) => {
    const storedForGroup = filtered.filter((id) => group.options.some((o) => o.id === id))
    if (group.type === 'single') {
      if (storedForGroup.length > 0) { optionIds.push(storedForGroup[0]!); return }
      const defaultId = question.defaultAnswer.find((id) => group.options.some((o) => o.id === id))
      if (defaultId) optionIds.push(defaultId)
      return
    }
    if (group.type === 'slider') {
      // Slider answer is a raw numeric string (or the toggle-off sentinel), not an option
      // id — bypass id validation. Accept either form from stored answers.
      const sliderOpt = group.options[0]
      if (!sliderOpt) return
      const accept = (v: string): boolean => v === SLIDER_TOGGLE_OFF || Number.isFinite(Number.parseFloat(v))
      const storedVal = hasStored ? stored.find(accept) : undefined
      if (storedVal !== undefined) { sliderAnswers.push(storedVal); return }
      // No usable stored value — fall back to the toggle-aware default answer.
      const defVal = question.defaultAnswer.find(accept)
      sliderAnswers.push(defVal ?? String(sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1))
      return
    }
    // multi group
    if (storedForGroup.length > 0) { optionIds.push(...storedForGroup); return }
    if (hasStored) return
    question.defaultAnswer
      .filter((id) => group.options.some((o) => o.id === id))
      .forEach((id) => optionIds.push(id))
  })
  // Apply within-question directives/exclusions/fallbacks to the option-id portion.
  const ruledIds = applyQuestionSgSelectionRules(optionIds, question)
  // Recombine with slider answers (which are not option ids and pass through unchanged).
  return [...ruledIds, ...sliderAnswers]
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
  preferredId?: string,
  removedId?: string,
  // Display language; identity stays language-invariant, only strings localize.
  lang = 'en-US',
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
    // Absolute offset of `inner` within the full note, so option source spans are absolute.
    const innerOffset = (match.index ?? 0) + raw.indexOf(inner)
    const parsed = parseOverridesMarkerBody<NoteTagSelector, SafeguardOverridesOperation>(
      inner,
      [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD],
      parseSelectorBlock,
      // Cross-domain: `recipe @selector { … }` blocks inside safeguard-overrides markers.
      // parseRecipeSelectorBlockCross circular import is safe — called inside a function body only.
      // Uses the cross-domain variant so $count/$value expressions work inside slider questions.
      (cursor) => parseRecipeSelectorBlockCross(cursor),
      // No diagnostics on the UI path; pass the absolute marker offset for source spans.
      undefined,
      innerOffset,
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
    parsedEntries.push({ index: markerIndex, question: parsed })
    markerIndex += 1
  }
  const globalExplicitTokenMap = buildGlobalExplicitTokenMap(parsedEntries)
  const resolved = parsedEntries.map((entry) => buildResolvedQuestion(entry, answers, globalExplicitTokenMap, lang))
  // Apply cross-question cascade so exclusions/directives propagate across markers.
  const cascaded = applyGlobalSgOptionExclusions(resolved, preferredId, removedId)
  // Merge spacers into the resolved list in note order.
  return [...cascaded, ...spacerQuestions].sort((a, b) => a.index - b.index)
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

/**
 * Build the `id=TOKEN → { questionId, defaultNum }` map that the cross-domain slider
 * WRITE bridge uses to translate a recipe option's directive token into the safeguard
 * question it must store into. SSOT for both the change handler and load-time seeding.
 * Only slider options carrying an explicit `id=TOKEN` contribute.
 */
export const buildSafeguardSliderTokenMap = (
  questions: readonly SafeguardNoteQuestionDefinition[],
): Map<string, { questionId: string; defaultNum: number }> => {
  // One entry per id=TOKEN slider; defaultNum is the slider's resting value.
  const map = new Map<string, { questionId: string; defaultNum: number }>()
  for (const question of questions) {
    // A safeguard question has at most one slider option; pick the id-bearing one.
    const slider = question.options.find((o) => o.groupType === 'slider' && o.token)
    if (slider?.token) {
      map.set(slider.token, {
        questionId: question.id,
        defaultNum: slider.sliderDefault ?? slider.sliderMin ?? 1,
      })
    }
  }
  return map
}

/**
 * Build the `id=TOKEN → { questionId, optionId }` map the cross-domain OPTION write
 * bridge uses to translate a recipe option's `set`/`unset`/`excl` token into the
 * safeguard option it must (de)select. SSOT for both the NoteDialog change handler
 * and load-time seeding — the same pair of callers as the slider map above.
 * Only radio/checkbox options carrying an explicit `id=TOKEN` contribute: implicit
 * numeric tokens are question-local by contract, and sliders belong to the slider map.
 * First occurrence wins, mirroring in-domain explicit-token resolution.
 */
export const buildSafeguardOptionTokenMap = (
  questions: readonly SafeguardNoteQuestionDefinition[],
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
 * Apply cross-domain OPTION writes to stored safeguard answers — persist-on-select,
 * exactly like the slider writes: the result is a real stored answer the user can
 * change afterwards, not a render overlay. Each affected question goes through the
 * same rule pass a real click takes ({@link applyQuestionSgSelectionRules}), so
 * single-select replacement/fallback and in-domain exclusions behave identically.
 * `shouldSkipQuestion` lets the seeding path honor its never-overwrite contract.
 */
export const applySafeguardOptionWrites = (
  questions: readonly SafeguardNoteQuestionDefinition[],
  answers: NoteSafeguardOverridesAnswers,
  writes: readonly CrossDomainOptionWrite[],
  shouldSkipQuestion: (questionId: string) => boolean = () => false,
): NoteSafeguardOverridesAnswers => {
  if (writes.length === 0) return answers
  // Group writes per target question, preserving directive order within each.
  const byQuestion = new Map<string, CrossDomainOptionWrite[]>()
  for (const write of writes) {
    const list = byQuestion.get(write.questionId)
    if (list) list.push(write)
    else byQuestion.set(write.questionId, [write])
  }
  const next: NoteSafeguardOverridesAnswers = { ...answers }
  let changed = false
  for (const [questionId, questionWrites] of byQuestion) {
    if (shouldSkipQuestion(questionId)) continue
    const question = questions.find((q) => q.id === questionId)
    if (!question) continue
    // Freshest stored answer wins over the resolved one so a slider write applied in the
    // same batch (change handler) or seed pass is preserved; fall back to the question's
    // resolved answer (defaults included) for untouched questions.
    const current = next[questionId] ?? question.answer
    const { optionIds, sliderValue } = buildSafeguardAnswerParts(current)
    const ids = new Set(optionIds)
    // Apply directives in order; the last select/deselect feeds the rule pass's tie-breaks.
    let preferredId: string | undefined
    let removedId: string | undefined
    for (const write of questionWrites) {
      if (write.action === 'select') { ids.add(write.optionId); preferredId = write.optionId }
      else { ids.delete(write.optionId); removedId = write.optionId }
    }
    const ruled = applyQuestionSgSelectionRules(Array.from(ids), question, preferredId, removedId)
    const ruledSet = new Set(ruled)
    // Store option ids in the question's option order (same shape the dialog persists).
    const ordered = question.options.filter((o) => ruledSet.has(o.id)).map((o) => o.id)
    const candidate = sliderValue != null ? [...ordered, sliderValue] : ordered
    // Same storage rule as the dialog handler: default-matching answers stay implicit.
    if (safeguardAnswerMatchesDefault(question, candidate)) {
      if (next[questionId] !== undefined) { delete next[questionId]; changed = true }
      continue
    }
    // Skip no-op writes so callers keep reference equality when nothing moved.
    const prevStored = next[questionId]
    if (prevStored && prevStored.length === candidate.length && prevStored.every((v, i) => v === candidate[i])) continue
    next[questionId] = candidate
    changed = true
  }
  return changed ? next : answers
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
  preferredId?: string,
  removedId?: string,
  // Display language threaded to the resolved questions.
  lang = 'en-US',
): SafeguardOverridesResolution => {
  const questions = parseNoteSafeguardOverrides(note, answers, preferredId, removedId, lang)
  // Build a token → current slider value map used by cross-slider $count.TOKEN references.
  // Only sliders with an explicit id=TOKEN marker contribute to this map.
  const sliderValueByToken = new Map<string, number>()
  for (const question of questions) {
    for (const option of question.options) {
      if (option.groupType !== 'slider' || !option.token) continue
      // A stored answer may mix radio option ids with the slider value (the dialog
      // persists [optionIds…, sliderValue]) — split via the SSOT instead of reading [0],
      // which silently fell back to the slider default whenever a radio id came first.
      const raw = buildSafeguardAnswerParts(answers?.[question.id] ?? []).sliderValue ?? ''
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
      // For slider groups: resolve $count / $value (and arithmetic ASTs) to numeric values.
      if (option.groupType === 'slider') {
        // Same SSOT split as above: the slider value may sit AFTER radio option ids in the
        // stored answer. `undefined` (no slider component) keeps the unanswered semantics
        // for the toggle-default check below.
        const rawAnswer = buildSafeguardAnswerParts(answers?.[question.id] ?? []).sliderValue ?? undefined
        // A toggle that is off (explicit sentinel, or unanswered with default=off) routes to
        // the option's else block — the same "disabled" path an unchecked checkbox would take.
        const toggleOff = option.sliderToggle != null
          && (rawAnswer === SLIDER_TOGGLE_OFF
            || (rawAnswer === undefined && option.sliderToggle.default === 'off'))
        if (toggleOff) {
          for (const block of option.fallbackBlocks) instructions.push(block)
          for (const block of option.recipeFallbackBlocks) recipeInstructions.push(block)
          continue
        }
        const sliderValue = Number.parseFloat(rawAnswer ?? '')
        const defaultValue = option.sliderDefault ?? 1
        const resolvedValue = Number.isFinite(sliderValue) ? sliderValue : defaultValue
        // Flat improvement-chance threshold (0–100, one decimal) from the slider position.
        const improvPct = Math.round(Math.max(0, Math.min(100, resolvedValue)) * 10) / 10
        for (const block of option.blocks) {
          const resolvedOps = block.operations.map((op) => {
            // Resolve null-valued count ops: evaluate the AST if present, otherwise use
            // the raw slider position (legacy $count / $value bare reference).
            if (op.kind === 'count' && op.value === null) {
              const rawResult = op.ast
                ? evalCountAst(op.ast, resolvedValue, sliderValueByToken)
                : resolvedValue
              // Emit a resolved count op with no ast — the expression has been evaluated to a literal.
              return { kind: 'count' as const, value: Math.max(NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN, Math.min(NOTE_SAFEGUARD_OVERRIDES_COUNT_MAX, Math.round(rawResult))) }
            }
            // Resolve dynamic improvchance=$value into a flat per-level threshold.
            if (op.kind === 'improvementChance' && op.dynamic) {
              return { kind: 'improvementChance' as const,
                value: { atLevel0: improvPct, atLevel4: null, atLevel8: null, atLevel12: null } }
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
            if (op.value !== null) clone.requiredCount = Math.max(NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN, op.value)
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
            // Resolved ops carry a concrete value (or null=disabled). An unresolved
            // dynamic op (improvchance=$value used outside a slider) has no value to
            // apply — leave the rule's existing threshold untouched rather than disable it.
            if (!op.dynamic) clone.improvementChanceThreshold = op.value
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
  const sig = questions.map((q) => [q.id, q.layoutColumns, q.optionColumns])
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
