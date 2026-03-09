import React from 'react'
import { IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS, type BuilderPanelCollapsibleSectionId, type BuilderPanelCollapsedSections } from '../state/builderPreferences'

// Module-level toggle button for builder collapsible sections.
// Shared by RecipeBuilderPanel and SafeguardBuilderPanel (SSOT).
type BuilderSectionToggleProps = {
  id: BuilderPanelCollapsibleSectionId
  collapsed: BuilderPanelCollapsedSections
  onCollapsedChange: (next: BuilderPanelCollapsedSections) => void
}

// Single-click toggles the target section; Ctrl/Cmd-click or right-click toggles all sections at once.
const BuilderSectionToggle: React.FC<BuilderSectionToggleProps> = ({ id, collapsed, onCollapsedChange }) => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const nextValue = !collapsed[id]
    if (event.ctrlKey || event.metaKey) {
      const nextAll = { ...collapsed }
      for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) nextAll[k] = nextValue
      onCollapsedChange(nextAll)
    } else {
      onCollapsedChange({ ...collapsed, [id]: nextValue })
    }
  }
  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const nextValue = !collapsed[id]
    const nextAll = { ...collapsed }
    for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) nextAll[k] = nextValue
    onCollapsedChange(nextAll)
  }
  return (
    <IconButton size="small" onClick={handleClick} onContextMenu={handleContextMenu} aria-label={collapsed[id] ? 'Expand' : 'Collapse'}>
      {collapsed[id] ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
    </IconButton>
  )
}

export default BuilderSectionToggle
