/**
 * dynamicOverridesPresetSummary.ts
 *
 * SSOT helpers for the note dialog's saved dynamic-overrides sets:
 *  - build the human-readable summary (question title + selected answer labels)
 *    shown in the save/load menu tooltip, omitting questions/answers absent from
 *    the current note;
 *  - intersect a saved answer map against the current note's questions so loading
 *    applies only still-valid selections (the "apply matching, leave rest" rule).
 *
 * Title/label text is kept VERBATIM (still carrying the override DSL markdown —
 * `code` backticks, **bold**, etc.) so the tooltip can render it through the same
 * markdown pipeline the rest of the app uses, instead of leaking raw `*`/backticks.
 * Only the question title line (first line of the prompt) is kept; the explanatory
 * subtext and the long per-option `detail` are dropped to keep the tooltip compact.
 *
 * Both override domains expose the same minimal question shape, so one generic
 * over that shape covers both rather than forking the logic. A question may mix
 * groups (e.g. a safeguard count card is an activation radio group PLUS a slider),
 * so each answer VALUE is classified independently: known option ids resolve to
 * their label, everything else is a slider value (numeric string / toggle sentinel).
 */
import {
  resolveRecipeOverridesTags,
  splitQuestionPrompt,
  normalizeOptionLabelText,
  type NoteRecipeOverridesAnswers,
} from './noteRecipeOverrides'
import { resolveNoteSafeguardOverridesTags, SLIDER_TOGGLE_OFF, type NoteSafeguardOverridesAnswers } from './noteSafeguardOverrides'
import type {
  DynamicOverridesPresetLabelEntry,
  DynamicOverridesPresetSavedLabels,
} from '../state/dynamicOverridesPresetsPreference'

/**
 * The minimal question shape both override domains satisfy. `groups` lets us spot
 * slider questions (whose answer is a numeric value, not an option id); `answer`
 * is the fully-resolved current selection (defaults already merged in by the resolver);
 * `defaultAnswer` lets us mark which of those answers are just the note's default.
 */
type SummarizableQuestion = {
  id: string
  prompt: string
  // `sliderToggle` (present only on a slider option carrying an on/off checkbox) lets the
  // summary prefix the value with the toggle wording, e.g. "Yes - 25".
  options: { id: string; label: string; sliderToggle?: { label: string } }[]
  groups: { type: string }[]
  answer: string[]
  defaultAnswer: string[]
}

/** A stored answer map keyed by question id → selected option ids. */
type AnswerMap = Record<string, string[]>

/** One selected answer in a summary line: its label + whether it's the note's default. */
export type DynamicOverridesSummaryAnswer = {
  // Verbatim markdown label (backticks/bold preserved), or the numeric value for a slider.
  label: string
  // True when this answer matches the question's default (the user accepted the default).
  isDefault: boolean
}

/** One resolved line of a preset summary: a question title + its selected answers. */
export type DynamicOverridesSummaryLine = {
  // The question's title line (first line of the prompt, subtext dropped — matches the card header).
  // Kept verbatim so the renderer can interpret its markdown (backticks/bold).
  title: string
  // The question's selected answers (including ones at their default).
  answers: DynamicOverridesSummaryAnswer[]
  // True when the preset stored an answer for this question but some or all of those
  // answers are no longer available in the current note (question gone or options removed).
  // Only set when the preset explicitly stored an answer — questions left at their note
  // default when saving are NOT flagged even though they also show the default.
  hasPresetFallback: boolean
}

/**
 * True when any answer in `presetAnswers` is not fully reflected in `appliedAnswers`:
 * either the question ID is missing entirely (question gone from the note) or some of
 * its stored option values were dropped (options removed from the note's question).
 * Used both for the per-line flag and for the row-level summary indicator.
 */
const hasFallbackInDomain = (presetAnswers: AnswerMap, appliedAnswers: AnswerMap): boolean => {
  for (const [qId, saved] of Object.entries(presetAnswers)) {
    const applied = appliedAnswers[qId]
    // Question gone from note entirely.
    if (applied === undefined) return true
    // Some option values were filtered out (option IDs no longer in the note's question).
    if (saved.some((v) => !applied.includes(v))) return true
  }
  return false
}

/**
 * Turn the fully-resolved questions into summary lines. Iterates over the QUESTIONS
 * (not the lean stored map) so questions left at their default still appear — the
 * resolver has already merged defaults into each `.answer`. Each answer is flagged
 * `isDefault` by comparing against the question's `defaultAnswer`. A question whose
 * resolved selection is empty (e.g. an unchecked multi with no default) contributes
 * no line. Title/label text is the display text (never internal ids), markdown verbatim.
 *
 * `presetAnswers` is the raw stored map; `appliedAnswers` is the intersection result.
 * Together they let us mark which lines show a fallback because the preset's stored
 * answer was unavailable (vs. questions that were left at their default when saving).
 */
const summarizeQuestions = (
  questions: SummarizableQuestion[],
  presetAnswers: AnswerMap,
  appliedAnswers: AnswerMap,
): DynamicOverridesSummaryLine[] => {
  const lines: DynamicOverridesSummaryLine[] = []
  for (const question of questions) {
    const resolved = Array.isArray(question.answer) ? question.answer : []
    const defaultSet = new Set(question.defaultAnswer)
    // A question may mix groups: e.g. the safeguard count cards carry a `single` radio
    // group (activation mode) AND a `slider` group (count) at once. So classify each
    // answer VALUE, not the whole question — an id that matches a real option resolves to
    // that option's label; anything else is a slider value (numeric string / toggle sentinel).
    const optionById = new Map(question.options.map((o) => [o.id, o]))
    // The slider's on/off toggle wording (if any) lives on whichever option carries it; the
    // count card's slider option has no toggle, so this is usually undefined (plain value).
    const toggleLabel = question.options.find((o) => o.sliderToggle)?.sliderToggle?.label
    const answers: DynamicOverridesSummaryAnswer[] = []
    for (const value of resolved) {
      const option = optionById.get(value)
      if (option) {
        // A real option id → show its display label (single-lined), never the raw id.
        answers.push({ label: normalizeOptionLabelText(option.label), isDefault: defaultSet.has(option.id) })
        continue
      }
      // Not an option id → a slider value. Blank/toggle-off values contribute no answer
      // (an off toggle behaves like an unchecked checkbox), rather than printing a placeholder.
      if (value.trim().length === 0 || value === SLIDER_TOGGLE_OFF) continue
      // A slider with an on/off toggle shows the toggle wording + value, e.g. "Yes — 25";
      // a plain count slider shows the numeric value alone.
      answers.push({ label: toggleLabel ? `${toggleLabel} — ${value}` : value, isDefault: defaultSet.has(value) })
    }
    // A question whose selection resolves to nothing contributes nothing.
    if (answers.length === 0) continue
    // The preset stored an answer for this question but some/all of its values are gone.
    // Only flagged when the preset explicitly included this question — questions the user
    // left at their default when saving are not flagged even when showing the default.
    const savedOptions = presetAnswers[question.id]
    const appliedOptions = appliedAnswers[question.id]
    const hasPresetFallback =
      savedOptions !== undefined &&
      (appliedOptions === undefined || savedOptions.some((v) => !appliedOptions.includes(v)))
    // Drop the subtext so the tooltip header matches the card title; keep its markdown verbatim.
    lines.push({ title: normalizeOptionLabelText(splitQuestionPrompt(question.prompt).title), answers, hasPresetFallback })
  }
  return lines
}

/**
 * Intersect a saved answer map against the current note's questions, keeping only
 * question ids present in the note and option ids that still exist. Used on load so
 * a preset applies only its still-valid selections (questions not in the note are
 * left untouched by the caller, which merges this over the live answers).
 */
const intersectAnswers = (
  questions: SummarizableQuestion[],
  answers: AnswerMap,
): AnswerMap => {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const next: AnswerMap = {}
  for (const [questionId, selected] of Object.entries(answers)) {
    const question = byId.get(questionId)
    if (!question) continue
    const sel = Array.isArray(selected) ? selected : []
    // Slider questions store a raw numeric value (or the toggle-off sentinel), not option
    // ids — keep them verbatim rather than dropping them through the option-id filter
    // (which would reset the slider to its default on load).
    if (question.groups.some((group) => group.type === 'slider')) { next[questionId] = sel; continue }
    const valid = new Set(question.options.map((o) => o.id))
    const filtered = sel.filter((id) => valid.has(id))
    // Preserve explicit empty selections (a multi-question turned fully off) so the
    // saved "nothing checked" state survives, mirroring the answer normalizers.
    if (filtered.length === 0 && sel.length > 0) continue
    next[questionId] = filtered
  }
  return next
}

/**
 * Extract the human-readable label from a stored option id. Auto-generated option ids
 * embed the display label between backticks: e.g. "Q_abpiug:`keep 5★ sets`#1" → "keep 5★ sets".
 * Plain values (numeric slider values like "32", sentinels like "off") have no backticks and
 * pass through unchanged.
 */
const extractOptionLabel = (optionId: string): string => {
  // noUncheckedIndexedAccess makes match[1] string | undefined; fallback to optionId covers both.
  const match = optionId.match(/`([^`]+)`/)
  return match?.[1] ?? optionId
}

/** One entry in the unavailable-answers section of the flyout. */
export type DynamicOverridesUnavailableLine = {
  // Human-readable question title captured at save time.
  questionTitle: string
  // Human-readable option labels captured at save time (with extractOptionLabel as fallback).
  answerLabels: string[]
}

/**
 * Collect stored answers whose question id is entirely absent from the note's question list.
 * Only emitted when the preset has saved labels — old presets without them produce an empty array
 * rather than showing opaque auto-generated IDs (like "Q_abpiug") that communicate nothing.
 *
 * Entries with no stored values (spacers, explicitly-nothing-selected checkboxes) are skipped.
 * Questions not found in savedLabels (e.g. spacers that were captured with empty option maps)
 * are also skipped to avoid blank entries.
 */
const buildUnavailableLines = (
  presetAnswers: AnswerMap,
  noteQuestionIds: Set<string>,
  savedLabels: Record<string, DynamicOverridesPresetLabelEntry> | undefined,
): DynamicOverridesUnavailableLine[] => {
  // Without saved labels we cannot show meaningful text — omit the section entirely.
  if (!savedLabels) return []
  const lines: DynamicOverridesUnavailableLine[] = []
  for (const [qId, stored] of Object.entries(presetAnswers)) {
    if (noteQuestionIds.has(qId)) continue
    // SLIDER_TOGGLE_OFF sentinels and explicitly-nothing answers convey no useful information.
    const values = (Array.isArray(stored) ? stored : []).filter((v) => v !== SLIDER_TOGGLE_OFF)
    if (values.length === 0) continue
    // Questions not in savedLabels (spacers, questions whose label capture yielded nothing) are skipped.
    const labelEntry = savedLabels[qId]
    if (!labelEntry) continue
    lines.push({
      questionTitle: labelEntry.title,
      // Prefer the save-time label; fall back to extractOptionLabel for slider numeric values
      // (stored as raw strings, never as option ids) and any gaps in the saved option map.
      answerLabels: values.map((v) => labelEntry.options[v] ?? extractOptionLabel(v)),
    })
  }
  return lines
}

/** Return type of buildDynamicOverridesPresetSummary, including the row-level fallback flag. */
export type DynamicOverridesPresetSummaryResult = {
  lines: DynamicOverridesSummaryLine[]
  // True when at least one answer stored in the preset is unavailable for the current note
  // (question gone or some option IDs removed). Drives the warning icon on the preset row.
  hasAnyFallback: boolean
  // Stored answers for questions entirely absent from the current note. These can't appear
  // in the main table, so the flyout renders them in a separate "not available" section.
  unavailableLines: DynamicOverridesUnavailableLine[]
}

/**
 * Build the full summary lines for a saved dynamic-overrides set against the current
 * note. Recipe lines come first, then safeguard lines. Every question present in the
 * note appears (defaults included, flagged); questions absent from the note do not
 * appear because the resolver only emits the note's own questions.
 *
 * `lang` is threaded to both resolvers so option/question labels render in the active
 * UI language rather than always defaulting to English.
 *
 * Also computes `hasAnyFallback` and `unavailableLines`: the former covers losses
 * including questions entirely absent from the note (which produce no summary lines);
 * the latter lists those absent questions so the flyout can surface them explicitly.
 */
export const buildDynamicOverridesPresetSummary = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers,
  safeguardAnswers: NoteSafeguardOverridesAnswers,
  lang = 'en-US',
  savedLabels?: DynamicOverridesPresetSavedLabels,
): DynamicOverridesPresetSummaryResult => {
  // Resolve questions in the active language so labels/prompts display correctly.
  const { questions: recipeQuestions } = resolveRecipeOverridesTags(note, recipeAnswers, undefined, undefined, lang)
  const { questions: safeguardQuestions } = resolveNoteSafeguardOverridesTags(note, safeguardAnswers, undefined, undefined, lang)
  // Intersect to find which stored answers survive — passed to summarizeQuestions for per-line
  // fallback detection and used directly for the aggregate hasAnyFallback flag.
  const appliedRecipe = intersectAnswers(recipeQuestions, recipeAnswers)
  const appliedSafeguard = intersectAnswers(safeguardQuestions, safeguardAnswers)
  const lines = [
    ...summarizeQuestions(recipeQuestions, recipeAnswers, appliedRecipe),
    ...summarizeQuestions(safeguardQuestions, safeguardAnswers, appliedSafeguard),
  ]
  // Build sets of question ids present in the current note for the unavailable-line filter.
  const noteRecipeIds = new Set(recipeQuestions.map((q) => q.id))
  const noteSafeguardIds = new Set(safeguardQuestions.map((q) => q.id))
  return {
    lines,
    // Check both domains independently so a loss in either (including questions entirely
    // absent from the note, which produce no summary lines) is caught.
    hasAnyFallback: hasFallbackInDomain(recipeAnswers, appliedRecipe)
      || hasFallbackInDomain(safeguardAnswers, appliedSafeguard),
    unavailableLines: [
      ...buildUnavailableLines(recipeAnswers, noteRecipeIds, savedLabels?.recipe),
      ...buildUnavailableLines(safeguardAnswers, noteSafeguardIds, savedLabels?.safeguard),
    ],
  }
}

/**
 * A complete dynamic-overrides selection for saving: every question's fully-resolved
 * answer (defaults included), so the saved set reproduces the same outcome even if the
 * note's defaults later change. Computed through the SAME resolver the app uses, so the
 * values are identical to the live selection — only the persistence scope differs from
 * autosave (which stores the lean, defaults-omitted map).
 */
export type DynamicOverridesFullSelection = {
  recipeAnswers: NoteRecipeOverridesAnswers
  safeguardAnswers: NoteSafeguardOverridesAnswers
}

/** Project resolved questions into a full answer map (every question, resolved answer). */
const projectFullSelection = (questions: SummarizableQuestion[]): AnswerMap => {
  const map: AnswerMap = {}
  for (const question of questions) {
    // Persist the fully-resolved answer verbatim (defaults already merged by the resolver).
    map[question.id] = Array.isArray(question.answer) ? [...question.answer] : []
  }
  return map
}

/** Build a question-id → label entry map for one override domain. */
const buildLabelMap = (questions: SummarizableQuestion[]): Record<string, DynamicOverridesPresetLabelEntry> => {
  const map: Record<string, DynamicOverridesPresetLabelEntry> = {}
  for (const question of questions) {
    // Collect option id → display label; slider questions have empty option labels (fine — their
    // values are stored as raw numeric strings, never looked up as option ids on restore).
    const options: Record<string, string> = {}
    for (const option of question.options) {
      if (option.id) options[option.id] = normalizeOptionLabelText(option.label)
    }
    map[question.id] = {
      title: normalizeOptionLabelText(splitQuestionPrompt(question.prompt).title),
      options,
    }
  }
  return map
}

/**
 * Snapshot the human-readable question titles and option labels for the current note, for saving
 * alongside a preset. Called at save time so the flyout can show meaningful labels if a question
 * later disappears from the note. Labels are captured in the active UI language.
 */
export const snapshotDynamicOverridesLabels = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers,
  safeguardAnswers: NoteSafeguardOverridesAnswers,
  lang = 'en-US',
): DynamicOverridesPresetSavedLabels => {
  const { questions: recipeQuestions } = resolveRecipeOverridesTags(note, recipeAnswers, undefined, undefined, lang)
  const { questions: safeguardQuestions } = resolveNoteSafeguardOverridesTags(note, safeguardAnswers, undefined, undefined, lang)
  return {
    recipe: buildLabelMap(recipeQuestions),
    safeguard: buildLabelMap(safeguardQuestions),
  }
}

/**
 * Snapshot the full resolved selection for the current live answers, for saving a preset.
 * Resolves both domains, then projects every question's resolved `.answer` into the map.
 */
export const snapshotDynamicOverridesFullSelection = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers,
  safeguardAnswers: NoteSafeguardOverridesAnswers,
): DynamicOverridesFullSelection => {
  const { questions: recipeQuestions } = resolveRecipeOverridesTags(note, recipeAnswers)
  const { questions: safeguardQuestions } = resolveNoteSafeguardOverridesTags(note, safeguardAnswers)
  return {
    recipeAnswers: projectFullSelection(recipeQuestions),
    safeguardAnswers: projectFullSelection(safeguardQuestions),
  }
}

/** A saved set's answer maps narrowed to what still applies to the current note. */
export type DynamicOverridesAppliedAnswers = {
  recipeAnswers: NoteRecipeOverridesAnswers
  safeguardAnswers: NoteSafeguardOverridesAnswers
}

/**
 * Narrow a saved set's answer maps to the current note's questions for loading.
 * Caller merges these over the live answers so questions not in the set are left as-is.
 */
export const resolveDynamicOverridesPresetApply = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers,
  safeguardAnswers: NoteSafeguardOverridesAnswers,
): DynamicOverridesAppliedAnswers => {
  const { questions: recipeQuestions } = resolveRecipeOverridesTags(note, recipeAnswers)
  const { questions: safeguardQuestions } = resolveNoteSafeguardOverridesTags(note, safeguardAnswers)
  return {
    recipeAnswers: intersectAnswers(recipeQuestions, recipeAnswers),
    safeguardAnswers: intersectAnswers(safeguardQuestions, safeguardAnswers),
  }
}
