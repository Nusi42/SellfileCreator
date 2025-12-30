/**
 * noteQuestionnaire.ts
 *
 * Parses in-note questionnaire markers and resolves the active tag set that
 * drives config enable/disable behavior.
 */
import type { BuilderConfig, SellfileExportMode } from './hsfBuilder'
import { normalizeTagValue } from './tagHelpers'
import { cloneBuilderConfig } from './multiEditDraft'

// Supported question types in the note markers.
export type NoteQuestionType = 'single' | 'multi'

// Tags are normalized and may indicate removal.
export type NoteQuestionTag = {
  value: string
  remove: boolean
}

// A single answer option for a question.
export type NoteQuestionOption = {
  id: string
  label: string
  tags: NoteQuestionTag[]
  isDefault: boolean
}

// Parsed question metadata plus resolved answer.
export type NoteQuestionDefinition = {
  id: string
  index: number
  type: NoteQuestionType
  prompt: string
  options: NoteQuestionOption[]
  defaultAnswer: string[]
  answer: string[]
}

// Stored answers keyed by question ID.
export type NoteQuestionnaireAnswers = Record<string, string[]>

// Resolution result containing questions + active tags.
export type QuestionnaireTagResolution = {
  questions: NoteQuestionDefinition[]
  activeTags: string[]
}

// Config impact summary for Apply Tags flow.
export type QuestionnaireExportModeResolution = {
  activeTags: string[]
  modes: SellfileExportMode[]
  overriddenIndices: number[]
}

// Match question markers in note comments (allowing spaces around the colon).
const QUESTION_MARKER_REGEX = /<!--\s*q\s*:\s*(single|multi)[\s\S]*?-->/gi
// Identify the leading "q:single" or "q:multi" header (space tolerant).
const QUESTION_HEADER_REGEX = /^\s*q\s*:\s*(single|multi)\b/i
// Leading asterisk marks default answers.
const QUESTION_OPTION_DEFAULT_MARKER = '*'

// Extract the inner text from an HTML comment.
const stripCommentWrapper = (raw: string): string => (
  raw.trim().replace(/^<!--\s*/, '').replace(/\s*-->$/, '')
)

// Collapse whitespace to keep IDs stable across formatting tweaks.
const normalizeQuestionText = (value: string): string => (
  value.trim().replace(/\s+/g, ' ')
)

// Lightweight hash to keep question IDs short but stable.
const hashString = (value: string): string => {
  // DJB2 hash to keep the output deterministic.
  let hash = 5381
  for (let idx = 0; idx < value.length; idx += 1) {
    // Mix the next character in the buffer.
    hash = ((hash << 5) + hash) + value.charCodeAt(idx)
    // Force 32-bit integer math for consistency.
    hash |= 0
  }
  // Return a base36 token to keep the ID readable.
  return Math.abs(hash).toString(36)
}

// Parse a quoted string with basic escape support (\", \\n, \\t, \\r).
const readQuotedString = (input: string, startIndex: number): { value: string; nextIndex: number } | null => {
  // Skip leading whitespace to find the opening quote.
  let idx = startIndex
  while (idx < input.length && /\s/.test(input.charAt(idx))) idx += 1
  // Require a quote to start parsing.
  if (input.charAt(idx) !== '"') return null
  idx += 1
  // Accumulate the decoded label content.
  let result = ''
  while (idx < input.length) {
    const ch = input.charAt(idx)
    // Closing quote ends the label.
    if (ch === '"') {
      return { value: result, nextIndex: idx + 1 }
    }
    // Map basic escape sequences to their literal value.
    if (ch === '\\\\') {
      const next = input.charAt(idx + 1)
      if (next === 'n') result += '\n'
      else if (next === 't') result += '\t'
      else if (next === 'r') result += '\r'
      else if (next) result += next
      idx += 2
      continue
    }
    // Add literal characters as-is.
    result += ch
    idx += 1
  }
  // Unterminated strings are treated as invalid.
  return null
}

// Extract bracketed option blocks while respecting quoted labels.
const extractOptionBlocks = (input: string, startIndex: number): string[] => {
  // Collect raw option contents in source order.
  const blocks: string[] = []
  let idx = startIndex
  while (idx < input.length) {
    // Find the next opening bracket.
    const open = input.indexOf('[', idx)
    if (open < 0) break
    // Track nested brackets and quoted regions.
    let depth = 0
    let inQuote = false
    let escaped = false
    for (let cursor = open; cursor < input.length; cursor += 1) {
      const ch = input.charAt(cursor)
      // Consume escaped characters inside quotes.
      if (escaped) {
        escaped = false
        continue
      }
      // Toggle escape state for the next character.
      if (ch === '\\\\') {
        escaped = true
        continue
      }
      // Track quotes so brackets inside labels are ignored.
      if (ch === '"') {
        inQuote = !inQuote
        continue
      }
      // Ignore any bracket bookkeeping while quoted.
      if (inQuote) continue
      // Increment/decrement bracket depth.
      if (ch === '[') depth += 1
      if (ch === ']') depth -= 1
      if (depth === 0) {
        // Capture the block without the outer brackets.
        blocks.push(input.slice(open + 1, cursor))
        idx = cursor + 1
        break
      }
    }
    // Abort the scan if the brackets were unbalanced.
    if (depth !== 0) {
      idx = input.length
    }
  }
  // Return the raw option blocks for parsing.
  return blocks
}

// Parse a single option block into label + tags.
const parseOptionBlock = (raw: string, optionIndex: number): NoteQuestionOption | null => {
  // Skip leading whitespace inside the brackets.
  let idx = 0
  while (idx < raw.length && /\s/.test(raw.charAt(idx))) idx += 1
  // Detect optional default marker.
  let isDefault = false
  if (raw.charAt(idx) === QUESTION_OPTION_DEFAULT_MARKER) {
    isDefault = true
    idx += 1
  }
  // Parse the required quoted label.
  const labelParsed = readQuotedString(raw, idx)
  if (!labelParsed) return null
  idx = labelParsed.nextIndex
  const label = labelParsed.value
  // Parse any remaining tokens as tags.
  const tagTokens: NoteQuestionTag[] = []
  while (idx < raw.length) {
    const ch = raw.charAt(idx)
    if (ch === ',') {
      idx += 1
      continue
    }
    if (/\s/.test(ch)) {
      idx += 1
      continue
    }
    let end = idx
    while (end < raw.length && raw.charAt(end) !== ',') end += 1
    const token = raw.slice(idx, end).trim()
    idx = end
    if (!token) continue
    // Leading '-' removes tags from previous answers.
    const remove = token.startsWith('-')
    const rawValue = remove ? token.slice(1) : token
    const normalized = normalizeTagValue(rawValue)
    if (!normalized) continue
    tagTokens.push({ value: normalized, remove })
  }
  // Build a stable ID for the option.
  const baseLabel = normalizeQuestionText(label).toLowerCase()
  const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
  return {
    id,
    label,
    tags: tagTokens,
    isDefault,
  }
}

// Resolve which option IDs are selected for a question.
const resolveQuestionAnswer = (
  question: Pick<NoteQuestionDefinition, 'type' | 'options' | 'defaultAnswer'>,
  stored: string[] | undefined,
): string[] => {
  // Only allow answers that still exist in the question definition.
  const allowed = new Set(question.options.map((opt) => opt.id))
  const filtered = Array.isArray(stored)
    ? stored.filter((id) => allowed.has(id))
    : []
  // Single-select always collapses to one answer.
  if (question.type === 'single') {
    if (filtered.length > 0) return [filtered[0]!]
    return question.defaultAnswer.length > 0 ? [question.defaultAnswer[0]!] : []
  }
  // Multi-select returns all valid answers or defaults.
  if (filtered.length > 0) return filtered
  return question.defaultAnswer.slice()
}

// Build a stable ID per question from its prompt and option labels.
const buildQuestionId = (type: NoteQuestionType, prompt: string, options: NoteQuestionOption[]): string => {
  // Normalize text so spacing tweaks keep IDs stable.
  const key = {
    type,
    prompt: normalizeQuestionText(prompt),
    options: options.map((opt) => normalizeQuestionText(opt.label)),
  }
  // Hash the normalized payload to keep IDs compact.
  return `q_${hashString(JSON.stringify(key))}`
}

// Parse questionnaire markers from note text.
export const parseNoteQuestionnaire = (
  note: string,
  answers?: NoteQuestionnaireAnswers | null,
): NoteQuestionDefinition[] => {
  // Short-circuit when no note is present.
  if (!note) return []
  // Collect question definitions in order.
  const result: NoteQuestionDefinition[] = []
  // Reset regex state to avoid cross-call leakage.
  QUESTION_MARKER_REGEX.lastIndex = 0
  // Track the marker index for stable mapping.
  let markerIndex = 0
  for (const match of note.matchAll(QUESTION_MARKER_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    // Strip the HTML comment wrapper to parse the payload.
    const inner = stripCommentWrapper(raw)
    const headerMatch = QUESTION_HEADER_REGEX.exec(inner)
    if (!headerMatch) {
      markerIndex += 1
      continue
    }
    // Normalize the question type.
    const type = (headerMatch[1] ?? '').toLowerCase() === 'multi' ? 'multi' : 'single'
    // Parse the prompt that follows the header.
    const promptStart = inner.indexOf(headerMatch[0]) + headerMatch[0].length
    const promptParsed = readQuotedString(inner, promptStart)
    if (!promptParsed) {
      markerIndex += 1
      continue
    }
    const prompt = promptParsed.value
    // Parse option blocks that follow the prompt.
    const blocks = extractOptionBlocks(inner, promptParsed.nextIndex)
    const options: NoteQuestionOption[] = []
    blocks.forEach((block, idx) => {
      const parsed = parseOptionBlock(block, idx)
      if (parsed) options.push(parsed)
    })
    // Skip malformed questions that lack options.
    if (options.length === 0) {
      markerIndex += 1
      continue
    }
    // Resolve default selections from asterisks.
    const defaultIds = options.filter((opt) => opt.isDefault).map((opt) => opt.id)
    const defaultAnswer = type === 'single'
      ? (defaultIds.length > 0 ? [defaultIds[0]!] : [])
      : defaultIds.slice()
    // Create a stable ID for answer storage.
    const id = buildQuestionId(type, prompt, options)
    // Apply stored answers when available.
    const storedAnswer = answers ? answers[id] : undefined
    const answer = resolveQuestionAnswer({ type, options, defaultAnswer }, storedAnswer)
    // Emit the parsed definition.
    result.push({
      id,
      index: markerIndex,
      type,
      prompt,
      options,
      defaultAnswer,
      answer,
    })
    markerIndex += 1
  }
  // Preserve marker order as parsed.
  return result
}

// Build a stable signature for the questionnaire section of a note.
export const buildNoteQuestionnaireSignature = (note: string): string => {
  // Parse the questions using the same parser as the UI.
  const questions = parseNoteQuestionnaire(note)
  // Preserve marker order so reordering questions counts as a change.
  const ids = questions.map((question) => question.id)
  // Serialize the ids so comparisons are cheap and stable.
  return JSON.stringify(ids)
}

// Remove answers that no longer match the current note content.
export const pruneNoteQuestionnaireAnswers = (
  note: string,
  answers: NoteQuestionnaireAnswers,
): NoteQuestionnaireAnswers => {
  // Build a pruned output map.
  const next: NoteQuestionnaireAnswers = {}
  // Parse the current questions as the source of truth.
  const questions = parseNoteQuestionnaire(note)
  // Precompute allowed option IDs per question.
  const lookup = new Map<string, { type: NoteQuestionType; options: Set<string> }>()
  questions.forEach((question) => {
    lookup.set(question.id, {
      type: question.type,
      options: new Set(question.options.map((opt) => opt.id)),
    })
  })
  // Filter out answers that are no longer valid.
  for (const [questionId, selected] of Object.entries(answers)) {
    const entry = lookup.get(questionId)
    if (!entry) continue
    const filtered = (selected ?? []).filter((id) => entry.options.has(id))
    if (filtered.length === 0) continue
    // Single-select keeps only one answer.
    next[questionId] = entry.type === 'single' ? [filtered[0]!] : filtered
  }
  // Return the filtered answer map.
  return next
}

// Normalize an autosave payload into a valid answers map.
export const normalizeNoteQuestionnaireAnswers = (
  raw: unknown,
): NoteQuestionnaireAnswers | null => {
  // Reject null or non-object payloads.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const next: NoteQuestionnaireAnswers = {}
  for (const [key, value] of Object.entries(rec)) {
    // Accept a string or string[] and drop empties.
    const list = Array.isArray(value)
      ? value.map(String).filter((entry) => entry.trim().length > 0)
      : (typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [])
    if (list.length === 0) continue
    // Preserve the raw question ID key.
    next[key] = list
  }
  // Return null if no valid answers remain.
  return Object.keys(next).length > 0 ? next : null
}

// Resolve the active tag set based on the current questionnaire answers.
export const resolveQuestionnaireTags = (
  note: string,
  answers?: NoteQuestionnaireAnswers | null,
): QuestionnaireTagResolution => {
  // Parse the questions with answer resolution.
  const questions = parseNoteQuestionnaire(note, answers)
  // Track active tags as we walk questions.
  const active = new Set<string>()
  for (const question of questions) {
    // Only apply tags for selected options.
    const selected = new Set(question.answer)
    for (const option of question.options) {
      if (!selected.has(option.id)) continue
      for (const tag of option.tags) {
        // Support removal tags for override behavior.
        if (tag.remove) active.delete(tag.value)
        else active.add(tag.value)
      }
    }
  }
  // Return the resolved tags and question list.
  return { questions, activeTags: Array.from(active) }
}

// Resolve a config's export mode based on questionnaire tags.
const resolveQuestionnaireExportModeWithSet = (
  cfg: BuilderConfig,
  active: Set<string>,
): SellfileExportMode => {
  // Separators should never be overridden by tags.
  if (cfg.exportMode === 'separator') return 'separator'
  // Untagged configs keep their explicit mode.
  const tags = Array.isArray(cfg.tags) ? cfg.tags : []
  if (tags.length === 0) return cfg.exportMode
  // Enable when any config tag is present in the active set.
  const shouldEnable = tags.some((tag) => active.has(String(tag)))
  return shouldEnable ? 'active' : 'disabled'
}

// Resolve a config's export mode with a raw tag list.
export const resolveQuestionnaireExportMode = (
  cfg: BuilderConfig,
  activeTags: readonly string[],
): SellfileExportMode => {
  // Normalize active tags once so lookups are stable.
  const active = new Set(activeTags.map(String))
  return resolveQuestionnaireExportModeWithSet(cfg, active)
}

// Build a per-config export-mode snapshot for questionnaire overrides.
export const buildQuestionnaireExportModeResolution = (
  configs: readonly BuilderConfig[],
  activeTags: readonly string[],
): QuestionnaireExportModeResolution => {
  // Normalize tags once for the full config list.
  const active = new Set(activeTags.map(String))
  // Track effective modes and which configs are overridden.
  const modes: SellfileExportMode[] = []
  const overriddenIndices: number[] = []
  configs.forEach((cfg, idx) => {
    // Resolve the effective export mode for this config.
    const nextMode = resolveQuestionnaireExportModeWithSet(cfg, active)
    modes.push(nextMode)
    // Record overrides for UI indicators.
    if (nextMode !== cfg.exportMode) {
      overriddenIndices.push(idx)
    }
  })
  // Return the active tag list plus the computed modes.
  return { activeTags: Array.from(active), modes, overriddenIndices }
}

// Apply questionnaire overrides by cloning only the configs that change mode.
export const applyQuestionnaireExportModeOverrides = (
  configs: readonly BuilderConfig[],
  modes: readonly SellfileExportMode[],
): BuilderConfig[] => {
  // Track whether any override actually changed the list.
  let mutated = false
  const next = configs.map((cfg, idx) => {
    // Fall back to the config's mode if a slot is missing.
    const nextMode = modes[idx] ?? cfg.exportMode
    // Reuse the config reference when no override applies.
    if (nextMode === cfg.exportMode) return cfg
    // Clone to avoid mutating the stored config array.
    const clone = cloneBuilderConfig(cfg)
    clone.exportMode = nextMode
    mutated = true
    return clone
  })
  // Return the original array if nothing changed.
  return mutated ? next : configs.slice()
}
