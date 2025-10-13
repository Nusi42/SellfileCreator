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
import { Box, ListSubheader, MenuItem, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import EllipsisTooltip from './EllipsisTooltip'
import { SetIcon, SET_ICON_PX } from './SetIcon'
import { WithSetTooltip } from './SetTooltip'
import { LIST_SUBHEADER_SX, MENU_SELECTED_BG_ALPHA, MENU_SELECTED_BG_HOVER_ALPHA, MENU_SCROLL_GUTTER_PX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, MULTI_EDIT_MIXED_BG_ALPHA, MULTI_EDIT_MIXED_BORDER_ALPHA, MULTI_EDIT_MIXED_TEXT_ALPHA } from '../lib/constants'
import { artifactSetDescriptions } from '../lib/setDescriptions'
import type { Metaset } from '../lib/metasets'
import SetsOrderControls from './SetsOrderControls'
import { useI18n } from '../lib/i18n'
import { artifactSetI18nKey } from '../lib/types'

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
  onToggleSet,
  hideHeader = false,
  showUsageCounts = true,
  singleSelect = false,
  triStateForSet,
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
  // Optional: explicit click handler for icon grid items. When provided, we
  // call this on click instead of relying on MUI's internal Select handling.
  // Why: MUI Select can miss clicks on custom compact MenuItem layouts; this
  // ensures clicks always toggle selection without closing the menu.
  onToggleSet?: (id: number) => void
  // When true, do not render the ListSubheader (parent renders its own header
  // outside the scrollable list to keep layout width stable across modes).
  hideHeader?: boolean
  // Show/hide "x use(s) in configs)" helper in list modes
  showUsageCounts?: boolean
  // Single-select mode hints the handler not to prevent default, so the Select closes naturally.
  singleSelect?: boolean
  triStateForSet?: (id: number) => 'none' | 'partial' | 'all'
}) {
  const { t } = useI18n()
  const hovered = hoveredMetasetId
  const selectedSets = new Set(selectedSetIds)
  const selectedMetaSet = new Set(_selectedMetasetIds)
  const hoveredMeta = hovered && hovered !== allExplicitMetaId
    ? metasets.find(m => m.id === hovered) || null
    : null
  const hoveredHighlightsAll = Boolean(hovered && hovered === allExplicitMetaId)
  const selectedHighlightsAll = Boolean(allExplicitMetaId && selectedMetaSet.has(allExplicitMetaId))
  const getTriStateForSet = triStateForSet ?? ((id: number) => (selectedSets.has(id) ? 'all' : 'none'))

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
            // Split by piece count from set descriptions to avoid magic ID thresholds.
            // Accessories are 1‑piece; regular armor sets are 2‑ or 4‑piece; variable sets are anything not 1/2/4 (e.g., "1–9").
            const isOne = (name: string) => artifactSetDescriptions[name]?.pieces === 1
            const isTwo = (name: string) => artifactSetDescriptions[name]?.pieces === 2
            const isFour = (name: string) => artifactSetDescriptions[name]?.pieces === 4
            const accessories = sorted.filter(([, name]) => isOne(name))
            // Fixed armor: exactly 2 or 4 pieces
            const armorFixed = sorted.filter(([, name]) => isTwo(name) || isFour(name))
            // Variable piece sets (not 1,2,4). Covers "1–9" and any future variants.
            const armorVar19 = sorted.filter(([, name]) => !(isOne(name) || isTwo(name) || isFour(name)))
            const renderIconItem = ([id, name]: [string, string]) => {
              const idNum = Number(id)
              const localizedName = t(artifactSetI18nKey(idNum))
              const tooltipName = localizedName || name
              const inHovered = hoveredHighlightsAll || Boolean(hoveredMeta && hoveredMeta.sets.includes(idNum))
              const inSelectedMeta = selectedHighlightsAll || metasets.some(m => selectedMetaSet.has(m.id) && m.sets.includes(idNum))
              const setState = getTriStateForSet(idNum)
              const inSelectedSet = setState === 'all'
              const isPartialSet = setState === 'partial'
              // Name line rendered by WithSetTooltip (showName), so no local piece text needed
              return (
                <MenuItem
                  key={id}
                  value={valueForSet(idNum)}
                  selected={inSelectedSet}
              onClick={(e) => {
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
                    // Thin blue outline (inner ring) for membership via selected metaset(s).
                    '&::after': (inSelectedMeta) ? {
                      content: '""',
                      position: 'absolute',
                      // Make the inner ring smaller so it doesn't visually
                      // merge with the outer dashed hover ring.
                      inset: 2,
                      borderRadius: 5,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: theme.palette.primary.main,
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
                  <WithSetTooltip name={name} displayName={tooltipName} showName>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <SetIcon name={name} size={ICON_GRID_ICON_PX} sx={{ mr: 0 }} />
                    </Box>
                  </WithSetTooltip>
                </MenuItem>
              )
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
          const used = setUsageCounts[idNum] || 0
          const metaNames = metasets
            .filter(m => m.sets.includes(idNum) && m.id !== allExplicitMetaId && m.id !== excludeMetasetId && m.show !== false)
            .map(m => m.name)
          const joined = metaNames.join(', ')
          const inHovered = hoveredHighlightsAll || Boolean(hoveredMeta && hoveredMeta.sets.includes(idNum))
          const inSelectedMeta = selectedHighlightsAll || metasets.some(m => selectedMetaSet.has(m.id) && m.sets.includes(idNum))
          const setState = getTriStateForSet(idNum)
          const inSelectedSet = setState === 'all'
          const isPartialSet = setState === 'partial'
          const localizedName = t(artifactSetI18nKey(idNum))
          const tooltipName = localizedName || name
          return (
            <MenuItem
              key={id}
              value={valueForSet(idNum)}
              selected={inSelectedSet}
              onClick={(e) => {
                if (onToggleSet) {
                  if (!singleSelect) {
                    e.preventDefault()
                    e.stopPropagation()
                  }
                  try { onToggleSet(idNum) } catch {}
                }
              }}
              sx={(theme) => ({
                position: 'relative',
                '&.Mui-selected': {
                  backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_ALPHA),
                  '&:hover': { backgroundColor: alpha(theme.palette.primary.main, MENU_SELECTED_BG_HOVER_ALPHA) },
                },
                // Use default MUI selected background to match metasets.
                // Remove selection/meta borders; keep a subtle dashed marker only while hovering a metaset
                // Add a thin blue indicator on the left when the set belongs to a selected metaset (but is not explicitly selected)
                '&::before': (inSelectedMeta) ? {
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: '3px',
                  background: theme.palette.primary.main,
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
              <WithSetTooltip name={name} displayName={tooltipName}>
                <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    <SetIcon name={name} size={SET_ICON_PX} />
                    <Typography>{localizedName}</Typography>
                    {showUsageCounts && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('setsUsageInConfigs', { n: used })}</Typography>
                    )}
                  </Box>
                  {metaNames.length > 0 && (
                    <EllipsisTooltip title={joined} selector=".MuiTypography-caption">
                      <Typography
                        variant="caption"
                        sx={{ color: 'primary.main', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', width: '100%' }}
                      >
                        {t('setsInNames', { names: joined })}
                      </Typography>
                    </EllipsisTooltip>
                  )}
                </Box>
              </WithSetTooltip>
            </MenuItem>
          )
        })
      )}
    </>
  )
}
