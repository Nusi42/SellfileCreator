/**
 * noteConfigOptions.ts
 *
 * Parses in-note config options markers and resolves tag actions that drive
 * config export-mode overrides.
 */
import type { BuilderConfig, SellfileExportMode } from './hsfBuilder'
import { TAG_TOKEN_REGEX, normalizeTagValue } from './tagHelpers'
import { cloneBuilderConfig } from './multiEditDraft'

// Supported group types in the note markers.
export type NoteQuestionGroupType = 'single' | 'multi'

// Tags are normalized and describe how they affect config export modes.
export type ConfigOptionsTagAction = 'enable' | 'disable' | 'toggle'

export type NoteQuestionTag = {
  value: string
  action: ConfigOptionsTagAction
}

// A single answer option for a question.
export type NoteQuestionOption = {
  id: string
  label: string
  tags: NoteQuestionTag[]
  isDefault: boolean
  token: string
  excludedOptionIds: string[]
  groupType: NoteQuestionGroupType
}

// Group metadata for a single question.
export type NoteQuestionGroup = {
  id: string
  type: NoteQuestionGroupType
  options: NoteQuestionOption[]
}

// Parsed question metadata plus resolved answer.
export type NoteQuestionDefinition = {
  id: string
  index: number
  prompt: string
  groups: NoteQuestionGroup[]
  options: NoteQuestionOption[]
  defaultAnswer: string[]
  answer: string[]
}

// Autosave key for storing config options answers (session-only).
export const NOTE_CONFIG_OPTIONS_ANSWERS_KEY = 'NoteConfigOptionsAnswers'
// Legacy autosave key used by older versions (kept for migrations).
export const LEGACY_NOTE_CONFIG_OPTIONS_ANSWERS_KEY = `Note${'Question'}${'naire'}Answers`

// Stored answers keyed by question ID.
export type NoteConfigOptionsAnswers = Record<string, string[]>

// Resolution result containing questions + tag instructions.
export type ConfigOptionsTagInstructions = Record<string, ConfigOptionsTagAction[]>

export type ConfigOptionsTagResolution = {
  questions: NoteQuestionDefinition[]
  tagInstructions: ConfigOptionsTagInstructions
}

// Config impact summary for Apply Tags flow.
export type ConfigOptionsExportModeResolution = {
  tagInstructions: ConfigOptionsTagInstructions
  modes: SellfileExportMode[]
  overriddenIndices: number[]
}

// Match question markers in note comments.
const QUESTION_MARKER_REGEX = /<!--\s*(?:q|question)\b[\s\S]*?-->/gi
// Identify the leading "q" or "question" header (space tolerant).
const QUESTION_HEADER_REGEX = /^\s*(?:q|question)\b/i
// Leading asterisk marks default answers.
const QUESTION_OPTION_DEFAULT_MARKER = '*'
// Token grammar matches config tag tokens so ids/exclusions stay aligned.
const QUESTION_TOKEN_REGEX = TAG_TOKEN_REGEX

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

// Extract option blocks (single/multi) while respecting quoted labels.
const extractOptionBlocks = (
  input: string,
  startIndex: number,
): Array<{ raw: string; type: NoteQuestionGroupType }> => {
  // Collect raw option contents in source order.
  const blocks: Array<{ raw: string; type: NoteQuestionGroupType }> = []
  let idx = startIndex
  while (idx < input.length) {
    // Find the next opening bracket or paren.
    const openSquare = input.indexOf('[', idx)
    const openParen = input.indexOf('(', idx)
    // Resolve the earliest opening marker.
    const open = (() => {
      if (openSquare < 0 && openParen < 0) return null
      if (openSquare < 0) return { index: openParen, type: 'single' as const, close: ')' }
      if (openParen < 0) return { index: openSquare, type: 'multi' as const, close: ']' }
      return openSquare < openParen
        ? { index: openSquare, type: 'multi' as const, close: ']' }
        : { index: openParen, type: 'single' as const, close: ')' }
    })()
    // Stop when no more option markers exist.
    if (!open) break
    // Track nesting and quoted regions.
    let depth = 0
    let inQuote = false
    let escaped = false
    for (let cursor = open.index; cursor < input.length; cursor += 1) {
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
      // Ignore marker bookkeeping while quoted.
      if (inQuote) continue
      // Increment/decrement depth for the matching marker type.
      if (ch === (open.type === 'multi' ? '[' : '(')) depth += 1
      if (ch === open.close) depth -= 1
      if (depth === 0) {
        // Capture the block without the outer markers.
        blocks.push({ raw: input.slice(open.index + 1, cursor), type: open.type })
        idx = cursor + 1
        break
      }
    }
    // Abort the scan if the markers were unbalanced.
    if (depth !== 0) {
      idx = input.length
    }
  }
  // Return the raw option blocks for parsing.
  return blocks
}

// Normalize tag-style tokens for id/exclusion usage.
const normalizeQuestionToken = (raw: string): string | null => {
  // Trim whitespace before validation.
  const trimmed = raw.trim()
  // Ignore empty tokens.
  if (!trimmed) return null
  // Reject tokens containing disallowed characters.
  if (!QUESTION_TOKEN_REGEX.test(trimmed)) return null
  // Normalize digit tokens to avoid leading zeros.
  if (/^\d+$/.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10)
    return Number.isFinite(value) ? String(value) : null
  }
  // Normalize case to keep matching stable.
  return trimmed.toLowerCase()
}

type ParsedQuestionOption = {
  id: string
  label: string
  tags: NoteQuestionTag[]
  isDefault: boolean
  explicitToken: string | null
  excludedTokens: string[]
  groupType: NoteQuestionGroupType
}

// Parse a single option block into label + tags.
const parseOptionBlock = (
  raw: string,
  optionIndex: number,
  groupType: NoteQuestionGroupType,
): ParsedQuestionOption | null => {
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
  // Track the first explicit id token and exclusion tokens.
  let explicitToken: string | null = null
  const excludedTokens: string[] = []
  // Parse any remaining tokens as tag actions or metadata.
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
    // Handle explicit id tokens (id=token).
    const lower = token.toLowerCase()
    if (lower.startsWith('id=')) {
      if (explicitToken) continue
      const candidate = normalizeQuestionToken(token.slice(3))
      if (!candidate) continue
      explicitToken = candidate
      continue
    }
    // Handle exclusion tokens (!token).
    if (token.startsWith('!')) {
      const candidate = normalizeQuestionToken(token.slice(1))
      if (!candidate) continue
      excludedTokens.push(candidate)
      continue
    }
    // Prefix-based tokens mark enable/disable; bare tokens toggle.
    const action: ConfigOptionsTagAction = token.startsWith('+')
      ? 'enable'
      : (token.startsWith('-') ? 'disable' : 'toggle')
    const rawValue = (action === 'toggle') ? token : token.slice(1)
    // Reject tags that contain disallowed characters.
    if (!QUESTION_TOKEN_REGEX.test(rawValue)) continue
    const normalized = normalizeTagValue(rawValue)
    if (!normalized) continue
    tagTokens.push({ value: normalized, action })
  }
  // Build a stable ID for the option.
  const baseLabel = normalizeQuestionText(label).toLowerCase()
  const id = baseLabel ? `${baseLabel}#${optionIndex}` : `option-${optionIndex}`
  return {
    id,
    label,
    tags: tagTokens,
    isDefault,
    explicitToken,
    excludedTokens,
    groupType,
  }
}

// Apply exclusions so mutually exclusive options cannot co-exist.
export const applyQuestionExclusions = (
  selection: string[],
  options: NoteQuestionOption[],
  preferredId?: string,
): string[] => {
  // Use a working set so deletes are cheap.
  const next = new Set(selection)
  // Build a quick lookup for exclusion lists.
  const exclusions = new Map<string, Set<string>>()
  options.forEach((option) => {
    exclusions.set(option.id, new Set(option.excludedOptionIds))
  })
  // Ensure the preferred option wins over exclusions.
  if (preferredId && next.has(preferredId)) {
    const blocked = exclusions.get(preferredId) ?? new Set()
    blocked.forEach((id) => next.delete(id))
  }
  // Apply exclusions in option order for stable conflict resolution.
  options.forEach((option) => {
    if (!next.has(option.id)) return
    const blocked = exclusions.get(option.id)
    if (!blocked) return
    blocked.forEach((id) => {
      if (id === preferredId) return
      next.delete(id)
    })
  })
  // Preserve the original option ordering.
  return options.filter((option) => next.has(option.id)).map((option) => option.id)
}

// Resolve which option IDs are selected for a question.
const resolveQuestionAnswer = (
  question: Pick<NoteQuestionDefinition, 'groups' | 'options' | 'defaultAnswer'>,
  stored: string[] | undefined,
): string[] => {
  // Only allow answers that still exist in the question definition.
  const allowed = new Set(question.options.map((opt) => opt.id))
  // Track whether the caller stored an explicit answer payload.
  const hasStored = Array.isArray(stored)
  // Filter to valid option IDs while preserving stored order.
  const filtered = hasStored
    ? stored.filter((id) => allowed.has(id))
    : []
  // Build the answer group-by-group to honor defaults.
  const next: string[] = []
  question.groups.forEach((group) => {
    // Collect stored answers for this group.
    const storedForGroup = filtered.filter((id) => group.options.some((opt) => opt.id === id))
    if (group.type === 'single') {
      // Single-select always collapses to one answer or default.
      if (storedForGroup.length > 0) {
        next.push(storedForGroup[0]!)
        return
      }
      const defaultId = question.defaultAnswer.find((id) => group.options.some((opt) => opt.id === id))
      if (defaultId) next.push(defaultId)
      return
    }
    // Multi-select keeps explicit empty selections when answers were stored.
    if (storedForGroup.length > 0) {
      next.push(...storedForGroup)
      return
    }
    // An explicit stored array suppresses defaults for this group.
    if (hasStored) return
    // Fall back to defaults when no stored answers exist.
    question.defaultAnswer
      .filter((id) => group.options.some((opt) => opt.id === id))
      .forEach((id) => next.push(id))
  })
  // Enforce any exclusion rules before returning.
  return applyQuestionExclusions(next, question.options)
}

// Build a stable ID per question from its prompt and option labels.
const buildQuestionId = (prompt: string, options: NoteQuestionOption[]): string => {
  // Normalize text so spacing tweaks keep IDs stable.
  const key = {
    prompt: normalizeQuestionText(prompt),
    options: options.map((opt) => ({
      label: normalizeQuestionText(opt.label),
      group: opt.groupType,
    })),
  }
  // Hash the normalized payload to keep IDs compact.
  return `q_${hashString(JSON.stringify(key))}`
}

// Parse config options markers from note text.
export const parseNoteConfigOptions = (
  note: string,
  answers?: NoteConfigOptionsAnswers | null,
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
    const parsedOptions: ParsedQuestionOption[] = []
    blocks.forEach((block) => {
      const parsed = parseOptionBlock(block.raw, parsedOptions.length, block.type)
      if (parsed) parsedOptions.push(parsed)
    })
    // Skip malformed questions that lack options.
    if (parsedOptions.length === 0) {
      markerIndex += 1
      continue
    }
    // Resolve tokens for exclusions across the full question.
    const tokenToId = new Map<string, string>()
    parsedOptions.forEach((option, idx) => {
      // Resolve the token to either the explicit id or the option index.
      const implicitToken = normalizeQuestionToken(String(idx + 1))
      const token = option.explicitToken ?? implicitToken ?? ''
      if (!token) return
      // Preserve the first occurrence of each token.
      if (!tokenToId.has(token)) tokenToId.set(token, option.id)
    })
    // Materialize the options with resolved tokens and exclusions.
    const options: NoteQuestionOption[] = []
    const groupMap = new Map<NoteQuestionGroupType, NoteQuestionGroup>()
    const groupOrder: NoteQuestionGroup[] = []
    parsedOptions.forEach((option, idx) => {
      // Resolve the final token for this option.
      const implicitToken = normalizeQuestionToken(String(idx + 1))
      const token = option.explicitToken ?? implicitToken ?? ''
      // Map exclusion tokens to option ids.
      const excludedOptionIds = option.excludedTokens
        .map((tokenValue) => tokenToId.get(tokenValue))
        .filter((id): id is string => Boolean(id))
      const resolved: NoteQuestionOption = {
        id: option.id,
        label: option.label,
        tags: option.tags,
        isDefault: option.isDefault,
        token,
        excludedOptionIds,
        groupType: option.groupType,
      }
      options.push(resolved)
      // Create or extend the group bucket in first-seen order.
      let group = groupMap.get(option.groupType)
      if (!group) {
        group = { id: option.groupType, type: option.groupType, options: [] }
        groupMap.set(option.groupType, group)
        groupOrder.push(group)
      }
      group.options.push(resolved)
    })
    // Resolve default selections from asterisks per group.
    const defaultAnswer: string[] = []
    groupOrder.forEach((group) => {
      if (group.type === 'single') {
        const firstDefault = group.options.find((opt) => opt.isDefault)
        if (firstDefault) defaultAnswer.push(firstDefault.id)
        return
      }
      group.options.forEach((opt) => {
        if (opt.isDefault) defaultAnswer.push(opt.id)
      })
    })
    // Create a stable ID for answer storage.
    const id = buildQuestionId(prompt, options)
    // Apply stored answers when available.
    const storedAnswer = answers ? answers[id] : undefined
    const answer = resolveQuestionAnswer({ groups: groupOrder, options, defaultAnswer }, storedAnswer)
    // Emit the parsed definition.
    result.push({
      id,
      index: markerIndex,
      prompt,
      groups: groupOrder,
      options,
      defaultAnswer,
      answer,
    })
    markerIndex += 1
  }
  // Preserve marker order as parsed.
  return result
}

// Build a stable signature for the config options section of a note.
export const buildNoteConfigOptionsSignature = (note: string): string => {
  // Parse the questions using the same parser as the UI.
  const questions = parseNoteConfigOptions(note)
  // Preserve marker order so reordering questions counts as a change.
  const ids = questions.map((question) => question.id)
  // Serialize the ids so comparisons are cheap and stable.
  return JSON.stringify(ids)
}

// Remove answers that no longer match the current note content.
export const pruneNoteConfigOptionsAnswers = (
  note: string,
  answers: NoteConfigOptionsAnswers,
): NoteConfigOptionsAnswers => {
  // Build a pruned output map.
  const next: NoteConfigOptionsAnswers = {}
  // Parse the current questions as the source of truth.
  const questions = parseNoteConfigOptions(note)
  // Precompute allowed option IDs per question.
  const lookup = new Map<string, { hasMulti: boolean; options: Set<string>; groups: NoteQuestionGroup[] }>()
  questions.forEach((question) => {
    lookup.set(question.id, {
      hasMulti: question.groups.some((group) => group.type === 'multi'),
      options: new Set(question.options.map((opt) => opt.id)),
      groups: question.groups,
    })
  })
  // Filter out answers that are no longer valid.
  for (const [questionId, selected] of Object.entries(answers)) {
    const entry = lookup.get(questionId)
    if (!entry) continue
    // Normalize stored answers to an array to avoid nulls.
    const rawSelected = Array.isArray(selected) ? selected : []
    // Drop answers that no longer map to valid options.
    const filtered = rawSelected.filter((id) => entry.options.has(id))
    if (filtered.length === 0) {
      // Preserve explicit empty selections for questions with multi groups only.
      if (entry.hasMulti && rawSelected.length === 0) {
        next[questionId] = []
      }
      continue
    }
    // Resolve single-group defaults by trimming to one per single group.
    const nextSelection: string[] = []
    entry.groups.forEach((group) => {
      const allowed = new Set(group.options.map((opt) => opt.id))
      const selected = filtered.filter((id) => allowed.has(id))
      if (group.type === 'single') {
        if (selected.length > 0) nextSelection.push(selected[0]!)
        return
      }
      nextSelection.push(...selected)
    })
    next[questionId] = nextSelection
  }
  // Return the filtered answer map.
  return next
}

// Normalize an autosave payload into a valid answers map.
export const normalizeNoteConfigOptionsAnswers = (
  raw: unknown,
): NoteConfigOptionsAnswers | null => {
  // Reject null or non-object payloads.
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const next: NoteConfigOptionsAnswers = {}
  for (const [key, value] of Object.entries(rec)) {
    // Accept a string or string[] and drop empties.
    const isArrayValue = Array.isArray(value)
    // Filter empty entries but keep order for valid selections.
    const list = isArrayValue
      ? value.map(String).filter((entry) => entry.trim().length > 0)
      : (typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [])
    // Preserve empty arrays so explicit "no answers" survives restore.
    const keepEmptyArray = isArrayValue && value.length === 0
    if (list.length === 0 && !keepEmptyArray) continue
    // Preserve the raw question ID key.
    next[key] = list
  }
  // Return null if no valid answers remain.
  return Object.keys(next).length > 0 ? next : null
}

// Resolve tag instructions based on the current config options answers.
export const resolveConfigOptionsTags = (
  note: string,
  answers?: NoteConfigOptionsAnswers | null,
): ConfigOptionsTagResolution => {
  // Parse the questions with answer resolution.
  const questions = parseNoteConfigOptions(note, answers)
  // Track tag instructions in the order answers are encountered.
  const tagInstructions: ConfigOptionsTagInstructions = Object.create(null) as ConfigOptionsTagInstructions
  for (const question of questions) {
    // Only apply tags for selected options.
    const selected = new Set(question.answer)
    for (const option of question.options) {
      if (!selected.has(option.id)) continue
      for (const tag of option.tags) {
        // Append the tag action so config-order evaluation stays deterministic.
        const bucket = tagInstructions[tag.value] ?? []
        bucket.push(tag.action)
        tagInstructions[tag.value] = bucket
      }
    }
  }
  // Return the resolved tags and question list.
  return { questions, tagInstructions }
}

// Resolve a config's export mode based on config options tag instructions.
const resolveConfigOptionsExportModeWithInstructions = (
  cfg: BuilderConfig,
  tagInstructions: ConfigOptionsTagInstructions,
): SellfileExportMode => {
  // Separators should never be overridden by tags.
  if (cfg.exportMode === 'separator') return 'separator'
  // Untagged configs keep their explicit mode.
  const tags = Array.isArray(cfg.tags) ? cfg.tags : []
  if (tags.length === 0) return cfg.exportMode
  // Start from the stored export mode before applying tag actions.
  let nextMode: SellfileExportMode = cfg.exportMode
  let hasInstruction = false
  for (const tag of tags) {
    // Normalize the config tags to the same tokens used in answers.
    const normalized = normalizeTagValue(String(tag))
    if (!normalized) continue
    const actions = tagInstructions[normalized]
    if (!actions || actions.length === 0) continue
    hasInstruction = true
    for (const action of actions) {
      // Apply each action in config tag order for deterministic overrides.
      if (action === 'enable') nextMode = 'active'
      else if (action === 'disable') nextMode = 'disabled'
      else nextMode = nextMode === 'active' ? 'disabled' : 'active'
    }
  }
  // Leave the stored mode untouched when no tag actions apply.
  return hasInstruction ? nextMode : cfg.exportMode
}

// Resolve a config's export mode with a raw tag list.
export const resolveConfigOptionsExportMode = (
  cfg: BuilderConfig,
  tagInstructions: ConfigOptionsTagInstructions,
): SellfileExportMode => {
  return resolveConfigOptionsExportModeWithInstructions(cfg, tagInstructions)
}

// Build a per-config export-mode snapshot for config options overrides.
export const buildConfigOptionsExportModeResolution = (
  configs: readonly BuilderConfig[],
  tagInstructions: ConfigOptionsTagInstructions,
): ConfigOptionsExportModeResolution => {
  // Track effective modes and which configs are overridden.
  const modes: SellfileExportMode[] = []
  const overriddenIndices: number[] = []
  configs.forEach((cfg, idx) => {
    // Resolve the effective export mode for this config.
    const nextMode = resolveConfigOptionsExportModeWithInstructions(cfg, tagInstructions)
    modes.push(nextMode)
    // Record overrides for UI indicators.
    if (nextMode !== cfg.exportMode) {
      overriddenIndices.push(idx)
    }
  })
  // Return the tag instructions plus the computed modes.
  return { tagInstructions, modes, overriddenIndices }
}

// Apply config options overrides by cloning only the configs that change mode.
export const applyConfigOptionsExportModeOverrides = (
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
