import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import type { KeepUniqueDetectionEntry, KeepUniqueDetectionSnapshot, KeepUniqueRule } from '../../lib/keepUniques'
import { createKeepUniqueRuleId, getKeepUniqueRowKey } from '../../lib/keepUniques'
import type { TesterPreviewRow } from '../../types/testerPreview'
import type { ColorBlindMode } from '../../lib/constants'
import { MENU_CONTROL_HEIGHT_PX } from '../../lib/constants'
import type { ArtifactSetId, ArtifactTypeId, StatVariant } from '../../lib/types'
import {
  ACCESSORY_SET_IDS,
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
import type { SetStateAction } from 'react'
import type { Metaset } from '../../lib/metasets'

type KeepUniquesTabProps = {
  rules: KeepUniqueRule[]
  enabled: boolean
  onRulesChange: (next: SetStateAction<KeepUniqueRule[]>) => void
  onToggleEnabled: (next: SetStateAction<boolean>) => void
  detection: KeepUniqueDetectionSnapshot | null
  testerRows: TesterPreviewRow[]
  uniqueRowKeys: ReadonlySet<number>
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
}

const ARTIFACT_SET_POOL: readonly ArtifactSetId[] = Object.freeze([...ARMOR_FIXED_SET_IDS, ...ARMOR_VARIABLE_SET_IDS])
const DEFAULT_ARTIFACT_SET_ID: ArtifactSetId = ARTIFACT_SET_POOL[0] ?? (ARMOR_FIXED_SET_IDS[0] ?? (0 as ArtifactSetId))
const DEFAULT_ACCESSORY_SET_ID: ArtifactSetId = ACCESSORY_SET_IDS[0] ?? (0 as ArtifactSetId)
const DEFAULT_SLOT: ArtifactTypeId = ArtifactType.Weapon

export default function KeepUniquesTab({
  rules,
  enabled,
  onRulesChange,
  onToggleEnabled,
  detection,
  testerRows,
  uniqueRowKeys,
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
}: KeepUniquesTabProps) {
  const { t } = useI18n()
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(rules[0]?.id ?? null)
  const effectiveSelectedRuleId = useMemo(() => {
    if (!selectedRuleId) return rules[0]?.id ?? null
    return rules.some((rule) => rule.id === selectedRuleId) ? selectedRuleId : (rules[0]?.id ?? null)
  }, [rules, selectedRuleId])

  const detectionEntries = useMemo(() => detection?.entries ?? [], [detection])
  const detectionByRuleId = useMemo(() => {
    const map = new Map<string, KeepUniqueDetectionEntry>()
    for (const entry of detectionEntries) {
      if (entry.ruleId) map.set(entry.ruleId, entry)
    }
    return map
  }, [detectionEntries])
  const selectedEntry = effectiveSelectedRuleId ? detectionByRuleId.get(effectiveSelectedRuleId) ?? null : null
  const selectedRowKeys = useMemo(() => new Set<number>(selectedEntry?.rowKeys ?? []), [selectedEntry])
  const uniqueRowKeySet = uniqueRowKeys
  const gridRows = useMemo(() => {
    if (uniqueRowKeySet.size === 0) return []
    if (uniqueRowKeySet.size === testerRows.length) return testerRows
    return testerRows.filter((row) => uniqueRowKeySet.has(getKeepUniqueRowKey(row.artifact)))
  }, [testerRows, uniqueRowKeySet])
  const uniqueFilterActive = testerRows.length > gridRows.length
  // Highlight callback lets the tester grid fade non-matching cards instead of mutating the dataset.
  const highlightRowPredicate = useMemo(() => {
    if (!selectedEntry || selectedRowKeys.size === 0) return null
    return (row: TesterPreviewRow) => selectedRowKeys.has(getKeepUniqueRowKey(row.artifact))
  }, [selectedEntry, selectedRowKeys])
  const highlightActive = Boolean(highlightRowPredicate)
  const selectedVisibleRowCount = useMemo(() => {
    if (!selectedEntry || selectedEntry.rowKeys.length === 0) return 0
    let count = 0
    for (const key of selectedEntry.rowKeys) {
      if (uniqueRowKeySet.has(key)) count += 1
    }
    return count
  }, [selectedEntry, uniqueRowKeySet])
  const highlightFilterActive = highlightActive && gridRows.length > selectedVisibleRowCount
  const gridFiltered = uniqueFilterActive || highlightFilterActive

  const handleAddRule = useCallback(() => {
    const tuple = makeTupleForSlot(DEFAULT_SLOT)
    const newRule: KeepUniqueRule = { id: createKeepUniqueRuleId(), tuple, requiredCount: 1, enabled: true }
    onRulesChange((prev) => [...prev, newRule])
    setSelectedRuleId(newRule.id)
  }, [onRulesChange])

  const handleDeleteRule = useCallback((ruleId: string) => {
    onRulesChange((prev) => {
      const filtered = prev.filter((rule) => rule.id !== ruleId)
      setSelectedRuleId((current) => {
        if (current !== ruleId) return current
        return filtered[0]?.id ?? null
      })
      return filtered
    })
  }, [onRulesChange])

  const updateRule = useCallback((ruleId: string, updater: (rule: KeepUniqueRule) => KeepUniqueRule) => {
    onRulesChange((prev) => prev.map((rule) => (rule.id === ruleId ? updater(rule) : rule)))
  }, [onRulesChange])

  const setRuleTuple = useCallback((
    ruleId: string,
    updater: (tuple: KeepUniqueRule['tuple']) => KeepUniqueRule['tuple'],
  ) => {
    updateRule(ruleId, (rule) => ({ ...rule, tuple: updater(rule.tuple) }))
  }, [updateRule])

  const deficitCount = detectionEntries.filter((entry) => entry.deficit > 0).length

  let detectionChip: JSX.Element | null = null
  const detectionStatus = (() => {
    if (!enabled) return null
    if (testerRows.length === 0) {
      return <Alert severity="info">{t('keepUniquesNoTesterData')}</Alert>
    }
    if (!detection || testerBuilding) {
      detectionChip = (
        <Chip
          size="small"
          color="warning"
          label={t('keepUniquesScanPending')}
        />
      )
      return null
    }
    detectionChip = (
      <Chip
        size="small"
        color="warning"
        label={t('keepUniquesDeficitSummary', { count: deficitCount })}
      />
    )
    return null
  })()

  const renderRuleCard = (rule: KeepUniqueRule) => {
    const tuple = rule.tuple
    const ruleDetection = detectionByRuleId.get(rule.id) ?? null
    const slotSelection = tuple.slots
    const slotAny = slotSelection.length === 0
    const hasAccessorySlot = slotAny || slotSelection.some((slotId) => isAccessorySlot(slotId))
    const hasArmorSlot = slotAny || slotSelection.some((slotId) => !isAccessorySlot(slotId))
    const allowedSetPool = hasAccessorySlot && hasArmorSlot
      ? ALL_ARTIFACT_SET_IDS
      : (hasAccessorySlot ? ACCESSORY_SET_IDS : ARTIFACT_SET_POOL)
    const setSelection = tuple.sets.filter((setId) => allowedSetPool.includes(setId))
    const rankSelection = tuple.ranks
    const raritySelection = tuple.rarities
    const mainStatOptions = getMainStatOptionsForSlots(slotSelection)
    const mainStatSelection = dedupeNumericArray((tuple.mainStats ?? []).filter((variant) => mainStatOptions.includes(variant)))
    const factionSelection = hasAccessorySlot ? dedupeNumericArray(tuple.factions ?? []) : []
    const selected = effectiveSelectedRuleId === rule.id
    const deleteButton = (
      <IconButton
        size="small"
        onClick={(event) => { event.stopPropagation(); handleDeleteRule(rule.id) }}
        aria-label={t('keepUniquesDeleteRule')}
      >
        <DeleteOutlineIcon fontSize="small" />
      </IconButton>
    )
    return (
      <Box
        key={rule.id}
        onClick={() => setSelectedRuleId(rule.id)}
        sx={(theme) => ({
          borderRadius: 2,
          border: '1px solid',
          borderColor: selected ? theme.palette.warning.main : theme.palette.divider,
          p: 1.5,
          mb: 1.5,
          cursor: 'pointer',
          backgroundColor: selected ? alpha(theme.palette.warning.main, 0.08) : theme.palette.background.paper,
        })}
      >
        <Stack spacing={1.5}>
          <Box sx={{ height: 4 }} />
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <GearSlotSelect
                multiple
                value={slotSelection}
                onChange={(nextSlots) => {
                  setRuleTuple(rule.id, (prev) => sanitizeTupleForSlots(nextSlots, prev, metasets))
                }}
                size="small"
                sx={{ minWidth: 0 }}
              />
              <GearSetsSelect
                value={setSelection}
                onChange={(nextSets) => {
                  setRuleTuple(rule.id, (prev) => ({ ...prev, sets: dedupeNumericArray(nextSets) }))
                }}
                metasets={metasets}
                selectedMetasetIds={tuple.metaSetIds}
                onChangeMetasetIds={(nextMetaIds) => {
                  setRuleTuple(rule.id, (prev) => ({ ...prev, metaSetIds: dedupeStringArray(nextMetaIds) }))
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
                  setRuleTuple(rule.id, (prev) => ({ ...prev, ranks: nextRanks }))
                }}
                size="small"
              />
              <GearRaritySelect
                multiple
                allowAny
                value={raritySelection}
                onChange={(nextRarities) => {
                  setRuleTuple(rule.id, (prev) => ({ ...prev, rarities: nextRarities }))
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
                  setRuleTuple(rule.id, (prev) => ({ ...prev, mainStats: dedupeNumericArray(nextMain) }))
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
                    setRuleTuple(rule.id, (prev) => ({ ...prev, factions: dedupeNumericArray(nextFactions) }))
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
                {deleteButton}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                {deleteButton}
              </Box>
            )}
          </Stack>
        </Stack>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, height: '100%', p: 3, boxSizing: 'border-box' }}>
      <Box
        sx={{
          display: { xs: 'block', md: 'grid' },
          gridTemplateColumns: { md: '360px minmax(0, 1fr)' },
          height: '100%',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <Box sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="subtitle2">{t('keepUniquesTabLabel')}</Typography>
                <Tooltip title={t('keepUniquesTabHint')}>
                  <InfoOutlinedIcon fontSize="small" color="action" />
                </Tooltip>
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
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                <Typography variant="body2" color="text.secondary">{t('keepUniquesNoRules')}</Typography>
                <Button startIcon={<AddIcon />} variant="contained" onClick={handleAddRule}>{t('keepUniquesAddRule')}</Button>
              </Box>
            ) : (
              rules.map(renderRuleCard)
            )}
          </Box>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <Button startIcon={<AddIcon />} variant="contained" onClick={handleAddRule} sx={{ minHeight: MENU_CONTROL_HEIGHT_PX }}>
            {t('keepUniquesAddRule')}
          </Button>
        </Box>
        </Box>
        <Box sx={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle2">{t('keepUniquesGridTitle')}</Typography>
          {selectedEntry ? (
            <Chip size="small" label={t('keepUniquesGridSelectedCount', { count: selectedVisibleRowCount })} />
          ) : null}
          {detectionChip}
        </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <TesterItemsGrid
              rows={gridRows}
              filterActive={gridFiltered}
              substatColors={substatColors}
              useStatButtonColors={useStatButtonColors}
              testerBuilding={testerBuilding}
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
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function makeTupleForSlot(slot: ArtifactTypeId): KeepUniqueRule['tuple'] {
  const accessorySlot = isAccessorySlot(slot)
  const setPool = accessorySlot ? ACCESSORY_SET_IDS : ARTIFACT_SET_POOL
  return {
    slots: [slot],
    sets: setPool.length > 0 ? [setPool[0] ?? (accessorySlot ? DEFAULT_ACCESSORY_SET_ID : DEFAULT_ARTIFACT_SET_ID)] : [],
    metaSetIds: [],
    ranks: [],
    rarities: [],
    mainStats: [],
    factions: accessorySlot ? [] : [],
  }
}

function sanitizeTupleForSlots(slots: ArtifactTypeId[], tuple: KeepUniqueRule['tuple'], metasets: Metaset[]): KeepUniqueRule['tuple'] {
  const normalizedSlots = dedupeNumericArray(slots)
  const allowedSetPool = resolveAllowedSetPool(normalizedSlots)
  const allowedSetIds = new Set(allowedSetPool.map(Number))
  const filteredSets = tuple.sets.filter((setId) => allowedSetIds.has(Number(setId)))
  const filteredMetaIds = (tuple.metaSetIds ?? []).filter((metaId) => {
    const meta = metasets.find((item) => item.id === metaId)
    if (!meta || !meta.sets.length) return false
    return meta.sets.every((setId) => allowedSetIds.has(Number(setId)))
  })
  const mainOptions = getMainStatOptionsForSlots(normalizedSlots)
  const hasAccessory = normalizedSlots.length === 0 || normalizedSlots.some((slotId) => isAccessorySlot(slotId))
  const filteredMainStats = dedupeNumericArray((tuple.mainStats ?? []).filter((variant) => mainOptions.includes(variant)))
  const filteredFactions = hasAccessory ? dedupeNumericArray(tuple.factions ?? []) : []
  return {
    ...tuple,
    slots: normalizedSlots,
    sets: filteredSets.length > 0 ? filteredSets : (allowedSetPool[0] ? [allowedSetPool[0]] : []),
    metaSetIds: filteredMetaIds,
    mainStats: filteredMainStats,
    factions: filteredFactions,
  }
}

function resolveAllowedSetPool(slots: ArtifactTypeId[]): readonly ArtifactSetId[] {
  const slotAny = slots.length === 0
  const hasAccessory = slotAny || slots.some((slotId) => isAccessorySlot(slotId))
  const hasArmor = slotAny || slots.some((slotId) => !isAccessorySlot(slotId))
  if (hasAccessory && hasArmor) return ALL_ARTIFACT_SET_IDS
  return hasAccessory ? ACCESSORY_SET_IDS : ARTIFACT_SET_POOL
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
