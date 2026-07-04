/**
 * overridesDraftTypes.ts
 *
 * Editable draft model for one note override block (`<!-- recipe-overrides … -->` /
 * `<!-- safeguard-overrides … -->`), consumed by the visual override-block editor.
 *
 * Types only — mapping (parse → draft) lives in overridesDraft.ts and emission
 * (draft → DSL) in overridesSerializer.ts, keeping the runtime dependency graph
 * one-directional (serializer ← draft ← both).
 *
 * The draft reuses the parser's LEAF types verbatim (selectors, operations, count
 * ASTs, slider enums) so no token spelling or union is ever re-declared (SSOT).
 * Only the *container* shape is new: a unified, domain-tagged, mutable structure
 * the editor UI can hold in state and update immutably.
 */
import type {
  NOTE_OVERRIDES_CROSS_KEYWORDS,
  NoteQuestionGroupType,
  NoteTagSelector,
  OverridesSetValueDirective,
  SliderToggleDefault,
  SliderToggleSide,
} from './noteOverridesParser'
import type { RecipeOverridesOperation, RecipeOverridesSelector } from './noteRecipeOverrides'
import type { SafeguardOverridesOperation } from './noteSafeguardOverrides'

/** Which override marker family a draft belongs to. Derived from the cross-keyword
 *  SSOT so the set of domains has exactly one definition. */
export type OverridesDomain = keyof typeof NOTE_OVERRIDES_CROSS_KEYWORDS

/**
 * One locale-segmented DSL string, split for per-language editing.
 * `base` is the English text (the identity source for question/option ids);
 * `locales` holds the `[[cc]]` variants in emission order (parse order, duplicates
 * dropped first-wins — mirroring splitDslLocaleSegments).
 */
export type DraftLocalizedText = {
  base: string
  locales: Array<{ code: string; text: string }>
}

/**
 * A `@selector { operations }` block, tagged by the domain whose grammar parsed it.
 * The recipe grammar has field-comparison selectors; the safeguard grammar is the
 * tag-only subset — reusing the parsed unions keeps both in lock-step with the parser.
 */
export type DraftSelectorBlock =
  | { domain: 'recipe'; selector: RecipeOverridesSelector; operations: RecipeOverridesOperation[] }
  | { domain: 'safeguard'; selector: NoteTagSelector; operations: SafeguardOverridesOperation[] }

/**
 * Structured (fully parsed) option body. `blocks`/`elseBlocks` are same-domain;
 * `crossBlocks`/`crossElseBlocks` target the opposite domain (`safeguard @…` inside
 * recipe options, `recipe @…` inside safeguard options). NOTE: the parser separates
 * main and cross blocks into distinct arrays, so their interleaving inside the source
 * body is not preserved — resolution semantics are order-independent across the two
 * families, so this loses formatting only, never behavior.
 */
export type DraftStructuredBody = {
  kind: 'structured'
  blocks: DraftSelectorBlock[]
  crossBlocks: DraftSelectorBlock[]
  elseBlocks: DraftSelectorBlock[]
  crossElseBlocks: DraftSelectorBlock[]
}

/**
 * Verbatim `{ … }` body text (including both braces). Used when the parsed body
 * cannot be re-serialized with byte-level fidelity (the round-trip gate failed) or
 * when the user opts into raw editing. Validated via validateRawBody before apply.
 */
export type DraftRawBody = { kind: 'raw'; text: string }

export type DraftOptionBody = DraftStructuredBody | DraftRawBody

/** One `marks=` entry, with the label/subtext split per locale for editing. */
export type DraftSliderMark = {
  value: number
  label: DraftLocalizedText
  subtext: DraftLocalizedText | null
}

/** Slider header params in editable form (localized strings split per locale). */
export type DraftSliderParams = {
  // Values are post-clamp (the parser clamps default into [min,max], step ≥ 0.001),
  // so serialize∘parse is idempotent as long as the UI clamps inputs the same way.
  min: number
  max: number
  step: number
  default: number
  // Display suffix (e.g. "%" or " pieces"); null = none.
  unit: DraftLocalizedText | null
  // Optional on/off checkbox bound to the slider's else block; null = none.
  toggle: { label: DraftLocalizedText; side: SliderToggleSide; default: SliderToggleDefault } | null
  // Labeled guide marks; empty = bare end ticks.
  marks: DraftSliderMark[]
}

/** One editable option (`rb` / `cb` / `slider` line) of the question. */
export type DraftOption = {
  // Ephemeral UI identity for React list keys / accordion state. Never serialized.
  key: string
  groupType: NoteQuestionGroupType
  label: DraftLocalizedText
  detail: DraftLocalizedText | null
  // `*` default marker.
  isDefault: boolean
  // `id=…` explicit token (normalized), or null for positional-only referencing.
  explicitId: string | null
  // Header constraint token lists (normalized tokens, mirroring the parsed option).
  onlyTokens: string[]      // `^a b` allow-list
  setTokens: string[]       // `+a` force-on
  unsetTokens: string[]     // `-a` force-off
  excludedTokens: string[]  // `excl a` mutual exclusion
  needsTokens: string[]     // `needs a` UI enable-gate
  needsDisabledState: 'on' | 'off' | null  // `needs=on|off` forced display state
  setValueDirectives: OverridesSetValueDirective[]  // `setval tok=n` slider forces
  // Slider header params; non-null iff groupType === 'slider'.
  sliderParams: DraftSliderParams | null
  // Effect body — structured builder model or verbatim raw text.
  body: DraftOptionBody
}

/** Question-level `fallback { … }` blocks (applied when no group has selections). */
export type DraftQuestionFallback = {
  blocks: DraftSelectorBlock[]
  crossBlocks: DraftSelectorBlock[]
}

/**
 * The whole editable block. `question` drafts carry the prompt/options; `spacer`
 * drafts model body-less width-placeholder markers (`<!-- recipe-overrides [columns=1] -->`).
 */
export type OverridesBlockDraft =
  | {
      domain: OverridesDomain
      kind: 'question'
      // 0 = omit the `[columns=…]` attribute (vertical layout at standard width).
      columns: number
      prompt: DraftLocalizedText
      options: DraftOption[]
      fallback: DraftQuestionFallback | null
    }
  | { domain: OverridesDomain; kind: 'spacer'; columns: number }
