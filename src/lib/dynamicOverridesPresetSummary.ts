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
 * over that shape covers both rather than forking the logic. Slider questions
 * (empty option labels, numeric answers) surface their selected numeric value.
 */
import {
  resolveRecipeOverridesTags,
  splitQuestionPrompt,
  normalizeOptionLabelText,
  type NoteRecipeOverridesAnswers,
} from './noteRecipeOverrides'
import { resolveNoteSafeguardOverridesTags, type NoteSafeguardOverridesAnswers } from './noteSafeguardOverrides'

/**
 * The minimal question shape both override domains satisfy. `groups` lets us spot
 * slider questions (whose answer is a numeric value, not an option id); `answer`
 * is the fully-resolved current selection (defaults already merged in by the resolver);
 * `defaultAnswer` lets us mark which of those answers are just the note's default.
 */
type SummarizableQuestion = {
  id: string
  prompt: string
  options: { id: string; label: string }[]
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
}

/**
 * Turn the fully-resolved questions into summary lines. Iterates over the QUESTIONS
 * (not the lean stored map) so questions left at their default still appear — the
 * resolver has already merged defaults into each `.answer`. Each answer is flagged
 * `isDefault` by comparing against the question's `defaultAnswer`. A question whose
 * resolved selection is empty (e.g. an unchecked multi with no default) contributes
 * no line. Title/label text is the display text (never internal ids), markdown verbatim.
 */
const summarizeQuestions = (
  questions: SummarizableQuestion[],
): DynamicOverridesSummaryLine[] => {
  const lines: DynamicOverridesSummaryLine[] = []
  for (const question of questions) {
    const resolved = Array.isArray(question.answer) ? question.answer : []
    const defaultSet = new Set(question.defaultAnswer)
    // Slider questions carry empty option labels; their answer is a numeric value string.
    const isSlider = question.groups.some((group) => group.type === 'slider')
    let answers: DynamicOverridesSummaryAnswer[]
    if (isSlider) {
      // Show the numeric value(s) verbatim; a slider value equal to its default reads as default.
      answers = resolved
        .filter((value) => value.trim().length > 0)
        .map((value) => ({ label: value, isDefault: defaultSet.has(value) }))
    } else {
      const optionById = new Map(question.options.map((o) => [o.id, o]))
      // Resolve each option id to its label (single-lined), dropping ids that no longer exist.
      answers = resolved
        .map((id) => optionById.get(id))
        .filter((option): option is SummarizableQuestion['options'][number] => option != null)
        .map((option) => ({ label: normalizeOptionLabelText(option.label), isDefault: defaultSet.has(option.id) }))
    }
    // A question whose selection resolves to nothing contributes nothing.
    if (answers.length === 0) continue
    // Drop the subtext so the tooltip header matches the card title; keep its markdown verbatim.
    lines.push({ title: normalizeOptionLabelText(splitQuestionPrompt(question.prompt).title), answers })
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
    const valid = new Set(question.options.map((o) => o.id))
    const filtered = (Array.isArray(selected) ? selected : []).filter((id) => valid.has(id))
    // Preserve explicit empty selections (a multi-question turned fully off) so the
    // saved "nothing checked" state survives, mirroring the answer normalizers.
    if (filtered.length === 0 && (!Array.isArray(selected) || selected.length > 0)) continue
    next[questionId] = filtered
  }
  return next
}

/**
 * Build the full summary lines for a saved dynamic-overrides set against the current
 * note. Recipe lines come first, then safeguard lines. Every question present in the
 * note appears (defaults included, flagged); questions absent from the note do not
 * appear because the resolver only emits the note's own questions.
 */
export const buildDynamicOverridesPresetSummary = (
  note: string,
  recipeAnswers: NoteRecipeOverridesAnswers,
  safeguardAnswers: NoteSafeguardOverridesAnswers,
): DynamicOverridesSummaryLine[] => {
  // Resolve questions for both domains using the SAVED answers so each `.answer` reflects the set.
  const { questions: recipeQuestions } = resolveRecipeOverridesTags(note, recipeAnswers)
  const { questions: safeguardQuestions } = resolveNoteSafeguardOverridesTags(note, safeguardAnswers)
  return [
    ...summarizeQuestions(recipeQuestions),
    ...summarizeQuestions(safeguardQuestions),
  ]
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
