import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import type { KeepUniqueDetectionEntry, KeepUniqueDetectionSnapshot, KeepUniqueRule } from '../../lib/keepUniques'
import { createKeepUniqueRuleId, getKeepUniqueItemKey } from '../../lib/keepUniques'
import type { TesterPreviewRow } from '../../types/testerPreview'
import type { ColorBlindMode } from '../../lib/constants'
import { MENU_CONTROL_HEIGHT_PX } from '../../lib/constants'
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
import { EmptyStateMessage } from '../EmptyStateMessage'
// MarkdownTooltip keeps the rule-count hints and info icons synchronized with the broader tooltip refactor.
import MarkdownTooltip from '../MarkdownTooltip'
import type { SetStateAction } from 'react'
import type { Metaset } from '../../lib/metasets'

type KeepUniquesTabProps = {
  rules: KeepUniqueRule[]
  enabled: boolean
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
  testerBuilding?: boolean
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
  suppressMatchDetails?: boolean
}

const ARTIFACT_SET_POOL: readonly ArtifactSetId[] = Object.freeze([...ARMOR_FIXED_SET_IDS, ...ARMOR_VARIABLE_SET_IDS])
export default function KeepUniquesTab({
  rules,
  enabled,
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
  testerBuilding = false,
  onJumpToRule,
  suppressMatchDetails = false,
}: KeepUniquesTabProps) {
  const { t } = useI18n()
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(() => rules[0]?.id ?? null)
  const [respectManualDeselect, setRespectManualDeselect] = useState(false)
  const [pendingDeleteRuleId, setPendingDeleteRuleId] = useState<string | null>(null)
  const [gridFilterMode, setGridFilterMode] = useState<'all' | 'selection'>('all')
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
    const newRule: KeepUniqueRule = { id: createKeepUniqueRuleId(), combination, requiredCount: 1, enabled: true }
    onRulesChange((prev) => [...prev, newRule])
    setSelectedRuleId(newRule.id)
    setRespectManualDeselect(false)
  }, [onRulesChange, setRespectManualDeselect])

  const handleDeleteRule = useCallback((ruleId: string) => {
    let filtered: KeepUniqueRule[] = []
    onRulesChange((prev) => {
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
  }, [onRulesChange, selectedRuleId, setRespectManualDeselect])

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
    onRulesChange((prev) => {
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
  }, [onRulesChange, setRespectManualDeselect])

  const updateRule = useCallback((ruleId: string, updater: (rule: KeepUniqueRule) => KeepUniqueRule) => {
    onRulesChange((prev) => prev.map((rule) => (rule.id === ruleId ? updater(rule) : rule)))
  }, [onRulesChange])

  const setRuleCombination = useCallback((
    ruleId: string,
    updater: (combination: KeepUniqueRule['combination']) => KeepUniqueRule['combination'],
  ) => {
    updateRule(ruleId, (rule) => ({ ...rule, combination: updater(rule.combination) }))
  }, [updateRule])
  const handleToggleGridFilterMode = useCallback(() => {
    setGridFilterMode((prev) => (prev === 'all' ? 'selection' : 'all'))
  }, [])

  let detectionSpinnerActive = false
  const detectionStatus = (() => {
    if (!enabled) return null
    if (rules.length === 0) {
      return <Alert severity="info">{t('keepUniquesNoRules')}</Alert>
    }
    if (testerRows.length === 0) {
      // Grid now surfaces the load-database hint, so the sidebar can stay focused on rules.
      return null
    }
    if (!detection || testerBuilding) {
      detectionSpinnerActive = true
      return null
    }
    detectionSpinnerActive = false
    return null
  })()

  const renderRuleCard = (rule: KeepUniqueRule) => {
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {duplicateButton}
        {deleteButton}
      </Box>
    )
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
          bgcolor: 'background.paper', // Keep the card background aligned with the dialog shell even when selected.
        }}
      >
        <Stack spacing={1.5}>
          <Box sx={{ height: 4 }} />
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <GearSlotSelect
                multiple
                value={slotSelection}
                onChange={(nextSlots) => {
                  setRuleCombination(rule.id, (prev) => sanitizeCombinationForSlots(nextSlots, prev, metasets))
                }}
                size="small"
                sx={{ minWidth: 0 }}
              />
              <GearSetsSelect
                value={setSelection}
                onChange={(nextSets) => {
                  setRuleCombination(rule.id, (prev) => ({ ...prev, sets: dedupeNumericArray(nextSets) }))
                }}
                metasets={metasets}
                selectedMetasetIds={combination.metaSetIds}
                onChangeMetasetIds={(nextMetaIds) => {
                  setRuleCombination(rule.id, (prev) => ({ ...prev, metaSetIds: dedupeStringArray(nextMetaIds) }))
                }}
                allowedSetIds={allowedSetPool}
                showMetasets
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <GearRankSelect
                multiple
                allowAny
                value={rankSelection}
                onChange={(nextRanks) => {
                  setRuleCombination(rule.id, (prev) => ({ ...prev, ranks: nextRanks }))
                }}
                size="small"
              />
              <GearRaritySelect
                multiple
                allowAny
                value={raritySelection}
                onChange={(nextRarities) => {
                  setRuleCombination(rule.id, (prev) => ({ ...prev, rarities: nextRarities }))
                }}
                size="small"
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: hasAccessorySlot ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 1 }}>
              <GearMainStatSelect
                multiple
                value={mainStatSelection}
                options={mainStatOptions}
                anyValue={StatVariantEnum.Any as StatVariant}
                onChange={(nextMain) => {
                  setRuleCombination(rule.id, (prev) => ({ ...prev, mainStats: dedupeNumericArray(nextMain) }))
                }}
                colorOverrides={substatColors}
                showBorderColors={useStatButtonColors}
                size="small"
              />
              {hasAccessorySlot ? (
                <GearFactionSelect
                  multiple
                  value={factionSelection}
                  onChange={(nextFactions) => {
                    setRuleCombination(rule.id, (prev) => ({ ...prev, factions: dedupeNumericArray(nextFactions) }))
                  }}
                  size="small"
                />
              ) : null}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                type="number"
                label={t('keepUniquesRequiredCount')}
                value={rule.requiredCount}
                onChange={(event) => {
                  const raw = Math.max(1, Math.floor(Number(event.target.value) || 1))
                  updateRule(rule.id, (prev) => ({ ...prev, requiredCount: raw }))
                }}
                InputProps={{
                  startAdornment: <InputAdornment position="start">≥</InputAdornment>,
                  endAdornment: (
                    <NumberSpinnerAdornment
                      ariaLabel={t('keepUniquesRequiredCount')}
                      onStep={(delta) => {
                        updateRule(rule.id, (prev) => {
                          const next = Math.max(1, Math.floor((prev.requiredCount ?? 1) + delta))
                          return { ...prev, requiredCount: next }
                        })
                      }}
                    />
                  ),
                }}
                sx={(themeInner) => ({
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
                }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: -1, display: 'block' }}
              >
                {t('keepUniquesRequiredCountHint')}
              </Typography>
              <FormControlLabel
                control={(
                  <Switch
                    checked={rule.enabled}
                    onChange={(_event, checked) => updateRule(rule.id, (prev) => ({ ...prev, enabled: checked }))}
                  />
                )}
                label={t('keepUniquesRuleEnabledToggle')}
              />
            </Box>
            {ruleDetection ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* Rule detection counts use MarkdownTooltip so the formatter can add bullets later if needed. */}
                <MarkdownTooltip markdown={t('keepUniquesRuleCountsTooltip')}>
                  <Typography
                    variant="caption"
                    color={ruleDetection.deficit > 0 ? 'error.main' : 'text.secondary'}
                    sx={{ flex: 1 }}
                  >
                    {t('keepUniquesRuleCounts', {
                      have: ruleDetection.currentCount,
                      keep: ruleDetection.requiredCount,
                      projected: ruleDetection.projectedCount,
                    })}
                  </Typography>
                </MarkdownTooltip>
                {actionButtons}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                {actionButtons}
              </Box>
            )}
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2">{t('keepUniquesTabLabel')}</Typography>
                  {/* Info icon uses MarkdownTooltip so the hint shares the global hover delay. */}
                  <MarkdownTooltip markdown={t('keepUniquesTabHint')}>
                    <InfoOutlinedIcon fontSize="small" color="action" />
                  </MarkdownTooltip>
                </Box>
                <Typography variant="body2" color="text.secondary">{t('keepUniquesTabIntro')}</Typography>
                <FormControlLabel
                  control={(
                    <Switch
                      checked={enabled}
                      onChange={(_, checked) => onToggleEnabled(checked)}
                    />
                  )}
                  label={t('keepUniquesEnableLabel')}
                />
                {detectionStatus}
              </Stack>
            </Box>
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pt: 2, pr: 1 }}>
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
                {detectionSpinnerActive ? (
                  <CircularProgress
                    size={20}
                    thickness={4}
                    aria-label={t('keepUniquesScanPending')}
                    sx={{ color: 'warning.main' }}
                  />
                ) : null}
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
              {testerRows.length === 0 ? (
                <EmptyStateMessage
                  borderVariant="dashed"
                  minHeight="100%"
                  sx={{ height: '100%', px: 3 }}
                >
                  {/* Empty tester states keep the grid column purposeful instead of blank space. */}
                  {t('keepUniquesNoTesterData')}
                </EmptyStateMessage>
              ) : (
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
                />
              )}
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
