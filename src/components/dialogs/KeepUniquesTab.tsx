import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  Box,
  Button,
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
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import FilterListIcon from '@mui/icons-material/FilterList'
import FilterListOffIcon from '@mui/icons-material/FilterListOff'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import {
  KEEP_UNIQUE_DEFAULT_COUNT_MODE,
  sanitizeKeepUniqueCountMode,
  type KeepUniqueDetectionEntry,
  type KeepUniqueDetectionSnapshot,
  type KeepUniqueRule,
} from '../../lib/keepUniques'
import { createKeepUniqueRuleId, getKeepUniqueItemKey } from '../../lib/keepUniques'
import type { TesterPreviewRow } from '../../types/testerPreview'
import type { ColorBlindMode } from '../../lib/constants'
import { FONT_SIZE_BASE_PX, MENU_CONTROL_HEIGHT_PX } from '../../lib/constants'
import type { ArtifactSetId, ArtifactTypeId, StatVariant } from '../../lib/types'
import {
  ACCESSORY_SLOTS_COMPATIBLE_SET_IDS,
  ALLOWED_MAIN_BY_SLOT,
  ARMOR_FIXED_SET_IDS,
  ARMOR_VARIABLE_SET_IDS,
  ALL_ARTIFACT_SET_IDS,
  ArtifactType,
  StatVariant as StatVariantEnum,
} from '../../lib/types'
import { isAccessorySlot } from '../../lib/testerDomain'
import { useI18n } from '../../lib/i18n'
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSetsSelect, GearSlotSelect } from '../gear'
import { TesterItemsGrid } from '../TesterItemsGrid'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import WorkloadProgressIndicator from '../WorkloadProgressIndicator'
// MarkdownTooltip keeps the rule-count hints and info icons synchronized with the broader tooltip refactor.
import MarkdownTooltip from '../MarkdownTooltip'
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

const SCOPE_CHIP_HOVER_ALPHA = { light: 0.12, dark: 0.24 } as const

type KeepUniquesTabProps = {
  rules: KeepUniqueRule[]
  enabled: boolean
  finalSellCoverageWarningActive: boolean
  onRulesChange: (next: SetStateAction<KeepUniqueRule[]>) => void
  onToggleEnabled: (next: SetStateAction<boolean>) => void
  detection: KeepUniqueDetectionSnapshot | null
  testerRows: TesterPreviewRow[]
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

const ARTIFACT_SET_POOL: readonly ArtifactSetId[] = Object.freeze([...ARMOR_FIXED_SET_IDS, ...ARMOR_VARIABLE_SET_IDS])
export default function KeepUniquesTab({
  rules,
  enabled,
  finalSellCoverageWarningActive,
  onRulesChange,
  onToggleEnabled,
  detection,
  testerRows,
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
  // Warn when Keep Uniques runs without Final Sell covering 0–16 so users revisit the baseline sweep.
  const keepUniquesFinalSellWarning = enabled && finalSellCoverageWarningActive
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(() => rules[0]?.id ?? null)
  const [respectManualDeselect, setRespectManualDeselect] = useState(false)
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null)
  const [gridFilterMode, setGridFilterMode] = useState<'all' | 'selection'>('all')
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
    if (uniqueItemKeySet.size === testerRows.length) return testerRows
    return testerRows.filter((row) => uniqueItemKeySet.has(getKeepUniqueItemKey(row.artifact)))
  }, [testerRows, uniqueItemKeySet])
  const uniqueFilterActive = testerRows.length > uniqueRows.length
  // Highlight callback lets the tester grid fade non-matching cards instead of mutating the dataset.
  const highlightRowPredicate = useMemo(() => {
    if (!selectedEntry || selectedItemKeys.size === 0) return null
    return (row: TesterPreviewRow) => selectedItemKeys.has(getKeepUniqueItemKey(row.artifact))
  }, [selectedEntry, selectedItemKeys])
  const highlightActive = Boolean(highlightRowPredicate)
  const selectionFilterApplied = gridFilterMode === 'selection' && Boolean(highlightRowPredicate)
  const gridRows = useMemo(() => {
    if (!selectionFilterApplied || !highlightRowPredicate) return uniqueRows
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
  const hasTesterGear = testerRows.length > 0
  const selectionChipLabel = useMemo(() => {
    if (selectedEntry) {
      // Keep the detail chip focused on the highlighted combination whenever a rule is active.
      return t('keepUniquesGridSelectedCount', { count: selectedVisibleRowCount })
    }
    if (testerRows.length === 0 && uniqueRows.length === 0) return null
    // Surface the aggregate unique count so the toolbar never collapses when no rule is selected.
    return t('keepUniquesGridUniqueCount', { count: uniqueRows.length })
  }, [selectedEntry, selectedVisibleRowCount, testerRows.length, t, uniqueRows.length])

  const handleAddRule = useCallback(() => {
    const combination = makeDefaultKeepUniqueCombination()
    // Default new rules to per-set counting so cards immediately guard each combination.
    const newRule: KeepUniqueRule = {
      id: createKeepUniqueRuleId(),
      combination,
      name: '',
      requiredCount: 1,
      enabled: true,
      countMode: { ...KEEP_UNIQUE_DEFAULT_COUNT_MODE },
    }
    mutateRules((prev) => [...prev, newRule])
    setSelectedRuleId(newRule.id)
    setRespectManualDeselect(false)
  }, [mutateRules, setRespectManualDeselect])

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
      setSelectedRuleId(newRuleId)
      setRespectManualDeselect(false)
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
  }, [])

  const renderRuleCard = (rule: KeepUniqueRule) => {
    const ruleDisabled = !rule.enabled
    const combination = rule.combination
    const ruleDetection = detectionByRuleId.get(rule.id) ?? null
    const slotSelection = combination.slots
    const slotAny = slotSelection.length === 0
    const hasAccessorySlot = slotAny || slotSelection.some((slotId) => isAccessorySlot(slotId))
    const hasArmorSlot = slotAny || slotSelection.some((slotId) => !isAccessorySlot(slotId))
    const allowedSetPool = hasAccessorySlot && hasArmorSlot
      ? ALL_ARTIFACT_SET_IDS
      : (hasAccessorySlot ? ACCESSORY_SLOTS_COMPATIBLE_SET_IDS : ARTIFACT_SET_POOL)
    const setSelection = combination.sets.filter((setId) => allowedSetPool.includes(setId))
    const rankSelection = combination.ranks
    const raritySelection = combination.rarities
    const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
    const mainStatSelection = dedupeNumericArray((combination.mainStats ?? []).filter((variant) => mainStatOptions.includes(variant)))
    const factionSelection = hasAccessorySlot ? dedupeNumericArray(combination.factions ?? []) : []
    const selected = effectiveSelectedRuleId === rule.id
    const handleRuleCardClick = (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null
      const interactiveElements = target?.closest('button, input, select, textarea, [contenteditable="true"], [role="button"], [role="option"], [role="menuitem"], [role="combobox"], [data-rule-card-interactive="true"]')
      if (interactiveElements) return
      if (selected) {
        setSelectedRuleId(null)
        setRespectManualDeselect(true)
      } else {
        setSelectedRuleId(rule.id)
        setRespectManualDeselect(false)
      }
    }
    const deleteButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); setPendingDeleteRuleId(rule.id) }}
        aria-label={t('keepUniquesDeleteRule')}
        color="error"
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    )
    const duplicateButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); handleDuplicateRule(rule.id) }}
        aria-label={t('keepUniquesDuplicateRule')}
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
    return (
      <Box
        key={rule.id}
        onClick={handleRuleCardClick}
        sx={{
          borderRadius: '8px',
          border: '1px solid',
          borderColor: selected ? 'primary.main' : 'divider', // Selected rules now rely on the dialog's blue accent.
          p: 1.5,
          mb: 1.5,
          cursor: 'pointer',
          bgcolor: 'inherit', // Match the surrounding dialog background so cards don't float on a separate surface.
        }}
      >
        <Stack spacing={1.5}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Box component="span" data-rule-card-interactive="true">
              <FormControlLabel
                control={(
                  <Switch
                    checked={rule.enabled}
                    onChange={(_event, checked) => updateRule(rule.id, (prev) => ({ ...prev, enabled: checked }), checked)}
                  />
                )}
                label={t('keepUniquesRuleEnabledToggle')}
              />
            </Box>
            <Stack
              direction="row"
              spacing={0.5}
              alignItems="center"
              sx={{ color: 'text.secondary' }}
              data-rule-card-interactive="true"
            >
              <Typography variant="caption" component="span" color="inherit">
                {t('keepUniquesCountModeToggleLabel')}
              </Typography>
              <MarkdownTooltip markdown={t('keepUniquesCountModeHint')}>
                <IconButton
                  size="small"
                  color="inherit"
                  aria-label={t('keepUniquesCountModeHintLabel')}
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
            </Stack>
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
                      setRuleCombination(rule.id, (prev) => sanitizeCombinationForSlots(nextSlots, prev, metasets))
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
                    setRuleCombination(rule.id, (prev) => ({ ...prev, sets: dedupeNumericArray(nextSets) }))
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
              {actionButtons}
            </Box>
          </Stack>
        </Stack>
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
      <Box sx={{ flex: 1, minHeight: 0, height: '100%', p: 3, boxSizing: 'border-box' }}>
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
            <Box
              sx={(theme) => ({
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                pt: 2,
                pr: 1,
                ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: theme.spacing(1) }),
              })}
            >
              {rules.length === 0 ? (
                <Typography variant="body2" color="text.secondary">{t('keepUniquesNoRules')}</Typography>
              ) : null}
              {rules.map(renderRuleCard)}
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
              <Button startIcon={<AddIcon />} variant="contained" onClick={handleAddRule} sx={{ minHeight: MENU_CONTROL_HEIGHT_PX }}>
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
                hasTesterData={hasTesterGear}
                emptyStateOptions={!hasTesterGear ? {
                  borderVariant: 'dashed',
                  minHeight: '100%',
                  sx: { height: '100%', px: 3 },
                } : undefined}
              />
            </Box>
          </Box>
        </Box>
      </Box>
    </>
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

function sanitizeCombinationForSlots(slots: ArtifactTypeId[], combination: KeepUniqueRule['combination'], metasets: Metaset[]): KeepUniqueRule['combination'] {
  const normalizedSlots = dedupeNumericArray(slots)
  const allowedSetPool = resolveAllowedSetPool(normalizedSlots)
  const allowedSetIds = new Set(allowedSetPool.map(Number))
  const filteredSets = combination.sets.filter((setId) => allowedSetIds.has(Number(setId)))
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
    : (hadExplicitSetSelection && allowedSetPool[0] ? [allowedSetPool[0]] : [])
  return {
    ...combination,
    slots: normalizedSlots,
    sets: resolvedSets,
    metaSetIds: filteredMetaIds,
    mainStats: filteredMainStats,
    factions: filteredFactions,
  }
}

function cloneKeepUniqueCombination(combination: KeepUniqueRule['combination']): KeepUniqueRule['combination'] {
  return {
    slots: [...combination.slots],
    sets: [...combination.sets],
    metaSetIds: [...(combination.metaSetIds ?? [])],
    ranks: [...combination.ranks],
    rarities: [...combination.rarities],
    mainStats: [...(combination.mainStats ?? [])],
    factions: [...(combination.factions ?? [])],
  }
}

function resolveAllowedSetPool(slots: ArtifactTypeId[]): readonly ArtifactSetId[] {
  const slotAny = slots.length === 0
  const hasAccessory = slotAny || slots.some((slotId) => isAccessorySlot(slotId))
  const hasArmor = slotAny || slots.some((slotId) => !isAccessorySlot(slotId))
  if (hasAccessory && hasArmor) return ALL_ARTIFACT_SET_IDS
  return hasAccessory ? ACCESSORY_SLOTS_COMPATIBLE_SET_IDS : ARTIFACT_SET_POOL
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
        <Box component="span" data-rule-card-interactive="true" sx={{ display: 'inline-flex' }}>
          {chip}
        </Box>
      ) : null}
    </Box>
  )
}
