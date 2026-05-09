import React from 'react'
import { FormLabel, IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS, type BuilderPanelCollapsibleSectionId, type BuilderPanelCollapsedSections } from '../state/builderPreferences'
import { BUILDER_LABEL_INLINE_SX } from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'

// Icon-only chevron button: delegates the actual toggle to onToggle from BuilderSectionHeader (SSOT).
// Single-click toggles the target section; Ctrl/Cmd-click or right-click toggles all sections at once.
type BuilderSectionToggleProps = {
  id: BuilderPanelCollapsibleSectionId
  collapsed: BuilderPanelCollapsedSections
  onToggle: (applyToAll: boolean) => void
}
const BuilderSectionToggle: React.FC<BuilderSectionToggleProps> = ({ id, collapsed, onToggle }) => {
  const { t } = useI18n()
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Guard: right-button synthetic clicks after contextmenu are handled by handleContextMenu.
    if (event.button !== 0) return
    onToggle(event.ctrlKey || event.metaKey)
  }
  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle(true)
  }
  return (
    // Tooltip surfaces the right-click toggle-all hint so users discover the gesture.
    <MarkdownTooltip markdown={t('builderSectionToggleTooltip')}>
      <IconButton size="small" onClick={handleClick} onContextMenu={handleContextMenu} aria-label={collapsed[id] ? 'Expand' : 'Collapse'}>
        {collapsed[id] ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
      </IconButton>
    </MarkdownTooltip>
  )
}

// Section header combining the toggle icon with a clickable FormLabel.
// Owns the toggle logic so both the icon and label share the same behavior (SSOT).
// Single-click → one section; Ctrl/Cmd-click or right-click → all sections.
type BuilderSectionHeaderProps = {
  id: BuilderPanelCollapsibleSectionId
  collapsed: BuilderPanelCollapsedSections
  onCollapsedChange: (next: BuilderPanelCollapsedSections) => void
  // labelSx: plain-object overrides applied on top of BUILDER_LABEL_INLINE_SX (no arrays/functions needed).
  labelSx?: Record<string, unknown>
  // dataTourId: forwarded as data-tour-id on the FormLabel for product-tour targeting.
  dataTourId?: string
  children?: React.ReactNode
}

const BuilderSectionHeader: React.FC<BuilderSectionHeaderProps> = ({
  id, collapsed, onCollapsedChange, labelSx, dataTourId, children,
}) => {
  const toggleSections = (applyToAll: boolean) => {
    const nextValue = !collapsed[id]
    if (applyToAll) {
      const nextAll = { ...collapsed }
      for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) nextAll[k] = nextValue
      onCollapsedChange(nextAll)
    } else {
      onCollapsedChange({ ...collapsed, [id]: nextValue })
    }
  }
  const handleLabelContextMenu = (event: React.MouseEvent<HTMLLabelElement>) => {
    event.preventDefault()
    toggleSections(true)
  }
  return (
    <>
      <BuilderSectionToggle id={id} collapsed={collapsed} onToggle={toggleSections} />
      <FormLabel
        sx={{ ...BUILDER_LABEL_INLINE_SX, cursor: 'pointer', ...labelSx }}
        onClick={() => toggleSections(false)}
        onContextMenu={handleLabelContextMenu}
        data-tour-id={dataTourId}
      >
        {children}
      </FormLabel>
    </>
  )
}

export { BuilderSectionHeader }
export default BuilderSectionHeader
