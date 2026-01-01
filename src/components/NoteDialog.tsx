import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, FormGroup, LinearProgress, Menu, MenuItem, Radio, RadioGroup, Stack, Typography } from '@mui/material'
import { alpha, useTheme, type Theme } from '@mui/material/styles'
import LocalOfferIcon from '@mui/icons-material/LocalOffer'
import StarsIcon from '@mui/icons-material/Stars'
import ViewListIcon from '@mui/icons-material/ViewList'
import QuizIcon from '@mui/icons-material/Quiz'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useI18n } from '../lib/i18n'
import { FONT_SIZE_MARKDOWN_PX, FONT_SIZE_SECONDARY_PX, SMALL_BUTTON_HEIGHT_PX } from '../lib/constants'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand, RefMDEditor } from '@uiw/react-md-editor'
import { commands, getCommands } from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'
import type { Pluggable } from 'unified'
import type { Components } from 'react-markdown'
import type { Root, RootContent, Element } from 'hast'
import type { BuilderConfig } from '../lib/hsfBuilder'
import type { Metaset } from '../lib/metasets'
import { metasetGlyph } from '../lib/metasets'
import { metasetIconOptionById, DEFAULT_METASET_ICON_ID, type MetasetIconId } from '../lib/metasetIcons'
import {
  artifactTypeI18nKey,
  artifactTypeNames,
  compareArtifactSets,
  compareArtifactTypes,
  factionI18nKey,
  statVariantI18nKey,
  getLocalizedGearSetName,
  labelOfVariant,
  STAT_VARIANTS_PRIORITY
} from '../lib/types'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../lib/gearSets/selection'
import ConfigChip from './ConfigChip'
// MarkdownTooltip ensures the color pickers + toolbar reuse the same hover delay/style across the app.
import MarkdownTooltip from './MarkdownTooltip'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import { KEEP_UNIQUE_DEFAULT_COUNT_MODE, sanitizeKeepUniqueCountMode, type KeepUniqueRule, KeepUniqueRuleActivation } from '../lib/keepUniques'
import { resolveRarityLabel } from '../lib/testerPreviewFormatting'
import { warningBadgeSx } from '../lib/badgeStyles'
import {
  buildNoteConfigOptionsSignature,
  applyQuestionExclusions,
  resolveConfigOptionsTags,
  type ConfigOptionsInstructions,
  type NoteQuestionDefinition,
  type NoteConfigOptionsAnswers,
} from '../lib/noteConfigOptions'
import { normalizeTagValue } from '../lib/tagHelpers'

// Limited color palette for Note highlighting rendered from Markdown via
//   <span data-color="{name}">…</span>
// Kept intentionally small and named. Sanitizer below permits only the data-color attribute on span.
const NOTE_COLOR_HEX: Record<'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'gray', string> = {
  red: '#ef5350',
  orange: '#ffa726',
  yellow: '#ffeb3b',
  green: '#66bb6a',
  teal: '#26a69a',
  blue: '#42a5f5',
  purple: '#ab47bc',
  gray: '#90a4ae',
}
const NOTE_COLOR_SX_SELECTORS: Record<string, { color: string }> = Object.fromEntries(
  (Object.entries(NOTE_COLOR_HEX) as Array<[keyof typeof NOTE_COLOR_HEX, string]>).map(([name, hex]) => [
    `& [data-color="${name}"]`,
    { color: hex },
  ]),
)
const NOTE_EDITOR_BG_COLOR = '#0d1117'
// Keep the note dialog size constant so view/edit stays aligned.
const NOTE_DIALOG_HEIGHT = '84vh'
// Apply a fixed height and flex column so the content can stretch fully.
const NOTE_DIALOG_PAPER_SX = {
  height: NOTE_DIALOG_HEIGHT,
  minHeight: NOTE_DIALOG_HEIGHT,
  maxHeight: NOTE_DIALOG_HEIGHT,
  // Make the paper a column layout so content/actions can flex.
  display: 'flex',
  flexDirection: 'column',
}

const CONFIG_COMMENT_REGEX = /^\s*configs\s*:\s*([0-9,\s]+)\s*$/i
const CONFIG_MARKER_REGEX = /<!--\s*configs\s*:\s*([0-9,\s]+)\s*-->/i
const CONFIG_REGEX_COMMENT_REGEX = /^\s*configs-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/i
const CONFIG_REGEX_MARKER_REGEX = /<!--\s*configs-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*-->/i
const CONFIG_ANY_MARKER_GLOBAL_REGEX = /<!--\s*configs(?:-re)?\s*:[\s\S]*?-->/gi
const CONFIG_ELEMENT_TAG = 'config-chip-block'
const CONFIG_ELEMENT_ATTR = 'data-config-ids'
const CONFIG_ELEMENT_PATTERN_ATTR = 'data-config-pattern'
const CONFIG_ELEMENT_FILTER_ATTR = 'data-config-filter'
const CONFIG_ELEMENT_INDEX_ATTR = 'data-config-marker-index'
const CONFIG_FILTER_IDS = 'ids'
const CONFIG_FILTER_REGEXP = 'regexp'
const DEFAULT_ALLOWED_TAG_REGEX = /^[A-Za-z0-9]+$/

const KEEP_UNIQUE_COMMENT_REGEX = /^\s*keep-uniques\s*:\s*([0-9,\s]+)\s*$/i
const KEEP_UNIQUE_MARKER_REGEX = /<!--\s*keep-uniques\s*:\s*([0-9,\s]+)\s*-->/i
const KEEP_UNIQUE_REGEX_COMMENT_REGEX = /^\s*keep-uniques-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/i
const KEEP_UNIQUE_REGEX_MARKER_REGEX = /<!--\s*keep-uniques-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*-->/i
const KEEP_UNIQUE_ANY_MARKER_GLOBAL_REGEX = /<!--\s*keep-uniques(?:-re)?\s*:[\s\S]*?-->/gi
const KEEP_UNIQUE_ELEMENT_TAG = 'keep-unique-summary'
const KEEP_UNIQUE_ELEMENT_ATTR = 'data-ku-ids'
const KEEP_UNIQUE_ELEMENT_FILTER_ATTR = 'data-ku-filter'
const KEEP_UNIQUE_ELEMENT_PATTERN_ATTR = 'data-ku-pattern'
const KEEP_UNIQUE_ELEMENT_INDEX_ATTR = 'data-ku-marker-index'
const KEEP_UNIQUE_FILTER_IDS = 'ids'
const KEEP_UNIQUE_FILTER_REGEXP = 'regexp'
const NOTE_CARD_GAP = 1.5
const NOTE_CARD_WIDTHS: Record<NoteCardWidthPreset, { flexBasis: number; minWidth: number; maxWidth: number }> = {
  note: { flexBasis: 242, minWidth: 209, maxWidth: 322 },
}

// Match HTML comment bodies that declare config options markers.
const QUESTION_COMMENT_REGEX = /^\s*config-options\b/i
// Match raw HTML comment markers in the Markdown stream.
const QUESTION_MARKER_REGEX = /<!--\s*config-options\b[\s\S]*?-->/i
// Custom element tag used in sanitized Markdown output.
const QUESTION_ELEMENT_TAG = 'note-config-options'
// Wrapper tag used to group question markers into a single flex layout.
const QUESTION_GROUP_ELEMENT_TAG = 'note-config-options-group'
// Attribute used to map back to a parsed question definition.
const QUESTION_ELEMENT_INDEX_ATTR = 'data-question-index'
// Backtick references like `\1` map to option labels by 1-based index.
const QUESTION_PROMPT_REF_REGEX = /^\\(\d+)$/

// Defensive guard: reject control characters that would break markdown parsing or regex compilation.
function containsControlCharacters(value: string): boolean {
  for (let idx = 0; idx < value.length; idx += 1) {
    const code = value.charCodeAt(idx)
    if ((code >= 0 && code <= 31) || code === 127) {
      return true
    }
  }
  return false
}

function decodeNotePattern(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`)
  } catch {
    return raw
  }
}

function buildNotePattern(raw: string): RegExp | null {
  const decoded = decodeNotePattern(raw).trim()
  if (!decoded) return null
  if (containsControlCharacters(decoded)) return null
  try {
    return new RegExp(decoded, 'iu')
  } catch {
    return null
  }
}

type ConfigMarkerEntry = { id: number; cfg: BuilderConfig }
type ConfigMarkerMap = Map<number, ConfigMarkerEntry[]>
type KeepUniqueMarkerEntry = { id: number; rule: KeepUniqueRule }
type KeepUniqueMarkerMap = Map<number, KeepUniqueMarkerEntry[]>
type NoteCardWidthPreset = 'note'
type QuestionPromptToken = { key: string; text: string; kind: 'text' | 'chip' | 'label' }
type QuestionPromptParts = { title: string; subtext: string | null }

// Backticks mark chip-style emphasis within prompts.
const QUESTION_PROMPT_CHIP_MARKER = '`'
// Double-asterisks mark label-style emphasis within prompts.
const QUESTION_PROMPT_LABEL_MARKER = '**'

// Shared label styling keeps note labels consistent across cards.
const NOTE_CARD_LABEL_TEXT_SX = {
  fontWeight: 800,
  color: 'text.secondary',
  lineHeight: 1.4,
}
const NOTE_QUESTION_OPTION_SX = {
  // Match Keep Unique row density by trimming default control padding.
  alignItems: 'center',
  m: 0,
  py: 0,
  '& .MuiFormControlLabel-label': { lineHeight: NOTE_CARD_LABEL_TEXT_SX.lineHeight },
  '& .MuiCheckbox-root, & .MuiRadio-root': { p: 0.25 },
}
const NOTE_QUESTION_SUBTEXT_SX = {
  // Keep subtext smaller and lighter to separate it from the title.
  color: 'text.secondary',
  lineHeight: 1.2,
}

function splitQuestionPrompt(prompt: string): QuestionPromptParts {
  // Locate the first newline to split title/subtext.
  const splitIndex = prompt.indexOf('\n')
  // Treat single-line prompts as title-only.
  if (splitIndex < 0) return { title: prompt, subtext: null }
  // Preserve the leading line as the title.
  const title = prompt.slice(0, splitIndex).trimEnd()
  // Capture the remainder as optional subtext.
  const remainder = prompt.slice(splitIndex + 1).trim()
  // Drop empty subtext so layout stays compact.
  return { title, subtext: remainder ? remainder : null }
}

function resolveQuestionPromptReference(raw: string, options: NoteQuestionDefinition['options']): string {
  // Trim whitespace so numeric references are easy to parse.
  const trimmed = raw.trim()
  const match = QUESTION_PROMPT_REF_REGEX.exec(trimmed)
  // Return the raw text when no numeric reference is present.
  if (!match) return raw
  // Convert 1-based references to array indices.
  const index = Number.parseInt(match[1] ?? '', 10) - 1
  // Ignore invalid indices so prompts remain readable.
  if (!Number.isFinite(index) || index < 0) return raw
  const option = options[index]
  // Fall back to the original content when the option is missing.
  return option ? option.label : raw
}

function buildQuestionPromptTokens(
  prompt: string,
  options: NoteQuestionDefinition['options'],
  allowReferences: boolean,
): QuestionPromptToken[] {
  // Tokenize on both backticks and double-asterisks to support chips + label highlights.
  const tokens: QuestionPromptToken[] = []
  let cursor = 0
  let partIndex = 0
  while (cursor < prompt.length) {
    // Locate the next marker so the earliest highlight wins.
    const chipIndex = prompt.indexOf(QUESTION_PROMPT_CHIP_MARKER, cursor)
    const labelIndex = prompt.indexOf(QUESTION_PROMPT_LABEL_MARKER, cursor)
    // Resolve which marker appears first in the remaining string.
    const nextMarker = (() => {
      if (chipIndex < 0 && labelIndex < 0) return null
      if (chipIndex < 0) return { index: labelIndex, marker: QUESTION_PROMPT_LABEL_MARKER, kind: 'label' as const }
      if (labelIndex < 0) return { index: chipIndex, marker: QUESTION_PROMPT_CHIP_MARKER, kind: 'chip' as const }
      return chipIndex <= labelIndex
        ? { index: chipIndex, marker: QUESTION_PROMPT_CHIP_MARKER, kind: 'chip' as const }
        : { index: labelIndex, marker: QUESTION_PROMPT_LABEL_MARKER, kind: 'label' as const }
    })()
    // Exit when no more markers remain.
    if (!nextMarker) {
      // Preserve the remaining text when no more markers exist.
      const tail = prompt.slice(cursor)
      if (tail) tokens.push({ key: `text-${partIndex}`, text: tail, kind: 'text' })
      break
    }
    // Emit any leading text before the marker.
    if (nextMarker.index > cursor) {
      tokens.push({ key: `text-${partIndex}`, text: prompt.slice(cursor, nextMarker.index), kind: 'text' })
      partIndex += 1
    }
    // Find the closing marker to capture the highlighted text.
    const close = prompt.indexOf(nextMarker.marker, nextMarker.index + nextMarker.marker.length)
    if (close < 0) {
      // Unbalanced markers stay as literal text.
      tokens.push({ key: `text-${partIndex}`, text: prompt.slice(nextMarker.index), kind: 'text' })
      break
    }
    // Extract the raw content between markers.
    const raw = prompt.slice(nextMarker.index + nextMarker.marker.length, close)
    // Resolve `\1` references inside both label + chip markers when enabled.
    const resolved = allowReferences
      ? resolveQuestionPromptReference(raw, options)
      : raw
    // Push the highlighted token when content exists.
    if (resolved) tokens.push({ key: `mark-${partIndex}`, text: resolved, kind: nextMarker.kind })
    cursor = close + nextMarker.marker.length
    partIndex += 1
  }
  return tokens
}

function renderQuestionTextTokens({
  tokens,
  chipSx,
  labelSx,
}: {
  tokens: QuestionPromptToken[]
  chipSx: Record<string, unknown>
  labelSx: Record<string, unknown>
}): React.ReactNode {
  // Render each token with the intended visual emphasis.
  return tokens.map((token) => (
    token.kind === 'chip' ? (
      // Chip tokens reuse the keep-unique scope chip treatment.
      <Box key={token.key} component="span" sx={chipSx}>
        <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
          {token.text}
        </Typography>
      </Box>
    ) : token.kind === 'label' ? (
      // Label tokens mirror the Quota/Scope label typography.
      <Typography key={token.key} component="span" variant="caption" sx={labelSx}>
        {token.text}
      </Typography>
    ) : (
      // Plain text inherits the surrounding Typography styles.
      <Box key={token.key} component="span">
        {token.text}
      </Box>
    )
  ))
}

function renderQuestionOptionLabel(
  label: string,
  chipSx: Record<string, unknown>,
  labelSx: Record<string, unknown>,
): JSX.Element {
  // Tokenize option labels so highlight markers mirror prompt behavior.
  const tokens = buildQuestionPromptTokens(label, [], false)
  // Preserve explicit line breaks for multi-line option labels.
  return (
    <Typography
      component="span"
      variant="caption"
      color="text.secondary"
      sx={{ whiteSpace: 'pre-line', lineHeight: NOTE_CARD_LABEL_TEXT_SX.lineHeight }}
    >
      {renderQuestionTextTokens({ tokens, chipSx, labelSx })}
    </Typography>
  )
}

type NoteRenderContextValue = {
  configs: BuilderConfig[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  markerResolutions: ConfigMarkerMap
  keepUniqueRules: KeepUniqueRule[]
  keepUniqueMarkerResolutions: KeepUniqueMarkerMap
  configOptionsResolutions: Map<number, NoteQuestionDefinition>
  configOptionsEditable: boolean
  configOptionsDisabled: boolean
  onConfigOptionsAnswerChange: (question: NoteQuestionDefinition, nextAnswer: string[]) => void
}

const NoteRenderContext = React.createContext<NoteRenderContextValue | null>(null)

function useNoteRenderContext(): NoteRenderContextValue {
  const ctx = React.useContext(NoteRenderContext)
  if (!ctx) throw new Error('Note render context is unavailable')
  return ctx
}

type MarkdownComponentMap = Record<string, React.ComponentType<Record<string, unknown>>>
type MarkdownAllowElement = NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['allowElement']>

type MarkerToken =
  | { type: 'absolute'; value: number }
  | { type: 'relativeNext' }

function coerceFirstString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') return entry
    }
  }
  return null
}

function parseMarkerTokens(raw: string): MarkerToken[] {
  const tokens: MarkerToken[] = []
  const seen = new Set<number>()
  raw
    .split(',')
    .map((part) => part.trim())
    .forEach((part) => {
      if (!part) return
      const num = Number.parseInt(part, 10)
      if (!Number.isFinite(num)) return
      if (num === 0) {
        tokens.push({ type: 'relativeNext' })
        return
      }
      if (num > 0 && !seen.has(num)) {
        tokens.push({ type: 'absolute', value: num })
        seen.add(num)
      }
    })
  return tokens
}

function serializeMarkerTokens(tokens: MarkerToken[]): string {
  return tokens.map((token) => (token.type === 'relativeNext' ? '0' : String(token.value))).join(',')
}

const rehypeConfigComments: Pluggable = () => {
  return (tree: Root) => {
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          const regexMatch = CONFIG_REGEX_COMMENT_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: CONFIG_ELEMENT_TAG,
              properties: {
                [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_REGEXP,
                [CONFIG_ELEMENT_PATTERN_ATTR]: patternRaw,
                [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = CONFIG_COMMENT_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: CONFIG_ELEMENT_TAG,
            properties: {
              [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_IDS,
              [CONFIG_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          const regexMatch = CONFIG_REGEX_MARKER_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: CONFIG_ELEMENT_TAG,
              properties: {
                [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_REGEXP,
                [CONFIG_ELEMENT_PATTERN_ATTR]: patternRaw,
                [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = CONFIG_MARKER_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: CONFIG_ELEMENT_TAG,
            properties: {
              [CONFIG_ELEMENT_FILTER_ATTR]: CONFIG_FILTER_IDS,
              [CONFIG_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [CONFIG_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if ((child as Element).type === 'element' && Array.isArray((child as Element).children)) {
          transform(child as unknown as Element)
        }
      }
    }
    transform(tree)
  }
}

const rehypeKeepUniqueComments: Pluggable = () => {
  return (tree: Root) => {
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          const regexMatch = KEEP_UNIQUE_REGEX_COMMENT_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: KEEP_UNIQUE_ELEMENT_TAG,
              properties: {
                [KEEP_UNIQUE_ELEMENT_FILTER_ATTR]: KEEP_UNIQUE_FILTER_REGEXP,
                [KEEP_UNIQUE_ELEMENT_PATTERN_ATTR]: patternRaw,
                [KEEP_UNIQUE_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = KEEP_UNIQUE_COMMENT_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: KEEP_UNIQUE_ELEMENT_TAG,
            properties: {
              [KEEP_UNIQUE_ELEMENT_FILTER_ATTR]: KEEP_UNIQUE_FILTER_IDS,
              [KEEP_UNIQUE_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [KEEP_UNIQUE_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          const regexMatch = KEEP_UNIQUE_REGEX_MARKER_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: KEEP_UNIQUE_ELEMENT_TAG,
              properties: {
                [KEEP_UNIQUE_ELEMENT_FILTER_ATTR]: KEEP_UNIQUE_FILTER_REGEXP,
                [KEEP_UNIQUE_ELEMENT_PATTERN_ATTR]: patternRaw,
                [KEEP_UNIQUE_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = KEEP_UNIQUE_MARKER_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: KEEP_UNIQUE_ELEMENT_TAG,
            properties: {
              [KEEP_UNIQUE_ELEMENT_FILTER_ATTR]: KEEP_UNIQUE_FILTER_IDS,
              [KEEP_UNIQUE_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [KEEP_UNIQUE_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if ((child as Element).type === 'element' && Array.isArray((child as Element).children)) {
          transform(child as unknown as Element)
        }
      }
    }
    transform(tree)
  }
}

const rehypeQuestionComments: Pluggable = () => {
  return (tree: Root) => {
    // Track the marker index as we traverse the Markdown tree.
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      // Normalize to the child array to keep the loop simple.
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        // Skip empty child slots defensively.
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          // Ignore non-question comments.
          if (!QUESTION_COMMENT_REGEX.test(value)) continue
          // Replace with a custom element that the renderer can map.
          const element: Element = {
            type: 'element',
            tagName: QUESTION_ELEMENT_TAG,
            properties: {
              [QUESTION_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          // Increment and replace the comment node.
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          // Only treat raw HTML that matches the question marker syntax.
          if (!QUESTION_MARKER_REGEX.test(value)) continue
          // Swap the raw HTML for the same custom element tag.
          const element: Element = {
            type: 'element',
            tagName: QUESTION_ELEMENT_TAG,
            properties: {
              [QUESTION_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          // Increment and replace the raw HTML node.
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        // Recurse into child elements to find nested markers.
        if ((child as Element).type === 'element' && Array.isArray((child as Element).children)) {
          transform(child as unknown as Element)
        }
      }
    }
    // Begin the recursive traversal at the root.
    transform(tree)
  }
}

const rehypeQuestionGroups: Pluggable = () => {
  return (tree: Root) => {
    const isQuestionElement = (node: RootContent): node is Element => {
      return node.type === 'element' && (node as Element).tagName === QUESTION_ELEMENT_TAG
    }
    const isWhitespaceText = (node: RootContent): boolean => {
      if (node.type !== 'text') return false
      const value = (node as { value?: string }).value ?? ''
      return value.trim().length === 0
    }
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (const child of nodeChildren) {
        if ((child as Element).type === 'element' && Array.isArray((child as Element).children)) {
          transform(child as unknown as Element)
        }
      }
      const nextChildren: RootContent[] = []
      for (let i = 0; i < nodeChildren.length; i += 1) {
        const child = nodeChildren[i]
        if (!child) continue
        if (!isQuestionElement(child)) {
          nextChildren.push(child)
          continue
        }
        const grouped: Element[] = [child]
        let cursor = i + 1
        for (; cursor < nodeChildren.length; cursor += 1) {
          const candidate = nodeChildren[cursor]
          if (!candidate) continue
          if (isQuestionElement(candidate)) {
            grouped.push(candidate)
            continue
          }
          if (isWhitespaceText(candidate)) continue
          break
        }
        nextChildren.push({
          type: 'element',
          tagName: QUESTION_GROUP_ELEMENT_TAG,
          properties: {},
          children: grouped,
        })
        i = cursor - 1
      }
      nodeChildren.splice(0, nodeChildren.length, ...nextChildren)
    }
    transform(tree)
  }
}

function collectConfigIds(text: string, configs: BuilderConfig[]): Set<number> {
  const used = new Set<number>()
  const resolutions = buildConfigMarkerResolutions(text, configs)
  for (const entries of resolutions.values()) {
    for (const entry of entries) {
      used.add(entry.id)
    }
  }
  return used
}

function configMatchesNotePattern(cfg: BuilderConfig, pattern: RegExp): boolean {
  // Match the config name first to preserve the existing regex behavior.
  const name = typeof cfg?.name === 'string' ? cfg.name : ''
  if (name) {
    pattern.lastIndex = 0
    if (pattern.test(name)) return true
  }
  // Check normalized tags so configs-re can target tag metadata.
  const tags = Array.isArray(cfg?.tags) ? cfg.tags : []
  for (const tag of tags) {
    const normalized = normalizeTagValue(String(tag))
    if (!normalized) continue
    pattern.lastIndex = 0
    if (pattern.test(normalized)) return true
  }
  return false
}

function buildConfigMarkerResolutions(text: string, configs: BuilderConfig[]): ConfigMarkerMap {
  const result: ConfigMarkerMap = new Map()
  if (!text) return result
  CONFIG_ANY_MARKER_GLOBAL_REGEX.lastIndex = 0
  let markerIndex = 0
  let lastRendered = 0
  for (const match of text.matchAll(CONFIG_ANY_MARKER_GLOBAL_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    let entries: ConfigMarkerEntry[] = []
    const regexMatch = CONFIG_REGEX_MARKER_REGEX.exec(raw)
    if (regexMatch) {
      const patternRaw = regexMatch[1] ?? ''
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        entries = configs
          .map((cfg, idx) => ({ cfg, idx }))
          .filter(({ cfg }) => {
            return configMatchesNotePattern(cfg, safeCompiled)
          })
          .map(({ cfg, idx }) => ({ id: idx + 1, cfg }))
      }
    } else {
      const idsMatch = CONFIG_MARKER_REGEX.exec(raw)
      if (idsMatch && typeof idsMatch[1] === 'string') {
        const tokens = parseMarkerTokens(idsMatch[1])
        if (tokens.length > 0) {
          const fallback: ConfigMarkerEntry[] = []
          let markerLast = lastRendered
          for (const token of tokens) {
            let candidate: number | null = null
            if (token.type === 'absolute') {
              candidate = token.value
            } else {
              candidate = markerLast + 1
            }
            if (!candidate || candidate <= 0) continue
            const cfg = configs[candidate - 1]
            if (!cfg) continue
            fallback.push({ id: candidate, cfg })
            markerLast = candidate
          }
          entries = fallback
        }
      }
    }
    if (entries.length > 0) {
      lastRendered = entries[entries.length - 1]!.id
    }
    result.set(markerIndex, entries)
    markerIndex += 1
  }
  return result
}

const CONFIG_MARKER_HINT = '<!--  Use `0` to reference the config after the last used. Alternatively, use `configs-re: "text"` for regexp matches. -->'

function buildConfigMarkerBlock(ids: number[]): { block: string; cursorIndex: number } {
  // Keep the marker and hint on separate lines to avoid breaking selection ranges.
  const marker = `<!-- configs:${ids.join(',')} -->`
  const block = `${marker}\n${CONFIG_MARKER_HINT}`
  // Cursor returns to the end of the marker line for continued editing.
  return { block, cursorIndex: marker.length + 1 }
}

function collectKeepUniqueIds(text: string, keepUniqueRules: KeepUniqueRule[]): Set<number> {
  const used = new Set<number>()
  const resolutions = buildKeepUniqueMarkerResolutions(text, keepUniqueRules)
  for (const entries of resolutions.values()) {
    for (const entry of entries) {
      used.add(entry.id)
    }
  }
  return used
}

function buildKeepUniqueMarkerResolutions(text: string, keepUniqueRules: KeepUniqueRule[]): KeepUniqueMarkerMap {
  const result: KeepUniqueMarkerMap = new Map()
  if (!text) return result
  KEEP_UNIQUE_ANY_MARKER_GLOBAL_REGEX.lastIndex = 0
  let markerIndex = 0
  let lastRendered = 0
  for (const match of text.matchAll(KEEP_UNIQUE_ANY_MARKER_GLOBAL_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    let entries: KeepUniqueMarkerEntry[] = []
    const regexMatch = KEEP_UNIQUE_REGEX_MARKER_REGEX.exec(raw)
    if (regexMatch) {
      const patternRaw = regexMatch[1] ?? ''
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        entries = keepUniqueRules
          .map((rule, idx) => ({ rule, idx }))
          .filter(({ rule }) => {
            const name = typeof rule?.name === 'string' ? rule.name : ''
            safeCompiled.lastIndex = 0
            return safeCompiled.test(name)
          })
          .map(({ rule, idx }) => ({ id: idx + 1, rule }))
      }
    } else {
      const idsMatch = KEEP_UNIQUE_MARKER_REGEX.exec(raw)
      if (idsMatch && typeof idsMatch[1] === 'string') {
        const tokens = parseMarkerTokens(idsMatch[1])
        if (tokens.length > 0) {
          const fallback: KeepUniqueMarkerEntry[] = []
          let markerLast = lastRendered
          for (const token of tokens) {
            let candidate: number | null = null
            if (token.type === 'absolute') {
              candidate = token.value
            } else {
              candidate = markerLast + 1
            }
            if (!candidate || candidate <= 0) continue
            const rule = keepUniqueRules[candidate - 1]
            if (!rule) continue
            fallback.push({ id: candidate, rule })
            markerLast = candidate
          }
          entries = fallback
        }
      }
    }
    if (entries.length > 0) {
      lastRendered = entries[entries.length - 1]!.id
    }
    result.set(markerIndex, entries)
    markerIndex += 1
  }
  return result
}

const KEEP_UNIQUE_MARKER_HINT = '<!-- use `keep-uniques-re: "text"` for regexp matches. Use `0` only in numeric lists (keep-uniques:). -->'

function buildKeepUniqueMarkerBlock(ids: number[]): { block: string; cursorIndex: number } {
  // Match config marker ergonomics: leave the hint on the next line.
  const marker = `<!-- keep-uniques:${ids.join(',')} -->`
  const block = `${marker}\n${KEEP_UNIQUE_MARKER_HINT}`
  // Place the caret after the marker for quick follow-up edits.
  return { block, cursorIndex: marker.length + 1 }
}

function buildConfigOptionsMarkerResolutions(text: string, answers: NoteConfigOptionsAnswers): Map<number, NoteQuestionDefinition> {
  // Map marker indices to parsed question definitions.
  const result = new Map<number, NoteQuestionDefinition>()
  // Short-circuit when no note text exists.
  if (!text) return result
  // Resolve questions with the current answers merged in.
  const { questions } = resolveConfigOptionsTags(text, answers)
  for (const question of questions) {
    // Use the marker index so the Markdown renderer can map markers.
    result.set(question.index, question)
  }
  // Return the completed index map.
  return result
}

function computeBlockInsertion(
  text: string,
  start: number,
  end: number,
  block: string,
  cursorIndex?: number,
): { insert: string; cursorOffset: number } {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const needsLeading = before.length > 0 && !before.endsWith('\n')
  const needsTrailing = after.length > 0 && !after.startsWith('\n')
  const leading = needsLeading ? (before.endsWith('\n\n') ? '' : '\n\n') : (start === 0 ? '' : '\n')
  const trailing = needsTrailing ? '\n\n' : (after.length === 0 ? '\n' : '')
  const insert = `${leading}${block}${trailing}`
  // Default cursor placement stays at the end of the inserted block.
  const fallbackOffset = insert.length - (trailing.length > 0 ? trailing.length : 0)
  // Optional cursorIndex anchors inside the inserted block (relative to block start).
  const cursorOffset = typeof cursorIndex === 'number' ? leading.length + cursorIndex : fallbackOffset
  return { insert, cursorOffset }
}

function buildMetasetBulletList(
  metasets: Metaset[],
  t: ReturnType<typeof useI18n>['t'],
  lang: string,
): string {
  if (!metasets.length) return ''
  const fallbackIconOption = metasetIconOptionById(DEFAULT_METASET_ICON_ID)
  return metasets
    .map((meta) => {
      const glyphInfo = metasetGlyph(meta)
      let iconGlyph: string | null = null
      if (glyphInfo.iconId === 'none') {
        iconGlyph = null
      } else if (glyphInfo.glyph) {
        iconGlyph = glyphInfo.glyph
      } else if (glyphInfo.iconId) {
        const option = metasetIconOptionById(glyphInfo.iconId as MetasetIconId)
        iconGlyph = option.variant === 'none' ? null : option.glyph
      } else if (typeof meta.iconId === 'string') {
        const option = metasetIconOptionById(meta.iconId as MetasetIconId)
        iconGlyph = option.variant === 'none' ? null : option.glyph
      }
      if (!iconGlyph && fallbackIconOption.variant !== 'none') {
        iconGlyph = fallbackIconOption.glyph
      }
      const setNames = (meta.sets ?? [])
        .slice()
        .sort((a, b) => compareArtifactSets(Number(a), Number(b)))
        .map((id) => getLocalizedGearSetName(id, t, lang))
      const setsLabel = setNames.length > 0 ? setNames.join(', ') : t('noteMetasetNoSets')
      const iconPart = iconGlyph ? `${iconGlyph} ` : ''
      const name = meta.name && meta.name.trim() ? meta.name.trim() : t('menuMetasetsSection')
      return `- ${iconPart}**${name}** - ${setsLabel}.`
    })
    .join('\n')
}

const CONFIG_OPTIONS_SAMPLE_LINES = [
  'Config options syntax (EBNF):',
  '```text',
  'marker        := "<!--" "config-options" question "-->"',
  'question      := ("q" | "question") string group+ [fallback]',
  'group         := ("single" | "s" | "rb" | "radiobutton" | "radio" | "multi" | "m" | "cb" | "checkbox" | "check")',
  '                string ["id" "=" token] ["*" | "default"] [constraints] "{" selectorBlock+ "}"',
  'selectorBlock := "@" selector "{" assignment+ "}"',
  'selector      := "all" | "tagged" | "untagged" | expr',
  'expr          := term (("and" | "or" | "&&" | "||") term)*',
  'term          := "tag" ("=" token | "in" "[" tokenList "]" | "any" | "none")',
  '             | "rank" ("=" | ">=" | "<=") number',
  '             | "rarity" ("=" | ">=" | "<=") rarityName',
  '             | "minrolls" ("=" | ">=" | "<=") number',
  '             | "minsubstats" ("=" | ">=" | "<=") number',
  '             | "flex" ("=" | ":") ("on" | "off" | "true" | "false")',
  'assignment    := field ("=" | ">=" | "<=") value',
  'fallback      := ("fallback" | "else") "{" selectorBlock+ "}"',
  'constraints   := "!" tokenList | "excl" tokenList | "only" tokenList',
  'tokenList     := token ("," token)*',
  'field         := "export" | "rank" | "rarity" | "lvl" | "keep" | "autolate" | "minrolls"',
  '             | "lockedminrolls" | "minsubstats" | "flex" | "substatmin" | "substatmin." statKey',
  '             | "minima.any" | "minima." starKey "." statKey',
  'value         := string | number | token',
  'token         := /[\\p{L}\\p{M}_][\\p{L}\\p{N}\\p{M}_]*/ (unicode letters/marks, underscore)',
  'rarityName    := "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythical" | "auto"',
  'starKey       := "1" | "2" | "3" | "4" | "5" | "6"',
  '```',
  '',
  // Example 1: explicit and implicit tokens plus constraints.
  'Example 1:',
  '```md',
  '<!-- config-options',
  'q "Sample question?',
  'Subtext **Bold** `with attitude`"',
  'check "Toggle 1" id=m1 !3 { @all { export=disabled } }',
  'check "Toggle 2" id=m2 !3 { @all { export=active } }',
  'check "Toggle 3 (not allowed with Toggle 1 or 2)" !m2 !m1 { @all { export=active } }',
  'radio "Activate all; set global min rank to 4; set HP min to 1" * { @all { export=active minima.any=4 minima.3.HP=1 substatmin=4 } }',
  'radio "Disable all" { @all { export=disabled } }',
  'radio "Activate all" { @all { export=active } }',
  '-->',
  '```',
  '',
  // Example 2: tagged/untagged selectors, substatmin/minsubstats, and fallback.
  'Example 2:',
  '```md',
  '<!-- config-options',
  'q "Tag-aware tuning (use your config tags)?',
  'Leave all unchecked to disable everything."',
  'check "Tagged configs stay active" { @tagged { export=active } @untagged { export=disabled } }',
  'check "Required Substats = 2" { @all { minsubstats=2 } }',
  'check "Min Rolls (Per Stat): All = 1" { @all { substatmin=1 } }',
  'check "Min Rolls (Per Stat): SPD = 2" { @all { substatmin.SPD=2 } }',
  'fallback { @all { export=disabled } }',
  '-->',
  '```',
  '',
  // Example 3: rank-specific changes with a few extra tweaks.
  'Example 3:',
  '```md',
  '<!-- config-options',
  'q "Adjust rank-6 configs?"',
  'radio "Downgrade all 6-star configs to 5-star" * { @rank=6 { rank=5 } }',
  'check "Also require Legendary+ rarity" { @rank=6 { rarity>=legendary } }',
  'check "Set level window to 12-16" { @rank=6 { lvl=12-16 } }',
  'check "Keep Late only" { @rank=6 { keep=late } }',
  '-->',
  '```',
  '',
  // Notes for roll-related fields.
  'Note: substatmin sets Min Rolls (Per Stat) per config; use minima.any/minima.<star>.<stat> for global minima.',
]

function buildConfigOptionsSampleBlock(): string {
  // Enumerate supported stat keys from the runtime variant catalog.
  const variants = [...STAT_VARIANTS_PRIORITY]
  // Convert variants to labels while skipping empty entries.
  const statLabels = variants
    .map((variant) => labelOfVariant(variant))
    .filter((label) => Boolean(label && label.trim().length > 0))
  // De-dupe labels but preserve ordering for stable output.
  const seen = new Set<string>()
  const statKeys: string[] = []
  statLabels.forEach((label) => {
    if (seen.has(label)) return
    seen.add(label)
    statKeys.push(label)
  })
  // Quote each key so the EBNF literal list is explicit.
  const statKeyLine = `statKey       := ${statKeys.map((label) => `"${label.replace(/"/g, '\\"')}"`).join(' | ')}`
  // Insert the runtime-derived list before the EBNF closes.
  const lines = [...CONFIG_OPTIONS_SAMPLE_LINES]
  const fenceIndex = lines.indexOf('```')
  if (fenceIndex >= 0) {
    lines.splice(fenceIndex, 0, statKeyLine)
  } else {
    lines.push(statKeyLine)
  }
  return lines.join('\n')
}

function buildMetasetInsertCommand(params: {
  metasets: Metaset[]
  t: ReturnType<typeof useI18n>['t']
  lang: string
  setDraft: React.Dispatch<React.SetStateAction<string>>
}): ICommand {
  const { metasets, t, lang, setDraft } = params
  return {
    name: 'insert-metasets',
    keyCommand: 'insert-metasets',
    execute: (state, api) => {
      if (metasets.length === 0) return
      const block = buildMetasetBulletList(metasets, t, lang)
      if (!block) return
      const text = state.text ?? ''
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }
}

type ConfigChipBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function ConfigChipBlock({ node }: ConfigChipBlockProps): JSX.Element | null {
  const { configs, metasets, substatColors, markerResolutions } = useNoteRenderContext()
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  const filterAttr = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_FILTER_ATTR])
  const filterType = filterAttr === CONFIG_FILTER_REGEXP ? CONFIG_FILTER_REGEXP : CONFIG_FILTER_IDS
  let tokens: MarkerToken[] = []
  let patternRaw = ''
  if (filterType === CONFIG_FILTER_IDS) {
    const rawSpec = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_ATTR]) ?? ''
    tokens = parseMarkerTokens(rawSpec)
    if (tokens.length === 0) return null
  } else {
    patternRaw = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_PATTERN_ATTR]) ?? ''
  }
  const rawIndexAttr = coerceFirstString(node?.properties?.[CONFIG_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  let resolvedEntries: ConfigMarkerEntry[] | undefined
  if (markerIndex != null) {
    resolvedEntries = markerResolutions.get(markerIndex)
  }
  if (!resolvedEntries) {
    if (filterType === CONFIG_FILTER_REGEXP) {
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        resolvedEntries = configs
          .map((cfg, idx) => ({ cfg, idx }))
          .filter(({ cfg }) => {
            return configMatchesNotePattern(cfg, safeCompiled)
          })
          .map(({ cfg, idx }) => ({ id: idx + 1, cfg }))
      } else {
        resolvedEntries = []
      }
    } else {
      let priorLast = 0
      if (markerIndex != null) {
        for (let idx = markerIndex - 1; idx >= 0; idx -= 1) {
          const prev = markerResolutions.get(idx)
          if (prev && prev.length > 0) {
            priorLast = prev[prev.length - 1]!.id
            break
          }
        }
      }
      const fallbackEntries: ConfigMarkerEntry[] = []
      let markerLast = priorLast
      for (const token of tokens) {
        let candidate: number | null = null
        if (token.type === 'absolute') {
          candidate = token.value
        } else {
          candidate = markerLast + 1
        }
        if (!candidate || candidate <= 0) continue
        const cfg = configs[candidate - 1]
        if (!cfg) continue
        fallbackEntries.push({ id: candidate, cfg })
        markerLast = candidate
      }
      resolvedEntries = fallbackEntries
    }
  }
  const entries = resolvedEntries ?? []
  if (entries.length === 0) return null
  const noop = () => {}
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 1 }}>
      {entries.map(({ id, cfg }, idx) => (
        <Box
          key={`note-cfg-${id}`}
          sx={{
            pointerEvents: 'none',
            width: '100%',
            '& .MuiIconButton-root': { display: 'none !important' },
          }}
        >
          <ConfigChip
            index={id - 1}
            cfg={cfg}
            gearSetCatalogVersion={gearSetCatalogVersion}
            onDelete={noop}
            onDuplicate={noop}
            onMoveUp={noop}
            onMoveDown={noop}
            onMoveTop={noop}
            onMoveBottom={noop}
            onPasteAfter={noop}
            onPasteAtEnd={noop}
            selected={false}
            onSelect={noop}
            onCopy={noop}
            isLast={idx === entries.length - 1}
            // Render static builder-style chips so README notes match the in-app visuals.
            visualVariant="static"
            onHover={noop}
            metasets={metasets}
            substatColors={substatColors}
          />
        </Box>
      ))}
    </Box>
  )
}

type NoteQuestionBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function getNoteCardWidthStyles(preset: NoteCardWidthPreset) {
  // Shared sizing keeps config options and keep-unique cards aligned.
  return NOTE_CARD_WIDTHS[preset]
}

function NoteCardWrap({ children }: React.PropsWithChildren): JSX.Element {
  // Shared wrapper keeps spacing identical across note card types.
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: NOTE_CARD_GAP, my: 1, alignItems: 'flex-start' }}>
      {children}
    </Box>
  )
}

function buildNoteScopeChipSx(theme: Theme, active: boolean) {
  // Reuse the Keep Unique scope chip styling for note highlights.
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.4,
    px: 0.5,
    py: 0.3,
    borderRadius: 1,
    border: '1px solid',
    // Active styling uses the primary palette; inactive stays neutral.
    borderColor: active ? alpha(theme.palette.primary.main, 0.6) : 'divider',
    bgcolor: active
      ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)
      : 'transparent',
    color: active ? theme.palette.primary.main : 'text.secondary',
  } satisfies Record<string, unknown>
}

function NoteQuestionBlock({ node }: NoteQuestionBlockProps): JSX.Element | null {
  // Pull config options wiring from context.
  const { configOptionsResolutions, configOptionsEditable, configOptionsDisabled, onConfigOptionsAnswerChange } = useNoteRenderContext()
  const theme = useTheme()
  // Extract the marker index from the custom element.
  const rawIndexAttr = coerceFirstString(node?.properties?.[QUESTION_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  // Lookup the parsed question definition by marker index.
  const question = markerIndex != null ? configOptionsResolutions.get(markerIndex) : undefined
  // Split prompt text so the first line becomes the title.
  const promptParts = useMemo(
    () => (question ? splitQuestionPrompt(question.prompt) : { title: '', subtext: null }),
    [question],
  )
  // Tokenize the title so backtick references can be styled.
  const promptTokens = useMemo(
    () => (question ? buildQuestionPromptTokens(promptParts.title, question.options, true) : []),
    [question, promptParts.title],
  )
  // Tokenize the subtext so emphasis markers stay consistent.
  const promptSubtextTokens = useMemo(
    () => (question && promptParts.subtext
      ? buildQuestionPromptTokens(promptParts.subtext, question.options, true)
      : []),
    [question, promptParts.subtext],
  )
  // Style chips to match Keep Unique scope chips for visual consistency.
  const promptChipSx = useMemo(
    () => buildNoteScopeChipSx(theme, true),
    [theme],
  )
  // Emphasized text mirrors the Keep Unique label styling.
  const promptLabelSx = useMemo(
    () => ({
      ...NOTE_CARD_LABEL_TEXT_SX,
      display: 'inline-flex',
      alignItems: 'center',
    }),
    [],
  )
  if (!question) return null
  // Resolve the selected answers into a set for fast checks.
  const selected = Array.isArray(question.answer) ? question.answer : []
  const selectedSet = new Set<string>(selected)
  // Wrap answer updates so callers can track changes.
  const applyAnswer = (next: string[]) => {
    onConfigOptionsAnswerChange(question, next)
  }
  // Shared sizing keeps question cards in lockstep with keep-unique cards.
  const { flexBasis, minWidth, maxWidth } = getNoteCardWidthStyles('note')
  const cardOpacity = configOptionsDisabled ? 0.55 : 1
  return (
    <Box
      sx={{
        // Match Keep Unique card styling for tighter, consistent layout.
        // Width limits mirror Keep Unique cards so multiple can fit on a line.
        flex: `1 1 ${flexBasis}px`,
        minWidth,
        maxWidth,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        p: 1.25,
        bgcolor: 'background.paper',
        opacity: cardOpacity,
      }}
    >
      {/* Stack keeps the heading and options tightly grouped. */}
      <Stack spacing={0}>
        {/* Prompt text mirrors the Keep Unique card title. */}
        <Typography
          variant="subtitle2"
          component="div"
          sx={{
            // Match the Keep Unique title typography for questions.
            fontWeight: 700,
            wordBreak: 'break-word',
            // Keep the title compact without forcing extra flex height.
            lineHeight: 1.1,
            fontSize: '0.9rem',
            display: 'block',
            m: 0,
            p: 0,
            whiteSpace: 'pre-line',
          }}
        >
          {/* Render prompt tokens so chips + labels stand out. */}
          {renderQuestionTextTokens({ tokens: promptTokens, chipSx: promptChipSx, labelSx: promptLabelSx })}
        </Typography>
        {promptParts.subtext ? (
          // Render optional subtext as a lighter secondary line.
          <Typography
            variant="caption"
            component="div"
            sx={{
              ...NOTE_QUESTION_SUBTEXT_SX,
              whiteSpace: 'pre-line',
              // Keep the title/subtext gap tight for compact cards.
              mt: 0,
              mb: 0,
              display: 'block',
            }}
          >
            {renderQuestionTextTokens({ tokens: promptSubtextTokens, chipSx: promptChipSx, labelSx: promptLabelSx })}
          </Typography>
        ) : null}
        {/* Render each option group with its matching control type. */}
        <Stack spacing={0.35} sx={{ mt: 0.35 }}>
          {question.groups.map((group) => {
            // Lookup the selected option in this group.
            const selectedOption = group.options.find((option) => selectedSet.has(option.id))
            if (group.type === 'single') {
              return (
                <FormControl key={group.id} component="fieldset" variant="standard">
                  <RadioGroup
                    value={selectedOption?.id ?? ''}
                    onChange={(_, value) => {
                      // Ignore changes when the question is read-only.
                      if (!configOptionsEditable) return
                      // Reset the group's selection while preserving other groups.
                      const next = new Set(selectedSet)
                      group.options.forEach((option) => next.delete(option.id))
                      if (value) next.add(value)
                      // Apply exclusions so mutual rules stay enforced.
                      const ordered = applyQuestionExclusions(Array.from(next), question.options, value || undefined)
                      applyAnswer(ordered)
                    }}
                    sx={{ gap: 0.25 }}
                  >
                    {group.options.map((option) => (
                      <FormControlLabel
                        key={option.id}
                        value={option.id}
                        control={<Radio size="small" disabled={!configOptionsEditable} />}
                        label={renderQuestionOptionLabel(option.label, promptChipSx, promptLabelSx)}
                        disabled={!configOptionsEditable}
                        sx={NOTE_QUESTION_OPTION_SX}
                      />
                    ))}
                  </RadioGroup>
                </FormControl>
              )
            }
            return (
              <FormGroup key={group.id} sx={{ gap: 0.25 }}>
                {group.options.map((option) => {
                  // Compute the checked state once per option.
                  const checked = selectedSet.has(option.id)
                  return (
                    <FormControlLabel
                      key={option.id}
                      control={(
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={!configOptionsEditable}
                          onChange={(event) => {
                            // Ignore changes when the question is read-only.
                            if (!configOptionsEditable) return
                            // Toggle the option in a new Set instance.
                            const next = new Set(selectedSet)
                            if (event.target.checked) next.add(option.id)
                            else next.delete(option.id)
                            // Apply exclusions so mutual rules stay enforced.
                            const preferred = event.target.checked ? option.id : undefined
                            const ordered = applyQuestionExclusions(Array.from(next), question.options, preferred)
                            applyAnswer(ordered)
                          }}
                        />
                      )}
                      label={renderQuestionOptionLabel(option.label, promptChipSx, promptLabelSx)}
                      disabled={!configOptionsEditable}
                      sx={NOTE_QUESTION_OPTION_SX}
                    />
                  )
                })}
              </FormGroup>
            )
          })}
        </Stack>
      </Stack>
    </Box>
  )
}

function NoteQuestionGroup({ children }: React.PropsWithChildren): JSX.Element {
  // Groups adjacent question cards into the shared note-card layout.
  return (
    <NoteCardWrap>
      {children}
    </NoteCardWrap>
  )
}

type KeepUniqueBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function KeepUniqueBlock({ node }: KeepUniqueBlockProps): JSX.Element | null {
  const { t, lang } = useI18n()
  const { keepUniqueRules, keepUniqueMarkerResolutions, metasets, useStatButtonColors, substatColors } = useNoteRenderContext()
  // Keep Uniques mirror config markers: ids render positional cards, `keep-uniques-re` filters by rule name.
  const filterAttr = coerceFirstString(node?.properties?.[KEEP_UNIQUE_ELEMENT_FILTER_ATTR])
  const filterType = filterAttr === KEEP_UNIQUE_FILTER_REGEXP ? KEEP_UNIQUE_FILTER_REGEXP : KEEP_UNIQUE_FILTER_IDS
  let tokens: MarkerToken[] = []
  let patternRaw = ''
  if (filterType === KEEP_UNIQUE_FILTER_IDS) {
    const rawSpec = coerceFirstString(node?.properties?.[KEEP_UNIQUE_ELEMENT_ATTR]) ?? ''
    tokens = parseMarkerTokens(rawSpec)
    if (tokens.length === 0) return null
  } else {
    patternRaw = coerceFirstString(node?.properties?.[KEEP_UNIQUE_ELEMENT_PATTERN_ATTR]) ?? ''
  }
  const rawIndexAttr = coerceFirstString(node?.properties?.[KEEP_UNIQUE_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  let resolvedEntries: KeepUniqueMarkerEntry[] | undefined
  if (markerIndex != null) {
    resolvedEntries = keepUniqueMarkerResolutions.get(markerIndex)
  }
  if (!resolvedEntries) {
    // Fall back to positional resolution when preview rendering did not precompute this marker (e.g., live edits).
    if (filterType === KEEP_UNIQUE_FILTER_REGEXP) {
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        resolvedEntries = keepUniqueRules
          .map((rule, idx) => ({ rule, idx }))
          .filter(({ rule }) => {
            const name = typeof rule?.name === 'string' ? rule.name : ''
            safeCompiled.lastIndex = 0
            return safeCompiled.test(name)
          })
          .map(({ rule, idx }) => ({ id: idx + 1, rule }))
      } else {
        resolvedEntries = []
      }
    } else {
      let priorLast = 0
      if (markerIndex != null) {
        for (let idx = markerIndex - 1; idx >= 0; idx -= 1) {
          const prev = keepUniqueMarkerResolutions.get(idx)
          if (prev && prev.length > 0) {
            priorLast = prev[prev.length - 1]!.id
            break
          }
        }
      }
      const fallbackEntries: KeepUniqueMarkerEntry[] = []
      let markerLast = priorLast
      for (const token of tokens) {
        let candidate: number | null = null
        if (token.type === 'absolute') {
          candidate = token.value
        } else {
          candidate = markerLast + 1
        }
        if (!candidate || candidate <= 0) continue
        const rule = keepUniqueRules[candidate - 1]
        if (!rule) continue
        fallbackEntries.push({ id: candidate, rule })
        markerLast = candidate
      }
      resolvedEntries = fallbackEntries
    }
  }
  const entries = resolvedEntries ?? []
  if (entries.length === 0) return null
  const { flexBasis, minWidth, maxWidth } = getNoteCardWidthStyles('note')
  return (
    <NoteCardWrap>
      {entries.map(({ id, rule }) => (
        <Box key={`note-ku-${id}`} sx={{ flex: `1 1 ${flexBasis}px`, minWidth, maxWidth }}>
          <KeepUniqueSummaryCard
            id={id}
            rule={rule}
            metasets={metasets}
            t={t}
            lang={lang}
            useStatButtonColors={useStatButtonColors}
            substatColors={substatColors}
          />
        </Box>
      ))}
    </NoteCardWrap>
  )
}

function KeepUniqueSummaryCard({
  id,
  rule,
  metasets,
  t,
  lang,
  useStatButtonColors,
  substatColors,
}: {
  id: number
  rule: KeepUniqueRule
  metasets: Metaset[]
  t: ReturnType<typeof useI18n>['t']
  lang: string
  useStatButtonColors: boolean
  substatColors: Record<number, { fg: string; bg: string }>
}): JSX.Element {
  const theme = useTheme()
  // Scope defaults mirror the dialog so notes stay in sync if count mode is missing.
  const countMode = sanitizeKeepUniqueCountMode(rule.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE)
  const scopeLegendLabel = t('noteKeepUniqueScopeLabel')
  // Scope chips mirror the dialog toggles so markdown exports stay aligned.
  const scopeFlags = [
    { key: 'perRule', label: t('keepUniquesCountModePerRule'), active: countMode.perRule },
    { key: 'perSlot', label: t('keepUniquesCountModePerSlot'), active: countMode.perSlot },
    { key: 'perSet', label: t('keepUniquesCountModePerSet'), active: countMode.perSet },
    { key: 'perFaction', label: t('keepUniquesCountModePerFaction'), active: countMode.perFaction },
    { key: 'perMain', label: t('keepUniquesCountModePerMain'), active: countMode.perMainStat },
  ]
  const activeScopeFlags = scopeFlags.filter((flag) => flag.active)
  // Surface explicit names when present so ordered exports stay recognizable.
  const ruleName = typeof rule.name === 'string' ? rule.name.trim() : ''
  const titleLabel = ruleName || t('noteKeepUniqueRuleTitle', { index: id })
  const formatList = (values: string[]): string => values.join(', ')

  const slotLabels = (() => {
    const sorted = [...(rule.combination.slots ?? [])].sort(compareArtifactTypes)
    if (sorted.length === 0) return []
    return sorted.map((slot) => {
      const key = artifactTypeI18nKey(slot)
      const translated = t(key)
      return translated || (artifactTypeNames[Number(slot)] ?? String(slot))
    })
  })()

  const setLabels = (() => {
    // Normalize include/exclude entries so labels stay deterministic.
    const normalized = normalizeArtifactSetSelections(rule.combination.sets ?? [])
    const split = splitArtifactSetSelections(normalized)
    const included = split.included.slice().sort(compareArtifactSets)
    const excluded = split.excluded.slice().sort(compareArtifactSets)
    const labels: string[] = []
    for (const setId of included) {
      labels.push(getLocalizedGearSetName(setId, t, lang))
    }
    for (const setId of excluded) {
      labels.push(`not ${getLocalizedGearSetName(setId, t, lang)}`)
    }
    return labels
  })()

  const metasetLabels = (() => {
    const ids = rule.combination.metaSetIds ?? []
    const seen = new Set<string>()
    const labels: string[] = []
    ids.forEach((metaId) => {
      if (seen.has(metaId)) return
      seen.add(metaId)
      const meta = metasets.find((item) => item.id === metaId)
      if (!meta) return
      const name = meta.name && meta.name.trim() ? meta.name.trim() : t('menuMetasetsSection')
      labels.push(name)
    })
    return labels
  })()

  const mainLabels = (() => {
    const mains = Array.from(new Set<number>(rule.combination.mainStats ?? []))
    return mains.map((variant) => {
      const key = statVariantI18nKey(variant)
      const translated = t(key)
      const label = translated || String(variant)
      const color = useStatButtonColors ? substatColors[variant]?.fg : undefined
      return { label, color, key: String(variant) }
    })
  })()

  const factionLabels = (() => {
    const factions = Array.from(new Set<number>(rule.combination.factions ?? []))
    return factions.map((factionId) => {
      const key = factionI18nKey(factionId)
      const translated = t(key)
      return translated || String(factionId)
    })
  })()

  const rankLabels = (() => {
    const ranks = Array.from(new Set<number>(rule.combination.ranks ?? []))
    return ranks.map((rank) => `${rank}★`)
  })()

  const rarityLabels = (() => {
    const rarities = Array.from(new Set<number>(rule.combination.rarities ?? []))
    if (rarities.length === 0) return []
    // Format discrete rarity values (1..6) so Mythical renders correctly instead of hitting ≥ Common.
    return rarities.map((rarity) => resolveRarityLabel(t, rarity))
  })()

  const filters: Array<{ label: string; value: React.ReactNode }> = []
  if (slotLabels.length > 0) {
    filters.push({
      label: t('noteKeepUniqueSlotsLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(slotLabels)}
        </Typography>
      ),
    })
  }
  const setsValue = (() => {
    const metaLine = metasetLabels.length > 0 ? (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
        {metasetLabels.join(', ')}
      </Typography>
    ) : null
    const setLine = setLabels.length > 0 ? (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
        {formatList(setLabels)}
      </Typography>
    ) : null
    if (metaLine && setLine) {
      return (
        <Stack spacing={0.1}>
          {metaLine}
          <Typography variant="caption" color="text.disabled" sx={{ fontWeight: 700, lineHeight: 1, pl: 0.25 }}>
            +
          </Typography>
          {setLine}
        </Stack>
      )
    }
    return metaLine ?? setLine
  })()
  if (setsValue) {
    filters.push({
      label: t('noteKeepUniqueSetsLabel'),
      value: setsValue,
    })
  }
  if (mainLabels.length > 0) {
    filters.push({
      label: t('noteKeepUniqueMainLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {mainLabels.map((entry, idx) => (
            <React.Fragment key={`main-${entry.key ?? idx}`}>
              {idx > 0 ? ', ' : null}
              <Box component="span" sx={{ color: entry.color }}>{entry.label}</Box>
            </React.Fragment>
          ))}
        </Typography>
      ),
    })
  }
  if (factionLabels.length > 0) {
    filters.push({
      label: t('noteKeepUniqueFactionsLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(factionLabels)}
        </Typography>
      ),
    })
  }
  if (rankLabels.length > 0) {
    filters.push({
      label: t('noteKeepUniqueRanksLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(rankLabels)}
        </Typography>
      ),
    })
  }
  if (rarityLabels.length > 0) {
    filters.push({
      label: t('noteKeepUniqueRaritiesLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(rarityLabels)}
        </Typography>
      ),
    })
  }

  const renderRow = (
    label: string,
    value: React.ReactNode,
    options: { valueAlign?: 'center' | 'flex-start' } = {},
  ) => (
    <Box
      key={`ku-row-${label}`}
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(90px, 1fr) minmax(0, 2fr)',
        columnGap: 1,
        alignItems: options.valueAlign === 'center' ? 'center' : 'flex-start',
      }}
    >
      <Typography variant="caption" sx={{ ...NOTE_CARD_LABEL_TEXT_SX, textAlign: 'right' }}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>{value}</Box>
    </Box>
  )

  // Layout keeps the quota line anchored while letting cards wrap into two columns.
  return (
    <Box
      sx={{
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        p: 1.25,
        bgcolor: 'background.paper',
      }}
    >
        <Stack spacing={0} sx={{ width: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 0.35, alignItems: 'center', flexWrap: 'wrap', width: 1 }}>
            <Typography
            variant="subtitle2"
            component="p"
            sx={{
              fontWeight: 700,
              wordBreak: 'break-word',
              lineHeight: 1,
              fontSize: '0.9rem',
              flex: '1 1 auto',
              minWidth: 0,
              m: 0,
              p: 0,
              mt: 0,
              mb: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {titleLabel}
          </Typography>
          {rule.activation === KeepUniqueRuleActivation.Off ? (
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.35,
                px: 0.4,
                py: 0.2,
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'text.disabled' }} />
              <Typography component="span" variant="caption" color="text.disabled" sx={{ fontWeight: 700 }}>
                {t('noteKeepUniqueRuleDisabled')}
              </Typography>
            </Box>
          ) : null}
        </Box>
        <Stack spacing={0.35} sx={{ mt: 0.35 }}>
          {renderRow(
            t('noteKeepUniqueQuotaLabel'),
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
              {/* Scope details live in the Scope row to avoid repetition. */}
              {t('noteKeepUniqueQuotaValue', { count: rule.requiredCount })}
            </Typography>,
            { valueAlign: 'center' },
          )}
          {renderRow(
            scopeLegendLabel,
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              {activeScopeFlags.map((flag) => (
                <Box
                  key={`ku-scope-${flag.key}`}
                  sx={buildNoteScopeChipSx(theme, flag.active)}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {flag.label}
                  </Typography>
                </Box>
              ))}
            </Box>,
          )}
          {filters.map((item) => renderRow(
            item.label,
            item.value,
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}

// Capture the note text for the disable-confirm dialog.
type DisableConfigOptionsContext = {
  noteText: string
}

export default function NoteDialog({
  open,
  mode,
  note,
  onChange,
  onClose,
  onRequestEdit,
  onRequestView,
  configOptionsAnswers,
  onConfigOptionsAnswersChange,
  configOptionsDisabled,
  onConfigOptionsDisabledChange,
  onApplyConfigOptionsOverrides,
  configs,
  metasets,
  keepUniqueRules,
  useStatButtonColors,
  substatColors,
  hideEditButton,
}: {
  open: boolean
  mode: 'view' | 'edit'
  note: string
  onChange: (value: string, options?: { mode?: 'edit' | 'clear' }) => void
  onClose: () => void
  onRequestEdit: () => void
  onRequestView: () => void
  configOptionsAnswers: NoteConfigOptionsAnswers
  onConfigOptionsAnswersChange: React.Dispatch<React.SetStateAction<NoteConfigOptionsAnswers>>
  configOptionsDisabled: boolean
  onConfigOptionsDisabledChange: React.Dispatch<React.SetStateAction<boolean>>
  // Optional callback for applying the current config options to stored configs.
  onApplyConfigOptionsOverrides: (instructions: ConfigOptionsInstructions) => void
  configs: BuilderConfig[]
  metasets: Metaset[]
  keepUniqueRules: KeepUniqueRule[]
  useStatButtonColors: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  // Hide the edit entry point when the dialog auto-opens after HSFC load.
  hideEditButton: boolean
}) {
  const { t, lang } = useI18n()
  const editCommitRef = useRef<() => void>(() => onClose())
  const deferredNote = useDeferredValue(note)
  // View-only renders lean on the deferred snapshot so toggling loads does not stutter the dialog content.
  const renderNote = mode === 'view' ? deferredNote : note
  const notePending = mode === 'view' && deferredNote !== note
  // Resolve config markers for embedded config chips.
  const markerResolutions = useMemo(() => buildConfigMarkerResolutions(renderNote ?? '', configs), [renderNote, configs])
  // Resolve keep-unique markers for embedded rule summaries.
  const keepUniqueMarkerResolutions = useMemo(
    () => buildKeepUniqueMarkerResolutions(renderNote ?? '', keepUniqueRules),
    [renderNote, keepUniqueRules],
  )
  // Map marker indices to question definitions for rendering.
  const configOptionsSignature = useMemo(
    () => buildNoteConfigOptionsSignature(renderNote ?? ''),
    [renderNote],
  )
  // Flag whether the current note includes config options markers.
  const hasConfigOptionsMarkers = configOptionsSignature !== '[]'
  // Resolve config options markers so disabled state can still render dimmed cards.
  const configOptionsResolutions = useMemo(
    () => buildConfigOptionsMarkerResolutions(renderNote ?? '', configOptionsAnswers),
    [configOptionsAnswers, renderNote],
  )
  // Reset answers by clearing stored overrides back to defaults and re-enabling parsing.
  const handleResetConfigOptionsAnswers = React.useCallback(() => {
    onConfigOptionsDisabledChange(false)
    onConfigOptionsAnswersChange(() => ({}))
  }, [onConfigOptionsAnswersChange, onConfigOptionsDisabledChange])
  const handleEnableConfigOptions = React.useCallback(() => {
    onConfigOptionsDisabledChange(false)
  }, [onConfigOptionsDisabledChange])
  // Anchor the config options action menu in view mode.
  const [viewConfigOptionsMenuAnchor, setViewConfigOptionsMenuAnchor] = useState<HTMLElement | null>(null)
  // Flag whether the view-mode config options menu is open.
  const viewConfigOptionsMenuOpen = Boolean(viewConfigOptionsMenuAnchor)
  // Open the view-mode config options menu from the button anchor.
  const openViewConfigOptionsMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setViewConfigOptionsMenuAnchor(event.currentTarget)
  }, [])
  // Close the view-mode config options menu without applying changes.
  const closeViewConfigOptionsMenu = React.useCallback(() => {
    setViewConfigOptionsMenuAnchor(null)
  }, [])
  // Hold the disable dialog context so view + edit can share one confirm flow.
  const [disableConfigOptionsContext, setDisableConfigOptionsContext] = useState<DisableConfigOptionsContext | null>(null)
  // Open the disable confirm dialog with the latest note snapshot.
  const openDisableConfigOptionsDialog = React.useCallback((noteText: string) => {
    setDisableConfigOptionsContext({ noteText })
  }, [])
  // Close the confirm dialog without mutating note/config state.
  const closeDisableConfigOptionsDialog = React.useCallback(() => {
    setDisableConfigOptionsContext(null)
  }, [])
  // Apply or discard config options before disabling them in the session.
  const handleDisableConfigOptionsConfirm = React.useCallback((applyToConfigs: boolean) => {
    const context = disableConfigOptionsContext
    if (!context) return
    // Resolve instructions from the requested note snapshot + stored answers.
    const resolution = resolveConfigOptionsTags(context.noteText ?? '', configOptionsAnswers)
    // Apply the overrides to stored configs when requested.
    if (applyToConfigs) {
      onApplyConfigOptionsOverrides(resolution.instructions)
    }
    // Disable config options parsing so markers are ignored.
    onConfigOptionsDisabledChange(true)
    // Close the confirm dialog after applying changes.
    setDisableConfigOptionsContext(null)
  }, [
    configOptionsAnswers,
    disableConfigOptionsContext,
    onApplyConfigOptionsOverrides,
    onConfigOptionsDisabledChange,
  ])
  const handleConfigOptionsAnswerChange = React.useCallback((
    question: NoteQuestionDefinition,
    nextSelection: string[],
  ) => {
    // Normalize to sets for default comparisons.
    const defaultSet = new Set(question.defaultAnswer)
    const nextSet = new Set(nextSelection)
    const sameSize = defaultSet.size === nextSet.size
    const matchesDefault = sameSize && Array.from(defaultSet).every((id) => nextSet.has(id))
    // Keep answers ordered by option definition.
    const orderedSelection = question.options
      .filter((option) => nextSet.has(option.id))
      .map((option) => option.id)
    onConfigOptionsAnswersChange((prev) => {
      const next = { ...prev }
      // Default selections are omitted from storage.
      if (matchesDefault) {
        delete next[question.id]
        return next
      }
      // Persist non-default answers.
      next[question.id] = orderedSelection
      return next
    })
  }, [onConfigOptionsAnswersChange])
  const contextValue = useMemo<NoteRenderContextValue>(
    () => ({
      configs,
      metasets,
      substatColors,
      useStatButtonColors,
      markerResolutions,
      keepUniqueRules,
      keepUniqueMarkerResolutions,
      configOptionsResolutions,
      configOptionsEditable: mode === 'view' && !configOptionsDisabled,
      configOptionsDisabled,
      onConfigOptionsAnswerChange: handleConfigOptionsAnswerChange,
    }),
    [
      configs,
      metasets,
      substatColors,
      useStatButtonColors,
      markerResolutions,
      keepUniqueRules,
      keepUniqueMarkerResolutions,
      configOptionsResolutions,
      configOptionsDisabled,
      mode,
      handleConfigOptionsAnswerChange,
    ],
  )
  const allowMarkdownElement = React.useCallback<MarkdownAllowElement>((element) => {
    const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
    if (tag === CONFIG_ELEMENT_TAG || tag === KEEP_UNIQUE_ELEMENT_TAG || tag === QUESTION_ELEMENT_TAG || tag === QUESTION_GROUP_ELEMENT_TAG) return true
    return DEFAULT_ALLOWED_TAG_REGEX.test(tag)
  }, [])
  // Memoized sanitize schema and plugins for performance during typing.
  type Primitive = string | number | boolean | RegExp | null | undefined
  type SanitizeProp = string | [string, ...Primitive[]]
  const sanitizeSchema: Schema = useMemo(() => {
    const baseAttrs = (defaultSchema.attributes ?? {}) as Record<string, SanitizeProp[]>
    const spanAttrs: SanitizeProp[] = Array.isArray(baseAttrs.span) ? baseAttrs.span : []
    const configAttrs: SanitizeProp[] = Array.isArray(baseAttrs[CONFIG_ELEMENT_TAG]) ? baseAttrs[CONFIG_ELEMENT_TAG] : []
    const keepUniqueAttrs: SanitizeProp[] = Array.isArray(baseAttrs[KEEP_UNIQUE_ELEMENT_TAG]) ? baseAttrs[KEEP_UNIQUE_ELEMENT_TAG] : []
    const questionAttrs: SanitizeProp[] = Array.isArray(baseAttrs[QUESTION_ELEMENT_TAG]) ? baseAttrs[QUESTION_ELEMENT_TAG] : []
    const mergedConfigAttrs = Array.from(new Set<SanitizeProp>([
      ...configAttrs,
      CONFIG_ELEMENT_ATTR,
      CONFIG_ELEMENT_PATTERN_ATTR,
      CONFIG_ELEMENT_FILTER_ATTR,
      CONFIG_ELEMENT_INDEX_ATTR,
    ]))
    const mergedKeepUniqueAttrs = Array.from(new Set<SanitizeProp>([
      ...keepUniqueAttrs,
      KEEP_UNIQUE_ELEMENT_ATTR,
      KEEP_UNIQUE_ELEMENT_FILTER_ATTR,
      KEEP_UNIQUE_ELEMENT_PATTERN_ATTR,
      KEEP_UNIQUE_ELEMENT_INDEX_ATTR,
    ]))
    const mergedQuestionAttrs = Array.from(new Set<SanitizeProp>([
      ...questionAttrs,
      QUESTION_ELEMENT_INDEX_ATTR,
    ]))
    return {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        span: [...spanAttrs, 'data-color', 'dataColor'],
        [CONFIG_ELEMENT_TAG]: mergedConfigAttrs,
        [KEEP_UNIQUE_ELEMENT_TAG]: mergedKeepUniqueAttrs,
        [QUESTION_ELEMENT_TAG]: mergedQuestionAttrs,
      },
      tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), 'span', CONFIG_ELEMENT_TAG, KEEP_UNIQUE_ELEMENT_TAG, QUESTION_ELEMENT_TAG, QUESTION_GROUP_ELEMENT_TAG])),
    }
  }, [])
  const rehypePluginsSafe = useMemo<Pluggable[]>(() => (
    [
      rehypeConfigComments,
      rehypeKeepUniqueComments,
      rehypeQuestionComments,
      rehypeQuestionGroups,
      [rehypeSanitize, sanitizeSchema] as unknown as Pluggable,
    ]
  ), [sanitizeSchema])
  const markdownComponents = useMemo<MarkdownComponentMap>(() => ({
    [CONFIG_ELEMENT_TAG]: ConfigChipBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [KEEP_UNIQUE_ELEMENT_TAG]: KeepUniqueBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [QUESTION_ELEMENT_TAG]: NoteQuestionBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [QUESTION_GROUP_ELEMENT_TAG]: NoteQuestionGroup as unknown as React.ComponentType<Record<string, unknown>>,
  }), [])

  if (mode !== 'edit') {
    // Non-edit modes should always commit by closing immediately.
    editCommitRef.current = onClose
  }

  const handleDialogClose = React.useCallback(() => {
    try { editCommitRef.current() } catch { onClose() }
  }, [onClose])

  return (
    <NoteRenderContext.Provider value={contextValue}>
      <Dialog
        open={open}
        onClose={handleDialogClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: NOTE_DIALOG_PAPER_SX }}
      >
      <DialogTitle>{t('noteTitle')}</DialogTitle>
      {mode === 'view'
        ? (
          <>
            <DialogContent
              dividers
              sx={{
                position: 'relative',
                // Let the content expand to fill the fixed dialog height.
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              {notePending ? (
                <LinearProgress
                  sx={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                  }}
                />
              ) : null}
              <Box
                data-allow-select={1 as const}
                data-allow-context={1 as const}
                data-color-mode={('dark' as const)}
                sx={{
                  // Stretch the preview to fill the dialog body.
                  flex: 1,
                  minHeight: 0,
                  bgcolor: NOTE_EDITOR_BG_COLOR,
                  '& .wmde-markdown img': { backgroundColor: 'transparent' },
                  borderRadius: 1,
                  px: 2,
                  py: 2,
                  overflow: 'auto',
                  '& .wmde-markdown': { bgcolor: 'transparent', fontSize: FONT_SIZE_MARKDOWN_PX, lineHeight: 1.7 },
                  ...NOTE_COLOR_SX_SELECTORS,
                }}
              >
                <MDEditor.Markdown
                  source={renderNote ?? ''}
                  rehypePlugins={rehypePluginsSafe as unknown as NonNullable<React.ComponentProps<typeof MDEditor.Markdown>['rehypePlugins']>}
                  components={markdownComponents as unknown as Components}
                  allowElement={allowMarkdownElement}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', width: '100%', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  {!hideEditButton ? (
                    // Switch to edit mode without closing the dialog.
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={onRequestEdit}
                      sx={{ height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
                    >
                      {t('editNote')}
                    </Button>
                  ) : null}
                  {hasConfigOptionsMarkers ? (
                    <>
                      {/* Group config options actions under a compact menu. */}
                      <Button
                        size="small"
                        variant="outlined"
                        endIcon={<ExpandMoreIcon fontSize="small" />}
                        onClick={openViewConfigOptionsMenu}
                        sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
                        aria-haspopup="true"
                        aria-controls={viewConfigOptionsMenuOpen ? 'note-config-options-menu-view' : undefined}
                        aria-expanded={viewConfigOptionsMenuOpen ? 'true' : undefined}
                      >
                        {t('noteConfigOptionsMenu')}
                      </Button>
                      <Menu
                        id="note-config-options-menu-view"
                        anchorEl={viewConfigOptionsMenuAnchor}
                        open={viewConfigOptionsMenuOpen}
                        onClose={closeViewConfigOptionsMenu}
                        MenuListProps={{ dense: true }}
                      >
                        <MenuItem
                          onClick={() => {
                            closeViewConfigOptionsMenu()
                            handleResetConfigOptionsAnswers()
                          }}
                        >
                          {t('noteConfigOptionsResetDefaults')}
                        </MenuItem>
                        <MenuItem
                          onClick={() => {
                            closeViewConfigOptionsMenu()
                            if (configOptionsDisabled) {
                              handleEnableConfigOptions()
                            } else {
                              openDisableConfigOptionsDialog(note ?? '')
                            }
                          }}
                        >
                          {configOptionsDisabled ? t('noteConfigOptionsEnable') : t('noteConfigOptionsDisable')}
                        </MenuItem>
                      </Menu>
                    </>
                  ) : null}
                </Box>
                <Button onClick={onClose}>{t('close')}</Button>
              </Box>
            </DialogActions>
          </>
        )
        : (
          <NoteEditorContent
            note={note}
            t={t}
            lang={lang}
            rehypePluginsSafe={rehypePluginsSafe}
            onChange={onChange}
            onClose={onClose}
            registerCommit={(fn) => { editCommitRef.current = fn }}
            onRequestView={onRequestView}
            onResetConfigOptionsAnswers={handleResetConfigOptionsAnswers}
            onOpenDisableConfigOptionsDialog={openDisableConfigOptionsDialog}
            configOptionsDisabled={configOptionsDisabled}
            onConfigOptionsDisabledChange={onConfigOptionsDisabledChange}
            configs={configs}
            metasets={metasets}
            keepUniqueRules={keepUniqueRules}
            configOptionsAnswers={configOptionsAnswers}
            markdownComponents={markdownComponents}
            allowElement={allowMarkdownElement}
          />
        )}
      </Dialog>
      <Dialog open={Boolean(disableConfigOptionsContext)} onClose={closeDisableConfigOptionsDialog}>
        <DialogTitle>{t('noteConfigOptionsDisableConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('noteConfigOptionsDisableConfirmBody')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDisableConfigOptionsDialog}>{t('cancel')}</Button>
          <Button variant="outlined" onClick={() => handleDisableConfigOptionsConfirm(false)}>
            {t('noteConfigOptionsDisableConfirmDisable')}
          </Button>
          <Button variant="contained" onClick={() => handleDisableConfigOptionsConfirm(true)}>
            {t('noteConfigOptionsDisableConfirmApply')}
          </Button>
        </DialogActions>
      </Dialog>
    </NoteRenderContext.Provider>
  )
}

function NoteEditorContent({
  note,
  t,
  lang,
  rehypePluginsSafe,
  onChange,
  onClose,
  registerCommit,
  onRequestView,
  onResetConfigOptionsAnswers,
  onOpenDisableConfigOptionsDialog,
  configOptionsDisabled,
  onConfigOptionsDisabledChange,
  configs,
  metasets,
  keepUniqueRules,
  configOptionsAnswers,
  markdownComponents,
  allowElement,
}: {
  note: string
  t: ReturnType<typeof useI18n>['t']
  lang: string
  rehypePluginsSafe: Pluggable[]
  onChange: (value: string, options?: { mode?: 'edit' | 'clear' }) => void
  onClose: () => void
  registerCommit: (fn: () => void) => void
  onRequestView: () => void
  // Reset config options answers back to defaults.
  onResetConfigOptionsAnswers: () => void
  // Open the disable-confirm dialog with a draft update hook.
  onOpenDisableConfigOptionsDialog: (noteText: string) => void
  // Disable config options parsing without editing the note text.
  configOptionsDisabled: boolean
  onConfigOptionsDisabledChange: (next: boolean) => void
  configs: BuilderConfig[]
  metasets: Metaset[]
  keepUniqueRules: KeepUniqueRule[]
  configOptionsAnswers: NoteConfigOptionsAnswers
  markdownComponents: MarkdownComponentMap
  allowElement: MarkdownAllowElement
}) {
  const editWrapRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RefMDEditor | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Anchor the config options menu for edit-mode actions.
  const [editConfigOptionsMenuAnchor, setEditConfigOptionsMenuAnchor] = useState<HTMLElement | null>(null)
  // Track whether the edit-mode config options menu is open.
  const editConfigOptionsMenuOpen = Boolean(editConfigOptionsMenuAnchor)
  // Open the edit-mode config options menu at the clicked button.
  const openEditConfigOptionsMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setEditConfigOptionsMenuAnchor(event.currentTarget)
  }, [])
  // Close the edit-mode config options menu without taking action.
  const closeEditConfigOptionsMenu = React.useCallback(() => {
    setEditConfigOptionsMenuAnchor(null)
  }, [])
  const [draft, setDraft] = useState<string>(note ?? '')
  // Track config options changes so the view-mode button can signal edits.
  const baseConfigOptionsSignature = useMemo(
    () => buildNoteConfigOptionsSignature(note ?? ''),
    [note],
  )
  const draftConfigOptionsSignature = useMemo(
    () => buildNoteConfigOptionsSignature(draft ?? ''),
    [draft],
  )
  // Flag when questions were added/removed/changed in the draft.
  const configOptionsChanged = baseConfigOptionsSignature !== draftConfigOptionsSignature
  // Disable view mode when the draft is empty.
  const draftIsEmpty = !draft.trim()
  const baseContext = useNoteRenderContext()
  // Resolve config markers inside the editor preview.
  const editorMarkerResolutions = useMemo(() => buildConfigMarkerResolutions(draft ?? '', configs), [draft, configs])
  // Resolve keep-unique markers inside the editor preview.
  const editorKeepUniqueMarkerResolutions = useMemo(
    () => buildKeepUniqueMarkerResolutions(draft ?? '', keepUniqueRules),
    [draft, keepUniqueRules],
  )
  // Resolve config options markers without making them interactive.
  const editorConfigOptionsResolutions = useMemo(
    () => buildConfigOptionsMarkerResolutions(draft ?? '', configOptionsAnswers),
    [configOptionsAnswers, draft],
  )
  // Track whether the draft still contains config options markers.
  const configOptionsSignature = useMemo(
    () => buildNoteConfigOptionsSignature(draft ?? ''),
    [draft],
  )
  const hasConfigOptionsMarkers = configOptionsSignature !== '[]'
  // Reset answers without mutating the draft text.
  const handleResetConfigOptions = React.useCallback(() => {
    onConfigOptionsDisabledChange(false)
    onResetConfigOptionsAnswers()
  }, [onConfigOptionsDisabledChange, onResetConfigOptionsAnswers])
  // Open the disable-confirm dialog and hand it the latest draft snapshot.
  const handleDisableConfigOptions = React.useCallback(() => {
    onOpenDisableConfigOptionsDialog(draft ?? '')
  }, [draft, onOpenDisableConfigOptionsDialog])
  const handleEnableConfigOptions = React.useCallback(() => {
    onConfigOptionsDisabledChange(false)
  }, [onConfigOptionsDisabledChange])
  // Ignore answer updates in edit mode so markers stay read-only.
  const ignoreConfigOptionsAnswerChange = React.useCallback(() => {}, [])
  const editorContextValue = useMemo<NoteRenderContextValue>(
    () => ({
      ...baseContext,
      markerResolutions: editorMarkerResolutions,
      keepUniqueMarkerResolutions: editorKeepUniqueMarkerResolutions,
      keepUniqueRules,
      configOptionsResolutions: editorConfigOptionsResolutions,
      configOptionsEditable: false,
      onConfigOptionsAnswerChange: ignoreConfigOptionsAnswerChange,
    }),
    [
      baseContext,
      editorMarkerResolutions,
      editorKeepUniqueMarkerResolutions,
      editorConfigOptionsResolutions,
      keepUniqueRules,
      ignoreConfigOptionsAnswerChange,
    ],
  )

  const commitAndClose = React.useCallback(() => {
    try { onChange(draft, { mode: 'edit' }) } catch {}
    onClose()
  }, [draft, onChange, onClose])
  const commitAndView = React.useCallback(() => {
    // Persist the draft before switching to view mode.
    try { onChange(draft, { mode: 'edit' }) } catch {}
    // Keep the dialog open while toggling to view mode.
    onRequestView()
  }, [draft, onChange, onRequestView])

  registerCommit(commitAndClose)

  const configCommand = useMemo<ICommand>(() => ({
    name: 'insert-configs',
    keyCommand: 'insert-configs',
    groupName: 'note-inserts',
    // Toolbar tooltips should surface the localized insert label.
    buttonProps: { 'aria-label': t('noteInsertConfigs'), title: t('noteInsertConfigs') },
    icon: <LocalOfferIcon fontSize="small" />,
    execute: (state, api) => {
      if (!configs.length) return
      const text = state.text ?? ''
      const allIds = configs.map((_, idx) => idx + 1)
      const usedIds = collectConfigIds(text, configs)
      const missing = allIds.filter((id) => !usedIds.has(id))
      const markerIds = missing.length ? missing : allIds
      if (!markerIds.length) return
      const { block, cursorIndex } = buildConfigMarkerBlock(markerIds)
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block, cursorIndex)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [configs, setDraft, t])

  const keepUniqueCommand = useMemo<ICommand>(() => ({
    name: 'insert-keep-uniques',
    keyCommand: 'insert-keep-uniques',
    groupName: 'note-inserts',
    // Keep-unique markers stay discoverable with a dedicated insert label.
    buttonProps: { 'aria-label': t('noteInsertKeepUniques'), title: t('noteInsertKeepUniques') },
    icon: <StarsIcon fontSize="small" />,
    execute: (state, api) => {
      if (!keepUniqueRules.length) return
      const text = state.text ?? ''
      const allIds = keepUniqueRules.map((_, idx) => idx + 1)
      const usedIds = collectKeepUniqueIds(text, keepUniqueRules)
      const missing = allIds.filter((id) => !usedIds.has(id))
      const markerIds = missing.length ? missing : allIds
      if (!markerIds.length) return
      const { block, cursorIndex } = buildKeepUniqueMarkerBlock(markerIds)
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block, cursorIndex)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [keepUniqueRules, setDraft, t])

  const configOptionsSampleCommand = useMemo<ICommand>(() => ({
    name: 'insert-configOptions-sample',
    keyCommand: 'insert-configOptions-sample',
    groupName: 'note-inserts',
    // ConfigOptions samples belong to the same insert block in the toolbar.
    buttonProps: { 'aria-label': t('noteInsertConfigOptionsSample'), title: t('noteInsertConfigOptionsSample') },
    icon: <QuizIcon fontSize="small" />,
    execute: (state, api) => {
      // Insert a sample block at the cursor for quick onboarding.
      const text = state.text ?? ''
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const block = buildConfigOptionsSampleBlock()
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [setDraft, t])

  const metasetCommand = useMemo<ICommand>(() => (
    // Reuse the metaset insert builder but attach toolbar visuals locally.
    ({
      ...buildMetasetInsertCommand({ metasets, t, lang, setDraft }),
      groupName: 'note-inserts',
      buttonProps: { 'aria-label': t('noteInsertMetasets'), title: t('noteInsertMetasets') },
      icon: <ViewListIcon fontSize="small" />,
    })
  ), [lang, metasets, t, setDraft])

  // Track the latest draft/onChange so unload hooks flush once without resubscribing.
  const flushRef = useRef<() => void>(() => {
    try { onChange(draft, { mode: 'edit' }) } catch {}
  })
  flushRef.current = () => {
    try { onChange(draft, { mode: 'edit' }) } catch {}
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const ta = editWrapRef.current?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
        ta?.focus()
      } catch {}
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const flush = () => { flushRef.current() }
    const onVis = () => { if (document.hidden) flushRef.current() }
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  const colorCommand: ICommand = useMemo(() => ({
    name: 'color',
    keyCommand: 'group',
    groupName: 'color',
    buttonProps: { 'aria-label': t('mdColor') },
    icon: (
      <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label="Color">
        <circle cx="6" cy="6" r="5" fill="#42a5f5" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
    children: (handle) => (
      <div style={{ display: 'flex', gap: 6, padding: '6px 8px', maxWidth: 220, flexWrap: 'wrap' }}>
        {(Object.keys(NOTE_COLOR_HEX) as Array<keyof typeof NOTE_COLOR_HEX>).map((c) => (
          // Color swatches now share the same Markdown-friendly tooltip, which helps translators add inline formatting.
          <MarkdownTooltip key={c} markdown={t('noteColorTooltip', { name: String(c) })} placement="bottom">
            <button
              type="button"
              aria-label={`${t('mdColor')} ${String(c)}`}
              onClick={() => {
              const state = handle.getState?.()
              const selected = state && state.selectedText ? state.selectedText : 'text'
              const selStart = state && state.selection ? state.selection.start : 0
              const open = `<span data-color="${String(c)}">`
              const close = '</span>'
              const api = handle.textApi
              if (api) {
                api.replaceSelection(open + selected + close)
                // After wrapping, place selection inside the span (around original text)
                api.setSelectionRange({ start: selStart + open.length, end: selStart + open.length + selected.length })
              }
              handle.close()
              }}
              style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, backgroundColor: NOTE_COLOR_HEX[c] }} />
            </button>
          </MarkdownTooltip>
        ))}
      </div>
    ),
  }), [t])
  const toolbarCommands = useMemo(() => {
    const base = getCommands()
    // Insert the color palette just before the HR command.
    const idxHr = base.findIndex((command) => command.keyCommand === 'hr')
    const insertColorAt = idxHr >= 0 ? idxHr : base.length
    const withColor = base.slice()
    withColor.splice(insertColorAt, 0, colorCommand)
    // Group note insert actions between the title dropdown and the link button.
    const idxTitle = withColor.findIndex((command) => command.keyCommand === 'title')
    const idxLink = withColor.findIndex((command) => command.keyCommand === 'link')
    // When the default divider after title exists, we insert before it so it becomes the trailing separator.
    const idxDividerAfterTitle = idxTitle >= 0
      ? withColor.findIndex((command, idx) => idx > idxTitle && command.keyCommand === 'divider')
      : -1
    // Default to positioning right after the title dropdown; fall back to the link position.
    const insertNoteAt = idxDividerAfterTitle >= 0
      ? idxDividerAfterTitle
      : (idxTitle >= 0 ? idxTitle + 1 : (idxLink >= 0 ? idxLink : withColor.length))
    const withNoteInserts = withColor.slice()
    // Leading divider ensures the insert block reads as its own toolbar section.
    const noteInsertBlock = [
      commands.divider,
      configCommand,
      keepUniqueCommand,
      metasetCommand,
      configOptionsSampleCommand,
    ]
    // If there is no divider after the title group, add a trailing divider manually.
    if (idxDividerAfterTitle < 0 && idxLink >= 0) {
      noteInsertBlock.push(commands.divider)
    }
    withNoteInserts.splice(insertNoteAt, 0, ...noteInsertBlock)
    return withNoteInserts
  }, [
    colorCommand,
    configCommand,
    keepUniqueCommand,
    metasetCommand,
    configOptionsSampleCommand,
  ])

  return (
    <>
      <DialogContent
        dividers
        sx={{
          // Let the editor fill the fixed dialog height.
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Match the markdown editor chrome to the dark preview so text stays legible in edit mode. */}
        <Box
          ref={editWrapRef}
          data-allow-select={1 as const}
          data-allow-context={1 as const}
          data-color-mode={('dark' as const)}
          sx={{
            // Stretch the editor shell to fill the dialog body.
            flex: 1,
            minHeight: 0,
            '& .w-md-editor': {
              // Keep layout defaults from the editor so text overlay math stays correct.
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`,
              lineHeight: '1.7 !important',
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text-pre': {
              // Match the textarea font sizing so highlights overlay 1:1.
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`,
              lineHeight: '1.7 !important',
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text-pre code': { fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`, lineHeight: '1.7 !important' },
            '& .w-md-editor .w-md-editor-text-input': {
              // Keep the input sizing consistent with the pre tag.
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              lineHeight: 1.7,
              backgroundColor: 'transparent',
              color: 'inherit',
              borderColor: (theme) => theme.palette.divider,
              caretColor: (theme) => theme.palette.text.primary,
            },
            '& .w-md-editor .w-md-editor-content': {
              // Keep sizing controlled by the editor height prop to avoid desync.
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
            },
            '& .w-md-editor .w-md-editor-preview': {
              // Preserve default preview layout so overlays align with selections.
              backgroundColor: `${NOTE_EDITOR_BG_COLOR} !important`,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .wmde-markdown': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              lineHeight: 1.7,
              color: (theme) => `${theme.palette.text.primary} !important`,
            },
            '& .wmde-markdown img': { backgroundColor: 'transparent' },
            '& .w-md-editor .w-md-editor-toolbar': { padding: '6px' },
            '& .w-md-editor .w-md-editor-toolbar li': { fontSize: `${FONT_SIZE_SECONDARY_PX}px` },
            '& .w-md-editor .w-md-editor-toolbar li button': {
              height: '30px',
              lineHeight: '22px',
              padding: '6px 8px',
              margin: '0 2px',
              borderRadius: '4px',
            },
            '& .w-md-editor .w-md-editor-toolbar li button svg': { width: 18, height: 18 },
            '& .w-md-editor .w-md-editor-toolbar-divider': { height: '18px', margin: '-3px 6px 0 6px !important' },
            ...NOTE_COLOR_SX_SELECTORS,
          }}
          onMouseDownCapture={(e) => {
            try {
              const root = editWrapRef.current
              const ta = root?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
              if (!ta) return
              const target = e.target as HTMLElement | null
              const inToolbar = Boolean(target && target.closest('.w-md-editor-toolbar'))
              if (!inToolbar) return
              const selStart = ta.selectionStart ?? 0
              const selEnd = ta.selectionEnd ?? selStart
              if (selEnd <= selStart) return
              const text = ta.value
              let s = selStart
              let t = selEnd
              const isWs = (ch: string) => /\s/.test(ch)
              while (s < t && isWs(text.charAt(s))) s++
              while (t > s && isWs(text.charAt(t - 1))) t--
              if (s !== selStart || t !== selEnd) {
                try { ta.setSelectionRange(s, t) } catch {}
              }
            } catch {}
          }}
          onMouseDown={(e) => {
            try {
              const root = editWrapRef.current
              const ta = root?.querySelector('.w-md-editor-text-input') as HTMLTextAreaElement | null
              if (!ta) return
              const target = e.target as HTMLElement | null
              const inToolbar = Boolean(target && target.closest('.w-md-editor-toolbar'))
              if (inToolbar) return
              window.setTimeout(() => {
                if (document.activeElement !== ta) ta.focus()
                if (!(e.target instanceof HTMLTextAreaElement)) {
                  const len = ta.value.length
                  try { ta.setSelectionRange(len, len) } catch {}
                }
              }, 0)
            } catch {}
          }}
        >
          {(() => (
            <NoteRenderContext.Provider value={editorContextValue}>
              <MDEditor
                ref={editorRef}
                value={draft}
                onChange={(v) => setDraft(v ?? '')}
                // Force the editor to fill the dialog body, avoiding the 200px default.
                height="100%"
                // Disable the dragbar so the fixed dialog height remains authoritative.
                visibleDragbar={false}
                // Still set style height as a safety net for inline layout.
                style={{ height: '100%' }}
                previewOptions={{
                  rehypePlugins: rehypePluginsSafe,
                  components: markdownComponents as unknown as Components,
                  allowElement,
                }}
                commands={toolbarCommands}
                components={{
                  toolbar: (command, disabled, executeCommand) => {
                    try {
                      if (command?.keyCommand === 'divider') return undefined
                      const btnProps = (command?.buttonProps || {}) as React.ButtonHTMLAttributes<HTMLButtonElement>
                      const raw = (btnProps.title || btnProps['aria-label'] || command?.name || '') as string
                      const l = String(raw).toLowerCase()
                      const label = (
                        l.includes('bold') ? t('mdBold') :
                        l.includes('italic') ? t('mdItalic') :
                        l.includes('strike') ? t('mdStrikethrough') :
                        l === 'title' || l.includes('heading') ? t('mdHeading') :
                        l.includes('quote') ? t('mdQuote') :
                        l.includes('code') ? t('mdCode') :
                        l.includes('link') ? t('mdLink') :
                        l.includes('image') ? t('mdImage') :
                        l.includes('unordered') || l.includes('bullet') ? t('mdUnorderedList') :
                        l.includes('ordered') || l.includes('numbered') ? t('mdOrderedList') :
                        l.includes('checked') || l.includes('task') ? t('mdCheckedList') :
                        l.includes('divider') || l === 'hr' ? t('mdDivider') :
                        l.includes('preview') ? t('mdPreview') :
                        l.includes('fullscreen') ? t('mdFullscreen') :
                        l.includes('color') ? t('mdColor') : raw
                      )
                      return (
                        // MarkdownTooltip keeps every toolbar command consistent (some strings contain Markdown tokens already).
                        <MarkdownTooltip markdown={label} placement="bottom">
                          <button
                            type="button"
                            aria-label={label || undefined}
                            disabled={Boolean(disabled)}
                            onClick={(evn) => {
                              evn.stopPropagation()
                              const cmd = command as ICommand
                              executeCommand?.(cmd, cmd.groupName)
                            }}
                          >
                            {command?.icon}
                          </button>
                        </MarkdownTooltip>
                      )
                    } catch {
                      return undefined
                    }
                  },
                }}
              />
            </NoteRenderContext.Provider>
          ))()}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Warn when config options markers changed during this edit session. */}
          <MarkdownTooltip
            markdown={t('noteConfigOptionsChangedTooltip')}
            disableHoverListener={!configOptionsChanged}
          >
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <Badge
                overlap="rectangular"
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                invisible={!configOptionsChanged}
                sx={warningBadgeSx}
                badgeContent="!"
              >
                {/* Match the view-mode edit button styling for symmetry. */}
                <Button
                  variant="outlined"
                  onClick={commitAndView}
                  disabled={draftIsEmpty}
                >
                  {t('viewNote')}
                </Button>
              </Badge>
            </Box>
          </MarkdownTooltip>
          {hasConfigOptionsMarkers ? (
            <>
              {/* Keep config options actions behind a single menu button. */}
              <Button
                size="small"
                variant="outlined"
                endIcon={<ExpandMoreIcon fontSize="small" />}
                onClick={openEditConfigOptionsMenu}
                sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
                aria-haspopup="true"
                aria-controls={editConfigOptionsMenuOpen ? 'note-config-options-menu-edit' : undefined}
                aria-expanded={editConfigOptionsMenuOpen ? 'true' : undefined}
              >
                {t('noteConfigOptionsMenu')}
              </Button>
              <Menu
                id="note-config-options-menu-edit"
                anchorEl={editConfigOptionsMenuAnchor}
                open={editConfigOptionsMenuOpen}
                onClose={closeEditConfigOptionsMenu}
                MenuListProps={{ dense: true }}
              >
                <MenuItem
                  onClick={() => {
                    closeEditConfigOptionsMenu()
                    handleResetConfigOptions()
                  }}
                >
                  {t('noteConfigOptionsResetDefaults')}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    closeEditConfigOptionsMenu()
                    if (configOptionsDisabled) {
                      handleEnableConfigOptions()
                    } else {
                      handleDisableConfigOptions()
                    }
                  }}
                >
                  {configOptionsDisabled ? t('noteConfigOptionsEnable') : t('noteConfigOptionsDisable')}
                </MenuItem>
              </Menu>
            </>
          ) : null}
          {/* Visually separate clear-note from the config actions. */}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => setConfirmOpen(true)}
          >
            {t('noteClear')}
          </Button>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={commitAndClose}>{t('close')}</Button>
        </Box>
      </DialogActions>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{t('titleClearNote')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgClearNote')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => { setConfirmOpen(false); setDraft(''); onChange('', { mode: 'clear' }) }}>{t('noteClear')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
