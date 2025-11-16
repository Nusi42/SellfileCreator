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
  ToggleButton,
  ToggleButtonGroup,
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
import type { ArtifactSetId, ArtifactTypeId, RankValue, StatVariant } from '../../lib/types'
import {
  ACCESSORY_SET_IDS,
  ALLOWED_MAIN_BY_SLOT,
  ARMOR_FIXED_SET_IDS,
  ARMOR_VARIABLE_SET_IDS,
  ALL_ARTIFACT_SET_IDS,
  ArtifactType,
  artifactSetI18nKey,
  artifactSetNames,
  artifactTypeI18nKey,
  factionI18nKey,
  RANK_VALUES,
  StatVariant as StatVariantEnum,
  statVariantI18nKey,
} from '../../lib/types'
import { isAccessorySlot } from '../../lib/testerDomain'
import { useI18n } from '../../lib/i18n'
import { GearFactionSelect, GearMainStatSelect, GearSetsSelect } from '../gear'
import { artifactTypeIconList } from '../artifactTypeIcons'
import { SetIcon } from '../SetIcon'
import { TesterItemsGrid } from '../TesterItemsGrid'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import type { SetStateAction } from 'react'
import type { Metaset } from '../../lib/metasets'
import { metasetGlyph } from '../../lib/metasets'

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

  const rarityLabel = useCallback((rarity: RankValue): string => {
    if (rarity === 1) return t('rarityCommon')
    if (rarity === 2) return t('rarityUncommon')
    if (rarity === 3) return t('rarityRare')
    if (rarity === 4) return t('rarityEpic')
    if (rarity === 5) return t('rarityLegendary')
    return t('rarityMythical')
  }, [t])

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
    if (deficitCount === 0) {
      return <Alert severity="success">{t('keepUniquesAllProtected')}</Alert>
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
    const mainStatValue = mainStatOptions.includes(tuple.mainStat) ? tuple.mainStat : StatVariantEnum.Any
    const factionValue = hasAccessorySlot ? (tuple.factions[0] ?? null) : null
    const selected = effectiveSelectedRuleId === rule.id
    const slotChips = (() => {
      if (slotSelection.length === 0) return [<Chip key="slot-any" label={t('any')} size="small" />]
      const limit = 3
      const nodes = slotSelection.slice(0, limit).map((slotId) => {
        const def = artifactTypeIconList.find((entry) => Number(entry.id) === Number(slotId))
        const SlotIconComponent = def?.Icon
        const iconProps = SlotIconComponent ? { icon: <SlotIconComponent fontSize="small" /> } : {}
        return (
          <Chip
            key={`slot-${slotId}`}
            label={t(artifactTypeI18nKey(slotId))}
            size="small"
            {...iconProps}
          />
        )
      })
      if (slotSelection.length > limit) {
        nodes.push(<Chip key="slot-more" label={`+${slotSelection.length - limit}`} size="small" />)
      }
      return nodes
    })()
    const metasetSelection = tuple.metaSetIds ?? []
    const setChips = (() => {
      const chips: JSX.Element[] = []
      const metaLimit = 3
      metasetSelection.slice(0, metaLimit).forEach((metaId) => {
        const meta = metasets.find((item) => item.id === metaId)
        const label = meta ? meta.name : metaId
        const { glyph, iconId } = meta ? metasetGlyph(meta) : { glyph: null, iconId: null }
        chips.push(
          <Chip
            key={`meta-${metaId}`}
            label={glyph ? `${glyph}${iconId && iconId !== 'empty' ? ` ${label}` : label}` : label}
            size="small"
          />,
        )
      })
      if (metasetSelection.length > metaLimit) {
        chips.push(<Chip key="meta-more" label={`+${metasetSelection.length - metaLimit}`} size="small" />)
      }
      const setLimit = 3
      setSelection.slice(0, setLimit).forEach((setId) => {
        const label = t(artifactSetI18nKey(setId)) || artifactSetNames[setId] || String(setId)
        chips.push(
          <Chip
            key={`set-${setId}`}
            label={label}
            size="small"
            icon={<SetIcon setId={setId} size={16} />}
          />,
        )
      })
      if (setSelection.length > setLimit) {
        chips.push(<Chip key="set-more" label={`+${setSelection.length - setLimit}`} size="small" />)
      }
      if (chips.length === 0) {
        chips.push(<Chip key="set-any" label={t('any')} size="small" />)
      }
      return chips
    })()
    const rankChips = (() => {
      if (rankSelection.length === 0) return [<Chip key="rank-any" label={t('any')} size="small" />]
      return rankSelection.map((rank) => (
        <Chip key={`rank-${rank}`} label={t('keepUniquesRankChip', { rank })} size="small" />
      ))
    })()
    const rarityChips = (() => {
      if (raritySelection.length === 0) return [<Chip key="rarity-any" label={t('any')} size="small" />]
      return raritySelection.map((rarity) => (
        <Chip key={`rarity-${rarity}`} label={rarityLabel(rarity)} size="small" />
      ))
    })()
    const mainStatChip = (
      <Chip
        label={mainStatValue === StatVariantEnum.Any ? t('any') : t(statVariantI18nKey(mainStatValue))}
        size="small"
      />
    )
    const factionChips = (() => {
      if (!hasAccessorySlot) return null
      if (!tuple.factions.length) return <Chip key="faction-any" label={t('any')} size="small" />
      return tuple.factions.map((faction) => (
        <Chip key={`faction-${faction}`} label={t(factionI18nKey(faction))} size="small" />
      ))
    })()
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {ruleDetection?.deficit ? (
              <Chip size="small" color="error" label={t('keepUniquesRuleDeficit', { count: ruleDetection.deficit })} />
            ) : ruleDetection ? (
              <Chip size="small" color={ruleDetection.coveredByExisting ? 'success' : 'default'} label={ruleDetection.coveredByExisting ? t('keepUniquesRuleCovered') : t('keepUniquesRuleSatisfied')} />
            ) : null}
            <Box sx={{ flex: 1 }} />
            <IconButton
              size="small"
              onClick={(event) => { event.stopPropagation(); handleDeleteRule(rule.id) }}
              aria-label={t('keepUniquesDeleteRule')}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {slotChips}
            {setChips}
            {rankChips}
            {rarityChips}
            {mainStatChip}
            {factionChips}
          </Box>
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <ToggleButtonGroup
                size="small"
                value={tuple.slots.map(String)}
                onChange={(_, values: string[]) => {
                  const parsed = values.map((val) => Number(val) as ArtifactTypeId)
                  setRuleTuple(rule.id, (prev) => sanitizeTupleForSlots(parsed, prev, metasets))
                }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 0.5,
                }}
              >
                {artifactTypeIconList.map(({ id, Icon }) => (
                  <Tooltip key={id} title={t(artifactTypeI18nKey(id))}>
                    <ToggleButton value={String(id)} aria-label={t(artifactTypeI18nKey(id))}>
                      <Icon fontSize="inherit" />
                    </ToggleButton>
                  </Tooltip>
                ))}
              </ToggleButtonGroup>
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
              <ToggleButtonGroup
                size="small"
                value={rankSelection.map(String)}
                onChange={(_, values: string[]) => {
                  const parsed = values
                    .map((val) => Number(val))
                    .filter((num): num is RankValue => Number.isFinite(num) && num >= 1 && num <= 6)
                    .sort((a, b) => a - b)
                  setRuleTuple(rule.id, (prev) => ({ ...prev, ranks: parsed }))
                }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 0.5,
                }}
              >
                {RANK_VALUES.map((rank) => (
                  <ToggleButton key={`rank-${rank}`} value={String(rank)}>
                    {t(`star${rank}`)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <ToggleButtonGroup
                size="small"
                value={raritySelection.map(String)}
                onChange={(_, values: string[]) => {
                  const parsed = values
                    .map((val) => Number(val))
                    .filter((num): num is RankValue => Number.isFinite(num) && num >= 1 && num <= 6)
                    .sort((a, b) => a - b)
                  setRuleTuple(rule.id, (prev) => ({ ...prev, rarities: parsed }))
                }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  gap: 0.5,
                }}
              >
                {RANK_VALUES.map((rarity) => (
                  <ToggleButton key={`rarity-${rarity}`} value={String(rarity)}>
                    {rarityLabel(rarity)}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: hasAccessorySlot ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 1 }}>
              <GearMainStatSelect
                value={mainStatValue}
                options={mainStatOptions}
                anyValue={StatVariantEnum.Any as StatVariant}
                onChange={(nextMain) => {
                  setRuleTuple(rule.id, (prev) => ({ ...prev, mainStat: nextMain }))
                }}
                colorOverrides={substatColors}
                showBorderColors={useStatButtonColors}
                size="small"
              />
              {hasAccessorySlot ? (
                <GearFactionSelect
                  value={factionValue}
                  onChange={(nextFaction) => {
                    setRuleTuple(rule.id, (prev) => ({ ...prev, factions: nextFaction == null ? [] : [nextFaction] }))
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
              <Typography variant="caption" color={ruleDetection.deficit > 0 ? 'error.main' : 'text.secondary'}>
                {t('keepUniquesRuleCounts', {
                  have: ruleDetection.currentCount,
                  keep: ruleDetection.requiredCount,
                  projected: ruleDetection.projectedCount,
                })}
              </Typography>
            ) : null}
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
  const mainOptions = getMainStatOptionsForSlots([slot])
  return {
    slots: [slot],
    sets: setPool.length > 0 ? [setPool[0] ?? (accessorySlot ? DEFAULT_ACCESSORY_SET_ID : DEFAULT_ARTIFACT_SET_ID)] : [],
    metaSetIds: [],
    ranks: [],
    rarities: [],
    mainStat: mainOptions.includes(StatVariantEnum.Any) ? StatVariantEnum.Any : (mainOptions[0] ?? StatVariantEnum.Any),
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
  return {
    ...tuple,
    slots: normalizedSlots,
    sets: filteredSets.length > 0 ? filteredSets : (allowedSetPool[0] ? [allowedSetPool[0]] : []),
    metaSetIds: filteredMetaIds,
    mainStat: mainOptions.includes(tuple.mainStat) ? tuple.mainStat : StatVariantEnum.Any,
    factions: hasAccessory ? tuple.factions : [],
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
