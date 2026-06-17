import { Box, Button, Chip, Collapse, Divider, FormControl, FormLabel, IconButton, InputAdornment, ListSubheader, MenuItem, Select, SelectChangeEvent, Slider, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography, Popover } from '@mui/material'
import { useI18n } from '../lib/i18n'
import SetMenuSection from './SetMenuSection'
import SetsOrderControls from './SetsOrderControls'
import { artifactTypeIconFor } from './artifactTypeIcons'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import SettingsIcon from '@mui/icons-material/Settings'
import EllipsisTooltip from './EllipsisTooltip'
import MarkdownTooltip from './MarkdownTooltip'
import SplitLabelValueButton from './SplitLabelValueButton'
import {
  artifactSetName,
  PREFERRED_ARTIFACT_TYPE_ORDER,
  StatVariant,
  labelOfVariant,
  Faction,
  type FactionId,
  type ArtifactSetId,
  filterAndSortSetEntries,
  statVariantI18nKey,
  factionI18nKey,
  LEVEL_MILESTONES,
  type LevelMilestone,
  type RankValue,
  STAT_VARIANTS_PRIORITY,
  STAT_VARIANTS_PRIORITY_ROW1,
  STAT_VARIANTS_PRIORITY_ROW2,
  DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT,
  getLocalizedGearSetName,
} from '../lib/types'
import { LIST_SUBHEADER_SX, MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, MENU_MAX_HEIGHT_METASETS_PX, MENU_MAX_HEIGHT_SETS_LIST_PX, MENU_SCROLL_GUTTER_PX, SETS_MENU_WIDTH_PX, FILTER_FACTION_SELECT_WIDTH_PX, FILTER_SETS_SELECT_WIDTH_PX, FILTER_CHIP_TOP_MARGIN, ELLIPSIS_TEXT_SX, FILTER_TOGGLE_BUTTON_WIDTH_PX, SMALL_BUTTON_HEIGHT_PX, BUILDER_STATUS_CHIP_HEIGHT_PX, SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX, SETS_SELECT_INLINE_GUTTER_PX, STATUS_CHIP_BORDER_RADIUS_PX, FONT_SIZE_BASE_PX, CLEAR_ICON_BUTTON_SIZE_PX, GLYPH_TOGGLE_ON, GLYPH_TOGGLE_OFF, GLYPH_GLYPHS_SELECTED, ROLL_BADGE_SIZE_PX, ROLL_BADGE_SCALE, ROLL_BADGE_HOVER_GUTTER_PX, CHAMPION_ICON_BASE_SIZE, CHAMPION_ICON_BORDER_RADIUS_PX } from '../lib/constants'
import { APP_CSS_VAR } from '../lib/themeCustomTokens'
import { reserveScrollbarGutterSpace, visibleScrollbarTrack } from '../lib/scrollbar'
import { metasetGlyph, orderMetasets, resolveMetasets, type Metaset } from '../lib/metasets'
import { buildArtifactSetSelectionKey, normalizeArtifactSetSelections, pruneAccessoryNoSetSelections, splitArtifactSetSelections } from '../lib/gearSets/selection'
import { isAccessorySlot, slotSelectionAllowsAccessories } from '../lib/gearInspectorDomain'
import React from 'react'
import { flushSync } from 'react-dom'
import { useTheme } from '@mui/material/styles'
import type { SxProps, Theme } from '@mui/material/styles'
import type { SystemStyleObject } from '@mui/system'
import { keyframes } from '@emotion/react'
import { useGearSetCatalogVersion } from '../hooks/useGearSetCatalogVersion'
import { RULES_FILTER_COLLAPSIBLE_SECTION_IDS } from '../state/rulesFilterPersistence'
import type { CollapsedSections } from '../state/rulesFilterPersistence'
import {
  DEFAULT_RULES_FILTER_STATE,
  GEAR_INSPECTOR_LEVEL_MAX,
  GEAR_INSPECTOR_LEVEL_MIN,
  GEAR_INSPECTOR_ROLL_COUNT_VALUES,
  GEAR_INSPECTOR_LAST_USE_MAX_DAYS,
  GEAR_INSPECTOR_LAST_USE_MIN_DAYS,
  createDefaultGearInspectorLastUseCustom,
  createDefaultGearInspectorLastUseFilter,
  createDefaultGearInspectorRollsState,
  isGearInspectorRollFilterActive,
  normalizeGearInspectorLastUseFilter,
  normalizeGearInspectorRollCountSelection,
  resolveGearInspectorLevelRange,
  sanitizeRulesFilterState,
  type AnyMode,
  type Bool3,
  type RulesFilterState,
  type GearInspectorChaosFilterMode,
  type GearInspectorGlyphFilterMode,
  type GearInspectorLastUsePreset,
  type GearInspectorLastUseCustomFilter,
  type GearInspectorRollCountSet,
  type GearInspectorRollCountValue,
  type GearInspectorRollFilterRow,
  type GearInspectorRollFilterState,
  type GearInspectorRollWildcardMode,
  type GearInspectorSourceFilter,
  toggleGearInspectorLastUsePresetSelection,
} from '../lib/rulesFilter'
import { FactionOptionLabel } from './FactionIcon'
import InlineSelectClearButton from './InlineSelectClearButton'
import InlineSelectExtraBadge from './InlineSelectExtraBadge'
import SelectDropdownActivator from './SelectDropdownActivator'
import ClearIconButton from './ClearIconButton'
import ClearIcon from '@mui/icons-material/Clear'
import ContextMenuPaper, { buildContextMenuPaperSlotProps } from './ContextMenuPaper'
import ContextMenuTitle from './ContextMenuTitle'
import { useContextMenuPaperGuard } from '../hooks/useContextMenuPaperGuard'
import { useSetsOrderPreference } from '../state/setsOrderPreference'
import { GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT, type GearInspectorRecipeFilterMode } from '../types/gearInspectorRecipeFilterMode'
import type { ChampionLocation } from '../lib/importers/gearDbNormalizer'
import type { SubstatColorMap } from '../lib/renderColoredStatText'
import { computeInlineSelectContentMaxWidth, computeInlineSelectPadding } from '../lib/inlineSelectAffordances'
import { championIconUrl } from '../lib/iconMaps/championIconMap'
import { resolveRarityAccentColor } from '../lib/rarityColors'
import { TINT } from '../lib/colorTints'
import { useSubstatFgAdapter } from '../lib/themeContrastHooks'

// Filter options bundle metadata for consistent champion icons + rarity borders.
type GearInspectorChampionOption = {
  id: number
  baseId: number | null
  rarity: RankValue | null
  name: string | null
  location: ChampionLocation | null
  count: number
}

const NARROW_NO_BREAK_SPACE = '\u202F'
const GLYPH_GTE_ZERO = `≥${NARROW_NO_BREAK_SPACE}0`
const GLYPH_GTE_ONE = `≥${NARROW_NO_BREAK_SPACE}1`
const GLYPH_ALL = '∞'
const GLYPH_ONLY = '≡'
const GLYPH_NOT_REROLLED = 'Ø'
const GLYPH_REROLLED = '⟳'
const GLYPH_GLYPHS_ON = GLYPH_TOGGLE_ON
const GLYPH_GLYPHS_OFF = GLYPH_TOGGLE_OFF
const ROLL_FILTER_LABEL_MIN_WIDTH_PX = 72
const CLEAR_BUTTON_PLACEHOLDER_SX = {
  width: CLEAR_ICON_BUTTON_SIZE_PX,
  height: CLEAR_ICON_BUTTON_SIZE_PX,
  flexShrink: 0,
} as const
const CHAMPION_SELECT_WIDTH_PX = 160
// Champion names can run long; give the dropdown menu extra width without stretching the closed control.
const CHAMPION_MENU_WIDTH_PX = Math.round(FILTER_FACTION_SELECT_WIDTH_PX * 1.35)
const LAST_USE_TOGGLE_BUTTON_WIDTH_PX = FILTER_TOGGLE_BUTTON_WIDTH_PX / 2
// Clamp the header width to the three-button grid so labels never exceed the controls.
const LAST_USE_SECTION_WIDTH_PX = (LAST_USE_TOGGLE_BUTTON_WIDTH_PX * 3) + 8

type GlyphLegendEntry = {
  glyph: string
  label: string
}

function renderGlyphTooltip(description: string, entries: GlyphLegendEntry[]): string {
  const details = entries.map(({ glyph, label }) => `- ${glyph} = ${label}`)
  return [description, ...details].join('\n')
}

export type RulesFilterPanelHandle = {
  focusRecipeNameInput: (options?: { selectText?: boolean }) => boolean
}

type RulesFilterPanelProps = {
  mode?: 'rules' | 'gearInspector'
  state: RulesFilterState
  onChange: (next: RulesFilterState) => void
  metasets: Metaset[]
  showFaction: boolean
  recipeChipFilterActive: boolean
  onRecipeChipFilterChange: (value: boolean) => void
  gearInspectorRecipeFilterMode?: GearInspectorRecipeFilterMode
  onGearInspectorRecipeFilterModeChange?: (mode: GearInspectorRecipeFilterMode) => void
  recipeCount?: number
  builderMode?: 'recipe' | 'safeguard'
  collapsed: CollapsedSections
  onCollapsedChange: (next: CollapsedSections) => void
  gearInspectorChampionOptions?: GearInspectorChampionOption[]
  substatColors?: SubstatColorMap
  useStatButtonColors?: boolean
  hasManualGearInspectorItems?: boolean
}

const STAT_VARIANT_ORDER_LOOKUP = new Map<number, number>(
  STAT_VARIANTS_PRIORITY.map((variant, index) => [Number(variant), index]),
)

const STAT_ROW_SET_CACHE = new WeakMap<readonly StatVariant[], Set<number>>()

function getStatRowSet(row: readonly StatVariant[]): Set<number> {
  const cached = STAT_ROW_SET_CACHE.get(row)
  if (cached) return cached
  const next = new Set(row.map((variant) => Number(variant)))
  STAT_ROW_SET_CACHE.set(row, next)
  return next
}

function filterRowSelection(
  selected: readonly StatVariant[],
  row: readonly StatVariant[],
): string[] {
  const rowSet = getStatRowSet(row)
  return selected.filter((variant) => rowSet.has(Number(variant))).map((variant) => String(variant))
}

function mergeRowSelection(
  current: readonly StatVariant[],
  row: readonly StatVariant[],
  nextValues: readonly string[],
): StatVariant[] {
  const rowSet = getStatRowSet(row)
  const filtered = current.filter((variant) => !rowSet.has(Number(variant)))
  const merged = nextValues
    .map((value) => Number(value) as StatVariant)
    .filter((variant) => rowSet.has(Number(variant)))
  return [...filtered, ...merged].sort((a, b) => {
    const left = STAT_VARIANT_ORDER_LOOKUP.get(Number(a)) ?? 0
    const right = STAT_VARIANT_ORDER_LOOKUP.get(Number(b)) ?? 0
    return left - right
  })
}

function sortVariantsInUiOrder(variants: readonly StatVariant[]): StatVariant[] {
  // Keep selection arrays stable so persisted filter state remains deterministic.
  // The UI uses STAT_VARIANTS_PRIORITY ordering, so mirror that here.
  return [...variants].sort((a, b) => {
    const left = STAT_VARIANT_ORDER_LOOKUP.get(Number(a)) ?? 0
    const right = STAT_VARIANT_ORDER_LOOKUP.get(Number(b)) ?? 0
    return left - right
  })
}

function toggleVariantOff(
  selected: readonly StatVariant[] | null | undefined,
  variant: StatVariant,
): StatVariant[] {
  // Removing is always safe; return a canonical ordering either way.
  const base = Array.isArray(selected) ? selected : []
  return sortVariantsInUiOrder(base.filter((v) => Number(v) !== Number(variant)))
}

function toggleVariantOn(
  selected: readonly StatVariant[] | null | undefined,
  variant: StatVariant,
): StatVariant[] {
  // Add only if missing so we never persist duplicates.
  const base = Array.isArray(selected) ? selected : []
  if (base.some((v) => Number(v) === Number(variant))) return sortVariantsInUiOrder(base)
  return sortVariantsInUiOrder([...base, variant])
}

const SUBSTAT_NOT_LABEL_SX: SxProps<Theme> = {
  // Draw a diagonal strike on the label to indicate "must not have".
  position: 'relative',
  display: 'inline-block',
  // Rising diagonal (left-bottom -> right-top).
  '&::after': {
    content: '""',
    position: 'absolute',
    left: '-8%',
    right: '-8%',
    top: '60%',
    height: '2px',
    backgroundColor: 'currentColor',
    opacity: 0.9,
    transform: 'translateY(-50%) rotate(-20deg)',
    transformOrigin: 'center',
    pointerEvents: 'none',
  },
}

const toggleBorderColor = (theme: Theme) => theme.vars?.palette.divider ?? theme.palette.divider
// Grid-based toggle groups rely on real spacing, so restore each chip's outline.
// Narrowed to a single theme callback so the value is safe inside `sx` arrays.
type SxCallback = (theme: Theme) => SystemStyleObject<Theme>
const GRID_TOGGLE_BUTTON_GROUP_SX: SxCallback = (theme) => {
  const borderColor = toggleBorderColor(theme)
  const borderRadius = `${theme.shape.borderRadius}px`
  return {
    '& .MuiToggleButtonGroup-grouped': {
      margin: '0 !important',
      borderRadius,
      borderColor,
    },
    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
      marginLeft: '0 !important',
      borderLeft: `1px solid ${borderColor}`,
    },
  }
}
// Segmented toggles sit flush; keep the fused seam while matching the neutral border color.
const SEGMENTED_TOGGLE_BUTTON_GROUP_SX: SxCallback = (theme) => {
  const borderColor = toggleBorderColor(theme)
  const borderRadius = `${theme.shape.borderRadius}px`
  return {
    display: 'inline-flex',
    columnGap: 0.5,
    rowGap: 0,
    '& .MuiToggleButtonGroup-grouped': {
      margin: '0 !important',
      borderRadius,
      borderColor,
    },
    '& .MuiToggleButtonGroup-grouped:not(:first-of-type)': {
      marginLeft: '0 !important',
      borderLeft: `1px solid ${borderColor}`,
    },
  }
}

const buildToggleGridSx = (
  _columns: number,
  options?: { minWidth?: number; height?: number },
): SxProps<Theme> => {
  const minWidth = options?.minWidth
  const height = options?.height ?? 28
  return [
    {
      // Auto-size to content at normal widths; cap at 100% when the panel is narrowed by the splitter.
      display: 'flex',
      width: 'fit-content',
      maxWidth: '100%',
      // Buttons shrink in-place instead of wrapping to new rows when the panel is constrained.
      flexWrap: 'nowrap',
      overflow: 'hidden',
      columnGap: 0.5,
      '& .MuiToggleButton-root': {
        p: 0.5,
        // Preserve natural content width normally; flex-shrink kicks in only under constraint.
        flex: '0 1 auto',
        minWidth: minWidth ?? 0,
        overflow: 'hidden',
        height,
      },
    },
    GRID_TOGGLE_BUTTON_GROUP_SX,
  ]
}

const collapsibleSectionSx = {
  flex: { xs: '1 1 100%', sm: '0 0 auto' },
  width: { xs: '100%', sm: 'auto' },
  maxWidth: '100%',
  minWidth: 0,
  alignSelf: 'flex-start',
} as const

// Shared header layout keeps toggles + titles inside the same width budget to avoid divergent clipping.
const sectionHeaderBaseSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.5,
  mb: 0.5,
  minWidth: 0,
  maxWidth: '100%',
  flexWrap: 'nowrap',
} as const

// Labels render as block ellipsis targets so SectionHeaderLabel can consistently detect overflow.
const sectionHeaderLabelSx = {
  m: 0,
  minWidth: 0,
  flex: '0 1 auto',
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
} as const

const sectionHeaderLabelTextSx = {
  display: 'block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const

const SectionHeaderLabel = ({
  label,
  highlight,
  onClick,
  onContextMenu,
}: {
  label: string
  highlight?: boolean
  onClick?: () => void
  onContextMenu?: (event: React.MouseEvent) => void
}) => (
  <EllipsisTooltip title={label} wrap="block">
    {/* onClick/onContextMenu: clicking the label mirrors the toggle icon — left-click toggles one, right-click toggles all. */}
    <FormLabel sx={onClick ? [sectionHeaderLabelSx, { cursor: 'pointer' }] : sectionHeaderLabelSx} onClick={onClick} onContextMenu={onContextMenu}>
      {/* highlight: primary color signals the section has an active selection while collapsed. */}
      <Box component="span" data-ellipsis-target sx={highlight ? [sectionHeaderLabelTextSx, { color: 'primary.main' }] : sectionHeaderLabelTextSx}>
        {label}
      </Box>
    </FormLabel>
  </EllipsisTooltip>
)

// Module-level toggle for filter panel collapsible sections.
// Single-click toggles one section; Ctrl/Cmd-click or right-click toggles all at once.
type FilterSectionToggleProps = {
  id: keyof CollapsedSections
  collapsed: CollapsedSections
  // onToggle: shared toggle callback from FilterSectionHeader; avoids duplicating the logic here.
  onToggle: (applyToAll: boolean) => void
}

const FilterSectionToggle: React.FC<FilterSectionToggleProps> = ({ id, collapsed, onToggle }) => {
  const { t } = useI18n()
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Guard against right-button synthetic clicks that some browser/OS combinations fire
    // after a contextmenu event — those are handled exclusively by handleContextMenu.
    if (event.button !== 0) return
    const multiToggle = event.ctrlKey || event.metaKey
    onToggle(multiToggle)
  }
  const handleContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    // flushSync ensures React processes the store update synchronously before the browser's
    // native contextmenu handling can defer or interrupt the scheduled re-render.
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- contextmenu events can stall React's render cycle; synchronous flush ensures the collapse state is visible immediately.
    flushSync(() => onToggle(true))
  }
  return (
    // Tooltip surfaces the right-click hint so users discover the toggle-all gesture.
    <MarkdownTooltip markdown={t('rulesFilterSectionToggleTooltip')}>
      <IconButton
        size="small"
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        aria-label={collapsed[id] ? 'Expand' : 'Collapse'}
      >
        {collapsed[id] ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
      </IconButton>
    </MarkdownTooltip>
  )
}

// Module-level section header that pairs the toggle with an ellipsized label.
type FilterSectionHeaderProps = {
  id: keyof CollapsedSections
  label: string
  // dirty: true when the section has a non-default selection; highlights the label when collapsed.
  dirty?: boolean
  actions?: React.ReactNode
  fullWidth?: boolean
  maxWidth?: number | string
  collapsed: CollapsedSections
  onCollapsedChange: (next: CollapsedSections) => void
}

const FilterSectionHeader: React.FC<FilterSectionHeaderProps> = ({
  id,
  label,
  dirty,
  actions,
  fullWidth = true,
  maxWidth,
  collapsed,
  onCollapsedChange,
}) => {
  const resolvedMax = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth
  // Highlight the label when the section is collapsed and has a non-default selection,
  // so the color acts as a secondary signal alongside the X-clear button.
  const highlight = !!dirty && !!collapsed[id]
  // Single source of truth for toggle logic shared by the icon button and the label.
  const toggleSections = (applyToAll: boolean) => {
    const nextValue = !collapsed[id]
    if (applyToAll) {
      const nextAll: CollapsedSections = { ...collapsed }
      for (const key of RULES_FILTER_COLLAPSIBLE_SECTION_IDS) {
        nextAll[key] = nextValue
      }
      onCollapsedChange(nextAll)
      return
    }
    onCollapsedChange({ ...collapsed, [id]: nextValue })
  }
  const handleLabelContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- matches the icon button's contextmenu flush to keep collapse state visible immediately.
    flushSync(() => toggleSections(true))
  }
  return (
    <Box
      sx={{
        ...sectionHeaderBaseSx,
        width: fullWidth ? '100%' : resolvedMax ?? 'fit-content',
        maxWidth: fullWidth ? '100%' : resolvedMax ?? '100%',
      }}
    >
      <FilterSectionToggle id={id} collapsed={collapsed} onToggle={toggleSections} />
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.25,
          minWidth: 0,
          flex: '0 1 auto',
        }}
      >
        <SectionHeaderLabel label={label} highlight={highlight} onClick={() => toggleSections(false)} onContextMenu={handleLabelContextMenu} />
        {actions ? (
          <Box sx={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
            {actions}
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

const ZERO_RESULTS_PULSE = keyframes`
  0%, 100% { background-color: transparent; }
  60% { background-color: ${TINT.dangerFlashPeak}; }
`

const EMPTY_ROLL_ROWS: readonly GearInspectorRollFilterRow[] = []
const ROLL_COUNT_LABELS: Record<GearInspectorRollCountValue, string> = {
  0: GLYPH_NOT_REROLLED,
  1: '1',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
}

const ROLL_COUNT_TOGGLE_SIZE_PX = Math.round(ROLL_BADGE_SIZE_PX * ROLL_BADGE_SCALE)

const rollCountToggleGroupSx: SxProps<Theme> = (theme) => {
  const highlight = (theme.vars?.palette.success.main ?? theme.palette.success.main)
  const selectedText = (theme.vars?.palette.common.white ?? theme.palette.common.white)
  const baseBorder = TINT.neutralBorderStrong
  const hoverGlow = TINT.neutralHoverGlow
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${GEAR_INSPECTOR_ROLL_COUNT_VALUES.length}, ${ROLL_COUNT_TOGGLE_SIZE_PX}px)`,
    columnGap: `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
    rowGap: `${ROLL_BADGE_HOVER_GUTTER_PX}px`,
    '& .MuiToggleButtonGroup-grouped': {
      margin: '0 !important',
      borderRadius: '50% !important',
    },
    '& .MuiToggleButton-root': {
      minWidth: ROLL_COUNT_TOGGLE_SIZE_PX,
      width: ROLL_COUNT_TOGGLE_SIZE_PX,
      height: ROLL_COUNT_TOGGLE_SIZE_PX,
      px: 0,
      borderRadius: '50%',
      border: `1px solid ${baseBorder}`,
      color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
      backgroundColor: 'transparent',
      clipPath: 'circle(50% at 50% 50%)',
      transition: 'background-color .15s, border-color .15s, color .15s, box-shadow .15s',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: theme.typography.fontWeightMedium ?? 600,
      fontSize: theme.typography.pxToRem(13),
      lineHeight: 1,
    },
    '& .MuiToggleButton-root:hover': {
      boxShadow: `0 0 0 1px ${hoverGlow}`,
      backgroundColor: (theme.vars?.palette.action.hover ?? theme.palette.action.hover),
      borderColor: baseBorder,
    },
    '& .MuiToggleButton-root.Mui-selected': {
      color: selectedText,
      backgroundColor: highlight,
      borderColor: highlight,
      boxShadow: `0 0 0 1px ${highlight}`,
    },
    '& .MuiToggleButton-root.Mui-selected:hover': {
      backgroundColor: highlight,
      borderColor: highlight,
      boxShadow: `0 0 0 1px ${highlight}`,
    },
  }
}

const sortGearInspectorRollRows = (rows: readonly GearInspectorRollFilterRow[]): GearInspectorRollFilterRow[] => (
  [...rows].sort((a, b) => {
    const left = STAT_VARIANT_ORDER_LOOKUP.get(Number(a.stat)) ?? 0
    const right = STAT_VARIANT_ORDER_LOOKUP.get(Number(b.stat)) ?? 0
    return left - right
  })
)

const summarizeRollCounts = (counts: GearInspectorRollCountSet): string => {
  if (!counts || counts.length === 0) return ''
  return `{${counts.map((value) => ROLL_COUNT_LABELS[value]).join(', ')}}`
}
const EMPTY_GEAR_INSPECTOR_ROLL_COUNT_SET: GearInspectorRollCountSet = []
const rollSetCoversAllCounts = (counts: GearInspectorRollCountSet): boolean => {
  if (counts.length !== GEAR_INSPECTOR_ROLL_COUNT_VALUES.length) return false
  return GEAR_INSPECTOR_ROLL_COUNT_VALUES.every((value, index) => counts[index] === value)
}

// UI-only component that lets users filter the preview table. View-only; export ignores filters.
// React 19: ref passed as a regular prop instead of forwardRef.
function RulesFilterPanel({
    mode = 'rules',
    state: rawState,
    onChange,
    metasets,
    showFaction,
  recipeChipFilterActive,
  onRecipeChipFilterChange,
  gearInspectorRecipeFilterMode = GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT,
  onGearInspectorRecipeFilterModeChange,
  recipeCount = 0,
  builderMode = 'recipe',
  collapsed,
  onCollapsedChange,
    gearInspectorChampionOptions = [],
    substatColors,
    useStatButtonColors = false,
    hasManualGearInspectorItems = false,
    ref,
  }: RulesFilterPanelProps & { ref?: React.Ref<RulesFilterPanelHandle> },
): React.JSX.Element {
  // Why: persisted filter state can be partially-written or come from older builds; sanitize once per render
  // so the panel never crashes while computing `.length`/`.map` on required nested arrays.
  const state = React.useMemo(() => sanitizeRulesFilterState(rawState as unknown), [rawState])
  const isGearInspectorMode = mode === 'gearInspector'
  const { t, lang } = useI18n()
  useGearSetCatalogVersion()
  const theme = useTheme()
  // Contrast-correct colored roll-filter stat labels for the active scheme's surface.
  const adaptStatFg = useSubstatFgAdapter()
  const gearInspectorRollsState: GearInspectorRollFilterState = state.gearInspectorRolls ?? DEFAULT_RULES_FILTER_STATE.gearInspectorRolls ?? createDefaultGearInspectorRollsState()
  const gearInspectorRollsActive = isGearInspectorRollFilterActive(state.gearInspectorRolls)
  const [gearInspectorRollsAnchorEl, setGearInspectorRollsAnchorEl] = React.useState<HTMLElement | null>(null)
  const gearInspectorRollsPaperRef = React.useRef<HTMLDivElement | null>(null)
  const gearInspectorRollsOpen = Boolean(gearInspectorRollsAnchorEl)
  const handleGearInspectorRollsClose = React.useCallback(() => {
    setGearInspectorRollsAnchorEl(null)
  }, [])
  // Guard the Gear Inspector rolls popover so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: gearInspectorRollsGuard } = useContextMenuPaperGuard({
    open: gearInspectorRollsOpen,
    onClose: handleGearInspectorRollsClose,
    menuRef: gearInspectorRollsPaperRef,
  })
  const [lastUseAnchorEl, setLastUseAnchorEl] = React.useState<HTMLElement | null>(null)
  const lastUsePopoverPaperRef = React.useRef<HTMLDivElement | null>(null)
  const lastUsePopoverOpen = Boolean(lastUseAnchorEl)
  const handleLastUsePopoverClose = React.useCallback(() => {
    setLastUseAnchorEl(null)
  }, [])
  // Guard the last-used popover so outside clicks cannot leave a stuck overlay.
  const { contextMenuGuard: lastUsePopoverGuard } = useContextMenuPaperGuard({
    open: lastUsePopoverOpen,
    onClose: handleLastUsePopoverClose,
    menuRef: lastUsePopoverPaperRef,
  })
  const improvChanceMin = state.gearInspectorImprovementChance?.min ?? 0
  const improvChanceMax = state.gearInspectorImprovementChance?.max ?? 100
  const improvChanceIncludeUnassessed = state.gearInspectorImprovementChance?.includeUnassessed !== false
  const handleImprovChanceSliderChange = React.useCallback((_e: Event, value: number | number[]) => {
    const [nextMin, nextMax] = Array.isArray(value) ? value as [number, number] : [value, value]
    const isDefault = nextMin === 0 && nextMax === 100
    const ic = state.gearInspectorImprovementChance ?? DEFAULT_RULES_FILTER_STATE.gearInspectorImprovementChance!
    // When range changes from default, automatically exclude unassessed items so the filter is meaningful.
    const includeUnassessed = isDefault ? ic.includeUnassessed : false
    onChange({ ...state, gearInspectorImprovementChance: { min: nextMin, max: nextMax, includeUnassessed } })
  }, [onChange, state])
  const rollFilterStatOptions = React.useMemo(() => STAT_VARIANTS_PRIORITY.slice(), [])
  // Persisted Sets order + local search to mirror Builder UX
  const [setsOrder, setSetsOrder] = useSetsOrderPreference()
  const [setsSearch, setSetsSearch] = React.useState('')
  const recipeNameQuery = state.recipeName?.query ?? ''
  // Keep the header layout stable: the Recipe Name filter always renders so the action buttons stay left-aligned,
  // even when there are zero recipes (or recipes without names) loaded yet.
  const hasRecipes = recipeCount > 0
  const recipeNameInputRef = React.useRef<HTMLInputElement | null>(null)
  const recipeNameRegexError = React.useMemo(() => {
    if (!recipeNameQuery) return false
    try {
      void new RegExp(recipeNameQuery, 'i')
      return false
    } catch {
      return true
    }
  }, [recipeNameQuery])
  const handleRecipeNameChange = React.useCallback((value: string) => {
    onChange({ ...state, recipeName: { query: value } })
  }, [onChange, state])
  const topHeaderRef = React.useRef<HTMLDivElement | null>(null)
  const focusRecipeNameInput = React.useCallback((options?: { selectText?: boolean }) => {
    // Why: the recipe name field always renders now, so we only guard on the input being mounted and visible.
    const input = recipeNameInputRef.current
    if (!input) return false
    if (input.offsetParent === null) return false
    const selectText = options?.selectText ?? true
    const run = () => {
      try {
        input.focus()
        if (selectText) {
          input.select()
        } else {
          const { value } = input
          input.setSelectionRange(value.length, value.length)
        }
      } catch {}
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(run)
    } else {
      run()
    }
    return true
  }, [])

  React.useImperativeHandle(ref, () => ({
    focusRecipeNameInput,
  }), [focusRecipeNameInput])
  const [headerMaxHeight, setHeaderMaxHeight] = React.useState(0)
  // Ref-based setter so the layout effect measurement avoids the set-state-in-effect lint rule.
  const setHeaderMaxHeightRef = React.useRef(setHeaderMaxHeight)
  React.useEffect(() => { setHeaderMaxHeightRef.current = setHeaderMaxHeight }, [setHeaderMaxHeight])
  React.useLayoutEffect(() => {
    const el = topHeaderRef.current
    if (!el) return
    const height = el.offsetHeight
    setHeaderMaxHeightRef.current(prev => (height > prev ? height : prev || height))
  }, [recipeNameQuery])
  // Snapshot of slot selection taken at the start of a double-click (before click1 modifies state).
  // React flushes state between click1 and dblclick, so onDoubleClick must use this ref rather
  // than the potentially-stale selectedSlots closure to correctly determine "were all selected?".
  const slotPreDoubleClickRef = React.useRef<number[]>(state.slots.selected.map(Number))
  const setsSelectContainerRef = React.useRef<HTMLDivElement | null>(null)
  const setsMenuListRef = React.useRef<HTMLUListElement | null>(null)
  const setsMetasetsMenuListRef = React.useRef<HTMLUListElement | null>(null)
  const [setsMenuOpen, setSetsMenuOpen] = React.useState(false)
  // Collapsible sections: persisted per user; default to collapsed to reduce scroll noise.
  // Per-section condensed toggles (persisted)
  // Rank/Rarity are always condensed now (More/Less removed)
  const tintedChipSx = React.useCallback((paletteKey: 'success' | 'warning' | 'info' | 'error' | 'secondary') => {
    const borderRadius = `${STATUS_CHIP_BORDER_RADIUS_PX}px`
    const palVar = theme.vars?.palette[paletteKey]
    const palRaw = theme.palette[paletteKey]
    return {
      height: BUILDER_STATUS_CHIP_HEIGHT_PX,
      minHeight: BUILDER_STATUS_CHIP_HEIGHT_PX,
      fontWeight: theme.typography.fontWeightMedium ?? 500,
      px: 0,
      borderRadius,
      overflow: 'hidden',
      backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / var(${APP_CSS_VAR.tintedChipBgAlpha}))`,
      // Light mode base: darker tone for contrast on light backgrounds.
      color: palVar?.dark ?? palRaw.dark,
      '& .MuiChip-icon': { color: palVar?.dark ?? palRaw.dark },
      // Dark mode: lighter tint for contrast on dark backgrounds.
      ...theme.applyStyles('dark', {
        color: palVar?.light ?? palRaw.light,
        '& .MuiChip-icon': { color: palVar?.light ?? palRaw.light },
      }),
      '& .MuiChip-label': {
        px: theme.spacing(0.75),
        fontWeight: theme.typography.fontWeightMedium ?? 500,
        borderRadius,
      },
      '&.MuiChip-clickable:hover': {
        backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / var(${APP_CSS_VAR.tintedChipHoverBgAlpha}))`,
      },
      '&.MuiChip-clickable:active': {
        backgroundColor: `rgba(var(--mui-palette-${paletteKey}-mainChannel) / var(${APP_CSS_VAR.tintedChipActiveBgAlpha}))`,
      },
    }
  }, [theme])

  const filterChipSx = React.useCallback((mode: AnyMode) => {
    const paletteKey = mode === 'include' ? 'success' : mode === 'off' ? 'warning' : 'info'
    return tintedChipSx(paletteKey)
  }, [tintedChipSx])

// Why: A single helper for the compact filter chips that control how to treat
  // rules with "Any" in a field (or wildcard for substats). Keeps wording
  // consistent across fields and makes the intent explicit to users.
  const anyChip = (fieldLabel: string, value: AnyMode, setValue: (v: AnyMode) => void, tooltip: string) => {
    const prefixText = `'${t('any')}':`
    const ariaPrefixText = `'${t('any')}' ${fieldLabel}:`
    const stateLabel = value === 'include' ? t('filterShow') : value === 'off' ? t('filterHide') : t('filterOnly')
    const glyphTooltip = renderGlyphTooltip(tooltip, [{ glyph: GLYPH_ONLY, label: t('filterOnly') }])
    const chipLabel = (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>{prefixText}</Box>
        {value === 'only'
          ? (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', fontSize: FONT_SIZE_BASE_PX, lineHeight: 1 }}>
              {GLYPH_ONLY}
            </Box>
          )
          : (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
              {value === 'include'
                ? <VisibilityIcon fontSize="small" aria-hidden="true" />
                : <VisibilityOffIcon fontSize="small" aria-hidden="true" />}
            </Box>
          )}
      </Box>
    )
    return (
      <MarkdownTooltip markdown={glyphTooltip}>
        <Chip
          size="small"
          variant="filled"
          aria-label={`${ariaPrefixText} ${stateLabel}`}
          label={chipLabel}
          onClick={() => setValue(value === 'include' ? 'off' : value === 'off' ? 'only' : 'include')}
          sx={filterChipSx(value)}
        />
      </MarkdownTooltip>
    )
  }
  const wildcardState = gearInspectorRollsState.wildcard ?? createDefaultGearInspectorRollsState().wildcard
  const wildcardCounts: GearInspectorRollCountSet = React.useMemo(
    () => wildcardState.counts ?? [],
    [wildcardState.counts],
  )
  const wildcardIsActive = (wildcardState.mode ?? 'off') === 'any' && wildcardCounts.length > 0
  const wildcardDisplayCounts = wildcardIsActive ? wildcardCounts : EMPTY_GEAR_INSPECTOR_ROLL_COUNT_SET
  const gearInspectorRollsPerStat = gearInspectorRollsState.perStat ?? EMPTY_ROLL_ROWS
  const activePerStatRows = React.useMemo(
    () => gearInspectorRollsPerStat.filter((row) => (row.counts?.length ?? 0) > 0),
    [gearInspectorRollsPerStat],
  )
  const gearInspectorRollRowCount = activePerStatRows.length
  const perStatCounts = React.useMemo(() => {
    const map = new Map<number, GearInspectorRollCountSet>()
    activePerStatRows.forEach((row) => {
      map.set(Number(row.stat), row.counts ?? [])
    })
    return map
  }, [activePerStatRows])

  const rollSummaryDescription = React.useMemo(() => {
    const parts: string[] = []
    if (wildcardIsActive) {
      const wildcardSummary = summarizeRollCounts(wildcardCounts)
      if (wildcardSummary) {
        parts.push(t('filterRollsSummaryAnyStat', { counts: wildcardSummary }))
    }
  }

    if (gearInspectorRollRowCount > 0) {
      const joiner = t('filterRollsChipPerStatJoiner')
      const entries = activePerStatRows
        .map((row) => {
          const summary = summarizeRollCounts(row.counts ?? [])
          return summary ? `${t(statVariantI18nKey(row.stat))} ${summary}` : ''
        })
        .filter(Boolean)
        .join(joiner)
      if (entries) {
        parts.push(t('filterRollsSummaryPerStat', { entries }))
      }
    }
    if (parts.length === 0) return t('filterRollsSummaryNone')
    const separator = t('filterRollsChipSeparator')
    return parts.join(separator)
  }, [activePerStatRows, t, gearInspectorRollRowCount, wildcardCounts, wildcardIsActive])

  const rollChipGlyph = React.useMemo(() => {
    if (!gearInspectorRollsActive) return GLYPH_GTE_ZERO
    if (wildcardIsActive) return GLYPH_GLYPHS_ON
    if (gearInspectorRollRowCount > 0) return GLYPH_ONLY
    return GLYPH_GTE_ONE
  }, [gearInspectorRollRowCount, gearInspectorRollsActive, wildcardIsActive])

  const rollChipLabel = `${t('filterRolls')}: ${rollChipGlyph}`
  const rollChipAria = t('filterRollsChipAria', { summary: rollSummaryDescription })

  const applyGearInspectorRollsChange = React.useCallback((mutator: (current: GearInspectorRollFilterState) => GearInspectorRollFilterState) => {
    const nextRolls = mutator(state.gearInspectorRolls ?? createDefaultGearInspectorRollsState())
    if (!isGearInspectorRollFilterActive(nextRolls) && nextRolls.wildcard.mode === 'off') {
      const { gearInspectorRolls: _ignored, ...rest } = state
      onChange(rest as RulesFilterState)
      return
    }
    onChange({
      ...state,
      gearInspectorRolls: nextRolls,
    })
  }, [onChange, state])

  const applyExclusiveRollsChange = React.useCallback((
    scope: 'wildcard' | 'perStat',
    mutator: (current: GearInspectorRollFilterState) => GearInspectorRollFilterState,
  ) => {
    applyGearInspectorRollsChange((current) => {
      let next = mutator(current)
      if (scope === 'wildcard') {
        if (next.perStat.length > 0) {
          next = { ...next, perStat: [] }
        }
      } else {
        const wildcard = next.wildcard ?? createDefaultGearInspectorRollsState().wildcard
        if ((wildcard.counts?.length ?? 0) > 0 || wildcard.mode !== 'off') {
          next = {
            ...next,
            wildcard: { ...wildcard, mode: 'off', counts: [] },
          }
        }
      }
      return next
    })
  }, [applyGearInspectorRollsChange])

  const updateWildcardCounts = React.useCallback((updater: (current: GearInspectorRollCountSet) => GearInspectorRollCountSet) => {
    applyExclusiveRollsChange('wildcard', (current) => {
      const base = current.wildcard ?? createDefaultGearInspectorRollsState().wildcard
      const seed = (base.mode ?? 'off') === 'any' ? base.counts ?? [] : EMPTY_GEAR_INSPECTOR_ROLL_COUNT_SET
      let counts = normalizeGearInspectorRollCountSelection(updater([...seed]))
      const coversAll = rollSetCoversAllCounts(counts)
      if (coversAll) {
        counts = EMPTY_GEAR_INSPECTOR_ROLL_COUNT_SET
      }
      const nextMode: GearInspectorRollWildcardMode = counts.length > 0 ? 'any' : 'off'
      return {
        ...current,
        wildcard: {
          ...base,
          mode: nextMode,
          counts,
        },
      }
    })
  }, [applyExclusiveRollsChange])

  const handleWildcardToggleValue = React.useCallback((value: GearInspectorRollCountValue) => {
    updateWildcardCounts((current) => {
      const next = new Set(current ?? [])
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return normalizeGearInspectorRollCountSelection(Array.from(next))
    })
  }, [updateWildcardCounts])

  const handleWildcardSelectNone = React.useCallback(() => {
    updateWildcardCounts(() => [])
  }, [updateWildcardCounts])

  const getPerStatCounts = React.useCallback((variant: StatVariant): GearInspectorRollCountSet => (
    perStatCounts.get(Number(variant)) ?? []
  ), [perStatCounts])

  const handlePerStatCountsChange = React.useCallback((variant: StatVariant, counts: GearInspectorRollCountSet) => {
    applyExclusiveRollsChange('perStat', (current) => {
      const perStat = current.perStat ?? []
      const filtered = perStat.filter((row) => Number(row.stat) !== Number(variant))
      const nextRows = counts.length > 0
        ? sortGearInspectorRollRows([...filtered, { stat: variant, counts }])
        : filtered
      return {
        ...current,
        perStat: nextRows,
      }
    })
  }, [applyExclusiveRollsChange])

  const handlePerStatToggleValue = React.useCallback((variant: StatVariant, value: GearInspectorRollCountValue) => {
    const currentCounts = perStatCounts.get(Number(variant)) ?? []
    const next = new Set(currentCounts)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    handlePerStatCountsChange(variant, normalizeGearInspectorRollCountSelection(Array.from(next)))
  }, [handlePerStatCountsChange, perStatCounts])

  const handlePerStatSelectNone = React.useCallback((variant: StatVariant) => {
    handlePerStatCountsChange(variant, [])
  }, [handlePerStatCountsChange])

  // Sets — reuse Builder look/feel: tokens, renderValue, order/search
  // Track menu paper for height measurement and anchor position to avoid
  // misplacement near viewport edges (mirror Builder behavior).
  const setsMenuPaperRef = React.useRef<HTMLDivElement | null>(null)
  const [setsMenuAnchorPos, setSetsMenuAnchorPos] = React.useState<{ top: number; left: number } | null>(null)
  // While the Sets select menu is open, track which metaset the user is hovering
  // to temporarily highlight member gear sets in the Sets section below.
  const [hoveredSetMetaId, setHoveredSetMetaId] = React.useState<string | null>(null)
  const visibleMetasets = metasets.filter(m => m.show !== false)
  const orderBasis = visibleMetasets.length ? visibleMetasets : metasets
  const orderedMetaSelected = orderMetasets(state.sets.metaSelected, orderBasis)
  // Accessory-only sets (like no-set) should disappear when accessories are out of scope.
  const allowNoSet = slotSelectionAllowsAccessories(state.slots.selected)
  // Normalize filter selections so legacy payloads still resolve cleanly.
  const normalizedSetSelections = pruneAccessoryNoSetSelections(state.sets.selected, allowNoSet)
  // Split includes/excludes so UI labels can reflect the right intent.
  const splitSetSelections = splitArtifactSetSelections(normalizedSetSelections)
  // Convert included sets + metasets into the Select token list.
  const selectedSetTokens: string[] = [
    ...orderedMetaSelected.map((id) => `m:${id}`),
    ...splitSetSelections.included.map((id) => `s:${Number(id)}`),
  ]
  // Build stable keys so we can detect when pruning changes the selection.
  const rawSetSelectionKey = React.useMemo(
    () => buildArtifactSetSelectionKey(state.sets.selected),
    [state.sets.selected],
  )
  const sanitizedSetSelectionKey = buildArtifactSetSelectionKey(normalizedSetSelections)
  // Persist pruned set selection back to parent when it diverges — render-time comparison.
  const [prevSanitizedSetSelectionKey, setPrevSanitizedSetSelectionKey] = React.useState(sanitizedSetSelectionKey)
  if (sanitizedSetSelectionKey !== prevSanitizedSetSelectionKey) {
    setPrevSanitizedSetSelectionKey(sanitizedSetSelectionKey)
    if (rawSetSelectionKey !== sanitizedSetSelectionKey) {
      onChange({ ...state, sets: { ...state.sets, selected: normalizedSetSelections } })
    }
  }
  const setsRenderValue = (tokens: string[]) => {
    // Collect labels in display order (metasets first, then sets, then exclusions).
    const names: string[] = []
    for (const tkn of tokens) {
      // Metaset tokens keep their glyph/name display.
      if (tkn.startsWith('m:')) {
        const id = tkn.slice(2)
        const meta = metasets.find(x => x.name === id)
        if (meta) {
          const { glyph, iconId } = metasetGlyph(meta)
          if (glyph != null && iconId) {
            const needsGap = iconId !== 'empty'
            names.push(`${glyph}${needsGap ? ` ${meta.name}` : meta.name}`)
          } else {
            names.push(meta.name)
          }
        }
      }
    }
    // Include selections render normally.
    for (const id of splitSetSelections.included) {
      const localized = getLocalizedGearSetName(id as ArtifactSetId, t, lang) || artifactSetName(id)
      names.push(localized)
    }
    // Exclusions render with a "not" prefix to signal intent.
    for (const id of splitSetSelections.excluded) {
      const localized = getLocalizedGearSetName(id as ArtifactSetId, t, lang) || artifactSetName(id)
      names.push(`not ${localized}`)
    }
    // Fallback to "Any" when nothing is selected.
    const text = (names.length === 0) ? t('any') : names.join(', ')
    return (
      <EllipsisTooltip title={text}>
        <Box
          component="span"
          data-ellipsis-target
          sx={{ display: 'block', width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {text}
        </Box>
      </EllipsisTooltip>
    )
  }

  const gearInspectorLastUseFilter = React.useMemo(
    () => normalizeGearInspectorLastUseFilter(state.gearInspectorLastUse),
    [state.gearInspectorLastUse],
  )
  const lastUsePresetSelection = gearInspectorLastUseFilter.presets
  const lastUseCustom = gearInspectorLastUseFilter.custom
  const dayShort = React.useMemo(() => {
    const raw = t('gearInspectorLastUsedDayShort')
    const trimmed = typeof raw === 'string' ? raw.trim() : ''
    return trimmed.length > 0 ? trimmed : 'd'
  }, [t])
  const lastUsePresetOptions = React.useMemo(() => {
    const labels: Record<GearInspectorLastUsePreset, string> = {
      never: '∅',
      recent7: `≤7${dayShort}`,
      recent30: `≤30${dayShort}`,
      recent90: `≤90${dayShort}`,
      older90: `>90${dayShort}`,
    }
    return [
      { value: 'never', label: labels.never, tooltip: t('gearInspectorLastUsedPresetNever') },
      { value: 'recent7', label: labels.recent7, tooltip: t('gearInspectorLastUsedPreset7d') },
      { value: 'recent30', label: labels.recent30, tooltip: t('gearInspectorLastUsedPreset30d') },
      { value: 'recent90', label: labels.recent90, tooltip: t('gearInspectorLastUsedPreset90d') },
      { value: 'older90', label: labels.older90, tooltip: t('gearInspectorLastUsedPresetOlder90d') },
    ]
  }, [dayShort, t])
  const lastUseCustomSummary = React.useMemo(() => {
    if (!lastUseCustom.enabled) return null
    const parts: string[] = []
    const minActive = lastUseCustom.minDays > GEAR_INSPECTOR_LAST_USE_MIN_DAYS
    const maxActive = lastUseCustom.maxDays < GEAR_INSPECTOR_LAST_USE_MAX_DAYS
    if (minActive && maxActive) {
      parts.push(t('gearInspectorLastUsedCustomSummaryRange', { minDays: lastUseCustom.minDays, maxDays: lastUseCustom.maxDays }))
    } else if (minActive) {
      parts.push(t('gearInspectorLastUsedCustomSummaryMin', { minDays: lastUseCustom.minDays }))
    } else if (maxActive) {
      parts.push(t('gearInspectorLastUsedCustomSummaryMax', { maxDays: lastUseCustom.maxDays }))
    }
    const summary = parts.join(' • ')
    return summary || t('gearInspectorLastUsedCustomChipLabel')
  }, [lastUseCustom, t])

  const lastUseAdvancedLabel = lastUseCustomSummary ?? t('gearInspectorLastUsedAdvancedButton')

  const handleSetsChange = (e: SelectChangeEvent<string[]>) => {
    // Token list contains metasets + explicit set ids.
    const tokens = e.target.value as string[]
    // Keep explicit includes from the tokens.
    const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
    // Preserve metaset ordering against the current basis.
    const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
    const metaIds = orderMetasets(metaIdsRaw, orderBasis)
    // Preserve existing exclusions unless the set was re-included explicitly.
    const nextExcluded = splitSetSelections.excluded.filter((id) => !setIds.includes(id))
    // Merge includes/excludes into the selection payload.
    const nextSelections = normalizeArtifactSetSelections([
      ...setIds.map((id) => ({ id })),
      ...nextExcluded.map((id) => ({ id, excluded: true })),
    ])
    // Commit both the metaset selection and the combined set entries.
    onChange({ ...state, sets: { ...state.sets, selected: nextSelections, metaSelected: metaIds } })
  }
  const resetLastUseCustom = React.useCallback(() => {
    onChange({
      ...state,
      gearInspectorLastUse: normalizeGearInspectorLastUseFilter({
        presets: gearInspectorLastUseFilter.presets,
        custom: { ...createDefaultGearInspectorLastUseCustom(), enabled: false },
      }),
    })
  }, [onChange, state, gearInspectorLastUseFilter.presets])
  const applyLastUsePresets = React.useCallback((presets: GearInspectorLastUsePreset[]) => {
    // Keep the custom range intact so users can stack presets + range without re-entering values.
    onChange({
      ...state,
      gearInspectorLastUse: normalizeGearInspectorLastUseFilter({
        presets,
        custom: gearInspectorLastUseFilter.custom,
      }),
    })
  }, [onChange, state, gearInspectorLastUseFilter.custom])
  const applyLastUseCustom = React.useCallback((partial: Partial<GearInspectorLastUseCustomFilter>) => {
    const merged: GearInspectorLastUseCustomFilter = {
      ...gearInspectorLastUseFilter.custom,
      ...partial,
      enabled: true,
    }
    // Preserve preset selection while toggling the custom slider so both act as a union.
    onChange({
      ...state,
      gearInspectorLastUse: normalizeGearInspectorLastUseFilter({
        presets: gearInspectorLastUseFilter.presets,
        custom: merged,
      }),
    })
  }, [onChange, state, gearInspectorLastUseFilter.custom, gearInspectorLastUseFilter.presets])
  const handleLastUsePopoverOpen = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    setLastUseAnchorEl(event.currentTarget as HTMLElement)
  }, [])
  const handleLastUseReset = React.useCallback(() => {
    resetLastUseCustom()
  }, [resetLastUseCustom])

  const handleLastUsePresetToggle = React.useCallback((preset: GearInspectorLastUsePreset) => {
    // Collapse redundant recency choices whenever a button toggles so the selection stays meaningful.
    const nextSelection = toggleGearInspectorLastUsePresetSelection(lastUsePresetSelection, preset)
    applyLastUsePresets(nextSelection)
  }, [applyLastUsePresets, lastUsePresetSelection])
  const handleLastUseSliderChange = React.useCallback((_: Event, value: number | number[]) => {
    if (!Array.isArray(value) || value.length !== 2) return
    const [min, max] = value as [number, number]
    applyLastUseCustom({ minDays: min, maxDays: max })
  }, [applyLastUseCustom])
  const handleLastUseInputChange = React.useCallback((field: 'minDays' | 'maxDays') => (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value)
    const isValid = Number.isFinite(parsed)
    const fallback = field === 'minDays' ? GEAR_INSPECTOR_LAST_USE_MIN_DAYS : GEAR_INSPECTOR_LAST_USE_MAX_DAYS
    const payload: Partial<GearInspectorLastUseCustomFilter> = field === 'minDays'
      ? { minDays: isValid ? parsed : fallback }
      : { maxDays: isValid ? parsed : fallback }
    applyLastUseCustom(payload)
  }, [applyLastUseCustom])
  const scrollSetsMenuToSelected = (orderOverride?: 'game' | 'az' | 'icons', opts?: { force?: boolean }) => {
    if (!opts?.force && !setsMenuOpen) return
    const order = orderOverride ?? setsOrder
    if (order === 'icons') return
    const list = setsMenuListRef.current
    if (!list) return
    const sortedForOrder = filterAndSortSetEntries(setsSearch, order, {
      translate: t,
      // Only surface no-set when accessories are allowed by the slot filter.
      includeNoSet: allowNoSet,
      noSetLabel: t('noSetAccessories'),
    })
    const selectedIds = new Set(splitSetSelections.included.map(Number))
    let target: number | null = null
    for (const [id] of sortedForOrder) {
      const idNum = Number(id)
      if (selectedIds.has(idNum)) {
        target = idNum
        break
      }
    }
    if (target === null) return
    requestAnimationFrame(() => {
      const item = list.querySelector<HTMLElement>(`[data-set-id="${target}"]`)
      item?.scrollIntoView({ block: 'nearest' })
    })
  }

  // Slots — compact toggle buttons with icons/text
  // Icon is looked up from a static module-level map (not created during render) and stored
  // alongside id/name so the map callback never assigns an uppercase const from a function call.
  const slotButtons = PREFERRED_ARTIFACT_TYPE_ORDER.map((tt) => ({
    id: Number(tt),
    Icon: artifactTypeIconFor(Number(tt)),
    name: ((): string => {
      switch (Number(tt)) {
        case 5: return t('slotWeapon')
        case 1: return t('slotHelmet')
        case 6: return t('slotShield')
        case 3: return t('slotGauntlets')
        case 2: return t('slotChestplate')
        case 4: return t('slotBoots')
        case 7: return t('slotRing')
        case 8: return t('slotAmulet')
        case 9: return t('slotBanner')
        default: return String(tt)
      }
    })(),
  }))
  const selectedSlots = new Set(state.slots.selected.map(Number))

  // Rank/Rarity — sliders replaced with concise button rows for milestone ranges to keep UI compact
  // Rank/Rarity value constants not needed in condensed mode

  // Level buttons
  const levelValues: readonly LevelMilestone[] = LEVEL_MILESTONES
  const gearInspectorLevelRange = resolveGearInspectorLevelRange(state.level)
  const gearInspectorLevelSliderMarks = levelValues.map((value) => ({ value, label: `+${value}` }))
  const levelControlWidthPx = levelValues.length * 36
  const levelControlWidthCss = `${levelControlWidthPx}px`
  const levelControlResponsiveWidth = { xs: '100%', sm: levelControlWidthCss }

  const ASCENSION_STAR_VALUES: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

  // Helpers for condensed Rank/Rarity selections
  const rankSelected = new Set((state.rank.selected ?? []).map(Number))
  const raritySelected = new Set((state.rarity.selected ?? []).map(Number))
  // Group toggles handled inline in onChange for Rank/Rarity condensed controls

  const toggleLabelSx = [ELLIPSIS_TEXT_SX, { display: 'block', width: '100%', textAlign: 'center', fontSize: 'inherit' as const }]
  const gearInspectorRecipeFilterOn = gearInspectorRecipeFilterMode !== GEAR_INSPECTOR_RECIPE_FILTER_MODE_DEFAULT
  const gearInspectorRecipeLabelStrings = React.useMemo(() => ({
    first: t('gearInspectorFilterRecipesFirst'),
    any: t('gearInspectorFilterRecipesAny'),
    off: t('gearInspectorFilterRecipesOff'),
  }), [t])
  const gearInspectorRecipeFilterLabel = gearInspectorRecipeFilterMode === 'first'
    ? gearInspectorRecipeLabelStrings.first
    : gearInspectorRecipeFilterMode === 'any'
      ? gearInspectorRecipeLabelStrings.any
      : gearInspectorRecipeLabelStrings.off
  const gearInspectorRecipeLabelWidthCh = React.useMemo(() => (
    Math.max(
      gearInspectorRecipeLabelStrings.first.length,
      gearInspectorRecipeLabelStrings.any.length,
      gearInspectorRecipeLabelStrings.off.length,
    )
  ), [gearInspectorRecipeLabelStrings])
  // Reserve space for the widest translated value across Rules mode (On/Off) and Gear Inspector mode (Off/First/Any).
  const recipeFilterValueWidthCh = React.useMemo(() => (
    Math.max(gearInspectorRecipeLabelWidthCh, t('recipeFilterOn').length)
  ), [t, gearInspectorRecipeLabelWidthCh])
  // Reserve space for the widest translated label across both modes so the button width is stable when switching.
  const recipeFilterLabelWidthCh = React.useMemo(() => (
    Math.max(t('filterLimitSelectedRecipes').length, t('filterLimitSelectedRecipesGearInspector').length)
  ), [t])
  // Pick the Selection/By Match tooltip from 4 variants: preview mode × builder mode.
  const isSafeguardMode = builderMode === 'safeguard'
  const gearInspectorRecipeFilterTooltip = isGearInspectorMode
    ? (isSafeguardMode ? t('filterLimitSelectedSafeguardGearInspectorTooltip') : t('filterLimitSelectedGearInspectorTooltip'))
    : (isSafeguardMode ? t('filterLimitSelectedSafeguardTooltip') : t('filterLimitSelectedRecipesTooltip'))
  // Pick the Narrow tooltip: recipe mode uses column-filter match, safeguard mode uses gear-item match.
  const narrowTooltip = isSafeguardMode ? t('filterLimitPreviewSafeguardTooltip') : t('filterLimitPreviewRecipesTooltip')
  // Single tooltip string shared across the Scope and Unmatched toggle buttons.
  const resultSectionTooltip = t('filterGearInspectorResultTooltip')
  const recipeFilterButtonActive = gearInspectorRecipeFilterOn
  const recipeFilterButtonDisabled = !hasRecipes || !onGearInspectorRecipeFilterModeChange
  const recipeFilterButtonVariant: 'contained' | 'outlined' = recipeFilterButtonActive ? 'contained' : 'outlined'
  // Label text is mode-aware: "Selection" in Rules mode, "By Match" in Gear Inspector mode.
  const recipeFilterButtonLabelText = isGearInspectorMode
    ? t('filterLimitSelectedRecipesGearInspector')
    : t('filterLimitSelectedRecipes')
  const recipeFilterButtonLabel = (
    isGearInspectorMode
      ? (gearInspectorRecipeFilterOn ? gearInspectorRecipeFilterLabel : t('gearInspectorFilterRecipesOff'))
      : (gearInspectorRecipeFilterOn ? t('recipeFilterOn') : t('gearInspectorFilterRecipesOff'))
  )
  const previewRecipeButtonActive = recipeChipFilterActive
  const previewRecipeButtonVariant: 'contained' | 'outlined' = previewRecipeButtonActive ? 'contained' : 'outlined'
  const previewRecipeButtonLabel = previewRecipeButtonActive ? t('recipeFilterOn') : t('gearInspectorFilterRecipesOff')
  // Match Recipe Filter's width stabilization pattern so the Narrow button
  // doesn't "jump" as Off/On switches (or across localized strings).
  const previewRecipesValueWidthCh = React.useMemo(() => (
    Math.max(t('recipeFilterOn').length, gearInspectorRecipeLabelStrings.off.length)
  ), [t, gearInspectorRecipeLabelStrings.off])
  // "Narrow" label is fixed. `ch` is the width of "0"; "Narrow" has wider glyphs (N, w, r),
  // so a bare .length under-reserves and the label ellipsizes — add 1ch of headroom.
  const previewRecipesLabelWidthCh = React.useMemo(() => (
    t('filterLimitPreviewRecipes').length + 1
  ), [t])
  const gearInspectorSourceOptions = React.useMemo(() => {
    const options = [
      { value: 'inventory', label: t('gearInspectorSourceInventory') },
      { value: 'collection', label: t('gearInspectorSourceEquippedCollection') },
      { value: 'vault', label: t('gearInspectorSourceEquippedVault') },
      { value: 'inbox', label: t('gearInspectorSourceInbox') },
    ] as const
    return hasManualGearInspectorItems
      ? [...options, { value: 'manual', label: t('gearInspectorSourceManual') }]
      : options.slice()
  }, [hasManualGearInspectorItems, t])
  // Keep the first two options anchored on the top row so the base grid stays 2x2.
  const gearInspectorSourceRows = React.useMemo(() => {
    const firstRow = gearInspectorSourceOptions.slice(0, 2)
    // The second row absorbs the remaining options (manual gear adds the third column here).
    const remaining = gearInspectorSourceOptions.slice(2)
    return [firstRow, remaining]
  }, [gearInspectorSourceOptions])
  const gearInspectorSourcesSelected = state.gearInspectorSources?.selected
  const gearInspectorSourceSelectionRaw = React.useMemo(
    () => gearInspectorSourcesSelected ?? [],
    [gearInspectorSourcesSelected],
  )
  const gearInspectorSourceSelection = hasManualGearInspectorItems
    ? gearInspectorSourceSelectionRaw
    : gearInspectorSourceSelectionRaw.filter((value) => value !== 'manual')
  // Remove 'manual' from source selection when manual items no longer exist — render-time comparison.
  const [prevHasManualGearInspectorItems, setPrevHasManualGearInspectorItems] = React.useState(hasManualGearInspectorItems)
  if (hasManualGearInspectorItems !== prevHasManualGearInspectorItems) {
    setPrevHasManualGearInspectorItems(hasManualGearInspectorItems)
    if (isGearInspectorMode && !hasManualGearInspectorItems && gearInspectorSourceSelectionRaw.includes('manual')) {
      const filtered = gearInspectorSourceSelectionRaw.filter((value) => value !== 'manual')
      onChange({
        ...state,
        gearInspectorSources: { selected: filtered },
      })
    }
  }
  // Shared handler so both toggle rows update the same gearInspectorSources payload.
  const handleGearInspectorSourceToggleChange = React.useCallback((_: React.MouseEvent<HTMLElement>, vals: string[]) => {
    const parsed = vals.map((v) => v as GearInspectorSourceFilter)
    onChange({ ...state, gearInspectorSources: { selected: parsed } })
  }, [onChange, state])
  const gearInspectorChaosMode: GearInspectorChaosFilterMode = state.gearInspectorChaos?.mode ?? 'any'
  const gearInspectorGlyphMode: GearInspectorGlyphFilterMode = state.gearInspectorGlyphs?.mode ?? 'any'
  const gearInspectorAscStars = state.gearInspectorAscension?.stars ?? []
  const gearInspectorAscStats = state.gearInspectorAscension?.stats ?? []
  const championSelection = state.gearInspectorChampions?.selected ?? []
  const championSelectionCount = championSelection.length
  const extraChampionCount = Math.max(0, championSelectionCount - 1)
  // Expand the inline gutter when the "+N" badge is visible so long names respect the stacked controls.
  const championInlinePaddingPx = computeInlineSelectPadding(championSelectionCount > 0, extraChampionCount > 0)
  // This memo enforces the clamp described above while letting selects continue to reserve the dropdown caret gutter.
  const championInlineContentMaxWidth = React.useMemo(
    () => computeInlineSelectContentMaxWidth(championInlinePaddingPx),
    [championInlinePaddingPx],
  )
  const factionSelection = state.faction.selected ?? []
  const factionSelectionCount = factionSelection.length
  const extraFactionCount = Math.max(0, factionSelectionCount - 1)
  // Mirror the champion gutter logic so faction summaries leave identical clearance around the badge + clear button.
  const factionInlinePaddingPx = computeInlineSelectPadding(factionSelectionCount > 0, extraFactionCount > 0)
  // Same inline clamp for faction summaries; keeps the layout identical regardless of which filter is active.
  const factionInlineContentMaxWidth = React.useMemo(
    () => computeInlineSelectContentMaxWidth(factionInlinePaddingPx),
    [factionInlinePaddingPx],
  )
  const showChampionFilter = isGearInspectorMode && (gearInspectorChampionOptions?.length ?? 0) > 0
  const [championSearch, setChampionSearch] = React.useState('')
  const normalizedChampionSearch = championSearch.trim()
  const championOptions = React.useMemo(() => gearInspectorChampionOptions ?? [], [gearInspectorChampionOptions])
  const championOptionMap = React.useMemo(() => {
    const map = new Map<number, GearInspectorChampionOption>()
    championOptions.forEach((option) => { map.set(option.id, option) })
    return map
  }, [championOptions])
  const filteredChampionOptions = React.useMemo(() => {
    if (!normalizedChampionSearch) return championOptions
    const query = normalizedChampionSearch.toLowerCase()
    return championOptions.filter((option) => {
      const name = option.name?.toLowerCase() ?? ''
      return name.includes(query) || String(option.id).includes(query)
    })
  }, [championOptions, normalizedChampionSearch])
  const championZeroResults = normalizedChampionSearch.length > 0 && filteredChampionOptions.length === 0
  const championClearAdornmentSx = React.useCallback(() => ({
    minWidth: CLEAR_ICON_BUTTON_SIZE_PX + 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    visibility: championSearch ? 'visible' : 'hidden',
    transition: 'visibility 120ms ease',
    ...(championZeroResults
      ? {
        '& .MuiIconButton-root': {
          backgroundColor: TINT.dangerFlashBg,
          animation: `${ZERO_RESULTS_PULSE} 2000ms ease-in-out infinite`,
        },
      }
      : {}),
  }), [championSearch, championZeroResults])
  const championClearButtonSx = React.useCallback(() => ({
    opacity: championSearch ? 1 : 0,
    pointerEvents: championSearch ? 'auto' : 'none',
    transition: 'opacity 120ms ease',
    ...(championZeroResults
      ? {
        backgroundColor: TINT.dangerFlashBg,
        animation: `${ZERO_RESULTS_PULSE} 2000ms ease-in-out infinite`,
      }
      : {}),
  }), [championSearch, championZeroResults])
  const formatChampionName = React.useCallback((option?: GearInspectorChampionOption | null): string => {
    if (!option) return ''
    if (option.name && option.name.trim().length > 0) return option.name.trim()
    return t('gearInspectorChampionUnknownName', { id: option.id })
  }, [t])
  // Dev builds benefit from showing ids inline so missing icon assets are faster to diagnose.
  // Keep prod labels clean by gating behind `import.meta.env.DEV`.
  const formatChampionNameWithDebugId = React.useCallback((option?: GearInspectorChampionOption | null): string => {
    const base = formatChampionName(option)
    if (!import.meta.env.DEV) return base
    if (!option) return base
    // Prefer showing base hero ids (asset key) and equipped champion ids (instance key) together.
    // Some localized fallback strings already include the instance id; keep the suffix anyway so the base id is visible.
    const baseHeroId = typeof option.baseId === 'number' && Number.isFinite(option.baseId) && option.baseId > 0 ? option.baseId : null
    const baseHeroLabel = baseHeroId !== null ? String(baseHeroId) : '?'
    return `${base} (${baseHeroLabel} / ${option.id})`
  }, [formatChampionName])
  const formatChampionLocation = React.useCallback((option?: GearInspectorChampionOption | null): string | null => {
    if (!option?.location) return null
    if (option.location === 'vault' || option.location === 'reserveVault') return t('gearInspectorSourceEquippedVault')
    if (option.location === 'collection') return t('gearInspectorSourceEquippedCollection')
    return null
  }, [t])
  const handleGearInspectorRecipeFilterClick = () => {
    if (!hasRecipes) return
    if (!onGearInspectorRecipeFilterModeChange) return
    if (isGearInspectorMode) {
      const next: GearInspectorRecipeFilterMode = gearInspectorRecipeFilterMode === 'off'
        ? 'first'
        : gearInspectorRecipeFilterMode === 'first'
          ? 'any'
          : 'off'
      onGearInspectorRecipeFilterModeChange(next)
      return
    }
    const next: GearInspectorRecipeFilterMode = gearInspectorRecipeFilterMode === 'off' ? 'first' : 'off'
    onGearInspectorRecipeFilterModeChange(next)
  }

  // Section labels feed both the header copy and the clear-button tooltips so we only translate once per render.
  const ruleSectionLabel = t(isGearInspectorMode ? 'filterGearInspectorResult' : 'filterRule')
  const setsSectionLabel = t('filterSets')
  const sourcesSectionLabel = t('filterSource')
  const championsSectionLabel = t('gearInspectorChampionFilterLabel')
  const lastUseSectionLabel = t('gearInspectorLastUsedFilterLabel')
  const improvChanceUnassessedChipLabel = (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>{t('gearInspectorImprovChanceNoDataPrefix')}</Box>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}>
        {improvChanceIncludeUnassessed
          ? <VisibilityIcon fontSize="small" aria-hidden="true" />
          : <VisibilityOffIcon fontSize="small" aria-hidden="true" />}
      </Box>
    </Box>
  )
  const mainSectionLabel = t('filterMainstat')
  const subSectionLabel = t('filterSubstats')
  const levelSectionLabel = t('filterLevel')
  const factionSectionLabel = t('filterFaction')
  const slotsSectionLabel = t('filterSlots')
  const rankSectionLabel = t('filterRank')
  const raritySectionLabel = t('filterRarity')
  const ascensionSectionLabel = t('filterAscension')
  const improvChanceSectionLabel = t('gearInspectorImprovChanceFilterLabel')

  // Keep the aria-label/tooltip descriptive so screen readers and hover affordances both share the same phrasing.
  const formatSectionClearLabel = React.useCallback((sectionLabel: string) => {
    const clearText = t('clear')
    if (typeof sectionLabel !== 'string') return clearText
    const trimmed = sectionLabel.trim()
    return trimmed.length > 0 ? `${clearText} · ${trimmed}` : clearText
  }, [t])

  // Every header reserves the clear-button footprint so labels never shift when filters flip between default/dirty.
  const renderSectionClearButton = (dirty: boolean, label: string, onClear: () => void) => (
    dirty
      ? (
        <ClearIconButton
          size="small"
          aria-label={label}
          tooltip={label}
          onClick={onClear}
        />
      )
      : (
        <Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} aria-hidden="true" />
      )
  )

  // Each clear helper targets the fields surfaced inside that section so partial resets never clobber other filters.
  const clearRuleSection = () => {
    if (isGearInspectorMode) {
      onChange({ ...state, gearInspectorResult: { ...(DEFAULT_RULES_FILTER_STATE.gearInspectorResult ?? { keep: false, sell: false, matched: false, unmatched: false }) } })
      return
    }
    onChange({ ...state, rule: { ...(DEFAULT_RULES_FILTER_STATE.rule ?? { keep: 'any', use: 'any' }) } })
  }
  const clearSetsSection = () => {
    setHoveredSetMetaId(null)
    onChange({
      ...state,
      sets: {
        ...(DEFAULT_RULES_FILTER_STATE.sets ?? { selected: [], anyMode: 'include', match: 'any' }),
        metaSelected: [],
      },
    })
  }
  const clearSourcesSection = () => {
    onChange({
      ...state,
      gearInspectorSources: { ...(DEFAULT_RULES_FILTER_STATE.gearInspectorSources ?? { selected: [] }) },
    })
  }
  const clearChampionsSection = () => {
    onChange({
      ...state,
      gearInspectorChampions: { ...(DEFAULT_RULES_FILTER_STATE.gearInspectorChampions ?? { selected: [] }) },
    })
  }
  const clearLastUseSection = () => {
    onChange({
      ...state,
      gearInspectorLastUse: createDefaultGearInspectorLastUseFilter(),
    })
  }
  const clearMainSection = () => {
    const next: RulesFilterState = {
      ...state,
      main: { ...(DEFAULT_RULES_FILTER_STATE.main ?? { selected: [], anyMode: 'include' }) },
    }
    if (isGearInspectorMode) {
      next.gearInspectorChaos = { ...(DEFAULT_RULES_FILTER_STATE.gearInspectorChaos ?? { mode: 'any' }) }
    }
    onChange(next)
  }
  const clearSubSection = () => {
    const next: RulesFilterState = {
      ...state,
      sub: { ...(DEFAULT_RULES_FILTER_STATE.sub ?? { selected: [], notSelected: [], mode: 'all', wildcardMode: 'include' }) },
    }
    if (isGearInspectorMode) {
      next.gearInspectorGlyphs = { ...(DEFAULT_RULES_FILTER_STATE.gearInspectorGlyphs ?? { mode: 'any' }) }
      next.gearInspectorRolls = createDefaultGearInspectorRollsState()
    }
    onChange(next)
  }
  const clearLevelSection = () => {
    const defaultLevel = DEFAULT_RULES_FILTER_STATE.level ?? { selected: [], anyMode: 'include', gearInspectorRange: undefined }
    const defaultRange = resolveGearInspectorLevelRange(defaultLevel)
    onChange({
      ...state,
      level: {
        ...defaultLevel,
        gearInspectorRange: { ...defaultRange },
      },
    })
  }
  const clearFactionSection = () => {
    onChange({
      ...state,
      faction: { ...(DEFAULT_RULES_FILTER_STATE.faction ?? { selected: [], anyMode: 'include' }) },
    })
  }
  const clearSlotsSection = () => {
    onChange({
      ...state,
      slots: { ...(DEFAULT_RULES_FILTER_STATE.slots ?? { selected: [], anyMode: 'include' }) },
    })
  }
  const clearRankSection = () => {
    onChange({
      ...state,
      rank: { ...(DEFAULT_RULES_FILTER_STATE.rank ?? { selected: [], anyMode: 'include' }) },
    })
  }
  const clearRaritySection = () => {
    onChange({
      ...state,
      rarity: { ...(DEFAULT_RULES_FILTER_STATE.rarity ?? { selected: [], anyMode: 'include' }) },
    })
  }
  const clearAscensionSection = () => {
    onChange({
      ...state,
      gearInspectorAscension: { ...(DEFAULT_RULES_FILTER_STATE.gearInspectorAscension ?? { stars: [], stats: [] }) },
    })
  }
  const clearImprovChanceSection = () => {
    onChange({
      ...state,
      gearInspectorImprovementChance: { min: 0, max: 100, includeUnassessed: true },
    })
  }

  // Dirty-state probes ensure the clear affordance only lights up when this section diverged from factory defaults.
  const defaultRuleFilter = DEFAULT_RULES_FILTER_STATE.rule ?? { keep: 'any', use: 'any' }
  const ruleSectionDirty = isGearInspectorMode
    ? (Boolean(state.gearInspectorResult?.keep) || Boolean(state.gearInspectorResult?.sell)
      || Boolean(state.gearInspectorResult?.matched) || Boolean(state.gearInspectorResult?.unmatched))
    : ((state.rule?.keep ?? defaultRuleFilter.keep) !== defaultRuleFilter.keep
      || (state.rule?.use ?? defaultRuleFilter.use) !== defaultRuleFilter.use)
  const setsSectionDirty = (
    (state.sets.selected.length > 0)
    || ((state.sets.metaSelected?.length ?? 0) > 0)
    || ((state.sets.anyMode ?? DEFAULT_RULES_FILTER_STATE.sets.anyMode) !== DEFAULT_RULES_FILTER_STATE.sets.anyMode)
    || ((state.sets.match ?? DEFAULT_RULES_FILTER_STATE.sets.match) !== DEFAULT_RULES_FILTER_STATE.sets.match)
  )
  const sourcesSectionDirty = isGearInspectorMode && (gearInspectorSourceSelectionRaw.length > 0)
  const championsSectionDirty = isGearInspectorMode && (championSelection.length > 0)
  const lastUseSectionDirty = isGearInspectorMode && (
    lastUsePresetSelection.length > 0
    || lastUseCustom.enabled
    || lastUseCustom.minDays > GEAR_INSPECTOR_LAST_USE_MIN_DAYS
    || lastUseCustom.maxDays < GEAR_INSPECTOR_LAST_USE_MAX_DAYS
  )
  const mainSectionDirty = (
    (state.main.selected.length > 0)
    || (!isGearInspectorMode && ((state.main.anyMode ?? DEFAULT_RULES_FILTER_STATE.main.anyMode) !== DEFAULT_RULES_FILTER_STATE.main.anyMode))
    || (isGearInspectorMode && (gearInspectorChaosMode !== (DEFAULT_RULES_FILTER_STATE.gearInspectorChaos?.mode ?? 'any')))
  )
  const subSectionDirty = (
    (state.sub.selected.length > 0)
    || (state.sub.notSelected.length > 0)
    || (state.sub.mode !== DEFAULT_RULES_FILTER_STATE.sub.mode)
    || (isGearInspectorMode && gearInspectorGlyphMode !== (DEFAULT_RULES_FILTER_STATE.gearInspectorGlyphs?.mode ?? 'any'))
    || (isGearInspectorMode && gearInspectorRollsActive)
  )
  const levelSectionDirty = (
    (state.level.selected.length > 0)
    || (!isGearInspectorMode && ((state.level.anyMode ?? DEFAULT_RULES_FILTER_STATE.level.anyMode) !== DEFAULT_RULES_FILTER_STATE.level.anyMode))
    || (isGearInspectorMode && (
      gearInspectorLevelRange.min > GEAR_INSPECTOR_LEVEL_MIN
      || gearInspectorLevelRange.max < GEAR_INSPECTOR_LEVEL_MAX
    ))
  )
  const factionSectionDirty = (
    (state.faction.selected.length > 0)
    || ((state.faction.anyMode ?? DEFAULT_RULES_FILTER_STATE.faction.anyMode) !== DEFAULT_RULES_FILTER_STATE.faction.anyMode)
  )
  const slotsSectionDirty = (
    (selectedSlots.size > 0)
    || (!isGearInspectorMode && ((state.slots.anyMode ?? DEFAULT_RULES_FILTER_STATE.slots.anyMode) !== DEFAULT_RULES_FILTER_STATE.slots.anyMode))
  )
  const rankSectionDirty = (
    (rankSelected.size > 0)
    || (!isGearInspectorMode && ((state.rank.anyMode ?? DEFAULT_RULES_FILTER_STATE.rank.anyMode) !== DEFAULT_RULES_FILTER_STATE.rank.anyMode))
  )
  const raritySectionDirty = (
    (raritySelected.size > 0)
    || (!isGearInspectorMode && ((state.rarity.anyMode ?? DEFAULT_RULES_FILTER_STATE.rarity.anyMode) !== DEFAULT_RULES_FILTER_STATE.rarity.anyMode))
  )
  const ascensionSectionDirty = isGearInspectorMode && (
    (gearInspectorAscStars.length > 0)
    || (gearInspectorAscStats.length > 0)
  )
  const improvChanceSectionDirty = isGearInspectorMode && (improvChanceMin > 0 || improvChanceMax < 100 || !improvChanceIncludeUnassessed)

  // Pre-compute Sets section locals so no IIFE appears inside JSX.
  // Sorted entries drive icon/list ordering for the Sets select menu.
  const setsSortedEntries = filterAndSortSetEntries(setsSearch, setsOrder, {
    translate: t,
    includeNoSet: allowNoSet,
    noSetLabel: t('noSetAccessories'),
  })
  // Use only visible metasets so the menu stays tidy.
  const setsMetasetsMenu = visibleMetasets
  // Treat exclusions as a real selection so Clear/labels stay active.
  const setsHasAnySelection = selectedSetTokens.length > 0 || splitSetSelections.excluded.length > 0
  // Track metaset-driven sets so right-click only affects derived entries.
  const setsMetaDerivedSetIds = new Set(resolveMetasets(state.sets.metaSelected ?? [], metasets).map(Number))
  const handleExcludeSet = (id: number) => {
    if (!setsMetaDerivedSetIds.has(id)) return
    const isExcluded = splitSetSelections.excluded.includes(id)
    const nextIncluded = splitSetSelections.included.filter((entry) => Number(entry) !== id)
    const nextExcluded = isExcluded
      ? splitSetSelections.excluded.filter((entry) => entry !== id)
      : [...splitSetSelections.excluded, id]
    const nextSelections = normalizeArtifactSetSelections([
      ...nextIncluded.map((entry) => ({ id: entry })),
      ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
    ])
    onChange({ ...state, sets: { ...state.sets, selected: nextSelections } })
  }
  // Inline padding grows when any selections or exclusions are present.
  const setsInlinePaddingPx = setsHasAnySelection ? SETS_SELECT_INLINE_GUTTER_PX : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX
  const handleClearSetSelection = () => {
    setHoveredSetMetaId(null)
    onChange({ ...state, sets: { ...state.sets, selected: [], metaSelected: [] } })
  }

  // Pre-compute substat section locals so no IIFE appears inside JSX.
  const subMustHave = state.sub.selected
  const subMustNot = state.sub.notSelected
  // ToggleButtonGroup expects a single "selected values" list; represent include/exclude as one active union.
  const subUnionRaw: StatVariant[] = []
  const subSeen = new Set<number>()
  for (const variant of [...subMustHave, ...subMustNot]) {
    const key = Number(variant)
    if (subSeen.has(key)) continue
    subSeen.add(key)
    subUnionRaw.push(key as StatVariant)
  }
  const subActiveUnion = sortVariantsInUiOrder(subUnionRaw)

  // Derived sets for tri-state substat button rendering — must/must-not membership lookups.
  const subMustHaveSet = new Set(subMustHave.map(Number))
  const subMustNotSet = new Set(subMustNot.map(Number))

  // Apply a tri-state toggle to the substat include/exclude lists.
  const setSubTriStateVariant = (variant: StatVariant, mode: 'include' | 'exclude' | 'off') => {
    const nextMustHaveBase = toggleVariantOff(subMustHave, variant)
    const nextMustNotBase = toggleVariantOff(subMustNot, variant)
    if (mode === 'off') {
      onChange({ ...state, sub: { ...state.sub, selected: nextMustHaveBase, notSelected: nextMustNotBase } })
      return
    }
    if (mode === 'include') {
      onChange({
        ...state,
        sub: {
          ...state.sub,
          selected: toggleVariantOn(nextMustHaveBase, variant),
          notSelected: nextMustNotBase,
        },
      })
      return
    }
    onChange({
      ...state,
      sub: {
        ...state.sub,
        selected: nextMustHaveBase,
        notSelected: toggleVariantOn(nextMustNotBase, variant),
      },
    })
  }

  // Render a single substat tri-state toggle button with tooltip and strike styling.
  const renderSubstatButton = (variant: StatVariant) => {
    const label = t(statVariantI18nKey(variant))
    const isMustNot = subMustNotSet.has(Number(variant))
    const isActive = subMustHaveSet.has(Number(variant)) || isMustNot
    return (
      <MarkdownTooltip
        key={variant}
        markdown={`${label}\n\n${isActive ? t('rulesFilterVariantRightClickHintRemove') : t('rulesFilterVariantRightClickHintExclude')}`}
        ellipsisTitle={label}
        ellipsisSelector="[data-ellipsis-target]"
      >
        <ToggleButton
          value={String(variant)}
          aria-label={labelOfVariant(variant)}
          onClick={() => { setSubTriStateVariant(variant, isActive ? 'off' : 'include') }}
          onContextMenu={(e) => { e.preventDefault(); setSubTriStateVariant(variant, isActive ? 'off' : 'exclude') }}
        >
          {/* SUBSTAT_NOT_LABEL_SX adds the diagonal strike for must-not entries. */}
          <Typography
            component="span"
            noWrap
            sx={(isMustNot ? [...toggleLabelSx, SUBSTAT_NOT_LABEL_SX] : toggleLabelSx) as SxProps<Theme>}
            data-ellipsis-target
          >
            {label}
          </Typography>
        </ToggleButton>
      </MarkdownTooltip>
    )
  }

  return (
    <Box sx={{ display: 'contents' }}>
      <Box
        sx={(theme) => ({
          border: `1px solid ${theme.vars?.palette.divider ?? theme.palette.divider}`,
          p: 0.75,
          borderRadius: 1,
          mb: 1,
          // Single horizontal scrollbar for the whole filter panel: when the 2-column
          // subgroup grid (min-width: max-content) is wider than the panel, scroll here.
          overflowX: 'auto',
        })}
      >
        <Box
          ref={topHeaderRef}
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'auto minmax(0, 1fr)' },
          columnGap: 1,
          rowGap: 1,
          alignItems: 'center',
          mb: 1,
          minHeight: headerMaxHeight ? `${headerMaxHeight}px` : undefined,
        }}
      >
        <Box
          sx={{
            gridColumn: '1',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'center',
            minWidth: 0,
          }}
        >
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center' }}
          >
              {Boolean(onGearInspectorRecipeFilterModeChange) && (
                <MarkdownTooltip markdown={gearInspectorRecipeFilterTooltip}>
                  <span>
                    <SplitLabelValueButton
                      size="small"
                      variant={recipeFilterButtonVariant}
                      color="success"
                      aria-label={recipeFilterButtonLabelText}
                      aria-pressed={recipeFilterButtonDisabled ? undefined : gearInspectorRecipeFilterOn}
                      disabled={recipeFilterButtonDisabled}
                        onClick={handleGearInspectorRecipeFilterClick}
                      sx={{
                        height: SMALL_BUTTON_HEIGHT_PX,
                        minHeight: SMALL_BUTTON_HEIGHT_PX,
                        px: 1.25,
                      }}
                      label={recipeFilterButtonLabelText}
                      labelWidthCh={recipeFilterLabelWidthCh}
                      value={recipeFilterButtonLabel}
                      valueWidthCh={recipeFilterValueWidthCh}
                    />
                  </span>
                </MarkdownTooltip>
              )}
              <MarkdownTooltip markdown={narrowTooltip}>
                <span>
                  <SplitLabelValueButton
                    size="small"
                    variant={previewRecipeButtonVariant}
                    color="success"
                    aria-label={t('filterLimitPreviewRecipes')}
                    aria-pressed={hasRecipes ? previewRecipeButtonActive : undefined}
                    onClick={() => onRecipeChipFilterChange(!recipeChipFilterActive)}
                    disabled={!hasRecipes}
                    sx={{
                      height: SMALL_BUTTON_HEIGHT_PX,
                      minHeight: SMALL_BUTTON_HEIGHT_PX,
                      px: 1.25,
                    }}
                    label={t('filterLimitPreviewRecipes')}
                    labelWidthCh={previewRecipesLabelWidthCh}
                    value={previewRecipeButtonLabel}
                    valueWidthCh={previewRecipesValueWidthCh}
                  />
                </span>
              </MarkdownTooltip>
            </Stack>
          </Box>
        <Box
          sx={{
            gridColumn: { xs: '1', md: '2' },
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: 0,
          }}
        >
          <TextField
            value={recipeNameQuery}
            onChange={(e) => handleRecipeNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() } }}
            size="small"
            inputRef={recipeNameInputRef}
            placeholder={t('filterRecipeNamePlaceholder')}
            error={recipeNameRegexError}
            slotProps={{
              htmlInput: {
                'aria-label': t('filterRecipeName'),
                'aria-invalid': recipeNameRegexError ? 'true' : undefined,
                title: recipeNameRegexError ? t('filterRecipeNameInvalid') : undefined,
              },
              input: {
                endAdornment: recipeNameQuery ? (
                  <InputAdornment position="end">
                    <ClearIconButton
                      size="small"
                      edge="end"
                      aria-label={t('builderClearRecipeName')}
                      tooltip={t('builderClearRecipeName')}
                      onClick={() => handleRecipeNameChange('')}
                    />
                  </InputAdornment>
                ) : null,
              },
            }}
            sx={{ flex: 1 }}
          />
        </Box>
      </Box>
      <Divider sx={{ mb: 1, opacity: 0.5 }} />
      <Box
        sx={{
          display: 'grid',
          // auto auto: columns size to their max-content so the grid can exceed the panel
          // width and trigger the outer overflowX:auto scrollbar (1fr would always fit).
          gridTemplateColumns: { xs: '1fr', sm: 'auto auto' },
          columnGap: 1,
          rowGap: 0.75,
          // Prevents the grid from shrinking below its natural content width — the outer
          // Box's overflowX:auto scrollbar fires when the panel is narrower than this.
          minWidth: { sm: 'max-content' },
        }}
      >
        {/* Left column */}
        <Box>
          {/* Top row: Rule/Result (left) and Sets (right) inside a nested grid */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: isGearInspectorMode ? 'auto auto minmax(0, 1fr)' : 'auto minmax(0, 1fr)' }, columnGap: 1, rowGap: 0.75 }}>
          <FormControl fullWidth sx={{ mb: 0.75 }}>
            <FilterSectionHeader
              id="rule"
              label={ruleSectionLabel}
              dirty={ruleSectionDirty}
              actions={renderSectionClearButton(
                ruleSectionDirty,
                formatSectionClearLabel(ruleSectionLabel),
                clearRuleSection,
              )}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
            <Collapse in={!collapsed.rule} timeout="auto" unmountOnExit>
            {isGearInspectorMode ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {/* Keep / Sell — independent toggles; both can be active simultaneously. */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <ToggleButtonGroup
                    size="small"
                    value={[
                      ...(state.gearInspectorResult?.keep ? ['keep'] : []),
                      ...(state.gearInspectorResult?.sell ? ['sell'] : []),
                    ]}
                    onChange={(_, newValues: string[]) => {
                      onChange({
                        ...state,
                        gearInspectorResult: {
                          ...(state.gearInspectorResult ?? DEFAULT_RULES_FILTER_STATE.gearInspectorResult!),
                          keep: newValues.includes('keep'),
                          sell: newValues.includes('sell'),
                        },
                      })
                    }}
                    sx={[{
                      '& .MuiToggleButton-root': {
                        p: 0.5,
                        width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        height: 28,
                        overflow: 'hidden',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.2,
                      },
                    }, SEGMENTED_TOGGLE_BUTTON_GROUP_SX]}
                  >
                    <ToggleButton value={'keep'}>
                      <EllipsisTooltip title={t('keepValueKeep')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('keepValueKeep')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                    <ToggleButton value={'sell'}>
                      <EllipsisTooltip title={t('keepValueSell')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('keepValueSell')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                {/* Matched / Unmatched — independent toggles; both can be active simultaneously. */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <MarkdownTooltip markdown={resultSectionTooltip}>
                    <ToggleButtonGroup
                      size="small"
                      value={[
                        ...(state.gearInspectorResult?.matched ? ['matched'] : []),
                        ...(state.gearInspectorResult?.unmatched ? ['unmatched'] : []),
                      ]}
                      onChange={(_, newValues: string[]) => {
                        onChange({
                          ...state,
                          gearInspectorResult: {
                            ...(state.gearInspectorResult ?? DEFAULT_RULES_FILTER_STATE.gearInspectorResult!),
                            matched: newValues.includes('matched'),
                            unmatched: newValues.includes('unmatched'),
                          },
                        })
                      }}
                      sx={[{
                        '& .MuiToggleButton-root': {
                          p: 0.5,
                          width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                          minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                          maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                          height: 28,
                          overflow: 'hidden',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.2,
                        },
                      }, SEGMENTED_TOGGLE_BUTTON_GROUP_SX]}
                    >
                      <ToggleButton value={'matched'}>
                        <EllipsisTooltip title={t('gearInspectorResultMatched')} wrap="block">
                          <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                            {t('gearInspectorResultMatched')}
                          </Typography>
                        </EllipsisTooltip>
                      </ToggleButton>
                      <ToggleButton value={'unmatched'}>
                        <EllipsisTooltip title={t('gearInspectorMatchNoRule')} wrap="block">
                          <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                            {t('gearInspectorMatchNoRule')}
                          </Typography>
                        </EllipsisTooltip>
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </MarkdownTooltip>
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <ToggleButtonGroup
                    size="small"
                    value={state.rule?.keep ?? 'any'}
                    exclusive
                    onChange={(_, v: Bool3 | null) => {
                      const next = v ?? 'any'
                      onChange({ ...state, rule: { keep: next, use: state.rule?.use ?? 'any' } })
                    }}
                    sx={[{
                      '& .MuiToggleButton-root': {
                        p: 0.5,
                        width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        height: 28,
                        overflow: 'hidden',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.2,
                      },
                    }, SEGMENTED_TOGGLE_BUTTON_GROUP_SX]}
                  >
                    <ToggleButton value={'yes'}>
                      <EllipsisTooltip title={t('keepValueKeep')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('keepValueKeep')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                    <ToggleButton value={'no'}>
                      <EllipsisTooltip title={t('keepValueSell')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('keepValueSell')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  <ToggleButtonGroup
                    size="small"
                    value={state.rule?.use ?? 'any'}
                    exclusive
                    onChange={(_, v: Bool3 | null) => {
                      const next = v ?? 'any'
                      onChange({ ...state, rule: { keep: state.rule?.keep ?? 'any', use: next } })
                    }}
                    sx={[{
                      '& .MuiToggleButton-root': {
                        p: 0.5,
                        width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                        height: 28,
                        overflow: 'hidden',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1.2,
                      },
                    }, SEGMENTED_TOGGLE_BUTTON_GROUP_SX]}
                  >
                    <ToggleButton value={'yes'}>
                      <EllipsisTooltip title={t('builderExportModeActive')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('builderExportModeActive')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                    <ToggleButton value={'no'}>
                      <EllipsisTooltip title={t('builderExportModeDisabled')} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t('builderExportModeDisabled')}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>
            )}
            </Collapse>
          </FormControl>
          {isGearInspectorMode && (
            <FormControl fullWidth sx={{ mb: 0.75 }}>
              <FilterSectionHeader
                id="improvChance"
                label={improvChanceSectionLabel}
                dirty={improvChanceSectionDirty}
                actions={renderSectionClearButton(
                  improvChanceSectionDirty,
                  formatSectionClearLabel(improvChanceSectionLabel),
                  clearImprovChanceSection,
                )}
                collapsed={collapsed}
                onCollapsedChange={onCollapsedChange}
              />
              <Collapse in={!collapsed.improvChance} timeout="auto" unmountOnExit>
                <Box
                  sx={{
                    width: 200,
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    px: 1.25,
                  }}
                >
                  <Slider
                    size="small"
                    disableSwap
                    min={0}
                    max={100}
                    step={5}
                    value={[improvChanceMin, improvChanceMax]}
                    marks={[0, 25, 50, 75, 100].map((v) => ({ value: v, label: `${v}%` }))}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `${v}%`}
                    onChange={handleImprovChanceSliderChange}
                    sx={{
                      width: '100%',
                      mb: 1.5,
                      '& .MuiSlider-track': { height: 4 },
                      '& .MuiSlider-rail': { height: 4 },
                      '& .MuiSlider-thumb': { width: 16, height: 16 },
                    }}
                  />
                </Box>
                <Box sx={{ mt: 0 }}>
                  <MarkdownTooltip markdown={t('gearInspectorImprovChanceTooltip')}>
                    <Chip
                      size="small"
                      label={improvChanceUnassessedChipLabel}
                      onClick={() => {
                        const ic = state.gearInspectorImprovementChance ?? DEFAULT_RULES_FILTER_STATE.gearInspectorImprovementChance!
                        onChange({ ...state, gearInspectorImprovementChance: { ...ic, includeUnassessed: !improvChanceIncludeUnassessed } })
                      }}
                      sx={tintedChipSx(improvChanceIncludeUnassessed ? 'success' : 'warning')}
                    />
                  </MarkdownTooltip>
                </Box>
              </Collapse>
            </FormControl>
          )}
          {/* Sets (compact, capped width on sm+) */}
          <FormControl
            fullWidth
            sx={{
              mb: 0.75,
              width: { xs: '100%', sm: `min(100%, ${FILTER_SETS_SELECT_WIDTH_PX}px)` },
              maxWidth: FILTER_SETS_SELECT_WIDTH_PX,
            }}
          >
            <FilterSectionHeader
              id="sets"
              label={setsSectionLabel}
              dirty={setsSectionDirty}
              actions={renderSectionClearButton(
                setsSectionDirty,
                formatSectionClearLabel(setsSectionLabel),
                clearSetsSection,
              )}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
            <Collapse in={!collapsed.sets} timeout="auto" unmountOnExit>
            {/* Sets section locals (setsSortedEntries, setsMetasetsMenu, etc.) are pre-computed before the return. */}
            {(
                <Box
                  ref={setsSelectContainerRef}
                  sx={{ position: 'relative' }}
                >
                  <Select
                    multiple
                    size="small"
                    value={selectedSetTokens}
                    onChange={handleSetsChange}
                    renderValue={setsRenderValue}
                    data-tour-id="filter.sets"
                    displayEmpty
                    onOpen={(e) => {
                      setSetsMenuOpen(true)
                      scrollSetsMenuToSelected(setsOrder, { force: true })
                      try {
                        const el = (e?.currentTarget as HTMLElement | null)
                        const rect = el?.getBoundingClientRect()
                        const viewportH = window.innerHeight || document.documentElement.clientHeight || 0
                        const margin = 8
                        const theoreticalMax = (setsMetasetsMenu.length > 0)
                          ? (MENU_MAX_HEIGHT_METASETS_PX + MENU_MAX_HEIGHT_SETS_LIST_PX)
                          : (MENU_MAX_HEIGHT_SETS_LIST_PX)
                        const desiredTop = rect ? Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - theoreticalMax - margin)) : margin
                        const desiredLeft = rect ? Math.floor(rect.left) : margin
                        setSetsMenuAnchorPos({ top: desiredTop, left: desiredLeft })
                        const selectedMetasetIds = new Set(state.sets.metaSelected ?? [])
                        const targetMetasetId = setsMetasetsMenu.length === 0
                          ? null
                          : (setsMetasetsMenu.find((meta) => selectedMetasetIds.has(meta.name))?.name ?? null)
                        const refine = () => {
                          try {
                            const paper = setsMenuPaperRef.current
                            const measured = paper ? Math.ceil(paper.offsetHeight) : 0
                            if (rect && measured > 0) {
                              const maxHeight = Math.min(measured, viewportH - margin * 2)
                              const top = Math.min(Math.floor(rect.bottom), Math.max(margin, viewportH - maxHeight - margin))
                              setSetsMenuAnchorPos({ top, left: desiredLeft })
                            }
                          } catch {}
                          if (targetMetasetId) {
                            try {
                              const list = setsMetasetsMenuListRef.current
                              if (!list) return
                              const items = list.querySelectorAll<HTMLElement>('[data-metaset-id]')
                              for (const item of items) {
                                if (item.getAttribute('data-metaset-id') === targetMetasetId) {
                                  item.scrollIntoView({ block: 'nearest' })
                                  break
                                }
                              }
                            } catch {}
                          }
                          scrollSetsMenuToSelected(setsOrder, { force: true })
                        }
                        requestAnimationFrame(() => requestAnimationFrame(refine))
                      } catch { setSetsMenuAnchorPos(null) }
                    }}
                    onClose={() => { setSetsMenuOpen(false); setSetsMenuAnchorPos(null); setHoveredSetMetaId(null) }}
                    MenuProps={{
                      slotProps: {
                        paper: {
                          sx: {
                            width: { xs: 'calc(100vw - 32px)', sm: SETS_MENU_WIDTH_PX },
                            maxWidth: SETS_MENU_WIDTH_PX,
                            overflowX: 'hidden',
                          },
                          ref: (el: HTMLDivElement | null) => { setsMenuPaperRef.current = el },
                        },
                        list: { sx: { width: '100%', maxWidth: '100%' } },
                      },
                      ...(setsMenuAnchorPos
                        ? { anchorReference: 'anchorPosition' as const, anchorPosition: setsMenuAnchorPos, transformOrigin: { vertical: 'top', horizontal: 'left' as const } }
                        : { transformOrigin: { vertical: 'top', horizontal: 'left' as const } }),
                    }}
                    sx={{
                      width: '100%',
                      minWidth: 0,
                      cursor: 'pointer',
                      pr: `${setsInlinePaddingPx}px`,
                      '& .MuiSelect-select': {
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        display: 'block',
                        maxWidth: '100%',
                        cursor: 'pointer',
                      },
                      '& .MuiSelect-icon': {
                        right: 8,
                      },
                    }}
                  >
                  {(setsMetasetsMenu.length > 0) && (
                    <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                      <Box
                        component="ul"
                        ref={setsMetasetsMenuListRef}
                        sx={{
                          listStyle: 'none', p: 0, m: 0,
                          maxHeight: MENU_MAX_HEIGHT_METASETS_PX,
                          overflowY: 'auto',
                          pr: `${MENU_SCROLL_GUTTER_PX}px`,
                          ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                          ...visibleScrollbarTrack(),
                        }}
                        data-tour-id="menu.metasets.section"
                      >
                      <ListSubheader sx={LIST_SUBHEADER_SX}>{t('menuMetasetsSection')}</ListSubheader>
                      {setsMetasetsMenu.map((m) => {
                        const { glyph, iconId } = metasetGlyph(m)
                        const hasGlyph = glyph != null && !!iconId
                        const needsGap = iconId !== null && iconId !== 'empty'
                        const tooltipName = hasGlyph ? `${glyph}${needsGap ? ` ${m.name}` : m.name}` : m.name
                        const displayGap = hasGlyph && needsGap ? 0.75 : 0.5
                        const selected = (state.sets.metaSelected ?? []).includes(m.name)
                        const setNames = m.sets.map(id => getLocalizedGearSetName(id, t, lang)).filter(Boolean)
                        const joined = setNames.join(', ')
                        return (
                          <MenuItem
                              key={m.name}
                              value={`m:${m.name}`}
                              selected={selected}
                              data-metaset-id={m.name}
                              onMouseEnter={() => setHoveredSetMetaId(m.name)}
                              onMouseLeave={() => setHoveredSetMetaId(prev => prev === m.name ? null : prev)}
                              onClick={(e) => {
                                // Toggle metaset tokens while keeping set exclusions intact.
                                e.preventDefault()
                                e.stopPropagation()
                                const token = `m:${m.name}`
                                const tokensSet = new Set<string>(selectedSetTokens)
                                if (tokensSet.has(token)) tokensSet.delete(token); else tokensSet.add(token)
                                const tokens = Array.from(tokensSet)
                                // Rebuild the metaset selection from the token list.
                                const metaIdsRaw = tokens.filter(t => t.startsWith('m:')).map(t => t.slice(2))
                                const metaIds = orderMetasets(metaIdsRaw, orderBasis)
                                // Preserve explicit set includes.
                                const setIds = tokens.filter(t => t.startsWith('s:')).map(t => Number(t.slice(2)))
                                // Drop exclusions only when the set is explicitly re-included.
                                const nextExcluded = splitSetSelections.excluded.filter((id) => !setIds.includes(id))
                                const nextSelections = normalizeArtifactSetSelections([
                                  ...setIds.map((id) => ({ id })),
                                  ...nextExcluded.map((id) => ({ id, excluded: true })),
                                ])
                                onChange({ ...state, sets: { ...state.sets, metaSelected: metaIds, selected: nextSelections } })
                              }}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>
                              {/* Clamp metaset names so verbose translations don't push the menu wider. */}
                              <EllipsisTooltip
                                title={tooltipName}
                                wrap="block"
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: displayGap, minWidth: 0 }}>
                                  {hasGlyph ? (
                                    <Box component="span" aria-hidden sx={{ fontSize: 18, width: 22, textAlign: 'center', lineHeight: 1 }}>
                                      {glyph}
                                    </Box>
                                  ) : null}
                                  <Typography
                                    data-ellipsis-target
                                    sx={[ELLIPSIS_TEXT_SX, { display: 'block', width: '100%' }]}
                                  >
                                    {m.name}
                                  </Typography>
                                </Box>
                              </EllipsisTooltip>
                              {setNames.length > 0 && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: 'primary.main', opacity: 0.9, display: 'block', width: '100%', whiteSpace: 'normal', overflowWrap: 'break-word' }}
                                >
                                  {joined}
                                </Typography>
                              )}
                              </Box>
                            </MenuItem>
                          )
                        })}
                      </Box>
                    </Box>
                  )}
                  <Box component="div" sx={{ display: 'block', p: 0, m: 0 }}>
                    <ListSubheader component="div" sx={[LIST_SUBHEADER_SX, { py: 0.5, minHeight: MENU_HEADER_WITH_SEARCH_MIN_HEIGHT_PX, boxSizing: 'border-box', width: `calc(100% - ${MENU_SCROLL_GUTTER_PX}px)` }]}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', alignItems: 'center', pr: `${MENU_SCROLL_GUTTER_PX}px` }}>
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SetsOrderControls
                            setsSearch={setsSearch}
                            onSetsSearchChange={setSetsSearch}
                            setsOrder={setsOrder}
                            onSetsOrderChange={(v: 'game' | 'az' | 'icons') => {
                              if (!v) return
                              setSetsOrder(v)
                              if (setsMenuOpen) {
                                scrollSetsMenuToSelected(v, { force: true })
                              }
                            }}
                            zeroResults={filterAndSortSetEntries(setsSearch, setsOrder, {
                              translate: t,
                              // Respect accessory-only constraints when computing empty states.
                              includeNoSet: allowNoSet,
                              noSetLabel: t('noSetAccessories'),
                            }).length === 0}
                          />
                        </Box>
                      </Box>
                    </ListSubheader>
                    <Box
                      component="ul"
                      ref={setsMenuListRef}
                      sx={{
                        listStyle: 'none', p: 0, m: 0,
                        ...(setsOrder === 'icons'
                          ? { maxHeight: 'none', height: 'auto', overflowY: 'visible' }
                          : { maxHeight: MENU_MAX_HEIGHT_SETS_LIST_PX, height: MENU_MAX_HEIGHT_SETS_LIST_PX, overflowY: 'auto' }),
                        pr: `${MENU_SCROLL_GUTTER_PX}px`,
                        ...reserveScrollbarGutterSpace({ basePaddingInlineEnd: `${MENU_SCROLL_GUTTER_PX}px` }),
                        ...(setsOrder !== 'icons' ? visibleScrollbarTrack() : {}),
                      }}
                    >
                      <SetMenuSection
                        title="Sets"
                        sorted={setsSortedEntries}
                        setsOrder={setsOrder}
                        metasets={metasets}
                        setUsageCounts={{}}
                        showUsageCounts={false}
                        valueForSet={(id) => `s:${id}`}
                        onToggleSet={(id) => {
                          // Toggle only the explicit include list for this filter.
                          const idNum = Number(id)
                          const prev = new Set(splitSetSelections.included.map(Number))
                          if (prev.has(idNum)) prev.delete(idNum); else prev.add(idNum)
                          const next = Array.from(prev).sort((a, b) => a - b)
                          // Clear exclusions when a set is explicitly re-added.
                          const nextExcluded = splitSetSelections.excluded.filter((entry) => entry !== idNum)
                          const nextSelections = normalizeArtifactSetSelections([
                            ...next.map((entry) => ({ id: entry })),
                            ...nextExcluded.map((entry) => ({ id: entry, excluded: true })),
                          ])
                          onChange({ ...state, sets: { ...state.sets, selected: nextSelections } })
                        }}
                        onContextMenuSet={(id) => handleExcludeSet(id)}
                        hideHeader
                        hoveredMetasetId={hoveredSetMetaId}
                        selectedMetasetIds={state.sets.metaSelected ?? []}
                        selectedSetIds={splitSetSelections.included.map(Number)}
                        excludedSetIds={splitSetSelections.excluded.map(Number)}
                      />
                    </Box>
                  </Box>
                  </Select>
                <InlineSelectClearButton
                  disabled={!setsHasAnySelection}
                  label={t('clear')}
                  onClear={handleClearSetSelection}
                />
                <SelectDropdownActivator
                  getDisplayNode={() => {
                    const root = setsSelectContainerRef.current
                    if (!root) return null
                    return root.querySelector('[role="combobox"]') as HTMLElement | null
                  }}
                  widthPx={setsHasAnySelection ? undefined : SETS_SELECT_INLINE_GUTTER_COLLAPSED_PX}
                />
              </Box>
            )}
            <Stack direction="row" spacing={1} sx={{ mt: FILTER_CHIP_TOP_MARGIN, flexWrap: 'wrap', alignItems: 'center' }}>
              {anyChip(t('filterSets'), state.sets.anyMode, (v) => onChange({ ...state, sets: { ...state.sets, anyMode: v } }), t('filterAnyTooltip', { field: t('filterSets') }))}
              <MarkdownTooltip
                markdown={renderGlyphTooltip(t('filterMatchTooltipSets'), [
                  { glyph: GLYPH_GTE_ONE, label: t('filterAnyOf') },
                  { glyph: GLYPH_ALL, label: t('filterAllOf') },
                ])}
              > 
                <Chip
                  size="small"
                  variant={'filled'}
                  label={`${t('filterMatch')}: ${(state.sets.match ?? 'any') === 'any' ? GLYPH_GTE_ONE : GLYPH_ALL}`}
                  aria-label={`${t('filterMatch')}: ${(state.sets.match ?? 'any') === 'any' ? t('filterAnyOf') : t('filterAllOf')}`}
                  onClick={() => {
                    const next = (state.sets.match ?? 'any') === 'any' ? 'all' : 'any'
                    onChange({ ...state, sets: { ...state.sets, match: next } })
                  }}
                  sx={tintedChipSx((state.sets.match ?? 'any') === 'any' ? 'success' : 'info')}
                />
              </MarkdownTooltip>
            </Stack>
            </Collapse>
          </FormControl>
          </Box>
          {isGearInspectorMode && (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'nowrap',
                columnGap: 1,
                rowGap: 0.75,
                mb: 0.75,
                alignItems: 'flex-start',
              }}
            >
              <FormControl sx={{ ...collapsibleSectionSx }}>
                <FilterSectionHeader
                  id="sources"
                  label={sourcesSectionLabel}
                  dirty={sourcesSectionDirty}
                  fullWidth={false}
                  actions={renderSectionClearButton(
                    sourcesSectionDirty,
                    formatSectionClearLabel(sourcesSectionLabel),
                    clearSourcesSection,
                  )}
                  collapsed={collapsed}
                  onCollapsedChange={onCollapsedChange}
                />
                <Collapse in={!collapsed.sources} timeout="auto" unmountOnExit>
                  <Box
                    // Stack two button rows: base view shows 2x2, manual rows expand the second tier to three columns.
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                    }}
                  >
                    {gearInspectorSourceRows.map((rowOptions) => {
                      if (rowOptions.length === 0) return null
                      // Use the first option's value in each row as a stable key
                      // (each row starts with a different source option).
                      const rowKey = `gear-inspector-sources-row-${rowOptions[0]?.value ?? 'empty'}`
                      return (
                        <ToggleButtonGroup
                          key={rowKey}
                          size="small"
                          value={gearInspectorSourceSelection}
                          onChange={handleGearInspectorSourceToggleChange}
                          sx={[{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${rowOptions.length}, minmax(0, ${FILTER_TOGGLE_BUTTON_WIDTH_PX}px))`,
                            columnGap: 0.5,
                            rowGap: 0.5,
                            '& .MuiToggleButton-root': {
                              p: 0.5,
                              width: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                              minWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                              maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                              height: 28,
                              overflow: 'hidden',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              lineHeight: 1.2,
                            },
                          }, GRID_TOGGLE_BUTTON_GROUP_SX]}
                        >
                          {rowOptions.map((option) => (
                            <ToggleButton key={option.value} value={option.value}>
                              <EllipsisTooltip title={option.label} wrap="block">
                                <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                                  {option.label}
                                </Typography>
                              </EllipsisTooltip>
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      )
                    })}
                  </Box>
                </Collapse>
              </FormControl>
              {showChampionFilter && (
                <FormControl sx={{ ...collapsibleSectionSx }}>
                  <FilterSectionHeader
                    id="champions"
                    label={championsSectionLabel}
                    dirty={championsSectionDirty}
                    actions={renderSectionClearButton(
                      championsSectionDirty,
                      formatSectionClearLabel(championsSectionLabel),
                      clearChampionsSection,
                    )}
                    collapsed={collapsed}
                    onCollapsedChange={onCollapsedChange}
                  />
                  <Collapse in={!collapsed.champions} timeout="auto" unmountOnExit>
                    <Box
                      sx={{
                        position: 'relative',
                        width: { xs: '100%', sm: CHAMPION_SELECT_WIDTH_PX },
                        maxWidth: CHAMPION_SELECT_WIDTH_PX,
                      }}
                    >
                      <Select
                        multiple
                        size="small"
                        value={championSelection.map((id) => String(id))}
                        onChange={(event) => {
                          const vals = event.target.value as string[]
                          const parsed = vals
                            .map((v) => Number(v))
                            .filter((id) => Number.isFinite(id) && id > 0)
                          onChange({ ...state, gearInspectorChampions: { selected: parsed } })
                        }}
                        displayEmpty
	                        renderValue={(vals) => {
	                          const list = (vals as string[]).map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
	                          if (!list.length) {
	                            return (
	                              <EllipsisTooltip title={t('any')} wrap="block">
                                <Typography
                                  variant="body2"
                                  data-ellipsis-target
                                  sx={[ELLIPSIS_TEXT_SX, { display: 'block', width: '100%', fontSize: FONT_SIZE_BASE_PX }]}
                                >
                                  {t('any')}
                                </Typography>
                              </EllipsisTooltip>
                            )
	                          }
	                          const firstId = list[0]!
	                          const firstOption = championOptionMap.get(firstId)
	                          const firstName = formatChampionNameWithDebugId(firstOption)
	                          const locationLabel = formatChampionLocation(firstOption)
	                          const summaryTitle = locationLabel ? `${firstName} · ${locationLabel}` : firstName
	                        return (
	                          <EllipsisTooltip title={summaryTitle} wrap="block">
                            <Box
                              component="span"
                              data-ellipsis-target
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                width: '100%',
                                minWidth: 0,
                                maxWidth: championInlineContentMaxWidth,
                              }}
                            >
                              <Typography variant="body2" sx={[ELLIPSIS_TEXT_SX, { flex: '1 1 auto', minWidth: 0 }]}>
                                {summaryTitle}
                              </Typography>
                            </Box>
                          </EllipsisTooltip>
                        )
                      }}
                        MenuProps={{
                          autoFocus: false,
                          disableAutoFocusItem: true,
                          variant: 'menu',
                          slotProps: {
                            list: {
                              autoFocus: false,
                              autoFocusItem: false,
                            },
                            paper: {
                              sx: {
                                width: { xs: 'calc(100vw - 32px)', sm: CHAMPION_MENU_WIDTH_PX },
                                maxWidth: CHAMPION_MENU_WIDTH_PX,
                                maxHeight: 360,
                                '& .MuiList-root': {
                                  py: 0,
                                },
                              },
                            },
                          },
                        }}
                        sx={{
                          width: '100%',
                          cursor: 'pointer',
                          '& .MuiSelect-select': {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            flexWrap: 'nowrap',
                            paddingTop: 0,
                            paddingBottom: 0,
                            paddingRight: `${championInlinePaddingPx}px`,
                            maxWidth: '100%',
                            cursor: 'pointer',
                          },
                          '& .MuiSelect-select > *': {
                            minWidth: 0,
                          },
                          minHeight: SMALL_BUTTON_HEIGHT_PX + 8,
                          height: SMALL_BUTTON_HEIGHT_PX + 8,
                        }}
                      >
                      <ListSubheader sx={{ ...LIST_SUBHEADER_SX, py: 1.25 }}>
                        <TextField
                          value={championSearch}
                          onChange={(e) => setChampionSearch(e.target.value)}
                          size="small"
                          placeholder={t('gearInspectorChampionSearchPlaceholder')}
                          fullWidth
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          slotProps={{
                            input: {
                              sx: {
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                                '& .MuiOutlinedInput-input': { py: 0, px: 1, fontSize: FONT_SIZE_BASE_PX, lineHeight: '32px' },
                              },
                              endAdornment: (
                                <InputAdornment
                                  position="end"
                                  sx={championClearAdornmentSx}
                                >
                                  <IconButton
                                    size="small"
                                    aria-label={t('clear')}
                                    onClick={() => setChampionSearch('')}
                                    edge="end"
                                    sx={championClearButtonSx}
                                  >
                                    <ClearIcon fontSize="small" />
                                  </IconButton>
                                </InputAdornment>
                              ),
                            },
                          }}
                        />
                      </ListSubheader>
	                      {filteredChampionOptions.map((option) => {
	                        const locationLabel = formatChampionLocation(option)
	                        const championLabel = formatChampionNameWithDebugId(option)
	                        // Prefer base hero ids for icons so duplicate champion copies share the same avatar.
	                        const championIconSrc = championIconUrl(option.baseId ?? option.id)
	                        // Mirror the Gear Inspector grid rarity border so the dropdown signals overall quality at a glance.
	                        const championBorderColor = resolveRarityAccentColor(option.rarity) ?? (theme.vars?.palette.divider ?? theme.palette.divider)
                        const championTrimmed = championLabel.trim()
                        const championFallbackInitial = championTrimmed.length > 0 ? championTrimmed.charAt(0).toUpperCase() : '?'
                        return (
                          <MenuItem key={option.id} value={String(option.id)}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                              <Box
                                sx={{
                                  width: CHAMPION_ICON_BASE_SIZE.width,
                                  height: CHAMPION_ICON_BASE_SIZE.height,
                                  borderRadius: `${CHAMPION_ICON_BORDER_RADIUS_PX}px`,
                                  border: '2px solid',
                                  borderColor: championBorderColor,
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  bgcolor: championIconSrc ? 'transparent' : TINT.neutralDisabledChipBg,
                                  color: (theme.vars?.palette.text.secondary ?? theme.palette.text.secondary),
                                  fontWeight: 700,
                                  fontSize: theme.typography.pxToRem(13),
                                  textTransform: 'uppercase',
                                }}
                              >
                                {championIconSrc ? (
                                  <Box
                                    component="img"
                                    src={championIconSrc}
                                    alt={championLabel}
                                    draggable={false}
                                    onDragStart={(event) => { event.preventDefault(); event.stopPropagation() }}
                                    sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                                  />
                                ) : (
                                  championFallbackInitial
                                )}
                              </Box>
                              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                                <Typography variant="body2" sx={{ minWidth: 0 }}>
                                  {championLabel}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  {locationLabel ? `${locationLabel} · ` : ''}
                                  ×{option.count}
                                </Typography>
                              </Stack>
                            </Box>
                          </MenuItem>
                        )
                      })}
                      </Select>
                      <InlineSelectExtraBadge count={extraChampionCount} />
                      <InlineSelectClearButton
                        disabled={championSelection.length === 0}
                        label={t('clear')}
                        onClear={() => onChange({ ...state, gearInspectorChampions: { selected: [] } })}
                      />
                    </Box>
                  </Collapse>
                </FormControl>
              )}
              <FormControl sx={{ ...collapsibleSectionSx }}>
                <FilterSectionHeader
                  id="lastUse"
                  label={lastUseSectionLabel}
                  dirty={lastUseSectionDirty}
                  fullWidth={false}
                  maxWidth={`${LAST_USE_SECTION_WIDTH_PX}px`}
                  actions={renderSectionClearButton(
                    lastUseSectionDirty,
                    formatSectionClearLabel(lastUseSectionLabel),
                    clearLastUseSection,
                  )}
                  collapsed={collapsed}
                  onCollapsedChange={onCollapsedChange}
                />
                <Collapse in={!collapsed.lastUse} timeout="auto" unmountOnExit>
                  <Stack spacing={0.75}>
                    <ToggleButtonGroup
                      size="small"
                      value={lastUsePresetSelection}
                      sx={[{
                        display: 'grid',
                        gridTemplateColumns: `repeat(3, minmax(0, ${LAST_USE_TOGGLE_BUTTON_WIDTH_PX}px))`,
                        columnGap: 0.5,
                        rowGap: 0.5,
                        '& .MuiToggleButton-root': {
                          p: 0.5,
                          // Allow buttons to shrink below their natural width when the panel is narrow.
                          width: LAST_USE_TOGGLE_BUTTON_WIDTH_PX,
                          minWidth: 24,
                          maxWidth: LAST_USE_TOGGLE_BUTTON_WIDTH_PX,
                          height: 28,
                          overflow: 'hidden',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.2,
                        },
                      }, GRID_TOGGLE_BUTTON_GROUP_SX]}
                    >
                      {lastUsePresetOptions.map((option) => (
                        <ToggleButton
                          key={option.value}
                          value={option.value}
                          aria-label={option.tooltip}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleLastUsePresetToggle(option.value as GearInspectorLastUsePreset)
                          }}
                        >
                          <MarkdownTooltip
                            markdown={option.tooltip}
                            // Expose the full label via OS tooltip only when the button text is truncated.
                            ellipsisTitle={option.label}
                            hoverIntent="interactive"
                          >
                            <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                              {option.label}
                            </Typography>
                          </MarkdownTooltip>
                        </ToggleButton>
                      ))}
                      <ToggleButton
                        value="advanced"
                        aria-label={lastUseAdvancedLabel}
                        selected={lastUseCustom.enabled}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          handleLastUsePopoverOpen(event)
                        }}
                      >
                        <MarkdownTooltip markdown={lastUseAdvancedLabel} hoverIntent="interactive">
                          <SettingsIcon fontSize="small" />
                        </MarkdownTooltip>
                      </ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>
                </Collapse>
              </FormControl>
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'nowrap',
              columnGap: 1,
              rowGap: 0.75,
              mb: 0.75,
              alignItems: 'flex-start',
            }}
          >
            {/* Mainstat (below Sets) */}
            <FormControl sx={collapsibleSectionSx}>
              <FilterSectionHeader
                id="main"
                label={mainSectionLabel}
                dirty={mainSectionDirty}
                actions={renderSectionClearButton(
                  mainSectionDirty,
                  formatSectionClearLabel(mainSectionLabel),
                  clearMainSection,
                )}
                collapsed={collapsed}
                onCollapsedChange={onCollapsedChange}
              />
              <Collapse in={!collapsed.main} timeout="auto" unmountOnExit>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <ToggleButtonGroup
                  size="small"
                  value={filterRowSelection(state.main.selected, STAT_VARIANTS_PRIORITY_ROW1)}
                  onChange={(_, vals: string[]) => {
                    const next = mergeRowSelection(state.main.selected, STAT_VARIANTS_PRIORITY_ROW1, vals)
                    onChange({ ...state, main: { ...state.main, selected: next } })
                  }}
                  sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW1.length)}
                >
                  {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => (
                    <ToggleButton key={variant} value={String(variant)} aria-label={labelOfVariant(variant)}>
                      {/* EllipsisTooltip shows OS tooltip only when text is actually truncated. */}
                      <EllipsisTooltip title={t(statVariantI18nKey(variant))} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t(statVariantI18nKey(variant))}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                <ToggleButtonGroup
                  size="small"
                  value={filterRowSelection(state.main.selected, STAT_VARIANTS_PRIORITY_ROW2)}
                  onChange={(_, vals: string[]) => {
                    const next = mergeRowSelection(state.main.selected, STAT_VARIANTS_PRIORITY_ROW2, vals)
                    onChange({ ...state, main: { ...state.main, selected: next } })
                  }}
                  sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW2.length)}
                >
                  {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => (
                    <ToggleButton key={variant} value={String(variant)} aria-label={labelOfVariant(variant)}>
                      <EllipsisTooltip title={t(statVariantI18nKey(variant))} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t(statVariantI18nKey(variant))}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>
              {isGearInspectorMode ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: FILTER_CHIP_TOP_MARGIN }}>
                  <MarkdownTooltip
                    markdown={renderGlyphTooltip(t('filterChaosOreTooltip'), [
                      { glyph: GLYPH_GTE_ZERO, label: t('filterChaosOreAny') },
                      { glyph: GLYPH_NOT_REROLLED, label: t('filterChaosOreNotRerolled') },
                      { glyph: GLYPH_REROLLED, label: t('filterChaosOreRerolled') },
                    ])}
                  >
                    <Chip
                      size="small"
                      label={`${t('filterChaosOre')}: ${
                        gearInspectorChaosMode === 'notRerolled'
                          ? GLYPH_NOT_REROLLED
                          : gearInspectorChaosMode === 'rerolled'
                            ? GLYPH_REROLLED
                            : GLYPH_GTE_ZERO
                      }`}
                      aria-label={`${t('filterChaosOre')}: ${
                        gearInspectorChaosMode === 'notRerolled'
                          ? t('filterChaosOreNotRerolled')
                          : gearInspectorChaosMode === 'rerolled'
                            ? t('filterChaosOreRerolled')
                            : t('filterChaosOreAny')
                      }`}
                      onClick={() => {
                        const next: GearInspectorChaosFilterMode =
                          gearInspectorChaosMode === 'any'
                            ? 'notRerolled'
                            : gearInspectorChaosMode === 'notRerolled'
                              ? 'rerolled'
                              : 'any'
                        onChange({ ...state, gearInspectorChaos: { mode: next } })
                      }}
                      sx={tintedChipSx(gearInspectorChaosMode === 'any' ? 'success' : gearInspectorChaosMode === 'notRerolled' ? 'info' : 'warning')}
                    />
                  </MarkdownTooltip>
                </Box>
              ) : (
                <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                  {anyChip(
                    t('filterMainstat'),
                    state.main.anyMode,
                    (v) => onChange({ ...state, main: { ...state.main, anyMode: v } }),
                    t('filterAnyTooltip', { field: t('filterMainstat') }),
                  )}
                </Box>
              )}
              </Collapse>
            </FormControl>

            {/* Substats (below Sets) */}
            <FormControl sx={collapsibleSectionSx}>
              <FilterSectionHeader
                id="sub"
                label={subSectionLabel}
                dirty={subSectionDirty}
                actions={renderSectionClearButton(
                  subSectionDirty,
                  formatSectionClearLabel(subSectionLabel),
                  clearSubSection,
                )}
                collapsed={collapsed}
                onCollapsedChange={onCollapsedChange}
              />
              <Collapse in={!collapsed.sub} timeout="auto" unmountOnExit>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {/* subMustHave, subMustNot, subActiveUnion, renderSubstatButton pre-computed before return. */}
                <>
                  <ToggleButtonGroup
                    size="small"
                    value={filterRowSelection(subActiveUnion, STAT_VARIANTS_PRIORITY_ROW1)}
                    sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW1.length)}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => renderSubstatButton(variant))}
                  </ToggleButtonGroup>
                  <ToggleButtonGroup
                    size="small"
                    value={filterRowSelection(subActiveUnion, STAT_VARIANTS_PRIORITY_ROW2)}
                    sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW2.length)}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => renderSubstatButton(variant))}
                  </ToggleButtonGroup>
                </>
              </Box>
              {/* Chips row below substats */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: FILTER_CHIP_TOP_MARGIN }}>
                <MarkdownTooltip
                  markdown={renderGlyphTooltip(t('filterMatchTooltipSubstats'), [
                    { glyph: GLYPH_GTE_ONE, label: t('filterAnyOf') },
                    { glyph: GLYPH_ALL, label: t('filterAllOf') },
                  ])}
                > 
                  <Chip
                    size="small"
                    variant={'filled'}
                    label={`${t('filterMatch')}: ${state.sub.mode === 'any' ? GLYPH_GTE_ONE : GLYPH_ALL}`}
                    aria-label={`${t('filterMatch')}: ${state.sub.mode === 'any' ? t('filterAnyOf') : t('filterAllOf')}`}
                    onClick={() => {
                      const next = state.sub.mode === 'any' ? 'all' : 'any'
                      onChange({ ...state, sub: { ...state.sub, mode: next } })
                    }}
                    sx={tintedChipSx(state.sub.mode === 'any' ? 'success' : 'info')}
                  />
                </MarkdownTooltip>
                {isGearInspectorMode && (
                  <MarkdownTooltip
                    markdown={renderGlyphTooltip(t('filterGlyphsTooltip'), [
                      { glyph: GLYPH_GTE_ZERO, label: t('filterGlyphsAny') },
                      { glyph: GLYPH_GLYPHS_ON, label: t('filterGlyphsOn') },
                      { glyph: GLYPH_GLYPHS_SELECTED, label: t('filterGlyphsSelected') },
                      { glyph: GLYPH_GLYPHS_OFF, label: t('filterGlyphsOff') },
                    ])}
                  >
                    <Chip
                      size="small"
                      label={`${t('filterGlyphs')}: ${
                        gearInspectorGlyphMode === 'on'
                          ? GLYPH_GLYPHS_ON
                          : gearInspectorGlyphMode === 'selected'
                            ? GLYPH_GLYPHS_SELECTED
                            : gearInspectorGlyphMode === 'off'
                              ? GLYPH_GLYPHS_OFF
                              : GLYPH_GTE_ZERO
                      }`}
                      aria-label={`${t('filterGlyphs')}: ${
                        gearInspectorGlyphMode === 'on'
                          ? t('filterGlyphsOn')
                          : gearInspectorGlyphMode === 'selected'
                            ? t('filterGlyphsSelected')
                            : gearInspectorGlyphMode === 'off'
                              ? t('filterGlyphsOff')
                              : t('filterGlyphsAny')
                      }`}
                      onClick={() => {
                        const next: GearInspectorGlyphFilterMode =
                          gearInspectorGlyphMode === 'any'
                            ? 'on'
                            : gearInspectorGlyphMode === 'on'
                              ? 'selected'
                              : gearInspectorGlyphMode === 'selected'
                                ? 'off'
                                : 'any'
                        onChange({ ...state, gearInspectorGlyphs: { mode: next } })
                      }}
                      sx={tintedChipSx(
                        gearInspectorGlyphMode === 'any'
                          ? 'success'
                          : gearInspectorGlyphMode === 'on'
                            ? 'info'
                            : gearInspectorGlyphMode === 'selected'
                              ? 'secondary'
                              : 'warning',
                      )}
                    />
                  </MarkdownTooltip>
                )}
                {isGearInspectorMode && (
                  <MarkdownTooltip markdown={rollSummaryDescription}>
                    <Chip
                      size="small"
                      label={rollChipLabel}
                      aria-label={rollChipAria}
                      onClick={(event) => setGearInspectorRollsAnchorEl(event.currentTarget)}
                      variant="filled"
                      sx={tintedChipSx(gearInspectorRollsActive ? 'info' : 'success')}
                    />
                  </MarkdownTooltip>
                )}
                {/* Wildcard filter chip removed per UX simplification: wildcard rows are treated like normal rows in the preview filters. */}
              </Box>
              </Collapse>
            </FormControl>
          </Box>

          {/* Faction moved to right column next to Level */}
        </Box>

        {/* Right column */}
        <Box>
          {/* Level + Faction row */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: showFaction ? 'auto 1fr' : '1fr' }, columnGap: 1, rowGap: 1 }}>
            {/* Level */}
            <FormControl fullWidth sx={{ mb: 0.75 }}>
              <FilterSectionHeader
                id="level"
                label={levelSectionLabel}
                dirty={levelSectionDirty}
                actions={renderSectionClearButton(
                  levelSectionDirty,
                  formatSectionClearLabel(levelSectionLabel),
                  clearLevelSection,
                )}
                collapsed={collapsed}
                onCollapsedChange={onCollapsedChange}
              />
              <Collapse in={!collapsed.level} timeout="auto" unmountOnExit>
                {isGearInspectorMode ? (
                  <Box sx={{
                    width: levelControlResponsiveWidth,
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    px: 1.25,
                    pr: showFaction ? 2 : 0,
                  }}>
                    <Slider
                      size="small"
                      min={GEAR_INSPECTOR_LEVEL_MIN}
                      max={GEAR_INSPECTOR_LEVEL_MAX}
                      step={1}
                      disableSwap
                      value={[gearInspectorLevelRange.min, gearInspectorLevelRange.max]}
                      marks={gearInspectorLevelSliderMarks}
                      valueLabelDisplay="auto"
                      getAriaLabel={() => t('filterLevel')}
                      getAriaValueText={(value) => `+${value}`}
                      valueLabelFormat={(value) => `+${value}`}
                      onChange={(_, value) => {
                        if (!Array.isArray(value) || value.length !== 2) return
                        const [rawMin, rawMax] = value as [number, number]
                        const normalized = resolveGearInspectorLevelRange({
                          ...state.level,
                          gearInspectorRange: { min: rawMin, max: rawMax },
                        })
                        if (normalized.min === gearInspectorLevelRange.min && normalized.max === gearInspectorLevelRange.max) return
                        onChange({ ...state, level: { ...state.level, gearInspectorRange: normalized } })
                      }}
                      sx={{
                        width: '100%',
                        '& .MuiSlider-track': { height: 4 },
                        '& .MuiSlider-rail': { height: 4 },
                        '& .MuiSlider-thumb': { width: 16, height: 16 },
                      }}
                    />
                  </Box>
                ) : (
                  <>
                    <ToggleButtonGroup size="small" value={state.level.selected.map(String)} onChange={(_, vals: string[]) => {
                      const parsed = vals.map(v => Number(v) as LevelMilestone)
                      onChange({ ...state, level: { ...state.level, selected: parsed } })
                    }} sx={[{
                      width: levelControlResponsiveWidth,
                      maxWidth: '100%',
                      flexWrap: 'wrap',
                      '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
                    }, GRID_TOGGLE_BUTTON_GROUP_SX]}>
                      {levelValues.map(v => (<ToggleButton key={v} value={String(v)}>+{v}</ToggleButton>))}
                    </ToggleButtonGroup>
                    <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                      {anyChip(t('filterLevel'), state.level.anyMode, (v) => onChange({ ...state, level: { ...state.level, anyMode: v } }), t('filterAnyTooltip', { field: t('filterLevel') }))}
                    </Box>
                  </>
                )}
              </Collapse>
            </FormControl>

            {/* Faction */}
            {showFaction && (
              <FormControl fullWidth sx={{ mb: 0.75 }}>
                <FilterSectionHeader
                  id="faction"
                  label={factionSectionLabel}
                  dirty={factionSectionDirty}
                  actions={renderSectionClearButton(
                    factionSectionDirty,
                    formatSectionClearLabel(factionSectionLabel),
                    clearFactionSection,
                  )}
                  collapsed={collapsed}
                  onCollapsedChange={onCollapsedChange}
                />
                <Collapse in={!collapsed.faction} timeout="auto" unmountOnExit>
                  <Box
                    sx={{
                      position: 'relative',
                      width: { xs: '100%', sm: FILTER_FACTION_SELECT_WIDTH_PX },
                      maxWidth: FILTER_FACTION_SELECT_WIDTH_PX,
                    }}
                  >
                    <Select
                      multiple
                      size="small"
                      value={factionSelection.map((n) => String(n))}
                      onChange={(e) => {
                        const vals = (e.target.value as string[]).map(n => Number(n))
                        onChange({ ...state, faction: { ...state.faction, selected: vals } })
                      }}
                      displayEmpty
                      renderValue={(vals) => {
                        const list = (vals as string[]).map(v => Number(v)).filter(n => Number.isFinite(n) && n > 0)
                        if (!list.length) {
                          return (
                            <EllipsisTooltip title={t('any')} wrap="block">
                              <Typography
                                variant="body2"
                                data-ellipsis-target
                                sx={[ELLIPSIS_TEXT_SX, { display: 'block', width: '100%', fontSize: FONT_SIZE_BASE_PX }]}
                              >
                                {t('any')}
                              </Typography>
                            </EllipsisTooltip>
                          )
                        }
                        const labels = list.map(code => t(factionI18nKey(code as FactionId)))
                        const summaryTitle = labels.join(', ')
                        const [firstCode] = list
                        if (typeof firstCode !== 'number') {
                          return (
                            <EllipsisTooltip title={summaryTitle} wrap="block">
                              <Typography
                                variant="body2"
                                data-ellipsis-target
                                sx={[ELLIPSIS_TEXT_SX, { display: 'block', width: '100%', fontSize: FONT_SIZE_BASE_PX }]}
                              >
                                {summaryTitle}
                              </Typography>
                            </EllipsisTooltip>
                          )
                        }
                        const firstLabel = t(factionI18nKey(firstCode as FactionId))
                        return (
                          <EllipsisTooltip title={summaryTitle} wrap="block">
                            <Box
                              component="span"
                              data-ellipsis-target
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                minWidth: 0,
                                width: '100%',
                                maxWidth: factionInlineContentMaxWidth,
                              }}
                            >
                              <Box
                                component="span"
                                sx={{
                                  minWidth: 0,
                                  flex: '1 1 auto',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                }}
                              >
                                <FactionOptionLabel
                                  faction={firstCode as FactionId}
                                  label={firstLabel}
                                  size={21}
                                  truncate
                                  sx={{ minWidth: 0, flexShrink: 1 }}
                                  textSx={{ fontSize: FONT_SIZE_BASE_PX, minWidth: 0 }}
                                />
                              </Box>
                            </Box>
                          </EllipsisTooltip>
                        )
                      }}
                      MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
                      sx={{
                        width: '100%',
                        cursor: 'pointer',
                        '& .MuiSelect-select': {
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          flexWrap: 'nowrap',
                          paddingTop: 0,
                          paddingBottom: 0,
                          paddingRight: `${factionInlinePaddingPx}px`,
                          maxWidth: '100%',
                          cursor: 'pointer',
                        },
                        '& .MuiSelect-select > *': {
                          minWidth: 0,
                        },
                        minHeight: SMALL_BUTTON_HEIGHT_PX + 8,
                        height: SMALL_BUTTON_HEIGHT_PX + 8,
                      }}
                    >
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTelerianLeague')}</ListSubheader>
                    {[Faction.BannerLords, Faction.HighElves, Faction.SacredOrder, Faction.Barbarians].map((code) => (
                      <MenuItem key={code} value={String(code)}>
                        <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} />
                      </MenuItem>
                    ))}
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupGaellenPact')}</ListSubheader>
                    {[Faction.OgrynTribes, Faction.Lizardmen, Faction.Skinwalkers, Faction.Orcs].map((code) => (
                      <MenuItem key={code} value={String(code)}>
                        <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} />
                      </MenuItem>
                    ))}
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupTheCorrupted')}</ListSubheader>
                    {[Faction.Demonspawn, Faction.UndeadHordes, Faction.DarkElves, Faction.KnightRevenant].map((code) => (
                      <MenuItem key={code} value={String(code)}>
                        <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} />
                      </MenuItem>
                    ))}
                    <ListSubheader sx={LIST_SUBHEADER_SX}>{t('factionGroupNyresanUnion')}</ListSubheader>
                    {[
                      Faction.Dwarves,
                      Faction.Shadowkin,
                      Faction.SylvanWatchers,
                      // Keep Argonites grouped with Nyresan Union for filter consistency.
                      Faction.Argonites,
                    ].map((code) => (
                      <MenuItem key={code} value={String(code)}>
                        <FactionOptionLabel faction={code} label={t(factionI18nKey(code))} />
                      </MenuItem>
                    ))}
                    </Select>
                    <InlineSelectExtraBadge count={extraFactionCount} />
                    <InlineSelectClearButton
                      disabled={factionSelection.length === 0}
                      label={t('clear')}
                      onClear={() => onChange({ ...state, faction: { ...state.faction, selected: [] } })}
                    />
                  </Box>
                  <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>{anyChip(t('filterFaction'), state.faction.anyMode, (v) => onChange({ ...state, faction: { ...state.faction, anyMode: v } }), t('filterAnyTooltip', { field: t('filterFaction') }))}</Box>
                </Collapse>
              </FormControl>
            )}
          </Box>

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'nowrap',
            columnGap: 1,
            rowGap: 0.75,
            mb: 0.75,
            alignItems: 'flex-start',
          }}
        >
          {/* Slots — wraps alongside Rank/Rarity when the panel is narrow. */}
          <FormControl sx={collapsibleSectionSx}>
            <FilterSectionHeader
              id="slots"
              label={slotsSectionLabel}
              dirty={slotsSectionDirty}
              actions={renderSectionClearButton(
                slotsSectionDirty,
                formatSectionClearLabel(slotsSectionLabel),
                clearSlotsSection,
              )}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
            <Collapse in={!collapsed.slots} timeout="auto" unmountOnExit>
              <ToggleButtonGroup
                size="small"
                value={Array.from(selectedSlots).map(String)}
                onChange={(event, vals: string[]) => {
                  // Snapshot pre-click state on click1 so onDoubleClick can use it reliably
                  // (React flushes between click1 and dblclick, making selectedSlots stale).
                  if (event.detail === 1) slotPreDoubleClickRef.current = Array.from(selectedSlots)
                  // Skip the second click of a double-click — onDoubleClick handles group toggle.
                  if (event.detail >= 2) return
                  const ids = vals.map(v => Number(v))
                  onChange({ ...state, slots: { ...state.slots, selected: ids } })
                }}
                sx={[{
                  display: 'inline-grid',
                  gridTemplateColumns: 'repeat(3, auto)',
                  columnGap: 0.5,
                  rowGap: 0.5,
                  '& .MuiToggleButton-root': { p: 0.5, minWidth: 36, height: 28 },
                }, GRID_TOGGLE_BUTTON_GROUP_SX]}
              >
                {slotButtons.map(({ id: slotId, Icon: SlotIcon, name: slotName }) => {
                  // Icon is pre-resolved in slotButtons; destructuring at the map boundary
                  // avoids any component-creation-during-render lint violations.
                  if (!SlotIcon) {
                    // Icons are baked in for all known slots; returning null avoids rendering
                    // an incorrectly styled text fallback if a new id slips through.
                    return null
                  }
                  return (
                    <MarkdownTooltip key={slotId} markdown={slotName} placement="bottom">
                      <ToggleButton
                        value={String(slotId)}
                        aria-label={slotName}
                        onDoubleClick={(e) => {
                          // Double-click toggles the whole group (artefacts or accessories).
                          // Use the pre-click snapshot so the allSelected check is based on the
                          // state before click1 modified it (React may have flushed in between).
                          e.stopPropagation()
                          const groupIds = slotButtons
                            .map((b) => b.id)
                            .filter((sid) => isAccessorySlot(sid) === isAccessorySlot(slotId))
                          const preClickSet = new Set(slotPreDoubleClickRef.current)
                          const allSelected = groupIds.every((sid) => preClickSet.has(sid))
                          const next = new Set(slotPreDoubleClickRef.current)
                          if (allSelected) groupIds.forEach((sid) => next.delete(sid))
                          else groupIds.forEach((sid) => next.add(sid))
                          onChange({ ...state, slots: { ...state.slots, selected: Array.from(next) } })
                        }}
                      >
                        <SlotIcon fontSize="inherit" />
                      </ToggleButton>
                    </MarkdownTooltip>
                  )
                })}
              </ToggleButtonGroup>
              {!isGearInspectorMode && (
                <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                  {anyChip(t('filterSlots'), state.slots.anyMode, (v) => onChange({ ...state, slots: { ...state.slots, anyMode: v } }), t('filterAnyTooltip', { field: t('filterSlots') }))}
                </Box>
              )}
              </Collapse>
            </FormControl>

          {/* Rank — wraps alongside Slots/Rarity when the panel is narrow. */}
          <FormControl sx={collapsibleSectionSx}>
            <FilterSectionHeader
              id="rank"
              label={rankSectionLabel}
              dirty={rankSectionDirty}
              actions={renderSectionClearButton(
                rankSectionDirty,
                formatSectionClearLabel(rankSectionLabel),
                clearRankSection,
              )}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
            <Collapse in={!collapsed.rank} timeout="auto" unmountOnExit>
                <ToggleButtonGroup
                  size="small"
                  value={Array.from(rankSelected).map(String)}
                  onChange={(_, vals: string[]) => {
                    const parsed = vals
                      .map((v) => Number(v))
                      .filter((n): n is RankValue => Number.isFinite(n) && n >= 1 && n <= 6)
                      .sort((a, b) => a - b)
                    onChange({ ...state, rank: { ...state.rank, selected: parsed } })
                  }}
                  sx={[{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, auto)',
                    columnGap: 0.5,
                    rowGap: 0.5,
                    // Allow rank buttons to shrink when the panel narrows via the splitter.
                    '& .MuiToggleButton-root': { p: 0.5, minWidth: 28, height: 28, overflow: 'hidden' },
                  }, GRID_TOGGLE_BUTTON_GROUP_SX]}
                >
                  {[1, 2, 3, 4, 5, 6].map((rank) => (
                    <ToggleButton key={rank} value={String(rank)}>
                      {t(`star${rank}`)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {!isGearInspectorMode && (
                  <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                    {anyChip(t('filterRank'), state.rank.anyMode, (v) => onChange({ ...state, rank: { ...state.rank, anyMode: v } }), t('filterAnyTooltip', { field: t('filterRank') }))}
                  </Box>
                )}
              </Collapse>
            </FormControl>

          {/* Rarity — wraps alongside Slots/Rank when the panel is narrow. */}
          <FormControl sx={collapsibleSectionSx}>
            <FilterSectionHeader
              id="rarity"
              label={raritySectionLabel}
              dirty={raritySectionDirty}
              actions={renderSectionClearButton(
                raritySectionDirty,
                formatSectionClearLabel(raritySectionLabel),
                clearRaritySection,
              )}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
              <Collapse in={!collapsed.rarity} timeout="auto" unmountOnExit>
                <ToggleButtonGroup
                  size="small"
                  value={Array.from(raritySelected).filter((n) => n >= 1 && n <= 6).map(String)}
                  onChange={(_, vals: string[]) => {
                    const parsed = vals
                      .map((v) => Number(v))
                      .filter((n): n is RankValue => Number.isFinite(n) && n >= 1 && n <= 6)
                      .sort((a, b) => a - b)
                    onChange({ ...state, rarity: { ...state.rarity, selected: parsed } })
                  }}
                  sx={[{
                    display: 'grid',
                    gridTemplateColumns: `repeat(3, minmax(0, ${FILTER_TOGGLE_BUTTON_WIDTH_PX}px))`,
                    columnGap: 0.5,
                    rowGap: 0.5,
                    '& .MuiToggleButton-root': {
                      p: 0.5,
                      // maxWidth keeps buttons at natural width; minWidth 28 allows shrinking when the
                      // panel is narrowed via the splitter. Text ellipsis activates via EllipsisTooltip.
                      minWidth: 28,
                      maxWidth: FILTER_TOGGLE_BUTTON_WIDTH_PX,
                      height: 28,
                      overflow: 'hidden',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1.2,
                    },
                  }, GRID_TOGGLE_BUTTON_GROUP_SX]}
                >
                  {[
                    { value: '1', labelKey: 'rarityCommon' },
                    { value: '2', labelKey: 'rarityUncommon' },
                    { value: '3', labelKey: 'rarityRare' },
                    { value: '4', labelKey: 'rarityEpic' },
                    { value: '5', labelKey: 'rarityLegendary' },
                    { value: '6', labelKey: 'rarityMythical' },
                  ].map((option) => (
                    <ToggleButton key={option.value} value={option.value}>
                      <EllipsisTooltip title={t(option.labelKey)} wrap="block">
                        <Typography component="span" noWrap sx={toggleLabelSx} data-ellipsis-target>
                          {t(option.labelKey)}
                        </Typography>
                      </EllipsisTooltip>
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
                {!isGearInspectorMode && (
                  <Box sx={{ mt: FILTER_CHIP_TOP_MARGIN }}>
                    {anyChip(t('filterRarity'), state.rarity.anyMode, (v) => onChange({ ...state, rarity: { ...state.rarity, anyMode: v } }), t('filterAnyTooltip', { field: t('filterRarity') }))}
                  </Box>
                )}
              </Collapse>
            </FormControl>
        </Box>
        {isGearInspectorMode && (
          <>
          <FormControl sx={{ ...collapsibleSectionSx, mb: 0.75 }}>
            <FilterSectionHeader
              id="ascension"
              label={ascensionSectionLabel}
              dirty={ascensionSectionDirty}
              actions={renderSectionClearButton(
                ascensionSectionDirty,
                formatSectionClearLabel(ascensionSectionLabel),
                clearAscensionSection,
              )}
              collapsed={collapsed}
              onCollapsedChange={onCollapsedChange}
            />
            <Collapse in={!collapsed.ascension} timeout="auto" unmountOnExit>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ flex: { xs: '1 1 100%', md: '0 0 auto' }, minWidth: 0 }}>
                  <ToggleButtonGroup
                    size="small"
                    value={gearInspectorAscStars.map(String)}
                    onChange={(_, vals: string[]) => {
                      const parsed = vals
                        .map((v) => Number(v))
                        .filter((n) => Number.isFinite(n)) as number[]
                      const prev = state.gearInspectorAscension ?? DEFAULT_RULES_FILTER_STATE.gearInspectorAscension!
                      onChange({ ...state, gearInspectorAscension: { ...prev, stars: parsed } })
                    }}
                    sx={[{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, auto)',
                      columnGap: 0.5,
                      rowGap: 0.5,
                      '& .MuiToggleButton-root': { p: 0.5, minWidth: 44, height: 28 },
                    }, GRID_TOGGLE_BUTTON_GROUP_SX]}
                  >
                    {ASCENSION_STAR_VALUES.map((star) => (
                      <ToggleButton key={star} value={String(star)}>
                        {`${star}★`}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    flex: { xs: '1 1 100%', md: '0 0 auto' },
                    minWidth: 0,
                  }}
                >
                  <ToggleButtonGroup
                    size="small"
                    value={filterRowSelection(gearInspectorAscStats, STAT_VARIANTS_PRIORITY_ROW1)}
                    onChange={(_, vals: string[]) => {
                      const prev = state.gearInspectorAscension ?? DEFAULT_RULES_FILTER_STATE.gearInspectorAscension!
                      const nextStats = mergeRowSelection(prev.stats ?? [], STAT_VARIANTS_PRIORITY_ROW1, vals)
                      onChange({ ...state, gearInspectorAscension: { ...prev, stats: nextStats } })
                    }}
                    sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW1.length)}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW1.map((variant) => (
                      <ToggleButton key={variant} value={String(variant)} aria-label={labelOfVariant(variant)}>
                        {t(statVariantI18nKey(variant))}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                  <ToggleButtonGroup
                    size="small"
                    value={filterRowSelection(gearInspectorAscStats, STAT_VARIANTS_PRIORITY_ROW2)}
                    onChange={(_, vals: string[]) => {
                      const prev = state.gearInspectorAscension ?? DEFAULT_RULES_FILTER_STATE.gearInspectorAscension!
                      const nextStats = mergeRowSelection(prev.stats ?? [], STAT_VARIANTS_PRIORITY_ROW2, vals)
                      onChange({ ...state, gearInspectorAscension: { ...prev, stats: nextStats } })
                    }}
                    sx={buildToggleGridSx(STAT_VARIANTS_PRIORITY_ROW2.length)}
                  >
                    {STAT_VARIANTS_PRIORITY_ROW2.map((variant) => (
                      <ToggleButton key={variant} value={String(variant)} aria-label={labelOfVariant(variant)}>
                        {t(statVariantI18nKey(variant))}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
                </Box>
              </Box>
            </Collapse>
          </FormControl>
          </>
        )}
      </Box>
      {/* Faction moved to left column */}
    </Box>

        {/* Full-width rows */}
        {/* No full-width Main/Sub section: they live under Sets in the left column */}
      </Box>
      {isGearInspectorMode && (
        <>
          <Popover
            open={gearInspectorRollsOpen}
            anchorEl={gearInspectorRollsAnchorEl}
            onClose={handleGearInspectorRollsClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: { ...buildContextMenuPaperSlotProps({
                component: ContextMenuPaper,
                contextMenuGuard: gearInspectorRollsGuard,
                onRequestClose: handleGearInspectorRollsClose,
                closeLabel: t('close'),
                sx: { width: 310, maxWidth: 'calc(100vw - 32px)', p: 2.25 },
              }), ref: gearInspectorRollsPaperRef },
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <ContextMenuTitle title={t('filterRolls')} description={t('filterRollsHelper')} />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('filterRollsWildcardTitle')}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: ROLL_FILTER_LABEL_MIN_WIDTH_PX, flexShrink: 0 }}
                  >
                    {t('any')}
                  </Typography>
                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <RollCountToggleButtons
                      counts={wildcardDisplayCounts}
                      ariaLabelPrefix={t('filterRollsValueLabel')}
                      onToggle={handleWildcardToggleValue}
                    />
                    {wildcardCounts.length === 0 ? (
                      <Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />
                    ) : (
                      <ClearIconButton
                        size="small"
                        aria-label={t('filterRollsSelectNone')}
                        tooltip={t('filterRollsSelectNone')}
                        onClick={handleWildcardSelectNone}
                      />
                    )}
                  </Box>
                </Box>
              </Box>
              <Divider />
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {t('filterRollsPerStatTitle')}
                </Typography>
                <Stack spacing={1}>
                  {rollFilterStatOptions.map((variant) => {
                    const counts = getPerStatCounts(variant)
                    const label = t(statVariantI18nKey(variant))
                    const displayColor = useStatButtonColors
                      ? (adaptStatFg(substatColors?.[variant]?.fg ?? DEFAULT_SUBSTAT_COLORS_FG_BY_VARIANT[variant]) ?? theme.palette.text.primary)
                      : undefined
                    const isActive = counts.length > 0
                    return (
                      <Box
                        key={`roll-row-${variant}`}
                        sx={{
                          display: 'flex',
                          flexDirection: { xs: 'column', sm: 'row' },
                          alignItems: { xs: 'flex-start', sm: 'center' },
                          gap: 1,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            minWidth: ROLL_FILTER_LABEL_MIN_WIDTH_PX,
                            flexShrink: 0,
                            ...(isActive ? { fontWeight: theme.typography.fontWeightMedium ?? 600 } : {}),
                            ...(displayColor ? { color: displayColor } : {}),
                          }}
                        >
                          {label}
                        </Typography>
                        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <RollCountToggleButtons
                            counts={counts}
                            ariaLabelPrefix={`${label} ${t('filterRollsValueLabel')}`}
                            onToggle={(value) => handlePerStatToggleValue(variant, value)}
                          />
                          {counts.length === 0 ? (
                            <Box sx={{ ...CLEAR_BUTTON_PLACEHOLDER_SX, pointerEvents: 'none' }} />
                          ) : (
                            <ClearIconButton
                              size="small"
                              aria-label={t('filterRollsSelectNone')}
                              tooltip={t('filterRollsSelectNone')}
                              onClick={() => handlePerStatSelectNone(variant)}
                            />
                          )}
                        </Box>
                      </Box>
                    )
                  })}
                </Stack>
              </Box>
            </Box>
          </Popover>
          <Popover
            open={lastUsePopoverOpen}
            anchorEl={lastUseAnchorEl}
            onClose={handleLastUsePopoverClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
            slotProps={{
              paper: { ...buildContextMenuPaperSlotProps({
                component: ContextMenuPaper,
                contextMenuGuard: lastUsePopoverGuard,
                onRequestClose: handleLastUsePopoverClose,
                closeLabel: t('close'),
                sx: { width: 320, maxWidth: 'calc(100vw - 32px)', p: 2.25 },
              }), ref: lastUsePopoverPaperRef },
            }}
          >
            <Stack spacing={1.5}>
              <ContextMenuTitle title={t('gearInspectorLastUsedRangeTitle')} description={t('gearInspectorLastUsedRangeDescription')} />
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <TextField
                  type="number"
                  size="small"
                  label={t('gearInspectorLastUsedRangeMinLabel')}
                  slotProps={{ htmlInput: { min: GEAR_INSPECTOR_LAST_USE_MIN_DAYS, max: GEAR_INSPECTOR_LAST_USE_MAX_DAYS } }}
                  value={lastUseCustom.minDays}
                  onChange={handleLastUseInputChange('minDays')}
                  sx={{ flex: '1 1 120px' }}
                />
                <TextField
                  type="number"
                  size="small"
                  label={t('gearInspectorLastUsedRangeMaxLabel')}
                  slotProps={{ htmlInput: { min: GEAR_INSPECTOR_LAST_USE_MIN_DAYS, max: GEAR_INSPECTOR_LAST_USE_MAX_DAYS } }}
                  value={lastUseCustom.maxDays}
                  onChange={handleLastUseInputChange('maxDays')}
                  sx={{ flex: '1 1 120px' }}
                />
              </Box>
              <Slider
                value={[lastUseCustom.minDays, lastUseCustom.maxDays]}
                min={GEAR_INSPECTOR_LAST_USE_MIN_DAYS}
                max={GEAR_INSPECTOR_LAST_USE_MAX_DAYS}
                onChange={handleLastUseSliderChange}
                valueLabelDisplay="auto"
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  size="small"
                  onClick={handleLastUseReset}
                  // Match Close button sizing so the control widths stay aligned.
                  sx={{ whiteSpace: 'nowrap', px: 1.25, height: SMALL_BUTTON_HEIGHT_PX, minHeight: SMALL_BUTTON_HEIGHT_PX }}
                >
                  {t('gearInspectorLastUsedRangeReset')}
                </Button>
              </Box>
            </Stack>
          </Popover>
        </>
      )}
    </Box>
  )
}

export default RulesFilterPanel

type RollCountToggleButtonsProps = {
  counts: GearInspectorRollCountSet
  ariaLabelPrefix: string
  onToggle: (value: GearInspectorRollCountValue) => void
}

const RollCountToggleButtons = React.memo(function RollCountToggleButtons({
  counts,
  ariaLabelPrefix,
  onToggle,
}: RollCountToggleButtonsProps) {
  const selectedValues = React.useMemo(() => counts.map((value) => String(value)), [counts])
  return (
    <ToggleButtonGroup
      size="small"
      value={selectedValues}
      onChange={() => {}}
      sx={rollCountToggleGroupSx}
    >
      {GEAR_INSPECTOR_ROLL_COUNT_VALUES.map((value) => (
        <ToggleButton
          key={value}
          value={String(value)}
          aria-label={`${ariaLabelPrefix} ${value}`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onToggle(value)
          }}
        >
          {ROLL_COUNT_LABELS[value]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
})
