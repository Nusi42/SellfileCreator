import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import FilterListOffIcon from '@mui/icons-material/FilterListOff'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { alpha, useTheme } from '@mui/material/styles'
import {
  KEEP_BEST_SUBSTAT_VARIANTS,
  createKeepBestSubstatRuleId,
  type KeepBestSubstatDetectionEntry,
  type KeepBestSubstatDetectionSnapshot,
  type KeepBestSubstatRule,
} from '../../lib/keepBestSubstat'
import {
  KEEP_UNIQUE_DEFAULT_COUNT_MODE,
  getKeepUniqueItemKey,
  sanitizeKeepUniqueCountMode,
} from '../../lib/keepUniques'
import { statVariantI18nKey, type StatVariant } from '../../lib/types'
import { useI18n } from '../../lib/i18n'
import { GearMainStatSelect } from '../gear'
import { TesterItemsGrid } from '../TesterItemsGrid'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import WorkloadProgressIndicator from '../WorkloadProgressIndicator'
// MarkdownTooltip keeps the info/help icons aligned with the rest of the dialog hints.
import MarkdownTooltip from '../MarkdownTooltip'
import EllipsisTooltip from '../EllipsisTooltip'
import {
  STANDARD_DIALOG_PADDING_BLOCK_UNITS,
  STANDARD_DIALOG_PADDING_INLINE_UNITS,
  MENU_CONTROL_HEIGHT_PX,
  type ColorBlindMode,
} from '../../lib/constants'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import {
  resolveKeepOverrideScopeActive,
  toggleKeepOverrideCountMode,
  type KeepOverrideScopeKey,
} from '../../lib/keepOverrideScope'
import { KeepOverrideScopeChip } from '../keepOverrides/KeepOverrideScopeChip'
import {
  KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_COMPACT_PX,
  KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_PX,
  resolveKeepOverrideGridPaneWidth,
} from '../../lib/keepOverrideLayout'
import {
  parseSpacingPx,
  TESTER_GRID_COLUMN_GAP_UNITS,
  TESTER_GRID_CONTAINER_PADDING_END_UNITS,
  TESTER_GRID_ROW_PADDING_UNITS,
} from '../../lib/testerGridLayout'
import { useKeepBestSubstatGridColumnMode, useKeepBestSubstatGridFilterMode } from '../../state/keepBestSubstatPreferences'
import type { SetStateAction } from 'react'
import type { TesterPreviewRow } from '../../types/testerPreview'

// Keep-best headers should stay a consistent height even when labels wrap.
const KEEP_BEST_RULE_HEADER_MIN_HEIGHT_PX = 52

type KeepBestSubstatTabProps = {
  rules: KeepBestSubstatRule[]
  enabled: boolean
  onRulesChange: (next: SetStateAction<KeepBestSubstatRule[]>) => void
  onToggleEnabled: (next: SetStateAction<boolean>) => void
  detection: KeepBestSubstatDetectionSnapshot | null
  gearEntries: TesterPreviewRow[]
  bestItemKeys: ReadonlySet<number>
  testerCardWidthPx: number | null
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  configNames: Array<string | null>
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  suppressMatchDetails?: boolean
  workloadProgressRatio: number
}

export default function KeepBestSubstatTab({
  rules,
  enabled,
  onRulesChange,
  onToggleEnabled,
  detection,
  gearEntries,
  bestItemKeys,
  testerCardWidthPx,
  substatColors,
  useStatButtonColors,
  onToggleStatColors,
  onOpenManageColors,
  colorBlindMode,
  onChangeColorBlindMode,
  colorIconSrc,
  configNames,
  onJumpToRule,
  suppressMatchDetails = false,
  workloadProgressRatio,
}: KeepBestSubstatTabProps) {
  const { t } = useI18n()
  const theme = useTheme()
  // Grid layout uses the same spacing units as the tester grid.
  const gridGapPx = useMemo(() => parseSpacingPx(theme.spacing(TESTER_GRID_COLUMN_GAP_UNITS)), [theme])
  // Row padding is applied on both sides of the card row container.
  const gridRowPaddingPx = useMemo(() => parseSpacingPx(theme.spacing(TESTER_GRID_ROW_PADDING_UNITS)), [theme])
  // Scroll container padding must be accounted for when sizing the grid pane.
  const gridContainerPaddingEndPx = useMemo(
    () => parseSpacingPx(theme.spacing(TESTER_GRID_CONTAINER_PADDING_END_UNITS)),
    [theme],
  )
  // Scrollbar width is measured from the grid so pane width stays aligned.
  const [gridScrollbarWidthPx, setGridScrollbarWidthPx] = useState(0)
  // Filter mode (all vs selection) is stored locally, matching Keep Uniques behavior.
  const [gridFilterMode, setGridFilterMode] = useKeepBestSubstatGridFilterMode()
  // Column preference is local to this tab so the rules column can grow when needed.
  const [gridColumnMode, setGridColumnMode] = useKeepBestSubstatGridColumnMode()
  // Selection defaults to the first rule so the grid highlights immediately.
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(() => rules[0]?.id ?? null)
  // Manual deselect keeps a "no selection" state for the selection filter.
  const [respectManualDeselect, setRespectManualDeselect] = useState(false)
  // Expansion state allows a collapsed list when many rules exist.
  const [expandedRuleIds, setExpandedRuleIds] = useState<ReadonlySet<string>>(() => {
    const firstId = rules[0]?.id
    // If only one rule exists, open it by default for quick editing.
    if (rules.length === 1 && firstId) return new Set([firstId])
    return new Set()
  })
  // Pending deletion uses a confirm dialog to avoid accidental wipes.
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null)
  // Scroll refs keep new rules in view after insert/duplicate.
  const rulesScrollRootRef = useRef<HTMLDivElement | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const scheduleScrollToRule = useCallback((ruleId: string) => {
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    // Adding/duplicating a rule updates state; retry for a few frames until the DOM node exists.
    const maxAttempts = 8
    const tryScroll = (attempt: number) => {
      const scrollRoot = rulesScrollRootRef.current
      const target = scrollRoot?.querySelector(`[data-keep-best-rule-id="${ruleId}"]`) as HTMLElement | null
      if (target) {
        target.scrollIntoView({ block: 'nearest' })
        scrollRafRef.current = null
        return
      }
      if (attempt >= maxAttempts) {
        scrollRafRef.current = null
        return
      }
      scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(attempt + 1))
    }
    scrollRafRef.current = window.requestAnimationFrame(() => tryScroll(0))
  }, [])
  // Edits should re-enable keep-best so users do not lose changes silently.
  const ensureKeepBestEnabled = useCallback(() => {
    if (!enabled) onToggleEnabled(true)
  }, [enabled, onToggleEnabled])
  // Shared mutation helper keeps rule edits and enable toggles aligned.
  const mutateRules = useCallback(
    (action: SetStateAction<KeepBestSubstatRule[]>, ensureEnabled = true) => {
      if (ensureEnabled) ensureKeepBestEnabled()
      onRulesChange(action)
    },
    [ensureKeepBestEnabled, onRulesChange],
  )
  // Align the selected rule id to the live list while honoring manual deselect.
  const effectiveSelectedRuleId = useMemo(() => {
    if (selectedRuleId === null) {
      if (respectManualDeselect) return null
      return rules[0]?.id ?? null
    }
    return rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : (rules[0]?.id ?? null)
  }, [respectManualDeselect, rules, selectedRuleId])
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- Rules can disappear outside local handlers, so we realign selection when the autosave payload swaps in. */
  // Clear selection state when the rules list is emptied by resets/imports.
  useEffect(() => {
    if (rules.length !== 0) return
    if (selectedRuleId !== null) setSelectedRuleId(null)
    if (respectManualDeselect) setRespectManualDeselect(false)
  }, [respectManualDeselect, rules.length, selectedRuleId])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */
  // Detection lookup map makes per-rule counts cheap during render.
  const detectionEntries = useMemo(() => detection?.entries ?? [], [detection])
  const detectionByRuleId = useMemo(() => {
    const map = new Map<string, KeepBestSubstatDetectionEntry>()
    for (const entry of detectionEntries) {
      if (entry.ruleId) map.set(entry.ruleId, entry)
    }
    return map
  }, [detectionEntries])
  // Selected entry powers the grid highlight + selection mode.
  const selectedEntry = effectiveSelectedRuleId ? detectionByRuleId.get(effectiveSelectedRuleId) ?? null : null
  const selectedItemKeys = useMemo(() => new Set<number>(selectedEntry?.itemKeys ?? []), [selectedEntry])
  // Keep-best grid only shows items protected by the current keep-best detection.
  const bestRows = useMemo(() => {
    if (bestItemKeys.size === 0) return []
    if (bestItemKeys.size === gearEntries.length) return gearEntries
    return gearEntries.filter((row) => bestItemKeys.has(getKeepUniqueItemKey(row.artifact)))
  }, [bestItemKeys, gearEntries])
  // Highlight callback lets the tester grid fade non-matching cards instead of mutating the dataset.
  const highlightRowPredicate = useMemo(() => {
    if (!selectedEntry || selectedItemKeys.size === 0) return null
    return (row: TesterPreviewRow) => selectedItemKeys.has(getKeepUniqueItemKey(row.artifact))
  }, [selectedEntry, selectedItemKeys])
  const highlightActive = Boolean(highlightRowPredicate)
  // Treat selection mode as active whenever a rule is selected, even with zero matches.
  const selectionFilterApplied = gridFilterMode === 'selection' && Boolean(selectedEntry)
  const gridRows = useMemo(() => {
    if (!selectionFilterApplied) return bestRows
    if (!highlightRowPredicate) return []
    return bestRows.filter((row) => highlightRowPredicate(row))
  }, [bestRows, highlightRowPredicate, selectionFilterApplied])
  // Count how many highlighted items are currently visible in the grid.
  const selectedVisibleRowCount = useMemo(() => {
    if (!selectedEntry || selectedEntry.itemKeys.length === 0) return 0
    let count = 0
    for (const key of selectedEntry.itemKeys) {
      if (bestItemKeys.has(key)) count += 1
    }
    return count
  }, [bestItemKeys, selectedEntry])
  // Highlight mode becomes a filter only when it hides items.
  const highlightFilterActive = highlightActive && !selectionFilterApplied && bestRows.length > selectedVisibleRowCount
  const gridFiltered = highlightFilterActive || selectionFilterApplied || gearEntries.length > bestRows.length
  const hasPreviewGear = gearEntries.length > 0
  // Selection chip mirrors the Keep Uniques UX: show counts even with no selection.
  const selectionChipLabel = useMemo(() => {
    if (selectedEntry) {
      return t('keepBestSubstatGridSelectedCount', { count: selectedVisibleRowCount })
    }
    if (gearEntries.length === 0 && bestRows.length === 0) return null
    return t('keepBestSubstatGridBestCount', { count: bestRows.length })
  }, [bestRows.length, gearEntries.length, selectedEntry, selectedVisibleRowCount, t])
  // Change handler for the selection filter toggle.
  const handleToggleGridFilterMode = useCallback(() => {
    setGridFilterMode((prev) => (prev === 'all' ? 'selection' : 'all'))
  }, [setGridFilterMode])
  // Default new rules to the first stat in the canonical priority list.
  const defaultRuleSubstat = KEEP_BEST_SUBSTAT_VARIANTS[0] ?? (0 as StatVariant)
  const handleAddRule = useCallback(() => {
    const newRule: KeepBestSubstatRule = {
      id: createKeepBestSubstatRuleId(),
      substat: defaultRuleSubstat,
      requiredCount: 1,
      countMode: { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE },
    }
    mutateRules((prev) => [...prev, newRule])
    setSelectedRuleId(newRule.id)
    setRespectManualDeselect(false)
    setExpandedRuleIds((prev) => {
      const next = new Set(prev)
      next.add(newRule.id)
      return next
    })
    scheduleScrollToRule(newRule.id)
  }, [defaultRuleSubstat, mutateRules, scheduleScrollToRule])
  const updateRule = useCallback((
    ruleId: string,
    updater: (prev: KeepBestSubstatRule) => KeepBestSubstatRule,
    ensureEnabled = true,
  ) => {
    mutateRules((prev) => prev.map((rule) => (
      rule.id === ruleId ? updater(rule) : rule
    )), ensureEnabled)
  }, [mutateRules])
  const handleDeleteRule = useCallback((ruleId: string) => {
    let filtered: KeepBestSubstatRule[] = []
    mutateRules((prev) => {
      filtered = prev.filter((rule) => rule.id !== ruleId)
      return filtered
    })
    if (filtered.length === 0) {
      if (selectedRuleId !== null) setSelectedRuleId(null)
      setRespectManualDeselect(false)
      return
    }
    if (selectedRuleId === ruleId) {
      setSelectedRuleId(filtered[0]?.id ?? null)
      setRespectManualDeselect(false)
    }
    setExpandedRuleIds((prev) => {
      if (!prev.has(ruleId)) return prev
      const next = new Set(prev)
      next.delete(ruleId)
      return next
    })
  }, [mutateRules, selectedRuleId])
  const handleCancelDeleteRule = useCallback(() => {
    setPendingDeleteRuleId(null)
  }, [])
  const handleConfirmDeleteRule = useCallback(() => {
    if (!pendingDeleteRuleId) return
    handleDeleteRule(pendingDeleteRuleId)
    setPendingDeleteRuleId(null)
  }, [handleDeleteRule, pendingDeleteRuleId])
  const handleDuplicateRule = useCallback((ruleId: string) => {
    let newRuleId: string | null = null
    mutateRules((prev) => {
      const idx = prev.findIndex((rule) => rule.id === ruleId)
      if (idx === -1) return prev
      const source = prev[idx]
      if (!source) return prev
      const cloneId = createKeepBestSubstatRuleId()
      newRuleId = cloneId
      const duplicated: KeepBestSubstatRule = {
        ...source,
        id: cloneId,
        countMode: { ...source.countMode },
      }
      const next = prev.slice()
      next.splice(idx + 1, 0, duplicated)
      return next
    })
    if (newRuleId) {
      setSelectedRuleId(newRuleId)
      setRespectManualDeselect(false)
      setExpandedRuleIds((prev) => {
        const next = new Set(prev)
        next.add(newRuleId as string)
        return next
      })
      scheduleScrollToRule(newRuleId)
    }
  }, [mutateRules, scheduleScrollToRule])
  const toggleAllExpandedRules = useCallback(() => {
    setExpandedRuleIds((prev) => {
      if (rules.length === 0) return prev
      const allExpanded = rules.every((rule) => prev.has(rule.id))
      return allExpanded ? new Set() : new Set(rules.map((rule) => rule.id))
    })
  }, [rules])
  const renderRuleCard = (rule: KeepBestSubstatRule, ruleIndex: number) => {
    // Pull the matching detection entry so counts render with the rule.
    const ruleDetection = detectionByRuleId.get(rule.id) ?? null
    // Selection drives grid highlight and filter mode.
    const selected = effectiveSelectedRuleId === rule.id
    // Expanded state controls whether the rule editor is visible.
    const expanded = expandedRuleIds.has(rule.id)
    // Keep click/focus selection centralized for all card interactions.
    const selectRule = () => {
      setSelectedRuleId(rule.id)
      setRespectManualDeselect(false)
    }
    // Expansion toggles are independent of the rule selection.
    const toggleExpanded = () => {
      setExpandedRuleIds((prev) => {
        const next = new Set(prev)
        if (next.has(rule.id)) next.delete(rule.id)
        else next.add(rule.id)
        return next
      })
    }
    // Title clicks should both expand and select for fast workflows.
    const handleRuleTitleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      toggleExpanded()
      selectRule()
    }
    // Delete button is isolated so we can show a confirm dialog.
    const deleteButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); setPendingDeleteRuleId(rule.id) }}
        aria-label={t('keepBestSubstatDeleteRule')}
        color="error"
        sx={{ p: 0.5 }}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    )
    // Duplicate clones the rule payload and inserts next to the source.
    const duplicateButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); handleDuplicateRule(rule.id) }}
        aria-label={t('keepBestSubstatDuplicateRule')}
        sx={{ p: 0.5 }}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    )
    // Keep the action button cluster aligned to the header right edge.
    const actionButtons = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', flexShrink: 0 }}>
        {duplicateButton}
        {deleteButton}
      </Box>
    )
    // Normalize the count mode so scope chips remain in sync.
    const countMode = sanitizeKeepUniqueCountMode(rule.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE)
    // Labels are shared between chips and the rule counts tooltip.
    const perSlotLabel = t('keepUniquesCountModePerSlot')
    const perSetLabel = t('keepUniquesCountModePerSet')
    const perFactionLabel = t('keepUniquesCountModePerFaction')
    const perMainLabel = t('keepUniquesCountModePerMain')
    // Resolve which per-group scopes are active.
    const scopeActive = resolveKeepOverrideScopeActive(countMode)
    // Toggle the per-group scope flags for the rule.
    const handleScopeChipToggle = (scope: KeepOverrideScopeKey) => {
      updateRule(rule.id, (prev) => {
        // Always toggle from the canonical default if missing.
        const prevMode = prev.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE
        const nextMode = toggleKeepOverrideCountMode(prevMode, scope)
        return { ...prev, countMode: nextMode }
      })
    }
    // Compose a scope chip renderer for each field.
    const renderScopeChip = (scope: KeepOverrideScopeKey, label: string, active: boolean) => (
      <KeepOverrideScopeChip
        scope={scope}
        label={label}
        active={active}
        onToggle={handleScopeChipToggle}
      />
    )
    // Build the counts label so the chip can be hovered for details.
    const ruleCountsLabel = ruleDetection
      ? t('keepBestSubstatRuleCounts', {
        top: ruleDetection.topCount,
        keep: ruleDetection.soldCount,
      })
      : ''
    // Use green when the rule is keeping any sold items.
    const ruleCountsColor = (ruleDetection?.soldCount ?? 0) > 0 ? 'success.main' : 'text.secondary'
    // Append per-group details when the rule is scoped.
    const detectionScopeSuffix = (() => {
      if (!ruleDetection) return ''
      const mode = sanitizeKeepUniqueCountMode(ruleDetection.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE)
      if (mode.perRule || ruleDetection.groupsTracked === 0) return ''
      const scopeParts: string[] = []
      if (mode.perSlot) scopeParts.push(perSlotLabel)
      if (mode.perSet) scopeParts.push(perSetLabel)
      if (mode.perFaction) scopeParts.push(perFactionLabel)
      if (mode.perMainStat) scopeParts.push(perMainLabel)
      const scopeLabel = scopeParts.join(' × ')
      return t('keepBestSubstatRuleCountsPerGroupSuffix', {
        perGroup: ruleDetection.perGroupRequiredCount,
        groups: ruleDetection.groupsTracked,
        scope: scopeLabel,
      })
    })()
    // Tooltip shows the main count plus any per-group suffix.
    const ruleCountsTooltip = detectionScopeSuffix
      ? `${ruleCountsLabel}\n${detectionScopeSuffix}`
      : ruleCountsLabel
    // Default rule label falls back to the index when stat labels are missing.
    const statLabel = t(statVariantI18nKey(rule.substat))
    const summaryTitle = statLabel || t('keepBestSubstatRuleDefaultLabel', { index: ruleIndex + 1 })
    return (
      <Box
        key={rule.id}
        // Click any part of the card to update the selection.
        onClickCapture={selectRule}
        // Focus interactions should align with click selection.
        onFocusCapture={selectRule}
        sx={{
          borderRadius: '8px',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider',
          bgcolor: 'inherit',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gridTemplateRows: 'auto',
            columnGap: 1,
            alignItems: 'center',
            minHeight: KEEP_BEST_RULE_HEADER_MIN_HEIGHT_PX,
            px: 1.25,
            py: 0.875,
            textAlign: 'left',
            // Selected rules keep the dialog accent tint.
            backgroundColor: selected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
            borderBottom: expanded ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          {/* Title button is the primary expand/collapse target. */}
          <EllipsisTooltip title={summaryTitle}>
            <ButtonBase
              onClick={handleRuleTitleClick}
              sx={{
                gridColumn: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                minWidth: 0,
                textAlign: 'left',
              }}
            >
              <Typography
                variant="body2"
                data-ellipsis-target
                sx={{
                  minWidth: 0,
                  fontWeight: 500,
                  // Clamp long labels to two lines without changing height.
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {summaryTitle}
              </Typography>
            </ButtonBase>
          </EllipsisTooltip>
          <Box
            sx={{
              gridColumn: 2,
              display: 'grid',
              gridAutoFlow: 'column',
              alignItems: 'center',
              justifyContent: 'end',
              gap: 0.75,
              flexShrink: 0,
            }}
          >
            {/* Keep actions on the right edge for consistency with Keep Uniques. */}
            {actionButtons}
            <IconButton
              size="small"
              aria-label={expanded ? t('collapse') : t('expand')}
              sx={{ p: 0.5, color: 'text.secondary' }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (event.ctrlKey) {
                  // Ctrl+click toggles all rules at once.
                  toggleAllExpandedRules()
                  return
                }
                // Default toggle only affects this rule.
                toggleExpanded()
              }}
              onContextMenu={(event) => {
                // Right-click toggles all rules without opening the browser menu.
                event.preventDefault()
                event.stopPropagation()
                toggleAllExpandedRules()
              }}
            >
              {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
        {expanded ? (
          <Stack spacing={1.5} sx={{ p: 1.25 }}>
            {/* Substat selection sits first because it is the rule anchor. */}
            <Stack spacing={0.75}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {t('keepBestSubstatRuleSubstatLabel')}
                </Typography>
                {/* Info hint reuses the count-mode tooltip from Keep Uniques. */}
                <MarkdownTooltip markdown={t('keepUniquesCountModeHint')}>
                  <IconButton
                    size="small"
                    color="inherit"
                    aria-label={t('keepUniquesCountModeHintLabel')}
                    sx={{
                      p: 0.25,
                      fontSize: 16,
                      color: 'text.secondary',
                      '&:hover': { color: 'text.primary' },
                      '&:focus-visible': { color: 'text.primary' },
                    }}
                  >
                    <InfoOutlinedIcon fontSize="inherit" />
                  </IconButton>
                </MarkdownTooltip>
              </Box>
              {/* Single-select stat picker uses canonical keep-best variants. */}
              <GearMainStatSelect
                value={rule.substat}
                onChange={(next) => {
                  updateRule(rule.id, (prev) => ({ ...prev, substat: next }))
                }}
                options={KEEP_BEST_SUBSTAT_VARIANTS}
                colorOverrides={substatColors}
                showBorderColors={useStatButtonColors}
                size="small"
              />
            </Stack>
            {/* Scope chips define which dimensions get per-group top-N protection. */}
            <Stack spacing={0.75}>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {t('keepBestSubstatScopeLabel')}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {/* Keep the order aligned with Keep Uniques. */}
                {renderScopeChip('perSlot', perSlotLabel, scopeActive.perSlot)}
                {renderScopeChip('perSet', perSetLabel, scopeActive.perSet)}
                {renderScopeChip('perFaction', perFactionLabel, scopeActive.perFaction)}
                {renderScopeChip('perMainStat', perMainLabel, scopeActive.perMainStat)}
              </Box>
            </Stack>
            {/* Required count is the number of top items kept per active scope. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label={t('keepBestSubstatRequiredCount')}
                value={rule.requiredCount}
                onChange={(event) => {
                  // Clamp to safe integers and ensure at least 1.
                  const raw = Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1)))
                  updateRule(rule.id, (prev) => ({ ...prev, requiredCount: raw }))
                }}
                InputProps={{
                  // Prefix matches the "keep at least N" language.
                  startAdornment: <InputAdornment position="start">≥</InputAdornment>,
                  endAdornment: (
                    <NumberSpinnerAdornment
                      ariaLabel={t('keepBestSubstatRequiredCount')}
                      onStep={(delta) => {
                        updateRule(rule.id, (prev) => {
                          // Spinner keeps the value in sync with clamps.
                          const next = Math.max(1, Math.min(9999, Math.floor((prev.requiredCount ?? 1) + delta)))
                          return { ...prev, requiredCount: next }
                        })
                      }}
                    />
                  ),
                }}
                sx={(themeInner) => ({
                  // Hide default number spinners to keep the design compact.
                  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                    WebkitAppearance: 'none',
                    margin: 0,
                  },
                  '& input[type=number]': {
                    MozAppearance: 'textfield',
                  },
                  '& input': {
                    // Right-align values so counts line up at a glance.
                    textAlign: 'right',
                    paddingRight: themeInner.spacing(1),
                    paddingLeft: themeInner.spacing(0.5),
                  },
                })}
                inputProps={{
                  // HTML constraints keep keyboard entry aligned with clamps.
                  min: 1,
                  step: 1,
                  max: 9999,
                }}
              />
              {ruleDetection ? (
                // Tooltip echoes counts and scope breakdowns.
                <MarkdownTooltip markdown={ruleCountsTooltip}>
                  <IconButton
                    size="small"
                    color="inherit"
                    aria-label={ruleCountsTooltip}
                    sx={{
                      p: 0.25,
                      fontSize: 16,
                      // Use green when keep-best is actively protecting items.
                      color: ruleCountsColor,
                      '&:hover': { color: ruleCountsColor === 'success.main' ? 'success.dark' : 'text.primary' },
                      '&:focus-visible': { color: ruleCountsColor === 'success.main' ? 'success.dark' : 'text.primary' },
                    }}
                  >
                    <InfoOutlinedIcon fontSize="inherit" />
                  </IconButton>
                </MarkdownTooltip>
              ) : null}
            </Box>
          </Stack>
        ) : null}
      </Box>
    )
  }
  const deleteDialogOpen = pendingDeleteRuleId !== null
  return (
    <>
      {/* Confirm dialog prevents accidental deletes. */}
      <Dialog open={deleteDialogOpen} onClose={handleCancelDeleteRule}>
        <DialogTitle>{t('keepBestSubstatDeleteRuleTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('keepBestSubstatDeleteRuleMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteRule}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmDeleteRule}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      <Box
        sx={{
          // Fill the tab height so the grid can scroll.
          flex: 1,
          minHeight: 0,
          height: '100%',
          // Match dialog padding to Keep Uniques for alignment.
          px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
          py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            display: { xs: 'block', md: 'grid' },
            // Keep-override grid pane matches the Rule Tester 4-column card width.
            gridTemplateColumns: { md: (() => {
              // Allow a tighter rules column in 2-column mode so the grid doesn't shift right.
              const rulesColumnMinWidth = gridColumnMode === 2
                ? KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_COMPACT_PX
                : KEEP_OVERRIDE_RULES_COLUMN_MIN_WIDTH_PX
              // Use the measured tester card width so 1/2-column modes keep cards identical.
              const gridPaneWidth = resolveKeepOverrideGridPaneWidth({
                gridColumnMode,
                targetCardWidthPx: testerCardWidthPx,
                containerPaddingInlineEndPx: gridContainerPaddingEndPx,
                containerScrollbarWidthPx: gridScrollbarWidthPx,
                gridGapPx,
                rowPaddingPx: gridRowPaddingPx,
              })
              // Fall back to a flexible grid pane if the tester width is unknown.
              return gridPaneWidth
                ? `minmax(${rulesColumnMinWidth}px, 1fr) ${gridPaneWidth}`
                : `minmax(${rulesColumnMinWidth}px, 1fr) minmax(0, 1fr)`
            })() },
            height: '100%',
            gap: 2,
          }}
        >
          <Box data-tour-id="keepbest.rules" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">{t('keepBestSubstatTabLabel')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('keepBestSubstatTabIntro')}</Typography>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={enabled}
                      onChange={(_, checked) => onToggleEnabled(checked)}
                    />
                  )}
                  label={(
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography component="span">{t('keepBestSubstatEnableLabel')}</Typography>
                    </Stack>
                  )}
                />
              </Stack>
            </Box>
            <KeepBestSubstatRuleList rules={rules} renderRule={renderRuleCard} scrollRootRef={rulesScrollRootRef} />
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="contained" onClick={handleAddRule} sx={{ minHeight: MENU_CONTROL_HEIGHT_PX }}>
                {t('keepBestSubstatAddRule')}
              </Button>
            </Box>
          </Box>
          <Box
            data-tour-id="keepbest.grid"
            sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
          >
            {/* Grid header keeps filter + progress + count aligned. */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Box sx={{ flex: '0 0 auto' }}>
                <MarkdownTooltip markdown={t('keepBestSubstatGridFilterTooltip')}>
                  <span>
                    <Button
                      size="small"
                      color="success"
                      variant={gridFilterMode === 'selection' ? 'contained' : 'outlined'}
                      // Toggle between all rows and current selection only.
                      onClick={handleToggleGridFilterMode}
                      aria-pressed={gridFilterMode === 'selection'}
                      startIcon={gridFilterMode === 'selection' ? <FilterListIcon fontSize="small" /> : <FilterListOffIcon fontSize="small" />}
                      sx={{
                        height: MENU_CONTROL_HEIGHT_PX,
                        minHeight: MENU_CONTROL_HEIGHT_PX,
                        px: 1.25,
                        '& .MuiTypography-root': { fontWeight: 600 },
                      }}
                    >
                      {t('keepBestSubstatGridFilterLabel', {
                        mode: gridFilterMode === 'selection'
                          ? t('keepBestSubstatGridFilterModeSelection')
                          : t('keepBestSubstatGridFilterModeAll'),
                      })}
                    </Button>
                  </span>
                </MarkdownTooltip>
              </Box>
              <Box
                sx={{
                  flex: '1 1 auto',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: 0,
                }}
              >
                {/* Shared spinner keeps the dialog aligned with preview status. */}
                <WorkloadProgressIndicator progressRatio={workloadProgressRatio} ariaLabel={t('keepBestSubstatScanPending')} />
                {selectionChipLabel ? (
                  <Chip
                    size="small"
                    label={selectionChipLabel}
                    sx={{ flexShrink: 0 }}
                  />
                ) : null}
              </Box>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <TesterItemsGrid
                // Keep-best uses the keep-override variant for empty states + column toggle.
                rows={gridRows}
                filterActive={gridFiltered}
                substatColors={substatColors}
                useStatButtonColors={useStatButtonColors}
                onToggleStatColors={onToggleStatColors}
                onOpenManageColors={onOpenManageColors}
                colorBlindMode={colorBlindMode}
                onChangeColorBlindMode={onChangeColorBlindMode}
                colorIconSrc={colorIconSrc}
                configNames={configNames}
                onJumpToRule={onJumpToRule}
                variant="keepBestSubstat"
                keepBestSubstatEnabled={enabled}
                keepOverrideColumnMode={gridColumnMode}
                onKeepOverrideColumnModeChange={setGridColumnMode}
                onScrollbarWidthMeasured={setGridScrollbarWidthPx}
                highlightedRowPredicate={highlightRowPredicate ?? null}
                dimUnhighlightedRows={highlightActive}
                suppressMatchDetails={suppressMatchDetails}
                hasTesterData={hasPreviewGear}
                emptyStateOptions={!hasPreviewGear ? {
                  borderVariant: 'dashed',
                  minHeight: '100%',
                  sx: { height: '100%', px: STANDARD_DIALOG_PADDING_INLINE_UNITS },
                } : undefined}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </>
  )
}

type KeepBestSubstatRuleListProps = {
  rules: KeepBestSubstatRule[]
  renderRule: (rule: KeepBestSubstatRule, ruleIndex: number) => ReactNode
  scrollRootRef: RefObject<HTMLDivElement | null>
}

function KeepBestSubstatRuleList({ rules, renderRule, scrollRootRef }: KeepBestSubstatRuleListProps) {
  const { t } = useI18n()
  return (
    <Box
      ref={scrollRootRef}
      sx={(theme) => ({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowAnchor: 'none',
        pt: 2,
        pr: 1,
        ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: theme.spacing(1) }),
      })}
    >
      {rules.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('keepBestSubstatNoRules')}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 2 }}>
          {rules.map((rule, index) => (
            <Box
              key={rule.id}
              data-keep-best-rule-id={rule.id}
              sx={{ overflowAnchor: 'none' }}
            >
              {renderRule(rule, index)}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
