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
import { scopeColorsText } from '../lib/colorScope'
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
// Bundle collapse chevrons — same pair the Gear Inspector's group headers use.
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
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
  SAFEGUARD_OUTLINE_INDENT_PX,
  UI_BG_HOVER_DANGER_TRANSITION,
} from '../lib/constants'
// Top-level outline depth — the floor every depth clamp in this panel measures from.
import { SAFEGUARD_OUTLINE_DEFAULT_DEPTH } from '../lib/generated/domainConstants'
import {
  cloneSafeguardRule,
  isSafeguardBundle,
  isSafeguardBundleCollapsed,
  normalizeSafeguardRule,
  safeguardActivationShortLabelKey,
  safeguardEntryDepth,
  safeguardEntryEffectiveActivation,
  safeguardEntryKind,
  stripInertSafeguardFields,
  withSafeguardBundleCollapsed,
  type SafeguardEntryKind,
  type SafeguardRule,
} from '../lib/safeguards'
// Bundle outline: every structural question routes through this facade, which delegates to the
// Rust authority so the list renders exactly the structure the engine evaluates.
import {
  groupSafeguardSelection,
  resolveSafeguardOutline,
  safeguardAncestorIndices,
  safeguardSubtreeIndices,
  safeguardSubtreeSpan,
  shiftSafeguardEntryDepth,
  ungroupSafeguardBundle,
} from '../lib/safeguardOutline'
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
import { useRarityLabelColorMap } from '../lib/rarityColorContext'
import { ALPHA } from '../lib/colorTints'
// Divider decoration + row are shared with the recipe chip list (one separator look).
import { deriveSeparatorDividerDecoration } from '../lib/separators'
import { SeparatorDividerRow } from './SeparatorDividerRow'


export type SafeguardChipsPanelProps = {
  rules: SafeguardRule[]
  selectedRuleIdx: number | null
  onSelect: (ruleIdx: number) => void
  // `displayOnly` marks a change that alters presentation state only (a bundle's collapsed
  // flag). Such a change produces no history descriptor by design, so the parent must be told
  // it is real rather than a no-op.
  onRulesChange: (next: SafeguardRule[], options?: { displayOnly?: boolean }) => void
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
  // `depth` carries the outline level the drop landed on (horizontal pointer position), so a
  // drag can nest an entry into a bundle as well as reorder it.
  onReorderRules?: ((movingIndices: number[], targetIndex: number, options?: { mode?: 'move' | 'copy'; depth?: number }) => void) | null

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
  colorStatTexts: boolean
  showFactionIcons: boolean
  showSetIcons: boolean
  showSlotIcons: boolean
  /** When true, show up to 3 inline tag chips below the summary line. */
  showTagsInChips: boolean
  // ── Bundle outline (resolved by the panel from lib/safeguardOutline, never re-derived here) ──
  /** Outline level; 0 = top. Drives the left inset and the tree guides. */
  depth: number
  /** Entry kind discriminator — 'rule' | 'bundle' | 'separator'. */
  entryKind: SafeguardEntryKind
  /** Bundle headers only: how many safeguards are nested inside. */
  memberCount: number
  /** Bundle headers only: subtree collapsed in the list. */
  isCollapsed: boolean
  /** Bundle headers only: how many pieces it keeps out of each merged bucket. */
  bundleDemand: number
  onToggleCollapse?: ((event: ReactMouseEvent, ruleIndex: number) => void) | null
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
  metasets, substatColors, colorStatTexts, showFactionIcons, showSetIcons, showSlotIcons,
  showTagsInChips,
  depth, entryKind, memberCount, isCollapsed, bundleDemand, onToggleCollapse,
  t, lang,
  onSelect, onRuleSelect, onContextMenu, onChipPointerDown, onMoveRule, onDuplicate,
  onDelete, onStartEdit, onFinishEdit, onPendingNameChange, onScheduleNameCommit,
}: SafeguardChipProps) {
  // Derive display values from the rule; recomputed only when this chip's props change.
  const { colorScheme } = useColorScheme()
  const theme = useTheme()
  // Rarity word → adapted colour for tinting rarity words in the chip summary (empty when flag off).
  const rarityLabelColors = useRarityLabelColorMap()
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
  // Badge state reads the entry as it BEHAVES, not as it stores: a bundle's activation and ignore
  // flags are retained baggage the scan never reads, so both come from the shared projection
  // instead of the raw rule (a header seeded from an Off rule would otherwise render as disabled
  // while its cap keeps running).
  const behavingRule = stripInertSafeguardFields(rule)
  // Activation badge color and label text. Adapt Protect/Anticipate to the actual chip surface
  // (chipBg already composites the selection tint over paper) so it stays legible in both schemes.
  const effectiveActivation = safeguardEntryEffectiveActivation(rule)
  const actColor = resolveSafeguardActivationTextColor(effectiveActivation, schemePalette, chipBg)
  const actText = t(safeguardActivationShortLabelKey(effectiveActivation))
  // Ignore-flag glyphs shown after ≥ N in the mode badge.
  const flagParts: string[] = []
  if (behavingRule.ignorePreviousSafeguards !== false) flagParts.push(GLYPH_IGNORE_PREVIOUS)
  if (behavingRule.ignoreEquippedInCollection === true) flagParts.push(GLYPH_IGNORE_COLLECTION)
  if (behavingRule.ignoreEquippedInVault === true) flagParts.push(GLYPH_IGNORE_VAULT)
  const perDimSuffix = flagParts.length > 0 ? NBSP + flagParts.join('') : ''
  // Separator rows render as a pure divider (shared decoration with the recipe list):
  // no index, no mode badge, no summary, no tag chips, no inline action buttons.
  const isSeparator = entryKind === 'separator'
  const isBundle = entryKind === 'bundle'
  // A bundle shows what it keeps per merged bucket; a member shows its own count, which is
  // the size of the feed it hands the bundle. Both numbers are the entry's own required count —
  // the bundle's comes through the outline so the chip cannot disagree with the engine (an
  // empty header resolves to 0 there, which is exactly what it protects).
  const badgeCount = isBundle ? bundleDemand : (rule.requiredCount ?? 1)
  // Base line color mirrors RecipeChip's primaryColor source (CSS-var aware).
  const primaryColor = (theme.vars?.palette.primary.main ?? theme.palette.primary.main)
  const separatorDecoration = useMemo(
    () => deriveSeparatorDividerDecoration(rule.appearance?.name, rule.appearance?.fgColor, primaryColor),
    [rule.appearance, primaryColor],
  )
  // Summary line — memoized so it only recomputes when this chip's rule or display prefs change.
  const summary = useMemo(
    () => safeguardSummaryParts(rule, metasets, {
      substatColors,
      useStatButtonColors: colorStatTexts,
      showFactionIcons,
      showSetIcons,
      showSlotIcons,
      t,
      lang,
      surfacePaper: schemePalette.background.paper,
      rarityLabelColors,
      bundleMemberCount: memberCount,
    }),
    [rule, metasets, substatColors, colorStatTexts, showFactionIcons, showSetIcons, showSlotIcons, t, lang, schemePalette.background.paper, rarityLabelColors, memberCount],
  )
  // Nesting is communicated by indentation plus a left border on nested chips. Deliberately NOT
  // by absolutely-positioned guide rails in a wrapper element: the drag layer measures each
  // chip's `offsetTop`, which is relative to its nearest POSITIONED ancestor, so introducing a
  // positioned wrapper silently zeroes every measurement and misplaces the drop guide.
  //
  // The border colour uses the `…Channel` rgba form rather than `alpha()`: under cssVariables
  // `theme.vars.palette.*` is a `var(--…)` string alpha() cannot parse, and bare
  // `theme.palette.*` is frozen to the light scheme, so JS-computed tints are wrong in dark
  // mode. The channel token stays scheme-reactive in pure CSS while the alpha still comes from
  // the ALPHA SSOT. (theming-system.md names this exact token for low-alpha text tints.)
  const nestedEdgeSx = depth > 0
    ? {
      borderLeft: '2px solid',
      borderLeftColor: `rgba(var(--mui-palette-text-primaryChannel) / ${ALPHA.a20})`,
    }
    : {}

  return (
    <Box
      data-safeguard-chip-index={ruleIndex}
      data-safeguard-chip-depth={depth}
      data-safeguard-chip-kind={entryKind}
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
          // One indent step per outline level; the chip narrows rather than overflowing.
          ml: `${depth * SAFEGUARD_OUTLINE_INDENT_PX}px`,
          maxWidth: '100%',
          width: `calc(100% - ${depth * SAFEGUARD_OUTLINE_INDENT_PX}px)`,
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
          // Nested chips carry a left edge so their membership reads at a glance.
          ...nestedEdgeSx,
          ...(isGhostDragging ? {
            opacity: 0.35,
            transform: 'scale(0.985)',
            pointerEvents: 'none',
          } : {}),
        }
      }}
    >
      {/* Collapse chevron — bundle headers only. Ctrl/right-click applies to every bundle,
          matching the shared collapsible-section behaviour used elsewhere in the builder. */}
      {isBundle ? (
        <IconButton
          size="small"
          aria-label={t(isCollapsed ? 'safeguardsBundleExpand' : 'safeguardsBundleCollapse')}
          aria-expanded={!isCollapsed}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse?.(e, ruleIndex) }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onToggleCollapse?.(e, ruleIndex) }}
          sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25, flexShrink: 0, ml: -0.5 }}
        >
          {isCollapsed ? <ChevronRightIcon fontSize="inherit" /> : <ExpandMoreIcon fontSize="inherit" />}
        </IconButton>
      ) : null}
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
          {/* Separators have no mode badge — the field edits only the divider label. The
              bundle/rule split matches the non-editing badge below: a header shows its count
              alone (no activation of its own), and through the outline so it cannot disagree
              with the engine. */}
          {!isSeparator ? (
            <Box component="span" sx={{ color: actColor, fontWeight: 600, fontSize: '0.75rem', flexShrink: 0, mr: 0.5 }}>
              {isBundle ? null : <>{actText}{NBSP}</>}≥{NBSP}{badgeCount}{perDimSuffix}
            </Box>
          ) : null}
        </>
      ) : isSeparator ? (
        // Double-click anywhere on the divider starts the inline rename (name box is absent).
        <SeparatorDividerRow
          decoration={separatorDecoration}
          surfaceBg={chipBg}
          onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onStartEdit(ruleIndex, rule.appearance?.name ?? '') }}
        />
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
              {/* Mode badge: activation label + quota + active per-dim glyphs. A bundle has no
                  activation of its own (it never matches gear), so it shows its count alone. */}
              {isBundle
                ? <Box component="span" sx={{ color: actColor, fontWeight: 600 }}>≥{NBSP}{badgeCount}{perDimSuffix}</Box>
                : <Box component="span" sx={{ color: actColor, fontWeight: 600 }}>{actText}{NBSP}≥{NBSP}{badgeCount}{perDimSuffix}</Box>}
              {summary ? <>{' | '}{summary}</> : null}
            </Box>
          </Typography>
        </Box>
      )}
      {/* Inline tag chips — shown to the right of the text area, next to the mode flags,
          when the preference is on. flexShrink: 0 keeps them from being squeezed by the name. */}
      {!isEditing && !isSeparator && showTagsInChips && rule.tags && rule.tags.length > 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, flexShrink: 0, alignItems: 'flex-end', mr: 0.25 }}>
          {rule.tags.slice(0, 3).map((tag) => (
            <Chip key={tag} size="small" label={tag} sx={{ height: 16, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.75 } }} />
          ))}
          {rule.tags.length > 3 ? (
            <Chip size="small" label={`+${rule.tags.length - 3}`} sx={{ height: 16, fontSize: '0.65rem', opacity: 0.7, '& .MuiChip-label': { px: 0.75 } }} />
          ) : null}
        </Box>
      ) : null}
      {/* Action buttons — directly in the row, matching RecipeChip (which also hides
          them on separators; move/duplicate/delete stay reachable via context menu/dnd). */}
      {!isSeparator ? (
        <>
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
        </>
      ) : null}
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
  // ── bundle outline ───────────────────────────────────────────────────────
  // Resolved once per rules-array identity by the Rust authority (see lib/safeguardOutline).
  // Every structural question below reads this result; nothing is re-derived from `depth`.
  const outline = useMemo(() => resolveSafeguardOutline(rules), [rules])
  // Which chips actually render: a subtree hidden behind a collapsed bundle drops out, and the
  // ancestor chain of anything still visible is forced back in so indentation never dangles
  // from a missing parent (matters when `visibleRuleIndices` filters the list).
  const renderableIndices = useMemo(() => {
    const visible = new Set<number>()
    for (let index = 0; index < rules.length; index += 1) {
      if (visibleRuleIndices && !visibleRuleIndices.has(index)) continue
      // Hide anything inside a collapsed bundle, at any depth.
      const collapsedAncestor = safeguardAncestorIndices(rules, index)
        .some((ancestor) => {
          const owner = rules[ancestor]
          return owner !== undefined && isSafeguardBundleCollapsed(owner)
        })
      if (collapsedAncestor) continue
      visible.add(index)
    }
    // Re-add the ancestors of everything that survived, so each visible chip has its context.
    for (const index of Array.from(visible)) {
      for (const ancestor of safeguardAncestorIndices(rules, index)) visible.add(ancestor)
    }
    return visible
  }, [rules, visibleRuleIndices])
  const { showFactionIcons, statColorScope, showSetIcons, showSlotIcons } = useDisplayPreferences()
  const colorStatTexts = scopeColorsText(statColorScope)
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

  const mutateRules = useCallback((
    action: SafeguardRule[] | ((prev: SafeguardRule[]) => SafeguardRule[]),
    options?: { displayOnly?: boolean },
  ) => {
    const next = typeof action === 'function' ? action(rules) : action
    onRulesChange(next, options)
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
    // Duplicating a bundle takes its whole subtree — the members are what give it meaning.
    // Every entry is deep-cloned so no two chips ever share a reference (the identity rule
    // multi-select and history depend on).
    const span = safeguardSubtreeSpan(rules, ruleIdx)
    const duplicated = rules.slice(ruleIdx, ruleIdx + span).map((rule) => cloneSafeguardRule(rule))
    const next = rules.slice()
    next.splice(ruleIdx + span, 0, ...duplicated)
    mutateRules(next)
    // Select the clone; the selectedRuleIdx effect will scroll it into view.
    onSelect(ruleIdx + span)
  }, [mutateRules, onRuleDuplicate, rules, onSelect])

  // ── structural edits ─────────────────────────────────────────────────────
  // Every one of these delegates its array maths to lib/safeguardOutline, which also repairs
  // the outline afterwards — no splice logic is written twice.

  // Wrap a selection in a new bundle.
  //
  // The selection is CLEARED rather than moved to the new header. Selecting through onSelect
  // here would auto-apply the still-pending builder draft to whatever now sits at the old
  // index — and every structural edit shifts indices, so after grouping that index holds the
  // freshly created header. The draft (a plain rule) would be written straight over it, turning
  // the bundle back into a rule the moment the user clicked it.
  const handleGroupSelection = useCallback((indices: readonly number[]) => {
    const grouped = groupSafeguardSelection(rules, indices)
    if (!grouped) return
    mutateRules(grouped.rules)
    onClearSelection?.()
  }, [mutateRules, onClearSelection, rules])

  // Dissolve a bundle; its members keep the counts they never stopped carrying. Selection is
  // cleared for the same reason grouping clears it — see handleGroupSelection.
  const handleUngroupBundle = useCallback((ruleIdx: number) => {
    const next = ungroupSafeguardBundle(rules, ruleIdx)
    if (!next) return
    mutateRules(next)
    onClearSelection?.()
  }, [mutateRules, onClearSelection, rules])

  // Nest into the bundle above / lift out of the containing bundle.
  const handleShiftDepth = useCallback((ruleIdx: number, delta: 1 | -1) => {
    const next = shiftSafeguardEntryDepth(rules, ruleIdx, delta)
    if (!next) return
    mutateRules(next)
  }, [mutateRules, rules])
  // Availability mirrors the same helper, so a disabled menu item and a no-op call agree.
  const canIndent = useCallback((ruleIdx: number) => shiftSafeguardEntryDepth(rules, ruleIdx, 1) !== null, [rules])
  const canOutdent = useCallback((ruleIdx: number) => shiftSafeguardEntryDepth(rules, ruleIdx, -1) !== null, [rules])

  // Collapse or expand every bundle at once (context menu).
  const handleSetAllCollapsed = useCallback((collapsed: boolean) => {
    // Only bundles carry the flag; withSafeguardBundleCollapsed owns the omit-vs-store rule.
    mutateRules(rules.map((rule) => (
      isSafeguardBundle(rule) ? withSafeguardBundleCollapsed(rule, collapsed) : rule
    )), { displayOnly: true })
  }, [mutateRules, rules])

  // Collapse/expand one bundle. Ctrl/right-click applies to every bundle at once, matching the
  // shared collapsible-section behaviour the builder's own sections use.
  const handleToggleCollapse = useCallback((event: ReactMouseEvent, ruleIdx: number) => {
    const target = rules[ruleIdx]
    if (!target || !isSafeguardBundle(target)) return
    const applyToAll = event.ctrlKey || event.metaKey || event.type === 'contextmenu'
    const nextCollapsed = !isSafeguardBundleCollapsed(target)
    mutateRules(rules.map((rule, index) => {
      // Only bundles carry the flag; a plain rule has nothing to collapse.
      if (!isSafeguardBundle(rule)) return rule
      if (!applyToAll && index !== ruleIdx) return rule
      return withSafeguardBundleCollapsed(rule, nextCollapsed)
    }), { displayOnly: true })
  }, [mutateRules, rules])

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
    // Dragging a bundle takes its members along. This needs no change inside the shared hook —
    // onPrepareSelection already decides what moves, so the set is simply widened to whole
    // subtrees here before the drag begins.
    onPrepareSelection: (idx: number) => {
      const base = onPrepareDragSelection ? onPrepareDragSelection(idx) : [idx]
      const claimed = new Set<number>()
      for (const index of base) {
        for (const owned of safeguardSubtreeIndices(rules, index)) claimed.add(owned)
      }
      return Array.from(claimed).sort((a, b) => a - b)
    },
    // Horizontal pointer position picks the drop LEVEL (the standard outliner interaction).
    // The level is clamped to what the entry above the drop point can legally contain, so the
    // guide never promises a nesting the normalizer would immediately undo.
    resolveDropDepth: (insertIndex: number, pointerOffsetX: number) => {
      const previous = insertIndex > 0 ? rules[insertIndex - 1] : undefined
      if (!previous) return SAFEGUARD_OUTLINE_DEFAULT_DEPTH
      // Read the REPAIRED depth from the resolved outline, not the stored field: a hand-edited
      // or pasted entry can carry a level the resolver pulls back, and the drop guide must
      // promise the level the list actually renders.
      const previousDepth = outline.depths[insertIndex - 1] ?? safeguardEntryDepth(previous)
      // Only a bundle can adopt a child, so anything else caps the level at its own.
      const maxDepth = isSafeguardBundle(previous) ? previousDepth + 1 : previousDepth
      const requested = Math.floor(Math.max(0, pointerOffsetX) / SAFEGUARD_OUTLINE_INDENT_PX)
      return Math.max(SAFEGUARD_OUTLINE_DEFAULT_DEPTH, Math.min(requested, maxDepth))
    },
    depthIndentPx: SAFEGUARD_OUTLINE_INDENT_PX,
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
    // The right-clicked chip is the outline target; when it is part of a multi-selection the
    // grouping action wraps the whole selection instead.
    const targetRule = idx >= 0 ? rules[idx] : undefined
    const groupSelection = selectedRuleIndices && selectedRuleIndices.length > 1 && selectedRuleIndices.includes(idx)
      ? selectedRuleIndices.slice()
      : [idx]
    const anyBundle = rules.some((rule) => isSafeguardBundle(rule))
    return {
      ...(isChipMenu ? {
        // NOTE: these mirror buildChipContextMenuActions (RecipeContextMenu.tsx) rather than
        // calling it. Routing through that helper trips react-hooks/refs — several of these
        // handlers transitively read a ref, and the rule forbids CALLING such a function during
        // render even though the closures only run on click. The outline entries below are
        // safeguard-only additions the recipe list never receives.
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
        groupIntoBundle: { handler: () => handleGroupSelection(groupSelection) },
        // Only a bundle header can be dissolved.
        ...(targetRule && isSafeguardBundle(targetRule)
          ? { ungroupBundle: { handler: () => handleUngroupBundle(idx) } }
          : {}),
        indentEntry: { handler: () => handleShiftDepth(idx, 1), disabled: !canIndent(idx) },
        outdentEntry: { handler: () => handleShiftDepth(idx, -1), disabled: !canOutdent(idx) },
      } : {}),
      // Collapse/expand apply to the whole list, so they stay available from the background too.
      ...(anyBundle ? {
        collapseAllBundles: { handler: () => handleSetAllCollapsed(true) },
        expandAllBundles: { handler: () => handleSetAllCollapsed(false) },
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
            // Skip hidden chips when a visible-index filter is active, or when an ancestor
            // bundle is collapsed. Both are resolved once above so the filter and the outline
            // agree — an ancestor of a visible entry always renders, or its indentation would
            // dangle from nothing.
            if (!renderableIndices.has(index)) return null
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
                colorStatTexts={colorStatTexts}
                showFactionIcons={showFactionIcons}
                showSetIcons={showSetIcons}
                showSlotIcons={showSlotIcons}
                showTagsInChips={showTagsInChips}
                depth={outline.depths[index] ?? SAFEGUARD_OUTLINE_DEFAULT_DEPTH}
                entryKind={safeguardEntryKind(rule)}
                memberCount={outline.pools[index]?.length ?? 0}
                isCollapsed={isSafeguardBundleCollapsed(rule)}
                bundleDemand={outline.demands[index] ?? 0}
                onToggleCollapse={handleToggleCollapse}
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
