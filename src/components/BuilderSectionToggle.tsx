import React from 'react'
import { FormLabel, IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS, type BuilderPanelCollapsibleSectionId, type BuilderPanelCollapsedSections } from '../state/builderPreferences'
import { BUILDER_LABEL_INLINE_SX, COLLAPSED_CONTENT_INDICATOR_SX } from '../lib/constants'
import MarkdownTooltip from './MarkdownTooltip'
import { useI18n } from '../lib/i18n'

// Icon-only chevron button: delegates the actual toggle to onToggle from BuilderSectionHeader (SSOT).
// Single-click toggles the target section; Ctrl/Cmd-click or right-click toggles all sections at once.
type BuilderSectionToggleProps = {
  id: BuilderPanelCollapsibleSectionId
  collapsed: BuilderPanelCollapsedSections
  onToggle: (applyToAll: boolean) => void
  // ariaLabel: overrides the default Expand/Collapse label so shared-row chevrons can name
  // their own sub-group ("Expand anomalous substats") instead of both reading identically.
  ariaLabel?: string
}
const BuilderSectionToggle: React.FC<BuilderSectionToggleProps> = ({ id, collapsed, onToggle, ariaLabel }) => {
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
      <IconButton
        size="small"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        aria-label={ariaLabel ?? (collapsed[id] ? 'Expand' : 'Collapse')}
      >
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
  // secondaryId: renders a SECOND chevron + label after the primary one, for a paired sub-group
  // that collapses independently (anomalous substats). The two sit on ONE header row rather than
  // stacking. Omitted on every ordinary single-chevron section.
  secondaryId?: BuilderPanelCollapsibleSectionId
  // secondaryLabel: the sub-group's own label text. Carries the same collapsed-with-content
  // highlight the primary label uses, so both sub-groups signal identically.
  secondaryLabel?: React.ReactNode
  // secondaryIndicate: highlight the second LABEL — "collapsed but holding a selection".
  // Label-only, exactly like every other section; the chevron itself is never tinted.
  secondaryIndicate?: boolean
  // secondaryAriaLabel: names the sub-group so the two chevrons are distinguishable to screen readers.
  secondaryAriaLabel?: string
  children?: React.ReactNode
}

const BuilderSectionHeader: React.FC<BuilderSectionHeaderProps> = ({
  id, collapsed, onCollapsedChange, labelSx, dataTourId,
  secondaryId, secondaryLabel, secondaryIndicate, secondaryAriaLabel, children,
}) => {
  // Toggling is parameterized by section id so the primary and secondary chevrons share it (SSOT).
  const toggleSectionId = (target: BuilderPanelCollapsibleSectionId, applyToAll: boolean) => {
    const nextValue = !collapsed[target]
    if (applyToAll) {
      const nextAll = { ...collapsed }
      for (const k of BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS) nextAll[k] = nextValue
      onCollapsedChange(nextAll)
    } else {
      onCollapsedChange({ ...collapsed, [target]: nextValue })
    }
  }
  const toggleSections = (applyToAll: boolean) => toggleSectionId(id, applyToAll)
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
      {/* Paired sub-group: its own chevron AND label, sharing this header row rather than
          stacking. Same gestures and the same collapsed-with-content highlight as the primary. */}
      {secondaryId ? (
        <>
          <BuilderSectionToggle
            id={secondaryId}
            collapsed={collapsed}
            onToggle={(applyToAll) => toggleSectionId(secondaryId, applyToAll)}
            {...(secondaryAriaLabel !== undefined ? { ariaLabel: secondaryAriaLabel } : {})}
          />
          {secondaryLabel ? (
            <FormLabel
              sx={{
                ...BUILDER_LABEL_INLINE_SX,
                cursor: 'pointer',
                ...labelSx,
                // Same signal the primary label carries, so both halves read alike.
                ...(secondaryIndicate ? COLLAPSED_CONTENT_INDICATOR_SX : {}),
              }}
              onClick={() => toggleSectionId(secondaryId, false)}
              onContextMenu={(event) => { event.preventDefault(); toggleSectionId(secondaryId, true) }}
            >
              {secondaryLabel}
            </FormLabel>
          ) : null}
        </>
      ) : null}
    </>
  )
}

export { BuilderSectionHeader }
export default BuilderSectionHeader
