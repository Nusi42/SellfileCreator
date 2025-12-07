import { useCallback, useState, type Dispatch, type MouseEvent, type SetStateAction } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useI18n } from '../../lib/i18n'
import { MENU_CONTROL_HEIGHT_PX, type ColorBlindMode } from '../../lib/constants'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  FINAL_SELL_LEVEL_CHOICES,
  LOGIC_HUB_DIALOG_TAB_FINAL_SELL,
  LOGIC_HUB_DIALOG_TAB_GEAR,
  LOGIC_HUB_DIALOG_TAB_KEEP_UNIQUES,
  LOGIC_HUB_DIALOG_TABS,
  finalSellCoversFullLevelRange,
  type LogicHubDialogTab,
  type FinalSellLevel,
  type FinalSellRemainderConfig,
  type FinalSellSetsMode,
} from '../../lib/finalSell'
import type { KeepUniqueDetectionSnapshot, KeepUniqueRule } from '../../lib/keepUniques'
import type { BuilderConfig } from '../../lib/hsfBuilder'
import type { RuleTesterItem } from '../../lib/ruleTesterSession'
import type { TesterPreviewMatch, TesterPreviewRow } from '../../types/testerPreview'
import { GearTesterTabContent, type GearTesterTabLayoutSlots } from './GearTesterTabContent'
import KeepUniquesTab from './KeepUniquesTab'
// MarkdownTooltip keeps the level-hint copy behavior aligned with the rest of the app.
import MarkdownTooltip from '../MarkdownTooltip'
import type { Metaset } from '../../lib/metasets'
import { reserveScrollbarGutterSpace } from '../../lib/scrollbar'

type LogicHubDialogProps = {
  open: boolean
  value: FinalSellRemainderConfig
  onChange: (next: FinalSellRemainderConfig) => void
  onClose: () => void
  onReset?: () => void
  activeTab: LogicHubDialogTab
  onChangeTab: (next: LogicHubDialogTab) => void
  keepUniqueRules: KeepUniqueRule[]
  onKeepUniqueRulesChange: (next: SetStateAction<KeepUniqueRule[]>) => void
  keepUniquesEnabled: boolean
  onKeepUniquesEnabledChange: (next: SetStateAction<boolean>) => void
  keepUniqueDetection: KeepUniqueDetectionSnapshot | null
  gearEntries: TesterPreviewRow[]
  keepUniqueItemKeys: ReadonlySet<number>
  substatColors: Record<number, { fg: string; bg: string }>
  useStatButtonColors: boolean
  onToggleStatColors: (next: boolean) => void
  onOpenManageColors: () => void
  colorBlindMode: ColorBlindMode
  onChangeColorBlindMode: (mode: ColorBlindMode) => void
  colorIconSrc: string
  configNames: Array<string | null>
  metasets: Metaset[]
  suppressMatchDetails?: boolean
  onResetKeepUniques?: () => void
  onJumpToRule?: (ruleIndex: number, cfgIdx: number | null) => void
  workloadProgressRatio: number
  customCfgs: BuilderConfig[]
  testerItems: RuleTesterItem[]
  setTesterItems: Dispatch<SetStateAction<RuleTesterItem[]>>
  allocTesterItemId: () => number
  testerMatches: ReadonlyMap<number, TesterPreviewMatch | null>
  onResetGearTester?: () => void
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
    keepUniqueRules,
    onKeepUniqueRulesChange,
    keepUniquesEnabled,
    onKeepUniquesEnabledChange,
    keepUniqueDetection,
    gearEntries,
    keepUniqueItemKeys,
    substatColors,
    useStatButtonColors,
    onToggleStatColors,
    onOpenManageColors,
    colorBlindMode,
    onChangeColorBlindMode,
    colorIconSrc,
    configNames,
    metasets,
    suppressMatchDetails = false,
    onResetKeepUniques,
    onJumpToRule,
    workloadProgressRatio,
    customCfgs,
    testerItems,
    setTesterItems,
    allocTesterItemId,
    testerMatches,
    onResetGearTester,
  } = props
  const { t } = useI18n()
  // Keep Uniques resets need their own confirmation flow so accidental clicks do not wipe custom rules.
  const [confirmResetKeepUniques, setConfirmResetKeepUniques] = useState(false)
  // Gear resets also confirm so a stray click does not clear imported databases or manual samples.
  const [confirmResetGearTester, setConfirmResetGearTester] = useState(false)
  // Fallback keeps the tester grid handler stable even when no jump target is supplied.
  const noopTesterRuleJump = useCallback(() => {}, [])
  const gearTabOnView = onJumpToRule ?? noopTesterRuleJump
  // Clamp unknown tab ids back to the Logic Hub default so autosave/restore can't wedge the dialog.
  const normalizedTab = LOGIC_HUB_DIALOG_TABS.includes(activeTab) ? activeTab : LOGIC_HUB_DIALOG_TAB_FINAL_SELL
  const hasGear = value.artifacts || value.accessories
  const hasLevelRanges = value.levels.length > 0
  const finalSellActive = hasGear && hasLevelRanges
  const finalSellFullRange = finalSellCoversFullLevelRange(value.levels)
  // Keep Uniques depends on Final Sell covering the full ladder so protection rules stay aligned.
  const keepUniquesFinalSellWarning = keepUniquesEnabled && (!finalSellActive || !finalSellFullRange)
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
  const showGearTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_GEAR
  const showKeepUniquesTab = normalizedTab === LOGIC_HUB_DIALOG_TAB_KEEP_UNIQUES
  // The reset affordance still sits in the Dialog actions, but Keep Uniques routes through a confirm prompt.
  const showResetButton = showFinalSellTab
    ? Boolean(onReset)
    : showGearTab
      ? Boolean(onResetGearTester)
      : showKeepUniquesTab
      ? Boolean(onResetKeepUniques)
      : false
  const handleResetButtonClick = () => {
    if (showFinalSellTab) {
      onReset?.()
      return
    }
    if (showGearTab && onResetGearTester) {
      setConfirmResetGearTester(true)
      return
    }
    if (showKeepUniquesTab && onResetKeepUniques) setConfirmResetKeepUniques(true)
  }
  // Once confirmed we immediately run the keep-unique reset so custom overrides do not linger in a half-reset state.
  const handleConfirmResetKeepUniques = () => {
    if (!onResetKeepUniques) return
    setConfirmResetKeepUniques(false)
    onResetKeepUniques()
  }
  // Clear the tester items in one shot so manual + imported gear disappear together.
  const handleConfirmResetGearTester = () => {
    if (!onResetGearTester) return
    setConfirmResetGearTester(false)
    onResetGearTester()
  }
  // Dialog follows the spec'd min width/height so both tabs have enough breathing room.
  const paperSx = {
    width: 'min(960px, calc(100vw - 32px))',
    maxWidth: 'min(960px, calc(100vw - 32px))',
    height: 'min(800px, calc(100vh - 48px))',
  }
  // Layout wrapper mirrors the placeholder padding and keeps the tester content/actions vertically stacked.
  const renderGearTesterLayout = useCallback(({ content, actions }: GearTesterTabLayoutSlots) => (
    <Box
      data-tour-id="finalsell.dialog.gear"
      sx={(theme) => ({
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        p: 3,
        ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: theme.spacing(3) }),
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
      onClose={onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{ sx: paperSx }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Stack spacing={1}>
          <Typography variant="h6">{t('titleLogicHub')}</Typography>
          <Tabs
            value={normalizedTab}
            onChange={handleTabChange}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab value={LOGIC_HUB_DIALOG_TAB_FINAL_SELL} label={t('testerFinalSell')} />
            <Tab value={LOGIC_HUB_DIALOG_TAB_GEAR} label={t('tabFinalSellGear')} />
            <Tab
              value={LOGIC_HUB_DIALOG_TAB_KEEP_UNIQUES}
              label={t('tabKeepUniques')}
              data-tour-id="keepuniques.tab"
            />
          </Tabs>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {showFinalSellTab && (
          <Box
            data-tour-id="finalsell.dialog"
            sx={(theme) => ({
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              p: 3,
              ...reserveScrollbarGutterSpace({ reserveStart: false, basePaddingInlineEnd: theme.spacing(3) }),
            })}
          >
            <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{t('msgFinalSellExplainer')}</Typography>
          <Box data-tour-id="finalsell.dialog.sets" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography variant="body2">{t('labelFinalSellSetsMode')}</Typography>
              <ToggleButtonGroup
                exclusive
                value={setsMode}
                onChange={handleSetsModeChange}
                size="small"
                sx={{ alignSelf: 'flex-start' }}
              >
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
                    color: (theme) => theme.palette.text.secondary,
                    backgroundColor: 'transparent',
                    '&:hover': {
                      borderColor: (theme) => theme.palette.grey[400],
                      color: (theme) => theme.palette.text.primary,
                      backgroundColor: (theme) => theme.palette.action.hover,
                    },
                    '&.Mui-selected': {
                      bgcolor: (theme) => theme.palette.warning.main,
                      color: (theme) => theme.palette.common.black,
                      borderColor: (theme) => theme.palette.warning.main,
                      '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                    },
                  }}
                >
                  {t('finalSellSetsModeAny')}
                </ToggleButton>
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
                    color: (theme) => theme.palette.text.secondary,
                    backgroundColor: 'transparent',
                    '&:hover': {
                      borderColor: (theme) => theme.palette.grey[400],
                      color: (theme) => theme.palette.text.primary,
                      backgroundColor: (theme) => theme.palette.action.hover,
                    },
                    '&.Mui-selected': {
                      bgcolor: (theme) => theme.palette.warning.main,
                      color: (theme) => theme.palette.common.black,
                      borderColor: (theme) => theme.palette.warning.main,
                      '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
                    },
                  }}
                >
                  {t('finalSellSetsModeExplicit')}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            <Alert
              data-tour-id="finalsell.dialog.warning"
              severity="warning"
              variant="outlined"
              color="warning"
              sx={{
                minHeight: 120,
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
                      color: (theme) => theme.palette.text.secondary,
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: (theme) => theme.palette.grey[400],
                        color: (theme) => theme.palette.text.primary,
                        backgroundColor: (theme) => theme.palette.action.hover,
                      },
                      '&.Mui-selected': {
                        bgcolor: (theme) => theme.palette.warning.main,
                        color: (theme) => theme.palette.common.black,
                        borderColor: (theme) => theme.palette.warning.main,
                        '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
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
                      color: (theme) => theme.palette.text.secondary,
                      backgroundColor: 'transparent',
                      '&:hover': {
                        borderColor: (theme) => theme.palette.grey[400],
                        color: (theme) => theme.palette.text.primary,
                        backgroundColor: (theme) => theme.palette.action.hover,
                      },
                      '&.Mui-selected': {
                        bgcolor: (theme) => theme.palette.warning.main,
                        color: (theme) => theme.palette.common.black,
                        borderColor: (theme) => theme.palette.warning.main,
                        '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
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
                          color: (theme) => theme.palette.text.secondary,
                          backgroundColor: 'transparent',
                          '&:hover': {
                            borderColor: (theme) => theme.palette.grey[400],
                            color: (theme) => theme.palette.text.primary,
                            backgroundColor: (theme) => theme.palette.action.hover,
                          },
                          '&.Mui-selected': {
                            bgcolor: (theme) => theme.palette.warning.main,
                            color: (theme) => theme.palette.common.black,
                            borderColor: (theme) => (key === 16 ? theme.palette.error.main : theme.palette.warning.main),
                            boxShadow: (theme) => `inset 0 0 0 1px ${key === 16 ? theme.palette.error.main : theme.palette.warning.main}`,
                            '&:hover': { bgcolor: (theme) => theme.palette.warning.dark },
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
                  sx={{ color: (theme) => theme.palette.warning.main, fontWeight: 600 }}
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
        {showGearTab && (
          // Gear tab reuses the tester tab content without duplicating dialog chrome.
          <GearTesterTabContent
            customCfgs={customCfgs}
            onView={gearTabOnView}
            substatColors={substatColors}
            testerItems={testerItems}
            setTesterItems={setTesterItems}
            allocTesterItemId={allocTesterItemId}
            testerMatches={testerMatches}
            isActive={open && showGearTab}
            renderLayout={renderGearTesterLayout}
          />
        )}
        {showKeepUniquesTab && (
          // Keep Uniques tab reuses tester grid context; props land even while the UI is under construction.
          <KeepUniquesTab
            rules={keepUniqueRules}
            enabled={keepUniquesEnabled}
            finalSellCoverageWarningActive={keepUniquesFinalSellWarning}
            onRulesChange={onKeepUniqueRulesChange}
            onToggleEnabled={onKeepUniquesEnabledChange}
            detection={keepUniqueDetection}
            gearEntries={gearEntries}
            uniqueItemKeys={keepUniqueItemKeys}
            substatColors={substatColors}
            useStatButtonColors={useStatButtonColors}
            onToggleStatColors={onToggleStatColors}
            onOpenManageColors={onOpenManageColors}
            colorBlindMode={colorBlindMode}
            onChangeColorBlindMode={onChangeColorBlindMode}
            colorIconSrc={colorIconSrc}
            configNames={configNames}
            metasets={metasets}
            onJumpToRule={onJumpToRule}
            suppressMatchDetails={suppressMatchDetails}
            workloadProgressRatio={workloadProgressRatio}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
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
        <Button onClick={onClose} data-tour-id="finalsell.dialog.close">{t('close')}</Button>
      </DialogActions>
    </Dialog>
      {/* Dedicated confirm dialog spells out the destructive Gear reset before wiping tester entries. */}
      <Dialog
        open={confirmResetGearTester}
        onClose={() => setConfirmResetGearTester(false)}
      >
        <DialogTitle>{t('titleResetGearTester')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetGearTester')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetGearTester(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmResetGearTester}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
      {/* Dedicated confirm dialog spells out the destructive Keep Uniques reset details before applying the change. */}
      <Dialog
        open={confirmResetKeepUniques}
        onClose={() => setConfirmResetKeepUniques(false)}
      >
        <DialogTitle>{t('titleResetKeepUniques')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('msgResetKeepUniques')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmResetKeepUniques(false)}>{t('cancel')}</Button>
          <Button color="error" onClick={handleConfirmResetKeepUniques}>{t('reset')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
