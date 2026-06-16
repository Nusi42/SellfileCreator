import React, { use, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { JSX } from 'react'
import { Badge, Box, Button, Checkbox, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Fade, FormControl, FormControlLabel, FormGroup, GlobalStyles, IconButton, InputLabel, LinearProgress, Menu, MenuItem, Paper, Popover, Radio, RadioGroup, Select, Slider, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { alpha, keyframes, useColorScheme, useTheme, type Theme } from '@mui/material/styles'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import LocalOfferIcon from '@mui/icons-material/LocalOffer'
import StarsIcon from '@mui/icons-material/Stars'
import ViewListIcon from '@mui/icons-material/ViewList'
import QuizIcon from '@mui/icons-material/Quiz'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import SendIcon from '@mui/icons-material/Send'
import WorkloadProgressIndicator from './WorkloadProgressIndicator'
import RslHelperConnectButton from './RslHelperConnectButton'
import { AppTitle } from './AppTitle'
import { APP_VERSION } from '../version'
import { DEFAULT_LANGUAGE, type Language } from '../lib/i18n/types'
import { useDialogMinimizeAnimation } from '../hooks/useDialogMinimizeAnimation'
import { useI18n, useLanguageOptions } from '../lib/i18n'
import '../lib/prismDynamicOverrides'   // registers dynamic-overrides DSL syntax coloring
import '../lib/prismEbnf'            // registers ebnf grammar for EBNF tooltip blocks
import { collectOverridesDiagnostics, type DiagnosticSpan } from '../lib/overridesDiagnostics'
import { refractor } from 'refractor'
import { FONT_SIZE_MARKDOWN_PX, FONT_SIZE_SECONDARY_PX, MARKDOWN_TOOLTIP_MAX_WIDTH_PX, NOTE_PANEL_SNAP_KEY } from '../lib/constants'
import MDEditor from '@uiw/react-md-editor'
import type { ICommand, RefMDEditor } from '@uiw/react-md-editor'
import { commands, getCommands } from '@uiw/react-md-editor'
import rehypeSanitize from 'rehype-sanitize'
import { defaultSchema } from 'hast-util-sanitize'
import type { Schema } from 'hast-util-sanitize'
import type { Pluggable } from 'unified'
import type { Components } from 'react-markdown'
import type { Root, RootContent, Element } from 'hast'
import type { BuilderRecipe } from '../lib/hsfBuilder'
import type { HsfRuleWithRecipe } from '../lib/merge'
import type { SubstatTargetTable } from '../lib/hsfBuilder/types'
import DungeonSimulatorNoteBlock from './DungeonSimulatorNoteBlock'
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
import { useSubstatFgAdapter } from '../lib/themeContrastHooks'
import { normalizeArtifactSetSelections, splitArtifactSetSelections } from '../lib/gearSets/selection'
import RecipeChip from './RecipeChip'
// MarkdownTooltip ensures the color pickers + toolbar reuse the same hover delay/style across the app.
import MarkdownTooltip from './MarkdownTooltip'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import {
  SAFEGUARD_DEFAULT_COUNT_MODE,
  sanitizeSafeguardCountMode,
  safeguardEffectiveCountModeForDisplay,
  type SafeguardRule,
  SafeguardRuleActivation,
  SafeguardSubstatMatch,
  normalizeSafeguardSubstatMatch,
} from '../lib/safeguards'
import { resolveRarityLabel } from '../lib/gearInspectorPreviewFormatting'
import { warningBadgeSx } from '../lib/badgeStyles'
import GearInspectorOutcomeSummaryChip from './GearInspectorOutcomeSummaryChip'
import { normalizeGearInspectorSortWeight, GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT } from '../lib/gearInspectorSort'
import {
  buildNoteRecipeOverridesSignature,
  applyQuestionSelectionRules,
  applyRecipeOverridesAnswerChange,
  NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN,
  resolveRecipeOverridesTags,
  NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY,
  RECIPE_OVERRIDES_OP_FIELD,
  formatRecipeOverridesOpValue,
  formatRecipeOverridesSelector,
  splitQuestionPrompt,
  normalizeOptionLabelText,
  type RecipeOverridesInstructions,
  type RecipeOverridesOperation,
  type RecipeOverridesSelector,
  type NoteQuestionDefinition,
  type NoteRecipeOverridesAnswers,
} from '../lib/noteRecipeOverrides'
import {
  resolveNoteSafeguardOverridesTags,
  buildNoteSafeguardOverridesSignature,
  applyQuestionSgSelectionRules,
  NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD,
  NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS,
  NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS,
  NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS,
  SAFEGUARD_OVERRIDES_OP_FIELD,
  SLIDER_TOGGLE_OFF,
  formatSafeguardOverridesOpValue,
  type SafeguardOverridesOperation,
  type NoteSafeguardOverridesAnswers,
  type SafeguardNoteQuestionDefinition,
  type SafeguardOverridesResolution,
} from '../lib/noteSafeguardOverrides'
import {
  useDynamicOverridesPresetController,
  DynamicOverridesPresetMenuItems,
  DynamicOverridesPresetDialogs,
} from './NoteDynamicOverridesPresets'
import { formatNoteTagSelector, type NoteTagSelector } from '../lib/noteOverridesParser'
import { normalizeTagValue } from '../lib/tagHelpers'
import type { GearInspectorOutcomeSummary } from '../types/gearInspectorPreview'
import { TINT, ALPHA } from '../lib/colorTints'
import {
  NOTE_COLOR_HEX,
  NOTE_COLOR_SX_SELECTORS,
  RECIPE_OVERRIDES_TOKEN_COLORS,
  noteTokVar,
  buildNoteColorSchemeStyles,
} from '../lib/noteColorVars'

// Recursively converts a refractor (HAST) node to React elements.
// Inline colors reference the per-scheme `--note-tok-*` vars (with the raw hex as
// fallback), so the tooltip inherits the same contrast-adapted palette as the
// editor backdrop without extra CSS scope. See src/lib/noteColorVars.ts.
function renderPrismNode(node: RootContent, key: number): React.ReactNode {
  if (node.type === 'text') return node.value
  if (node.type === 'element') {
    const classes = (node.properties?.className as string[]) ?? []
    // Pick the first token class that has a mapped color; skip the generic 'token' wrapper.
    const tokenClass = classes.find((c) => c !== 'token' && Boolean(RECIPE_OVERRIDES_TOKEN_COLORS[c]))
    // Resolve via the per-scheme var so light mode stays legible; fall back to the
    // base hex when the GlobalStyles vars aren't mounted.
    const color = tokenClass
      ? `var(${noteTokVar(tokenClass)}, ${RECIPE_OVERRIDES_TOKEN_COLORS[tokenClass]})`
      : undefined
    return (
      <span key={key} style={color ? { color } : undefined}>
        {node.children.map((child, i) => renderPrismNode(child as RootContent, i))}
      </span>
    )
  }
  return null
}

// Highlights `text` with the given refractor grammar and returns a styled <pre>.
// Falls back to plain text if the grammar is not registered or highlighting fails.
function renderPrismHighlighted(text: string, grammar: string, sx: Record<string, unknown>): React.ReactNode {
  try {
    const tree = refractor.highlight(text, grammar)
    return (
      <Box component="pre" sx={sx}>
        {tree.children.map((child, i) => renderPrismNode(child as RootContent, i))}
      </Box>
    )
  } catch {
    // Grammar not yet registered or unsupported – fall back to plain text.
    return <Box component="pre" sx={sx}>{text}</Box>
  }
}

// ── DSL error overlay ───────────────────────────────────────────────────────
// Renders a transparent pre element portaled into `.w-md-editor-text` (the
// MDEditor text container). Non-error text is invisible; error spans carry a
// wavy underline so the user sees where the DSL is structurally broken without
// altering the existing Prism token coloring.
//
// Layout math: `.w-md-editor-text` has padding:10px and position:relative.
// The overlay uses position:absolute inset:0 padding:10px so its text content
// starts at the same pixel as `.w-md-editor-text-pre`'s content, giving
// character-accurate underline positions.
const DSL_OVERLAY_PADDING_PX = 10

function DslErrorOverlay({ text, diags }: { text: string; diags: DiagnosticSpan[] }) {
  const theme = useTheme()
  if (diags.length === 0) return null

  // Split the full note text into alternating normal/error segments.
  const sorted = [...diags].sort((a, b) => a.from - b.from)
  const nodes: React.ReactNode[] = []
  let pos = 0
  for (const diag of sorted) {
    if (diag.from > pos) nodes.push(text.slice(pos, diag.from))
    nodes.push(
      // Inline styles are intentional — emotion scopes sx-generated rules to
      // the Box class which may not reliably reach React portal targets.
      <span
        key={diag.from}
        data-msg={diag.message}
        style={{
          color: 'transparent',
          textDecorationLine: 'underline',
          textDecorationStyle: 'wavy',
          textDecorationColor: theme.palette.warning.main,
          textDecorationSkipInk: 'none',
        }}
      >
        {text.slice(diag.from, diag.to)}
      </span>,
    )
    pos = diag.to
  }
  if (pos < text.length) nodes.push(text.slice(pos))

  return (
    // aria-hidden: the overlay is purely decorative; the textarea is the
    // accessible input.  pointer-events:none lets all mouse/keyboard events
    // pass through to the textarea layer above.
    <pre
      aria-hidden
      className="dsl-error-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        padding: DSL_OVERLAY_PADDING_PX,
        margin: 0,
        pointerEvents: 'none',
        background: 'transparent',
        color: 'transparent',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        // Font properties inherit from .w-md-editor-text so wrapping is 1:1.
        font: 'inherit',
        lineHeight: 'inherit',
        zIndex: 1,
      }}
    >
      {nodes}
      {/* MDEditor appends a trailing newline to its pre — match it so line
          heights stay in sync on the last line. */}
      {'\n'}
    </pre>
  )
}

// ── DSL error panel ─────────────────────────────────────────────────────────
// Portaled into `.w-md-editor` (the MDEditor root) as an absolutely-positioned
// element at the bottom, so it remains visible in both normal and fullscreen
// (position:fixed) editor modes.  Repeated messages are folded with ×N.
function DslErrorPanel({ diags }: { diags: DiagnosticSpan[] }) {
  if (diags.length === 0) return null
  // Fold repeated messages, preserving first-seen order.
  const counts = new Map<string, number>()
  for (const d of diags) counts.set(d.message, (counts.get(d.message) ?? 0) + 1)
  return (
    <Box
      sx={{
        // Absolute position inside .w-md-editor so it floats above editor content
        // in normal mode and stays fixed to the bottom in fullscreen mode.
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10,
        borderTop: 1,
        borderColor: 'divider',
        px: 1.5,
        py: 0.5,
        maxHeight: '5.5em',
        overflowY: 'auto',
        bgcolor: (t) => alpha(t.palette.warning.main, ALPHA.a08),
        backdropFilter: 'blur(4px)',
      }}
    >
      {[...counts.entries()].map(([msg, count]) => (
        <Typography
          key={msg}
          variant="caption"
          sx={{ display: 'flex', gap: 0.75, lineHeight: 1.6, color: 'warning.main' }}
        >
          <Box component="span" sx={{ flexShrink: 0 }}>⚠</Box>
          <Box component="span">
            {count > 1 && (
              <Box component="span" sx={{ opacity: 0.65, mr: 0.25 }}>{`×${count}`}</Box>
            )}
            {msg}
          </Box>
        </Typography>
      ))}
    </Box>
  )
}

// Keep substat ordering aligned with the rule card layout.
const NOTE_SUBSTAT_ORDER = new Map<number, number>(
  STAT_VARIANTS_PRIORITY.map((variant, index) => [Number(variant), index]),
)
// Stable DOM id assigned to the shared DialogTitle so the floating-panel surface can
// reference it via aria-labelledby (satisfies the role="dialog" accessible-name requirement).
const NOTE_DIALOG_TITLE_ID = 'note-dialog-title'
// Standard centered Dialog height — used in single-column or simple mode.
const NOTE_DIALOG_HEIGHT = '84vh'
const NOTE_DIALOG_PAPER_SX = {
  height: NOTE_DIALOG_HEIGHT,
  minHeight: NOTE_DIALOG_HEIGHT,
  maxHeight: NOTE_DIALOG_HEIGHT,
  display: 'flex',
  flexDirection: 'column',
}
// Full viewport height for the floating panel — only active in SBS + expert/normal mode.
// drawerWidthPx / drawerTopPx are injected per-render by App so the panel aligns with the
// builder column and starts below the app header row.
const NOTE_DRAWER_PAPER_SX = {
  display: 'flex',
  flexDirection: 'column',
}
// ── CSS zoom coordinate helpers ───────────────────────────────────────────────
// #root has `zoom: N` applied by useAutoSideBySideZoom in SBS mode.
// CSS zoom DOES scale position:fixed offsets (top/left/width) for elements inside
// the zoomed ancestor.  Coordinate model:
//   CSS px × zoom  = visual px  (what getBoundingClientRect / e.clientX report)
//   CSS px         = visual px / zoom
// So when writing a CSS `left` from a visual-px value, divide by getAppZoom().
function getAppZoom(): number {
  if (typeof document === 'undefined') return 1
  return Number(document.documentElement.style.getPropertyValue('--app-zoom') || '1') || 1
}
// ── Floating panel snap behavior ──────────────────────────────────────────────
// The panel snaps to the left or right viewport edge; height always fills from
// the header to the bottom. Width is adjustable via the side resize handles.
// Snap side and width persist across sessions via localStorage.
const PANEL_SNAP_KEY = NOTE_PANEL_SNAP_KEY
const PANEL_MIN_WIDTH_PX = 280
interface PanelSnapData { side: 'left' | 'right'; width: number }

function loadPanelSnap(): PanelSnapData | null {
  try {
    const raw = localStorage.getItem(PANEL_SNAP_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || !parsed) return null
    const p = parsed as Record<string, unknown>
    const side = p['side'] === 'right' ? 'right' as const : 'left' as const
    const width = typeof p['width'] === 'number' && p['width'] >= PANEL_MIN_WIDTH_PX ? p['width'] : null
    if (width === null) return null
    return { side, width }
  } catch { return null }
}

function savePanelSnap(data: PanelSnapData): void {
  try { localStorage.setItem(PANEL_SNAP_KEY, JSON.stringify(data)) } catch { /* storage unavailable */ }
}
// Brief glow pulse played on the auto-push button after each successful push.
const autoPushBlink = keyframes`
  0%   { box-shadow: 0 0 0 0 ${TINT.successGlow}; }
  50%  { box-shadow: 0 0 0 8px ${TINT.pulseFadeOut}; transform: scale(1.08); }
  100% { box-shadow: 0 0 0 0 ${TINT.pulseFadeOut}; }
`
// One-shot highlight pulse for the overlay box flashed over an option's DSL when its preview
// control is clicked. Fades a primary-tinted background + ring from visible to transparent so
// the eye is drawn to JUST that range (not the whole editor) after it scrolls into view.
const noteDslPulse = keyframes`
  0%   { background-color: ${TINT.primaryActiveBg}; box-shadow: 0 0 0 1px ${TINT.primaryGlow}; }
  70%  { background-color: ${TINT.primaryActiveBg}; box-shadow: 0 0 0 1px ${TINT.primaryGlow}; }
  100% { background-color: ${TINT.pulseFadeOut}; box-shadow: 0 0 0 1px ${TINT.pulseFadeOut}; }
`
// Size of the workload indicator in express (non-expert) mode — visibly larger than the default 20 px.
// Duration for all express↔expert mode transitions (ms).
const SIMPLE_MODE_TRANSITION_MS = 220 as const
const RECIPE_COMMENT_REGEX = /^\s*recipes\s*:\s*([0-9,\s]+)\s*$/i
const RECIPE_MARKER_REGEX = /<!--\s*recipes\s*:\s*([0-9,\s]+)\s*-->/i
const RECIPE_REGEX_COMMENT_REGEX = /^\s*recipes-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/i
const RECIPE_REGEX_MARKER_REGEX = /<!--\s*recipes-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*-->/i
const RECIPE_ANY_MARKER_GLOBAL_REGEX = /<!--\s*recipes(?:-re)?\s*:[\s\S]*?-->/gi
const RECIPE_ELEMENT_TAG = 'recipe-chip-block'
const RECIPE_ELEMENT_ATTR = 'data-recipe-ids'
const RECIPE_ELEMENT_PATTERN_ATTR = 'data-recipe-pattern'
const RECIPE_ELEMENT_FILTER_ATTR = 'data-recipe-filter'
const RECIPE_ELEMENT_INDEX_ATTR = 'data-recipe-marker-index'
const RECIPE_FILTER_IDS = 'ids'
const RECIPE_FILTER_REGEXP = 'regexp'
const DEFAULT_ALLOWED_TAG_REGEX = /^[A-Za-z0-9]+$/

const SAFEGUARD_COMMENT_REGEX = /^\s*safeguards\s*:\s*([0-9,\s]+)\s*$/i
const SAFEGUARD_MARKER_REGEX = /<!--\s*safeguards\s*:\s*([0-9,\s]+)\s*-->/i
const SAFEGUARD_REGEX_COMMENT_REGEX = /^\s*safeguards-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/i
const SAFEGUARD_REGEX_MARKER_REGEX = /<!--\s*safeguards-re\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*-->/i
const SAFEGUARD_ANY_MARKER_GLOBAL_REGEX = /<!--\s*safeguards(?:-re)?\s*:[\s\S]*?-->/gi
const SAFEGUARD_ELEMENT_TAG = 'safeguard-summary'
const SAFEGUARD_ELEMENT_ATTR = 'data-ku-ids'
const SAFEGUARD_ELEMENT_FILTER_ATTR = 'data-ku-filter'
const SAFEGUARD_ELEMENT_PATTERN_ATTR = 'data-ku-pattern'
const SAFEGUARD_ELEMENT_INDEX_ATTR = 'data-ku-marker-index'
const SAFEGUARD_FILTER_IDS = 'ids'
const SAFEGUARD_FILTER_REGEXP = 'regexp'
const NOTE_CARD_GAP = 1.5
// Pixel equivalent of NOTE_CARD_GAP (MUI default spacing unit = 8 px).
const NOTE_CARD_GAP_PX = NOTE_CARD_GAP * 8
const NOTE_CARD_WIDTHS: Record<NoteCardWidthPreset, { flexBasis: number; minWidth: number; maxWidth: number }> = {
  note: { flexBasis: 242, minWidth: 209, maxWidth: 322 },
}

// Match HTML comment bodies that declare recipe-overrides markers.
// Legacy recipe-overrides marker aliases are accepted silently for old .sfc files.
const QUESTION_MARKER_KEYWORD_PATTERN = NOTE_RECIPE_OVERRIDES_MARKER_KEYWORD_PATTERN
const QUESTION_COMMENT_REGEX = new RegExp(`^\\s*(?:${QUESTION_MARKER_KEYWORD_PATTERN})\\b`, 'i')
// Match raw HTML comment markers in the Markdown stream.
const QUESTION_MARKER_REGEX = new RegExp(`<!--\\s*(?:${QUESTION_MARKER_KEYWORD_PATTERN})\\b[\\s\\S]*?-->`, 'i')
// Custom element tag used in sanitized Markdown output.
const QUESTION_ELEMENT_TAG = 'note-recipe-overrides'
// Wrapper tag used to group question markers into a single flex layout.
const QUESTION_GROUP_ELEMENT_TAG = 'note-recipe-overrides-group'
// Attribute used to map back to a parsed question definition.
const QUESTION_ELEMENT_INDEX_ATTR = 'data-question-index'
// Backtick references like `\1` map to option labels by 1-based index.
const QUESTION_PROMPT_REF_REGEX = /^\\(\d+)$/

// ── Safeguard-overrides question marker tags ────────────────────────────────
// Match HTML comment bodies that declare safeguard-overrides markers.
const SG_QUESTION_COMMENT_REGEX = new RegExp(`^\\s*${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}\\b`, 'i')
// Match raw HTML comment markers in the Markdown stream.
const SG_QUESTION_MARKER_REGEX  = new RegExp(`<!--\\s*${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}\\b[\\s\\S]*?-->`, 'i')
// Custom element tag used in sanitized Markdown output.
const SG_QUESTION_ELEMENT_TAG = 'note-safeguard-overrides'
// Wrapper tag used to group adjacent safeguard-overrides question markers into a flex row.
const SG_QUESTION_GROUP_ELEMENT_TAG = 'note-safeguard-overrides-group'
// Attribute used to map back to a parsed question definition.
const SG_QUESTION_ELEMENT_INDEX_ATTR = 'data-sg-question-index'

// ── Dungeon-simulator tag ────────────────────────────────────────────────────
// Matches the body of <!-- dungeon-simulator --> HTML comment markers.
const DUNGEON_SIM_COMMENT_REGEX = /^\s*dungeon-simulator\s*$/i
// Custom element tag emitted by the rehype plugin into the sanitised HAST tree.
const DUNGEON_SIM_ELEMENT_TAG = 'dungeon-sim-block'

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

type RecipeMarkerEntry = { id: number; recipe: BuilderRecipe }
type RecipeMarkerMap = Map<number, RecipeMarkerEntry[]>
type SafeguardMarkerEntry = { id: number; rule: SafeguardRule }
type SafeguardMarkerMap = Map<number, SafeguardMarkerEntry[]>
type NoteCardWidthPreset = 'note'
type QuestionPromptToken = { key: string; text: string; kind: 'text' | 'chip' | 'label' }

// Backticks mark chip-style emphasis within prompts.
const QUESTION_PROMPT_CHIP_MARKER = '`'
// Double-asterisks mark label-style emphasis within prompts.
const QUESTION_PROMPT_LABEL_MARKER = '**'

// Base label styling keeps weight/color aligned across note cards.
const NOTE_CARD_LABEL_TEXT_BASE_SX = {
  fontWeight: 800,
  color: 'text.secondary',
}
// Shared label styling adds the standard line height for most labels.
const NOTE_CARD_LABEL_TEXT_SX = {
  ...NOTE_CARD_LABEL_TEXT_BASE_SX,
  lineHeight: 1.4,
}
const NOTE_OPTION_LINE_HEIGHT_COLUMNS = 1.2
// Shared label styling for two-column option rows.
const NOTE_QUESTION_OPTION_TWO_COLUMN_LABEL_SX = {
  // Block layout avoids baseline quirks when values wrap.
  display: 'block',
  width: '100%',
  lineHeight: NOTE_OPTION_LINE_HEIGHT_COLUMNS,
}
const NOTE_QUESTION_OPTION_SX = {
  // Match Safeguard row density by trimming default control padding.
  alignItems: 'center',
  m: 0,
  py: 0,
  '& .MuiFormControlLabel-label': { lineHeight: NOTE_CARD_LABEL_TEXT_SX.lineHeight },
  '& .MuiCheckbox-root, & .MuiRadio-root': { p: 0.25 },
}
const NOTE_QUESTION_OPTION_TWO_COLUMN_SX = {
  // Keep the control aligned to the top of multi-line option text.
  m: 0,
  py: 0,
  // Let the label area stretch so the two columns can align.
  '& .MuiFormControlLabel-label': NOTE_QUESTION_OPTION_TWO_COLUMN_LABEL_SX,
  '& .MuiCheckbox-root, & .MuiRadio-root': { p: 0.25 },
}
const NOTE_QUESTION_OPTION_GROUP_STACK_SX = {
  // Keep the stacked option groups compact in the default layout.
  gap: 0.25,
}

function buildNoteQuestionOptionGridSx(
  minColumnWidth: number,
  columns: number,
  rowAlign: 'center' | 'flex-start',
) {
  // Determine whether a fixed column count was provided.
  const hasFixedColumns = columns > 0
  // Favor auto-fit with a min width derived from non-horizontal cards.
  const autoFitColumns = `repeat(auto-fit, minmax(${minColumnWidth}px, 1fr))`
  // Use a fixed repeat when the marker overrides column count explicitly.
  const fixedColumns = `repeat(${columns}, minmax(0, 1fr))`
  return {
    // Grid layout prevents odd wrapping in full-width cards.
    display: 'grid',
    // Choose the grid template based on the marker option.
    gridTemplateColumns: hasFixedColumns ? fixedColumns : autoFitColumns,
    // Keep row/column spacing consistent with stacked cards.
    rowGap: 0.35,
    columnGap: 1.5,
    // Align entire option rows based on horizontal label usage.
    alignItems: rowAlign,
    // Let the grid stretch across the full card width.
    width: '100%',
  } satisfies Record<string, unknown>
}
// Add a touch of breathing room between question titles and subtext.
const NOTE_QUESTION_TITLE_SUBTEXT_GAP = 0.35
// Bump card padding slightly so options feel less cramped.
const NOTE_QUESTION_CARD_PADDING = 1.5
// Add breathing room between headings and options without a divider.
const NOTE_QUESTION_HEADER_OPTIONS_GAP = 0.6
const NOTE_QUESTION_SUBTEXT_SX = {
  // Keep subtext smaller and lighter to separate it from the title.
  color: 'text.secondary',
  lineHeight: 1.2,
}
// Pad the label column so short bold labels don't wrap.
const NOTE_QUESTION_LABEL_COLUMN_PAD_CH = 1

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
  if (!option) return raw
  // Normalize label-only content so prompt references stay single-line.
  return option.detail ? normalizeOptionLabelText(option.label) : option.label
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
      // Chip tokens reuse the safeguard scope chip treatment.
      <Box key={token.key} component="span" sx={chipSx}>
        <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 'inherit' }}>
          {token.text}
        </Typography>
      </Box>
    ) : token.kind === 'label' ? (
      // Label tokens keep the Quota/Scope styling while inheriting the surrounding size.
      <Typography key={token.key} component="span" variant="inherit" sx={labelSx}>
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
  textSx?: Record<string, unknown>,
): JSX.Element {
  // Tokenize option labels so highlight markers mirror prompt behavior.
  const tokens = buildQuestionPromptTokens(label, [], false)
  // Preserve explicit line breaks for multi-line option labels.
  return (
    <Typography
      component="span"
      variant="caption"
      color="text.secondary"
      sx={{
        whiteSpace: 'pre-line',
        // Inherit from the option row so columns can tune line height.
        lineHeight: 'inherit',
        ...textSx,
      }}
    >
      {renderQuestionTextTokens({ tokens, chipSx, labelSx })}
    </Typography>
  )
}

function measureOptionLabelLength(label: string): number {
  // Normalize newlines so labels stay single-line in the column.
  const normalized = normalizeOptionLabelText(label)
  // Split on newlines so we measure the widest visible line.
  const lines = normalized.split('\n')
  let maxLength = 0
  lines.forEach((line) => {
    // Strip emphasis markers so chip/label styling doesn't inflate widths.
    const cleaned = line.replace(/\*\*/g, '').replace(/`/g, '')
    if (cleaned.length > maxLength) maxLength = cleaned.length
  })
  return maxLength
}

function renderTwoColumnOptionLabel({
  option,
  chipSx,
  labelSx,
  labelColumnCh,
  layout,
}: {
  option: NoteQuestionDefinition['options'][number]
  chipSx: Record<string, unknown>
  labelSx: Record<string, unknown>
  labelColumnCh: number
  layout: 'columns' | 'rows'
}): JSX.Element {
  // When a second string exists, treat the first as the label column.
  const labelText = option.detail ? normalizeOptionLabelText(option.label) : ''
  // When no label exists, keep the full text in the value column.
  const valueText = option.detail ? option.detail : option.label
  // Decide which text belongs to the first row when rows are active.
  const primaryText = option.detail ? labelText : option.label
  const secondaryText = option.detail ? option.detail : null
  // Collapse the label column when no detail exists.
  const hasDetail = Boolean(option.detail)
  // Remove the column gap when only the value column renders.
  const columnGap = hasDetail ? 0.625 : 0
  // Render a single text block in row layout to preserve line spacing.
  if (layout === 'rows') {
    // Tokenize label/value text so emphasis markers are preserved.
    const labelTokens = buildQuestionPromptTokens(primaryText, [], false)
    const valueTokens = secondaryText
      ? buildQuestionPromptTokens(secondaryText, [], false)
      : []
    return (
      <Typography
        component="span"
        variant="caption"
        color="text.secondary"
        sx={{ whiteSpace: 'pre-line', lineHeight: NOTE_CARD_LABEL_TEXT_SX.lineHeight }}
      >
        <Box component="span" sx={option.detail ? NOTE_CARD_LABEL_TEXT_SX : {}}>
          {renderQuestionTextTokens({ tokens: labelTokens, chipSx, labelSx })}
        </Box>
        {secondaryText ? '\n' : null}
        {secondaryText
          ? renderQuestionTextTokens({ tokens: valueTokens, chipSx, labelSx })
          : null}
      </Typography>
    )
  }
  // Keep the two-column layout predictable by fixing the label column width.
  const labelColumnWidth = hasDetail ? `${labelColumnCh}ch` : '0'
  const gridTemplateColumns = `${labelColumnWidth} minmax(0, 1fr)`
  return (
    <Box
      component="span"
      sx={{
        display: 'grid',
        gridTemplateColumns,
        columnGap,
        // Center the label/value block so it matches case2 alignment.
        alignItems: 'center',
        // Match the tighter line height for two-column text/value labels.
        lineHeight: NOTE_OPTION_LINE_HEIGHT_COLUMNS,
        width: '100%',
      }}
    >
      <Box
        component="span"
        sx={{
          // Use block layout so grid cells align to the top line.
          display: 'block',
          alignSelf: 'center',
          minWidth: 0,
        }}
      >
        {labelText
          ? renderQuestionOptionLabel(
            labelText,
            chipSx,
            labelSx,
            NOTE_CARD_LABEL_TEXT_BASE_SX,
          )
          : null}
      </Box>
      <Box
        component="span"
        sx={{
          // Use block layout so multi-line values start at the top.
          display: 'block',
          alignSelf: 'center',
          minWidth: 0,
        }}
      >
        {renderQuestionOptionLabel(valueText, chipSx, labelSx)}
      </Box>
    </Box>
  )
}

type NoteRenderContextValue = {
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  markerResolutions: RecipeMarkerMap
  safeguardRules: SafeguardRule[]
  safeguardMarkerResolutions: SafeguardMarkerMap
  recipeOverridesResolutions: Map<number, NoteQuestionDefinition>
  recipeOverridesEditable: boolean
  noteOverridesDisabled: boolean
  onRecipeOverridesAnswerChange: (
    question: NoteQuestionDefinition,
    nextAnswer: string[],
    preferredId?: string,
    // Option the user explicitly turned off (uncheck) — releases presets forcing it on.
    removedId?: string,
  ) => void
  // Safeguard overrides resolution map: marker index → question definition.
  safeguardOverridesResolutions: Map<number, SafeguardNoteQuestionDefinition>
  // True while the view mode dialog is open (safeguard-overrides questions are always editable in view mode).
  safeguardOverridesEditable: boolean
  onSafeguardOverridesAnswerChange: (
    question: SafeguardNoteQuestionDefinition,
    nextAnswer: string[],
    preferredId?: string,
    removedId?: string,
  ) => void
  // Merged rules + substat targets forwarded from App for dungeon simulation.
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  // Monotonic counter that advances only on user-driven override edits (never on
  // background endpoint pushes). The dungeon simulator restarts on epoch change and
  // ignores `rules`/`substatTargets` reference churn, so pushes don't restart it.
  userOverrideEpoch: number
  // True while the rule cache pipeline is still running; gates dungeon sim start.
  pipelineRunning: boolean
  // True only when this context is powering the MDEditor split-pane preview (edit mode).
  // Used to gate option-info hover tooltips that are only useful in the read-only preview.
  isEditorPreview: boolean
  // Editor-preview only: scroll the given source character range into view in the MDEditor
  // textarea and pulse its background once (used to locate an option's DSL when its control
  // is clicked). No-op in view mode.
  onRevealOptionSource?: (from: number, to: number) => void
  // Editor-preview only: global optionId → {token,label} map, so a tooltip can resolve a
  // forces-reference (id of an option in another question) to its unique token + answer label.
  optionLookup?: Map<string, { token: string; label: string }>
}

// Exported so DungeonSimulatorNoteBlock can consume it without a prop-drilling chain.
export const NoteRenderContext = React.createContext<NoteRenderContextValue | null>(null)

function useNoteRenderContext(): NoteRenderContextValue {
  const ctx = use(NoteRenderContext)
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

const rehypeRecipeComments: Pluggable = () => {
  return (tree: Root) => {
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          const regexMatch = RECIPE_REGEX_COMMENT_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: RECIPE_ELEMENT_TAG,
              properties: {
                [RECIPE_ELEMENT_FILTER_ATTR]: RECIPE_FILTER_REGEXP,
                [RECIPE_ELEMENT_PATTERN_ATTR]: patternRaw,
                [RECIPE_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = RECIPE_COMMENT_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: RECIPE_ELEMENT_TAG,
            properties: {
              [RECIPE_ELEMENT_FILTER_ATTR]: RECIPE_FILTER_IDS,
              [RECIPE_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [RECIPE_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          const regexMatch = RECIPE_REGEX_MARKER_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: RECIPE_ELEMENT_TAG,
              properties: {
                [RECIPE_ELEMENT_FILTER_ATTR]: RECIPE_FILTER_REGEXP,
                [RECIPE_ELEMENT_PATTERN_ATTR]: patternRaw,
                [RECIPE_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = RECIPE_MARKER_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: RECIPE_ELEMENT_TAG,
            properties: {
              [RECIPE_ELEMENT_FILTER_ATTR]: RECIPE_FILTER_IDS,
              [RECIPE_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [RECIPE_ELEMENT_INDEX_ATTR]: String(markerIndex),
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

const rehypeSafeguardComments: Pluggable = () => {
  return (tree: Root) => {
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          const regexMatch = SAFEGUARD_REGEX_COMMENT_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: SAFEGUARD_ELEMENT_TAG,
              properties: {
                [SAFEGUARD_ELEMENT_FILTER_ATTR]: SAFEGUARD_FILTER_REGEXP,
                [SAFEGUARD_ELEMENT_PATTERN_ATTR]: patternRaw,
                [SAFEGUARD_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = SAFEGUARD_COMMENT_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: SAFEGUARD_ELEMENT_TAG,
            properties: {
              [SAFEGUARD_ELEMENT_FILTER_ATTR]: SAFEGUARD_FILTER_IDS,
              [SAFEGUARD_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [SAFEGUARD_ELEMENT_INDEX_ATTR]: String(markerIndex),
            },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          const regexMatch = SAFEGUARD_REGEX_MARKER_REGEX.exec(value)
          if (regexMatch) {
            const patternRaw = regexMatch[1] ?? ''
            const element: Element = {
              type: 'element',
              tagName: SAFEGUARD_ELEMENT_TAG,
              properties: {
                [SAFEGUARD_ELEMENT_FILTER_ATTR]: SAFEGUARD_FILTER_REGEXP,
                [SAFEGUARD_ELEMENT_PATTERN_ATTR]: patternRaw,
                [SAFEGUARD_ELEMENT_INDEX_ATTR]: String(markerIndex),
              },
              children: [],
            }
            markerIndex += 1
            nodeChildren.splice(i, 1, element)
            continue
          }
          const match = SAFEGUARD_MARKER_REGEX.exec(value)
          if (!match) continue
          const tokens = parseMarkerTokens(match[1] ?? '')
          if (tokens.length === 0) {
            nodeChildren.splice(i, 1)
            i -= 1
            continue
          }
          const element: Element = {
            type: 'element',
            tagName: SAFEGUARD_ELEMENT_TAG,
            properties: {
              [SAFEGUARD_ELEMENT_FILTER_ATTR]: SAFEGUARD_FILTER_IDS,
              [SAFEGUARD_ELEMENT_ATTR]: serializeMarkerTokens(tokens),
              [SAFEGUARD_ELEMENT_INDEX_ATTR]: String(markerIndex),
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
    // A <br> between question elements acts as an explicit row-break sentinel:
    // it terminates the current flex group without being emitted into the output.
    const isBrElement = (node: RootContent): boolean => {
      return node.type === 'element' && (node as Element).tagName === 'br'
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
          // Whitespace text is transparent to grouping — skip over it.
          if (isWhitespaceText(candidate)) continue
          // A <br> explicitly terminates the current group; consume it silently
          // so it does not render as a visible element between card rows.
          if (isBrElement(candidate)) {
            cursor += 1
          }
          break
        }
        nextChildren.push({
          type: 'element',
          tagName: QUESTION_GROUP_ELEMENT_TAG,
          properties: {},
          children: grouped,
        })
        // cursor always points one past the last consumed node (whether the
        // boundary was a <br> sentinel or another block element); back up by one
        // so the outer loop's i += 1 lands on the correct next child.
        i = cursor - 1
      }
      nodeChildren.splice(0, nodeChildren.length, ...nextChildren)
    }
    transform(tree)
  }
}

// Replace <!-- dungeon-simulator --> comment nodes with a <dungeon-sim-block /> element.
// The component reads rules + substatTargets + pipelineRunning from NoteRenderContext.
const rehypeDungeonSimulatorComment: Pluggable = () => {
  return (tree: Root) => {
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        // Recurse into nested elements before replacing at this level.
        if (child.type === 'element') {
          transform(child as Element)
          continue
        }
        // Only raw HTML comment nodes are candidates.
        if (child.type !== 'comment') continue
        const value = (child as { value?: string }).value ?? ''
        if (!DUNGEON_SIM_COMMENT_REGEX.test(value)) continue
        // Replace the comment node with the custom element (no attributes needed).
        nodeChildren[i] = {
          type: 'element',
          tagName: DUNGEON_SIM_ELEMENT_TAG,
          properties: {},
          children: [],
        }
      }
    }
    transform(tree)
  }
}

// ── safeguard-overrides rehype plugins ────────────────────────────────────────
// Parallel to rehypeQuestionComments / rehypeQuestionGroups but for
// <!-- safeguard-overrides … --> markers. Uses the SG_* element tag constants
// so the two marker families stay completely independent in the HAST tree.

const rehypeSafeguardOverridesComments: Pluggable = () => {
  return (tree: Root) => {
    // Increment separately from recipe-overrides so indices stay per-family.
    let markerIndex = 0
    const transform = (node: Root | Element): void => {
      const nodeChildren = (node.children ?? []) as RootContent[]
      for (let i = 0; i < nodeChildren.length; i++) {
        const child = nodeChildren[i]
        if (!child) continue
        if (child.type === 'comment') {
          const value = (child as { value: string }).value
          if (!SG_QUESTION_COMMENT_REGEX.test(value)) continue
          const element: Element = {
            type: 'element',
            tagName: SG_QUESTION_ELEMENT_TAG,
            properties: { [SG_QUESTION_ELEMENT_INDEX_ATTR]: String(markerIndex) },
            children: [],
          }
          markerIndex += 1
          nodeChildren.splice(i, 1, element)
          continue
        }
        if (child.type === 'raw') {
          const value = (child as { value: string }).value
          if (!SG_QUESTION_MARKER_REGEX.test(value)) continue
          const element: Element = {
            type: 'element',
            tagName: SG_QUESTION_ELEMENT_TAG,
            properties: { [SG_QUESTION_ELEMENT_INDEX_ATTR]: String(markerIndex) },
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

const rehypeSafeguardOverridesGroups: Pluggable = () => {
  return (tree: Root) => {
    const isSgElement = (node: RootContent): node is Element => (
      node.type === 'element' && (node as Element).tagName === SG_QUESTION_ELEMENT_TAG
    )
    const isWhitespaceText = (node: RootContent): boolean => {
      if (node.type !== 'text') return false
      const value = (node as { value?: string }).value ?? ''
      return value.trim().length === 0
    }
    const isBrElement = (node: RootContent): boolean => (
      node.type === 'element' && (node as Element).tagName === 'br'
    )
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
        if (!isSgElement(child)) { nextChildren.push(child); continue }
        const grouped: Element[] = [child]
        let cursor = i + 1
        for (; cursor < nodeChildren.length; cursor += 1) {
          const candidate = nodeChildren[cursor]
          if (!candidate) continue
          if (isSgElement(candidate)) { grouped.push(candidate); continue }
          if (isWhitespaceText(candidate)) continue
          if (isBrElement(candidate)) { cursor += 1 }
          break
        }
        nextChildren.push({
          type: 'element',
          tagName: SG_QUESTION_GROUP_ELEMENT_TAG,
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

function collectRecipeIds(text: string, recipes: BuilderRecipe[]): Set<number> {
  const used = new Set<number>()
  const resolutions = buildRecipeMarkerResolutions(text, recipes)
  for (const entries of resolutions.values()) {
    for (const entry of entries) {
      used.add(entry.id)
    }
  }
  return used
}

function recipeMatchesNotePattern(recipe: BuilderRecipe, pattern: RegExp): boolean {
  // Match the recipe name first to preserve the existing regex behavior.
  const name = recipe?.appearance?.name ?? ''
  if (name) {
    pattern.lastIndex = 0
    if (pattern.test(name)) return true
  }
  // Check normalized tags so recipes-re can target tag metadata.
  const tags = Array.isArray(recipe?.tags) ? recipe.tags : []
  for (const tag of tags) {
    const normalized = normalizeTagValue(String(tag))
    if (!normalized) continue
    pattern.lastIndex = 0
    if (pattern.test(normalized)) return true
  }
  return false
}

function buildRecipeMarkerResolutions(text: string, recipes: BuilderRecipe[]): RecipeMarkerMap {
  const result: RecipeMarkerMap = new Map()
  if (!text) return result
  RECIPE_ANY_MARKER_GLOBAL_REGEX.lastIndex = 0
  let markerIndex = 0
  let lastRendered = 0
  for (const match of text.matchAll(RECIPE_ANY_MARKER_GLOBAL_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    let entries: RecipeMarkerEntry[] = []
    const regexMatch = RECIPE_REGEX_MARKER_REGEX.exec(raw)
    if (regexMatch) {
      const patternRaw = regexMatch[1] ?? ''
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        entries = recipes
          .map((recipe, idx) => ({ recipe, idx }))
          .filter(({ recipe }) => {
            return recipeMatchesNotePattern(recipe, safeCompiled)
          })
          .map(({ recipe, idx }) => ({ id: idx + 1, recipe }))
      }
    } else {
      const idsMatch = RECIPE_MARKER_REGEX.exec(raw)
      if (idsMatch && typeof idsMatch[1] === 'string') {
        const tokens = parseMarkerTokens(idsMatch[1])
        if (tokens.length > 0) {
          const fallback: RecipeMarkerEntry[] = []
          let markerLast = lastRendered
          for (const token of tokens) {
            const candidate = token.type === 'absolute' ? token.value : markerLast + 1
            if (!candidate || candidate <= 0) continue
            const recipe = recipes[candidate - 1]
            if (!recipe) continue
            fallback.push({ id: candidate, recipe })
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

const RECIPE_MARKER_HINT = '<!--  Use `0` to reference the recipe after the last used. Alternatively, use `recipes-re: "text"` for regexp matches. -->'

function buildRecipeMarkerBlock(ids: number[]): { block: string; cursorIndex: number } {
  // Keep the marker and hint on separate lines to avoid breaking selection ranges.
  const marker = `<!-- recipes:${ids.join(',')} -->`
  const block = `${marker}\n${RECIPE_MARKER_HINT}`
  // Cursor returns to the end of the marker line for continued editing.
  return { block, cursorIndex: marker.length + 1 }
}

function collectSafeguardIds(text: string, safeguardRules: SafeguardRule[]): Set<number> {
  const used = new Set<number>()
  const resolutions = buildSafeguardMarkerResolutions(text, safeguardRules)
  for (const entries of resolutions.values()) {
    for (const entry of entries) {
      used.add(entry.id)
    }
  }
  return used
}

function buildSafeguardMarkerResolutions(text: string, safeguardRules: SafeguardRule[]): SafeguardMarkerMap {
  const result: SafeguardMarkerMap = new Map()
  if (!text) return result
  SAFEGUARD_ANY_MARKER_GLOBAL_REGEX.lastIndex = 0
  let markerIndex = 0
  let lastRendered = 0
  for (const match of text.matchAll(SAFEGUARD_ANY_MARKER_GLOBAL_REGEX)) {
    const raw = match?.[0] ?? ''
    if (!raw) {
      markerIndex += 1
      continue
    }
    let entries: SafeguardMarkerEntry[] = []
    const regexMatch = SAFEGUARD_REGEX_MARKER_REGEX.exec(raw)
    if (regexMatch) {
      const patternRaw = regexMatch[1] ?? ''
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        entries = safeguardRules
          .map((rule, idx) => ({ rule, idx }))
          .filter(({ rule }) => {
            const name = rule?.appearance?.name ?? ''
            safeCompiled.lastIndex = 0
            return safeCompiled.test(name)
          })
          .map(({ rule, idx }) => ({ id: idx + 1, rule }))
      }
    } else {
      const idsMatch = SAFEGUARD_MARKER_REGEX.exec(raw)
      if (idsMatch && typeof idsMatch[1] === 'string') {
        const tokens = parseMarkerTokens(idsMatch[1])
        if (tokens.length > 0) {
          const fallback: SafeguardMarkerEntry[] = []
          let markerLast = lastRendered
          for (const token of tokens) {
            const candidate = token.type === 'absolute' ? token.value : markerLast + 1
            if (!candidate || candidate <= 0) continue
            const rule = safeguardRules[candidate - 1]
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

const SAFEGUARD_MARKER_HINT = '<!-- use `safeguards-re: "text"` for regexp matches. Use `0` only in numeric lists (safeguards:). -->'

function buildSafeguardMarkerBlock(ids: number[]): { block: string; cursorIndex: number } {
  // Match recipe marker ergonomics: leave the hint on the next line.
  const marker = `<!-- safeguards:${ids.join(',')} -->`
  const block = `${marker}\n${SAFEGUARD_MARKER_HINT}`
  // Place the caret after the marker for quick follow-up edits.
  return { block, cursorIndex: marker.length + 1 }
}

function buildRecipeOverridesMarkerResolutions(text: string, answers: NoteRecipeOverridesAnswers): Map<number, NoteQuestionDefinition> {
  // Map marker indices to parsed question definitions.
  const result = new Map<number, NoteQuestionDefinition>()
  // Short-circuit when no note text exists.
  if (!text) return result
  // Resolve questions with the current answers merged in.
  const { questions } = resolveRecipeOverridesTags(text, answers)
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

// Keep the recipe overrides EBNF header consistent across samples and tooltips.
const RECIPE_OVERRIDES_EBNF_HEADER = 'Recipe overrides syntax (EBNF):'
// Reference line is kept for documentation; the wrap limit is set independently to match the tooltip width.
const RECIPE_OVERRIDES_EBNF_REFERENCE_LINE = 'question      := ("q" | "question") string group+ [fallbackBlock]'
const RECIPE_OVERRIDES_EBNF_MAX_LINE_LENGTH = 126
// Marker options shown in the EBNF block.
const RECIPE_OVERRIDES_EBNF_MARKER_OPTION_TOKENS = [
  `"${NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY}" "=" number`,
]
// Render the marker option line from the shared token list.
const RECIPE_OVERRIDES_EBNF_MARKER_OPTION_LINE = (
  `markerOption  := ${RECIPE_OVERRIDES_EBNF_MARKER_OPTION_TOKENS.join(' | ')}`
)
// Use fenced-code markers when inserting the EBNF into the note editor.
const RECIPE_OVERRIDES_EBNF_FENCE_START = '```text'
const RECIPE_OVERRIDES_EBNF_FENCE_END = '```'
// Anchor the sample example header so insert content is stable.
const RECIPE_OVERRIDES_SAMPLE_EXAMPLE_HEADER = 'Example 1:'
// Anchor the tooltip example header to keep copy consistent.
const RECIPE_OVERRIDES_TOOLTIP_EXAMPLE_HEADER = 'Example:'
// Close marker for the sample comment block.
const RECIPE_OVERRIDES_SAMPLE_CLOSE = '-->'
// Shared keyCommand for the toolbar insert button.
const RECIPE_OVERRIDES_SAMPLE_COMMAND_KEY = 'insert-recipeOverrides-sample'

// Static EBNF text; the statKey row is appended at runtime.
// Lines are formatted to fit the wider RECIPE_OVERRIDES_TOOLTIP_MAX_WIDTH_PX (~126 chars).
const RECIPE_OVERRIDES_EBNF_BASE =
`marker        := "<!--" "recipe-overrides" [markerOptions] [question group+ [fallbackBlock]] "-->"
markerOptions := "[" markerOption ("," markerOption)* "]"
${RECIPE_OVERRIDES_EBNF_MARKER_OPTION_LINE}
${RECIPE_OVERRIDES_EBNF_REFERENCE_LINE}
group         := ("single" | "s" | "rb" | "radiobutton" | "radio" | "multi" | "m" | "cb" | "checkbox" | "check")
             string [string] [headerToken {headerToken}] [constraints] "{" (selectorBlock | crossBlock)* [elseBlock] "}"
headerToken   := "id" "=" token | "*" | "default"
selectorBlock := "@" selector "{" assignment+ "}"
crossBlock    := "safeguard" "@" selector "{" sgAssignment+ "}"  // targets safeguard rules from a recipe-overrides marker
selector      := "all" | "tagged" | "untagged" | expr
expr          := notExpr (("and" | "or" | "&&" | "||") notExpr)*
notExpr       := ("not" | "!") notExpr | "(" expr ")" | term
term          := "tag" ("=" | ":") token | "tag" ("in" "[" tokenList "]" | "any" | "none")
             | "rank" "=" rankVal | "rank" (">=" | "<=") rankNum | "rarity" ("=" | ">=" | "<=") rarityName
             | "minrolls" ("=" | ">=" | "<=") number | "lockedminrolls" ("=" | ">=" | "<=") number
             | "minsubstats" ("=" | ">=" | "<=") number | "flex" ("=" | ":") flexVal
             | "substatmin" ("=" | ">=" | "<=") number | "substatmin." statKey ("=" | ">=" | "<=") number
             | "minima.any" ("=" | ">=" | "<=") number | "minima." starKey "." statKey ("=" | ">=" | "<=") number
assignment    := ("rank" | "rarity") ("=" | ">=" | "<=") value
             | ("slots" | "substats" | "mainstats" | "metasets") "=" prefixToken ("," prefixToken)*
             | "gearsets" "=" gearToken ("," gearToken)* | field "=" value
             | "rolltarget." statKey "=" number ("," [number])*
elseBlock     := ("else" | "fallback") "{" (selectorBlock | crossBlock)+ "}"   // option-level: applied when THIS option is unselected (e.g. unchecked box)
fallbackBlock := ("fallback" | "else") "{" (selectorBlock | crossBlock)+ "}"   // marker-level: applied when NO option in the marker is selected
constraints   := "!" tokenList | "excl" tokenList | "set" tokenList | "+" tokenList
             | "unset" tokenList | "-" tokenList | "only" tokenList | "^" tokenList
             | "needs" ["=" ("on" | "off")] tokenList   // disabled in the UI until a referenced id is selected; =on/off sets the shown state while disabled
tokenList     := token ("," token)*
field         := "export" | "rank" | "rarity" | "lvl" | "keep" | "autolate" | "minrolls" | "lockedminrolls"
             | "minsubstats" | "flex" | "substatmin" | "substatmin." statKey | "minima.any" | "minima." starKey "." statKey
value         := exportVal | keepVal | flexVal | rankVal | lvlVal | rarityName | number | string
exportVal     := "active" | "disabled" | "toggle"
keepVal       := "early" | "late"
flexVal       := "on" | "off" | "true" | "false"
rankVal       := "any" | rankNum
rankNum       := "1" | "2" | "3" | "4" | "5" | "6"
lvlVal        := lvlMilestone | lvlMilestone "-" lvlMilestone
lvlMilestone  := "0" | "4" | "8" | "12" | "16"
string        := '"' {char | escape} '"'
escape        := "\\" ("n" | "t" | "r" | "\\" | '"')  (\\n = newline, \\\\ = literal backslash)
comment       := "//" {any} eol | "/*" {any} "*/"
token         := /[\\p{L}\\p{M}_][\\p{L}\\p{N}\\p{M}_]*/  (unicode letters/marks, underscore)
rarityName    := "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythical" | "auto" | "any"
prefixToken   := ["+" | "-"] token   (all prefixed XOR all bare; mixed is ignored)
gearToken     := ["+" | "+-" | "-"] token
slotName      := "Weapon" | "Helmet" | "Shield" | "Gauntlets" | "Chestplate" | "Boots" | "Ring" | "Amulet" | "Banner"
setName       := ["+" | "+-" | "-"] /set name, case-insensitive; quote multi-word: "Crit Damage"/
metasetName   := ["+" | "-"] /metaset name, case-sensitive; must be unique in the save file/
starKey       := "1" | "2" | "3" | "4" | "5" | "6" | "one" | "two" | "three" | "four" | "five" | "six"`

// Full insertable example used in the markdown sample block.
const RECIPE_OVERRIDES_SAMPLE_EXAMPLE_TEXT = [
  // Comment marker + prompt header.
  '<!-- recipe-overrides',
  'q "Builder knobs (plain English)?',
  'Line two with **Bold** and `highlight`."',
  // Tag-specific enable/disable toggles.
  'radio "Default" "Activate recipes tagged mode" * { @tag=mode { export=active } }',
  'radio "Disable recipes tagged mode" { @tag=mode { export=disabled } }',
  'check "Activate only affects recipes tagged: fast" { @tag=fast { export=active } }',
  'check "Activate only affects recipes tagged: arena or dungeon" { @tag in [arena, dungeon] { export=active } }',
  'check "Activate only affects tagged recipes (any tag). Otherwise set Required Substats to 1 for tagged recipes." { @tag any { export=active } else { @tag any { minsubstats=1 } } }',
  'check "Activate only affects untagged recipes. Otherwise turn Flex off for untagged recipes." { @tag none { export=active } else { @tag none { flex=off } } }',
  // Attribute-based toggles for common filters.
  'check "Activate only affects Rank 5+ recipes" { @rank>=5 { export=active } }',
  'check "Activate only affects Epic+ recipes" { @rarity>=epic { export=active } }',
  'check "Activate only affects recipes with Min Required Rolls 3+" { @minrolls>=3 { export=active } }',
  'check "Activate only affects recipes with Required Substats 2+" { @minsubstats>=2 { export=active } }',
  'check "Activate only affects recipes with Flex turned on" { @flex=on { export=active } }',
  // Explicit id toggles + constraints.
  'check "Toggle 1 (explicit id)" id=m1 !14 { @all { export=disabled } }',
  'check "Toggle 2 (explicit id)" id=m2 !14 { @all { export=active } }',
  'check "Toggle 3 (implicit #3, excludes 1+2)" !m2 !m1 { @all { export=active } }',
  'check "Toggle 4 (set two ids)" +m1,m2 { @all { export=active } }',
  'check "Toggle 5 (unset one id)" -m1 { @all { export=active } }',
  'check "Toggle 6 (only one id allowed)" ^m2 { @all { export=active } }',
  // Rule overrides for export inputs.
  'check "Set Rank to 5" { @all { rank=5 } }',
  'check "Set Rarity to Legendary" { @all { rarity=legendary } }',
  'check "Set Level window to 12-16" { @all { lvl=12-16 } }',
  'check "Set Keep mode to Late" { @all { keep=late } }',
  'check "Auto-Late threshold: Rare+" { @all { autolate=rare } }',
  // Roll + substat constraints.
  'check "Set Min Required Rolls to 3" { @all { minrolls=3 } }',
  'check "Set Locked Min Required Rolls to 2" { @all { lockedminrolls=2 } }',
  'check "Set Required Substats to 2" { @all { minsubstats=2 } }',
  'check "Turn Flex off" { @all { flex=off } }',
  // Per-stat minima overrides.
  'check "Min Rolls (Per Stat): All = 1" { @all { substatmin=1 } }',
  'check "Min Rolls (Per Stat): SPD = 2" { @all { substatmin.SPD=2 } }',
  // Global minima overrides.
  'check "Global minima: use Rank 5 targets for Any" { @all { minima.any=5 } }',
  'check "Global minima: Rank 6 SPD = 6" { @all { minima.6.SPD=6 } }',
  // Slot type, substat, and main-stat list overrides (comma-separated, case-insensitive).
  'check "Restrict to Weapon and Helmet slots" { @all { slots=Weapon,Helmet } }',
  'check "Override substats to SPD and ATK%" { @all { substats=SPD,ATK% } }',
  'check "Override main stats to ATK%" { @all { mainstats=ATK% } }',
  // Gear-set and metaset overrides (comma-separated; gearsets supports +/- per entry).
  'check "Restrict to Speed sets" { @all { gearsets=Speed } }',
  'check "Restrict to Speed and Crit Damage sets" { @all { gearsets=Speed,"Crit Damage" } }',
  'check "Exclude Defense sets" { @all { gearsets=-Defense } }',
  'check "Use Nuker metaset only" { @all { metasets=Nuker } }',
  // Add/remove mutation examples for all 5 list fields.
  'check "Add SPD to substats" { @all { substats=+SPD } }',
  'check "Remove ATK% from substats" { @all { substats=-ATK% } }',
  'check "Add Weapon slot" { @all { slots=+Weapon } }',
  'check "Add Speed, exclude Defense" { @all { gearsets=+Speed,+-Defense } }',
  'check "Remove Speed from gearsets" { @all { gearsets=-Speed } }',
  'check "Add Nuker metaset" { @all { metasets=+Nuker } }',
  // Close the comment block.
  RECIPE_OVERRIDES_SAMPLE_CLOSE,
].join('\n')

// Compact tooltip example keeps the popper readable.
// Comment lines (// …) are colored muted gray by the line-comment grammar token.
const RECIPE_OVERRIDES_TOOLTIP_EXAMPLE_TEXT = [
  '<!-- recipe-overrides',
  '// q introduces a question; prompt is shown above the option buttons',
  'q "Enable arena recipes?"',
  '// radio = single-choice; * marks the option selected by default',
  'radio "Yes" * { @tag=arena { export=active } }',
  '// option without * is not the default',
  'radio "No"  { @tag=arena { export=disabled } }',
  RECIPE_OVERRIDES_SAMPLE_CLOSE,
].join('\n')

// Notes for roll-related fields in the full sample block.
const RECIPE_OVERRIDES_SAMPLE_NOTE = (
  'Note: substatmin sets Min Rolls (Per Stat) per recipe; use minima.any/minima.<star>.<stat> for global minima.'
)
// The EBNF popover is wider than the generic markdown tooltip to show grammar comfortably.
const RECIPE_OVERRIDES_TOOLTIP_MAX_WIDTH_PX = Math.round(MARKDOWN_TOOLTIP_MAX_WIDTH_PX * 2.25)
const RECIPE_OVERRIDES_TOOLTIP_WRAP_SX = {
  // Stack the EBNF and example blocks with consistent spacing.
  // Sizing (maxWidth, maxHeight, overflow) is handled by the Popover Paper.
  display: 'flex',
  flexDirection: 'column',
  gap: 0.75,
}
const RECIPE_OVERRIDES_TOOLTIP_CODE_SX = {
  // Use the mono stack so grammar alignment stays readable.
  fontFamily: 'var(--font-code, "JetBrains Mono", monospace)',
  // Slightly smaller text keeps the tooltip compact.
  fontSize: '0.78rem',
  // Preserve newlines while still wrapping long lines.
  whiteSpace: 'pre-wrap',
  // Tight line height keeps long blocks readable.
  lineHeight: 1.35,
  // Reset default <pre> margins to avoid extra gaps.
  m: 0,
  // Use CSS vars so the block adapts per scheme instead of always being dark.
  backgroundColor: 'var(--mui-palette-background-default)',
  borderRadius: '4px',
  p: '6px 8px',
  color: 'var(--mui-palette-text-primary)',
} satisfies Record<string, unknown>

// ── Safeguard-overrides EBNF documentation ─────────────────────────────────
const SAFEGUARD_OVERRIDES_EBNF_HEADER = 'Safeguard overrides syntax (EBNF):'
const SAFEGUARD_OVERRIDES_TOOLTIP_EXAMPLE_HEADER = 'Example:'

// Inline the exported assignment field and value keyword lists so the EBNF is SSOT-derived.
const _sgFields = NOTE_SAFEGUARD_OVERRIDES_ASSIGNMENT_FIELDS.join('" | "')
const _sgActVals = NOTE_SAFEGUARD_OVERRIDES_ACTIVATION_VALS.join('" | "')
const _sgMatchVals = NOTE_SAFEGUARD_OVERRIDES_SUBSTAT_MATCH_VALS.join('" | "')

// Static EBNF text for the safeguard-overrides DSL.
// Non-terminal names are kept to ≤13 chars. DSL field keywords are ≤13 chars.
// statKey row is injected at runtime (same list as recipe-overrides).
const SAFEGUARD_OVERRIDES_EBNF_BASE =
`marker        := "<!--" "${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}" [markerOptions] [question group+ [fallbackBlock]] "-->"
markerOptions := "[" markerOption ("," markerOption)* "]"
markerOption  := "${NOTE_RECIPE_OVERRIDES_MARKER_COLUMNS_KEY}" "=" number
question      := ("q" | "question") string group+ [fallbackBlock]
group         := ("single"|"s"|"rb"|"radiobutton"|"radio"|"multi"|"m"|"cb"|"checkbox"|"check")
             string [string] [headerToken {headerToken}] [constraints] "{" (selectorBlock | crossBlock)* [elseBlock] "}"
             | ("slider"|"range") string [headerToken {headerToken}] [constraints]
               sliderParam {sliderParam} "{" (selectorBlock | crossBlock)+ [elseBlock] "}"
sliderParam   := ("min" | "max" | "step" | "default") "=" number
             | "marks" "=" markItem ("," markItem)*        // labeled guide ticks
             | "toggle" "=" string                         // adds an on/off checkbox (off ⇒ the else block)
             | "toggleside" "=" ("left" | "above")         // checkbox placement (default: above)
             | "toggledefault" "=" ("on" | "off")          // initial checkbox state (default: on)
markItem      := number ":" string [":" string]            // value : label [: subtext-tooltip]
headerToken   := "id" "=" token | "*" | "default"
selectorBlock := "@" selector "{" sgAssignment+ "}"
crossBlock    := "recipe" "@" selector "{" recipeAssignment+ "}"
recipeAssignment := ("rank" | "rarity") ("=" | ">=" | "<=") value
             | ("slots" | "substats" | "mainstats" | "metasets") "=" prefixToken ("," prefixToken)*
             | "gearsets" "=" gearToken ("," gearToken)* | recipeField "=" value
             | "rolltarget." statKey "=" number ("," [number])*
recipeField   := "export" | "rank" | "rarity" | "lvl" | "keep" | "autolate" | "minrolls" | "lockedminrolls"
             | "minsubstats" | "flex" | "substatmin" | "substatmin." statKey | "minima.any" | "minima." starKey "." statKey
selector      := "all" | "tagged" | "untagged" | expr
expr          := notExpr (("and" | "or" | "&&" | "||") notExpr)*
notExpr       := ("not" | "!") notExpr | "(" expr ")" | term
term          := "tag" ("=" | ":") token | "tag" ("in" "[" tokenList "]" | "any" | "none")
sgAssignment  := "${_sgFields.split('" | "')[0]}" "=" activationVal   // activation
             | "count" "=" countExpr   // $count/$value expand to current slider position
             | ("ignprev"|"igncoll"|"ignvault"|"perfaction"|"permainstat"|"perslot"|"perset"|"perrule") "=" flexVal
             | "substats" "=" prefixToken ("," prefixToken)*
             | "substatmatch" "=" subMatchVal
             | "weight." statKey "=" number   // statKey case-insensitive (spd = SPD)
             | "improvchance" "=" impChanceVal
             | "rank" "=" prefixNum ("," prefixNum)*     // replace or mutate rank filter
             | "rarity" "=" prefixRarity ("," prefixRarity)*   // replace or mutate rarity filter
             | "faction" "=" prefixToken ("," prefixToken)*    // replace or mutate faction filter
countExpr     := "$count" | "$value" | "$count." token | number (("+" | "-" | "*" | "/") number)*
                 // in slider groups $count/$value expand to the current slider position
prefixNum     := ["+" | "-"] rankNum
prefixRarity  := ["+" | "-"] (rankNum | rarityName)
rankNum       := /1–6/   (integer star rank)
rarityName    := "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythical"
activationVal := "${_sgActVals}"
subMatchVal   := "${_sgMatchVals}"
impChanceVal  := "off" | "disabled" | "$value" | number ("," [number])*
                 // $value = the enclosing slider's position (flat threshold at every stage)
                 // 1–4 comma-separated values; omitted slots inherit from the previous stage
flexVal       := "on" | "off" | "true" | "false"
elseBlock     := ("else" | "fallback") "{" (selectorBlock | crossBlock)+ "}"   // option-level: applied when THIS option is unselected
fallbackBlock := ("fallback" | "else") "{" (selectorBlock | crossBlock)+ "}"   // marker-level: applied when NO option in the marker is selected
constraints   := "!" tokenList | "excl" tokenList | "set" tokenList | "+" tokenList
             | "unset" tokenList | "-" tokenList | "only" tokenList | "^" tokenList
             | "setval" valueAssignList
tokenList     := token ("," token)*
valueAssignList := token "=" number ("," token "=" number)*
                 // When THIS option becomes selected, write number into the slider whose
                 // id=token marker matches (persisted as a real stored value, like a drag). The
                 // target slider may live in another overrides domain (recipe checkbox ->
                 // safeguard slider). Afterwards the slider is an ordinary stored answer.
prefixToken   := ["+" | "-"] token   (all prefixed XOR all bare; mixed is ignored)
gearToken     := ["+" | "+-" | "-"] token
value         := exportVal | keepVal | flexVal | rankVal | lvlVal | rarityName | number | string
exportVal     := "active" | "disabled" | "toggle"
keepVal       := "early" | "late"
rankVal       := "any" | rankNum
lvlVal        := lvlMilestone | lvlMilestone "-" lvlMilestone
lvlMilestone  := "0" | "4" | "8" | "12" | "16"
starKey       := "1" | "2" | "3" | "4" | "5" | "6" | "one" | "two" | "three" | "four" | "five" | "six"
string        := '"' {char | escape} '"'
token         := /[\\p{L}\\p{M}_][\\p{L}\\p{N}\\p{M}_]*/`

const SAFEGUARD_OVERRIDES_TOOLTIP_EXAMPLE_TEXT = [
  `<!-- ${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}`,
  '// q introduces a question prompt shown above the option groups',
  'q "Modify ring safeguard rules?"',
  '// radio = single-choice; * marks the option selected by default',
  'radio "Default (off)" * { @tag=rings { activation=off } }',
  'radio "Protect existing" { @tag=rings { activation=protect_existing } }',
  '// slider allows choosing a numeric value in a range',
  'slider "Ring guard count" min=1 max=5 default=1 {',
  '  @tag=rings { count=$value }',
  '}',
  '-->',
].join('\n')

// Keep EBNF tooltip styling consistent with recipe-overrides.
const SAFEGUARD_OVERRIDES_TOOLTIP_WRAP_SX = RECIPE_OVERRIDES_TOOLTIP_WRAP_SX
const SAFEGUARD_OVERRIDES_TOOLTIP_CODE_SX = RECIPE_OVERRIDES_TOOLTIP_CODE_SX

// Toolbar command key for the safeguard-overrides sample insert.
const SAFEGUARD_OVERRIDES_SAMPLE_COMMAND_KEY = 'insert-safeguardOverrides-sample'

// Insertable sample block text for the toolbar command.
const SAFEGUARD_OVERRIDES_SAMPLE_TEXT = [
  `<!-- ${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}`,
  'q "Override safeguard rules"',
  'radio "Default (no change)" * { @all { activation=protect_existing } }',
  'radio "Disable all safeguards" { @all { activation=off } }',
  'radio "Disable ring safeguards" { @tag=rings { activation=off } }',
  'slider "Ring guard required count" min=1 max=5 default=1 {',
  '  @tag=rings { count=$value }',
  '}',
  '-->',
].join('\n')

function buildRecipeOverridesStatKeys(): string[] {
  // Enumerate supported stat variants in their canonical order.
  const variants = [...STAT_VARIANTS_PRIORITY]
  // Convert variants to human labels while skipping empty entries.
  const statLabels = variants
    .map((variant) => labelOfVariant(variant))
    .filter((label) => Boolean(label && label.trim().length > 0))
  // De-dupe labels while preserving the original ordering.
  const seen = new Set<string>()
  const statKeys: string[] = []
  statLabels.forEach((label) => {
    if (seen.has(label)) return
    seen.add(label)
    statKeys.push(label)
  })
  // Return the ordered labels for EBNF output.
  return statKeys
}

function buildRecipeOverridesStatKeyLine(statKeys: string[]): string {
  // Quote each key so the EBNF literal list is explicit.
  const quoted = statKeys.map((label) => `"${label.replace(/"/g, '\\"')}"`)
  // Align the first line with the rest of the EBNF block.
  const prefix = 'statKey       := '
  const continuation = '             | '
  const lines: string[] = []
  let current = prefix
  quoted.forEach((token) => {
    if (current === prefix) {
      current = `${current}${token}`
      return
    }
    const candidate = `${current} | ${token}`
    if (candidate.length > RECIPE_OVERRIDES_EBNF_MAX_LINE_LENGTH) {
      lines.push(current)
      current = `${continuation}${token}`
    } else {
      current = candidate
    }
  })
  // Push the last line if it has content.
  if (current.trim()) lines.push(current)
  return lines.join('\n')
}

function buildRecipeOverridesEbnfText(): string {
  // Build the runtime statKey list from current variant labels.
  const statKeys = buildRecipeOverridesStatKeys()
  // Compose the statKey line for the EBNF block.
  const statKeyLine = buildRecipeOverridesStatKeyLine(statKeys)
  // Concatenate the static EBNF base with the runtime statKey row.
  return `${RECIPE_OVERRIDES_EBNF_BASE}\n${statKeyLine}`
}

function buildSafeguardOverridesEbnfText(): string {
  // Reuse the same statKey line as recipe-overrides so both EBNFs stay in sync.
  const statKeyLine = buildRecipeOverridesStatKeyLine(buildRecipeOverridesStatKeys())
  return `${SAFEGUARD_OVERRIDES_EBNF_BASE}\n${statKeyLine}`
}

function buildRecipeOverridesSampleBlock(): string {
  // Build the EBNF block with the runtime statKey row injected.
  const ebnfText = buildRecipeOverridesEbnfText()
  // Compose the full sample block without parsing or splitting.
  const lines = [
    RECIPE_OVERRIDES_EBNF_HEADER,
    RECIPE_OVERRIDES_EBNF_FENCE_START,
    ebnfText,
    RECIPE_OVERRIDES_EBNF_FENCE_END,
    '',
    RECIPE_OVERRIDES_SAMPLE_EXAMPLE_HEADER,
    RECIPE_OVERRIDES_SAMPLE_EXAMPLE_TEXT,
    '',
    RECIPE_OVERRIDES_SAMPLE_NOTE,
  ]
  // Join once so the editor insertion stays stable.
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

type RecipeChipBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function RecipeChipBlock({ node }: RecipeChipBlockProps): JSX.Element | null {
  const { recipes, metasets, substatColors, markerResolutions } = useNoteRenderContext()
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  const filterAttr = coerceFirstString(node?.properties?.[RECIPE_ELEMENT_FILTER_ATTR])
  const filterType = filterAttr === RECIPE_FILTER_REGEXP ? RECIPE_FILTER_REGEXP : RECIPE_FILTER_IDS
  let tokens: MarkerToken[] = []
  let patternRaw = ''
  if (filterType === RECIPE_FILTER_IDS) {
    const rawSpec = coerceFirstString(node?.properties?.[RECIPE_ELEMENT_ATTR]) ?? ''
    tokens = parseMarkerTokens(rawSpec)
    if (tokens.length === 0) return null
  } else {
    patternRaw = coerceFirstString(node?.properties?.[RECIPE_ELEMENT_PATTERN_ATTR]) ?? ''
  }
  const rawIndexAttr = coerceFirstString(node?.properties?.[RECIPE_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  let resolvedEntries: RecipeMarkerEntry[] | undefined
  if (markerIndex != null) {
    resolvedEntries = markerResolutions.get(markerIndex)
  }
  if (!resolvedEntries) {
    if (filterType === RECIPE_FILTER_REGEXP) {
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        resolvedEntries = recipes
          .map((recipe, idx) => ({ recipe, idx }))
          .filter(({ recipe }) => {
            return recipeMatchesNotePattern(recipe, safeCompiled)
          })
          .map(({ recipe, idx }) => ({ id: idx + 1, recipe }))
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
      const fallbackEntries: RecipeMarkerEntry[] = []
      let markerLast = priorLast
      for (const token of tokens) {
        const candidate = token.type === 'absolute' ? token.value : markerLast + 1
        if (!candidate || candidate <= 0) continue
        const recipe = recipes[candidate - 1]
        if (!recipe) continue
        fallbackEntries.push({ id: candidate, recipe })
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
      {entries.map(({ id, recipe }, idx) => (
        <Box
          key={`note-recipe-${id}`}
          sx={{
            pointerEvents: 'none',
            width: '100%',
            '& .MuiIconButton-root': { display: 'none !important' },
          }}
        >
            <RecipeChip
              index={id - 1}
              recipe={recipe}
              gearSetCatalogVersion={gearSetCatalogVersion}
              onDelete={noop}
              onDuplicate={noop}
              onMoveUp={noop}
              onMoveDown={noop}
              selected={false}
              onSelect={noop}
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
  // Shared sizing keeps recipe overrides and safeguard cards aligned.
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
  // Reuse the Safeguard scope chip styling for note highlights.
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 0.4,
    px: 0.5,
    py: 0.3,
    borderRadius: 1,
    border: '1px solid',
    // Active styling uses the primary palette; inactive stays neutral.
    borderColor: active ? TINT.primaryGlow : 'divider',
    bgcolor: active
      ? TINT.primaryActiveBg
      : 'transparent',
    color: active ? (theme.vars?.palette.primary.main ?? theme.palette.primary.main) : 'text.secondary',
  } satisfies Record<string, unknown>
}

// ── Option info tooltip (editor preview only) ────────────────────────────────
// Layout (all gated on isEditorPreview — the end-user note view is never affected):
//   Header     plainLabel  [default]  (slider)
//   sub-line   id=token  ·  multi      (muted)
//   CHANGES    <pre> Prism panel: `selector: field=value …` (real values, B1)
//              range: min–max (default N)        ← slider options only
//   FORCES     on / off / excl / needs rows of `#idx label…` short refs
//
// The CHANGES <pre> renders through the `dynamic-overrides` Prism grammar (same as the
// EBNF example tooltips) on a background.default surface — that is the surface the
// --note-tok-* vars were contrast-adapted against, so colours are correct there. The
// FORCES section renders on the tooltip's background.paper, so its token colours run
// through useSubstatFgAdapter() to stay legible on that lighter surface.

// Selector → full DSL condition text via the parser-side SSOT formatters. Recipe selectors
// can carry op+value conditions (e.g. `lockedminrolls=4`, `rank≥3`); safeguard selectors are the
// tag-only subset. Dispatch by the block's domain so the value-bearing recipe conditions render
// in full (the bare token map dropped the `=value` part).
function noteOverrideSelectorToDsl(selector: { kind: string; [k: string]: unknown }, domain: NoteOverrideDomain): string {
  return domain === 'recipe'
    ? formatRecipeOverridesSelector(selector as unknown as RecipeOverridesSelector)
    : formatNoteTagSelector(selector as unknown as NoteTagSelector)
}

// Operation kind → DSL assignment-field token, merged from the two parser-side SSOT maps.
const NOTE_OVERRIDE_OP_FIELD_MAP: Record<string, string> = {
  ...RECIPE_OVERRIDES_OP_FIELD,
  ...SAFEGUARD_OVERRIDES_OP_FIELD,
}

// Domain of an option's blocks — picks the right SSOT value formatter.
type NoteOverrideDomain = 'recipe' | 'safeguard'

// When the block's operations apply: while the option is selected ('on'), while it is
// NOT selected ('off', i.e. an `else` block), or as a cross-domain effect.
type NoteOverridePhase = 'on' | 'off'

// Structural block type compatible with RecipeOverridesSelectorBlock and SafeguardOverridesSelectorBlock.
// Operations are kept as the real union (cast at the call boundary) so value formatters apply.
// `phase` distinguishes when-selected vs when-unselected (else) blocks; `domain` says which
// formatter/keyword applies (a recipe option's safeguard blocks are cross-domain → 'safeguard').
type NoteOverrideInfoBlock = {
  selector: { kind: string; [k: string]: unknown }
  operations: Array<RecipeOverridesOperation | SafeguardOverridesOperation>
  phase: NoteOverridePhase
  domain: NoteOverrideDomain
  cross: boolean
}

// Format one operation as `field=value` (or bare `field` when the op has no scalar value),
// dispatching to the domain's exhaustive SSOT formatter. Field token comes from the merged
// SSOT field map — the component holds no DSL vocabulary of its own.
function formatOverrideOp(op: RecipeOverridesOperation | SafeguardOverridesOperation, domain: NoteOverrideDomain): string {
  const field = NOTE_OVERRIDE_OP_FIELD_MAP[op.kind] ?? op.kind
  const value = domain === 'recipe'
    ? formatRecipeOverridesOpValue(op as RecipeOverridesOperation)
    : formatSafeguardOverridesOpValue(op as SafeguardOverridesOperation)
  return value != null && value !== '' ? `${field}=${value}` : field
}

const NOTE_OPTION_INFO_TOOLTIP_MAX_WIDTH_PX = Math.round(MARKDOWN_TOOLTIP_MAX_WIDTH_PX * 1.6)
// Truncation cap for a forces-reference answer label (kept short so the list stays tidy).
const NOTE_OPTION_REF_LABEL_MAX_CH = 16

// Derive the tooltip slider-range info from a safeguard option's slider params.
// Returns null for non-slider options (no min/max present). `step` is intentionally
// omitted from the display per the agreed design.
function buildOptionSliderInfo(
  option: { sliderMin?: number; sliderMax?: number; sliderDefault?: number },
): { min: number; max: number; default: number } | null {
  if (option.sliderMin == null || option.sliderMax == null) return null
  return { min: option.sliderMin, max: option.sliderMax, default: option.sliderDefault ?? option.sliderMin }
}

// Strip chip backticks and **bold** emphasis from a label and collapse whitespace,
// so a constraint reference reads as plain prose rather than raw markup.
function cleanOptionRefLabel(raw: string): string {
  return raw
    .replace(/`([^`]*)`/g, '$1')        // chip backticks → bare text
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** → bare text
    .replace(/\\n|\r?\n|\r/g, ' ')        // literal/real newlines → space
    .replace(/\s+/g, ' ')
    .trim()
}

// Resolve a forces-reference (an option id in another question) to the target's unique token
// and a SHORTENED answer label. Reused labels (Yes/No/Strict across many questions) make the
// token the only disambiguating identifier, so we lead with it. Falls back to parsing the id's
// own embedded label when the global lookup misses (e.g. an unresolved/dangling reference).
function resolveOptionRef(
  id: string,
  lookup: Map<string, { token: string; label: string }> | undefined,
): { token: string | null; answer: string } {
  const hit = lookup?.get(id)
  if (hit) {
    const token = hit.token && !/^\d+$/.test(hit.token) ? hit.token : null
    return { token, answer: cleanOptionRefLabel(hit.label) }
  }
  // Fallback: the id embeds `<questionId>:<label>#<index>`.
  const withoutIndex = id.replace(/#\d+$/, '')
  const colonIdx = withoutIndex.indexOf(':')
  return { token: null, answer: cleanOptionRefLabel(colonIdx >= 0 ? withoutIndex.slice(colonIdx + 1) : withoutIndex) }
}

// Render one forces reference as `token: short-answer`. The token (DSL-unique) is the primary
// identifier; the shortened answer gives quick human context. `tokenColor` is contrast-adapted.
function NoteOptionRefChip(
  { id, tokenColor, lookup }:
  { id: string; tokenColor: string; lookup: Map<string, { token: string; label: string }> | undefined },
): JSX.Element {
  const { token, answer } = resolveOptionRef(id, lookup)
  const shortAnswer = answer.length > NOTE_OPTION_REF_LABEL_MAX_CH
    ? `${answer.slice(0, NOTE_OPTION_REF_LABEL_MAX_CH - 1)}…`
    : answer
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.4, whiteSpace: 'nowrap', mr: 1.25 }}>
      {token && (
        <Box component="span" sx={{ color: tokenColor, fontFamily: 'var(--font-code, monospace)', fontSize: '0.8rem', fontWeight: 600 }}>
          {token}{shortAnswer ? ':' : ''}
        </Box>
      )}
      {shortAnswer && (
        <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{shortAnswer}</Box>
      )}
      {/* When neither token nor answer resolved, fall back to the raw id so nothing renders blank. */}
      {!token && !shortAnswer && (
        <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>{id}</Box>
      )}
    </Box>
  )
}

// Build the CHANGES DSL snippet: header (id/index + optional `*`) then one
// `[prefix ]selector: field=value …` line per block. The id/default header is NOT included
// here — it lives in the tooltip's dedicated id section. Values are the real B1 reconstruction.
function buildOptionInfoDsl(opts: { blocks: NoteOverrideInfoBlock[] }): string {
  const lines: string[] = []
  // One `[prefix ]selector: field=value …` line per non-empty block.
  // Prefixes mark when/where the block applies: `else` = while UNSELECTED; a domain word
  // (`safeguard`/`recipe`) = a cross-domain effect on the other rule type.
  for (const block of opts.blocks) {
    if (block.operations.length === 0) continue
    const parts = block.operations.map((op) => formatOverrideOp(op, block.domain))
    const prefixes: string[] = []
    if (block.phase === 'off') prefixes.push('else')
    if (block.cross) prefixes.push(block.domain)
    const prefix = prefixes.length > 0 ? `${prefixes.join(' ')} ` : ''
    lines.push(`${prefix}${noteOverrideSelectorToDsl(block.selector, block.domain)}: ${parts.join(' ')}`)
  }
  return lines.join('\n')
}

// Shared dark "code surface" panel that wraps BOTH the CHANGES and FORCES section bodies
// (background.default = the surface the --note-tok-* vars are contrast-adapted against).
const NOTE_OPTION_INFO_PANEL_SX = {
  backgroundColor: 'var(--mui-palette-background-default)',
  borderRadius: '4px',
  p: '8px 10px',
  color: 'var(--mui-palette-text-primary)',
} satisfies Record<string, unknown>
// The CHANGES DSL <pre> itself — transparent (the panel above provides the surface).
const NOTE_OPTION_INFO_PRE_SX = {
  fontFamily: 'var(--font-code, "JetBrains Mono", monospace)',
  fontSize: '0.85rem',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  lineHeight: 1.55,
  m: 0,
  backgroundColor: 'transparent',
  color: 'inherit',
} satisfies Record<string, unknown>

// Small inline `default` chip shown on the default option row in the editor preview
// (edit-preview only — never in the end-user note view). Colour is contrast-adapted
// against the card/paper surface via useSubstatFgAdapter.
function NoteOptionDefaultChip(): JSX.Element {
  const adaptFg = useSubstatFgAdapter()
  const color = adaptFg(RECIPE_OVERRIDES_TOKEN_COLORS['default-kw']) ?? 'inherit'
  return (
    <Box
      component="span"
      sx={{
        ml: 0.5,
        fontSize: '0.62rem',
        lineHeight: 1.5,
        color,
        border: '1px solid',
        borderColor: color,
        borderRadius: 0.5,
        px: 0.4,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      default
    </Box>
  )
}

// Uppercase section heading (ID / FORCES / CHANGES). Colour matches the DSL palette
// (the same selector-builtin accent the CHANGES code panel uses), contrast-adapted by caller.
function NoteTooltipSectionHeading({ children, color }: { children: React.ReactNode; color: string }): JSX.Element {
  return (
    <Typography
      component="div"
      sx={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color, mb: 0.5, fontFamily: 'var(--font-code, monospace)' }}
    >
      {children}
    </Typography>
  )
}

// One labelled FORCES row: keyword gutter (on/off/excl/needs) + the `token: answer` refs.
// `kwColor`/`tokenColor` are contrast-adapted by the caller for the tooltip paper surface.
function NoteOptionConstraintRow(
  { label, ids, kwColor, tokenColor, lookup, suffix }:
  { label: string; ids: string[]; kwColor: string; tokenColor: string; lookup: Map<string, { token: string; label: string }> | undefined; suffix?: string | undefined },
): JSX.Element | null {
  if (ids.length === 0) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 0.25 }}>
      <Typography component="span" sx={{ fontSize: '0.8rem', width: '4em', flexShrink: 0, color: kwColor, fontFamily: 'var(--font-code, monospace)' }}>
        {label}
      </Typography>
      <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', rowGap: 0.25, minWidth: 0 }}>
        {ids.map((id) => <NoteOptionRefChip key={id} id={id} tokenColor={tokenColor} lookup={lookup} />)}
        {suffix && (
          <Typography component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontStyle: 'italic' }}>{suffix}</Typography>
        )}
      </Box>
    </Box>
  )
}

// FORCES row for `setval token=N` directives. Unlike on/off/excl/needs (which reference sibling
// option ids), these target SLIDERS by id=token — usually in the other overrides domain — so they
// render as `token=value` literals rather than resolved option-ref chips.
function NoteOptionSetvalRow(
  { directives, kwColor, tokenColor }:
  { directives: { token: string; value: number }[]; kwColor: string; tokenColor: string },
): JSX.Element | null {
  if (directives.length === 0) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mb: 0.25 }}>
      <Typography component="span" sx={{ fontSize: '0.8rem', width: '4em', flexShrink: 0, color: kwColor, fontFamily: 'var(--font-code, monospace)' }}>
        setval
      </Typography>
      <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25, minWidth: 0 }}>
        {directives.map((d) => (
          <Typography key={d.token} component="span" sx={{ fontSize: '0.78rem', color: tokenColor, fontFamily: 'var(--font-code, monospace)' }}>
            {d.token}={d.value}
          </Typography>
        ))}
      </Box>
    </Box>
  )
}

// Tooltip body. See the layout comment above the section. All sections are render-time
// derived from the structured option; nothing here mutates note state.
function NoteOptionInfoTooltipContent({
  token,
  label,
  isDefault,
  setOptionIds,
  unsetOptionIds,
  excludedOptionIds,
  requiresOptionIds,
  requiresDisabledState,
  setValueDirectives,
  slider,
  positionalIndex,
  blocks,
}: {
  token: string
  label: string
  isDefault: boolean
  setOptionIds: string[]
  unsetOptionIds: string[]
  excludedOptionIds: string[]
  requiresOptionIds: string[]
  requiresDisabledState?: 'on' | 'off' | null | undefined
  setValueDirectives?: { token: string; value: number }[]
  slider?: { min: number; max: number; default: number } | null | undefined
  positionalIndex: number
  blocks: NoteOverrideInfoBlock[]
}): JSX.Element {
  // Global option lookup so FORCES refs resolve to the target's unique token + answer.
  const { optionLookup } = useNoteRenderContext()
  // Contrast-adapt DSL-palette token colours against the tooltip paper surface. Section
  // headings reuse the same selector-builtin accent as the CHANGES code panel.
  const adaptFg = useSubstatFgAdapter()
  const headingColor = adaptFg(RECIPE_OVERRIDES_TOKEN_COLORS['selector-builtin']) ?? 'inherit'
  const constraintKwColor = adaptFg(RECIPE_OVERRIDES_TOKEN_COLORS['constraint-kw']) ?? 'inherit'
  const tokenColor = adaptFg(RECIPE_OVERRIDES_TOKEN_COLORS['id-name']) ?? 'inherit'
  const defaultColor = adaptFg(RECIPE_OVERRIDES_TOKEN_COLORS['default-kw']) ?? 'inherit'
  // Strip emphasis/chip markers from the label so the header reads as plain text.
  const plainLabel = cleanOptionRefLabel(label)
  // Does this option change any fields of its own (when selected, when unselected, or
  // cross-domain)? A pure preset only forces other options and has no field operations.
  const hasOwnFields = blocks.some((b) => b.operations.length > 0)
  // Reconstruct the CHANGES DSL ([prefix ]selector→field=value — no id header line).
  const dsl = buildOptionInfoDsl({ blocks })
  const setvals = setValueDirectives ?? []
  const hasConstraints = setOptionIds.length + unsetOptionIds.length + excludedOptionIds.length + requiresOptionIds.length + setvals.length > 0
  // needs-gate display state suffix (`shown off until met`), display-only.
  const needsSuffix = requiresDisabledState ? `shown ${requiresDisabledState} until met` : undefined
  // ID reference: explicit `id=token` verbatim; otherwise the 1-based position (the DSL
  // fallback when no `id=` is set), shown as `#index (by position)`.
  const hasExplicitId = token !== '' && !/^\d+$/.test(token)
  const idText = hasExplicitId ? `id=${token}` : `#${positionalIndex}`
  const idHint = hasExplicitId ? '' : ' (by position)'
  return (
    <Box sx={{ maxWidth: NOTE_OPTION_INFO_TOOLTIP_MAX_WIDTH_PX, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {/* Header: plain label + default chip + preset hint. */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography component="span" sx={{ fontSize: '0.95rem', fontWeight: 600, color: 'text.primary' }}>
            {plainLabel || token}
          </Typography>
          {isDefault && (
            <Box component="span" sx={{ fontSize: '0.7rem', color: defaultColor, border: '1px solid', borderColor: defaultColor, borderRadius: 0.5, px: 0.5, lineHeight: 1.6 }}>
              default
            </Box>
          )}
        </Box>
        {/* ID section: how to address this option in the DSL. */}
        <Typography component="div" sx={{ fontSize: '0.78rem', color: tokenColor, fontFamily: 'var(--font-code, monospace)', mt: 0.25 }}>
          {idText}<Box component="span" sx={{ fontFamily: 'inherit', color: 'text.disabled' }}>{idHint}</Box>
        </Typography>
      </Box>
      {/* FORCES: other options this one toggles, as `token: answer` refs. Always shown — on the
          same dark code surface as CHANGES; `nothing` (italic) when this option forces nothing. */}
      <Box>
        <NoteTooltipSectionHeading color={headingColor}>forces</NoteTooltipSectionHeading>
        <Box sx={NOTE_OPTION_INFO_PANEL_SX}>
          {hasConstraints ? (
            <>
              <NoteOptionConstraintRow label="on" ids={setOptionIds} kwColor={constraintKwColor} tokenColor={tokenColor} lookup={optionLookup} />
              <NoteOptionConstraintRow label="off" ids={unsetOptionIds} kwColor={constraintKwColor} tokenColor={tokenColor} lookup={optionLookup} />
              <NoteOptionConstraintRow label="excl" ids={excludedOptionIds} kwColor={constraintKwColor} tokenColor={tokenColor} lookup={optionLookup} />
              <NoteOptionConstraintRow label="needs" ids={requiresOptionIds} kwColor={constraintKwColor} tokenColor={tokenColor} lookup={optionLookup} suffix={needsSuffix} />
              <NoteOptionSetvalRow directives={setvals} kwColor={constraintKwColor} tokenColor={tokenColor} />
            </>
          ) : (
            <NoteTooltipNothing />
          )}
        </Box>
      </Box>
      {/* CHANGES: the option's own field changes as highlighted DSL + slider range. Always shown;
          `nothing` (italic) when this option changes no fields of its own (a pure preset switch). */}
      <Box>
        <NoteTooltipSectionHeading color={headingColor}>changes</NoteTooltipSectionHeading>
        {hasOwnFields || slider ? (
          <Box sx={NOTE_OPTION_INFO_PANEL_SX}>
            {hasOwnFields && renderPrismHighlighted(dsl, 'dynamic-overrides', NOTE_OPTION_INFO_PRE_SX)}
            {slider && (
              <Typography component="div" sx={{ fontSize: '0.8rem', color: 'text.secondary', mt: hasOwnFields ? 0.5 : 0, fontFamily: 'var(--font-code, monospace)' }}>
                range: {slider.min}–{slider.max} (default {slider.default})
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={NOTE_OPTION_INFO_PANEL_SX}><NoteTooltipNothing /></Box>
        )}
      </Box>
    </Box>
  )
}

// Italic muted "nothing" shown in an empty FORCES/CHANGES panel.
function NoteTooltipNothing(): JSX.Element {
  return <Typography component="span" sx={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'text.disabled' }}>nothing</Typography>
}

// A raw selector block (recipe or safeguard) as carried on a parsed option.
type RawOverrideBlock = { selector: { kind: string; [k: string]: unknown }; operations: Array<RecipeOverridesOperation | SafeguardOverridesOperation> }

// Minimal structural shape an option must satisfy to drive the info tooltip. Recipe
// and safeguard options both provide these (requiresOptionIds/State are recipe-only).
// The four block buckets cover when-selected, when-unselected (else), and the two
// cross-domain variants; field names differ per domain, so both naming sets are optional.
type NoteInfoTooltipOption = {
  token: string
  label: string
  isDefault: boolean
  groupType: string
  setOptionIds: string[]
  unsetOptionIds: string[]
  excludedOptionIds: string[]
  requiresOptionIds?: string[]
  requiresDisabledState?: 'on' | 'off' | null
  // `setval token=N` cross-domain slider value forces (recipe option only carries these).
  setValueDirectives?: { token: string; value: number }[]
  sliderMin?: number
  sliderMax?: number
  sliderDefault?: number
  positionalIndex: number
  sourceFrom?: number
  sourceTo?: number
  // when-selected, same-domain blocks (both domains call this `blocks`).
  blocks: RawOverrideBlock[]
  // recipe option: when-unselected same-domain (`else`).
  elseBlocks?: RawOverrideBlock[]
  // recipe option: cross-domain (safeguard) blocks, on / off.
  safeguardBlocks?: RawOverrideBlock[]
  safeguardElseBlocks?: RawOverrideBlock[]
  // safeguard option: when-unselected same-domain (`fallback`).
  fallbackBlocks?: RawOverrideBlock[]
  // safeguard option: cross-domain (recipe) blocks, on / off.
  recipeBlocks?: RawOverrideBlock[]
  recipeFallbackBlocks?: RawOverrideBlock[]
}

// Assemble the tagged block list the tooltip renders, from an option's raw block buckets.
// Each entry records when it applies (phase), which formatter/keyword to use (domain), and
// whether it is a cross-domain effect (so the DSL gets the `safeguard`/`recipe` prefix).
function assembleOptionInfoBlocks(option: NoteInfoTooltipOption, domain: NoteOverrideDomain): NoteOverrideInfoBlock[] {
  const crossDomain: NoteOverrideDomain = domain === 'recipe' ? 'safeguard' : 'recipe'
  const tag = (raw: RawOverrideBlock[] | undefined, phase: NoteOverridePhase, d: NoteOverrideDomain, cross: boolean): NoteOverrideInfoBlock[] =>
    (raw ?? []).map((b) => ({ selector: b.selector, operations: b.operations, phase, domain: d, cross }))
  return [
    ...tag(option.blocks, 'on', domain, false),
    ...tag(option.elseBlocks ?? option.fallbackBlocks, 'off', domain, false),
    ...tag(option.safeguardBlocks ?? option.recipeBlocks, 'on', crossDomain, true),
    ...tag(option.safeguardElseBlocks ?? option.recipeFallbackBlocks, 'off', crossDomain, true),
  ]
}

// Wrap any control (FormControlLabel, slider Box, …) so hovering ANYWHERE on it shows
// the option-info tooltip, and clicking it selects the option's DSL in the editor.
// Used in the editor preview only — callers gate on isEditorPreview. Centralizes the
// option→tooltip prop mapping so the 5 control sites (recipe radio/checkbox, safeguard
// radio/checkbox/slider) stay in lock-step.
function NoteOptionInfoTooltipWrap(
  { option, domain, children }:
  { option: NoteInfoTooltipOption; domain: NoteOverrideDomain; children: React.ReactElement },
): JSX.Element {
  const { onRevealOptionSource } = useNoteRenderContext()
  // Clicking the control scrolls the option's DSL into view in the editor and pulses it.
  // Rather than a per-control React onClick (unreliable: the disabled control swallows clicks and
  // the tooltip clones the child), we stamp the source span as DOM data-attrs and let a single
  // delegated listener on the preview container (installed by useEditorPreviewScrollSync) handle
  // the click. The wrapper still gives a pointer cursor as the affordance.
  const canReveal = onRevealOptionSource != null && option.sourceFrom != null && option.sourceTo != null
  const clickable = canReveal
    ? (
      <Box data-reveal-from={option.sourceFrom} data-reveal-to={option.sourceTo} sx={{ cursor: 'pointer' }}>
        {children}
      </Box>
    )
    : children
  return (
    <MarkdownTooltip
      render={(
        <NoteOptionInfoTooltipContent
          token={option.token}
          label={option.label}
          isDefault={option.isDefault}
          setOptionIds={option.setOptionIds}
          unsetOptionIds={option.unsetOptionIds}
          excludedOptionIds={option.excludedOptionIds}
          requiresOptionIds={option.requiresOptionIds ?? []}
          requiresDisabledState={option.requiresDisabledState ?? null}
          setValueDirectives={option.setValueDirectives ?? []}
          slider={buildOptionSliderInfo(option)}
          positionalIndex={option.positionalIndex}
          blocks={assembleOptionInfoBlocks(option, domain)}
        />
      )}
      hoverIntent="informational"
      placement="right"
    >
      {clickable}
    </MarkdownTooltip>
  )
}

function NoteQuestionBlock({ node }: NoteQuestionBlockProps): JSX.Element | null {
  // Pull recipe overrides wiring from context.
  const { recipeOverridesResolutions, recipeOverridesEditable, noteOverridesDisabled, onRecipeOverridesAnswerChange, isEditorPreview } = useNoteRenderContext()
  const theme = useTheme()
  // Extract the marker index from the custom element.
  const rawIndexAttr = coerceFirstString(node?.properties?.[QUESTION_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  // Lookup the parsed question definition by marker index.
  const question = markerIndex != null ? recipeOverridesResolutions.get(markerIndex) : undefined
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
  // Style chips to match Safeguard scope chips for visual consistency.
  const promptChipSx = useMemo(
    () => buildNoteScopeChipSx(theme, true),
    [theme],
  )
  // Emphasized text mirrors the Safeguard label styling.
  const promptLabelSx = useMemo(
    () => ({
      ...NOTE_CARD_LABEL_TEXT_SX,
      display: 'inline-flex',
      alignItems: 'center',
    }),
    [],
  )
  // Normalize options so hook dependencies stay consistent.
  const questionOptions = useMemo(
    () => (question?.options ?? []),
    [question],
  )
  // Horizontal alignment changes only when every option provides a detail label.
  const allHorizontalOptionsHaveLabels = useMemo(
    () => questionOptions.length > 0 && questionOptions.every((option) => Boolean(option.detail)),
    [questionOptions],
  )
  // Clamp the label column width so short labels stay readable.
  const labelColumnCh = useMemo(() => {
    // Measure only the explicit label column values for the two-column layout.
    const labelLengths = questionOptions
      .filter((option) => Boolean(option.detail))
      .map((option) => measureOptionLabelLength(option.label))
    // Use a zero-width column when no label/detail pairs exist.
    const hasLabelColumn = labelLengths.length > 0
    // Use the exact widest label so the column doesn't overshoot content.
    const rawMax = hasLabelColumn ? Math.max(...labelLengths) : 0
    // Add a small pad so bold text doesn't wrap unexpectedly.
    const paddedMax = rawMax + NOTE_QUESTION_LABEL_COLUMN_PAD_CH
    // Cap extreme labels so the value column keeps room to breathe.
    return hasLabelColumn ? Math.min(paddedMax, 24) : 0
  }, [questionOptions])
  if (!question) return null
  // Body-less spacer marker: invisible flex placeholder with the same width as a columns=N card.
  if (question.isSpacer) {
    const { flexBasis, minWidth, maxWidth } = getNoteCardWidthStyles('note')
    const cols = Math.max(1, question.layoutColumns)
    const gapPx = NOTE_CARD_GAP_PX * (cols - 1)
    const spacerSx = cols > 1
      ? { flex: `1 1 ${cols * flexBasis + gapPx}px`, minWidth: cols * minWidth + gapPx, maxWidth: cols * maxWidth + gapPx }
      : { flex: `1 1 ${flexBasis}px`, minWidth, maxWidth }
    return <Box sx={{ ...spacerSx, visibility: 'hidden' }} />
  }
  // columns ≥ 1 enables horizontal (grid) option layout.
  const isHorizontal = question.layoutColumns > 0
  // Resolve the selected answers into a set for fast checks.
  const selected = Array.isArray(question.answer) ? question.answer : []
  const selectedSet = new Set<string>(selected)
  // Wrap answer updates so callers can track changes.
  const applyAnswer = (next: string[], preferredId?: string, removedId?: string) => {
    onRecipeOverridesAnswerChange(question, next, preferredId, removedId)
  }
  // Shared sizing keeps question cards in lockstep with safeguard cards.
  const { flexBasis, minWidth, maxWidth } = getNoteCardWidthStyles('note')
  // Reuse the non-horizontal min width as the grid's minimum column width.
  const optionColumnMinWidth = minWidth
  // Pick the option group layout based on the marker-level layout mode.
  // Always pass 0 (auto-fit) — card width is the constraint, not a fixed column count.
  const optionGroupSx = isHorizontal
    ? buildNoteQuestionOptionGridSx(
      optionColumnMinWidth,
      0,
      // Align the full row to the top when every horizontal option has a label.
      allHorizontalOptionsHaveLabels ? 'flex-start' : 'center',
    )
    : NOTE_QUESTION_OPTION_GROUP_STACK_SX
  // When columns=X is given, scale the card to span X standard card widths plus
  // the inter-card gaps so the card aligns naturally with its neighbours.
  const cols = Math.max(1, question.layoutColumns)
  const gapPx = NOTE_CARD_GAP_PX * (cols - 1)
  const cardWidthSx = isHorizontal && cols > 1
    ? {
      flex: `1 1 ${cols * flexBasis + gapPx}px`,
      minWidth: cols * minWidth + gapPx,
      maxWidth: cols * maxWidth + gapPx,
    }
    : { flex: `1 1 ${flexBasis}px`, minWidth, maxWidth }
  const cardOpacity = noteOverridesDisabled ? 0.55 : 1
  // Build per-option row styling so alignment can differ per label presence.
  const buildOptionRowSx = (): Record<string, unknown> => {
    if (isHorizontal) {
      // Keep the default alignment when labels are mixed or absent.
      if (!allHorizontalOptionsHaveLabels) return NOTE_QUESTION_OPTION_SX
      // Align the control to the first label line when every option is labeled.
      return {
        ...NOTE_QUESTION_OPTION_SX,
        alignItems: 'flex-start',
        '& .MuiFormControlLabel-label': {
          ...NOTE_QUESTION_OPTION_SX['& .MuiFormControlLabel-label'],
          alignSelf: 'flex-start',
        },
      }
    }
    return {
      ...NOTE_QUESTION_OPTION_TWO_COLUMN_SX,
      // Center the control so labeled rows match case2 alignment.
      alignItems: 'center',
      '& .MuiFormControlLabel-label': {
        ...NOTE_QUESTION_OPTION_TWO_COLUMN_LABEL_SX,
        alignSelf: 'center',
      },
    }
  }
  return (
    <Box
      // Stamp the marker index onto the DOM so the editor↔preview scroll sync can pair this
      // rendered card with its source marker. (Read off node.properties above; not auto-forwarded.)
      data-question-index={markerIndex ?? undefined}
      sx={{
        // Match Safeguard card styling for tighter, consistent layout.
        // Width limits mirror Safeguard cards so multiple can fit on a line.
        ...cardWidthSx,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        // Lift padding slightly to improve scanability.
        p: NOTE_QUESTION_CARD_PADDING,
        bgcolor: 'background.paper',
        opacity: cardOpacity,
      }}
    >
      {/* Stack keeps the heading and options tightly grouped. */}
      <Stack spacing={0}>
        {/* Prompt text mirrors the Safeguard card title. */}
        <Typography
          variant="subtitle2"
          component="div"
          sx={{
            // Match the Safeguard title typography for questions.
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
              // Keep the title/subtext gap subtle for compact cards.
              mt: NOTE_QUESTION_TITLE_SUBTEXT_GAP,
              mb: 0,
              display: 'block',
            }}
          >
            {renderQuestionTextTokens({ tokens: promptSubtextTokens, chipSx: promptChipSx, labelSx: promptLabelSx })}
          </Typography>
        ) : null}
        {/* Render each option group with its matching control type. */}
        <Stack spacing={0.35} sx={{ mt: NOTE_QUESTION_HEADER_OPTIONS_GAP }}>
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
                      if (!recipeOverridesEditable) return
                      // Reset the group's selection while preserving other groups.
                      const next = new Set(selectedSet)
                      group.options.forEach((option) => next.delete(option.id))
                      if (value) next.add(value)
                      // Apply exclusions so mutual rules stay enforced.
                      const ordered = applyQuestionSelectionRules(
                        Array.from(next),
                        question,
                        value || undefined,
                      )
                      applyAnswer(ordered, value || undefined)
                    }}
                    sx={optionGroupSx}
                  >
                    {group.options.map((option) => {
                      // Keep row spacing consistent across all non-horizontal options.
                      const rowSx = buildOptionRowSx()
                      const labelNode = renderTwoColumnOptionLabel({
                        option,
                        chipSx: promptChipSx,
                        labelSx: promptLabelSx,
                        labelColumnCh,
                        layout: isHorizontal ? 'rows' : 'columns',
                      })
                      // In the editor preview, show the default chip after the label.
                      const label = isEditorPreview ? (
                        <Box component="span" sx={{ display: 'inline-block', width: '100%' }}>
                          {labelNode}
                          {option.isDefault && <NoteOptionDefaultChip />}
                        </Box>
                      ) : labelNode
                      const row = (
                        <FormControlLabel
                          key={option.id}
                          value={option.id}
                          control={<Radio size="small" disabled={!recipeOverridesEditable} />}
                          label={label}
                          disabled={!recipeOverridesEditable}
                          sx={rowSx}
                        />
                      )
                      // In the editor preview, hovering anywhere on the row (control + label)
                      // surfaces the option-info tooltip.
                      return isEditorPreview
                        ? <NoteOptionInfoTooltipWrap key={option.id} option={option} domain="recipe">{row}</NoteOptionInfoTooltipWrap>
                        : row
                    })}
                  </RadioGroup>
                </FormControl>
              )
            }
            return (
              <FormGroup key={group.id} sx={optionGroupSx}>
                {group.options.map((option) => {
                  // `needs` gate: keep this option disabled until at least one of its
                  // required options is selected (e.g. the level-cap / ignore-slots boxes
                  // only matter once a rarity is being kept). Empty list = always enabled.
                  const needsUnmet = option.requiresOptionIds.length > 0
                    && !option.requiresOptionIds.some((id) => selectedSet.has(id))
                  const optionDisabled = !recipeOverridesEditable || needsUnmet
                  // While the gate is unmet, an optional `needs=on|off` forces the displayed
                  // state (display only — the stored value is untouched and returns on enable).
                  const checked = (needsUnmet && option.requiresDisabledState)
                    ? option.requiresDisabledState === 'on'
                    : selectedSet.has(option.id)
                  // Keep row spacing consistent across all non-horizontal options.
                  const rowSx = buildOptionRowSx()
                  const checkboxLabelNode = renderTwoColumnOptionLabel({
                    option,
                    chipSx: promptChipSx,
                    labelSx: promptLabelSx,
                    labelColumnCh,
                    layout: isHorizontal ? 'rows' : 'columns',
                  })
                  const checkboxLabel = isEditorPreview ? (
                    <Box component="span" sx={{ display: 'inline-block', width: '100%' }}>
                      {checkboxLabelNode}
                      {option.isDefault && <NoteOptionDefaultChip />}
                    </Box>
                  ) : checkboxLabelNode
                  const row = (
                    <FormControlLabel
                      key={option.id}
                      control={(
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={optionDisabled}
                          onChange={(event) => {
                            // Ignore changes when read-only or the needs-gate is unmet.
                            if (optionDisabled) return
                            // Toggle the option in a new Set instance.
                            const next = new Set(selectedSet)
                            if (event.target.checked) next.add(option.id)
                            else next.delete(option.id)
                            // Checking marks the preferred option; unchecking marks it
                            // as explicitly removed so presets forcing it on are released.
                            const preferred = event.target.checked ? option.id : undefined
                            const removed = event.target.checked ? undefined : option.id
                            const ordered = applyQuestionSelectionRules(
                              Array.from(next),
                              question,
                              preferred,
                              removed,
                            )
                            applyAnswer(ordered, preferred, removed)
                          }}
                        />
                      )}
                      label={checkboxLabel}
                      disabled={optionDisabled}
                      sx={rowSx}
                    />
                  )
                  // Hover anywhere on the row → option-info tooltip (editor preview only).
                  return isEditorPreview
                    ? <NoteOptionInfoTooltipWrap key={option.id} option={option} domain="recipe">{row}</NoteOptionInfoTooltipWrap>
                    : row
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

// ── NoteOverridesSlider ───────────────────────────────────────────────────────
// Slider for safeguard-overrides values. The thumb follows the drag locally (cheap),
// but the answer is committed only on release / keyboard settle (onChangeCommitted) —
// so a single drag triggers ONE answer update + pipeline run instead of one per tick.
// Vertical geometry for labeled marks: row 0 sits a comfortable gap below the track; each
// extra row drops the label by ROW_H so a dropped label clears the one to its left.
const MARK_ROW_BASE = 28
const MARK_ROW_H = 18
function NoteOverridesSlider({
  value, min, max, step, marks, disabled, onCommit,
}: {
  value: number
  min: number
  max: number
  step: number
  // Labeled guide marks (raw data). Absent = a tick per step.
  marks?: { value: number; label: string; subtext?: string }[]
  disabled: boolean
  onCommit: (value: number) => void
}): JSX.Element {
  // Local visual value while dragging; null falls back to the committed `value`.
  const [dragValue, setDragValue] = useState<number | null>(null)
  const shown = dragValue ?? value
  // Sliders here are always single-thumb; collapse the union to a number.
  const resolve = (v: number | number[]): number => (typeof v === 'number' ? v : (v[0] ?? min))
  const hasLabeledMarks = !!marks && marks.length > 0

  // Measure the track width so label collisions can be detected in real pixels.
  const sliderRef = useRef<HTMLSpanElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  /* eslint-disable react-you-might-not-need-an-effect/no-initialize-state --
     trackWidth must be measured from the rendered DOM (post-mount); it only feeds
     label-collision layout, never correctness, so an effect is the right tool here. */
  useEffect(() => {
    const el = sliderRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    // ResizeObserver fires once on observe, so the width is set from the callback (not
    // synchronously in the effect). First paint uses row 0 for every mark until it fires.
    const ro = new ResizeObserver(() => setTrackWidth(el.getBoundingClientRect().width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /* eslint-enable react-you-might-not-need-an-effect/no-initialize-state */

  // Collision-aware row per mark: scan left→right keeping the right edge occupied on each
  // row; place each label on the topmost row whose last label ends before this one starts.
  // So a label only drops a row when it would actually overlap the label to its left.
  const markRows = useMemo<number[]>(() => {
    if (!hasLabeledMarks) return []
    if (trackWidth <= 0 || max <= min) return marks!.map(() => 0)
    const CHAR_PX = 7.5 // rough per-char width at the default mark-label font
    const GAP = 8       // minimum px between two labels sharing a row
    const rightEdge: number[] = []
    return marks!.map((m) => {
      const center = ((m.value - min) / (max - min)) * trackWidth
      const halfW = (m.label.length * CHAR_PX) / 2 + 6
      const left = center - halfW
      let row = 0
      while (row < rightEdge.length && left < rightEdge[row]! + GAP) row += 1
      rightEdge[row] = center + halfW
      return row
    })
  }, [hasLabeledMarks, marks, trackWidth, min, max])
  const maxRow = markRows.length ? Math.max(...markRows) : 0

  // Build MUI marks: each label is centered on its tick; dropped labels (row ≥ 1) get a
  // dotted connector running up to the tick so they don't read as detached text.
  const muiMarks = hasLabeledMarks
    ? marks!.map((m, i) => {
        const row = markRows[i] ?? 0
        const connectorH = MARK_ROW_BASE + row * MARK_ROW_H - 6 // label top → just under the track
        return {
          value: m.value,
          label: (
            <Box
              component="span"
              {...(m.subtext ? { title: m.subtext } : {})}
              sx={{ position: 'relative', display: 'inline-block', ...(m.subtext ? { cursor: 'help' } : {}) }}
            >
              {row > 0 && (
                <Box component="span" aria-hidden sx={{
                  position: 'absolute', left: '50%', bottom: '100%', width: 0,
                  height: `${connectorH}px`, borderLeft: '1px dotted', borderColor: 'text.disabled',
                }} />
              )}
              {m.label}
            </Box>
          ),
        }
      })
    : undefined

  // Per-index vertical offset for the dropped labels.
  const markLabelSx: Record<string, { top: number }> = {}
  if (hasLabeledMarks) {
    markRows.forEach((row, i) => { markLabelSx[`& .MuiSlider-markLabel[data-index="${i}"]`] = { top: MARK_ROW_BASE + row * MARK_ROW_H } })
  }
  // Row-0 labels sit in the card's own padding; only reserve extra room for dropped rows
  // (each dropped row adds MARK_ROW_H). Keeps single-row sliders as compact as tick sliders.
  const marksMb = hasLabeledMarks && maxRow > 0 ? `${maxRow * MARK_ROW_H}px` : undefined

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, ...(marksMb ? { mb: marksMb } : {}) }}>
      <Slider
        ref={sliderRef}
        size="small"
        min={min}
        max={max}
        step={step}
        value={shown}
        // Labeled marks replace the per-step ticks; otherwise keep the bare ticks.
        marks={muiMarks ?? true}
        disabled={disabled}
        // Visual only — no answer/pipeline churn during the drag.
        onChange={(_, v) => { if (disabled) return; setDragValue(resolve(v)) }}
        // Commit once on release (also fires per keyboard step, which is already settled).
        onChangeCommitted={(_, v) => { if (disabled) return; const nv = resolve(v); setDragValue(null); onCommit(nv) }}
        valueLabelDisplay="auto"
        sx={{
          flex: 1,
          color: 'primary.main',
          ...(hasLabeledMarks ? {
            // Keep the default label font; only prevent wrapping. Vertical rows below.
            '& .MuiSlider-markLabel': { whiteSpace: 'nowrap' },
            ...markLabelSx,
          } : {}),
        }}
      />
      <Typography variant="caption" sx={{ minWidth: 20, textAlign: 'right', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
        {shown}
      </Typography>
    </Box>
  )
}

// ── NoteSafeguardOverridesBlock ───────────────────────────────────────────────
// Renders a `<!-- safeguard-overrides … -->` question card in view mode.
// Supports single (radio), multi (checkbox), and slider group types.
// Structurally mirrors NoteQuestionBlock with slider support added.

type NoteSafeguardOverridesBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function NoteSafeguardOverridesBlock({ node }: NoteSafeguardOverridesBlockProps): JSX.Element | null {
  const { safeguardOverridesResolutions, safeguardOverridesEditable, noteOverridesDisabled, onSafeguardOverridesAnswerChange, isEditorPreview } = useNoteRenderContext()
  const theme = useTheme()
  const rawIndexAttr = coerceFirstString(node?.properties?.[SG_QUESTION_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  const question = markerIndex != null ? safeguardOverridesResolutions.get(markerIndex) : undefined
  const promptParts = useMemo(
    () => (question ? splitQuestionPrompt(question.prompt) : { title: '', subtext: null }),
    [question],
  )
  // SafeguardNoteQuestionOption shares the label/detail/token shape with NoteQuestionOption;
  // cast is safe because the prompt-token builder only reads those fields.
  type LabelOption = NoteQuestionDefinition['options'][number]
  const promptTokens = useMemo(
    () => (question ? buildQuestionPromptTokens(promptParts.title, question.options as unknown as LabelOption[], true) : []),
    [question, promptParts.title],
  )
  const promptSubtextTokens = useMemo(
    () => (question && promptParts.subtext
      ? buildQuestionPromptTokens(promptParts.subtext, question.options as unknown as LabelOption[], true)
      : []),
    [question, promptParts.subtext],
  )
  const promptChipSx = useMemo(() => buildNoteScopeChipSx(theme, true), [theme])
  const promptLabelSx = useMemo(() => ({
    ...NOTE_CARD_LABEL_TEXT_SX,
    display: 'inline-flex',
    alignItems: 'center',
  }), [])
  const questionOptions = useMemo(() => (question?.options ?? []), [question])
  if (!question) return null
  // Body-less spacer marker: invisible flex placeholder with the same width as a columns=N card.
  if (question.isSpacer) {
    const { flexBasis, minWidth, maxWidth } = getNoteCardWidthStyles('note')
    const cols = Math.max(1, question.layoutColumns)
    const gapPx = NOTE_CARD_GAP_PX * (cols - 1)
    const spacerSx = cols > 1
      ? { flex: `1 1 ${cols * flexBasis + gapPx}px`, minWidth: cols * minWidth + gapPx, maxWidth: cols * maxWidth + gapPx }
      : { flex: `1 1 ${flexBasis}px`, minWidth, maxWidth }
    return <Box sx={{ ...spacerSx, visibility: 'hidden' }} />
  }
  const isHorizontal = question.layoutColumns > 0
  const selected = Array.isArray(question.answer) ? question.answer : []
  const selectedSet = new Set<string>(selected)
  const applyAnswer = (next: string[], preferredId?: string, removedId?: string) => {
    onSafeguardOverridesAnswerChange(question, next, preferredId, removedId)
  }
  const { flexBasis, minWidth, maxWidth } = getNoteCardWidthStyles('note')
  const cols = Math.max(1, question.layoutColumns)
  const gapPx = NOTE_CARD_GAP_PX * (cols - 1)
  const cardWidthSx = isHorizontal && cols > 1
    ? {
      flex: `1 1 ${cols * flexBasis + gapPx}px`,
      minWidth: cols * minWidth + gapPx,
      maxWidth: cols * maxWidth + gapPx,
    }
    : { flex: `1 1 ${flexBasis}px`, minWidth, maxWidth }
  const optionGroupSx = isHorizontal
    ? buildNoteQuestionOptionGridSx(minWidth, 0, 'center')
    : NOTE_QUESTION_OPTION_GROUP_STACK_SX
  // Dim the card when dynamic overrides are disabled, matching the recipe overrides card behaviour.
  const cardOpacity = noteOverridesDisabled ? 0.55 : 1
  return (
    <Box
      // Stamp the marker index for the editor↔preview scroll sync (see NoteQuestionBlock).
      data-sg-question-index={markerIndex ?? undefined}
      sx={{
        ...cardWidthSx,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        p: NOTE_QUESTION_CARD_PADDING,
        bgcolor: 'background.paper',
        opacity: cardOpacity,
      }}
    >
      <Stack spacing={0}>
        {/* Prompt title */}
        <Typography
          variant="subtitle2"
          component="div"
          sx={{ fontWeight: 700, wordBreak: 'break-word', lineHeight: 1.1, fontSize: '0.9rem', display: 'block', m: 0, p: 0, whiteSpace: 'pre-line' }}
        >
          {renderQuestionTextTokens({ tokens: promptTokens, chipSx: promptChipSx, labelSx: promptLabelSx })}
        </Typography>
        {promptParts.subtext ? (
          <Typography variant="caption" component="div" sx={{ ...NOTE_QUESTION_SUBTEXT_SX, whiteSpace: 'pre-line', mt: NOTE_QUESTION_TITLE_SUBTEXT_GAP, mb: 0, display: 'block' }}>
            {renderQuestionTextTokens({ tokens: promptSubtextTokens, chipSx: promptChipSx, labelSx: promptLabelSx })}
          </Typography>
        ) : null}
        {/* Option groups */}
        <Stack spacing={0.35} sx={{ mt: NOTE_QUESTION_HEADER_OPTIONS_GAP }}>
          {question.groups.map((group) => {
            // ── Slider group ──────────────────────────────────────────────
            if (group.type === 'slider') {
              const sliderOpt = group.options[0]
              if (!sliderOpt) return null
              const toggle = sliderOpt.sliderToggle
              // The single stored answer value is a numeric string, or the toggle-off sentinel.
              const rawAnswer = selectedSet.values().next().value as string | undefined
              const toggleOff = !!toggle && rawAnswer === SLIDER_TOGGLE_OFF
              const numericValue = Number.parseFloat(rawAnswer ?? '')
              const sliderValue = Number.isFinite(numericValue)
                ? numericValue
                : (sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1)
              const min = sliderOpt.sliderMin ?? 1
              const max = sliderOpt.sliderMax ?? 5
              const step = sliderOpt.sliderStep ?? 1
              const sliderControl = (
                <NoteOverridesSlider
                  value={sliderValue}
                  min={min}
                  max={max}
                  step={step}
                  // Raw marks; the slider does collision-aware row layout + connectors itself.
                  {...(sliderOpt.sliderMarks ? { marks: sliderOpt.sliderMarks } : {})}
                  disabled={!safeguardOverridesEditable || toggleOff}
                  // Commit the numeric value once on release; the off sentinel is set by the toggle.
                  onCommit={(numVal) => { applyAnswer([String(numVal)]) }}
                />
              )
              // Optional enable/disable checkbox; unchecking stores the off sentinel (else block).
              const toggleControl = toggle ? (
                <FormControlLabel
                  sx={{ m: 0, flexShrink: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={!toggleOff}
                      disabled={!safeguardOverridesEditable}
                      onChange={(e) => { applyAnswer([e.target.checked ? String(sliderValue) : SLIDER_TOGGLE_OFF]) }}
                    />
                  }
                  label={toggle.label
                    ? <Typography variant="caption" sx={{ ...NOTE_QUESTION_SUBTEXT_SX }}>{toggle.label}</Typography>
                    : ''}
                />
              ) : null
              const sliderBox = (
                <Box key={group.id} sx={{ px: 0.5, pt: 0.5 }}>
                  {/* Slider prompt label mirrors the group header label when present */}
                  {sliderOpt.label ? (
                    <Typography variant="caption" sx={{ ...NOTE_QUESTION_SUBTEXT_SX, display: 'block', mb: 0.5 }}>
                      {renderQuestionTextTokens({ tokens: buildQuestionPromptTokens(sliderOpt.label, questionOptions as unknown as LabelOption[], false), chipSx: promptChipSx, labelSx: promptLabelSx })}
                      {sliderOpt.isDefault && isEditorPreview && <NoteOptionDefaultChip />}
                    </Typography>
                  ) : null}
                  {toggle && toggle.side === 'left' ? (
                    // Checkbox inline-left, top-aligned so it sits on the slider's track line
                    // (the slider box is tall because of the mark labels below the track).
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                      {toggleControl}
                      <Box sx={{ flex: 1, minWidth: 0 }}>{sliderControl}</Box>
                    </Box>
                  ) : (
                    // Checkbox stacked above the slider (default).
                    <>
                      {toggleControl}
                      {sliderControl}
                    </>
                  )}
                </Box>
              )
              // Hover anywhere on the slider box → option-info tooltip (editor preview only).
              // This is the main fix for sliders, which have no text label to hover.
              return isEditorPreview
                ? <NoteOptionInfoTooltipWrap key={group.id} option={sliderOpt} domain="safeguard">{sliderBox}</NoteOptionInfoTooltipWrap>
                : sliderBox
            }
            // ── Single (radio) group ──────────────────────────────────────
            if (group.type === 'single') {
              const selectedOption = group.options.find((option) => selectedSet.has(option.id))
              return (
                <FormControl key={group.id} component="fieldset" variant="standard">
                  <RadioGroup
                    value={selectedOption?.id ?? ''}
                    onChange={(_, value) => {
                      if (!safeguardOverridesEditable) return
                      const next = new Set(selectedSet)
                      group.options.forEach((option) => next.delete(option.id))
                      if (value) next.add(value)
                      applyAnswer(Array.from(next), value || undefined)
                    }}
                    sx={optionGroupSx}
                  >
                    {group.options.map((option) => {
                      const sgRadioLabelNode = renderTwoColumnOptionLabel({ option: option as unknown as LabelOption, chipSx: promptChipSx, labelSx: promptLabelSx, labelColumnCh: 0, layout: isHorizontal ? 'rows' : 'columns' })
                      const sgRadioLabel = isEditorPreview ? (
                        <Box component="span" sx={{ display: 'inline-block', width: '100%' }}>
                          {sgRadioLabelNode}
                          {option.isDefault && <NoteOptionDefaultChip />}
                        </Box>
                      ) : sgRadioLabelNode
                      const row = (
                        <FormControlLabel
                          key={option.id}
                          value={option.id}
                          control={<Radio size="small" disabled={!safeguardOverridesEditable} />}
                          label={sgRadioLabel}
                          disabled={!safeguardOverridesEditable}
                          sx={NOTE_QUESTION_OPTION_SX}
                        />
                      )
                      return isEditorPreview
                        ? <NoteOptionInfoTooltipWrap key={option.id} option={option} domain="safeguard">{row}</NoteOptionInfoTooltipWrap>
                        : row
                    })}
                  </RadioGroup>
                </FormControl>
              )
            }
            // ── Multi (checkbox) group ────────────────────────────────────
            return (
              <FormGroup key={group.id} sx={optionGroupSx}>
                {group.options.map((option) => {
                  const checked = selectedSet.has(option.id)
                  const sgCheckboxLabelNode = renderTwoColumnOptionLabel({ option: option as unknown as LabelOption, chipSx: promptChipSx, labelSx: promptLabelSx, labelColumnCh: 0, layout: isHorizontal ? 'rows' : 'columns' })
                  const sgCheckboxLabel = isEditorPreview ? (
                    <Box component="span" sx={{ display: 'inline-block', width: '100%' }}>
                      {sgCheckboxLabelNode}
                      {option.isDefault && <NoteOptionDefaultChip />}
                    </Box>
                  ) : sgCheckboxLabelNode
                  const row = (
                    <FormControlLabel
                      key={option.id}
                      control={
                        <Checkbox
                          size="small"
                          checked={checked}
                          disabled={!safeguardOverridesEditable}
                          onChange={(event) => {
                            if (!safeguardOverridesEditable) return
                            const updated = new Set(selectedSet)
                            if (event.target.checked) { updated.add(option.id) } else { updated.delete(option.id) }
                            // Checking = preferred; unchecking = removed (releases forcing presets).
                            const preferred = event.target.checked ? option.id : undefined
                            const removed = event.target.checked ? undefined : option.id
                            applyAnswer(Array.from(updated), preferred, removed)
                          }}
                        />
                      }
                      label={sgCheckboxLabel}
                      disabled={!safeguardOverridesEditable}
                      sx={NOTE_QUESTION_OPTION_SX}
                    />
                  )
                  return isEditorPreview
                    ? <NoteOptionInfoTooltipWrap key={option.id} option={option} domain="safeguard">{row}</NoteOptionInfoTooltipWrap>
                    : row
                })}
              </FormGroup>
            )
          })}
        </Stack>
      </Stack>
    </Box>
  )
}

type SafeguardBlockProps = React.PropsWithChildren<{ node?: Element & { properties?: Record<string, unknown> } }>

function SafeguardBlock({ node }: SafeguardBlockProps): JSX.Element | null {
  const { t, lang } = useI18n()
  const { safeguardRules, safeguardMarkerResolutions, metasets, useStatButtonColors, substatColors } = useNoteRenderContext()
  // Safeguards mirror recipe markers: ids render positional cards, `safeguards-re` filters by rule name.
  const filterAttr = coerceFirstString(node?.properties?.[SAFEGUARD_ELEMENT_FILTER_ATTR])
  const filterType = filterAttr === SAFEGUARD_FILTER_REGEXP ? SAFEGUARD_FILTER_REGEXP : SAFEGUARD_FILTER_IDS
  let tokens: MarkerToken[] = []
  let patternRaw = ''
  if (filterType === SAFEGUARD_FILTER_IDS) {
    const rawSpec = coerceFirstString(node?.properties?.[SAFEGUARD_ELEMENT_ATTR]) ?? ''
    tokens = parseMarkerTokens(rawSpec)
    if (tokens.length === 0) return null
  } else {
    patternRaw = coerceFirstString(node?.properties?.[SAFEGUARD_ELEMENT_PATTERN_ATTR]) ?? ''
  }
  const rawIndexAttr = coerceFirstString(node?.properties?.[SAFEGUARD_ELEMENT_INDEX_ATTR])
  let markerIndex: number | null = null
  if (rawIndexAttr) {
    const parsed = Number.parseInt(rawIndexAttr, 10)
    if (Number.isFinite(parsed)) markerIndex = parsed
  }
  let resolvedEntries: SafeguardMarkerEntry[] | undefined
  if (markerIndex != null) {
    resolvedEntries = safeguardMarkerResolutions.get(markerIndex)
  }
  if (!resolvedEntries) {
    // Fall back to positional resolution when preview rendering did not precompute this marker (e.g., live edits).
    if (filterType === SAFEGUARD_FILTER_REGEXP) {
      const compiled = buildNotePattern(patternRaw)
      if (compiled) {
        const safeCompiled = compiled
        resolvedEntries = safeguardRules
          .map((rule, idx) => ({ rule, idx }))
          .filter(({ rule }) => {
            const name = rule?.appearance?.name ?? ''
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
          const prev = safeguardMarkerResolutions.get(idx)
          if (prev && prev.length > 0) {
            priorLast = prev[prev.length - 1]!.id
            break
          }
        }
      }
      const fallbackEntries: SafeguardMarkerEntry[] = []
      let markerLast = priorLast
      for (const token of tokens) {
        const candidate = token.type === 'absolute' ? token.value : markerLast + 1
        if (!candidate || candidate <= 0) continue
        const rule = safeguardRules[candidate - 1]
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
          <SafeguardSummaryCard
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

function SafeguardSummaryCard({
  id,
  rule,
  metasets,
  t,
  lang,
  useStatButtonColors,
  substatColors,
}: {
  id: number
  rule: SafeguardRule
  metasets: Metaset[]
  t: ReturnType<typeof useI18n>['t']
  lang: string
  useStatButtonColors: boolean
  substatColors: Record<number, { fg: string; bg: string }>
}): JSX.Element {
  const theme = useTheme()
  // Contrast-correct colored stat labels for legible text on the active scheme's surface.
  const adaptStatFg = useSubstatFgAdapter()
  // Scope defaults mirror the dialog so notes stay in sync if count mode is missing.
  const countMode = sanitizeSafeguardCountMode(rule.countMode ?? SAFEGUARD_DEFAULT_COUNT_MODE)
  // Suppress per-X flags that are redundant given the selected combination filters.
  const effectiveCountMode = safeguardEffectiveCountModeForDisplay(rule.combination, countMode)
  const scopeLegendLabel = t('noteSafeguardScopeLabel')
  // Scope chips mirror the dialog toggles so markdown exports stay aligned.
  const scopeFlags = [
    { key: 'perRule', label: t('safeguardsCountModePerRule'), active: effectiveCountMode.perRule },
    { key: 'perSlot', label: t('safeguardsCountModePerSlot'), active: effectiveCountMode.perSlot },
    { key: 'perSet', label: t('safeguardsCountModePerSet'), active: effectiveCountMode.perSet },
    { key: 'perFaction', label: t('safeguardsCountModePerFaction'), active: effectiveCountMode.perFaction },
    { key: 'perMain', label: t('safeguardsCountModePerMain'), active: effectiveCountMode.perMainStat },
  ]
  const activeScopeFlags = scopeFlags.filter((flag) => flag.active)
  // Surface explicit names when present so ordered exports stay recognizable.
  const ruleName = (rule.appearance?.name ?? '').trim()
  const titleLabel = ruleName || t('noteSafeguardRuleTitle', { index: id })
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
    const ids = rule.combination.metaSetNames ?? []
    const seen = new Set<string>()
    const labels: string[] = []
    ids.forEach((metaId) => {
      if (seen.has(metaId)) return
      seen.add(metaId)
      const meta = metasets.find((item) => item.name === metaId)
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
      const color = useStatButtonColors ? adaptStatFg(substatColors[variant]?.fg) : undefined
      return { label, color, key: String(variant) }
    })
  })()

  const substatLabels = (() => {
    const substats = Array.from(new Set<number>(rule.substats ?? []))
    if (substats.length === 0) return []
    substats.sort((left, right) => {
      const leftOrder = NOTE_SUBSTAT_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = NOTE_SUBSTAT_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left - right
    })
    return substats.map((variant) => {
      const key = statVariantI18nKey(variant)
      const translated = t(key)
      const label = translated || String(variant)
      const color = useStatButtonColors ? adaptStatFg(substatColors[variant]?.fg) : undefined
      return { label, color, key: `sub-${variant}` }
    })
  })()

  const normalizedSubstatMatch = normalizeSafeguardSubstatMatch(rule.substatMatch)
  const substatMatchLabel = (() => {
    if (normalizedSubstatMatch === SafeguardSubstatMatch.PerSubstat) {
      return t('noteSafeguardSubstatRequirementPer')
    }
    // Numeric min-count tokens ("1"–"4") render as ≥N — language-agnostic.
    const n = parseInt(normalizedSubstatMatch, 10)
    return `\u2265${Number.isFinite(n) && n >= 1 ? n : 1}`
  })()

  const substatWeightSummary = (() => {
    if (normalizedSubstatMatch === SafeguardSubstatMatch.PerSubstat) return null
    const weights = rule.substatWeights ?? {}
    const entries: Array<{ variant: number; weight: number }> = []
    for (const [key, raw] of Object.entries(weights)) {
      const variant = Number(key)
      if (!Number.isFinite(variant)) continue
      const normalized = normalizeGearInspectorSortWeight(Number(raw))
      if (normalized === GEAR_INSPECTOR_SORT_WEIGHT_DEFAULT) continue
      entries.push({ variant, weight: normalized })
    }
    if (entries.length === 0) return null
    entries.sort((left, right) => {
      const leftOrder = NOTE_SUBSTAT_ORDER.get(left.variant) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = NOTE_SUBSTAT_ORDER.get(right.variant) ?? Number.MAX_SAFE_INTEGER
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return left.variant - right.variant
    })
    return entries.map((entry) => {
      const label = t(statVariantI18nKey(entry.variant))
      return `${label} x${entry.weight.toFixed(2)}`
    }).join(', ')
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
      label: t('noteSafeguardSlotsLabel'),
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
      label: t('noteSafeguardSetsLabel'),
      value: setsValue,
    })
  }
  if (mainLabels.length > 0) {
    filters.push({
      label: t('noteSafeguardMainLabel'),
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
      label: t('noteSafeguardFactionsLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(factionLabels)}
        </Typography>
      ),
    })
  }
  if (rankLabels.length > 0) {
    filters.push({
      label: t('noteSafeguardRanksLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(rankLabels)}
        </Typography>
      ),
    })
  }
  if (rarityLabels.length > 0) {
    filters.push({
      label: t('noteSafeguardRaritiesLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {formatList(rarityLabels)}
        </Typography>
      ),
    })
  }
  if (substatLabels.length > 0) {
    filters.push({
      label: t('noteSafeguardSubstatsLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {substatLabels.map((entry, idx) => (
            <React.Fragment key={entry.key ?? idx}>
              {idx > 0 ? ', ' : null}
              <Box component="span" sx={{ color: entry.color }}>{entry.label}</Box>
            </React.Fragment>
          ))}
        </Typography>
      ),
    })
    filters.push({
      label: t('noteSafeguardSubstatRequirementLabel'),
      value: (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
          {substatMatchLabel}
        </Typography>
      ),
    })
    if (substatWeightSummary) {
      filters.push({
        label: t('noteSafeguardSubstatWeightsLabel'),
        value: (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
            {substatWeightSummary}
          </Typography>
        ),
      })
    }
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
          {rule.activation === SafeguardRuleActivation.Off ? (
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
                {t('noteSafeguardRuleDisabled')}
              </Typography>
            </Box>
          ) : null}
        </Box>
        <Stack spacing={0.35} sx={{ mt: 0.35 }}>
          {renderRow(
            t('noteSafeguardQuotaLabel'),
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-word' }}>
              {/* Scope details live in the Scope row to avoid repetition. */}
              {t('noteSafeguardQuotaValue', { count: rule.requiredCount })}
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
type DisableRecipeOverridesContext = {
  noteText: string
}
// Queueable menu actions so we can defer recipe mutations until menus fully close.
type RecipeOverridesMenuAction =
  // Reset answers back to defaults.
  | { kind: 'reset' }
  // Re-enable parsing without touching answers.
  | { kind: 'enable' }
  // Disable parsing with a snapshot for the confirm dialog.
  | { kind: 'disable'; noteText: string }
// Run a queued action after the menu exit transition, keeping view/edit consistent.
const runRecipeOverridesMenuAction = (
  action: RecipeOverridesMenuAction | null,
  handlers: {
    onReset: () => void
    onEnable: () => void
    onDisable: (noteText: string) => void
  },
  clearAction: () => void,
) => {
  if (!action) return
  // Clear first so rerenders never replay the action.
  clearAction()
  // Route the action after the menu closes to avoid stuck modals.
  if (action.kind === 'reset') {
    // Reset answers back to defaults.
    handlers.onReset()
    return
  }
  // Keep enable/disable paths explicit for clarity.
  if (action.kind === 'enable') {
    // Re-enable parsing without touching answers.
    handlers.onEnable()
    return
  }
  // Open the disable confirmation with the captured note snapshot.
  handlers.onDisable(action.noteText)
}

export default function NoteDialog({
  mode,
  note,
  onChange,
  onClose,
  onRequestEdit,
  onRequestView,
  recipeOverridesAnswers,
  // Raw prop setters — wrapped below so user-driven mutations bump the override epoch.
  onRecipeOverridesAnswersChange: onRecipeOverridesAnswersChangeRaw,
  noteOverridesDisabled,
  onNoteOverridesDisabledChange,
  onApplyRecipeOverrides,
  onApplySafeguardOverrides,
  safeguardOverridesAnswers,
  onSafeguardOverridesAnswersChange: onSafeguardOverridesAnswersChangeRaw,
  onSafeguardOverridesResolutionChange,
  recipes,
  metasets,
  safeguardRules,
  useStatButtonColors,
  substatColors,
  gearSummary,
  summaryProgressRatio,
  hideEditButton,
  rules,
  substatTargets,
  simpleMode,
  expertMode,
  onGoExpert,
  onGoSimple,
  autoPushExpressEnabled,
  onToggleAutoPushExpress,
  autoPushFlashSeq,
  rslHelperConnectEnabled,
  pushEndpointReachable,
  onToggleRslHelperConnect,
  onLoadSimplePreset,
  drawerWidthPx,
  drawerTopPx,
  drawerLeftPx,
}: {
  mode: 'view' | 'edit'
  note: string
  onChange: (value: string, options?: { mode?: 'edit' | 'clear' }) => void
  onClose: () => void
  onRequestEdit: () => void
  onRequestView: () => void
  recipeOverridesAnswers: NoteRecipeOverridesAnswers
  onRecipeOverridesAnswersChange: React.Dispatch<React.SetStateAction<NoteRecipeOverridesAnswers>>
  noteOverridesDisabled: boolean
  onNoteOverridesDisabledChange: React.Dispatch<React.SetStateAction<boolean>>
  // Callback for applying the current recipe overrides to stored recipes.
  onApplyRecipeOverrides: (instructions: RecipeOverridesInstructions) => void
  // Callback for writing the current display safeguard rules (overrides applied) back to stored rules.
  onApplySafeguardOverrides: () => void
  // Safeguard overrides: stored answers and change notifications.
  safeguardOverridesAnswers: NoteSafeguardOverridesAnswers
  onSafeguardOverridesAnswersChange: React.Dispatch<React.SetStateAction<NoteSafeguardOverridesAnswers>>
  // Notified each render with the latest resolved instructions (so App.tsx can apply them).
  onSafeguardOverridesResolutionChange: (resolution: SafeguardOverridesResolution) => void
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  safeguardRules: SafeguardRule[]
  useStatButtonColors: boolean
  substatColors: Record<number, { fg: string; bg: string }>
  gearSummary: GearInspectorOutcomeSummary | null
  summaryProgressRatio: number
  // Hide the edit entry point when the dialog auto-opens after SFC load.
  hideEditButton: boolean
  // Merged rules + substat targets for the dungeon simulator embedded via <!-- dungeon-simulator -->.
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  // Express mode: active when the app was launched via ?express URL param.
  simpleMode?: boolean
  // Expert mode: user clicked "Go Expert" inside an express session — full UI is shown.
  expertMode?: boolean
  onGoExpert?: () => void
  onGoSimple?: () => void
  // Auto-push state surfaced in the express-mode action bar.
  autoPushExpressEnabled?: boolean
  onToggleAutoPushExpress?: (enabled: boolean) => void
  // Increments on each successful silent push; drives the blink animation on the button.
  autoPushFlashSeq?: number
  // Connection state for the RslHelperConnectButton shown in express mode.
  rslHelperConnectEnabled?: boolean
  pushEndpointReachable?: boolean
  onToggleRslHelperConnect?: () => void
  // Called when the express preset toggle changes; loads the beginner or lategame preset SFC.
  onLoadSimplePreset?: (variant: 'beginner' | 'lategame') => void
  // Width of the left builder panel in CSS pixels. When provided the floating panel aligns with
  // the builder column, leaving the gear inspector visible on the right.
  drawerWidthPx?: number
  // Top / left offsets in CSS viewport pixels — both derived from
  // splitterContainerRef.getBoundingClientRect() in App.tsx.
  // position:fixed top/left are viewport-relative and unaffected by ancestor CSS zoom,
  // so these values are used directly (no zoom correction).
  drawerTopPx?: number
  // Left offset accounts for the splitter container's centering transform (left:50% translateX(-50%))
  // so the floating panel aligns precisely with the builder column's left edge.
  drawerLeftPx?: number
}) {
  const { t, lang, setLang } = useI18n()
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  // Editor background adapts to the active theme mode; the syntax/note colours
  // painted on top adapt with it via the per-scheme `--note-tok-*` / `--note-color-*`
  // vars published below (legible in both schemes, recomputed when the theme changes).
  const editorBg = (theme.vars?.palette.background.default ?? theme.palette.background.default)
  const noteColorSchemeStyles = useMemo(() => buildNoteColorSchemeStyles(theme), [theme])
  const languageOptions = useLanguageOptions()
  const langSelectValue = useMemo(() => (
    languageOptions.some((opt) => opt.code === lang) ? lang : DEFAULT_LANGUAGE
  ), [lang, languageOptions])
  // Cache view/edit labels so button widths can align across modes.
  const editNoteLabel = t('editNote')
  const viewNoteLabel = t('viewNote')
  // Measure labels so the toggle button width matches the longer one.
  const noteModeButtonMinWidth = useMemo(() => {
    // Use a canvas measurement to avoid layout shifts when toggling modes.
    const ctx = document?.createElement?.('canvas')?.getContext?.('2d')
    // Fall back to natural width when we cannot measure text.
    if (!ctx) return undefined
    // Default to the body font so measurements match MUI button text.
    const font = typeof window !== 'undefined'
      ? getComputedStyle(window.document.body).font || '500 14px Roboto'
      : '500 14px Roboto'
    ctx.font = font
    // Account for default button padding so text doesn't clip.
    const paddingPx = 32
    const widths = [editNoteLabel, viewNoteLabel].map((text) => ctx.measureText(text).width + paddingPx)
    // Clamp to the widest label so both buttons render the same width.
    return Math.ceil(Math.max(...widths))
  }, [editNoteLabel, viewNoteLabel])
  const editCommitRef = useRef<() => void>(() => onClose())
  const deferredNote = useDeferredValue(note)
  // View-only renders lean on the deferred snapshot so toggling loads does not stutter the dialog content.
  const renderNote = mode === 'view' ? deferredNote : note
  const notePending = mode === 'view' && deferredNote !== note

  // ─── User-override epoch (dungeon-simulator restart signal) ─────────────────
  // Monotonic counter bumped ONLY when the user mutates a recipe/safeguard override
  // — through any path: per-question edits, reset-to-defaults, or load/save/delete of
  // an override set. Background endpoint pushes re-derive `rules` (new array, possibly
  // new content) WITHOUT touching this counter, so the embedded simulator can use the
  // epoch as its sole restart signal and stay inert to background rule churn.
  const [userOverrideEpoch, setUserOverrideEpoch] = useState(0)
  // Wrap the two override setters once so every user-driven mutation bumps the epoch.
  // Wrapping at this single chokepoint (rather than at each call site) is the SSOT move:
  // answer-change handlers, the reset action, and the preset save/load/delete controller
  // all funnel through these two setters, so none can mutate overrides without stamping.
  const onRecipeOverridesAnswersChange = useCallback<typeof onRecipeOverridesAnswersChangeRaw>(
    (update) => {
      setUserOverrideEpoch((n) => n + 1)
      onRecipeOverridesAnswersChangeRaw(update)
    },
    [onRecipeOverridesAnswersChangeRaw],
  )
  const onSafeguardOverridesAnswersChange = useCallback<typeof onSafeguardOverridesAnswersChangeRaw>(
    (update) => {
      setUserOverrideEpoch((n) => n + 1)
      onSafeguardOverridesAnswersChangeRaw(update)
    },
    [onSafeguardOverridesAnswersChangeRaw],
  )

  // Consider any positive ratio as a sign the Gear Inspector/rule workload is still rebuilding.
  const noteSummaryInFlight = summaryProgressRatio > 0
  // Only render the summary chip when at least one Gear Inspector row exists.
  const showNoteSummaryChip = Boolean(gearSummary && gearSummary.total > 0)
  // Keep disable-confirm actions visually equal to avoid implying a preferred choice.
  const disableConfirmButtonProps = { color: 'primary', variant: 'contained' } as const

  // Express mode: tracks which preset note is currently shown in the toggle.
  // Default to lategame — it is the richer, more flexible preset.
  const [simpleSfcVariant, setSimpleSfcVariant] = useState<'beginner' | 'lategame'>('lategame')
  // Load the chosen preset when the express SFC toggle changes.
  const handleSimpleVariantChange = useCallback(
    (_: React.MouseEvent, value: 'beginner' | 'lategame' | null) => {
      if (!value) return
      setSimpleSfcVariant(value)
      onLoadSimplePreset?.(value)
    },
    [onLoadSimplePreset],
  )

  // Derived once so multiple render paths can read it without recomputing.
  const isSimpleMode = Boolean(simpleMode && !expertMode)
  // Floating panel (fixed-position, draggable) is only active in SBS layout with expert or
  // normal mode. Simple mode (express flow) always uses the standard centered Dialog.
  const useFloatingPanel = drawerWidthPx != null && !isSimpleMode

  // Resolve recipe markers for embedded recipe chips.
  const markerResolutions = useMemo(() => buildRecipeMarkerResolutions(renderNote ?? '', recipes), [renderNote, recipes])
  // Resolve safeguard markers for embedded rule summaries.
  const safeguardMarkerResolutions = useMemo(
    () => buildSafeguardMarkerResolutions(renderNote ?? '', safeguardRules),
    [renderNote, safeguardRules],
  )
  // Map marker indices to question definitions for rendering.
  const recipeOverridesSignature = useMemo(
    () => buildNoteRecipeOverridesSignature(renderNote ?? ''),
    [renderNote],
  )
  // Flag whether the current note includes recipe overrides markers.
  const hasRecipeOverridesMarkers = recipeOverridesSignature !== '[]'
  // Resolve recipe overrides markers so disabled state can still render dimmed cards.
  const recipeOverridesResolutions = useMemo(
    () => buildRecipeOverridesMarkerResolutions(renderNote ?? '', recipeOverridesAnswers),
    [recipeOverridesAnswers, renderNote],
  )
  // Reset answers by clearing stored overrides back to defaults and re-enabling parsing.
  // Safeguard overrides answers (sliders, radios) are reset alongside recipe overrides
  // so all question controls return to their default positions.
  const handleResetRecipeOverridesAnswers = React.useCallback(() => {
    onNoteOverridesDisabledChange(false)
    onRecipeOverridesAnswersChange(() => ({}))
    onSafeguardOverridesAnswersChange(() => ({}))
  }, [onRecipeOverridesAnswersChange, onNoteOverridesDisabledChange, onSafeguardOverridesAnswersChange])
  const handleEnableRecipeOverrides = React.useCallback(() => {
    onNoteOverridesDisabledChange(false)
  }, [onNoteOverridesDisabledChange])
  // Anchor the recipe overrides action menu in view mode.
  const [viewRecipeOverridesMenuAnchor, setViewRecipeOverridesMenuAnchor] = useState<HTMLElement | null>(null)
  // Flag whether the view-mode recipe overrides menu is open.
  const viewRecipeOverridesMenuOpen = Boolean(viewRecipeOverridesMenuAnchor)
  // Queue the view-mode action so we can apply it after the menu closes.
  const [viewRecipeOverridesMenuAction, setViewRecipeOverridesMenuAction] = useState<RecipeOverridesMenuAction | null>(null)
  // Open the view-mode recipe overrides menu from the button anchor.
  const openViewRecipeOverridesMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setViewRecipeOverridesMenuAnchor(event.currentTarget)
  }, [])
  // Close the view-mode recipe overrides menu without applying changes.
  const closeViewRecipeOverridesMenu = React.useCallback(() => {
    setViewRecipeOverridesMenuAnchor(null)
  }, [])
  // Queue a view-mode action, then close the menu to trigger exit cleanup.
  const queueViewRecipeOverridesMenuAction = React.useCallback((action: RecipeOverridesMenuAction) => {
    // Store the action before closing so exit cleanup can replay it.
    setViewRecipeOverridesMenuAction(action)
    // Closing the menu first prevents stuck backdrops.
    closeViewRecipeOverridesMenu()
  }, [closeViewRecipeOverridesMenu])
  // Controller for the view-mode save/load/delete override-set feature.
  const viewOverridesPresetController = useDynamicOverridesPresetController({
    note: note ?? '',
    recipeAnswers: recipeOverridesAnswers,
    onRecipeAnswersChange: onRecipeOverridesAnswersChange,
    safeguardAnswers: safeguardOverridesAnswers,
    onSafeguardAnswersChange: onSafeguardOverridesAnswersChange,
    onEnableOverrides: handleEnableRecipeOverrides,
    onCloseMenu: closeViewRecipeOverridesMenu,
  })
  // Hold the disable dialog context so view + edit can share one confirm flow.
  const [disableRecipeOverridesContext, setDisableRecipeOverridesContext] = useState<DisableRecipeOverridesContext | null>(null)
  // Open the disable confirm dialog with the latest note snapshot.
  const openDisableRecipeOverridesDialog = React.useCallback((noteText: string) => {
    setDisableRecipeOverridesContext({ noteText })
  }, [])
  // Close the confirm dialog without mutating note/recipe state.
  const closeDisableRecipeOverridesDialog = React.useCallback(() => {
    setDisableRecipeOverridesContext(null)
  }, [])
  // Apply the queued view-mode action after the menu finishes closing.
  const handleViewRecipeOverridesMenuExited = React.useCallback(() => {
    // Run the action only once when the menu has fully unmounted.
    runRecipeOverridesMenuAction(
      viewRecipeOverridesMenuAction,
      {
        onReset: handleResetRecipeOverridesAnswers,
        onEnable: handleEnableRecipeOverrides,
        onDisable: openDisableRecipeOverridesDialog,
      },
      () => setViewRecipeOverridesMenuAction(null),
    )
  }, [
    handleEnableRecipeOverrides,
    handleResetRecipeOverridesAnswers,
    openDisableRecipeOverridesDialog,
    viewRecipeOverridesMenuAction,
  ])
  // Full-width action strip for express simple mode.
  // Layout: [Reset — left] [Connect · AutoPush — center] [Go Expert — right]
  const simpleActionsNode: React.ReactNode = isSimpleMode ? (
    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
      {/* Left: Reset to Defaults */}
      <Box sx={{ flex: 1 }}>
        <Button
          size="small"
          variant="outlined"
          color="error"
          onClick={handleResetRecipeOverridesAnswers}
        >
          {t('noteDynamicOverridesResetDefaults')}
        </Button>
      </Box>
      {/* Center: connection notifier + auto-push */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
        {rslHelperConnectEnabled !== undefined && (
          <RslHelperConnectButton
            connectEnabled={rslHelperConnectEnabled ?? false}
            pushEndpointReachable={pushEndpointReachable ?? false}
            onToggleConnect={onToggleRslHelperConnect ?? (() => {})}
            showLabel
          />
        )}
        {autoPushExpressEnabled !== undefined && (
          <MarkdownTooltip markdown={autoPushExpressEnabled ? t('simpleModeAutoPushOnTooltip') : t('simpleModeAutoPushOffTooltip')}>
            {/* key change on each push remounts the button so the CSS animation replays. */}
            <IconButton
              key={autoPushFlashSeq}
              size="small"
              onClick={() => onToggleAutoPushExpress?.(!autoPushExpressEnabled)}
              aria-label={t('simpleModeAutoPush')}
              sx={(theme) => ({
                borderRadius: 1,
                border: 1,
                borderColor: autoPushExpressEnabled ? 'success.main' : 'primary.main',
                bgcolor: autoPushExpressEnabled ? 'success.main' : 'transparent',
                color: autoPushExpressEnabled ? (theme.vars?.palette.success.contrastText ?? theme.palette.success.contrastText) : 'primary.main',
                '&:hover': {
                  bgcolor: autoPushExpressEnabled ? 'success.dark' : 'primary.main',
                  borderColor: autoPushExpressEnabled ? 'success.main' : 'primary.main',
                  color: autoPushExpressEnabled ? (theme.vars?.palette.success.contrastText ?? theme.palette.success.contrastText) : 'primary.contrastText',
                },
                ...((autoPushFlashSeq ?? 0) > 0 ? { animation: `${autoPushBlink} 0.6s ease-out` } : {}),
              })}
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </MarkdownTooltip>
        )}
      </Box>
      {/* Right: Go Expert */}
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <MarkdownTooltip markdown={t('simpleModeGoExpertTooltip')}>
          <Button size="small" variant="outlined" onClick={onGoExpert}>
            {t('simpleModeGoExpert')}
          </Button>
        </MarkdownTooltip>
      </Box>
    </Box>
  ) : null

  // Apply or discard all dynamic overrides (recipes + safeguards) before disabling them in the session.
  const handleDisableRecipeOverridesConfirm = React.useCallback((applyOverrides: boolean) => {
    const context = disableRecipeOverridesContext
    if (!context) return
    if (applyOverrides) {
      // Apply recipe override answers to stored recipes.
      const resolution = resolveRecipeOverridesTags(context.noteText ?? '', recipeOverridesAnswers)
      onApplyRecipeOverrides(resolution.instructions)
      // Apply the current display safeguard rules (overrides applied) back to stored rules.
      onApplySafeguardOverrides()
    }
    // Disable dynamic overrides parsing so both recipe and safeguard markers are ignored.
    onNoteOverridesDisabledChange(true)
    // Close the confirm dialog after applying changes.
    setDisableRecipeOverridesContext(null)
  }, [
    recipeOverridesAnswers,
    disableRecipeOverridesContext,
    onApplyRecipeOverrides,
    onApplySafeguardOverrides,
    onNoteOverridesDisabledChange,
  ])
  // Resolve safeguard overrides markers — produces both question definitions (for rendering)
  // and instructions (passed to App.tsx via onSafeguardOverridesResolutionChange). Declared before
  // the recipe handler because that handler reads it to resolve cross-domain `setval` slider writes.
  const safeguardOverridesResolution = useMemo(
    () => resolveNoteSafeguardOverridesTags(renderNote ?? '', safeguardOverridesAnswers),
    [renderNote, safeguardOverridesAnswers],
  )
  const handleRecipeOverridesAnswerChange = React.useCallback((
    question: NoteQuestionDefinition,
    nextSelection: string[],
    preferredId?: string,
    removedId?: string,
  ) => {
    // Persist the recipe answer change.
    const note = renderNote ?? ''
    onRecipeOverridesAnswersChange((prev) => applyRecipeOverridesAnswerChange(
      note, prev, question, nextSelection, preferredId, removedId,
    ))
    // Cross-domain slider writes: an option that becomes newly selected pins a SAFEGUARD slider
    // (matched by its id=token), persisting a real stored value — exactly as if the user dragged
    // it there (no render overlay, no snap-back). This is how an account-mode radio sets the
    // improvement-chance sliders: `Endgame+` → 50, the rest → 25.
    //   • `setval token=N` → write the slider value N (implies toggle on).
    //   • `+token` / `-token` (set/unset) naming a slider id → toggle it on / off.
    // We diff the resolved recipe selection before/after off the CURRENT answers prop (this handler
    // fires on a user action, so `recipeOverridesAnswers` is the live state) to avoid nested setState.
    const before = new Set(resolveRecipeOverridesTags(note, recipeOverridesAnswers).questions.flatMap((q) => q.answer))
    const nextRecipe = applyRecipeOverridesAnswerChange(note, recipeOverridesAnswers, question, nextSelection, preferredId, removedId)
    // token → safeguard slider option (id=token), for resolving cross-domain writes.
    const sliderByToken = new Map<string, { questionId: string; defaultNum: number }>()
    for (const q of safeguardOverridesResolution.questions) {
      const slider = q.options.find((o) => o.groupType === 'slider' && o.token)
      if (slider?.token) sliderByToken.set(slider.token, { questionId: q.id, defaultNum: slider.sliderDefault ?? slider.sliderMin ?? 1 })
    }
    // Accumulate writes from every newly-selected option, in resolution order (last wins).
    const writes: { questionId: string; value: string }[] = []
    for (const q of resolveRecipeOverridesTags(note, nextRecipe).questions) {
      for (const o of q.options) {
        if (!q.answer.includes(o.id) || before.has(o.id)) continue
        for (const { token, value } of o.setValueDirectives) {
          const sld = sliderByToken.get(token); if (sld) writes.push({ questionId: sld.questionId, value: String(value) })
        }
        // +token → toggle the slider ON at its default; -token → toggle OFF (sentinel).
        for (const token of o.setTokens) {
          const sld = sliderByToken.get(token); if (sld) writes.push({ questionId: sld.questionId, value: String(sld.defaultNum) })
        }
        for (const token of o.unsetTokens) {
          const sld = sliderByToken.get(token); if (sld) writes.push({ questionId: sld.questionId, value: SLIDER_TOGGLE_OFF })
        }
      }
    }
    if (writes.length > 0) {
      onSafeguardOverridesAnswersChange((prevSg) => {
        const nextSg = { ...prevSg }
        for (const w of writes) nextSg[w.questionId] = [w.value]
        return nextSg
      })
    }
  }, [onRecipeOverridesAnswersChange, onSafeguardOverridesAnswersChange, recipeOverridesAnswers, safeguardOverridesResolution, renderNote])
  // Build the marker index → question definition map for NoteSafeguardOverridesBlock.
  const safeguardOverridesResolutions = useMemo(
    () => {
      const map = new Map<number, SafeguardNoteQuestionDefinition>()
      safeguardOverridesResolution.questions.forEach((q) => map.set(q.index, q))
      return map
    },
    [safeguardOverridesResolution],
  )
  // Notify the parent of resolution changes so App.tsx can apply them on each render.
  React.useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onSafeguardOverridesResolutionChange(safeguardOverridesResolution)
  }, [onSafeguardOverridesResolutionChange, safeguardOverridesResolution])
  // Handle answer changes from safeguard-overrides question blocks in view mode.
  // Mirrors recipe override handler: applies within-question rules, then re-resolves ALL questions
  // so cross-question exclusions/directives cascade to other markers.
  const handleSafeguardOverridesAnswerChange = React.useCallback((
    question: SafeguardNoteQuestionDefinition,
    nextSelection: string[],
    preferredId?: string,
    removedId?: string,
  ) => {
    // Slider questions store a raw numeric string — constraint rules do not apply.
    const sliderGroup = question.groups.find((g) => g.type === 'slider')
    if (sliderGroup) {
      const sliderOpt = sliderGroup.options[0]
      const defaultNum = sliderOpt ? (sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1) : 1
      const numStr = nextSelection[0]
      // Note: a slider value set by an account-mode `setval` is just a normal stored answer here
      // (persisted on select), so dragging it is an ordinary value change — no special release.
      // The toggle-off sentinel passes through unchanged (routes to the else block).
      if (numStr === SLIDER_TOGGLE_OFF) {
        onSafeguardOverridesAnswersChange((prev) => ({ ...prev, [question.id]: [SLIDER_TOGGLE_OFF] }))
        return
      }
      const numVal = numStr !== undefined ? Number.parseFloat(numStr) : NaN
      onSafeguardOverridesAnswersChange((prev) => {
        const next = { ...prev }
        // Full storage: record the numeric value even when it equals the default; only an
        // empty/invalid drag falls back to the default value string so the answer stays present.
        next[question.id] = (numStr && Number.isFinite(numVal)) ? [numStr] : [String(defaultNum)]
        return next
      })
      return
    }
    // Apply within-question rules before the cascade so the selection is already clean.
    const ruled = applyQuestionSgSelectionRules(nextSelection, question, preferredId, removedId)
    const defaultSet = new Set(question.defaultAnswer)
    const ruledSet = new Set(ruled)
    const matchesDefault = defaultSet.size === ruledSet.size
      && Array.from(defaultSet).every((id) => ruledSet.has(id))
    const orderedSelection = question.options
      .filter((option) => ruledSet.has(option.id))
      .map((option) => option.id)
    onSafeguardOverridesAnswersChange((prev) => {
      const next = { ...prev }
      if (matchesDefault) {
        delete next[question.id]
      } else {
        next[question.id] = orderedSelection
      }
      // Re-resolve ALL questions so cross-question exclusions/directives cascade.
      const { questions: allResolved } = resolveNoteSafeguardOverridesTags(
        renderNote ?? '',
        next,
        preferredId,
        removedId,
      )
      // Persist the FULL resolved selection for every question (defaults included), so the
      // saved state is self-contained and identical in shape to a saved preset. The cascade
      // already ran in resolveNoteSafeguardOverridesTags above, so we record its output verbatim.
      const normalized: NoteSafeguardOverridesAnswers = {}
      allResolved.forEach((resolved) => {
        // Sliders store a numeric value; record the resolved value (or the default when absent).
        const hasSlider = resolved.groups.some((g) => g.type === 'slider')
        if (hasSlider) {
          const sliderOpt = resolved.groups.find((g) => g.type === 'slider')?.options[0]
          const def = sliderOpt ? (sliderOpt.sliderDefault ?? sliderOpt.sliderMin ?? 1) : 1
          const storedNum = resolved.answer.find((v) => Number.isFinite(Number.parseFloat(v)))
          normalized[resolved.id] = [storedNum ?? String(def)]
          return
        }
        // Non-slider: record every selected option id, ordered by option definition.
        const resolvedSet = new Set(resolved.answer)
        normalized[resolved.id] = resolved.options
          .filter((option) => resolvedSet.has(option.id))
          .map((option) => option.id)
      })
      return normalized
    })
  }, [onSafeguardOverridesAnswersChange, renderNote])
  // summaryProgressRatio > 0 signals that the rule cache pipeline is still rebuilding.
  const pipelineRunning = summaryProgressRatio > 0
  const contextValue = useMemo<NoteRenderContextValue>(
    () => ({
      recipes,
      metasets,
      substatColors,
      useStatButtonColors,
      markerResolutions,
      safeguardRules,
      safeguardMarkerResolutions,
      recipeOverridesResolutions,
      recipeOverridesEditable: mode === 'view' && !noteOverridesDisabled,
      noteOverridesDisabled,
      onRecipeOverridesAnswerChange: handleRecipeOverridesAnswerChange,
      safeguardOverridesResolutions,
      safeguardOverridesEditable: mode === 'view' && !noteOverridesDisabled,
      onSafeguardOverridesAnswerChange: handleSafeguardOverridesAnswerChange,
      // Forwarded to DungeonSimulatorNoteBlock via context.
      rules,
      substatTargets,
      userOverrideEpoch,
      pipelineRunning,
      isEditorPreview: false,
    }),
    [
      recipes,
      metasets,
      substatColors,
      useStatButtonColors,
      markerResolutions,
      safeguardRules,
      safeguardMarkerResolutions,
      recipeOverridesResolutions,
      noteOverridesDisabled,
      mode,
      handleRecipeOverridesAnswerChange,
      safeguardOverridesResolutions,
      handleSafeguardOverridesAnswerChange,
      rules,
      substatTargets,
      userOverrideEpoch,
      // pipelineRunning is derived from summaryProgressRatio in the same render, so tracking
      // summaryProgressRatio here is sufficient — the memo will invalidate when it changes.
      pipelineRunning,
    ],
  )
  const allowMarkdownElement = React.useCallback<MarkdownAllowElement>((element) => {
    const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : ''
    if (tag === RECIPE_ELEMENT_TAG || tag === SAFEGUARD_ELEMENT_TAG || tag === QUESTION_ELEMENT_TAG || tag === QUESTION_GROUP_ELEMENT_TAG || tag === SG_QUESTION_ELEMENT_TAG || tag === SG_QUESTION_GROUP_ELEMENT_TAG || tag === DUNGEON_SIM_ELEMENT_TAG) return true
    return DEFAULT_ALLOWED_TAG_REGEX.test(tag)
  }, [])
  // Memoized sanitize schema and plugins for performance during typing.
  type Primitive = string | number | boolean | RegExp | null | undefined
  type SanitizeProp = string | [string, ...Primitive[]]
  const sanitizeSchema: Schema = useMemo(() => {
    const baseAttrs = (defaultSchema.attributes ?? {}) as Record<string, SanitizeProp[]>
    const spanAttrs: SanitizeProp[] = Array.isArray(baseAttrs.span) ? baseAttrs.span : []
    const recipeAttrs: SanitizeProp[] = Array.isArray(baseAttrs[RECIPE_ELEMENT_TAG]) ? baseAttrs[RECIPE_ELEMENT_TAG] : []
    const safeguardAttrs: SanitizeProp[] = Array.isArray(baseAttrs[SAFEGUARD_ELEMENT_TAG]) ? baseAttrs[SAFEGUARD_ELEMENT_TAG] : []
    const questionAttrs: SanitizeProp[] = Array.isArray(baseAttrs[QUESTION_ELEMENT_TAG]) ? baseAttrs[QUESTION_ELEMENT_TAG] : []
    const mergedRecipeAttrs = Array.from(new Set<SanitizeProp>([
      ...recipeAttrs,
      RECIPE_ELEMENT_ATTR,
      RECIPE_ELEMENT_PATTERN_ATTR,
      RECIPE_ELEMENT_FILTER_ATTR,
      RECIPE_ELEMENT_INDEX_ATTR,
    ]))
    const mergedSafeguardAttrs = Array.from(new Set<SanitizeProp>([
      ...safeguardAttrs,
      SAFEGUARD_ELEMENT_ATTR,
      SAFEGUARD_ELEMENT_FILTER_ATTR,
      SAFEGUARD_ELEMENT_PATTERN_ATTR,
      SAFEGUARD_ELEMENT_INDEX_ATTR,
    ]))
    const mergedQuestionAttrs = Array.from(new Set<SanitizeProp>([
      ...questionAttrs,
      QUESTION_ELEMENT_INDEX_ATTR,
    ]))
    const sgQuestionAttrs: SanitizeProp[] = Array.isArray(baseAttrs[SG_QUESTION_ELEMENT_TAG]) ? baseAttrs[SG_QUESTION_ELEMENT_TAG] : []
    const mergedSgQuestionAttrs = Array.from(new Set<SanitizeProp>([
      ...sgQuestionAttrs,
      SG_QUESTION_ELEMENT_INDEX_ATTR,
    ]))
    return {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        span: [...spanAttrs, 'data-color', 'dataColor'],
        [RECIPE_ELEMENT_TAG]: mergedRecipeAttrs,
        [SAFEGUARD_ELEMENT_TAG]: mergedSafeguardAttrs,
        [QUESTION_ELEMENT_TAG]: mergedQuestionAttrs,
        [SG_QUESTION_ELEMENT_TAG]: mergedSgQuestionAttrs,
      },
      tagNames: Array.from(new Set([
        ...(defaultSchema.tagNames ?? []),
        'span',
        RECIPE_ELEMENT_TAG,
        SAFEGUARD_ELEMENT_TAG,
        QUESTION_ELEMENT_TAG,
        QUESTION_GROUP_ELEMENT_TAG,
        SG_QUESTION_ELEMENT_TAG,
        SG_QUESTION_GROUP_ELEMENT_TAG,
        DUNGEON_SIM_ELEMENT_TAG,
      ])),
    }
  }, [])
  const rehypePluginsSafe = useMemo<Pluggable[]>(() => (
    [
      rehypeRecipeComments,
      rehypeSafeguardComments,
      rehypeQuestionComments,
      rehypeQuestionGroups,
      // Transforms <!-- safeguard-overrides … --> blocks into note-safeguard-overrides elements.
      rehypeSafeguardOverridesComments,
      rehypeSafeguardOverridesGroups,
      // Replaces <!-- dungeon-simulator --> comments with the custom element tag.
      rehypeDungeonSimulatorComment,
      [rehypeSanitize, sanitizeSchema] as unknown as Pluggable,
    ]
  ), [sanitizeSchema])
  const markdownComponents = useMemo<MarkdownComponentMap>(() => ({
    [RECIPE_ELEMENT_TAG]: RecipeChipBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [SAFEGUARD_ELEMENT_TAG]: SafeguardBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [QUESTION_ELEMENT_TAG]: NoteQuestionBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [QUESTION_GROUP_ELEMENT_TAG]: NoteQuestionGroup as unknown as React.ComponentType<Record<string, unknown>>,
    // Renders safeguard-overrides question cards (single / multi / slider groups).
    [SG_QUESTION_ELEMENT_TAG]: NoteSafeguardOverridesBlock as unknown as React.ComponentType<Record<string, unknown>>,
    [SG_QUESTION_GROUP_ELEMENT_TAG]: NoteQuestionGroup as unknown as React.ComponentType<Record<string, unknown>>,
    // Renders a live dungeon simulation summary table from <!-- dungeon-simulator -->.
    [DUNGEON_SIM_ELEMENT_TAG]: DungeonSimulatorNoteBlock as unknown as React.ComponentType<Record<string, unknown>>,
  }), [])

  // Shared minimize animation: shrinks the paper toward the Note button in the builder.
  const { dialogProps: noteDialogProps, animateClose } = useDialogMinimizeAnimation('[data-tour-id="note.toggle"]')

  // Always animate toward the Note button when closing — used everywhere onClose fires.
  const animatedOnClose = useCallback(() => {
    animateClose(onClose)
  }, [animateClose, onClose])

  // Non-edit modes should always commit by closing immediately.
  // Synced via effect so we never write to a ref during render.
  React.useEffect(() => {
    if (mode !== 'edit') {
      editCommitRef.current = animatedOnClose
    }
  }, [mode, animatedOnClose])

  const handleDialogClose = React.useCallback(() => {
    try { editCommitRef.current() } catch { animatedOnClose() }
  }, [animatedOnClose])

  // Locally-owned ref for the panel element, used for drag position and entry animation.
  // Synced to the animation hook's ref after mount so animateClose can still read bounds.
  const panelRef = useRef<HTMLDivElement | null>(null)
  React.useLayoutEffect(() => {
    // In Dialog mode the animation hook's ref is wired directly via PaperProps — skip the sync.
    if (!useFloatingPanel) return
    const animRef = noteDialogProps.PaperProps.ref as React.MutableRefObject<HTMLElement | null>
    animRef.current = panelRef.current
    return () => { animRef.current = null }
  }, [useFloatingPanel, noteDialogProps.PaperProps.ref])

  // Snap-to-side state: the panel always aligns to the left or right viewport edge.
  // Width is independently resizable; both are persisted so the session restores cleanly.
  const [panelSide, setPanelSide] = useState<'left' | 'right'>(() => loadPanelSnap()?.side ?? 'left')
  const [panelWidth, setPanelWidth] = useState<number>(() => loadPanelSnap()?.width ?? (drawerWidthPx ?? 400))
  // Mutable refs hold current values so pointer-event handlers (useCallback with []) can read them
  // without capturing stale closures. Updated via effects so they are not mutated during render.
  const panelSideRef = useRef(panelSide)
  const panelWidthRef = useRef(panelWidth)
  const drawerLeftPxRef = useRef(drawerLeftPx)
  React.useEffect(() => { panelSideRef.current = panelSide }, [panelSide])
  React.useEffect(() => { panelWidthRef.current = panelWidth }, [panelWidth])
  React.useEffect(() => { drawerLeftPxRef.current = drawerLeftPx }, [drawerLeftPx])

  // Keep panel left/width aligned with snap state after state changes.
  // All CSS left values are divided by zoom because position:fixed offsets inside a CSS-zoomed
  // ancestor are in the zoomed coordinate space (1 CSS px = zoom visual px).
  //
  // drawerLeftPx is intentionally kept in deps so the panel re-snaps when the splitter moves.
  // The gesture guard uses panel.dataset['gesture'] (a DOM attribute set by pointer handlers)
  // to detect an active drag/resize without reading any user-managed ref inside the effect
  // (which would cause react-hooks/immutability lint errors).
  React.useLayoutEffect(() => {
    if (!useFloatingPanel) return
    const panel = panelRef.current
    if (!panel) return
    // Skip while a drag or resize gesture is in progress to avoid overriding inline styles
    // that the pointer-move handlers are updating every frame.
    if (panel.dataset['gesture']) return
    const zoom = getAppZoom()
    // drawerLeftPx is visual px (from getBoundingClientRect); convert to CSS px.
    const cssLeft = panelSide === 'left'
      ? (drawerLeftPx ?? 0) / zoom
      : window.innerWidth / zoom - panelWidth
    panel.style.setProperty('left', `${Math.max(0, cssLeft)}px`)
    panel.style.setProperty('width', `${panelWidth}px`)
  }, [useFloatingPanel, panelSide, panelWidth, drawerLeftPx])

  // Drag: captures X position on title pointerdown; snaps to nearest side on release.
  // startLeft stored as visual px (from getBoundingClientRect); divided by zoom before writing.
  const dragOriginRef = useRef<{ mouseX: number; startVisLeft: number } | null>(null)
  // Resize: captures start geometry when an edge handle is grabbed.
  // startCssLeft is in CSS px; startWidth is CSS px (offsetWidth).
  const resizeOriginRef = useRef<{ mouseX: number; startWidth: number; startCssLeft: number; handle: 'left' | 'right' } | null>(null)

  // Drag: title-bar pointerdown → capture → move tracks cursor → release snaps to side.
  // Uses React synthetic events exactly as the original code did (same wiring that worked).
  const handleTitlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="button"], [role="combobox"]')) return
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    dragOriginRef.current = { mouseX: e.clientX, startVisLeft: rect.left }
    panel.dataset['gesture'] = 'drag'
    panel.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [])

  // Resize handle pointerdown: capture start geometry for the grabbed edge.
  const handleResizePointerDown = useCallback((e: React.PointerEvent<HTMLElement>, handle: 'left' | 'right') => {
    e.stopPropagation()
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const zoom = getAppZoom()
    resizeOriginRef.current = { mouseX: e.clientX, startWidth: panel.offsetWidth, startCssLeft: rect.left / zoom, handle }
    panel.dataset['gesture'] = 'resize'
    panel.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handlePanelPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel) return
    const zoom = getAppZoom()
    if (dragOriginRef.current) {
      const dx = e.clientX - dragOriginRef.current.mouseX
      const visW = panel.getBoundingClientRect().width
      const newVisLeft = Math.max(-(visW - 80), Math.min(window.innerWidth - 80, dragOriginRef.current.startVisLeft + dx))
      panel.style.setProperty('left', `${newVisLeft / zoom}px`)
      return
    }
    if (resizeOriginRef.current) {
      const { mouseX, startWidth, startCssLeft, handle } = resizeOriginRef.current
      const dxCss = (e.clientX - mouseX) / zoom
      const viewCssW = window.innerWidth / zoom
      if (handle === 'right') {
        const newCssW = Math.max(PANEL_MIN_WIDTH_PX, Math.min(viewCssW - startCssLeft - 10, startWidth + dxCss))
        panel.style.setProperty('left', `${startCssLeft}px`)
        panel.style.setProperty('width', `${newCssW}px`)
      } else {
        const rightCssEdge = startCssLeft + startWidth
        const newCssLeft = Math.max(0, Math.min(rightCssEdge - PANEL_MIN_WIDTH_PX, startCssLeft + dxCss))
        panel.style.setProperty('left', `${newCssLeft}px`)
        panel.style.setProperty('width', `${rightCssEdge - newCssLeft}px`)
      }
    }
  }, [])

  const handlePanelPointerUp = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    const zoom = getAppZoom()
    if (dragOriginRef.current) {
      dragOriginRef.current = null
      delete panel.dataset['gesture']
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const rect = panel.getBoundingClientRect()
      const panelCenter = rect.left + rect.width / 2
      const newSide: 'left' | 'right' = panelCenter < window.innerWidth / 2 ? 'left' : 'right'
      const currentCssWidth = panelWidthRef.current
      const snapCssLeft = newSide === 'left'
        ? (drawerLeftPxRef.current ?? 0) / zoom
        : Math.max(0, window.innerWidth / zoom - currentCssWidth)
      panel.style.setProperty('left', `${snapCssLeft}px`)
      setPanelSide(newSide)
      savePanelSnap({ side: newSide, width: currentCssWidth })
      return
    }
    if (resizeOriginRef.current) {
      resizeOriginRef.current = null
      delete panel.dataset['gesture']
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      const newCssWidth = Math.max(PANEL_MIN_WIDTH_PX, panel.offsetWidth)
      const snapSide = panelSideRef.current
      const snapCssLeft = snapSide === 'left'
        ? (drawerLeftPxRef.current ?? 0) / zoom
        : Math.max(0, window.innerWidth / zoom - newCssWidth)
      panel.style.setProperty('left', `${snapCssLeft}px`)
      panel.style.setProperty('width', `${newCssWidth}px`)
      setPanelWidth(newCssWidth)
      savePanelSnap({ side: snapSide, width: newCssWidth })
    }
  }, [])

  // Close on Escape — only needed in floating mode; Dialog mode gets this from the Modal.
  React.useEffect(() => {
    if (!useFloatingPanel) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') handleDialogClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [useFloatingPanel, handleDialogClose])

  // Slide the panel in on mount: left-snap slides from the left, right-snap from the right.
  // Double RAF ensures the initial transform is painted before the transition starts.
  const clearTransitionTidRef = useRef<number | null>(null)
  React.useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    // Use the ref so the effect captures the mount-time value without needing it in the dep array.
    const initialTranslate = panelSideRef.current === 'right' ? 'translateX(100%)' : 'translateX(-100%)'
    panel.style.setProperty('transform', initialTranslate)
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.style.setProperty('transition', 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)')
        panel.style.setProperty('transform', '')
        // Clear transition after animation completes so position updates remain instant.
        clearTransitionTidRef.current = window.setTimeout(() => {
          panel.style.setProperty('transition', '')
          clearTransitionTidRef.current = null
        }, 300)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (clearTransitionTidRef.current !== null) window.clearTimeout(clearTransitionTidRef.current)
    }
  }, [])

  // Re-snap and clamp panel width whenever the viewport or zoom changes.
  React.useEffect(() => {
    if (!useFloatingPanel) return
    const onResize = () => {
      const panel = panelRef.current
      if (!panel) return
      const zoom = getAppZoom()
      const viewCssW = window.innerWidth / zoom  // viewport in CSS px
      // Clamp CSS width so the panel never exceeds the viewport.
      const maxCssW = Math.max(PANEL_MIN_WIDTH_PX, viewCssW - 20)
      const newCssW = Math.max(PANEL_MIN_WIDTH_PX, Math.min(panel.offsetWidth, maxCssW))
      // Recompute snap position in CSS px.
      const newCssLeft = panelSideRef.current === 'left'
        ? Math.max(0, (drawerLeftPxRef.current ?? 0) / zoom)
        : Math.max(0, viewCssW - newCssW)
      panel.style.setProperty('left', `${newCssLeft}px`)
      panel.style.setProperty('width', `${newCssW}px`)
      // Persist if width was clamped.
      if (newCssW !== panelWidthRef.current) {
        setPanelWidth(newCssW)
        savePanelSnap({ side: panelSideRef.current, width: newCssW })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [useFloatingPanel])

  // Shared panel body — rendered inside either the floating Paper (SBS + expert/normal mode)
  // or the standard centered Dialog (single-column or simple mode).
  // Stable id on the title lets the floating Paper reference it via aria-labelledby so the
  // surface satisfies the role="dialog" + accessible-name pattern (also drives Playwright getByRole).
  const panelBody = (
    <>
      <DialogTitle
        id={NOTE_DIALOG_TITLE_ID}
        {...(useFloatingPanel ? { onPointerDown: handleTitlePointerDown } : {})}
        sx={{
          ...(useFloatingPanel ? { cursor: 'grab' } : {}),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          flexWrap: 'wrap',
          // Restore correct cursors on interactive children so the grab cursor doesn't mislead.
          '& button, & input, & a, & [role="combobox"], & [role="button"]': { cursor: 'pointer' },
        }}
      >
        {/* Left title area: app branding (simple mode) or "Note" title (expert/normal) — cross-faded via grid overlap. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Drag handle affordance — only shown in floating mode. */}
          {useFloatingPanel && <DragIndicatorIcon sx={{ color: 'text.disabled', flexShrink: 0, pointerEvents: 'none' }} fontSize="small" />}
          {/* Both items occupy the same grid cell so neither shifts layout during the cross-fade. */}
          <Box sx={{ display: 'grid', '& > *': { gridColumn: 1, gridRow: 1 }, alignItems: 'center' }}>
            <Fade in={isSimpleMode} timeout={SIMPLE_MODE_TRANSITION_MS} unmountOnExit>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                <AppTitle compact />
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                  v{APP_VERSION} · Nusi㊷
                </Typography>
              </Box>
            </Fade>
            <Fade in={!isSimpleMode} timeout={SIMPLE_MODE_TRANSITION_MS} unmountOnExit>
              <Box component="span">{t('noteTitle')}</Box>
            </Fade>
          </Box>
          {/* "Simple Mode" button — shown when the user entered expert mode during a simple session. */}
          <Fade in={Boolean(simpleMode && expertMode)} timeout={SIMPLE_MODE_TRANSITION_MS} unmountOnExit>
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <MarkdownTooltip markdown={t('simpleModeGoSimpleTooltip')}>
                <Button size="small" variant="outlined" onClick={onGoSimple} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                  {t('simpleModeGoSimple')}
                </Button>
              </MarkdownTooltip>
            </Box>
          </Fade>
        </Box>
        {/* Right side of title bar: language selector in simple mode, outcome chip otherwise. */}
        {isSimpleMode ? (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="simple-mode-lang-label">{t('helpLanguage')}</InputLabel>
            <Select
              labelId="simple-mode-lang-label"
              id="simple-mode-lang-select"
              label={t('helpLanguage')}
              value={langSelectValue}
              onChange={(e) => setLang(e.target.value as Language)}
            >
              {languageOptions.map((opt) => (
                <MenuItem key={opt.code} value={opt.code}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : showNoteSummaryChip ? (
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <WorkloadProgressIndicator
              progressRatio={summaryProgressRatio}
              ariaLabel={noteSummaryInFlight ? t('rulesBuilding') : undefined}
            />
            <GearInspectorOutcomeSummaryChip
              summary={gearSummary}
              dimmed={noteSummaryInFlight}
            />
          </Box>
        ) : null}
      </DialogTitle>
      {/* Simple-mode strip: preset toggle + outcome chip. Collapses away in expert mode. */}
      <Collapse in={Boolean(simpleMode && !expertMode)} timeout={SIMPLE_MODE_TRANSITION_MS} unmountOnExit>
        <Box sx={{ px: 3, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
            {t('simpleModePresetLabel')}
          </Typography>
          <ToggleButtonGroup
            value={simpleSfcVariant}
            exclusive
            size="small"
            onChange={handleSimpleVariantChange}
            aria-label={t('simpleModePresetLabel')}
          >
            <ToggleButton value="beginner">{t('simpleModeBasicSfc')}</ToggleButton>
            <ToggleButton value="lategame">{t('simpleModeEndgameSfc')}</ToggleButton>
          </ToggleButtonGroup>
          <Box sx={{ flex: 1 }} />
          {showNoteSummaryChip && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
              <WorkloadProgressIndicator
                progressRatio={summaryProgressRatio}
                ariaLabel={noteSummaryInFlight ? t('rulesBuilding') : undefined}
              />
              <GearInspectorOutcomeSummaryChip
                summary={gearSummary}
                dimmed={noteSummaryInFlight}
              />
            </Box>
          )}
        </Box>
      </Collapse>
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
                // MUI default overflowY:auto would add a second scrollbar; inner Box handles scrolling.
                overflow: 'hidden',
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
                data-color-mode={colorScheme ?? 'dark'}
                sx={{
                  // Stretch the preview to fill the dialog body.
                  flex: 1,
                  minHeight: 0,
                  bgcolor: editorBg,
                  '& .wmde-markdown img': { backgroundColor: 'transparent' },
                  borderRadius: 1,
                  px: 2,
                  py: 2,
                  overflow: 'auto',
                  '& .wmde-markdown': { bgcolor: 'transparent', fontSize: FONT_SIZE_MARKDOWN_PX, lineHeight: 1.7 },
                  // Override WMDE hardcoded table colors with MUI CSS vars so custom themes apply.
                  '& .wmde-markdown table': { borderColor: 'var(--mui-palette-divider)' },
                  '& .wmde-markdown table tr': { backgroundColor: 'var(--mui-palette-background-paper) !important', borderTopColor: 'var(--mui-palette-divider)' },
                  '& .wmde-markdown table tr:nth-of-type(2n)': { backgroundColor: `${TINT.neutralRowZebra} !important` },
                  '& .wmde-markdown table th, & .wmde-markdown table td': { borderColor: 'var(--mui-palette-divider)', color: 'var(--mui-palette-text-primary)' },
                  '& .wmde-markdown table th': { backgroundColor: TINT.neutralHeaderBg },
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
            <DialogActions sx={{ p: 0 }}>
              {isSimpleMode ? (
                // Simple mode: full-width strip [Reset | Connect · AutoPush | Go Expert]
                <Box sx={{ display: 'flex', alignItems: 'center', p: 1, width: '100%' }}>
                  {simpleActionsNode}
                </Box>
              ) : (
                // Expert / normal mode: left cluster + right close button.
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', justifyContent: 'space-between', p: 1, width: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {/* Edit button is hidden in simple mode — use Go Expert to access editing.
                        Use isSimpleMode (not simpleMode) so the button appears when the user
                        activated expert mode during a simple-URL session. */}
                    {!hideEditButton && !isSimpleMode ? (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={onRequestEdit}
                        sx={noteModeButtonMinWidth ? { minWidth: noteModeButtonMinWidth } : {}}
                      >
                        {editNoteLabel}
                      </Button>
                    ) : null}
                    {hasRecipeOverridesMarkers ? (
                      <>
                        <Button
                          size="small"
                          variant="outlined"
                          endIcon={<ExpandMoreIcon fontSize="small" />}
                          onClick={openViewRecipeOverridesMenu}
                          sx={{ whiteSpace: 'nowrap', px: 1.25 }}
                          aria-haspopup="true"
                          aria-controls={viewRecipeOverridesMenuOpen ? 'note-recipe-overrides-menu-view' : undefined}
                          aria-expanded={viewRecipeOverridesMenuOpen ? 'true' : undefined}
                        >
                          {t('noteDynamicOverridesMenu')}
                        </Button>
                        <Menu
                          id="note-recipe-overrides-menu-view"
                          anchorEl={viewRecipeOverridesMenuAnchor}
                          open={viewRecipeOverridesMenuOpen}
                          onClose={closeViewRecipeOverridesMenu}
                          slotProps={{ list: { dense: true }, transition: { onExited: handleViewRecipeOverridesMenuExited } }}
                        >
                          <MenuItem onClick={() => { queueViewRecipeOverridesMenuAction({ kind: 'reset' }) }}>
                            {t('noteDynamicOverridesResetDefaults')}
                          </MenuItem>
                          <MenuItem
                            onClick={() => {
                              queueViewRecipeOverridesMenuAction(
                                noteOverridesDisabled
                                  ? { kind: 'enable' }
                                  : { kind: 'disable', noteText: note ?? '' },
                              )
                            }}
                          >
                            {noteOverridesDisabled ? t('noteDynamicOverridesEnable') : t('noteDynamicOverridesDisable')}
                          </MenuItem>
                          {/* Save/load/delete the current selection as a reusable override set. */}
                          <DynamicOverridesPresetMenuItems controller={viewOverridesPresetController} />
                        </Menu>
                        {/* Dialogs live outside the menu so they survive the menu closing. */}
                        <DynamicOverridesPresetDialogs controller={viewOverridesPresetController} />
                      </>
                    ) : null}
                  </Box>
                  <Button onClick={animatedOnClose}>
                    {t('close')}
                  </Button>
                </Box>
              )}
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
            onClose={animatedOnClose}
            registerCommit={(fn) => { editCommitRef.current = fn }}
            onRequestView={onRequestView}
            onResetRecipeOverridesAnswers={handleResetRecipeOverridesAnswers}
            onOpenDisableRecipeOverridesDialog={openDisableRecipeOverridesDialog}
            noteOverridesDisabled={noteOverridesDisabled}
            onNoteOverridesDisabledChange={onNoteOverridesDisabledChange}
            recipes={recipes}
            metasets={metasets}
            safeguardRules={safeguardRules}
            recipeOverridesAnswers={recipeOverridesAnswers}
            safeguardOverridesAnswers={safeguardOverridesAnswers}
            onRecipeOverridesAnswersChange={onRecipeOverridesAnswersChange}
            onSafeguardOverridesAnswersChange={onSafeguardOverridesAnswersChange}
            markdownComponents={markdownComponents}
            allowElement={allowMarkdownElement}
            noteModeButtonMinWidth={noteModeButtonMinWidth}
            simpleActionsNode={simpleActionsNode}
          />
        )}
    </>
  )

  return (
    <NoteRenderContext value={contextValue}>
      {/* Publish the contrast-adapted syntax/note colour vars for the active scheme.
          GlobalStyles is global, so the vars reach the editor backdrop, view-mode
          markdown, and the EBNF popover regardless of where this mounts. */}
      <GlobalStyles styles={noteColorSchemeStyles} />
      {useFloatingPanel ? (
        // Floating fixed-position panel: no Modal backdrop, pointer events pass through to
        // elements outside the panel so the gear inspector stays fully interactive.
        // left/width are not set here — the position layout effect applies them as inline
        // styles so they can be updated frame-by-frame during drag/resize without re-renders.
        // role="dialog" exposes the same accessible-name pattern as the MUI Dialog branch;
        // aria-modal is intentionally omitted because the panel is non-modal (no focus trap, no backdrop).
        <Paper
          ref={panelRef}
          elevation={24}
          role="dialog"
          aria-labelledby={NOTE_DIALOG_TITLE_ID}
          onPointerMove={handlePanelPointerMove}
          onPointerUp={handlePanelPointerUp}
          sx={{
            position: 'fixed',
            top: drawerTopPx ?? 0,
            bottom: 0,
            zIndex: (theme) => theme.zIndex.modal,
            ...NOTE_DRAWER_PAPER_SX,
            // Authoritative width driven by panelWidth state. Without this the Paper has no width
            // constraint until the imperative layout effect runs, so a position:fixed panel sizes
            // itself to its (wide) content on mount/HMR — making it jump to full width. flexShrink:0
            // + boxSizing keep wide inner content (e.g. the dungeon-sim tables) from expanding it.
            // The layout effect / drag handlers still write inline width for frame-by-frame updates;
            // inline styles win over sx, so live resize is unaffected and this is just the floor.
            width: panelWidth,
            maxWidth: '100vw',
            flexShrink: 0,
            boxSizing: 'border-box',
            overscrollBehavior: 'contain',
          }}
        >
          {/* Left resize handle — only active when right-snapped (left edge is the free edge) */}
          <Box
            component="div"
            sx={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, zIndex: 1,
              cursor: panelSide === 'right' ? 'ew-resize' : 'default',
              pointerEvents: panelSide === 'right' ? 'auto' : 'none',
            }}
            onPointerDown={panelSide === 'right' ? (e) => handleResizePointerDown(e, 'left') : undefined}
          />
          {/* Right resize handle — only active when left-snapped (right edge is the free edge) */}
          <Box
            component="div"
            sx={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, zIndex: 1,
              cursor: panelSide === 'left' ? 'ew-resize' : 'default',
              pointerEvents: panelSide === 'left' ? 'auto' : 'none',
            }}
            onPointerDown={panelSide === 'left' ? (e) => handleResizePointerDown(e, 'right') : undefined}
          />
          {panelBody}
        </Paper>
      ) : (
        // Standard centered Dialog: used in single-column layout or simple (express) mode.
        // aria-labelledby wires the auto-id MUI generates to the same id the DialogTitle
        // carries; without it MUI v9 generates a mismatched id and the dialog has no name.
        <Dialog
          open
          onClose={handleDialogClose}
          maxWidth="lg"
          fullWidth
          aria-labelledby={NOTE_DIALOG_TITLE_ID}
          transitionDuration={noteDialogProps.transitionDuration}
          slotProps={{ paper: { ref: noteDialogProps.PaperProps.ref, sx: NOTE_DIALOG_PAPER_SX } }}
        >
          {panelBody}
        </Dialog>
      )}
      <Dialog open={Boolean(disableRecipeOverridesContext)} onClose={closeDisableRecipeOverridesDialog}>
        <DialogTitle>{t('noteDynamicOverridesDisableConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('noteDynamicOverridesDisableConfirmBody')}</Typography>
        </DialogContent>
        <DialogActions>
          {/* Use uniform styling so color does not imply priority. */}
          <Button {...disableConfirmButtonProps} onClick={closeDisableRecipeOverridesDialog}>{t('cancel')}</Button>
          <Button {...disableConfirmButtonProps} onClick={() => handleDisableRecipeOverridesConfirm(false)}>
            {t('noteDynamicOverridesDisableConfirmDisable')}
          </Button>
          <Button {...disableConfirmButtonProps} onClick={() => handleDisableRecipeOverridesConfirm(true)}>
            {t('noteDynamicOverridesDisableConfirmApply')}
          </Button>
        </DialogActions>
      </Dialog>
    </NoteRenderContext>
  )
}

// Per-domain global marker regexes (with `g`) for scanning marker char offsets in the draft.
// Order of matches === the `data-question-index` / `data-sg-question-index` the cards carry.
const RECIPE_MARKER_OFFSET_REGEX = new RegExp(`<!--\\s*(?:${QUESTION_MARKER_KEYWORD_PATTERN})\\b[\\s\\S]*?-->`, 'gi')
const SG_MARKER_OFFSET_REGEX = new RegExp(`<!--\\s*${NOTE_SAFEGUARD_OVERRIDES_MARKER_KEYWORD}\\b[\\s\\S]*?-->`, 'gi')

// Compute [markerIndex] → source char offset for one domain's markers in the draft.
function markerCharOffsets(draft: string, re: RegExp): number[] {
  const offsets: number[] = []
  re.lastIndex = 0
  for (const m of draft.matchAll(re)) offsets.push(m.index ?? 0)
  return offsets
}

// Find the pixel Y of a character offset inside the highlighted mirror `<pre>` (.w-md-editor-text-pre
// > code), which wraps identically to the textarea. Walks the code's text nodes to place a DOM
// Range at the offset and measures its top relative to the pre's scroll origin. Returns null if
// the offset can't be located (e.g. pre not yet rendered).
function charOffsetEditorY(codeEl: HTMLElement, offset: number): number | null {
  const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT)
  let acc = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    // Use `>` (not `>=`) so an offset landing exactly at a node boundary is measured on the
    // NEXT node where it has a following character (a 1-char range needs a char to its right).
    if (acc + len > offset || (node === null)) {
      const range = document.createRange()
      const local = Math.max(0, Math.min(offset - acc, len))
      // Select ONE character starting at the offset. A collapsed range returns an empty
      // getClientRects(), which previously made every marker measure as a constant — select a
      // real character so the rect has a height/top. Clamp so we never exceed the node length.
      const endLocal = Math.min(local + 1, len)
      range.setStart(node, Math.min(local, endLocal))
      range.setEnd(node, endLocal)
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
      const preRect = codeEl.getBoundingClientRect()
      // rect.top is viewport-relative; subtract the code's viewport top to get the offset
      // from the content origin (which scrolls with the textarea), so the result is scroll-invariant.
      // SCALING: #root can carry CSS `zoom` (useAutoSideBySideZoom in side-by-side mode), so
      // getBoundingClientRect returns VISUAL px (×zoom) while scrollTop/scrollHeight stay LAYOUT px.
      // Divide by a self-calibrated zoom (offsetWidth is layout, rect width is visual) so this Y is in
      // LAYOUT px and can be compared/assigned against scrollTop directly. Falls back to 1 unzoomed.
      const zoom = codeEl.offsetWidth ? preRect.width / codeEl.offsetWidth : 1
      return (rect.top - preRect.top) / (zoom || 1)
    }
    acc += len
    node = walker.nextNode() as Text | null
  }
  return null
}

// Anchor pair: scrollTop of each pane at which a given marker's top reaches the pane top.
type ScrollAnchor = { editorY: number; previewY: number }

// Custom editor↔preview scroll sync keyed on marker positions (replaces MDEditor's broken
// height-ratio sync, which the tall interactive cards defeat). Rebuilds anchors when `draft`
// changes and on resize; interpolates one pane's scrollTop from the other across anchors.
function useEditorPreviewScrollSync(
  editWrapRef: React.RefObject<HTMLDivElement | null>,
  draft: string,
  // External suppression: while .current is true, sync is paused. The reveal-on-click uses this
  // so its programmatic editor scroll isn't immediately overridden by the click's preview scroll.
  suppressRef: React.RefObject<boolean>,
): void {
  // Guard against the feedback loop: when we set one pane programmatically, skip the scroll
  // event it triggers on the other.
  const syncingRef = useRef(false)
  // Latest anchors, sorted by editorY ascending. Recomputed lazily and on triggers.
  const anchorsRef = useRef<ScrollAnchor[]>([])

  useEffect(() => {
    const root = editWrapRef.current
    if (!root) return undefined
    // The editor's scroll container is `.w-md-editor-area` (overflow:auto); `.w-md-editor-text`
    // itself only grows (min-height:100%) and the textarea is overflow:hidden — so listening on
    // those never sees a scroll. The preview scrolls on `.w-md-editor-preview`.
    const textScroller = root.querySelector<HTMLElement>('.w-md-editor-area')
    const preview = root.querySelector<HTMLElement>('.w-md-editor-preview')
    if (!textScroller || !preview) return undefined

    // (Re)build anchor pairs from current DOM + draft offsets.
    const rebuild = () => {
      const code = textScroller.querySelector<HTMLElement>('.w-md-editor-text-pre code')
      if (!code) { anchorsRef.current = []; return }
      const recipeOffsets = markerCharOffsets(draft, RECIPE_MARKER_OFFSET_REGEX)
      const sgOffsets = markerCharOffsets(draft, SG_MARKER_OFFSET_REGEX)
      const anchors: ScrollAnchor[] = []
      // previewY is measured relative to the preview's content origin via bounding rects, so it
      // is robust to intermediate positioned wrappers (offsetTop would be relative to those).
      const previewRect = preview.getBoundingClientRect()
      // SCALING: same #root `zoom` caveat as charOffsetEditorY — getBoundingClientRect is VISUAL px
      // but preview.scrollTop is LAYOUT px. Convert the viewport-rect delta to layout px (÷zoom) before
      // adding scrollTop, so previewY stays in the same coordinate space as the scrollTop we read/set.
      const previewZoom = preview.offsetWidth ? previewRect.width / preview.offsetWidth : 1
      // Each preview card maps to a marker; pair by domain + marker index.
      const cards = preview.querySelectorAll<HTMLElement>('[data-question-index],[data-sg-question-index]')
      cards.forEach((card) => {
        const recipeIdx = card.getAttribute('data-question-index')
        const sgIdx = card.getAttribute('data-sg-question-index')
        const offset = recipeIdx != null
          ? recipeOffsets[Number(recipeIdx)]
          : sgIdx != null ? sgOffsets[Number(sgIdx)] : undefined
        if (offset == null) return
        const editorY = charOffsetEditorY(code, offset)
        if (editorY == null) return
        // Card top relative to preview content origin = (card viewport top − preview viewport top) ÷ zoom + current preview scroll.
        const previewY = (card.getBoundingClientRect().top - previewRect.top) / (previewZoom || 1) + preview.scrollTop
        anchors.push({ editorY, previewY })
      })
      // Anchor both panes' tops together so editor-scroll 0 ↔ preview-scroll 0. Without this, content
      // before the first marker is extrapolated off the first segment's slope and the editor top maps
      // the preview ~250px down (the markers don't start at the very top of the note).
      anchors.push({ editorY: 0, previewY: 0 })
      anchors.sort((a, b) => a.editorY - b.editorY)
      anchorsRef.current = anchors
    }

    // Piecewise-linear map a value from one axis to the other across sorted anchors.
    const interpolate = (value: number, from: 'editorY' | 'previewY', to: 'editorY' | 'previewY'): number | null => {
      const anchors = anchorsRef.current
      if (anchors.length === 0) return null
      // Single anchor → constant offset shift.
      if (anchors.length === 1) return value - anchors[0]![from] + anchors[0]![to]
      // Below the first / above the last anchor → extrapolate from the nearest segment.
      let lo = 0
      for (let i = 0; i < anchors.length - 1; i++) {
        if (value >= anchors[i]![from]) lo = i
      }
      const a = anchors[lo]!
      const b = anchors[lo + 1]!
      const span = b[from] - a[from]
      const t = span === 0 ? 0 : (value - a[from]) / span
      return a[to] + t * (b[to] - a[to])
    }

    const clamp = (v: number, el: HTMLElement) => Math.max(0, Math.min(v, el.scrollHeight - el.clientHeight))

    // Drive the other pane from the scrolled one; guard the resulting echo event.
    const sync = (source: 'editor' | 'preview') => {
      if (syncingRef.current || suppressRef.current) return
      if (anchorsRef.current.length === 0) rebuild()
      const target = source === 'editor'
        ? interpolate(textScroller.scrollTop, 'editorY', 'previewY')
        : interpolate(preview.scrollTop, 'previewY', 'editorY')
      if (target == null) return
      syncingRef.current = true
      if (source === 'editor') preview.scrollTop = clamp(target, preview)
      else textScroller.scrollTop = clamp(target, textScroller)
      // Release the guard after the echo scroll event has fired.
      requestAnimationFrame(() => { syncingRef.current = false })
    }

    const onEditorScroll = () => sync('editor')
    const onPreviewScroll = () => sync('preview')
    textScroller.addEventListener('scroll', onEditorScroll, { passive: true })
    preview.addEventListener('scroll', onPreviewScroll, { passive: true })
    // Rebuild anchors when either pane resizes (font, wrap, fullscreen, window).
    const ro = new ResizeObserver(() => { anchorsRef.current = [] })
    ro.observe(textScroller)
    ro.observe(preview)
    // Initial build on next frame (preview cards render async).
    const raf = requestAnimationFrame(rebuild)

    return () => {
      textScroller.removeEventListener('scroll', onEditorScroll)
      preview.removeEventListener('scroll', onPreviewScroll)
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [editWrapRef, draft, suppressRef])
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
  onResetRecipeOverridesAnswers,
  onOpenDisableRecipeOverridesDialog,
  noteOverridesDisabled,
  onNoteOverridesDisabledChange,
  recipes,
  metasets,
  safeguardRules,
  recipeOverridesAnswers,
  safeguardOverridesAnswers,
  onRecipeOverridesAnswersChange,
  onSafeguardOverridesAnswersChange,
  markdownComponents,
  allowElement,
  noteModeButtonMinWidth,
  simpleActionsNode,
}: {
  note: string
  t: ReturnType<typeof useI18n>['t']
  lang: string
  rehypePluginsSafe: Pluggable[]
  onChange: (value: string, options?: { mode?: 'edit' | 'clear' }) => void
  onClose: () => void
  registerCommit: (fn: () => void) => void
  onRequestView: () => void
  // Reset recipe overrides answers back to defaults.
  onResetRecipeOverridesAnswers: () => void
  // Open the disable-confirm dialog with a draft update hook.
  onOpenDisableRecipeOverridesDialog: (noteText: string) => void
  // Disable recipe overrides parsing without editing the note text.
  noteOverridesDisabled: boolean
  onNoteOverridesDisabledChange: (next: boolean) => void
  recipes: BuilderRecipe[]
  metasets: Metaset[]
  safeguardRules: SafeguardRule[]
  recipeOverridesAnswers: NoteRecipeOverridesAnswers
  safeguardOverridesAnswers: NoteSafeguardOverridesAnswers
  // Setters for the save/load override-set feature (load writes the live answers).
  onRecipeOverridesAnswersChange: React.Dispatch<React.SetStateAction<NoteRecipeOverridesAnswers>>
  onSafeguardOverridesAnswersChange: React.Dispatch<React.SetStateAction<NoteSafeguardOverridesAnswers>>
  markdownComponents: MarkdownComponentMap
  allowElement: MarkdownAllowElement
  // Match the view/edit button widths to keep the action row stable.
  noteModeButtonMinWidth: number | undefined
  // When set, replaces the Close button in the action row (used in express simple mode).
  simpleActionsNode?: React.ReactNode
}) {
  const editWrapRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<RefMDEditor | null>(null)
  // Target element for the DSL error overlay portal — the `.w-md-editor-text`
  // container, which has position:relative and the correct padding context.
  const [editorTextEl, setEditorTextEl] = useState<HTMLElement | null>(null)
  // Transient highlight rect (in `.w-md-editor-text` content coords) flashed over an option's
  // DSL when its preview control is clicked. null when no pulse is active. Bumping `key`
  // restarts the fade animation on repeat clicks.
  const [revealPulse, setRevealPulse] = useState<{ top: number; height: number; scrollTo: number; key: number } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const theme = useTheme()
  const { colorScheme } = useColorScheme()
  const editorBg = (theme.vars?.palette.background.default ?? theme.palette.background.default)
  // Anchor for the EBNF reference popover; null when closed.
  const [ebnfAnchorEl, setEbnfAnchorEl] = useState<HTMLElement | null>(null)
  // Stable close handler so useContextMenuPaperGuard dependency stays fixed.
  const handleEbnfPopoverClose = React.useCallback(() => setEbnfAnchorEl(null), [])
  // Wires the standard close button + outside-click cleanup used by all context menus.
  const { contextMenuGuard: ebnfPopoverGuard, menuRef: ebnfPopoverMenuRef } = useContextMenuPaperGuard({
    open: Boolean(ebnfAnchorEl),
    onClose: handleEbnfPopoverClose,
  })
  // Captured each render so the popover's Insert button can call MDEditor's executeCommand.
  const executeRecipeOverridesSampleRef = useRef<(() => void) | null>(null)
  // Captured each render so the popover's safeguard-overrides Insert button can trigger it.
  const executeSafeguardOverridesSampleRef = useRef<(() => void) | null>(null)
  // Anchor the recipe overrides menu for edit-mode actions.
  const [editRecipeOverridesMenuAnchor, setEditRecipeOverridesMenuAnchor] = useState<HTMLElement | null>(null)
  // Track whether the edit-mode recipe overrides menu is open.
  const editRecipeOverridesMenuOpen = Boolean(editRecipeOverridesMenuAnchor)
  // Queue the edit-mode action so we can apply it after the menu closes.
  const [editRecipeOverridesMenuAction, setEditRecipeOverridesMenuAction] = useState<RecipeOverridesMenuAction | null>(null)
  // Open the edit-mode recipe overrides menu at the clicked button.
  const openEditRecipeOverridesMenu = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setEditRecipeOverridesMenuAnchor(event.currentTarget)
  }, [])
  // Close the edit-mode recipe overrides menu without taking action.
  const closeEditRecipeOverridesMenu = React.useCallback(() => {
    setEditRecipeOverridesMenuAnchor(null)
  }, [])
  // Queue an edit-mode action, then close the menu to trigger exit cleanup.
  const queueEditRecipeOverridesMenuAction = React.useCallback((action: RecipeOverridesMenuAction) => {
    // Store the action before closing so exit cleanup can replay it.
    setEditRecipeOverridesMenuAction(action)
    // Closing the menu first prevents stuck backdrops.
    closeEditRecipeOverridesMenu()
  }, [closeEditRecipeOverridesMenu])
  // Re-enable parsing when a saved override set is loaded from the edit-mode menu.
  const handleEnableEditRecipeOverrides = React.useCallback(() => {
    onNoteOverridesDisabledChange(false)
  }, [onNoteOverridesDisabledChange])
  const [draft, setDraft] = useState<string>(note ?? '')
  // Controller for the edit-mode save/load/delete override-set feature (acts on the live draft).
  const editOverridesPresetController = useDynamicOverridesPresetController({
    note: draft ?? '',
    recipeAnswers: recipeOverridesAnswers,
    onRecipeAnswersChange: onRecipeOverridesAnswersChange,
    safeguardAnswers: safeguardOverridesAnswers,
    onSafeguardAnswersChange: onSafeguardOverridesAnswersChange,
    onEnableOverrides: handleEnableEditRecipeOverrides,
    onCloseMenu: closeEditRecipeOverridesMenu,
  })

  // While true, the scroll-sync is paused — the reveal-on-click sets this so its programmatic
  // editor scroll isn't immediately overridden by the preview scroll the click itself causes.
  const revealSuppressRef = useRef(false)
  // Keep the editor and preview panes scroll-synced by marker position (MDEditor's built-in
  // height-ratio sync is disabled below via enableScroll={false}, since the tall cards defeat it).
  useEditorPreviewScrollSync(editWrapRef, draft, revealSuppressRef)

  // Collect DSL diagnostics (error squiggles) once per draft change.
  const dslDiags = useMemo(() => collectOverridesDiagnostics(draft), [draft])

  // Resolve the MDEditor text container once after mount so we can portal
  // the error overlay into it.  The element is stable for the component
  // lifetime — MDEditor does not replace it on re-render.
  useEffect(() => {
    // The .w-md-editor-text DOM node is created by MDEditor on first paint and
    // cannot be queried before mount, so useState initialisation here is correct.
    const root = editWrapRef.current
    const el = root?.querySelector<HTMLElement>('.w-md-editor-text') ?? null
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-initialize-state, @eslint-react/set-state-in-effect
    setEditorTextEl(el)
  }, [])

  // Track recipe overrides changes so the view-mode button can signal edits.
  const baseRecipeOverridesSignature = useMemo(
    () => buildNoteRecipeOverridesSignature(note ?? ''),
    [note],
  )
  const draftRecipeOverridesSignature = useMemo(
    () => buildNoteRecipeOverridesSignature(draft ?? ''),
    [draft],
  )
  // Track safeguard overrides changes in parallel so the badge fires for both DSLs.
  const baseSafeguardOverridesSignature = useMemo(
    () => buildNoteSafeguardOverridesSignature(note ?? ''),
    [note],
  )
  const draftSafeguardOverridesSignature = useMemo(
    () => buildNoteSafeguardOverridesSignature(draft ?? ''),
    [draft],
  )
  // Flag when questions were added/removed/changed in the draft (either DSL).
  const recipeOverridesChanged = baseRecipeOverridesSignature !== draftRecipeOverridesSignature
    || baseSafeguardOverridesSignature !== draftSafeguardOverridesSignature
  // Keep warning badge tooltips attached to the badge itself.
  const renderWarningBadgeContent = React.useCallback((tooltip: string, disabled: boolean) => (
    <MarkdownTooltip markdown={tooltip} disableHoverListener={disabled}>
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        !
      </Box>
    </MarkdownTooltip>
  ), [])
  // Disable view mode when the draft is empty.
  const draftIsEmpty = !draft.trim()
  const baseContext = useNoteRenderContext()
  // Resolve recipe markers inside the editor preview.
  const editorMarkerResolutions = useMemo(() => buildRecipeMarkerResolutions(draft ?? '', recipes), [draft, recipes])
  // Resolve safeguard markers inside the editor preview.
  const editorSafeguardMarkerResolutions = useMemo(
    () => buildSafeguardMarkerResolutions(draft ?? '', safeguardRules),
    [draft, safeguardRules],
  )
  // Resolve recipe overrides markers without making them interactive.
  const editorRecipeOverridesResolutions = useMemo(
    () => buildRecipeOverridesMarkerResolutions(draft ?? '', recipeOverridesAnswers),
    [recipeOverridesAnswers, draft],
  )
  // Track whether the draft still contains recipe overrides markers.
  const recipeOverridesSignature = useMemo(
    () => buildNoteRecipeOverridesSignature(draft ?? ''),
    [draft],
  )
  const hasRecipeOverridesMarkers = recipeOverridesSignature !== '[]'
  // Reset answers without mutating the draft text.
  const handleResetRecipeOverrides = React.useCallback(() => {
    onNoteOverridesDisabledChange(false)
    onResetRecipeOverridesAnswers()
  }, [onNoteOverridesDisabledChange, onResetRecipeOverridesAnswers])
  const handleEnableRecipeOverrides = React.useCallback(() => {
    onNoteOverridesDisabledChange(false)
  }, [onNoteOverridesDisabledChange])
  // Apply the queued edit-mode action after the menu finishes closing.
  const handleEditRecipeOverridesMenuExited = React.useCallback(() => {
    // Run the action only once when the menu has fully unmounted.
    runRecipeOverridesMenuAction(
      editRecipeOverridesMenuAction,
      {
        onReset: handleResetRecipeOverrides,
        onEnable: handleEnableRecipeOverrides,
        onDisable: onOpenDisableRecipeOverridesDialog,
      },
      () => setEditRecipeOverridesMenuAction(null),
    )
  }, [
    editRecipeOverridesMenuAction,
    handleEnableRecipeOverrides,
    handleResetRecipeOverrides,
    onOpenDisableRecipeOverridesDialog,
  ])
  // Ignore answer updates in edit mode so markers stay read-only.
  const ignoreRecipeOverridesAnswerChange = React.useCallback((
    _question: NoteQuestionDefinition,
    _nextAnswer: string[],
    _preferredId?: string,
    _removedId?: string,
  ) => {}, [])
  const ignoreSafeguardOverridesAnswerChange = React.useCallback((
    _question: SafeguardNoteQuestionDefinition,
    _nextAnswer: string[],
    _preferredId?: string,
    _removedId?: string,
  ) => {}, [])
  // Resolve safeguard overrides markers from the draft for the editor preview.
  const editorSafeguardOverridesResolution = useMemo(
    () => resolveNoteSafeguardOverridesTags(draft ?? '', safeguardOverridesAnswers),
    [draft, safeguardOverridesAnswers],
  )
  const editorSafeguardOverridesResolutions = useMemo(() => {
    const map = new Map<number, SafeguardNoteQuestionDefinition>()
    editorSafeguardOverridesResolution.questions.forEach((q) => map.set(q.index, q))
    return map
  }, [editorSafeguardOverridesResolution])
  // Global optionId → {token,label} lookup across ALL recipe + safeguard questions, so the
  // option-info tooltip can resolve a FORCES reference (an option id in another question)
  // to that target's unique token and answer label. Reused labels (Yes/No/Strict across many
  // questions) make the token the only disambiguating identifier.
  const editorOptionLookup = useMemo(() => {
    const map = new Map<string, { token: string; label: string }>()
    editorRecipeOverridesResolutions.forEach((q) => q.options?.forEach((o) => map.set(o.id, { token: o.token, label: o.label })))
    editorSafeguardOverridesResolutions.forEach((q) => q.options?.forEach((o) => map.set(o.id, { token: o.token, label: o.label })))
    return map
  }, [editorRecipeOverridesResolutions, editorSafeguardOverridesResolutions])
  // Scroll an option's DSL into view in the editor and flash a highlight over JUST that range.
  // Used when a preview control is clicked. We measure the range's pixel rect from the
  // highlighted mirror `<pre>` (which wraps identically to the textarea), scroll the editor's
  // scroll container so the range is comfortably visible, then render a transient highlight
  // box positioned over the range (textareas can't style a sub-range, so we overlay one).
  const revealOptionSource = React.useCallback((from: number, to: number) => {
    const root = editWrapRef.current
    if (!root) return
    const area = root.querySelector<HTMLElement>('.w-md-editor-area')
    const textEl = root.querySelector<HTMLElement>('.w-md-editor-text')
    const code = root.querySelector<HTMLElement>('.w-md-editor-text-pre code')
    if (!area || !textEl || !code) return
    // NOTE: we deliberately do NOT touch the textarea selection/focus here. Moving the caret (or
    // letting the click focus the textarea) makes the browser scroll the editor to the caret, which
    // both jumps the editor unexpectedly and (via sync) jumps the preview. The click's mousedown is
    // preventDefault-ed in the delegated listener below so focus never moves; we just scroll.
    // Measure top of the range start and bottom of the range end, in content coords relative
    // to the `.w-md-editor-text` element (which is position:relative and hosts the overlay).
    const topY = charOffsetEditorY(code, from)
    const endY = charOffsetEditorY(code, to)
    if (topY == null) return
    // charOffsetEditorY returns the offset from the pre/code content origin. The text element
    // adds its 10px padding; the pre sits at that padded origin, so the overlay (also inside
    // the padded text element) shares the same coordinate space — no padding adjustment needed.
    const lineH = code.getBoundingClientRect().height > 0
      ? parseFloat(getComputedStyle(code).lineHeight) || 18
      : 18
    const height = endY != null && endY > topY ? endY - topY + lineH : lineH
    // Scroll the range into view within the editor's scroll container, centring it a bit.
    const target = Math.max(0, topY - area.clientHeight / 3)
    const clamped = Math.min(target, area.scrollHeight - area.clientHeight)
    // Suppress sync, then hand the scroll + overlay to a layout effect. We do NOT scroll here:
    // setRevealPulse re-renders, and MDEditor's TextArea resets `.w-md-editor-area` scrollTop to
    // its (0) context value on every render — so a scroll set here is immediately wiped. Applying
    // it in useLayoutEffect AFTER the commit wins the race.
    revealSuppressRef.current = true
    setRevealPulse((prev) => ({ top: topY, height, scrollTo: clamped, key: (prev?.key ?? 0) + 1 }))
  }, [])
  // Apply the reveal scroll + manage the suppress window AFTER the pulse render commits, so
  // MDEditor's per-render scrollTop reset (to 0) doesn't wipe it. Re-assert once more on the next
  // frame in case a late reset lands, then release the sync suppression.
  React.useLayoutEffect(() => {
    if (!revealPulse) return undefined
    const area = editWrapRef.current?.querySelector<HTMLElement>('.w-md-editor-area')
    if (!area) return undefined
    // Re-assert the target scroll over several frames and keep sync suppressed throughout. The
    // textarea may (programmatically) gain focus shortly after the click and the browser then
    // scrolls the editor to its caret — re-pinning scrollTop for a few frames overrides that, and
    // the suppression prevents the transient from syncing the preview ("both sides jump"). 6 frames
    // (~100ms) comfortably covers the focus-scroll without a perceptible hold.
    let frame = 0
    let raf = 0
    const pin = () => {
      area.scrollTop = revealPulse.scrollTo
      if (++frame < 6) { raf = requestAnimationFrame(pin) }
      else { revealSuppressRef.current = false }
    }
    pin()
    return () => cancelAnimationFrame(raf)
  }, [revealPulse])
  // Clear the pulse overlay once its fade animation has run.
  useEffect(() => {
    if (!revealPulse) return undefined
    const id = window.setTimeout(() => setRevealPulse(null), 1100)
    return () => window.clearTimeout(id)
  }, [revealPulse])
  // Delegated click handler on the preview: clicking any override control reveals its DSL.
  // Delegation (vs a per-control onClick) is reliable here — disabled controls swallow their own
  // click events and the tooltip clones the wrapper, both of which defeat a React onClick. We read
  // the source span off the nearest `[data-reveal-from]` ancestor stamped on each control wrapper.
  useEffect(() => {
    const root = editWrapRef.current
    if (!root) return undefined
    // mousedown.preventDefault() is what actually stops focus from moving to the textarea — a
    // click-phase preventDefault is too late (focus already shifted). Without this, clicking a
    // control focuses the editor textarea, the browser scrolls it to the caret, and that scroll
    // syncs the preview — i.e. "clicking jumps both sides". Capture phase so it runs first.
    const onMouseDown = (e: MouseEvent) => {
      const hit = (e.target as HTMLElement | null)?.closest('[data-reveal-from]')
      if (hit) e.preventDefault()
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      const hit = target?.closest<HTMLElement>('[data-reveal-from]')
      if (!hit) return
      const from = Number(hit.getAttribute('data-reveal-from'))
      const to = Number(hit.getAttribute('data-reveal-to'))
      if (!Number.isFinite(from) || !Number.isFinite(to)) return
      revealOptionSource(from, to)
    }
    root.addEventListener('mousedown', onMouseDown, true)
    root.addEventListener('click', onClick)
    return () => {
      root.removeEventListener('mousedown', onMouseDown, true)
      root.removeEventListener('click', onClick)
    }
  }, [revealOptionSource])

  const editorContextValue = useMemo<NoteRenderContextValue>(
    () => ({
      ...baseContext,
      markerResolutions: editorMarkerResolutions,
      safeguardMarkerResolutions: editorSafeguardMarkerResolutions,
      safeguardRules,
      recipeOverridesResolutions: editorRecipeOverridesResolutions,
      recipeOverridesEditable: false,
      onRecipeOverridesAnswerChange: ignoreRecipeOverridesAnswerChange,
      // Show safeguard-overrides question cards in edit mode as read-only previews.
      safeguardOverridesResolutions: editorSafeguardOverridesResolutions,
      safeguardOverridesEditable: false,
      onSafeguardOverridesAnswerChange: ignoreSafeguardOverridesAnswerChange,
      isEditorPreview: true,
      onRevealOptionSource: revealOptionSource,
      optionLookup: editorOptionLookup,
    }),
    [
      baseContext,
      editorMarkerResolutions,
      editorSafeguardMarkerResolutions,
      editorRecipeOverridesResolutions,
      safeguardRules,
      ignoreRecipeOverridesAnswerChange,
      editorSafeguardOverridesResolutions,
      ignoreSafeguardOverridesAnswerChange,
      revealOptionSource,
      editorOptionLookup,
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

  const recipeCommand = useMemo<ICommand>(() => ({
    name: 'insert-recipes',
    keyCommand: 'insert-recipes',
    groupName: 'note-inserts',
    // Toolbar tooltips should surface the localized insert label.
    buttonProps: { 'aria-label': t('noteInsertRecipes'), title: t('noteInsertRecipes') },
    icon: <LocalOfferIcon fontSize="small" />,
    execute: (state, api) => {
      if (!recipes.length) return
      const text = state.text ?? ''
      const allIds = recipes.map((_, idx) => idx + 1)
      const usedIds = collectRecipeIds(text, recipes)
      const missing = allIds.filter((id) => !usedIds.has(id))
      const markerIds = missing.length ? missing : allIds
      if (!markerIds.length) return
      const { block, cursorIndex } = buildRecipeMarkerBlock(markerIds)
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block, cursorIndex)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [recipes, setDraft, t])

  const safeguardCommand = useMemo<ICommand>(() => ({
    name: 'insert-safeguards',
    keyCommand: 'insert-safeguards',
    groupName: 'note-inserts',
    // Keep-unique markers stay discoverable with a dedicated insert label.
    buttonProps: { 'aria-label': t('noteInsertSafeguards'), title: t('noteInsertSafeguards') },
    icon: <StarsIcon fontSize="small" />,
    execute: (state, api) => {
      if (!safeguardRules.length) return
      const text = state.text ?? ''
      const allIds = safeguardRules.map((_, idx) => idx + 1)
      const usedIds = collectSafeguardIds(text, safeguardRules)
      const missing = allIds.filter((id) => !usedIds.has(id))
      const markerIds = missing.length ? missing : allIds
      if (!markerIds.length) return
      const { block, cursorIndex } = buildSafeguardMarkerBlock(markerIds)
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block, cursorIndex)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [safeguardRules, setDraft, t])

  const recipeOverridesSampleTooltipContent = useMemo(() => {
    // Build the shared EBNF text for the tooltip.
    const ebnfText = buildRecipeOverridesEbnfText()
    // Render the tooltip: EBNF uses the minimal ebnf grammar; the example uses
    // dynamic-overrides so DSL keywords carry the same colors as in the editor backdrop.
    return (
      <Box sx={RECIPE_OVERRIDES_TOOLTIP_WRAP_SX}>
        <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
          {RECIPE_OVERRIDES_EBNF_HEADER}
        </Typography>
        {renderPrismHighlighted(ebnfText, 'ebnf', RECIPE_OVERRIDES_TOOLTIP_CODE_SX)}
        <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
          {RECIPE_OVERRIDES_TOOLTIP_EXAMPLE_HEADER}
        </Typography>
        {renderPrismHighlighted(RECIPE_OVERRIDES_TOOLTIP_EXAMPLE_TEXT, 'dynamic-overrides', RECIPE_OVERRIDES_TOOLTIP_CODE_SX)}
      </Box>
    )
  }, [])

  const recipeOverridesSampleCommand = useMemo<ICommand>(() => ({
    name: RECIPE_OVERRIDES_SAMPLE_COMMAND_KEY,
    keyCommand: RECIPE_OVERRIDES_SAMPLE_COMMAND_KEY,
    groupName: 'note-inserts',
    // RecipeOverrides samples belong to the same insert block in the toolbar.
    buttonProps: { 'aria-label': t('noteInsertRecipeOverridesSample'), title: t('noteInsertRecipeOverridesSample') },
    icon: <QuizIcon fontSize="small" />,
    execute: (state, api) => {
      // Insert a sample block at the cursor for quick onboarding.
      const text = state.text ?? ''
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const block = buildRecipeOverridesSampleBlock()
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, block)
      const nextState = api.replaceSelection(insert)
      const nextPos = start + cursorOffset
      api.setSelectionRange({ start: nextPos, end: nextPos })
      setDraft(nextState.text)
    },
  }), [setDraft, t])

  // Safeguard-overrides EBNF tooltip content (memoized; does not depend on state).
  const safeguardOverridesTooltipContent = useMemo(() => (
    <Box sx={SAFEGUARD_OVERRIDES_TOOLTIP_WRAP_SX}>
      <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
        {SAFEGUARD_OVERRIDES_EBNF_HEADER}
      </Typography>
      {renderPrismHighlighted(buildSafeguardOverridesEbnfText(), 'ebnf', SAFEGUARD_OVERRIDES_TOOLTIP_CODE_SX)}
      <Typography variant="subtitle2" component="div" sx={{ fontWeight: 600 }}>
        {SAFEGUARD_OVERRIDES_TOOLTIP_EXAMPLE_HEADER}
      </Typography>
      {renderPrismHighlighted(SAFEGUARD_OVERRIDES_TOOLTIP_EXAMPLE_TEXT, 'dynamic-overrides', SAFEGUARD_OVERRIDES_TOOLTIP_CODE_SX)}
    </Box>
  ), [])

  // Toolbar command that inserts a ready-to-edit safeguard-overrides sample block.
  const safeguardOverridesSampleCommand = useMemo<ICommand>(() => ({
    name: SAFEGUARD_OVERRIDES_SAMPLE_COMMAND_KEY,
    keyCommand: SAFEGUARD_OVERRIDES_SAMPLE_COMMAND_KEY,
    groupName: 'note-inserts',
    buttonProps: { 'aria-label': t('noteInsertSafeguardOverridesSample'), title: t('noteInsertSafeguardOverridesSample') },
    icon: <StarsIcon fontSize="small" />,
    execute: (state, api) => {
      const text = state.text ?? ''
      const start = state.selection?.start ?? 0
      const end = state.selection?.end ?? start
      const { insert, cursorOffset } = computeBlockInsertion(text, start, end, SAFEGUARD_OVERRIDES_SAMPLE_TEXT)
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
  // Synced via effect so we never write to a ref during render.
  const flushRef = useRef<() => void>(() => {
    try { onChange(draft, { mode: 'edit' }) } catch {}
  })
  useEffect(() => {
    flushRef.current = () => {
      try { onChange(draft, { mode: 'edit' }) } catch {}
    }
  }, [draft, onChange])

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
              style={{ width: 18, height: 18, borderRadius: 3, border: '1px solid var(--mui-palette-divider)', background: 'transparent', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
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
      recipeCommand,
      safeguardCommand,
      metasetCommand,
      recipeOverridesSampleCommand,
    ]
    // If there is no divider after the title group, add a trailing divider manually.
    if (idxDividerAfterTitle < 0 && idxLink >= 0) {
      noteInsertBlock.push(commands.divider)
    }
    withNoteInserts.splice(insertNoteAt, 0, ...noteInsertBlock)
    return withNoteInserts
  }, [
    colorCommand,
    recipeCommand,
    safeguardCommand,
    metasetCommand,
    recipeOverridesSampleCommand,
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
          // MUI default overflowY:auto would add a second scrollbar; inner editor handles scrolling.
          overflow: 'hidden',
        }}
      >
        {/* Match the markdown editor chrome to the dark preview so text stays legible in edit mode. */}
        <Box
          ref={editWrapRef}
          data-allow-select={1 as const}
          data-allow-context={1 as const}
          data-color-mode={colorScheme ?? 'dark'}
          sx={{
            // Stretch the editor shell to fill the dialog body.
            flex: 1,
            minHeight: 0,
            // position:relative scoped to non-fullscreen only — applying it
            // unconditionally would override the position:fixed that MDEditor
            // sets on .w-md-editor-fullscreen, breaking the fullscreen toggle.
            '& .w-md-editor:not(.w-md-editor-fullscreen)': { position: 'relative' },
            '& .w-md-editor': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              backgroundColor: `${editorBg} !important`,
              color: (t) => `${t.vars?.palette.text.primary ?? t.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`,
              lineHeight: '1.7 !important',
              backgroundColor: `${editorBg} !important`,
              color: (t) => `${t.vars?.palette.text.primary ?? t.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text-pre': {
              // Match the textarea font sizing so highlights overlay 1:1.
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`,
              lineHeight: '1.7 !important',
              backgroundColor: `${editorBg} !important`,
              color: (t) => `${t.vars?.palette.text.primary ?? t.palette.text.primary} !important`,
            },
            '& .w-md-editor .w-md-editor-text-pre code': { fontSize: `${FONT_SIZE_MARKDOWN_PX}px !important`, lineHeight: '1.7 !important' },
            '& .w-md-editor .w-md-editor-text-input': {
              // Keep the input sizing consistent with the pre tag.
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              lineHeight: 1.7,
              backgroundColor: 'transparent',
              color: 'inherit',
              borderColor: (t) => t.vars?.palette.divider ?? t.palette.divider,
              caretColor: (t) => t.vars?.palette.text.primary ?? t.palette.text.primary,
            },
            '& .w-md-editor .w-md-editor-content': {
              // Keep sizing controlled by the editor height prop to avoid desync.
              backgroundColor: `${editorBg} !important`,
            },
            '& .w-md-editor .w-md-editor-preview': {
              // Preserve default preview layout so overlays align with selections.
              backgroundColor: `${editorBg} !important`,
              color: (t) => `${t.vars?.palette.text.primary ?? t.palette.text.primary} !important`,
            },
            '& .wmde-markdown': {
              fontSize: `${FONT_SIZE_MARKDOWN_PX}px`,
              lineHeight: 1.7,
              color: (theme) => `${(theme.vars?.palette.text.primary ?? theme.palette.text.primary)} !important`,
            },
            '& .wmde-markdown img': { backgroundColor: 'transparent' },
            // Override WMDE hardcoded table colors with MUI CSS vars so custom themes apply.
            '& .wmde-markdown table': { borderColor: 'var(--mui-palette-divider)' },
            '& .wmde-markdown table tr': { backgroundColor: 'var(--mui-palette-background-paper) !important', borderTopColor: 'var(--mui-palette-divider)' },
            '& .wmde-markdown table tr:nth-of-type(2n)': { backgroundColor: `${TINT.neutralRowZebra} !important` },
            '& .wmde-markdown table th, & .wmde-markdown table td': { borderColor: 'var(--mui-palette-divider)', color: 'var(--mui-palette-text-primary)' },
            '& .wmde-markdown table th': { backgroundColor: TINT.neutralHeaderBg },
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
            // Error-span styles are inline on the span elements themselves —
            // emotion-scoped sx rules may not reach React portal targets reliably.
            '& .w-md-editor-text': { position: 'relative' },
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
          {/* NoteRenderContext wraps the editor so toolbar commands can read note context. */}
          <NoteRenderContext value={editorContextValue}>
              <MDEditor
                ref={editorRef}
                value={draft}
                onChange={(v) => setDraft(v ?? '')}
                // Force the editor to fill the dialog body, avoiding the 200px default.
                height="100%"
                // Disable MDEditor's built-in height-ratio scroll sync; the tall interactive
                // cards make that mapping wrong. useEditorPreviewScrollSync replaces it with
                // marker-anchored sync.
                enableScroll={false}
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
                      const isRecipeOverridesSample = command?.keyCommand === RECIPE_OVERRIDES_SAMPLE_COMMAND_KEY
                      // Capture execute so the EBNF popover's Insert buttons can trigger them without MDEditor state.
                      // The safeguard-overrides command is not in the toolbar; use the same executeCommand captured
                      // here to drive it from the EBNF popover button without needing a dedicated toolbar entry.
                      if (isRecipeOverridesSample) {
                        const cmd = command as ICommand
                        executeRecipeOverridesSampleRef.current = () => executeCommand?.(cmd, cmd.groupName)
                        const safeguardCmd = safeguardOverridesSampleCommand as ICommand
                        executeSafeguardOverridesSampleRef.current = () => executeCommand?.(safeguardCmd, safeguardCmd.groupName)
                      }
                      return (
                        // MarkdownTooltip keeps every toolbar command consistent (some strings contain Markdown tokens already).
                        <MarkdownTooltip placement="bottom" markdown={label}>
                          <button
                            type="button"
                            aria-label={label || undefined}
                            disabled={Boolean(disabled)}
                            onClick={(evn) => {
                              evn.stopPropagation()
                              if (isRecipeOverridesSample) {
                                // Toggle the EBNF reference popover; insert is triggered from inside it.
                                const target = evn.currentTarget
                                setEbnfAnchorEl((prev) => prev ? null : target)
                              } else {
                                const cmd = command as ICommand
                                executeCommand?.(cmd, cmd.groupName)
                              }
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
            </NoteRenderContext>
        {/* Portal the DSL error overlay into the MDEditor text container so
            wavy underlines appear at the correct character positions.  The
            overlay uses transparent text so it never obscures the Prism
            token colors; only the .dsl-err underline marks are visible. */}
        {editorTextEl && createPortal(
          <DslErrorOverlay text={draft} diags={dslDiags} />,
          editorTextEl,
        )}
        {/* Transient highlight flashed over an option's DSL when its preview control is clicked.
            Positioned in `.w-md-editor-text` content coords; fades out via the noteDslPulse keyframe. */}
        {editorTextEl && revealPulse && createPortal(
          <Box
            key={revealPulse.key}
            aria-hidden
            sx={{
              position: 'absolute',
              left: DSL_OVERLAY_PADDING_PX,
              right: DSL_OVERLAY_PADDING_PX,
              top: revealPulse.top + DSL_OVERLAY_PADDING_PX,
              height: revealPulse.height,
              borderRadius: '3px',
              pointerEvents: 'none',
              zIndex: 2,
              animation: `${noteDslPulse} 1s ease-out`,
            }}
          />,
          editorTextEl,
        )}
        {/* Error panel portaled into .w-md-editor so it is visible in both
            normal and fullscreen (position:fixed) editor modes. */}
        {editorTextEl && createPortal(
          <DslErrorPanel diags={dslDiags} />,
          editorTextEl.closest('.w-md-editor') ?? editorTextEl,
        )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {/* Warn when recipe overrides markers changed during this edit session. */}
          <Box component="span" sx={{ display: 'inline-flex' }}>
            <Badge
              overlap="rectangular"
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
              invisible={!recipeOverridesChanged}
              sx={warningBadgeSx}
              badgeContent={renderWarningBadgeContent(
                t('noteDynamicOverridesChangedTooltip'),
                !recipeOverridesChanged,
              )}
            >
              {/* Match the view-mode toggle width so swapping modes doesn't shift layout. */}
              <Button
                size="small"
                variant="outlined"
                onClick={commitAndView}
                disabled={draftIsEmpty}
                sx={noteModeButtonMinWidth ? { minWidth: noteModeButtonMinWidth } : {}}
              >
                {t('viewNote')}
              </Button>
            </Badge>
          </Box>
          {hasRecipeOverridesMarkers ? (
            <>
              {/* Keep recipe overrides actions behind a single menu button. */}
              <Button
                size="small"
                variant="outlined"
                endIcon={<ExpandMoreIcon fontSize="small" />}
                onClick={openEditRecipeOverridesMenu}
                sx={{ whiteSpace: 'nowrap', px: 1.25 }}
                aria-haspopup="true"
                aria-controls={editRecipeOverridesMenuOpen ? 'note-recipe-overrides-menu-edit' : undefined}
                aria-expanded={editRecipeOverridesMenuOpen ? 'true' : undefined}
              >
                {t('noteDynamicOverridesMenu')}
              </Button>
              <Menu
                id="note-recipe-overrides-menu-edit"
                anchorEl={editRecipeOverridesMenuAnchor}
                open={editRecipeOverridesMenuOpen}
                onClose={closeEditRecipeOverridesMenu}
                slotProps={{ list: { dense: true }, transition: { onExited: handleEditRecipeOverridesMenuExited } }}
              >
                <MenuItem
                  onClick={() => {
                    queueEditRecipeOverridesMenuAction({ kind: 'reset' })
                  }}
                >
                  {t('noteDynamicOverridesResetDefaults')}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    queueEditRecipeOverridesMenuAction(
                      noteOverridesDisabled
                        ? { kind: 'enable' }
                        : { kind: 'disable', noteText: draft ?? '' },
                    )
                  }}
                >
                  {noteOverridesDisabled ? t('noteDynamicOverridesEnable') : t('noteDynamicOverridesDisable')}
                </MenuItem>
                {/* Save/load/delete override sets — operates on the live draft text. */}
                <DynamicOverridesPresetMenuItems controller={editOverridesPresetController} />
              </Menu>
              {/* Dialogs live outside the menu so they survive the menu closing. */}
              <DynamicOverridesPresetDialogs controller={editOverridesPresetController} />
            </>
          ) : null}
          {/* Visually separate clear-note from the recipe actions. */}
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
        {/* In express simple mode the close button is hidden; express actions replace it. */}
        {simpleActionsNode ?? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button onClick={commitAndClose}>{t('close')}</Button>
          </Box>
        )}
      </DialogActions>
      {/* EBNF reference popover — opened by clicking the Insert Recipe Overrides toolbar button. */}
      <Popover
        open={Boolean(ebnfAnchorEl)}
        anchorEl={ebnfAnchorEl}
        onClose={handleEbnfPopoverClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            ...buildContextMenuPaperSlotProps({
              component: ContextMenuPaper,
              contextMenuGuard: ebnfPopoverGuard,
              onRequestClose: handleEbnfPopoverClose,
              closeLabel: t('close'),
            }),
            // Ref required so outside-click detection in useContextMenuPaperGuard works correctly.
            ref: ebnfPopoverMenuRef as React.RefObject<HTMLDivElement | null>,
          },
        }}
      >
        {/* Scrollable content box; Paper uses overflow:visible for the close button overlay. */}
        <Box sx={{ p: 1.5, maxWidth: RECIPE_OVERRIDES_TOOLTIP_MAX_WIDTH_PX, maxHeight: '80vh', overflow: 'auto', ...RECIPE_OVERRIDES_TOOLTIP_WRAP_SX }}>
          {recipeOverridesSampleTooltipContent}
          <Box sx={{ pt: 1, mt: 0.5, borderTop: 1, borderColor: 'divider' }}>
            {/* Insert the sample block at the current cursor position and close the popover. */}
            <Button size="small" variant="outlined" onClick={() => {
              executeRecipeOverridesSampleRef.current?.()
              handleEbnfPopoverClose()
            }}>
              {t('noteInsertRecipeOverridesSample')}
            </Button>
          </Box>
          {/* Safeguard-overrides EBNF section — separated visually from recipe-overrides. */}
          <Box sx={{ pt: 1.5, mt: 0.5, borderTop: 1, borderColor: 'divider' }}>
            {safeguardOverridesTooltipContent}
            <Box sx={{ pt: 1, mt: 0.5 }}>
              <Button size="small" variant="outlined" onClick={() => {
                executeSafeguardOverridesSampleRef.current?.()
                handleEbnfPopoverClose()
              }}>
                {t('noteInsertSafeguardOverridesSample')}
              </Button>
            </Box>
          </Box>
        </Box>
      </Popover>
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
