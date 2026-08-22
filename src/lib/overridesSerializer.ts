/**
 * overridesSerializer.ts
 *
 * Draft → DSL emitter for note override blocks. The single place that knows how to
 * write `<!-- recipe-overrides … -->` / `<!-- safeguard-overrides … -->` text; the
 * parsers in noteOverridesParser/noteRecipeOverrides/noteSafeguardOverrides are the
 * read side. Emission is CANONICAL (lategame.sfc style): marker + [columns=N] on the
 * first line, `q`/option strings with each `[[cc]]` locale variant on its own 5-space
 * continuation line (diff-friendly, one locale per line), header tokens + the whole
 * `{ … }` body inline on the last string line, `-->` closer on its own line.
 *
 * Round-trip contract (pinned by tests/unit/overrides-serializer-roundtrip.test.ts):
 * parse(serialize(draft)) is structurally equal to the draft's source parse, and
 * serialize∘parse is a fixed point. The display-only format* helpers in the parser
 * modules are NOT reused for emission — they are lossy (unicode ≥/★, `tag in a,b`
 * without brackets); only the SSOT token maps and name tables are shared.
 */
import {
  type DraftLocalizedText,
  type DraftOption,
  type DraftOptionBody,
  type DraftSelectorBlock,
  type DraftSliderParams,
  type OverridesBlockDraft,
  type OverridesDomain,
} from './overridesDraftTypes'
import {
  type NoteCountAstNode,
  type NoteQuestionGroupType,
  type NoteTagSelector,
  NOTE_OVERRIDES_CLEAR_LIST_KEYWORD,
  NOTE_OVERRIDES_CROSS_KEYWORDS,
  NOTE_OVERRIDES_MARKER_COLUMNS_KEY,
  NOTE_OVERRIDES_MARKER_OPTION_COLUMNS_KEY,
} from './noteOverridesParser'
import {
  type RecipeOverridesOperation,
  type RecipeOverridesSelector,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD,
  RECIPE_OVERRIDES_OP_FIELD,
  RECIPE_OVERRIDES_SELECTOR_TOKEN,
} from './noteRecipeOverrides'
import {
  type SafeguardOverridesOperation,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  safeguardOverridesOpFieldToken,
} from './noteSafeguardOverrides'
import { SafeguardRuleActivation } from './safeguards'
import {
  RankCode as RankCodeEnum,
  type RankCode,
  type RankValue,
  artifactSetNames,
  artifactTypeNames,
  factionCodeToName,
  rarityCodeFromRankValue,
  rarityCodeParts,
  rarityCodeToName,
  // Stats are SPELLED through the DSL-key SSOT, not their display label: anomalous
  // substats must emit their writable internal key (see statVariantToKey).
  statVariantToKey,
} from './types'

/** Thrown when a draft holds a construct the DSL grammar cannot express (e.g. an
 *  `or` nested under `and` in the paren-less recipe selector grammar). Such drafts
 *  can only come from UI bugs — a parse can never produce them — so failing loudly
 *  beats silently emitting text that re-parses to different semantics. */
export class SerializeError extends Error {}

// ── String emission ───────────────────────────────────────────────────────────

/** Escape a value for a double-quoted DSL string. Only the escapes the tokenizer
 *  decodes (\\ \" \n \t \r) are produced; everything else passes through verbatim.
 *  Literal newlines are always escaped so a multi-line prompt can never trip the
 *  premature-string-close heuristic in overridesDiagnostics. */
export const escapeDslString = (value: string): string => (
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
)

/** Quote + escape a DSL string token. */
const quote = (value: string): string => `"${escapeDslString(value)}"`

/** Re-join a DraftLocalizedText into the single `Base[[cc]]Variant…` DSL value.
 *  Exact inverse of splitDslLocaleSegments for duplicate-free inputs. */
export const composeLocalizedText = (text: DraftLocalizedText): string => (
  text.base + text.locales.map((l) => `[[${l.code}]]${l.text}`).join('')
)

// ── Count / $value expression emission ────────────────────────────────────────

// Operator precedence for parenthesization: + - < * / < unary < primary.
const COUNT_PREC: Record<'+' | '-' | '*' | '/', number> = { '+': 1, '-': 1, '*': 2, '/': 2 }

// Emit a node and report its precedence so parents can decide on parens.
const emitCountNode = (node: NoteCountAstNode): { text: string; prec: number } => {
  switch (node.kind) {
    // Negative literals stay compact ('-2' lexes as one word → a negative literal).
    case 'literal': return { text: String(node.value), prec: 4 }
    case 'ref': return { text: node.sliderId ? `$value.${node.sliderId}` : '$value', prec: 4 }
    case 'unary': {
      const inner = emitCountNode(node.operand)
      // Unary minus must be its own space-separated word ('-' is not a tokenizer symbol).
      const operand = inner.prec < 3 ? `(${inner.text})` : inner.text
      return { text: `- ${operand}`, prec: 3 }
    }
    case 'binop': {
      const prec = COUNT_PREC[node.op]
      const left = emitCountNode(node.left)
      const right = emitCountNode(node.right)
      // Left child may share this precedence (left-assoc); right child needs it strictly
      // higher, and '-'/'/' additionally demote an equal-precedence right child.
      const l = left.prec < prec ? `(${left.text})` : left.text
      const r = right.prec < prec || (right.prec === prec && (node.op === '-' || node.op === '/'))
        ? `(${right.text})` : right.text
      // Spaces around every operator: mandatory for '-' (word token), harmless otherwise.
      return { text: `${l} ${node.op} ${r}`, prec }
    }
  }
}

/** Emit a `$count`/`$value` arithmetic expression as parse-exact DSL. */
export const serializeCountExpression = (node: NoteCountAstNode): string => emitCountNode(node).text

// ── Shared value emitters ─────────────────────────────────────────────────────

// Comparison-op → ASCII DSL symbol (never the unicode ≥/≤ display glyphs).
const OP_SYMBOL: Record<'eq' | 'gte' | 'lte', string> = { eq: '=', gte: '>=', lte: '<=' }

// RankCode → the comparator + digit that re-parse to exactly this code.
// Exhaustive over the RankCode constant so a new code fails the lookup loudly.
const RANK_CODE_EMIT: Record<number, { op: 'eq' | 'gte' | 'lte'; text: string }> = {
  [RankCodeEnum.Any]: { op: 'eq', text: 'any' },
  [RankCodeEnum.One]: { op: 'eq', text: '1' }, [RankCodeEnum.Two]: { op: 'eq', text: '2' },
  [RankCodeEnum.Three]: { op: 'eq', text: '3' }, [RankCodeEnum.Four]: { op: 'eq', text: '4' },
  [RankCodeEnum.Five]: { op: 'eq', text: '5' }, [RankCodeEnum.Six]: { op: 'eq', text: '6' },
  [RankCodeEnum.GTE_One]: { op: 'gte', text: '1' }, [RankCodeEnum.GTE_Two]: { op: 'gte', text: '2' },
  [RankCodeEnum.GTE_Three]: { op: 'gte', text: '3' }, [RankCodeEnum.GTE_Four]: { op: 'gte', text: '4' },
  [RankCodeEnum.GTE_Five]: { op: 'gte', text: '5' },
  [RankCodeEnum.LTE_Two]: { op: 'lte', text: '2' }, [RankCodeEnum.LTE_Three]: { op: 'lte', text: '3' },
  [RankCodeEnum.LTE_Four]: { op: 'lte', text: '4' }, [RankCodeEnum.LTE_Five]: { op: 'lte', text: '5' },
  [RankCodeEnum.LTE_Six]: { op: 'lte', text: '6' },
}

// Resolve a rank code's emit entry or fail loudly (an unknown code cannot round-trip).
const rankCodeEmit = (code: RankCode): { op: 'eq' | 'gte' | 'lte'; text: string } => {
  const entry = RANK_CODE_EMIT[code]
  if (!entry) throw new SerializeError(`rank code ${code} has no DSL emission`)
  return entry
}

/** DSL surface form of a composite rank code (`{op:'>=', text:'5'}` for GTE_Five).
 *  Exported for the visual selector rows, which display and recompose the same
 *  spellings this serializer emits (SSOT). */
export const describeRankCodeDsl = (code: RankCode): { op: '=' | '>=' | '<='; text: string } => {
  const entry = rankCodeEmit(code)
  return { op: OP_SYMBOL[entry.op] as '=' | '>=' | '<=', text: entry.text }
}

/** Lowercase base rarity name for a (possibly composite) rarity code — the value
 *  spelling the parser accepts. Exported for the visual selector rows (SSOT). */
export const describeRarityCodeDsl = (code: number): string => rarityCodeBaseName(code)

// Rarity code → lowercase base name (via rarityCodeParts + the rank-value name SSOT).
const rarityCodeBaseName = (code: number): string => {
  const parts = rarityCodeParts(code)
  if (parts.rank == null) return 'any'
  return rarityCodeToName(rarityCodeFromRankValue(parts.rank)).toLowerCase()
}

// Safeguard rarity list value (RankValue 1–6) → lowercase rarity name accepted by rarityCodeByName.
const rankValueRarityDsl = (rv: RankValue): string => (
  rarityCodeToName(rarityCodeFromRankValue(rv)).toLowerCase()
)

// SafeguardRuleActivation enum value → canonical DSL keyword. Typed over the enum so a
// new activation mode fails to compile until its DSL spelling is registered here.
const ACTIVATION_DSL: Record<SafeguardRuleActivation, (typeof NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS)[number]> = {
  [SafeguardRuleActivation.Off]: 'off',
  [SafeguardRuleActivation.ProtectExisting]: 'protect_existing',
  [SafeguardRuleActivation.AnticipateGaps]: 'anticipate_gaps',
  [SafeguardRuleActivation.AnticipateImprovements]: 'anticipate_improvements',
}

// ── List-value emission (slots/substats/gearsets/… and safeguard lists) ───────

// Characters that survive as ONE bare word token: no whitespace, none of the
// tokenizer's symbol set, no '&'/'|' (word breakers), no '"' (string opener mid-word
// would still be glued, but quoting is clearer). Leading '-'/'+' are prefix syntax.
const BARE_LIST_TOKEN = /^[^\s"{}[\](),*+@=<>!:^/&|]+$/

/** Emit one list entry with its mutate prefix ('' | '+' | '-' | '+-'). Names the
 *  tokenizer cannot hold in a bare word (spaces, punctuation) are quoted with the
 *  prefix INSIDE the quotes — parsePrefixedToken reads the prefix off the string
 *  value, so `"+-Crit Damage"` round-trips as an excluded-add of "Crit Damage". */
const emitListValue = (prefix: '' | '+' | '-' | '+-', name: string): string => {
  const bare = BARE_LIST_TOKEN.test(name) && !name.startsWith('-')
  return bare ? `${prefix}${name}` : quote(`${prefix}${name}`)
}

// Emit a whole list field: replace → bare names; mutate → prefixed adds then removes.
const emitList = (field: string, entries: Array<{ prefix: '' | '+' | '-' | '+-'; name: string }>): string => {
  if (entries.length === 0) throw new SerializeError(`${field}= list is empty`)
  return `${field}=${entries.map((e) => emitListValue(e.prefix, e.name)).join(',')}`
}

/** Same as emitList for the gear-set / metaset fields, where an empty REPLACE is a
 *  legal state ("any gear set") rather than an authoring error: it round-trips as the
 *  clear keyword instead of throwing. Mutate lists stay non-empty by construction. */
const emitClearableList = (field: string, entries: Array<{ prefix: '' | '+' | '-' | '+-'; name: string }>): string => (
  entries.length === 0 ? `${field}=${NOTE_OVERRIDES_CLEAR_LIST_KEYWORD}` : emitList(field, entries)
)

// ── Recipe selector emission ──────────────────────────────────────────────────

// Grammar levels for parenthesization decisions: or < and < not < term.
const recipeSelLevel = (sel: RecipeOverridesSelector): number => (
  sel.kind === 'or' ? 1 : sel.kind === 'and' ? 2 : sel.kind === 'not' ? 3 : 4
)

// Emit one comparison term (`field op value`) for the recipe selector grammar.
const emitRecipeSelTerm = (sel: RecipeOverridesSelector): string => {
  switch (sel.kind) {
    case 'all': case 'tagged': case 'untagged':
      return RECIPE_OVERRIDES_SELECTOR_TOKEN[sel.kind]
    case 'tag': {
      const values = sel.values ?? []
      if (sel.mode === 'any') return 'tag any'
      if (sel.mode === 'none') return 'tag none'
      // `tag in […]` — the brackets are mandatory in the grammar.
      if (sel.mode === 'in') return `tag in [${values.join(',')}]`
      if (values.length !== 1) throw new SerializeError('tag= selector needs exactly one value')
      return `tag=${values[0]}`
    }
    case 'rank': return `rank${OP_SYMBOL[sel.op]}${rankCodeEmit(sel.value).text}`
    case 'rarity': return `rarity${OP_SYMBOL[sel.op]}${sel.mode === 'auto' ? 'auto' : rarityCodeBaseName(sel.code ?? 0)}`
    case 'minRolls': return `minrolls${OP_SYMBOL[sel.op]}${sel.value}`
    case 'lockedMinRolls': return `lockedminrolls${OP_SYMBOL[sel.op]}${sel.value}`
    case 'minSubstats': return `minsubstats${OP_SYMBOL[sel.op]}${sel.value}`
    case 'flex': return `flex=${sel.value ? 'on' : 'off'}`
    // Behaviour flags: flat comparison terms (the recipe selector grammar has no parens, and
    // a flag is a state anyway). Field tokens come from the shared selector-token map.
    case 'ignoredBySafeguards': return `${RECIPE_OVERRIDES_SELECTOR_TOKEN[sel.kind]}=${sel.value ? 'on' : 'off'}`
    // The gate's three values are already the DSL spelling (including 'any' for "no gate").
    case 'reworkGate': return `${RECIPE_OVERRIDES_SELECTOR_TOKEN[sel.kind]}=${sel.value}`
    case 'substatMin': return `substatmin${OP_SYMBOL[sel.op]}${sel.value}`
    case 'substatMinField': return `substatmin.${statVariantToKey(sel.variant)}${OP_SYMBOL[sel.op]}${sel.value}`
    case 'minimaAny': return `minima.any${OP_SYMBOL[sel.op]}${sel.value}`
    case 'minimaField': return `minima.${sel.star}.${statVariantToKey(sel.variant)}${OP_SYMBOL[sel.op]}${sel.value}`
    case 'not': case 'and': case 'or':
      throw new SerializeError('combinator reached term emitter')  // handled by emitRecipeSel
  }
}

// The recipe selector grammar has NO parentheses, so any tree that needs them
// (an `or` under `and`/`not`, a `not` over a combinator) is inexpressible → throw.
// Such trees can never come from a parse; only a UI bug could build one.
const emitRecipeSel = (sel: RecipeOverridesSelector, minLevel: number): string => {
  if (recipeSelLevel(sel) < minLevel) {
    throw new SerializeError(`recipe selector needs parentheses (${sel.kind} nested too deep) — the grammar has none`)
  }
  if (sel.kind === 'or') return `${emitRecipeSel(sel.left, 1)} or ${emitRecipeSel(sel.right, 2)}`
  if (sel.kind === 'and') return `${emitRecipeSel(sel.left, 2)} and ${emitRecipeSel(sel.right, 3)}`
  if (sel.kind === 'not') return `not ${emitRecipeSel(sel.inner, 3)}`
  return emitRecipeSelTerm(sel)
}

/** Emit a recipe `@…` selector expression (without the leading `@`). */
export const serializeRecipeSelector = (sel: RecipeOverridesSelector): string => emitRecipeSel(sel, 1)

// ── Safeguard (tag) selector emission ─────────────────────────────────────────

const tagSelLevel = (sel: NoteTagSelector): number => (
  sel.kind === 'or' ? 1 : sel.kind === 'and' ? 2 : sel.kind === 'not' ? 3 : 4
)

// The shared tag-selector grammar DOES support parentheses, so instead of throwing
// we wrap too-deep subtrees in `( … )`.
const emitTagSel = (sel: NoteTagSelector, minLevel: number): string => {
  if (tagSelLevel(sel) < minLevel) return `(${emitTagSel(sel, 1)})`
  switch (sel.kind) {
    case 'all': return 'all'
    case 'tagged': return 'tagged'
    case 'untagged': return 'untagged'
    case 'grouped': return 'grouped'
    case 'ungrouped': return 'ungrouped'
    case 'tag': {
      const values = sel.values ?? []
      if (sel.mode === 'any') return 'tag any'
      if (sel.mode === 'none') return 'tag none'
      if (sel.mode === 'in') return `tag in [${values.join(',')}]`
      if (values.length !== 1) throw new SerializeError('tag= selector needs exactly one value')
      return `tag=${values[0]}`
    }
    case 'not': return `not ${emitTagSel(sel.inner, 3)}`
    case 'and': return `${emitTagSel(sel.left, 2)} and ${emitTagSel(sel.right, 3)}`
    case 'or': return `${emitTagSel(sel.left, 1)} or ${emitTagSel(sel.right, 2)}`
  }
}

/** Emit a safeguard (tag-only) `@…` selector expression (without the leading `@`). */
export const serializeSafeguardSelector = (sel: NoteTagSelector): string => emitTagSel(sel, 1)

// ── Recipe operation emission ─────────────────────────────────────────────────

// Numeric field with a possible cross-domain $value expression (rank/minrolls/…).
const emitNumericOrExpr = (field: string, value: number | null, ast?: NoteCountAstNode): string => (
  value != null ? `${field}=${value}` : `${field}=${ast ? serializeCountExpression(ast) : '$value'}`
)

/** Emit one recipe `field=value` assignment as parse-exact DSL. Exhaustive over the
 *  operation union; field spellings come from the RECIPE_OVERRIDES_OP_FIELD SSOT. */
export function serializeRecipeOperation(op: RecipeOverridesOperation): string {
  const field = RECIPE_OVERRIDES_OP_FIELD[op.kind]
  switch (op.kind) {
    case 'exportMode': return `${field}=${op.action}`
    case 'rank': {
      // Cross-domain slider form: `rank=$value` / expression.
      if (op.value == null) return emitNumericOrExpr(field, null, op.ast)
      // The composite code carries its own comparator (rank>=3 → GTE_Three).
      const emit = rankCodeEmit(op.value)
      return `${field}${OP_SYMBOL[emit.op]}${emit.text}`
    }
    case 'rarity': {
      if (op.mode === 'auto') return `${field}=auto`
      // The code encodes the comparator (GTE_Epic → `rarity>=epic`).
      const parts = rarityCodeParts(op.code ?? 0)
      const opSym = parts.comparator === '≥' ? '>=' : parts.comparator === '≤' ? '<=' : '='
      return `${field}${opSym}${rarityCodeBaseName(op.code ?? 0)}`
    }
    // Collapse min=max ranges to the single-milestone form.
    case 'level': return op.min === op.max ? `${field}=${op.min}` : `${field}=${op.min}-${op.max}`
    case 'keep': return `${field}=${op.mode}`
    case 'keepAction': return `${field}=${op.action}`
    case 'autoLate': return `${field}=${op.threshold}`
    case 'minRequiredRolls':
    case 'lockedMinRequiredRolls':
    case 'minSubstats': return emitNumericOrExpr(field, op.value, op.ast)
    case 'flex': return `${field}=${op.value ? 'on' : 'off'}`
    // Behaviour flags — same on/off and gate spellings the selector terms above emit, so a
    // block that reads a flag and one that writes it look identical in the note.
    case 'ignoredBySafeguards': return `${field}=${op.value ? 'on' : 'off'}`
    case 'reworkGate': return `${field}=${op.value}`
    case 'substatMinAll': return `${field}=${op.value}`
    case 'substatMinVariant': return `${field}.${statVariantToKey(op.variant)}=${op.value}`
    case 'minimaAnyRank': return `${field}.any=${op.value}`
    case 'minimaTarget': return `${field}.${op.star}.${statVariantToKey(op.variant)}=${op.value}`
    // Null increments are empty slots between commas (`300,,900`); trailing nulls survive too.
    case 'rollTarget': return `${field}.${statVariantToKey(op.variant)}=${op.base}${op.increments.map((n) => `,${n == null ? '' : n}`).join('')}`
    case 'artifactTypes': return op.mode === 'replace'
      ? emitList(field, op.values.map((id) => ({ prefix: '' as const, name: artifactTypeNames[id] ?? String(id) })))
      : emitList(field, [
        ...op.add.map((id) => ({ prefix: '+' as const, name: artifactTypeNames[id] ?? String(id) })),
        ...op.remove.map((id) => ({ prefix: '-' as const, name: artifactTypeNames[id] ?? String(id) })),
      ])
    case 'substats':
    case 'mainStats': return op.mode === 'replace'
      ? emitList(field, op.variants.map((v) => ({ prefix: '' as const, name: statVariantToKey(v) })))
      : emitList(field, [
        ...op.add.map((v) => ({ prefix: '+' as const, name: statVariantToKey(v) })),
        ...op.remove.map((v) => ({ prefix: '-' as const, name: statVariantToKey(v) })),
      ])
    case 'artifactSets': return op.mode === 'replace'
      ? emitClearableList(field, op.ids.map((id) => ({ prefix: '' as const, name: artifactSetNames[id] ?? String(id) })))
      : emitList(field, [
        // `+-Name` marks an excluded-set add (kept distinct from plain '+').
        ...op.add.map((e) => ({ prefix: (e.excluded ? '+-' : '+') as '+' | '+-', name: artifactSetNames[e.id] ?? String(e.id) })),
        ...op.remove.map((id) => ({ prefix: '-' as const, name: artifactSetNames[id] ?? String(id) })),
      ])
    case 'artifactMetaSets': return op.mode === 'replace'
      ? emitClearableList(field, op.names.map((name) => ({ prefix: '' as const, name })))
      : emitList(field, [
        ...op.add.map((name) => ({ prefix: '+' as const, name })),
        ...op.remove.map((name) => ({ prefix: '-' as const, name })),
      ])
  }
}

// ── Safeguard operation emission ──────────────────────────────────────────────

/** Emit one safeguard `field=value` assignment as parse-exact DSL. Exhaustive over
 *  the operation union; field spellings come from SAFEGUARD_OVERRIDES_OP_FIELD. */
export function serializeSafeguardOperation(op: SafeguardOverridesOperation): string {
  // The dotted `group.*` family's token depends on the op's payload, so the field spelling
  // comes from the shared resolver rather than the plain kind→field map.
  const field = safeguardOverridesOpFieldToken(op)
  switch (op.kind) {
    case 'activation': return `${field}=${ACTIVATION_DSL[op.value]}`
    case 'count': return emitNumericOrExpr(field, op.value, op.ast)
    case 'ignPrev':
    case 'ignEquippedCollection':
    case 'ignEquippedVault':
    case 'perFaction':
    case 'perMainStat':
    case 'perSlot':
    case 'perSet':
    case 'perRule': return `${field}=${op.value ? 'on' : 'off'}`
    case 'substats': return op.mode === 'replace'
      ? emitList(field, op.stats.map((v) => ({ prefix: '' as const, name: statVariantToKey(v) })))
      : emitList(field, [
        ...op.add.map((v) => ({ prefix: '+' as const, name: statVariantToKey(v) })),
        ...op.remove.map((v) => ({ prefix: '-' as const, name: statVariantToKey(v) })),
      ])
    // Value strings ('1'…'4' / 'perSubstat') lowercase into the accepted keyword set.
    case 'substatMatch': return `${field}=${String(op.value).toLowerCase()}`
    case 'substatWeight': return `${field}.${statVariantToKey(op.stat)}=${op.value}`
    case 'improvementChance': {
      if (op.dynamic) return `${field}=$value`
      if (op.value == null) return `${field}=disabled`
      // Thresholds inherit suffix-first: emit the non-null prefix (parse guarantees
      // later stages are only set when every earlier one is).
      const stages = [op.value.atLevel0, op.value.atLevel4, op.value.atLevel8, op.value.atLevel12]
      const prefix: number[] = []
      for (const stage of stages) {
        if (stage == null) break
        prefix.push(stage)
      }
      return `${field}=${prefix.join(',')}`
    }
    case 'ranks': return op.mode === 'replace'
      ? emitList(field, op.values.map((v) => ({ prefix: '' as const, name: String(v) })))
      : emitList(field, [
        ...op.add.map((v) => ({ prefix: '+' as const, name: String(v) })),
        ...op.remove.map((v) => ({ prefix: '-' as const, name: String(v) })),
      ])
    case 'rarities': return op.mode === 'replace'
      ? emitList(field, op.values.map((v) => ({ prefix: '' as const, name: rankValueRarityDsl(v) })))
      : emitList(field, [
        ...op.add.map((v) => ({ prefix: '+' as const, name: rankValueRarityDsl(v) })),
        ...op.remove.map((v) => ({ prefix: '-' as const, name: rankValueRarityDsl(v) })),
      ])
    case 'factions': return op.mode === 'replace'
      ? emitList(field, op.values.map((f) => ({ prefix: '' as const, name: factionCodeToName(f) })))
      : emitList(field, [
        ...op.add.map((f) => ({ prefix: '+' as const, name: factionCodeToName(f) })),
        ...op.remove.map((f) => ({ prefix: '-' as const, name: factionCodeToName(f) })),
      ])
    // Gear-set / metaset lists mirror the recipe emitters exactly (same +/-/+- prefixes).
    case 'sets': return op.mode === 'replace'
      ? emitClearableList(field, op.values.map((e) => ({ prefix: '' as const, name: artifactSetNames[e.id] ?? String(e.id) })))
      : emitList(field, [
        // `+-Name` marks an excluded-set add (kept distinct from plain '+').
        ...op.add.map((e) => ({ prefix: (e.excluded ? '+-' : '+') as '+' | '+-', name: artifactSetNames[e.id] ?? String(e.id) })),
        ...op.remove.map((id) => ({ prefix: '-' as const, name: artifactSetNames[id] ?? String(id) })),
      ])
    case 'metaSetNames': return op.mode === 'replace'
      ? emitClearableList(field, op.values.map((name) => ({ prefix: '' as const, name })))
      : emitList(field, [
        ...op.add.map((name) => ({ prefix: '+' as const, name })),
        ...op.remove.map((name) => ({ prefix: '-' as const, name })),
      ])
    // group.* mirrors the emitters of its ungrouped twin — the dotted field carries the
    // distinction, so the value spelling stays identical and re-parses to the same op.
    case 'groupCount': return emitNumericOrExpr(field, op.value, op.ast)
    case 'groupCountMode': return `${field}=${op.value ? 'on' : 'off'}`
  }
}

// ── Selector-block / body emission ────────────────────────────────────────────

/** Cross-domain block keyword by the DRAFT's own domain (a recipe option's cross
 *  blocks target safeguards, and vice versa). Alias of the parser SSOT so emission
 *  can never fork from the grammar/highlighter spelling. */
export const OVERRIDES_CROSS_KEYWORD: Record<OverridesDomain, string> = NOTE_OVERRIDES_CROSS_KEYWORDS

/** Emit one `@selector { operations }` block (without any cross-domain keyword). */
export function serializeDraftSelectorBlock(block: DraftSelectorBlock): string {
  // A block with zero operations would be silently dropped on re-parse — refuse it.
  if (block.operations.length === 0) throw new SerializeError('selector block has no operations')
  const selector = block.domain === 'recipe'
    ? serializeRecipeSelector(block.selector)
    : serializeSafeguardSelector(block.selector)
  const ops = block.domain === 'recipe'
    ? block.operations.map(serializeRecipeOperation)
    : block.operations.map(serializeSafeguardOperation)
  return `@${selector} { ${ops.join(' ')} }`
}

// Emit a mixed run of same-domain and cross-domain blocks (cross prefixed by keyword).
const emitBlockRun = (domain: OverridesDomain, main: DraftSelectorBlock[], cross: DraftSelectorBlock[]): string[] => ([
  ...main.map((b) => serializeDraftSelectorBlock(b)),
  ...cross.map((b) => `${OVERRIDES_CROSS_KEYWORD[domain]} ${serializeDraftSelectorBlock(b)}`),
])

/** Emit an option's whole `{ … }` body (raw text passes through verbatim). */
export function serializeOptionBody(domain: OverridesDomain, body: DraftOptionBody): string {
  if (body.kind === 'raw') return body.text
  const parts = emitBlockRun(domain, body.blocks, body.crossBlocks)
  // Per-option else section: applied while the option is NOT selected.
  const elseParts = emitBlockRun(domain, body.elseBlocks, body.crossElseBlocks)
  if (elseParts.length > 0) parts.push(`else { ${elseParts.join(' ')} }`)
  return parts.length > 0 ? `{ ${parts.join(' ')} }` : '{}'
}

// ── Block emission (lines) ────────────────────────────────────────────────────

// Continuation indent for `[[cc]]` locale lines and follow-on string lines (lategame style).
const CONT_INDENT = '     '

/** Line accumulator with token-level space management for the canonical layout. */
class DslLineBuilder {
  private lines: string[] = []
  private current: string | null = null

  /** Start a fresh line with the given prefix (flushes the previous one). */
  open(prefix: string): void {
    this.flush()
    this.current = prefix
  }

  /** Append text verbatim to the current line (caller controls separators). */
  append(text: string): void {
    this.current = (this.current ?? '') + text
  }

  /** Append a token, inserting one space unless the line is empty or ends in a space. */
  token(text: string): void {
    const cur = this.current ?? ''
    this.current = cur + (cur === '' || cur.endsWith(' ') ? '' : ' ') + text
  }

  /** Flush the current line and start a continuation line at the given indent. */
  newline(indent: string): void {
    this.flush()
    this.current = indent
  }

  private flush(): void {
    if (this.current !== null) this.lines.push(this.current)
    this.current = null
  }

  build(): string {
    this.flush()
    return this.lines.join('\n')
  }
}

// Emit a localized string: base on the current line, each `[[cc]]` variant on its own
// continuation line (the diff-friendly split the tokenizer re-merges). `glue` appends
// the base with no separating space (used after `marks=10:` and `unit=`).
const emitLocalized = (b: DslLineBuilder, text: DraftLocalizedText, glue = false): void => {
  if (glue) b.append(quote(text.base))
  else b.token(quote(text.base))
  for (const locale of text.locales) {
    b.newline(CONT_INDENT)
    b.append(quote(`[[${locale.code}]]${locale.text}`))
  }
}

// Emit slider header params in canonical order (marks last — its localized labels
// split lines, and follow-on tokens must ride the final continuation line).
const emitSliderParams = (b: DslLineBuilder, params: DraftSliderParams): void => {
  // Always emit the full numeric quartet: values are post-clamp, so this is idempotent.
  b.token(`min=${params.min}`)
  b.token(`max=${params.max}`)
  b.token(`step=${params.step}`)
  b.token(`default=${params.default}`)
  if (params.unit) { b.token('unit='); emitLocalized(b, params.unit, true) }
  if (params.toggle) {
    b.token('toggle=')
    emitLocalized(b, params.toggle.label, true)
    // Explicit side/default keep the emission canonical even for parse-time defaults.
    b.token(`toggleside=${params.toggle.side}`)
    b.token(`toggledefault=${params.toggle.default}`)
  }
  if (params.marks.length > 0) {
    params.marks.forEach((mark, index) => {
      // First mark opens `marks=`; later marks continue with a glued comma separator.
      if (index === 0) b.token(`marks=${mark.value}:`)
      else b.append(`,${mark.value}:`)
      emitLocalized(b, mark.label, true)
      if (mark.subtext) { b.append(':'); emitLocalized(b, mark.subtext, true) }
    })
  }
}

// Canonical surface keyword per logical group type (single/radio/s all normalize to rb).
const GROUP_TYPE_KEYWORD: Record<NoteQuestionGroupType, string> = {
  single: 'rb',
  multi: 'cb',
  slider: 'slider',
}

// Emit one option: keyword + label/detail strings, header tokens, inline body.
const emitOption = (b: DslLineBuilder, domain: OverridesDomain, option: DraftOption): void => {
  b.open(`  ${GROUP_TYPE_KEYWORD[option.groupType]}`)
  emitLocalized(b, option.label)
  if (option.detail) {
    // Detail base starts its own continuation line (it must not merge into the label).
    b.newline(CONT_INDENT)
    emitLocalized(b, option.detail, true)
  }
  // Header token order: * → id= → ^only → +set → -unset → excl → needs → setval.
  // Each keyword list terminates at the next directive per readTokenList's stop set.
  if (option.isDefault) b.token('*')
  if (option.explicitId) b.token(`id=${option.explicitId}`)
  if (option.groupType === 'slider') {
    if (option.sliderParams) emitSliderParams(b, option.sliderParams)
  } else {
    if (option.onlyTokens.length > 0) b.token(`^${option.onlyTokens.join(' ')}`)
    for (const token of option.setTokens) b.token(`+${token}`)
    for (const token of option.unsetTokens) b.token(`-${token}`)
    if (option.excludedTokens.length > 0) b.token(`excl ${option.excludedTokens.join(' ')}`)
    if (option.needsTokens.length > 0 || option.needsDisabledState !== null) {
      const state = option.needsDisabledState !== null ? `=${option.needsDisabledState}` : ''
      b.token(`needs${state}${option.needsTokens.length > 0 ? ` ${option.needsTokens.join(' ')}` : ''}`)
    }
    if (option.setValueDirectives.length > 0) {
      b.token(`setval ${option.setValueDirectives.map((d) => `${d.token}=${d.value}`).join(' ')}`)
    }
  }
  // The whole body rides the last string/header line (canonical single-line body).
  b.token(serializeOptionBody(domain, option.body))
}

/**
 * Emit a whole `<!-- … -->` override block in canonical form. Throws SerializeError
 * for grammar-inexpressible drafts (which only a UI bug can construct — never a parse).
 */
export function serializeOverridesBlock(draft: OverridesBlockDraft): string {
  const keyword = draft.domain === 'recipe'
    ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD
    : NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD
  // Build the `[ … ]` attribute list. A count of 0 is the parser default → omit that key.
  // Spacers only carry width; questions may also carry the option-grid column count (optcols).
  const attrPairs: Array<[string, number]> = [[NOTE_OVERRIDES_MARKER_COLUMNS_KEY, draft.columns]]
  if (draft.kind === 'question') attrPairs.push([NOTE_OVERRIDES_MARKER_OPTION_COLUMNS_KEY, draft.optionColumns])
  const attrBody = attrPairs.filter(([, v]) => v > 0).map(([k, v]) => `${k}=${v}`).join(' ')
  const columnsAttr = attrBody ? ` [${attrBody}]` : ''
  // Spacer markers are single-line width placeholders with no question body.
  if (draft.kind === 'spacer') return `<!-- ${keyword}${columnsAttr} -->`

  const b = new DslLineBuilder()
  b.open(`<!-- ${keyword}${columnsAttr}`)
  b.open('  q')
  emitLocalized(b, draft.prompt)
  // Emit a pinned question id (`q "…" id=TOKEN`) right after the prompt, before the options —
  // matching the parser's consume order so a re-parse recovers the same id. Omitted when the
  // id is derived from content, so notes that never pinned an id stay byte-identical.
  if (draft.explicitId) b.token(`id=${draft.explicitId}`)
  for (const option of draft.options) emitOption(b, draft.domain, option)
  if (draft.fallback) {
    // Question-level fallback (applies when no group has selections).
    const parts = emitBlockRun(draft.domain, draft.fallback.blocks, draft.fallback.crossBlocks)
    if (parts.length > 0) b.open(`  fallback { ${parts.join(' ')} }`)
  }
  b.open('-->')
  return b.build()
}
