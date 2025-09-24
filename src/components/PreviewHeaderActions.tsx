import { Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material'
import TuneIcon from '@mui/icons-material/Tune'
import { ELLIPSIS_TEXT_SX, FINAL_SELL_BUTTON_WIDTH_PX, LONG_LABEL_BUTTON_MAX_WIDTH_PX, SMALL_BUTTON_HEIGHT_PX, BUILDER_TOGGLE_BUTTON_HEIGHT_PX } from '../lib/constants'
import { ACCEPT_HSF } from '../lib/constants'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import SaveIcon from '@mui/icons-material/Save'
import FilePickerButton from './FilePickerButton'
import { useI18n, formatRulesCount } from '../lib/i18n'

export default function PreviewHeaderActions(props: {
  mergedCount: number
  filteredCount?: number
  filterActive?: boolean
  onToggleFilter?: () => void
  colorIconSrc: string
  onOpenColors: () => void
  onSelectHsf: (file: File) => void | Promise<void>
  onClearBase: () => void
  baseRuleCount?: number
  onExport: () => void
  exportDisabled: boolean
  // Final sell remainder controls
  finalSell: { artifacts: boolean; accessories: boolean; levels: Array<0|4|8|12|16> }
  onToggleFinalSell: (enabled: boolean) => void
  onOpenFinalSellDialog: () => void
  onOpenRuleTester?: () => void
}) {
  const { mergedCount, filteredCount, filterActive, onToggleFilter, colorIconSrc, onOpenColors, onSelectHsf, onClearBase, baseRuleCount, onExport, exportDisabled, finalSell, onToggleFinalSell, onOpenFinalSellDialog, onOpenRuleTester } = props
  const fsEnabled = (finalSell.artifacts || finalSell.accessories) && (finalSell.levels?.length ?? 0) > 0
  const { t } = useI18n()
  const mergedCountLabel = formatRulesCount(t, mergedCount)
  const rulesChipLabel = filterActive && typeof filteredCount === 'number'
    ? `${formatRulesCount(t, filteredCount)} / ${mergedCountLabel}`
    : mergedCountLabel
  return (
    <>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6">{t('sellfilePreview')}</Typography>
        <Chip label={rulesChipLabel} size="small" />
        <Tooltip title={t('manageColors')}>
          <Button
            size="small"
            variant="outlined"
            color="info"
            onClick={onOpenColors}
            aria-label={t('manageColorsAria')}
            sx={{ minWidth: 28, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, lineHeight: 1, p: 0.25 }}
          >
            <img src={colorIconSrc} width={18} height={18} alt={t('manageColors')} style={{ display: 'block' }} />
          </Button>
        </Tooltip>
      </Stack>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', flex: 1 }}>
          {t('optionalLoadSellfile')}
        </Typography>
        {/* Right-aligned: Filters and Rule Tester */}
        {onToggleFilter && (
          <Tooltip title={t('filterTooltip')}>
            <Button
              size="small"
              variant={filterActive ? 'contained' : 'outlined'}
              color={filterActive ? 'success' : 'warning'}
              onClick={onToggleFilter}
              sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, flexShrink: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
              title={filterActive ? t('filtersOn') : t('filtersOff')}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{filterActive ? t('filtersOn') : t('filtersOff')}</Typography>
            </Button>
          </Tooltip>
        )}
        {onOpenRuleTester && (
          <Tooltip title={t('testerOpenTooltip')}>
            <Button
              size="small"
              variant="outlined"
              onClick={onOpenRuleTester}
              sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, flexShrink: 0, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
              title={t('testerOpenLabel')}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{t('testerOpenLabel')}</Typography>
            </Button>
          </Tooltip>
        )}
      </Stack>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'nowrap' }}>
        <FilePickerButton
          label={t('loadSellfile')}
          startIcon={<UploadFileIcon />}
          accept={ACCEPT_HSF}
          onSelect={onSelectHsf}
          buttonProps={{ sx: { whiteSpace: 'nowrap', flexShrink: 0 } }}
          labelMaxWidth={LONG_LABEL_BUTTON_MAX_WIDTH_PX}
        />
        <Button
          size="small"
          color="warning"
          onClick={onClearBase}
          disabled={!baseRuleCount}
          sx={{ height: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, minHeight: BUILDER_TOGGLE_BUTTON_HEIGHT_PX, whiteSpace: 'nowrap' }}
        >
          {t('clear')}
        </Button>
        {typeof baseRuleCount === 'number' && baseRuleCount > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              ml: 1,
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              lineHeight: 1.2,
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              maxWidth: 360,
              minWidth: 0,
              flex: '0 1 360px',
            }}
          >{baseRuleCount === 1 ? t('loadedBaseRuleOne') : t('loadedBaseRuleMany', { n: baseRuleCount })}</Typography>
        )}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t('addFinalSellTooltip')}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 2 }}>
            <Button
              size="small"
              variant={fsEnabled ? 'contained' : 'outlined'}
              color={fsEnabled ? 'warning' : 'warning'}
              onClick={() => onToggleFinalSell(!fsEnabled)}
              sx={{ whiteSpace: 'nowrap', px: 1.25, width: FINAL_SELL_BUTTON_WIDTH_PX, overflow: 'hidden', height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
              data-tour-id="finalsell.toggle"
              title={fsEnabled ? t('finalSellOn') : t('finalSellOff')}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>
                {fsEnabled ? t('finalSellOn') : t('finalSellOff')}
              </Typography>
            </Button>
            <Tooltip title={t('configure')}>
              <Button
                size="small"
                variant="outlined"
                color="info"
                onClick={onOpenFinalSellDialog}
                aria-label={t('configureFinalSellAria')}
                sx={{ minWidth: 28, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX, lineHeight: 1, p: 0.25 }}
                data-tour-id="finalsell.config"
              >
                <TuneIcon fontSize="small" />
              </Button>
            </Tooltip>
          </Stack>
        </Tooltip>
        <Tooltip title={filterActive ? t('exportIgnoresFilters') : ''}>
          <span>
            <Button
              startIcon={<SaveIcon />}
              sx={{ whiteSpace: 'nowrap', px: 1.25, maxWidth: LONG_LABEL_BUTTON_MAX_WIDTH_PX, overflow: 'hidden' }}
              onClick={onExport}
              disabled={exportDisabled}
              data-tour-id="hsf.export"
              title={baseRuleCount ? t('exportMergedSellfile') : t('exportSellfile')}
            >
              <Typography component="span" noWrap sx={ELLIPSIS_TEXT_SX}>{baseRuleCount ? t('exportMergedSellfile') : t('exportSellfile')}</Typography>
            </Button>
          </span>
        </Tooltip>
      </Stack>
    </>
  )
}
