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
import type { StatVariant, RankValue, FactionId, ArtifactSetId } from './types'
import { artifactSetNames, findArtifactSetIdByName } from './types'
import type { ArtifactSetSelectionEntry } from './gearSets/selection'
import type {
  RecipeOverridesSelectorBlock, RecipeOverridesInstructions, RecipeOverridesOperation,
  CrossDomainOptionTarget, CrossDomainOptionWrite,
} from './noteRecipeOverrides'
// Runtime imports for cross-domain parsing — safe for circular use since only called inside function bodies.
// parseRecipeSelectorBlockCross enables $count/$value in numeric recipe ops inside slider questions.
// clampRankCode is the SSOT for [1,6] integer rank clamping used at AST resolve time.
import { parseRecipeSelectorBlockCross, clampRankCode } from './noteRecipeOverrides'
// statKeyToVariant: safeguard stat fields (`substats=`, `weight.`) are all SUBSTAT
// positions, so they take the full substat vocabulary — anomalous keys included.
import { statKeyToVariant, rarityCodeFromRankValue, rarityCodeToName, factionCodeToName } from './types'
import type {
  SafeguardRule,
  SafeguardImprovementChanceLevelThresholds,
  SafeguardRuleCountMode,
  SafeguardGroupSettings,
} from './safeguards'
import {
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  cloneSafeguardRule,
  normalizeSafeguardSubstatDependents,
  pruneSafeguardsSubstatWeights,
  factionIdByName,
  rarityCodeByName,
  SAFEGUARD_REQUIRED_COUNT_MIN,
  SAFEGUARD_REQUIRED_COUNT_MAX,
  // Group helpers — membership questions and settings identity, so this module never
  // re-implements what "is grouped" or "same settings" means (SSOT: safeguards.ts).
  isSafeguardGrouped,
  safeguardGroupSettingsEqual,
  cloneSafeguardGroupSettings,
  clampSafeguardRequiredCount,
} from './safeguards'
// Run resolution comes from the group SSOT (a memoized facade over the wasm resolver the
// engine itself uses) — this module never re-derives what "adjacent AND same id" means.
import { safeguardGroupRunRange } from './safeguardGroups'
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
  reportUnknownField,
  skipAssignmentValue,
  NOTE_OVERRIDES_BOOLEAN_KEYWORDS,
  localizeDslDisplay,
  parsePrefixedToken,
  classifyListMode,
  isClearListTokens,
  formatOverridesClearableList,
  consumeCommaSeparatedRemainder,
  // Option-info display helpers — the shared contract both domains render through.
  overridesStatKey,
  formatOverridesMutateList,
  formatOverridesStatKeyList,
  formatOverridesStatKeyMutateList,
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

/**
 * Bounds applied to resolved `count =` values (apply-side clamp + editor cap SSOT). `count =`
 * overrides the rule's own required count, so these are that field's bounds — re-exported under
 * the DSL's naming rather than restated, so the override can never resolve outside what the
 * builder's field accepts.
 */
export const NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN = SAFEGUARD_REQUIRED_COUNT_MIN
export const NOTE_SAFEGUARD_OVERRIDES_COUNT_MAX = SAFEGUARD_REQUIRED_COUNT_MAX

/** Round + clamp a resolved count expression into the DSL's count bounds. One definition for
 *  both count families (`count` and `group.count`), which share the same grammar and bounds. */
export const clampNoteSafeguardOverridesCount = (raw: number): number => Math.max(
  NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN,
  Math.min(NOTE_SAFEGUARD_OVERRIDES_COUNT_MAX, Math.round(raw)),
)

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
  // combination gear-set / metaset lists (comma-separated; +/-/+- prefixes as in recipes).
  'gearsets', 'metasets',
  // group.<setting> — retunes the GROUP the matched rule belongs to, never the rule itself.
  // Prefix only; the full suffix set is dynamic (see NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES).
  'group',
] as const

/**
 * Suffixes accepted after the `group.` prefix, mapped to what they retune.
 *
 * A member's own `count` sizes what it FEEDS its group; `group.count` is the count the GROUP
 * keeps out of the merged pool, and the `group.per*` chips are the bucket-defining properties
 * that pool is merged by. They are therefore distinct fields from `count` / `per*`, not aliases.
 *
 * `'count'` maps to null (its own operation kind); every other suffix names a count-mode chip,
 * typed as `keyof SafeguardRuleCountMode` so a new chip in the Rust wire type fails to compile
 * here until the DSL learns to spell it.
 */
export const NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES: Record<string, keyof SafeguardRuleCountMode | null> = {
  count: null,
  perfaction: 'perFaction',
  permainstat: 'perMainStat',
  perslot: 'perSlot',
  perset: 'perSet',
  perrule: 'perRule',
}

/** The bare `group` grammar token — the family's base field, as `weight` is for `weight.<stat>`. */
export const SAFEGUARD_GROUP_FIELD_BASE = 'group'

/** The `group.` field prefix — one spelling shared by the parser, serializer and editor. */
export const NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_PREFIX = `${SAFEGUARD_GROUP_FIELD_BASE}.`

/** Fully-qualified `group.*` field tokens (prefix + each suffix), in declaration order. */
export const NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELDS = Object.keys(NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES)
  .map((suffix) => `${NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_PREFIX}${suffix}`)

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
  // Gear-set entries carry the `excluded` flag: `+-Name` adds an excluded entry
  // (mirrors the recipe DSL); `-Name` removes the entry regardless of its flag.
  | { kind: 'sets'; mode: 'replace'; values: ArtifactSetSelectionEntry[] }
  | { kind: 'sets'; mode: 'mutate';  add: ArtifactSetSelectionEntry[]; remove: ArtifactSetId[] }
  // Metaset names stay raw display-name strings (resolved against metasets at match time).
  | { kind: 'metaSetNames'; mode: 'replace'; values: string[] }
  | { kind: 'metaSetNames'; mode: 'mutate';  add: string[]; remove: string[] }
  // ── Group settings (`group.*`) — retune the GROUP the matched rule belongs to ──
  // Both no-op on an ungrouped rule: there is no group to retune. On a member they write
  // the whole run (see applySafeguardOverrides), because a run's members must agree.
  // group.count: what the group KEEPS per merged bucket, as opposed to `count`, which sizes
  // what this member FEEDS it. Shares the count grammar, so null/ast carry the same meaning.
  | { kind: 'groupCount'; value: number | null; ast?: NoteCountAstNode }
  // group.per*: one bucket-defining chip of the group's own countMode.
  | { kind: 'groupCountMode'; chip: keyof SafeguardRuleCountMode; value: boolean }

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
  sets: 'gearsets',
  metaSetNames: 'metasets',
  // Both `group.*` ops map to the family's BASE token, exactly as `substatWeight` maps to
  // `weight` rather than `weight.<stat>` — this map answers "which grammar field does this op
  // belong to". The full dotted token (which varies per op) comes from
  // safeguardOverridesOpFieldToken() below.
  groupCount: SAFEGUARD_GROUP_FIELD_BASE,
  groupCountMode: SAFEGUARD_GROUP_FIELD_BASE,
}

// Reverse of NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES: chip → DSL suffix, so the
// serializer and tooltip spell a chip exactly the way the parser reads it back.
const GROUP_CHIP_SUFFIX = new Map<keyof SafeguardRuleCountMode, string>(
  Object.entries(NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES)
    .flatMap(([suffix, chip]) => (chip ? [[chip, suffix] as const] : [])),
)

/**
 * The full dotted field token for one operation — identical to SAFEGUARD_OVERRIDES_OP_FIELD
 * for every op except `groupCountMode`, whose token depends on which chip it carries.
 * SSOT for both DSL-reconstruction consumers (tooltip) and the serializer.
 */
export const safeguardOverridesOpFieldToken = (op: SafeguardOverridesOperation): string => {
  // Both `group.*` kinds carry the family's BASE token in the map above, so each completes its
  // own dotted suffix here — `group` alone is a prefix the parser would not recognize.
  if (op.kind === 'groupCount') return `${NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_PREFIX}count`
  if (op.kind === 'groupCountMode') {
    const suffix = GROUP_CHIP_SUFFIX.get(op.chip)
    // Every chip in SafeguardRuleCountMode must have a DSL spelling; without one the emitted
    // `group.=on` would not re-parse, so fail loudly rather than serialize a broken note.
    if (!suffix) throw new Error(`No DSL suffix for group count-mode chip '${String(op.chip)}'.`)
    return `${NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_PREFIX}${suffix}`
  }
  return SAFEGUARD_OVERRIDES_OP_FIELD[op.kind]
}

/** A resolved selector + operations pair, ready for application. */
// RankValue (1-6) → rarity name for the `rarities` field display.
const rankValueRarityName = (rv: RankValue): string =>
  rarityCodeToName(rarityCodeFromRankValue(rv)).replace(/\s/g, '') || String(rv)

/**
 * Format a safeguard-overrides operation's VALUE as compact display text (the right-hand
 * side of its `field=…` assignment) for the note-editor option-info tooltip. Exhaustive
 * `switch` over the operation union — a new op kind fails to compile until handled here.
 * The field token comes from SAFEGUARD_OVERRIDES_OP_FIELD.
 *
 * Answers the same option-info display contract as its recipe twin — see
 * noteOverridesParser.ts, which owns the contract and the shared spelling helpers.
 *
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
    case 'substatWeight': return `${overridesStatKey(op.stat)}=${op.value}`
    case 'improvementChance': return op.dynamic ? 'on' : (op.value == null ? 'off' : 'on')
    case 'substats': return op.mode === 'replace'
      ? formatOverridesStatKeyList(op.stats)
      : formatOverridesStatKeyMutateList(op.add, op.remove)
    case 'ranks': return op.mode === 'replace'
      ? op.values.map(String).join(',')
      : formatOverridesMutateList(op.add.map(String), op.remove.map(String))
    case 'rarities': return op.mode === 'replace'
      ? op.values.map(rankValueRarityName).join(',')
      : formatOverridesMutateList(op.add.map(rankValueRarityName), op.remove.map(rankValueRarityName))
    case 'factions': return op.mode === 'replace'
      ? op.values.map((f) => factionCodeToName(f)).join(',')
      : formatOverridesMutateList(op.add.map((f) => factionCodeToName(f)), op.remove.map((f) => factionCodeToName(f)))
    case 'sets': {
      // Excluded adds surface as `+-Name` (the extra `-` sits inside the add prefix).
      const setName = (id: ArtifactSetId): string => artifactSetNames[id] ?? String(id)
      return op.mode === 'replace'
        ? formatOverridesClearableList(op.values.map((e) => setName(e.id)))
        : [
          ...op.add.map((e) => `+${e.excluded ? '-' : ''}${setName(e.id)}`),
          ...op.remove.map((id) => `-${setName(id)}`),
        ].join(' ')
    }
    case 'metaSetNames': return op.mode === 'replace'
      ? formatOverridesClearableList(op.values)
      : formatOverridesMutateList(op.add, op.remove)
    // group.* mirrors the DISPLAY spelling of its ungrouped twin above: a count shows as its
    // number or `$count`, a chip as `true`/`false` exactly like the rule's own `per*` ops. (The
    // serializer emits the canonical `on`/`off` DSL instead; this formatter feeds the tooltip.)
    case 'groupCount': return op.value != null ? String(op.value) : '$count'
    case 'groupCountMode': return String(op.value)
  }
}

export type SafeguardOverridesSelectorBlock = {
  selector: NoteTagSelector
  operations: SafeguardOverridesOperation[]
}

/**
 * Boolean-valued assignment fields → the operation kind each produces. One table instead of a
 * chain of `if (field === …)`, so the parse branch reports a bad VALUE against the right field
 * and every boolean field is guaranteed a branch. Keys are grammar tokens drawn from
 * NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS; values are narrowed to the op kinds that actually
 * carry a plain boolean, so an entry can never name a kind with a non-boolean payload.
 */
const BOOLEAN_FIELD_OP_KIND: Record<string, Exclude<Extract<SafeguardOverridesOperation, { value: boolean }>, { chip: unknown }>['kind'] | undefined> = {
  ignprev: 'ignPrev',
  igncoll: 'ignEquippedCollection',
  ignvault: 'ignEquippedVault',
  perfaction: 'perFaction',
  permainstat: 'perMainStat',
  perslot: 'perSlot',
  perset: 'perSet',
  perrule: 'perRule',
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

/**
 * Whether a rule matches a tag-based selector.
 *
 * Takes the whole rule (not just its tags) because `grouped`/`ungrouped` ask about group
 * membership. Membership is read from the rule's own inline settings via the safeguards SSOT —
 * NOT from run structure — so the answer does not depend on the rule's neighbours and a single
 * member pasted elsewhere still reports what it carries.
 */
const matchesTagSelectorForRule = (
  selector: NoteTagSelector,
  rule: SafeguardRule,
): boolean => {
  const tags = rule.tags ?? []
  switch (selector.kind) {
    case 'all':     return true
    case 'tagged':  return tags.length > 0
    case 'untagged': return tags.length === 0
    case 'grouped':   return isSafeguardGrouped(rule)
    case 'ungrouped': return !isSafeguardGrouped(rule)
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
    case 'not': return !matchesTagSelectorForRule(selector.inner, rule)
    case 'and': return (
      matchesTagSelectorForRule(selector.left, rule)
      && matchesTagSelectorForRule(selector.right, rule)
    )
    case 'or': return (
      matchesTagSelectorForRule(selector.left, rule)
      || matchesTagSelectorForRule(selector.right, rule)
    )
  }
}

// ── Boolean value parser (shared with flag fields) ────────────────────────────

// Deduplicate and sort a numeric array — shared by ranks, rarities, and factions applier.
const sortDedupNumeric = <T extends number>(arr: T[]): T[] =>
  Array.from(new Set(arr)).sort((a, b) => a - b) as T[]

// Prefix token parsing for list fields (substats, rank/rarity/faction, gearsets,
// metasets) lives in noteOverridesParser (parsePrefixedToken & friends) — shared
// with the recipe-overrides parser so both DSL domains accept identical syntax.
// Note: `+-X` (addExcluded) only carries meaning for gearsets; the other list
// branches treat it like a plain `+` add, mirroring the recipe side.

// ── Operations parser ─────────────────────────────────────────────────────────

/**
 * Parse a count expression and push it as `kind`. ONE definition for the two fields that share
 * the count grammar — the rule's own `count` and the group's `group.count` — so their accepted
 * syntax (literal / bare `$count`·`$value` / richer AST) can never diverge.
 *
 * The three shapes are distinguished because the downstream contracts differ: a literal is
 * resolved here, a bare self-reference keeps the legacy `value: null` form for compatibility,
 * and anything richer carries its AST to be evaluated against the slider at resolve time.
 */
const pushCountOperation = (
  operations: SafeguardOverridesOperation[],
  kind: 'count' | 'groupCount',
  cursor: TokenCursor,
): void => {
  const ast = parseCountExpression(cursor)
  if (ast === null) return
  if (ast.kind === 'literal') {
    // Plain numeric literal: round at parse time and clamp to the count minimum.
    operations.push({ kind, value: Math.max(NOTE_SAFEGUARD_OVERRIDES_COUNT_MIN, Math.round(ast.value)) })
  } else if (ast.kind === 'ref' && ast.sliderId === null) {
    // Bare $count / $value self-reference: legacy null form.
    operations.push({ kind, value: null })
  } else {
    // Complex expression or cross-slider ref: store the AST for resolve-time eval.
    operations.push({ kind, value: null, ast })
  }
}

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
      pushCountOperation(operations, 'count', cursor)
      continue
    }

    // ── group.<setting> = … ───────────────────────────────────────────────────
    // Intercepted before the generic value path so `group.count` reaches the same
    // expression parser as `count` (it shares that grammar, including $count/$value).
    if (field.startsWith(NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_PREFIX)) {
      const suffix = field.slice(NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_PREFIX.length).trim()
      // An unknown suffix is skipped by the parser but flagged for the editor's red wave.
      if (!(suffix in NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES)) {
        reportUnknownField(token, diags, absoluteOffset)
        skipAssignmentValue(cursor)
        continue
      }
      const chip = NOTE_SAFEGUARD_OVERRIDES_GROUP_FIELD_SUFFIXES[suffix]
      if (chip == null) {
        // group.count — the member's own `count` grammar, applied to the group.
        pushCountOperation(operations, 'groupCount', cursor)
        continue
      }
      // group.per* — one bucket chip; same boolean vocabulary as the member's own chips.
      const chipToken = cursor.peek()
      // A missing or non-word value (`group.perslot=,`) is as much a bad value as `=yess`, so it
      // gets the same diagnostic against the FIELD rather than being dropped without a trace.
      if (!chipToken || (chipToken.kind !== 'word' && chipToken.kind !== 'string')) {
        reportUnknownField(token, diags, absoluteOffset)
        continue
      }
      cursor.next()
      const parsed = parseOverridesBooleanValue(chipToken.value.trim().toLowerCase())
      if (parsed !== null) operations.push({ kind: 'groupCountMode', chip, value: parsed })
      else reportInvalidEnumValue(field, chipToken, NOTE_OVERRIDES_BOOLEAN_KEYWORDS, diags, absoluteOffset)
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
    // Kind per field name, so an unparsable VALUE is reported as a value error rather than
    // falling through to the unknown-FIELD diagnostic at the end of the loop.
    const boolFieldKind = BOOLEAN_FIELD_OP_KIND[field]
    if (boolFieldKind) {
      const boolValue = parseOverridesBooleanValue(valueLc)
      if (boolValue !== null) operations.push({ kind: boolFieldKind, value: boolValue })
      else reportInvalidEnumValue(field, valueToken, NOTE_OVERRIDES_BOOLEAN_KEYWORDS, diags, absoluteOffset)
      continue
    }

    // ── substats = [+|-]stat, … ───────────────────────────────────────────────
    if (field === 'substats') {
      const rawTokens = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = rawTokens.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      const resolve = (name: string): StatVariant | undefined => statKeyToVariant(name) ?? undefined
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
      const rawTokens = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = rawTokens.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
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

    // ── gearsets = [+|+-|-]SetName, … ─────────────────────────────────────────
    // Mirrors the recipe DSL: bare names replace the rule's set list (plain includes),
    // `+Name` adds an include, `+-Name` adds an EXCLUDED entry, `-Name` removes the
    // entry whatever its flag. Set names resolve case-insensitively to numeric ids.
    if (field === 'gearsets') {
      const rawTokens = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = rawTokens.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      // `gearsets=any` clears the explicit set list back to "any gear set".
      if (isClearListTokens(parsed)) { operations.push({ kind: 'sets', mode: 'replace', values: [] }); continue }
      const resolveId = (name: string): ArtifactSetId | undefined =>
        findArtifactSetIdByName(name) ?? undefined
      if (listMode === 'replace') {
        const values = parsed
          .map((t) => resolveId(t.value))
          .filter((v): v is ArtifactSetId => v != null)
          .map((id): ArtifactSetSelectionEntry => ({ id }))
        if (values.length > 0) operations.push({ kind: 'sets', mode: 'replace', values })
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
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'sets', mode: 'mutate', add, remove })
      }
      continue
    }

    // ── metasets = [+|-]Name, … ───────────────────────────────────────────────
    // Metaset display names stay raw strings; `+-` has no excluded-entry meaning
    // here and is treated as a plain add (recipe-side parity).
    if (field === 'metasets') {
      const rawTokens = [valueRaw, ...consumeCommaSeparatedRemainder(cursor)]
      const parsed = rawTokens.map(parsePrefixedToken)
      const listMode = classifyListMode(parsed)
      if (listMode === 'ignore') continue
      // `metasets=any` clears the metaset filter back to "any gear set".
      if (isClearListTokens(parsed)) { operations.push({ kind: 'metaSetNames', mode: 'replace', values: [] }); continue }
      if (listMode === 'replace') {
        const values = parsed.map((t) => t.value).filter((n) => n.length > 0)
        if (values.length > 0) operations.push({ kind: 'metaSetNames', mode: 'replace', values })
      } else {
        const add: string[] = []
        const remove: string[] = []
        for (const t of parsed) {
          if (!t.value) continue
          if (t.prefix === 'remove') remove.push(t.value)
          else add.push(t.value)
        }
        if (add.length > 0 || remove.length > 0) operations.push({ kind: 'metaSetNames', mode: 'mutate', add, remove })
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
      const variant = statKey ? statKeyToVariant(statKey) : null
      // An unknown stat suffix is a field-level typo (`weight.spdd`) — same treatment as any
      // other unrecognized field: skipped by the parser, underlined for the editor.
      if (variant == null) { reportUnknownField(token, diags, absoluteOffset); continue }
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

    // ── Unrecognized field ────────────────────────────────────────────────────
    // Every known field `continue`s above, so reaching here means the grammar has no
    // branch for this token. Skipped (lenient parse) but underlined for the editor.
    reportUnknownField(token, diags, absoluteOffset)
    skipAssignmentValue(cursor)
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

// ── Persisted SFC key ─────────────────────────────────────────────────────────
// Written after `Note` by buildSfcPayload, read by parseSfcObject; shared by the .sfc file,
// the autosave snapshot and the background push. Part of the on-disk format — never rename.

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
            // the raw slider position (legacy $count / $value bare reference). `group.count`
            // shares the count grammar, so it resolves identically — only the op kind differs.
            if ((op.kind === 'count' || op.kind === 'groupCount') && op.value === null) {
              const rawResult = op.ast
                ? evalCountAst(op.ast, resolvedValue, sliderValueByToken)
                : resolvedValue
              // Emit a resolved count op with no ast — the expression has been evaluated to a literal.
              return { kind: op.kind, value: clampNoteSafeguardOverridesCount(rawResult) }
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
  /**
   * Pending `group.*` writes, keyed by the RUN's start index and applied after the per-rule pass.
   *
   * A group's settings must be identical on every member (the normalizer enforces it and the
   * engine reads the run's head), so an override matching only SOME members cannot write just
   * those — it would split the run. Instead each matched member records its group's new settings
   * here, and the fan-out below writes them to the whole run.
   *
   * Keyed by run start, NOT by group id: membership is "adjacent AND same id", so two stretches
   * separated by anything are two independent runs even when they share an id, and retuning one
   * must leave the other alone. Reusing one entry per run also lets a later instruction refine
   * the same pending settings instead of clobbering them, exactly as per-rule ops compose on one
   * clone.
   */
  const pendingGroupWrites = new Map<number, SafeguardGroupSettings>()
  // The settings a `group.*` op should mutate: whatever is already pending for this rule's run,
  // else the run head's current settings. Null when the rule is not in a group — the op then
  // no-ops, because there is no group to retune.
  const pendingGroupFor = (index: number): SafeguardGroupSettings | null => {
    const range = safeguardGroupRunRange(rules, index)
    if (!range) return null
    const existing = pendingGroupWrites.get(range.start)
    if (existing) return existing
    // Seed from the run's HEAD — the copy the engine actually reads.
    const head = rules[range.start] as SafeguardRule
    if (!head.group) return null
    const seeded = cloneSafeguardGroupSettings(head.group)
    pendingGroupWrites.set(range.start, seeded)
    return seeded
  }

  for (const instruction of instructions) {
    const { selector, operations } = instruction
    // Match the selector against each rule (tags + group membership).
    rules.forEach((rule, index) => {
      if (!matchesTagSelectorForRule(selector, rule)) return
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
          case 'sets':
            if (op.mode === 'replace') {
              // Detach entries so later ops on the clone never mutate the parsed op.
              clone.combination.sets = op.values.map((e) => ({ ...e }))
            } else {
              // Entry map keyed by id: removals drop the entry regardless of its
              // excluded flag; adds overwrite, so `+-Name` flips an include to excluded.
              const removeSet = new Set<ArtifactSetId>(op.remove)
              const entryMap = new Map<ArtifactSetId, ArtifactSetSelectionEntry>(
                clone.combination.sets
                  .filter((e) => !removeSet.has(e.id))
                  .map((e) => [e.id, e]),
              )
              for (const entry of op.add) entryMap.set(entry.id, { ...entry })
              clone.combination.sets = [...entryMap.values()]
            }
            break
          case 'metaSetNames':
            if (op.mode === 'replace') {
              clone.combination.metaSetNames = [...op.values]
            } else {
              // Exact-name matching (recipe-side parity); adds are deduped against the kept base.
              const removeSet = new Set(op.remove)
              const base = clone.combination.metaSetNames.filter((n) => !removeSet.has(n))
              const existing = new Set(base)
              clone.combination.metaSetNames = [...base, ...op.add.filter((n) => !existing.has(n))]
            }
            break
          // ── group.* — recorded here, fanned out across the run below ──────────
          // Read from `rule` (the stored entry), not `clone`: group membership is never
          // changed by an override, so the clone would answer identically.
          case 'groupCount': {
            const pending = pendingGroupFor(index)
            // null values are resolved before reaching here (in resolveNoteSafeguardOverridesTags).
            if (pending && op.value !== null) pending.requiredCount = clampSafeguardRequiredCount(op.value)
            break
          }
          case 'groupCountMode': {
            const pending = pendingGroupFor(index)
            if (pending) pending.countMode = { ...pending.countMode, [op.chip]: op.value }
            break
          }
        }
      }
    })
  }
  // ── Fan out group writes across every member of the affected runs ────────────
  // Each pending entry is keyed by its run's start index, so the write lands on exactly the
  // members of that run — never on a second, unrelated run that happens to reuse the id.
  for (const [start, settings] of pendingGroupWrites) {
    const range = safeguardGroupRunRange(rules, start)
    if (!range) continue
    for (let index = range.start; index < range.end; index += 1) {
      // Only rewrite when the group actually changed — otherwise a matched selector would
      // clone every member of every group it touched for no reason.
      if (safeguardGroupSettingsEqual(rules[index]!.group, settings)) continue
      getClone(index).group = cloneSafeguardGroupSettings(settings)
    }
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
