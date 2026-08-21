import React from 'react'
import { FormLabel, IconButton } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import { BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS, type BuilderPanelCollapsibleSectionId, type BuilderPanelCollapsedSections } from '../state/builderPreferences'
import { BUILDER_LABEL_INLINE_SX, COLLAPSED_CONTENT_INDICATOR_SX } from '../lib/constants'
import { createSectionToggler, defaultSectionToggleAriaLabel, isCollapsedWithContent } from '../lib/collapsibleSections'
import { GOLD_GROUP_HEADER_SX, GROUP_HEADER_CHEVRON_SX } from '../lib/goldSkin'
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
        sx={GROUP_HEADER_CHEVRON_SX}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        aria-label={ariaLabel ?? defaultSectionToggleAriaLabel(collapsed[id], t('sectionToggleExpandAria'), t('sectionToggleCollapseAria'))}
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
  // primaryAriaLabel: names the primary chevron. Only needed when a secondary chevron shares
  // the row — two bare "Expand" buttons are indistinguishable to a screen reader.
  primaryAriaLabel?: string
  // secondaryId: renders a SECOND chevron + label after the primary one, for a paired sub-group
  // that collapses independently (anomalous substats). The two sit on ONE header row rather than
  // stacking. Omitted on every ordinary single-chevron section.
  secondaryId?: BuilderPanelCollapsibleSectionId
  // secondaryLabel: the sub-group's own label text. Carries the same collapsed-with-content
  // highlight the primary label uses, so both sub-groups signal identically.
  secondaryLabel?: React.ReactNode
  // secondaryDirty: the sub-group holds a non-default selection. Composed with its own
  // collapsed state HERE (not by the caller) so the highlight rule has one definition —
  // same name and same contract as FilterSectionHeader's prop in RulesFilterPanel.
  // Label-only, exactly like every other section; the chevron itself is never tinted.
  secondaryDirty?: boolean
  // secondaryAriaLabel: names the sub-group so the two chevrons are distinguishable to screen readers.
  secondaryAriaLabel?: string
  children?: React.ReactNode
}

const BuilderSectionHeader: React.FC<BuilderSectionHeaderProps> = ({
  id, collapsed, onCollapsedChange, labelSx, dataTourId, primaryAriaLabel,
  secondaryId, secondaryLabel, secondaryDirty, secondaryAriaLabel, children,
}) => {
  // Toggle semantics come from the shared definition the rules-filter header also uses, so
  // "collapse this one / collapse all" cannot drift between the two panels (SSOT).
  const toggleSectionId = createSectionToggler(BUILDER_PANEL_COLLAPSIBLE_SECTION_IDS, collapsed, onCollapsedChange)
  const toggleSections = (applyToAll: boolean) => toggleSectionId(id, applyToAll)
  const handleLabelContextMenu = (event: React.MouseEvent<HTMLLabelElement>) => {
    event.preventDefault()
    toggleSections(true)
  }
  return (
    <>
      <BuilderSectionToggle
        id={id}
        collapsed={collapsed}
        onToggle={toggleSections}
        {...(primaryAriaLabel !== undefined ? { ariaLabel: primaryAriaLabel } : {})}
      />
      <FormLabel
        // GOLD_GROUP_HEADER_SX: the app-wide collapsible-group voice (gold micro-caps). It sits
        // before labelSx so per-section overrides — and the dirty-highlight span inside — win.
        sx={{ ...GOLD_GROUP_HEADER_SX, ...BUILDER_LABEL_INLINE_SX, cursor: 'pointer', ...labelSx }}
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
                // Same collapsible-group voice as the primary label (see above).
                ...GOLD_GROUP_HEADER_SX,
                ...BUILDER_LABEL_INLINE_SX,
                cursor: 'pointer',
                ...labelSx,
                // Same signal the primary label carries, so both halves read alike.
                ...(isCollapsedWithContent(collapsed[secondaryId], secondaryDirty) ? COLLAPSED_CONTENT_INDICATOR_SX : {}),
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
