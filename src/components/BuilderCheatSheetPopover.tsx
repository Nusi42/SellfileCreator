import React from 'react'
import { Popover, Box, Typography, Divider, Chip, Stack, ToggleButtonGroup, ToggleButton, useTheme, Button } from '@mui/material'
import type { PopoverProps } from '@mui/material/Popover'
import { useI18n } from '../lib/i18n'
import { RarityCode, StatVariant, statVariantI18nKey, formatLevel, rarityCodeToName, STAT_VARIANTS_PRIORITY_ROW1 } from '../lib/types'
import { variantToSub } from '../lib/hsfTypes'
import { SubstatToggleDisplay, substatToggleGroupSx } from './SubstatToggleDisplay'
import { BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX, NBSP } from '../lib/constants'
import RuleSubstatChips from './RuleSubstatChips'
import type { HsfRule } from '../lib/hsfTypes'
import { createBuilderStatusChipSx } from './builderStatusChipStyles'
import { useDisplayPreferences } from '../state/preferencesState'
import { renderColoredStatText, type HighlightSpec, type SubstatColorMap } from '../lib/renderColoredStatText'
import { GLYPH_TOGGLE_ON } from '../lib/glyphs'

interface BuilderCheatSheetPopoverProps {
  open: boolean
  anchorPosition: PopoverProps['anchorPosition']
  onClose: () => void
  maxHeight?: number | null
  substatColors: Record<number, { fg: string; bg: string }>
}

type Translate = ReturnType<typeof useI18n>['t']

interface StaticSubstatOptions {
  locked?: boolean
  wildcard?: boolean
  min?: number
  max?: number
  selected?: boolean
}

// Align the cheat-sheet lock overlay with the live builder toggles so the badge
// appears in the same position across both surfaces.
const CHEAT_LOCK_ICON_SX = { top: -13, left: -5 } as const
const CHEAT_SHEET_TOGGLE_MIN_WIDTH_PX = BUILDER_TOGGLE_BUTTON_MIN_WIDTH_PX + 12

const CARD_SX = {
  borderRadius: 1,
  border: '1px solid',
  borderColor: 'divider',
  p: 1.5,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
} as const

const BUILDER_ROW_PRIORITY: readonly StatVariant[] = STAT_VARIANTS_PRIORITY_ROW1

const BUILDER_ROW_PRIORITY_MAP = new Map<StatVariant, number>(
  BUILDER_ROW_PRIORITY.map((variant, index) => [variant, index]),
)

function orderByBuilderRow<T>(items: readonly T[], getVariant: (item: T) => StatVariant): T[] {
  return Array.from(items).sort((a, b) => {
    const variantA = getVariant(a)
    const variantB = getVariant(b)
    const priorityA = BUILDER_ROW_PRIORITY_MAP.get(variantA)
    const priorityB = BUILDER_ROW_PRIORITY_MAP.get(variantB)
    if (priorityA !== undefined || priorityB !== undefined) {
      const fallbackBase = BUILDER_ROW_PRIORITY.length
      const pa = priorityA ?? (fallbackBase + Number(variantA))
      const pb = priorityB ?? (fallbackBase + Number(variantB))
      if (pa !== pb) return pa - pb
    }
    return Number(variantA) - Number(variantB)
  })
}

const toBuilderRowValues = (variants: readonly StatVariant[]): string[] =>
  orderByBuilderRow(variants, (variant) => variant).map((variant) => `${variant}`)

const toBuilderRowToggles = <T extends { variant: StatVariant }>(toggles: readonly T[]): T[] =>
  orderByBuilderRow(toggles, (toggle) => toggle.variant)

function ExampleCard({ title, body, children }: { title: string; body: React.ReactNode; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <Box sx={{ ...CARD_SX, backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
      {children}
      <Typography variant="body2" color="text.secondary">{body}</Typography>
    </Box>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
        {children}
      </Box>
    </Box>
  )
}

function renderStaticSubstatToggle(t: Translate, variant: StatVariant, options: StaticSubstatOptions = {}) {
  const { locked = false, wildcard = false, min, max, selected = true } = options
  const indicator = selected
    ? {
        wildcard,
        ...(typeof min === 'number' ? { min } : {}),
        ...(typeof max === 'number' ? { max } : {}),
      }
    : undefined
  return (
    <ToggleButton
      key={variant}
      value={`${variant}`}
      sx={{ pointerEvents: 'none' }}
      disableRipple
    >
      <SubstatToggleDisplay
        label={t(statVariantI18nKey(variant))}
        locked={locked}
        selected={selected}
        {...(indicator ? { indicator } : {})}
        disableInteractions
        lockSx={CHEAT_LOCK_ICON_SX}
      />
    </ToggleButton>
  )
}

function SubstatRow({
  t,
  values,
  toggles,
  footer,
}: {
  t: Translate
  values: string[]
  toggles: Array<{ variant: StatVariant } & StaticSubstatOptions>
  footer?: React.ReactNode
}) {
  return (
    <Stack spacing={1} alignItems="flex-start">
      <ToggleButtonGroup
        value={values}
        exclusive={false}
        size="small"
        onChange={() => {}}
        sx={[
          substatToggleGroupSx,
          {
            pointerEvents: 'none',
            '& .MuiToggleButton-root': {
              pointerEvents: 'none',
              minWidth: CHEAT_SHEET_TOGGLE_MIN_WIDTH_PX,
              width: CHEAT_SHEET_TOGGLE_MIN_WIDTH_PX,
              overflow: 'visible',
            },
          },
        ]}
      >
        {toggles.map((toggle) => renderStaticSubstatToggle(t, toggle.variant, toggle))}
      </ToggleButtonGroup>
      {footer}
    </Stack>
  )
}

function Timeline({ rows }: { rows: Array<{ level: string; detail: React.ReactNode }> }) {
  return (
    <Stack spacing={0.75}>
      {rows.map(({ level, detail }) => (
        <Box key={level} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip label={level} size="small" sx={{ minWidth: 48 }} />
          <Typography variant="body2" color="text.secondary">{detail}</Typography>
        </Box>
      ))}
    </Stack>
  )
}

type PreviewSubstatSpec = {
  variant: StatVariant
  condition: '>=' | '<='
  value: number
}

type PreviewRow = {
  level: 0 | 4 | 8 | 12 | 16
  rarity: typeof RarityCode.GTE_Epic | typeof RarityCode.GTE_Legendary
  substats: PreviewSubstatSpec[]
}

const sortSpecs = (specs: PreviewSubstatSpec[]): PreviewSubstatSpec[] => {
  return orderByBuilderRow(specs, (spec) => spec.variant)
}

function buildPreviewSubstats(specs: PreviewSubstatSpec[]): HsfRule['Substats'] {
  return sortSpecs(specs).map((spec) => {
    const { id, isFlat } = variantToSub(spec.variant)
    return {
      ID: id,
      IsFlat: Boolean(isFlat),
      Value: spec.value,
      Condition: spec.condition,
      NotAvailable: false,
    }
  }) as HsfRule['Substats']
}

function rarityLabel(code: PreviewRow['rarity'], t: Translate): string {
  const tier = code === RarityCode.GTE_Legendary ? t('rarityLegendary') : t('rarityEpic')
  return `≥${NBSP}${tier}`
}

function CheatSheetPreviewList({ rows, substatColors, colorize, t }: { rows: PreviewRow[]; substatColors: SubstatColorMap; colorize: boolean; t: Translate }) {
  const sorted = rows.slice().sort((a, b) => {
    const levelDiff = a.level - b.level
    if (levelDiff !== 0) return levelDiff
    const rarityDiff = a.rarity - b.rarity
    if (rarityDiff !== 0) return rarityDiff
    const key = (row: PreviewRow) => sortSpecs(row.substats)
      .map((spec) => `${spec.variant}|${spec.condition}|${spec.value}`)
      .join(';')
    return key(a).localeCompare(key(b))
  })

  return (
    <Stack spacing={0.5}>
      {sorted.map((row, idx) => (
        <Box
          key={`${row.rarity}-${row.level}-${idx}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            flexWrap: 'wrap',
            typography: 'body2',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 112 }}>
            <Chip label={rarityLabel(row.rarity, t)} size="small" />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 52 }}>
            {formatLevel(row.level)}
          </Box>
          <RuleSubstatChips
            substats={buildPreviewSubstats(row.substats)}
            substatColors={substatColors}
            colorize={colorize}
            sx={{ gap: 0.5 }}
          />
        </Box>
      ))}
    </Stack>
  )
}

export default function BuilderCheatSheetPopover({ open, anchorPosition, onClose, maxHeight, substatColors }: BuilderCheatSheetPopoverProps) {
  const { t } = useI18n()
  const { statButtonBorders: colorStatTexts } = useDisplayPreferences()
  const theme = useTheme()
  const builderStatusChipSx = React.useMemo(() => createBuilderStatusChipSx(theme), [theme])
  const renderFlexStatusChip = () => (
    <Chip
      label={t('builderFlexGlyphChipLabel', { glyph: GLYPH_TOGGLE_ON })}
      size="small"
      variant="filled"
      sx={builderStatusChipSx(true)}
    />
  )
  const renderAutoGeChip = (label: string) => (
    <Chip
      size="small"
      variant="filled"
      label={label}
      sx={builderStatusChipSx(true, { dimDisabled: true })}
    />
  )
  const effectiveMaxHeight = (typeof maxHeight === 'number' && Number.isFinite(maxHeight) && maxHeight > 0)
    ? Math.max(360, Math.floor(Math.min(maxHeight * 0.99, window.innerHeight * 0.6)))
    : Math.floor(window.innerHeight * 0.6)
  const colorizeDetail = (
    key: Parameters<Translate>[0],
    options?: {
      replacements?: Record<string, string>
      highlights?: HighlightSpec[]
    },
  ) => {
    const raw = options?.replacements ? t(key, options.replacements) : t(key)
    return renderColoredStatText(t, raw, substatColors, colorStatTexts, options?.highlights)
  }
  const rarityExamples = [
    {
      title: t('builderCheatSheetRarityExactTitle'),
      body: t('builderCheatSheetRarityExactBody'),
      visuals: (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={t('builderCheatSheetRarityExactChip', { tier: t('rarityEpic') })} size="small" />
        </Stack>
      ),
    },
    {
      title: t('builderCheatSheetRarityAutoTitle'),
      body: t('builderCheatSheetRarityAutoBody'),
      visuals: (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={t('builderCheatSheetRarityAutoChipFull')} size="small" />
        </Stack>
      ),
    },
    {
      title: t('builderCheatSheetRarityAutoLateTitle'),
      body: t('builderCheatSheetRarityAutoLateBody'),
      visuals: (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip label={t('builderCheatSheetRarityAutoChipFull')} size="small" />
          {renderAutoGeChip(t('builderAutoGeLabel', { tier: t('rarityRare') }))}
          <Chip label={t('builderLateLabel')} size="small" />
        </Stack>
      ),
    },
  ]

  const substatExamples = [
    {
      title: t('builderCheatSheetSubstatsLockTitle'),
      body: t('builderCheatSheetSubstatsLockBody'),
      visuals: (
        <SubstatRow
          t={t}
          values={toBuilderRowValues([StatVariant.SPD, StatVariant.ACC, StatVariant.RES, StatVariant.CR])}
          toggles={toBuilderRowToggles([
            { variant: StatVariant.SPD, locked: true, wildcard: true },
            { variant: StatVariant.ACC, locked: true, wildcard: true },
            { variant: StatVariant.RES, wildcard: true },
            { variant: StatVariant.CR, wildcard: true },
          ])}
          footer={<Chip label={`${t('builderRequiredSubstats')}: 3`} size="small" />}
        />
      ),
    },
    {
      title: t('builderCheatSheetSubstatsFlexTitle'),
      body: t('builderCheatSheetSubstatsFlexBody'),
      visuals: (
        <Stack spacing={1} alignItems="flex-start">
          <SubstatRow
            t={t}
            values={toBuilderRowValues([StatVariant.SPD, StatVariant.ACC, StatVariant.RES])}
            toggles={toBuilderRowToggles([
              { variant: StatVariant.SPD, wildcard: true },
              { variant: StatVariant.ACC, wildcard: true },
              { variant: StatVariant.RES, wildcard: true },
            ])}
            footer={(
              <Stack direction="row" spacing={1} alignItems="center">
                {renderFlexStatusChip()}
                <Chip label={`${t('builderRequiredSubstats')}: 2`} size="small" />
              </Stack>
            )}
          />
          <Typography variant="caption" color="text.secondary">{t('builderCheatSheetFlexGateNote')}</Typography>
        </Stack>
      ),
    },
    {
      title: t('builderCheatSheetSubstatsAutoTitle'),
      body: t('builderCheatSheetSubstatsAutoBody'),
      visuals: (
        <SubstatRow
          t={t}
          values={toBuilderRowValues([StatVariant.SPD, StatVariant.ACC, StatVariant.CR])}
          toggles={toBuilderRowToggles([
            { variant: StatVariant.SPD, wildcard: true },
            { variant: StatVariant.ACC, wildcard: true },
            { variant: StatVariant.CR, wildcard: true },
          ])}
          footer={<Chip label={`${t('builderRequiredSubstats')}: ${t('headerMenuAuto')}`} size="small" />}
        />
      ),
    },
  ]

  const rollExamples = [
    {
      title: t('builderCheatSheetRollsMinTitle'),
      body: t('builderCheatSheetRollsMinBody'),
      visuals: (
        <SubstatRow
          t={t}
          values={toBuilderRowValues([StatVariant.SPD, StatVariant.ACC])}
          toggles={toBuilderRowToggles([
            { variant: StatVariant.SPD, wildcard: false, min: 2 },
            { variant: StatVariant.ACC, wildcard: false, min: 1 },
          ])}
          footer={<Chip label={`${t('builderMilestoneThresholds')}: ${t('builderEarlyLabel')}`} size="small" />}
        />
      ),
    },
    {
      title: t('builderCheatSheetRollsCapTitle'),
      body: t('builderCheatSheetRollsCapBody'),
      visuals: (
        <SubstatRow
          t={t}
          values={toBuilderRowValues([StatVariant.SPD, StatVariant.CR, StatVariant.CDMG])}
          toggles={toBuilderRowToggles([
            { variant: StatVariant.SPD, wildcard: false, min: 1 },
            { variant: StatVariant.CR, wildcard: false, min: 1 },
            { variant: StatVariant.CDMG, wildcard: false, max: 0 },
          ])}
        />
      ),
    },
    {
      title: t('builderCheatSheetRollsSumTitle'),
      body: t('builderCheatSheetRollsSumBody'),
      visuals: (
        <Stack spacing={1} alignItems="flex-start">
          <SubstatRow
            t={t}
            values={toBuilderRowValues([StatVariant.SPD, StatVariant.ACC])}
            toggles={toBuilderRowToggles([
              { variant: StatVariant.SPD, wildcard: true },
              { variant: StatVariant.ACC, wildcard: true },
            ])}
          />
          <Chip label={`${t('builderMinRequiredRolls')}: 3`} size="small" />
        </Stack>
      ),
    },
  ]

  const milestoneExamples = [
    {
      title: t('builderCheatSheetMilestonesEarlyTitle'),
      body: t('builderCheatSheetMilestonesEarlyBody'),
      visuals: (
        <Timeline
          rows={[
            { level: '+0', detail: colorizeDetail('builderCheatSheetMilestonesEarlyRow0') },
            { level: '+4', detail: colorizeDetail('builderCheatSheetMilestonesEarlyRow4') },
            { level: '+8', detail: colorizeDetail('builderCheatSheetMilestonesEarlyRow8') },
            { level: '+12', detail: colorizeDetail('builderCheatSheetMilestonesEarlyRow12') },
          ]}
        />
      ),
    },
    {
      title: t('builderCheatSheetMilestonesLateTitle'),
      body: t('builderCheatSheetMilestonesLateBody'),
      visuals: (
        <Timeline
          rows={[
            { level: '+0', detail: colorizeDetail('builderCheatSheetMilestonesLateRow0') },
            { level: '+8', detail: colorizeDetail('builderCheatSheetMilestonesLateRow8') },
            { level: '+12', detail: colorizeDetail('builderCheatSheetMilestonesLateRow12') },
            { level: '+16', detail: colorizeDetail('builderCheatSheetMilestonesLateRow16') },
          ]}
        />
      ),
    },
  ]

  const advancedPreviewRows: PreviewRow[] = (() => {
    type Combo = Array<{ variant: StatVariant; value: number; condition?: PreviewSubstatSpec['condition'] }>
    const specs: Array<{ levels: PreviewRow['level'][]; rarity: PreviewRow['rarity']; combos: Combo[] }> = [
      {
        levels: [0, 4, 8],
        rarity: RarityCode.GTE_Epic,
        combos: [
          [
            { variant: StatVariant.SPD, condition: '>=', value: 5 },
            { variant: StatVariant.ACC, condition: '>=', value: 9 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 5 },
            { variant: StatVariant.ACC, value: 9 },
            { variant: StatVariant.RES, value: 9 },
          ],
        ],
      },
      {
        levels: [8],
        rarity: RarityCode.GTE_Legendary,
        combos: [
          [
            { variant: StatVariant.SPD, condition: '>=', value: 10 },
            { variant: StatVariant.ACC, condition: '>=', value: 18 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 10 },
            { variant: StatVariant.ACC, value: 18 },
            { variant: StatVariant.RES, value: 9 },
          ],
          [
            { variant: StatVariant.SPD, condition: '>=', value: 15 },
            { variant: StatVariant.ACC, condition: '>=', value: 9 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 15 },
            { variant: StatVariant.ACC, value: 9 },
            { variant: StatVariant.RES, value: 9 },
          ],
          [
            { variant: StatVariant.SPD, condition: '>=', value: 5 },
            { variant: StatVariant.ACC, condition: '>=', value: 27 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, condition: '>=', value: 5 },
            { variant: StatVariant.ACC, condition: '>=', value: 27 },
            { variant: StatVariant.RES, value: 9 },
          ],
        ],
      },
      {
        levels: [12],
        rarity: RarityCode.GTE_Epic,
        combos: [
          [
            { variant: StatVariant.SPD, condition: '>=', value: 15 },
            { variant: StatVariant.ACC, condition: '>=', value: 18 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 15 },
            { variant: StatVariant.ACC, value: 18 },
            { variant: StatVariant.RES, value: 9 },
          ],
        ],
      },
      {
        levels: [12],
        rarity: RarityCode.GTE_Legendary,
        combos: [
          [
            { variant: StatVariant.SPD, condition: '>=', value: 10 },
            { variant: StatVariant.ACC, condition: '>=', value: 27 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 10 },
            { variant: StatVariant.ACC, value: 27 },
            { variant: StatVariant.RES, value: 9 },
          ],
          [
            { variant: StatVariant.SPD, condition: '>=', value: 20 },
            { variant: StatVariant.ACC, condition: '>=', value: 9 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 20 },
            { variant: StatVariant.ACC, value: 9 },
            { variant: StatVariant.RES, value: 9 },
          ],
        ],
      },
      {
        levels: [16],
        rarity: RarityCode.GTE_Epic,
        combos: [
          [
            { variant: StatVariant.SPD, condition: '>=', value: 15 },
            { variant: StatVariant.ACC, condition: '>=', value: 18 },
            { variant: StatVariant.CDMG, condition: '<=', value: 0 },
          ],
          [
            { variant: StatVariant.SPD, value: 15 },
            { variant: StatVariant.ACC, value: 18 },
            { variant: StatVariant.RES, value: 9 },
          ],
        ],
      },
    ]

    const seen = new Set<string>()
    const rows: PreviewRow[] = []

    for (const { levels, rarity, combos } of specs) {
      for (const combo of combos) {
        const canonical = sortSpecs(combo.map(({ variant, value, condition }) => ({
          variant,
          condition: condition ?? '>=',
          value,
        })))
        const signature = canonical.map((spec) => `${spec.variant}|${spec.condition}|${spec.value}`).join(';')
        for (const level of levels) {
          const key = `${rarity}|${level}|${signature}`
          if (seen.has(key)) continue
          seen.add(key)
          rows.push({
            level,
            rarity,
            substats: canonical.map((spec) => ({ ...spec })),
          })
        }
      }
    }

    return rows
  })()

  const legendaryLabel = rarityCodeToName(RarityCode.GTE_Legendary)
  const lateLabel = t('builderLateLabel')
  const autoEpicLabel = t('builderAutoGeLabel', { tier: t('rarityEpic') })
  const lockedLabel = t('builderMinRequiredRollsTargetLocked')

  const advancedExample = {
    title: t('builderCheatSheetAdvancedTitle'),
    body: colorizeDetail('builderCheatSheetAdvancedBody', {
      replacements: {
        legendary: legendaryLabel,
        late: lateLabel,
        autoEpic: autoEpicLabel,
        locked: lockedLabel,
      },
      highlights: [
        { token: legendaryLabel },
        { token: lateLabel },
        { token: autoEpicLabel },
        { token: lockedLabel },
      ],
    }),
      visuals: (
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <Chip label={t('keepValueKeep')} size="small" color="success" />
          <Chip label={t('builderCheatSheetRarityAutoChipFull')} size="small" />
          {renderAutoGeChip(autoEpicLabel)}
          <Chip label={t('builderLateLabel')} size="small" />
        </Stack>
        <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center">
          <Chip label={`${t('builderMinRequiredRolls')}: 3 🔒`} size="small" />
          {renderFlexStatusChip()}
          <Chip label={`${t('builderRequiredSubstats')}: 3`} size="small" />
        </Stack>
        <SubstatRow
          t={t}
          values={toBuilderRowValues([StatVariant.SPD, StatVariant.ACC, StatVariant.RES, StatVariant.CDMG])}
          toggles={toBuilderRowToggles([
            { variant: StatVariant.SPD, locked: true, wildcard: false, min: 2 },
            { variant: StatVariant.ACC, locked: true, wildcard: false, min: 1 },
            { variant: StatVariant.RES, wildcard: true },
            { variant: StatVariant.CDMG, wildcard: false, max: 0 },
          ])}
        />
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('sellfilePreview')}</Typography>
          <CheatSheetPreviewList rows={advancedPreviewRows} substatColors={substatColors} colorize={colorStatTexts} t={t} />
        </Box>
      </Stack>
    ),
  }

  return (
    <Popover
      open={open}
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition ?? { top: 0, left: 0 }}
      onClose={onClose}
      transformOrigin={{ vertical: 'center', horizontal: 'center' }}
      PaperProps={{
        sx: {
          width: 'min(96vw, 1040px)',
          maxHeight: effectiveMaxHeight ? `${effectiveMaxHeight}px` : undefined,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Box sx={{ px: { xs: 2, md: 3 }, pt: 2, pb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('builderCheatSheetTitle')}</Typography>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, md: 3 }, pt: 2, pb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Divider sx={{ opacity: 0.4 }} />

        <Section title={t('builderCheatSheetSectionRarity')}>
          {rarityExamples.map(({ title, body, visuals }) => (
            <ExampleCard key={title} title={title} body={body}>{visuals}</ExampleCard>
          ))}
        </Section>

        <Section title={t('builderCheatSheetSectionSubstats')}>
          {substatExamples.map(({ title, body, visuals }) => (
            <ExampleCard key={title} title={title} body={body}>{visuals}</ExampleCard>
          ))}
        </Section>

        <Section title={t('builderCheatSheetSectionRolls')}>
          {rollExamples.map(({ title, body, visuals }) => (
            <ExampleCard key={title} title={title} body={body}>{visuals}</ExampleCard>
          ))}
        </Section>

        <Section title={t('builderCheatSheetSectionMilestones')}>
          {milestoneExamples.map(({ title, body, visuals }) => (
            <ExampleCard key={title} title={title} body={body}>{visuals}</ExampleCard>
          ))}
        </Section>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{t('builderCheatSheetSectionAdvanced')}</Typography>
          <ExampleCard title={advancedExample.title} body={advancedExample.body}>
            {advancedExample.visuals}
          </ExampleCard>
        </Box>
      </Box>
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={onClose} size="small" color="primary" data-tour-id="builder.cheatsheet.close">
          {t('close')}
        </Button>
      </Box>
    </Popover>
  )
}
