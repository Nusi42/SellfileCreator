/**
 * SafeguardChipsPanel
 *
 * Rule chip list for the Safeguard Builder column. Manages add / delete / duplicate /
 * reorder / rename and exposes the selected rule index so the builder form can display
 * the right data.
 *
 * When the optional multi-select props (selectedRuleIndices, onRuleSelect, …) are
 * provided the panel enters multi-select mode: all rules in the set receive
 * selected styling and click events are forwarded to the parent hook so
 * shift/ctrl range selection is handled centrally.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { alpha, useTheme, useColorScheme } from '@mui/material/styles'
import { ensureContrastOnBg, compositeOnBase } from '../lib/colorUtils'
import { resolveSchemePalette, schemeModeFromColorScheme } from '../lib/themeCustomTokens'
import {
  BUILDER_AUTO_APPLY_DEBOUNCE_MS,
  GLYPH_IGNORE_COLLECTION,
  GLYPH_IGNORE_PREVIOUS,
  GLYPH_IGNORE_VAULT,
  NBSP,
  RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
  RECIPE_CHIP_VERTICAL_PADDING_PX,
  UI_BG_HOVER_DANGER_TRANSITION,
} from '../lib/constants'
import {
  SafeguardRuleActivation,
  cloneSafeguardRule,
  normalizeSafeguardRule,
  type SafeguardRule,
} from '../lib/safeguards'
import type { Metaset } from '../lib/metasets'
import { buildReadableSafeguardRuleEntry } from '../lib/sfcIO'
import { useI18n } from '../lib/i18n'
import { readTextSafe, triggerCopyDialog, writeTextSafe } from '../lib/clipboard'
import { RecipeContextMenu } from './RecipeContextMenu'
import PasteDialog from './PasteDialog'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useContextMenuButtonHint } from '../hooks/useContextMenuButtonHint'
import { CONTEXT_HINT_IDS } from '../hooks/contextMenuHintIds'
import { useChipListDnd } from '../hooks/useChipListDnd'
import { useChipListKeyboard } from '../hooks/useChipListKeyboard'
import { useDisplayPreferences } from '../state/preferencesState'
import { useShowTagsInChipsPreference } from '../state/builderPreferences'
import { resolveSafeguardActivationTextColor, safeguardSummaryParts } from './safeguardSummaryParts'
import { ALPHA } from '../lib/colorTints'


export type SafeguardChipsPanelProps = {
  rules: SafeguardRule[]
  selectedRuleIdx: number | null
  onSelect: (ruleIdx: number) => void
  onRulesChange: (next: SafeguardRule[]) => void
  maxHeightPx: number | undefined
  // When true the paper is a fixed-height flex container; use minHeight:0 + maxHeight:100%
  // so the chips list flex-fills the available wrapper space rather than holding a fixed size.
  isSideBySide?: boolean
  containerRef?: React.MutableRefObject<HTMLDivElement | null>
  /** When set, only chips whose index is in this set are shown (mirrors recipe visibleIndices). */
  visibleRuleIndices?: ReadonlySet<number> | null
  metasets?: Metaset[]
  substatColors?: Record<number, { fg: string; bg: string }>
  /** External scroll request (e.g. from Gear Inspector jump). Increment token each time to re-trigger. */
  focusRuleRequest?: { ruleIdx: number; token: number } | null

  // ── multi-select (optional — omit to keep single-select behaviour) ──────
  /** Full set of selected rule indices when multi-select is active. */
  selectedRuleIndices?: readonly number[] | null
  /** Shift/ctrl-aware click handler forwarded from useSafeguardSelection. */
  onRuleSelect?: ((event: ReactMouseEvent, ruleIdx: number) => void) | null
  /** Delegated delete so multi-rule deletes are handled centrally. */
  onRuleDelete?: ((ruleIdx: number) => void) | null
  /** Delegated duplicate so multi-rule duplicates are handled centrally. */
  onRuleDuplicate?: ((ruleIdx: number) => void) | null
  /** Delegated move-up aware of multi-select grouping. */
  onRuleMoveUp?: ((ruleIdx: number) => void) | null
  /** Delegated move-down aware of multi-select grouping. */
  onRuleMoveDown?: ((ruleIdx: number) => void) | null
  /** Delegated move-to-top aware of multi-select grouping. */
  onRuleMoveTop?: ((ruleIdx: number) => void) | null
  /** Delegated move-to-bottom aware of multi-select grouping. */
  onRuleMoveBottom?: ((ruleIdx: number) => void) | null

  // ── drag-and-drop (mirrors RecipeChipsPanel) ─────────────────────────────
  /**
   * Called by useChipListDnd at drag-start; returns the indices to drag
   * (full sorted selection when dragging a selected item, else [idx]).
   * Mirrors RecipeChipsPanel.onPrepareDragSelection.
   */
  onPrepareDragSelection?: ((idx: number) => number[]) | null
  /**
   * Full multi-index reorder handler for useChipListDnd.
   * Handles contiguous/non-contiguous multi-rule moves and copy mode.
   * Mirrors RecipeChipsPanel.onReorderRecipes.
   */
  onReorderRules?: ((movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy' }) => void) | null

  // ── keyboard / focus / selection actions (mirrors RecipeChipsPanel) ──────
  /** Delete all currently-selected rules (Delete/Backspace shortcut). */
  onDeleteSelected?: (() => void) | null
  /** Select all visible rules (Ctrl/Cmd+A shortcut and context menu). */
  onSelectAll?: (() => void) | null
  /** Clear the selection when the empty container background is clicked. */
  onClearSelection?: (() => void) | null
  /** When true the container shows the danger-tint background (Delete All hover). */
  highlightDelete?: boolean
  /** Called with true/false when the Delete All menu item is hovered/blurred. */
  onHighlightDelete?: ((active: boolean) => void) | null
  /** Delete All action — clears every rule; passed to context menu. */
  onDeleteAll?: (() => void) | null
  /** When true the Delete All menu item is disabled (no rules exist). */
  deleteAllDisabled?: boolean
}

// ── SafeguardChip ─────────────────────────────────────────────────────────────
// Props for a single chip row. All booleans are pre-computed by the panel so
// shallow-equality memoization skips renders when only unrelated panel state changes.
type SafeguardChipProps = {
  rule: SafeguardRule
  ruleIndex: number
  isSelected: boolean
  isFirst: boolean
  isLast: boolean
  /** True when this chip's inline name field is active. */
  isEditing: boolean
  /** Buffered pending name for the inline field, or undefined when not editing. */
  pendingName: string | undefined
  dndEnabled: boolean
  /** True when this chip is being dragged (ghost style). */
  isGhostDragging: boolean
  hasActiveDrag: boolean
  metasets: Metaset[]
  substatColors: Record<number, { fg: string; bg: string }>
  colorStatsAndSlots: boolean
  showFactionIcons: boolean
  showSetIcons: boolean
  showSlotIcons: boolean
  /** When true, show up to 3 inline tag chips below the summary line. */
  showTagsInChips: boolean
  t: (key: string, params?: Record<string, string | number>) => string
  lang: string
  onSelect: (ruleIndex: number) => void
  onRuleSelect?: ((e: ReactMouseEvent, ruleIndex: number) => void) | null
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, ruleIndex: number) => void
  onChipPointerDown?: ((e: React.PointerEvent<HTMLElement>, ruleIndex: number) => void) | null
  onMoveRule: (ruleIdx: number, targetIndex: number, direction?: 'up' | 'down' | 'top' | 'bottom') => void
  onDuplicate: (ruleIndex: number) => void
  // Direct delete trigger — routed through the multi-aware manager which opens
  // the count-aware ConfirmDialogs (recipe parity). No local dialog state.
  onDelete: (ruleIndex: number) => void
  onStartEdit: (ruleIndex: number, name: string) => void
  onFinishEdit: (ruleIndex: number, commit: boolean) => void
  onPendingNameChange: (ruleIndex: number, value: string) => void
  onScheduleNameCommit: (ruleIndex: number) => void
}

// Individual chip row. React.memo default shallow equality means this only re-renders
// when its own props change — panel state like open menus or dialogs is invisible to it.
const SafeguardChip = React.memo(function SafeguardChip({
  rule, ruleIndex, isSelected, isFirst, isLast, isEditing, pendingName,
  dndEnabled, isGhostDragging, hasActiveDrag,
  metasets, substatColors, colorStatsAndSlots, showFactionIcons, showSetIcons, showSlotIcons,
  showTagsInChips,
  t, lang,
  onSelect, onRuleSelect, onContextMenu, onChipPointerDown, onMoveRule, onDuplicate,
  onDelete, onStartEdit, onFinishEdit, onPendingNameChange, onScheduleNameCommit,
}: SafeguardChipProps) {
  // Derive display values from the rule; recomputed only when this chip's props change.
  const { colorScheme } = useColorScheme()
  const theme = useTheme()
  const rawName = (pendingName ?? rule.appearance?.name ?? '').trim()
  const fallbackName = `${t('gearInspectorRule')} ${ruleIndex + 1}`
  // Apply contrast adjustment to user-chosen colors; fall back to inherit when unset.
  const rawFgColor = rule.appearance?.fgColor
  // Resolve the ACTUAL runtime scheme palette — theme.palette.* is frozen to light with cssVariables.
  // Composite action.selected (an rgba string) over paper for selected chips so the
  // contrast check targets the actual rendered surface, not the underlying paper.
  const schemePalette = resolveSchemePalette(theme, schemeModeFromColorScheme(colorScheme))
  const chipBg = compositeOnBase(
    schemePalette.background.paper,
    isSelected ? schemePalette.action.selected : 'transparent',
  )
  const resolvedNameColor = rawFgColor
    ? ensureContrastOnBg(rawFgColor, chipBg)
    : 'inherit'
  const displayName = rawName || fallbackName
  // Activation badge color and label text. Adapt Protect/Anticipate to the actual chip surface
  // (chipBg already composites the selection tint over paper) so it stays legible in both schemes.
  const actColor = resolveSafeguardActivationTextColor(rule.activation, schemePalette, chipBg)
  const actText = rule.activation === SafeguardRuleActivation.ProtectExisting
    ? t('safeguardsRuleModeProtectShort')
    : rule.activation === SafeguardRuleActivation.AnticipateGaps
      ? t('safeguardsRuleModeAnticipateShort')
      : t('safeguardsRuleModeOffShort')
  // Ignore-flag glyphs shown after ≥ N in the mode badge.
  const flagParts: string[] = []
  if (rule.ignorePreviousSafeguards !== false) flagParts.push(GLYPH_IGNORE_PREVIOUS)
  if (rule.ignoreEquippedInCollection === true) flagParts.push(GLYPH_IGNORE_COLLECTION)
  if (rule.ignoreEquippedInVault === true) flagParts.push(GLYPH_IGNORE_VAULT)
  const perDimSuffix = flagParts.length > 0 ? NBSP + flagParts.join('') : ''
  // Summary line — memoized so it only recomputes when this chip's rule or display prefs change.
  const summary = useMemo(
    () => safeguardSummaryParts(rule, metasets, {
      substatColors,
      useStatButtonColors: colorStatsAndSlots,
      showFactionIcons,
      showSetIcons,
      showSlotIcons,
      t,
      lang,
      surfacePaper: schemePalette.background.paper,
    }),
    [rule, metasets, substatColors, colorStatsAndSlots, showFactionIcons, showSetIcons, showSlotIcons, t, lang, schemePalette.background.paper],
  )

  return (
    <Box
      data-safeguard-chip-index={ruleIndex}
      data-tour-id={`safeguards.chip.${ruleIndex}`}
      data-safeguard-chip="true"
      data-linked-hover="false"
      onMouseEnter={(e) => (e.currentTarget as HTMLElement).setAttribute('data-linked-hover', 'true')}
      onMouseLeave={(e) => (e.currentTarget as HTMLElement).setAttribute('data-linked-hover', 'false')}
      onClick={(e) => {
        // In multi-select mode, forward the full MouseEvent so shift/ctrl is handled.
        if (onRuleSelect) { onRuleSelect(e, ruleIndex); return }
        onSelect(ruleIndex)
      }}
      onContextMenu={(event) => onContextMenu(event, ruleIndex)}
      onPointerDown={dndEnabled ? (e) => onChipPointerDown?.(e, ruleIndex) : undefined}
      sx={(themeCtx) => {
        const hoverBg = themeCtx.custom.hoverBg
        const selectedHoverBg = themeCtx.custom.selectedHoverBg
        return {
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          maxWidth: '100%',
          width: '100%',
          overflow: 'hidden',
          border: '1px solid',
          borderColor: isSelected ? (themeCtx.vars?.palette.primary.main ?? themeCtx.palette.primary.main) : (themeCtx.vars?.palette.divider ?? themeCtx.palette.divider),
          backgroundColor: isSelected ? (themeCtx.vars?.palette.action.selected ?? themeCtx.palette.action.selected) : 'transparent',
          borderRadius: `${themeCtx.shape.borderRadius}px`,
          pl: 1,
          pr: 0.4,
          py: `${RECIPE_CHIP_VERTICAL_PADDING_PX}px`,
          cursor: dndEnabled && !isGhostDragging
            ? (hasActiveDrag ? 'grabbing' : 'grab')
            : 'pointer',
          flex: '0 0 auto',
          '&[data-linked-hover="true"]': {
            backgroundColor: isSelected ? selectedHoverBg : hoverBg,
            borderColor: themeCtx.palette.primary.main,
          },
          ...(isGhostDragging ? {
            opacity: 0.35,
            transform: 'scale(0.985)',
            pointerEvents: 'none',
          } : {}),
        }
      }}
    >
      {/* Text content */}
      {isEditing ? (
        <>
          <Typography variant="caption" component="span" sx={{ flexShrink: 0, color: 'text.disabled', pr: 0.25 }}>
            {`${ruleIndex + 1}.`}
          </Typography>
          <TextField
            size="small"
            autoFocus
            value={pendingName ?? rule.appearance?.name ?? ''}
            onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
            onChange={(e) => {
              const raw = e.target.value ?? ''
              onPendingNameChange(ruleIndex, raw)
              onScheduleNameCommit(ruleIndex)
            }}
            onBlur={() => onFinishEdit(ruleIndex, true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onFinishEdit(ruleIndex, true); return }
              if (e.key === 'Escape') { e.preventDefault(); onFinishEdit(ruleIndex, false) }
            }}
            sx={{ flex: '1 1 auto', minWidth: 0, mr: 0.5 }}
            slotProps={{ htmlInput: { style: { fontSize: '0.75rem', padding: '2px 6px' } } }}
          />
          <Box component="span" sx={{ color: actColor, fontWeight: 600, fontSize: '0.75rem', flexShrink: 0, mr: 0.5 }}>
            {actText}{NBSP}≥{NBSP}{rule.requiredCount ?? 1}{perDimSuffix}
          </Box>
        </>
      ) : (
        <Box sx={{ mr: 0.5, flex: '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
          <Typography
            variant="caption"
            sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            <Box component="span" sx={{ display: 'inline' }}>
              {`${ruleIndex + 1}. `}
              <Box
                component="span"
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartEdit(ruleIndex, rule.appearance?.name ?? '') }}
                onKeyDown={(e) => {
                  if (e.key !== 'F2') return
                  e.preventDefault(); e.stopPropagation()
                  onStartEdit(ruleIndex, rule.appearance?.name ?? '')
                }}
                sx={{
                  fontStyle: rawName ? 'normal' : 'italic',
                  color: rawName ? resolvedNameColor : 'text.secondary',
                }}
              >
                {displayName}
              </Box>
              {' — '}
              {/* Mode badge: activation label + quota + active per-dim glyphs. */}
              <Box component="span" sx={{ color: actColor, fontWeight: 600 }}>{actText}{NBSP}≥{NBSP}{rule.requiredCount ?? 1}{perDimSuffix}</Box>
              {summary ? <>{' | '}{summary}</> : null}
            </Box>
          </Typography>
        </Box>
      )}
      {/* Inline tag chips — shown to the right of the text area, next to the mode flags,
          when the preference is on. flexShrink: 0 keeps them from being squeezed by the name. */}
      {!isEditing && showTagsInChips && rule.tags && rule.tags.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0, alignItems: 'flex-end', mr: 0.25 }}>
          {rule.tags.slice(0, 3).map((tag) => (
            <Chip key={tag} size="small" label={tag} sx={{ height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
          ))}
          {rule.tags.length > 3 ? (
            <Chip size="small" label={`+${rule.tags.length - 3}`} sx={{ height: 16, fontSize: '0.65rem', opacity: 0.7, '& .MuiChip-label': { px: 0.75 } }} />
          ) : null}
        </Box>
      ) : null}
      {/* Action buttons — directly in the row, matching RecipeChip */}
      <IconButton
        size="small"
        aria-label={t('chipMenuMoveUp')}
        disabled={isFirst}
        onClick={(e) => { e.stopPropagation(); onMoveRule(ruleIndex, ruleIndex - 1, 'up') }}
        sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
      >
        <ArrowUpwardIcon fontSize="inherit" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={t('chipMenuMoveDown')}
        disabled={isLast}
        onClick={(e) => { e.stopPropagation(); onMoveRule(ruleIndex, ruleIndex + 1, 'down') }}
        sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
      >
        <ArrowDownwardIcon fontSize="inherit" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={t('safeguardsDuplicateRule')}
        onClick={(e) => { e.stopPropagation(); onDuplicate(ruleIndex) }}
        sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
      >
        <ContentCopyIcon fontSize="inherit" />
      </IconButton>
      <IconButton
        size="small"
        aria-label={t('safeguardsDeleteRule')}
        onClick={(e) => { e.stopPropagation(); onDelete(ruleIndex) }}
        color="error"
        sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
      >
        <DeleteOutlineIcon fontSize="inherit" />
      </IconButton>
    </Box>
  )
})

export default function SafeguardChipsPanel({
  rules,
  selectedRuleIdx,
  onSelect,
  onRulesChange,
  maxHeightPx,
  isSideBySide = false,
  containerRef,
  visibleRuleIndices,
  metasets = [],
  substatColors = {},
  focusRuleRequest,
  // Multi-select — all optional; omit to keep single-select behaviour.
  selectedRuleIndices,
  onRuleSelect,
  onRuleDelete,
  onRuleDuplicate,
  onRuleMoveUp,
  onRuleMoveDown,
  onRuleMoveTop,
  onRuleMoveBottom,
  // Drag-and-drop — mirrors RecipeChipsPanel surface.
  onPrepareDragSelection,
  onReorderRules,
  // Keyboard / focus / selection — mirrors RecipeChipsPanel surface.
  onDeleteSelected,
  onSelectAll,
  onClearSelection,
  highlightDelete = false,
  onHighlightDelete,
  onDeleteAll,
  deleteAllDisabled = false,
}: SafeguardChipsPanelProps) {
  // Multi-select is active when the caller supplies the extended props.
  const multiselectMode = Boolean(onRuleSelect)
  // Build the effective selected index set for chip styling.
  const effectiveSelectedIndices: ReadonlySet<number> = multiselectMode && selectedRuleIndices
    ? new Set(selectedRuleIndices)
    : new Set(selectedRuleIdx !== null ? [selectedRuleIdx] : [])
  // Ref so openRuleMenu can read the current selection without it as a callback dep.
  const effectiveSelectedIndicesRef = useRef<ReadonlySet<number>>(effectiveSelectedIndices)
  useEffect(() => { effectiveSelectedIndicesRef.current = effectiveSelectedIndices })
  const { t, lang } = useI18n()
  const { showFactionIcons, colorStatsAndSlots, showSetIcons, showSlotIcons } = useDisplayPreferences()
  // Read the chips-list tag display preference — separate from the builder form inline display.
  const [showTagsInChips, setShowTagsInChips] = useShowTagsInChipsPreference()

  // ── internal state ───────────────────────────────────────────────────────
  // Index of the rule whose inline name field is active; null when none.
  const [editingRuleNameIdx, setEditingRuleNameIdx] = useState<number | null>(null)
  // Buffered pending names keyed by rule index so typing is fast.
  const [pendingNameByIdx, setPendingNameByIdx] = useState<Map<number, string>>(() => new Map())
  // Delete confirmation for single/multi rule chip clicks now lives in the
  // centralized ConfirmDialogs via useSfcDialogs (recipe parity).
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false)
  // Context menu anchor for a specific chip.
  const [ruleMenu, setRuleMenu] = useState<{ ruleIdx: number; x: number; y: number } | null>(null)
  // Hint disabled while the rule context menu is open.
  const chipHint = useContextMenuButtonHint(CONTEXT_HINT_IDS.safeguardChipsPanel, {
    enabled: !ruleMenu,
    text: t('contextMenuHint'),
  })
  const { onOpen: onChipHintOpen } = chipHint
  // Paste dialog target; ruleIdx is the anchor when pasting "after".
  const [pasteDialogTarget, setPasteDialogTarget] = useState<{ mode: 'after' | 'end'; ruleIdx?: number } | null>(null)
  const [pasteDialogText, setPasteDialogText] = useState('')
  const [pasteDialogError, setPasteDialogError] = useState<string | null>(null)

  const ruleMenuRef = useRef<HTMLDivElement | null>(null)
  const nameCommitTimerRef = useRef<number | null>(null)
  const scrollRootRef = useRef<HTMLDivElement | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  // Track the last focus token we acted on so re-renders don't re-trigger the scroll.
  const lastAppliedFocusTokenRef = useRef<number | null>(null)

  const { contextMenuGuard: ruleMenuGuard } = useContextMenuPaperGuard({
    open: Boolean(ruleMenu),
    onClose: useCallback(() => setRuleMenu(null), []),
    menuRef: ruleMenuRef,
  })

  // ── helpers ──────────────────────────────────────────────────────────────

  const mutateRules = useCallback((action: SafeguardRule[] | ((prev: SafeguardRule[]) => SafeguardRule[])) => {
    const next = typeof action === 'function' ? action(rules) : action
    onRulesChange(next)
  }, [rules, onRulesChange])

  // ── name editing ─────────────────────────────────────────────────────────

  const cancelNameCommitTimer = useCallback(() => {
    if (nameCommitTimerRef.current !== null) {
      window.clearTimeout(nameCommitTimerRef.current)
      nameCommitTimerRef.current = null
    }
  }, [])

  const flushPendingName = useCallback((ruleIdx: number) => {
    const nextName = pendingNameByIdx.get(ruleIdx)
    if (nextName === undefined) return
    // Apply to the rule at the stored index; no-op when the name is already current.
    mutateRules((prev) => prev.map((r, i) => {
      if (i !== ruleIdx) return r
      if (r.appearance?.name === nextName) return r
      // Preserve fgColor so inline-name edits don't clobber the color.
      const nextAppearance = (nextName || r.appearance?.fgColor)
        ? { name: nextName, ...(r.appearance?.fgColor ? { fgColor: r.appearance.fgColor } : {}) }
        : undefined
      const base = { ...r }
      if (nextAppearance) return { ...base, appearance: nextAppearance }
      delete (base as { appearance?: typeof r.appearance }).appearance
      return base
    }))
  }, [pendingNameByIdx, mutateRules])

  const scheduleNameCommit = useCallback((ruleIdx: number) => {
    cancelNameCommitTimer()
    nameCommitTimerRef.current = window.setTimeout(() => {
      nameCommitTimerRef.current = null
      flushPendingName(ruleIdx)
    }, BUILDER_AUTO_APPLY_DEBOUNCE_MS)
  }, [cancelNameCommitTimer, flushPendingName])

  useEffect(() => () => cancelNameCommitTimer(), [cancelNameCommitTimer])

  const startRuleNameEdit = useCallback((ruleIdx: number, persistedName: string) => {
    setPendingNameByIdx((prev) => {
      const next = new Map(prev)
      next.set(ruleIdx, persistedName ?? '')
      return next
    })
    setEditingRuleNameIdx(ruleIdx)
  }, [])

  const finishRuleNameEdit = useCallback((ruleIdx: number, commit: boolean) => {
    cancelNameCommitTimer()
    if (commit) {
      flushPendingName(ruleIdx)
    } else {
      setPendingNameByIdx((prev) => {
        if (!prev.has(ruleIdx)) return prev
        const next = new Map(prev)
        next.delete(ruleIdx)
        return next
      })
    }
    setEditingRuleNameIdx((prev) => (prev === ruleIdx ? null : prev))
  }, [cancelNameCommitTimer, flushPendingName])

  // ── rule management ───────────────────────────────────────────────────────

  // Scrolls the targeted chip into view with smooth animation, mirroring the recipe chips pattern.
  //
  // Looks up the chip by its data-safeguard-chip-index attribute so the lookup is
  // purely index-based. Retries up to MAX_FIND_ATTEMPTS frames in case the chip is
  // briefly absent (e.g. paste/duplicate hasn't committed yet). One settle frame is
  // awaited before computing the scroll target so the container's clientHeight is final.
  const scheduleScrollToIdx = useCallback((ruleIdx: number) => {
    // Cancel any in-flight scroll attempt for a previous rule.
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    // Give up if the chip never appears (e.g. filtered out or not yet rendered).
    const MAX_FIND_ATTEMPTS = 8
    const tryScroll = (findAttempt: number, settled: boolean) => {
      const container = scrollRootRef.current
      const target = container?.querySelector(`[data-safeguard-chip-index="${ruleIdx}"]`) as HTMLElement | null
      if (!target) {
        // Chip not in DOM yet — retry next frame (reset settled; layout may shift further).
        if (findAttempt >= MAX_FIND_ATTEMPTS) { scrollRafRef.current = null; return }
        scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(findAttempt + 1, false))
        return
      }
      if (!settled) {
        // Wait one additional frame to let the ResizeObserver → React re-render cycle commit
        // the final maxHeightPx to the container before we read clientHeight.
        scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(findAttempt, true))
        return
      }
      // Walk the offsetParent chain to get chipTop relative to the scroll container.
      let chipTop = target.offsetTop
      let offsetParent = target.offsetParent as HTMLElement | null
      while (offsetParent && offsetParent !== container) {
        chipTop += offsetParent.offsetTop
        offsetParent = offsetParent.offsetParent as HTMLElement | null
      }
      if (!Number.isFinite(chipTop)) { scrollRafRef.current = null; return }
      const chipHeight = target.offsetHeight
      const viewTop = container!.scrollTop
      const viewBottom = viewTop + container!.clientHeight
      const chipBottom = chipTop + chipHeight
      // Determine the scroll target — same logic as recipe chips.
      let scrollTarget: number | null = null
      if (chipHeight >= container!.clientHeight) {
        scrollTarget = chipTop
      } else if (chipTop < viewTop) {
        scrollTarget = chipTop
      } else if (chipBottom > viewBottom) {
        scrollTarget = chipBottom - container!.clientHeight
      }
      if (scrollTarget === null) { scrollRafRef.current = null; return }
      const maxScrollTop = Math.max(0, container!.scrollHeight - container!.clientHeight)
      const clampedTarget = Math.max(0, Math.min(scrollTarget, maxScrollTop))
      // Only scroll if the chip is meaningfully out of view.
      if (Math.abs(clampedTarget - viewTop) > 0.5) {
        container!.scrollTo({ top: clampedTarget, behavior: 'smooth' })
      }
      scrollRafRef.current = null
    }
    scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(0, false))
  }, [])

  // Cancel any pending scroll rAF on unmount to prevent post-unmount state updates.
  useEffect(() => () => {
    if (scrollRafRef.current === null) return
    window.cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = null
  }, [])

  // Scroll the targeted chip into view when an external jump request arrives.
  // Token deduplication prevents re-firing on unrelated re-renders.
  useEffect(() => {
    if (!focusRuleRequest) return
    if (lastAppliedFocusTokenRef.current === focusRuleRequest.token) return
    lastAppliedFocusTokenRef.current = focusRuleRequest.token
    scheduleScrollToIdx(focusRuleRequest.ruleIdx)
  }, [focusRuleRequest, scheduleScrollToIdx])

  // Keep the selected chip visible after selection changes (move, duplicate, restore, keyboard
  // navigation). Mirrors scrollSelectedRecipeIntoView in App.tsx for the recipe chip list.
  // scheduleScrollToIdx is a no-op when the chip is already in the viewport, so this is safe
  // to run on every selectedRuleIdx change without causing spurious scrolls on normal clicks.
  const prevSelectedRuleIdxRef = useRef(selectedRuleIdx)
  useEffect(() => {
    if (prevSelectedRuleIdxRef.current === selectedRuleIdx) return
    prevSelectedRuleIdxRef.current = selectedRuleIdx
    if (selectedRuleIdx !== null) scheduleScrollToIdx(selectedRuleIdx)
  }, [selectedRuleIdx, scheduleScrollToIdx])

  const handleDeleteRule = useCallback((ruleIdx: number) => {
    // When multi-select is active, delegate to the parent hook so bulk deletes work.
    if (onRuleDelete) { onRuleDelete(ruleIdx); setRuleMenu(null); return }
    let nextLength = 0
    mutateRules((prev) => {
      const filtered = prev.filter((_, i) => i !== ruleIdx)
      nextLength = filtered.length
      return filtered
    })
    // Close the context menu if it was open for the deleted rule.
    if (ruleMenu?.ruleIdx === ruleIdx) setRuleMenu(null)
    // Auto-select the first remaining rule so the builder form doesn't go blank.
    if (nextLength > 0 && selectedRuleIdx === ruleIdx) {
      onSelect(0)
    }
  }, [mutateRules, onRuleDelete, ruleMenu, selectedRuleIdx, onSelect])

  const handleConfirmDeleteAll = useCallback(() => {
    mutateRules([])
    setPendingDeleteAll(false)
    setRuleMenu(null)
  }, [mutateRules])

  const handleDuplicateRule = useCallback((ruleIdx: number) => {
    // Delegate to parent when in multi-select mode so grouped duplicates work.
    if (onRuleDuplicate) { onRuleDuplicate(ruleIdx); return }
    const source = rules[ruleIdx]
    if (!source) return
    // Insert the clone immediately after the original in the list.
    const duplicated: SafeguardRule = { ...cloneSafeguardRule(source) }
    const next = rules.slice()
    next.splice(ruleIdx + 1, 0, duplicated)
    mutateRules(next)
    // Select the clone; the selectedRuleIdx effect will scroll it into view.
    onSelect(ruleIdx + 1)
  }, [mutateRules, onRuleDuplicate, rules, onSelect])

  const moveRule = useCallback((ruleIdx: number, targetIndex: number, direction?: 'up' | 'down' | 'top' | 'bottom') => {
    // In multi-select mode, delegate directional moves to the parent hook.
    // Chip list scroll after the move is handled by the selectedRuleIdx effect below.
    if (direction === 'up' && onRuleMoveUp) { onRuleMoveUp(ruleIdx); return }
    if (direction === 'down' && onRuleMoveDown) { onRuleMoveDown(ruleIdx); return }
    if (direction === 'top' && onRuleMoveTop) { onRuleMoveTop(ruleIdx); return }
    if (direction === 'bottom' && onRuleMoveBottom) { onRuleMoveBottom(ruleIdx); return }
    mutateRules((prev) => {
      // Clamp to valid bounds so arrow buttons at the edges don't no-op silently.
      const safeTarget = Math.min(Math.max(targetIndex, 0), prev.length - 1)
      if (safeTarget === ruleIdx) return prev
      const next = prev.slice()
      const [moved] = next.splice(ruleIdx, 1)
      if (!moved) return prev
      next.splice(safeTarget, 0, moved)
      return next
    })
  }, [mutateRules, onRuleMoveUp, onRuleMoveDown, onRuleMoveTop, onRuleMoveBottom])

  const dndEnabled = rules.length > 1

  const {
    dropGuide: dndDropGuide,
    handleItemPointerDown: handleChipPointerDown,
    hasActiveDrag,
    dragGhostIndices,
  } = useChipListDnd({
    containerRef: scrollRootRef,
    itemIndexAttr: 'data-safeguard-chip-index',
    // Prefer the parent-supplied multi-select reorder handler; fall back to
    // the legacy single-item move so the panel stays functional when invoked
    // without the full multi-select prop set (e.g. standalone usage).
    onReorder: onReorderRules ?? ((movingIndices, targetIndex) => {
      const idx = movingIndices[0]
      if (idx !== undefined) moveRule(idx, targetIndex)
    }),
    ...(onPrepareDragSelection ? { onPrepareSelection: onPrepareDragSelection } : {}),
    copyModeEnabled: true,
    enabled: dndEnabled,
  })

  // Visible rule count drives Ctrl+A; selected count drives Delete/Backspace.
  const visibleRuleCount = visibleRuleIndices
    ? rules.filter((_, i) => visibleRuleIndices.has(i)).length
    : rules.length
  const selectedCount = multiselectMode && selectedRuleIndices ? selectedRuleIndices.length : (selectedRuleIdx !== null ? 1 : 0)

  // Ordered list of visible rule indices for arrow/page/home/end navigation.
  const visibleOrderedRuleIndices = useMemo((): readonly number[] => {
    if (!visibleRuleIndices) return rules.map((_, i) => i)
    return rules.map((_, i) => i).filter((i) => visibleRuleIndices.has(i))
  }, [rules, visibleRuleIndices])

  // Shared SSOT hook: keyboard shortcuts (Delete, Ctrl+A), navigation (arrows/page/home/end),
  // focus ring, empty-click-to-deselect.
  const {
    showFocusRing,
    handleKeyDown: chipListHandleKeyDown,
    handleFocus: chipListHandleFocus,
    handleBlur: chipListHandleBlur,
    handleMouseDown: chipListHandleMouseDown,
    handleClick: chipListHandleClick,
  } = useChipListKeyboard({
    visibleCount: visibleRuleCount,
    selectedCount,
    onDeleteSelected: onDeleteSelected ?? (() => {}),
    onSelectAll: onSelectAll ?? (() => {}),
    onClearSelection: onClearSelection ?? (() => {}),
    visibleOrderedIndices: visibleOrderedRuleIndices,
    cursorIdx: selectedRuleIdx,
    onNavigate: onSelect,
    chipIndexAttr: 'data-safeguard-chip-index',
    containerRef: scrollRootRef,
  })

  const openRuleMenu = useCallback((event: ReactMouseEvent<HTMLElement>, ruleIdx: number) => {
    event.preventDefault()
    event.stopPropagation()
    // Only select a chip when it is not already selected; mirrors RecipeChip which skips
    // onSelect when selected=true, preserving multi-select when right-clicking within it.
    if (ruleIdx >= 0 && !effectiveSelectedIndicesRef.current.has(ruleIdx)) onSelect(ruleIdx)
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX || Math.round(rect.left + rect.width / 2)
    const y = event.clientY || Math.round(rect.top + rect.height / 2)
    onChipHintOpen()
    setRuleMenu({ ruleIdx, x, y })
  }, [onChipHintOpen, onSelect])

  // ── clipboard / paste ─────────────────────────────────────────────────────

  // Parses clipboard text into SafeguardRule objects. Accepts both the wrapped
  // `{ kind: 'safeguardRule', rule: … }` envelope and bare rule/array payloads.
  const parseSafeguardClipboardRules = useCallback((raw: string | null): SafeguardRule[] => {
    if (!raw || raw.trim().length === 0) return []
    try {
      const parsed = JSON.parse(raw)
      // Unwrap the envelope if present; otherwise treat the root as the rule payload.
      const candidate = (
        parsed && typeof parsed === 'object' && 'kind' in parsed && (parsed as { kind?: unknown }).kind === 'safeguardRule'
          ? (parsed as { rule?: unknown }).rule
          : parsed
      )
      // Normalize to array so both single-rule and multi-rule pastes share one path.
      const rawList = Array.isArray(candidate) ? candidate : [candidate]
      const normalized = rawList
        .map((entry) => normalizeSafeguardRule(entry))
        .filter((entry): entry is SafeguardRule => Boolean(entry))
      if (normalized.length === 0) return []
      // Clone each rule so the caller gets fresh identity references.
      return normalized.map((r) => cloneSafeguardRule(r))
    } catch { return [] }
  }, [])

  // Inserts one or more rules at insertIndex, then selects and scrolls to the
  // first inserted rule so the user sees the result immediately.
  const insertSafeguardRulesAt = useCallback((rulesToInsert: SafeguardRule[], insertIndex: number) => {
    let firstNewIdx: number | null = null
    mutateRules((prev) => {
      if (rulesToInsert.length === 0) return prev
      // Clamp so the caller doesn't have to worry about boundary conditions.
      const safeIndex = Math.min(Math.max(insertIndex, 0), prev.length)
      // Always clone so pasted rules never share references with the source.
      const copies = rulesToInsert.map((r) => cloneSafeguardRule(r))
      const next = prev.slice()
      next.splice(safeIndex, 0, ...copies)
      firstNewIdx = safeIndex
      return next
    })
    if (firstNewIdx === null) return
    const idx = firstNewIdx
    // Select and scroll to the first new rule so the builder panel updates.
    onSelect(idx)
    scheduleScrollToIdx(idx)
  }, [mutateRules, onSelect, scheduleScrollToIdx])

  const closePasteDialog = useCallback(() => {
    setPasteDialogTarget(null)
    setPasteDialogText('')
    setPasteDialogError(null)
  }, [])

  const openPasteDialog = useCallback((mode: 'after' | 'end', ruleIdx?: number, text = '') => {
    setPasteDialogTarget({ mode, ...(ruleIdx !== undefined ? { ruleIdx } : {}) })
    setPasteDialogText(text)
    setPasteDialogError(null)
  }, [])

  const handleCopyRule = useCallback(async (ruleIdx: number) => {
    const source = rules[ruleIdx]
    if (!source) return
    // Serialize via the canonical readable entry builder so the format stays stable.
    const snapshot = buildReadableSafeguardRuleEntry(source)
    const payload = { kind: 'safeguardRule', rule: snapshot }
    const text = JSON.stringify(payload, null, 2)
    // Fall back to the manual copy dialog when the Clipboard API is unavailable.
    const ok = await writeTextSafe(text)
    if (!ok) triggerCopyDialog(text)
  }, [rules])

  // Copies a specific subset of rules (by index) as a flat array, preserving sort order.
  // Used when the per-chip "Copy" action fires while a multi-selection of ≥2 chips is active
  // and the right-clicked chip is included in that selection.
  const handleCopySelectedRules = useCallback(async (indices: number[]) => {
    // Sort so the clipboard payload reflects list order, not click order.
    const sorted = indices.slice().sort((a, b) => a - b)
    const entries = sorted
      .map((i) => { const r = rules[i]; return r ? buildReadableSafeguardRuleEntry(r) : null })
      .filter((e): e is ReturnType<typeof buildReadableSafeguardRuleEntry> => e !== null)
    if (entries.length === 0) return
    const payload = { kind: 'safeguardRule', rule: entries }
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) triggerCopyDialog(text)
  }, [rules])

  // Copies all rules as an array using the same envelope format as handleCopyRule;
  // parseSafeguardClipboardRules already handles array payloads on paste.
  const handleCopyAllRules = useCallback(async () => {
    if (rules.length === 0) return
    const snapshots = rules.map((r) => buildReadableSafeguardRuleEntry(r))
    const payload = { kind: 'safeguardRule', rule: snapshots }
    const text = JSON.stringify(payload, null, 2)
    const ok = await writeTextSafe(text)
    if (!ok) triggerCopyDialog(text)
  }, [rules])

  const handlePasteAfterRule = useCallback(async (ruleIdx: number) => {
    const text = await readTextSafe()
    const parsed = parseSafeguardClipboardRules(text)
    if (parsed.length > 0) {
      // Happy path: clipboard already holds a valid rule payload.
      insertSafeguardRulesAt(parsed, ruleIdx + 1)
      return
    }
    // Clipboard content wasn't parseable; open the manual dialog pre-filled with it.
    openPasteDialog('after', ruleIdx, text ?? '')
  }, [insertSafeguardRulesAt, openPasteDialog, parseSafeguardClipboardRules])

  const handlePasteAtEnd = useCallback(async () => {
    const text = await readTextSafe()
    const parsed = parseSafeguardClipboardRules(text)
    if (parsed.length > 0) {
      insertSafeguardRulesAt(parsed, rules.length)
      return
    }
    openPasteDialog('end', undefined, text ?? '')
  }, [insertSafeguardRulesAt, openPasteDialog, parseSafeguardClipboardRules, rules.length])

  const handleConfirmPasteDialog = useCallback(() => {
    const parsed = parseSafeguardClipboardRules(pasteDialogText)
    if (parsed.length === 0) {
      // Show an inline error instead of silently closing; user can correct the text.
      setPasteDialogError('No valid safeguard rule found in pasted text')
      return
    }
    const mode = pasteDialogTarget?.mode ?? 'end'
    // Resolve the insertion index from the mode and the optional anchor index.
    const insertIndex = mode === 'after'
      ? ((pasteDialogTarget?.ruleIdx ?? -1) >= 0 ? pasteDialogTarget!.ruleIdx! + 1 : rules.length)
      : rules.length
    insertSafeguardRulesAt(parsed, insertIndex)
    closePasteDialog()
  }, [closePasteDialog, insertSafeguardRulesAt, parseSafeguardClipboardRules, pasteDialogTarget, pasteDialogText, rules.length])

  // Stable callback for inline name field changes in SafeguardChip; avoids passing setPendingNameByIdx directly.
  const handlePendingNameChange = useCallback((ruleIdx: number, value: string) => {
    setPendingNameByIdx((prev) => { const next = new Map(prev); next.set(ruleIdx, value); return next })
  }, [])

  const pasteDialogConfirmLabel = pasteDialogTarget?.mode === 'after'
    ? t('chipMenuPasteAfter')
    : t('chipsMenuPasteAtEnd')

  // Pre-compute the context menu actions so no IIFE appears inside JSX.
  // Per-chip actions mirror the structure in buildChipContextMenuActions (RecipeContextMenu.tsx).
  const ruleContextMenuActions = (() => {
    if (!ruleMenu) return {}
    const idx = ruleMenu.ruleIdx
    // idx < 0 means the menu was opened from the empty area; show background actions only.
    const isChipMenu = idx >= 0
    const isFirst = idx <= 0
    const isLast = idx >= rules.length - 1
    return {
      ...(isChipMenu ? {
        duplicate: () => handleDuplicateRule(idx),
        moveTop: { handler: () => moveRule(idx, 0, 'top'), disabled: isFirst },
        moveUp: { handler: () => moveRule(idx, idx - 1, 'up'), disabled: isFirst },
        moveDown: { handler: () => moveRule(idx, idx + 1, 'down'), disabled: isLast },
        moveBottom: { handler: () => moveRule(idx, rules.length - 1, 'bottom'), disabled: isLast },
        // When ≥2 chips are selected and the right-clicked chip is among them,
        // copy the whole selection as a flat array; otherwise copy just this chip.
        copyRecipe: selectedRuleIndices && selectedRuleIndices.length > 1 && selectedRuleIndices.includes(idx)
          ? () => handleCopySelectedRules(selectedRuleIndices.slice())
          : () => handleCopyRule(idx),
        pasteAfter: () => handlePasteAfterRule(idx),
        // Delete the chip; mirrors RecipeChip's deleteRecipe action.
        deleteRecipe: () => handleDeleteRule(idx),
      } : {}),
      copyAll: { handler: handleCopyAllRules, disabled: rules.length === 0, labelKey: 'chipsMenuCopyAllSafeguards' },
      pasteAtEnd: handlePasteAtEnd,
      // Select All — same as Ctrl+A shortcut, available when rules exist.
      ...(onSelectAll ? {
        selectAll: { handler: onSelectAll, disabled: visibleRuleCount === 0, labelKey: 'chipsMenuSelectAll' },
      } : {}),
      // Clear Selection — mirrors Escape shortcut; available when items are selected.
      ...(onClearSelection ? {
        clearSelection: { handler: onClearSelection, disabled: selectedCount === 0, labelKey: 'chipsMenuClearSelection' },
      } : {}),
      toggleShowTagsInChips: { checked: showTagsInChips, handler: () => setShowTagsInChips(!showTagsInChips) },
      deleteAll: {
        // Prefer the parent-supplied handler (App.tsx can hook history/dialog).
        handler: onDeleteAll ?? (() => setPendingDeleteAll(true)),
        disabled: deleteAllDisabled || rules.length === 0,
        labelKey: 'safeguardsDeleteAll',
        // Drive the danger-tint background from menu hover state.
        onHighlightChange: onHighlightDelete ?? undefined,
      },
    }
  })()

  // Pre-compute minHeight for the chips list so no IIFE appears inside JSX.
  const chipsListMinHeight = isSideBySide ? 0 : (() => {
    const max = maxHeightPx ?? 0
    if (max <= 0) return 0
    return max
  })()

  return (
    <>
      <RecipeContextMenu
        open={Boolean(ruleMenu)}
        anchorPosition={ruleMenu ? { top: ruleMenu.y, left: ruleMenu.x } : null}
        onClose={() => { setRuleMenu(null); onHighlightDelete?.(false) }}
        paperRef={ruleMenuRef}
        paperDataTourId="keepuniques.rule-menu"
        onPaperContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        contextMenuGuard={ruleMenuGuard}
        actions={ruleContextMenuActions}
      />
      <PasteDialog
        open={Boolean(pasteDialogTarget)}
        text={pasteDialogText}
        error={pasteDialogError}
        confirmLabel={pasteDialogConfirmLabel}
        onTextChange={(value) => { setPasteDialogText(value); if (pasteDialogError) setPasteDialogError(null) }}
        onCancel={closePasteDialog}
        onConfirm={handleConfirmPasteDialog}
      />
      <Dialog open={pendingDeleteAll} onClose={() => setPendingDeleteAll(false)}>
        <DialogTitle>{t('safeguardsDeleteAllTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('safeguardsDeleteAllMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteAll(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmDeleteAll}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>

      {/* Scrollable rule chip list — tour target for the Safeguards tutorial step */}
      <Box
        data-tour-id="safeguards.chips"
        ref={(el: HTMLDivElement | null) => {
          scrollRootRef.current = el
          if (containerRef) containerRef.current = el
        }}
        tabIndex={0}
        onClick={chipListHandleClick}
        onKeyDown={chipListHandleKeyDown}
        onFocus={chipListHandleFocus}
        onBlur={chipListHandleBlur}
        onMouseDown={chipListHandleMouseDown}
        onMouseMove={chipHint.triggerProps.onMouseMove}
        onMouseLeave={chipHint.triggerProps.onMouseLeave}
        // Open the background context menu (paste/select-all/delete-all) when right-clicking
        // the empty area; chip-level right-clicks stop propagation before reaching here.
        onContextMenu={(event) => openRuleMenu(event, -1)}
        sx={(themeInner) => ({
          mt: 1,
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          flexGrow: 1,
          flexBasis: 0,
          gap: 0.75,
          // In side-by-side mode the paper is a fixed-height container (overflow:hidden), so
          // flex-fill with no fixed size — the chips list grows to fill whatever the wrapper
          // allocates, matching the recipe chips panel behaviour and giving a consistent bottom edge.
          // Outside side-by-side the legacy minHeight=maxHeight trick keeps the paper height stable
          // across mode switches with different chip counts.
          maxHeight: isSideBySide ? '100%' : (maxHeightPx ?? undefined),
          minHeight: chipsListMinHeight,
          overflowY: 'auto',
          overflowX: 'hidden',
          alignItems: 'stretch',
          position: 'relative',
          pr: themeInner.spacing(1),
          // Danger tint when Delete All is hovered — mirrors RecipeChipsPanel.
          transition: UI_BG_HOVER_DANGER_TRANSITION,
          backgroundColor: highlightDelete
            ? themeInner.custom.dangerTintBg
            : 'transparent',
          borderRadius: 1,
          // Suppress browser default outline; we render our own keyboard focus ring.
          outline: 'none',
          boxShadow: showFocusRing ? `0 0 0 2px ${themeInner.palette.primary.main}` : 'none',
          ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: themeInner.spacing(1) }),
        })}
      >
        {dndDropGuide ? (
          <Box sx={(themeInner) => ({
            position: 'absolute',
            top: dndDropGuide.top, left: dndDropGuide.left,
            width: dndDropGuide.width, height: dndDropGuide.height,
            backgroundColor: themeInner.palette.primary.main,
            borderRadius: dndDropGuide.height <= 4 ? 2 : 1,
            pointerEvents: 'none',
            boxShadow: `0 0 8px ${alpha(themeInner.palette.primary.main, ALPHA.a60)}`,
            zIndex: 5,
          })} />
        ) : null}
        {rules.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>{t('safeguardsNoRules')}</Typography>
          </Box>
        ) : (
          rules.map((rule, index) => {
            // Skip hidden chips when a visible-index filter is active.
            if (visibleRuleIndices && !visibleRuleIndices.has(index)) return null
            // Pre-compute per-chip booleans so SafeguardChip's shallow equality can skip
            // unchanged chips when unrelated panel state changes (menus, dialogs, etc.).
            return (
              // SafeguardRule has no stable ID; index is the correct key here.
              <SafeguardChip key={index} // eslint-disable-line @eslint-react/no-array-index-key
                rule={rule}
                ruleIndex={index}
                isSelected={effectiveSelectedIndices.has(index)}
                isFirst={index === 0}
                isLast={index === rules.length - 1}
                isEditing={editingRuleNameIdx === index}
                pendingName={pendingNameByIdx.get(index)}
                dndEnabled={dndEnabled}
                isGhostDragging={dragGhostIndices.has(index)}
                hasActiveDrag={hasActiveDrag}
                metasets={metasets}
                substatColors={substatColors}
                colorStatsAndSlots={colorStatsAndSlots}
                showFactionIcons={showFactionIcons}
                showSetIcons={showSetIcons}
                showSlotIcons={showSlotIcons}
                showTagsInChips={showTagsInChips}
                t={t}
                lang={lang}
                onSelect={onSelect}
                onRuleSelect={onRuleSelect ?? null}
                onContextMenu={openRuleMenu}
                onChipPointerDown={handleChipPointerDown}
                onMoveRule={moveRule}
                onDuplicate={handleDuplicateRule}
                onDelete={handleDeleteRule}
                onStartEdit={startRuleNameEdit}
                onFinishEdit={finishRuleNameEdit}
                onPendingNameChange={handlePendingNameChange}
                onScheduleNameCommit={scheduleNameCommit}
              />
            )
          })
        )}
      </Box>
      {chipHint.overlay}
    </>
  )
}
