// SeparatorToggleButton — the single on/off "━" toggle that turns a builder draft
// into a list divider. ONE component for both builders (identical UX by design):
// it sits to the right of the name field; only the tooltip differs per domain.
import { ToggleButton } from '@mui/material'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'

export function SeparatorToggleButton({ active, tooltip, onChange, dataTourId }: {
  active: boolean
  /** Domain-specific explanation (recipe vs safeguard separator semantics). */
  tooltip: string
  onChange: (nextActive: boolean) => void
  dataTourId?: string
}) {
  const { t } = useI18n()
  return (
    <MarkdownTooltip placement="top" markdown={tooltip}>
      <ToggleButton
        value="separator"
        size="small"
        selected={active}
        aria-label={t('builderExportModeSeparator')}
        onChange={() => onChange(!active)}
        sx={{ px: 1.5, flexShrink: 0 }}
        {...(dataTourId ? { 'data-tour-id': dataTourId } : {})}
      >
        ━
      </ToggleButton>
    </MarkdownTooltip>
  )
}
