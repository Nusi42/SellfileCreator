import type { MouseEvent, SetStateAction } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material'
import { useI18n } from '../../lib/i18n'
import { MENU_CONTROL_HEIGHT_PX, type ColorBlindMode } from '../../lib/constants'
import {
  FINAL_SELL_DEFAULT_SETS_MODE,
  FINAL_SELL_DIALOG_TAB_FINAL_SELL,
  FINAL_SELL_DIALOG_TAB_KEEP_UNIQUES,
  FINAL_SELL_DIALOG_TABS,
  FINAL_SELL_SETS_MODE_ANY,
  FINAL_SELL_SETS_MODE_EXPLICIT,
  FINAL_SELL_LEVEL_CHOICES,
  type FinalSellDialogTab,
  type FinalSellLevel,
  type FinalSellRemainderConfig,
  type FinalSellSetsMode,
} from '../../lib/finalSell'
import type { KeepUniqueDetectionSnapshot, KeepUniqueRule } from '../../lib/keepUniques'
import type { TesterPreviewRow } from '../../types/testerPreview'
import KeepUniquesTab from './KeepUniquesTab'
import type { Metaset } from '../../lib/metasets'

type FinalSellDialogProps = {
  open: boolean
  value: FinalSellRemainderConfig
  onChange: (next: FinalSellRemainderConfig) => void
  onClose: () => void
  onReset?: () => void
  activeTab: FinalSellDialogTab
  onChangeTab: (next: FinalSellDialogTab) => void
  keepUniqueRules: KeepUniqueRule[]
  onKeepUniqueRulesChange: (next: SetStateAction<KeepUniqueRule[]>) => void
  keepUniquesEnabled: boolean
  onKeepUniquesEnabledChange: (next: SetStateAction<boolean>) => void
  keepUniqueDetection: KeepUniqueDetectionSnapshot | null
  testerRows: TesterPreviewRow[]
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
  testerBuilding?: boolean
  suppressMatchDetails?: boolean
  onResetKeepUniques?: () => void
  onJumpToRule?: (ruleIndex: number, cfgIdx: number | null) => void
}

export default function FinalSellDialog(props: FinalSellDialogProps) {
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
    testerRows,
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
  testerBuilding = false,
  suppressMatchDetails = false,
  onResetKeepUniques,
  onJumpToRule,
} = props
  const { t } = useI18n()
  // Clamp unknown tab ids back to the Final Sell default so autosave/restore can't wedge the dialog.
  const normalizedTab = FINAL_SELL_DIALOG_TABS.includes(activeTab) ? activeTab : FINAL_SELL_DIALOG_TAB_FINAL_SELL
  const hasGear = value.artifacts || value.accessories
  const hasLevelRanges = value.levels.length > 0
  const finalSellActive = hasGear && hasLevelRanges
  const statusWordKey = finalSellActive ? 'hintFinalSellStatusWordOn' : 'hintFinalSellStatusWordOff'
  const statusDetailKey = finalSellActive ? 'hintFinalSellStatusOnDetail' : 'hintFinalSellStatusOffDetail'
  const setsMode: FinalSellSetsMode = value.setsMode ?? FINAL_SELL_DEFAULT_SETS_MODE
  const handleTabChange = (_event: React.SyntheticEvent, nextValue: string) => {
    const nextTab = FINAL_SELL_DIALOG_TABS.includes(nextValue as FinalSellDialogTab)
      ? nextValue as FinalSellDialogTab
      : FINAL_SELL_DIALOG_TAB_FINAL_SELL
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
  const showFinalSellTab = normalizedTab === FINAL_SELL_DIALOG_TAB_FINAL_SELL
  // Reset button targets whichever tab is visible; skip rendering when no handler exists.
  const resetHandler = showFinalSellTab ? onReset : onResetKeepUniques
  // Dialog follows the spec'd min width/height so both tabs have enough breathing room.
  const paperSx = {
    width: 'min(960px, calc(100vw - 32px))',
    maxWidth: 'min(960px, calc(100vw - 32px))',
    height: 'min(800px, calc(100vh - 48px))',
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth={false}
      PaperProps={{ sx: paperSx }}
    >
      <DialogTitle sx={{ pb: 0 }}>
        <Stack spacing={1}>
          <Typography variant="h6">{t('titleFinalSellRules')}</Typography>
          <Tabs
            value={normalizedTab}
            onChange={handleTabChange}
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab value={FINAL_SELL_DIALOG_TAB_FINAL_SELL} label={t('testerFinalSell')} />
            <Tab
              value={FINAL_SELL_DIALOG_TAB_KEEP_UNIQUES}
              label={t('tabKeepUniques')}
              data-tour-id="keepuniques.tab"
            />
          </Tabs>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {showFinalSellTab ? (
          <Box data-tour-id="finalsell.dialog" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 3 }}>
            <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-line' }}>{t('msgFinalSellExplainer')}</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                        <Tooltip
                          key={key}
                          title={t('offByDefaultTooltip')}
                        >
                          {/* Wrap in span to satisfy Tooltip's single child requirement */}
                          <span>{button}</span>
                        </Tooltip>
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
              <Typography variant="body2" color="text.secondary">
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
        ) : (
          // Keep Uniques tab reuses tester grid context; props land even while the UI is under construction.
          <KeepUniquesTab
            rules={keepUniqueRules}
            enabled={keepUniquesEnabled}
            onRulesChange={onKeepUniqueRulesChange}
            onToggleEnabled={onKeepUniquesEnabledChange}
            detection={keepUniqueDetection}
            testerRows={testerRows}
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
            testerBuilding={testerBuilding}
            onJumpToRule={onJumpToRule}
            suppressMatchDetails={suppressMatchDetails}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {resetHandler && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={resetHandler}
            sx={{ mr: 'auto' }}
          >
            {t('resetToDefaults')}
          </Button>
        )}
        <Button onClick={onClose} data-tour-id="finalsell.dialog.close">{t('close')}</Button>
      </DialogActions>
    </Dialog>
  )
}
