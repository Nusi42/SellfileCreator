/**
 * overridesEditorModel.ts
 *
 * Thin bridge between the visual override-block editor's row widgets and the real
 * DSL parser/serializer pair. Rows edit small DSL fragments (one selector expression,
 * one `field=value` assignment); this module validates and converts them by parsing a
 * synthetic single-option block through the SAME grammar entry points the note uses —
 * the parser stays the single source of truth for what is valid, and the serializer
 * for how fragments render back to text. No token spelling is re-declared here.
 */
import {
  type NoteTagSelector,
  NOTE_OVERRIDES_BOOLEAN_KEYWORDS,
  NOTE_OVERRIDES_CROSS_KEYWORDS,
  NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS,
} from './noteOverridesParser'
import {
  type RecipeOverridesOperation,
  type RecipeOverridesSelector,
  NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_RECIPE_OVERRIDES_ACTION_VALS,
  NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS,
  NOTE_RECIPE_OVERRIDES_EXPORT_VALS,
  NOTE_RECIPE_OVERRIDES_KEEP_VALS,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD,
  NOTE_RECIPE_OVERRIDES_RARITY_NAMES,
  NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS,
  NOTE_RECIPE_OVERRIDES_SLOT_NAMES,
} from './noteRecipeOverrides'
import {
  type SafeguardOverridesOperation,
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS,
} from './noteSafeguardOverrides'
import { type DraftSelectorBlock, type DraftStructuredBody, type OverridesDomain } from './overridesDraftTypes'
import { parseOverridesBlockDraft } from './overridesDraft'
import {
  SerializeError,
  serializeOptionBody,
  serializeRecipeOperation,
  serializeRecipeSelector,
  serializeSafeguardOperation,
  serializeSafeguardSelector,
} from './overridesSerializer'

// ── Fragment ↔ text conversion ────────────────────────────────────────────────

/** Serialize a block's selector for its row text field. */
export const selectorToText = (block: DraftSelectorBlock): string => (
  block.domain === 'recipe' ? serializeRecipeSelector(block.selector) : serializeSafeguardSelector(block.selector)
)

/** Serialize one operation for its row chip / edit field. */
export const operationToText = (block: DraftSelectorBlock, index: number): string => (
  block.domain === 'recipe'
    ? serializeRecipeOperation(block.operations[index] as RecipeOverridesOperation)
    : serializeSafeguardOperation(block.operations[index] as SafeguardOverridesOperation)
)

// Build a synthetic one-option block whose single body block carries the fragment.
// hostDomain picks the marker grammar; blockDomain decides whether the fragment sits
// in a main block or a cross-domain (`safeguard @…` / `recipe @…`) block — the latter
// is what enables $value expressions in recipe ops hosted by safeguard markers.
const buildFragmentBlock = (
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  selectorText: string,
  operationsText: string,
): string => {
  // Marker + cross keywords come from the grammar SSOT constants, never literals.
  const keyword = hostDomain === 'recipe' ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD : NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD
  const cross = hostDomain !== blockDomain ? `${NOTE_OVERRIDES_CROSS_KEYWORDS[hostDomain]} ` : ''
  return `<!-- ${keyword}\n  q "q"\n  rb "opt" { ${cross}@${selectorText} { ${operationsText} } }\n-->`
}

// Parse the synthetic block and pull the single body block back out (main or cross).
const parseFragment = (
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  selectorText: string,
  operationsText: string,
): DraftSelectorBlock | null => {
  const raw = buildFragmentBlock(hostDomain, blockDomain, selectorText, operationsText)
  const { draft, diagnostics } = parseOverridesBlockDraft(raw)
  // Any diagnostic means the fragment is not clean DSL — reject it outright.
  if (diagnostics.length > 0 || !draft || draft.kind !== 'question') return null
  const option = draft.options[0]
  if (!option || option.body.kind !== 'structured') return null
  const isCross = hostDomain !== blockDomain
  const blocks = isCross ? option.body.crossBlocks : option.body.blocks
  const other = isCross ? option.body.blocks : option.body.crossBlocks
  // Exactly one block must come back, in the expected family, with nothing leaking
  // into else sections (a stray `}` in the fragment would shift content around).
  if (blocks.length !== 1 || other.length !== 0 || option.body.elseBlocks.length !== 0 || option.body.crossElseBlocks.length !== 0) return null
  return blocks[0] ?? null
}

// Benign no-op-ish operation per domain, used when only the selector is being validated.
const PROBE_OPERATION: Record<OverridesDomain, string> = { recipe: 'export=active', safeguard: 'count=1' }

/**
 * Parse a selector row's text (without the `@`). Returns the typed selector or null
 * when the text is not a clean, complete selector expression for that grammar.
 */
export function parseSelectorText(
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  text: string,
): RecipeOverridesSelector | NoteTagSelector | null {
  const trimmed = text.trim()
  // Braces would break out of the synthetic structure; they are never part of a selector.
  if (!trimmed || trimmed.includes('{') || trimmed.includes('}')) return null
  const block = parseFragment(hostDomain, blockDomain, trimmed, PROBE_OPERATION[blockDomain])
  return block?.selector ?? null
}

/**
 * Parse ONE operation row's text (`field=value`, `rank>=3`, `count=$value/8`, …).
 * Returns the typed operation or null when it is not exactly one clean assignment.
 */
export function parseOperationText(
  hostDomain: OverridesDomain,
  blockDomain: OverridesDomain,
  text: string,
): RecipeOverridesOperation | SafeguardOverridesOperation | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.includes('{') || trimmed.includes('}')) return null
  const block = parseFragment(hostDomain, blockDomain, 'all', trimmed)
  if (!block || block.operations.length !== 1) return null
  return block.operations[0] ?? null
}

/**
 * Convert a raw `{ … }` body into the structured model, or null when it is not
 * clean, fully-representable DSL. Runs the same parse + fidelity gate the block
 * mapper uses (via a synthetic single-option block), so "convertible" here means
 * exactly "the structured builder can hold it without semantic loss".
 */
export function rawBodyToStructured(hostDomain: OverridesDomain, rawText: string): DraftStructuredBody | null {
  const keyword = hostDomain === 'recipe' ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD : NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD
  const raw = `<!-- ${keyword}\n  q "q"\n  rb "opt" ${rawText}\n-->`
  const { draft, diagnostics } = parseOverridesBlockDraft(raw)
  if (diagnostics.length > 0 || !draft || draft.kind !== 'question') return null
  const body = draft.options[0]?.body
  return body && body.kind === 'structured' ? body : null
}

/** Serialize a structured body to raw text (for the structured → raw toggle).
 *  Returns null only for grammar-inexpressible drafts (UI-bug territory). */
export function structuredBodyToRaw(hostDomain: OverridesDomain, body: DraftStructuredBody): string | null {
  try {
    return serializeOptionBody(hostDomain, body)
  } catch (error) {
    if (error instanceof SerializeError) return null
    throw error
  }
}

// ── Field metadata for the row widgets ────────────────────────────────────────

/** One assignment-field entry for the "add operation" dropdown. */
export type OperationFieldMeta = {
  // DSL field token shown in the dropdown (dotted families keep their base token).
  field: string
  // Enumerated values when the field takes a closed set (rendered as a Select);
  // null = free-form value (rendered as a text input with `example` as placeholder).
  values: readonly string[] | null
  // Placeholder example for free-form fields.
  example: string
}

// Boolean-flag surface: on/off (the parser also accepts true/false; on/off is canonical).
const BOOL_VALS = [NOTE_OVERRIDES_BOOLEAN_KEYWORDS[0], NOTE_OVERRIDES_BOOLEAN_KEYWORDS[1]] as const

// Field-token unions derived from the grammar SSOT lists. Typing the metadata maps
// over these unions is the SSOT hard gate for this module: ADDING A FIELD TO THE
// GRAMMAR LIST FAILS TO COMPILE until its editor metadata is registered here — the
// dropdowns can never silently lag behind the parser.
type RecipeAssignmentField = (typeof NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS)[number]
type SafeguardAssignmentField = (typeof NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS)[number]

// Recipe assignment fields with their value metadata (exhaustive — see gate above).
const RECIPE_FIELD_META: Record<RecipeAssignmentField, Omit<OperationFieldMeta, 'field'>> = {
  export: { values: NOTE_RECIPE_OVERRIDES_EXPORT_VALS, example: 'active' },
  rank: { values: null, example: '6  |  >=5' },
  rarity: { values: null, example: `${NOTE_RECIPE_OVERRIDES_RARITY_NAMES[4]}  |  >=epic` },
  minrolls: { values: null, example: '3' },
  lockedminrolls: { values: null, example: '3' },
  minsubstats: { values: null, example: '2' },
  flex: { values: BOOL_VALS, example: 'on' },
  substatmin: { values: null, example: '3  |  .SPD=2 (as substatmin.SPD)' },
  minima: { values: null, example: '.any=5  |  .5.SPD=12 (as minima.…)' },
  lvl: { values: null, example: '0-16' },
  keep: { values: NOTE_RECIPE_OVERRIDES_KEEP_VALS, example: 'early' },
  action: { values: NOTE_RECIPE_OVERRIDES_ACTION_VALS, example: 'sell' },
  autolate: { values: NOTE_RECIPE_OVERRIDES_AUTOLATE_VALS, example: 'rare' },
  rolltarget: { values: null, example: '.HP=300,600,900 (as rolltarget.STAT)' },
  slots: { values: null, example: NOTE_RECIPE_OVERRIDES_SLOT_NAMES.slice(0, 3).join(',') },
  substats: { values: null, example: 'SPD,ACC  |  +SPD,-ACC' },
  mainstats: { values: null, example: 'SPD,HP%' },
  gearsets: { values: null, example: 'Speed,+-Daze' },
  metasets: { values: null, example: 'name1,name2' },
}

// Safeguard assignment fields with their value metadata (exhaustive — see gate above).
const SAFEGUARD_FIELD_META: Record<SafeguardAssignmentField, Omit<OperationFieldMeta, 'field'>> = {
  activation: { values: NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS, example: 'off' },
  count: { values: null, example: '16  |  $value/8' },
  ignprev: { values: BOOL_VALS, example: 'on' },
  igncoll: { values: BOOL_VALS, example: 'on' },
  ignvault: { values: BOOL_VALS, example: 'on' },
  perfaction: { values: BOOL_VALS, example: 'on' },
  permainstat: { values: BOOL_VALS, example: 'on' },
  perslot: { values: BOOL_VALS, example: 'on' },
  perset: { values: BOOL_VALS, example: 'on' },
  perrule: { values: BOOL_VALS, example: 'on' },
  substats: { values: null, example: 'SPD,ACC  |  +SPD,-ACC' },
  substatmatch: { values: NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS, example: '2' },
  weight: { values: null, example: '.SPD=1.5 (as weight.STAT)' },
  improvchance: { values: null, example: '25  |  25,35,50,65  |  disabled' },
  rank: { values: null, example: '5,6' },
  rarity: { values: null, example: 'legendary,mythical' },
  faction: { values: null, example: 'Banner Lords' },
}

/** Assignment-field dropdown entries for a block of the given domain. The dropdown
 *  order IS the grammar SSOT list order; the exhaustive metadata Records above
 *  guarantee (at compile time) every listed field has its value widget defined. */
export function operationFieldsFor(blockDomain: OverridesDomain): OperationFieldMeta[] {
  return blockDomain === 'recipe'
    ? NOTE_RECIPE_OVERRIDES_ASSIGNMENT_FIELDS.map((field) => ({ field, ...RECIPE_FIELD_META[field] }))
    : NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS.map((field) => ({ field, ...SAFEGUARD_FIELD_META[field] }))
}

/** Selector-field hint list for the selector row helper text. Both lists come from
 *  the grammar SSOT: the recipe grammar's field comparisons, or the shared tag-only
 *  subset the safeguard grammar accepts. */
export function selectorFieldsFor(blockDomain: OverridesDomain): readonly string[] {
  return blockDomain === 'recipe'
    ? NOTE_RECIPE_OVERRIDES_SELECTOR_FIELDS
    : NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS
}

/**
 * Compose an operation row's DSL text from the dropdown field + typed value. Values
 * beginning with a comparison operator (`>=5`) or a dotted family suffix (`.SPD=2`)
 * attach directly; everything else gets the standard `=`.
 */
export function composeOperationText(field: string, value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('>=') || trimmed.startsWith('<=') || trimmed.startsWith('.')) return `${field}${trimmed}`
  return `${field}=${trimmed}`
}
