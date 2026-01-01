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
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  Typography,
} from '@mui/material'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import FilterListIcon from '@mui/icons-material/FilterList'
import FilterListOffIcon from '@mui/icons-material/FilterListOff'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  KEEP_UNIQUE_DEFAULT_COUNT_MODE,
  KeepUniqueRuleActivation,
  sanitizeKeepUniqueCountMode,
  type KeepUniqueDetectionEntry,
  type KeepUniqueDetectionSnapshot,
  type KeepUniqueRule,
} from '../../lib/keepUniques'
import { createKeepUniqueRuleId, getKeepUniqueItemKey } from '../../lib/keepUniques'
import type { TesterPreviewRow } from '../../types/testerPreview'
import type { ColorBlindMode } from '../../lib/constants'
import {
  FONT_SIZE_BASE_PX,
  MENU_CONTROL_HEIGHT_PX,
  STANDARD_DIALOG_PADDING_BLOCK_UNITS,
  STANDARD_DIALOG_PADDING_INLINE_UNITS,
} from '../../lib/constants'
import type { ArtifactSetId, ArtifactTypeId, StatVariant } from '../../lib/types'
import {
  ALLOWED_MAIN_BY_SLOT,
  ArtifactType,
  StatVariant as StatVariantEnum,
  getAccessorySlotsCompatibleSetIds,
  getArmorFixedSetIds,
  getArmorVariableSetIds,
  getAllKnownArtifactSetIds,
} from '../../lib/types'
import { isAccessorySlot } from '../../lib/testerDomain'
import { useI18n } from '../../lib/i18n'
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSetsSelect, GearSlotSelect } from '../gear'
import { TesterItemsGrid } from '../TesterItemsGrid'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import WorkloadProgressIndicator from '../WorkloadProgressIndicator'
// MarkdownTooltip keeps the rule-count hints and info icons synchronized with the broader tooltip refactor.
import MarkdownTooltip from '../MarkdownTooltip'
import EllipsisTooltip from '../EllipsisTooltip'
import type { SetStateAction } from 'react'
import type { Metaset } from '../../lib/metasets'
import InlineSelectClearButton from '../InlineSelectClearButton'
import InlineSelectExtraBadge from '../InlineSelectExtraBadge'
import { computeInlineSelectContentMaxWidth, computeInlineSelectPadding } from '../../lib/inlineSelectAffordances'
import { alpha, useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { createBuilderStatusChipSx } from '../builderStatusChipStyles'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import { useKeepUniquesGridFilterMode } from '../../state/keepUniquesPreferences'
import { useGearSetCatalogVersion } from '../../hooks/useGearSetCatalogVersion'
import { normalizeArtifactSetSelections } from '../../lib/gearSets/selection'

const SCOPE_CHIP_HOVER_ALPHA = { light: 0.12, dark: 0.24 } as const
// Keep-unique headers should stay a consistent height even when names wrap to two lines.
const KEEP_UNIQUES_RULE_HEADER_MIN_HEIGHT_PX = 56

type KeepUniquesTabProps = {
  rules: KeepUniqueRule[]
  enabled: boolean
  finalSellCoverageWarningActive: boolean
  onRulesChange: (next: SetStateAction<KeepUniqueRule[]>) => void
  onToggleEnabled: (next: SetStateAction<boolean>) => void
  detection: KeepUniqueDetectionSnapshot | null
  gearEntries: TesterPreviewRow[]
  uniqueItemKeys: ReadonlySet<number>
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  configNames: Array<string | null>
  metasets: Metaset[]
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  suppressMatchDetails?: boolean
  workloadProgressRatio: number
}

type KeepUniqueScopeKey = 'perSlot' | 'perSet' | 'perFaction' | 'perMainStat'

export default function KeepUniquesTab({
  rules,
  enabled,
  finalSellCoverageWarningActive,
  onRulesChange,
  onToggleEnabled,
  detection,
  gearEntries,
  uniqueItemKeys,
  substatColors,
  useStatButtonColors,
  onToggleStatColors,
  onOpenManageColors,
  colorBlindMode,
  onChangeColorBlindMode,
  colorIconSrc,
  configNames,
  metasets,
  onJumpToRule,
  suppressMatchDetails = false,
  workloadProgressRatio,
}: KeepUniquesTabProps) {
  const { t } = useI18n()
  const gearSetCatalogVersion = useGearSetCatalogVersion()
  const armorFixedSetIds = useMemo(() => {
    void gearSetCatalogVersion
    return getArmorFixedSetIds()
  }, [gearSetCatalogVersion])
  const armorVariableSetIds = useMemo(() => {
    void gearSetCatalogVersion
    return getArmorVariableSetIds()
  }, [gearSetCatalogVersion])
  const artifactSetPool = useMemo(
    () => Object.freeze([...armorFixedSetIds, ...armorVariableSetIds]),
    [armorFixedSetIds, armorVariableSetIds],
  )
  const accessoryCompatibleSetIds = useMemo(
    () => {
      void gearSetCatalogVersion
      return getAccessorySlotsCompatibleSetIds()
    },
    [gearSetCatalogVersion],
  )
  const allArtifactSetIds = useMemo(
    () => {
      void gearSetCatalogVersion
      return getAllKnownArtifactSetIds()
    },
    [gearSetCatalogVersion],
  )
  const resolveAllowedSetPool = useCallback((slots: ArtifactTypeId[]): readonly ArtifactSetId[] => {
    const slotAny = slots.length === 0
    const hasAccessory = slotAny || slots.some((slotId) => isAccessorySlot(slotId))
    const hasArmor = slotAny || slots.some((slotId) => !isAccessorySlot(slotId))
    if (hasAccessory && hasArmor) return allArtifactSetIds
    return hasAccessory ? accessoryCompatibleSetIds : artifactSetPool
  }, [accessoryCompatibleSetIds, allArtifactSetIds, artifactSetPool])
  const sanitizeCombinationForSlots = useCallback((slots: ArtifactTypeId[], combination: KeepUniqueRule['combination']) => {
    const normalizedSlots = dedupeNumericArray(slots)
    const allowedSetPool = resolveAllowedSetPool(normalizedSlots)
    const allowedSetIds = new Set(allowedSetPool.map(Number))
    const filteredSets = normalizeArtifactSetSelections(combination.sets)
      .filter((entry) => allowedSetIds.has(Number(entry.id)))
    const filteredMetaIds = (combination.metaSetIds ?? []).filter((metaId) => {
      const meta = metasets.find((item) => item.id === metaId)
      if (!meta || !meta.sets.length) return false
      return meta.sets.every((setId) => allowedSetIds.has(Number(setId)))
    })
    const mainOptions = getMainStatOptionsForSlots(normalizedSlots)
    const hasAccessory = normalizedSlots.length === 0 || normalizedSlots.some((slotId) => isAccessorySlot(slotId))
    const filteredMainStats = dedupeNumericArray((combination.mainStats ?? []).filter((variant) => mainOptions.includes(variant)))
    const filteredFactions = hasAccessory ? dedupeNumericArray(combination.factions ?? []) : []
    const hadExplicitSetSelection = combination.sets.length > 0 || (combination.metaSetIds?.length ?? 0) > 0
    const resolvedSets = filteredSets.length > 0
      ? filteredSets
      : (hadExplicitSetSelection && allowedSetPool[0] ? [{ id: allowedSetPool[0] }] : [])
    return {
      ...combination,
      slots: normalizedSlots,
      sets: resolvedSets,
      metaSetIds: filteredMetaIds,
      mainStats: filteredMainStats,
      factions: filteredFactions,
    }
  }, [metasets, resolveAllowedSetPool])
  const theme = useTheme()
  const scopeChipSx = useMemo<((active: boolean) => SxProps<Theme>)>(() => {
    const builderChipSx = createBuilderStatusChipSx(theme)
    const baseChipSx = builderChipSx(true, { dimDisabled: true }) as SystemStyleObject<Theme>
    const inactiveChipSx = builderChipSx(false, { dimDisabled: true }) as SystemStyleObject<Theme>
    const hoverBg = alpha(
      theme.palette.text.primary,
      theme.palette.mode === 'dark' ? SCOPE_CHIP_HOVER_ALPHA.dark : SCOPE_CHIP_HOVER_ALPHA.light,
    )
    return (active: boolean): SxProps<Theme> => (
      active
        ? baseChipSx
        : [
            baseChipSx,
            inactiveChipSx,
            {
              '&.MuiChip-clickable:hover': { backgroundColor: hoverBg },
              '&.MuiChip-clickable:active': { backgroundColor: hoverBg },
            } as SystemStyleObject<Theme>,
          ]
    )
  }, [theme])
  const clearLabel = t('clear')
  const ruleModeScopeTooltip = useMemo(() => (
    `${t('keepUniquesRuleModeHint')}

${t('keepUniquesCountModeHint')}`
  ), [t])
  // Warn when Keep Uniques runs without Final Sell covering 0–16 so users revisit the baseline sweep.
  const keepUniquesFinalSellWarning = enabled && finalSellCoverageWarningActive
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(() => rules[0]?.id ?? null)
  const [respectManualDeselect, setRespectManualDeselect] = useState(false)
  // Keep expansion state separate from the selection used to highlight tester rows; multiple cards can stay open.
  const [expandedRuleIds, setExpandedRuleIds] = useState<ReadonlySet<string>>(() => {
    const firstId = rules[0]?.id
    // When opening the tab, only auto-expand if there is exactly one rule; otherwise start fully collapsed.
    if (rules.length === 1 && firstId) return new Set([firstId])
    return new Set()
  })
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null)
  const [gridFilterMode, setGridFilterMode] = useKeepUniquesGridFilterMode()
  const allRuleIds = useMemo(() => rules.map((rule) => rule.id), [rules])
  const rulesScrollRootRef = useRef<HTMLDivElement | null>(null)
  const scrollRafRef = useRef<number | null>(null)
  const scheduleScrollToRule = useCallback((ruleId: string) => {
    if (scrollRafRef.current !== null) {
      window.cancelAnimationFrame(scrollRafRef.current)
      scrollRafRef.current = null
    }
    // Adding/duplicating a rule updates state and triggers a render; retry for a few frames until the DOM node exists.
    const maxAttempts = 8
    const tryScroll = (attempt: number) => {
      const scrollRoot = rulesScrollRootRef.current
      const target = scrollRoot?.querySelector(`[data-keep-uniques-rule-id="${ruleId}"]`) as HTMLElement | null
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
  const ensureKeepUniquesEnabled = useCallback(() => {
    if (!enabled) onToggleEnabled(true)
  }, [enabled, onToggleEnabled])
  // Rule edits should immediately re-enable Keep Uniques so users never lose changes silently, except when disabling a rule.
  const mutateRules = useCallback(
    (action: SetStateAction<KeepUniqueRule[]>, ensureEnabled = true) => {
      if (ensureEnabled) ensureKeepUniquesEnabled()
      onRulesChange(action)
    },
    [ensureKeepUniquesEnabled, onRulesChange],
  )
  const effectiveSelectedRuleId = useMemo(() => {
    if (selectedRuleId === null) {
      if (respectManualDeselect) return null
      return rules[0]?.id ?? null
    }
    return rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : (rules[0]?.id ?? null)
  }, [respectManualDeselect, rules, selectedRuleId])

  const toggleAllExpandedRules = useCallback(() => {
    setExpandedRuleIds((prev) => {
      if (allRuleIds.length === 0) return prev
      const allExpanded = allRuleIds.every((id) => prev.has(id))
      return allExpanded ? new Set() : new Set(allRuleIds)
    })
  }, [allRuleIds])
  /* eslint-disable react-you-might-not-need-an-effect/no-event-handler -- Rules can disappear outside local handlers, so we realign selection when the autosave payload swaps in. */
  useEffect(() => {
    if (rules.length !== 0) return
    if (selectedRuleId !== null) setSelectedRuleId(null)
    if (respectManualDeselect) setRespectManualDeselect(false)
  }, [respectManualDeselect, rules.length, selectedRuleId])
  /* eslint-enable react-you-might-not-need-an-effect/no-event-handler */

  const detectionEntries = useMemo(() => detection?.entries ?? [], [detection])
  const detectionByRuleId = useMemo(() => {
    const map = new Map<string, KeepUniqueDetectionEntry>()
    for (const entry of detectionEntries) {
      if (entry.ruleId) map.set(entry.ruleId, entry)
    }
    return map
  }, [detectionEntries])
  const selectedEntry = effectiveSelectedRuleId ? detectionByRuleId.get(effectiveSelectedRuleId) ?? null : null
  const selectedItemKeys = useMemo(() => new Set<number>(selectedEntry?.itemKeys ?? []), [selectedEntry])
  const uniqueItemKeySet = uniqueItemKeys
  const uniqueRows = useMemo(() => {
    if (uniqueItemKeySet.size === 0) return []
    if (uniqueItemKeySet.size === gearEntries.length) return gearEntries
    return gearEntries.filter((row) => uniqueItemKeySet.has(getKeepUniqueItemKey(row.artifact)))
  }, [gearEntries, uniqueItemKeySet])
  const uniqueFilterActive = gearEntries.length > uniqueRows.length
  // Highlight callback lets the tester grid fade non-matching cards instead of mutating the dataset.
  const highlightRowPredicate = useMemo(() => {
    if (!selectedEntry || selectedItemKeys.size === 0) return null
    return (row: TesterPreviewRow) => selectedItemKeys.has(getKeepUniqueItemKey(row.artifact))
  }, [selectedEntry, selectedItemKeys])
  const highlightActive = Boolean(highlightRowPredicate)
  // Treat selection mode as active whenever a rule is selected, even with zero matches.
  const selectionFilterApplied = gridFilterMode === 'selection' && Boolean(selectedEntry)
  const gridRows = useMemo(() => {
    if (!selectionFilterApplied) return uniqueRows
    // When a rule has zero matches, the selection filter should yield an empty grid.
    if (!highlightRowPredicate) return []
    return uniqueRows.filter((row) => highlightRowPredicate(row))
  }, [highlightRowPredicate, selectionFilterApplied, uniqueRows])
  const selectedVisibleRowCount = useMemo(() => {
    if (!selectedEntry || selectedEntry.itemKeys.length === 0) return 0
    let count = 0
    for (const key of selectedEntry.itemKeys) {
      if (uniqueItemKeySet.has(key)) count += 1
    }
    return count
  }, [selectedEntry, uniqueItemKeySet])
  const highlightFilterActive = highlightActive && !selectionFilterApplied && uniqueRows.length > selectedVisibleRowCount
  const gridFiltered = uniqueFilterActive || highlightFilterActive || selectionFilterApplied
  const hasPreviewGear = gearEntries.length > 0
  const selectionChipLabel = useMemo(() => {
    if (selectedEntry) {
      // Keep the detail chip focused on the highlighted combination whenever a rule is active.
      return t('keepUniquesGridSelectedCount', { count: selectedVisibleRowCount })
    }
    if (gearEntries.length === 0 && uniqueRows.length === 0) return null
    // Surface the aggregate unique count so the toolbar never collapses when no rule is selected.
    return t('keepUniquesGridUniqueCount', { count: uniqueRows.length })
  }, [selectedEntry, selectedVisibleRowCount, gearEntries.length, t, uniqueRows.length])

  const handleAddRule = useCallback(() => {
    const combination = makeDefaultKeepUniqueCombination()
    // Default new rules to per-set counting so cards immediately guard each combination.
    const newRule: KeepUniqueRule = {
      id: createKeepUniqueRuleId(),
      combination,
      name: '',
      requiredCount: 1,
      activation: KeepUniqueRuleActivation.ProtectExisting,
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
    // Scroll only for explicit creation so normal edits never jump the list.
    scheduleScrollToRule(newRule.id)
  }, [mutateRules, scheduleScrollToRule, setRespectManualDeselect])

  const handleDeleteRule = useCallback((ruleId: string) => {
    let filtered: KeepUniqueRule[] = []
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
  }, [mutateRules, selectedRuleId, setRespectManualDeselect])

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
      const cloneId = createKeepUniqueRuleId()
      newRuleId = cloneId
      const duplicated: KeepUniqueRule = {
        ...source,
        id: cloneId,
        combination: cloneKeepUniqueCombination(source.combination),
      }
      const next = prev.slice()
      next.splice(idx + 1, 0, duplicated)
      return next
    })
    if (newRuleId) {
      const resolvedNewRuleId = newRuleId
      setSelectedRuleId(newRuleId)
      setRespectManualDeselect(false)
      setExpandedRuleIds((prev) => {
        const next = new Set(prev)
        next.add(resolvedNewRuleId)
        return next
      })
    }
  }, [mutateRules, setRespectManualDeselect])

  const updateRule = useCallback(
    (ruleId: string, updater: (rule: KeepUniqueRule) => KeepUniqueRule, ensureEnabled = true) => {
      mutateRules((prev) => prev.map((rule) => (rule.id === ruleId ? updater(rule) : rule)), ensureEnabled)
    },
    [mutateRules],
  )
  // Keep display-only name edits from waking the worker; buffer locally and commit on blur/Enter.
  const [pendingNameById, setPendingNameById] = useState<Map<string, string>>(() => new Map())
  const nameCommitTimerRef = useRef<number | null>(null)
  const flushPendingName = useCallback((ruleId: string) => {
    const nextName = pendingNameById.get(ruleId)
    if (nextName === undefined) return
    updateRule(ruleId, (prev) => (prev.name === nextName ? prev : { ...prev, name: nextName }), true)
  }, [pendingNameById, updateRule])
  const cancelNameCommitTimer = useCallback(() => {
    if (nameCommitTimerRef.current !== null) {
      window.clearTimeout(nameCommitTimerRef.current)
      nameCommitTimerRef.current = null
    }
  }, [])
  const scheduleNameCommit = useCallback((ruleId: string) => {
    cancelNameCommitTimer()
    nameCommitTimerRef.current = window.setTimeout(() => {
      nameCommitTimerRef.current = null
      flushPendingName(ruleId)
    }, 500)
  }, [cancelNameCommitTimer, flushPendingName])
  useEffect(() => () => cancelNameCommitTimer(), [cancelNameCommitTimer])

  const setRuleCombination = useCallback((
    ruleId: string,
    updater: (combination: KeepUniqueRule['combination']) => KeepUniqueRule['combination'],
  ) => {
    updateRule(ruleId, (rule) => ({ ...rule, combination: updater(rule.combination) }))
  }, [updateRule])
  const handleToggleGridFilterMode = useCallback(() => {
    setGridFilterMode((prev) => (prev === 'all' ? 'selection' : 'all'))
  }, [setGridFilterMode])

  const renderRuleCard = (rule: KeepUniqueRule, ruleIndex: number) => {
    const ruleDisabled = rule.activation === KeepUniqueRuleActivation.Off
    const combination = rule.combination
    const ruleDetection = detectionByRuleId.get(rule.id) ?? null
    const slotSelection = combination.slots
    const slotAny = slotSelection.length === 0
    const hasAccessorySlot = slotAny || slotSelection.some((slotId) => isAccessorySlot(slotId))
    const hasArmorSlot = slotAny || slotSelection.some((slotId) => !isAccessorySlot(slotId))
    const allowedSetPool = hasAccessorySlot && hasArmorSlot
      ? allArtifactSetIds
      : (hasAccessorySlot ? accessoryCompatibleSetIds : artifactSetPool)
    const setSelection = normalizeArtifactSetSelections(combination.sets)
      .filter((entry) => allowedSetPool.includes(Number(entry.id)))
    const rankSelection = combination.ranks
    const raritySelection = combination.rarities
    const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
    const mainStatSelection = dedupeNumericArray((combination.mainStats ?? []).filter((variant) => mainStatOptions.includes(variant)))
    const factionSelection = hasAccessorySlot ? dedupeNumericArray(combination.factions ?? []) : []
    const selected = effectiveSelectedRuleId === rule.id
    const expanded = expandedRuleIds.has(rule.id)
    const selectRule = () => {
      // Keep selection synced to the most recent card interaction so the grid focus stays predictable.
      setSelectedRuleId(rule.id)
      // Explicit selection should clear manual deselect so defaults reapply on new interactions.
      setRespectManualDeselect(false)
    }
    const toggleExpanded = () => {
      setExpandedRuleIds((prev) => {
        const next = new Set(prev)
        if (next.has(rule.id)) next.delete(rule.id)
        else next.add(rule.id)
        return next
      })
    }
    const handleRuleTitleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
      // Title clicks should feel like the primary disclosure control for the rule.
      event.preventDefault()
      // Toggle expansion to open/close the rule detail.
      toggleExpanded()
      // Also keep selection aligned with the click target.
      selectRule()
    }
    const deleteButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); setPendingDeleteRuleId(rule.id) }}
        aria-label={t('keepUniquesDeleteRule')}
        color="error"
        sx={{ p: 0.5 }}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    )
    const duplicateButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); handleDuplicateRule(rule.id) }}
        aria-label={t('keepUniquesDuplicateRule')}
        sx={{ p: 0.5 }}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    )
    const actionButtons = (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end', flexShrink: 0 }}>
        {duplicateButton}
        {deleteButton}
      </Box>
    )
    const countMode = sanitizeKeepUniqueCountMode(rule.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE)
    const perSlotLabel = t('keepUniquesCountModePerSlot')
    const perSetLabel = t('keepUniquesCountModePerSet')
    const perFactionLabel = t('keepUniquesCountModePerFaction')
    const perMainLabel = t('keepUniquesCountModePerMain')
    const scopeActive = {
      perSlot: !countMode.perRule && countMode.perSlot,
      perSet: !countMode.perRule && countMode.perSet,
      perFaction: !countMode.perRule && countMode.perFaction,
      perMainStat: !countMode.perRule && countMode.perMainStat,
    }
    const handleScopeChipToggle = (scope: KeepUniqueScopeKey) => {
      if (ruleDisabled) return
      updateRule(rule.id, (prev) => {
        const prevMode = sanitizeKeepUniqueCountMode(prev.countMode ?? KEEP_UNIQUE_DEFAULT_COUNT_MODE)
        const nextValue = !prevMode[scope]
        const nextMode: KeepUniqueRule['countMode'] = {
          perRule: false,
          perSlot: scope === 'perSlot' ? nextValue : prevMode.perSlot,
          perSet: scope === 'perSet' ? nextValue : prevMode.perSet,
          perFaction: scope === 'perFaction' ? nextValue : prevMode.perFaction,
          perMainStat: scope === 'perMainStat' ? nextValue : prevMode.perMainStat,
        }
        if (!nextMode.perSlot && !nextMode.perSet && !nextMode.perFaction && !nextMode.perMainStat) {
          return {
            ...prev,
            countMode: {
              perRule: true,
              perSlot: false,
              perSet: false,
              perFaction: false,
              perMainStat: false,
            },
          }
        }
        return { ...prev, countMode: nextMode }
      })
    }
    const renderScopeChip = (scope: KeepUniqueScopeKey, label: string, active: boolean) => (
      <Chip
        size="small"
        variant="filled"
        clickable
        data-rule-card-interactive="true"
        disabled={ruleDisabled}
        onClick={(event) => { event.stopPropagation(); handleScopeChipToggle(scope) }}
        aria-pressed={active}
        label={label}
        sx={scopeChipSx(active)}
      />
    )

    const ruleCountsLabel = ruleDetection
      ? t('keepUniquesRuleCounts', {
        have: ruleDetection.currentCount,
        keep: ruleDetection.requiredCount,
      })
      : ''
    const ruleCountsColor = (ruleDetection?.deficit ?? 0) > 0 ? 'error.main' : 'text.secondary'
    // Extend the counts chip with a suffix that explains how the totals were derived.
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
      return t('keepUniquesRuleCountsPerGroupSuffix', {
        perGroup: ruleDetection.perGroupRequiredCount,
        groups: ruleDetection.groupsTracked,
        scope: scopeLabel,
      })
    })()
    const ruleCountsTooltip = detectionScopeSuffix
      ? `${ruleCountsLabel}\n${detectionScopeSuffix}`
      : ruleCountsLabel
    // Summary title: name is optional, so fall back to a muted placeholder for fast scanning.
    const rawName = (pendingNameById.get(rule.id) ?? rule.name ?? '').trim()
    const summaryTitle = rawName || `${t('testerRule')} ${ruleIndex + 1}`
    // Summary status keeps the header scannable: checkmark when active, X when Off.
    const ruleActive = rule.activation !== KeepUniqueRuleActivation.Off
    const activeRuleLabel = (
      rule.activation === KeepUniqueRuleActivation.ProtectExisting
        ? t('keepUniquesRuleModeProtect')
        : t('keepUniquesRuleModeAnticipate')
    )
    const ruleStatus = ruleActive
      ? { label: activeRuleLabel, icon: <CheckIcon fontSize="small" />, color: 'success.main' }
      : { label: t('keepUniquesRuleModeOff'), icon: <CloseIcon fontSize="small" />, color: 'text.secondary' }
    return (
      <Box
        key={rule.id}
        // Capture clicks so any background or control interaction selects the card.
        onClickCapture={selectRule}
        // Capture focus to support keyboard-driven activations selecting the card too.
        onFocusCapture={selectRule}
        sx={{
          borderRadius: '8px',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider', // Selected rules now rely on the dialog's blue accent.
          bgcolor: 'inherit', // Match the surrounding dialog background so cards don't float on a separate surface.
          overflow: 'hidden', // Header/editor share an outline without double borders.
        }}
      >
        <Box
          // Header wrapper keeps the highlight while deferring toggle behavior to the title button.
          sx={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gridTemplateRows: 'auto',
            columnGap: 1,
            alignItems: 'center',
            // Reserve space for a two-line name so expand/collapse never shifts the header height.
            minHeight: KEEP_UNIQUES_RULE_HEADER_MIN_HEIGHT_PX,
            px: 1.25,
            py: 0.875,
            textAlign: 'left',
            backgroundColor: selected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.12 : 0.08) : 'transparent',
            borderBottom: expanded ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          {/* Title-only button isolates expand/collapse from other header controls. */}
          <EllipsisTooltip title={rawName || summaryTitle}>
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
              <Box
                component="span"
                aria-label={ruleStatus.label}
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  flex: '0 0 auto',
                  color: ruleStatus.color,
                }}
              >
                {ruleStatus.icon}
              </Box>
              <Typography
                variant="body2"
                data-ellipsis-target
                sx={{
                  minWidth: 0,
                  fontWeight: 400,
                  fontStyle: rawName ? 'normal' : 'italic',
                  color: rawName ? 'text.primary' : 'text.secondary',
                  // Clamp to 2 lines (with ellipsis) without changing header height.
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
            {actionButtons}
            <IconButton
              size="small"
              aria-label={expanded ? t('collapse') : t('expand')}
              sx={{ p: 0.5, color: 'text.secondary' }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (event.ctrlKey) {
                  // Ctrl+click on the chevron toggles all cards without changing per-rule selection.
                  toggleAllExpandedRules()
                  return
                }
                toggleExpanded()
              }}
              onContextMenu={(event) => {
                // Right-click on the chevron toggles all cards without showing the browser context menu.
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
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: { xs: 'wrap', sm: 'nowrap' },
              gap: 1,
            }}
          >
            <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: '1 1 320px', minWidth: 0 }}>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={rule.activation}
                onChange={(_event, next) => {
                  if (!next) return
                  updateRule(
                    rule.id,
                    (prev) => (prev.activation === next ? prev : { ...prev, activation: next }),
                    next !== KeepUniqueRuleActivation.Off,
                  )
                }}
                data-rule-card-interactive="true"
                sx={{ display: 'flex', width: '100%', borderRadius: '8px', overflow: 'hidden' }}
              >
                <ToggleButton
                  value={KeepUniqueRuleActivation.Off}
                  aria-label={t('keepUniquesRuleModeOff')}
                  sx={{ flex: 1, minWidth: 0, px: 1 }}
                >
                  <EllipsisTooltip title={t('keepUniquesRuleModeOff')}>
                    <Box
                      component="span"
                      data-ellipsis-target
                      sx={{
                        display: 'block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('keepUniquesRuleModeOffShort')}
                    </Box>
                  </EllipsisTooltip>
                </ToggleButton>
                <ToggleButton
                  value={KeepUniqueRuleActivation.ProtectExisting}
                  aria-label={t('keepUniquesRuleModeProtect')}
                  sx={{ flex: 1, minWidth: 0, px: 1 }}
                >
                  <EllipsisTooltip title={t('keepUniquesRuleModeProtect')}>
                    <Box
                      component="span"
                      data-ellipsis-target
                      sx={{
                        display: 'block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('keepUniquesRuleModeProtectShort')}
                    </Box>
                  </EllipsisTooltip>
                </ToggleButton>
                <ToggleButton
                  value={KeepUniqueRuleActivation.AnticipateGaps}
                  aria-label={t('keepUniquesRuleModeAnticipate')}
                  sx={{ flex: 1, minWidth: 0, px: 1 }}
                >
                  <EllipsisTooltip title={t('keepUniquesRuleModeAnticipate')}>
                    <Box
                      component="span"
                      data-ellipsis-target
                      sx={{
                        display: 'block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('keepUniquesRuleModeAnticipateShort')}
                    </Box>
                  </EllipsisTooltip>
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                alignSelf: 'stretch',
                color: 'text.secondary',
                minWidth: 32,
              }}
            >
              <MarkdownTooltip markdown={ruleModeScopeTooltip}>
                <IconButton
                  size="small"
                  color="inherit"
                  aria-label={t('keepUniquesRuleModeHintLabel')}
                  sx={{
                    p: 0.25,
                    fontSize: 16,
                    '&:hover': { color: 'text.primary' },
                    '&:focus-visible': { color: 'text.primary' },
                  }}
                >
                  <InfoOutlinedIcon fontSize="inherit" />
                </IconButton>
              </MarkdownTooltip>
            </Box>
          </Box>
          <TextField
            fullWidth
            size="small"
            label={t('keepUniquesRuleNameLabel')}
            value={pendingNameById.get(rule.id) ?? rule.name}
            disabled={ruleDisabled}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              const raw = event.target.value ?? ''
              setPendingNameById((prev) => {
                const next = new Map(prev)
                next.set(rule.id, raw)
                return next
              })
              scheduleNameCommit(rule.id)
            }}
            onBlur={() => flushPendingName(rule.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                flushPendingName(rule.id)
              }
            }}
          />
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <RuleFieldWithScopeChip chip={renderScopeChip('perSlot', perSlotLabel, scopeActive.perSlot)}>
                <RuleSelectAffordances
                  selectionCount={slotSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, slots: [] }))
                  }}
                >
                  <GearSlotSelect
                    multiple
                    value={slotSelection}
                    onChange={(nextSlots) => {
                      if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => sanitizeCombinationForSlots(nextSlots, prev))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(slotSelection.length, INLINE_SELECT_FIXED_HEIGHT_PX)}
                  />
                </RuleSelectAffordances>
              </RuleFieldWithScopeChip>
              <RuleFieldWithScopeChip chip={renderScopeChip('perSet', perSetLabel, scopeActive.perSet)}>
                <GearSetsSelect
                  disabled={ruleDisabled}
                  value={setSelection}
                  onChange={(nextSets) => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, sets: normalizeArtifactSetSelections(nextSets) }))
                  }}
                  metasets={metasets}
                  selectedMetasetIds={combination.metaSetIds}
                  onChangeMetasetIds={(nextMetaIds) => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, metaSetIds: dedupeStringArray(nextMetaIds) }))
                  }}
                  allowedSetIds={allowedSetPool}
                  showMetasets
                />
              </RuleFieldWithScopeChip>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <RuleFieldWithScopeChip>
                <RuleSelectAffordances
                  selectionCount={rankSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, ranks: [] }))
                  }}
                >
                  <GearRankSelect
                    multiple
                    allowAny
                    value={rankSelection}
                    onChange={(nextRanks) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, ranks: nextRanks }))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(rankSelection.length)}
                  />
                </RuleSelectAffordances>
              </RuleFieldWithScopeChip>
              <RuleFieldWithScopeChip>
                <RuleSelectAffordances
                  selectionCount={raritySelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, rarities: [] }))
                  }}
                >
                  <GearRaritySelect
                    multiple
                    allowAny
                    value={raritySelection}
                    onChange={(nextRarities) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, rarities: nextRarities }))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(raritySelection.length)}
                  />
                </RuleSelectAffordances>
              </RuleFieldWithScopeChip>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <RuleFieldWithScopeChip chip={renderScopeChip('perMainStat', perMainLabel, scopeActive.perMainStat)}>
                <RuleSelectAffordances
                  selectionCount={mainStatSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, mainStats: [] }))
                  }}
                >
                  <GearMainStatSelect
                    multiple
                    value={mainStatSelection}
                    options={mainStatOptions}
                    anyValue={StatVariantEnum.Any as StatVariant}
                    onChange={(nextMain) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, mainStats: dedupeNumericArray(nextMain) }))
                    }}
                    colorOverrides={substatColors}
                    showBorderColors={useStatButtonColors}
                    size="small"
                    sx={getRuleSelectPaddingSx(mainStatSelection.length)}
                  />
                </RuleSelectAffordances>
              </RuleFieldWithScopeChip>
              {/* Keep the faction selector visible so users understand why accessory-only filters are required. */}
              <RuleFieldWithScopeChip chip={renderScopeChip('perFaction', perFactionLabel, scopeActive.perFaction)}>
                <RuleSelectAffordances
                  selectionCount={factionSelection.length}
                  clearLabel={clearLabel}
                  disabled={ruleDisabled}
                  onClear={() => {
                    if (ruleDisabled) return
                    setRuleCombination(rule.id, (prev) => ({ ...prev, factions: [] }))
                  }}
                >
                  <GearFactionSelect
                    multiple
                    disabled={ruleDisabled || !hasAccessorySlot}
                    value={factionSelection}
                    onChange={(nextFactions) => {
                      if (ruleDisabled) return
                      setRuleCombination(rule.id, (prev) => ({ ...prev, factions: dedupeNumericArray(nextFactions) }))
                    }}
                    size="small"
                    sx={getRuleSelectPaddingSx(factionSelection.length, INLINE_SELECT_FIXED_HEIGHT_PX)}
                  />
                </RuleSelectAffordances>
              </RuleFieldWithScopeChip>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1, minWidth: 0 }}>
                {/* Keep the info glyph on the same line as the quota so it no longer consumes a separate row. */}
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label={t('keepUniquesRequiredCount')}
                  value={rule.requiredCount}
                  disabled={ruleDisabled}
                  onChange={(event) => {
                    const raw = Math.min(9999, Math.max(1, Math.floor(Number(event.target.value) || 1)))
                    updateRule(rule.id, (prev) => ({ ...prev, requiredCount: raw }))
                  }}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">≥</InputAdornment>,
                    endAdornment: (
                      <NumberSpinnerAdornment
                        ariaLabel={t('keepUniquesRequiredCount')}
                        onStep={(delta) => {
                          if (ruleDisabled) return
                          updateRule(rule.id, (prev) => {
                            const next = Math.max(1, Math.min(9999, Math.floor((prev.requiredCount ?? 1) + delta)))
                            return { ...prev, requiredCount: next }
                          })
                        }}
                      />
                    ),
                  }}
                  sx={(themeInner) => ({
                    flex: '0 0 auto',
                    maxWidth: 130, // Slightly wider so long translations can still read the quantity without wrapping.
                    '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                      WebkitAppearance: 'none',
                      margin: 0,
                    },
                    '& input[type=number]': {
                      MozAppearance: 'textfield',
                    },
                    '& input': {
                      textAlign: 'right',
                      paddingRight: themeInner.spacing(1),
                      paddingLeft: themeInner.spacing(0.5),
                    },
                  })}
                  inputProps={{
                    min: 1,
                    step: 1,
                    max: 9999, // UI enforces realistic quotas while still allowing manual entry if needed.
                  }}
                />
                {ruleDetection ? (
                  <MarkdownTooltip markdown={ruleCountsTooltip}>
                    <IconButton
                      size="small"
                      color="inherit"
                      aria-label={ruleCountsTooltip}
                      sx={{
                        p: 0.25,
                        fontSize: 16,
                        color: ruleCountsColor,
                        // Mirror the old label's warning color while keeping hover/focus consistent.
                        '&:hover': { color: ruleCountsColor === 'error.main' ? 'error.dark' : 'text.primary' },
                        '&:focus-visible': { color: ruleCountsColor === 'error.main' ? 'error.dark' : 'text.primary' },
                      }}
                    >
                      <InfoOutlinedIcon fontSize="inherit" />
                    </IconButton>
                  </MarkdownTooltip>
                ) : null}
              </Box>
            </Box>
          </Stack>
          </Stack>
        ) : null}
      </Box>
    )
  }

  const deleteDialogOpen = pendingDeleteRuleId !== null

  return (
    <>
      <Dialog open={deleteDialogOpen} onClose={handleCancelDeleteRule}>
        <DialogTitle>{t('keepUniquesDeleteRuleTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('keepUniquesDeleteRuleMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDeleteRule}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmDeleteRule}>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
          py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
          boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{
            display: { xs: 'block', md: 'grid' },
            gridTemplateColumns: { md: '360px minmax(0, 1fr)' },
            height: '100%',
            gap: 2,
          }}
        >
          <Box data-tour-id="keepuniques.rules" sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <Box sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">{t('keepUniquesTabLabel')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('keepUniquesTabIntro')}</Typography>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={enabled}
                      onChange={(_, checked) => onToggleEnabled(checked)}
                    />
                  )}
                  label={(
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography component="span">{t('keepUniquesEnableLabel')}</Typography>
                      {keepUniquesFinalSellWarning ? (
                        // Tooltip nudges users to align Keep Uniques with a full Final Sell sweep.
                        <MarkdownTooltip markdown={t('keepUniquesFinalSellCoverageWarning')}>
                          <Box
                            component="span"
                            aria-label={t('keepUniquesFinalSellCoverageWarning')}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              color: 'warning.main',
                            }}
                          >
                            <WarningAmberRoundedIcon fontSize="small" />
                          </Box>
                        </MarkdownTooltip>
                      ) : null}
                    </Stack>
                  )}
                />
              </Stack>
            </Box>
            <KeepUniquesRuleList rules={rules} renderRule={renderRuleCard} scrollRootRef={rulesScrollRootRef} />
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="contained" onClick={handleAddRule} sx={{ minHeight: MENU_CONTROL_HEIGHT_PX }}>
                {t('keepUniquesAddRule')}
              </Button>
            </Box>
          </Box>
          <Box data-tour-id="keepuniques.grid" sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Box sx={{ flex: '0 0 auto' }}>
                <MarkdownTooltip markdown={t('keepUniquesGridFilterTooltip')}>
                  <span>
                    <Button
                      size="small"
                      color="success"
                      variant={gridFilterMode === 'selection' ? 'contained' : 'outlined'}
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
                      {t('keepUniquesGridFilterLabel', {
                        mode: gridFilterMode === 'selection'
                          ? t('keepUniquesGridFilterModeSelection')
                          : t('keepUniquesGridFilterModeAll'),
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
                {/* Shared spinner keeps the dialog aligned with the preview chip busy indicator. */}
                <WorkloadProgressIndicator progressRatio={workloadProgressRatio} ariaLabel={t('keepUniquesScanPending')} />
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
                variant="keepUniques"
                highlightedRowPredicate={highlightRowPredicate ?? null}
                dimUnhighlightedRows={highlightActive}
                suppressMatchDetails={suppressMatchDetails}
                keepUniquesEnabled={enabled}
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

type KeepUniquesRuleListProps = {
  rules: KeepUniqueRule[]
  renderRule: (rule: KeepUniqueRule, ruleIndex: number) => ReactNode
  scrollRootRef: RefObject<HTMLDivElement | null>
}

function KeepUniquesRuleList({ rules, renderRule, scrollRootRef }: KeepUniquesRuleListProps) {
  const { t } = useI18n()

  return (
    <Box
      ref={scrollRootRef}
      sx={(theme) => ({
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        // Virtual rows are absolutely positioned; disable scroll anchoring so expand/collapse never “moves” whitespace.
        overflowAnchor: 'none',
        pt: 2,
        pr: 1,
        ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: theme.spacing(1) }),
      })}
    >
      {rules.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('keepUniquesNoRules')}</Typography>
      ) : (
        // Render a normal stacked list so expand/collapse never depends on cached measurements.
        // Use CSS gap directly (instead of Stack's spacing implementation) to keep spacing stable across toggles.
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pb: 2 }}>
          {rules.map((rule, index) => (
            <Box
              key={rule.id}
              data-keep-uniques-rule-id={rule.id}
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

function makeDefaultKeepUniqueCombination(): KeepUniqueRule['combination'] {
  return {
    slots: [],
    sets: [],
    metaSetIds: [],
    ranks: [],
    rarities: [],
    mainStats: [],
    factions: [],
  }
}

function cloneKeepUniqueCombination(combination: KeepUniqueRule['combination']): KeepUniqueRule['combination'] {
  return {
    slots: [...combination.slots],
    sets: combination.sets.map((entry) => (entry.excluded ? { id: entry.id, excluded: true } : { id: entry.id })),
    metaSetIds: [...(combination.metaSetIds ?? [])],
    ranks: [...combination.ranks],
    rarities: [...combination.rarities],
    mainStats: [...(combination.mainStats ?? [])],
    factions: [...(combination.factions ?? [])],
  }
}

function getMainStatOptionsForSlots(slots: ArtifactTypeId[]): StatVariant[] {
  const union = new Set<StatVariant>()
  if (slots.length === 0) {
    Object.values(ALLOWED_MAIN_BY_SLOT).forEach((set) => {
      set.forEach((variant) => union.add(variant as StatVariant))
    })
  } else {
    slots.forEach((slotId) => {
      const options = ALLOWED_MAIN_BY_SLOT[Number(slotId) as ArtifactType]
      if (!options) return
      options.forEach((variant) => union.add(variant as StatVariant))
    })
  }
  if (union.size === 0) return [StatVariantEnum.Any]
  const sorted = Array.from(union).sort((a, b) => a - b)
  if (!sorted.includes(StatVariantEnum.Any)) {
    sorted.unshift(StatVariantEnum.Any)
  }
  return sorted
}

function dedupeNumericArray<T extends number>(values: readonly T[]): T[] {
  if (!values.length) return []
  const seen = new Set<number>()
  const result: T[] = []
  for (const value of values) {
    const numeric = Number(value)
    if (seen.has(numeric)) continue
    seen.add(numeric)
    result.push(value)
  }
  return result
}

function dedupeStringArray(values: readonly string[]): string[] {
  if (!values.length) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = typeof value === 'string' ? value.trim() : ''
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

const INLINE_SELECT_FIXED_HEIGHT_PX = (FONT_SIZE_BASE_PX * 2.4375) + 2

function getRuleSelectPaddingSx(selectionCount: number, fixedHeightPx?: number): SystemStyleObject<Theme> {
  const paddingPx = computeInlineSelectPadding(selectionCount > 0, selectionCount > 1)
  const contentMaxWidth = computeInlineSelectContentMaxWidth(paddingPx)
  const selectSx: SystemStyleObject<Theme> = {
    paddingRight: `${paddingPx}px`,
    width: '100%',
    minWidth: 0,
  }
  if (fixedHeightPx) {
    selectSx.minHeight = `${fixedHeightPx}px`
    selectSx.height = `${fixedHeightPx}px`
    selectSx.lineHeight = `${fixedHeightPx}px`
    selectSx.display = 'flex'
    selectSx.alignItems = 'center'
  }
  return {
    width: '100%',
    minWidth: 0,
    ...(fixedHeightPx ? { minHeight: `${fixedHeightPx}px`, height: `${fixedHeightPx}px` } : null),
    '& .MuiSelect-select': selectSx,
    '& .MuiSelect-select > *': {
      minWidth: 0,
      maxWidth: contentMaxWidth,
    },
  }
}

type RuleSelectAffordancesProps = {
  selectionCount: number
  clearLabel: string
  onClear: () => void
  children: ReactNode
  disabled?: boolean
}

function RuleSelectAffordances({
  selectionCount,
  clearLabel,
  onClear,
  children,
  disabled = false,
}: RuleSelectAffordancesProps) {
  const extraCount = Math.max(0, selectionCount - 1)
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        minWidth: 0,
        ...(disabled ? { pointerEvents: 'none', opacity: 0.6 } : {}),
      }}
      aria-disabled={disabled}
    >
      {children}
      <InlineSelectExtraBadge count={extraCount} />
      <InlineSelectClearButton
        disabled={disabled || selectionCount === 0}
        label={clearLabel}
        onClear={onClear}
      />
    </Box>
  )
}

type RuleFieldWithScopeChipProps = {
  chip?: ReactNode | null
  children: ReactNode
}

function RuleFieldWithScopeChip({ chip, children }: RuleFieldWithScopeChipProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {children}
      {chip ? (
        <Box component="span" sx={{ display: 'inline-flex' }}>
          {chip}
        </Box>
      ) : null}
    </Box>
  )
}
