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
  MenuItem,
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
import type { ArtifactSetId, ArtifactTypeId, FactionId, RankValue, StatVariant } from '../../lib/types'
import {
  ACCESSORY_SET_IDS,
  ALLOWED_MAIN_BY_SLOT,
  ARMOR_FIXED_SET_IDS,
  ARMOR_VARIABLE_SET_IDS,
  ArtifactType,
  artifactSetI18nKey,
  artifactSetNames,
  artifactTypeI18nKey,
  Faction,
  factionI18nKey,
  filterAndSortSetEntries,
  StatVariant as StatVariantEnum,
  statVariantI18nKey,
} from '../../lib/types'
import { isAccessorySlot } from '../../lib/testerDomain'
import { useI18n } from '../../lib/i18n'
import { GearFactionSelect, GearMainStatSelect, GearRankSelect, GearRaritySelect, GearSlotSelect } from '../gear'
import { SetIcon } from '../SetIcon'
import { TesterItemsGrid } from '../TesterItemsGrid'
import { NumberSpinnerAdornment } from '../NumberSpinnerAdornment'
import type { SetStateAction } from 'react'

type KeepUniquesTabProps = {
  rules: KeepUniqueRule[]
  enabled: boolean
  onRulesChange: (next: SetStateAction<KeepUniqueRule[]>) => void
  onToggleEnabled: (next: SetStateAction<boolean>) => void
  detection: KeepUniqueDetectionSnapshot | null
  testerRows: TesterPreviewRow[]
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  configNames: Array<string | null>
  testerBuilding?: boolean
  onJumpToRule?: ((ruleIndex: number, cfgIdx: number | null) => void) | undefined
}

const ARTIFACT_SET_POOL: readonly ArtifactSetId[] = Object.freeze([...ARMOR_FIXED_SET_IDS, ...ARMOR_VARIABLE_SET_IDS])
const DEFAULT_ARTIFACT_SET_ID: ArtifactSetId = ARTIFACT_SET_POOL[0] ?? (ARMOR_FIXED_SET_IDS[0] ?? (0 as ArtifactSetId))
const DEFAULT_ACCESSORY_SET_ID: ArtifactSetId = ACCESSORY_SET_IDS[0] ?? (0 as ArtifactSetId)
const DEFAULT_FACTION: FactionId = Faction.BannerLords
const DEFAULT_SLOT: ArtifactTypeId = ArtifactType.Weapon
const DEFAULT_RANK = 6
const DEFAULT_RARITY = 6

export default function KeepUniquesTab({
  rules,
  enabled,
  onRulesChange,
  onToggleEnabled,
  detection,
  testerRows,
  substatColors,
  useStatButtonColors,
  onToggleStatColors,
  onOpenManageColors,
  colorBlindMode,
  onChangeColorBlindMode,
  colorIconSrc,
  configNames,
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
  // Highlight callback lets the tester grid fade non-matching cards instead of mutating the dataset.
  const highlightRowPredicate = useMemo(() => {
    if (!selectedEntry || selectedRowKeys.size === 0) return null
    return (row: TesterPreviewRow) => selectedRowKeys.has(getKeepUniqueRowKey(row.artifact))
  }, [selectedEntry, selectedRowKeys])
  const highlightActive = Boolean(highlightRowPredicate)
  const gridFiltered = highlightActive && testerRows.length > selectedRowKeys.size

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

  const setOptions = useMemo(() => filterAndSortSetEntries('', 'game', { translate: t }), [t])

  const renderRuleCard = (rule: KeepUniqueRule) => {
    const tuple = rule.tuple
    const ruleDetection = detectionByRuleId.get(rule.id) ?? null
    const accessorySlot = isAccessorySlot(tuple.slot)
    const allowedSetPool = accessorySlot ? ACCESSORY_SET_IDS : ARTIFACT_SET_POOL
    const setMissing = !allowedSetPool.includes(tuple.set)
    const setLabel = t(artifactSetI18nKey(tuple.set))
    const slotLabel = t(artifactTypeI18nKey(tuple.slot))
    const mainStatOptions = getMainStatOptions(tuple.slot)
    const mainStatValue = mainStatOptions.includes(tuple.mainStat) ? tuple.mainStat : StatVariantEnum.Any
    const factionValue = accessorySlot ? (tuple.factionId ?? DEFAULT_FACTION) : null
    const rankValue: RankValue | null = (
      tuple.rank >= 1 && tuple.rank <= 6 ? (tuple.rank as RankValue) : null
    )
    const selected = effectiveSelectedRuleId === rule.id
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
            <Chip label={slotLabel} size="small" />
            <Chip
              label={setMissing ? t('keepUniquesSetUnavailable') : setLabel}
              size="small"
              color={setMissing ? 'warning' : 'default'}
              icon={<SetIcon setId={tuple.set} size={16} />}
            />
            <Chip label={tuple.rank ? t('keepUniquesRankChip', { rank: tuple.rank }) : t('any')} size="small" />
            <Chip label={tuple.rarity ? t('keepUniquesRarityChip', { rarity: tuple.rarity }) : t('any')} size="small" />
            <Chip label={tuple.mainStat === StatVariantEnum.Any ? t('any') : t(statVariantI18nKey(tuple.mainStat))} size="small" />
            {accessorySlot && factionValue ? (
              <Chip label={t(factionI18nKey(factionValue))} size="small" />
            ) : null}
          </Box>
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <GearSlotSelect
                value={tuple.slot}
                onChange={(nextSlot) => {
                  if (!nextSlot) return
                  setRuleTuple(rule.id, (prev) => sanitizeTupleForSlot(nextSlot, prev))
                }}
                size="small"
              />
              <SetSelect
                value={tuple.set}
                options={setOptions}
                allowedPool={allowedSetPool}
                onChange={(nextSet) => {
                  if (!nextSet) return
                  setRuleTuple(rule.id, (prev) => ({ ...prev, set: nextSet }))
                }}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
              <GearRankSelect
                value={rankValue}
                onChange={(nextRank) => {
                  if (!nextRank) return
                  setRuleTuple(rule.id, (prev) => ({ ...prev, rank: nextRank }))
                }}
                allowAny
                size="small"
              />
              <GearRaritySelect
                value={Number(tuple.rarity)}
                onChange={(nextRarity) => {
                  setRuleTuple(rule.id, (prev) => {
                    const resolved = nextRarity == null ? prev.rarity : (nextRarity as RankValue)
                    return { ...prev, rarity: resolved }
                  })
                }}
                allowAny
                size="small"
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: accessorySlot ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 1 }}>
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
              {accessorySlot ? (
                <GearFactionSelect
                  value={factionValue}
                  onChange={(nextFaction) => {
                    setRuleTuple(rule.id, (prev) => ({ ...prev, factionId: nextFaction }))
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
            <Chip size="small" label={t('keepUniquesGridSelectedCount', { count: selectedRowKeys.size })} />
          ) : null}
          {detectionChip}
        </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <TesterItemsGrid
              rows={testerRows}
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
  const mainSet = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
  const defaultMain = (mainSet && mainSet.size > 0) ? Array.from(mainSet)[0]! : StatVariantEnum.Any
  return {
    slot,
    set: setPool[0] ?? (accessorySlot ? DEFAULT_ACCESSORY_SET_ID : DEFAULT_ARTIFACT_SET_ID),
    rank: DEFAULT_RANK as KeepUniqueRule['tuple']['rank'],
    rarity: DEFAULT_RARITY as KeepUniqueRule['tuple']['rarity'],
    mainStat: defaultMain as StatVariant,
    factionId: accessorySlot ? DEFAULT_FACTION : null,
  }
}

function sanitizeTupleForSlot(slot: ArtifactTypeId, tuple: KeepUniqueRule['tuple']): KeepUniqueRule['tuple'] {
  const normalized = makeTupleForSlot(slot)
  const mainOptions = getMainStatOptions(slot)
  return {
    slot,
    set: (isAccessorySlot(slot) ? ACCESSORY_SET_IDS : ARTIFACT_SET_POOL).includes(tuple.set)
      ? tuple.set
      : normalized.set,
    rank: tuple.rank,
    rarity: tuple.rarity,
    mainStat: mainOptions.includes(tuple.mainStat) ? tuple.mainStat : normalized.mainStat,
    factionId: isAccessorySlot(slot) ? (tuple.factionId ?? normalized.factionId) : null,
  }
}

function getMainStatOptions(slot: ArtifactTypeId): StatVariant[] {
  const set = ALLOWED_MAIN_BY_SLOT[Number(slot) as ArtifactType]
  if (!set || set.size === 0) return [StatVariantEnum.Any]
  return Array.from(set) as StatVariant[]
}


type SetSelectProps = {
  value: ArtifactSetId
  options: Array<[string, string]>
  allowedPool: readonly ArtifactSetId[]
  onChange: (next: ArtifactSetId | null) => void
}

function SetSelect({ value, options, allowedPool, onChange }: SetSelectProps) {
  const { t } = useI18n()
  const allowed = useMemo(() => new Set(allowedPool.map(Number)), [allowedPool])
  const rendered = options.filter(([id]) => allowed.has(Number(id)))
  return (
    <TextField
      select
      size="small"
      value={String(value)}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (!Number.isFinite(next)) return
        onChange(next as ArtifactSetId)
      }}
      label={t('keepUniquesSetLabel')}
    >
      {rendered.map(([idStr]) => {
        const id = Number(idStr) as ArtifactSetId
        const label = t(artifactSetI18nKey(id)) || artifactSetNames[id] || idStr
        return (
          <MenuItem key={idStr} value={idStr}>
            {label}
          </MenuItem>
        )
      })}
    </TextField>
  )
}
