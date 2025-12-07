import { Box, Dialog, DialogTitle } from '@mui/material'
import type { GearTesterTabContentProps } from './GearTesterTabContent'
import { GearTesterTabContent } from './GearTesterTabContent'
import { useI18n } from '../../lib/i18n'
import { TESTER_DIALOG_HEIGHT_PX, TESTER_DIALOG_WIDTH_PX } from '../../lib/constants'

export type RuleTesterDialogProps = GearTesterTabContentProps & {
  open: boolean
  onClose: () => void
}

export default function RuleTesterDialog({ open, onClose, ...contentProps }: RuleTesterDialogProps) {
  const { t } = useI18n()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{
        sx: {
          width: TESTER_DIALOG_WIDTH_PX,
          maxWidth: TESTER_DIALOG_WIDTH_PX,
          minWidth: TESTER_DIALOG_WIDTH_PX,
          height: TESTER_DIALOG_HEIGHT_PX,
          maxHeight: TESTER_DIALOG_HEIGHT_PX,
          minHeight: TESTER_DIALOG_HEIGHT_PX,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1 }}>{t('testerTitle')}</Box>
      </DialogTitle>
      <GearTesterTabContent
        {...contentProps}
        isActive={open}
        onRequestClose={onClose}
      />
    </Dialog>
  )
}
