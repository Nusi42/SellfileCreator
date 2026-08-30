/**
 * noteSetIconToken.ts
 *
 * SSOT for the note's `{set:Name}` inline gear-set icon token.
 *
 * The note has two independent render paths — the question prompt/label tokenizer
 * (`buildQuestionPromptTokens` in NoteDialog) and the sanitized markdown pipeline used
 * for the surrounding prose. Both must recognise the same spelling and resolve names the
 * same way, so the syntax and the name→id resolution live here rather than in either
 * renderer. The token is authored `{set:Speed}` / `{set:Swift Parry}` (case-insensitive,
 * surrounding whitespace tolerated) and renders as the set's icon followed by its name.
 *
 * Deliberately mirrors the `{buff:…}` / `{debuff:…}` convention already used by
 * setDescriptions + SetTooltip so authors meet one bracket-token style, not two.
 */
import { findArtifactSetIdByName } from './types'
import { artifactSetName, type ArtifactSetId } from './types'

/** Token keyword — the part before the colon. The single spelling every consumer builds on. */
export const NOTE_SET_ICON_TOKEN_KEYWORD = 'set'

/**
 * Matches one `{set:Name}` occurrence, capturing the raw name.
 *
 * Kept `g`-less: callers that scan build their own global copy via `new RegExp`, because a
 * shared /g regex carries mutable `lastIndex` and would desync between the two renderers.
 */
export const NOTE_SET_ICON_TOKEN_PATTERN = `\\{${NOTE_SET_ICON_TOKEN_KEYWORD}:([^{}]+)\\}`

/** Fresh global matcher — one per scan, so `lastIndex` is never shared. */
export const noteSetIconTokenRegex = (): RegExp => new RegExp(NOTE_SET_ICON_TOKEN_PATTERN, 'g')

/**
 * Resolve a token's raw name to a set id, or null when it names nothing.
 *
 * Unknown names resolve to null so the renderers can fall back to plain text instead of
 * dropping the words: a typo'd or newly-renamed set must stay readable, never vanish.
 */
export const resolveNoteSetIconId = (rawName: string): ArtifactSetId | null => {
  // The resolver folds case/whitespace itself, so no pre-normalization here.
  return findArtifactSetIdByName(rawName)
}

/**
 * One parsed span of note text: literal text, or a resolved gear-set icon + label.
 *
 * A set segment carries the ID, plus `name` as the CANONICAL (English) name only. Renderers
 * must localize through `getLocalizedGearSetName(setId, t)` — `name` exists for text-only
 * consumers (width measurement, digests) and as the last-resort label when no translator is
 * in scope. Baking a localized string in here would freeze the note to whatever language
 * happened to be active when it was parsed.
 */
export type NoteSetIconSegment =
  | { kind: 'text'; text: string }
  | { kind: 'set'; setId: ArtifactSetId; name: string }

/**
 * Split text into literal and `{set:…}` segments.
 *
 * Unresolvable tokens come back as `text` carrying the set NAME (not the raw `{set:x}`
 * markup), so a bad token degrades to the word the author meant rather than to braces.
 */
export const splitNoteSetIconSegments = (text: string): NoteSetIconSegment[] => {
  const segments: NoteSetIconSegment[] = []
  const re = noteSetIconTokenRegex()
  let cursor = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    // Emit the literal run preceding this token.
    if (match.index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.index) })
    const rawName = match[1] ?? ''
    const setId = resolveNoteSetIconId(rawName)
    if (setId != null) segments.push({ kind: 'set', setId, name: artifactSetName(setId) })
    // Unresolved → the bare name, so nothing is silently lost. A name that is only
    // whitespace has no name to fall back to, so the token survives verbatim instead of
    // collapsing to nothing — a blank is indistinguishable from deleted text otherwise.
    else if (rawName.trim()) segments.push({ kind: 'text', text: rawName.trim() })
    else segments.push({ kind: 'text', text: match[0] })
    cursor = match.index + match[0].length
  }
  // Trailing literal run after the final token (or the whole string when there are none).
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}

/** True when the text carries at least one `{set:…}` token — lets callers skip work. */
export const hasNoteSetIconToken = (text: string): boolean => noteSetIconTokenRegex().test(text)

/**
 * Replace every `{set:…}` with its plain set name.
 *
 * Used by width measurement and any text-only consumer (option-label sizing, digests), so
 * icon markup never inflates a character count the way raw braces would.
 */
export const stripNoteSetIconTokens = (text: string): string =>
  splitNoteSetIconSegments(text)
    .map((seg) => (seg.kind === 'text' ? seg.text : seg.name))
    .join('')
