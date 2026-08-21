import { useCallback, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import { useDialogMinimizeAnimation } from '../../hooks/useDialogMinimizeAnimation'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { GOLD_SECTION_TITLE_SX, GOLD_TITLE_COMPOSITE_OPT_OUT_SX } from '../../lib/goldSkin'
import { useI18n } from '../../lib/i18n'
import {
  MENU_CONTROL_HEIGHT_PX,
  STANDARD_DIALOG_PADDING_BLOCK_UNITS,
  STANDARD_DIALOG_PADDING_INLINE_UNITS,
} from '../../lib/constants'
import { appZoomCompensatedLength } from '../../lib/sideBySideZoom'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  FINAL_SELL_LEVEL_CHOICES,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS,
  LOGIC_HUB_DIALOG_TAB_GEAR,
  LOGIC_HUB_DIALOG_TAB_DUNGEON,
  LOGIC_HUB_DIALOG_TAB_GEAR_STATS,
  LOGIC_HUB_DIALOG_TABS,
  type LogicHubDialogTab,
  type FinalSellLevel,
  type FinalSellRemainderConfig,
  type FinalSellSetsMode,
} from '../../lib/logicHub'
import type { BuilderRecipe } from '../../lib/hsfBuilder'
import type { GearInspectorItem } from '../../lib/gearInspectorSession'
import type { GearInspectorPreviewMatch, GearInspectorPreviewRow } from '../../types/gearInspectorPreview'
import type { ImprovementChanceWasmEntry } from '../../lib/wasm/wasmRuleEngine'
import { GearInspectorTabContent, type GearInspectorTabLayoutSlots } from './GearInspectorTabContent'
import DungeonSimulatorTab from './DungeonSimulatorTab'
import { GearAnalyticsTabContent } from './GearAnalyticsTabContent'
import type { GearAnalyticsDim } from '../../lib/gearAnalytics'
// MarkdownTooltip keeps the level-hint copy behavior aligned with the rest of the app.
import MarkdownTooltip from '../MarkdownTooltip'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'
import type { EmptyStateMessageProps } from '../EmptyStateMessage'
import type { HsfRuleWithRecipe } from '../../lib/merge'
import type { SubstatTargetTable } from '../../lib/hsfBuilder/types'
import { SubstatTargetsTabContent } from '../SubstatTargetsTabContent'
import { defaultSubstatTargets } from '../../lib/hsfBuilder'


type LogicHubDialogProps = {
  open: boolean
  value: FinalSellRemainderConfig
  onChange: (next: FinalSellRemainderConfig) => void
  onClose: () => void
  onReset?: () => void
  activeTab: LogicHubDialogTab
  onChangeTab: (next: LogicHubDialogTab) => void
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onJumpToRule?: (ruleIndex: number, recipeIdx: number | null) => void
  customRecipes: BuilderRecipe[]
  gearInspectorItems: GearInspectorItem[]
  setGearInspectorItems: Dispatch<SetStateAction<GearInspectorItem[]>>
  allocGearInspectorItemId: () => number
  gearInspectorMatches: ReadonlyMap<number, GearInspectorPreviewMatch | null>
  onResetGearInspector?: () => void
  rules: HsfRuleWithRecipe[]
  substatTargets: SubstatTargetTable
  effectiveSubstatTargets: SubstatTargetTable
  onSubstatTargetsChange: (m: SubstatTargetTable, opts?: { mode?: 'edit' | 'reset' | 'import' }) => void
  recipeOverridesActive: boolean
  // All loaded gear rows — passed to Gear Analytics for full-inventory analytics.
  gearInspectorPreviewRows: readonly GearInspectorPreviewRow[]
  // Per-artifact improvement-chance map — forwarded to Gear Analytics for the histogram.
  improvementChanceByArtifactId?: Map<number, ImprovementChanceWasmEntry> | null
  // Called when the user requests applying the Gear Analytics filter to the Gear Inspector.
  onApplyGearAnalyticsFilter?: (dim: GearAnalyticsDim) => void
  // Current gear inspector filter expressed as a GearAnalyticsDim, for the "Copy from Gear Inspector" button.
  gearInspectorDim?: GearAnalyticsDim | null
  // Propagates the main app's layout choice so empty-state messaging stays consistent across panes.
  emptyStateVerticalAlign?: EmptyStateMessageProps['verticalAlign']
  // Gear Inspector selection set (artifact IDs) — shared so the Not Fully Equipped grid can
  // toggle the same selection that the Gear Inspector reads.
  selectedGearItemIds?: ReadonlySet<number>
  // Setter that accepts the full new selection set (matches Gear Inspector's signature).
  onGearItemsSelect?: (next: ReadonlySet<number>) => void
}

export default function LogicHubDialog(props: LogicHubDialogProps) {
  const {
    open,
    value,
    onChange,
    onClose,
    onReset,
    activeTab,
    onChangeTab,
    substatColors,
    useStatButtonColors,
    onJumpToRule,
    customRecipes,
    gearInspectorItems,
    setGearInspectorItems,
    allocGearInspectorItemId,
    gearInspectorMatches,
    onResetGearInspector,
    rules,
    substatTargets,
    effectiveSubstatTargets,
    onSubstatTargetsChange,
    recipeOverridesActive,
    gearInspectorPreviewRows,
    improvementChanceByArtifactId,
    onApplyGearAnalyticsFilter,
    gearInspectorDim,
    emptyStateVerticalAlign = 'center',
    selectedGearItemIds,
    onGearItemsSelect,
  } = props
  const { t } = useI18n()
  // Shrinks the dialog toward its trigger button when closing.
  const { dialogProps: logicHubDialogProps, animateClose: logicHubAnimateClose } = useDialogMinimizeAnimation('[data-tour-id="builder.tools-button"]')
  const handleClose = useCallback(() => { logicHubAnimateClose(onClose) }, [logicHubAnimateClose, onClose])
  // Gear resets also confirm so a stray click does not clear imported databases or manual samples.
  const [confirmResetGearInspector, setConfirmResetGearInspector] = useState(false)
  const [confirmResetSubstatTargets, setConfirmResetSubstatTargets] = useState(false)
  // Counter passed to GearAnalyticsTabContent; incrementing it triggers a cross-filter reset.
  const [gearAnalyticsResetKey, setGearAnalyticsResetKey] = useState(0)
  // Counter passed to DungeonSimulatorTab; incrementing it triggers a preferences reset.
  const [dungeonResetKey, setDungeonResetKey] = useState(0)
  // React key for DungeonSimulatorTab: bumped each time the dungeon panel becomes visible so
  // the simulator always mounts fresh. MUI Dialog does not reliably unmount children between
  // open/close cycles (Fade transition keeps content in the DOM), so a key change is the only
  // guarantee that prevInputs and worker state are cleared before the next sim run.
  // prevDungeonActive tracks the previous value so we detect false→true transitions during render
  // and bump the key immediately, without needing a useEffect.
  const [dungeonMountKey, setDungeonMountKey] = useState(0)
  const [prevDungeonActive, setPrevDungeonActive] = useState(false)
  // Fallback keeps the Gear Inspector grid handler stable even when no jump target is supplied.
  const noopGearInspectorRuleJump = useCallback(() => {}, [])
  const gearTabOnView = onJumpToRule ?? noopGearInspectorRuleJump
  // Clamp unknown tab ids back to the Logic Hub default so autosave/restore can't wedge the dialog.
  const normalizedTab = LOGIC_HUB_DIALOG_TABS.includes(activeTab) ? activeTab : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
  const hasGear = value.artifacts || value.accessories
  const hasLevelRanges = value.levels.length > 0
  const finalSellActive = hasGear && hasLevelRanges
  const statusWordKey = finalSellActive ? 'hintFinalSellStatusWordOn' : 'hintFinalSellStatusWordOff'
  const statusDetailKey = finalSellActive ? 'hintFinalSellStatusOnDetail' : 'hintFinalSellStatusOffDetail'
  const setsMode: FinalSellSetsMode = value.setsMode ?? FINAL_SELL_DEFAULT_SETS_MODE
  const handleTabChange = (_event: React.SyntheticEvent, nextValue: string) => {
    const nextTab = LOGIC_HUB_DIALOG_TABS.includes(nextValue as LogicHubDialogTab)
      ? nextValue as LogicHubDialogTab
      : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
    if (nextTab === normalizedTab) return
    onChangeTab(nextTab)
  }
  const handleSetsModeChange = (_: MouseEvent<HTMLElement>, next: FinalSellSetsMode | null) => {
    if (!next) return
    onChange({ ...value, setsMode: next })
  }
  const toggleLevel = (lvl: FinalSellLevel) => {
    const next = new Set(value.levels)
    if (next.has(lvl)) next.delete(lvl); else next.add(lvl)
    onChange({ ...value, levels: Array.from(next.values()).sort((a,b)=>a-b) as FinalSellLevel[] })
  }
  const showFinalSellTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_FINAL_SELL
  const showSubstatTargetsTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS
  const showGearTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_GEAR
  const showDungeonTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_DUNGEON
  // Detect false→true transitions of the dungeon panel being active and bump dungeonMountKey.
  // Doing this during render (rather than useEffect) avoids the react-hooks/set-state-in-effect
  // lint rule and is the React-recommended pattern for derived state.
  const dungeonActive = open && showDungeonTab
  if (dungeonActive && !prevDungeonActive) {
    setPrevDungeonActive(true)
    setDungeonMountKey((k) => k + 1)
  } else if (!dungeonActive && prevDungeonActive) {
    setPrevDungeonActive(false)
  }
  const showGearStatsTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_GEAR_STATS
  const showResetButton = showFinalSellTab
    ? Boolean(onReset)
    : showSubstatTargetsTab
      ? true
      : showGearTab
        ? Boolean(onResetGearInspector)
        : showDungeonTab || showGearStatsTab
  const handleResetButtonClick = () => {
    if (showFinalSellTab) {
      onReset?.()
      return
    }
    if (showSubstatTargetsTab) {
      setConfirmResetSubstatTargets(true)
      return
    }
    if (showGearTab && onResetGearInspector) {
      setConfirmResetGearInspector(true)
      return
    }
    if (showDungeonTab) {
      // Non-destructive: resets persisted stage/boost/mode selections; no confirmation needed.
      setDungeonResetKey((k) => k + 1)
      return
    }
    if (showGearStatsTab) {
      // Non-destructive: just clears cross-filter selections; no confirmation needed.
      setGearAnalyticsResetKey((k) => k + 1)
    }
  }
  // Clear the Gear Inspector items in one shot so manual + imported gear disappear together.
  const handleConfirmResetGearInspector = () => {
    if (!onResetGearInspector) return
    setConfirmResetGearInspector(false)
    onResetGearInspector()
  }
  // Dialog follows the spec'd min width/height so both tabs have enough breathing room. The paper
  // carries theme `zoom: var(--app-zoom)` (it's portaled outside #root), which would also scale these
  // vw/vh lengths down under forced side-by-side zoom — leaving the tools dialog too small. Wrap each
  // length in appZoomCompensatedLength so the visual size stays as specced at any zoom (no-op when
  // --app-zoom is unset).
  const paperSx = {
    width: appZoomCompensatedLength('min(960px, calc(100vw - 32px))'),
    maxWidth: appZoomCompensatedLength('min(960px, calc(100vw - 32px))'),
    height: appZoomCompensatedLength('min(800px, calc(100vh - 48px))'),
  }
  // Layout wrapper mirrors the placeholder padding and keeps the Gear Inspector content/actions vertically stacked.
  const renderGearInspectorLayout = useCallback(({ content, actions }: GearInspectorTabLayoutSlots) => (
    <Box
      data-tour-id="finalsell.dialog.gear"
      sx={(theme) => ({
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
        py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
        ...reserveScrollbarGutterSpace({
          reserveStart: false,
          basePaddingInlineEnd: theme.spacing(STANDARD_DIALOG_PADDING_INLINE_UNITS),
        }),
      })}
    >
      <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {content}
        </Box>
        <Stack spacing={1} sx={{ '& > :not(:first-of-type)': { marginLeft: 0 } }}>
          {actions}
        </Stack>
      </Stack>
    </Box>
  ), [])
  return (
    <>
      <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth={false}
      transitionDuration={{ exit: 0 }}
      slotProps={{ paper: { sx: paperSx, ref: logicHubDialogProps.PaperProps.ref } }}
    >
      {/* Composite title block (title + tabs): suppress the theme's root-level ◆ (it would
          float at the p:0 corner) and speak the gold title voice on the inner Typography. */}
      <DialogTitle sx={{ p: 0, ...GOLD_TITLE_COMPOSITE_OPT_OUT_SX }}>
        <Box sx={{ px: STANDARD_DIALOG_PADDING_INLINE_UNITS, pt: STANDARD_DIALOG_PADDING_BLOCK_UNITS, pb: 0 }}>
          <Stack spacing={1}>
            <Typography variant="h6" sx={GOLD_SECTION_TITLE_SX}>{t('titleLogicHub')}</Typography>
            <Tabs
              value={normalizedTab}
              onChange={handleTabChange}
              variant="fullWidth"
              textColor="primary"
              indicatorColor="primary"
              sx={{
                // Dialog paper has zoom:var(--app-zoom) for SBS mode. MUI computes the
                // indicator position with getBoundingClientRect() (viewport px) then applies
                // those values as CSS px — which differ inside a zoomed context. Using CSS
                // percentages instead makes the position zoom-invariant.
                '& .MuiTabs-indicator': {
                  left: `calc(${LOGIC_HUB_DIALOG_TABS.indexOf(normalizedTab)} / ${LOGIC_HUB_DIALOG_TABS.length} * 100%) !important`,
                  width: `calc(1 / ${LOGIC_HUB_DIALOG_TABS.length} * 100%) !important`,
                },
              }}
            >
              <Tab value={LOGIC_HUB_DIALOG_TAB_FINAL_SELL} label={t('gearInspectorFinalSell')} />
              <Tab value={LOGIC_HUB_DIALOG_TAB_SUBSTAT_TARGETS} label={t('tabSubstatTargets')} />
              <Tab value={LOGIC_HUB_DIALOG_TAB_GEAR} label={t('tabFinalSellGear')} />
              <Tab value={LOGIC_HUB_DIALOG_TAB_DUNGEON} label={t('tabDungeonDrops')} />
              <Tab value={LOGIC_HUB_DIALOG_TAB_GEAR_STATS} label={t('tabGearAnalytics')} />
            </Tabs>
          </Stack>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {showFinalSellTab && (
          <Box
            data-tour-id="finalsell.dialog"
            sx={(theme) => ({
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              px: STANDARD_DIALOG_PADDING_INLINE_UNITS,
              py: STANDARD_DIALOG_PADDING_BLOCK_UNITS,
              ...reserveScrollbarGutterSpace({
                reserveStart: false,
                basePaddingInlineEnd: theme.spacing(STANDARD_DIALOG_PADDING_INLINE_UNITS),
              }),
            })}
          >
            <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{t('msgFinalSellExplainer')}</Typography>
          {/* Sets coverage toggle + inline warning side-by-side */}
          <Box data-tour-id="finalsell.dialog.sets" sx={{ display: 'flex', flexDirection: 'row', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexShrink: 0 }}>
              <Typography variant="body2">{t('labelFinalSellSetsMode')}</Typography>
              <ToggleButtonGroup
                exclusive
                value={setsMode}
                onChange={handleSetsModeChange}
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              >
                <ToggleButton
                  value={FINAL_SELL_SETS_MODE_EXPLICIT}
                  sx={{
                    minHeight: MENU_CONTROL_HEIGHT_PX,
                    height: MENU_CONTROL_HEIGHT_PX,
                    lineHeight: 1,
                    px: 1.25,
                    py: 0,
                    borderWidth: 1,
                    borderColor: (theme) => theme.palette.grey[300],
                    color: (theme) => (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                    backgroundColor: 'transparent',
                    '&:hover': {
                      borderColor: (theme) => theme.palette.grey[400],
                      color: (theme) => (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                      backgroundColor: (theme) => (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
                    },
                    '&.Mui-selected': {
                      bgcolor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                      color: (theme) => (theme.vars?.palette.common.black ?? theme.palette.common.black),
                      borderColor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                      '&:hover': { bgcolor: (theme) => (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark) },
                    },
                  }}
                >
                  {t('finalSellSetsModeExplicit')}
                </ToggleButton>
                <ToggleButton
                  value={FINAL_SELL_SETS_MODE_ANY}
                  sx={{
                    minHeight: MENU_CONTROL_HEIGHT_PX,
                    height: MENU_CONTROL_HEIGHT_PX,
                    lineHeight: 1,
                    px: 1.25,
                    py: 0,
                    borderWidth: 1,
                    borderColor: (theme) => theme.palette.grey[300],
                    color: (theme) => (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                    backgroundColor: 'transparent',
                    '&:hover': {
                      borderColor: (theme) => theme.palette.grey[400],
                      color: (theme) => (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                      backgroundColor: (theme) => (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
                    },
                    '&.Mui-selected': {
                      bgcolor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                      color: (theme) => (theme.vars?.palette.common.black ?? theme.palette.common.black),
                      borderColor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                      '&:hover': { bgcolor: (theme) => (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark) },
                    },
                  }}
                >
                  {t('finalSellSetsModeAny')}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Alert
              data-tour-id="finalsell.dialog.warning"
              severity="warning"
              variant="outlined"
              color="warning"
              sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'flex-start',
                whiteSpace: 'pre-line',
              }}
            >
              {setsMode === FINAL_SELL_SETS_MODE_EXPLICIT ? t('msgFinalSellExplicitSetsWarning') : t('msgFinalSellAnySetsWarning')}
            </Alert>
          </Box>
          <Box sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: { sm: 'auto minmax(0, 1fr)' }, columnGap: { sm: 2 } }}>
            <Box>
              <Box data-tour-id="finalsell.dialog.types">
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('labelGearToSell')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
                  <ToggleButton
                    value="artifacts"
                    selected={value.artifacts}
                    onClick={(e) => { e.preventDefault(); onChange({ ...value, artifacts: !value.artifacts }) }}
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      mr: 1,
                      borderWidth: 1,
                      borderColor: (theme) => theme.palette.grey[300],
                      color: (theme) => (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: (theme) => theme.palette.grey[400],
                        color: (theme) => (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                        backgroundColor: (theme) => (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
                      },
                      '&.Mui-selected': {
                        bgcolor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                        color: (theme) => (theme.vars?.palette.common.black ?? theme.palette.common.black),
                        borderColor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                        '&:hover': { bgcolor: (theme) => (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark) },
                      },
                    }}
                  >{t('artifacts')}</ToggleButton>
                  <ToggleButton
                    value="accessories"
                    selected={value.accessories}
                    onClick={(e) => { e.preventDefault(); onChange({ ...value, accessories: !value.accessories }) }}
                    sx={{
                      minHeight: MENU_CONTROL_HEIGHT_PX,
                      height: MENU_CONTROL_HEIGHT_PX,
                      lineHeight: 1,
                      px: 1.25,
                      py: 0,
                      mr: 1,
                      borderWidth: 1,
                      borderColor: (theme) => theme.palette.grey[300],
                      color: (theme) => (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: (theme) => theme.palette.grey[400],
                        color: (theme) => (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                        backgroundColor: (theme) => (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
                      },
                      '&.Mui-selected': {
                        bgcolor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                        color: (theme) => (theme.vars?.palette.common.black ?? theme.palette.common.black),
                        borderColor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                        '&:hover': { bgcolor: (theme) => (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark) },
                      },
                    }}
                  >{t('accessories')}</ToggleButton>
                </Box>
              </Box>
              <Box data-tour-id="finalsell.dialog.levels" sx={{ mt: 1.5 }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{t('labelLevelRanges')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                  {FINAL_SELL_LEVEL_CHOICES.map(({ key, label }) => {
                    const isSelected = value.levels.includes(key)
                    const button = (
                      <ToggleButton
                        key={key}
                        value={key}
                        selected={isSelected}
                        size="small"
                        onClick={(e) => { e.preventDefault(); toggleLevel(key) }}
                        sx={{
                          minWidth: 64,
                          px: 1,
                          py: 0.5,
                          mr: 1,
                          mb: 1,
                          borderWidth: 1,
                          borderColor: (theme) => theme.palette.grey[300],
                          color: (theme) => (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                          backgroundColor: 'transparent',
                          '&:hover': {
                            borderColor: (theme) => theme.palette.grey[400],
                            color: (theme) => (theme.vars?.palette.text.primary ?? theme.palette.text.primary),
                            backgroundColor: (theme) => (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
                          },
                          '&.Mui-selected': {
                            bgcolor: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main),
                            color: (theme) => (theme.vars?.palette.common.black ?? theme.palette.common.black),
                            borderColor: (theme) => (key === 16 ? (theme.vars?.palette.error.main ?? theme.palette.error.main) : (theme.vars?.palette.warning.main ?? theme.palette.warning.main)),
                            boxShadow: (theme) => `inset 0 0 0 1px ${key === 16 ? (theme.vars?.palette.error.main ?? theme.palette.error.main) : (theme.vars?.palette.warning.main ?? theme.palette.warning.main)}`,
                            '&:hover': { bgcolor: (theme) => (theme.vars?.palette.warning.dark ?? theme.palette.warning.dark) },
                          },
                        }}
                      >{label}</ToggleButton>
                    )
                    if (key === 16) {
                      return (
                        <MarkdownTooltip
                          key={key}
                          markdown={t('offByDefaultTooltip')}
                        >
                          {/* Wrap in span to satisfy Tooltip's single child requirement */}
                          <span>{button}</span>
                        </MarkdownTooltip>
                      )
                    }
                    return button
                  })}
                </Box>
              </Box>
            </Box>
            <Box
              sx={{
                mt: { xs: 1.5, sm: 0 },
                alignSelf: { sm: 'center' },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
              }}
            >
              <Typography data-tour-id="finalsell.dialog.status" variant="body2" color="text.secondary">
                {t('hintFinalSellStatusLead')}{' '}
                <Box
                  component="span"
                  sx={{ color: (theme) => (theme.vars?.palette.warning.main ?? theme.palette.warning.main), fontWeight: 600 }}
                >
                  {t(statusWordKey)}
                </Box>
                {'. '}
                {t(statusDetailKey)}
              </Typography>
            </Box>
          </Box>
        </Stack>
          </Box>
        )}
        {showSubstatTargetsTab && (
          <SubstatTargetsTabContent
            substatTargets={substatTargets}
            effectiveSubstatTargets={effectiveSubstatTargets}
            onSubstatTargetsChange={onSubstatTargetsChange}
            recipeOverridesActive={recipeOverridesActive}
            substatColors={substatColors}
          />
        )}
        {showGearTab && (
          // Gear tab reuses the Gear Inspector tab content without duplicating dialog chrome.
          <GearInspectorTabContent
            customRecipes={customRecipes}
            onView={gearTabOnView}
            substatColors={substatColors}
            gearInspectorItems={gearInspectorItems}
            setGearInspectorItems={setGearInspectorItems}
            allocGearInspectorItemId={allocGearInspectorItemId}
            gearInspectorMatches={gearInspectorMatches}
            isActive={open && showGearTab}
            emptyStateVerticalAlign={emptyStateVerticalAlign}
            renderLayout={renderGearInspectorLayout}
          />
        )}
        {showDungeonTab && (
          // Dungeon sim uses the merged rule list + substat targets for current keep logic.
          // key={dungeonMountKey} forces a fresh mount on each activate so prevInputs and
          // worker state are always null — guaranteeing the sim auto-starts.
          <DungeonSimulatorTab
            key={dungeonMountKey}
            rules={rules}
            substatTargets={substatTargets}
            substatColors={substatColors}
            useStatButtonColors={useStatButtonColors}
            resetKey={dungeonResetKey}
            isActive={open && showDungeonTab}
          />
        )}
        {showGearStatsTab && (
          // Gear Analytics receives all loaded rows so stats always reflect the full inventory.
          <GearAnalyticsTabContent
            rows={gearInspectorPreviewRows}
            {...(improvementChanceByArtifactId !== undefined && { improvementChanceByArtifactId })}
            onApplyToGearInspector={onApplyGearAnalyticsFilter}
            {...(gearInspectorDim !== undefined && { gearInspectorDim })}
            resetKey={gearAnalyticsResetKey}
            // Shared with the Gear Inspector grid — same artifact-id selection set.
            {...(selectedGearItemIds !== undefined && { selectedGearItemIds })}
            {...(onGearItemsSelect !== undefined && { onGearItemsSelect })}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: STANDARD_DIALOG_PADDING_INLINE_UNITS, py: STANDARD_DIALOG_PADDING_BLOCK_UNITS }}>
        {showResetButton && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={handleResetButtonClick}
            sx={{ mr: 'auto' }}
          >
            {t('resetToDefaults')}
          </Button>
        )}
        <Button onClick={handleClose} data-tour-id="finalsell.dialog.close">{t('close')}</Button>
      </DialogActions>
    </Dialog>
      {/* Dedicated confirm dialog spells out the destructive Gear reset before wiping Gear Inspector entries. */}
      <Dialog
        open={confirmResetGearInspector}
        onClose={() => setConfirmResetGearInspector(false)}
      >
        <DialogTitle>{t('titleResetGearInspector')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetGearInspector')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetGearInspector(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmResetGearInspector}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmResetSubstatTargets}
        onClose={() => setConfirmResetSubstatTargets(false)}
      >
        <DialogTitle>{t('titleResetSubstatTargets')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetSubstatTargets')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetSubstatTargets(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={() => {
            setConfirmResetSubstatTargets(false)
            onSubstatTargetsChange(defaultSubstatTargets(), { mode: 'reset' })
          }}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
