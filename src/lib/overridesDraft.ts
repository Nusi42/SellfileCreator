/**
 * overridesDraft.ts
 *
 * Parse side of the visual override-block editor: locates override blocks in a note,
 * turns ONE raw `<!-- … -->` block into an editable OverridesBlockDraft, provides
 * new-block templates, and validates drafts/raw bodies before apply.
 *
 * Fidelity gate: every option body mapped to the structured model is serialized and
 * re-parsed; only a byte-independent structural match keeps the structured form —
 * anything else (parser-dropped blocks, diagnostics inside the option, emission
 * failure) degrades that option's body to verbatim raw text. The editor can therefore
 * never silently corrupt a body it cannot faithfully express.
 */
import {
  type DiagnosticSpan,
  type NoteQuestionGroupType,
  type NoteTagSelector,
  type ParsedOverridesOption,
  type ParsedOverridesQuestion,
  type SliderParams,
  containsDslLocaleTag,
  isReservedOptionIdWord,
  normalizeQuestionToken,
  parseOverridesMarkerBody,
  parseOverridesMarkerSpacerColumns,
  splitDslLocaleSegments,
  stripCommentWrapper,
} from './noteOverridesParser'
import {
  type RecipeOverridesOperation,
  type RecipeOverridesSelector,
  type RecipeOverridesSelectorBlock,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN,
  parseRecipeSelectorBlock,
  parseRecipeSelectorBlockCross,
} from './noteRecipeOverrides'
import {
  type SafeguardOverridesOperation,
  type SafeguardOverridesSelectorBlock,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  parseSafeguardSelectorBlock,
} from './noteSafeguardOverrides'
import { collectOverridesDiagnostics } from './overridesDiagnostics'
import {
  type DraftLocalizedText,
  type DraftOption,
  type DraftOptionBody,
  type DraftSelectorBlock,
  type DraftSliderParams,
  type DraftStructuredBody,
  type OverridesBlockDraft,
  type OverridesDomain,
} from './overridesDraftTypes'
import {
  SerializeError,
  composeLocalizedText,
  serializeOptionBody,
  serializeOverridesBlock,
} from './overridesSerializer'

// ── Block discovery ───────────────────────────────────────────────────────────

/** One override block located in a note, with its absolute span and per-domain index
 *  (the Nth marker of that domain — the same ordering NoteDialog's marker resolutions
 *  and `data-question-index` stamps use, since both scan the text in document order). */
export type OverrideBlockRef = {
  domain: OverridesDomain
  indexInDomain: number
  from: number
  to: number
  raw: string
}

// Combined scan for both domains (recipe pattern already includes legacy config-options).
const ALL_BLOCKS_REGEX = new RegExp(
  `<!--\\s*(?:${NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN}|${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD})\\b[\\s\\S]*?-->`,
  'gi',
)

// Marker keyword extractor (the first word after `<!--`).
const MARKER_KEYWORD_REGEX = /^\s*<!--\s*([a-z][\w-]*)/i

// Resolve a raw block's domain from its marker keyword; null when unrecognized.
const domainOfBlock = (raw: string): OverridesDomain | null => {
  const keyword = MARKER_KEYWORD_REGEX.exec(raw)?.[1]?.toLowerCase() ?? ''
  if ((NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS as readonly string[]).includes(keyword)) return 'recipe'
  if (keyword === NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD) return 'safeguard'
  return null
}

/** List every override block in the note, in document order, with per-domain indices. */
export function listOverrideBlocks(note: string): OverrideBlockRef[] {
  const refs: OverrideBlockRef[] = []
  // Per-domain counters reproduce the marker indices the preview cards carry.
  const counters: Record<OverridesDomain, number> = { recipe: 0, safeguard: 0 }
  for (const match of note.matchAll(ALL_BLOCKS_REGEX)) {
    const raw = match[0]
    const domain = domainOfBlock(raw)
    if (!domain) continue
    refs.push({ domain, indexInDomain: counters[domain], from: match.index ?? 0, to: (match.index ?? 0) + raw.length, raw })
    counters[domain] += 1
  }
  return refs
}

/**
 * Snap a caret offset to a safe insertion point for a new block: start-of-line, and
 * past the end of any override block the caret sits inside (blocks must not nest).
 */
export function snapInsertionOffset(note: string, caret: number): number {
  const clamped = Math.max(0, Math.min(note.length, caret))
  // Inside an existing block → insert right after it.
  for (const ref of listOverrideBlocks(note)) {
    if (clamped > ref.from && clamped < ref.to) return ref.to
  }
  // Otherwise snap back to the start of the caret's line.
  return note.lastIndexOf('\n', clamped - 1) + 1
}

// ── Parse → draft mapping ─────────────────────────────────────────────────────

// Domain-typed parsed aliases (the shared generic instantiated per grammar).
type ParsedRecipeQuestion = ParsedOverridesQuestion<RecipeOverridesSelector, RecipeOverridesOperation>
type ParsedSafeguardQuestion = ParsedOverridesQuestion<NoteTagSelector, SafeguardOverridesOperation>
type ParsedAnyOption =
  | ParsedOverridesOption<RecipeOverridesSelector, RecipeOverridesOperation>
  | ParsedOverridesOption<NoteTagSelector, SafeguardOverridesOperation>

// Parse one block's inner body with the right grammar + cross-domain parser pair.
// blockOffset makes option spans rawBlock-relative (needed for raw-body extraction).
const parseQuestionForDomain = (
  domain: OverridesDomain,
  inner: string,
  innerOffset: number,
): ParsedRecipeQuestion | ParsedSafeguardQuestion | null => (
  domain === 'recipe'
    ? parseOverridesMarkerBody<RecipeOverridesSelector, RecipeOverridesOperation>(
      inner, NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS,
      (cursor) => parseRecipeSelectorBlock(cursor),
      // Cross blocks inside recipe markers target safeguards.
      (cursor) => parseSafeguardSelectorBlock(cursor),
      undefined, innerOffset,
    )
    : parseOverridesMarkerBody<NoteTagSelector, SafeguardOverridesOperation>(
      inner, [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD],
      (cursor) => parseSafeguardSelectorBlock(cursor),
      // Cross blocks inside safeguard markers target recipes; the cross variant
      // enables $count/$value expressions in numeric recipe fields.
      (cursor) => parseRecipeSelectorBlockCross(cursor),
      undefined, innerOffset,
    )
)

// Split a DSL string into the per-locale editing shape (Map order = parse order).
const toLocalizedText = (raw: string): DraftLocalizedText => {
  const { base, byLang } = splitDslLocaleSegments(raw)
  return { base, locales: Array.from(byLang, ([code, text]) => ({ code, text })) }
}

// Map parsed slider params (compact strings) to the per-locale editing shape.
const toDraftSliderParams = (params: SliderParams): DraftSliderParams => ({
  min: params.min,
  max: params.max,
  step: params.step,
  default: params.default,
  unit: params.unit != null ? toLocalizedText(params.unit) : null,
  toggle: params.toggle
    ? { label: toLocalizedText(params.toggle.label), side: params.toggle.side, default: params.toggle.default }
    : null,
  marks: (params.marks ?? []).map((mark) => ({
    value: mark.value,
    label: toLocalizedText(mark.label),
    subtext: mark.subtext != null ? toLocalizedText(mark.subtext) : null,
  })),
})

// Tag parsed same-domain blocks with their domain discriminant.
const toDraftBlocks = (
  domain: OverridesDomain,
  blocks: Array<{ selector: unknown; operations: unknown[] }>,
): DraftSelectorBlock[] => (
  blocks.map((block) => (domain === 'recipe'
    ? { domain: 'recipe', selector: block.selector as RecipeOverridesSelector, operations: block.operations as RecipeOverridesOperation[] }
    : { domain: 'safeguard', selector: block.selector as NoteTagSelector, operations: block.operations as SafeguardOverridesOperation[] }))
)

// Cross blocks carry the OPPOSITE domain's grammar (parser stores them as unknown[]).
const toDraftCrossBlocks = (domain: OverridesDomain, cross: unknown[]): DraftSelectorBlock[] => (
  domain === 'recipe'
    ? (cross as SafeguardOverridesSelectorBlock[]).map((block) => ({ domain: 'safeguard' as const, selector: block.selector, operations: block.operations }))
    : (cross as RecipeOverridesSelectorBlock[]).map((block) => ({ domain: 'recipe' as const, selector: block.selector, operations: block.operations }))
)

// Ephemeral React-list keys for options; never serialized, uniqueness per session.
let draftKeyCounter = 0
const nextDraftKey = (): string => `opt-${++draftKeyCounter}`

// Strip option-level source spans for structural comparison (blocks carry none).
const stripOptionForCompare = (option: ParsedAnyOption): unknown => ({
  blocks: option.blocks,
  fallbackBlocks: option.fallbackBlocks,
  crossBlocks: option.crossBlocks,
  crossFallbackBlocks: option.crossFallbackBlocks,
})

// Synthetic single-option block used by the fidelity gate and raw-body validation.
const buildSyntheticBlock = (domain: OverridesDomain, bodyText: string, withSentinel: boolean): string => {
  const keyword = domain === 'recipe' ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS[0] : NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD
  const sentinel = withSentinel ? '\n  rb "sentinel" {}' : ''
  return `<!-- ${keyword}\n  q "q"\n  rb "opt" ${bodyText}${sentinel}\n-->`
}

// Offset of the body text inside buildSyntheticBlock's output (for span remapping).
const syntheticBodyOffset = (domain: OverridesDomain): number => (
  buildSyntheticBlock(domain, '', false).length - '\n-->'.length
)

/**
 * Fidelity gate: true when serializing `body` and re-parsing it reproduces the
 * original option's block structure exactly. False → the caller keeps raw text.
 */
const structuredBodyRoundTrips = (
  domain: OverridesDomain,
  body: DraftStructuredBody,
  original: ParsedAnyOption,
): boolean => {
  let bodyText: string
  try {
    bodyText = serializeOptionBody(domain, body)
  } catch (error) {
    // Inexpressible constructs (SerializeError) mean the body must stay raw.
    if (error instanceof SerializeError) return false
    throw error
  }
  const reparsed = parseQuestionForDomain(domain, stripCommentWrapper(buildSyntheticBlock(domain, bodyText, false)), 0)
  const candidate = reparsed?.options[0]
  if (!candidate) return false
  // Structural equality via JSON: both sides are parser-built objects with identical
  // construction order, so key order matches and stringify comparison is exact.
  return JSON.stringify(stripOptionForCompare(candidate)) === JSON.stringify(stripOptionForCompare(original))
}

// True when a diagnostic span intersects the option's source range.
const overlapsSpan = (diags: DiagnosticSpan[], from?: number, to?: number): boolean => (
  from != null && to != null && diags.some((d) => d.from < to && d.to > from)
)

// Map one parsed option (either domain) into its editable draft form.
const toDraftOption = (
  domain: OverridesDomain,
  rawBlock: string,
  option: ParsedAnyOption,
  diags: DiagnosticSpan[],
): DraftOption => {
  const structured: DraftStructuredBody = {
    kind: 'structured',
    blocks: toDraftBlocks(domain, option.blocks),
    crossBlocks: toDraftCrossBlocks(domain, option.crossBlocks),
    elseBlocks: toDraftBlocks(domain, option.fallbackBlocks),
    crossElseBlocks: toDraftCrossBlocks(domain, option.crossFallbackBlocks),
  }
  // Prefer the structured model; degrade to verbatim raw when the source is suspect
  // (diagnostics inside the option) or the round-trip gate fails. Raw needs the
  // body span; without it the structured form is the only representation we have.
  //
  // Any diagnostic makes the source suspect. Legacy behaviour tags do NOT produce one:
  // they are rewritten at SFC load and folded silently by the parser, so a legacy note
  // reaches here as clean DSL. The round-trip gate below is the real correctness check
  // anyway, since it re-serializes the structured form and compares.
  const blockingDiags = diags
  let body: DraftOptionBody = structured
  const canExtractRaw = option.bodyFrom != null && option.sourceTo != null
  if (canExtractRaw
    && (overlapsSpan(blockingDiags, option.sourceFrom, option.sourceTo) || !structuredBodyRoundTrips(domain, structured, option))) {
    body = { kind: 'raw', text: rawBlock.slice(option.bodyFrom!, option.sourceTo!) }
  }
  return {
    key: nextDraftKey(),
    groupType: option.groupType,
    label: toLocalizedText(option.label),
    detail: option.detail != null ? toLocalizedText(option.detail) : null,
    isDefault: option.isDefault,
    explicitId: option.explicitToken,
    onlyTokens: [...option.onlyTokens],
    setTokens: [...option.setTokens],
    unsetTokens: [...option.unsetTokens],
    excludedTokens: [...option.excludedTokens],
    needsTokens: [...option.needsTokens],
    needsDisabledState: option.needsDisabledState,
    setValueDirectives: option.setValueTokens.map((d) => ({ ...d })),
    sliderParams: option.sliderParams ? toDraftSliderParams(option.sliderParams) : null,
    body,
  }
}

export type OverridesBlockParse = {
  // null when the text is not a recognized override marker at all.
  draft: OverridesBlockDraft | null
  // Structural + string diagnostics, spans relative to rawBlock.
  diagnostics: DiagnosticSpan[]
}

/** Parse ONE whole `<!-- … -->` block into an editable draft (question or spacer). */
export function parseOverridesBlockDraft(rawBlock: string): OverridesBlockParse {
  const domain = domainOfBlock(rawBlock)
  if (!domain) return { draft: null, diagnostics: [] }
  // The diagnostics pass re-runs the full parse with collectors threaded in.
  const diagnostics = collectOverridesDiagnostics(rawBlock)
  const inner = stripCommentWrapper(rawBlock)
  // Option spans must be rawBlock-relative → offset by where the inner text starts.
  const innerOffset = Math.max(0, rawBlock.indexOf(inner))
  const question = parseQuestionForDomain(domain, inner, innerOffset)
  if (!question) {
    // Body-less marker → width spacer; anything else is unparseable.
    const keywords = domain === 'recipe' ? NOTE_RECIPE_OVERRIDES_MARKER_KEYWORDS : [NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD]
    const columns = parseOverridesMarkerSpacerColumns(inner, keywords)
    if (columns === null) return { draft: null, diagnostics }
    return { draft: { domain, kind: 'spacer', columns }, diagnostics }
  }
  const fallback = question.fallback
    ? { blocks: toDraftBlocks(domain, question.fallback.blocks), crossBlocks: toDraftCrossBlocks(domain, question.fallback.crossBlocks) }
    : null
  return {
    draft: {
      domain,
      kind: 'question',
      columns: question.layoutColumns,
      optionColumns: question.optionColumns,
      // Preserve a pinned `id=` verbatim so re-serialization keeps the question's identity.
      explicitId: question.explicitId,
      prompt: toLocalizedText(question.prompt),
      options: question.options.map((option) => toDraftOption(domain, rawBlock, option, diagnostics)),
      fallback,
    },
    diagnostics,
  }
}

// ── New-block templates ───────────────────────────────────────────────────────

/** Fresh option draft for the "add option" flow. */
export function createDraftOption(groupType: NoteQuestionGroupType): DraftOption {
  return {
    key: nextDraftKey(),
    groupType,
    label: { base: '', locales: [] },
    detail: null,
    isDefault: false,
    explicitId: null,
    onlyTokens: [],
    setTokens: [],
    unsetTokens: [],
    excludedTokens: [],
    needsTokens: [],
    needsDisabledState: null,
    setValueDirectives: [],
    // Sliders need params up front (the parser would default them anyway).
    sliderParams: groupType === 'slider' ? { min: 0, max: 10, step: 1, default: 1, unit: null, toggle: null, marks: [] } : null,
    body: { kind: 'structured', blocks: [], crossBlocks: [], elseBlocks: [], crossElseBlocks: [] },
  }
}

/** Fresh one-question block draft for the "create block" flow. */
export function createEmptyOverridesBlockDraft(domain: OverridesDomain): OverridesBlockDraft {
  const first = createDraftOption('single')
  first.isDefault = true
  // New blocks derive their id from content (explicitId null) until the author pins one.
  return { domain, kind: 'question', columns: 0, optionColumns: 0, explicitId: null, prompt: { base: '', locales: [] }, options: [first], fallback: null }
}

// ── Validation ────────────────────────────────────────────────────────────────

// Locale codes must match the DSL tag grammar or the emitted `[[code]]` won't re-split.
const LOCALE_CODE_REGEX = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i

// Zero-span diagnostic helper for draft-level (not source-anchored) problems.
const draftDiag = (message: string): DiagnosticSpan => ({ from: 0, to: 0, message })

// Validate one localized text field; `where` names it in messages.
const validateLocalizedText = (text: DraftLocalizedText, where: string, sink: DiagnosticSpan[]): void => {
  const composed = composeLocalizedText(text)
  // `-->` anywhere in a string would truncate the HTML-comment marker match.
  if (composed.includes('-->')) sink.push(draftDiag(`${where} must not contain '-->'`))
  // A tag glyph typed into a single field would re-split into bogus segments.
  if (containsDslLocaleTag(text.base)) sink.push(draftDiag(`${where} (base) must not contain a [[xx]] locale tag`))
  for (const locale of text.locales) {
    if (!LOCALE_CODE_REGEX.test(locale.code)) sink.push(draftDiag(`${where}: '${locale.code}' is not a valid locale code`))
    if (containsDslLocaleTag(locale.text)) sink.push(draftDiag(`${where} (${locale.code}) must not contain a [[xx]] locale tag`))
  }
}

// Validate one constraint token (already-normalized form required).
const validateToken = (token: string, where: string, sink: DiagnosticSpan[]): void => {
  if (normalizeQuestionToken(token) !== token) sink.push(draftDiag(`${where}: '${token}' is not a valid token (letters/digits/underscore)`))
  else if (isReservedOptionIdWord(token)) sink.push(draftDiag(`${where}: '${token}' is a reserved keyword`))
}

/**
 * Validate a raw `{ … }` body in isolation. Spans are relative to `rawText`.
 * Wraps the body in a synthetic block, runs the real diagnostics, and additionally
 * verifies a sentinel option AFTER the body survives — the unbalanced-brace failure
 * mode (body swallowing later options) the lenient parser cannot flag itself.
 */
export function validateRawBody(domain: OverridesDomain, rawText: string): DiagnosticSpan[] {
  const sink: DiagnosticSpan[] = []
  const trimmed = rawText.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    sink.push({ from: 0, to: rawText.length, message: 'Body must be wrapped in { … }' })
    return sink
  }
  const block = buildSyntheticBlock(domain, rawText, true)
  const offset = syntheticBodyOffset(domain)
  // Remap block-relative diagnostics into rawText coordinates; keep only those inside.
  for (const diag of collectOverridesDiagnostics(block)) {
    if (diag.to <= offset || diag.from >= offset + rawText.length) continue
    sink.push({ from: Math.max(0, diag.from - offset), to: Math.min(rawText.length, diag.to - offset), message: diag.message })
  }
  // Sentinel survival: the option following the body must still parse with an empty body.
  const question = parseQuestionForDomain(domain, stripCommentWrapper(block), 0)
  const sentinel = question?.options[1]
  const sentinelIntact = sentinel != null
    && sentinel.label === 'sentinel'
    && sentinel.blocks.length === 0 && sentinel.fallbackBlocks.length === 0
    && sentinel.crossBlocks.length === 0 && sentinel.crossFallbackBlocks.length === 0
  if (!sentinelIntact) {
    sink.push({ from: 0, to: rawText.length, message: 'Unbalanced braces — this body would swallow the options after it' })
  }
  return sink
}

/**
 * Whole-draft pre-apply validation: field-level guards, raw-body checks, then a full
 * serialize → re-parse round with structural sanity assertions. Returns [] when the
 * draft is safe to apply.
 */
export function validateOverridesBlockDraft(draft: OverridesBlockDraft): DiagnosticSpan[] {
  const sink: DiagnosticSpan[] = []
  // Shared non-negative-integer check for the layout count attributes (columns / optcols).
  const checkCount = (value: number, name: string): void => {
    if (!Number.isInteger(value) || value < 0) sink.push(draftDiag(`${name} must be a non-negative integer`))
  }
  if (draft.kind === 'spacer') {
    checkCount(draft.columns, 'columns')
    return sink
  }
  checkCount(draft.columns, 'columns')
  checkCount(draft.optionColumns, 'optcols')
  if (draft.options.length === 0) sink.push(draftDiag('a question needs at least one option'))
  validateLocalizedText(draft.prompt, 'prompt', sink)
  // A pinned question id must be a valid token (same grammar as an option id).
  if (draft.explicitId !== null) validateToken(draft.explicitId, 'question id', sink)
  draft.options.forEach((option, index) => {
    const name = `option ${index + 1}`
    validateLocalizedText(option.label, `${name} label`, sink)
    if (option.detail) validateLocalizedText(option.detail, `${name} detail`, sink)
    if (option.explicitId !== null) validateToken(option.explicitId, `${name} id`, sink)
    for (const token of [...option.onlyTokens, ...option.setTokens, ...option.unsetTokens, ...option.excludedTokens, ...option.needsTokens]) {
      validateToken(token, `${name} constraints`, sink)
    }
    for (const directive of option.setValueDirectives) {
      validateToken(directive.token, `${name} setval`, sink)
      if (!Number.isFinite(directive.value)) sink.push(draftDiag(`${name} setval: value must be a number`))
    }
    const params = option.sliderParams
    if (option.groupType === 'slider') {
      if (!params) sink.push(draftDiag(`${name}: slider options need slider params`))
      else {
        if (!(params.min <= params.max)) sink.push(draftDiag(`${name}: slider min must be ≤ max`))
        if (!(params.step >= 0.001)) sink.push(draftDiag(`${name}: slider step must be ≥ 0.001`))
        if (params.default < params.min || params.default > params.max) sink.push(draftDiag(`${name}: slider default must lie within [min, max]`))
        if (params.unit) validateLocalizedText(params.unit, `${name} unit`, sink)
        if (params.toggle) validateLocalizedText(params.toggle.label, `${name} toggle`, sink)
        params.marks.forEach((mark) => {
          if (!Number.isFinite(mark.value)) sink.push(draftDiag(`${name}: mark positions must be numbers`))
          validateLocalizedText(mark.label, `${name} mark label`, sink)
          if (mark.subtext) validateLocalizedText(mark.subtext, `${name} mark subtext`, sink)
        })
      }
    }
    if (option.body.kind === 'raw') {
      // Raw bodies carry their own local spans; surface them as draft-level messages.
      for (const diag of validateRawBody(draft.domain, option.body.text)) {
        sink.push(draftDiag(`${name} body: ${diag.message}`))
      }
    }
  })
  if (sink.length > 0) return sink
  // Full round: serialize, then re-parse and assert the structure survived.
  let serialized: string
  try {
    serialized = serializeOverridesBlock(draft)
  } catch (error) {
    if (error instanceof SerializeError) { sink.push(draftDiag(error.message)); return sink }
    throw error
  }
  const reparsed = parseOverridesBlockDraft(serialized)
  for (const diag of reparsed.diagnostics) sink.push(draftDiag(diag.message))
  const question = reparsed.draft
  if (!question || question.kind !== 'question') {
    sink.push(draftDiag('serialized block failed to re-parse as a question'))
    return sink
  }
  if (question.options.length !== draft.options.length) {
    sink.push(draftDiag('serialized block lost options on re-parse — check raw bodies for stray braces'))
    return sink
  }
  question.options.forEach((option, index) => {
    const source = draft.options[index]!
    if (option.groupType !== source.groupType || option.label.base !== source.label.base) {
      sink.push(draftDiag(`option ${index + 1} changed structure on re-parse — check its strings for stray quotes`))
    }
  })
  return sink
}
