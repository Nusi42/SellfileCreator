/**
 * collapsibleSections.ts
 *
 * SSOT for the *behaviour* of a collapsible section header, shared by the two panels that
 * render one: BuilderSectionHeader (`components/BuilderSectionToggle.tsx`) and
 * FilterSectionHeader (`components/RulesFilterPanel.tsx`).
 *
 * Why logic-only, and not one component: the two headers agree on every RULE but disagree on
 * MARKUP for real reasons — the builder passes arbitrary children into a plain `FormLabel`
 * (tooltips, badges, reset buttons live inside it), while the filter takes a `label` string and
 * wraps it in `EllipsisTooltip` plus width-constraining boxes. Merging the markup would mean a
 * component that renders two different trees behind a flag, which is a worse abstraction than
 * two small render functions. The duplication that actually mattered — the toggle semantics and
 * the collapsed-with-content rule — is what lives here.
 *
 * Generic over the section-id union so each panel keeps its own compile-time-checked id set
 * (`BuilderPanelCollapsibleSectionId` vs the rules-filter ids); a typo still fails to compile.
 */

/** Collapse state map: every section id → true when that section is collapsed. */
export type CollapsedSectionMap<Id extends string> = Record<Id, boolean>

/**
 * Build the toggle handler both header components use.
 *
 * Semantics (identical in both panels, previously written out twice):
 *  - plain toggle  → flip just the target section
 *  - applyToAll    → flip EVERY section to the target's next value, so one gesture collapses or
 *                    expands the whole panel. Driven by Ctrl/Cmd-click or right-click.
 *
 * Returns a function taking the section id, so the primary chevron, its label, and any paired
 * sub-group chevron/label all route through one definition instead of re-deriving the rule.
 */
export const createSectionToggler = <Id extends string>(
  allIds: readonly Id[],
  collapsed: CollapsedSectionMap<Id>,
  onCollapsedChange: (next: CollapsedSectionMap<Id>) => void,
) => (target: Id, applyToAll: boolean): void => {
  // The target's own next state drives the bulk apply, so "collapse all" from an expanded
  // section collapses everything (and vice versa) rather than inverting each section.
  const nextValue = !collapsed[target]
  if (applyToAll) {
    const nextAll = { ...collapsed }
    for (const key of allIds) nextAll[key] = nextValue
    onCollapsedChange(nextAll)
    return
  }
  onCollapsedChange({ ...collapsed, [target]: nextValue })
}

/**
 * The collapsed-with-content signal: a section's label is highlighted only while it is BOTH
 * collapsed and holding a non-default selection — expanded sections show their content, so the
 * colour would be noise. Applies to top-level sections and paired sub-groups alike.
 */
export const isCollapsedWithContent = (collapsed: boolean | undefined, dirty: boolean | undefined): boolean =>
  !!collapsed && !!dirty

/**
 * Default aria-label for a chevron with no sub-group name of its own. Sections that share a
 * header row (classic vs anomalous substats) pass their own localized label instead, so the two
 * buttons are distinguishable; a lone chevron falls back to this.
 */
export const defaultSectionToggleAriaLabel = (isCollapsed: boolean): string =>
  isCollapsed ? 'Expand' : 'Collapse'
