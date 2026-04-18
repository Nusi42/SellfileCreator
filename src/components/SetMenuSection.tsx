/**
 * SetMenuSection
 *
 * Renders the regular Sets section used in selects/menus. Supports two display
 * modes controlled by the caller via `setsOrder`:
 * - 'game' | 'az': Text list with icon + name + usage/meta info
 * - 'icons': Icon-only grid (compact), tooltip shows details
 *
 * Current behavior: metasets are rendered by callers separately when needed.
 * This component focuses only on the regular sets list to avoid duplication
 * across BuilderPanel and MetasetsDialog while allowing small behavioral diffs
 * via props (e.g., item value shape and excluding a metaset from membership
 * hints).
 */
import type { MouseEvent, ReactNode } from 'react'
import { Box, ListSubheader, MenuItem, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { SetIcon, SET_ICON_PX } from './SetIcon'
import { WithSetTooltip, buildNoSetTooltipMarkdown } from './SetTooltip'
import MarkdownTooltip from './MarkdownTooltip'
import { ACCESSORY_NO_SET_ID, LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_SCROLL_GUTTER_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, MULTI_EDIT_MIXED_BG_ALPHA, MULTI_EDIT_MIXED_BORDER_ALPHA, MULTI_EDIT_MIXED_TEXT_ALPHA } from '../lib/constants'
import type { Metaset } from '../lib/metasets'
import SetsOrderControls from './SetsOrderControls'
import { useI18n } from '../lib/i18n'
import { ArtifactSetPieceGroup, getArtifactSetPieceGroup, getLocalizedGearSetName, type ArtifactSetId } from '../lib/types'

// Icon grid sizing — tuned to fit 15 items within a ~520px menu width.
const ICON_GRID_ITEM_PX = 32 as const
const ICON_GRID_ICON_PX = 22 as const
const ICON_GRID_MARGIN_PX = 1 as const
// No ring inset needed; selected state uses background only.

export default function SetMenuSection({
  title,
  sorted,
  setsOrder,
  metasets,
  excludeMetasetId,
  allExplicitMetaId,
  setUsageCounts,
  valueForSet,
  setsSearch,
  onSetsSearchChange,
  onSetsOrderChange,
  hoveredMetasetId = null,
  selectedMetasetIds: _selectedMetasetIds = [],
  selectedSetIds = [],
  excludedSetIds = [],
  onToggleSet,
  onContextMenuSet,
  hideHeader = false,
  showUsageCounts = true,
  singleSelect = false,
  triStateForSet,
  disabledSetIds,
}: {
  title?: string
  sorted: Array<[string, string]>
  setsOrder: 'game' | 'az' | 'icons'
  metasets: Metaset[]
  excludeMetasetId?: string | null
  allExplicitMetaId?: string
  setUsageCounts: Record<number, number>
  // Caller controls the MenuItem value (e.g., 's:ID' in builder, 'ID' in metaset editor)
  valueForSet: (id: number) => string
  // Optional: wire through search + order controls to render them inline in the header
  setsSearch?: string
  onSetsSearchChange?: (v: string) => void
  onSetsOrderChange?: (v: 'game' | 'az' | 'icons') => void
  // Optional: highlight sets belonging to a hovered metaset, and sets in selected metasets
  hoveredMetasetId?: string | null
  selectedMetasetIds?: string[]
  // Optional: sets explicitly selected in the multi-select (Builder)
  selectedSetIds?: number[]
  // Optional: sets explicitly excluded (red indicator styling).
  excludedSetIds?: number[]
  // Optional: set ids that should be shown but not selectable.
  disabledSetIds?: number[]
  // Optional: explicit click handler for icon grid items. When provided, we
  // call this on click instead of relying on MUI's internal Select handling.
  // Why: MUI Select can miss clicks on custom compact MenuItem layouts; this
  // ensures clicks always toggle selection without closing the menu.
  onToggleSet?: (id: number) => void
  // Optional: context menu handler for right-click exclude actions.
  onContextMenuSet?: (id: number, event: MouseEvent<HTMLElement>) => void
  // When true, do not render the ListSubheader (parent renders its own header
  // outside the scrollable list to keep layout width stable across modes).
  hideHeader?: boolean
  // Show/hide "x use(s) in recipes)" helper in list modes
  showUsageCounts?: boolean
  // Single-select mode hints the handler not to prevent default, so the Select closes naturally.
  singleSelect?: boolean
  triStateForSet?: (id: number) => 'none' | 'partial' | 'all'
}) {
  const { t, lang } = useI18n()
  // Preserve the hovered metaset id for per-item highlighting.
  const hovered = hoveredMetasetId
  // Selected sets render as explicit (filled) selections.
  const selectedSets = new Set(selectedSetIds)
  // Selected metasets mark derived set membership.
  const selectedMetaSet = new Set(_selectedMetasetIds)
  // Excluded sets render with a red indicator.
  const excludedSet = new Set(excludedSetIds)
  // Disabled set ids appear in menus but cannot be toggled.
  const disabledSet = new Set((disabledSetIds ?? []).map(Number))
  // Resolve hovered metaset metadata when it is not the "all explicit" sentinel.
  const hoveredMeta = hovered && hovered !== allExplicitMetaId
    ? metasets.find(m => m.name === hovered) || null
    : null
  // Some callers define an "all explicit" metaset sentinel; highlight everything when hovered/selected.
  const hoveredHighlightsAll = Boolean(hovered && hovered === allExplicitMetaId)
  const selectedHighlightsAll = Boolean(allExplicitMetaId && selectedMetaSet.has(allExplicitMetaId))
  // Default tri-state resolver uses explicit selections when no helper is provided.
  const getTriStateForSet = triStateForSet ?? ((id: number) => (selectedSets.has(id) ? 'all' : 'none'))
  // Disabled menu items should still communicate their status.
  const buildDisabledTooltip = (label: string, options?: { isNoSet?: boolean }) => (
    options?.isNoSet
      ? buildNoSetTooltipMarkdown(t, { label, includeDisabled: true })
      : `**${label}**\n${t('disabled')}`
  )
  // Wrap disabled items so tooltips still fire even when the MenuItem is disabled.
  const wrapDisabledTooltip = (key: string, markdown: string, node: ReactNode) => (
    <MarkdownTooltip key={key} markdown={markdown} placement="right">
      <Box component="span" sx={{ display: 'block' }}>
        {node}
      </Box>
    </MarkdownTooltip>
  )

  return (
    <>
      {!hideHeader && (
        <ListSubheader
          sx={[
            LIST_SUBHEADER_SX,
            // Provide extra vertical room when the Search field is present so
            // the floating label (focused) has space and doesn't feel cramped.
            (typeof setsSearch === 'string' && onSetsSearchChange && onSetsOrderChange)
              ? { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }
              : null,
          ]}
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', alignItems: 'center', gap: 1, pr: `${MENU_SCROLL_GUTTER_PX}px` }}>
            {(title ?? t('setsTitle')) ? (
              <Typography variant="body2" component="div" sx={{ opacity: 0.9 }}>{title ?? t('setsTitle')}</Typography>
            ) : (
              <Box />
            )}
            {typeof setsSearch === 'string' && onSetsSearchChange && onSetsOrderChange && (
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <SetsOrderControls
                  setsSearch={setsSearch}
                  onSetsSearchChange={onSetsSearchChange}
                  setsOrder={setsOrder}
                  onSetsOrderChange={onSetsOrderChange}
                  zeroResults={sorted.length === 0}
                />
              </Box>
            )}
          </Box>
        </ListSubheader>
      )}
      {setsOrder === 'icons' ? (
          (() => {
            // Centralized grouping keeps the menu categories aligned with the Keep
            // Uniques defaults and any other callers importing the same helper.
            // Grouping by piece type keeps icon rows aligned to armor/accessory tiers.
            const accessories = sorted.filter(([id]) => getArtifactSetPieceGroup(Number(id)) === ArtifactSetPieceGroup.Accessories)
            const armorFixed = sorted.filter(([id]) => getArtifactSetPieceGroup(Number(id)) === ArtifactSetPieceGroup.ArmorFixed)
            const armorVar19 = sorted.filter(([id]) => getArtifactSetPieceGroup(Number(id)) === ArtifactSetPieceGroup.ArmorVariable)
            const renderIconItem = ([id, name]: [string, string]) => {
              const idNum = Number(id)
              // Keep localization consistent with other selects (no-set uses its own key).
              const localizedName = getLocalizedGearSetName(idNum as ArtifactSetId, t, lang)
              const tooltipName = localizedName || name
              // No-set accessories need their own tooltip (no set effects to display).
              const isNoSet = idNum === ACCESSORY_NO_SET_ID
              const isDisabled = disabledSet.has(idNum)
              // Only show the descriptive tooltip on enabled items; disabled uses a wrapper tooltip.
              const noSetTooltipMarkdown = isNoSet && !isDisabled
                ? buildNoSetTooltipMarkdown(t, { label: tooltipName })
                : null
              // Hover highlights only apply when the hovered metaset contains this set.
              const inHovered = hoveredHighlightsAll || Boolean(hoveredMeta && hoveredMeta.sets.includes(idNum))
              // Selected metasets outline sets that are not explicitly selected.
              const inSelectedMeta = selectedHighlightsAll || metasets.some(m => selectedMetaSet.has(m.name) && m.sets.includes(idNum))
              // Tri-state: all/partial/none for multi-edit.
              const setState = getTriStateForSet(idNum)
              const inSelectedSet = setState === 'all'
              const isPartialSet = setState === 'partial'
              // Excluded sets show a red ring and should not be treated as explicit selections.
              const isExcluded = excludedSet.has(idNum)
              // Name line rendered by WithSetTooltip (showName), so no local piece text needed.
              const iconNode = (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SetIcon setId={idNum} label={tooltipName} size={ICON_GRID_ICON_PX} sx={{ mr: 0 }} />
                </Box>
              )
              // For no-set, provide a custom tooltip instead of set effect details.
              const iconWithTooltip = noSetTooltipMarkdown ? (
                <MarkdownTooltip markdown={noSetTooltipMarkdown} placement="right">
                  <span>{iconNode}</span>
                </MarkdownTooltip>
              ) : (
                <WithSetTooltip name={name} displayName={tooltipName} showName>
                  {iconNode}
                </WithSetTooltip>
              )
              const itemKey = `set-icon-${idNum}`
              const menuItem = (
                <MenuItem
                  key={itemKey}
                  value={valueForSet(idNum)}
                  selected={inSelectedSet}
                  disabled={isDisabled}
                  data-set-id={idNum}
                  onClick={(e) => {
                    if (isDisabled) return
                    if (onToggleSet) {
                      // In multi-select contexts we suppress default so the menu stays open.
                      // In single-select, allow default so the Select can close naturally.
                      if (!singleSelect) {
                        e.preventDefault()
                        e.stopPropagation()
                      }
                      try { onToggleSet(idNum) } catch {}
                    }
                  }}
                  onContextMenu={(event) => {
                    if (isDisabled) return
                    if (!onContextMenuSet) return
                    event.preventDefault()
                    event.stopPropagation()
                    onContextMenuSet(idNum, event)
                  }}
                  onDragStart={(e) => { e.preventDefault(); e.stopPropagation() }}
                  sx={(theme) => ({
                    display: 'flex',
                    width: ICON_GRID_ITEM_PX,
                    height: ICON_GRID_ITEM_PX,
                    minHeight: ICON_GRID_ITEM_PX,
                    p: 0,
                    boxSizing: 'content-box',
                    alignItems: 'center',
                    justifyContent: 'center',
                    m: 0,
                    position: 'relative',
                    verticalAlign: 'top',
                    '&.Mui-selected': {
                      // Explicit set selection: render an inset rounded rectangle
                      // fill (not full-tile) using background-clip and padding.
                      backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_ALPHA),
                      backgroundClip: 'content-box',
                      borderRadius: 1,
                      '&:hover': { backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_HOVER_ALPHA) },
                    },
                    // Use default MUI selected background to match metasets.
                    // Inner ring: dashed blue for metaset membership, solid red for exclusions.
                    '&::after': (isExcluded || inSelectedMeta) ? {
                      content: '""',
                      position: 'absolute',
                      // Make the inner ring smaller so it doesn't visually
                      // merge with the outer dashed hover ring.
                      inset: 2,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderStyle: isExcluded ? 'solid' : 'dashed',
                      borderColor: isExcluded ? theme.palette.error.main : theme.palette.primary.main,
                      pointerEvents: 'none',
                    } : undefined,
                    '&::before': inHovered ? {
                      content: '""',
                      position: 'absolute',
                      // Outer dashed ring (slightly larger than the solid ring)
                      inset: 1,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderStyle: 'dotted',
                      borderColor: theme.palette.info.main,
                      pointerEvents: 'none',
                    } : {},
                    ...(isPartialSet ? {
                      borderStyle: 'dashed',
                      borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BORDER_ALPHA.dark : MULTI_EDIT_MIXED_BORDER_ALPHA.light),
                      backgroundImage: `linear-gradient(135deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BG_ALPHA.dark : MULTI_EDIT_MIXED_BG_ALPHA.light)} 50%, transparent 50%)`,
                      color: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_TEXT_ALPHA.dark : MULTI_EDIT_MIXED_TEXT_ALPHA.light),
                    } : {}),
                  })}
                >
                  {iconWithTooltip}
                </MenuItem>
              )
              // Disabled entries need an outer wrapper so the tooltip still fires.
              if (isDisabled) {
                return wrapDisabledTooltip(
                  itemKey,
                  buildDisabledTooltip(tooltipName, { isNoSet }),
                  menuItem,
                )
              }
              return menuItem
            }
            // Icons mode: grid wrapper to keep compact 15-column layout.
            return (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(15, ${ICON_GRID_ITEM_PX}px)`,
                  columnGap: `${ICON_GRID_MARGIN_PX * 2}px`,
                  rowGap: `${ICON_GRID_MARGIN_PX * 2}px`,
                  // Distribute leftover space so the grid doesn't leave a large gap at the right edge.
                  justifyContent: 'space-between',
                  width: '100%',
                }}
                onMouseDown={(e) => {
                  // Prevent stray clicks in gaps from selecting an invalid value
                  if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation() }
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation() }
                }}
              >
                {armorFixed.map(renderIconItem)}
                {armorVar19.length > 0 && (
                  <Box component="li" sx={{ display: 'block', width: '100%', height: 0, m: 0, p: 0, gridColumn: '1 / -1' }} />
                )}
                {armorVar19.map(renderIconItem)}
                {accessories.length > 0 && (
                  <Box component="li" sx={{ display: 'block', width: '100%', height: 0, m: 0, p: 0, gridColumn: '1 / -1' }} />
                )}
                {accessories.map(renderIconItem)}
              </Box>
            )
          })()
      ) : (
        sorted.map(([id, name]) => {
          const idNum = Number(id)
          // No-set accessories keep their own tooltip copy (no set effects available).
          const isNoSet = idNum === ACCESSORY_NO_SET_ID
          const isDisabled = disabledSet.has(idNum)
          // Usage counts + metaset membership are rendered only in list modes.
          const used = setUsageCounts[idNum] || 0
          const metaNames = metasets
            .filter(m => m.sets.includes(idNum) && m.name !== allExplicitMetaId && m.name !== excludeMetasetId && m.show !== false)
            .map(m => m.name)
          const joined = metaNames.join(', ')
          // Hover shows dotted edge for metaset preview.
          const inHovered = hoveredHighlightsAll || Boolean(hoveredMeta && hoveredMeta.sets.includes(idNum))
          // Selected metaset membership renders a blue left bar.
          const inSelectedMeta = selectedHighlightsAll || metasets.some(m => selectedMetaSet.has(m.name) && m.sets.includes(idNum))
          // Tri-state values handle multi-edit mixing.
          const setState = getTriStateForSet(idNum)
          const inSelectedSet = setState === 'all'
          const isPartialSet = setState === 'partial'
          // Exclusions render a red left bar.
          const isExcluded = excludedSet.has(idNum)
          const localizedName = getLocalizedGearSetName(idNum as ArtifactSetId, t, lang)
          const tooltipName = localizedName || name
          // Only show description text inline for enabled items.
          const noSetTooltipMarkdown = isNoSet && !isDisabled
            ? buildNoSetTooltipMarkdown(t, { label: tooltipName })
            : null
          const content = (
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                <SetIcon setId={idNum} label={localizedName || name} size={SET_ICON_PX} />
                <Typography>{localizedName}</Typography>
                {showUsageCounts && (
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('setsUsageInRecipes', { n: used })}</Typography>
                )}
              </Box>
              {metaNames.length > 0 && (
                // Allow the metaset list to wrap — truncating causes a horizontal scrollbar on the parent list.
                <Typography
                  variant="caption"
                  sx={{ color: 'primary.main', opacity: 0.9, display: 'block', width: '100%', whiteSpace: 'normal', overflowWrap: 'break-word' }}
                >
                  {t('setsInNames', { names: joined })}
                </Typography>
              )}
            </Box>
          )
          // Swap the set tooltip for no-set copy when needed.
          const contentWithTooltip = noSetTooltipMarkdown ? (
            <MarkdownTooltip markdown={noSetTooltipMarkdown} placement="right">
              <span>{content}</span>
            </MarkdownTooltip>
          ) : (
            <WithSetTooltip name={name} displayName={tooltipName}>
              {content}
            </WithSetTooltip>
          )
          const itemKey = `set-list-${idNum}`
          const menuItem = (
            <MenuItem
              key={itemKey}
              value={valueForSet(idNum)}
              selected={inSelectedSet}
              disabled={isDisabled}
              data-set-id={idNum}
              onClick={(e) => {
                if (isDisabled) return
                if (onToggleSet) {
                  if (!singleSelect) {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                  try { onToggleSet(idNum) } catch {}
                }
              }}
              onContextMenu={(event) => {
                if (isDisabled) return
                if (!onContextMenuSet) return
                event.preventDefault()
                event.stopPropagation()
                onContextMenuSet(idNum, event)
              }}
              sx={(theme) => ({
                position: 'relative',
                '&.Mui-selected': {
                  backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_ALPHA),
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_HOVER_ALPHA) },
                },
                // Use default MUI selected background to match metasets.
                // Left bar: blue for metaset membership, red for explicit exclusion.
                '&::before': (isExcluded || inSelectedMeta) ? {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '3px',
                  background: isExcluded ? theme.palette.error.main : theme.palette.primary.main,
                } : undefined,
                '&::after': inHovered ? {
                  content: '""',
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '3px',
                  background: 'repeating-linear-gradient( to bottom, '+theme.palette.info.main+' 0 6px, transparent 6px 10px)',
                } : undefined,
                ...(isPartialSet ? {
                  borderStyle: 'dashed',
                  borderColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BORDER_ALPHA.dark : MULTI_EDIT_MIXED_BORDER_ALPHA.light),
                  backgroundImage: `linear-gradient(135deg, ${alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_BG_ALPHA.dark : MULTI_EDIT_MIXED_BG_ALPHA.light)} 50%, transparent 50%)`,
                  color: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? MULTI_EDIT_MIXED_TEXT_ALPHA.dark : MULTI_EDIT_MIXED_TEXT_ALPHA.light),
                } : {}),
              })}
            >
              {contentWithTooltip}
            </MenuItem>
          )
          // Disabled entries need a wrapper tooltip so the hover still triggers.
          if (isDisabled) {
            return wrapDisabledTooltip(
              itemKey,
              buildDisabledTooltip(tooltipName, { isNoSet }),
              menuItem,
            )
          }
          return menuItem
        })
      )}
    </>
  )
}
