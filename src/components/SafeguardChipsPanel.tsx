/**
 * SafeguardChipsPanel
 *
 * Rule chip list for the Safeguard Builder column. Manages add / delete / duplicate /
 * reorder / rename and exposes the selected rule id so the builder form can display
 * the right data. Mirrors the chip-management surface of SafeguardsTab without the
 * detection grid.
 */
import React, { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import { alpha, useTheme } from '@mui/material/styles'
import {
  BUILDER_AUTO_APPLY_DEBOUNCE_MS,
  GLYPH_IGNORE_COLLECTION,
  GLYPH_IGNORE_PREVIOUS,
  GLYPH_IGNORE_VAULT,
  HOVER_BG_ALPHA,
  NBSP,
  RECIPE_CHIP_BORDER_RADIUS_PX,
  RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX,
  RECIPE_CHIP_VERTICAL_PADDING_PX,
  SELECTED_HOVER_BG_ALPHA,
} from '../lib/constants'
import {
  SafeguardRuleActivation,
  cloneSafeguardRule,
  createSafeguardRuleId,
  normalizeSafeguardRule,
  type SafeguardRule,
} from '../lib/safeguards'
import type { Metaset } from '../lib/metasets'
import { buildReadableSafeguardRuleEntry } from '../lib/sfrIO'
import { useI18n } from '../lib/i18n'
import { readTextSafe, triggerCopyDialog, writeTextSafe } from '../lib/clipboard'
import { parseRecipeNameDirectives } from '../lib/recipeNameDirectives'
import { RecipeContextMenu } from './RecipeContextMenu'
import PasteDialog from './PasteDialog'
import { reserveScrollbarGutterSpace } from '../lib/scrollbar'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useChipListDnd } from '../hooks/useChipListDnd'
import { useDisplayPreferences } from '../state/preferencesState'
import { safeguardSummaryParts } from './safeguardSummaryParts'


export type SafeguardChipsPanelProps = {
  rules: SafeguardRule[]
  selectedRuleId: string | null
  onSelect: (ruleId: string) => void
  onRulesChange: (next: SafeguardRule[]) => void
  maxHeightPx: number | undefined
  // When true the paper is a fixed-height flex container; use minHeight:0 + maxHeight:100%
  // so the chips list flex-fills the available wrapper space rather than holding a fixed size.
  isSideBySide?: boolean
  containerRef?: React.MutableRefObject<HTMLDivElement | null>
  /** When set, only chips whose rule ID is in this set are shown (mirrors recipe visibleIndices). */
  visibleRuleIds?: ReadonlySet<string> | null
  metasets?: Metaset[]
  substatColors?: Record<number, { fg: string; bg: string }>
  /** External scroll request (e.g. from Gear Inspector jump). Increment token each time to re-trigger. */
  focusRuleRequest?: { ruleId: string; token: number } | null
}

export default function SafeguardChipsPanel({
  rules,
  selectedRuleId,
  onSelect,
  onRulesChange,
  maxHeightPx,
  isSideBySide = false,
  containerRef,
  visibleRuleIds,
  metasets = [],
  substatColors = {},
  focusRuleRequest,
}: SafeguardChipsPanelProps) {
  const { t, lang } = useI18n()
  const theme = useTheme()
  const { showFactionIcons, statButtonBorders, showSetIcons, showSlotIcons } = useDisplayPreferences()

  // ── internal state ───────────────────────────────────────────────────────
  const [editingRuleNameId, setEditingRuleNameId] = useState<string | null>(null)
  const [pendingNameById, setPendingNameById] = useState<Map<string, string>>(() => new Map())
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null)
  const [pendingDeleteAll, setPendingDeleteAll] = useState(false)
  const [ruleMenu, setRuleMenu] = useState<{ ruleId: string; x: number; y: number } | null>(null)
  const [pasteDialogTarget, setPasteDialogTarget] = useState<{ mode: 'after' | 'end'; ruleId?: string } | null>(null)
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

  const flushPendingName = useCallback((ruleId: string) => {
    const nextName = pendingNameById.get(ruleId)
    if (nextName === undefined) return
    mutateRules((prev) => prev.map((r) => r.id === ruleId ? (r.name === nextName ? r : { ...r, name: nextName }) : r))
  }, [pendingNameById, mutateRules])

  const scheduleNameCommit = useCallback((ruleId: string) => {
    cancelNameCommitTimer()
    nameCommitTimerRef.current = window.setTimeout(() => {
      nameCommitTimerRef.current = null
      flushPendingName(ruleId)
    }, BUILDER_AUTO_APPLY_DEBOUNCE_MS)
  }, [cancelNameCommitTimer, flushPendingName])

  useEffect(() => () => cancelNameCommitTimer(), [cancelNameCommitTimer])

  const startRuleNameEdit = useCallback((ruleId: string, persistedName: string) => {
    setPendingNameById((prev) => {
      const next = new Map(prev)
      next.set(ruleId, persistedName ?? '')
      return next
    })
    setEditingRuleNameId(ruleId)
  }, [])

  const finishRuleNameEdit = useCallback((ruleId: string, commit: boolean) => {
    cancelNameCommitTimer()
    if (commit) {
      flushPendingName(ruleId)
    } else {
      setPendingNameById((prev) => {
        if (!prev.has(ruleId)) return prev
        const next = new Map(prev)
        next.delete(ruleId)
        return next
      })
    }
    setEditingRuleNameId((prev) => (prev === ruleId ? null : prev))
  }, [cancelNameCommitTimer, flushPendingName])

  // ── rule management ───────────────────────────────────────────────────────

  // Scrolls the targeted chip into view with smooth animation, mirroring the recipe chips pattern.
  //
  // Retries up to MAX_FIND_ATTEMPTS frames in case the chip is briefly absent (e.g. paste/duplicate
  // hasn't committed yet). Once found, waits one settle frame before computing the scroll target —
  // this is necessary when the panel has just become visible (display:none → flex), because the
  // ResizeObserver that updates maxHeightPx fires asynchronously; without the settle frame the
  // container's clientHeight is briefly inflated, making scroll-down targets compute to zero.
  // After settling, walks the offsetParent chain to get chipTop, then calls scrollTo with
  // behavior:'smooth' — the same approach used by scrollSelectedRecipeIntoView in App.tsx.
  const scheduleScrollToRule = useCallback((ruleId: string) => {
    // Cancel any in-flight scroll attempt for a previous rule.
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    // Give up if the chip never appears (e.g. filtered out or not yet rendered).
    const MAX_FIND_ATTEMPTS = 8
    const tryScroll = (findAttempt: number, settled: boolean) => {
      const container = scrollRootRef.current
      const target = container?.querySelector(`[data-safeguards-rule-id="${ruleId}"]`) as HTMLElement | null
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
      // Only scroll if the chip is meaningfully out of view; smooth keeps the animation subtle.
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

  // Scroll the targeted chip into view when an external jump request arrives
  // (e.g. clicking a safeguard match chip in Gear Inspector). Token deduplication
  // prevents re-firing on unrelated re-renders.
  useEffect(() => {
    if (!focusRuleRequest) return
    if (lastAppliedFocusTokenRef.current === focusRuleRequest.token) return
    lastAppliedFocusTokenRef.current = focusRuleRequest.token
    scheduleScrollToRule(focusRuleRequest.ruleId)
  }, [focusRuleRequest, scheduleScrollToRule])

  const handleDeleteRule = useCallback((ruleId: string) => {
    let filtered: SafeguardRule[] = []
    mutateRules((prev) => {
      filtered = prev.filter((r) => r.id !== ruleId)
      return filtered
    })
    // Close the context menu if it was open for the deleted rule.
    if (ruleMenu?.ruleId === ruleId) setRuleMenu(null)
    // Auto-select the first remaining rule so the builder form doesn't go blank.
    if (filtered.length > 0 && selectedRuleId === ruleId) {
      onSelect(filtered[0]!.id)
    }
  }, [mutateRules, ruleMenu, selectedRuleId, onSelect])

  const handleConfirmDeleteRule = useCallback(() => {
    if (!pendingDeleteRuleId) return
    handleDeleteRule(pendingDeleteRuleId)
    // Clear the pending ID after the delete so the confirmation dialog closes.
    setPendingDeleteRuleId(null)
  }, [handleDeleteRule, pendingDeleteRuleId])

  const handleConfirmDeleteAll = useCallback(() => {
    mutateRules([])
    setPendingDeleteAll(false)
    setRuleMenu(null)
  }, [mutateRules])

  const handleDuplicateRule = useCallback((ruleId: string) => {
    const sourceIndex = rules.findIndex((r) => r.id === ruleId)
    if (sourceIndex === -1) return
    const source = rules[sourceIndex]
    if (!source) return
    // Insert the clone immediately after the original in the list.
    const cloneId = createSafeguardRuleId()
    const duplicated: SafeguardRule = { ...source, id: cloneId, combination: { ...source.combination } }
    const next = rules.slice()
    next.splice(sourceIndex + 1, 0, duplicated)
    mutateRules(next)
    // Select and scroll to the new clone so the user sees it right away.
    onSelect(cloneId)
    scheduleScrollToRule(cloneId)
  }, [mutateRules, rules, onSelect, scheduleScrollToRule])

  const moveRule = useCallback((ruleId: string, targetIndex: number) => {
    mutateRules((prev) => {
      const idx = prev.findIndex((r) => r.id === ruleId)
      if (idx === -1) return prev
      // Clamp to valid bounds so arrow buttons at the edges don't no-op silently.
      const safeTarget = Math.min(Math.max(targetIndex, 0), prev.length - 1)
      if (safeTarget === idx) return prev
      const next = prev.slice()
      const [moved] = next.splice(idx, 1)
      if (!moved) return prev
      next.splice(safeTarget, 0, moved)
      return next
    })
  }, [mutateRules])

  const dndEnabled = rules.length > 1

  const {
    dropGuide: dndDropGuide,
    handleItemPointerDown: handleChipPointerDown,
    hasActiveDrag,
    dragGhostIndices,
  } = useChipListDnd({
    containerRef: scrollRootRef,
    itemIndexAttr: 'data-safeguard-chip-index',
    onReorder: (movingIndices, targetIndex) => {
      const ruleId = rules[movingIndices[0]!]?.id
      if (ruleId !== undefined) moveRule(ruleId, targetIndex)
    },
    copyModeEnabled: false,
    enabled: dndEnabled,
  })

  const openRuleMenu = useCallback((event: ReactMouseEvent<HTMLElement>, ruleId: string) => {
    event.preventDefault()
    event.stopPropagation()
    onSelect(ruleId)
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX || Math.round(rect.left + rect.width / 2)
    const y = event.clientY || Math.round(rect.top + rect.height / 2)
    setRuleMenu({ ruleId, x, y })
  }, [onSelect])

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

  // Inserts one or more rules at insertIndex, assigns fresh IDs, then selects and
  // scrolls to the first inserted rule so the user sees the result immediately.
  const insertSafeguardRulesAt = useCallback((rulesToInsert: SafeguardRule[], insertIndex: number) => {
    const newRuleIds: string[] = []
    mutateRules((prev) => {
      if (rulesToInsert.length === 0) return prev
      // Clamp so the caller doesn't have to worry about boundary conditions.
      const safeIndex = Math.min(Math.max(insertIndex, 0), prev.length)
      const next = prev.slice()
      let offset = 0
      for (const sourceRule of rulesToInsert) {
        // Always clone + re-id so pasted rules never share references with the source.
        const clone = cloneSafeguardRule(sourceRule)
        const cloneId = createSafeguardRuleId()
        clone.id = cloneId
        newRuleIds.push(cloneId)
        next.splice(safeIndex + offset, 0, clone)
        offset += 1
      }
      return next
    })
    const [firstId] = newRuleIds
    if (!firstId) return
    // Select and scroll to the first new rule so the builder panel updates.
    onSelect(firstId)
    scheduleScrollToRule(firstId)
  }, [mutateRules, onSelect, scheduleScrollToRule])

  const closePasteDialog = useCallback(() => {
    setPasteDialogTarget(null)
    setPasteDialogText('')
    setPasteDialogError(null)
  }, [])

  const openPasteDialog = useCallback((mode: 'after' | 'end', ruleId?: string, text = '') => {
    setPasteDialogTarget({ mode, ...(ruleId ? { ruleId } : {}) })
    setPasteDialogText(text)
    setPasteDialogError(null)
  }, [])

  const handleCopyRule = useCallback(async (ruleId: string) => {
    const source = rules.find((r) => r.id === ruleId)
    if (!source) return
    // Serialize via the canonical readable entry builder so the format stays stable.
    const snapshot = buildReadableSafeguardRuleEntry(source)
    const payload = { kind: 'safeguardRule', rule: snapshot }
    const text = JSON.stringify(payload, null, 2)
    // Fall back to the manual copy dialog when the Clipboard API is unavailable.
    const ok = await writeTextSafe(text)
    if (!ok) triggerCopyDialog(text)
  }, [rules])

  const handlePasteAfterRule = useCallback(async (ruleId: string) => {
    const text = await readTextSafe()
    const parsed = parseSafeguardClipboardRules(text)
    if (parsed.length > 0) {
      // Happy path: clipboard already holds a valid rule payload.
      const idx = rules.findIndex((r) => r.id === ruleId)
      insertSafeguardRulesAt(parsed, idx === -1 ? rules.length : idx + 1)
      return
    }
    // Clipboard content wasn't parseable; open the manual dialog pre-filled with it.
    openPasteDialog('after', ruleId, text ?? '')
  }, [insertSafeguardRulesAt, openPasteDialog, parseSafeguardClipboardRules, rules])

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
    // Resolve the insertion index from the mode and the optional anchor rule id.
    const insertIndex = mode === 'after'
      ? (() => {
        const idx = pasteDialogTarget?.ruleId ? rules.findIndex((r) => r.id === pasteDialogTarget!.ruleId) : -1
        return idx === -1 ? rules.length : idx + 1
      })()
      : rules.length
    insertSafeguardRulesAt(parsed, insertIndex)
    closePasteDialog()
  }, [closePasteDialog, insertSafeguardRulesAt, parseSafeguardClipboardRules, pasteDialogTarget, pasteDialogText, rules])

  // ── render ────────────────────────────────────────────────────────────────

  const activationColor = (activation: SafeguardRule['activation']): string => {
    if (activation === SafeguardRuleActivation.ProtectExisting) return theme.palette.success.main
    if (activation === SafeguardRuleActivation.AnticipateGaps) return theme.palette.warning.main
    return theme.palette.text.disabled
  }

  const renderChip = (rule: SafeguardRule, ruleIndex: number) => {
    const selected = selectedRuleId === rule.id
    const isEditingRuleName = editingRuleNameId === rule.id
    const rawName = (pendingNameById.get(rule.id) ?? rule.name ?? '').trim()
    const fallbackName = `${t('testerRule')} ${ruleIndex + 1}`
    const nameDecoration = parseRecipeNameDirectives(rawName || undefined, 'inherit')
    const displayName = nameDecoration.displayName || fallbackName
    const actColor = activationColor(rule.activation)
    const actText = rule.activation === SafeguardRuleActivation.ProtectExisting
      ? t('safeguardsRuleModeProtectShort')
      : rule.activation === SafeguardRuleActivation.AnticipateGaps
        ? t('safeguardsRuleModeAnticipateShort')
        : t('safeguardsRuleModeOffShort')
    // Build the ignore-flag glyph string shown after ≥ N in the mode badge.
    // These mirror the three ignore chips positioned right of the required-count
    // input in the builder: ⏩ ignore-previous, 🏆 ignore-collection, 🏦 ignore-vault.
    const ignoreParts: string[] = []
    if (rule.ignorePreviousSafeguards !== false) ignoreParts.push(GLYPH_IGNORE_PREVIOUS)
    if (rule.ignoreEquippedInCollection === true) ignoreParts.push(GLYPH_IGNORE_COLLECTION)
    if (rule.ignoreEquippedInVault === true) ignoreParts.push(GLYPH_IGNORE_VAULT)
    const perDimSuffix = ignoreParts.length > 0 ? NBSP + ignoreParts.join('') : ''
    const summary = safeguardSummaryParts(rule, metasets, {
      substatColors,
      useStatButtonColors: statButtonBorders,
      showFactionIcons,
      showSetIcons,
      showSlotIcons,
      t,
      lang,
    })
    const isFirst = ruleIndex === 0
    const isLast = ruleIndex === rules.length - 1

    return (
      <Box
        key={rule.id}
        data-safeguards-rule-id={rule.id}
        data-tour-id={`safeguards.chip.${rule.id}`}
        data-safeguard-chip-index={ruleIndex}
        data-safeguard-chip="true"
        data-linked-hover="false"
        onMouseEnter={(e) => (e.currentTarget as HTMLElement).setAttribute('data-linked-hover', 'true')}
        onMouseLeave={(e) => (e.currentTarget as HTMLElement).setAttribute('data-linked-hover', 'false')}
        onClick={() => onSelect(rule.id)}
        onContextMenu={(event) => openRuleMenu(event, rule.id)}
        onPointerDown={dndEnabled ? (e) => handleChipPointerDown(e, ruleIndex) : undefined}
        sx={(themeCtx) => {
          const hoverBg = alpha(themeCtx.palette.primary.main, themeCtx.palette.mode === 'dark' ? HOVER_BG_ALPHA.dark : HOVER_BG_ALPHA.light)
          const selectedHoverBg = alpha(themeCtx.palette.primary.main, themeCtx.palette.mode === 'dark' ? SELECTED_HOVER_BG_ALPHA.dark : SELECTED_HOVER_BG_ALPHA.light)
          return {
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
            maxWidth: '100%',
            width: '100%',
            overflow: 'hidden',
            border: '1px solid',
            borderColor: selected ? themeCtx.palette.primary.main : themeCtx.palette.divider,
            backgroundColor: selected ? themeCtx.palette.action.selected : 'transparent',
            borderRadius: `${RECIPE_CHIP_BORDER_RADIUS_PX}px`,
            pl: 1,
            pr: 0.4,
            py: `${RECIPE_CHIP_VERTICAL_PADDING_PX}px`,
            cursor: dndEnabled && !dragGhostIndices.has(ruleIndex)
              ? (hasActiveDrag ? 'grabbing' : 'grab')
              : 'pointer',
            flex: '0 0 auto',
            '&[data-linked-hover="true"]': {
              backgroundColor: selected ? selectedHoverBg : hoverBg,
              borderColor: themeCtx.palette.primary.main,
            },
            ...(dragGhostIndices.has(ruleIndex) ? {
              opacity: 0.35,
              transform: 'scale(0.985)',
              pointerEvents: 'none',
            } : {}),
          }
        }}
      >
        {/* Text content */}
        {isEditingRuleName ? (
          <>
            <Typography variant="caption" component="span" sx={{ flexShrink: 0, color: 'text.disabled', pr: 0.25 }}>
              {`${ruleIndex + 1}.`}
            </Typography>
            <TextField
              size="small"
              autoFocus
              value={pendingNameById.get(rule.id) ?? rule.name ?? ''}
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              onChange={(e) => {
                const raw = e.target.value ?? ''
                setPendingNameById((prev) => { const next = new Map(prev); next.set(rule.id, raw); return next })
                scheduleNameCommit(rule.id)
              }}
              onBlur={() => finishRuleNameEdit(rule.id, true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); finishRuleNameEdit(rule.id, true); return }
                if (e.key === 'Escape') { e.preventDefault(); finishRuleNameEdit(rule.id, false) }
              }}
              sx={{ flex: '1 1 auto', minWidth: 0, mr: 0.5 }}
              inputProps={{ style: { fontSize: '0.75rem', padding: '2px 6px' } }}
            />
            <Box component="span" sx={{ color: actColor, fontWeight: 600, fontSize: '0.75rem', flexShrink: 0, mr: 0.5 }}>
              {actText}{NBSP}≥{NBSP}{rule.requiredCount ?? 1}{perDimSuffix}
            </Box>
          </>
        ) : (
          <Typography
            variant="caption"
            sx={{ mr: 0.5, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', wordBreak: 'break-word', overflowWrap: 'anywhere' }}
          >
            <Box component="span" sx={{ display: 'inline' }}>
              {`${ruleIndex + 1}. `}
              <Box
                component="span"
                onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); startRuleNameEdit(rule.id, rule.name ?? '') }}
                onKeyDown={(e) => {
                  if (e.key !== 'F2') return
                  e.preventDefault(); e.stopPropagation()
                  startRuleNameEdit(rule.id, rule.name ?? '')
                }}
                sx={{
                  fontStyle: rawName ? 'normal' : 'italic',
                  color: rawName
                    ? (nameDecoration.hasExplicitColor ? nameDecoration.resolvedColor : 'inherit')
                    : 'text.secondary',
                }}
              >
                {displayName}
              </Box>
              {' — '}
              {/* Mode badge: activation label + quota + active per-dim glyphs (with ∀ when selection is any). */}
              <Box component="span" sx={{ color: actColor, fontWeight: 600 }}>{actText}{NBSP}≥{NBSP}{rule.requiredCount ?? 1}{perDimSuffix}</Box>
              {summary ? <>{' | '}{summary}</> : null}
            </Box>
          </Typography>
        )}

        {/* Action buttons — directly in the row, matching RecipeChip */}
        <IconButton
          size="small"
          aria-label={t('chipMenuMoveUp')}
          disabled={isFirst}
          onClick={(e) => { e.stopPropagation(); moveRule(rule.id, ruleIndex - 1) }}
          sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
        >
          <ArrowUpwardIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          size="small"
          aria-label={t('chipMenuMoveDown')}
          disabled={isLast}
          onClick={(e) => { e.stopPropagation(); moveRule(rule.id, ruleIndex + 1) }}
          sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
        >
          <ArrowDownwardIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          size="small"
          aria-label={t('safeguardsDuplicateRule')}
          onClick={(e) => { e.stopPropagation(); handleDuplicateRule(rule.id) }}
          sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
        >
          <ContentCopyIcon fontSize="inherit" />
        </IconButton>
        <IconButton
          size="small"
          aria-label={t('safeguardsDeleteRule')}
          onClick={(e) => { e.stopPropagation(); setPendingDeleteRuleId(rule.id) }}
          color="error"
          sx={{ width: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, height: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minWidth: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, minHeight: RECIPE_CHIP_CONTROL_BUTTON_SIZE_PX, p: 0.25 }}
        >
          <DeleteOutlineIcon fontSize="inherit" />
        </IconButton>
      </Box>
    )
  }

  const pasteDialogConfirmLabel = pasteDialogTarget?.mode === 'after'
    ? t('chipMenuPasteAfter')
    : t('chipsMenuPasteAtEnd')

  return (
    <>
      <RecipeContextMenu
        open={Boolean(ruleMenu)}
        anchorPosition={ruleMenu ? { top: ruleMenu.y, left: ruleMenu.x } : null}
        onClose={() => setRuleMenu(null)}
        paperRef={ruleMenuRef}
        paperDataTourId="keepuniques.rule-menu"
        onPaperContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        contextMenuGuard={ruleMenuGuard}
        actions={(() => {
          if (!ruleMenu) return {}
          const idx = rules.findIndex((r) => r.id === ruleMenu.ruleId)
          const isFirst = idx <= 0
          const isLast = idx < 0 || idx === rules.length - 1
          return {
            moveTop: { handler: () => moveRule(ruleMenu.ruleId, 0), disabled: isFirst },
            moveUp: { handler: () => moveRule(ruleMenu.ruleId, idx - 1), disabled: isFirst },
            moveDown: { handler: () => moveRule(ruleMenu.ruleId, idx + 1), disabled: isLast },
            moveBottom: { handler: () => moveRule(ruleMenu.ruleId, rules.length - 1), disabled: isLast },
            copyRecipe: () => handleCopyRule(ruleMenu.ruleId),
            pasteAfter: () => handlePasteAfterRule(ruleMenu.ruleId),
            pasteAtEnd: handlePasteAtEnd,
            deleteAll: { handler: () => setPendingDeleteAll(true), disabled: rules.length === 0, labelKey: 'safeguardsDeleteAll' },
          }
        })()}
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
      <Dialog open={pendingDeleteRuleId !== null} onClose={() => setPendingDeleteRuleId(null)}>
        <DialogTitle>{t('safeguardsDeleteRuleTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('safeguardsDeleteRuleMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDeleteRuleId(null)}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmDeleteRule}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
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
          minHeight: isSideBySide ? 0 : (() => {
            const max = maxHeightPx ?? 0
            if (max <= 0) return 0
            return max
          })(),
          overflowY: 'auto',
          overflowX: 'hidden',
          alignItems: 'stretch',
          position: 'relative',
          pr: themeInner.spacing(1),
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
            boxShadow: `0 0 8px ${alpha(themeInner.palette.primary.main, 0.6)}`,
            zIndex: 5,
          })} />
        ) : null}
        {rules.length === 0 ? (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', color: 'text.secondary', py: 0.5 }}>
            <Typography variant="body2" sx={{ textAlign: 'center' }}>{t('safeguardsNoRules')}</Typography>
          </Box>
        ) : (
          rules.map((rule, index) => {
            if (visibleRuleIds && !visibleRuleIds.has(rule.id)) return null
            return renderChip(rule, index)
          })
        )}
      </Box>

    </>
  )
}
