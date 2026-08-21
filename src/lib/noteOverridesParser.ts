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
import { statVariantToKey, type StatVariantLike } from './types'

// ── Token types ───────────────────────────────────────────────────────────────

export type TokenKind = 'word' | 'string' | 'symbol'

/** A character range in the source text flagged as structurally erroneous. */
export type DiagnosticSpan = { from: number; to: number; message: string }

export type Token = {
  kind: TokenKind
  value: string
  index: number
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────

/** A string value that opens with a `[[xx]]` / `[[xx-YY]]` locale tag (anchored). */
const LOCALE_CONTINUATION_HEAD = /^\[\[[a-z]{2,3}(?:-[a-z0-9]{2,8})?\]\]/i

/**
 * Merge "localization continuation" string tokens back onto the string they belong to.
 * A string token whose value *begins* with a `[[xx]]` locale tag carries one locale's
 * translation of the immediately preceding string; concatenating it reconstructs the single
 * `English[[xx]]Localized` value the rest of the parser (and `localizeDslDisplay`) expects.
 *
 * This lets a localized DSL string be authored across lines — the English base on one line,
 * each `[[xx]]` variant on its own line — so a single locale's edit touches one line instead
 * of a line shared with every other locale. Because the tokenizer treats newlines as plain
 * whitespace, the split and compact-inline forms produce the same token stream after this
 * pass. Inline strings never start with `[[xx]]`, so existing single-line notes are
 * unaffected (no-op).
 */
const mergeLocaleContinuationStrings = (tokens: Token[]): Token[] => {
  const merged: Token[] = []
  for (const tok of tokens) {
    const prev = merged[merged.length - 1]
    // Fold a `[[xx]]…` string onto the preceding string; keep the earlier token's index.
    if (tok.kind === 'string' && prev?.kind === 'string' && LOCALE_CONTINUATION_HEAD.test(tok.value)) {
      prev.value += tok.value
      continue
    }
    merged.push(tok)
  }
  return merged
}

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
  // Fold per-locale string continuations (`"EN"` `"[[de]]DE"`) back into one string token so
  // every downstream consumer sees the same `EN[[de]]DE` value as the compact inline form.
  return mergeLocaleContinuationStrings(tokens)
}

// ── TokenCursor ───────────────────────────────────────────────────────────────

/** Stateful cursor for walking a Token array. Shared by all override parsers. */
export class TokenCursor {
  private index = 0
  constructor(private tokens: Token[]) {}

  peek(offset = 0): Token | null {
    return this.tokens[this.index + offset] ?? null
  }

  /** End offset (index + length) of the most recently consumed token, or 0 if none. */
  prevEnd(): number {
    const prev = this.tokens[this.index - 1]
    return prev ? prev.index + prev.value.length : 0
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

/** A labeled guide mark on a slider track. `value` is the position; `label` is shown
 *  beneath the mark; optional `subtext` is surfaced as a tooltip on the mark. Marks are
 *  purely visual guides — the slider stays continuous (no snapping). */
export type SliderMark = {
  value: number
  label: string
  subtext?: string
}

/** Accepted `toggleside=` values: 'left' (inline) or 'above' (stacked). SSOT for both
 *  the parsed type and the `toggleside` value parse below (and Prism highlighting). */
export const SLIDER_TOGGLE_SIDE_VALUES = ['left', 'above'] as const
export type SliderToggleSide = (typeof SLIDER_TOGGLE_SIDE_VALUES)[number]

/** Accepted `toggledefault=` values: 'on' (checked) or 'off' (unchecked). SSOT for the
 *  parsed type, the `toggledefault` value parse below, and Prism highlighting. */
export const SLIDER_TOGGLE_DEFAULT_VALUES = ['on', 'off'] as const
export type SliderToggleDefault = (typeof SLIDER_TOGGLE_DEFAULT_VALUES)[number]

/** Accepted boolean-like keyword values across the grammars: `on`/`true` ⇒ true,
 *  `off`/`false` ⇒ false. SSOT for both the parse (`parseOverridesBooleanValue`) and the
 *  enum-value diagnostic listing (e.g. `needs=…`, `flex=…`). */
export const NOTE_OVERRIDES_BOOLEAN_KEYWORDS = ['on', 'off', 'true', 'false'] as const

/** Parse a boolean-like keyword value (see NOTE_OVERRIDES_BOOLEAN_KEYWORDS); null if
 *  unrecognized. Single definition imported by the recipe + safeguard parsers (DRY). */
export const parseOverridesBooleanValue = (value: string): boolean | null => {
  const cleaned = value.trim().toLowerCase()
  if (cleaned === 'on' || cleaned === 'true') return true
  if (cleaned === 'off' || cleaned === 'false') return false
  return null
}

/** Optional on/off checkbox attached to a slider. When off, the slider's `else` block
 *  applies instead of its selector blocks, and the track is disabled in the UI. */
export type SliderToggle = {
  // Label shown next to the checkbox. Empty string falls back to a UI default.
  label: string
  // Checkbox placement relative to the slider: 'left' (inline) or 'above' (stacked).
  side: SliderToggleSide
  // Initial state when the user has not answered yet.
  default: SliderToggleDefault
}

/** Numeric range for a slider group, plus optional labeled marks and an on/off toggle. */
export type SliderParams = {
  min: number
  max: number
  step: number
  default: number
  // Labeled guide marks (visual only; no snapping). Absent = bare end-tick marks.
  marks?: SliderMark[]
  // Optional enable/disable checkbox bound to the slider's else block.
  toggle?: SliderToggle
  // Optional display suffix appended to the slider's shown value (e.g. "%"). Display-only;
  // the stored/forwarded answer is always the bare number. Absent = no suffix.
  unit?: string
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

/** The `setval` keyword: unlike the other constraint keywords it takes `token=number`
 *  pairs (not bare tokens). Exported so the parser branch and Prism grammar share one name. */
export const NOTE_OVERRIDES_SETVAL_KEYWORD = 'setval'

/** Word-form constraint keywords (symbolic forms ! + - ^ are handled separately). */
export const NOTE_OVERRIDES_CONSTRAINT_KEYWORDS = ['set', 'unset', 'only', 'excl', 'needs', NOTE_OVERRIDES_SETVAL_KEYWORD] as const

/** Boolean logic connectors for compound selector expressions. */
export const NOTE_OVERRIDES_LOGIC_KEYWORDS = ['and', 'or'] as const

/** Selector keywords of the shared tag-only grammar (parseTagSelector): the surface a
 *  safeguard `@selector` accepts. SSOT for the editor's selector hints and the EBNF
 *  reference; the recipe grammar extends this set with its field comparisons. */
export const NOTE_OVERRIDES_TAG_SELECTOR_KEYWORDS = ['tag', 'all', 'tagged', 'untagged', 'grouped', 'ungrouped'] as const

/**
 * Cross-domain block keyword per HOST domain: inside a recipe marker, `safeguard @… { }`
 * targets safeguard rules; inside a safeguard marker, `recipe @… { }` targets recipes.
 * SSOT consumed by the serializer (emission), the Prism grammar (highlighting), and the
 * visual editor (section headers) — the spellings must never fork.
 */
export const NOTE_OVERRIDES_CROSS_KEYWORDS = {
  recipe: 'safeguard',
  safeguard: 'recipe',
} as const

/** Marker option key for the card-width multiplier. */
export const NOTE_OVERRIDES_MARKER_COLUMNS_KEY = 'columns' as const

/**
 * Marker option key for the option-grid column count (independent of card width).
 * `columns=N` sizes the CARD (how many base-widths it spans); `optcols=N` sizes the OPTION
 * GRID inside it (how many option columns). Absent (0) → inherit the card's `columns`; if that
 * is also absent, fall back to 1. See resolveOptionColumnCount.
 */
export const NOTE_OVERRIDES_MARKER_OPTION_COLUMNS_KEY = 'optcols' as const

/** Default columns value: 0 means vertical layout at standard card width. */
export const NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT = 0

/** Default option-column count: 0 = not authored (inherit `columns`, then 1). */
export const NOTE_OVERRIDES_OPTION_COLUMNS_DEFAULT = 0

/**
 * Resolve the effective option-grid column count from the two authored values. SSOT for the
 * `optcols` default rule so every layout consumer agrees:
 *   • an authored `optcols` (≥1) wins;
 *   • otherwise inherit the card width `columns` (≥1);
 *   • otherwise 1 (a single stacked column).
 */
export const resolveOptionColumnCount = (layoutColumns: number, optionColumns: number): number =>
  optionColumns > 0 ? optionColumns : (layoutColumns > 0 ? layoutColumns : 1)

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Extract the inner text from an HTML comment. */
export const stripCommentWrapper = (raw: string): string => (
  raw.trim().replace(/^<!--\s*/, '').replace(/\s*-->$/, '')
)

/** Collapse whitespace to keep IDs stable across formatting tweaks. */
export const normalizeQuestionText = (value: string): string => (
  value.trim().replace(/\s+/g, ' ')
)

// ── DSL string localization ─────────────────────────────────────────────────
// Prompts/labels/details embed locale variants inline so translations travel with
// the preset file. Syntax: text before the first `[[xx]]` tag is the English base;
// each `[[xx]]` starts a segment for BCP-47 code `xx` running to the next tag or end.
//   e.g. `"Keep them[[de]]Behalten"` → base "Keep them", de "Behalten".
// The English base is the canonical identity source (it feeds questionId/option.id),
// so adding/removing translations never shifts a question's stable id.

/** Matches a `[[xx]]` / `[[xx-YY]]` locale tag (BCP-47-ish: lang + optional region). */
const DSL_LOCALE_TAG = /\[\[([a-z]{2,3}(?:-[a-z0-9]{2,8})?)\]\]/gi

/** True when `value` contains an inline `[[xx]]` locale tag. Exposed so the visual
 *  editor's validation can reject tag glyphs typed into a single locale's field
 *  (they would re-split into bogus segments on the next parse). Same regex SSOT. */
export const containsDslLocaleTag = (value: string): boolean => {
  DSL_LOCALE_TAG.lastIndex = 0
  return DSL_LOCALE_TAG.test(value)
}

/** Split a localized DSL string into its English base + per-locale segments. */
export const splitDslLocaleSegments = (raw: string): { base: string; byLang: Map<string, string> } => {
  const byLang = new Map<string, string>()
  // Fast path: no tag at all → the whole string is the English base.
  DSL_LOCALE_TAG.lastIndex = 0
  const first = DSL_LOCALE_TAG.exec(raw)
  if (!first) return { base: raw, byLang }
  // Everything before the first tag is the English base.
  const base = raw.slice(0, first.index)
  // Walk each tag, capturing the text up to the next tag (or end-of-string).
  let match: RegExpExecArray | null = first
  while (match) {
    const code = match[1]!.toLowerCase()
    const segStart = match.index + match[0].length
    const next = DSL_LOCALE_TAG.exec(raw)
    const segEnd = next ? next.index : raw.length
    // First definition wins so a duplicate tag can't silently clobber the earlier one.
    if (!byLang.has(code)) byLang.set(code, raw.slice(segStart, segEnd))
    match = next
  }
  return { base, byLang }
}

/** English base text only (identity source) — strips all locale tags + segments. */
export const dslLocaleBase = (raw: string): string => splitDslLocaleSegments(raw).base

/**
 * Resolve the display text for a language code, falling back to the English base.
 * Resolution order: exact code (`de-DE`) → language prefix (`de`; `pt-BR`→`pt`) → base.
 */
export const localizeDslDisplay = (raw: string, lang: string): string => {
  const { base, byLang } = splitDslLocaleSegments(raw)
  if (byLang.size === 0) return base
  const lower = lang.toLowerCase()
  // Try the full code first, then the bare language prefix (so one `[[de]]` covers de-DE,
  // and `[[pt]]` covers pt-PT/pt-BR while a more specific `[[pt-BR]]` still wins above).
  const prefix = lower.split('-')[0]!
  const exact = byLang.get(lower)
  if (exact !== undefined) return exact
  const byPrefix = byLang.get(prefix)
  if (byPrefix !== undefined) return byPrefix
  return base
}

// ── Option-info display text (the one contract, both domains) ─────────────────

/**
 * THE CONTRACT for the note-editor option-info text built by
 * `formatRecipeOverridesOpValue` / `formatSafeguardOverridesOpValue` and their
 * selector twins. Both domains render into the same tooltip panel through the
 * same Prism grammar, so they must answer this question identically:
 *
 *   READABLE DSL, not byte-exact DSL.
 *   • VALUES may use display sugar the parser never sees — `≥3` for `rank>=3`,
 *     `5★` for star 5, `SPD 300 +[600,900]` for a roll-target ladder.
 *   • IDENTIFIERS — stat keys, field tokens, set/faction/slot names — use the
 *     DSL vocabulary verbatim, because they are the fragments a user lifts out
 *     of the tooltip and back into a marker, and because an anomalous
 *     display label ("PvE DMG +") is unwritable: `+` and spaces are separators.
 *
 * Byte-exact reconstruction is a different job with a different owner —
 * `overridesSerializer.ts`, pinned by the round-trip tests. Nothing here feeds it.
 *
 * The helpers below exist so the two domains cannot answer differently: one
 * spelling pass, one mutate-list shape, shared by both formatters.
 */

/** Spell a REPLACE list for the clearable gear-set/metaset fields. An empty list is
 *  the legal "any gear set" state, so it reads as the clear keyword rather than as
 *  an empty string (which would render the override tooltip blank).
 *  Keyword SSOT: NOTE_OVERRIDES_CLEAR_LIST_KEYWORD, defined further down. */
export const formatOverridesClearableList = (names: readonly string[]): string =>
  names.length === 0 ? NOTE_OVERRIDES_CLEAR_LIST_KEYWORD : names.join(',')

/** Render a mutate add/remove pair as `+a +b -c` note list-mutation syntax. */
export const formatOverridesMutateList = (add: string[], remove: string[]): string =>
  [...add.map((x) => `+${x}`), ...remove.map((x) => `-${x}`)].join(' ')

/** Spell one stat for option-info text (identifier rule above). Empty/Any → ''. */
export const overridesStatKey = (variant: StatVariantLike): string => statVariantToKey(variant)

/** Spell a stat list as `KEY,KEY,…`; Empty/Any variants drop out. */
export const formatOverridesStatKeyList = (variants: readonly StatVariantLike[]): string =>
  variants.map(overridesStatKey).filter(Boolean).join(',')

/** Spell a stat mutate pair as `+KEY -KEY`; Empty/Any variants drop out. */
export const formatOverridesStatKeyMutateList = (
  add: readonly StatVariantLike[],
  remove: readonly StatVariantLike[],
): string => formatOverridesMutateList(
  add.map(overridesStatKey).filter(Boolean),
  remove.map(overridesStatKey).filter(Boolean),
)

/**
 * Resolve one locale from a map of `code → text`, honoring the same precedence the
 * inline `[[xx]]` resolver uses (exact full code → bare language prefix → base).
 *
 * SSOT: both the inline DSL resolver above and the block-level prose resolver below
 * route their language pick through this single function, so the fallback rules can
 * never drift between the two surfaces.
 */
const pickLocaleFromMap = <T,>(byLang: Map<string, T>, base: T, lang: string): T => {
  if (byLang.size === 0) return base
  const lower = lang.toLowerCase()
  // Full code (`de-DE`) wins; then the bare prefix (`de`), so one `lang:de` block covers
  // de-DE while a more specific `lang:pt-BR` still beats a generic `lang:pt`.
  const prefix = lower.split('-')[0]!
  return byLang.get(lower) ?? byLang.get(prefix) ?? base
}

// ── Block-level prose localization (`<!-- lang -->…<!-- /lang -->`) ────────────
// Companion to the inline `[[xx]]` DSL localizer, but for whole prose regions in the
// Note markdown. A *group* is bracketed by an opening `<!-- lang -->` and a closing
// `<!-- /lang -->`. Inside, the text before the first `<!-- lang:xx -->` marker is
// the English BASE; each `<!-- lang:xx -->` marker starts a localized variant running
// to the next variant marker or to /lang. At render time exactly one slice survives
// — the active language (exact→prefix) or, when none matches, the base.
//
// Authoring shape (base first, then variants; explicit open + close brackets):
//   <!-- lang -->
//   English paragraph(s).
//   <!-- lang:de -->
//   Deutscher Absatz / Absätze.
//   <!-- /lang -->
//
// Markers may hug their text inline (`<!-- lang -->EN<!-- lang:de -->DE<!-- /lang -->`)
// or sit on their own lines as shown above; both render identically because the one
// structural newline a marker line contributes is trimmed off each slice (see
// `stripMarkerBoundaryNewlines`). The bundled preset notes use the line-split shape so a
// single locale's edit touches one line in the `.sfc`, not a line shared with other locales.
//
// The explicit `<!-- lang -->` open + `<!-- /lang -->` close make the group a
// self-contained unit: it answers the "which paragraphs belong together for fallback"
// question the preset author raised — a whole group falls back to its base together,
// never interleaving languages. Markers are plain HTML comments, so legacy renderers /
// raw .sfc text degrade to base + every variant shown inline (harmless, untranslated).

/** Opens a prose-localization group; English base text follows: `<!-- lang -->`. */
const PROSE_LANG_GROUP_OPEN_REGEX = /<!--\s*lang\s*-->/gi
/** Opens a localized variant inside a group: `<!-- lang:de -->`. */
const PROSE_LANG_VARIANT_REGEX = /<!--\s*lang:([a-z]{2,3}(?:-[a-z0-9]{2,8})?)\s*-->/gi
/** Closes a prose-localization group: `<!-- /lang -->`. */
const PROSE_LANG_CLOSE_REGEX = /<!--\s*\/lang\s*-->/gi

// ── Conditional "no-endpoint" block markers ──────────────────────────────────
// `<!-- if-no-endpoint -->…<!-- /if-no-endpoint -->` wraps content shown only while the app
// is NOT connected to RSL Helper. The rendering (a rehype plugin) lives in NoteDialog; the
// marker *grammar* lives here, beside the prose-lang markers, so it stays in one place and is
// unit-testable without NoteDialog's browser dependencies. Matched against an HTML comment's
// body (the text between `<!--` and `-->`), so these patterns carry no `<!--`/`-->`.
/** Opens a connection-conditional block: `<!-- if-no-endpoint -->`. */
export const CONDITIONAL_BLOCK_OPEN_REGEX = /^\s*if-no-endpoint\s*$/i
/**
 * Closes a connection-conditional block. Canonical close is `<!-- /if-no-endpoint -->`; the
 * legacy `<!-- end-if -->` form shipped in earlier presets and is still accepted on read, so
 * older saved notes keep working (lenient input, canonical output).
 */
export const CONDITIONAL_BLOCK_CLOSE_REGEX = /^\s*(?:\/if-no-endpoint|end-if)\s*$/i

/**
 * Strip the one structural newline a marker line contributes on each side of a slice.
 * In the multi-line authoring shape (markers on their own lines — the documented canonical
 * form) every base/variant slice picks up a leading and/or trailing newline from the marker
 * boundaries; removing a single leading and single trailing newline (plus the horizontal
 * whitespace on that marker line) makes a group render identically whether authored inline
 * (`<!-- lang -->X<!-- lang:de -->Y<!-- /lang -->`) or split across lines for diff-friendly
 * editing. The inline shape has no boundary newline, so this is a no-op there — existing
 * single-line notes (and marker-free notes) are unaffected.
 */
const stripBoundaryNewlines = (slice: string): { text: string; lead: number } => {
  // Leading strip = the horizontal whitespace + single newline a marker line contributes
  // BEFORE the slice; its length is how far the trimmed text's raw start shifts forward.
  const leadMatch = slice.match(/^[^\S\n]*\n/)
  const lead = leadMatch ? leadMatch[0].length : 0
  return { text: slice.slice(lead).replace(/\n[^\S\n]*$/, ''), lead }
}

/**
 * One contiguous run of the localized output that came verbatim from the raw note: the
 * localized text `[localStart, localStart+length)` equals the raw text `[rawStart, …)`.
 * Lets the editor scroll-sync translate a preview block's source offset (measured against
 * the LOCALIZED preview source) back to a char offset in the RAW draft the textarea shows.
 */
export type NoteProseSourceSegment = { localStart: number; rawStart: number; length: number }

/**
 * Resolve every `<!-- lang -->…<!-- /lang -->` prose group in `note` for `lang`, ALSO
 * returning a localized→raw offset map. Every emitted chunk (untouched span, picked locale
 * slice, tail) records where it started in the raw note, so a localized offset can be mapped
 * back to the raw text. SSOT: the plain {@link localizeNoteProse} string form delegates here.
 *
 * For each group: the base is the text between the group open and the first
 * `<!-- lang:xx -->` variant marker (or the whole body when there are no variants);
 * each variant marker starts a slice running to the next variant marker or to the close
 * marker. The picked slice (active lang exact→prefix, else base) replaces the entire
 * group including its brackets.
 */
export const localizeNoteProseWithSourceMap = (
  note: string,
  lang: string,
): { text: string; segments: NoteProseSourceSegment[] } => {
  const segments: NoteProseSourceSegment[] = []
  let out = ''
  // Record a raw→localized run, then append the same text to `out`.
  const emit = (rawStart: number, text: string): void => {
    if (text.length > 0) segments.push({ localStart: out.length, rawStart, length: text.length })
    out += text
  }
  // Fast path: no group-open marker → the whole note is one identity run.
  PROSE_LANG_GROUP_OPEN_REGEX.lastIndex = 0
  if (!PROSE_LANG_GROUP_OPEN_REGEX.test(note)) {
    emit(0, note)
    return { text: out, segments }
  }
  let cursor = 0
  // Iterate group-open markers in document order.
  PROSE_LANG_GROUP_OPEN_REGEX.lastIndex = 0
  let groupOpen = PROSE_LANG_GROUP_OPEN_REGEX.exec(note)
  while (groupOpen) {
    // Emit untouched text before this group, then locate the matching close marker.
    emit(cursor, note.slice(cursor, groupOpen.index))
    const bodyStart = groupOpen.index + groupOpen[0].length
    PROSE_LANG_CLOSE_REGEX.lastIndex = bodyStart
    const close = PROSE_LANG_CLOSE_REGEX.exec(note)
    if (!close) {
      // Unterminated group: emit the open marker verbatim and stop resolving (degrade safe).
      emit(groupOpen.index, note.slice(groupOpen.index))
      cursor = note.length
      break
    }
    const bodyEnd = close.index
    // Collect variant markers strictly inside the body.
    PROSE_LANG_VARIANT_REGEX.lastIndex = bodyStart
    const variants: Array<{ code: string; start: number; tagEnd: number }> = []
    let v = PROSE_LANG_VARIANT_REGEX.exec(note)
    while (v && v.index < bodyEnd) {
      variants.push({ code: v[1]!.toLowerCase(), start: v.index, tagEnd: v.index + v[0].length })
      v = PROSE_LANG_VARIANT_REGEX.exec(note)
    }
    // Base = body text up to the first variant marker (or the whole body when none). Each slice
    // carries the raw start of its TRIMMED text (boundary newline shifts the start forward).
    const baseEnd = variants.length > 0 ? variants[0]!.start : bodyEnd
    const baseStrip = stripBoundaryNewlines(note.slice(bodyStart, baseEnd))
    const base = { text: baseStrip.text, rawStart: bodyStart + baseStrip.lead }
    // code→variant: each variant slice runs to the next variant marker or to the close.
    const byLang = new Map<string, { text: string; rawStart: number }>()
    for (let i = 0; i < variants.length; i += 1) {
      const segStart = variants[i]!.tagEnd
      const segEnd = i + 1 < variants.length ? variants[i + 1]!.start : bodyEnd
      const strip = stripBoundaryNewlines(note.slice(segStart, segEnd))
      // First definition wins, mirroring the inline resolver's duplicate policy.
      if (!byLang.has(variants[i]!.code)) byLang.set(variants[i]!.code, { text: strip.text, rawStart: segStart + strip.lead })
    }
    // Replace the whole group (open marker → close marker) with the picked slice.
    const picked = pickLocaleFromMap(byLang, base, lang)
    emit(picked.rawStart, picked.text)
    cursor = close.index + close[0].length
    PROSE_LANG_GROUP_OPEN_REGEX.lastIndex = cursor
    groupOpen = PROSE_LANG_GROUP_OPEN_REGEX.exec(note)
  }
  // Tail: everything after the last group.
  emit(cursor, note.slice(cursor))
  return { text: out, segments }
}

export const localizeNoteProse = (note: string, lang: string): string =>
  localizeNoteProseWithSourceMap(note, lang).text

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

/**
 * True if a bare word is a reserved keyword that terminates a token list (constraint
 * keywords, group types, and the question/fallback keywords). Such a word can be parsed
 * as `id=<word>`, but it becomes unreferenceable — a later `set <word>` / `needs <word>`
 * etc. stops the list at the keyword instead of treating it as the id. Mirrors the
 * terminator checks in `readTokenList`. Used to surface a diagnostic at the `id=` site.
 */
export const isReservedOptionIdWord = (word: string): boolean => {
  const lower = word.toLowerCase()
  return (NOTE_OVERRIDES_CONSTRAINT_KEYWORDS as readonly string[]).includes(lower)
    || (NOTE_OVERRIDES_QUESTION_KEYWORDS as readonly string[]).includes(lower)
    || (NOTE_OVERRIDES_FALLBACK_KEYWORDS as readonly string[]).includes(lower)
    || parseGroupType(lower) !== null
}

/** Emit a diagnostic when an `id=` value (bare word) is a reserved keyword. No-op otherwise. */
const reportReservedIdToken = (
  valueToken: Token,
  diags: DiagnosticSpan[] | undefined,
  blockOffset: number,
): void => {
  // Only bare words collide; a quoted `id="set"` stays referenceable via `set "set"`.
  if (!diags || valueToken.kind !== 'word' || !isReservedOptionIdWord(valueToken.value)) return
  diags.push({
    from: blockOffset + valueToken.index,
    to: blockOffset + valueToken.index + valueToken.value.length,
    message: `'${valueToken.value}' is a reserved keyword and cannot be used as an id — a constraint like 'set ${valueToken.value}' would not reference it (quote it as id="${valueToken.value}", or rename the id)`,
  })
}

/** Flag a token whose value is outside an accepted enumerated set. SSOT for the
 *  "not a valid <keyword> value — use 'a' or 'b'" diagnostic shared by every enumerated
 *  param across the recipe/safeguard/slider grammars, so a typo (e.g. `toggleside=ab`,
 *  `activation=of`) is surfaced instead of silently falling back to a default. */
export const reportInvalidEnumValue = (
  keyword: string,
  valueToken: Token,
  accepted: readonly string[],
  diags: DiagnosticSpan[] | undefined,
  blockOffset: number,
): void => {
  if (!diags) return
  const from = blockOffset + valueToken.index
  diags.push({
    from,
    to: from + valueToken.value.length,
    message: `'${valueToken.value}' is not a valid ${keyword} value — use ${accepted.map((v) => `'${v}'`).join(' or ')}`,
  })
}

/** Flag an assignment field the grammar does not recognize. SSOT for the "unknown field"
 *  diagnostic in both domains' `parseOperations` loops.
 *
 *  This is the DIAGNOSTIC half of the lenient-parse contract: the parser still SKIPS what it
 *  cannot interpret (so a note written by a newer app version keeps working — its unknown
 *  fields no-op instead of aborting the block, and its other overrides still apply), while the
 *  editor gets a span to underline. Both halves run in the same parse; only the presence of a
 *  `diags` collector distinguishes them. */
export const reportUnknownField = (
  fieldToken: Token,
  diags: DiagnosticSpan[] | undefined,
  blockOffset: number,
): void => {
  if (!diags) return
  const from = blockOffset + fieldToken.index
  diags.push({
    from,
    to: from + fieldToken.value.length,
    message: `'${fieldToken.value}' is not a recognized field here — it will be ignored`,
  })
}

/** Consume the value of an assignment whose field was not understood, so the skipped field
 *  cannot swallow the assignments that follow it — nor leave its own tail behind for the loop
 *  to misread as further fields.
 *
 *  Stops before the next `field =` pair or the block's closing brace. A comma is consumed as
 *  part of the value (an unknown field may hold a list, `notafield=a,b,c`), but only while it
 *  actually continues the list — a comma that SEPARATES assignments is followed by the next
 *  `field =` pair, which the same check catches on the following iteration. */
export const skipAssignmentValue = (cursor: TokenCursor): void => {
  while (true) {
    const next = cursor.peek()
    if (!next) return
    // A closing brace ends the block; leave it for the caller's loop to consume.
    if (next.kind === 'symbol' && next.value === '}') return
    // A word followed by `=` starts the next assignment.
    if (next.kind === 'word' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=') return
    cursor.next()
  }
}

// ── Marker options parser ─────────────────────────────────────────────────────

/** Resolved marker layout options: card-width multiplier + option-grid column count. */
export type QuestionMarkerOptions = { columns: number; optionColumns: number }

/**
 * Integer-valued marker keys parsed inside `[ … ]`, mapped to the QuestionMarkerOptions field
 * they set. SSOT for the marker-option grammar: adding a key here teaches both the parser and
 * the serializer (which reads the same map) without duplicating the key spelling or parse loop.
 * Typed as a `string`-indexable record so a lookup on an arbitrary token yields the field or
 * `undefined` (unknown keys fall through and are skipped).
 */
export const NOTE_OVERRIDES_MARKER_INT_KEYS: Record<string, keyof QuestionMarkerOptions> = {
  [NOTE_OVERRIDES_MARKER_COLUMNS_KEY]: 'columns',
  [NOTE_OVERRIDES_MARKER_OPTION_COLUMNS_KEY]: 'optionColumns',
}

/** Parse the optional [key=value, …] marker options block that follows the marker keyword. */

export const parseQuestionMarkerOptions = (cursor: TokenCursor): QuestionMarkerOptions => {
  const options: QuestionMarkerOptions = {
    columns: NOTE_OVERRIDES_LAYOUT_COLUMNS_DEFAULT,
    optionColumns: NOTE_OVERRIDES_OPTION_COLUMNS_DEFAULT,
  }
  const token = cursor.peek()
  if (!token || token.kind !== 'symbol' || token.value !== '[') return options
  cursor.next()
  while (true) {
    const next = cursor.peek()
    if (!next) break
    if (next.kind === 'symbol' && next.value === ']') { cursor.next(); break }
    if (isQuestionKeyword(next)) break
    if (next.kind === 'symbol' && next.value === ',') { cursor.next(); continue }
    if (next.kind === 'word') {
      // A recognized integer key (columns/optcols) consumes `= <int>` and updates its field;
      // one shared parse path for every key keeps the grammar single-sourced.
      const field = NOTE_OVERRIDES_MARKER_INT_KEYS[next.value.toLowerCase()]
      if (field) {
        cursor.next()
        if (!cursor.consumeSymbol('=')) continue
        const valueToken = cursor.peek()
        if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
        cursor.next()
        const parsed = Number.parseInt(valueToken.value, 10)
        if (Number.isFinite(parsed) && parsed >= 0) options[field] = parsed
        continue
      }
      cursor.next()
      continue
    }
    cursor.next()
  }
  return options
}

// ── Tag selector ──────────────────────────────────────────────────────────────

/** Tag-based selector subset shared by both recipe and safeguard overrides. */
export type NoteTagSelector =
  | { kind: 'all' }
  | { kind: 'tagged' }
  | { kind: 'untagged' }
  // Group membership, mirroring tagged/untagged. Only safeguard rules can be grouped, so in the
  // recipe domain `grouped` matches nothing and `ungrouped` matches everything.
  | { kind: 'grouped' }
  | { kind: 'ungrouped' }
  | { kind: 'tag'; mode: 'eq' | 'in' | 'any' | 'none'; values?: string[] }
  | { kind: 'not'; inner: NoteTagSelector }
  | { kind: 'and'; left: NoteTagSelector; right: NoteTagSelector }
  | { kind: 'or'; left: NoteTagSelector; right: NoteTagSelector }

/**
 * Format a NoteTagSelector back to DSL condition text (all / tagged / tag=foo / not … etc).
 * SSOT for DSL-reconstruction consumers; exhaustive over the union. Combinators recurse.
 */
export function formatNoteTagSelector(sel: NoteTagSelector): string {
  switch (sel.kind) {
    case 'all':      return 'all'
    case 'tagged':   return 'tagged'
    case 'grouped':   return 'grouped'
    case 'ungrouped': return 'ungrouped'
    case 'untagged': return 'untagged'
    case 'tag': {
      const values = sel.values ?? []
      if (sel.mode === 'any')  return 'tag any'
      if (sel.mode === 'none') return 'tag none'
      if (sel.mode === 'in')   return `tag in ${values.join(',')}`
      return values.length ? `tag=${values.join(',')}` : 'tag'
    }
    case 'not': return `not ${formatNoteTagSelector(sel.inner)}`
    case 'and': return `${formatNoteTagSelector(sel.left)} and ${formatNoteTagSelector(sel.right)}`
    case 'or':  return `${formatNoteTagSelector(sel.left)} or ${formatNoteTagSelector(sel.right)}`
  }
}

/**
 * Parse a tag-based selector expression. Handles: all, tagged, untagged,
 * tag=…, tag in […], tag any, tag none, not/!, and/&&, or/||.
 * Recipe-specific terms (rank, rarity, minrolls, flex) are NOT included here.
 */
export const parseTagSelector = (
  tokens: Token[],
  absoluteOffset = 0,
  diags?: DiagnosticSpan[],
): NoteTagSelector | null => {
  const cursor = new TokenCursor(tokens)

  const parseTerm = (): NoteTagSelector | null => {
    const token = cursor.peek()
    if (!token || token.kind !== 'word') return null
    const keyword = token.value.toLowerCase()
    if (keyword === 'all') { cursor.next(); return { kind: 'all' } }
    if (keyword === 'tagged') { cursor.next(); return { kind: 'tagged' } }
    if (keyword === 'untagged') { cursor.next(); return { kind: 'untagged' } }
    if (keyword === 'grouped') { cursor.next(); return { kind: 'grouped' } }
    if (keyword === 'ungrouped') { cursor.next(); return { kind: 'ungrouped' } }
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
    // Parenthesised sub-expression: "(" expr ")"
    if (token.kind === 'symbol' && token.value === '(') {
      cursor.next()
      const inner = parseOr()
      if (!inner) return null
      cursor.consumeSymbol(')')
      return inner
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
      if (!right) {
        if (diags) {
          const failTok = cursor.peek()
          if (failTok) {
            const from = absoluteOffset + failTok.index
            if (failTok.kind === 'symbol' && failTok.value === '@') {
              diags.push({ from, to: from + 1, message: `'@' after '${word}' — write the field name directly, e.g. '${word} tag=foo'` })
            } else if (failTok.kind === 'word') {
              diags.push({ from, to: from + failTok.value.length, message: `'${failTok.value}' is not a valid selector condition` })
            }
          }
        }
        return null
      }
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
      if (!right) {
        if (diags) {
          const failTok = cursor.peek()
          if (failTok) {
            const from = absoluteOffset + failTok.index
            if (failTok.kind === 'symbol' && failTok.value === '@') {
              diags.push({ from, to: from + 1, message: `'@' after '${word}' — write the field name directly, e.g. '${word} tag=foo'` })
            } else if (failTok.kind === 'word') {
              diags.push({ from, to: from + failTok.value.length, message: `'${failTok.value}' is not a valid selector condition` })
            }
          }
        }
        return null
      }
      left = { kind: 'or', left, right }
    }
    return left
  }

  const parsed = parseOr()
  if (parsed && diags) {
    const leftover = cursor.peek()
    if (leftover) {
      const from = absoluteOffset + leftover.index
      if (leftover.kind === 'symbol' && leftover.value === '@') {
        diags.push({ from, to: from + 1, message: `unexpected '@' in selector — did you mean to add 'and' or 'or' before it?` })
      } else if (leftover.kind === 'word') {
        diags.push({ from, to: from + leftover.value.length, message: `unexpected '${leftover.value}' in selector — missing 'and'/'or' connector?` })
      }
    }
  }
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
/** A single `setval` force: target a slider by its `id=token` marker, pin it to `value`. */
export type OverridesSetValueDirective = {
  token: string
  value: number
}

export type ParsedOverridesOption<S, O> = {
  id: string
  legacyId: string
  label: string
  // Optional second string rendered as the value column in two-column layouts.
  detail: string | null
  blocks: OverridesSelectorBlock<S, O>[]
  fallbackBlocks: OverridesSelectorBlock<S, O>[]
  // Cross-domain blocks (e.g. `safeguard @…` inside recipe-overrides, or `recipe @…` inside
  // safeguard-overrides). Typed as `unknown[]` here; domain parsers cast to their concrete type.
  crossBlocks: unknown[]
  crossFallbackBlocks: unknown[]
  isDefault: boolean
  explicitToken: string | null
  implicitToken: string | null
  setTokens: string[]
  unsetTokens: string[]
  excludedTokens: string[]
  onlyTokens: string[]
  // `needs` ids: this option is rendered disabled in the UI until at least one
  // referenced option is selected (purely a UI gate; does not alter selection).
  needsTokens: string[]
  // Optional `needs=on|off`: the checkbox is shown in this state while the gate is
  // unmet (display only; the stored value is untouched). null = keep current state.
  needsDisabledState: 'on' | 'off' | null
  // `setval token=number …`: while THIS option is selected, force the referenced slider
  // (matched by its `id=token` marker) to `value`. The target slider may live in another
  // overrides domain (e.g. a recipe checkbox forcing a safeguard slider) — resolution of the
  // force is computed, never persisted, so dragging the slider releases this option.
  setValueTokens: OverridesSetValueDirective[]
  groupType: NoteQuestionGroupType
  // Only populated when groupType === 'slider'.
  sliderParams?: SliderParams
  // Absolute character span of the WHOLE option block in the source note text (from the
  // opening label string through the closing `}` of its selector block). Used by the
  // editor preview to select the option's DSL on click. Absent if the span is unknown.
  sourceFrom?: number
  sourceTo?: number
  // Absolute offset of the option body's opening `{`. Together with sourceTo this bounds
  // the verbatim `{ … }` slice, letting the visual editor keep an unrepresentable body as
  // raw text instead of re-serializing it. Absent if the span is unknown.
  bodyFrom?: number
}

/** A parsed question body, parameterized over selector and operation types. */
export type ParsedOverridesQuestion<S, O> = {
  prompt: string
  // columns ≥ 1 enables horizontal (grid) option layout at N× card width; 0 = vertical.
  layoutColumns: number
  // Explicit option-grid column count (from `optcols=N`); 0 = auto-fit by available width.
  optionColumns: number
  // The effective question id (explicit `id=` when present, otherwise the content hash).
  questionId: string
  // The author-pinned `id=` verbatim, or null when the id was derived from prompt+options.
  // Kept distinct from `questionId` so the serializer/editor can re-emit only real pins.
  explicitId: string | null
  options: ParsedOverridesOption<S, O>[]
  fallback: { blocks: OverridesSelectorBlock<S, O>[]; crossBlocks: unknown[] } | null
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
    // Stop at the start of a new directive so chained constraints (e.g. `^a -b unset c`)
    // are not swallowed into the current list: a leading '-' marks an unset token, and
    // the set/unset/excl/only/needs keywords each open their own list.
    if (token.kind === 'word' && token.value.startsWith('-')) break
    if (token.kind === 'word'
        && (NOTE_OVERRIDES_CONSTRAINT_KEYWORDS as readonly string[]).includes(token.value.toLowerCase())) break
    if (token.kind === 'symbol' && token.value === '{') break
    if (token.kind !== 'word' && token.kind !== 'string') break
    cursor.next()
    const normalized = normalizeQuestionToken(token.value)
    if (normalized) sink.push(normalized)
  }
}

/** Read `token=number` pairs (comma/space-separated) into a sink until a structural keyword.
 *  Mirrors readTokenList's stop conditions but, unlike it, consumes the `=value` suffix that
 *  readTokenList deliberately breaks on. Malformed pairs are skipped (so downstream tokens are
 *  not mis-consumed) and, when `diags` is supplied, surfaced as syntax diagnostics so a typo
 *  like `setval x=y` or a bare `setval x` is flagged instead of silently dropped. */
export function readValueAssignmentList(
  cursor: TokenCursor,
  sink: OverridesSetValueDirective[],
  diags?: DiagnosticSpan[],
  blockOffset = 0,
): void {
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === ',') { cursor.next(); continue }
    // Same boundaries as readTokenList: stop before a new directive/keyword/block.
    if (token.kind === 'word' && (isQuestionKeyword(token) || isFallbackKeyword(token))) break
    if (token.kind === 'word' && parseGroupType(token.value)) break
    if (token.kind === 'word' && token.value.startsWith('-')) break
    if (token.kind === 'word'
        && (NOTE_OVERRIDES_CONSTRAINT_KEYWORDS as readonly string[]).includes(token.value.toLowerCase())) break
    if (token.kind === 'symbol' && token.value === '{') break
    if (token.kind !== 'word' && token.kind !== 'string') break
    // Expect `token = number`; bail on a malformed pair rather than mis-consuming downstream tokens.
    const normalized = normalizeQuestionToken(token.value)
    if (!normalized) { cursor.next(); continue }
    // A bare target with no `=value` (e.g. `setval min_dmgsurv_pieces`) is incomplete — flag it.
    if (cursor.peek(1)?.kind !== 'symbol' || cursor.peek(1)?.value !== '=') {
      if (diags) diags.push({
        from: blockOffset + token.index,
        to: blockOffset + token.index + token.value.length,
        message: `'${token.value}' is missing its value — write 'setval ${token.value}=<number>'`,
      })
      cursor.next(); continue
    }
    cursor.next() // token
    cursor.next() // '='
    const valueToken = cursor.peek()
    // An `=` with no following word (e.g. trailing `setval x=`) is incomplete — flag it.
    if (!valueToken || valueToken.kind !== 'word') {
      if (diags) diags.push({
        from: blockOffset + token.index,
        to: blockOffset + token.index + token.value.length + 1,
        message: `'${token.value}=' is missing its value — write 'setval ${token.value}=<number>'`,
      })
      continue
    }
    const value = Number.parseFloat(valueToken.value)
    cursor.next() // value
    // A non-numeric value (e.g. `x32`) cannot be applied — flag it instead of dropping silently.
    if (!Number.isFinite(value)) {
      if (diags) diags.push({
        from: blockOffset + valueToken.index,
        to: blockOffset + valueToken.index + valueToken.value.length,
        message: `'${valueToken.value}' is not a valid setval value for '${normalized}' — use a number`,
      })
      continue
    }
    sink.push({ token: normalized, value })
  }
}

// ── List-mutation token helpers ───────────────────────────────────────────────
// Shared by the recipe and safeguard operation parsers (single definition — the
// two domains must accept identical `field=+A,-B,+-C` list syntax).

/** Prefix categories for list-mutation assignment fields. */
export type ListTokenPrefix = 'none' | 'add' | 'remove' | 'addExcluded'
export type PrefixedToken = { prefix: ListTokenPrefix; value: string }

// Parse a raw token string into a prefix category and the bare name.
// `+-` is only meaningful for gearsets (add as excluded entry); for other
// fields it is treated the same as `+` (caller decides).
export function parsePrefixedToken(raw: string): PrefixedToken {
  const t = raw.trim()
  if (t.startsWith('+-')) return { prefix: 'addExcluded', value: t.slice(2).trim() }
  if (t.startsWith('+'))  return { prefix: 'add',         value: t.slice(1).trim() }
  if (t.startsWith('-'))  return { prefix: 'remove',      value: t.slice(1).trim() }
  return { prefix: 'none', value: t }
}

// Returns 'replace' if all tokens have no prefix, 'mutate' if all are prefixed,
// or 'ignore' if the prefixes are mixed (no-prefix alongside prefixed).
export function classifyListMode(tokens: PrefixedToken[]): 'replace' | 'mutate' | 'ignore' {
  const hasNone     = tokens.some((t) => t.prefix === 'none')
  const hasPrefixed = tokens.some((t) => t.prefix !== 'none')
  if (hasNone && hasPrefixed) return 'ignore'
  return hasNone ? 'replace' : 'mutate'
}

/**
 * Clear-to-any keyword for the gear-set / metaset list fields.
 *
 * A rule listing no explicit set AND no metaset means "any gear set" (HSF expresses
 * that by listing nothing), so an override needs a way to *reach* that state.
 * Enumerating `-Name` removals works but couples the block to every current member
 * name; `gearsets=any` / `metasets=any` says it directly and survives renames.
 *
 * Spelled `any` to match the DSL's existing `tag any` / `tag none` selector vocabulary
 * and the UI's "Any" label for an empty selection. A metaset literally named "any"
 * would be shadowed by the keyword — renaming that metaset is the fix.
 */
export const NOTE_OVERRIDES_CLEAR_LIST_KEYWORD = 'any'

/**
 * True when a parsed list is the single bare `any` token, i.e. a clear request.
 * Only the gear-set/metaset fields consult this; every other list field keeps
 * treating `any` as an unresolvable name (a silent no-op, exactly as before).
 */
export const isClearListTokens = (tokens: readonly PrefixedToken[]): boolean => (
  tokens.length === 1
  && tokens[0]!.prefix === 'none'
  && tokens[0]!.value.trim().toLowerCase() === NOTE_OVERRIDES_CLEAR_LIST_KEYWORD
)

// After the first value token of a list field has been consumed, collect any
// remaining comma-separated word/string tokens that continue the list.
// Handles the `+` symbol prefix so that `+Speed` and `+-Daze` are accepted
// as comma-separated entries (e.g. `gearsets=-Lifesteal,+-Daze,+Speed`).
export const consumeCommaSeparatedRemainder = (cursor: TokenCursor): string[] => {
  const extras: string[] = []
  while (cursor.consumeSymbol(',')) {
    // `+` is tokenized as a symbol; peek past it when followed by a word.
    let prefix = ''
    let next = cursor.peek()
    if (next?.kind === 'symbol' && next.value === '+') {
      const wordTok = cursor.peek(1)
      if (wordTok?.kind === 'word' || wordTok?.kind === 'string') {
        cursor.next()   // consume `+`
        prefix = '+'
        next = wordTok
      }
    }
    if (!next || (next.kind !== 'word' && next.kind !== 'string')) break
    cursor.next()
    extras.push(prefix + next.value)
  }
  return extras
}

/** All slider-param keywords; used both to drive parsing and to gate entry into it. */
export const SLIDER_PARAM_KEYWORDS = ['min', 'max', 'step', 'default', 'marks', 'unit', 'toggle', 'toggleside', 'toggledefault'] as const

/** Parse a `marks=` list: `value:"label"[:"subtext"]` items, comma-separated. The list
 *  ends at the first token that is not a `<number> :` mark (e.g. the next param or `{`). */
const parseSliderMarks = (cursor: TokenCursor): SliderMark[] => {
  const marks: SliderMark[] = []
  while (true) {
    const valueToken = cursor.peek()
    if (!valueToken || valueToken.kind !== 'word') break
    const value = Number.parseFloat(valueToken.value)
    if (!Number.isFinite(value)) break
    // A mark requires `<number> : "label"`; bail (without consuming) if the colon is absent.
    if (cursor.peek(1)?.kind !== 'symbol' || cursor.peek(1)?.value !== ':') break
    cursor.next() // number
    cursor.next() // ':'
    const labelToken = cursor.peek()
    if (!labelToken || labelToken.kind !== 'string') break
    cursor.next()
    const mark: SliderMark = { value, label: labelToken.value }
    // Optional `: "subtext"`.
    if (cursor.peek()?.kind === 'symbol' && cursor.peek()?.value === ':') {
      const subToken = cursor.peek(1)
      if (subToken?.kind === 'string') { cursor.next(); cursor.next(); mark.subtext = subToken.value }
    }
    marks.push(mark)
    // Continue only across an explicit comma separator.
    if (cursor.peek()?.kind === 'symbol' && cursor.peek()?.value === ',') { cursor.next(); continue }
    break
  }
  return marks
}

/** Parse slider params (min/max/step/default/marks/toggle…) before the opening brace.
 *  `diags`/`blockOffset` (optional) collect diagnostics for enumerated params whose value
 *  is outside the accepted set (e.g. `toggleside=ab`), which would otherwise silently fall
 *  back to a default instead of being surfaced as a typo. */
export const parseSliderParams = (cursor: TokenCursor, diags?: DiagnosticSpan[], blockOffset = 0): SliderParams => {
  // Defaults: slider from 0 to 10 in steps of 1 with default 1.
  let min = 0; let max = 10; let step = 1; let def = 1
  let marks: SliderMark[] | undefined
  let toggle: SliderToggle | undefined
  let unit: string | undefined
  // Lazily create the toggle so toggle/toggleside/toggledefault can appear in any order.
  const ensureToggle = (): SliderToggle => (toggle ??= { label: '', side: 'above', default: 'on' })
  // Flag an enumerated value outside its accepted set (delegates to the shared SSOT helper).
  const reportInvalidValue = (keyword: string, valueToken: Token, accepted: readonly string[]): void =>
    reportInvalidEnumValue(keyword, valueToken, accepted, diags, blockOffset)
  while (true) {
    const token = cursor.peek()
    if (!token || token.kind !== 'word') break
    const keyword = token.value.toLowerCase()
    if (!(SLIDER_PARAM_KEYWORDS as readonly string[]).includes(keyword)) break
    cursor.next()
    if (!cursor.consumeSymbol('=')) continue
    if (keyword === 'marks') { marks = parseSliderMarks(cursor); continue }
    const valueToken = cursor.peek()
    if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
    if (keyword === 'toggle') { cursor.next(); ensureToggle().label = valueToken.value; continue }
    // `unit` is a display-only suffix; accept the raw string/word verbatim.
    if (keyword === 'unit') { cursor.next(); unit = valueToken.value; continue }
    // Accept only the enumerated sides; anything else maps to the default 'above' AND is flagged
    // (a silent fallback would hide typos like `toggleside=ab`).
    if (keyword === 'toggleside') {
      cursor.next()
      const lowered = valueToken.value.toLowerCase()
      if (!(SLIDER_TOGGLE_SIDE_VALUES as readonly string[]).includes(lowered)) reportInvalidValue('toggleside', valueToken, SLIDER_TOGGLE_SIDE_VALUES)
      ensureToggle().side = lowered === SLIDER_TOGGLE_SIDE_VALUES[0] ? 'left' : 'above'
      continue
    }
    // Likewise for toggledefault: accept only on/off; flag anything else (it defaults to 'on').
    if (keyword === 'toggledefault') {
      cursor.next()
      const lowered = valueToken.value.toLowerCase()
      if (!(SLIDER_TOGGLE_DEFAULT_VALUES as readonly string[]).includes(lowered)) reportInvalidValue('toggledefault', valueToken, SLIDER_TOGGLE_DEFAULT_VALUES)
      ensureToggle().default = lowered === 'off' ? 'off' : 'on'
      continue
    }
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
  const result: SliderParams = { min, max, step, default: safeDefault }
  if (marks && marks.length > 0) result.marks = marks
  if (toggle) result.toggle = toggle
  if (unit) result.unit = unit
  return result
}

/**
 * Parse selector blocks + optional group-level fallback from an already-opened `{` context.
 * Stops on the matching `}`.
 *
 * @param parseCrossBlock - Optional handler for cross-domain blocks of the form `keyword @selector { ... }`.
 *   Called after consuming the domain keyword and `@`; returns a parsed block (stored in `crossBlocks`)
 *   or null. Any word token immediately followed by `@` triggers this handler instead of the normal skip.
 */
export function parseGroupBlocks<S, O>(
  cursor: TokenCursor,
  parseSelectorBlock: (cursor: TokenCursor) => OverridesSelectorBlock<S, O> | null,
  parseCrossBlock?: (cursor: TokenCursor) => unknown | null,
  diags?: DiagnosticSpan[],
  blockOffset = 0,
): {
  blocks: OverridesSelectorBlock<S, O>[]
  fallbackBlocks: OverridesSelectorBlock<S, O>[]
  crossBlocks: unknown[]
  crossFallbackBlocks: unknown[]
} {
  const blocks: OverridesSelectorBlock<S, O>[] = []
  const fallbackBlocks: OverridesSelectorBlock<S, O>[] = []
  const crossBlocks: unknown[] = []
  const crossFallbackBlocks: unknown[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === '}') { cursor.next(); break }
    if (isFallbackKeyword(token)) {
      cursor.next()
      if (!cursor.consumeSymbol('{')) continue
      const { parsed: fbParsed, crossParsed: fbCross } = parseSelectorBlockListWithCross(cursor, parseSelectorBlock, parseCrossBlock)
      if (fbParsed.length > 0) fallbackBlocks.push(...fbParsed)
      if (fbCross.length > 0) crossFallbackBlocks.push(...fbCross)
      continue
    }
    // Cross-domain block: `keyword @selector { ... }` — word token immediately followed by `@`.
    if (parseCrossBlock && token.kind === 'word' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '@') {
      cursor.next()  // consume domain keyword
      cursor.next()  // consume '@'
      const block = parseCrossBlock(cursor)
      if (block !== null && block !== undefined) crossBlocks.push(block)
      continue
    }
    if (token.kind === 'symbol' && token.value === '@') {
      cursor.next()
      const block = parseSelectorBlock(cursor)
      if (block) blocks.push(block)
      continue
    }
    // Diagnose a word token followed by a comparison operator — this pattern
    // strongly suggests a selector block whose '@' sigil was omitted, e.g.
    // `minrolls=4 { … }` instead of `@minrolls=4 { … }`.  Without the '@',
    // each token in `field op value { … }` is skipped individually and the
    // inner closing `}` will prematurely close the outer group.
    if (diags && token.kind === 'word') {
      const nextTok = cursor.peek(1)
      if (nextTok?.kind === 'symbol' && (nextTok.value === '=' || nextTok.value === '>=' || nextTok.value === '<=')) {
        diags.push({
          from: blockOffset + token.index,
          to: blockOffset + token.index + token.value.length,
          message: `'${token.value}' looks like a selector expression — missing '@' before it (e.g. '@${token.value}${nextTok.value}...')`,
        })
      }
    }
    cursor.next()
  }
  return { blocks, fallbackBlocks, crossBlocks, crossFallbackBlocks }
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

/** Internal variant that also collects cross-domain blocks. */
function parseSelectorBlockListWithCross<S, O>(
  cursor: TokenCursor,
  parseSelectorBlock: (cursor: TokenCursor) => OverridesSelectorBlock<S, O> | null,
  parseCrossBlock?: (cursor: TokenCursor) => unknown | null,
): { parsed: OverridesSelectorBlock<S, O>[]; crossParsed: unknown[] } {
  const parsed: OverridesSelectorBlock<S, O>[] = []
  const crossParsed: unknown[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind === 'symbol' && token.value === '}') { cursor.next(); break }
    if (parseCrossBlock && token.kind === 'word' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '@') {
      cursor.next()  // consume domain keyword
      cursor.next()  // consume '@'
      const block = parseCrossBlock(cursor)
      if (block !== null && block !== undefined) crossParsed.push(block)
      continue
    }
    if (!cursor.consumeSymbol('@')) { cursor.next(); continue }
    const block = parseSelectorBlock(cursor)
    if (block) parsed.push(block)
  }
  return { parsed, crossParsed }
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
  parseCrossBlock?: (cursor: TokenCursor) => void,
  diags?: DiagnosticSpan[],
  blockOffset = 0,
): ParsedOverridesOption<S, O> | null {
  const labelToken = cursor.consumeString()
  if (!labelToken) return null
  const label = labelToken.value
  // Source span starts at the opening label string; the end is captured after the
  // block's closing `}` is consumed (cursor.prevEnd at the return site).
  const sourceFrom = blockOffset + labelToken.index
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
  const needsTokens: string[] = []
  const setValueTokens: OverridesSetValueDirective[] = []
  let needsDisabledState: 'on' | 'off' | null = null
  let sliderParams: SliderParams | undefined
  // Offset of the body-opening `{` (captured at the consume site) for raw-body extraction.
  let bodyFrom: number | undefined
  // Track header parsing order so constraints stay before the selector block.
  let headerPhase: 'id' | 'default' | 'constraints' = 'id'

  if (groupType === 'slider') {
    // Slider groups: parse optional id/default markers, then slider params, then block.
    // Slider groups have no constraint phase; id/default markers are always accepted.
    while (true) {
      const token = cursor.peek()
      if (!token) return null
      if (token.kind === 'symbol' && token.value === '{') { bodyFrom = blockOffset + token.index; cursor.next(); break }
      if (token.kind === 'symbol' && token.value === '*') {
        isDefault = true; cursor.next(); continue
      }
      if (token.kind === 'word' && token.value.toLowerCase() === 'default'
          && cursor.peek(1)?.kind !== 'symbol') {
        // 'default' as a marker (no '=' follows) — not a slider param.
        isDefault = true; cursor.next(); continue
      }
      if (token.kind === 'word' && token.value.toLowerCase() === 'id') {
        cursor.next()
        if (!cursor.consumeSymbol('=')) continue
        const valueToken = cursor.peek()
        if (!valueToken || (valueToken.kind !== 'word' && valueToken.kind !== 'string')) continue
        cursor.next()
        reportReservedIdToken(valueToken, diags, blockOffset)
        const candidate = normalizeQuestionToken(valueToken.value)
        if (candidate) explicitToken = candidate
        continue
      }
      // Parse slider params (min/max/step/default=<number>, marks=…, toggle…=…).
      if (token.kind === 'word') {
        const kw = token.value.toLowerCase()
        // 'default' is overloaded: a bare `default` marker vs `default=` param. The other
        // param keywords (min/max/step/marks/toggle…) are always params when followed by '='.
        if ((kw !== 'default' && (SLIDER_PARAM_KEYWORDS as readonly string[]).includes(kw))
            || (kw === 'default' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=')) {
          sliderParams = parseSliderParams(cursor, diags, blockOffset)
          continue
        }
      }
      // Anything else before the slider body is unexpected — typically a malformed param
      // value (e.g. a stray quote turning `marks=…` into a string) that stops param parsing
      // and leaves garbage behind. Flag it once so the error checker surfaces the typo
      // instead of silently dropping the leftover tokens.
      if (diags) {
        const from = blockOffset + token.index
        diags.push({
          from,
          to: from + token.value.length,
          message: `unexpected '${token.value}' in slider header — check the preceding slider params (e.g. a stray quote in marks=…)`,
        })
      }
      cursor.next()
    }
    // If no params were parsed, apply defaults.
    if (!sliderParams) sliderParams = { min: 0, max: 10, step: 1, default: 1 }
    const { blocks, fallbackBlocks, crossBlocks, crossFallbackBlocks } = parseGroupBlocks(cursor, parseSelectorBlock, parseCrossBlock, diags, blockOffset)
    const baseLabel = normalizeQuestionText(dslLocaleBase(label)).toLowerCase()
    const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
    return {
      id, legacyId: id, label, detail, blocks, fallbackBlocks, crossBlocks, crossFallbackBlocks,
      isDefault, explicitToken, implicitToken: null,
      setTokens, unsetTokens, excludedTokens, onlyTokens, needsTokens, needsDisabledState, setValueTokens,
      groupType, sliderParams,
      sourceFrom, sourceTo: blockOffset + cursor.prevEnd(), bodyFrom,
    }
  }

  // single / multi groups: parse id, default marker, constraints, then block.
  while (true) {
    const token = cursor.peek()
    if (!token) return null
    if (token.kind === 'symbol' && token.value === '{') { bodyFrom = blockOffset + token.index; cursor.next(); break }
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
      reportReservedIdToken(valueToken, diags, blockOffset)
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
    if (token.kind === 'word' && token.value.toLowerCase() === 'needs') {
      headerPhase = 'constraints'; cursor.next()
      // Optional `=on|off`: the displayed checkbox state while the gate is unmet.
      if (cursor.consumeSymbol('=')) {
        const stateToken = cursor.peek()
        if (stateToken && stateToken.kind === 'word') {
          const value = stateToken.value.toLowerCase()
          if (value === 'on' || value === 'true') { needsDisabledState = 'on'; cursor.next() }
          else if (value === 'off' || value === 'false') { needsDisabledState = 'off'; cursor.next() }
          // Anything else (e.g. `needs=maybe`) is a typo: flag it instead of leaving the
          // state null and silently swallowing the token into the following id list.
          else { reportInvalidEnumValue('needs', stateToken, NOTE_OVERRIDES_BOOLEAN_KEYWORDS, diags, blockOffset); cursor.next() }
        }
      }
      readTokenList(cursor, needsTokens); continue
    }
    if (token.kind === 'word' && token.value.toLowerCase() === NOTE_OVERRIDES_SETVAL_KEYWORD) {
      headerPhase = 'constraints'; cursor.next()
      readValueAssignmentList(cursor, setValueTokens, diags, blockOffset); continue
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
  // Thread diags/offset like the slider path above so missing-'@' selector shapes
  // inside rb/cb bodies surface in the error checker too.
  const { blocks, fallbackBlocks, crossBlocks, crossFallbackBlocks } = parseGroupBlocks(cursor, parseSelectorBlock, parseCrossBlock, diags, blockOffset)
  const baseLabel = normalizeQuestionText(label).toLowerCase()
  const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
  const implicitToken = normalizeQuestionToken(String(optionIndex + 1))
  return {
    id, legacyId: id, label, detail, blocks, fallbackBlocks, crossBlocks, crossFallbackBlocks,
    isDefault, explicitToken, implicitToken,
    setTokens, unsetTokens, excludedTokens, onlyTokens, needsTokens, needsDisabledState, setValueTokens,
    groupType,
    sourceFrom, sourceTo: blockOffset + cursor.prevEnd(), bodyFrom,
  }
}

/** Build a stable question id from prompt + option labels/group types. */
export const buildQuestionKey = (
  prompt: string,
  options: Array<{ label: string; groupType: NoteQuestionGroupType }>,
): string => {
  // Hash the English base only so adding/removing `[[xx]]` translations never shifts the id.
  const key = {
    prompt: normalizeQuestionText(dslLocaleBase(prompt)),
    options: options.map((opt) => ({
      label: normalizeQuestionText(dslLocaleBase(opt.label)),
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
  parseCrossBlock?: (cursor: TokenCursor) => void,
  diags?: DiagnosticSpan[],
  blockOffset = 0,
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
  // Optional explicit question id (`q "…" id=TOKEN`), consumed immediately after the prompt
  // and before any option group. When present it PINS the question's identity, so later edits
  // to the prompt or option set never re-hash the id and orphan saved answers. Without it the
  // id is derived from prompt+options (see buildQuestionKey). Mirrors the option-level `id=`.
  let explicitId: string | null = null
  if (cursor.peek()?.kind === 'word' && cursor.peek()!.value.toLowerCase() === 'id'
      && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=') {
    cursor.next() // 'id'
    cursor.next() // '='
    const valueToken = cursor.peek()
    if (valueToken && (valueToken.kind === 'word' || valueToken.kind === 'string')) {
      cursor.next()
      reportReservedIdToken(valueToken, diags, blockOffset)
      const candidate = normalizeQuestionToken(valueToken.value)
      if (candidate) explicitId = candidate
    }
  }
  const parsedOptions: ParsedOverridesOption<S, O>[] = []
  let fallbackBlocks: OverridesSelectorBlock<S, O>[] | null = null
  let fallbackCrossBlocks: unknown[] = []
  while (true) {
    const token = cursor.peek()
    if (!token) break
    if (token.kind !== 'word') { cursor.next(); continue }
    if (isQuestionKeyword(token)) break
    if (isFallbackKeyword(token)) {
      cursor.next()
      if (!cursor.consumeSymbol('{')) continue
      const { parsed, crossParsed } = parseSelectorBlockListWithCross(cursor, parseSelectorBlock, parseCrossBlock)
      fallbackBlocks = parsed.length > 0 ? parsed : null
      if (crossParsed.length > 0) fallbackCrossBlocks = crossParsed
      continue
    }
    const groupType = parseGroupType(token.value)
    if (!groupType) { cursor.next(); continue }
    cursor.next()
    const parsed = parseOverridesOptionBlock(cursor, parsedOptions.length, groupType, parseSelectorBlock, parseCrossBlock, diags, blockOffset)
    if (!parsed) { if (cursor.peek()) cursor.next(); continue }
    parsedOptions.push(parsed)
  }
  if (parsedOptions.length === 0) return null
  // An explicit `id=` pins the question's identity; otherwise fall back to the content hash.
  const questionId = explicitId ?? buildQuestionKey(
    prompt,
    parsedOptions.map((opt) => ({ label: opt.label, groupType: opt.groupType })),
  )
  // Scope option ids to the question so cross-question exclusions stay unique.
  parsedOptions.forEach((option, index) => {
    // English base only so the scoped id is stable regardless of translations on the label.
    const baseLabel = normalizeQuestionText(dslLocaleBase(option.label)).toLowerCase()
    option.id = baseLabel ? `${questionId}:${baseLabel}#${index}` : `${questionId}:option-${index}`
  })
  return {
    prompt,
    layoutColumns: markerOptions.columns,
    optionColumns: markerOptions.optionColumns,
    questionId,
    explicitId,
    options: parsedOptions,
    fallback: (fallbackBlocks || fallbackCrossBlocks.length > 0)
      ? { blocks: fallbackBlocks ?? [], crossBlocks: fallbackCrossBlocks }
      : null,
  }
}

/**
 * Parse a bare (body-less) overrides marker and return its `columns` option,
 * or null if the text isn't a recognized marker or already has a question keyword.
 * Used to detect spacer markers like `<!-- recipe-overrides [columns=3] -->`.
 */
export function parseOverridesMarkerSpacerColumns(
  inner: string,
  markerKeywords: readonly string[],
): number | null {
  const tokens = tokenize(inner)
  const cursor = new TokenCursor(tokens)
  if (!cursor.consumeWord(...markerKeywords)) return null
  const markerOptions = parseQuestionMarkerOptions(cursor)
  // A question keyword means this is a real question, not a spacer.
  if (cursor.consumeWord('q', 'question')) return null
  return markerOptions.columns
}

// ── $count / $value AST ───────────────────────────────────────────────────────

/**
 * AST node for arithmetic expressions in `count = <expr>` (and numeric cross-domain)
 * assignments. Shared between safeguard-overrides and recipe cross-domain blocks.
 *
 *   expr       → addExpr
 *   addExpr    → mulExpr  (('+' | '-') mulExpr)*
 *   mulExpr    → unaryExpr (('*' | '/') unaryExpr)*
 *   unaryExpr  → '-' unaryExpr | primary
 *   primary    → '(' expr ')' | $count('.'TOKEN)? | $value('.'TOKEN)? | NUMBER
 *
 * Both `$count` and `$value` alias the enclosing slider value.
 * `$count.TOKEN` / `$value.TOKEN` references another slider by its id=TOKEN.
 */
export type NoteCountAstNode =
  | { kind: 'literal'; value: number }
  | { kind: 'ref'; sliderId: string | null }
  | { kind: 'binop'; op: '+' | '-' | '*' | '/';
      left: NoteCountAstNode; right: NoteCountAstNode }
  | { kind: 'unary'; op: '-'; operand: NoteCountAstNode }

// True when the cursor is at a hard stop that terminates an expression:
//   `}` closes the current selector block; `,` is an operation separator;
//   a word followed by `=` opens a new field assignment.
const isCountExprStop = (cursor: TokenCursor): boolean => {
  const t = cursor.peek()
  if (!t) return true
  if (t.kind === 'symbol' && (t.value === '}' || t.value === ',')) return true
  if (t.kind === 'word' && cursor.peek(1)?.kind === 'symbol' && cursor.peek(1)?.value === '=') return true
  return false
}

// addExpr → mulExpr (('+' | '-') mulExpr)*
// '+' is a symbol; '-' arrives as a word token when space-separated.
const parseCountAddExpr = (cursor: TokenCursor): NoteCountAstNode | null => {
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
const parseCountMulExpr = (cursor: TokenCursor): NoteCountAstNode | null => {
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
const parseCountUnary = (cursor: TokenCursor): NoteCountAstNode | null => {
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
const parseCountPrimary = (cursor: TokenCursor): NoteCountAstNode | null => {
  if (isCountExprStop(cursor)) return null
  const t = cursor.peek()
  if (!t) return null
  if (t.kind === 'symbol' && t.value === '(') {
    cursor.next()
    const inner = parseCountAddExpr(cursor)
    cursor.consumeSymbol(')')
    return inner
  }
  if (t.kind !== 'word') return null
  const lc = t.value.toLowerCase()
  if (lc === '$count' || lc === '$value') {
    cursor.next()
    return { kind: 'ref', sliderId: null }
  }
  if (lc.startsWith('$count.') || lc.startsWith('$value.')) {
    cursor.next()
    const sliderId = t.value.slice(t.value.indexOf('.') + 1) || null
    return { kind: 'ref', sliderId }
  }
  const n = Number(t.value)
  if (Number.isFinite(n)) {
    cursor.next()
    return { kind: 'literal', value: n }
  }
  return null
}

/**
 * Parse a full `count`/numeric expression from the cursor.
 * Returns the AST node, or null if parsing fails.
 */
export const parseCountExpression = (cursor: TokenCursor): NoteCountAstNode | null => {
  if (isCountExprStop(cursor)) return null
  return parseCountAddExpr(cursor)
}

/**
 * Evaluate a NoteCountAstNode to a number.
 * @param selfValue  The enclosing slider's current numeric value.
 * @param tokenMap   Map from slider explicit-token → slider current value.
 */
export const evalCountAst = (
  node: NoteCountAstNode,
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
      // Guard zero denominator by returning the left operand unchanged.
      return r !== 0 ? l / r : l
    }
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
